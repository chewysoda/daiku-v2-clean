import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { Asset } from "../../data/types";
import { formatInText, formatReference, orderReferences, parseAuthor, parseBibtex, Reference, referenceFrom } from "../../lib/citations";
import { citeContext, citationText, cleanLayout, crossRefText, DEFAULT_LAYOUT, DocNode, docStructure, docToLatex, docToMarkdown, latexEscape, markdownToNodes, paperTemplate, textOf } from "./docModel";

const asset = (fields: Partial<Asset>) => ({ id: "a1", kind: "pdf", title: "Softness of seats", credit: "Rin Kato, Sam Lee", tags: "Design Journal 2020", source_url: "https://doi.org/x", notes: "", ...fields }) as Asset;
const ref = (fields: Partial<Reference> = {}): Reference => ({ id: "a", title: "Softness of seats", authors: [{ given: "Rin", family: "Kato" }, { given: "Sam", family: "Lee" }], etAl: false, year: "2020", venue: "Design Journal", url: "", ...fields });

describe("reading authors", () => {
  it("understands the usual ways of writing a name", () => {
    expect(parseAuthor("Rin Kato")).toEqual({ given: "Rin", family: "Kato" });
    expect(parseAuthor("Kato, Rin")).toEqual({ given: "Rin", family: "Kato" });
    expect(parseAuthor("Kato R")).toEqual({ given: "R", family: "Kato" });
  });

  it("builds a reference, without inventing what's missing", () => {
    const r = referenceFrom(asset({}));
    expect(r.authors.map((a) => a.family)).toEqual(["Kato", "Lee"]);
    expect(r.year).toBe("2020");
    expect(r.venue).toBe("Design Journal");
    const bare = referenceFrom(asset({ credit: "yours", tags: "" }));
    expect(bare.authors).toEqual([]);
    expect(bare.year).toBe("");
  });

  it("reads a saved paper's credit", () => {
    const r = referenceFrom(asset({ credit: "Rin Kato et al., 2019", tags: "" }));
    expect(r.etAl).toBe(true);
    expect(r.year).toBe("2019");
    expect(r.authors.map((a) => a.family)).toEqual(["Kato"]);
  });
});

describe("reference list styles", () => {
  it("APA", () => expect(formatReference(ref(), "apa")).toBe("Kato, R. & Lee, S. (2020). Softness of seats. Design Journal."));
  it("Harvard", () => expect(formatReference(ref(), "harvard")).toBe("Kato, R. and Lee, S. (2020) Softness of seats. Design Journal."));
  it("MLA", () => expect(formatReference(ref(), "mla")).toBe('Kato, Rin, and Sam Lee. "Softness of seats." Design Journal. 2020.'));
  it("Chicago", () => expect(formatReference(ref(), "chicago")).toBe('Kato, Rin and Sam Lee. 2020. "Softness of seats." Design Journal.'));
  it("IEEE", () => expect(formatReference(ref(), "ieee", 3)).toBe('[3] R. Kato and S. Lee, "Softness of seats", Design Journal, 2020.'));
  it("Vancouver", () => expect(formatReference(ref(), "vancouver", 3)).toBe("3. Kato R, Lee S. Softness of seats. Design Journal. 2020."));

  it("says n.d. rather than inventing a year, in every author-date style", () => {
    for (const style of ["apa", "harvard", "chicago"] as const) expect(formatReference(ref({ year: "" }), style)).toContain("n.d.");
  });

  it("copes with no authors at all", () => {
    expect(formatReference(ref({ authors: [] }), "apa")).toBe("(2020). Softness of seats. Design Journal.");
  });
});

