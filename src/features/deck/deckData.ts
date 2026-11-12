import { selectRecords, useStore } from "../../data/store";
import { Asset, BoardItem, DeckData, Slide, uid } from "../../data/types";
import { meets, requirementValue, targetText } from "../../lib/engineering";
import { weightedTotals } from "../../lib/scoring";
import { isCredited } from "../../lib/search";
import { labDataFor } from "../progress/Progress";

type S = ReturnType<typeof useStore.getState>;

const inSection = (i: BoardItem, s: BoardItem) => i.board_id === s.board_id && i.id !== s.id && i.x + i.w / 2 >= s.x && i.x + i.w / 2 <= s.x + s.w && i.y + i.h / 2 >= s.y && i.y + i.h / 2 <= s.y + s.h;

export function sectionContent(s: S, sectionId: string | null) {
  const section = s.board_items.find((i) => i.id === sectionId);
  if (!section) return { images: [] as Asset[], texts: [] as string[], missing: true };
  const items = s.board_items.filter((i) => inSection(i, section));
  return {
    missing: false,
    images: items
      .filter((i) => i.kind === "image")
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .map((i) => s.assets.find((a) => a.id === i.asset_id))
      .filter((a): a is Asset => Boolean(a)),
    texts: items.filter((i) => (i.kind === "sticky" || i.kind === "text") && i.data.text).map((i) => i.data.text!),
  };
}

export interface TableData {
  header: string[];
  rows: { cells: string[]; guess: boolean[] }[];
  footer: string[];
}

export function matrixTable(s: S, decisionId: string | null): TableData | null {
  if (!decisionId) return null;
  const concepts = s.concepts.filter((c) => c.decision_id === decisionId).sort((a, b) => a.sort - b.sort);
  const criteria = s.criteria.filter((c) => c.decision_id === decisionId).sort((a, b) => a.sort - b.sort);
  if (!concepts.length) return null;
  const totals = weightedTotals(concepts.map((c) => c.id), criteria, s.scores);
  return {
    header: ["Criterion", "Weight", ...concepts.map((c) => `${c.label} · ${c.name}`)],
    rows: criteria.map((q) => {
      const scores = concepts.map((c) => s.scores.find((x) => x.concept_id === c.id && x.criterion_id === q.id));
      return {
        // Guesses are marked in text, so the mark survives printing and PowerPoint.
        cells: [q.name, `${Math.round(q.weight * 100)}%`, ...scores.map((x) => (x ? `${x.value}${x.is_assumption ? " (guess)" : ""}` : "–"))],
        guess: [false, false, ...scores.map((x) => Boolean(x?.is_assumption))],
      };
    }),
    footer: ["Weighted total", "", ...concepts.map((c) => totals[c.id].toFixed(2))],
  };
}

export function requirementsTable(s: S, decisionId: string | null): TableData | null {
  if (!decisionId) return null;
  const concepts = s.concepts.filter((c) => c.decision_id === decisionId).sort((a, b) => a.sort - b.sort);
  const reqs = selectRecords(s.records, "requirement", decisionId).sort((a, b) => a.data.code.localeCompare(b.data.code, undefined, { numeric: true }));
  if (!reqs.length) return null;
  const lab = labDataFor(s.records, decisionId);
  return {
    header: ["ID", "Requirement", "Target", ...concepts.map((c) => c.label)],
    rows: reqs.map((r) => ({
      cells: [
        r.data.code,
        r.data.text,
        targetText(r.data),
        ...concepts.map((c) => {
          const verdict = meets(r.data, requirementValue(r.data, c.id, lab).value);
          return verdict === "pass" ? "pass" : verdict === "fail" ? "FAIL" : "open";
        }),
      ],
      guess: [],
    })),
    footer: [],
  };
}

