import { describe, expect, it } from "vitest";
import { BoardItem } from "../../data/types";
import { arrowHead, constrain, DEFAULT_STYLES, figureOutline, figurePath, hitsDrawing, lineEnds, parseDrawStyles, pathSamples, Pt, shapeBox, simplify, smoothPath, strokeFrom } from "./drawing";

const item = (fields: Partial<BoardItem>): BoardItem =>
  ({ id: "a", board_id: "b", kind: "stroke", x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 0, asset_id: null, data: {}, updated_at: "", ...fields }) as BoardItem;

describe("simplify", () => {
  it("drops points on a straight run, and keeps the ends", () => {
    const line: Pt[] = Array.from({ length: 200 }, (_, i) => [i, i]);
    const out = simplify(line);
    expect(out).toEqual([[0, 0], [199, 199]]);
  });

  it("keeps corners", () => {
    const out = simplify([[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]]);
    expect(out).toContainEqual([100, 0]);
    expect(out).toHaveLength(3);
  });

  it("handles a very long, busy stroke", () => {
    const zigzag: Pt[] = Array.from({ length: 4000 }, (_, i) => [i, i % 2 ? 5 : 0]);
    expect(simplify(zigzag).length).toBeGreaterThan(2);
  });

  it("leaves very short strokes alone", () => {
    expect(simplify([[1, 1]])).toEqual([[1, 1]]);
  });
});

describe("smoothPath", () => {
  it("draws a single tap as a visible dot", () => {
    expect(smoothPath([5, 5])).toMatch(/^M5 5l/);
  });

  it("uses a straight line for two points, and curves for more", () => {
    expect(smoothPath([0, 0, 10, 10])).toBe("M0 0L10 10");
    expect(smoothPath([0, 0, 10, 10, 20, 0])).toContain("Q");
  });

  it("draws nothing from nothing", () => {
    expect(smoothPath([])).toBe("");
  });
});

describe("strokeFrom", () => {
  it("makes points relative to the box", () => {
    expect(strokeFrom([[10, 20], [30, 50]])).toEqual({ x: 10, y: 20, w: 20, h: 30, points: [0, 0, 20, 30] });
  });

  it("never makes a flat box, which SVG wouldn't draw", () => {
    const s = strokeFrom([[10, 20], [90, 20]]);
    expect(s.h).toBe(1);
    expect(strokeFrom([[5, 5]]).w).toBe(1);
  });
});

describe("shapes", () => {
  it("records which way a line was drawn", () => {
    const b = shapeBox([100, 100], [40, 20], "arrow");
    expect(b).toMatchObject({ x: 40, y: 20, w: 60, h: 80, flipX: true, flipY: true });
    expect(lineEnds(b.w, b.h, b.flipX, b.flipY)).toEqual([[60, 80], [0, 0]]);
  });

  it("gives a click with no drag a usable size", () => {
    expect(shapeBox([0, 0], [1, 1], "rect")).toMatchObject({ w: 160, h: 110 });
    expect(shapeBox([0, 0], [1, 1], "line")).toMatchObject({ w: 160, h: 1 });
  });

  it("closes shapes, but not lines", () => {
    expect(figurePath("rect", 10, 10)).toMatch(/Z$/);
    expect(figurePath("ellipse", 10, 10)).toMatch(/Z$/);
    expect(figurePath("line", 10, 10)).not.toMatch(/Z$/);
  });

  it("points an arrow's head at its far end", () => {
    expect(arrowHead(100, 0, 2)).toContain("L100 0L");
    expect(arrowHead(100, 0, 2, true)).toContain("L0 0L");
  });

  it("constrains with Shift", () => {
    expect(constrain([0, 0], [100, 80], "rect")).toEqual([100, 100]);
    expect(constrain([0, 0], [-100, 80], "ellipse")).toEqual([-100, 100]);
    const flat = constrain([0, 0], [100, 4], "line");
    expect(flat[0]).toBeCloseTo(100, 0);
    expect(flat[1]).toBeCloseTo(0);
    const diagonal = constrain([0, 0], [100, 90], "arrow");
    expect(diagonal[0]).toBeCloseTo(diagonal[1]);
  });

  it("closes every outline it treats as solid", () => {
    for (const f of ["rect", "diamond", "triangle", "ellipse"] as const) {
      const o = figureOutline(f, 10, 10);
      expect(o[0][0]).toBeCloseTo(o[o.length - 1][0]);
      expect(o[0][1]).toBeCloseTo(o[o.length - 1][1]);
    }
  });
});

