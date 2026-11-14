import { BoardItem } from "../../data/types";
import { toast } from "../../design/primitives";
import { isTauri } from "../../lib/platform";
import { strokePoints, writingBox, writtenStrokes } from "./handwriting";
import { INPUT_SIZE, toModelInput } from "./mathDecode";

const FILES = ["encoder_model.onnx", "decoder_model.onnx", "tokenizer.json"];

const TOTAL_BYTES = 119_650_191;

/**
 * Where the model's files are. The desktop app downloads them the first time (about 120 MB, once),
 * showing how far it's got. The browser preview has them served by Vite.
 */
async function modelUrls(): Promise<Record<string, string>> {
  if (!isTauri) return Object.fromEntries(FILES.map((f) => [f, new URL(`/models/mfr/${f}`, location.href).href]));
  const { invoke, convertFileSrc, Channel } = await import("@tauri-apps/api/core");
  const dir = (await invoke<string | null>("math_model_dir")) ?? (await (download ??= downloadModel(invoke, Channel).finally(() => (download = null))));
  const base = dir.replace(/[\\/]+$/, "");
  return Object.fromEntries(FILES.map((f) => [f, convertFileSrc(`${base}\\${f}`)]));
}

/** One download at a time, however many formulas are asked for while it runs. */
let download: Promise<string> | null = null;

async function downloadModel(
  invoke: typeof import("@tauri-apps/api/core").invoke,
  Channel: typeof import("@tauri-apps/api/core").Channel,
): Promise<string> {
  let shown = -1;
  const progress = new Channel<number>();
  progress.onmessage = (bytes) => {
    const percent = Math.floor((bytes / TOTAL_BYTES) * 100);
    if (percent === shown) return;
    shown = percent;
    toast(`Getting the math reader, once: ${percent}% of 120 MB`);
  };
  const dir = await invoke<string>("math_model_download", { onProgress: progress });
  toast("Math reader saved on this PC. Reading the formula…");
  return dir;
}

/**
 * Handwriting as the model expects to see it. It was trained on formula pictures squeezed to a
 * square, so the writing is drawn with a margin and then stretched to fit, not fitted with bars.
 */
function strokesToPixels(items: BoardItem[]): Float32Array {
  const strokes = writtenStrokes(items).map(strokePoints);
  const box = writingBox(strokes);
  const margin = Math.max(box.w, box.h) * 0.06 + 6;
  const scale = 768 / Math.max(box.w + margin * 2, box.h + margin * 2, 1);
  const sheet = document.createElement("canvas");
  sheet.width = Math.max(8, Math.ceil((box.w + margin * 2) * scale));
  sheet.height = Math.max(8, Math.ceil((box.h + margin * 2) * scale));
  const ink = sheet.getContext("2d")!;
  ink.fillStyle = "#fff";
  ink.fillRect(0, 0, sheet.width, sheet.height);
  ink.strokeStyle = "#000";
  ink.lineCap = "round";
  ink.lineJoin = "round";
  ink.lineWidth = Math.max(2, Math.min(sheet.width, sheet.height) / 45, 5);
  for (const s of strokes) {
    ink.beginPath();
    if (s.length === 1) ink.arc((s[0][0] - box.x + margin) * scale, (s[0][1] - box.y + margin) * scale, ink.lineWidth / 2, 0, Math.PI * 2);
    s.forEach(([x, y], i) => {
      const px = (x - box.x + margin) * scale;
      const py = (y - box.y + margin) * scale;
      if (i) ink.lineTo(px, py);
      else ink.moveTo(px, py);
    });
    ink.stroke();
  }
  return sheetToPixels(sheet);
}

/** Any drawing, squeezed to the square the model reads. */
function sheetToPixels(sheet: HTMLCanvasElement): Float32Array {
  const square = document.createElement("canvas");
  square.width = square.height = INPUT_SIZE;
  const ctx = square.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sheet, 0, 0, INPUT_SIZE, INPUT_SIZE);
  return toModelInput(ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data);
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (latex: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./mathWorker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; latex?: string; error?: string }>) => {
    const job = waiting.get(e.data.id);
    if (!job) return;
    waiting.delete(e.data.id);
    if (e.data.error) job.reject(new Error(e.data.error));
    else job.resolve(e.data.latex ?? "");
  };
  worker.onerror = (e) => {
    for (const job of waiting.values()) job.reject(new Error(e.message || "The math reader stopped unexpectedly"));
    waiting.clear();
    worker = null;
  };
  return worker;
}

/** Reads handwritten math as LaTeX, on this PC. The model loads the first time, and stays ready after that. */
export const readMathHandwriting = (items: BoardItem[]): Promise<string> => runModel(strokesToPixels(items));

/** Reads a formula from a picture on a canvas. */
export const readMathPicture = (sheet: HTMLCanvasElement): Promise<string> => runModel(sheetToPixels(sheet));

async function runModel(pixels: Float32Array): Promise<string> {
  const urls = await modelUrls();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, pixels, urls }, [pixels.buffer]);
  });
}
