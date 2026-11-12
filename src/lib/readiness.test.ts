import { describe, expect, it } from "vitest";
import { Claim, Concept, Criterion, DecisionLogData, EvidenceLink, Score } from "../data/types";
import { bestStrength, checkReadiness, isUnresolvedConflict, ReadinessInput, recordIsStale, strengthOf } from "./readiness";
import { evidenceMarkdown, EvidenceRow, reasoningMarkdown } from "./decisionRecord";
import { claimStrength } from "./studio";

const concept = (id: string, label: string): Concept => ({ id, decision_id: "d", label, name: `Concept ${label}`, asset_id: null, flag: "", sort: 0 });
const criterion = (id: string, weight: number): Criterion => ({ id, decision_id: "d", name: id, weight, sort: 0 });
const score = (id: string, c: string, q: string, value: number, is_assumption = false): Score => ({ id, concept_id: c, criterion_id: q, value, is_assumption });
const link = (id: string, target: string, over: Partial<EvidenceLink> = {}): EvidenceLink => ({
  id,
  asset_id: "src",
  target_type: "score",
  target_id: target,
  note: "",
  stance: "for",
  strength: "strong",
  source_type: "paper",
  limitation: "Small sample",
  created_at: "2026-11-01",
  is_sample: false,
  ...over,
});

const concepts = [concept("a", "A"), concept("b", "B")];
const criteria = [criterion("cost", 0.5), criterion("mass", 0.5)];
const scores = [score("s1", "a", "cost", 5), score("s2", "a", "mass", 4), score("s3", "b", "cost", 2), score("s4", "b", "mass", 3)];
const log: DecisionLogData = {
  decision_id: "d",
  concept_id: "a",
  title: "Chose A: Concept A",
  reason: "Cheapest",
  rejected: [{ concept_id: "b", label: "B", name: "Concept B", reason: "Over budget" }],
  totals: { a: 4.5, b: 2.5 },
};

/** A complete, well-evidenced decision. Each test breaks one thing about it. */
const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  decisionBoardId: null,
  concepts,
  criteria,
  scores,
  links: scores.map((s) => link(`l-${s.id}`, s.id)),
  assets: [{ id: "src", title: "Beam study", credit: "Rao 2021" }],
  claims: [],
  logs: [log],
  failedMust: () => [],
  ...over,
});
const rules = (i: ReadinessInput) => {
  const r = checkReadiness(i);
  return { blockers: r.blockers.map((f) => f.rule), warnings: r.warnings.map((f) => f.rule), status: r.status, counts: r.counts };
};
const claim: Claim = { id: "c", board_id: "p", text: "Ply is stiff enough", created_at: "", is_sample: false };

