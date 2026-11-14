import { describe, expect, it } from "vitest";
import { CalcData, PartData, RequirementData } from "../data/types";
import { SEED_ESP32 } from "../data/seedEsp32";
import { bomMass, convergenceStep, convert, evaluate, LabData, meets, requirementValue, runCalc, safetyFactor, standing, targetText } from "./engineering";
import { bibEntry, claimStrength, csvCell, frontMatter, gatePasses, parseInterviewNotes, parseWikiLinks, safeFileName, shareCell, stanceOf, toCsv } from "./studio";
import { canvasFor } from "./vault";

const calc = (inputs: [string, string][], formula: string, unit: string) => runCalc({ inputs: inputs.map(([name, expr]) => ({ name, expr })), formula, unit });

// The enclosure decision in the ESP32 example: its parts, calculations and drop-test runs.
const of = (type: string) => SEED_ESP32.records.filter((r) => r.type === type && r.parent_id === "d-esp32-case");
const lab: LabData = {
  parts: of("part").map((p) => p.data as PartData),
  calcs: of("calc").map((c) => ({ id: c.id, data: c.data as CalcData })),
  runs: of("sim_run").map((r) => r.data as never),
};
const reqs = of("requirement").map((r) => r.data as RequirementData);

describe("unit-aware calculations", () => {
  it("reproduces the wireframe's shell mass, C1 = 3.67 kg", () => {
    const r = calc([["A", "0.45 m^2"], ["t", "12 mm"], ["rho", "680 kg/m^3"]], "A * t * rho", "kg");
    expect(r.ok && r.value).toBeCloseTo(3.672, 3);
  });
  it("reproduces the wireframe's base tube mass, C2 = 2.43 kg", () => {
    const r = calc([["D", "22 mm"], ["d", "19 mm"], ["L", "3.2 m"], ["rho", "7850 kg/m^3"]], "pi/4 * (D^2 - d^2) * L * rho", "kg");
    expect(r.ok && r.value).toBeCloseTo(2.427, 2);
  });
  it("reproduces the what-if: 10 mm ply makes the shell 3.06 kg", () => {
    const r = calc([["A", "0.45 m^2"], ["t", "10 mm"], ["rho", "680 kg/m^3"]], "A * t * rho", "kg");
    expect(r.ok && r.value).toBeCloseTo(3.06, 2);
  });
  it("converts between units", () => {
    expect(convert(evaluate("1 km + 500 m"), "m")).toBeCloseTo(1500);
    expect(convert(evaluate("100 N / (2 mm * 5 mm)"), "MPa")).toBeCloseTo(10);
    expect(convert(evaluate("2 kN"), "N")).toBeCloseTo(2000);
  });
  it("follows arithmetic precedence", () => {
    expect(evaluate("2 + 3 * 4").value).toBe(14);
    expect(evaluate("(2 + 3) * 4").value).toBe(20);
    expect(evaluate("2 ^ 3 ^ 2").value).toBe(512);
    expect(evaluate("-2 ^ 2").value).toBe(-4);
    expect(evaluate("sqrt(16)").value).toBe(4);
  });
  it("lets an input named like a unit stay an input", () => {
    expect(calc([["t", "12 mm"]], "t * 2", "mm")).toEqual({ ok: true, value: 24 });
  });
  it("refuses mismatched units instead of giving a wrong number", () => {
    const added = calc([["a", "1 m"], ["b", "1 kg"]], "a + b", "m");
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.error).toMatch(/different units/);
    const output = calc([["a", "1 m"]], "a", "kg");
    expect(output.ok).toBe(false);
    if (!output.ok) expect(output.error).toMatch(/units don't match/);
  });
  it("reports bad input as an error, never as zero", () => {
    expect(calc([], "nonsense", "m").ok).toBe(false);
    expect(calc([], "1 +", "").ok).toBe(false);
    expect(calc([], "(1", "").ok).toBe(false);
    expect(calc([], "", "").ok).toBe(false);
    expect(calc([], "2 ; 3", "").ok).toBe(false);
  });
});