describe("marks in the text", () => {
  const numbers = new Map([["a", 2]]);
  it("author-date", () => {
    expect(formatInText([ref()], "apa", numbers)).toBe("(Kato & Lee, 2020)");
    expect(formatInText([ref()], "harvard", numbers, "12")).toBe("(Kato and Lee, 2020, p. 12)");
    expect(formatInText([ref()], "mla", numbers, "12")).toBe("(Kato and Lee 12)");
    expect(formatInText([ref()], "chicago", numbers)).toBe("(Kato and Lee 2020)");
  });
  it("numeric", () => {
    expect(formatInText([ref()], "ieee", numbers)).toBe("[2]");
    expect(formatInText([ref()], "vancouver", numbers, "5")).toBe("[2, p. 5]");
  });
  it("et al. past two authors", () => {
    expect(formatInText([ref({ authors: [{ given: "", family: "A" }, { given: "", family: "B" }, { given: "", family: "C" }] })], "apa", numbers)).toBe("(A et al., 2020)");
  });
  it("flags a removed source", () => {
    expect(formatInText([], "apa", numbers)).toBe("[no source]");
  });
});

describe("list order", () => {
  const refs = new Map([["z", ref({ id: "z", authors: [{ given: "", family: "Zed" }] })], ["a", ref({ id: "a", authors: [{ given: "", family: "Abel" }] })]]);
  it("numeric styles keep first use, without repeats", () => {
    expect(orderReferences(["z", "a", "z"], refs, "ieee").map((r) => r.id)).toEqual(["z", "a"]);
  });
  it("the others run alphabetically", () => {
    expect(orderReferences(["z", "a"], refs, "apa").map((r) => r.id)).toEqual(["a", "z"]);
  });
  it("ignores a source that's been removed", () => {
    expect(orderReferences(["gone"], refs, "apa")).toEqual([]);
  });
});

describe("BibTeX", () => {
  const bib = `@article{kato2020,
    title = {Softness {of} seats},
    author = {Kato, Rin and Lee, Sam},
    journal = "Design Journal",
    year = 2020,
    doi = {10.1/abc}
  }
  @comment{ignore me}
  @book{m\u00fcller, title={Caf\\'e design}, publisher={Press}, year={1999}, url={https://x.example}}
  @misc{broken, note={no title}}`;
  const parsed = parseBibtex(bib);

  it("reads entries, with braces inside values", () => {
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe("Softness of seats");
    expect(parsed[0].credit).toBe("Kato, Rin; Lee, Sam");
    expect(parsed[0].tags).toBe("Design Journal 2020");
    expect(parsed[0].url).toBe("https://doi.org/10.1/abc");
  });

  it("decodes accents, and uses a url when there's no DOI", () => {
    expect(parsed[1].title).toBe("Café design");
    expect(parsed[1].url).toBe("https://x.example");
  });

  it("turns into a real reference", () => {
    const r = referenceFrom({ id: "x", title: parsed[0].title, credit: parsed[0].credit, tags: parsed[0].tags, source_url: parsed[0].url });
    expect(r.authors).toEqual([{ family: "Kato", given: "Rin" }, { family: "Lee", given: "Sam" }]);
    expect(formatInText([r], "apa", new Map())).toBe("(Kato & Lee, 2020)");
  });

  it("gets nothing from nonsense", () => {
    expect(parseBibtex("hello")).toEqual([]);
    expect(parseBibtex("@article{x, title={unclosed")).toHaveLength(1);
  });
});

const text = (t: string, marks?: DocNode["marks"]): DocNode => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const para = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const sample: DocNode = {
  type: "doc",
  content: [
    { type: "docTitle", content: [text("My paper")] },
    { type: "heading", attrs: { level: 1 }, content: [text("Intro")] },
    para(text("See "), { type: "crossRef", attrs: { target: "f2" } }, text(" and "), { type: "citation", attrs: { ids: ["a1"], page: "" } }, text("."), { type: "footnote", attrs: { text: "A note" } }),
    { type: "heading", attrs: { level: 2 }, content: [text("Part")] },
    { type: "figure", attrs: { id: "f1", assetId: "a1", caption: "First" } },
    { type: "figure", attrs: { id: "f2", assetId: "a1", caption: "Second" } },
    { type: "mathBlock", attrs: { id: "e1", tex: "E=mc^2", numbered: true } },
    { type: "tableCaption", attrs: { id: "t1", text: "Scores" } },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [para(text("A"))] }, { type: "tableHeader", content: [para(text("B"))] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [para(text("1"))] }, { type: "tableCell", content: [para(text("2"))] }] }] },
    { type: "heading", attrs: { level: 1 }, content: [text("Next")] },
    { type: "bibliography" },
  ],
};
const assets = [asset({})];

