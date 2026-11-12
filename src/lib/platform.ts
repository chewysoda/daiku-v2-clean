import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Asset } from "../data/types";

/** True inside the desktop app; false in a plain browser preview or test. */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface StoredFile {
  file_path: string;
  sha256: string;
  bytes: number;
}

/** Physical pixels. */
export interface PaneBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Images the web view can't show itself, which get a PNG preview beside the original. */
export const needsPreview = (path: string | null | undefined) => !!path && /\.(tiff?|heic|heif|jxr|wdp|hdp|dng)$/i.test(path);

export const native = {
  imagePreview: (path: string) => invoke<string>("library_image_preview", { path }),
  libraryDefaultDir: () => invoke<string>("library_default_dir"),
  librarySetDir: (path: string) => invoke<void>("library_set_dir", { path }),
  importFile: (source: string) => invoke<StoredFile>("library_import_file", { source }),
  saveUrl: (url: string, referer?: string) =>
    invoke<StoredFile>("library_save_url", { url, referer: referer ?? null }),
  appearanceImport: (source: string) => invoke<string>("appearance_import", { source }),
  appearanceRemove: (path: string) => invoke<void>("appearance_remove", { path }),
  scholarGet: (url: string) => invoke<string>("scholar_get", { url }),
  githubGet: (url: string) => invoke<string>("github_get", { url }),
  /** Ollama on this computer, at one of the few paths Extract uses. A body means POST. */
  localModel: (path: string, body: string | null) => invoke<string>("local_model_call", { path, body }),
  updatesEnabled: () => invoke<boolean>("updates_enabled"),
  windowMaterial: () => invoke<"mica" | "solid">("window_material"),
  exploreOpen: (tab: number, url: string, bounds: PaneBounds) => invoke<void>("explore_open", { tab, url, bounds }),
  exploreShow: (tab: number, bounds: PaneBounds) => invoke<void>("explore_show", { tab, bounds }),
  exploreClose: (tab: number) => invoke<void>("explore_close", { tab }),
  exploreSnapshot: (tab: number) => invoke<ArrayBuffer>("explore_snapshot", { tab }),
  storeSvg: (svg: Uint8Array) => invoke<StoredFile>("library_store_svg", svg),
  storeSnip: (png: Uint8Array) => invoke<StoredFile>("library_store_png", png),
  /** A file from a backup, kept with its extension. */
  storeFile: (bytes: Uint8Array, ext: string) => invoke<StoredFile>("library_store_file", bytes, { headers: { "x-ext": ext } }),
  inkToText: (strokes: [number, number][][]) => invoke<string>("ink_to_text", { strokes }),
  readText: (image: Uint8Array) => invoke<string>("ocr_image", image),
  exploreHide: () => invoke<void>("explore_hide"),
  exploreAction: (tab: number, action: "back" | "forward" | "reload" | "collect") =>
    invoke<void>("explore_action", { tab, action }),
};

const samples = import.meta.glob("/design/images/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const sampleUrl = (name: string) => samples[`/design/images/${name}.svg`] ?? "";

/** The displayable URL for an asset, or null when there's nothing to show (links, for example). */
export function mediaUrl(asset: Pick<Asset, "file_path" | "preview">): string | null {
  if (asset.preview) return /^(blob:|\/)/.test(asset.preview) ? asset.preview : sampleUrl(asset.preview);
  if (asset.file_path) {
    const shown = needsPreview(asset.file_path) ? `${asset.file_path}.preview.png` : asset.file_path;
    return isTauri ? convertFileSrc(shown) : shown;
  }
  return null;
}

/** The original file, where mediaUrl may give a preview. Exports use this, so they carry what was really saved. */
export function fileUrl(asset: Pick<Asset, "file_path" | "preview">): string | null {
  if (!asset.preview && asset.file_path) return isTauri ? convertFileSrc(asset.file_path) : asset.file_path;
  return mediaUrl(asset);
}

/**
 * Tauri sizes the window from its own scale factor, which can disagree with WebView2's. When
 * they differ the configured 1440 x 900 comes out far too small, so size it from the webview.
 */
const USABLE_WIDTH = 1000;

export async function fitWindowToWebview() {
  if (!isTauri) return;
  // A size you left it at comes back by itself, so this only steps in when there's no usable one,
  // such as the first launch, or after closing Daiku while it was minimised.
  if (window.innerWidth >= USABLE_WIDTH) return;
  const { getCurrentWindow, PhysicalSize } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const ratio = window.devicePixelRatio || 1;
  if (Math.abs(ratio - (await win.scaleFactor())) < 0.05) return;
  const w = Math.min(1440, window.screen.availWidth * 0.94);
  const h = Math.min(900, window.screen.availHeight * 0.94);
  await win.setSize(new PhysicalSize(Math.round(w * ratio), Math.round(h * ratio)));
  await win.center();
}

/** A displayable URL for a local file path. The browser preview passes object URLs straight through. */
export const localFileUrl = (path: string) => (isTauri && !path.startsWith("blob:") ? convertFileSrc(path) : path);

export async function copyText(text: string): Promise<boolean> {
  // Through Windows directly, which doesn't depend on the page having focus.
  if (isTauri) {
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      return true;
    } catch (e) {
      console.warn("Native clipboard failed, trying the browser's:", e);
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
