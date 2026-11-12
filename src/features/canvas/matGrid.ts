/** Where a cutting mat's printed lines fall on screen. One grid cell reads as 1 cm on the rulers. */
export const CELL = 26;
const MIN_CELL_ON_SCREEN = 7;
export const MAJOR_EVERY = 5;

/** The world distance between minor lines. Zooming far out skips to coarser lines rather than a solid wash. */
export function stepFor(zoom: number): number {
  let step = CELL;
  while (step * zoom < MIN_CELL_ON_SCREEN) step *= MAJOR_EVERY;
  return step;
}

export interface GridLine {
  /** Screen position along the axis. */
  at: number;
  /** Which multiple of the step this is, so that it stays put while panning. */
  index: number;
  major: boolean;
}

export function gridLines(offset: number, zoom: number, length: number, step: number): GridLine[] {
  const spacing = step * zoom;
  const first = Math.ceil(-offset / spacing);
  const last = Math.floor((length - offset) / spacing);
  const out: GridLine[] = [];
  for (let index = first; index <= last; index++) {
    out.push({ at: offset + index * spacing, index, major: index % MAJOR_EVERY === 0 });
  }
  return out;
}

/** A ruler number, in the mat's centimetres. */
export function rulerLabel(index: number, step: number): string {
  return String(Math.round((index * step) / CELL));
}

/** The two points where a line through `origin` at `degrees` meets a box big enough to cover the screen. */
export function angleLine(originX: number, originY: number, degrees: number, reach: number) {
  const r = (degrees * Math.PI) / 180;
  const dx = Math.cos(r) * reach;
  const dy = Math.sin(r) * reach;
  return { x1: originX - dx, y1: originY - dy, x2: originX + dx, y2: originY + dy };
}
