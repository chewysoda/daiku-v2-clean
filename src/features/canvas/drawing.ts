import { BoardItem, DashStyle, Figure } from "../../data/types";

/** The geometry of pencil marks and shapes. Pure, so it's all testable without a canvas. */
export type Pt = [number, number];
export type DrawTool = "pencil" | "marker" | "shape";

export interface DrawStyle {
  /** Unset means the theme's text colour, so marks stay visible when the theme changes. */
  color?: string;
  width: number;
  opacity: number;
  dash: DashStyle;
  fill?: string;
  figure?: Figure;
  /** A pencil line that swells with pressure, or one of even width. */
  feel?: "natural" | "even";
  /** A shape that looks drawn by hand. */
  sketchy?: boolean;
}

export const DEFAULT_STYLES: Record<DrawTool, DrawStyle> = {
  pencil: { width: 3, opacity: 1, dash: "solid", feel: "natural" },
  marker: { color: "#F2D544", width: 18, opacity: 0.45, dash: "solid" },
  shape: { width: 2, opacity: 1, dash: "solid", figure: "rect" },
};

export const FIGURES: { id: Figure; label: string; glyph: string }[] = [
  { id: "rect", label: "Rectangle", glyph: "▭" },
  { id: "ellipse", label: "Ellipse", glyph: "◯" },
  { id: "diamond", label: "Diamond", glyph: "◇" },
  { id: "triangle", label: "Triangle", glyph: "△" },
  { id: "line", label: "Line", glyph: "╱" },
  { id: "arrow", label: "Arrow", glyph: "↗" },
];
export const DASHES: { id: DashStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
];
export const DRAW_COLORS = ["#1E1F1C", "#FBFAF7", "#E5484D", "#F2D544", "#46A758", "#3F6FB5", "#7A5FC0", "#E58FB1"];

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function cleanStyle(raw: unknown, base: DrawStyle): DrawStyle {
  const s = (raw ?? {}) as Partial<Record<keyof DrawStyle, unknown>>;
  const out: DrawStyle = {
    ...base,
    width: typeof s.width === "number" && Number.isFinite(s.width) ? clamp(s.width, 1, 60) : base.width,
    opacity: typeof s.opacity === "number" && Number.isFinite(s.opacity) ? clamp(s.opacity, 0.1, 1) : base.opacity,
    dash: DASHES.some((d) => d.id === s.dash) ? (s.dash as DashStyle) : base.dash,
  };
  if (typeof s.color === "string" && HEX.test(s.color)) out.color = s.color;
  if (typeof s.fill === "string" && HEX.test(s.fill)) out.fill = s.fill;
  if (base.figure) out.figure = FIGURES.some((f) => f.id === s.figure) ? (s.figure as Figure) : base.figure;
  if (s.feel === "natural" || s.feel === "even") out.feel = s.feel;
  if (s.sketchy === true) out.sketchy = true;
  return out;
}

/** The saved look of each tool, with anything damaged falling back to its default. */
export function parseDrawStyles(saved: string): Record<DrawTool, DrawStyle> {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(saved || "{}");
    if (parsed && typeof parsed === "object") raw = parsed;
  } catch {
    // Defaults below.
  }
  return {
    pencil: cleanStyle(raw.pencil, DEFAULT_STYLES.pencil),
    marker: cleanStyle(raw.marker, DEFAULT_STYLES.marker),
    shape: cleanStyle(raw.shape, DEFAULT_STYLES.shape),
  };
}

