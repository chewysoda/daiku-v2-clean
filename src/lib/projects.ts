/** Projects group boards, decisions and files, so the Library can show only what's being worked on. */
import { selectRecords, useStore } from "../data/store";
import { Asset, ProjectData, RecordRow } from "../data/types";

type S = ReturnType<typeof useStore.getState>;
type Rows = Pick<S, "records" | "board_items" | "concepts" | "scores" | "claims" | "evidence_links">;
export type ProjectRow = RecordRow<"project">;

export const projectsIn = (s: Pick<S, "records">): ProjectRow[] => selectRecords(s.records, "project");

/** A project's files: those added to it, on its boards, used by its decisions or behind their scores, or backing its claims. */
export function projectAssetIds(s: Rows, project: ProjectData): Set<string> {
  const ids = new Set(project.asset_ids);
  const boards = new Set(project.board_ids);
  const decisions = new Set(project.decision_ids);
  for (const i of s.board_items) {
    if (!boards.has(i.board_id)) continue;
    if (i.asset_id) ids.add(i.asset_id);
    // A folder on the board holds its files by id rather than through asset_id.
    for (const f of i.data.files ?? []) ids.add(f);
  }
  const concepts = new Set<string>();
  for (const c of s.concepts) {
    if (!decisions.has(c.decision_id)) continue;
    concepts.add(c.id);
    if (c.asset_id) ids.add(c.asset_id);
  }
  const scores = new Set(s.scores.filter((x) => concepts.has(x.concept_id)).map((x) => x.id));
  for (const l of s.evidence_links) if (l.target_type === "score" && scores.has(l.target_id)) ids.add(l.asset_id);
  const claims = new Set(s.claims.filter((c) => c.board_id && boards.has(c.board_id)).map((c) => c.id));
  for (const l of s.evidence_links) if (l.target_type === "claim" && claims.has(l.target_id)) ids.add(l.asset_id);
  return ids;
}

export type LibraryScope = "working" | "all" | "unfiled" | { project: string };

/**
 * What the Library shows. "Working" hides only files that belong solely to projects that aren't being
 * worked on. A file in no project stays, so nothing saved from Explore or imported ever seems to vanish.
 */
export function filesInScope(s: Rows, assets: Asset[], scope: LibraryScope): Asset[] {
  if (scope === "all") return assets;
  const projects = selectRecords(s.records, "project");
  const sets = projects.map((p) => ({ working: p.data.working, id: p.id, ids: projectAssetIds(s, p.data) }));
  if (typeof scope === "object") {
    const own = sets.find((p) => p.id === scope.project);
    return own ? assets.filter((a) => own.ids.has(a.id)) : assets;
  }
  const filed = (a: Asset) => sets.some((p) => p.ids.has(a.id));
  if (scope === "unfiled") return assets.filter((a) => !filed(a));
  return assets.filter((a) => !filed(a) || sets.some((p) => p.working && p.ids.has(a.id)));
}

/** The project alone, for exporting: its boards, decisions, files and claims, and nothing else. */
export function narrowToProject(s: S, project: ProjectData): S {
  const boardIds = new Set(project.board_ids);
  const decisionIds = new Set(project.decision_ids);
  const assetIds = projectAssetIds(s, project);
  const recordIds = new Set(project.record_ids);
  const concepts = s.concepts.filter((c) => decisionIds.has(c.decision_id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const claims = s.claims.filter((c) => (c.board_id && boardIds.has(c.board_id)) || recordIds.has(c.id));
  const claimIds = new Set(claims.map((c) => c.id));
  const scores = s.scores.filter((x) => conceptIds.has(x.concept_id));
  const scoreIds = new Set(scores.map((x) => x.id));
  return {
    ...s,
    boards: s.boards.filter((b) => boardIds.has(b.id)),
    board_items: s.board_items.filter((i) => boardIds.has(i.board_id)),
    decisions: s.decisions.filter((d) => decisionIds.has(d.id)),
    concepts,
    scores,
    criteria: s.criteria.filter((c) => decisionIds.has(c.decision_id)),
    assets: s.assets.filter((a) => assetIds.has(a.id)),
    claims,
    evidence_links: s.evidence_links.filter((l) => (l.target_type === "claim" ? claimIds.has(l.target_id) : scoreIds.has(l.target_id))),
    records: s.records.filter((r) => {
      if (r.type === "highlight") return assetIds.has((r as RecordRow<"highlight">).data.asset_id);
      if (r.parent_id && decisionIds.has(r.parent_id)) return true;
      return recordIds.has(r.id);
    }),
    comments: s.comments.filter((c) => boardIds.has(c.board_id)),
  };
}

/** Reads the saved choice. A project that's since been removed falls back to Current projects. */
export function parseScope(saved: string, projects: ProjectRow[]): LibraryScope {
  if (saved === "all" || saved === "unfiled") return saved;
  if (saved.startsWith("project:") && projects.some((p) => p.id === saved.slice(8))) return { project: saved.slice(8) };
  return "working";
}

export const scopeKey = (scope: LibraryScope) => (typeof scope === "string" ? scope : `project:${scope.project}`);

export type GraphRows = Pick<S, "boards" | "board_items" | "assets" | "claims" | "evidence_links" | "decisions" | "concepts" | "criteria" | "scores" | "records">;

/**
 * The rows the Threads map draws, for the same choice as the Library: a project's own, or everything except
 * what belongs only to projects not being worked on. Links are kept only when both ends stay.
 */
export function rowsInScope<T extends GraphRows>(s: T, scope: LibraryScope): T {
  if (scope === "all") return s;
  const projects = selectRecords(s.records, "project");
  const own = typeof scope === "object" ? projects.find((p) => p.id === scope.project) : null;
  const keep = (id: string, listed: (p: ProjectData) => string[]) => {
    if (own) return listed(own.data).includes(id);
    const holders = projects.filter((p) => listed(p.data).includes(id));
    if (scope === "unfiled") return !holders.length;
    return !holders.length || holders.some((p) => p.data.working);
  };
  const boards = s.boards.filter((b) => keep(b.id, (p) => p.board_ids));
  const boardIds = new Set(boards.map((b) => b.id));
  const decisions = s.decisions.filter((d) => keep(d.id, (p) => p.decision_ids));
  const decisionIds = new Set(decisions.map((d) => d.id));
  const assets = filesInScope(s, s.assets, scope);
  const assetIds = new Set(assets.map((a) => a.id));
  const concepts = s.concepts.filter((c) => decisionIds.has(c.decision_id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const scores = s.scores.filter((x) => conceptIds.has(x.concept_id));
  const scoreIds = new Set(scores.map((x) => x.id));
  // A claim with no board goes with whatever's looking at the whole picture, but not a single project.
  const claims = s.claims.filter((c) => (c.board_id ? boardIds.has(c.board_id) : !own));
  const claimIds = new Set(claims.map((c) => c.id));
  return {
    ...s,
    boards,
    decisions,
    assets,
    concepts,
    scores,
    claims,
    criteria: s.criteria.filter((c) => decisionIds.has(c.decision_id)),
    board_items: s.board_items.filter((i) => boardIds.has(i.board_id) && (!i.asset_id || assetIds.has(i.asset_id))),
    evidence_links: s.evidence_links.filter((l) => assetIds.has(l.asset_id) && (l.target_type === "claim" ? claimIds.has(l.target_id) : scoreIds.has(l.target_id))),
  };
}

