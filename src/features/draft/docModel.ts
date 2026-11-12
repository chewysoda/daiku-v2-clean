/**
 * What a document means, independent of the editor: its numbering, and how it's written out as
 * Markdown and LaTeX. Pure, so all of this can be tested without a screen.
 */
import { Asset } from "../../data/types";
import { CiteStyle, formatInText, formatReference, isNumeric, orderReferences, Reference, referenceFrom } from "../../lib/citations";

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface DocLayout {
  size: "a4" | "letter";
  landscape: boolean;
  margins: "normal" | "narrow" | "wide";
  columns: 1 | 2;
  numberHeadings: boolean;
  citeStyle: CiteStyle;
  header: string;
  footer: string;
  pageNumbers: boolean;
}

export const DEFAULT_LAYOUT: DocLayout = { size: "a4", landscape: false, margins: "normal", columns: 1, numberHeadings: false, citeStyle: "apa", header: "", footer: "", pageNumbers: true };

export function cleanLayout(saved: Partial<DocLayout> | undefined): DocLayout {
  return { ...DEFAULT_LAYOUT, ...(saved ?? {}) };
}

export interface DocStructure {
  headings: { level: number; text: string; number: string }[];
  figures: Map<string, number>;
  tables: Map<string, number>;
  equations: Map<string, number>;
  /** Every label, for picking what to cross-refer to. */
  labels: { id: string; kind: "Figure" | "Table" | "Equation"; number: number; text: string }[];
  cited: string[];
  footnotes: string[];
}

export function textOf(node: DocNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join("");
}

function walk(node: DocNode, visit: (n: DocNode) => void) {
  visit(node);
  for (const c of node.content ?? []) walk(c, visit);
}

export function docStructure(doc: DocNode, numberHeadings = false): DocStructure {
  const out: DocStructure = { headings: [], figures: new Map(), tables: new Map(), equations: new Map(), labels: [], cited: [], footnotes: [] };
  const counters = [0, 0, 0, 0, 0, 0];
  walk(doc, (n) => {
    const id = String(n.attrs?.id ?? "");
    switch (n.type) {
      case "heading": {
        const level = Number(n.attrs?.level ?? 1);
        counters[level - 1]++;
        for (let i = level; i < counters.length; i++) counters[i] = 0;
        out.headings.push({ level, text: textOf(n), number: numberHeadings ? counters.slice(0, level).map((c) => c || 1).join(".") : "" });
        break;
      }
      case "figure":
        out.figures.set(id, out.figures.size + 1);
        out.labels.push({ id, kind: "Figure", number: out.figures.size, text: String(n.attrs?.caption ?? "") });
        break;
      case "tableCaption":
        out.tables.set(id, out.tables.size + 1);
        out.labels.push({ id, kind: "Table", number: out.tables.size, text: String(n.attrs?.text ?? "") });
        break;
      case "mathBlock":
        if (n.attrs?.numbered) {
          out.equations.set(id, out.equations.size + 1);
          out.labels.push({ id, kind: "Equation", number: out.equations.size, text: String(n.attrs?.tex ?? "") });
        }
        break;
      case "citation":
        out.cited.push(...((n.attrs?.ids as string[]) ?? []));
        break;
      case "footnote":
        out.footnotes.push(String(n.attrs?.text ?? ""));
        break;
    }
  });
  return out;
}

export function referencesFor(assets: Asset[]): Map<string, Reference> {
  return new Map(assets.map((a) => [a.id, referenceFrom(a)]));
}

export interface CiteContext {
  style: CiteStyle;
  refs: Map<string, Reference>;
  ordered: Reference[];
  numbers: Map<string, number>;
}

export function citeContext(structure: DocStructure, assets: Asset[], style: CiteStyle): CiteContext {
  const refs = referencesFor(assets);
  const ordered = orderReferences(structure.cited, refs, style);
  return { style, refs, ordered, numbers: new Map(ordered.map((r, i) => [r.id, i + 1])) };
}

export function citationText(attrs: Record<string, unknown> | undefined, ctx: CiteContext): string {
  const ids = (attrs?.ids as string[]) ?? [];
  return formatInText(ids.map((id) => ctx.refs.get(id)).filter((r): r is Reference => !!r), ctx.style, ctx.numbers, String(attrs?.page ?? ""));
}

