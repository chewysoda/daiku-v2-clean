/** Drafting's text rules, kept apart so credit handling can be tested. */
import { Asset } from "../data/types";
import { isCredited } from "./search";

const NO_SOURCE = "[no source yet]";

/** A source's credit, or a marker that stays visible in the draft until someone finds one. */
export function citeLine(source: Asset | undefined, page?: number): string {
  if (!source) return `${NO_SOURCE}${page ? `, p. ${page}` : ""}`;
  const credit = isCredited(source) ? source.credit : NO_SOURCE;
  return `${credit}, ${source.title}${page ? `, p. ${page}` : ""}`;
}

const flat = (text: string) => text.trim().replace(/\r?\n/g, "\n> ");

export const quoteBlock = (text: string, source: Asset | undefined, page?: number) => `> ${flat(text)}\n>\n> — ${citeLine(source, page)}`;

/** A title can't hold what would end the embed early. */
const embedName = (title: string) => title.replace(/[[\]|\n]/g, " ").trim();

export const figureEmbed = (asset: Asset) => `![[${embedName(asset.title)}]]\n\n*Figure: ${citeLine(asset)}*`;

export type DraftPart = { kind: "text"; text: string } | { kind: "figure"; title: string };

export function splitFigures(body: string): DraftPart[] {
  const parts: DraftPart[] = [];
  let at = 0;
  for (const m of body.matchAll(/!\[\[([^\]\n]+)\]\]/g)) {
    if (m.index > at) parts.push({ kind: "text", text: body.slice(at, m.index) });
    parts.push({ kind: "figure", title: m[1].trim() });
    at = m.index + m[0].length;
  }
  if (at < body.length) parts.push({ kind: "text", text: body.slice(at) });
  return parts;
}

export const wordsIn = (body: string) => body.trim().split(/\s+/).filter(Boolean).length;
