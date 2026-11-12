import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";
import { PaletteColor } from "../data/types";
import { accentTokens, THEMES } from "./appearance";
import { accentFrom, backdropUrl, isFileInUse, Look, looksFromImage, matFor, parseLooks, SUGGESTED_LOOKS, themeBackground } from "./looks";

const colour = (l: number, a: number, b: number, weight: number, hex = "#123456"): PaletteColor => ({ l, a, b, weight, hex });

describe("suggested looks", () => {
  for (const look of SUGGESTED_LOOKS) {
    it(`${look.name} is complete, and its accent shows up on its theme`, () => {
      expect(THEMES.some((t) => t.id === look.theme)).toBe(true);
      expect(backdropUrl(look.backdrop)).not.toBe("");
      if (look.accent) {
        const bg = themeBackground(look.theme);
        expect(wcagContrast(accentTokens(look.accent, bg)["--c-accent"], bg)).toBeGreaterThanOrEqual(3);
      }
      expect(look.dim).toBeGreaterThanOrEqual(30);
    });
  }

  it("have unique names and ids", () => {
    expect(new Set(SUGGESTED_LOOKS.map((l) => l.id)).size).toBe(SUGGESTED_LOOKS.length);
    expect(new Set(SUGGESTED_LOOKS.map((l) => l.name)).size).toBe(SUGGESTED_LOOKS.length);
  });
});

describe("backdropUrl", () => {
  it("has nothing for a built-in that doesn't exist", () => {
    expect(backdropUrl("builtin:nope")).toBe("");
  });

  it("passes other paths through", () => {
    expect(backdropUrl("blob:x")).toBe("blob:x");
  });
});

describe("colours from an image", () => {
  it("picks a vivid colour over a commoner dull one", () => {
    expect(accentFrom([colour(60, 2, 2, 0.7, "#dull00"), colour(50, 50, 30, 0.2, "#vivid0")])).toBe("#vivid0");
  });

  it("ignores near-black and near-white, however vivid they measure", () => {
    expect(accentFrom([colour(5, 40, 40, 0.5, "#000000"), colour(97, 30, 30, 0.5, "#ffffff")])).toBe("");
  });

  it("leaves the accent alone for a grey image", () => {
    expect(accentFrom([colour(50, 1, 1, 1)])).toBe("");
    expect(accentFrom([])).toBe("");
  });

  it("matches mats by hue, and greys to the plain ones", () => {
    expect(matFor([colour(50, -40, 20, 1)])).toBe("green");
    expect(matFor([colour(50, 5, -40, 1)])).toBe("blue");
    expect(matFor([colour(50, 40, 10, 1)])).toBe("rose");
    expect(matFor([colour(20, 1, 1, 1)])).toBe("black");
    expect(matFor([colour(70, 1, 1, 1)])).toBe("grey");
  });
});

describe("looksFromImage", () => {
  it("offers three, leading with the side that suits the image", () => {
    const dark = looksFromImage("p", [colour(20, 30, 20, 1)]);
    const light = looksFromImage("p", [colour(85, 30, 20, 1)]);
    expect(dark).toHaveLength(3);
    expect(dark[0].theme).toBe("dark");
    expect(light[0].theme).toBe("light");
  });

  it("dims more when the image fights the theme", () => {
    const [light] = looksFromImage("p", [colour(85, 30, 20, 1)]);
    const fight = looksFromImage("p", [colour(85, 30, 20, 1)]).find((l) => l.theme === "dark")!;
    expect(fight.dim).toBeGreaterThan(light.dim);
  });

  it("keeps every look readable, with the photo as the background", () => {
    for (const l of looksFromImage("my/photo.jpg", [colour(50, 30, 20, 1)])) {
      expect(l.backdrop).toBe("my/photo.jpg");
      expect(l.dim).toBeGreaterThanOrEqual(55);
    }
  });
});

describe("saved looks", () => {
  const look = { id: "1", name: "Mine", theme: "dark", accent: "", backdrop: "a.jpg", kind: "image", dim: 60 } as Look;

  it("ignores a damaged list", () => {
    expect(parseLooks("nope")).toEqual([]);
    expect(parseLooks("{}")).toEqual([]);
    expect(parseLooks('[{"id":"x"},null]')).toEqual([]);
    expect(parseLooks(JSON.stringify([look]))).toEqual([look]);
  });

  it("knows a file another look still needs", () => {
    expect(isFileInUse("a.jpg", [look], "")).toBe(true);
    expect(isFileInUse("b.jpg", [look], "b.jpg")).toBe(true);
    expect(isFileInUse("c.jpg", [look], "b.jpg")).toBe(false);
  });
});
