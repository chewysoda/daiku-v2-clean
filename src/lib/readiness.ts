/**
 * The readiness check: fixed rules over the project's own data. No AI and no network. It says whether
 * a decision is complete and traceable, never whether the chosen concept is the right one.
 */
import { Asset, Claim, Concept, Criterion, DecisionLogData, EvidenceLink, EvidenceStrength, Score, SourceType } from "../data/types";
import { CLOSE_MARGIN, verdict, weightedTotals } from "./scoring";
import { isCredited } from "./search";
import { stanceOf } from "./studio";

export const STRENGTHS: { id: EvidenceStrength; label: string }[] = [
  { id: "strong", label: "Strong" },
  { id: "medium", label: "Medium" },
  { id: "weak", label: "Weak" },
];

export const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: "paper", label: "Peer-reviewed paper" },
  { id: "standard", label: "Standard or code" },
  { id: "datasheet", label: "Datasheet" },
  { id: "test", label: "Own test or measurement" },
  { id: "simulation", label: "Simulation" },
  { id: "calculation", label: "Calculation" },
  { id: "interview", label: "Interview or survey" },
  { id: "expert", label: "Expert opinion" },
  { id: "article", label: "Article or report" },
  { id: "product", label: "Product or company page" },
  { id: "other", label: "Other" },
];

/** A rating nobody chose stays empty. The app never infers one from the kind of source. */
export const strengthOf = (l: Pick<EvidenceLink, "strength">): EvidenceStrength | null => STRENGTHS.find((x) => x.id === l.strength)?.id ?? null;
export const sourceTypeLabel = (l: Pick<EvidenceLink, "source_type">): string | null => SOURCE_TYPES.find((x) => x.id === l.source_type)?.label ?? null;

/** The strongest rated support, or null when none of it has been rated. */
export function bestStrength(links: Pick<EvidenceLink, "strength" | "stance">[]): EvidenceStrength | null {
  const rated = links.filter((l) => stanceOf(l) === "for").map(strengthOf);
  return STRENGTHS.find((x) => rated.includes(x.id))?.id ?? null;
}

/** Sources on both sides, and nobody has yet written how they weighed the ones against. */
export function isUnresolvedConflict(links: Pick<EvidenceLink, "stance" | "note">[]): boolean {
  const against = links.filter((l) => stanceOf(l) === "against");
  return links.some((l) => stanceOf(l) === "for") && against.some((l) => !l.note?.trim());
}

export type FindingTarget = "matrix" | "requirements" | "claims" | "record";
export type FindingRule =
  | "setup"
  | "weights"
  | "unscored"
  | "criterion_no_evidence"
  | "unsupported_score"
  | "contradiction"
  | "unrated_evidence"
  | "weak_only"
  | "no_limitation"
  | "no_credit"
  | "failed_must"
  | "too_close"
  | "claim_no_evidence"
  | "no_record"
  | "no_rejection_reason"
  | "stale_record"
  | "chose_other";

export interface Finding {
  rule: FindingRule;
  text: string;
  to: FindingTarget;
}

export interface ReadinessInput {
  decisionBoardId: string | null;
  concepts: Concept[];
  criteria: Criterion[];
  scores: Score[];
  links: EvidenceLink[];
  assets: Pick<Asset, "id" | "title" | "credit">[];
  claims: Claim[];
  /** Oldest first. The last one is the current record. */
  logs: DecisionLogData[];
  failedMust: (conceptId: string) => string[];
}

export interface Readiness {
  status: "ready" | "notes" | "blocked";
  /** Must be fixed before this can be handed in. */
  blockers: Finding[];
  /** Allowed, but someone reading the record will ask about them. */
  warnings: Finding[];
  counts: { scores: number; backed: number; cards: number; strong: number; medium: number; weak: number; unrated: number; weighed: number };
}

const CHECKED_TOTAL_TOLERANCE = 1e-6;

/** Whether the matrix still says what it said when the record was logged. */
export function recordIsStale(log: DecisionLogData, concepts: Pick<Concept, "id">[], totals: Record<string, number>): boolean {
  if (!log.totals) return false;
  const saved = Object.keys(log.totals);
  if (saved.length !== concepts.length || concepts.some((c) => !(c.id in log.totals!))) return true;
  return saved.some((id) => Math.abs(log.totals![id] - totals[id]) > CHECKED_TOTAL_TOLERANCE);
}

