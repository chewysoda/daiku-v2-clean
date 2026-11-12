import { native } from "./platform";

/** Windows' recogniser reads small text far better at twice the size, and screen text is often small. */
export const ocrScale = (width: number) => (width < 1400 ? 2 : 1);

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Reads the text in a picture. Goes through a canvas so that any format the app can show can be read. */
export async function readTextFromBlob(picture: Blob): Promise<string> {
  const url = URL.createObjectURL(picture);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = ocrScale(image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    // A transparent picture would otherwise read as black, hiding dark text.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("the image couldn't be prepared");
    return (await native.readText(new Uint8Array(await png.arrayBuffer()))).trim();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  return readTextFromBlob(await response.blob());
}
