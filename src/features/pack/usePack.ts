/** The pack as it stands, worked out a moment after anything changes. Shared by the tray and Handoff. */
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../data/store";
import { packBase, PackSummary, packSummary } from "../../lib/claudePack";
import { estimateTokens, itemText, parseSent } from "../../lib/packBudget";
import { listPackItems, PackItem, PackPlan, parsePlan } from "../../lib/packPlan";

export type Placement = "pinned" | "included" | "out";

export interface PackRow {
  item: PackItem;
  tokens: number;
  place: Placement;
  /** Why it's out, in a few words. Empty when it's in. */
  reason: string;
}

export interface PackState {
  plan: PackPlan;
  brief: string;
  summary: PackSummary | null;
  rows: PackRow[];
  /** Tokens by group, for the meter. */
  tokens: Record<Placement, number>;
}

export function usePack(): PackState {
  const brief = useStore((s) => s.config.claude_brief);
  const planJson = useStore((s) => s.config.pack_plan);
  const sentJson = useStore((s) => s.config.pack_sent);
  const assets = useStore((s) => s.assets);
  const boards = useStore((s) => s.boards);
  const boardItems = useStore((s) => s.board_items);
  const decisions = useStore((s) => s.decisions);
  const claims = useStore((s) => s.claims);
  const evidence = useStore((s) => s.evidence_links);
  const records = useStore((s) => s.records);
  const scores = useStore((s) => s.scores);
  const plan = useMemo(() => parsePlan(planJson), [planJson]);
  const [summary, setSummary] = useState<PackSummary | null>(null);
  const [sizes, setSizes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const state = useStore.getState();
      const base = packBase(state, plan.includeSamples, plan.project);
      setSizes(new Map(listPackItems(base).map((i) => [i.id, estimateTokens(itemText(base, i))])));
      void packSummary(state, { brief, includeFiles: plan.includeFiles, includeSamples: plan.includeSamples, plan, lastSent: parseSent(sentJson) }).then((next) => {
        if (!cancelled) setSummary(next);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [brief, plan, sentJson, assets, boards, boardItems, decisions, claims, evidence, records, scores]);

  const rows = useMemo<PackRow[]>(() => {
    if (!summary) return [];
    const cut = new Set(summary.shaped.budget?.cut.map((i) => i.id));
    const same = new Set(summary.shaped.unchanged.map((i) => i.id));
    return summary.items.map((item) => {
      const tokens = sizes.get(item.id) ?? 0;
      const pinned = plan.pinned.includes(item.id) || plan.priority[item.id] === "must";
      if (plan.excluded.includes(item.id)) return { item, tokens, place: "out", reason: "You left it out" };
      if (cut.has(item.id)) return { item, tokens, place: "out", reason: plan.priority[item.id] === "low" ? "Over budget, low weight" : "Over budget" };
      if (same.has(item.id)) return { item, tokens, place: "out", reason: "Unchanged since the last pack" };
      return { item, tokens, place: pinned ? "pinned" : "included", reason: "" };
    });
  }, [summary, sizes, plan]);

  const tokens = useMemo(() => {
    const t: Record<Placement, number> = { pinned: 0, included: 0, out: 0 };
    for (const r of rows) t[r.place] += r.tokens;
    return t;
  }, [rows]);

  return { plan, brief, summary, rows, tokens };
}

/** Changes the saved plan. Every edit goes through here, so the tray, Handoff and shortcuts agree. */
export function updatePlan(change: (plan: PackPlan) => PackPlan) {
  const { config, setSetting } = useStore.getState();
  setSetting("pack_plan", JSON.stringify(change(parsePlan(config.pack_plan))));
}

export const formatTokens = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString());
