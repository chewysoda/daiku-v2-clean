import { BoardItem } from "../../data/types";

export interface View {
  x: number;
  y: number;
  zoom: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
  const k = zoom / view.zoom;
  return { zoom, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

export function fitView(items: BoardItem[], w: number, h: number): View {
  const solid = items.filter((i) => i.kind !== "connector");
  if (!solid.length) return { x: w / 2, y: h / 2, zoom: 1 };
  const x0 = Math.min(...solid.map((i) => i.x));
  const y0 = Math.min(...solid.map((i) => i.y));
  const x1 = Math.max(...solid.map((i) => i.x + i.w));
  const y1 = Math.max(...solid.map((i) => i.y + i.h));
  const padX = 48;
  const padTop = 76;
  const padBottom = 96;
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(1, (w - padX * 2) / (x1 - x0 || 1), (h - padTop - padBottom) / (y1 - y0 || 1)),
  );
  return {
    zoom,
    x: (w - (x1 - x0) * zoom) / 2 - x0 * zoom,
    y: padTop + (h - padTop - padBottom - (y1 - y0) * zoom) / 2 - y0 * zoom,
  };
}

export const inRect = (i: Box, r: Box) =>
  i.x < r.x + r.w && i.x + i.w > r.x && i.y < r.y + r.h && i.y + i.h > r.y;

/** Items on screen plus a margin. Sections and the selection always stay mounted. */
export function visibleItems(items: BoardItem[], view: View, w: number, h: number, keep: string[] = []): BoardItem[] {
  const margin = 200 / view.zoom;
  const rect = {
    x: -view.x / view.zoom - margin,
    y: -view.y / view.zoom - margin,
    w: w / view.zoom + margin * 2,
    h: h / view.zoom + margin * 2,
  };
  return items.filter((i) => i.kind === "section" || keep.includes(i.id) || inRect(i, rect));
}

/** Things whose centre sits inside a section, which excludes other sections and connectors. */
export function itemsInSection(section: Box & { id: string }, items: BoardItem[]): BoardItem[] {
  return items.filter((i) => {
    if (i.id === section.id || i.kind === "section" || i.kind === "connector") return false;
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    return cx >= section.x && cx <= section.x + section.w && cy >= section.y && cy <= section.y + section.h;
  });
}

function edgePoint(box: Box, toward: { x: number; y: number }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? box.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? box.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export type ConnectorLook = "curve" | "wavy" | "loopy" | "zigzag" | "hops";
export const CONNECTOR_LOOKS: ConnectorLook[] = ["curve", "wavy", "loopy", "zigzag", "hops"];

const r1 = (n: number) => Math.round(n * 10) / 10;
/** The last stretch runs straight, so the arrowhead always points at the card. Short links get a shorter one. */
const LEAD = 14;
const SHORTEST_WIGGLE = 30;

/**
 * A connector's line and its arrowhead, from the edge of one box to the edge of the other. The playful
 * looks wiggle between the two ends and keep a straight lead-in at each, so they still read as a link.
 */
/** Arrowhead size on connectors, in board units: long enough to point clearly, wide enough to see. */
export const HEAD_LENGTH = 15;
export const HEAD_HALF = 6.5;

export function connectorShape(a: Box, b: Box, look: ConnectorLook = "curve"): { d: string; head: string } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p = edgePoint(a, cb);
  const q = edgePoint(b, ca);
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  // A filled head with a shallow notch at the back: big enough to read at a glance, solid on dashed lines.
  const chevron = (ux: number, uy: number) => {
    const back = { x: q.x - ux * HEAD_LENGTH, y: q.y - uy * HEAD_LENGTH };
    const notch = { x: q.x - ux * HEAD_LENGTH * 0.7, y: q.y - uy * HEAD_LENGTH * 0.7 };
    return `M ${r1(back.x - uy * HEAD_HALF)} ${r1(back.y + ux * HEAD_HALF)} L ${r1(q.x)} ${r1(q.y)} L ${r1(back.x + uy * HEAD_HALF)} ${r1(back.y - ux * HEAD_HALF)} L ${r1(notch.x)} ${r1(notch.y)} Z`;
  };
  // Too short to wiggle: the plain curve reads better than a cramped squiggle.
  if (look === "curve" || !CONNECTOR_LOOKS.includes(look) || length < SHORTEST_WIGGLE) {
    const mx = (p.x + q.x) / 2;
    const bow = Math.min(40, Math.abs(q.x - p.x) * 0.25 + Math.abs(q.y - p.y) * 0.1);
    // The curve arrives along the line from its second control point.
    const tx = q.x - mx;
    const ty = bow;
    const t = Math.hypot(tx, ty);
    const [ux, uy] = t > 0.5 ? [tx / t, ty / t] : length ? [(q.x - p.x) / length, (q.y - p.y) / length] : [1, 0];
    return { d: connectorPath(a, b), head: length ? chevron(ux, uy) : "" };
  }
  const ux = (q.x - p.x) / length;
  const uy = (q.y - p.y) / length;
  const lead = Math.min(LEAD, length / 5);
  const body = length - lead * 2;
  /** A point `along` the body and `off` to its side. */
  const at = (along: number, off: number) => `${r1(p.x + ux * (lead + along) - uy * off)} ${r1(p.y + uy * (lead + along) + ux * off)}`;
  const parts = [`M ${r1(p.x)} ${r1(p.y)}`, `L ${at(0, 0)}`];
  if (look === "wavy") {
    const waves = Math.max(1, Math.round(body / 34));
    for (let i = 1; i <= waves * 12; i++) {
      const t = i / (waves * 12);
      parts.push(`L ${at(t * body, Math.sin(t * waves * Math.PI * 2) * 7)}`);
    }
  } else if (look === "loopy") {
    // A curl every so often: the line runs on, then rolls back over itself.
    const loops = Math.max(1, Math.round(body / 38));
    // Swinging back further than the line advances in a turn is what closes each curl, like a phone cord.
    const radius = (body / (loops * Math.PI * 2)) * 2.4;
    const steps = loops * 28;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const turn = Math.PI + t * loops * Math.PI * 2;
      parts.push(`L ${at(t * body - Math.sin(turn) * radius, (Math.cos(turn) + 1) * radius * 0.75)}`);
    }
  } else if (look === "zigzag") {
    const teeth = Math.max(2, Math.round(body / 14));
    for (let i = 1; i < teeth; i++) parts.push(`L ${at((i / teeth) * body, i % 2 ? 7 : -7)}`);
    parts.push(`L ${at(body, 0)}`);
  } else {
    // Hops: a row of little arcs, like a ball bouncing across.
    const hops = Math.max(1, Math.round(body / 30));
    const r = r1(body / hops / 2);
    for (let i = 1; i <= hops; i++) parts.push(`A ${r} ${r} 0 0 1 ${at((i / hops) * body, 0)}`);
  }
  parts.push(`L ${r1(q.x)} ${r1(q.y)}`);
  return { d: parts.join(" "), head: chevron(ux, uy) };
}

/** A gentle curve that leaves and arrives at the edges of the two boxes. */
export function connectorPath(a: Box, b: Box): string {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p = edgePoint(a, cb);
  const q = edgePoint(b, ca);
  const mx = (p.x + q.x) / 2;
  const bow = Math.min(40, Math.abs(q.x - p.x) * 0.25 + Math.abs(q.y - p.y) * 0.1);
  return `M ${p.x} ${p.y} C ${mx} ${p.y + bow}, ${mx} ${q.y - bow}, ${q.x} ${q.y}`;
}
