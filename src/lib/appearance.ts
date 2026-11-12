/** Themes, fonts and background media. Pure apart from `applyTheme` and `applyFonts`. */
import { converter, formatHex, wcagContrast } from "culori";

export interface MatColors {
  label: string;
  /** The mat itself, used for the canvas. */
  canvas: string;
  bg: string;
  surface: string;
  sunk: string;
  raised: string;
  border: string;
  tint: string;
  /** Printed grid lines and ruler numbers. */
  line: string;
}

export const MATS = {
  green: { label: "Classic green", canvas: "#1E4D3B", bg: "#173D2F", surface: "#215341", sunk: "#1A4434", raised: "#265C49", border: "#3A7560", tint: "#2C6450", line: "#A6DCC2" },
  blue: { label: "Workshop blue", canvas: "#1C3F5E", bg: "#16324B", surface: "#204663", sunk: "#1A3A56", raised: "#254E6E", border: "#3D6C92", tint: "#2A5578", line: "#AAD2F0" },
  black: { label: "Ink black", canvas: "#1C1E20", bg: "#141517", surface: "#232528", sunk: "#1A1C1E", raised: "#2B2E31", border: "#3D4145", tint: "#2F3336", line: "#C4C9CD" },
  rose: { label: "Rose", canvas: "#4F2537", bg: "#401E2C", surface: "#55293B", sunk: "#482232", raised: "#5D2E42", border: "#86506A", tint: "#6F3A50", line: "#F2C2D3" },
  grey: { label: "Self-healing grey", canvas: "#2C3034", bg: "#232629", surface: "#31353A", sunk: "#292C30", raised: "#383D42", border: "#51575D", tint: "#3F454B", line: "#CDD3D8" },
} satisfies Record<string, MatColors>;

export type MatId = keyof typeof MATS;
export type ThemeId = "light" | "dark" | `mat-${MatId}`;

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  ...(Object.entries(MATS) as [MatId, MatColors][]).map(([id, m]) => ({
    id: `mat-${id}` as ThemeId,
    label: `Cutting mat: ${m.label}`,
  })),
];

/** The mat a theme uses, or null for plain light and dark. An unknown name is treated as neither. */
export function matOf(theme: string): MatId | null {
  const id = theme.startsWith("mat-") ? theme.slice(4) : "";
  return Object.keys(MATS).includes(id) ? (id as MatId) : null;
}

/** The values a mat theme puts over the dark theme. Text colours are lifted to stay readable on the tinted surfaces. */
export function matTokens(mat: MatColors): Record<string, string> {
  return {
    "--c-bg": mat.bg,
    "--c-canvas": mat.canvas,
    "--c-surface": mat.surface,
    "--c-surface-sunk": mat.sunk,
    "--c-surface-raised": mat.raised,
    "--c-image-fallback": mat.raised,
    "--c-border": mat.border,
    "--c-hairline": mat.border,
    "--c-accent-tint": mat.tint,
    "--c-text-secondary": "#DDD8CD",
    "--c-text-muted": "#DDD8CD",
    "--c-caption": "#D3CEC3",
    "--c-icon-idle": "#D3CEC3",
    "--mat-line": mat.line,
  };
}

const ALL_MAT_TOKENS = Object.keys(matTokens(MATS.green));

export function applyTheme(theme: string, root: HTMLElement = document.documentElement) {
  const mat = matOf(theme);
  root.dataset.theme = mat || theme === "dark" ? "dark" : "light";
  for (const name of [...ALL_MAT_TOKENS, ...ACCENT_TOKENS]) root.style.removeProperty(name);
  if (mat) {
    root.dataset.mat = mat;
    for (const [name, value] of Object.entries(matTokens(MATS[mat]))) root.style.setProperty(name, value);
  } else {
    delete root.dataset.mat;
  }
}

export const ACCENTS: { label: string; hex: string }[] = [
  { label: "Neutral", hex: "" },
  { label: "Blue", hex: "#3F6FB5" },
  { label: "Slate", hex: "#4D6378" },
  { label: "Rose", hex: "#C2527A" },
  { label: "Amber", hex: "#B9802B" },
  { label: "Teal", hex: "#2B8C8C" },
];

const toOklch = converter("oklch");

