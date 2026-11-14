import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "./repo";
import { useStore } from "./store";
import { BoardItem, TableName, Tables } from "./types";

/** A repo that can be told to fail, and counts its writes. */
class FlakyRepo extends MemoryRepo {
  failing = 0;
  writes = 0;
  tables: TableName[] = [];
  async putMany<T extends TableName>(table: T, rows: Tables[T][]) {
    this.writes++;
    this.tables.push(table);
    if (this.failing > 0) {
      this.failing--;
      throw new Error("database is locked");
    }
    return super.putMany(table, rows);
  }
}

async function start() {
  const repo = new FlakyRepo();
  // Marked as already seeded, so the store starts empty rather than with the samples.
  for (const id of ["seeded", "seeded_v2", "seeded_v3"]) await repo.put("settings", { id, value: "1" });
  await useStore.getState().init(repo);
  repo.writes = 0;
  return repo;
}

const item = (id: string, board_id: string, x = 0): BoardItem =>
  ({ id, board_id, kind: "sticky", x, y: 0, w: 10, h: 10, rotation: 0, z: 0, asset_id: null, data: {}, updated_at: "" }) as unknown as BoardItem;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("saving", () => {
  it("writes a whole canvas change in one go", async () => {
    const repo = await start();
    const board = useStore.getState().createBoard("Study");
    await useStore.getState().flush();
    repo.tables = [];
    useStore.getState().putItems([item("i1", board.id), item("i2", board.id), item("i3", board.id)]);
    await useStore.getState().flush();
    expect(repo.tables.filter((t) => t === "board_items")).toHaveLength(1);
    expect((await repo.all("board_items")).map((i) => i.id).sort()).toEqual(["i1", "i2", "i3"]);
  });

  it("retries a failed save with what's current, not the stale version", async () => {
    const repo = await start();
    const board = useStore.getState().createBoard("Study");
    await useStore.getState().flush();
    repo.failing = 1;
    useStore.getState().putItems([item("i1", board.id, 1)]);
    await useStore.getState().flush();
    expect(useStore.getState().saveError).toContain("locked");

    useStore.getState().putItems([item("i1", board.id, 2)]);
    await useStore.getState().flush();
    // Still flagged: the earlier failure hasn't been put right yet.
    expect(useStore.getState().saveError).toContain("locked");

    await useStore.getState().retrySaves();
    expect(useStore.getState().saveError).toBeNull();
    expect((await repo.all("board_items")).find((i) => i.id === "i1")?.x).toBe(2);
  });

  it("retries once by itself, then waits to be asked", async () => {
    const repo = await start();
    repo.failing = 5;
    useStore.getState().setSetting("name", "Ada");
    await useStore.getState().flush();
    await vi.advanceTimersByTimeAsync(2500);
    await useStore.getState().flush();
    const after = repo.writes;
    await vi.advanceTimersByTimeAsync(10000);
    expect(repo.writes).toBe(after);
    expect(useStore.getState().saveError).not.toBeNull();

    repo.failing = 0;
    await useStore.getState().retrySaves();
    expect(useStore.getState().saveError).toBeNull();
    expect((await repo.all("settings")).find((s) => s.id === "name")?.value).toBe("Ada");
  });
});

describe("deleting a board", () => {
  it("takes the evidence for its claims with it", async () => {
    await start();
    const s = useStore.getState();
    const board = s.createBoard("Study");
    s.putAsset({ id: "a1", kind: "link", title: "Source", file_path: null, preview: null, source_url: null, credit: null, via: null, captured_at: "", provenance: "unknown", palette_lab: [], width: null, height: null, tags: "", notes: "", is_sample: false });
    const kept = s.addClaim("Elsewhere", null);
    const gone = s.addClaim("On the board", board.id);
    s.linkEvidence("a1", "claim", kept.id);
    s.linkEvidence("a1", "claim", gone.id);

    useStore.getState().deleteBoard(board.id);
    expect(useStore.getState().evidence_links.map((e) => e.target_id)).toEqual([kept.id]);
  });
});

describe("first launch", () => {
  it("starts with the ESP32 example and nothing else", async () => {
    vi.useRealTimers();
    await useStore.getState().init(new MemoryRepo());
    const s = useStore.getState();
    expect(s.boards.map((b) => b.id).sort()).toEqual(["b-esp32", "b-esp32-case"]);
    expect(s.decisions.map((d) => d.id).sort()).toEqual(["d-esp32", "d-esp32-case"]);
    expect(s.records.filter((r) => r.type === "project").map((r) => r.id)).toEqual(["pr-esp32"]);
    expect(s.assets.every((a) => a.id.startsWith("esp-"))).toBe(true);
    expect(s.config.claude_brief).toContain("ESP32");
  });
});

