/**
 * How the person has organised a build pack: what's in, what's out, which group each thing belongs to,
 * and what they want to say about it. Leaving something out has to mean it's nowhere in the zip.
 */
import { useStore } from "../data/store";
import { languageOf } from "./github";
import { ProjectData, RecordRow, uid } from "../data/types";
import { projectAssetIds } from "./projects";
import { AppSpec, EMPTY_SPEC, parseSpec } from "./appSpec";
import { isCredited } from "./search";
import { Deliverable, EMPTY_DELIVERABLE, parseDeliverable } from "./deliverable";

/** "must" always goes in, like a pin. Anything without one is "normal". */
export type Priority = "must" | "high" | "normal" | "low";
export const PRIORITIES: Priority[] = ["must", "high", "normal", "low"];

type S = ReturnType<typeof useStore.getState>;

export interface PackGroup {
  id: string;
  name: string;
  /** How the AI should use this group, in the person's words. */
  instruction: string;
}

export interface PackPlan {
  excluded: string[];
  groups: PackGroup[];
  /** Item id to group id. */
  placed: Record<string, string>;
  notes: Record<string, string>;
  includeFiles: boolean;
  includeSamples: boolean;
  /** The app to build, in the person's words. */
  app: AppSpec;
  /** Token budget for the pack. Null means no limit. */
  budget: number | null;
  /** Always included, whatever the budget or the diff says. */
  pinned: string[];
  priority: Record<string, Priority>;
  deliverable: Deliverable;
  /** Carry only what changed since the last pack was sent. */
  diffOnly: boolean;
  /** The project this pack draws from. Null means all work. */
  project: string | null;
  /** 3D models (asset ids) to ship with the pack for the site to show, whatever else is attached. */
  siteModels: string[];
}

export const EMPTY_PLAN: PackPlan = {
  excluded: [],
  groups: [],
  placed: {},
  notes: {},
  includeFiles: true,
  includeSamples: false,
  app: EMPTY_SPEC,
  budget: null,
  pinned: [],
  priority: {},
  deliverable: EMPTY_DELIVERABLE,
  diffOnly: false,
  project: null,
  siteModels: [],
};

