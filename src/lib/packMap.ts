/**
 * The Threads map, written for whoever builds from a pack: what each decision and claim rests on, and
 * what is still a guess. It reads the rows the pack already holds, so anything left out is left out here too.
 */
import { Asset, Board, BoardItem, Claim, Concept, Criterion, Decision, EvidenceLink, Score } from "../data/types";
import { buildGraph } from "../features/threads/graph";
import { strengthOf } from "./readiness";
import { isCredited } from "./search";
import { claimStrength, stanceOf } from "./studio";

export interface MapInput {
  boards: Board[];
  board_items: BoardItem[];
  assets: Asset[];
  claims: Claim[];
  evidence_links: EvidenceLink[];
  decisions: Decision[];
  concepts: Concept[];
  criteria: Criterion[];
  scores: Score[];
}

const oneLine = (text: string | undefined) => (text ?? "").replace(/\s*\n\s*/g, " ").trim();

/** The same graph Threads draws, as data: nodes say if they're unsupported, evidence edges carry their rating. */
export function mapJson(s: MapInput) {
  const graph = buildGraph({ boards: s.boards, items: s.board_items, assets: s.assets, claims: s.claims, links: s.evidence_links, decisions: s.decisions, concepts: s.concepts, criteria: s.criteria, scores: s.scores });
  return {
    format: "daiku-map",
    version: 1,
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, unsupported: n.gap })),
    edges: graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, ...(e.strength === undefined ? {} : { strength: e.strength }) })),
  };
}

/** What's still a guess, in the order a builder should worry about it. */
export function unsupportedIn(s: MapInput): { claims: Claim[]; scores: { concept: Concept; criterion: Criterion | undefined }[]; sources: Asset[] } {
  const backed = new Set(s.evidence_links.filter((l) => l.target_type === "claim" && stanceOf(l) === "for").map((l) => l.target_id));
  const used = new Set([...s.evidence_links.map((l) => l.asset_id), ...s.concepts.map((c) => c.asset_id)]);
  return {
    claims: s.claims.filter((c) => !backed.has(c.id)),
    scores: s.scores
      .filter((x) => x.is_assumption)
      .flatMap((x) => {
        const concept = s.concepts.find((c) => c.id === x.concept_id);
        return concept ? [{ concept, criterion: s.criteria.find((c) => c.id === x.criterion_id) }] : [];
      }),
    // Only the uncredited sources something leans on: the rest are listed in CLAUDE.md.
    sources: s.assets.filter((a) => used.has(a.id) && !isCredited(a)),
  };
}

export function mapMarkdown(s: MapInput): string {
  const assetOf = (id: string) => s.assets.find((a) => a.id === id);
  const source = (l: EvidenceLink) => {
    const a = assetOf(l.asset_id);
    if (!a) return null;
    const rating = strengthOf(l);
    const notes = [rating ? `rated ${rating}` : "not rated", ...(isCredited(a) ? [] : ["no credit yet"]), ...(oneLine(l.limitation ?? "") ? [`limit: ${oneLine(l.limitation ?? "")}`] : [])];
    return `${a.title} (${notes.join(", ")})`;
  };
  const sources = (links: EvidenceLink[]) => links.map(source).filter(Boolean) as string[];
  const lines = [
    "# Map: what rests on what",
    "",
    "How the decisions, claims and sources in this pack connect. Ratings are the person's own, and \"not rated\" means they haven't judged that source yet. Anything marked **unsupported** has nothing behind it: treat it as a guess, say so, and ask before building on it.",
    "",
  ];

  if (s.decisions.length) lines.push("## Decisions", "");
  for (const d of s.decisions) {
    const criteria = s.criteria.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort);
    lines.push(`### ${oneLine(d.title)}`, "");
    for (const k of s.concepts.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort)) {
      const scores = s.scores.filter((x) => x.concept_id === k.id);
      const guessed = criteria.filter((c) => scores.some((x) => x.criterion_id === c.id && x.is_assumption));
      lines.push(`- **${[k.label, k.name].filter(Boolean).join(" · ")}**${guessed.length ? ` (${guessed.length} of ${criteria.length} scores unsupported)` : ""}`);
      for (const c of criteria) {
        const score = scores.find((x) => x.criterion_id === c.id);
        if (!score) continue;
        const links = s.evidence_links.filter((l) => l.target_type === "score" && l.target_id === score.id);
        const forIt = sources(links.filter((l) => stanceOf(l) === "for"));
        const against = sources(links.filter((l) => stanceOf(l) === "against"));
        const basis = score.is_assumption ? "**unsupported**, a guess" : forIt.length ? `backed by ${forIt.join("; ")}` : "marked as sourced, with no source linked";
        lines.push(`  - ${c.name}: ${basis}${against.length ? `. Against: ${against.join("; ")}` : ""}`);
      }
    }
    lines.push("");
  }

  if (s.claims.length) lines.push("## Claims", "");
  for (const c of s.claims) {
    const links = s.evidence_links.filter((l) => l.target_type === "claim" && l.target_id === c.id);
    const forLinks = links.filter((l) => stanceOf(l) === "for");
    const against = links.filter((l) => stanceOf(l) === "against");
    const strength = claimStrength(forLinks.length, against.length, forLinks.map((l) => l.strength));
    const board = s.boards.find((b) => b.id === c.board_id);
    lines.push(`- **${oneLine(c.text)}**: ${forLinks.length ? strength : against.length ? "**unsupported**, and a source is against it" : "**unsupported**"}${board ? ` (on board ${board.name})` : ""}`);
    if (forLinks.length) lines.push(`  - For: ${sources(forLinks).join("; ")}`);
    if (against.length) lines.push(`  - Against: ${sources(against).join("; ")}`);
  }
  if (s.claims.length) lines.push("");

  const open = unsupportedIn(s);
  if (open.claims.length || open.scores.length || open.sources.length) {
    lines.push("## Unsupported: ask before building on these", "");
    for (const c of open.claims) lines.push(`- Claim: ${oneLine(c.text)}`);
    // One line per option, so a decision with many guesses doesn't bury the claims above it.
    for (const concept of [...new Set(open.scores.map((x) => x.concept))]) {
      const on = open.scores.filter((x) => x.concept === concept).map((x) => x.criterion?.name ?? "a criterion");
      lines.push(`- ${on.length === 1 ? "Score" : "Scores"}: ${concept.name} on ${on.join(", ")}`);
    }
    for (const a of open.sources) lines.push(`- Source with no credit, used as evidence: ${a.title}`);
    lines.push("");
  } else {
    lines.push("## Unsupported", "", "Nothing. Every claim has a source for it and no score is a guess.", "");
  }
  return lines.join("\n");
}
