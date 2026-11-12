import { Asset, AssetKind } from "../data/types";
import { deltaE, hexToLab } from "./color";

/** Lower-cased words. "warm oak, soft curves" -> warm, oak, soft, curves */
export const tokens = (q: string) => q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Builds an FTS5 MATCH expression. Each word is quoted, so user input can't inject FTS syntax
 * like NEAR or column filters, and prefix-matched, so "curv" finds "curves".
 */
export function ftsQuery(q: string): string {
  return tokens(q)
    .map((t) => `"${t}"*`)
    .join(" OR ");
}

/** How close an asset's palette gets to a colour; lower is closer. Infinity = no palette. */
export function colourDistance(asset: Pick<Asset, "palette_lab">, hex: string): number {
  const target = hexToLab(hex);
  if (!target || !asset.palette_lab.length) return Infinity;
  let best = Infinity;
  for (const c of asset.palette_lab) {
    // A colour covering a sliver of the image counts for less than a dominant one.
    const penalty = c.weight < 0.1 ? 8 : 0;
    best = Math.min(best, deltaE(c, target) + penalty);
  }
  return best;
}

export const COLOUR_MATCH_LIMIT = 16;

export interface LibraryFilter {
  ids: string[] | null;
  kind: AssetKind | "all";
  colour: string | null;
  humanOnly: boolean;
  creditedOnly: boolean;
}

export const isCredited = (a: Pick<Asset, "credit">) => Boolean(a.credit && a.credit.trim());

/** Filters and orders the library. `ids` carries text-search order when a query is active. */
export function filterAssets(assets: Asset[], f: LibraryFilter): Asset[] {
  let out = assets.filter(
    (a) =>
      (f.kind === "all" || a.kind === f.kind) &&
      (!f.humanOnly || a.provenance === "human") &&
      (!f.creditedOnly || isCredited(a)),
  );
  if (f.ids) {
    const rank = new Map(f.ids.map((id, i) => [id, i]));
    out = out.filter((a) => rank.has(a.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  } else {
    out = [...out].sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  }
  if (f.colour) {
    const colour = f.colour;
    const scored = out
      .map((a) => ({ a, d: colourDistance(a, colour) }))
      .filter((r) => r.d <= COLOUR_MATCH_LIMIT);
    // A text query keeps its order; a colour-only search sorts by closeness.
    if (!f.ids) scored.sort((x, y) => x.d - y.d);
    out = scored.map((r) => r.a);
  }
  return out;
}

export function creditLine(a: Pick<Asset, "title" | "credit" | "via" | "source_url">): string {
  const parts = [a.title, a.credit ? `© ${a.credit}` : "no source yet"];
  if (a.via) parts.push(`via ${a.via}`);
  if (a.source_url) parts.push(a.source_url);
  return parts.join(" · ");
}
