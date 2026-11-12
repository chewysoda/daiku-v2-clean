import { describe, expect, it } from "vitest";
import { assumptionRisks, crossoverWeight, moveWeight, ranking, verdict, weightedTotals } from "./scoring";

// The sample decision from design/wireframes/V2-Lab.dc.html.
const ids = ["A", "B", "C"];
const rows: [string, number, number, number, number, string][] = [
  ["comfort", 0.25, 4, 5, 3, ""],
  ["strength", 0.2, 3, 4, 5, ""],
  ["cost", 0.2, 4, 2, 3, "A"],
  ["weight", 0.15, 3, 5, 2, "C"],
  ["manufacturability", 0.1, 4, 3, 4, "C"],
  ["sustainability", 0.1, 5, 2, 3, "B"],
];
const criteria = rows.map(([id, weight]) => ({ id, name: id, weight }));
const scores = rows.flatMap(([id, , a, b, c, guess]) =>
  ([["A", a], ["B", b], ["C", c]] as const).map(([concept_id, value]) => ({
    concept_id,
    criterion_id: id,
    value,
    is_assumption: guess === concept_id,
  })),
);

describe("weighted score", () => {
  it("matches the Lab sample totals: A 3.75, B 3.70, C 3.35", () => {
    const totals = weightedTotals(ids, criteria, scores);
    expect(totals.A).toBeCloseTo(3.75, 10);
    expect(totals.B).toBeCloseTo(3.7, 10);
    expect(totals.C).toBeCloseTo(3.35, 10);
    expect(ranking(totals)).toEqual(["A", "B", "C"]);
  });

  it("treats an unscored cell as zero rather than failing", () => {
    expect(weightedTotals(["Z"], criteria, scores).Z).toBe(0);
  });
});

describe("sensitivity", () => {
  it("finds the 18.3% cost weight where B takes the lead, as the wireframe states", () => {
    const cross = crossoverWeight(ids, criteria, scores, "cost");
    expect(cross?.overtaker).toBe("B");
    expect(cross?.movedTo).toBe("comfort");
    expect(cross!.weight).toBeCloseTo(0.1833, 3);
    // And at that weight the two really are level.
    const moved = moveWeight(criteria, "cost", cross!.weight);
    const totals = weightedTotals(ids, moved, scores);
    expect(totals.A).toBeCloseTo(totals.B, 10);
  });

  it("keeps total weight constant when moving weight", () => {
    const moved = moveWeight(criteria, "cost", 0.05);
    expect(moved.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
    expect(moved.find((c) => c.id === "comfort")!.weight).toBeCloseTo(0.4, 10);
  });

  it("clamps so no weight goes negative", () => {
    const moved = moveWeight(criteria, "cost", 0.9);
    expect(moved.find((c) => c.id === "cost")!.weight).toBeCloseTo(0.45, 10);
    expect(moved.find((c) => c.id === "comfort")!.weight).toBeCloseTo(0, 10);
  });
});

describe("assumptions", () => {
  it("reports that A's guessed cost, one point lower, drops A to 3.55 and lets B lead", () => {
    const [risk] = assumptionRisks(ids, criteria, scores);
    expect(risk.criterion).toBe("cost");
    expect(risk.droppedTo).toBe(3);
    expect(risk.total).toBeCloseTo(3.55, 10);
    expect(risk.newLeader).toBe("B");
  });

  it("calls the sample decision too close to call", () => {
    const v = verdict(ids, criteria, scores);
    expect(v.kind).toBe("close");
    expect(v.leader).toBe("A");
    expect(v.margin).toBeCloseTo(0.05, 10);
  });

  it("has nothing to compare with a single concept", () => {
    expect(verdict(["A"], criteria, scores).kind).toBe("empty");
  });
});
