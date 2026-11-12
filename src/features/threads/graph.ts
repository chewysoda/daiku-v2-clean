import { Asset, Board, BoardItem, Claim, Concept, Criterion, Decision, EvidenceLink, Score } from "../../data/types";
import { isCredited } from "../../lib/search";
import { stanceOf } from "../../lib/studio";

export type NodeType = "board" | "section" | "source" | "note" | "claim" | "decision" | "concept";
export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  /** Unsupported: an unsourced image, a claim with no evidence, a concept with guessed scores. */
  gap: boolean;
  route: string;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  /** Evidence only: the person's own rating of the source, or null when they haven't rated it. */
  strength?: string | null;
}

export interface GraphInput {
  boards: Board[];
  items: BoardItem[];
  assets: Asset[];
  claims: Claim[];
  links: EvidenceLink[];
  decisions: Decision[];
  concepts: Concept[];
  criteria: Criterion[];
  scores: Score[];
}

/** One graph, derived on demand from the same rows the other screens read. Nothing is copied. */
export function buildGraph(d: GraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edge = (source: string, target: string, kind: string, strength?: string | null) => {
    if (nodes.has(source) && nodes.has(target) && source !== target) {
      edges.push({ id: `${source}>${target}:${kind}`, source, target, kind, ...(strength === undefined ? {} : { strength }) });
    }
  };
  const asset = (a: Asset) => {
    nodes.set(`asset:${a.id}`, {
      id: `asset:${a.id}`,
      label: a.title,
      type: "source",
      gap: !isCredited(a),
      route: `/library?q=${encodeURIComponent(a.title)}`,
    });
  };
  for (const b of d.boards) {
    nodes.set(`board:${b.id}`, { id: `board:${b.id}`, label: b.name, type: "board", gap: false, route: `/board/${b.id}` });
  }
  const onBoard = new Set(d.items.map((i) => i.asset_id));
  const used = new Set(d.links.map((l) => l.asset_id));
  for (const a of d.assets) {
    if (onBoard.has(a.id) || used.has(a.id) || d.concepts.some((c) => c.asset_id === a.id)) asset(a);
  }
  const sections = d.items.filter((i) => i.kind === "section");
  for (const s of sections) {
    nodes.set(`item:${s.id}`, {
      id: `item:${s.id}`,
      label: (s.data.text ?? "").slice(0, 40) || "Section",
      type: "section",
      gap: false,
      route: `/board/${s.board_id}`,
    });
    edge(`board:${s.board_id}`, `item:${s.id}`, "contains");
  }
  /** A card belongs to the section its centre sits in, as on the board. Otherwise it belongs to the board. */
  const parentOf = (i: BoardItem) => {
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    const s = sections.find((s) => s.board_id === i.board_id && cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h);
    return s ? `item:${s.id}` : `board:${i.board_id}`;
  };
  for (const i of d.items) {
    const parent = parentOf(i);
    if (i.kind === "image" && i.asset_id) {
      edge(parent, `asset:${i.asset_id}`, "contains");
    } else if (i.kind === "sticky" || i.kind === "text") {
      nodes.set(`item:${i.id}`, {
        id: `item:${i.id}`,
        label: (i.data.text ?? "").slice(0, 40) || "Note",
        type: "note",
        gap: false,
        route: `/board/${i.board_id}`,
      });
      edge(parent, `item:${i.id}`, "contains");
    }
  }
  const claimLinked = new Set(d.links.filter((l) => l.target_type === "claim").map((l) => l.target_id));
  for (const c of d.claims) {
    nodes.set(`claim:${c.id}`, {
      id: `claim:${c.id}`,
      label: c.text,
      type: "claim",
      gap: !claimLinked.has(c.id),
      route: `/explore/claims?claim=${encodeURIComponent(c.id)}`,
    });
    if (c.board_id) edge(`board:${c.board_id}`, `claim:${c.id}`, "contains");
  }
  for (const dec of d.decisions) {
    nodes.set(`decision:${dec.id}`, { id: `decision:${dec.id}`, label: dec.title, type: "decision", gap: false, route: `/decide/${dec.id}` });
    if (dec.board_id) edge(`board:${dec.board_id}`, `decision:${dec.id}`, "contains");
  }
  for (const k of d.concepts) {
    const guessed = d.scores.some((s) => s.concept_id === k.id && s.is_assumption);
    nodes.set(`concept:${k.id}`, { id: `concept:${k.id}`, label: k.name, type: "concept", gap: guessed, route: `/decide/${k.decision_id}` });
    edge(`decision:${k.decision_id}`, `concept:${k.id}`, "compares");
    if (k.asset_id) edge(`concept:${k.id}`, `asset:${k.asset_id}`, "shown by");
  }
  // A source against something is a different link from one for it, and each keeps the person's rating.
  for (const l of d.links) {
    const kind = stanceOf(l) === "against" ? "contradicts" : "supports";
    if (l.target_type === "claim") {
      edge(`asset:${l.asset_id}`, `claim:${l.target_id}`, kind, l.strength ?? null);
    } else {
      const score = d.scores.find((s) => s.id === l.target_id);
      if (score) edge(`asset:${l.asset_id}`, `concept:${score.concept_id}`, kind, l.strength ?? null);
    }
  }
  // Canvas connectors between images become typed links here too.
  for (const c of d.items.filter((i) => i.kind === "connector")) {
    const end = (id?: string) => {
      const it = d.items.find((i) => i.id === id);
      if (!it) return "";
      return it.kind === "image" ? `asset:${it.asset_id}` : `item:${it.id}`;
    };
    edge(end(c.data.from), end(c.data.to), c.data.connector ?? "plain");
  }
  const seen = new Set<string>();
  return { nodes: [...nodes.values()], edges: edges.filter((e) => !seen.has(e.id) && seen.add(e.id)) };
}

/** Nodes within `depth` links of the start: Obsidian's "local graph". */
export function neighbourhood(start: string, edges: GraphEdge[], depth: number): Set<string> {
  const out = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const e of edges) {
      for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
        if (frontier.includes(a) && !out.has(b)) {
          out.add(b);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  return out;
}
