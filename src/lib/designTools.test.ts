import { describe, expect, it } from "vitest";
import { colourFormats, colourRoles, contrastGrade, contrastPairs, contrastRatio, paletteAsCode, paletteTokensMarkdown, smartSnap } from "./designTools";

describe("smart guides", () => {
  const other = { x: 100, y: 100, w: 200, h: 100 };

  it("snaps a near edge onto another box's edge and draws the guide across both", () => {
    const { dx, dy, guides } = smartSnap({ x: 104, y: 400, w: 50, h: 50 }, [other], 6);
    expect(dx).toBe(-4);
    expect(dy).toBe(0);
    expect(guides).toEqual([{ axis: "x", at: 100, from: 88, to: 462 }]);
  });

  it("lines up centres, and snaps both axes on their own", () => {
    // Centre x of other is 200; moving centre starts at 197. Its top lands on other's bottom (200).
    const { dx, dy, guides } = smartSnap({ x: 172, y: 203, w: 50, h: 50 }, [other], 6);
    expect(dx).toBe(3);
    expect(dy).toBe(-3);
    expect(guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
  });

  it("leaves it alone when nothing is close", () => {
    expect(smartSnap({ x: 500, y: 500, w: 10, h: 10 }, [other], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe("colour", () => {
  it("writes a colour as hex, rgb, hsl and oklch", () => {
    const f = colourFormats("#ff0000")!;
    expect(f.hex).toBe("#FF0000");
    expect(f.rgb).toBe("rgb(255, 0, 0)");
    expect(f.hsl).toBe("hsl(0 100% 50%)");
    expect(colourFormats("#E9E1D3")!.hsl).toBe("hsl(38 33% 87%)");
    expect(f.oklch).toMatch(/^oklch\(62\.8% 0\.258 29\.2\)$/);
    expect(colourFormats("not a colour")).toBeNull();
  });

  it("grades contrast the way WCAG does", () => {
    expect(contrastRatio("#000", "#fff")).toBe(21);
    expect(contrastGrade(21)).toBe("AAA");
    expect(contrastGrade(4.5)).toBe("AA");
    expect(contrastGrade(3.2)).toBe("AA large");
    expect(contrastGrade(2)).toBe("Fail");
  });

  it("lists each pair once, darker as text, best first", () => {
    const pairs = contrastPairs(["#FFFFFF", "#777777", "#000000"]);
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toMatchObject({ text: "#000000", background: "#FFFFFF", grade: "AAA" });
    expect(pairs.every((p, i) => i === 0 || pairs[i - 1].ratio >= p.ratio)).toBe(true);
  });
});

describe("palettes as code", () => {
  const colours = ["#E9E1D3", "#C9A67D", "#7E9180", "#B86E4B", "#3E3226"];

  it("guesses roles: lightest background, darkest text, most colourful accent", () => {
    expect(colourRoles(colours)).toEqual({ background: "#E9E1D3", text: "#3E3226", accent: "#B86E4B" });
    expect(colourRoles(["#fff"])).toBeNull();
  });

  it("writes CSS variables, Tailwind colours and design tokens", () => {
    expect(paletteAsCode("Board palette", colours, "css")).toContain("--color-board-palette-1: #E9E1D3;");
    expect(paletteAsCode("Board palette", colours, "css")).toContain("--color-accent: #B86E4B;");
    expect(paletteAsCode("Board palette", colours, "tailwind")).toContain('"text": "#3E3226",');
    expect(JSON.parse(paletteAsCode("Board palette", colours, "tokens")).color.background).toEqual({ $type: "color", $value: "#E9E1D3" });
  });

  it("puts tokens and safe text pairs in DESIGN.md", () => {
    const md = paletteTokensMarkdown([{ name: "Board palette", colours }]);
    expect(md).toContain("## Colour tokens");
    expect(md).toContain("--color-text: #3E3226;");
    expect(md).toMatch(/Safe for body text: #3E3226 on #E9E1D3 \([\d.]+:1, AA+\)/);
    expect(paletteTokensMarkdown([{ name: "x", colours: ["#000"] }])).toBe("");
  });
});
