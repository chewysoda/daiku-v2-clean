/** The geometry of dragging out a snip. Pure, so it can be tested without a browser pane. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smaller than this is a stray click, not a snip. */
export const MIN_SNIP = 8;

/** The box between where a drag started and where it is now, whichever way it went, kept inside the view. */
export function boxFromDrag(from: { x: number; y: number }, to: { x: number; y: number }, viewW: number, viewH: number): Box {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x1 = clamp(from.x, viewW);
  const y1 = clamp(from.y, viewH);
  const x2 = clamp(to.x, viewW);
  const y2 = clamp(to.y, viewH);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export const isRealSnip = (box: Box) => box.w >= MIN_SNIP && box.h >= MIN_SNIP;

/** On-screen box to screenshot pixels. They differ on any display that isn't at 100% scale. */
export function toImagePixels(box: Box, viewW: number, viewH: number, imageW: number, imageH: number): Box {
  const sx = imageW / viewW;
  const sy = imageH / viewH;
  const x = Math.round(box.x * sx);
  const y = Math.round(box.y * sy);
  return { x, y, w: Math.min(Math.round(box.w * sx), imageW - x), h: Math.min(Math.round(box.h * sy), imageH - y) };
}
