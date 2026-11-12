import { useEffect, useState } from "react";
import { openExternal } from "../lib/platform";
import { splitMath } from "../lib/math";
import { renderMathHtml } from "./MathText";

/** Worth showing a preview for? Plain sentences aren't, so they don't get a redundant copy underneath. */
export function hasMarkdown(text: string): boolean {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|)|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/.test(text);
}

/**
 * Note text as sanitised HTML. Images are removed along with scripts and styles: a picture in a note
 * could fetch from anywhere, and the app makes no network requests of its own. Math is lifted out
 * first, as Markdown would otherwise read the underscores and stars in a formula as emphasis.
 */
export async function markdownToHtml(text: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import("marked"), import("dompurify")]);
  const formulas: string[] = [];
  const source = splitMath(text)
    .map((s) => {
      if (s.kind === "text") return s.text;
      formulas.push(`${s.display ? "\u0001D" : "\u0001I"}${s.tex}`);
      return `@@DAIKUMATH${formulas.length - 1}@@`;
    })
    .join("");
  const html = DOMPurify.sanitize(await marked.parse(source, { async: true, gfm: true, breaks: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["img", "picture", "source", "video", "audio", "iframe", "object", "embed", "style", "form", "input", "svg", "math"],
    FORBID_ATTR: ["style", "srcset", "src", "background"],
  });
  const maths = await Promise.all(formulas.map((f) => renderMathHtml(f.slice(2), f[1] === "D")));
  return html.replace(/@@DAIKUMATH(\d+)@@/g, (whole, n) => maths[Number(n)] ?? whole);
}

/** Rendered Markdown and math. Links open in the system browser, as following one here would navigate the app away. */
export function MarkdownText({ text }: { text: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    void markdownToHtml(text).then(
      (out) => {
        if (!stale) setHtml(out);
      },
      (e) => console.warn("Preview failed:", e),
    );
    return () => {
      stale = true;
    };
  }, [text]);

  if (html === null) return null;
  return (
    <div
      className="markdown"
      data-testid="markdown"
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest("a");
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute("href") ?? "";
        if (/^https?:\/\//i.test(href)) void openExternal(href);
      }}
      // Sanitised above, and KaTeX is run with trust: false.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
