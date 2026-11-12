import { describe, expect, it } from "vitest";
import { angleLine, CELL, gridLines, rulerLabel, stepFor } from "./matGrid";

describe("stepFor", () => {
  it("uses single cells at normal zoom", () => {
    expect(stepFor(1)).toBe(CELL);
    expect(stepFor(3)).toBe(CELL);
  });

  it("coarsens when cells would blur together", () => {
    expect(stepFor(0.2)).toBe(CELL * 5);
    expect(stepFor(0.03)).toBe(CELL * 25);
    expect(stepFor(0.2) * 0.2).toBeGreaterThanOrEqual(7);
  });
});

describe("gridLines", () => {
  it("only returns lines on screen", () => {
    const lines = gridLines(-100, 1, 500, CELL);
    expect(lines.every((l) => l.at >= 0 && l.at <= 500)).toBe(true);
    expect(lines.length).toBe(Math.floor(500 / CELL) + 1);
  });

  it("keeps a line attached to the same place while panning", () => {
    const at = (offset: number) => gridLines(offset, 1, 1000, CELL).find((l) => l.index === 10)!.at;
    expect(at(30) - at(0)).toBe(30);
  });

  it("marks every fifth line as major, either side of the origin", () => {
    const lines = gridLines(500, 1, 1000, CELL);
    expect(lines.find((l) => l.index === 5)!.major).toBe(true);
    expect(lines.find((l) => l.index === -5)!.major).toBe(true);
    expect(lines.find((l) => l.index === 3)!.major).toBe(false);
  });
});

describe("rulerLabel", () => {
  it("counts in centimetres, whatever the step", () => {
    expect(rulerLabel(5, CELL)).toBe("5");
    expect(rulerLabel(5, CELL * 5)).toBe("25");
    expect(rulerLabel(-5, CELL)).toBe("-5");
  });
});

describe("angleLine", () => {
  it("passes through the origin at the angle", () => {
    const l = angleLine(10, 20, 45, 100);
    expect((l.x1 + l.x2) / 2).toBeCloseTo(10);
    expect((l.y1 + l.y2) / 2).toBeCloseTo(20);
    expect((l.y2 - l.y1) / (l.x2 - l.x1)).toBeCloseTo(1);
  });
});
