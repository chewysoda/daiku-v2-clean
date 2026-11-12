import { describe, expect, it } from "vitest";
import { driftAt, easeInOut, easeOutBack, frameBox, phaseOf, wavesFrom, widenBy } from "./graphMotion";

describe("wavesFrom", () => {
  const edges = [
    { id: "1", source: "hub", target: "a" },
    { id: "2", source: "hub", target: "b" },
    { id: "3", source: "a", target: "c" },
    { id: "4", source: "hub", target: "d" },
  ];

  it("starts at the best-connected node and steps out link by link", () => {
    const w = wavesFrom(["c", "a", "b", "d", "hub"], edges);
    expect(w.get("hub")).toBe(0);
    expect(w.get("a")).toBe(1);
    expect(w.get("b")).toBe(1);
    expect(w.get("c")).toBe(2);
  });

  it("gives unconnected nodes a later wave instead of leaving them out", () => {
    const w = wavesFrom(["hub", "a", "b", "c", "d", "alone"], edges);
    expect(w.get("alone")).toBeGreaterThan(w.get("c")!);
  });

  it("ignores edges to nodes that aren't shown", () => {
    expect(wavesFrom(["a"], [{ id: "1", source: "a", target: "gone" }]).get("a")).toBe(0);
  });
});

describe("driftAt", () => {
  it("stays within a few units of home, so nodes remain clickable", () => {
    for (let ms = 0; ms < 200000; ms += 137) {
      const d = driftAt(phaseOf("asset:a1"), ms);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(4);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(4);
    }
  });

  it("moves differently for different nodes", () => {
    expect(driftAt(phaseOf("asset:a1"), 5000)).not.toEqual(driftAt(phaseOf("claim:c9"), 5000));
  });
});

describe("frameBox", () => {
  it("centres the box", () => {
    const { zoom, pan } = frameBox({ x1: 0, y1: 0, w: 1000, h: 500 }, 1000, 500, 0);
    expect(zoom).toBe(1);
    expect(pan).toEqual({ x: 0, y: 0 });
  });

  it("doesn't zoom far into a single small node", () => {
    expect(frameBox({ x1: 0, y1: 0, w: 10, h: 10 }, 1000, 800, 40).zoom).toBe(1.6);
  });

  it("copes with an empty box", () => {
    expect(Number.isFinite(frameBox({ x1: 0, y1: 0, w: 0, h: 0 }, 1000, 800, 40).zoom)).toBe(true);
  });
});

describe("widenBy", () => {
  it("widens a tall layout for a wide panel, up to a limit", () => {
    expect(widenBy(400, 400, 1000, 500)).toBe(1.9);
    expect(widenBy(400, 400, 600, 400)).toBeCloseTo(1.5);
  });

  it("leaves a layout alone if it is already wide enough", () => {
    expect(widenBy(1000, 200, 1000, 500)).toBe(1);
  });

  it("leaves a single node alone", () => {
    expect(widenBy(0, 0, 1000, 500)).toBe(1);
  });
});

describe("easing", () => {
  it("starts at 0 and ends at 1", () => {
    for (const ease of [easeInOut, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });
});
