import { BoardItem } from "../../data/types";
import { native } from "../../lib/platform";
import { readTextFromBlob } from "../../lib/ocr";

type P = [number, number];

/** Pencil and marker strokes with something to read, in the order they were written. */
export const writtenStrokes = (items: BoardItem[]) =>
  items.filter((i) => i.kind === "stroke" && (i.data.points?.length ?? 0) >= 2).sort((a, b) => a.z - b.z);

/** A stroke's points on the board, allowing for how it's been moved, resized and tilted. */
export function strokePoints(it: BoardItem): P[] {
  const flat = it.data.points ?? [];
  const sx = it.w / (it.data.vw || it.w || 1);
  const sy = it.h / (it.data.vh || it.h || 1);
  const turn = ((it.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const out: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = it.x + flat[i] * sx - cx;
    const y = it.y + flat[i + 1] * sy - cy;
    out.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
  return out;
}

export interface WritingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the writing sits, so the typed text can land in the same place. */
export function writingBox(strokes: P[][]): WritingBox {
  const all = strokes.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The recogniser expects writing at about the size it would be on a page, so writing done while
 * zoomed far in or out is brought to that size first. The strokes on the board aren't changed.
 */
export function normaliseForReading(strokes: P[][], targetHeight = 120): P[][] {
  const box = writingBox(strokes);
  const scale = targetHeight / Math.max(box.h, 1);
  const k = Math.min(Math.max(scale, 0.25), 8);
  return strokes.map((s) => s.map(([x, y]): P => [Math.round((x - box.x + 40 / k) * k * 10) / 10, Math.round((y - box.y + 40 / k) * k * 10) / 10]));
}

/** Draws strokes in black on white, for when only the picture-reading recogniser is available. */
async function strokesAsPicture(strokes: P[][]): Promise<Blob> {
  const box = writingBox(strokes);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.w + 80);
  canvas.height = Math.ceil(box.h + 80);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.max(3, box.h / 40);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("the writing couldn't be prepared");
  return blob;
}

/** Reads handwriting. Windows' pen recogniser first, and if it finds nothing, its picture one. */
export async function readHandwriting(items: BoardItem[]): Promise<string> {
  const strokes = writtenStrokes(items).map(strokePoints);
  if (!strokes.length) return "";
  const prepared = normaliseForReading(strokes);
  let pen = "";
  try {
    pen = (await native.inkToText(prepared)).trim();
  } catch (e) {
    console.warn("Pen recogniser unavailable, reading it as a picture:", e);
  }
  return pen || readTextFromBlob(await strokesAsPicture(prepared));
}
