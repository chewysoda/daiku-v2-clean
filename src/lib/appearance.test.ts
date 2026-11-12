import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";
import { backdropKindOf, dimFrom, familyFromFile, fontStack, MATS, matOf, matTokens, parseCustomFonts, THEMES } from "./appearance";

describe("cutting mat themes", () => {
  const TEXT = "#EFEBE3"; // --c-text from the dark theme, which mats sit on.

  for (const [id, mat] of Object.entries(MATS)) {
    it(`${id} keeps all text readable on all its surfaces`, () => {
      const t = matTokens(mat);
      for (const surface of [mat.bg, mat.canvas, mat.surface, mat.sunk, mat.raised]) {
        for (const ink of [TEXT, t["--c-text-muted"], t["--c-caption"]]) {
          expect(wcagContrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${id} has grid lines that show on the mat`, () => {
      expect(wcagContrast(mat.line, mat.canvas)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("offers every mat as a theme", () => {
    for (const id of Object.keys(MATS)) expect(THEMES.some((t) => t.id === `mat-${id}`)).toBe(true);
  });

  it("recognises mat themes and nothing else", () => {
    expect(matOf("mat-rose")).toBe("rose");
    expect(matOf("dark")).toBeNull();
    expect(matOf("mat-plaid")).toBeNull();
    expect(matOf("mat-constructor")).toBeNull();
  });
});

describe("custom fonts", () => {
  it("names a font after its file", () => {
    expect(familyFromFile("C:\\fonts\\Inter_Tight-Regular.woff2")).toBe("Inter Tight Regular");
  });

  it("keeps names unique", () => {
    expect(familyFromFile("Inter.ttf", ["inter"])).toBe("Inter 2");
    expect(familyFromFile("Inter.ttf", ["Inter", "Inter 2"])).toBe("Inter 3");
  });

  it("can't break out of the CSS string", () => {
    expect(familyFromFile('a";}body{display:none}.ttf')).not.toMatch(/["{};]/);
    expect(fontStack('a"b\\c', "serif")).toBe('"abc", serif');
  });

  it("copes with a damaged saved list", () => {
    expect(parseCustomFonts("not json")).toEqual([]);
    expect(parseCustomFonts('{"a":1}')).toEqual([]);
    expect(parseCustomFonts('[{"family":"A","path":"p"},{"family":""},null,3]')).toEqual([{ family: "A", path: "p" }]);
    expect(parseCustomFonts("")).toEqual([]);
  });
});

describe("background media", () => {
  it("tells images from video", () => {
    expect(backdropKindOf("a.JPG")).toBe("image");
    expect(backdropKindOf("a.webm")).toBe("video");
    expect(backdropKindOf("a.exe")).toBeNull();
  });

  it("keeps the dimming in a readable range", () => {
    expect(dimFrom("")).toBe(70);
    expect(dimFrom("0")).toBe(30);
    expect(dimFrom("55")).toBe(55);
    expect(dimFrom("500")).toBe(95);
    expect(dimFrom("nope")).toBe(70);
  });
});
