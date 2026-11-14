/** What Home shows about a project: how much there is, how well it's backed, and where each decision stands. */
import { useStore } from "../data/store";
import { Asset, Board, Decision } from "../data/types";
import { projectAssetIds, projectsIn } from "./projects";
import { isCredited } from "./search";
import { verdict, VerdictKind } from "./scoring";

type S = ReturnType<typeof useStore.getState>;
type Rows = Pick<S, "records" | "boards" | "assets" | "board_items" | "claims" | "evidence_links" | "decisions" | "concepts" | "criteria" | "scores">;

export interface DecisionStanding {
  decision: Decision;
  kind: VerdictKind;
  leader: string | null;
  runnerUp: string | null;
  /** Scores in this decision still marked as a guess. */
  guesses: number;
}

export interface ProjectSummary {
  /** null for all work. */
  projectId: string | null;
  name: string;
  boards: Board[];
  sources: Asset[];
  /** Sources that say where they came from. */
  credited: number;
  claims: number;
  backed: number;
  decisions: DecisionStanding[];
  guesses: number;
  /** The latest edit or save, or null when there's nothing yet. */
  lastActive: string | null;
}

const latestFirst = (a: string, b: string) => b.localeCompare(a);

/** The project's summary, or all work's when the id is empty or names no project. */
export function projectSummary(s: Rows, projectId: string | null | undefined): ProjectSummary {
  const project = projectId ? projectsIn(s).find((p) => p.id === projectId) : undefined;
  const boardIds = project ? new Set(project.data.board_ids) : null;
  const decisionIds = project ? new Set(project.data.decision_ids) : null;
  const assetIds = project ? projectAssetIds(s, project.data) : null;

  const boards = s.boards.filter((b) => !boardIds || boardIds.has(b.id)).sort((a, b) => latestFirst(a.updated_at, b.updated_at));
  const sources = s.assets.filter((a) => !assetIds || assetIds.has(a.id)).sort((a, b) => latestFirst(a.captured_at, b.captured_at));
  const claims = s.claims.filter((c) => !boardIds || (c.board_id != null && boardIds.has(c.board_id)));
  // Backed means something supports it, as on a claim's card: evidence against a claim doesn't count.
  const backedIds = new Set(s.evidence_links.filter((l) => l.target_type === "claim" && l.stance !== "against").map((l) => l.target_id));

  const decisions = s.decisions
    .filter((d) => !decisionIds || decisionIds.has(d.id))
    .sort((a, b) => latestFirst(a.created_at, b.created_at))
    .map((decision): DecisionStanding => {
      const concepts = s.concepts.filter((c) => c.decision_id === decision.id).sort((a, b) => a.sort - b.sort);
      const criteria = s.criteria.filter((c) => c.decision_id === decision.id);
      const ids = new Set(concepts.map((c) => c.id));
      const scores = s.scores.filter((x) => ids.has(x.concept_id));
      const v = verdict([...ids], criteria, scores);
      const name = (id: string | null) => {
        const c = concepts.find((x) => x.id === id);
        return c ? c.name || c.label : null;
      };
      return { decision, kind: v.kind, leader: name(v.leader), runnerUp: name(v.runnerUp), guesses: scores.filter((x) => x.is_assumption).length };
    });

  const stamps = [boards[0]?.updated_at, sources[0]?.captured_at].filter((x): x is string => !!x).sort(latestFirst);
  return {
    projectId: project?.id ?? null,
    name: project ? project.data.name || "Untitled project" : "All work",
    boards,
    sources,
    credited: sources.filter(isCredited).length,
    claims: claims.length,
    backed: claims.filter((c) => backedIds.has(c.id)).length,
    decisions,
    guesses: decisions.reduce((n, d) => n + d.guesses, 0),
    lastActive: stamps[0] ?? null,
  };
}

/** One plain sentence on where a decision stands. */
export function standingText(d: DecisionStanding): string {
  if (d.kind === "empty" || !d.leader) return "Not scored yet";
  const guesses = d.guesses ? `, but ${d.guesses} ${d.guesses === 1 ? "score is" : "scores are"} still a guess` : "";
  if (d.kind === "close") return `${d.leader} and ${d.runnerUp} are neck and neck${guesses}`;
  if (d.kind === "fragile") return `${d.leader} leads, but a guess could flip it`;
  return `${d.leader} leads${guesses}`;
}
