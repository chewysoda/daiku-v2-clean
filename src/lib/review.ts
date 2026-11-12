/**
 * Checking what came back against what was asked for. Marks are the person's judgment, never inferred (hints from
 * suggestMark() are only shown, for the person to take or leave):
 * a criterion stays unchecked until they mark it. Versions keep the brief as it was, and why it changed.
 */
import { AppSpec, EMPTY_SPEC, lines, musts, parseSpec, rulesMarkdown } from "./appSpec";

export type Mark = "met" | "partly" | "unmet";
export const MARKS: Mark[] = ["met", "partly", "unmet"];

export interface SpecVersion {
  id: string;
  at: string;
  /** Why the direction changed, in the person's words. */
  why: string;
  spec: AppSpec;
}

export interface Review {
  /** Criterion text to its mark. Keyed by text, so rewording one starts it fresh. */
  marks: Record<string, Mark>;
  notes: Record<string, string>;
  /** What the AI handed back, pasted in. */
  output: string;
  versions: SpecVersion[];
}

export const EMPTY_REVIEW: Review = { marks: {}, notes: {}, output: "", versions: [] };

export function parseReview(json: string): Review {
  try {
    const r = JSON.parse(json) as Partial<Review> | null;
    if (!r || typeof r !== "object") return EMPTY_REVIEW;
    const marks = r.marks && typeof r.marks === "object" ? Object.fromEntries(Object.entries(r.marks).filter(([, m]) => MARKS.includes(m))) : {};
    return {
      marks,
      notes: r.notes && typeof r.notes === "object" ? r.notes : {},
      output: typeof r.output === "string" ? r.output : "",
      versions: Array.isArray(r.versions) ? r.versions.map((v) => ({ id: String(v.id), at: String(v.at), why: String(v.why ?? ""), spec: parseSpec(v.spec) })) : [],
    };
  } catch {
    return EMPTY_REVIEW;
  }
}

export interface Criterion {
  text: string;
  /** Where it comes from in the brief. */
  from: "must" | "done";
  /** How the person said they'd check a must-have, if they did. */
  check?: string;
}