function distanceToSegment(p: readonly [number, number, ...number[]], a: readonly [number, number, ...number[]], b: readonly [number, number, ...number[]]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length, 0, 1) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker: keeps a stroke's shape with far fewer points, so long drawings stay light. */
export function simplify<T extends readonly [number, number, ...number[]]>(points: T[], tolerance = 0.6): T[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let far = -1;
    let most = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i], points[start], points[end]);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([start, far], [far, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** A smooth SVG path through the points, curving through the midpoints between them. */
export function smoothPath(flat: number[]): string {
  const n = Math.floor(flat.length / 2);
  if (!n) return "";
  // A tiny segment, as a path of one point draws nothing even with round caps.
  if (n === 1) return `M${flat[0]} ${flat[1]}l0.01 0`;
  if (n === 2) return `M${flat[0]} ${flat[1]}L${flat[2]} ${flat[3]}`;
  let d = `M${flat[0]} ${flat[1]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = flat[i * 2];
    const y = flat[i * 2 + 1];
    const midX = (x + flat[i * 2 + 2]) / 2;
    const midY = (y + flat[i * 2 + 3]) / 2;
    d += `Q${x} ${y} ${round(midX)} ${round(midY)}`;
  }
  return `${d}L${flat[n * 2 - 2]} ${flat[n * 2 - 1]}`;
}

const round = (v: number) => Math.round(v * 10) / 10;

/** A finished stroke's box, and its points relative to that box. A box is never flat, as SVG won't draw a zero-size picture. */
export function strokeFrom(points: readonly (readonly [number, number, ...number[]])[]): { x: number; y: number; w: number; h: number; points: number[] } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y),
    points: points.flatMap((p) => [round(p[0] - x), round(p[1] - y)]),
  };
}

export function dashArray(dash: DashStyle | undefined, width: number): string | undefined {
  if (dash === "dashed") return `${width * 3} ${width * 2.5}`;
  if (dash === "dotted") return `0.01 ${width * 2}`;
  return undefined;
}

/** The ends of a line or arrow. Flips record which way it was drawn within its box. */
export function lineEnds(w: number, h: number, flipX?: boolean, flipY?: boolean): [Pt, Pt] {
  return [
    [flipX ? w : 0, flipY ? h : 0],
    [flipX ? 0 : w, flipY ? 0 : h],
  ];
}

export function figureOutline(figure: Figure, w: number, h: number, flipX?: boolean, flipY?: boolean): Pt[] {
  switch (figure) {
    case "rect":
      return [[0, 0], [w, 0], [w, h], [0, h], [0, 0]];
    case "diamond":
      return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2], [w / 2, 0]];
    case "triangle":
      return [[w / 2, 0], [w, h], [0, h], [w / 2, 0]];
    case "ellipse": {
      const out: Pt[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        out.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
      }
      return out;
    }
    default:
      return lineEnds(w, h, flipX, flipY);
  }
}

export function figurePath(figure: Figure, w: number, h: number, flipX?: boolean, flipY?: boolean): string {
  if (figure === "ellipse") {
    return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 1 0 ${h / 2}Z`;
  }
  const points = figureOutline(figure, w, h, flipX, flipY);
  const closed = figure !== "line" && figure !== "arrow";
  return `M${points.map((p) => `${p[0]} ${p[1]}`).join("L")}${closed ? "Z" : ""}`;
}

/** The two barbs of an arrow's head, in proportion to its line weight. */
export function arrowHead(w: number, h: number, width: number, flipX?: boolean, flipY?: boolean): string {
  const [from, to] = lineEnds(w, h, flipX, flipY);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const size = Math.max(14, width * 5.5);
  const barb = (turn: number): Pt => [to[0] - size * Math.cos(angle + turn), to[1] - size * Math.sin(angle + turn)];
  const a = barb(0.5);
  const b = barb(-0.5);
  return `M${a[0]} ${a[1]}L${to[0]} ${to[1]}L${b[0]} ${b[1]}`;
}

/** Holding Shift makes a square or circle, and keeps a line to steps of 45 degrees. */
export function constrain(from: Pt, to: Pt, figure: Figure | "stroke"): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (figure === "line" || figure === "arrow" || figure === "stroke") {
    const length = Math.hypot(dx, dy);
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return [from[0] + round(length * Math.cos(angle)), from[1] + round(length * Math.sin(angle))];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [from[0] + side * (dx < 0 ? -1 : 1), from[1] + side * (dy < 0 ? -1 : 1)];
}

/** A shape's box from a drag. A click with no drag gets a sensible size rather than an invisible speck. */
export function shapeBox(from: Pt, to: Pt, figure: Figure) {
  const dragged = Math.hypot(to[0] - from[0], to[1] - from[1]) >= 4;
  const end: Pt = dragged ? to : [from[0] + 160, from[1] + (figure === "line" || figure === "arrow" ? 0 : 110)];
  return {
    x: Math.min(from[0], end[0]),
    y: Math.min(from[1], end[1]),
    w: Math.max(1, Math.abs(end[0] - from[0])),
    h: Math.max(1, Math.abs(end[1] - from[1])),
    flipX: end[0] < from[0],
    flipY: end[1] < from[1],
  };
}

function insidePolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Points along a movement, close enough together that nothing of the given size can slip between them. */
export function pathSamples(from: Pt, to: Pt, spacing: number): Pt[] {
  const steps = Math.min(200, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.max(spacing, 0.01)));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) out.push([from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]);
  return out.length ? out : [to];
}

export const isDrawn = (it: Pick<BoardItem, "kind">) => it.kind === "stroke" || it.kind === "shape";

/** Whether a point on the board touches a drawing, allowing for how it's been resized and tilted. */
export function hitsDrawing(it: BoardItem, point: Pt, radius: number): boolean {
  const reach = radius + (it.data.width ?? 2) / 2;
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const turn = (-(it.rotation || 0) * Math.PI) / 180;
  const rx = point[0] - cx;
  const ry = point[1] - cy;
  const local: Pt = [cx + rx * Math.cos(turn) - ry * Math.sin(turn) - it.x, cy + rx * Math.sin(turn) + ry * Math.cos(turn) - it.y];
  if (local[0] < -reach || local[1] < -reach || local[0] > it.w + reach || local[1] > it.h + reach) return false;

  let line: Pt[];
  if (it.kind === "stroke") {
    const flat = it.data.points ?? [];
    const sx = it.w / (it.data.vw || it.w || 1);
    const sy = it.h / (it.data.vh || it.h || 1);
    line = [];
    for (let i = 0; i + 1 < flat.length; i += 2) line.push([flat[i] * sx, flat[i + 1] * sy]);
    if (line.length === 1) return Math.hypot(local[0] - line[0][0], local[1] - line[0][1]) <= reach;
  } else {
    line = figureOutline(it.data.figure ?? "rect", it.w, it.h, it.data.flipX, it.data.flipY);
    if (it.data.fill && insidePolygon(local, line)) return true;
  }
  for (let i = 0; i + 1 < line.length; i++) {
    if (distanceToSegment(local, line[i], line[i + 1]) <= reach) return true;
  }
  return false;
}