export const bibliographyLines = (ctx: CiteContext) => ctx.ordered.map((r, i) => formatReference(r, ctx.style, i + 1));

export function crossRefText(target: unknown, s: DocStructure): string {
  const label = s.labels.find((l) => l.id === target);
  return label ? (label.kind === "Equation" ? `Equation (${label.number})` : `${label.kind} ${label.number}`) : "[missing reference]";
}

// ---- Markdown: what notes, the vault and the Claude pack read ----

function inlineMarkdown(nodes: DocNode[] | undefined, s: DocStructure, ctx: CiteContext, notes: { n: number }): string {
  return (nodes ?? [])
    .map((n) => {
      switch (n.type) {
        case "text": {
          let t = n.text ?? "";
          for (const m of n.marks ?? []) {
            if (m.type === "bold") t = `**${t}**`;
            else if (m.type === "italic") t = `*${t}*`;
            else if (m.type === "strike") t = `~~${t}~~`;
            else if (m.type === "code") t = `\`${t}\``;
            else if (m.type === "link") t = `[${t}](${String(m.attrs?.href ?? "")})`;
          }
          return t;
        }
        case "hardBreak":
          return "  \n";
        case "citation":
          return citationText(n.attrs, ctx);
        case "footnote":
          notes.n++;
          return `[^${notes.n}]`;
        case "mathInline":
          return `$${String(n.attrs?.tex ?? "")}$`;
        case "crossRef":
          return crossRefText(n.attrs?.target, s);
        default:
          return "";
      }
    })
    .join("");
}

export function docToMarkdown(doc: DocNode, assets: Asset[], layout: DocLayout): string {
  const s = docStructure(doc, layout.numberHeadings);
  const ctx = citeContext(s, assets, layout.citeStyle);
  const notes = { n: 0 };
  let heading = 0;
  const inline = (n: DocNode) => inlineMarkdown(n.content, s, ctx, notes);
  const block = (n: DocNode, depth = 0): string => {
    const pad = "  ".repeat(depth);
    switch (n.type) {
      case "docTitle":
        return `# ${inline(n)}`;
      case "paragraph":
        return inline(n);
      case "heading": {
        const h = s.headings[heading++];
        return `${"#".repeat(Number(n.attrs?.level ?? 1) + 1)} ${h?.number ? `${h.number} ` : ""}${inline(n)}`;
      }
      case "bulletList":
      case "orderedList":
      case "taskList":
        return (n.content ?? [])
          .map((item, i) => {
            const mark = n.type === "orderedList" ? `${i + 1}.` : n.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}]` : "-";
            const [first, ...rest] = item.content ?? [];
            return `${pad}${mark} ${first ? block(first, depth + 1) : ""}${rest.map((r) => `\n${block(r, depth + 1)}`).join("")}`;
          })
          .join("\n");
      case "blockquote":
        return (n.content ?? []).map((c) => block(c).replace(/^/gm, "> ")).join("\n>\n");
      case "codeBlock":
        return `\`\`\`\n${textOf(n)}\n\`\`\``;
      case "horizontalRule":
      case "pageBreak":
        return "---";
      case "mathBlock":
        return `$$${String(n.attrs?.tex ?? "")}$$${n.attrs?.numbered ? ` (${s.equations.get(String(n.attrs?.id))})` : ""}`;
      case "figure": {
        const asset = assets.find((a) => a.id === n.attrs?.assetId);
        const number = s.figures.get(String(n.attrs?.id));
        return `![[${asset?.title ?? "Removed picture"}]]\n\n*Figure ${number}${n.attrs?.caption ? `. ${String(n.attrs.caption)}` : ""}*`;
      }
      case "tableCaption":
        return `*Table ${s.tables.get(String(n.attrs?.id))}${n.attrs?.text ? `. ${String(n.attrs.text)}` : ""}*`;
      case "table": {
        const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inline(p)).join(" ").replace(/\|/g, "\\|")));
        if (!rows.length) return "";
        const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
        return [line(rows[0]), line(rows[0].map(() => "---")), ...rows.slice(1).map(line)].join("\n");
      }
      case "toc":
        if (n.attrs?.kind === "figures" || n.attrs?.kind === "tables") {
          const wanted = n.attrs.kind === "figures" ? "Figure" : "Table";
          return s.labels.filter((l) => l.kind === wanted).map((l) => `- ${l.kind} ${l.number}${l.text ? `. ${l.text}` : ""}`).join("\n");
        }
        return s.headings.map((h) => `${"  ".repeat(h.level - 1)}- ${h.number ? `${h.number} ` : ""}${h.text}`).join("\n");
      case "bibliography":
        return bibliographyLines(ctx).join("\n\n");
      default:
        return (n.content ?? []).map((c) => block(c, depth)).join("\n\n");
    }
  };
  const body = (doc.content ?? []).map((n) => block(n)).filter((t) => t !== "").join("\n\n");
  const footnotes = s.footnotes.map((t, i) => `[^${i + 1}]: ${t}`).join("\n");
  return footnotes ? `${body}\n\n${footnotes}\n` : `${body}\n`;
}