describe("readiness check", () => {
  it("passes a complete decision", () => {
    expect(rules(input())).toMatchObject({ status: "ready", blockers: [], warnings: [] });
  });

  it("flags a criterion with no evidence behind any concept", () => {
    const r = checkReadiness(input({ links: input().links.filter((l) => !["s1", "s3"].includes(l.target_id)) }));
    expect(r.blockers.map((f) => f.rule)).toEqual(["criterion_no_evidence"]);
    expect(r.blockers[0].text).toContain("cost");
  });

  it("flags one unsupported score without also blaming its criterion", () => {
    const r = checkReadiness(input({ links: input().links.filter((l) => l.target_id !== "s1") }));
    expect(r.blockers.map((f) => f.rule)).toEqual(["unsupported_score"]);
    expect(r.blockers[0].text).toContain("A · cost");
  });

  it("doesn't count evidence against a score as support for it", () => {
    const links = input().links.map((l) => (l.target_id === "s1" ? { ...l, stance: "against" as const, note: "Weighed" } : l));
    expect(rules(input({ links })).blockers).toContain("unsupported_score");
  });

  it("flags sources on both sides until someone says how they weighed them", () => {
    const against = link("x", "s1", { stance: "against" });
    expect(rules(input({ links: [...input().links, against] })).blockers).toEqual(["contradiction"]);
    const weighed = rules(input({ links: [...input().links, { ...against, note: "Their rig used a different load" }] }));
    expect(weighed.blockers).toEqual([]);
    expect(weighed.counts.weighed).toBe(1);
  });

  it("flags contradictory claims in the same project, and leaves other projects alone", () => {
    const links = [...input().links, link("f", "c", { target_type: "claim" }), link("g", "c", { target_type: "claim", stance: "against" })];
    expect(rules(input({ decisionBoardId: "p", claims: [claim], links })).blockers).toEqual(["contradiction"]);
    expect(rules(input({ decisionBoardId: "other", claims: [claim], links })).blockers).toEqual([]);
    expect(rules(input({ decisionBoardId: null, claims: [claim], links })).blockers).toEqual([]);
  });

  it("warns about a project's claim with no evidence", () => {
    expect(rules(input({ decisionBoardId: "p", claims: [claim] }))).toMatchObject({ status: "notes", warnings: ["claim_no_evidence"] });
  });

  it("treats older evidence as unrated instead of guessing a rating", () => {
    const links = input().links.map((l, i) => (i === 0 ? { ...l, strength: undefined, source_type: null } : l));
    const r = checkReadiness(input({ links }));
    expect(r.blockers.map((f) => f.rule)).toEqual(["unrated_evidence"]);
    expect(r.blockers[0].text).toContain("a strength rating and a source type");
    expect(r.counts.unrated).toBe(1);
  });

  it("warns when a score rests only on weak evidence, but not when something stronger backs it", () => {
    const weak = input().links.map((l) => (l.target_id === "s1" ? { ...l, strength: "weak" as const } : l));
    expect(rules(input({ links: weak })).warnings).toEqual(["weak_only"]);
    expect(rules(input({ links: [...weak, link("more", "s1")] })).warnings).toEqual([]);
  });

  it("warns about missing limitations and uncredited sources", () => {
    const links = input().links.map((l, i) => (i === 0 ? { ...l, limitation: "  " } : l));
    expect(rules(input({ links })).warnings).toEqual(["no_limitation"]);
    expect(rules(input({ assets: [{ id: "src", title: "Beam study", credit: "" }] })).warnings).toEqual(["no_credit"]);
  });

  it("ignores links whose source is gone", () => {
    expect(rules(input({ assets: [] })).blockers).toContain("criterion_no_evidence");
  });

  it("flags scores that are missing, and weights that don't add up", () => {
    expect(rules(input({ scores: scores.slice(1), logs: [] })).blockers).toContain("unscored");
    expect(rules(input({ criteria: [criterion("cost", 0.5), criterion("mass", 0.3)], logs: [] })).blockers).toContain("weights");
  });

  it("doesn't hold a decision up over a criterion weighted at 0%", () => {
    expect(rules(input({ criteria: [...criteria, criterion("colour", 0)] })).blockers).toEqual([]);
  });

  it("needs two concepts and some criteria", () => {
    expect(rules(input({ concepts: [concepts[0]], logs: [] })).blockers).toContain("setup");
    expect(rules(input({ criteria: [], logs: [] })).blockers).toContain("setup");
  });

  it("needs a record, with a reason for every rejected concept", () => {
    expect(rules(input({ logs: [] })).blockers).toEqual(["no_record"]);
    expect(rules(input({ logs: [{ ...log, rejected: undefined }] })).blockers).toEqual(["no_rejection_reason"]);
    expect(rules(input({ logs: [{ ...log, rejected: [{ ...log.rejected![0], reason: " " }] }] })).blockers).toEqual(["no_rejection_reason"]);
  });

  it("reads only the latest record", () => {
    expect(rules(input({ logs: [{ ...log, rejected: undefined }, log] })).blockers).toEqual([]);
  });

  it("notices when the matrix has moved on since logging", () => {
    const changed = scores.map((s) => (s.id === "s1" ? { ...s, value: 4 } : s));
    expect(rules(input({ scores: changed })).blockers).toEqual(["stale_record"]);
    expect(recordIsStale(log, [...concepts, concept("c", "C")], { a: 4.5, b: 2.5, c: 0 })).toBe(true);
    expect(recordIsStale({ ...log, totals: undefined }, concepts, { a: 1, b: 1 })).toBe(false);
  });

  it("flags a chosen concept that has been removed", () => {
    expect(rules(input({ logs: [{ ...log, concept_id: "gone" }] })).blockers).toContain("stale_record");
  });

  it("checks must-haves on the chosen concept, not the leader", () => {
    const failedMust = (id: string) => (id === "b" ? ["R1"] : []);
    expect(rules(input({ failedMust })).blockers).toEqual([]);
    const choseB: DecisionLogData = { ...log, concept_id: "b", rejected: [{ concept_id: "a", label: "A", name: "Concept A", reason: "Too heavy" }] };
    const r = rules(input({ failedMust, logs: [choseB] }));
    expect(r.blockers).toEqual(["failed_must"]);
    expect(r.warnings).toEqual(["chose_other"]);
  });

  it("warns when the top two are too close to separate", () => {
    const close = [score("s1", "a", "cost", 3), score("s2", "a", "mass", 3), score("s3", "b", "cost", 3), score("s4", "b", "mass", 3)];
    expect(rules(input({ scores: close, logs: [{ ...log, totals: { a: 3, b: 3 } }] })).warnings).toEqual(["too_close"]);
  });

  it("counts what it saw", () => {
    const links = input().links.map((l, i) => (i === 0 ? { ...l, strength: "weak" as const } : i === 1 ? { ...l, strength: "medium" as const } : l));
    expect(checkReadiness(input({ links })).counts).toMatchObject({ scores: 4, backed: 4, cards: 4, strong: 2, medium: 1, weak: 1, unrated: 0 });
  });
});

