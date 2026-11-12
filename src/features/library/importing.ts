import { Asset, AssetKind, now, uid } from "../../data/types";
import { useStore } from "../../data/store";
import { toast } from "../../design/primitives";
import { paletteFromImage } from "../../lib/color";
import { IMPORT_FILE_EXTENSIONS, IMPORT_IMAGE_EXTENSIONS } from "../../lib/imageFormats";
import { isTauri, mediaUrl, native, needsPreview } from "../../lib/platform";
import { isSvgMarkup, isVectorPath, svgInfo } from "../../lib/svg";
import { linkDetails } from "../../lib/links";

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";
const VIDEO = /\.(mp4|webm|mov|mkv)$/i;
const MODEL = /\.(stl|step|stp|obj|glb|gltf)$/i;

export function kindForName(name: string): AssetKind {
  if (IMPORT_IMAGE_EXTENSIONS.includes(extensionOf(name))) return "image";
  if (IMPORT_FILE_EXTENSIONS.includes(extensionOf(name))) return "file";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (VIDEO.test(name)) return "video";
  if (MODEL.test(name)) return "3d";
  return "link";
}

export const titleFromName = (name: string) =>
  name
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Untitled";

/** Palette extraction runs after the asset is saved, so a slow image never blocks the import. */
export async function fillPalette(asset: Asset) {
  if (asset.kind !== "image") return;
  const url = mediaUrl(asset);
  if (!url) return;
  const palette_lab = await paletteFromImage(url);
  if (palette_lab.length) useStore.getState().updateAsset(asset.id, { palette_lab });
}

/** If an imported photo says who made it, that beats assuming it's yours. It stays editable like any credit. */
export async function fillCreditFromFile(asset: Asset) {
  if (asset.kind !== "image" || isVectorPath(asset.file_path)) return;
  const url = mediaUrl(asset);
  if (!url) return;
  try {
    const { readCredit } = await import("../../lib/metadata");
    const credit = await readCredit(await (await fetch(url)).arrayBuffer());
    if (credit) {
      useStore.getState().updateAsset(asset.id, { credit, via: asset.via ?? "file metadata" });
      toast(`Credited to ${credit}, from the file's own details. You can change this in the Library.`);
    }
  } catch (e) {
    console.warn("Couldn't read the file's details:", e);
  }
}

export function newAsset(fields: Partial<Asset> & Pick<Asset, "kind" | "title">): Asset {
  return {
    id: uid(),
    file_path: null,
    preview: null,
    source_url: null,
    credit: null,
    via: null,
    captured_at: now(),
    provenance: "unknown",
    palette_lab: [],
    width: null,
    height: null,
    tags: "",
    notes: "",
    is_sample: false,
    ...fields,
  };
}

/** Copies files from anywhere on disk into the library. Returns the assets created. */
/** What an imported SVG says about itself, read before it's placed so that it lands the right shape. */
async function svgDetails(filePath: string) {
  const text = await (await fetch(mediaUrl({ file_path: filePath, preview: null })!)).text();
  if (!isSvgMarkup(text)) throw new Error("that file isn't a valid SVG");
  return svgInfo(text);
}

export async function importPaths(paths: string[]): Promise<Asset[]> {
  const created: Asset[] = [];
  const { assets, putAsset } = useStore.getState();
  for (const path of paths) {
    try {
      const stored = await native.importFile(path);
      const existing = assets.find((a) => a.file_path === stored.file_path);
      if (existing) {
        created.push(existing);
        continue;
      }
      const details = isVectorPath(path) ? await svgDetails(stored.file_path) : null;
      let kind = kindForName(path);
      if (needsPreview(stored.file_path)) {
        try {
          await native.imagePreview(stored.file_path);
        } catch (e) {
          // Still saved, and still in exports: it just can't be shown here.
          kind = "file";
          toast(`Saved ${titleFromName(path)}, but it can't be shown here. ${e}`, "error");
        }
      }
      const asset = newAsset({
        kind,
        title: details?.title || titleFromName(path),
        file_path: stored.file_path,
        // Your own files start as "yours"; edit this in the asset's details if they aren't.
        credit: details?.creator || "yours",
        ...(details ? { width: details.width, height: details.height } : {}),
      });
      putAsset(asset);
      created.push(asset);
      void fillPalette(asset);
      void fillCreditFromFile(asset);
    } catch (e) {
      toast(`Couldn't import ${titleFromName(path)}: ${e}`, "error");
    }
  }
  return created;
}

export async function pickAndImport(): Promise<Asset[]> {
  if (!isTauri) {
    toast("Importing files works in the desktop app.");
    return [];
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: true,
    title: "Import into your library",
    filters: [
      { name: "Images, PDFs, video, models and Python", extensions: [...IMPORT_IMAGE_EXTENSIONS, "pdf", "mp4", "webm", "stl", "step", "stp", "glb", ...IMPORT_FILE_EXTENSIONS] },
    ],
  });
  if (!picked) return [];
  const created = await importPaths(Array.isArray(picked) ? picked : [picked]);
  if (created.length) toast(`Imported ${created.length} ${created.length === 1 ? "item" : "items"}, credited to you. Edit if they aren't yours.`);
  return created;
}

/**
 * Saves a pasted link to the Library, or finds it there already, so pasting the same address twice
 * doesn't make two sources. Returns null when the text isn't one address.
 */
export function saveLink(url: string): { asset: Asset; existed: boolean } | null {
  const details = linkDetails(url);
  if (!details) return null;
  const address = url.trim();
  const { assets, putAsset } = useStore.getState();
  const known = assets.find((a) => a.source_url === address);
  if (known) return { asset: known, existed: true };
  const asset = newAsset({ kind: "link", title: details.title, source_url: address, credit: details.site, via: details.site });
  putAsset(asset);
  return { asset, existed: false };
}
