/**
 * Reads who made a photo from the data embedded in it. A camera, an agency or an editing app often
 * records this, so it's a real credit that would otherwise be lost. It's only a starting point: the
 * user can still change it, and an unsure credit stays "no source yet" rather than being guessed.
 */
const FIELDS = ["Artist", "creator", "By-line", "Byline", "Credit", "Copyright", "rights", "CopyrightNotice"];
/** What cameras and templates leave behind when nobody filled it in. */
const PLACEHOLDER = /^(unknown|none|n\/?a|copyright|all rights reserved|\(c\)|©|camera owner|owner|user|author|untitled)\.?$/i;

function firstText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstText).find(Boolean) ?? "";
  // XMP can hold a language map, such as { "x-default": "Name" }.
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return firstText(o.value ?? o["x-default"] ?? Object.values(o)[0]);
  }
  return "";
}

/** The best credit in a file's metadata, tidied up, or "" when there isn't a believable one. */
export function creditFromMetadata(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return "";
  for (const field of FIELDS) {
    const text = firstText(meta[field])
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^(copyright|©|\(c\))\s*(\d{4}\s*)?/i, "")
      .trim();
    if (text.length >= 2 && !PLACEHOLDER.test(text)) return text.slice(0, 200);
  }
  return "";
}

/** Reads metadata from image bytes. A file with none, or that can't be parsed, is simply no credit. */
export async function readCredit(image: ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const { default: exifr } = await import("exifr");
    const meta = await exifr.parse(image, { tiff: true, exif: false, gps: false, iptc: true, xmp: true, mergeOutput: true });
    return creditFromMetadata(meta);
  } catch {
    return "";
  }
}