describe("weighing evidence", () => {
  it("never makes up a rating", () => {
    expect(strengthOf({})).toBeNull();
    expect(strengthOf({ strength: null })).toBeNull();
    expect(strengthOf({ strength: "nonsense" as never })).toBeNull();
    expect(bestStrength([{ strength: null }])).toBeNull();
  });
  it("takes the best rating among supporting evidence only", () => {
    expect(bestStrength([{ strength: "weak" }, { strength: "medium" }])).toBe("medium");
    expect(bestStrength([{ strength: "weak" }, { strength: "strong", stance: "against" }])).toBe("weak");
  });
  it("sees a conflict only with sources on both sides and nothing written", () => {
    expect(isUnresolvedConflict([{ stance: "against", note: "" }])).toBe(false);
    expect(isUnresolvedConflict([{ stance: "for", note: "" }, { stance: "against", note: "" }])).toBe(true);
    expect(isUnresolvedConflict([{ stance: "for", note: "" }, { stance: "against", note: "Different load" }])).toBe(false);
  });
  it("doesn't call three weak sources strong", () => {
    expect(claimStrength(3, 0)).toBe("strong");
    expect(claimStrength(3, 0, ["weak", "weak", "weak"])).toBe("medium");
    expect(claimStrength(3, 0, ["weak", "strong", null])).toBe("strong");
    expect(claimStrength(3, 0, [null, null, null])).toBe("strong");
    expect(claimStrength(3, 1, ["strong", "strong", "strong"])).toBe("mixed");
  });
});

describe("the record's text", () => {
  it("gives the chosen concept and each rejection in the person's words", () => {
    const text = reasoningMarkdown(log);
    expect(text).toContain("**A: Concept A**");
    expect(text).toContain("Cheapest");
    expect(text).toContain("- **B: Concept B.** Over budget");
  });
  it("says so when evidence hasn't been rated", () => {
    const row: EvidenceRow = { link: link("l", "s1", { strength: null, source_type: null, limitation: "", stance: "against" }), concept: concepts[0], criterion: criteria[0], value: 5, title: "A|B", credit: null };
    const text = evidenceMarkdown([row]);
    expect(text).toContain("A\\|B (no credit yet)");
    expect(text).toContain("not rated");
    expect(text).toContain("not given");
    expect(text).toContain("none noted");
    expect(text).toContain("not yet weighed");
  });
});