// ---- LaTeX ----

export function latexEscape(text: string): string {
  return text
    .replace(/\\/g, "\u0000")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    // eslint-disable-next-line no-control-regex -- NUL is the placeholder for backslashes set above.
    .replace(/\u0000/g, "\\textbackslash{}");
}

const texKey = (id: string) => `ref${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
const texLabel = (id: string) => `lab${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;

/** Where each figure's picture goes in the export, by asset id. */
export type ImagePath = (assetId: string) => string | null;

export function docToLatex(doc: DocNode, assets: Asset[], layout: DocLayout, imagePath: ImagePath): string {
  const s = docStructure(doc, layout.numberHeadings);
  const ctx = citeContext(s, assets, layout.citeStyle);
  const inline = (nodes: DocNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        switch (n.type) {
          case "text": {
            let t = latexEscape(n.text ?? "");
            for (const m of n.marks ?? []) {
              if (m.type === "bold") t = `\\textbf{${t}}`;
              else if (m.type === "italic") t = `\\textit{${t}}`;
              else if (m.type === "underline") t = `\\underline{${t}}`;
              else if (m.type === "subscript") t = `\\textsubscript{${t}}`;
              else if (m.type === "superscript") t = `\\textsuperscript{${t}}`;
              else if (m.type === "code") t = `\\texttt{${t}}`;
              else if (m.type === "link") t = `\\href{${latexEscape(String(m.attrs?.href ?? ""))}}{${t}}`;
            }
            return t;
          }
          case "hardBreak":
            return "\\\\\n";
          case "citation": {
            const ids = (n.attrs?.ids as string[]) ?? [];
            const page = String(n.attrs?.page ?? "");
            return `\\cite${page ? `[p.~${latexEscape(page)}]` : ""}{${ids.map(texKey).join(",")}}`;
          }
          case "footnote":
            return `\\footnote{${latexEscape(String(n.attrs?.text ?? ""))}}`;
          case "mathInline":
            return `$${String(n.attrs?.tex ?? "")}$`;
          case "crossRef": {
            const label = s.labels.find((l) => l.id === n.attrs?.target);
            if (!label) return "[missing reference]";
            return label.kind === "Equation" ? `Equation~(\\ref{${texLabel(label.id)}})` : `${label.kind}~\\ref{${texLabel(label.id)}}`;
          }
          default:
            return "";
        }
      })
      .join("");
  const tabular = (n: DocNode) => {
    const rows = n.content ?? [];
    const cols = Math.max(1, ...rows.map((r) => r.content?.length ?? 0));
    return `\\begin{tabular}{${"l".repeat(cols)}}\n\\hline\n${rows.map((r, i) => `${(r.content ?? []).map((c) => (c.content ?? []).map((p) => inline(p.content)).join(" ")).join(" & ")} \\\\${i === 0 ? "\n\\hline" : ""}`).join("\n")}\n\\hline\n\\end{tabular}`;
  };
  let title = "";
  const blocks = (list: DocNode[]): string => {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      switch (n.type) {
        case "docTitle":
          title = inline(n.content);
          out.push("\\maketitle");
          break;
        case "paragraph": {
          const t = inline(n.content);
          if (t) out.push(t);
          break;
        }
        case "heading": {
          const level = Number(n.attrs?.level ?? 1);
          const cmd = ["section", "subsection", "subsubsection", "paragraph"][level - 1] ?? "paragraph";
          out.push(`\\${cmd}${layout.numberHeadings ? "" : "*"}{${inline(n.content)}}`);
          break;
        }
        case "bulletList":
        case "orderedList":
        case "taskList": {
          const env = n.type === "orderedList" ? "enumerate" : "itemize";
          out.push(`\\begin{${env}}\n${(n.content ?? []).map((item) => `\\item ${blocks(item.content ?? [])}`).join("\n")}\n\\end{${env}}`);
          break;
        }
        case "blockquote":
          out.push(`\\begin{quote}\n${blocks(n.content ?? [])}\n\\end{quote}`);
          break;
        case "codeBlock":
          out.push(`\\begin{verbatim}\n${textOf(n)}\n\\end{verbatim}`);
          break;
        case "horizontalRule":
          out.push("\\noindent\\rule{\\linewidth}{0.4pt}");
          break;
        case "pageBreak":
          out.push("\\newpage");
          break;
        case "mathBlock": {
          const numbered = !!n.attrs?.numbered;
          out.push(numbered ? `\\begin{equation}\n${String(n.attrs?.tex ?? "")}\n\\label{${texLabel(String(n.attrs?.id))}}\n\\end{equation}` : `\\[\n${String(n.attrs?.tex ?? "")}\n\\]`);
          break;
        }
        case "figure": {
          const path = imagePath(String(n.attrs?.assetId));
          const picture = path ? `\\includegraphics[width=0.9\\linewidth]{${path}}` : `\\fbox{Picture not in this export}`;
          out.push(`\\begin{figure}[htbp]\n\\centering\n${picture}\n\\caption{${latexEscape(String(n.attrs?.caption ?? ""))}}\n\\label{${texLabel(String(n.attrs?.id))}}\n\\end{figure}`);
          break;
        }
        case "tableCaption": {
          const next = list[i + 1];
          const caption = `\\caption{${latexEscape(String(n.attrs?.text ?? ""))}}\n\\label{${texLabel(String(n.attrs?.id))}}`;
          if (next?.type === "table") {
            out.push(`\\begin{table}[htbp]\n\\centering\n${caption}\n${tabular(next)}\n\\end{table}`);
            i++;
          } else {
            out.push(`\\begin{table}[htbp]\n${caption}\n\\end{table}`);
          }
          break;
        }
        case "table":
          out.push(`\\begin{center}\n${tabular(n)}\n\\end{center}`);
          break;
        case "toc":
          out.push(n.attrs?.kind === "figures" ? "\\listoffigures" : n.attrs?.kind === "tables" ? "\\listoftables" : "\\tableofcontents");
          break;
        case "bibliography":
          if (ctx.ordered.length) {
            out.push(`\\begin{thebibliography}{99}\n${ctx.ordered.map((r) => `\\bibitem{${texKey(r.id)}} ${latexEscape(formatReference({ ...r, url: r.url }, ctx.style).replace(/^\[\?\]\s*|^\?\.\s*/, ""))}`).join("\n")}\n\\end{thebibliography}`);
          }
          break;
      }
    }
    return out.join("\n\n");
  };
  const body = blocks(doc.content ?? []);
  const options = [layout.size === "letter" ? "letterpaper" : "a4paper", layout.columns === 2 ? "twocolumn" : "", layout.landscape ? "landscape" : ""].filter(Boolean).join(",");
  const margin = { normal: "2.5cm", narrow: "1.5cm", wide: "3.5cm" }[layout.margins];
  return `% Exported from Daiku. Build with pdflatex, or upload to Overleaf.
\\documentclass[${options}]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=${margin}]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
${isNumeric(ctx.style) ? "" : "% The reference list below uses numbered \\\\cite marks in LaTeX, whichever style Daiku displays.\n"}${title ? `\\title{${title}}\n\\date{}\n` : ""}
\\begin{document}

${body}

\\end{document}
`;
}

