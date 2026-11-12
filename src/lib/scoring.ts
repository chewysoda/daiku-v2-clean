/** Lab decision maths: rules only, no AI, and the app never scores a concept for the user. */
export interface WCriterion {
  id: string;
  name: string;
  weight: number;
}
export interface WScore {
  concept_id: string;
  criterion_id: string;
  value: number;
  is_assumption?: boolean;
}

export function weightedTotal(conceptId: string, criteria: WCriterion[], scores: WScore[]): number {
  return criteria.reduce((sum, c) => {
    const s = scores.find((x) => x.concept_id === conceptId && x.criterion_id === c.id);
    return sum + c.weight * (s?.value ?? 0);
  }, 0);
}

export function weightedTotals(
  conceptIds: string[],
  criteria: WCriterion[],
  scores: WScore[],
): Record<string, number> {
  return Object.fromEntries(conceptIds.map((id) => [id, weightedTotal(id, criteria, scores)]));
}

/** Largest-weighted other criterion: where weight goes when one criterion is dialled down. */
export function compensator(criteria: WCriterion[], criterionId: string): WCriterion | null {
  return (
    criteria.filter((c) => c.id !== criterionId).sort((a, b) => b.weight - a.weight)[0] ?? null
  );
}

/** Sets one weight, moving the difference to another criterion so the total stays the same. */
export function moveWeight(criteria: WCriterion[], criterionId: string, weight: number): WCriterion[] {
  const target = criteria.find((c) => c.id === criterionId);
  const other = compensator(criteria, criterionId);
  if (!target || !other) return criteria;
  const clamped = Math.max(0, Math.min(weight, target.weight + other.weight));
  const delta = clamped - target.weight;
  return criteria.map((c) =>
    c.id === criterionId
      ? { ...c, weight: clamped }
      : c.id === other.id
        ? { ...c, weight: other.weight - delta }
        : c,
  );
}

export function ranking(totals: Record<string, number>): string[] {
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
}

export interface Crossover {
  /** Weight of the criterion at which the runner-up draws level with the leader. */
  weight: number;
  overtaker: string;
  movedTo: string;
}

/**
 * Where the lead flips as this criterion's weight moves (with the difference going to the
 * compensator). Totals are linear in the weight, so this solves directly. Null when the leader
 * stays ahead across the whole range.
 */
export function crossoverWeight(
  conceptIds: string[],
  criteria: WCriterion[],
  scores: WScore[],
  criterionId: string,
): Crossover | null {
  const target = criteria.find((c) => c.id === criterionId);
  const other = compensator(criteria, criterionId);
  if (!target || !other || conceptIds.length < 2) return null;
  const totals = weightedTotals(conceptIds, criteria, scores);
  const [leader] = ranking(totals);
  const value = (concept: string, crit: string) =>
    scores.find((s) => s.concept_id === concept && s.criterion_id === crit)?.value ?? 0;
  const max = target.weight + other.weight;
  let best: Crossover | null = null;
  for (const rival of conceptIds) {
    if (rival === leader) continue;
    const gap = totals[leader] - totals[rival];
    const slope =
      value(leader, criterionId) - value(rival, criterionId) -
      (value(leader, other.id) - value(rival, other.id));
    if (slope === 0) continue;
    const weight = target.weight - gap / slope;
    if (weight < 0 || weight > max) continue;
    if (!best || Math.abs(weight - target.weight) < Math.abs(best.weight - target.weight)) {
      best = { weight, overtaker: rival, movedTo: other.name };
    }
  }
  return best;
}

export interface Fragility {
  concept: string;
  criterion: string;
  value: number;
  droppedTo: number;
  total: number;
  newLeader: string | null;
}

/** For each guessed score on the leader: what if it's one point worse? */
export function assumptionRisks(
  conceptIds: string[],
  criteria: WCriterion[],
  scores: WScore[],
): Fragility[] {
  const totals = weightedTotals(conceptIds, criteria, scores);
  const [leader] = ranking(totals);
  if (!leader) return [];
  return scores
    .filter((s) => s.concept_id === leader && s.is_assumption && criteria.some((c) => c.id === s.criterion_id))
    .map((s) => {
      const droppedTo = Math.max(0, s.value - 1);
      const changed = scores.map((x) => (x === s ? { ...x, value: droppedTo } : x));
      const after = weightedTotals(conceptIds, criteria, changed);
      const [top] = ranking(after);
      return {
        concept: leader,
        criterion: s.criterion_id,
        value: s.value,
        droppedTo,
        total: after[leader],
        newLeader: top !== leader ? top : null,
      };
    })
    .sort((a, b) => a.total - b.total);
}

export const CLOSE_MARGIN = 0.1;

export type VerdictKind = "empty" | "close" | "fragile" | "clear";

export function verdict(conceptIds: string[], criteria: WCriterion[], scores: WScore[]) {
  const totals = weightedTotals(conceptIds, criteria, scores);
  const order = ranking(totals);
  if (order.length < 2 || !criteria.length) {
    return { kind: "empty" as VerdictKind, leader: order[0] ?? null, runnerUp: null, margin: 0, risks: [] };
  }
  const [leader, runnerUp] = order;
  const margin = totals[leader] - totals[runnerUp];
  const risks = assumptionRisks(conceptIds, criteria, scores);
  const kind: VerdictKind =
    margin < CLOSE_MARGIN ? "close" : risks.some((r) => r.newLeader) ? "fragile" : "clear";
  return { kind, leader, runnerUp, margin, risks };
}
