/**
 * The parts of a document that aren't plain text: figures, equations, citations and so on. Each is one
 * unit in the editor, numbered from where it sits, so moving a figure renumbers everything that points at it.
 */
import { Extension, InputRule, Mark, mergeAttributes, Node } from "@tiptap/core";
import { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { ComponentType, createContext, useContext, useEffect, useState } from "react";
import { Asset } from "../../data/types";
import { renderMathHtml } from "../../design/MathText";
import { AssetImage } from "../../design/primitives";
import { bibliographyLines, citationText, CiteContext, crossRefText, DocStructure } from "./docModel";

export type DocEdit = { kind: "math" | "citation" | "footnote" | "figure" | "tableCaption"; pos: number; attrs: Record<string, unknown> };

export const DocInfo = createContext<{ structure: DocStructure; cite: CiteContext; assets: Asset[]; edit: (e: DocEdit) => void } | null>(null);
const useInfo = () => useContext(DocInfo);

export function Formula({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let stale = false;
    void renderMathHtml(tex || "\\square", display).then((h) => {
      if (!stale) setHtml(h);
    });
    return () => {
      stale = true;
    };
  }, [tex, display]);
  // KaTeX runs with trust: false, so this can't carry anything but the formula.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function atom(name: string, options: { inline: boolean; attrs: Record<string, unknown>; view: ComponentType<ReactNodeViewProps> }) {
  return Node.create({
    name,
    group: options.inline ? "inline" : "block",
    inline: options.inline,
    atom: true,
    selectable: true,
    draggable: !options.inline,
    addAttributes() {
      return Object.fromEntries(
        Object.entries(options.attrs).map(([key, fallback]) => [
          key,
          {
            default: fallback,
            parseHTML: (el: HTMLElement) => {
              const raw = el.getAttribute(`data-${key.toLowerCase()}`);
              if (raw === null) return fallback;
              try {
                return JSON.parse(raw);
              } catch {
                return raw;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${key.toLowerCase()}`]: JSON.stringify(attrs[key]) }),
          },
        ]),
      );
    },
    parseHTML() {
      return [{ tag: `${options.inline ? "span" : "div"}[data-doc="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [options.inline ? "span" : "div", mergeAttributes(HTMLAttributes, { "data-doc": name })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(options.view);
    },
  });
}

function FigureView({ node, getPos, selected }: NodeViewProps) {
  const info = useInfo();
  const asset = info?.assets.find((a) => a.id === node.attrs.assetId);
  return (
    <NodeViewWrapper className={`doc-figure ${selected ? "on" : ""}`} data-testid="doc-figure" contentEditable={false}>
      {asset ? <AssetImage asset={asset} /> : <p className="cap guess">This picture is no longer in the Library.</p>}
      <button type="button" className="doc-caption" title="Edit the caption" onClick={() => info?.edit({ kind: "figure", pos: getPos() ?? 0, attrs: node.attrs })}>
        <b>Figure {info?.structure.figures.get(node.attrs.id)}.</b> {node.attrs.caption || "Add a caption"}
      </button>
    </NodeViewWrapper>
  );
}

function TableCaptionView({ node, getPos }: NodeViewProps) {
  const info = useInfo();
  return (
    <NodeViewWrapper className="doc-table-caption" contentEditable={false}>
      <button type="button" className="doc-caption" title="Edit the caption" onClick={() => info?.edit({ kind: "tableCaption", pos: getPos() ?? 0, attrs: node.attrs })}>
        <b>Table {info?.structure.tables.get(node.attrs.id)}.</b> {node.attrs.text || "Add a caption"}
      </button>
    </NodeViewWrapper>
  );
}

function MathBlockView({ node, getPos, selected }: NodeViewProps) {
  const info = useInfo();
  const number = info?.structure.equations.get(node.attrs.id);
  return (
    <NodeViewWrapper className={`doc-math-block ${selected ? "on" : ""}`} data-testid="doc-math-block" contentEditable={false} onClick={() => info?.edit({ kind: "math", pos: getPos() ?? 0, attrs: { ...node.attrs, block: true } })}>
      <Formula tex={node.attrs.tex} display />
      {number ? <span className="doc-eq-number">({number})</span> : null}
    </NodeViewWrapper>
  );
}

function MathInlineView({ node, getPos, selected }: NodeViewProps) {
  const info = useInfo();
  return (
    <NodeViewWrapper as="span" className={`doc-math-inline ${selected ? "on" : ""}`} data-testid="doc-math-inline" contentEditable={false} onClick={() => info?.edit({ kind: "math", pos: getPos() ?? 0, attrs: { ...node.attrs, block: false } })}>
      <Formula tex={node.attrs.tex} display={false} />
    </NodeViewWrapper>
  );
}

function CitationView({ node, getPos, selected }: NodeViewProps) {
  const info = useInfo();
  return (
    <NodeViewWrapper as="span" className={`doc-chip ${selected ? "on" : ""}`} data-testid="doc-citation" contentEditable={false} title="Change this citation" onClick={() => info?.edit({ kind: "citation", pos: getPos() ?? 0, attrs: node.attrs })}>
      {info ? citationText(node.attrs, info.cite) : ""}
    </NodeViewWrapper>
  );
}

function FootnoteView({ node, getPos, editor }: NodeViewProps) {
  const info = useInfo();
  const pos = getPos() ?? 0;
  let number = 0;
  (editor.state.doc as PmNode).descendants((d, at) => {
    if (d.type.name === "footnote" && at <= pos) number++;
  });
  return (
    <NodeViewWrapper as="span" className="doc-footnote-mark" data-testid="doc-footnote" contentEditable={false} title={node.attrs.text} onClick={() => info?.edit({ kind: "footnote", pos, attrs: node.attrs })}>
      <sup>{number}</sup>
    </NodeViewWrapper>
  );
}

function CrossRefView({ node, selected }: NodeViewProps) {
  const info = useInfo();
  return (
    <NodeViewWrapper as="span" className={`doc-chip ${selected ? "on" : ""}`} data-testid="doc-crossref" contentEditable={false}>
      {info ? crossRefText(node.attrs.target, info.structure) : ""}
    </NodeViewWrapper>
  );
}

function TocView({ node }: NodeViewProps) {
  const info = useInfo();
  const s = info?.structure;
  const kind = node.attrs.kind as string;
  const label = kind === "figures" ? "List of figures" : kind === "tables" ? "List of tables" : "Contents";
  const wanted = kind === "figures" ? "Figure" : "Table";
  return (
    <NodeViewWrapper className="doc-toc" data-testid="doc-toc" contentEditable={false}>
      <p className="doc-toc-title">{label}</p>
      {kind === "contents"
        ? s?.headings.map((h, i) => (
            <p key={i} style={{ paddingLeft: (h.level - 1) * 16 }}>
              {h.number} {h.text}
            </p>
          ))
        : s?.labels
            .filter((l) => l.kind === wanted)
            .map((l) => (
              <p key={l.id}>
                {l.kind} {l.number}. {l.text}
              </p>
            ))}
    </NodeViewWrapper>
  );
}

function BibliographyView() {
  const info = useInfo();
  const lines = info ? bibliographyLines(info.cite) : [];
  return (
    <NodeViewWrapper className="doc-bibliography" data-testid="doc-bibliography" contentEditable={false}>
      {lines.length ? lines.map((l, i) => <p key={i}>{l}</p>) : <p className="cap no-print">The reference list fills in as you cite your sources.</p>}
    </NodeViewWrapper>
  );
}

function PageBreakView() {
  return (
    <NodeViewWrapper className="doc-page-break" contentEditable={false}>
      <span className="cap no-print">Page break</span>
    </NodeViewWrapper>
  );
}

export const DocTitle = Node.create({
  name: "docTitle",
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "h1[data-doc-title]" }],
  renderHTML: ({ HTMLAttributes }) => ["h1", mergeAttributes(HTMLAttributes, { "data-doc-title": "", class: "doc-title" }), 0],
});

export const DOC_NODES = [
  DocTitle,
  atom("figure", { inline: false, attrs: { id: "", assetId: "", caption: "" }, view: FigureView }),
  atom("tableCaption", { inline: false, attrs: { id: "", text: "" }, view: TableCaptionView }),
  atom("mathBlock", { inline: false, attrs: { id: "", tex: "", numbered: true }, view: MathBlockView }),
  atom("mathInline", { inline: true, attrs: { tex: "" }, view: MathInlineView }),
  atom("citation", { inline: true, attrs: { ids: [], page: "" }, view: CitationView }),
  atom("footnote", { inline: true, attrs: { text: "" }, view: FootnoteView }),
  atom("crossRef", { inline: true, attrs: { target: "" }, view: CrossRefView }),
  atom("toc", { inline: false, attrs: { kind: "contents" }, view: TocView }),
  atom("bibliography", { inline: false, attrs: {}, view: BibliographyView }),
  atom("pageBreak", { inline: false, attrs: {}, view: PageBreakView }),
];

/** Indent on paragraphs and headings, in steps of half an inch as in Word. */
export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Math.round(parseInt(el.style.marginLeft || "0", 10) / 36) || 0,
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * 36}pt` } : {}),
          },
        },
      },
    ];
  },
});

/** A comment left on some text. It stays in Daiku: it isn't printed or written into exports. */
export const Comment = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return { id: { default: "" }, text: { default: "" } };
  },
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML: ({ mark }) => ["span", { "data-comment": mark.attrs.id, class: "doc-comment", title: mark.attrs.text }, 0],
});

export interface FindMatch {
  from: number;
  to: number;
}

/** Every place the text occurs. Matches stay within one paragraph. */
export function findMatches(doc: PmNode, query: string, options: { matchCase: boolean; wholeWord: boolean }): FindMatch[] {
  if (!query) return [];
  const out: FindMatch[] = [];
  const needle = options.matchCase ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Map each character back to its place, as a formula or citation takes a position but has no text.
    let text = "";
    const places: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) places.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        places.push(pos + 1 + offset);
        text += "￼";
      }
    });
    const hay = options.matchCase ? text : text.toLowerCase();
    let at = hay.indexOf(needle);
    while (at >= 0) {
      const before = hay[at - 1] ?? " ";
      const after = hay[at + needle.length] ?? " ";
      if (!options.wholeWord || (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after))) {
        out.push({ from: places[at], to: places[at + needle.length - 1] + 1 });
      }
      at = hay.indexOf(needle, at + needle.length);
    }
    return false;
  });
  return out;
}

export const findKey = new PluginKey<{ matches: FindMatch[]; current: number }>("docFind");

export const FindHighlight = Extension.create({
  name: "docFind",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: () => ({ matches: [] as FindMatch[], current: 0 }),
          apply(tr, value) {
            const next = tr.getMeta(findKey);
            if (next) return next;
            if (!tr.docChanged) return value;
            return { ...value, matches: value.matches.map((m: FindMatch) => ({ from: tr.mapping.map(m.from), to: tr.mapping.map(m.to) })).filter((m: FindMatch) => m.from < m.to) };
          },
        },
        props: {
          decorations(state) {
            const value = findKey.getState(state);
            if (!value?.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              value.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === value.current ? "doc-find on" : "doc-find" })),
            );
          },
        },
      }),
    ];
  },
});

/** "$x^2$" typed in the text becomes a formula. */
export const MathInput = Extension.create({
  name: "mathInput",
  addInputRules() {
    const type = this.editor.schema.nodes.mathInline;
    return [
      new InputRule({
        find: /(?:^|\s)\$([^$\s](?:[^$]*[^$\s])?)\$$/,
        handler: ({ state, range, match }) => {
          const offset = match[0].startsWith("$") ? 0 : 1;
          state.tr.replaceWith(range.from + offset, range.to, type.create({ tex: match[1] }));
        },
      }),
    ];
  },
});