// ---- From Markdown: older drafts, and blocks from the research panel ----

const OPEN = "\uE000";
const CLOSE = "\uE001";
type Held = { kind: "math"; tex: string; display: boolean; raw: string } | { kind: "figure"; title: string; raw: string };

function holdSpecial(source: string): { text: string; held: Held[] } {
  const held: Held[] = [];
  const keep = (h: Held) => OPEN + (held.push(h) - 1) + CLOSE;
  // Fenced code keeps its dollars. A price like "$5 and $6" isn't a formula: the closing mark can't touch a digit.
  const text = source
    .split(/(^```[\s\S]*?^```$)/m)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/!\[\[([^\]\n]+)\]\]/g, (raw, title) => keep({ kind: "figure", title: title.trim(), raw }))
            .replace(/\$\$([\s\S]+?)\$\$/g, (raw, tex) => keep({ kind: "math", tex: tex.trim(), display: true, raw }))
            .replace(/(?<![\\$])\$(?!\s)([^$\n]*?[^\s\\$])\$(?!\d)/g, (raw, tex) => keep({ kind: "math", tex, display: false, raw })),
    )
    .join("");
  return { text, held };
}

type Tok = { type: string; raw?: string; text?: string; tokens?: Tok[]; items?: Tok[]; href?: string; level?: number; ordered?: boolean; task?: boolean; checked?: boolean; header?: Tok[]; rows?: Tok[][] };