describe("numbering", () => {
  const s = docStructure(sample, true);
  it("numbers figures, tables and equations in order", () => {
    expect(s.figures.get("f2")).toBe(2);
    expect(s.tables.get("t1")).toBe(1);
    expect(s.equations.get("e1")).toBe(1);
  });
  it("numbers headings by level, restarting under each parent", () => {
    expect(s.headings.map((h) => h.number)).toEqual(["1", "1.1", "2"]);
    expect(docStructure(sample).headings[0].number).toBe("");
  });
  it("collects what's cited and the footnotes", () => {
    expect(s.cited).toEqual(["a1"]);
    expect(s.footnotes).toEqual(["A note"]);
  });
  it("resolves cross-references, and flags a dangling one", () => {
    expect(crossRefText("f2", s)).toBe("Figure 2");
    expect(crossRefText("e1", s)).toBe("Equation (1)");
    expect(crossRefText("gone", s)).toBe("[missing reference]");
  });
  it("doesn't number an unnumbered equation", () => {
    expect(docStructure({ type: "doc", content: [{ type: "mathBlock", attrs: { id: "x", tex: "a", numbered: false } }] }).equations.size).toBe(0);
  });
  it("citations follow the chosen style", () => {
    const ctx = citeContext(s, assets, "ieee");
    expect(citationText({ ids: ["a1"], page: "" }, ctx)).toBe("[1]");
    expect(citationText({ ids: ["a1"], page: "" }, citeContext(s, assets, "apa"))).toBe("(Kato & Lee, 2020)");
  });
});

describe("as Markdown", () => {
  const md = docToMarkdown(sample, assets, { ...DEFAULT_LAYOUT, numberHeadings: true });
  it("keeps the words, references and structure", () => {
    expect(md).toContain("# My paper");
    expect(md).toContain("## 1 Intro");
    expect(md).toContain("### 1.1 Part");
    expect(md).toContain("See Figure 2 and (Kato & Lee, 2020).[^1]");
    expect(md).toContain("[^1]: A note");
    expect(md).toContain("$$E=mc^2$$ (1)");
    expect(md).toContain("![[Softness of seats]]");
    expect(md).toContain("*Figure 2. Second*");
    expect(md).toContain("| A | B |");
    expect(md).toContain("Kato, R. & Lee, S. (2020)");
  });
  it("copes with an empty document", () => {
    expect(docToMarkdown({ type: "doc" }, [], DEFAULT_LAYOUT)).toBe("\n");
  });
});

describe("as LaTeX", () => {
  const tex = docToLatex(sample, assets, { ...DEFAULT_LAYOUT, numberHeadings: true, columns: 2, citeStyle: "ieee" }, () => "images/a.png");
  it("is a complete document", () => {
    expect(tex).toContain("\\documentclass[a4paper,twocolumn]{article}");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
    expect(tex).toContain("\\title{My paper}");
    expect(tex).toContain("\\maketitle");
  });
  it("uses real LaTeX for what matters in a paper", () => {
    expect(tex).toContain("\\section{Intro}");
    expect(tex).toContain("\\subsection{Part}");
    expect(tex).toMatch(/\\cite\{ref\w+\}/);
    expect(tex).toMatch(/\\bibitem\{ref\w+\}/);
    expect(tex).toContain("\\footnote{A note}");
    expect(tex).toContain("\\begin{equation}\nE=mc^2");
    expect(tex).toContain("\\includegraphics[width=0.9\\linewidth]{images/a.png}");
    expect(tex).toMatch(/Figure~\\ref\{labf2\}/);
    expect(tex).toContain("\\begin{tabular}{ll}");
    expect(tex).toContain("\\caption{Scores}");
  });
  it("leaves heading numbers to LaTeX, or turns them off", () => {
    expect(docToLatex(sample, assets, DEFAULT_LAYOUT, () => null)).toContain("\\section*{Intro}");
  });
  it("says so when a picture isn't included", () => {
    expect(docToLatex(sample, assets, DEFAULT_LAYOUT, () => null)).toContain("Picture not in this export");
  });
  it("escapes text, but leaves math alone", () => {
    expect(latexEscape("100% of $5 & a_b #1 {x} ~ ^ \\")).toBe("100\\% of \\$5 \\& a\\_b \\#1 \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}");
  });
  it("can't be broken by a note's text", () => {
    const out = docToLatex({ type: "doc", content: [para(text("\\end{document} evil"))] }, [], DEFAULT_LAYOUT, () => null);
    expect(out.match(/\\end\{document\}/g)).toHaveLength(1);
  });
});

