import { isTauri, native } from "./platform";

/** Free, open scholarly indexes. No API keys, no paid tiers. */
export type ScholarSource = "OpenAlex" | "Semantic Scholar" | "arXiv" | "Crossref";
export const SCHOLAR_SOURCES: ScholarSource[] = ["OpenAlex", "Semantic Scholar", "arXiv", "Crossref"];

export interface Paper {
  key: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  citedBy: number | null;
  url: string;
  openAccess: boolean;
  source: ScholarSource;
}

export interface ScholarOptions {
  since: number | null;
  openAccessOnly: boolean;
}

export function requestUrl(source: ScholarSource, q: string, o: ScholarOptions): string {
  const query = encodeURIComponent(q);
  const year = o.since ?? 0;
  switch (source) {
    case "OpenAlex": {
      const filters = [
        o.since ? `from_publication_date:${o.since}-01-01` : "",
        o.openAccessOnly ? "open_access.is_oa:true" : "",
      ].filter(Boolean);
      return `https://api.openalex.org/works?search=${query}&per-page=12${filters.length ? `&filter=${filters.join(",")}` : ""}`;
    }
    case "Semantic Scholar":
      return (
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=12` +
        `&fields=title,authors,year,venue,citationCount,url,isOpenAccess,openAccessPdf` +
        (o.since ? `&year=${year}-` : "") +
        (o.openAccessOnly ? "&openAccessPdf" : "")
      );
    case "arXiv":
      return `https://export.arxiv.org/api/query?search_query=all:${query}&max_results=12&sortBy=relevance`;
    case "Crossref":
      return (
        `https://api.crossref.org/works?query=${query}&rows=12&select=DOI,title,author,issued,container-title,is-referenced-by-count,URL` +
        (o.since ? `&filter=from-pub-date:${o.since}` : "")
      );
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- third-party JSON, read defensively below */
export function parseOpenAlex(json: any): Paper[] {
  return (json?.results ?? []).map((w: any) => ({
    key: `openalex:${w.id}`,
    title: w.display_name || w.title || "Untitled",
    authors: (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? "",
    citedBy: w.cited_by_count ?? null,
    url: w.primary_location?.landing_page_url || w.doi || w.id,
    openAccess: Boolean(w.open_access?.is_oa),
    source: "OpenAlex",
  }));
}

export function parseSemanticScholar(json: any): Paper[] {
  return (json?.data ?? []).map((p: any) => ({
    key: `s2:${p.paperId ?? p.url}`,
    title: p.title || "Untitled",
    authors: (p.authors ?? []).map((a: any) => a.name).filter(Boolean),
    year: p.year ?? null,
    venue: p.venue ?? "",
    citedBy: p.citationCount ?? null,
    url: p.openAccessPdf?.url || p.url,
    openAccess: Boolean(p.isOpenAccess),
    source: "Semantic Scholar",
  }));
}

export function parseCrossref(json: any): Paper[] {
  return (json?.message?.items ?? []).map((w: any) => ({
    key: `crossref:${w.DOI}`,
    title: w.title?.[0] || "Untitled",
    authors: (w.author ?? [])
      .map((a: any) => [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean),
    year: w.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: w["container-title"]?.[0] ?? "",
    citedBy: w["is-referenced-by-count"] ?? null,
    url: w.URL || `https://doi.org/${w.DOI}`,
    openAccess: false,
    source: "Crossref",
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function parseArxiv(xml: string): Paper[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return [...doc.getElementsByTagName("entry")].map((e) => {
    const text = (tag: string) => clean(e.getElementsByTagName(tag)[0]?.textContent);
    const id = text("id");
    const year = parseInt(text("published").slice(0, 4), 10);
    return {
      key: `arxiv:${id}`,
      title: text("title") || "Untitled",
      authors: [...e.getElementsByTagName("author")]
        .map((a) => clean(a.getElementsByTagName("name")[0]?.textContent))
        .filter(Boolean),
      year: Number.isNaN(year) ? null : year,
      venue: "arXiv preprint",
      citedBy: null,
      url: id,
      openAccess: true,
      source: "arXiv" as const,
    };
  });
}

async function fetchText(url: string): Promise<string> {
  if (isTauri) return native.scholarGet(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`returned ${res.status}`);
  return res.text();
}

export interface SourceResult {
  source: ScholarSource;
  papers: Paper[];
  error: string | null;
}

export async function searchSource(
  source: ScholarSource,
  q: string,
  o: ScholarOptions,
): Promise<SourceResult> {
  try {
    const text = await fetchText(requestUrl(source, q, o));
    let papers: Paper[];
    if (source === "arXiv") papers = parseArxiv(text);
    else {
      const json = JSON.parse(text);
      papers =
        source === "OpenAlex"
          ? parseOpenAlex(json)
          : source === "Crossref"
            ? parseCrossref(json)
            : parseSemanticScholar(json);
    }
    // Some indexes can't filter server-side, so apply the user's filters here too.
    papers = papers.filter(
      (p) =>
        (!o.since || (p.year ?? 0) >= o.since) &&
        // Crossref doesn't report open-access status, so it can't satisfy this filter.
        (!o.openAccessOnly || p.openAccess),
    );
    return { source, papers, error: null };
  } catch (e) {
    return { source, papers: [], error: String(e instanceof Error ? e.message : e) };
  }
}

export const paperCredit = (p: Paper) => {
  const who = p.authors.length > 2 ? `${p.authors[0]} et al.` : p.authors.join(", ");
  return [who, p.year].filter(Boolean).join(", ");
};
