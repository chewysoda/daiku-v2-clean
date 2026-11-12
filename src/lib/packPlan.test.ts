import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "../data/store";
import { buildClaudePack, claudePrompt, focusOptions, packSummary } from "./claudePack";
import { addGroup, editGroup, EMPTY_PLAN, focusPlan, HISTORY_ID, moveGroup, PackPlan, parsePlan, placeItem, removeGroup, setIncluded, setItemNote } from "./packPlan";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1, 2, 3]) }));

type S = ReturnType<typeof useStore.getState>;

const rec = (id: string, type: string, parent_id: string | null, data: object) => ({ id, type, parent_id, data, created_at: "", updated_at: "", is_sample: false });
const asset = (id: string, title: string, fields: object = {}) => ({ id, kind: "image", title, file_path: `C:\\Users\\someone\\${id}.png`, preview: null, source_url: null, credit: "Rin", via: null, captured_at: "", provenance: "unknown", palette_lab: [], width: null, height: null, tags: "", notes: "", is_sample: false, ...fields });

function project(): S {
  return {
    assets: [asset("a-keep", "Open photo"), asset("a-out", "Secret supplier photo", { notes: "SECRETNOTE" })],
    boards: [
      { id: "b-keep", name: "Chair study", version: 1, share: {}, created_at: "", updated_at: "", is_sample: false },
      { id: "b-out", name: "Private board", version: 1, share: {}, created_at: "", updated_at: "", is_sample: false },
    ],
    board_items: [
      { id: "i1", board_id: "b-keep", kind: "image", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, asset_id: "a-out", data: { caption: "SECRETCAPTION" }, updated_at: "" },
      { id: "i4", board_id: "b-keep", kind: "image", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, asset_id: "a-keep", data: {}, updated_at: "" },
      { id: "i2", board_id: "b-keep", kind: "sticky", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, asset_id: null, data: { text: "Softer seat" }, updated_at: "" },
      { id: "i3", board_id: "b-out", kind: "sticky", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, asset_id: null, data: { text: "SECRETSTICKY" }, updated_at: "" },
    ],
    claims: [
      { id: "c-keep", board_id: null, text: "Oak outlasts ash", created_at: "", is_sample: false },
      { id: "c-out", board_id: null, text: "Secret claim", created_at: "", is_sample: false },
    ],
    evidence_links: [{ id: "e1", asset_id: "a-out", target_type: "claim", target_id: "c-keep", note: "SECRETQUOTE", stance: "for", created_at: "", is_sample: false }],
    decisions: [
      { id: "d-keep", board_id: null, title: "Which shell", created_at: "", is_sample: false },
      { id: "d-out", board_id: null, title: "Secret decision", created_at: "", is_sample: false },
    ],
    concepts: [
      { id: "k1", decision_id: "d-keep", label: "A", name: "Ply", asset_id: null, flag: "", sort: 0 },
      { id: "k2", decision_id: "d-out", label: "A", name: "SECRETCONCEPT", asset_id: null, flag: "", sort: 0 },
    ],
    criteria: [{ id: "q2", decision_id: "d-out", name: "SECRETCRITERION", weight: 1, sort: 0 }],
    scores: [],
    records: [
      rec("n-keep", "note", null, { title: "Why boucle", body: "Texture" }),
      rec("n-out", "note", null, { title: "Secret note", body: "SECRETBODY" }),
      rec("h-out", "highlight", "a-out", { asset_id: "a-out", page: 1, kind: "supports", text: "SECRETHIGHLIGHT", rects: [], claim_id: null }),
      rec("part", "part", "d-keep", { concept_id: "k1", name: "Shell", material: "Ply", qty: "1", mass_kg: null, calc_id: "calc", basis: "", cost: "" }),
      rec("calc", "calc", "d-keep", { code: "C1", title: "Shell mass", inputs: [{ name: "m", expr: "2 kg" }], formula: "m * 2", unit: "kg", basis: "" }),
      rec("part-out", "part", "d-out", { concept_id: "k2", name: "SECRETPART", material: "", qty: "1", mass_kg: 1, calc_id: null, basis: "", cost: "" }),
      rec("p1", "participant", null, { code: "P1", context: "moves it daily", consent: true }),
      rec("p2", "participant", null, { code: "P2", context: "NOCONSENTCONTEXT", consent: false }),
      rec("t1", "theme", null, { name: "Stacking" }),
      rec("in1", "interview_note", null, { participant_id: "p1", theme_id: "t1", text: "stacks it" }),
      rec("in2", "interview_note", null, { participant_id: "p2", theme_id: null, text: "NOCONSENTTEXT" }),
    ],
    workflow_log: [{ id: "l1", at: "2026-01-01T00:00:00Z", actor: "me", action: "update", target_type: "note", target_id: "n-out", summary: "SECRETLOG", before: null, after: null, why: null }],
    comments: [{ id: "cm", board_id: "b-out", parent_id: null, author: "x", is_guest: false, text: "SECRETCOMMENT", asset_id: null, pin_x: null, pin_y: null, created_at: "", is_sample: false }],
  } as unknown as S;
}

