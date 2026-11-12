/** Everything about turning what the user typed, or what a web page sent, into safe app data. */
export type EngineId = "duckduckgo" | "google" | "bing" | "brave";

export const ENGINES: Record<EngineId, { name: string; web: string; images: string }> = {
  duckduckgo: {
    name: "DuckDuckGo",
    web: "https://duckduckgo.com/?q={q}",
    images: "https://duckduckgo.com/?q={q}&iax=images&ia=images",
  },
  google: {
    name: "Google",
    web: "https://www.google.com/search?q={q}",
    images: "https://www.google.com/search?q={q}&udm=2",
  },
  bing: {
    name: "Bing",
    web: "https://www.bing.com/search?q={q}",
    images: "https://www.bing.com/images/search?q={q}",
  },
  brave: {
    name: "Brave Search",
    web: "https://search.brave.com/search?q={q}",
    images: "https://search.brave.com/images?q={q}",
  },
};

export function searchUrl(engine: EngineId, query: string, images = false): string {
  const e = ENGINES[engine] ?? ENGINES.duckduckgo;
  return (images ? e.images : e.web).replace("{q}", encodeURIComponent(query));
}

/** Looks like an address rather than search words? Returns it normalised, else null. */
export function asWebUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).href;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/]+:\d+/.test(text)) return null; // other schemes
  if (/^([\p{L}\p{N}-]+\.)+\p{L}{2,}(:\d+)?([/?#].*)?$/u.test(text)) {
    try {
      return new URL(`https://${text}`).href;
    } catch {
      return null;
    }
  }
  return null;
}

/** An address opens directly; anything else goes to the chosen search engine. */
export const resolveBrowserInput = (input: string, engine: EngineId, images = false) =>
  asWebUrl(input) ?? searchUrl(engine, input.trim(), images);

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const SEARCH_HOSTS = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|search\.brave\.com|images\.search\.yahoo\.com|yandex\.[a-z]+|pinterest\.[a-z.]+)$/;

/**
 * A search-results page isn't where an image came from, so crediting it would be a false
 * credit. Images saved from one stay "no source yet" until the user fills in the real source.
 */
export const isAggregator = (url: string) => SEARCH_HOSTS.test(hostOf(url));

export interface CapturedImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}
export interface CapturePage {
  pageUrl: string;
  pageTitle: string;
  author: string;
  site: string;
}
export interface CapturedSnip {
  url: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}
export interface Capture {
  kind: "image" | "page" | "selection" | "snip";
  page: CapturePage;
  images: CapturedImage[];
  /** What was highlighted, for a selection. */
  text?: string;
  /** Only ever made by the app itself: parseCapture can't produce one, so a page can't fake it. */
  snip?: CapturedSnip;
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const webUrl = (v: unknown): string | null => {
  const s = str(v, 4096);
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

const MAX_QUOTE = 20000;

/** A Library title for a saved quote: its first line, cut at a word if it's long. */
export function quoteTitle(text: string, max = 90): string {
  const line = text.trim().split("\n")[0].trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Capture payloads come from arbitrary web pages. Nothing is trusted until it has been through here. */
export function parseCapture(raw: string): Capture | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const page = (o.page ?? {}) as Record<string, unknown>;
  const pageUrl = webUrl(page.pageUrl);
  if (!pageUrl) return null;
  const images: CapturedImage[] = [];
  for (const item of Array.isArray(o.images) ? o.images.slice(0, 120) : []) {
    const i = (item ?? {}) as Record<string, unknown>;
    const src = webUrl(i.src);
    if (src) {
      images.push({
        src,
        alt: str(i.alt),
        width: Number(i.width) || 0,
        height: Number(i.height) || 0,
      });
    }
  }
  const selection = o.kind === "selection";
  const text = selection ? str(o.text, MAX_QUOTE).trim().replace(/\n{3,}/g, "\n\n") : "";
  if (selection && !text && !images.length) return null;
  return {
    ...(selection ? { text } : {}),
    kind: selection ? "selection" : o.kind === "image" ? "image" : "page",
    page: { pageUrl, pageTitle: str(page.pageTitle), author: str(page.author), site: str(page.site) },
    images,
  };
}

export interface DraftCredit {
  title: string;
  credit: string;
  via: string;
  source_url: string;
}

export function draftCredit(page: CapturePage, alt = ""): DraftCredit {
  const via = page.site || hostOf(page.pageUrl);
  const aggregator = isAggregator(page.pageUrl);
  return {
    title: alt.trim() || page.pageTitle.trim() || "Untitled",
    credit: aggregator ? "" : page.author.trim() || via,
    via: hostOf(page.pageUrl),
    source_url: page.pageUrl,
  };
}
