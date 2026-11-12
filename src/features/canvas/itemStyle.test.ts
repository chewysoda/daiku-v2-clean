import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";
import { BoardItem } from "../../data/types";
import { accentTokens } from "../../lib/appearance";
import { ocrScale, wordCount } from "../../lib/ocr";
import { alignItems, fontCss, inkOn, isStickerPicture, itemLook, MAX_PICTURE_STICKERS, nextSize, NOTE_COLORS, parseClipboardItems, parsePictureStickers, parseStickyStyle, snapTo, stickerBox } from "./itemStyle";

describe("itemLook", () => {
  it("adds nothing to an item with no choices, so old boards don't change", () => {
    expect(itemLook({ kind: "sticky", data: { text: "hi" } })).toEqual({});
  });

  it("keeps every note colour readable", () => {
    for (const c of NOTE_COLORS) expect(wcagContrast(c, inkOn(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it("colours a note's background, but a text box's words", () => {
    expect(itemLook({ kind: "sticky", data: { color: "#1E1F1C" } })).toMatchObject({ background: "#1E1F1C", color: "#FBFAF7" });
    expect(itemLook({ kind: "text", data: { color: "#3F6FB5" } })).toEqual({ color: "#3F6FB5" });
  });

  it("sizes emoji stickers larger than word ones", () => {
    expect(itemLook({ kind: "sticker", data: { emoji: true } }).fontSize).toBe(44);
    expect(itemLook({ kind: "sticker", data: { textSize: "l" } }).fontSize).toBe(16);
  });

  it("uses a custom font by name, safely", () => {
    expect(fontCss("hand")).toContain("Segoe Print");
    expect(fontCss('My"Font')).toBe('"MyFont", sans-serif');
    expect(fontCss(undefined)).toBeUndefined();
  });
});

describe("sizing", () => {
  it("stops at the ends of the range", () => {
    expect(nextSize("xl", 1)).toBe("xl");
    expect(nextSize("s", -1)).toBe("s");
    expect(nextSize(undefined, 1)).toBe("l");
  });

  it("fits a sticker to its words", () => {
    expect(stickerBox("A much longer sticker", {}).w).toBeGreaterThan(stickerBox("Hi", {}).w);
    const e = stickerBox("⭐", { emoji: true, textSize: "xl" });
    expect(e.w).toBe(e.h);
  });

  it("snaps to the grid", () => {
    expect(snapTo(30)).toBe(26);
    expect(snapTo(40)).toBe(52);
    expect(snapTo(-30)).toBe(-26);
  });
});

describe("alignItems", () => {
  const items = [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 80, w: 50, h: 20 },
    { id: "c", x: 120, y: 200, w: 40, h: 40 },
  ];
  const at = (mode: Parameters<typeof alignItems>[1]) => Object.fromEntries(alignItems(items, mode).map((p) => [p.id, p]));

  it("lines up edges and centres", () => {
    expect(at("left").b.x).toBe(0);
    expect(at("right").a.x).toBe(250);
    expect(at("center").b.x).toBe(150);
    expect(at("bottom").a.y).toBe(190);
    expect(at("top").c.y).toBe(0);
    expect(at("middle").b.y).toBe(110);
  });

  it("only moves along the axis asked for", () => {
    expect(at("left").b.y).toBe(80);
    expect(at("top").b.x).toBe(300);
  });

  it("spreads with equal gaps, keeping the outermost in place", () => {
    const p = at("spread-x");
    expect(p.a.x).toBe(0);
    expect(p.b.x).toBe(300);
    const gap1 = p.c.x - (p.a.x + 100);
    const gap2 = p.b.x - (p.c.x + 40);
    expect(gap1).toBeCloseTo(gap2);
  });

  it("leaves a single item alone", () => {
    expect(alignItems([items[0]], "right")).toEqual([{ id: "a", x: 0, y: 0 }]);
  });
});

describe("parsing saved and pasted data", () => {
  const good = { kind: "sticky", x: 1, y: 2, w: 3, h: 4, data: {} } as BoardItem;

  it("accepts good items and drops bad ones", () => {
    expect(parseClipboardItems(JSON.stringify([good]))).toHaveLength(1);
    expect(parseClipboardItems(JSON.stringify([{ ...good, kind: "connector" }, { ...good, x: "1" }, { ...good, data: null }, null]))).toEqual([]);
    expect(parseClipboardItems("not json")).toEqual([]);
    expect(parseClipboardItems('{"a":1}')).toEqual([]);
  });

  it("ignores a damaged sticky style", () => {
    expect(parseStickyStyle("")).toEqual({});
    expect(parseStickyStyle("nope")).toEqual({});
    expect(parseStickyStyle('{"color":"red;","textSize":"huge","font":3}')).toEqual({});
    expect(parseStickyStyle('{"color":"#AABBCC","textSize":"l"}')).toEqual({ color: "#AABBCC", textSize: "l" });
  });
});

describe("accent colours", () => {
  it("stay visible against light and dark backgrounds, whatever is chosen", () => {
    for (const hex of ["#FFFF00", "#000000", "#FFFFFF", "#3F6FB5", "#C2527A"]) {
      for (const bg of ["#FBFAF7", "#151513", "#1E4D3B"]) {
        const t = accentTokens(hex, bg);
        expect(wcagContrast(t["--c-accent"], bg), `${hex} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("text recognition helpers", () => {
  it("enlarges small pictures only", () => {
    expect(ocrScale(400)).toBe(2);
    expect(ocrScale(3000)).toBe(1);
  });

  it("counts words", () => {
    expect(wordCount("  two\nwords ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});

describe("picture stickers", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>")}`;

  it("only takes a PNG or SVG held in the sticker itself, never a web address", () => {
    expect(isStickerPicture(png)).toBe(true);
    expect(isStickerPicture(svg)).toBe(true);
    expect(isStickerPicture("https://example.com/a.png")).toBe(false);
    expect(isStickerPicture("data:text/html;base64,PGI+")).toBe(false);
    expect(isStickerPicture("data:image/png;base64,AAAA\" onerror=\"x")).toBe(false);
    expect(isStickerPicture(`data:image/png;base64,${"A".repeat(300_000)}`)).toBe(false);
    expect(isStickerPicture(undefined)).toBe(false);
  });

  it("keeps a picture's own shape at every size", () => {
    expect(stickerBox("Logo", { picture: png, ratio: 2 })).toEqual({ w: 96, h: 48 });
    expect(stickerBox("Logo", { picture: png, ratio: 0.5 })).toEqual({ w: 48, h: 96 });
    expect(stickerBox("Logo", { picture: png, ratio: 2, textSize: "xl" })).toEqual({ w: 230, h: 115 });
    expect(stickerBox("Logo", { picture: png })).toEqual({ w: 96, h: 96 });
    expect(stickerBox("Logo", { picture: png, ratio: NaN })).toEqual({ w: 96, h: 96 });
  });

  it("reads the saved ones, dropping anything damaged", () => {
    const good = { id: "a", name: "Leaf", src: svg, ratio: 1.5 };
    expect(parsePictureStickers(JSON.stringify([good, { ...good, id: "b", src: "https://x.example/a.png" }, { id: 3 }, null]))).toEqual([good]);
    expect(parsePictureStickers(JSON.stringify([{ ...good, ratio: "wide" }]))[0].ratio).toBe(1);
    expect(parsePictureStickers("not json")).toEqual([]);
    expect(parsePictureStickers("{}")).toEqual([]);
    expect(parsePictureStickers(JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ ...good, id: String(i) })))).length).toBe(MAX_PICTURE_STICKERS);
  });
});