/** What the slide's linked content looks like now. A change flags the slide as out of date. */
export function fingerprint(s: S, slide: Pick<Slide, "kind" | "ref">): string {
  if (slide.kind === "section") {
    const c = sectionContent(s, slide.ref);
    return JSON.stringify([c.images.map((a) => [a.id, a.credit]), c.texts]);
  }
  if (slide.kind === "matrix") return JSON.stringify(matrixTable(s, slide.ref));
  if (slide.kind === "requirements") return JSON.stringify(requirementsTable(s, slide.ref));
  return "";
}

const slide = (s: S, fields: Pick<Slide, "kind" | "title"> & Partial<Slide>): Slide => {
  const base = { id: uid(), body: "", notes: "", ref: null, fingerprint: "", ...fields };
  return { ...base, fingerprint: fingerprint(s, base) };
};

/** A starting point, built from the board: review deck order, edited freely afterwards. */
export function deckFromBoard(s: S, boardId: string | null, decisionId: string | null, title: string): DeckData {
  const slides: Slide[] = [slide(s, { kind: "title", title, body: "Design review" })];
  const sections = s.board_items.filter((i) => i.board_id === boardId && i.kind === "section").sort((a, b) => a.x - b.x || a.y - b.y);
  for (const section of sections) slides.push(slide(s, { kind: "section", title: section.data.text || "Section", ref: section.id }));
  if (decisionId) {
    if (matrixTable(s, decisionId)) slides.push(slide(s, { kind: "matrix", title: "Decision matrix", ref: decisionId }));
    if (requirementsTable(s, decisionId)) slides.push(slide(s, { kind: "requirements", title: "Requirements", ref: decisionId }));
  }
  return { title, slides };
}

export interface ExportCheck {
  stale: string[];
  guesses: number;
  uncredited: string[];
}

/** Listed before any export. The deck can still go out, with these marked. */
export function exportCheck(s: S, deck: DeckData): ExportCheck {
  const stale = deck.slides.filter((x) => x.kind !== "title" && x.kind !== "text" && fingerprint(s, x) !== x.fingerprint).map((x) => x.title);
  let guesses = 0;
  for (const x of deck.slides) {
    if (x.kind === "matrix") guesses += matrixTable(s, x.ref)?.rows.reduce((n, r) => n + r.guess.filter(Boolean).length, 0) ?? 0;
  }
  const uncredited = [...new Set(deck.slides.flatMap((x) => (x.kind === "section" ? sectionContent(s, x.ref).images : [])).filter((a) => !isCredited(a)).map((a) => a.title))];
  return { stale, guesses, uncredited };
}

/** Every credited source the deck shows, for the automatic references slide. */
export function references(s: S, deck: DeckData): Asset[] {
  const seen = new Map<string, Asset>();
  for (const x of deck.slides) {
    if (x.kind === "section") for (const a of sectionContent(s, x.ref).images) seen.set(a.id, a);
  }
  return [...seen.values()];
}

export function markdownOutline(s: S, deck: DeckData): string {
  const out = [`# ${deck.title}`, ""];
  for (const x of deck.slides) {
    out.push(`## ${x.title}`, "");
    if (x.body) out.push(x.body, "");
    if (x.kind === "section") {
      const c = sectionContent(s, x.ref);
      for (const t of c.texts) out.push(`- ${t}`);
      for (const a of c.images) out.push(`- Image: ${a.title} (${isCredited(a) ? a.credit : "no source yet"})`);
      out.push("");
    }
    const table = x.kind === "matrix" ? matrixTable(s, x.ref) : x.kind === "requirements" ? requirementsTable(s, x.ref) : null;
    if (table) {
      const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
      out.push(row(table.header), row(table.header.map(() => "---")), ...table.rows.map((r) => row(r.cells)));
      if (table.footer.length) out.push(row(table.footer));
      out.push("");
    }
    if (x.notes) out.push(`> Notes: ${x.notes}`, "");
  }
  const refs = references(s, deck);
  if (refs.length) out.push("## References", "", ...refs.map((a) => `- ${a.title}: ${isCredited(a) ? a.credit : "no source yet"}`), "");
  return out.join("\n");
}
