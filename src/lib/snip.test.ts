import { describe, expect, it } from "vitest";
import { boxFromDrag, isRealSnip, toImagePixels } from "./snip";
import { parseCapture, quoteTitle } from "./web";

describe("boxFromDrag", () => {
  it("works whichever way you drag", () => {
    const expected = { x: 10, y: 20, w: 90, h: 80 };
    expect(boxFromDrag({ x: 10, y: 20 }, { x: 100, y: 100 }, 500, 500)).toEqual(expected);
    expect(boxFromDrag({ x: 100, y: 100 }, { x: 10, y: 20 }, 500, 500)).toEqual(expected);
  });

  it("stops at the edges of the page", () => {
    expect(boxFromDrag({ x: 400, y: 400 }, { x: 900, y: -50 }, 500, 500)).toEqual({ x: 400, y: 0, w: 100, h: 400 });
  });

  it("treats a click as no snip", () => {
    expect(isRealSnip(boxFromDrag({ x: 5, y: 5 }, { x: 7, y: 7 }, 500, 500))).toBe(false);
    expect(isRealSnip(boxFromDrag({ x: 5, y: 5 }, { x: 50, y: 50 }, 500, 500))).toBe(true);
  });
});

describe("toImagePixels", () => {
  it("scales up on a 165% display", () => {
    expect(toImagePixels({ x: 100, y: 200, w: 300, h: 100 }, 1000, 800, 1650, 1320)).toEqual({ x: 165, y: 330, w: 495, h: 165 });
  });

  it("is one to one at 100%", () => {
    const box = { x: 1, y: 2, w: 30, h: 40 };
    expect(toImagePixels(box, 100, 100, 100, 100)).toEqual(box);
  });

  it("never runs past the image, even with rounding", () => {
    const b = toImagePixels({ x: 333, y: 333, w: 667, h: 667 }, 1000, 1000, 1651, 1651);
    expect(b.x + b.w).toBeLessThanOrEqual(1651);
    expect(b.y + b.h).toBeLessThanOrEqual(1651);
  });
});

describe("saving a highlight", () => {
  const page = { pageUrl: "https://maker.example/post", pageTitle: "Post" };
  const raw = (o: object) => JSON.stringify({ page, ...o });

  it("accepts highlighted text and the images in it", () => {
    const c = parseCapture(raw({ kind: "selection", text: "  A quote.  ", images: [{ src: "https://maker.example/a.jpg" }] }));
    expect(c?.kind).toBe("selection");
    expect(c?.text).toBe("A quote.");
    expect(c?.images).toHaveLength(1);
  });

  it("ignores a highlight with nothing in it", () => {
    expect(parseCapture(raw({ kind: "selection", text: "   ", images: [] }))).toBeNull();
  });

  it("limits how much text a page can send", () => {
    expect(parseCapture(raw({ kind: "selection", text: "x".repeat(50000) }))?.text).toHaveLength(20000);
  });

  it("keeps paragraphs but closes up large gaps", () => {
    expect(parseCapture(raw({ kind: "selection", text: "one\n\n\n\n\ntwo" }))?.text).toBe("one\n\ntwo");
  });

  it("never lets a page pretend to be a snip, which would skip the screenshot", () => {
    const c = parseCapture(raw({ kind: "snip", snip: { url: "https://evil.example/x.png" } }));
    expect(c?.kind).toBe("page");
    expect(c?.snip).toBeUndefined();
  });

  it("refuses text from a page with no real address", () => {
    expect(parseCapture(JSON.stringify({ kind: "selection", text: "hi", page: { pageUrl: "file:///c:/x" } }))).toBeNull();
  });
});

describe("quoteTitle", () => {
  it("uses short text as it is", () => {
    expect(quoteTitle("A short quote.")).toBe("A short quote.");
  });

  it("uses the first line", () => {
    expect(quoteTitle("First line\nSecond line")).toBe("First line");
  });

  it("clips long text at a word", () => {
    const t = quoteTitle("word ".repeat(60));
    expect(t.length).toBeLessThanOrEqual(91);
    expect(t.endsWith("word…")).toBe(true);
  });
});
