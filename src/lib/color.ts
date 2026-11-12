import { converter, differenceCiede2000, formatHex } from "culori";
import { PaletteColor } from "../data/types";

const toLab = converter("lab65");
const ciede = differenceCiede2000();

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export function hexToLab(hex: string): Lab | null {
  const c = toLab(hex);
  return c ? { l: c.l, a: c.a, b: c.b } : null;
}

export const labToHex = (c: Lab) =>
  formatHex({ mode: "lab65", l: c.l, a: c.a, b: c.b })?.toUpperCase() ?? "#000000";

export const deltaE = (x: Lab, y: Lab) =>
  ciede({ mode: "lab65", ...x }, { mode: "lab65", ...y });

const squared = (x: Lab, y: Lab) => (x.l - y.l) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2;

/**
 * K-means in LAB, so "similar" means perceptually similar. Seeded deterministically (each new
 * centre is the pixel furthest from the existing ones), so the same image always gives the
 * same palette. Returned largest first.
 */
export function kmeansPalette(pixels: Lab[], k = 5, iterations = 12): PaletteColor[] {
  if (!pixels.length) return [];
  const centres: Lab[] = [pixels[0]];
  while (centres.length < Math.min(k, pixels.length)) {
    let far = pixels[0];
    let farD = -1;
    for (const p of pixels) {
      const d = Math.min(...centres.map((c) => squared(p, c)));
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    if (farD <= 0) break;
    centres.push(far);
  }
  let counts = centres.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    const sums = centres.map(() => ({ l: 0, a: 0, b: 0 }));
    counts = centres.map(() => 0);
    for (const p of pixels) {
      let idx = 0;
      let best = Infinity;
      centres.forEach((c, i) => {
        const d = squared(p, c);
        if (d < best) {
          best = d;
          idx = i;
        }
      });
      sums[idx].l += p.l;
      sums[idx].a += p.a;
      sums[idx].b += p.b;
      counts[idx]++;
    }
    centres.forEach((c, i) => {
      if (counts[i]) {
        c.l = sums[i].l / counts[i];
        c.a = sums[i].a / counts[i];
        c.b = sums[i].b / counts[i];
      }
    });
  }
  return centres
    .map((c, i) => ({ ...c, weight: counts[i] / pixels.length, hex: labToHex(c) }))
    .filter((c) => c.weight > 0)
    .sort((x, y) => y.weight - x.weight);
}

/** Reads the palette off a displayable image. Returns [] if the image can't be read. */
export async function paletteFromImage(url: string, k = 5): Promise<PaletteColor[]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return paletteFromPicture(img, k);
  } catch {
    return [];
  }
}

/** A video's colours, read from one frame a little way in (the first is often black). */
export async function paletteFromVideo(url: string, k = 5): Promise<PaletteColor[]> {
  const video = document.createElement("video");
  try {
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("unplayable")), { once: true });
    });
    const at = Number.isFinite(video.duration) ? Math.min(2, video.duration / 3) : 0;
    if (at > 0) {
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = at;
      });
    }
    return paletteFromPicture(video, k);
  } catch {
    return [];
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function paletteFromPicture(picture: CanvasImageSource, k: number): PaletteColor[] {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(picture, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const pixels: Lab[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const lab = toLab({ mode: "rgb", r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 });
    if (lab) pixels.push({ l: lab.l, a: lab.a, b: lab.b });
  }
  return kmeansPalette(pixels, k);
}

const NAMED: [string, string][] = [
  ["pale oak", "#D9BE98"],
  ["oak", "#C9A67D"],
  ["honey", "#B48F67"],
  ["walnut", "#80604A"],
  ["bouclé", "#E9E1D3"],
  ["sage", "#7E9180"],
  ["clay", "#B86E4B"],
  ["charcoal", "#2E332D"],
];

export const COLOUR_SWATCHES = ["#C9A67D", "#80604A", "#E9E1D3", "#7E9180", "#C77B57", "#2E332D"];

export function colourName(hex: string): string {
  const lab = hexToLab(hex);
  if (!lab) return hex;
  let best = hex.toUpperCase();
  let bestD = 8;
  for (const [name, value] of NAMED) {
    const d = deltaE(lab, hexToLab(value)!);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/** Lighter and darker neighbours, for "also try" next to a colour search. */
export function nearbyColours(hex: string): string[] {
  const lab = hexToLab(hex);
  if (!lab) return [];
  return [14, -14, -28, 26].map((dl) =>
    labToHex({ l: Math.min(96, Math.max(8, lab.l + dl)), a: lab.a * 0.9, b: lab.b * 0.9 }),
  );
}
