import { describe, expect, it } from "vitest";
import { orderNodes, parseGraphLayout, planLayout, ringPoints, spiralLine, spiralPoints } from "./graphLayouts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("spiralPoints", () => {
  const points = spiralPoints(120, 128, 96);

  it("starts at the middle and always moves outward", () => {
    expect(radius(points[0])).toBe(0);
    for (let i = 1; i < points.length; i++) expect(radius(points[i])).toBeGreaterThan(radius(points[i - 1]));
  });

  it("spaces neighbours evenly along the curve, even near the middle", () => {
    const gaps = points.slice(1).map((p, i) => dist(p, points[i]));
    expect(Math.min(...gaps)).toBeGreaterThan(60);
    expect(Math.max(...gaps)).toBeLessThan(145);
  });

  it("keeps a whole turn between one ring of the spiral and the next", () => {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(dist(points[i], points[j])).toBeGreaterThan(55);
      }
    }
  });

  it("spreads out with more spacing", () => {
    expect(radius(spiralPoints(50, 256, 192)[49])).toBeGreaterThan(radius(spiralPoints(50, 128, 96)[49]));
  });

  it("copes with no nodes, or one", () => {
    expect(spiralPoints(0, 100, 100)).toEqual([]);
    expect(spiralPoints(1, 100, 100)).toEqual([{ x: 0, y: 0 }]);
    expect(spiralLine(0, 100, 100)).toEqual([]);
  });

  it("draws its guide line out to the last node", () => {
    const line = spiralLine(30, 128, 96);
    const last = spiralPoints(30, 128, 96)[29];
    expect(line[line.length - 1]).toEqual(last);
  });
});

describe("ringPoints", () => {
  it("puts a lone hub in the middle, and each wave further out", () => {
    const p = ringPoints([0, 1, 1, 2], 120, 110);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(radius(p[1])).toBeCloseTo(radius(p[2]));
    expect(radius(p[3])).toBeGreaterThan(radius(p[1]));
  });

  it("widens a crowded ring so its nodes don't collide", () => {
    const p = ringPoints([0, ...new Array(40).fill(1)], 120, 110);
    expect(dist(p[1], p[2])).toBeGreaterThan(100);
  });
});

describe("orderNodes", () => {
  const nodes = [
    { id: "a", label: "Zebra", type: "note" },
    { id: "b", label: "Apple", type: "source" },
    { id: "hub", label: "Mango", type: "board" },
    { id: "far", label: "Kiwi", type: "note" },
    { id: "c", label: "Cherry", type: "source" },
  ];
  const edges = [
    { id: "1", source: "hub", target: "a" },
    { id: "2", source: "hub", target: "b" },
    { id: "3", source: "a", target: "far" },
    { id: "4", source: "hub", target: "c" },
  ];
  const ids = (order: "links" | "type" | "name") => orderNodes(nodes, edges, order).map((n) => n.id);

  it("starts from the most linked, then follows the links out", () => {
    const out = ids("links");
    expect(out[0]).toBe("hub");
    expect(out.indexOf("far")).toBeGreaterThan(out.indexOf("a"));
  });

  it("can sort by name", () => {
    expect(ids("name")).toEqual(["b", "c", "far", "hub", "a"]);
  });

  it("keeps types together", () => {
    const out = orderNodes(nodes, edges, "type").map((n) => n.type);
    expect(out).toEqual(["board", "note", "note", "source", "source"]);
  });
});

describe("planLayout", () => {
  const nodes = [
    { id: "a", label: "A", type: "note" },
    { id: "b", label: "B", type: "note" },
  ];

  it("gives a spiral exact positions and a guide line", () => {
    const plan = planLayout({ mode: "spiral", spacing: 1, order: "links" }, nodes, []);
    expect(plan.layout.name).toBe("preset");
    expect(plan.guide?.length).toBeGreaterThan(0);
  });

  it("leaves the web to the physics layout", () => {
    const plan = planLayout({ mode: "web", spacing: 1, order: "links" }, nodes, []);
    expect(plan.layout.name).toBe("fcose");
    expect(plan.guide).toBeNull();
  });

  it("hands a tree to the hierarchy layout", () => {
    expect(planLayout({ mode: "tree", spacing: 1, order: "links" }, nodes, []).layout.name).toBe("dagre");
  });

  it("copes with an empty graph", () => {
    expect(planLayout({ mode: "spiral", spacing: 1, order: "links" }, [], []).guide).toBeNull();
  });
});

describe("parseGraphLayout", () => {
  it("falls back on anything damaged, and stays in range", () => {
    expect(parseGraphLayout("nope").mode).toBe("web");
    expect(parseGraphLayout('{"mode":"blob","order":"x","spacing":"y"}')).toEqual({ mode: "web", order: "links", spacing: 1 });
    expect(parseGraphLayout('{"mode":"spiral","spacing":99}')).toMatchObject({ mode: "spiral", spacing: 2.5 });
  });
});