/** The tokens for a chosen accent, lightened or darkened only as far as it takes to show up on this background. */
export function accentTokens(hex: string, background: string): Record<string, string> {
  const base = toOklch(hex);
  let accent = hex;
  if (base) {
    const towardLight = (wcagContrast("#ffffff", background) ?? 0) > (wcagContrast("#000000", background) ?? 0);
    for (let n = 0; n < 40 && (wcagContrast(accent, background) ?? 0) < 3.2; n++) {
      base.l = Math.min(1, Math.max(0, base.l + (towardLight ? 0.03 : -0.03)));
      accent = formatHex(base) ?? accent;
    }
  }
  return {
    "--c-accent": accent,
    "--c-accent-strong": accent,
    "--c-accent-soft": `color-mix(in srgb, ${accent} 60%, ${background})`,
    "--c-accent-tint": `color-mix(in srgb, ${accent} 18%, ${background})`,
  };
}

const ACCENT_TOKENS = ["--c-accent", "--c-accent-strong", "--c-accent-soft", "--c-accent-tint"];

/** Runs after applyTheme, as it builds on that theme's background. */
export function applyAccent(hex: string, root: HTMLElement = document.documentElement) {
  if (!hex) return;
  const background = getComputedStyle(root).getPropertyValue("--c-bg").trim();
  for (const [name, value] of Object.entries(accentTokens(hex, background))) root.style.setProperty(name, value);
}

export const UI_SCALES = ["0.8", "0.9", "1", "1.1", "1.25", "1.5"];

export function stepScale(current: string, step: 1 | -1): string {
  const i = UI_SCALES.indexOf(current);
  const at = i < 0 ? UI_SCALES.indexOf("1") : i;
  return UI_SCALES[Math.min(Math.max(at + step, 0), UI_SCALES.length - 1)];
}

export type FontSlot = "ui" | "display" | "mono";

export const FONT_SLOTS: { slot: FontSlot; key: "font_ui" | "font_display" | "font_mono"; label: string; hint: string; fallback: string; defaultName: string }[] = [
  { slot: "ui", key: "font_ui", label: "Interface font", hint: "Buttons, labels and body text.", fallback: 'system-ui, sans-serif', defaultName: "Segoe UI Variable" },
  { slot: "display", key: "font_display", label: "Heading font", hint: "Titles, and text on the canvas.", fallback: "Georgia, serif", defaultName: "Fraunces" },
  { slot: "mono", key: "font_mono", label: "Data font", hint: "Captions, numbers and dates.", fallback: "ui-monospace, monospace", defaultName: "DM Mono" },
];

/** Fonts Windows ships with, so they can be chosen without importing anything. */
export const SYSTEM_FONTS = ["Segoe UI", "Arial", "Calibri", "Georgia", "Times New Roman", "Consolas", "Cascadia Code"];

export interface CustomFont {
  family: string;
  path: string;
}

/** Reads the saved list, ignoring anything that isn't a well-formed entry. */
export function parseCustomFonts(saved: string): CustomFont[] {
  try {
    const list: unknown = JSON.parse(saved || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((f): f is CustomFont => typeof f?.family === "string" && !!f.family && typeof f?.path === "string");
  } catch {
    return [];
  }
}

/** "Inter_Tight-Regular.woff2" becomes "Inter Tight Regular". Also what makes the name safe inside a CSS string. */
export function familyFromFile(fileName: string, taken: string[] = []): string {
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
  const clean = base.replace(/[^\p{L}\p{N}]+/gu, " ").trim() || "Custom font";
  const lower = taken.map((t) => t.toLowerCase());
  let name = clean;
  for (let n = 2; lower.includes(name.toLowerCase()); n++) name = `${clean} ${n}`;
  return name;
}

export function fontStack(family: string, fallback: string): string {
  return `"${family.replace(/["\\]/g, "")}", ${fallback}`;
}

/** A blank choice removes the override, which brings back the design's own font. */
export function applyFonts(choices: Record<FontSlot, string>, root: HTMLElement = document.documentElement) {
  for (const { slot, fallback } of FONT_SLOTS) {
    const name = `--font-${slot}`;
    if (choices[slot]) root.style.setProperty(name, fontStack(choices[slot], fallback));
    else root.style.removeProperty(name);
  }
}

export const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif", "gif"];
export const VIDEO_EXTENSIONS = ["mp4", "webm"];

export function backdropKindOf(fileName: string): "image" | "video" | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

/** How much of the page colour lies over the background, from a saved percentage. Kept readable at the top end. */
export function dimFrom(saved: string): number {
  const n = Number(saved);
  return Number.isFinite(n) && saved !== "" ? Math.min(Math.max(n, 30), 95) : 70;
}
