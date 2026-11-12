/** Pure logic behind Claims, Notes, Interviews, Progress and exports. */
import { Asset, CheckCounts, EvidenceLink, GateRule } from "../data/types";

export type ClaimStrength = "strong" | "medium" | "mixed" | "assumption";

/**
 * strong = 3+ for, none against; medium = 1-2 for; mixed = any against; assumption = no sources.
 * Counting isn't weighing: once sources are rated, three weak ones don't make a strong claim.
 */
export function claimStrength(forCount: number, against: number, ratings: (string | null | undefined)[] = []): ClaimStrength {
  if (against > 0) return "mixed";
  const rated = ratings.filter(Boolean);
  if (forCount >= 3 && rated.length && !rated.includes("strong")) return "medium";
  if (forCount >= 3) return "strong";
  if (forCount >= 1) return "medium";
  return "assumption";
}

export const stanceOf = (l: Pick<EvidenceLink, "stance">) => (l.stance === "against" ? "against" : "for");

export interface WikiLink {
  target: string;
  /** From `supports:: [[X]]`, or null for a plain link. */
  relation: string | null;
}

export function parseWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(/(?:([a-z][a-z-]*)::\s*)?\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/gi)) {
    const target = m[2].trim();
    const key = `${m[1] ?? ""}|${target.toLowerCase()}`;
    if (target && !seen.has(key)) {
      seen.add(key);
      out.push({ target, relation: m[1]?.toLowerCase() ?? null });
    }
  }
  return out;
}

/** Lines like "P2: Stacks chairs after events". Lines without a code attach to the previous one. */
export function parseInterviewNotes(text: string): { code: string; text: string }[] {
  const out: { code: string; text: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(P\d+)\s*[:\-–]\s*(.+)$/i.exec(line);
    if (m) out.push({ code: m[1].toUpperCase(), text: m[2].trim() });
    else if (out.length) out[out.length - 1].text += ` ${line}`;
  }
  return out;
}

export const GATES: Record<GateRule, string> = {
  no_guessed_scores: "No guessed scores left",
  no_failed_must: "No must-have failing",
  all_must_verified: "All must-haves verified",
  all_claims_evidenced: "Every claim has evidence",
  decision_logged: "A decision is logged with its reason",
};

/** Gates are rules the app checks against the data, never a box someone ticks. */
export function gatePasses(gate: GateRule, c: CheckCounts): boolean {
  switch (gate) {
    case "no_guessed_scores":
      return c.scores_guessed === 0 && c.scores_backed > 0;
    case "no_failed_must":
      return c.must_failed === 0;
    case "all_must_verified":
      return c.must_open === 0 && c.must_failed === 0 && c.must_passed > 0;
    case "all_claims_evidenced":
      return c.claims_without === 0 && c.claims_with > 0;
    case "decision_logged":
      return c.decisions_logged > 0;
  }
}

/** Below this, a share is shown as "too little data" rather than as 0% or 100%. */
export const MIN_CELL_COUNT = 3;

export function shareCell(hit: number, total: number): { share: number | null; label: string } {
  if (total < MIN_CELL_COUNT) return { share: null, label: `${hit}/${total}, too little data` };
  return { share: hit / total, label: `${hit}/${total} (${Math.round((hit / total) * 100)}%)` };
}

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/** Safe on Windows, and not a reserved device name. */
export function safeFileName(name: string, fallback = "Untitled"): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f[\]#^]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/, "").trim().slice(0, 100);
  if (!cleaned) return fallback;
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) ? `${cleaned}_` : cleaned;
}

export function frontMatter(props: Record<string, string | number | boolean | null>): string {
  const value = (v: string | number | boolean | null) => (typeof v === "string" ? JSON.stringify(v) : String(v));
  return `---\n${Object.entries(props).map(([k, v]) => `${k}: ${value(v)}`).join("\n")}\n---\n`;
}

const bibEscape = (s: string) => s.replace(/[\\{}&%$#_^~]/g, (c) => `\\${c}`);

export function bibEntry(asset: Pick<Asset, "id" | "title" | "credit" | "source_url" | "captured_at" | "kind">): string {
  const key = `${asset.title.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24) || "item"}${asset.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6)}`;
  const fields = [
    `  title = {${bibEscape(asset.title)}}`,
    asset.credit ? `  author = {${bibEscape(asset.credit)}}` : null,
    asset.source_url ? `  url = {${asset.source_url.replace(/[{}]/g, "")}}` : null,
    `  note = {Saved in Daiku ${asset.captured_at.slice(0, 10)}}`,
  ].filter(Boolean);
  return `@${asset.kind === "pdf" ? "article" : "misc"}{${key},\n${fields.join(",\n")}\n}`;
}