describe("hitsDrawing, for the eraser", () => {
  const stroke = item({ x: 100, y: 100, w: 100, h: 1, data: { points: [0, 0, 100, 0], width: 4, vw: 100, vh: 1 } });

  it("touches a stroke on its line, not just in its box", () => {
    expect(hitsDrawing(stroke, [150, 100], 4)).toBe(true);
    expect(hitsDrawing(stroke, [150, 130], 4)).toBe(false);
  });

  it("follows a stroke that's been resized", () => {
    const big = { ...stroke, w: 200 };
    expect(hitsDrawing(big, [290, 100], 4)).toBe(true);
  });

  it("follows a stroke that's been tilted", () => {
    const tilted = { ...stroke, rotation: 90 };
    expect(hitsDrawing(tilted, [150, 60], 4)).toBe(true);
    expect(hitsDrawing(tilted, [190, 100], 2)).toBe(false);
  });

  it("only touches a hollow shape on its outline, and a filled one anywhere", () => {
    const hollow = item({ kind: "shape", data: { figure: "rect", width: 2 } });
    expect(hitsDrawing(hollow, [50, 50], 4)).toBe(false);
    expect(hitsDrawing(hollow, [0, 50], 4)).toBe(true);
    expect(hitsDrawing({ ...hollow, data: { ...hollow.data, fill: "#ffffff" } }, [50, 50], 4)).toBe(true);
  });

  it("respects a diamond's real outline", () => {
    const d = item({ kind: "shape", data: { figure: "diamond", width: 2, fill: "#ffffff" } });
    expect(hitsDrawing(d, [50, 50], 1)).toBe(true);
    expect(hitsDrawing(d, [4, 4], 1)).toBe(false);
  });

  it("copes with a stroke that has no points", () => {
    expect(hitsDrawing(item({ data: {} }), [5, 5], 4)).toBe(false);
  });
});

describe("pathSamples, for a fast eraser swipe", () => {
  it("leaves no gap big enough to miss a line", () => {
    const line = item({ x: 0, y: 100, w: 100, h: 1, data: { points: [0, 0, 100, 0], width: 2, vw: 100, vh: 1 } });
    const swipe = pathSamples([50, 0], [50, 300], 6);
    expect(swipe.some((p) => hitsDrawing(line, p, 6))).toBe(true);
  });

  it("includes where the movement ends", () => {
    const samples = pathSamples([0, 0], [100, 0], 10);
    expect(samples[samples.length - 1]).toEqual([100, 0]);
  });

  it("copes with no movement, or an enormous one", () => {
    expect(pathSamples([5, 5], [5, 5], 6)).toEqual([[5, 5]]);
    expect(pathSamples([0, 0], [1e9, 0], 1).length).toBe(200);
  });
});

describe("parseDrawStyles", () => {
  it("falls back to defaults for anything damaged", () => {
    expect(parseDrawStyles("")).toEqual(DEFAULT_STYLES);
    expect(parseDrawStyles("nope")).toEqual(DEFAULT_STYLES);
    const bad = parseDrawStyles('{"pencil":{"width":"x","color":"red;","opacity":9,"dash":"wavy"},"shape":{"figure":"blob"}}');
    expect(bad.pencil).toMatchObject({ width: 3, opacity: 1, dash: "solid" });
    expect(bad.pencil.color).toBeUndefined();
    expect(bad.shape.figure).toBe("rect");
  });

  it("keeps good choices, within limits", () => {
    const good = parseDrawStyles('{"marker":{"color":"#112233","width":500,"opacity":0.5,"dash":"dotted"}}');
    expect(good.marker).toMatchObject({ color: "#112233", width: 60, opacity: 0.5, dash: "dotted" });
  });
});