export function parsePlan(json: string): PackPlan {
  try {
    const p = JSON.parse(json) as Partial<PackPlan> | null;
    if (!p || typeof p !== "object") return EMPTY_PLAN;
    return {
      excluded: Array.isArray(p.excluded) ? p.excluded : [],
      groups: Array.isArray(p.groups) ? p.groups : [],
      placed: p.placed && typeof p.placed === "object" ? p.placed : {},
      notes: p.notes && typeof p.notes === "object" ? p.notes : {},
      includeFiles: p.includeFiles !== false,
      includeSamples: p.includeSamples === true,
      app: parseSpec(p.app),
      budget: typeof p.budget === "number" && p.budget > 0 ? Math.round(p.budget) : null,
      pinned: Array.isArray(p.pinned) ? p.pinned : [],
      priority: p.priority && typeof p.priority === "object" ? Object.fromEntries(Object.entries(p.priority).filter(([, v]) => PRIORITIES.includes(v))) : {},
      deliverable: parseDeliverable(p.deliverable),
      diffOnly: p.diffOnly === true,
      project: typeof p.project === "string" && p.project ? p.project : null,
      siteModels: Array.isArray(p.siteModels) ? p.siteModels.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return EMPTY_PLAN;
  }
}

export type PackItemType = "draft" | "board" | "decision" | "source" | "note" | "claim" | "interviews" | "deck" | "progress" | "history";

export interface PackItem {
  id: string;
  type: PackItemType;
  title: string;
  meta: string;
  /** Marked like any other assumption: a source with no credit, or a claim with no evidence. */
  flag: string | null;
}

export const PACK_TYPES: { type: PackItemType; label: string }[] = [
  { type: "draft", label: "Drafts" },
  { type: "board", label: "Boards" },
  { type: "decision", label: "Decisions and engineering" },
  { type: "source", label: "Sources" },
  { type: "note", label: "Notes" },
  { type: "claim", label: "Claims" },
  { type: "interviews", label: "Interviews" },
  { type: "deck", label: "Decks" },
  { type: "progress", label: "Progress" },
  { type: "history", label: "History" },
];

export const INTERVIEWS_ID = "pack:interviews";
export const PROGRESS_ID = "pack:progress";
export const HISTORY_ID = "pack:history";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const ofType = <T extends RecordRow["type"]>(s: S, type: T) => s.records.filter((r) => r.type === type) as RecordRow<T>[];

export function listPackItems(s: S): PackItem[] {
  const items: PackItem[] = [];
  for (const d of ofType(s, "draft")) items.push({ id: d.id, type: "draft", title: d.data.title, meta: plural(d.data.body.trim().split(/\s+/).filter(Boolean).length, "word"), flag: null });
  for (const b of s.boards) {
    items.push({ id: b.id, type: "board", title: b.name, meta: plural(s.board_items.filter((i) => i.board_id === b.id && i.kind !== "connector").length, "item"), flag: null });
  }
  for (const d of s.decisions) {
    const concepts = s.concepts.filter((c) => c.decision_id === d.id).length;
    const requirements = s.records.filter((r) => r.type === "requirement" && r.parent_id === d.id).length;
    items.push({ id: d.id, type: "decision", title: d.title, meta: `${plural(concepts, "concept")}, ${plural(requirements, "requirement")}`, flag: null });
  }
  for (const a of s.assets) {
    const code = a.kind === "code";
    const unlicensed = code && /no licence stated/.test(a.credit ?? "");
    items.push({ id: a.id, type: "source", title: a.title, meta: code ? `code · ${languageOf(a)}` : a.kind, flag: !isCredited(a) ? "no source yet" : unlicensed ? "no licence" : null });
  }
  for (const n of ofType(s, "note")) items.push({ id: n.id, type: "note", title: n.data.title, meta: plural(n.data.body.trim().split(/\s+/).filter(Boolean).length, "word"), flag: null });
  for (const c of s.claims) {
    const count = s.evidence_links.filter((l) => l.target_type === "claim" && l.target_id === c.id).length;
    items.push({ id: c.id, type: "claim", title: c.text, meta: count ? plural(count, "piece") + " of evidence" : "", flag: count ? null : "no evidence" });
  }
  const interviewNotes = ofType(s, "interview_note").length;
  if (interviewNotes) items.push({ id: INTERVIEWS_ID, type: "interviews", title: "Interview notes", meta: `${plural(interviewNotes, "note")}, ${plural(ofType(s, "participant").length, "participant")}`, flag: null });
  for (const d of ofType(s, "deck")) items.push({ id: d.id, type: "deck", title: d.data.title, meta: plural(d.data.slides.length, "slide"), flag: null });
  const progress = ofType(s, "milestone").length + ofType(s, "check").length;
  if (progress) items.push({ id: PROGRESS_ID, type: "progress", title: "Milestones and saved checks", meta: plural(progress, "entry").replace("entrys", "entries"), flag: null });
  if (s.workflow_log.length) items.push({ id: HISTORY_ID, type: "history", title: "Workflow history", meta: plural(s.workflow_log.length, "entry").replace("entrys", "entries"), flag: null });
  return items;
}

/** The log mentions everything that ever happened, so it can't go in a pack that's holding something back. */
export function historyWithheld(plan: PackPlan, items: PackItem[]): boolean {
  const out = new Set(plan.excluded);
  return items.some((i) => i.id !== HISTORY_ID && out.has(i.id));
}

/** Interview notes only travel when consent is on record for that participant. */
export function withConsentOnly(s: S): S {
  const consented = new Set(s.records.filter((r) => r.type === "participant" && (r as RecordRow<"participant">).data.consent).map((r) => r.id));
  return {
    ...s,
    records: s.records.filter((r) => {
      if (r.type === "participant") return consented.has(r.id);
      if (r.type === "interview_note") return consented.has((r as RecordRow<"interview_note">).data.participant_id);
      return true;
    }),
  };
}

const DECISION_RECORDS = new Set(["requirement", "part", "calc", "material", "sim_run", "decision_log"]);

/** The project with everything that was left out removed, including where it's mentioned elsewhere. */
export function applyPlan(s: S, plan: PackPlan, items: PackItem[] = listPackItems(s)): S {
  const out = new Set(plan.excluded);
  const assets = s.assets.filter((a) => !out.has(a.id));
  const assetIds = new Set(assets.map((a) => a.id));
  const boards = s.boards.filter((b) => !out.has(b.id));
  const boardIds = new Set(boards.map((b) => b.id));
  const decisions = s.decisions.filter((d) => !out.has(d.id));
  const decisionIds = new Set(decisions.map((d) => d.id));
  const concepts = s.concepts.filter((c) => decisionIds.has(c.decision_id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const scores = s.scores.filter((x) => conceptIds.has(x.concept_id));
  const scoreIds = new Set(scores.map((x) => x.id));
  const claims = s.claims.filter((c) => !out.has(c.id));
  const claimIds = new Set(claims.map((c) => c.id));

  const records = s.records.filter((r) => {
    if (r.type === "note" || r.type === "deck" || r.type === "draft") return !out.has(r.id);
    if (r.type === "highlight") return assetIds.has((r as RecordRow<"highlight">).data.asset_id);
    if (r.type === "participant" || r.type === "theme" || r.type === "interview_note") return !out.has(INTERVIEWS_ID);
    if (r.type === "check") return !out.has(PROGRESS_ID);
    if (r.type === "milestone") {
      const decision = (r as RecordRow<"milestone">).data.decision_id;
      return !out.has(PROGRESS_ID) && (!decision || decisionIds.has(decision));
    }
    if (DECISION_RECORDS.has(r.type)) return !r.parent_id || decisionIds.has(r.parent_id);
    return true;
  });

  return {
    ...s,
    assets,
    boards,
    decisions,
    concepts,
    scores,
    claims,
    records,
    criteria: s.criteria.filter((c) => decisionIds.has(c.decision_id)),
    // A left-out picture stays a gap on the board, without the caption that describes it.
    board_items: s.board_items
      .filter((i) => boardIds.has(i.board_id))
      .map((i) => (i.asset_id && !assetIds.has(i.asset_id) ? { ...i, data: { ...i.data, caption: undefined } } : i)),
    comments: s.comments.filter((c) => boardIds.has(c.board_id) && (!c.asset_id || assetIds.has(c.asset_id))),
    // A claim keeps its count of evidence, but a note or limitation can quote a source that was left out.
    evidence_links: s.evidence_links
      .filter((l) => (l.target_type === "claim" ? claimIds.has(l.target_id) : scoreIds.has(l.target_id)))
      .map((l) => (assetIds.has(l.asset_id) ? l : { ...l, note: "", limitation: "" })),
    workflow_log: out.has(HISTORY_ID) || historyWithheld(plan, items) ? [] : s.workflow_log,
  };
}

export type PackFocus = { type: "board" | "decision"; id: string };

/**
 * A pack of one board or one decision: the thing itself, its files and its claims, and nothing else.
 * It's an ordinary plan, so leaving the rest out works exactly as it does on the Build pack screen.
 */
export function focusPlan(s: S, focus: PackFocus): PackPlan {
  const board_ids = focus.type === "board" ? [focus.id] : [];
  const decision_ids = focus.type === "decision" ? [focus.id] : [];
  const project: ProjectData = { name: "", working: false, board_ids, decision_ids, asset_ids: [], record_ids: [] };
  const keep = new Set<string>([...board_ids, ...decision_ids, ...projectAssetIds(s, project)]);
  for (const c of s.claims) if (c.board_id && board_ids.includes(c.board_id)) keep.add(c.id);
  // Samples stay in reach, so the example board can be sent too; everything outside the focus is left out anyway.
  return { ...EMPTY_PLAN, includeSamples: true, excluded: listPackItems(s).filter((i) => !keep.has(i.id)).map((i) => i.id) };
}

/* Editing the plan. Each returns a new plan, and none of them touch the project. */

export const setIncluded = (plan: PackPlan, ids: string[], included: boolean): PackPlan => {
  const excluded = new Set(plan.excluded);
  for (const id of ids) {
    if (included) excluded.delete(id);
    else excluded.add(id);
  }
  return { ...plan, excluded: [...excluded] };
};

export const addGroup = (plan: PackPlan, name = `Group ${plan.groups.length + 1}`): PackPlan => ({
  ...plan,
  groups: [...plan.groups, { id: uid(), name, instruction: "" }],
});

export const editGroup = (plan: PackPlan, id: string, fields: Partial<Pick<PackGroup, "name" | "instruction">>): PackPlan => ({
  ...plan,
  groups: plan.groups.map((g) => (g.id === id ? { ...g, ...fields } : g)),
});

export const moveGroup = (plan: PackPlan, id: string, by: -1 | 1): PackPlan => {
  const from = plan.groups.findIndex((g) => g.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= plan.groups.length) return plan;
  const groups = [...plan.groups];
  [groups[from], groups[to]] = [groups[to], groups[from]];
  return { ...plan, groups };
};

/** Its items go back to their usual folders. Nothing is left out by removing a group. */
export const removeGroup = (plan: PackPlan, id: string): PackPlan => ({
  ...plan,
  groups: plan.groups.filter((g) => g.id !== id),
  placed: Object.fromEntries(Object.entries(plan.placed).filter(([, group]) => group !== id)),
});

export const placeItem = (plan: PackPlan, itemId: string, groupId: string | null): PackPlan => {
  const placed = { ...plan.placed };
  if (groupId) placed[itemId] = groupId;
  else delete placed[itemId];
  return { ...plan, placed };
};

export const setPinned = (plan: PackPlan, id: string, pinned: boolean): PackPlan => ({
  ...plan,
  pinned: pinned ? [...new Set([...plan.pinned, id])] : plan.pinned.filter((x) => x !== id),
});

export const setPriority = (plan: PackPlan, id: string, priority: Priority): PackPlan => {
  const next = { ...plan.priority };
  if (priority === "normal") delete next[id];
  else next[id] = priority;
  return { ...plan, priority: next };
};

export const setItemNote = (plan: PackPlan, itemId: string, note: string): PackPlan => {
  const notes = { ...plan.notes };
  if (note) notes[itemId] = note;
  else delete notes[itemId];
  return { ...plan, notes };
};