export function checkReadiness(input: ReadinessInput): Readiness {
  const { concepts, criteria, scores, assets, logs } = input;
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const block = (rule: FindingRule, text: string, to: FindingTarget) => blockers.push({ rule, text, to });
  const warn = (rule: FindingRule, text: string, to: FindingTarget) => warnings.push({ rule, text, to });

  const ids = concepts.map((c) => c.id);
  const sum = criteria.reduce((total, c) => total + c.weight, 0);
  if (concepts.length < 2) block("setup", "Add at least two concepts. A decision needs something to reject.", "matrix");
  if (!criteria.length) block("setup", "Add the criteria you're judging by.", "matrix");
  if (criteria.length && Math.abs(sum - 1) > 0.001) block("weights", `Criteria weights add up to ${Math.round(sum * 1000) / 10}%, not 100%.`, "matrix");

  const linksFor = (scoreId: string) => input.links.filter((l) => l.target_type === "score" && l.target_id === scoreId && assets.some((a) => a.id === l.asset_id));
  const titleOf = (id: string) => assets.find((a) => a.id === id)?.title ?? "A source";
  const counts: Readiness["counts"] = { scores: 0, backed: 0, cards: 0, strong: 0, medium: 0, weak: 0, unrated: 0, weighed: 0 };
  const seenAssets = new Set<string>();

  // A criterion at 0% can't change the result, so it can't hold the decision up.
  for (const q of criteria.filter((c) => c.weight > 0)) {
    const cells = concepts.map((c) => {
      const score = scores.find((s) => s.concept_id === c.id && s.criterion_id === q.id);
      const links = score ? linksFor(score.id) : [];
      return { concept: c, score, links, support: links.filter((l) => stanceOf(l) === "for") };
    });
    const noneBacked = !cells.some((c) => c.support.length);
    if (noneBacked && cells.length) block("criterion_no_evidence", `${q.name} has no evidence behind any concept's score.`, "matrix");

    for (const { concept, score, links, support } of cells) {
      const where = `${concept.label} · ${q.name}`;
      if (!score) {
        block("unscored", `${where} hasn't been scored.`, "matrix");
        continue;
      }
      counts.scores++;
      if (support.length) counts.backed++;
      else if (!noneBacked) block("unsupported_score", `${where} scores ${score.value} with no source backing it.`, "matrix");
      else if (links.length) block("unsupported_score", `${where} scores ${score.value} with only sources against it.`, "matrix");

      if (isUnresolvedConflict(links)) block("contradiction", `${where} has sources for and against. Say how you weighed them, or remove one.`, "matrix");
      else if (support.length && links.length > support.length) counts.weighed++;

      if (support.length && support.every((l) => strengthOf(l) === "weak")) warn("weak_only", `${where} rests only on weak evidence.`, "matrix");

      for (const l of links) {
        const strength = strengthOf(l);
        counts.cards++;
        if (strength) counts[strength]++;
        else counts.unrated++;
        const missing = [strength ? null : "a strength rating", sourceTypeLabel(l) ? null : "a source type"].filter(Boolean);
        if (missing.length) block("unrated_evidence", `${where}: “${titleOf(l.asset_id)}” needs ${missing.join(" and ")}.`, "matrix");
        if (!l.limitation?.trim()) warn("no_limitation", `${where}: “${titleOf(l.asset_id)}” has no note on its limitations.`, "matrix");
        if (!seenAssets.has(l.asset_id)) {
          seenAssets.add(l.asset_id);
          const asset = assets.find((a) => a.id === l.asset_id);
          if (asset && !isCredited(asset)) warn("no_credit", `“${asset.title}” has no credit, so nobody can trace it.`, "matrix");
        }
      }
    }
  }

  // Claims only belong to a decision through its project.
  if (input.decisionBoardId) {
    for (const claim of input.claims.filter((c) => c.board_id === input.decisionBoardId)) {
      const links = input.links.filter((l) => l.target_type === "claim" && l.target_id === claim.id && assets.some((a) => a.id === l.asset_id));
      if (!links.some((l) => stanceOf(l) === "for")) warn("claim_no_evidence", `This project's claim has no evidence for it: “${claim.text}”`, "claims");
      else if (isUnresolvedConflict(links)) block("contradiction", `This project's claim has sources for and against: “${claim.text}”`, "claims");
    }
  }

  const totals = weightedTotals(ids, criteria, scores);
  const v = verdict(ids, criteria, scores);
  const log = logs[logs.length - 1];
  const nameOf = (id: string | null) => {
    const c = concepts.find((x) => x.id === id);
    return c ? `${c.label}: ${c.name}` : "A removed concept";
  };

  if (!log) {
    block("no_record", "Log the decision: the chosen concept, and why each other one was rejected.", "record");
  } else {
    if (!concepts.some((c) => c.id === log.concept_id)) block("stale_record", "The chosen concept has been removed from the matrix. Log the decision again.", "record");
    else if (recordIsStale(log, concepts, totals)) block("stale_record", "The matrix has changed since this decision was logged. Log it again so the record matches.", "record");
    for (const c of concepts.filter((x) => x.id !== log.concept_id)) {
      if (!log.rejected?.find((r) => r.concept_id === c.id)?.reason.trim()) block("no_rejection_reason", `The record doesn't say why ${c.label}: ${c.name} was rejected.`, "record");
    }
  }

  const subject = log && concepts.some((c) => c.id === log.concept_id) ? log.concept_id : v.leader;
  if (subject) {
    const failed = input.failedMust(subject);
    if (failed.length) block("failed_must", `${nameOf(subject)} fails a must-have: ${failed.join(", ")}.`, "requirements");
  }
  if (log && v.leader && log.concept_id !== v.leader && concepts.some((c) => c.id === log.concept_id)) {
    warn("chose_other", `You chose ${nameOf(log.concept_id)}, but ${nameOf(v.leader)} leads the matrix. Make sure your reason explains that.`, "record");
  }
  if (v.kind !== "empty" && v.margin < CLOSE_MARGIN) warn("too_close", `The top two are within ${CLOSE_MARGIN} of each other, so a small change to a score could flip them.`, "matrix");

  return { status: blockers.length ? "blocked" : warnings.length ? "notes" : "ready", blockers, warnings, counts };
}
