/**
 * Citations and bibliographies, built from what's saved in the Library. A reference can only be as
 * complete as what was saved with it, so anything missing is left out or marked "n.d." rather than
 * invented. These follow each style's common pattern, and aren't a substitute for checking the
 * finished list against a journal's own rules.
 */
import { Asset } from "../data/types";

export type CiteStyle = "apa" | "mla" | "chicago" | "harvard" | "ieee" | "vancouver";

export const CITE_STYLES: { id: CiteStyle; label: string; numeric: boolean }[] = [
  { id: "apa", label: "APA", numeric: false },
  { id: "mla", label: "MLA", numeric: false },
  { id: "chicago", label: "Chicago", numeric: false },
  { id: "harvard", label: "Harvard", numeric: false },
  { id: "ieee", label: "IEEE", numeric: true },
  { id: "vancouver", label: "Vancouver", numeric: true },
];

export const isNumeric = (style: CiteStyle) => CITE_STYLES.find((s) => s.id === style)?.numeric ?? false;

export interface Reference {
  id: string;
  title: string;
  authors: { given: string; family: string }[];
  etAl: boolean;
  year: string;
  venue: string;
  url: string;
}

/** "Rin Kato", "Kato, Rin" and "Kato R" all mean the same person. */
export function parseAuthor(raw: string): { given: string; family: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.includes(",")) {
    const [family, given] = name.split(",", 2).map((p) => p.trim());
    return { given: given ?? "", family };
  }
  const parts = name.split(" ");
  // "Kato R": a surname, then initials.
  if (parts.length >= 2 && /^[A-Z]\.?([A-Z]\.?)*$/.test(parts[parts.length - 1])) {
    return { family: parts.slice(0, -1).join(" "), given: parts[parts.length - 1] };
  }
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

const YEAR = /\b(1[5-9]\d\d|20\d\d)\b/;

export function referenceFrom(asset: Pick<Asset, "id" | "title" | "credit" | "tags" | "source_url">): Reference {
  let credit = (asset.credit ?? "").trim();
  if (/^(yours|no source yet)$/i.test(credit)) credit = "";
  const year = YEAR.exec(asset.tags ?? "")?.[1] ?? YEAR.exec(credit)?.[1] ?? "";
  const etAl = /\bet al\.?/i.test(credit);
  const names = credit
    .replace(/\bet al\.?/gi, "")
    .replace(YEAR, "")
    .replace(/[(),\s]+$/g, "")
    .replace(/^[(),\s]+/g, "");
  // "Kato, Rin" is one person, but "Rin Kato, Sam Lee" is two.
  const pieces = names.split(/\s*(?:;|\band\b|&)\s*/i).flatMap((p) => (/^[^,]+,\s*[^,\s]+$/.test(p) && !/\s/.test(p.split(",")[0].trim()) ? [p] : p.split(/\s*,\s*/)));
  return {
    id: asset.id,
    title: asset.title.trim(),
    authors: pieces.filter(Boolean).map(parseAuthor),
    etAl,
    year,
    venue: (asset.tags ?? "").replace(YEAR, "").trim(),
    url: asset.source_url ?? "",
  };
}

const initials = (given: string, dots = true) =>
  given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => g[0].toUpperCase() + (dots ? "." : ""))
    .join(dots ? " " : "");

const sentence = (text: string) => (text && !/[.?!]$/.test(text) ? `${text}.` : text);