describe("the paper template", () => {
  const t = paperTemplate("On chairs");
  it("has the usual sections, ending in references", () => {
    const heads = docStructure(t).headings.map((h) => h.text);
    expect(heads).toEqual(["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "Acknowledgements", "References"]);
    expect(t.content![t.content!.length - 1].type).toBe("bibliography");
    expect(t.content![0].content![0].text).toBe("On chairs");
  });
});

describe("layout", () => {
  it("fills in what isn't saved", () => {
    expect(cleanLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(cleanLayout({ columns: 2 }).columns).toBe(2);
    expect(cleanLayout({ columns: 2 }).citeStyle).toBe("apa");
  });
});

describe("from Markdown", () => {
  const nodes = (md: string, list = [{ id: "a1", title: "Chair" }]) => markdownToNodes(md, list, (src) => marked.lexer(src) as unknown[]);

  it("keeps structure and emphasis", () => {
    const n = nodes("# Head\n\nSome **bold** and *soft*\n\n- one\n- two\n\n> quoted\n\n---\n");
    expect(n.map((x) => x.type)).toEqual(["heading", "paragraph", "bulletList", "blockquote", "horizontalRule"]);
    expect(n[1].content![1]).toEqual({ type: "text", text: "bold", marks: [{ type: "bold" }] });
  });

  it("keeps TeX exactly, which Markdown would otherwise damage", () => {
    const n = nodes("Load $\\frac{a_b}{c_d}\\{x\\}$ here\n\n$$E=mc^2$$\n");
    expect(n[0].content![1]).toEqual({ type: "mathInline", attrs: { tex: "\\frac{a_b}{c_d}\\{x\\}" } });
    expect(n[1].type).toBe("mathBlock");
    expect(n[1].attrs!.tex).toBe("E=mc^2");
  });

  it("doesn't mistake prices for formulas", () => {
    expect(nodes("It cost $5 and $6 today")[0].content).toEqual([{ type: "text", text: "It cost $5 and $6 today" }]);
  });

  it("leaves code alone", () => {
    const n = nodes("```\n$x$ ![[Chair]]\n```\n");
    expect(n[0].type).toBe("codeBlock");
    expect(n[0].content![0].text).toBe("$x$ ![[Chair]]");
  });

  it("makes a Library picture a figure, with its credit as the caption", () => {
    const [figure] = nodes("![[chair]]\n\n*Figure: Rin Kato, Chair*\n");
    expect(figure.type).toBe("figure");
    expect(figure.attrs!.assetId).toBe("a1");
    expect(figure.attrs!.caption).toBe("Rin Kato, Chair");
  });

  it("never loads a web image, and says when a name isn't found", () => {
    expect(nodes("![x](https://evil.example/a.png)")[0].content!.every((c) => c.type === "text")).toBe(true);
    expect(textOf(nodes("![[Nope]]")[0])).toContain('No picture called "Nope"');
  });

  it("reads tables and task lists", () => {
    const n = nodes("| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] not\n");
    expect(n[0].type).toBe("table");
    expect(n[0].content![0].content![0].type).toBe("tableHeader");
    expect(n[0].content![1].content![1].content![0].content![0].text).toBe("2");
    expect(n[1].type).toBe("taskList");
    expect(n[1].content![0].attrs!.checked).toBe(true);
  });

  it("gives nothing for nothing", () => {
    expect(nodes("")).toEqual([]);
  });
});
