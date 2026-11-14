import { describe, expect, it } from "vitest";
import { useStore } from "../data/store";
import { projectSummary, standingText } from "./projectSummary";

type S = ReturnType<typeof useStore.getState>;

const state = (): S =>
  ({
    records: [{ id: "p", type: "project", parent_id: null, data: { name: "Lamp", working: true, board_ids: ["b1"], decision_ids: ["d1"], asset_ids: [], record_ids: [] } }],
    boards: [
      { id: "b1", name: "Lamp board", updated_at: "2026-11-10T00:00:00Z" },
      { id: "b2", name: "Other", updated_at: "2026-11-12T00:00:00Z" },
    ],
    assets: [
      { id: "a1", credit: "Wikimedia", source_url: null, captured_at: "2026-11-11T00:00:00Z" },
      { id: "a2", credit: null, source_url: null, captured_at: "2026-11-09T00:00:00Z" },
      { id: "a3", credit: null, source_url: null, captured_at: "2026-11-13T00:00:00Z" },
    ],
    board_items: [
      { id: "i1", board_id: "b1", asset_id: "a1", data: {} },
      { id: "i2", board_id: "b1", asset_id: "a2", data: {} },
      { id: "i3", board_id: "b2", asset_id: "a3", data: {} },
    ],
    claims: [
      { id: "c1", board_id: "b1" },
      { id: "c2", board_id: "b1" },
      { id: "c3", board_id: "b2" },
    ],
    evidence_links: [{ id: "l1", asset_id: "a1", target_type: "claim", target_id: "c1" }],
    decisions: [{ id: "d1", title: "Which bulb?", created_at: "2026-11-01T00:00:00Z" }],
    concepts: [
      { id: "k1", decision_id: "d1", label: "A", name: "LED", sort: 0 },
      { id: "k2", decision_id: "d1", label: "B", name: "Halogen", sort: 1 },
    ],
    criteria: [{ id: "r1", decision_id: "d1", name: "Cost", weight: 1 }],
    scores: [
      { id: "s1", concept_id: "k1", criterion_id: "r1", value: 5, is_assumption: true },
      { id: "s2", concept_id: "k2", criterion_id: "r1", value: 2, is_assumption: false },
    ],
  }) as unknown as S;

describe("project summary", () => {
  it("counts only what belongs to the project", () => {
    const p = projectSummary(state(), "p");
    expect(p.name).toBe("Lamp");
    expect(p.boards.map((b) => b.id)).toEqual(["b1"]);
    expect(p.sources.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(p.credited).toBe(1);
    expect([p.backed, p.claims]).toEqual([1, 2]);
    expect(p.guesses).toBe(1);
    expect(p.lastActive).toBe("2026-11-11T00:00:00Z");
  });

  it("counts a source as credited, and a claim as backed, by the same rules as the rest of the app", () => {
    const s = state();
    // A link alone, or a credit of only spaces, isn't a credit; evidence against a claim doesn't back it.
    s.assets = s.assets.map((a) => (a.id === "a2" ? { ...a, source_url: "https://example.org", credit: "  " } : a)) as never;
    s.evidence_links = [...s.evidence_links, { id: "l2", asset_id: "a1", target_type: "claim", target_id: "c2", stance: "against" }] as never;
    const sum = projectSummary(s, "p");
    expect(sum.credited).toBe(1);
    expect(sum.backed).toBe(1);
  });
  it("covers all work when no project is picked, or the picked one is gone", () => {
    for (const id of ["", "gone", null]) {
      const all = projectSummary(state(), id);
      expect(all.name).toBe("All work");
      expect(all.boards.map((b) => b.id)).toEqual(["b2", "b1"]);
      expect(all.sources).toHaveLength(3);
      expect(all.claims).toBe(3);
    }
  });

  it("says where a decision stands, in plain words", () => {
    const [d] = projectSummary(state(), "p").decisions;
    expect(d.leader).toBe("LED");
    expect(standingText(d)).toMatch(/^LED (leads|and Halogen)/);
    expect(standingText({ ...d, kind: "empty", leader: null })).toBe("Not scored yet");
    expect(standingText({ ...d, kind: "clear", guesses: 0 })).toBe("LED leads");
  });
});
