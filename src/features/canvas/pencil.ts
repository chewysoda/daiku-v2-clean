import { getStroke } from "perfect-freehand";
import rough from "roughjs";
import { Figure } from "../../data/types";
import { figureOutline } from "./drawing";

/**
 * How firmly the line is being drawn. A stylus says so. A mouse doesn't, so the speed stands in for
 * it, as with a real pencil: a fast flick lands lighter than a slow, deliberate line.
 */
export function pressureFrom(reported: number | undefined, isPen: boolean, pixelsMoved: number, previous: number): number {
  if (isPen && reported !== undefined && reported > 0) return Math.round(reported * 100) / 100;
  const target = Math.min(0.75, Math.max(0.28, 0.75 - pixelsMoved / 70));
  return Math.round((previous * 0.75 + target * 0.25) * 100) / 100;
}

/** A pencil line as a filled outline that swells and thins with pressure. */
export function pencilPath(flat: number[], pressures: number[] | undefined, width: number): string {
  const points: [number, number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1], pressures?.[i / 2] ?? 0.5]);
  if (!points.length) return "";
  const outline = getStroke(points, { size: width * 1.7, thinning: 0.62, smoothing: 0.5, streamline: 0.35, simulatePressure: false, last: true });
  if (outline.length < 2) return "";
  const fix = (v: number) => Math.round(v * 10) / 10;
  let d = `M${fix(outline[0][0])} ${fix(outline[0][1])}Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % outline.length];
    d += `${fix(x)} ${fix(y)} ${fix((x + nx) / 2)} ${fix((y + ny) / 2)} `;
  }
  return `${d}Z`;
}

/** The same seed draws the same wobble, so a sketchy shape doesn't redraw itself differently each time. */
export function seedOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 2147483646) + 1;
}

export interface SketchPath {
  d: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
}

/** A shape as if drawn by hand. A fill becomes pencil hatching, in the fill's colour. */
export function sketchPaths(
  figure: Figure,
  w: number,
  h: number,
  options: { seed: number; color: string; fill?: string; width: number; flipX?: boolean; flipY?: boolean },
): SketchPath[] {
  const gen = rough.generator();
  const style = {
    seed: options.seed,
    stroke: options.color,
    strokeWidth: options.width,
    roughness: 1.3,
    bowing: 1.2,
    ...(options.fill ? { fill: options.fill, fillStyle: "hachure", hachureGap: Math.max(5, options.width * 3), fillWeight: Math.max(1, options.width / 2) } : {}),
  };
  let drawable;
  if (figure === "ellipse") drawable = gen.ellipse(w / 2, h / 2, w, h, style);
  else if (figure === "rect") drawable = gen.rectangle(0, 0, w, h, style);
  else if (figure === "line" || figure === "arrow") {
    const [a, b] = figureOutline(figure, w, h, options.flipX, options.flipY);
    drawable = gen.line(a[0], a[1], b[0], b[1], style);
  } else {
    drawable = gen.polygon(figureOutline(figure, w, h).slice(0, -1), style);
  }
  return gen.toPaths(drawable).map((p) => ({ d: p.d, stroke: p.stroke, fill: p.fill ?? "none", strokeWidth: p.strokeWidth }));
}
