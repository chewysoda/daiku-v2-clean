import { wcagContrast } from "culori";
import type { CSSProperties } from "react";
import { BoardItem, ItemData, TextSize } from "../../data/types";
import { fontStack } from "../../lib/appearance";

/** How a sticky note, sticker or text box can look. Everything is optional, so old boards don't change. */
export const NOTE_COLORS = ["#E9D9A2", "#F4B8A8", "#F2C4DC", "#CDBDF0", "#B4D0F0", "#B5E0D2", "#CFE3A6", "#FBFAF7", "#3A3B38", "#1E1F1C"];
export const TEXT_COLORS = ["#1E1F1C", "#FBFAF7", "#4E6450", "#3F6FB5", "#7A5FC0", "#C2527A", "#B9802B"];

export const BUILT_IN_FONTS: { id: string; label: string; css: string }[] = [
  { id: "ui", label: "Interface", css: "var(--font-ui)" },
  { id: "display", label: "Serif", css: "var(--font-display)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
  { id: "hand", label: "Handwriting", css: '"Segoe Print", "Comic Sans MS", cursive' },
  { id: "marker", label: "Marker", css: '"Ink Free", "Segoe Script", cursive' },
];

const SIZES: Record<string, Record<TextSize, number>> = {
  sticky: { s: 12, m: 14, l: 18, xl: 24 },
  text: { s: 16, m: 20, l: 28, xl: 40 },
  sticker: { s: 10, m: 12, l: 16, xl: 22 },
  emoji: { s: 28, m: 44, l: 64, xl: 96 },
};
export const SIZE_ORDER: TextSize[] = ["s", "m", "l", "xl"];
export const SHAPES: { id: NonNullable<ItemData["shape"]>; label: string; radius: string }[] = [
  { id: "note", label: "Square", radius: "3px" },
  { id: "rounded", label: "Rounded", radius: "18px" },
  { id: "circle", label: "Circle", radius: "50%" },
];

/** Dark or light text, whichever reads better on this colour. */
export function inkOn(background: string): string {
  const dark = "#26241C";
  const light = "#FBFAF7";
  return (wcagContrast(background, dark) ?? 0) >= (wcagContrast(background, light) ?? 0) ? dark : light;
}

export function fontCss(font: string | undefined): string | undefined {
  if (!font) return undefined;
  return BUILT_IN_FONTS.find((f) => f.id === font)?.css ?? fontStack(font, "sans-serif");
}

const sizesFor = (it: Pick<BoardItem, "kind" | "data">) => SIZES[it.data.emoji ? "emoji" : it.kind];

/** The inline styles for an item's chosen look. Only what was chosen is set, so the stylesheet still decides the rest. */
export function itemLook(it: Pick<BoardItem, "kind" | "data">): CSSProperties {
  const { color, font, textSize, align, shape, emoji } = it.data;
  const look: CSSProperties = {};
  const family = fontCss(font);
  if (family) look.fontFamily = family;
  if (textSize || emoji) look.fontSize = sizesFor(it)?.[textSize ?? "m"];
  if (align) look.textAlign = align;
  if (color) {
    if (it.kind === "text") {
      look.color = color;
    } else if (!emoji) {
      look.background = color;
      look.color = inkOn(color);
    }
  }
  if (shape) look.borderRadius = SHAPES.find((s) => s.id === shape)?.radius;
  return look;
}

export function nextSize(current: TextSize | undefined, step: 1 | -1): TextSize {
  const i = SIZE_ORDER.indexOf(current ?? "m");
  return SIZE_ORDER[Math.min(Math.max(i + step, 0), SIZE_ORDER.length - 1)];
}

const PICTURE_SIZES: Record<TextSize, number> = { s: 56, m: 96, l: 150, xl: 230 };
export const MAX_PICTURE_STICKERS = 24;
/** Small enough to live in a board item and in settings without weighing either down. */
export const MAX_STICKER_PICTURE_CHARS = 200_000;

/**
 * A sticker's picture is only ever a PNG or SVG data URL, shown through an <img>. Anything else (a web
 * address, another type) is refused, as board items can arrive from the clipboard.
 */
export const isStickerPicture = (src: unknown): src is string =>
  typeof src === "string" && src.length <= MAX_STICKER_PICTURE_CHARS && /^data:image\/(png;base64,[A-Za-z0-9+/=]+$|svg\+xml;charset=utf-8,)/.test(src);

export interface PictureSticker {
  id: string;
  name: string;
  src: string;
  /** Width over height. */
  ratio: number;
}

const cleanRatio = (ratio: unknown) => (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? Math.min(8, Math.max(0.125, ratio)) : 1);

/** The saved picture stickers, dropping anything that isn't one. */
export function parsePictureStickers(saved: string): PictureSticker[] {
  try {
    const list: unknown = JSON.parse(saved || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => !!s && typeof s.id === "string" && typeof s.name === "string" && isStickerPicture(s.src))
      .map((s) => ({ id: s.id, name: s.name.slice(0, 60), src: s.src, ratio: cleanRatio(s.ratio) }))
      .slice(0, MAX_PICTURE_STICKERS);
  } catch {
    return [];
  }
}

/** A sticker sized to fit its words, as there's no line wrapping on one. A picture keeps its own shape. */
export function stickerBox(text: string, data: Pick<ItemData, "emoji" | "textSize" | "picture" | "ratio">): { w: number; h: number } {
  if (data.picture) {
    const longest = PICTURE_SIZES[data.textSize ?? "m"];
    const ratio = cleanRatio(data.ratio);
    return ratio >= 1 ? { w: longest, h: Math.round(longest / ratio) } : { w: Math.round(longest * ratio), h: longest };
  }
  const size = (data.emoji ? SIZES.emoji : SIZES.sticker)[data.textSize ?? "m"];
  if (data.emoji) return { w: Math.round(size * 1.4), h: Math.round(size * 1.4) };
  return { w: Math.max(60, Math.round([...text].length * size * 0.62 + 28)), h: Math.round(size * 2.8) };
}

export const GRID = 26;
export const snapTo = (value: number, grid = GRID) => Math.round(value / grid) * grid;

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom" | "spread-x" | "spread-y";
type Box = Pick<BoardItem, "id" | "x" | "y" | "w" | "h">;

/** New positions for lining items up. Spreading leaves equal gaps, keeping the two outermost in place. */
export function alignItems(items: Box[], mode: AlignMode): { id: string; x: number; y: number }[] {
  if (items.length < 2) return items.map(({ id, x, y }) => ({ id, x, y }));
  const left = Math.min(...items.map((i) => i.x));
  const right = Math.max(...items.map((i) => i.x + i.w));
  const top = Math.min(...items.map((i) => i.y));
  const bottom = Math.max(...items.map((i) => i.y + i.h));
  if (mode === "spread-x" || mode === "spread-y") {
    const across = mode === "spread-x";
    const sorted = [...items].sort((a, b) => (across ? a.x - b.x : a.y - b.y));
    const total = sorted.reduce((sum, i) => sum + (across ? i.w : i.h), 0);
    const gap = ((across ? right - left : bottom - top) - total) / (sorted.length - 1);
    let at = across ? left : top;
    return sorted.map((i) => {
      const placed = { id: i.id, x: across ? at : i.x, y: across ? i.y : at };
      at += (across ? i.w : i.h) + gap;
      return placed;
    });
  }
  return items.map((i) => ({
    id: i.id,
    x: mode === "left" ? left : mode === "center" ? (left + right - i.w) / 2 : mode === "right" ? right - i.w : i.x,
    y: mode === "top" ? top : mode === "middle" ? (top + bottom - i.h) / 2 : mode === "bottom" ? bottom - i.h : i.y,
  }));
}

export const CLIPBOARD_TYPE = "application/x-daiku-items";
const COPYABLE = ["sticky", "text", "sticker", "image", "palette", "section", "stroke", "shape"];

/** Items from the clipboard, which anything could have written to, so only well-formed ones get through. */
export function parseClipboardItems(raw: string): BoardItem[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (i): i is BoardItem =>
        !!i &&
        COPYABLE.includes(i.kind) &&
        [i.x, i.y, i.w, i.h].every((n) => typeof n === "number" && Number.isFinite(n)) &&
        typeof i.data === "object" &&
        i.data !== null,
    );
  } catch {
    return [];
  }
}

/** The look carried over to the next new sticky, so you don't have to pick it each time. */
export function parseStickyStyle(saved: string): Pick<ItemData, "color" | "font" | "textSize"> {
  try {
    const s = JSON.parse(saved || "{}");
    return {
      ...(typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color) ? { color: s.color } : {}),
      ...(typeof s.font === "string" && s.font ? { font: s.font } : {}),
      ...(SIZE_ORDER.includes(s.textSize) ? { textSize: s.textSize as TextSize } : {}),
    };
  } catch {
    return {};
  }
}

export const STICKER_LABELS = ["Love this", "Verified", "Needs test", "Blocked", "Cite this", "Too busy"];
export const STICKER_EMOJI = ["⭐", "❤️", "🔥", "✅", "❌", "⚠️", "❓", "💡", "📌", "👍", "👎", "🎯", "🧪", "📐", "🛠️", "🚧", "✂️", "📎", "🎨", "🌱", "⏳", "💰", "🔒", "🏆"];
