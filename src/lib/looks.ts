/** Whole looks: a theme, an accent and a background together, ready-made or made from your own image. */
import { PaletteColor } from "../data/types";
import { localFileUrl } from "./platform";
import { MATS, MatId, matOf, ThemeId } from "./appearance";

const art = import.meta.glob("/src/design/backdrops/*.{svg,jpg,mp4}", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const builtinFile = (name: string) =>
  ["svg", "jpg", "mp4"].map((ext) => art[`/src/design/backdrops/${name}.${ext}`]).find(Boolean) ?? "";

/** A built-in background is saved by name, as its real address changes with every build. */
export function backdropUrl(path: string): string {
  if (path.startsWith("builtin:")) return builtinFile(path.slice(8));
  return localFileUrl(path);
}

/** A still for a built-in video's gallery tile, so the gallery doesn't decode video until asked. */
export function backdropPoster(path: string): string {
  return path.startsWith("builtin:") ? builtinFile(`${path.slice(8)}-poster`) : "";
}

export interface Look {
  id: string;
  name: string;
  theme: ThemeId;
  accent: string;
  backdrop: string;
  kind: "" | "image" | "video";
  dim: number;
  fonts?: { ui: string; display: string; mono: string };
}

const builtin = (id: string, name: string, theme: ThemeId, accent: string, dim: number, kind: Look["kind"] = "image"): Look => ({ id, name, theme, accent, backdrop: `builtin:${id}`, kind, dim });

/**
 * Only the quiet backdrops: behind glass, a loud picture decides whether text is readable. Workshop,
 * Rosewood, Aurora and Terracotta are left out of the gallery (their files stay, so a saved look still works).
 */
export const SUGGESTED_LOOKS: Look[] = [
  builtin("graphite", "Graphite", "mat-black", "#C9A36A", 45),
  builtin("nocturne", "Nocturne", "dark", "#5FB8B0", 50),
  builtin("blueprint", "Blueprint", "mat-blue", "#7FB2E5", 65),
  builtin("paper", "Paper", "light", "", 35),
  // From the first Daiku: a chalkboard wallpaper and a looping animation. Both dark enough to sit behind glass.
  builtin("steins", "Steins;Gate", "dark", "#D9C49A", 38),
  builtin("roommates", "Roommates", "dark", "#9DBF86", 62, "video"),
];

export function themeBackground(theme: string): string {
  const mat = matOf(theme);
  if (mat) return MATS[mat].bg;
  return theme === "dark" ? "#0F1114" : "#EEF0F3";
}

const chroma = (c: PaletteColor) => Math.hypot(c.a, c.b);

/** The colour that stands for an image: vivid enough to be a colour at all, and common enough to be its own. */
export function accentFrom(palette: PaletteColor[]): string {
  const scored = palette.filter((c) => c.l > 15 && c.l < 90).map((c) => ({ c, score: chroma(c) * Math.sqrt(Math.max(c.weight, 0.02)) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.c;
  return best && chroma(best) >= 8 ? best.hex : "";
}

/** The mat whose colour is closest to an image's mood, in hue. Greys go to the plain ones. */
export function matFor(palette: PaletteColor[]): MatId {
  const total = palette.reduce((s, c) => s + c.weight, 0) || 1;
  const a = palette.reduce((s, c) => s + c.a * c.weight, 0) / total;
  const b = palette.reduce((s, c) => s + c.b * c.weight, 0) / total;
  const l = palette.reduce((s, c) => s + c.l * c.weight, 0) / total;
  if (Math.hypot(a, b) < 6) return l < 40 ? "black" : "grey";
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (hue >= 110 && hue < 200) return "green";
  if (hue >= 200 && hue < 310) return "blue";
  return "rose";
}

/**
 * Looks to suit an image or video, from its own colours. A photo is busier than the built-in art, so it's
 * dimmed further, and more on the side that suits it, to keep text readable on top. Moving pictures
 * pull the eye more, so a video is dimmed a little further again.
 */
export function looksFromImage(path: string, palette: PaletteColor[], kind: "image" | "video" = "image"): Look[] {
  const total = palette.reduce((s, c) => s + c.weight, 0) || 1;
  const lightness = palette.reduce((s, c) => s + c.l * c.weight, 0) / total;
  const accent = accentFrom(palette);
  const mat = matFor(palette);
  const extra = kind === "video" ? 5 : 0;
  const make = (id: string, name: string, theme: ThemeId, dim: number): Look => ({ id: `${kind}-${id}`, name, theme, accent, backdrop: path, kind, dim: dim + extra });
  const dark = make("dark", "Dark", "dark", lightness < 50 ? 55 : 70);
  const light = make("light", "Light", "light", lightness >= 50 ? 55 : 72);
  const matLook = make("mat", `${MATS[mat].label} mat`, `mat-${mat}`, 65);
  return lightness < 50 ? [dark, matLook, light] : [light, dark, matLook];
}

/** A saved look list, ignoring anything damaged. */
export function parseLooks(saved: string): Look[] {
  try {
    const list: unknown = JSON.parse(saved || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((l): l is Look => typeof l?.id === "string" && typeof l?.name === "string" && !!l.name && typeof l?.theme === "string" && typeof l?.backdrop === "string");
  } catch {
    return [];
  }
}

/** Files other looks still need, so that changing the background doesn't delete one from under them. */
export const isFileInUse = (path: string, looks: Look[], current: string) => path === current || looks.some((l) => l.backdrop === path);
