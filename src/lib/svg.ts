/**
 * Reading SVG files. They're only ever shown through an <img>, where browsers run no scripts and
 * load nothing external, and never placed into the page as markup. Keep it that way: an SVG from
 * the web can contain script.
 */
export function isSvgMarkup(text: string): boolean {
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
}

export const isVectorPath = (path: string | null | undefined) => !!path && /(\.svg($|[?#])|#svg$)/i.test(path);

const UNITS: Record<string, number> = { "": 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

/** A length in pixels. A percentage has no size of its own, so it counts as none. */
function length(value: string | undefined): number {
  const m = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(value ?? "");
  if (!m) return 0;
  const n = Number(m[1]) * (UNITS[m[2].toLowerCase()] ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
const decode = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export interface SvgInfo {
  width: number;
  height: number;
  title: string;
  creator: string;
}

/** What an SVG says about itself. With no size given, its viewBox says, and failing that the web's default. */
export function svgInfo(text: string): SvgInfo {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const box = (attr(tag, "viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const boxW = box.length === 4 && box[2] > 0 ? box[2] : 0;
  const boxH = box.length === 4 && box[3] > 0 ? box[3] : 0;
  let width = length(attr(tag, "width"));
  let height = length(attr(tag, "height"));
  if (!width && !height) {
    width = boxW;
    height = boxH;
  } else if (!width) {
    width = boxH ? (height * boxW) / boxH : height;
  } else if (!height) {
    height = boxW ? (width * boxH) / boxW : width;
  }
  // Inkscape and others record an author in a metadata block. Only the title and creator are read.
  const creator = /<dc:creator\b[\s\S]*?<dc:title>([^<]*)<\/dc:title>/i.exec(text)?.[1] ?? /<dc:creator>([^<]+)<\/dc:creator>/i.exec(text)?.[1] ?? "";
  const ownTitle = /<dc:title>([^<]+)<\/dc:title>/i.exec(text.replace(/<dc:creator\b[\s\S]*?<\/dc:creator>/i, ""))?.[1] ?? /<title\b[^>]*>([^<]+)<\/title>/i.exec(text)?.[1] ?? "";
  return { width: width || 300, height: height || 150, title: decode(ownTitle).slice(0, 200), creator: decode(creator).slice(0, 200) };
}

/** A size for the board that keeps its shape: tiny icons are enlarged to be seen, and huge drawings brought down. */
export function boardSize(width: number, height: number, smallest = 120, largest = 360): { w: number; h: number } {
  const longest = Math.max(width, height, 1);
  const scale = longest < smallest ? smallest / longest : longest > largest ? largest / longest : 1;
  return { w: Math.max(1, width * scale), h: Math.max(1, height * scale) };
}