/** Turns Markdown into document nodes. A web image stays text, as those stay forbidden: only named Library pictures appear. */
export function markdownToNodes(markdown: string, assets: Pick<Asset, "id" | "title">[], lexer: (src: string) => unknown[]): DocNode[] {
  const { text: source, held } = holdSpecial(markdown);
  const place = new RegExp(OPEN + "(\\d+)" + CLOSE, "g");
  const restore = (t: string) => t.replace(place, (_m, i) => held[Number(i)].raw);
  const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const textNodes = (raw: string, marks: DocNode["marks"]): DocNode[] => {
    const out: DocNode[] = [];
    raw.split(new RegExp("(" + OPEN + "\\d+" + CLOSE + ")")).forEach((part, i) => {
      if (i % 2) {
        const h = held[Number(part.slice(1, -1))];
        if (h.kind === "math") out.push({ type: "mathInline", attrs: { tex: h.tex } });
        else out.push({ type: "text", text: h.raw, ...(marks?.length ? { marks } : {}) });
      } else if (part) {
        out.push({ type: "text", text: part, ...(marks?.length ? { marks } : {}) });
      }
    });
    return out;
  };
  const inline = (tokens: Tok[] | undefined, marks: NonNullable<DocNode["marks"]> = []): DocNode[] =>
    (tokens ?? []).flatMap((t): DocNode[] => {
      switch (t.type) {
        case "strong":
          return inline(t.tokens, [...marks, { type: "bold" }]);
        case "em":
          return inline(t.tokens, [...marks, { type: "italic" }]);
        case "del":
          return inline(t.tokens, [...marks, { type: "strike" }]);
        case "codespan":
          return [{ type: "text", text: decode(restore(t.text ?? "")) || " ", marks: [{ type: "code" }] }];
        case "link":
          return inline(t.tokens, [...marks, { type: "link", attrs: { href: t.href ?? "" } }]);
        case "br":
          return [{ type: "hardBreak" }];
        case "image":
          return textNodes(t.raw ?? "", marks);
        case "text":
          return t.tokens ? inline(t.tokens, marks) : textNodes(decode(t.text ?? ""), marks);
        default:
          return textNodes(decode(t.text ?? t.raw ?? ""), marks);
      }
    });
  const para = (content: DocNode[]): DocNode => (content.length ? { type: "paragraph", content } : { type: "paragraph" });
  const blocks = (tokens: Tok[]): DocNode[] => {
    const out: DocNode[] = [];
    for (const t of tokens) {
      switch (t.type) {
        case "heading":
          out.push({ type: "heading", attrs: { level: Math.min(4, t.level ?? 1) }, content: inline(t.tokens) });
          break;
        case "paragraph":
        case "text": {
          const alone = new RegExp("^" + OPEN + "(\\d+)" + CLOSE + "$").exec((t.text ?? "").trim());
          const h = alone ? held[Number(alone[1])] : null;
          if (h?.kind === "math" && h.display) {
            out.push({ type: "mathBlock", attrs: { id: newId(), tex: h.tex, numbered: false } });
          } else if (h?.kind === "figure") {
            const asset = assets.find((a) => a.title.toLowerCase() === h.title.toLowerCase());
            out.push(asset ? { type: "figure", attrs: { id: newId(), assetId: asset.id, caption: "" } } : para([{ type: "text", text: 'No picture called "' + h.title + '" in the Library.' }]));
          } else {
            const content = t.tokens ? inline(t.tokens) : textNodes(decode(t.text ?? ""), []);
            const last = out[out.length - 1];
            // A figure's "Figure: credit" line is its caption, so the credit stays with it.
            const caption = /^Figure:\s*(.+)$/s.exec(content.map(textOf).join(""));
            if (last?.type === "figure" && caption) last.attrs = { ...last.attrs, caption: caption[1].trim() };
            else out.push(para(content));
          }
          break;
        }
        case "list": {
          const task = t.items?.some((i) => i.task);
          out.push({
            type: task ? "taskList" : t.ordered ? "orderedList" : "bulletList",
            content: (t.items ?? []).map((item) => {
              const content = blocks(item.tokens ?? []);
              return { type: task ? "taskItem" : "listItem", ...(task ? { attrs: { checked: !!item.checked } } : {}), content: content.length ? content : [{ type: "paragraph" }] };
            }),
          });
          break;
        }
        case "blockquote": {
          const content = blocks(t.tokens ?? []);
          out.push({ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] });
          break;
        }
        case "code":
          out.push({ type: "codeBlock", ...(t.text ? { content: [{ type: "text", text: restore(t.text) }] } : {}) });
          break;
        case "hr":
          out.push({ type: "horizontalRule" });
          break;
        case "table": {
          const cell = (kind: string, c: Tok): DocNode => ({ type: kind, content: [para(inline(c.tokens))] });
          out.push({
            type: "table",
            content: [{ type: "tableRow", content: (t.header ?? []).map((c) => cell("tableHeader", c)) }, ...(t.rows ?? []).map((r) => ({ type: "tableRow", content: r.map((c) => cell("tableCell", c)) }))],
          });
          break;
        }
        case "space":
          break;
        default:
          if (t.raw?.trim()) out.push(para(textNodes(t.raw.trim(), [])));
      }
    }
    return out;
  };
  return blocks(lexer(source) as Tok[]);
}