function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${and} ${names[names.length - 1]}`;
}

/** One entry in the reference list. */
export function formatReference(r: Reference, style: CiteStyle, number?: number): string {
  const year = r.year || "n.d.";
  const more = r.etAl ? ", et al." : "";
  const family = r.authors.map((a) => a.family);
  const venue = r.venue ? ` ${r.venue}.` : "";
  const url = r.url ? ` ${r.url}` : "";
  switch (style) {
    case "apa": {
      const who = joinNames(r.authors.map((a) => `${a.family}${a.given ? `, ${initials(a.given)}` : ""}`), "&") + more;
      return `${who ? `${sentence(who)} ` : ""}(${year}). ${sentence(r.title)}${venue}${url}`;
    }
    case "harvard": {
      const who = joinNames(r.authors.map((a) => `${a.family}${a.given ? `, ${initials(a.given)}` : ""}`), "and") + more;
      return `${who ? `${who} ` : ""}(${year}) ${sentence(r.title)}${venue}${url}`;
    }
    case "mla": {
      const [first, ...rest] = r.authors;
      const lead = first ? `${first.family}${first.given ? `, ${first.given}` : ""}` : "";
      const who = rest.length > 1 || r.etAl ? `${lead}, et al.` : rest.length ? `${lead}, and ${rest[0].given} ${rest[0].family}`.trim() : lead;
      return `${who ? `${sentence(who)} ` : ""}"${sentence(r.title)}"${venue}${r.year ? ` ${r.year}.` : ""}${url}`;
    }
    case "chicago": {
      const [first, ...rest] = r.authors;
      const lead = first ? `${first.family}${first.given ? `, ${first.given}` : ""}` : "";
      const who = joinNames([lead, ...rest.map((a) => `${a.given} ${a.family}`.trim())].filter(Boolean), "and") + more;
      return `${who ? `${sentence(who)} ` : ""}${year}. "${sentence(r.title)}"${venue}${url}`;
    }
    case "ieee": {
      const who = joinNames(r.authors.map((a) => `${a.given ? `${initials(a.given)} ` : ""}${a.family}`), "and") + (r.etAl ? " et al." : "");
      return `[${number ?? "?"}] ${who ? `${who}, ` : ""}"${r.title}"${r.venue ? `, ${r.venue}` : ""}${r.year ? `, ${r.year}` : ""}.${url}`;
    }
    case "vancouver": {
      const who = r.authors.map((a) => `${a.family}${a.given ? ` ${initials(a.given, false)}` : ""}`).join(", ") + more;
      return `${number ?? "?"}. ${who ? `${sentence(who)} ` : ""}${sentence(r.title)}${venue}${r.year ? ` ${r.year}.` : ""}${url}`;
    }
  }
  return family.join(", ");
}

const shortAuthors = (r: Reference, and: string) => {
  const names = r.authors.map((a) => a.family);
  if (!names.length) return r.title.length > 30 ? `${r.title.slice(0, 30).trim()}…` : r.title;
  if (r.etAl || names.length > 2) return `${names[0]} et al.`;
  return names.join(` ${and} `);
};

/** The mark in the text: [1], or (Kato, 2020). */
export function formatInText(refs: Reference[], style: CiteStyle, numbers: Map<string, number>, page = ""): string {
  if (!refs.length) return "[no source]";
  const at = page.trim();
  if (isNumeric(style)) {
    const list = refs.map((r) => numbers.get(r.id) ?? "?").join(", ");
    return `[${list}${at ? `, p. ${at}` : ""}]`;
  }
  if (style === "mla") return `(${refs.map((r) => `${shortAuthors(r, "and")}${at ? ` ${at}` : ""}`).join("; ")})`;
  const and = style === "apa" ? "&" : "and";
  return `(${refs.map((r) => `${shortAuthors(r, and)}${style === "chicago" ? " " : ", "}${r.year || "n.d."}${at ? `, p. ${at}` : ""}`).join("; ")})`;
}

/** Numeric styles number by first use. The others run alphabetically by author. */
export function orderReferences(cited: string[], refs: Map<string, Reference>, style: CiteStyle): Reference[] {
  const list = [...new Set(cited)].map((id) => refs.get(id)).filter((r): r is Reference => !!r);
  if (isNumeric(style)) return list;
  const key = (r: Reference) => `${r.authors[0]?.family ?? r.title} ${r.year}`.toLowerCase();
  return [...list].sort((a, b) => key(a).localeCompare(key(b)));
}

export interface ParsedBib {
  type: string;
  key: string;
  title: string;
  credit: string;
  tags: string;
  url: string;
}

/** Reads BibTeX, such as an export from Zotero or a journal's "cite this" link. Damaged entries are skipped. */
export function parseBibtex(text: string): ParsedBib[] {
  const out: ParsedBib[] = [];
  const head = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(text))) {
    const type = m[1].toLowerCase();
    if (["comment", "preamble", "string"].includes(type)) continue;
    // Walk to this entry's closing brace, as field values hold braces of their own.
    let depth = 1;
    let i = head.lastIndex;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    const body = text.slice(head.lastIndex, i - 1);
    head.lastIndex = i;
    const fields = readFields(body);
    const title = clean(fields.title ?? "");
    if (!title) continue;
    const authors = clean(fields.author ?? fields.editor ?? "")
      .split(/\s+and\s+/i)
      .filter(Boolean);
    const venue = clean(fields.journal ?? fields.booktitle ?? fields.publisher ?? "");
    const year = /\d{4}/.exec(fields.year ?? fields.date ?? "")?.[0] ?? "";
    const doi = clean(fields.doi ?? "");
    out.push({
      type,
      key: m[2],
      title,
      credit: authors.join("; "),
      tags: [venue, year].filter(Boolean).join(" "),
      url: clean(fields.url ?? "") || (doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : ""),
    });
  }
  return out;
}

function readFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const name = /\s*,?\s*([\w-]+)\s*=\s*/y;
    name.lastIndex = i;
    const m = name.exec(body);
    if (!m) break;
    i = name.lastIndex;
    let value: string;
    if (body[i] === "{") {
      let depth = 1;
      let j = i + 1;
      for (; j < body.length && depth > 0; j++) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
      }
      value = body.slice(i + 1, j - 1);
      i = j;
    } else if (body[i] === '"') {
      const j = body.indexOf('"', i + 1);
      value = body.slice(i + 1, j < 0 ? undefined : j);
      i = j < 0 ? body.length : j + 1;
    } else {
      const j = /[,\n}]/.exec(body.slice(i));
      value = body.slice(i, j ? i + j.index : undefined);
      i += j ? j.index : value.length;
    }
    out[m[1].toLowerCase()] = value.trim();
  }
  return out;
}

const ACCENT: Record<string, string> = { '"a': "ä", '"o': "ö", '"u': "ü", "'e": "é", "`e": "è", "'a": "á", "~n": "ñ" };

function clean(value: string): string {
  return value
    .replace(/\\([`'"^~])\{?([a-zA-Z])\}?/g, (_m, accent, ch) => ACCENT[`${accent}${ch}`] ?? ch)
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
