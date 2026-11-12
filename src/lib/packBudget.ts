/**
 * Shaping a pack before it's written: what fits a token budget, and what changed since the last send.
 * Both only ever add to "left out", and both say what they left out, so the AI can ask for it.
 */
import { useStore } from "../data/store";
import { HISTORY_ID, INTERVIEWS_ID, PackItem, PackPlan, PRIORITIES, PROGRESS_ID } from "./packPlan";

type S = ReturnType<typeof useStore.getState>;

/** What the person last handed over: each item's fingerprint when it went. */
export interface SentRecord {
  at: string;
  prints: Record<string, string>;
}

export function parseSent(json: string): SentRecord | null {
  try {
    const v = JSON.parse(json) as SentRecord | null;
    return v && typeof v.at === "string" && v.prints && typeof v.prints === "object" ? v : null;
  } catch {
    return null;
  }
}

/** The rows an item is made of, as text. The same text sizes it and fingerprints it. */
export function itemText(s: S, item: PackItem): string {
  const id = item.id;
  const rec = (type: string, parent?: string) => s.records.filter((r) => r.type === type && (parent === undefined || r.parent_id === parent));
  switch (item.type) {
    case "board":
      return JSON.stringify([s.boards.find((b) => b.id === id), s.board_items.filter((i) => i.board_id === id).map((i) => [i.kind, i.data.text, i.data.caption, i.asset_id])]);
    case "decision": {
      const concepts = s.concepts.filter((c) => c.decision_id === id);
      const ids = new Set(concepts.map((c) => c.id));
      return JSON.stringify([
        s.decisions.find((d) => d.id === id)?.title,
        concepts,
        s.criteria.filter((c) => c.decision_id === id),
        s.scores.filter((x) => ids.has(x.concept_id)),
        s.records.filter((r) => r.parent_id === id).map((r) => r.data),
      ]);
    }
    case "source": {
      const a = s.assets.find((x) => x.id === id);
      return JSON.stringify([a?.title, a?.credit, a?.source_url, a?.notes, a?.tags, rec("highlight").filter((h) => (h.data as { asset_id: string }).asset_id === id).map((h) => h.data)]);
    }
    case "claim":
      return JSON.stringify([s.claims.find((c) => c.id === id)?.text, s.evidence_links.filter((l) => l.target_type === "claim" && l.target_id === id).map((l) => [l.asset_id, l.note, l.stance, l.limitation])]);
    case "note":
    case "draft":
    case "deck":
      return JSON.stringify(s.records.find((r) => r.id === id)?.data);
    case "interviews":
      return id === INTERVIEWS_ID ? JSON.stringify([rec("participant"), rec("theme"), rec("interview_note")].map((rows) => rows.map((r) => r.data))) : "";
    case "progress":
      return id === PROGRESS_ID ? JSON.stringify([rec("milestone"), rec("check")].map((rows) => rows.map((r) => r.data))) : "";
    case "history":
      return id === HISTORY_ID ? JSON.stringify(s.workflow_log.map((l) => [l.at, l.summary, l.why])) : "";
  }
}

/** The usual four-characters-a-token estimate. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** FNV-1a: short, stable, and enough to tell "changed" from "the same". */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const printsOf = (s: S, items: PackItem[]): Record<string, string> => Object.fromEntries(items.map((i) => [i.id, fingerprint(itemText(s, i))]));

const tier = (plan: PackPlan, id: string) => (plan.pinned.includes(id) ? 0 : PRIORITIES.indexOf(plan.priority[id] ?? "normal"));

export interface BudgetResult {
  /** Left out because they didn't fit, highest priority first. */
  cut: PackItem[];
  used: number;
  /** Pinned and must-have items alone go over the budget. They stay in; this just says so. */
  conflict: boolean;
}

/**
 * Fills the budget in priority order: pinned and must-have first (always kept), then high, normal, low.
 * Within a priority, the person's order holds. Something too big is skipped, so smaller ones can still fit.
 */
export function fitBudget(items: PackItem[], plan: PackPlan, sizeOf: (item: PackItem) => number, overhead = 0): BudgetResult {
  const budget = plan.budget;
  const ranked = items.filter((i) => !plan.excluded.includes(i.id)).map((item, n) => ({ item, n, t: tier(plan, item.id) }));
  ranked.sort((a, b) => a.t - b.t || a.n - b.n);
  let used = overhead;
  let conflict = false;
  const cut: PackItem[] = [];
  for (const { item, t } of ranked) {
    const size = sizeOf(item);
    if (budget == null || t === 0 || used + size <= budget) {
      used += size;
      if (budget != null && t === 0 && used > budget) conflict = true;
    } else cut.push(item);
  }
  return { cut, used, conflict };
}

export interface Shaped {
  plan: PackPlan;
  budget: BudgetResult | null;
  /** Left out because nothing changed since the last send. */
  unchanged: PackItem[];
  since: string | null;
}

/** The plan as it will be written, with the budget and the diff applied. */
export function shapePlan(s: S, plan: PackPlan, items: PackItem[], lastSent: SentRecord | null, overhead = 0): Shaped {
  let unchanged: PackItem[] = [];
  let excluded = plan.excluded;
  const diff = plan.diffOnly && lastSent;
  if (diff) {
    const prints = printsOf(s, items);
    // Pinned items always go, so the AI keeps its bearings.
    unchanged = items.filter((i) => !excluded.includes(i.id) && !plan.pinned.includes(i.id) && lastSent.prints[i.id] === prints[i.id]);
    excluded = [...excluded, ...unchanged.map((i) => i.id)];
  }
  const budget = plan.budget != null ? fitBudget(items, { ...plan, excluded }, (i) => estimateTokens(itemText(s, i)), overhead) : null;
  if (budget) excluded = [...excluded, ...budget.cut.map((i) => i.id)];
  return { plan: { ...plan, excluded }, budget, unchanged, since: diff ? lastSent.at : null };
}

/** For CLAUDE.md: one line for each thing held back, so the AI knows it exists and can ask. */
export function shapedMarkdown(shaped: Shaped): string {
  const line = (i: PackItem) => `- ${i.title}${i.meta ? ` (${i.type}, ${i.meta})` : ` (${i.type})`}`;
  const parts: string[] = [];
  if (shaped.since) {
    parts.push(
      `## Only what changed\n\nThis pack carries only what changed since the one sent on ${shaped.since.slice(0, 10)}. Keep using what you had from that one.${
        shaped.unchanged.length ? ` Unchanged, so not repeated:\n\n${shaped.unchanged.map(line).join("\n")}` : ""
      }`,
    );
  }
  if (shaped.budget?.cut.length) {
    parts.push(`## Held back to fit the budget\n\nThese exist but were left out to keep this pack small. Ask for any you need:\n\n${shaped.budget.cut.map(line).join("\n")}`);
  }
  return parts.length ? `${parts.join("\n\n")}\n\n` : "";
}

