// The text of a Library document as Markdown, for what goes to an AI: a PDF or Word file reads far
// better as text than as an attachment, and many tools can't open the attachment at all.
import { Asset } from "../data/types";
import { toMarkdown } from "./markItDown";

/** File types worth turning into text. Code is left out: it already travels as its source. */
const DOCUMENTS = ["pdf", "docx", "xlsx", "pptx", "csv", "tsv", "html", "htm", "txt", "md", "markdown"];
/** About 50,000 tokens. Longer documents are cut there, and say so. */
export const MAX_FULL_TEXT = 200_000;

const extOf = (a: Asset) => (a.kind === "pdf" ? "pdf" : /\.([a-z0-9]+)(?:$|\?)/i.exec(a.file_path ?? a.preview ?? "")?.[1].toLowerCase() ?? "");

/** Files uploaded as Markdown already hold their text in their notes. */
export const hasFullText = (a: Asset) =>
  (a.kind === "pdf" || a.kind === "file") && !a.tags.split(/[\s,]+/).includes("markdown") && DOCUMENTS.includes(extOf(a));

/** Converting a long PDF takes a moment, so each file is converted once per session. */
const cache = new Map<string, Promise<string>>();

/**
 * The document's text as Markdown, cut to `MAX_FULL_TEXT`. A scanned PDF has no text to find, and says
 * so rather than coming back empty.
 */
export function fullText(a: Asset, bytes: () => Promise<Uint8Array>): Promise<string> {
  const key = `${a.id}:${a.file_path}`;
  let text = cache.get(key);
  if (!text) {
    text = bytes()
      .then((b) => toMarkdown(`file.${extOf(a)}`, b))
      .then(({ markdown }) => {
        const body = markdown.replace(/^## Page \d+\s*$/gm, "").trim() ? markdown.trim() : "";
        if (!body) return a.kind === "pdf" ? "_This PDF has no text in it, probably because it's a scan. Open the attached file to read it._" : "_This file has no text in it._";
        return body.length > MAX_FULL_TEXT ? `${body.slice(0, MAX_FULL_TEXT)}\n\n_The rest of this document was cut to keep the pack small (it has ${body.length.toLocaleString("en")} characters in all)._` : body;
      });
    // A failure isn't kept, so the next pack tries again.
    text.catch(() => cache.delete(key));
    cache.set(key, text);
  }
  return text;
}
