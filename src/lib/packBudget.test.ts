import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "../data/store";
import { buildClaudePack, packSummary } from "./claudePack";
import { deliverableMarkdown, parseDeliverable } from "./deliverable";
import { fingerprint, fitBudget, printsOf, shapePlan } from "./packBudget";
import { EMPTY_PLAN, listPackItems, PackItem, PackPlan, parsePlan, setPinned, setPriority } from "./packPlan";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1, 2, 3]) }));

type S = ReturnType<typeof useStore.getState>;

const note = (id: string, title: string, body: string) => ({ id, type: "note", parent_id: null, data: { title, body }, created_at: "", updated_at: "", is_sample: false });

function state(notes = [note("n1", "Small", "short"), note("n2", "Big", "x".repeat(4000)), note("n3", "Medium", "y".repeat(400))]): S {
  return {
    assets: [],
    boards: [],
    board_items: [],
    claims: [],
    evidence_links: [],
    decisions: [],
    concepts: [],
    criteria: [],
    scores: [],
    records: notes,
    workflow_log: [],
    comments: [],
  } as unknown as S;
}

const item = (id: string): PackItem => ({ id, type: "note", title: id, meta: "", flag: null });
const sizes: Record<string, number> = { a: 50, b: 500, c: 100 };
const size = (i: PackItem) => sizes[i.id];
const plan = (fields: Partial<PackPlan>): PackPlan => ({ ...EMPTY_PLAN, ...fields });

describe("the budget", () => {
  it("keeps everything without one", () => {
    expect(fitBudget([item("a"), item("b")], plan({}), size).cut).toEqual([]);
  });

  it("skips what doesn't fit and still fits smaller things after it", () => {
    const r = fitBudget([item("a"), item("b"), item("c")], plan({ budget: 200 }), size);
    expect(r.cut.map((i) => i.id)).toEqual(["b"]);
    expect(r.used).toBe(150);
  });

  it("fills by priority before order", () => {
    const p = setPriority(setPriority(plan({ budget: 160 }), "c", "high"), "a", "low");
    expect(fitBudget([item("a"), item("b"), item("c")], p, size).cut.map((i) => i.id)).toEqual(["b"]);
    const tight = setPriority(plan({ budget: 120 }), "c", "high");
    expect(fitBudget([item("a"), item("c")], tight, size).cut.map((i) => i.id)).toEqual(["a"]);
  });

  it("never drops pinned or must-have items, and flags the conflict instead", () => {
    const p = setPriority(setPinned(plan({ budget: 100 }), "b", true), "c", "must");
    const r = fitBudget([item("a"), item("b"), item("c")], p, size);
    expect(r.cut.map((i) => i.id)).toEqual(["a"]);
    expect(r.conflict).toBe(true);
  });

  it("counts the brief and spec first", () => {
    expect(fitBudget([item("a")], plan({ budget: 100 }), size, 80).cut.map((i) => i.id)).toEqual(["a"]);
  });

  it("ignores what the person already left out", () => {
    expect(fitBudget([item("a"), item("b")], plan({ budget: 100, excluded: ["b"] }), size).cut).toEqual([]);
  });

  it("names what it held back in CLAUDE.md, and leaves it out of the zip", async () => {
    const files = unzipSync((await buildClaudePack(state(), { brief: "Build it", includeFiles: false, includeSamples: true, plan: plan({ budget: 1200 }) })).bytes);
    const md = strFromU8(files["CLAUDE.md"]);
    expect(md).toContain("## Held back to fit the budget");
    expect(md).toContain("- Big (note");
    expect(Object.keys(files).some((p) => p.includes("Big"))).toBe(false);
    expect(Object.keys(files).some((p) => p.includes("Small"))).toBe(true);
  });

  it("shows the result in the summary", async () => {
    const summary = await packSummary(state(), { brief: "", includeFiles: false, includeSamples: true, plan: plan({ budget: 1200 }) });
    expect(summary.shaped.budget?.cut.map((i) => i.title)).toEqual(["Big"]);
  });
});

describe("packs of only what changed", () => {
  it("fingerprints are stable and tell changes apart", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });

  it("leaves out what's unchanged since the last send, but keeps pinned items", () => {
    const before = state();
    const items = listPackItems(before);
    const lastSent = { at: "2026-11-01T10:00:00Z", prints: printsOf(before, items) };
    const after = state([note("n1", "Small", "short, edited"), note("n2", "Big", "x".repeat(4000)), note("n3", "Medium", "y".repeat(400))]);
    const shaped = shapePlan(after, setPinned(plan({ diffOnly: true }), "n3", true), listPackItems(after), lastSent);
    expect(shaped.unchanged.map((i) => i.title)).toEqual(["Big"]);
    expect(shaped.plan.excluded).toEqual(["n2"]);
    expect(shaped.since).toBe(lastSent.at);
  });

  it("sends everything when there's no last send", () => {
    const s = state();
    expect(shapePlan(s, plan({ diffOnly: true }), listPackItems(s), null).unchanged).toEqual([]);
  });

  it("tells Claude it's a diff", async () => {
    const s = state();
    const lastSent = { at: "2026-11-01T10:00:00Z", prints: printsOf(s, listPackItems(s)) };
    const files = unzipSync((await buildClaudePack(s, { brief: "x", includeFiles: false, includeSamples: true, plan: plan({ diffOnly: true }), lastSent })).bytes);
    expect(strFromU8(files["CLAUDE.md"])).toContain("only what changed since the one sent on 2026-11-01");
  });
});

describe("the plan", () => {
  it("reads older plans with the new fields empty", () => {
    const p = parsePlan(JSON.stringify({ excluded: ["x"] }));
    expect(p).toMatchObject({ budget: null, pinned: [], priority: {}, diffOnly: false, deliverable: { kind: "", depth: "standard" } });
  });

  it("drops priorities it doesn't know", () => {
    expect(parsePlan(JSON.stringify({ priority: { a: "high", b: "urgent" } })).priority).toEqual({ a: "high" });
  });
});

describe("the deliverable", () => {
  it("says nothing when nothing is chosen", () => {
    expect(deliverableMarkdown(parseDeliverable(null))).toBe("");
  });

  it("asks for the chosen kind, depth, format and tone", () => {
    const md = deliverableMarkdown(parseDeliverable({ kind: "ui-brief", depth: "short", format: "Markdown", tone: "plain" }));
    expect(md).toContain("a UI brief");
    expect(md).toContain("Keep it short");
    expect(md).toContain("Format: Markdown");
    expect(md).toContain("Tone: plain");
  });

  it("goes into CLAUDE.md", async () => {
    const p = plan({ deliverable: parseDeliverable({ kind: "plan" }) });
    const files = unzipSync((await buildClaudePack(state(), { brief: "x", includeFiles: false, includeSamples: true, plan: p })).bytes);
    expect(strFromU8(files["CLAUDE.md"])).toContain("## What to hand back");
  });
});
