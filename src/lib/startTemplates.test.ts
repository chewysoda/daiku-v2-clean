import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES } from "./packs";
import { layoutTemplate, questionCount, START_TEMPLATES, startItems, startTemplate } from "./startTemplates";

const inside = (n: { x: number; y: number; w: number; h: number }, s: { x: number; y: number; w: number; h: number }) =>
  n.x >= s.x && n.y >= s.y && n.x + n.w <= s.x + s.w && n.y + n.h <= s.y + s.h;
const apart = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

describe("start templates", () => {
  it("offers blank, website, app, program, own version and moodboard", () => {
    expect(START_TEMPLATES.map((t) => t.id)).toEqual(["blank", "website", "app", "program", "own-version", "moodboard"]);
    expect(startTemplate("nope").id).toBe("blank");
  });

  it("gives every template but Blank several sections, each with at least one question", () => {
    for (const t of START_TEMPLATES.filter((x) => x.id !== "blank")) {
      const sections = t.rows.flat();
      expect(sections.length, t.id).toBeGreaterThanOrEqual(6);
      expect(sections.every((s) => s.questions.length >= 1), t.id).toBe(true);
      expect(questionCount(t), t.id).toBeGreaterThanOrEqual(12);
    }
  });

  it("lays sections out without overlaps, with every question inside its section", () => {
    for (const t of START_TEMPLATES) {
      const sections = layoutTemplate(t);
      for (const a of sections) {
        for (const n of a.notes) expect(inside(n, a), `${t.id}: ${n.text}`).toBe(true);
        for (const n of a.notes) for (const m of a.notes) if (n !== m) expect(apart(n, m), `${t.id}: notes in ${a.title}`).toBe(true);
        for (const b of sections) if (a !== b) expect(apart(a, b), `${t.id}: ${a.title} / ${b.title}`).toBe(true);
      }
    }
  });

  it("puts one section item and one sticky per question on the given board", () => {
    const t = startTemplate("website");
    const items = startItems(t, "b1");
    expect(items.filter((i) => i.kind === "section").map((s) => s.data.text)).toEqual(t.rows.flat().map((s) => s.title));
    expect(items.filter((i) => i.kind === "sticky")).toHaveLength(questionCount(t));
    expect(items.every((i) => i.board_id === "b1")).toBe(true);
    expect(startItems(startTemplate("blank"), "b1")).toEqual([]);
  });

  it("points each project template at a brief template that exists", () => {
    for (const t of START_TEMPLATES.filter((x) => x.briefTemplate)) {
      expect(BUILT_IN_TEMPLATES.some((b) => b.id === t.briefTemplate)).toBe(true);
    }
  });
});