/** What to check: each must-have, and each line of "done means". Duplicates count once. */
export function criteria(spec: AppSpec): Criterion[] {
  const seen = new Set<string>();
  const out: Criterion[] = [];
  const all: Criterion[] = [...musts(spec).map((m) => ({ text: m.text, from: "must" as const, ...(m.check ? { check: m.check } : {}) })), ...lines(spec.done).map((text) => ({ text, from: "done" as const }))];
  for (const c of all) {
    const key = c.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function tally(review: Review, list: Criterion[]) {
  const count = (m: Mark) => list.filter((c) => review.marks[c.text] === m).length;
  return { met: count("met"), partly: count("partly"), unmet: count("unmet"), open: list.filter((c) => !review.marks[c.text]).length };
}

export const saveVersion = (review: Review, spec: AppSpec, why: string, id: string, at: string): Review => ({
  ...review,
  versions: [...review.versions, { id, at, why: why.trim(), spec }],
});

export interface FieldChange {
  field: keyof AppSpec;
  before: string;
  after: string;
}

/** Which parts of the brief differ between two versions. */
export function compareSpecs(before: AppSpec, after: AppSpec): FieldChange[] {
  return (Object.keys(EMPTY_SPEC) as (keyof AppSpec)[]).filter((k) => before[k].trim() !== after[k].trim()).map((field) => ({ field, before: before[field], after: after[field] }));
}

/** Line by line, for one field: what went and what came. */
export function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = lines(before);
  const b = lines(after);
  const inA = new Set(a.map((l) => l.toLowerCase()));
  const inB = new Set(b.map((l) => l.toLowerCase()));
  return { removed: a.filter((l) => !inB.has(l.toLowerCase())), added: b.filter((l) => !inA.has(l.toLowerCase())) };
}

/**
 * The next round: what's still short of the brief, with the person's notes, and how the brief moved since
 * the last saved version. Met criteria are listed so they aren't undone.
 */
export function revisionMarkdown(spec: AppSpec, review: Review, rules = ""): string {
  const list = criteria(spec);
  const by = (m: Mark | null) => list.filter((c) => (m ? review.marks[c.text] === m : !review.marks[c.text]));
  const item = (c: Criterion) => `- ${c.text}${c.check ? `\n  - Check: ${c.check}` : ""}${review.notes[c.text]?.trim() ? `\n  - ${review.notes[c.text].trim()}` : ""}`;
  const block = (title: string, items: Criterion[]) => (items.length ? `## ${title}\n\n${items.map(item).join("\n")}\n\n` : "");
  const last = review.versions[review.versions.length - 1];
  const changes = last ? compareSpecs(last.spec, spec) : [];
  const moved = changes.length
    ? `## What changed in the brief since ${last!.at.slice(0, 10)}\n\n${last!.why ? `Why: ${last!.why}\n\n` : ""}${changes
        .map((c) => {
          const d = lineDiff(c.before, c.after);
          return `- **${c.field}**${d.added.length ? `\n${d.added.map((l) => `  - added: ${l}`).join("\n")}` : ""}${d.removed.length ? `\n${d.removed.map((l) => `  - removed: ${l}`).join("\n")}` : ""}`;
        })
        .join("\n")}\n\n`
    : "";
  return `# Revision for ${spec.name.trim() || "the app"}

Work from the previous result. Fix what's below and leave what already works alone.

${rulesMarkdown(rules, "## Rules that still apply")}${block("Not met yet", by("unmet"))}${block("Partly met", by("partly"))}${block("Not checked yet", by(null))}${block("Already met (keep these working)", by("met"))}${moved}Report each item as fixed, still open or not checked, with what you did to find out. Where an item has a check, run it and show the result.
`;
}

/** A hint for one criterion, read from the pasted answer. Only ever shown; it never becomes a mark on its own. */
export interface Suggestion {
  mark: Mark;
  /** Share of the criterion's key words the answer uses, 0–1. */
  coverage: number;
  /** The sentence that matched best, when one did. */
  quote?: string;
  /** Why this mark: in plain words, for the hint's caption. */
  why: string;
}

const STOP = new Set(
  "the a an and or but of to in on for with by at from as is are be been was were it its this that these those it's can should must will would could has have had do does not no yes all any each every into onto than then so if when while about also just only very more most less some such via per use uses using user users app".split(" "),
);
/** Words that say a thing was left out, put off or not finished. */
const DEFERRED = /\b(not|no|never|won'?t|didn'?t|doesn'?t|isn'?t|aren'?t|skip(ped)?|later|todo|tbd|out of scope|left out|stub(bed)?|placeholder|future|v2|not yet)\b/i;

/** Lower-case word stems, so "packs" and "packing" meet "pack". Numbers count; tiny filler words don't. */
export function keywords(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9'+.-]*[a-z0-9+]|[a-z0-9]/g) ?? []) {
    const w = raw.replace(/'s$/, "");
    if (STOP.has(w) || (w.length < 3 && !/\d/.test(w))) continue;
    out.add(stem(w));
  }
  return [...out];
}

function stem(w: string): string {
  if (/\d/.test(w) || w.length <= 4) return w;
  for (const end of ["ing", "ed", "es", "s"]) if (w.endsWith(end) && w.length - end.length >= 4) return w.slice(0, -end.length);
  return w;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s>*#\-–•\d.)]+/, "").trim())
    .filter((s) => s.length > 2);
}

/**
 * How well the pasted answer seems to cover one criterion, by the words they share. A sentence that uses most
 * of the criterion's words (all of them, for a short one) reads as met, unless it says the thing was left out or put off; words spread across
 * the answer read as partly; few shared words read as not mentioned. A rough first read, for the person to confirm.
 */
export function suggestMark(criterion: string, answer: string): Suggestion | null {
  const want = keywords(criterion);
  if (!want.length || !answer.trim()) return null;
  const share = (have: Set<string>) => want.filter((w) => have.has(w)).length / want.length;
  const whole = share(new Set(keywords(answer)));
  let best = { coverage: 0, text: "" };
  for (const s of sentences(answer)) {
    const c = share(new Set(keywords(s)));
    if (c > best.coverage) best = { coverage: c, text: s };
  }
  const quote = best.text.length > 160 ? `${best.text.slice(0, 157)}…` : best.text;
  // Short criteria need every word: one missing word ("PDF" in "export as PDF") is often the point.
  const strong = want.length <= 4 ? best.coverage === 1 : best.coverage >= 0.8;
  if (strong && DEFERRED.test(best.text)) return { mark: "partly", coverage: best.coverage, quote, why: "Mentioned, but as left out or later" };
  if (strong) return { mark: "met", coverage: best.coverage, quote, why: "The answer covers this" };
  if (whole >= 0.5) return { mark: "partly", coverage: whole, ...(best.text ? { quote } : {}), why: "Some of it is mentioned" };
  return { mark: "unmet", coverage: whole, why: "Not mentioned in the answer" };
}
