import { describe, expect, it } from "vitest";
import { weightedTotals } from "../lib/scoring";
import { existsSync } from "node:fs";
import { ESP_CASE_DECISION, ESP_DECISION, esp32Plan, ESP_REVIEW, SEED_ESP32 } from "./seedEsp32";
import { parsePlan } from "../lib/packPlan";
import { criteria, parseReview } from "../lib/review";

describe("the ESP32 sample", () => {
  it("marks every row as sample data", () => {
    for (const rows of Object.values(SEED_ESP32)) for (const row of rows as { is_sample?: boolean; board_id?: string }[]) if ("is_sample" in row) expect(row.is_sample).toBe(true);
  });

  it("credits everything; what came from the web links to it, and what was made here says so", () => {
    for (const a of SEED_ESP32.assets) {
      expect(a.credit).toBeTruthy();
      if (a.source_url) expect(a.source_url).toMatch(/^https:\/\//);
      else expect(a.credit).toMatch(/for this example/);
    }
  });

  it("bundles every file it points at", () => {
    for (const a of SEED_ESP32.assets.filter((x) => x.preview)) expect(existsSync(`public${a.preview}`), a.preview!).toBe(true);
  });

  it("has every kind of file the Library shows, except video", () => {
    const kinds = new Set(SEED_ESP32.assets.map((a) => a.kind));
    for (const k of ["image", "pdf", "link", "3d", "quote", "code"]) expect(kinds).toContain(k);
  });

  it("has one guess with no evidence, and one claim with evidence against it", () => {
    const links = SEED_ESP32.evidence_links.filter((l) => l.target_type === "claim");
    const unsourced = SEED_ESP32.claims.filter((c) => !links.some((l) => l.target_id === c.id));
    expect(unsourced.map((c) => c.text)).toEqual(["Beginners will prefer Arduino-style code over ESP-IDF"]);
    expect(links.filter((l) => l.stance === "against").map((l) => l.target_id)).toEqual(["esp-c5"]);
  });

  it("backs exactly the scores it marks as sourced, and each decision's weights add up", () => {
    const backed = new Set(SEED_ESP32.evidence_links.filter((l) => l.target_type === "score").map((l) => l.target_id));
    expect(SEED_ESP32.scores.filter((s) => !s.is_assumption).map((s) => s.id).sort()).toEqual([...backed].sort());
    for (const d of SEED_ESP32.decisions) expect(SEED_ESP32.criteria.filter((c) => c.decision_id === d.id).reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1);
  });

  it("gives the enclosure decision requirements, parts, calculations, materials and runs", () => {
    const under = (type: string) => SEED_ESP32.records.filter((r) => r.type === type && r.parent_id === ESP_CASE_DECISION);
    for (const type of ["requirement", "part", "calc", "material", "sim_run"]) expect(under(type).length, type).toBeGreaterThan(0);
  });

  it("ranks Arduino first", () => {
    const totals = weightedTotals(
      SEED_ESP32.concepts.filter((c) => c.decision_id === ESP_DECISION).map((c) => c.id),
      SEED_ESP32.criteria.filter((c) => c.decision_id === ESP_DECISION),
      SEED_ESP32.scores,
    );
    expect(totals["espk-a"]).toBeCloseTo(4.4);
    expect(totals["espk-c"]).toBeCloseTo(3.35);
    expect(totals["espk-b"]).toBeCloseTo(3.3);
  });

  it("packs only itself, with claims and the decision pinned and the long page left out", () => {
    const plan = parsePlan(JSON.stringify(esp32Plan(["b-other", "d-other", "b-esp32", "esp-c1"])));
    expect(plan.excluded).toContain("b-other");
    expect(plan.excluded).not.toContain("b-esp32");
    expect(plan.excluded).toContain("esp-src-adc");
    expect(plan.pinned).toEqual(["esp-c1", "esp-c2", ESP_DECISION]);
    expect(plan.includeSamples).toBe(true);
  });

  it("has a review whose marks match the brief's must-haves", () => {
    const plan = parsePlan(JSON.stringify(esp32Plan([])));
    const review = parseReview(JSON.stringify(ESP_REVIEW));
    const musts = criteria(plan.app).filter((c) => c.from === "must").map((c) => c.text);
    for (const key of Object.keys(review.marks)) expect(musts).toContain(key);
  });
});
