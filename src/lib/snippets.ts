/**
 * Saved code as reusable snippets: what kind of piece it is, what stack it's for, and a page to run it on.
 * The page only ever runs in a sandboxed frame with no access to the app (see SnippetPreview).
 */
import { Asset } from "../data/types";
import { languageOf } from "./github";

export const SNIPPET_KINDS = ["button", "hover", "scroll", "hero", "nav", "form", "animation", "layout"] as const;
export const SNIPPET_STACKS = ["html-css", "react", "tailwind"] as const;
export type SnippetKind = (typeof SNIPPET_KINDS)[number];
export type SnippetStack = (typeof SNIPPET_STACKS)[number];

const tagValue = (tags: string, key: string) => new RegExp(`(?:^|\\s)${key}:([a-z0-9-]+)`, "i").exec(tags)?.[1]?.toLowerCase() ?? null;

export const kindOf = (a: Pick<Asset, "tags">) => {
  const v = tagValue(a.tags, "kind");
  return (SNIPPET_KINDS as readonly string[]).includes(v ?? "") ? (v as SnippetKind) : null;
};
export const stackOf = (a: Pick<Asset, "tags">) => {
  const v = tagValue(a.tags, "stack");
  return (SNIPPET_STACKS as readonly string[]).includes(v ?? "") ? (v as SnippetStack) : null;
};

/** Sets or clears one "key:value" tag, leaving the rest alone. */
export function withTag(tags: string, key: "kind" | "stack", value: string | null): string {
  const rest = tags.split(/\s+/).filter((t) => t && !t.toLowerCase().startsWith(`${key}:`));
  return [...rest, ...(value ? [`${key}:${value}`] : [])].join(" ");
}

/** Snippets marked for reuse travel with "use, don't rewrite". */
export const isReusable = (a: Pick<Asset, "tags" | "kind">) => a.kind === "code" && /(?:^|\s)reuse(?:\s|$)/.test(a.tags);
export const setReusable = (tags: string, on: boolean) => [...tags.split(/\s+/).filter((t) => t && t !== "reuse"), ...(on ? ["reuse"] : [])].join(" ");

/** Only plain web code can run as-is. React and the rest need a build, so they're shown, not run. */
export function canPreview(a: Pick<Asset, "tags" | "title" | "kind">): boolean {
  if (a.kind !== "code") return false;
  return ["html", "css", "javascript", "js", "svg"].includes(languageOf(a).toLowerCase());
}

/**
 * A whole page for the frame. CSS is wrapped in a style tag over a few sample elements, and script runs
 * as-is. A strict policy blocks every network request, so a snippet can't load or send anything.
 */
export function previewDoc(a: Pick<Asset, "tags" | "title" | "notes">): string {
  const lang = languageOf(a).toLowerCase();
  const code = a.notes;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:">`;
  const base = `<style>html,body{margin:0;min-height:100%;font:14px system-ui,sans-serif;color:#1e1f1c;background:#fbfaf7}body{padding:16px;box-sizing:border-box}</style>`;
  const stage = `<button>Button</button> <a href="#">A link</a><nav><a href="#">Home</a> <a href="#">Work</a></nav><div class="card">A card</div>`;
  const body =
    lang === "css"
      ? `<style>${code.replace(/<\/style/gi, "<\\/style")}</style>${stage}`
      : lang === "javascript" || lang === "js"
        ? `${stage}<script>${code.replace(/<\/script/gi, "<\\/script")}</script>`
        : code;
  return `<!doctype html><html><head><meta charset="utf-8">${csp}${base}</head><body>${body}</body></html>`;
}
