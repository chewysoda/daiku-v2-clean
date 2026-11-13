/**
 * Turns an uploaded file into Markdown, in the spirit of Microsoft's MarkItDown, but in the app itself, so nothing
 * leaves the machine and no Python is needed. Word, Excel, PowerPoint, PDF, HTML, CSV, JSON and plain text all come
 * out as readable Markdown: headings, lists, tables and page or slide breaks kept where the file has them.
 */
import { strFromU8, unzipSync } from "fflate";

export interface Converted {
  markdown: string;
  /** What the file was read as, shown beside it: "Word", "PDF", "CSV"... */
  format: string;
}

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";

const TEXT = ["md", "markdown", "txt", "text", "log", "rst"];
const CODE: Record<string, string> = {
  json: "json", xml: "xml", yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini",
  py: "python", js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx", rs: "rust", sql: "sql",
  c: "c", cpp: "cpp", h: "c", java: "java", go: "go", sh: "bash", ps1: "powershell", css: "css",
};

/** Every extension the upload tool accepts, for the file picker. */
export const MARKDOWN_EXTENSIONS = [...TEXT, ...Object.keys(CODE), "csv", "tsv", "html", "htm", "docx", "xlsx", "pptx", "pdf"];

export async function toMarkdown(name: string, bytes: Uint8Array): Promise<Converted> {
  const ext = extOf(name);
  if (TEXT.includes(ext)) return { markdown: decode(bytes).trim(), format: ext === "md" || ext === "markdown" ? "Markdown" : "Text" };
  if (ext === "csv" || ext === "tsv") return { markdown: delimitedToMarkdown(decode(bytes), ext === "tsv" ? "\t" : ","), format: ext.toUpperCase() };
  if (ext === "json") return { markdown: fence(prettyJson(decode(bytes)), "json"), format: "JSON" };
  if (CODE[ext]) return { markdown: fence(decode(bytes), CODE[ext]), format: ext.toUpperCase() };
  if (ext === "html" || ext === "htm") return { markdown: htmlToMarkdown(decode(bytes)), format: "HTML" };
  if (ext === "xlsx") return { markdown: xlsxToMarkdown(bytes), format: "Excel" };
  if (ext === "pptx") return { markdown: pptxToMarkdown(bytes), format: "PowerPoint" };
  if (ext === "docx") return { markdown: await docxToMarkdown(bytes), format: "Word" };
  if (ext === "pdf") return { markdown: await pdfToMarkdown(bytes), format: "PDF" };
  throw new Error(`.${ext || "?"} files can't be read as Markdown yet`);
}

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes).replace(/^\u{FEFF}/u, "");

function fence(text: string, lang: string) {
  // A fence longer than any run of backticks inside, so code containing ``` stays whole.
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const bar = "`".repeat(longest + 1);
  return `${bar}${lang}\n${text.replace(/\s+$/, "")}\n${bar}`;
}

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const cell = (text: string) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

/** Rows as a Markdown table, the first row as its header. Short rows are padded so the table stays square. */
export function tableMarkdown(rows: string[][]): string {
  const kept = rows.filter((r) => r.some((c) => c.trim()));
  if (!kept.length) return "";
  const width = Math.max(...kept.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => cell(r[i] ?? ""));
  const [head, ...body] = kept.map(pad);
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

/** CSV or TSV, with quoted fields that may hold commas, quotes or line breaks. */
export function parseDelimited(text: string, sep = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const delimitedToMarkdown = (text: string, sep = ",") => tableMarkdown(parseDelimited(text, sep));

/** HTML as Markdown: headings, paragraphs, emphasis, links, lists, quotes, code and tables. Scripts and styles are dropped. */
export function htmlToMarkdown(html: string): string {
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom.querySelectorAll("script, style, noscript, template, head").forEach((n) => n.remove());
  return tidy(block(dom.body));
}

const tidy = (md: string) => md.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!(node instanceof Element)) return "";
  const kids = () => Array.from(node.childNodes).map(inline).join("");
  switch (node.tagName.toLowerCase()) {
    case "strong":
    case "b": {
      const t = kids().trim();
      return t ? `**${t}**` : "";
    }
    case "em":
    case "i": {
      const t = kids().trim();
      return t ? `*${t}*` : "";
    }
    case "code":
      return `\`${node.textContent ?? ""}\``;
    case "br":
      return "  \n";
    case "a": {
      const href = node.getAttribute("href");
      const t = kids().trim();
      return href && !href.startsWith("javascript:") ? `[${t || href}](${href})` : t;
    }
    case "img": {
      const alt = node.getAttribute("alt");
      return alt ? `![${alt}]` : "";
    }
    default:
      return kids();
  }
}

const BLOCKS = new Set(["p", "div", "section", "article", "main", "header", "footer", "aside", "nav", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "pre", "blockquote", "table", "hr", "dl", "dt", "dd"]);