describe("upgrading from the older samples", () => {
  // What an older install has: the retired samples, the first ESP32 example, and some work of the person's own.
  const older = async () => {
    vi.useRealTimers();
    const repo = new MemoryRepo();
    for (const id of ["seeded", "seeded_v2", "seeded_v3", "seeded_v4", "seeded_v5"]) await repo.put("settings", { id, value: "1" });
    const sample = { is_sample: true, created_at: "2026-01-01T00:00:00Z" };
    await repo.put("boards", { id: "b-furniture", name: "Furniture Study", version: 1, share: {}, updated_at: "2026-01-01T00:00:00Z", ...sample });
    await repo.put("board_items", { id: "i-mine-on-old", board_id: "b-furniture", kind: "sticky", x: 0, y: 0, w: 10, h: 10, rotation: 0, z: 1, asset_id: null, data: { text: "mine" }, updated_at: "" });
    await repo.put("assets", { id: "a-oak", kind: "image", title: "Rift oak", file_path: null, preview: "oak", source_url: null, credit: null, via: null, captured_at: "", provenance: "human", palette_lab: [], width: 1, height: 1, tags: "", notes: "", is_sample: true });
    await repo.put("decisions", { id: "d-chair", board_id: "b-furniture", title: "Which chair base?", ...sample });
    await repo.put("concepts", { id: "k-a", decision_id: "d-chair", label: "A", name: "Oak", asset_id: null, flag: "", sort: 0 });
    await repo.put("scores", { id: "s-a", concept_id: "k-a", criterion_id: "q", value: 3, is_assumption: true });
    await repo.put("records", { id: "r-R1", type: "requirement", parent_id: "d-chair", data: {} as never, updated_at: "", ...sample });
    await repo.put("records", { id: "note-agents", type: "note", parent_id: null, data: { title: "Agent research file", body: "" }, updated_at: "", ...sample });
    // The first ESP32 example, before it grew, and the person's own board.
    await repo.put("boards", { id: "b-esp32", name: "ESP32 Node Programmer", version: 1, share: {}, updated_at: "2026-01-01T00:00:00Z", ...sample });
    await repo.put("records", { id: "pr-esp32", type: "project", parent_id: null, data: { name: "ESP32 Node Programmer", working: true, board_ids: ["b-esp32", "b-mine"], decision_ids: [], asset_ids: [], record_ids: [] }, updated_at: "", ...sample });
    await repo.put("boards", { id: "b-mine", name: "My board", version: 1, share: {}, updated_at: "2026-01-02T00:00:00Z", is_sample: false, created_at: "" });
    await useStore.getState().init(repo);
    return useStore.getState();
  };

  it("removes the older samples and everything inside their boards and decisions", async () => {
    const s = await older();
    expect(s.boards.map((b) => b.id)).not.toContain("b-furniture");
    expect(s.board_items.map((i) => i.id)).not.toContain("i-mine-on-old");
    expect(s.assets.map((a) => a.id)).not.toContain("a-oak");
    expect(s.decisions.map((d) => d.id)).not.toContain("d-chair");
    expect(s.concepts.map((c) => c.id)).not.toContain("k-a");
    expect(s.scores.map((x) => x.id)).not.toContain("s-a");
    expect(s.records.map((r) => r.id)).not.toContain("r-R1");
    expect(s.records.map((r) => r.id)).not.toContain("note-agents");
  });

  it("keeps the person's own work, and gives the ESP32 example its new parts", async () => {
    const s = await older();
    expect(s.boards.map((b) => b.id)).toContain("b-mine");
    expect(s.boards.map((b) => b.id)).toContain("b-esp32-case");
    expect(s.assets.map((a) => a.id)).toContain("esp-img-die");
    const project = s.records.find((r) => r.id === "pr-esp32")!.data as { board_ids: string[]; record_ids: string[] };
    expect(project.board_ids).toEqual(expect.arrayContaining(["b-esp32", "b-mine", "b-esp32-case"]));
    expect(project.record_ids).toContain("draft-esp32");
  });

  it("adds nothing back for someone who removed the example", async () => {
    vi.useRealTimers();
    const repo = new MemoryRepo();
    for (const id of ["seeded", "seeded_v2", "seeded_v3", "seeded_v4", "seeded_v5"]) await repo.put("settings", { id, value: "1" });
    await useStore.getState().init(repo);
    const s = useStore.getState();
    expect(s.boards).toEqual([]);
    expect(s.assets).toEqual([]);
  });
});
