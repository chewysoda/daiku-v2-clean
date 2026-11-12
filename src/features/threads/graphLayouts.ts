import type cytoscape from "cytoscape";
import { MotionEdge, wavesFrom } from "./graphMotion";

/** The shapes the Threads map can take. Pure, so the geometry is testable without a graph. */
export type GraphLayoutMode = "web" | "spiral" | "rings" | "tree";
export type GraphOrder = "links" | "type" | "name";

export interface GraphLayoutChoice {
  mode: GraphLayoutMode;
  /** How far apart things sit, as a multiple of the normal distance. */
  spacing: number;
  order: GraphOrder;
}

export const GRAPH_MODES: { id: GraphLayoutMode; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "spiral", label: "Spiral" },
  { id: "rings", label: "Rings" },
  { id: "tree", label: "Tree" },
];
export const GRAPH_ORDERS: { id: GraphOrder; label: string }[] = [
  { id: "links", label: "Most linked first" },
  { id: "type", label: "Grouped by type" },
  { id: "name", label: "A to Z" },
];
export const DEFAULT_LAYOUT: GraphLayoutChoice = { mode: "web", spacing: 1, order: "links" };

export function parseGraphLayout(saved: string): GraphLayoutChoice {
  try {
    const s = JSON.parse(saved || "{}");
    return {
      mode: GRAPH_MODES.some((m) => m.id === s.mode) ? s.mode : DEFAULT_LAYOUT.mode,
      order: GRAPH_ORDERS.some((o) => o.id === s.order) ? s.order : DEFAULT_LAYOUT.order,
      spacing: typeof s.spacing === "number" && Number.isFinite(s.spacing) ? Math.min(Math.max(s.spacing, 0.5), 2.5) : DEFAULT_LAYOUT.spacing,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

type Point = { x: number; y: number };

/**
 * Points along an Archimedean spiral, evenly spaced along the curve rather than by angle, so
 * nodes don't bunch up at the centre or spread out at the rim. `gap` is the distance between turns.
 */
export function spiralPoints(count: number, step: number, gap: number): Point[] {
  const growth = gap / (2 * Math.PI);
  const out: Point[] = [];
  if (count > 0) out.push({ x: 0, y: 0 });
  // The curve is too tight at the very centre to space nodes along, so the second starts a full step out.
  let angle = step / growth;
  for (let i = 1; i < count; i++) {
    const r = growth * angle;
    out.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    // A step along the curve turns less the further out it is.
    angle += step / Math.hypot(r, growth);
  }
  return out;
}

/** The spiral as a line to draw behind the nodes, ending at the last of them. */
export function spiralLine(count: number, step: number, gap: number): Point[] {
  const growth = gap / (2 * Math.PI);
  const nodes = spiralPoints(count, step, gap);
  const last = nodes[nodes.length - 1];
  if (!last) return [];
  const end = Math.hypot(last.x, last.y) / growth;
  const out: Point[] = [{ x: 0, y: 0 }];
  for (let a = step / growth; a < end; a += 0.12) out.push({ x: growth * a * Math.cos(a), y: growth * a * Math.sin(a) });
  out.push(last);
  return out;
}

/** Rings outward from the best-connected node, a ring per link away. Crowded rings widen so that labels fit. */
export function ringPoints(waves: number[], gap: number, minArc: number): Point[] {
  const members = new Map<number, number[]>();
  waves.forEach((w, i) => members.set(w, [...(members.get(w) ?? []), i]));
  const out: Point[] = new Array(waves.length);
  let radius = 0;
  for (const wave of [...members.keys()].sort((a, b) => a - b)) {
    const list = members.get(wave)!;
    if (wave === 0 && list.length === 1) {
      out[list[0]] = { x: 0, y: 0 };
      continue;
    }
    radius = Math.max(radius + gap, (list.length * minArc) / (2 * Math.PI));
    list.forEach((index, n) => {
      const angle = (n / list.length) * Math.PI * 2 - Math.PI / 2;
      out[index] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }
  return out;
}

export interface LayoutNode {
  id: string;
  label: string;
  type: string;
}

/** The order nodes take along the spiral, starting from the middle. */
export function orderNodes(nodes: LayoutNode[], edges: MotionEdge[], order: GraphOrder): LayoutNode[] {
  const ids = nodes.map((n) => n.id);
  const waves = wavesFrom(ids, edges);
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const byLinks = (a: LayoutNode, b: LayoutNode) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label);
  const sorted = [...nodes];
  if (order === "name") return sorted.sort((a, b) => a.label.localeCompare(b.label));
  if (order === "type") return sorted.sort((a, b) => a.type.localeCompare(b.type) || byLinks(a, b));
  // Following the links outward keeps connected things near one another on the curve.
  return sorted.sort((a, b) => (waves.get(a.id) ?? 0) - (waves.get(b.id) ?? 0) || byLinks(a, b));
}

/** What to hand the graph: where nodes go, and any guide line to draw behind them. */
export function planLayout(choice: GraphLayoutChoice, nodes: LayoutNode[], edges: MotionEdge[]): { layout: cytoscape.LayoutOptions; guide: Point[] | null } {
  const { mode, spacing } = choice;
  if (mode === "web" || !nodes.length) {
    return {
      layout: {
        name: "fcose",
        quality: "default",
        randomize: true,
        nodeRepulsion: () => 9000 * spacing * spacing,
        idealEdgeLength: () => 110 * spacing,
        nodeSeparation: 90 * spacing,
        gravity: 0.3,
        packComponents: true,
        padding: 40,
      } as unknown as cytoscape.LayoutOptions,
      guide: null,
    };
  }
  if (mode === "tree") {
    return {
      layout: { name: "dagre", rankDir: "LR", nodeSep: 34 * spacing, rankSep: 150 * spacing, ranker: "network-simplex" } as unknown as cytoscape.LayoutOptions,
      guide: null,
    };
  }
  const positions: Record<string, Point> = {};
  if (mode === "spiral") {
    const step = 128 * spacing;
    const gap = 96 * spacing;
    const ordered = orderNodes(nodes, edges, choice.order);
    spiralPoints(ordered.length, step, gap).forEach((p, i) => (positions[ordered[i].id] = p));
    return { layout: { name: "preset", positions } as cytoscape.LayoutOptions, guide: spiralLine(ordered.length, step, gap) };
  }
  const waves = wavesFrom(nodes.map((n) => n.id), edges);
  const ringsIn = nodes.map((n) => waves.get(n.id) ?? 0);
  ringPoints(ringsIn, 120 * spacing, 110 * spacing).forEach((p, i) => (positions[nodes[i].id] = p));
  return { layout: { name: "preset", positions } as cytoscape.LayoutOptions, guide: null };
}
