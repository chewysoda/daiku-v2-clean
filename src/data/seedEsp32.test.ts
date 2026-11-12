import { describe, expect, it } from "vitest";
import { weightedTotals } from "../lib/scoring";
import { ESP_DECISION, esp32Plan, ESP_REVIEW, SEED_ESP32 } from "./seedEsp32";
import { parsePlan } from "../lib/packPlan";
import { criteria, parseReview } from "../lib/review";

describe("the ESP32 sample", () => {
  it("marks every row as sample data", () => {
    for (const rows of Object.values(SEED_ESP32)) for (const row of rows as { is_sample?: boolean; board_id?: string }[]) if ("is_sample" in row) expect(row.is_sample).toBe(true);
  });

  it("credits every source and quote, with its link", () => {
    for (const a of SEED_ESP32.assets) {
      expect(a.credit).toBeTruthy();
      expect(a.source_url).toMatch(/^https:\/\//);
    }
  });

  it("has two sourced claims and one guess", () => {
    const backed = new Set(SEED_ESP32.evidence_links.filter((l) => l.target_type === "claim").map((l) => l.target_id));
    expect(SEED_ESP32.claims.filter((c) => backed.has(c.id))).toHaveLength(2);
    expect(SEED_ESP32.claims.find((c) => !backed.has(c.id))?.text).toMatch(/Beginners/);
  });

  it("backs exactly the scores it marks as sourced, and the weights add up", () => {
    const backed = new Set(SEED_ESP32.evidence_links.filter((l) => l.target_type === "score").map((l) => l.target_id));
    expect(SEED_ESP32.scores.filter((s) => !s.is_assumption).map((s) => s.id).sort()).toEqual([...backed].sort());
    expect(SEED_ESP32.criteria.reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1);
  });

  it("ranks Arduino first", () => {
    const totals = weightedTotals(
      SEED_ESP32.concepts.filter((c) => c.decision_id === ESP_DECISION).map((c) => c.id),
      SEED_ESP32.criteria,
      SEED_ESP32.scores,
    );
    expect(totals["espk-a"]).toBeCloseTo(4.4);
    expect(totals["espk-c"]).toBeCloseTo(3.35);
    expect(totals["espk-b"]).toBeCloseTo(3.3);
  });

  it("packs only itself, with claims and the decision pinned and the long page left out", () => {
    const plan = parsePlan(JSON.stringify(esp32Plan(["b-furniture", "d-chair", "b-esp32", "esp-c1"])));
    expect(plan.excluded).toContain("b-furniture");
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