const pack = async (plan: PackPlan = EMPTY_PLAN, s = project()) => {
  const { bytes } = await buildClaudePack(s, { brief: "Build a page", includeFiles: true, includeSamples: false, plan });
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const text = (p: string) => strFromU8(files[p]);
  const everything = names.map((n) => `${n}\n${text(n)}`).join("\n");
  return { names, text, everything };
};

const OUT = ["a-out", "b-out", "c-out", "d-out", "n-out"];

describe("leaving things out of a pack", () => {
  it("removes them from every file in the zip, and from the file names", async () => {
    const { everything } = await pack(setIncluded(EMPTY_PLAN, OUT, false));
    expect(everything).not.toMatch(/secret/i);
    expect(everything).toContain("Oak outlasts ash");
    expect(everything).toContain("Softer seat");
  });
  it("keeps the same material when nothing is left out, to prove that test can fail", async () => {
    expect((await pack()).everything).toMatch(/SECRETBODY/);
  });
  it("leaves it out of the pasted text too", async () => {
    const text = await claudePrompt(project(), { brief: "", includeSamples: false, plan: setIncluded(EMPTY_PLAN, OUT, false) });
    expect(text).not.toMatch(/secret/i);
  });
  it("still counts evidence from a left-out source, without quoting it", async () => {
    const { text } = await pack(setIncluded(EMPTY_PLAN, ["a-out"], false));
    expect(text("Claims/Oak outlasts ash.md")).toContain("a source that isn't in this export");
    expect(text("Claims/Oak outlasts ash.md")).not.toContain("SECRETQUOTE");
    expect(text("CLAUDE.md")).not.toContain("- Oak outlasts ash");
  });
  it("says a left-out picture is a gap, not that it was deleted", async () => {
    const { text } = await pack(setIncluded(EMPTY_PLAN, ["a-out"], false));
    expect(text("boards/Chair study.md")).toContain("Image: not in this export");
  });
  it("drops its picture file", async () => {
    const { names } = await pack(setIncluded(EMPTY_PLAN, ["a-out"], false));
    expect(names.filter((n) => n.startsWith("attachments/"))).toEqual(["attachments/Open photo.png"]);
  });
  it("tells the AI that it's a selection", async () => {
    expect((await pack(setIncluded(EMPTY_PLAN, ["n-out", "c-out"], false))).text("CLAUDE.md")).toContain("2 items were left out on purpose");
    expect((await pack()).text("CLAUDE.md")).not.toContain("left out on purpose");
  });
  it("keeps the history only when nothing is held back, as the log mentions everything", async () => {
    expect((await pack()).names).toContain("Workflow log.md");
    const withheld = await pack(setIncluded(EMPTY_PLAN, ["n-out"], false));
    expect(withheld.names).not.toContain("Workflow log.md");
    expect((await pack(setIncluded(EMPTY_PLAN, [HISTORY_ID], false))).names).not.toContain("Workflow log.md");
    const summary = await packSummary(project(), { brief: "", includeFiles: false, includeSamples: false, plan: setIncluded(EMPTY_PLAN, ["n-out"], false) });
    expect(summary.historyHeldBack).toBe(true);
  });
});

