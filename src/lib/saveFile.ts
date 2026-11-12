import { isTauri } from "./platform";

/** Asks where to save, then writes. Returns the path or name, or null if the person cancelled. */
export async function saveBytes(name: string, bytes: Uint8Array, filterName: string, extensions: string[], mime = "application/octet-stream"): Promise<string | null> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: filterName, extensions }] });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

export const saveText = (name: string, text: string, filterName: string, extensions: string[], mime = "text/plain") =>
  saveBytes(name, new TextEncoder().encode(text), filterName, extensions, mime);

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't read the file (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}