describe("requirements against the sample data", () => {
  it("rolls the enclosure's BOM up to 0.039 kg, with the tray's mass from calc C1", () => {
    expect(bomMass(lab.parts, lab.calcs)).toBeCloseTo(0.01 + 0.0094 * 0.002 * 1240 + 0.004 + 0.002, 5);
  });
  it("won't total a BOM with a part of unknown mass", () => {
    const parts = [...lab.parts, { ...lab.parts[1], mass_kg: null, calc_id: null }];
    expect(bomMass(parts, lab.calcs)).toBeNull();
    expect(bomMass([], lab.calcs)).toBeNull();
  });
  it("computes the drop runs' safety factors", () => {
    expect(safetyFactor({ max_stress_mpa: 11, allowable_mpa: 30 })).toBeCloseTo(2.7, 1);
    expect(safetyFactor({ max_stress_mpa: 14, allowable_mpa: 40 })).toBeCloseTo(2.9, 1);
    expect(safetyFactor({ max_stress_mpa: null, allowable_mpa: 40 })).toBeNull();
  });
  it("reports mesh convergence of about 0.9%", () => {
    expect(convergenceStep([{ value: 10.2 }, { value: 10.9 }, { value: 11 }])).toBeCloseTo(0.0091, 3);
    expect(convergenceStep([{ value: 1 }])).toBeNull();
  });
  it("fails the printed tray on mass, as 2 mm walls make it too heavy", () => {
    expect(standing(reqs, "espc-a", lab)).toEqual({ pass: 3, fail: 2, open: 0, failedMust: ["R2"] });
  });
  it("passes the mass once the walls are 1.5 mm", () => {
    const thinner = lab.calcs.map((c) => (c.data.code === "C1" ? { ...c, data: { ...c.data, inputs: c.data.inputs.map((i) => (i.name === "t" ? { ...i, expr: "1.5 mm" } : i)) } } : c));
    expect(standing(reqs, "espc-a", { ...lab, calcs: thinner }).failedMust).toEqual([]);
  });
  it("fails the ABS box on its USB slot, and leaves the bare board open", () => {
    expect(standing(reqs, "espc-b", lab)).toEqual({ pass: 1, fail: 1, open: 3, failedMust: ["R3"] });
    expect(standing(reqs, "espc-c", lab)).toEqual({ pass: 0, fail: 0, open: 5, failedMust: [] });
  });
  it("uses the weakest run, so a good one can't hide a bad one", () => {
    const r1 = reqs[0];
    const runs = [{ ...lab.runs[0], concept_id: "x" }, { ...lab.runs[0], concept_id: "x", max_stress_mpa: 15 }];
    expect(requirementValue(r1, "x", { ...lab, runs }).value).toBeCloseTo(30 / 15);
  });
  it("ignores queued runs", () => {
    const queued = { ...lab.runs[0], concept_id: "x", status: "queued" as const };
    expect(requirementValue(reqs[0], "x", { ...lab, runs: [queued] }).value).toBeNull();
  });
  it("treats no value as open, not a pass", () => {
    expect(meets({ op: "<=", min: null, max: 7 }, null)).toBe("open");
    expect(meets({ op: "<=", min: null, max: null }, 3)).toBe("open");
  });
  it("checks each kind of target, inclusive at the limit", () => {
    expect(meets({ op: "<=", min: null, max: 7 }, 7)).toBe("pass");
    expect(meets({ op: "<=", min: null, max: 7 }, 7.01)).toBe("fail");
    expect(meets({ op: ">=", min: 2, max: null }, 1.99)).toBe("fail");
    expect(meets({ op: "between", min: 420, max: 460 }, 438)).toBe("pass");
    expect(meets({ op: "between", min: 420, max: 460 }, 461)).toBe("fail");
    expect(targetText({ op: "between", min: 420, max: 460, unit: "mm" })).toBe("420–460 mm");
  });
});