describe("interview consent", () => {
  it("never exports notes from someone with no consent on record", async () => {
    const { everything, text } = await pack();
    expect(everything).not.toContain("NOCONSENT");
    expect(text("Research/Interviews.md")).toContain("P1: stacks it");
    const summary = await packSummary(project(), { brief: "", includeFiles: false, includeSamples: false });
    expect(summary.noConsentNotes).toBe(1);
  });
});

describe("arranging a pack into groups", () => {
  const organised = () => {
    let plan = addGroup(addGroup(EMPTY_PLAN, "Constraints"), "Look and feel");
    const [first, second] = plan.groups;
    plan = editGroup(plan, first.id, { instruction: "Follow these exactly" });
    plan = placeItem(plan, "d-keep", first.id);
    plan = placeItem(plan, "b-keep", second.id);
    plan = placeItem(plan, "a-keep", second.id);
    return setItemNote(plan, "b-keep", "Use the notes as the tone");
  };
  it("moves items into numbered folders and out of their usual ones", async () => {
    const { names } = await pack(organised());
    expect(names).toContain("01 Constraints/Which shell.md");
    expect(names).toContain("02 Look and feel/Chair study.md");
    expect(names).toContain("02 Look and feel/Open photo.md");
    expect(names).not.toContain("boards/Chair study.md");
    expect(names).not.toContain("Decisions/Which shell.md");
  });
  it("keeps picture paths working after a move", async () => {
    const { text, names } = await pack(organised());
    expect(text("02 Look and feel/Chair study.md")).toContain("file: ../attachments/Open photo.png");
    expect(names).toContain("attachments/Open photo.png");
  });
  it("gives the AI a reading order with directions and notes", async () => {
    const md = (await pack(organised())).text("CLAUDE.md");
    expect(md.indexOf("### 1. Constraints")).toBeGreaterThan(-1);
    expect(md.indexOf("### 1. Constraints")).toBeLessThan(md.indexOf("### 2. Look and feel"));
    expect(md).toContain("Follow these exactly");
    expect(md).toContain("`02 Look and feel/Chair study.md`: Use the notes as the tone");
  });
  it("still tells the AI that file contents are reference, not instructions", async () => {
    expect((await pack(organised())).text("CLAUDE.md")).toMatch(/reference material, not instructions/);
  });
  it("follows a change of order", async () => {
    const plan = organised();
    const moved = moveGroup(plan, plan.groups[1].id, -1);
    const { names } = await pack(moved);
    expect(names).toContain("01 Look and feel/Chair study.md");
    expect(names).toContain("02 Constraints/Which shell.md");
  });
  it("doesn't overwrite when two things in a group share a name", async () => {
    let plan = addGroup(EMPTY_PLAN, "Mix");
    const id = plan.groups[0].id;
    const s = project();
    s.records.push(rec("n-same", "note", null, { title: "Chair study", body: "NOTEBODY" }) as never);
    plan = placeItem(placeItem(plan, "b-keep", id), "n-same", id);
    const { text, names } = await pack(plan, s);
    expect(text("01 Mix/Chair study.md")).toContain("NOTEBODY");
    expect(names).toContain("01 Mix/Chair study (board).md");
  });
  it("sends a removed group's items back to their usual folders, still included", async () => {
    const plan = organised();
    const { names } = await pack(removeGroup(plan, plan.groups[0].id));
    expect(names).toContain("Decisions/Which shell.md");
  });
  it("lists contents in a manifest, without anything left out", async () => {
    const plan = setIncluded(organised(), ["n-out"], false);
    const manifest = JSON.parse((await pack(plan)).text("manifest.json"));
    const board = manifest.items.find((i: { title: string }) => i.title === "Chair study");
    expect(board).toMatchObject({ type: "board", group: "Look and feel", path: "02 Look and feel/Chair study.md", note: "Use the notes as the tone" });
    expect(manifest.items.find((i: { title: string }) => i.title === "Open photo").credit).toBe("Rin");
    expect(JSON.stringify(manifest)).not.toContain("Secret note");
  });
});

