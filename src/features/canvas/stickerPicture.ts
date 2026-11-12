/**
 * Turning a PNG or SVG the person picked into a sticker. It stays a small data URL: a sticker is
 * decoration, so it never goes into the Library and needs no credit.
 */
import { uid } from "../../data/types";
import { isSvgMarkup } from "../../lib/svg";
import { isStickerPicture, MAX_STICKER_PICTURE_CHARS, PictureSticker } from "./itemStyle";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Plenty for the largest sticker size on a sharp screen. */
const MAX_SIDE = 320;

const svgUrl = (text: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be read as a picture."));
    img.src = src;
  });
}

/** Redrawn small, which also drops anything in the file that isn't the picture itself. */
function shrink(img: HTMLImageElement, width: number, height: number, side: number): string {
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

const nameOf = (file: File) => file.name.replace(/\.(svg|png)$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "Sticker";

export async function readStickerFile(file: File): Promise<PictureSticker> {
  const svg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
  const png = /\.png$/i.test(file.name) || file.type === "image/png";
  if (!svg && !png) throw new Error("Stickers can be made from SVG or PNG files.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is too large for a sticker (8 MB at most).");

  let src: string;
  let img: HTMLImageElement;
  if (svg) {
    const text = await file.text();
    if (!isSvgMarkup(text)) throw new Error("That doesn't look like an SVG file.");
    img = await load(svgUrl(text));
    src = svgUrl(text);
  } else {
    const url = URL.createObjectURL(file);
    try {
      img = await load(url);
      src = shrink(img, img.naturalWidth, img.naturalHeight, MAX_SIDE);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // An SVG with no size of its own reports none, so it counts as square.
  const width = img.naturalWidth || 100;
  const height = img.naturalHeight || 100;
  // A heavy SVG becomes a small PNG, and a detailed PNG a smaller one, until it's light enough to keep.
  for (const side of [MAX_SIDE, 200, 128]) {
    if (src.length <= MAX_STICKER_PICTURE_CHARS) break;
    src = shrink(img, width, height, side);
  }
  if (!isStickerPicture(src)) throw new Error("That picture is too detailed to keep as a sticker.");
  return { id: uid(), name: nameOf(file), src, ratio: width / height };
}