let idCounter = 0;
export const newId = () => `x${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** A research paper's usual shape, ready to fill in. */
export function paperTemplate(title: string): DocNode {
  const p = (text: string, attrs?: Record<string, unknown>): DocNode => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content: text ? [{ type: "text", text }] : undefined });
  const h = (text: string, level = 1): DocNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  return {
    type: "doc",
    content: [
      { type: "docTitle", content: [{ type: "text", text: title || "Title of the paper" }] },
      p("Author names", { textAlign: "center" }),
      p("Affiliation, email", { textAlign: "center" }),
      h("Abstract"),
      p("State the problem, what you did, what you found, and why it matters, in about 200 words."),
      p("Keywords: first, second, third"),
      h("Introduction"),
      p("Why this matters, what's known already, and the question this paper answers."),
      h("Methods"),
      p("What you did, in enough detail that someone else could repeat it."),
      h("Results"),
      p("What you found, without interpreting it yet."),
      h("Discussion"),
      p("What it means, how it compares with earlier work, and its limits."),
      h("Conclusion"),
      p("The main takeaway, and what should happen next."),
      h("Acknowledgements"),
      p("Who helped, and who funded this."),
      h("References"),
      { type: "bibliography" },
    ],
  };
}

export function reviewTemplate(title: string): DocNode {
  const h = (text: string): DocNode => ({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] });
  const p = (text: string): DocNode => ({ type: "paragraph", content: [{ type: "text", text }] });
  return {
    type: "doc",
    content: [
      { type: "docTitle", content: [{ type: "text", text: title || "Title of the review" }] },
      { type: "toc", attrs: { kind: "contents" } },
      h("Introduction"),
      p("The topic, why a review is needed, and the question it answers."),
      h("How the sources were chosen"),
      p("Where you searched, the terms you used, and what you included or left out."),
      h("What the sources say"),
      p("Group the sources by theme rather than listing them one by one."),
      h("Gaps and disagreements"),
      p("Where the sources conflict, and what nobody has studied yet."),
      h("Conclusion"),
      p("What is settled, what isn't, and what should be done next."),
      h("References"),
      { type: "bibliography" },
    ],
  };
}
