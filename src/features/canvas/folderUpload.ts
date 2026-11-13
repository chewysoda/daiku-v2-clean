import { Asset } from "../../data/types";
import { useStore } from "../../data/store";
import { toast } from "../../design/primitives";
import { MARKDOWN_EXTENSIONS, toMarkdown } from "../../lib/markItDown";
import { newAsset, titleFromName } from "../library/importing";

/** The tag on assets made by the upload tool, so the Library and packs can tell them apart. */
export const MARKDOWN_TAG = "markdown";

export const FOLDER_SIZE = { w: 150, h: 140 };

/** Opens the system file picker. A plain file input, so it works in the desktop app and in a browser alike. */
export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = MARKDOWN_EXTENSIONS.map((e) => `.${e}`).join(",");
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/**
 * Reads each file as Markdown and saves it to the Library, credited to you like any import.
 * Files that can't be read are named in a toast and skipped; the rest still go in.
 */
export async function uploadAsMarkdown(files: File[]): Promise<Asset[]> {
  const created: Asset[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const { markdown, format } = await toMarkdown(file.name, new Uint8Array(await file.arrayBuffer()));
      const asset = newAsset({
        kind: "file",
        title: titleFromName(file.name),
        notes: markdown,
        credit: "yours",
        via: `${file.name} (${format}, as Markdown)`,
        tags: MARKDOWN_TAG,
      });
      useStore.getState().putAsset(asset);
      created.push(asset);
    } catch (e) {
      console.warn(`Couldn't read ${file.name}:`, e);
      failed.push(file.name);
    }
  }
  if (failed.length) toast(`Couldn't read ${failed.join(", ")} as Markdown.`, "error");
  return created;
}

/** A name for a new folder: the file's own name for one file, otherwise the day it was uploaded. */
export function folderName(assets: Asset[], when = new Date()): string {
  if (assets.length === 1) return assets[0].title;
  return `Upload ${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** The folder's files as one Markdown document, each under its own heading. */
export function folderMarkdown(name: string, assets: Asset[]): string {
  return [`# ${name}`, ...assets.map((a) => `## ${a.title}\n\n${a.notes.trim() || "(empty)"}`)].join("\n\n");
}
