/** Pure text editing for the note body, so the fiddly cases can be tested without a text box. */
import { hasMath } from "./math";

export interface Edit {
  /** What replaces the selection. */
  text: string;
  /** The selection afterwards, relative to the start of the inserted text. */
  from: number;
  to: number;
}

const FORMULAS = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\n$]+?\$/g;

/** Is the cursor inside a formula? Uses the same rules as the preview, so "$5 and $6" isn't one. */
export function insideFormula(body: string, position: number): boolean {
  for (const m of body.matchAll(FORMULAS)) {
    if (position > m.index && position < m.index + m[0].length && hasMath(m[0])) return true;
  }
  return false;
}

/** Wraps the selection as a formula. With nothing selected, leaves a placeholder selected to type over. */
export function formulaEdit(selected: string, display: boolean): Edit {
  const tex = selected.trim() || "x";
  const open = display ? "$$\n" : "$";
  const close = display ? "\n$$" : "$";
  return { text: `${open}${tex}${close}`, from: open.length, to: open.length + tex.length };
}

/** A LaTeX snippet, which only needs dollar signs when the cursor isn't already in a formula. */
export function snippetEdit(body: string, position: number, snippet: string): Edit {
  const text = insideFormula(body, position) ? snippet : `$${snippet}$`;
  return { text, from: text.length, to: text.length };
}

/** Text placed on its own, with a blank line either side unless there's one already. */
export function blockEdit(body: string, start: number, end: number, block: string): Edit {
  const before = body.slice(0, start);
  const after = body.slice(end);
  const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = !after || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const text = `${lead}${block}${trail}`;
  return { text, from: lead.length + block.length, to: lead.length + block.length };
}

/** Takes off any delimiters someone typed, as the block adds its own. */
export function stripDelimiters(tex: string): string {
  return tex
    .trim()
    .replace(/^(\$\$|\\\[|\\\(|\$)\s*/, "")
    .replace(/\s*(\$\$|\\\]|\\\)|\$)$/, "")
    .trim();
}

export const formulaBlock = (tex: string) => `$$\n${stripDelimiters(tex)}\n$$`;

export const LATEX_SNIPPETS: { group: string; items: { label: string; tex: string }[] }[] = [
  {
    group: "Structure",
    items: [
      { label: "Fraction", tex: "\\frac{a}{b}" },
      { label: "Square root", tex: "\\sqrt{x}" },
      { label: "Power", tex: "x^{2}" },
      { label: "Subscript", tex: "x_{i}" },
      { label: "Sum", tex: "\\sum_{i=1}^{n}" },
      { label: "Integral", tex: "\\int_{a}^{b}" },
      { label: "Matrix", tex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
      { label: "Chemical formula", tex: "\\ce{H2O}" },
    ],
  },
  {
    group: "Symbols",
    items: [
      { label: "α alpha", tex: "\\alpha" },
      { label: "β beta", tex: "\\beta" },
      { label: "θ theta", tex: "\\theta" },
      { label: "π pi", tex: "\\pi" },
      { label: "ρ rho", tex: "\\rho" },
      { label: "σ sigma", tex: "\\sigma" },
      { label: "Δ delta", tex: "\\Delta" },
      { label: "≤", tex: "\\leq" },
      { label: "≥", tex: "\\geq" },
      { label: "≈", tex: "\\approx" },
      { label: "±", tex: "\\pm" },
      { label: "×", tex: "\\times" },
      { label: "→", tex: "\\rightarrow" },
    ],
  },
];

type P = [number, number];

/** Pen strokes from the writing pad, as the board items the recognisers already read. */
export function padStrokesToItems(strokes: P[][], width: number, height: number) {
  return strokes.map((s, z) => ({
    id: `pad-${z}`,
    board_id: "",
    kind: "stroke" as const,
    x: 0,
    y: 0,
    w: width,
    h: height,
    rotation: 0,
    z,
    asset_id: null,
    data: { points: s.flat(), vw: width, vh: height },
    updated_at: "",
  }));
}