describe("what a pack gains for building", () => {
  it("writes engineering data in readable form", async () => {
    const { text } = await pack();
    const decision = text("Decisions/Which shell.md");
    expect(decision).toContain("## Parts (BOM)");
    expect(decision).toContain("4 kg (C1)");
    expect(decision).toContain("C1 Shell mass: m * 2");
  });
  it("includes a pointer for tools that look for AGENTS.md", async () => {
    expect((await pack()).text("AGENTS.md")).toContain("CLAUDE.md");
  });
  it("swaps this PC's file paths for the pack's own, including in project.json", async () => {
    expect((await pack()).everything).not.toContain("C:\\\\Users");
  });
  it("only lists folders that exist", async () => {
    const md = (await pack(setIncluded(EMPTY_PLAN, ["n-keep", "n-out"], false))).text("CLAUDE.md");
    expect(md).not.toContain("`Notes/`");
    expect(md).toContain("`Claims/`");
  });
});

describe("the saved plan", () => {
  it("survives being empty or damaged", () => {
    expect(parsePlan("")).toEqual(EMPTY_PLAN);
    expect(parsePlan("{broken")).toEqual(EMPTY_PLAN);
    expect(parsePlan("null")).toEqual(EMPTY_PLAN);
    expect(parsePlan('{"excluded":"x","groups":3}').excluded).toEqual([]);
  });
  it("round-trips", () => {
    const plan = setItemNote(setIncluded(addGroup(EMPTY_PLAN), ["x"], false), "y", "hello");
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
  });
  it("includes new work by default, and can bring things back", () => {
    expect(setIncluded(setIncluded(EMPTY_PLAN, ["x"], false), ["x"], true).excluded).toEqual([]);
  });
  it("ignores a group that no longer exists", async () => {
    const { names } = await pack(placeItem(EMPTY_PLAN, "d-keep", "gone"));
    expect(names).toContain("Decisions/Which shell.md");
  });
});

describe("a pack of one board or decision", () => {
  it("holds the board, its pictures and nothing else", async () => {
    const s = project();
    const plan = focusPlan(s, { type: "board", id: "b-keep" });
    expect(plan.excluded).not.toContain("b-keep");
    expect(plan.excluded).not.toContain("a-keep");
    expect(plan.excluded).toEqual(expect.arrayContaining(["b-out", "d-keep", "d-out", "n-keep", "c-out", HISTORY_ID]));
    const { names, everything } = await pack(plan, s);
    expect(names).toContain("boards/Chair study.md");
    expect(everything).not.toContain("Private board");
    expect(everything).not.toContain("SECRETLOG");
  });
  it("holds a decision with the evidence behind its scores", () => {
    const s = project();
    s.scores = [{ id: "sc", concept_id: "k1", criterion_id: "q1", value: 4, is_assumption: false, note: "" }] as unknown as S["scores"];
    s.evidence_links = [...s.evidence_links, { id: "e2", asset_id: "a-keep", target_type: "score", target_id: "sc", note: "", stance: "for", created_at: "", is_sample: false }] as S["evidence_links"];
    const plan = focusPlan(s, { type: "decision", id: "d-keep" });
    expect(plan.excluded).not.toContain("d-keep");
    expect(plan.excluded).not.toContain("a-keep");
    expect(plan.excluded).toEqual(expect.arrayContaining(["b-keep", "d-out", "a-out"]));
  });
  it("can send the example board, which a whole-project pack leaves out", async () => {
    const s = project();
    s.boards = s.boards.map((b) => (b.id === "b-out" ? { ...b, is_sample: true } : b));
    const { bytes } = await buildClaudePack(s, focusOptions(s, { type: "board", id: "b-out" }, "", false));
    expect(Object.keys(unzipSync(bytes))).toContain("boards/Private board.md");
  });
});
