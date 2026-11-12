// Checks text contrast on every surface and glass level, in light and dark. Run with: npm run contrast
// Glass is translucent, so each level is composited over the darkest and lightest thing likely to sit behind it:
// the theme's own background and canvas, and the kept backdrops after the app's dim layer (70% bg).
import { readFileSync } from "node:fs";

const t = JSON.parse(readFileSync("design/design/tokens.json", "utf8"));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return [...hex(s), 1];
  const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
  return [+r, +g, +b, +a];
};
const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Dominant colours of the kept backdrops (graphite, nocturne, paper, blueprint), before the dim layer.
const BACKDROPS = ["#2B2D31", "#151A2B", "#EDE7DA", "#1F3A5F"];
const TEXT = ["text", "textSecondary", "textMuted", "caption"];
const STATE = ["sourcedText", "assumptionText", "conflictText"];
let failed = 0;
const row = (label, fg, bg, min = 4.5) => {
  const r = ratio(fg, bg);
  if (r < min) failed++;
  console.log(`${r >= min ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${label}`);
};

for (const mode of ["light", "dark"]) {
  const c = { ...t.color.light, ...t.color[mode] };
  const g = t.glass[mode];
  console.log(`\n${mode}`);
  for (const surface of ["bg", "surface", "surfaceSunk", "canvas"]) for (const k of [...TEXT, ...(surface === "surface" ? STATE : [])]) row(`${k} on ${surface}`, hex(c[k]), hex(c[surface]));
  for (const tint of ["Tint"]) for (const k of ["sourced", "assumption", "conflict"]) row(`${k}Text on ${k}${tint}`, hex(c[`${k}Text`]), hex(c[`${k}${tint}`]));
  row("onAccent on accent (buttons)", hex(c.onAccent), hex(c.accent));
  const behind = [hex(c.bg), hex(c.canvas), ...BACKDROPS.map((b) => over([...hex(c.bg), 0.7], hex(b)))];
  for (const level of ["g1", "g2", "g3"]) {
    const worst = (k) => Math.min(...behind.map((b) => ratio(hex(c[k]), over(rgba(g[level]), b))));
    for (const k of TEXT) {
      const r = worst(k);
      if (r < 4.5) failed++;
      console.log(`${r >= 4.5 ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${k} on glass ${level.slice(1)} (worst backdrop)`);
    }
  }
}
console.log(failed ? `\n${failed} below 4.5:1` : "\nAll pass 4.5:1");
process.exit(failed ? 1 : 0);
