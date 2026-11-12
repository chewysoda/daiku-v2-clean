import { describe, expect, it } from "vitest";
import { groupByProject, LAB_TEMPLATES, summarise, templateById } from "./labTemplates";

describe("templates", () => {
  for (const t of LAB_TEMPLATES.filter((x) => x.criteria.length)) {
    it(`${t.label} adds up to 100%, with no repeats`, () => {
      expect(t.criteria.reduce((sum, [, w]) => sum + w, 0)).toBe(100);
      expect(new Set(t.criteria.map(([n]) => n)).size).toBe(t.criteria.length);
    });
  }

  it("falls back to blank for an unknown id", () => {
    expect(templateById("nope").id).toBe("blank");
  });
});

describe("summarise", () => {
  const concepts = [{ id: "a", decision_id: "d" }, { id: "b", decision_id: "d" }, { id: "z", decision_id: "other" }];
  const criteria = [{ id: "q", decision_id: "d" }, { id: "y", decision_id: "other" }];

  it("counts only this decision's own, and spots guesses", () => {
    const s = summarise("d", concepts, criteria, [
      { concept_id: "a", criterion_id: "q", is_assumption: true },
      { concept_id: "b", criterion_id: "q", is_assumption: false },
      { concept_id: "z", criterion_id: "y", is_assumption: true },
    ]);
    expect(s).toEqual({ concepts: 2, criteria: 1, scored: 2, cells: 2, guesses: 1 });
  });

  it("ignores a score left over from a removed criterion", () => {
    expect(summarise("d", concepts, criteria, [{ concept_id: "a", criterion_id: "gone", is_assumption: true }]).scored).toBe(0);
  });
});

describe("groupByProject", () => {
  const boards = [{ id: "b2", name: "Zebra" }, { id: "b1", name: "Apple" }, { id: "b3", name: "Empty" }];
  const decisions = [
    { id: "1", board_id: "b2", title: "one" },
    { id: "2", board_id: "b1", title: "two" },
    { id: "3", board_id: null, title: "three" },
    { id: "4", board_id: "deleted", title: "four" },
  ];

  it("sorts by name, leaves out empty projects, and puts the rest last", () => {
    const groups = groupByProject(decisions, boards);
    expect(groups.map((g) => g.name)).toEqual(["Apple", "Zebra", "No project"]);
  });

  it("keeps a decision whose project was deleted", () => {
    const groups = groupByProject(decisions, boards);
    const loose = groups[groups.length - 1];
    expect(loose.decisions.map((d) => d.id)).toEqual(["3", "4"]);
  });

  it("has no No project group when everything has one", () => {
    expect(groupByProject([decisions[0]], boards).map((g) => g.name)).toEqual(["Zebra"]);
  });
});
