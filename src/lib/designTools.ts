/**
 * Tools designers reach for: smart guides while moving things, colour in every format, contrast
 * grades, and palettes as code. Pure functions, so the canvas, the palette card and Handoff share them.
 */
import { converter, formatHex, formatRgb, parse, wcagContrast } from "culori";

// ── Smart guides ──────────────────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A guide line to draw, in board units: vertical at x = `at`, or horizontal at y = `at`. */
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const edges = (b: Box, axis: "x" | "y") => (axis === "x" ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h]);

/**
 * Nudges a moving box onto the nearest edge or centre of the boxes around it, when one is within
 * `threshold`, and says which guides to draw. Each axis snaps on its own.
 */
export function smartSnap(moving: Box, others: Box[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const snapAxis = (axis: "x" | "y") => {
    let best: { delta: number; at: number } | null = null;
    const mine = edges(moving, axis);
    for (const o of others) {
      for (const theirs of edges(o, axis)) {
        for (const m of mine) {
          const delta = theirs - m;
          if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: theirs };
        }
      }
    }
    return best;
  };
  const bx = snapAxis("x");
  const by = snapAxis("y");
  const dx = bx?.delta ?? 0;
  const dy = by?.delta ?? 0;
  const placed = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  // Each guide runs across every box that lines up on it, so you can see what it matched.
  const line = (axis: "x" | "y", at: number) => {
    const touching = [placed, ...others].filter((b) => edges(b, axis).some((v) => Math.abs(v - at) < 0.5));
    const cross = (b: Box) => (axis === "x" ? [b.y, b.y + b.h] : [b.x, b.x + b.w]);
    const from = Math.min(...touching.flatMap(cross)) - 12;
    const to = Math.max(...touching.flatMap(cross)) + 12;
    guides.push({ axis, at, from, to });
  };
  if (bx) line("x", bx.at);
  if (by) line("y", by.at);
  return { dx, dy, guides };
}

// ── Colour ────────────────────────────────────────────────────────────────────────────────────

const toOklch = converter("oklch");
const toHsl = converter("hsl");
const round = (n: number, places = 3) => Number(n.toFixed(places));

export interface ColourFormats {
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
}

/** One colour written every way a designer or developer might want it. Null if it isn't a colour. */
export function colourFormats(input: string): ColourFormats | null {
  const c = parse(input);
  if (!c) return null;
  const o = toOklch(c);
  const h = toHsl(c);
  return {
    hex: formatHex(c).toUpperCase(),
    rgb: formatRgb(c),
    hsl: `hsl(${Math.round(h.h ?? 0)} ${Math.round((h.s ?? 0) * 100)}% ${Math.round((h.l ?? 0) * 100)}%)`,
    oklch: `oklch(${round((o.l ?? 0) * 100, 1)}% ${round(o.c ?? 0)} ${round(o.h ?? 0, 1)})`,
  };
}

export type ContrastGrade = "AAA" | "AA" | "AA large" | "Fail";

/** WCAG 2 contrast ratio between two colours, to two places. */
export const contrastRatio = (a: string, b: string) => round(wcagContrast(a, b), 2);

/** What the ratio is good for: AAA and AA for body text, AA large for big text and icons only. */
export function contrastGrade(ratio: number): ContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "Fail";
}

export interface ContrastPair {
  text: string;
  background: string;
  ratio: number;
  grade: ContrastGrade;
}

/** Every pair in a palette, best first. A pair is listed once, darker colour as the text. */
export function contrastPairs(colours: string[]): ContrastPair[] {
  const lum = (hex: string) => toOklch(parse(hex) ?? "#000")?.l ?? 0;
  const out: ContrastPair[] = [];
  for (let i = 0; i < colours.length; i++) {
    for (let j = i + 1; j < colours.length; j++) {
      const [text, background] = lum(colours[i]) <= lum(colours[j]) ? [colours[i], colours[j]] : [colours[j], colours[i]];
      const ratio = contrastRatio(text, background);
      out.push({ text, background, ratio, grade: contrastGrade(ratio) });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

// ── Palettes as code ──────────────────────────────────────────────────────────────────────────

export interface ColourRoles {
  background: string;
  text: string;
  accent: string;
}

/** A starting guess at roles: the lightest as background, the darkest as text, the most colourful as accent. */
export function colourRoles(colours: string[]): ColourRoles | null {
  const valid = colours.filter((c) => parse(c));
  if (valid.length < 2) return null;
  const o = valid.map((hex) => ({ hex: formatHex(parse(hex)!).toUpperCase(), ...toOklch(parse(hex)!) }));
  const byL = [...o].sort((a, b) => (a.l ?? 0) - (b.l ?? 0));
  const text = byL[0].hex;
  const background = byL[byL.length - 1].hex;
  const rest = o.filter((c) => c.hex !== text && c.hex !== background);
  const accent = (rest.length ? rest : o).sort((a, b) => (b.c ?? 0) - (a.c ?? 0))[0].hex;
  return { background, text, accent };
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "palette";

export type PaletteFormat = "css" | "tailwind" | "tokens";

/** A palette as CSS custom properties, a Tailwind theme extension, or W3C design tokens (JSON). */
export function paletteAsCode(name: string, colours: string[], format: PaletteFormat): string {
  const key = slug(name);
  const hexes = colours.map((c) => colourFormats(c)?.hex).filter((c): c is string => !!c);
  const roles = colourRoles(hexes);
  const named: [string, string][] = [...hexes.map((h, i): [string, string] => [`${key}-${i + 1}`, h]), ...(roles ? (Object.entries(roles).map(([role, h]) => [role, h]) as [string, string][]) : [])];
  if (format === "css") return `:root {\n${named.map(([n, h]) => `  --color-${n}: ${h};`).join("\n")}\n}\n`;
  if (format === "tailwind")
    return `// tailwind.config.js, inside theme.extend\ncolors: {\n${named.map(([n, h]) => `  "${n}": "${h}",`).join("\n")}\n}\n`;
  const tokens: Record<string, { $type: string; $value: string }> = {};
  for (const [n, h] of named) tokens[n] = { $type: "color", $value: h };
  return `${JSON.stringify({ color: tokens }, null, 2)}\n`;
}

/** Palettes as design tokens for DESIGN.md: variables to paste, roles, and which pairs are safe for text. */
export function paletteTokensMarkdown(palettes: { name: string; colours: string[] }[]): string {
  const usable = palettes.filter((p) => p.colours.length >= 2);
  if (!usable.length) return "";
  return `## Colour tokens

Use these exact values. Roles are a starting guess (lightest as background, darkest as text, most colourful as
accent); keep them unless the design direction says otherwise. Only use a text and background pair rated AA or AAA
for body text.

${usable
  .map((p) => {
    const pairs = contrastPairs(p.colours);
    const good = pairs.filter((x) => x.grade === "AAA" || x.grade === "AA");
    const large = pairs.filter((x) => x.grade === "AA large");
    return `### ${p.name}

\`\`\`css
${paletteAsCode(p.name, p.colours, "css").trim()}
\`\`\`

${good.length ? `Safe for body text: ${good.map((x) => `${x.text} on ${x.background} (${x.ratio}:1, ${x.grade})`).join("; ")}.` : "No pair is dark enough on light for body text; add a darker or lighter colour for text."}${large.length ? `\nLarge text and icons only: ${large.map((x) => `${x.text} on ${x.background} (${x.ratio}:1)`).join("; ")}.` : ""}
`;
  })
  .join("\n")}`;
}
