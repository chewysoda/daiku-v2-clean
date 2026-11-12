/**
 * Every image format Daiku can bring in or write out. Web views show most formats themselves. For the
 * rest, importing makes a PNG preview beside the untouched original. Exporting as another format
 * draws the picture and encodes it: canvas handles the web formats, and the simple ones are written
 * here. AVIF and HEIC can be imported but not exported, as nothing free here can encode them.
 */
export const IMPORT_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "jfif", "pjpeg", "pjp", "webp", "gif", "apng", "avif", "bmp", "dib", "ico", "cur", "svg", "tif", "tiff", "heic", "heif", "jxr", "wdp", "hdp", "dng"];
export const IMPORT_FILE_EXTENSIONS = ["py", "pyw", "ipynb"];

export type ExportImageFormat = "original" | "png" | "jpg" | "webp" | "gif" | "bmp" | "tiff" | "ico";

export const EXPORT_IMAGE_FORMATS: { id: ExportImageFormat; label: string; hint: string }[] = [
  { id: "original", label: "Keep the originals", hint: "Exactly as saved. Nothing is lost" },
  { id: "png", label: "PNG", hint: "Lossless, keeps transparency" },
  { id: "jpg", label: "JPEG", hint: "Small, for photos. No transparency" },
  { id: "webp", label: "WebP", hint: "Small, for the web, keeps transparency" },
  { id: "gif", label: "GIF", hint: "256 colours. An animation keeps only its first frame" },
  { id: "bmp", label: "BMP", hint: "Uncompressed, for older software" },
  { id: "tiff", label: "TIFF", hint: "Uncompressed, for print" },
  { id: "ico", label: "ICO", hint: "An icon, at most 256 pixels" },
];

export const isExportImageFormat = (v: unknown): v is ExportImageFormat => EXPORT_IMAGE_FORMATS.some((f) => f.id === v);

/** A 24-bit BMP. It has no transparency, so see-through areas are flattened on white. */
export function encodeBmp(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + stride * height;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // Positive: rows run from the bottom up.
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      out[row + x * 3] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      out[row + x * 3 + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      out[row + x * 3 + 2] = Math.round(rgba[i] * a + 255 * (1 - a));
    }
  }
  return out;
}

/** An uncompressed RGBA TIFF. */
export function encodeTiff(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const pixels = width * height * 4;
  const entries = 12;
  const ifdStart = 8 + pixels;
  const bitsAt = ifdStart + 2 + entries * 12 + 4;
  const out = new Uint8Array(bitsAt + 8);
  const view = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdStart, true);
  out.set(rgba, 8);
  view.setUint16(ifdStart, entries, true);
  const SHORT = 3;
  const LONG = 4;
  const tags: [number, number, number, number][] = [
    [256, LONG, 1, width],
    [257, LONG, 1, height],
    [258, SHORT, 4, bitsAt], // Bits per sample: stored apart, as four values won't fit in the entry.
    [259, SHORT, 1, 1], // No compression.
    [262, SHORT, 1, 2], // RGB.
    [273, LONG, 1, 8], // Where the pixels start.
    [277, SHORT, 1, 4], // Samples per pixel.
    [278, LONG, 1, height],
    [279, LONG, 1, pixels],
    [284, SHORT, 1, 1], // Interleaved.
    [296, SHORT, 1, 1], // No resolution unit.
    [338, SHORT, 1, 2], // The fourth sample is unassociated alpha.
  ];
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifdStart + 2 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (type === SHORT && count === 1) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  for (let i = 0; i < 4; i++) view.setUint16(bitsAt + i * 2, 8, true);
  return out;
}

/** An ICO holding one PNG, which every version of Windows since Vista can read. */
export function wrapIco(png: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(22 + png.length);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // An icon, not a cursor.
  view.setUint16(4, 1, true);
  out[6] = width >= 256 ? 0 : width; // 0 means 256.
  out[7] = height >= 256 ? 0 : height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", ico: "image/x-icon" };

/** Redraws a picture in another format. Only runs in a browser, as it needs a canvas. */
export async function convertImage(bytes: Uint8Array, sourceExtension: string, format: Exclude<ExportImageFormat, "original">): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], MIME[sourceExtension.toLowerCase()] ? { type: MIME[sourceExtension.toLowerCase()] } : {}));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const limit = format === "ico" ? 256 : Infinity;
    const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const w = Math.max(1, Math.round((image.naturalWidth || 300) * scale));
    const h = Math.max(1, Math.round((image.naturalHeight || 150) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    if (format === "jpg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(image, 0, 0, w, h);
    if (format === "bmp") return encodeBmp(ctx.getImageData(0, 0, w, h).data, w, h);
    if (format === "tiff") return encodeTiff(ctx.getImageData(0, 0, w, h).data, w, h);
    if (format === "gif") {
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256, { format: "rgba4444", oneBitAlpha: true });
      const gif = GIFEncoder();
      const transparentIndex = palette.findIndex((c: number[]) => c[3] === 0);
      gif.writeFrame(applyPalette(data, palette, "rgba4444"), w, h, { palette, ...(transparentIndex >= 0 ? { transparent: true, transparentIndex } : {}) });
      gif.finish();
      return gif.bytes();
    }
    const type = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error(`the picture couldn't be written as ${format}`);
    const encoded = new Uint8Array(await blob.arrayBuffer());
    return format === "ico" ? wrapIco(encoded, w, h) : encoded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Python-source data, so a script can import it. Only ever a literal: nothing in it runs. */
export function pythonLiteral(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent + 1);
  const end = "    ".repeat(indent);
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  // A JSON string is a valid Python one, and being escaped it can't break out or start code.
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => `${pad}${pythonLiteral(v, indent + 1)},`).join("\n")}\n${end}]`;
  }
  const entries = Object.entries(value as object).filter(([, v]) => v !== undefined);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pythonLiteral(v, indent + 1)},`).join("\n")}\n${end}}`;
}

export function pythonModule(dataset: string, data: unknown): string {
  return `"""${dataset} exported from Daiku. Plain data, safe to import: nothing here runs.

    from ${dataset} import DATA
"""

DATA = ${pythonLiteral(data)}
`;
}
