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
    expect(s.boards.map((b) => b.id)).toEqual(["b-esp32"]);
    expect(s.decisions.map((d) => d.id)).toEqual(["d-esp32"]);
    expect(s.records.filter((r) => r.type === "project").map((r) => r.id)).toEqual(["pr-esp32"]);
    expect(s.assets.every((a) => a.id.startsWith("esp-"))).toBe(true);
    expect(s.config.claude_brief).toContain("ESP32");
  });
});