describe("research logic", () => {
  it("rates claims by the wireframe's legend", () => {
    expect(claimStrength(3, 0)).toBe("strong");
    expect(claimStrength(2, 0)).toBe("medium");
    expect(claimStrength(5, 1)).toBe("mixed");
    expect(claimStrength(0, 0)).toBe("assumption");
    expect(stanceOf({})).toBe("for");
    expect(stanceOf({ stance: "against" })).toBe("against");
  });
  it("parses wikilinks, typed links and aliases", () => {
    expect(parseWikiLinks("see [[A]] and supports:: [[B c]] and [[D|shown]]")).toEqual([
      { target: "A", relation: null },
      { target: "B c", relation: "supports" },
      { target: "D", relation: null },
    ]);
    expect(parseWikiLinks("[[A]] again [[A]]")).toHaveLength(1);
    expect(parseWikiLinks("no [[ ]] links [not one]")).toEqual([]);
  });
  it("parses interview notes, joining wrapped lines", () => {
    expect(parseInterviewNotes("p1: moves it daily\nand stacks it\n\nP2 - can't lift it\nstray text")).toEqual([
      { code: "P1", text: "moves it daily and stacks it" },
      { code: "P2", text: "can't lift it stray text" },
    ]);
    expect(parseInterviewNotes("no codes here")).toEqual([]);
  });
});

describe("progress logic", () => {
  const counts = { scores_backed: 1, scores_guessed: 0, must_passed: 1, must_failed: 0, must_open: 0, claims_with: 1, claims_without: 0, decisions_logged: 1 };
  it("passes gates only on real data", () => {
    expect(gatePasses("no_guessed_scores", counts)).toBe(true);
    expect(gatePasses("no_guessed_scores", { ...counts, scores_backed: 0 })).toBe(false);
    expect(gatePasses("all_must_verified", { ...counts, must_open: 1 })).toBe(false);
    expect(gatePasses("all_must_verified", { ...counts, must_passed: 0 })).toBe(false);
    expect(gatePasses("all_claims_evidenced", { ...counts, claims_with: 0 })).toBe(false);
    expect(gatePasses("decision_logged", { ...counts, decisions_logged: 0 })).toBe(false);
  });
  it("hatches thin data instead of showing 0% or 100%", () => {
    expect(shareCell(2, 2).share).toBeNull();
    expect(shareCell(0, 0).label).toContain("too little data");
    expect(shareCell(3, 4)).toEqual({ share: 0.75, label: "3/4 (75%)" });
  });
});

describe("exports", () => {
  it("escapes CSV and defuses spreadsheet formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", 1], ["b", 2]])).toBe("a,1\r\nb,2");
  });
  it("makes safe file names", () => {
    expect(safeFileName('a/b:c*?"d')).toBe("a b c d");
    expect(safeFileName("[Study] title.")).toBe("Study title");
    expect(safeFileName("CON")).toBe("CON_");
    expect(safeFileName("???")).toBe("Untitled");
    expect(safeFileName("..\\..\\evil")).not.toMatch(/[\\/]/);
  });
  it("writes YAML that a quote or colon can't break", () => {
    expect(frontMatter({ a: 'x: "y"', b: 2, c: null })).toBe('---\na: "x: \\"y\\""\nb: 2\nc: null\n---\n');
  });
  it("escapes BibTeX", () => {
    const entry = bibEntry({ id: "abc123", title: "A & B_c", credit: "Doe", source_url: null, captured_at: "2026-01-02T00:00:00Z", kind: "pdf" });
    expect(entry).toContain("title = {A \\& B\\_c}");
    expect(entry.startsWith("@article{")).toBe(true);
  });
  it("writes JSON Canvas boards, dropping connectors to missing items", () => {
    const item = (id: string, kind: string, data: object = {}, asset_id: string | null = null) => ({ id, board_id: "b", kind, x: 1.4, y: 2, w: 3, h: 4, rotation: 0, z: 0, asset_id, data, updated_at: "" }) as never;
    const out = JSON.parse(
      canvasFor(
        [item("s", "section", { text: "Sec" }), item("n", "sticky", { text: "Hi" }), item("i", "image", {}, "a1"), item("c1", "connector", { from: "n", to: "i", connector: "supports" }), item("c2", "connector", { from: "n", to: "gone" })],
        () => "attachments/a.png",
      ),
    );
    expect(out.nodes.map((n: { type: string }) => n.type)).toEqual(["group", "text", "file"]);
    expect(out.nodes[2].file).toBe("attachments/a.png");
    expect(out.nodes[0].x).toBe(1);
    expect(out.edges).toEqual([{ id: "c1", fromNode: "n", toNode: "i", toEnd: "arrow", label: "supports" }]);
  });
});