function block(el: Element, depth = 0): string {
  const out: string[] = [];
  let line = "";
  const flush = () => {
    if (line.trim()) out.push(line.trim());
    line = "";
  };
  for (const node of Array.from(el.childNodes)) {
    const tag = node instanceof Element ? node.tagName.toLowerCase() : "";
    if (!BLOCKS.has(tag)) {
      line += inline(node);
      continue;
    }
    flush();
    const e = node as Element;
    if (/^h[1-6]$/.test(tag)) out.push(`${"#".repeat(Number(tag[1]))} ${inline(e).trim()}`);
    else if (tag === "ul" || tag === "ol") out.push(list(e, tag === "ol", depth));
    else if (tag === "pre") out.push(fence(e.textContent ?? "", e.querySelector("code")?.className.match(/language-(\w+)/)?.[1] ?? ""));
    else if (tag === "blockquote")
      out.push(
        block(e, depth)
          .split("\n")
          .map((l) => `> ${l}`.trimEnd())
          .join("\n"),
      );
    else if (tag === "table") out.push(tableMarkdown(Array.from(e.querySelectorAll("tr")).map((tr) => Array.from(tr.querySelectorAll("th, td")).map((c) => inline(c).trim()))));
    else if (tag === "hr") out.push("---");
    else out.push(block(e, depth));
  }
  flush();
  return out.filter((s) => s.trim()).join("\n\n");
}

function list(el: Element, ordered: boolean, depth: number): string {
  const indent = "  ".repeat(depth);
  return Array.from(el.children)
    .filter((li) => li.tagName.toLowerCase() === "li")
    .map((li, i) => {
      const nested = Array.from(li.children).filter((c) => /^(ul|ol)$/i.test(c.tagName));
      nested.forEach((n) => n.remove());
      const own = block(li, depth + 1).replace(/\n\n/g, "\n");
      const sub = nested.map((n) => list(n, n.tagName.toLowerCase() === "ol", depth + 1)).join("\n");
      return `${indent}${ordered ? `${i + 1}.` : "-"} ${own}${sub ? `\n${sub}` : ""}`;
    })
    .join("\n");
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const byLocal = (doc: Document | Element, name: string) => Array.from(doc.getElementsByTagName("*")).filter((e) => e.localName === name);

/** "B12" → column index 1. */
const columnOf = (ref: string) => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
};

/** Each sheet as a heading and a table. Formulas show their last saved value, as Excel does. */
export function xlsxToMarkdown(bytes: Uint8Array): string {
  const zip = unzipSync(bytes);
  const read = (path: string) => (zip[path] ? strFromU8(zip[path]) : "");
  const shared = byLocal(xml(read("xl/sharedStrings.xml")), "si").map((si) => byLocal(si, "t").map((t) => t.textContent ?? "").join(""));
  const rels = new Map(byLocal(xml(read("xl/_rels/workbook.xml.rels")), "Relationship").map((r) => [r.getAttribute("Id"), r.getAttribute("Target") ?? ""]));
  const sheets = byLocal(xml(read("xl/workbook.xml")), "sheet").map((s, i) => {
    const rid = s.getAttribute("r:id") ?? Array.from(s.attributes).find((a) => a.localName === "id")?.value;
    const target = (rid && rels.get(rid)) || `worksheets/sheet${i + 1}.xml`;
    return { name: s.getAttribute("name") ?? `Sheet ${i + 1}`, path: target.startsWith("/") ? target.slice(1) : `xl/${target}` };
  });
  const parts = sheets.map(({ name, path }) => {
    const rows = byLocal(xml(read(path)), "row").map((row) => {
      const cells: string[] = [];
      for (const c of byLocal(row, "c")) {
        const type = c.getAttribute("t");
        const v = byLocal(c, "v")[0]?.textContent ?? "";
        const text = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? byLocal(c, "t").map((t) => t.textContent).join("") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
        cells[columnOf(c.getAttribute("r") ?? "")] = text;
      }
      return Array.from(cells, (x) => x ?? "");
    });
    const table = tableMarkdown(rows);
    return `## ${name}\n\n${table || "(empty)"}`;
  });
  return parts.join("\n\n") || "(no sheets)";
}

/** Each slide as a heading with its text, then its speaker notes. */
export function pptxToMarkdown(bytes: Uint8Array): string {
  const zip = unzipSync(bytes);
  const number = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);
  const slides = Object.keys(zip)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => number(a) - number(b));
  const paragraphs = (doc: Document | Element) =>
    byLocal(doc, "p")
      .map((p) => byLocal(p, "t").map((t) => t.textContent ?? "").join("").trim())
      .filter(Boolean);
  return (
    slides
      .map((path) => {
        const n = number(path);
        const doc = xml(strFromU8(zip[path]));
        const title = byLocal(doc, "sp").find((sp) => byLocal(sp, "ph").some((ph) => /title/i.test(ph.getAttribute("type") ?? "")));
        const titleText = title ? paragraphs(title).join(" ") : "";
        const body = paragraphs(doc).filter((t) => t !== titleText);
        const notesPath = `ppt/notesSlides/notesSlide${n}.xml`;
        const notes = zip[notesPath] ? paragraphs(xml(strFromU8(zip[notesPath]))).filter((t) => !/^\d+$/.test(t)) : [];
        return [`## Slide ${n}${titleText ? `: ${titleText}` : ""}`, body.map((t) => `- ${t}`).join("\n"), notes.length ? `> Notes: ${notes.join(" ")}` : ""].filter(Boolean).join("\n\n");
      })
      .join("\n\n") || "(no slides)"
  );
}

async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return htmlToMarkdown(value);
}

/** The text of each page, under a page heading. Scanned pages with no text say so rather than vanishing. */
async function pdfToMarkdown(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : "");
    }
    const body = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    pages.push(`## Page ${n}\n\n${body || "(no text on this page: it may be a scan)"}`);
  }
  return pages.join("\n\n");
}
