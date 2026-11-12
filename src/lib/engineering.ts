/**
 * Unit-aware calculations and requirement checks. Rules only: a result is either worked out from
 * stated inputs or reported as "no value", and the app never fills a gap with a guess.
 */
import { CalcData, PartData, RequirementData, SimRunData } from "../data/types";

/** Exponents of [length, mass, time, current, temperature]. */
type Dim = [number, number, number, number, number];
const NONE: Dim = [0, 0, 0, 0, 0];

export interface Quantity {
  /** In SI base units. */
  value: number;
  dim: Dim;
}

const UNITS: Record<string, { k: number; dim: Dim }> = {
  m: { k: 1, dim: [1, 0, 0, 0, 0] },
  km: { k: 1000, dim: [1, 0, 0, 0, 0] },
  cm: { k: 0.01, dim: [1, 0, 0, 0, 0] },
  mm: { k: 0.001, dim: [1, 0, 0, 0, 0] },
  in: { k: 0.0254, dim: [1, 0, 0, 0, 0] },
  ft: { k: 0.3048, dim: [1, 0, 0, 0, 0] },
  kg: { k: 1, dim: [0, 1, 0, 0, 0] },
  g: { k: 0.001, dim: [0, 1, 0, 0, 0] },
  t: { k: 1000, dim: [0, 1, 0, 0, 0] },
  lb: { k: 0.45359237, dim: [0, 1, 0, 0, 0] },
  s: { k: 1, dim: [0, 0, 1, 0, 0] },
  min: { k: 60, dim: [0, 0, 1, 0, 0] },
  h: { k: 3600, dim: [0, 0, 1, 0, 0] },
  A: { k: 1, dim: [0, 0, 0, 1, 0] },
  K: { k: 1, dim: [0, 0, 0, 0, 1] },
  N: { k: 1, dim: [1, 1, -2, 0, 0] },
  kN: { k: 1000, dim: [1, 1, -2, 0, 0] },
  Pa: { k: 1, dim: [-1, 1, -2, 0, 0] },
  kPa: { k: 1e3, dim: [-1, 1, -2, 0, 0] },
  MPa: { k: 1e6, dim: [-1, 1, -2, 0, 0] },
  GPa: { k: 1e9, dim: [-1, 1, -2, 0, 0] },
  J: { k: 1, dim: [2, 1, -2, 0, 0] },
  W: { k: 1, dim: [2, 1, -3, 0, 0] },
  V: { k: 1, dim: [2, 1, -3, -1, 0] },
};

const sameDim = (a: Dim, b: Dim) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const mulDim = (a: Dim, b: Dim, sign = 1) => a.map((x, i) => x + sign * b[i]) as Dim;
const powDim = (a: Dim, n: number) => a.map((x) => x * n) as Dim;

const TOKEN = /\s*(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+|[A-Za-zµπρ_][A-Za-z0-9_µπρ]*|[-+*/^(),²³×·])/y;

function tokenize(src: string): string[] {
  const out: string[] = [];
  const text = src.trim();
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m) throw new Error(`Can't read "${text.slice(start, start + 8)}"`);
    if (m[1] === "²") out.push("^", "2");
    else if (m[1] === "³") out.push("^", "3");
    else if (m[1] === "×" || m[1] === "·") out.push("*");
    else out.push(m[1]);
  }
  return out;
}

/** Recursive-descent evaluator. Variables win over units, so an input named "t" stays an input. */
export function evaluate(expr: string, vars: Record<string, Quantity> = {}): Quantity {
  const toks = tokenize(expr);
  if (!toks.length) throw new Error("Empty expression");
  let i = 0;
  const peek = () => toks[i];
  const isUnit = (t: string | undefined) => t !== undefined && t in UNITS && !(t in vars);

  const unitFactor = (): Quantity => {
    const u = UNITS[toks[i++]];
    let exp = 1;
    if (peek() === "^") {
      i++;
      const neg = peek() === "-";
      if (neg) i++;
      exp = Number(toks[i++]) * (neg ? -1 : 1);
    }
    return { value: u.k ** exp, dim: powDim(u.dim, exp) };
  };
  /** "680 kg/m^3": a unit expression binds tighter than arithmetic. */
  const unitExpr = (): Quantity => {
    let q = unitFactor();
    while ((peek() === "/" || peek() === "*") && isUnit(toks[i + 1])) {
      const div = toks[i++] === "/";
      const f = unitFactor();
      q = { value: div ? q.value / f.value : q.value * f.value, dim: mulDim(q.dim, f.dim, div ? -1 : 1) };
    }
    return q;
  };
  const withUnit = (q: Quantity): Quantity => {
    if (!isUnit(peek())) return q;
    const u = unitExpr();
    return { value: q.value * u.value, dim: mulDim(q.dim, u.dim) };
  };
  const primary = (): Quantity => {
    const t = peek();
    if (t === undefined) throw new Error("The expression ends too soon");
    if (t === "(") {
      i++;
      const q = sum();
      if (toks[i++] !== ")") throw new Error("Missing )");
      return withUnit(q);
    }
    if (/^[\d.]/.test(t)) {
      i++;
      return withUnit({ value: Number(t), dim: NONE });
    }
    if (t === "pi" || t === "π") {
      i++;
      return { value: Math.PI, dim: NONE };
    }
    if (t === "sqrt") {
      i++;
      if (toks[i++] !== "(") throw new Error("sqrt needs brackets");
      const q = sum();
      if (toks[i++] !== ")") throw new Error("Missing )");
      return { value: Math.sqrt(q.value), dim: powDim(q.dim, 0.5) };
    }
    if (t in vars) {
      i++;
      return vars[t];
    }
    if (t in UNITS) return unitExpr();
    throw new Error(`Unknown name "${t}"`);
  };
  const power = (): Quantity => {
    const base = primary();
    if (peek() !== "^") return base;
    i++;
    const e = unary();
    if (!sameDim(e.dim, NONE)) throw new Error("A power must be a plain number");
    return { value: base.value ** e.value, dim: powDim(base.dim, e.value) };
  };
  const unary = (): Quantity => {
    if (peek() === "-") {
      i++;
      const q = unary();
      return { value: -q.value, dim: q.dim };
    }
    return power();
  };
  const product = (): Quantity => {
    let q = unary();
    while (peek() === "*" || peek() === "/") {
      const div = toks[i++] === "/";
      const r = unary();
      q = { value: div ? q.value / r.value : q.value * r.value, dim: mulDim(q.dim, r.dim, div ? -1 : 1) };
    }
    return q;
  };
  function sum(): Quantity {
    let q = product();
    while (peek() === "+" || peek() === "-") {
      const minus = toks[i++] === "-";
      const r = product();
      if (!sameDim(q.dim, r.dim)) throw new Error("Can't add quantities with different units");
      q = { value: minus ? q.value - r.value : q.value + r.value, dim: q.dim };
    }
    return q;
  }
  const result = sum();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i]}"`);
  return result;
}

/** The number in a given unit, or an error if the dimensions don't match. */
export function convert(q: Quantity, unit: string): number {
  const u = unit.trim() ? evaluate(`1 ${unit}`) : { value: 1, dim: NONE };
  if (!sameDim(q.dim, u.dim)) throw new Error(`The result isn't in ${unit || "plain numbers"}: units don't match`);
  return q.value / u.value;
}

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

export function runCalc(calc: Pick<CalcData, "inputs" | "formula" | "unit">): CalcResult {
  try {
    const vars: Record<string, Quantity> = {};
    for (const input of calc.inputs) vars[input.name] = evaluate(input.expr, vars);
    return { ok: true, value: convert(evaluate(calc.formula, vars), calc.unit) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function partMass(part: PartData, calcs: { id: string; data: CalcData }[]): number | null {
  if (part.calc_id) {
    const calc = calcs.find((c) => c.id === part.calc_id);
    if (!calc) return null;
    const r = runCalc(calc.data);
    return r.ok ? r.value : null;
  }
  return part.mass_kg;
}

/** Null when any part has no known mass: a partial total would look like a pass. */
export function bomMass(parts: PartData[], calcs: { id: string; data: CalcData }[]): number | null {
  if (!parts.length) return null;
  let total = 0;
  for (const p of parts) {
    const m = partMass(p, calcs);
    if (m === null) return null;
    total += m;
  }
  return total;
}

export function safetyFactor(run: Pick<SimRunData, "max_stress_mpa" | "allowable_mpa">): number | null {
  if (!run.max_stress_mpa || !run.allowable_mpa) return null;
  return run.allowable_mpa / run.max_stress_mpa;
}

/** The change between the last two mesh sizes, as a fraction. Below 2% reads as converged. */
export function convergenceStep(steps: { value: number }[]): number | null {
  if (steps.length < 2) return null;
  const [a, b] = steps.slice(-2);
  return a.value ? Math.abs(b.value - a.value) / Math.abs(a.value) : null;
}

export type Verdict = "pass" | "fail" | "open";

export function meets(req: Pick<RequirementData, "op" | "min" | "max">, value: number | null): Verdict {
  if (value === null) return "open";
  if (req.op === "<=") return req.max === null ? "open" : value <= req.max ? "pass" : "fail";
  if (req.op === ">=") return req.min === null ? "open" : value >= req.min ? "pass" : "fail";
  if (req.min === null || req.max === null) return "open";
  return value >= req.min && value <= req.max ? "pass" : "fail";
}

export function targetText(req: Pick<RequirementData, "op" | "min" | "max" | "unit">): string {
  const unit = req.unit ? ` ${req.unit}` : "";
  if (req.op === "<=") return `≤ ${req.max ?? "?"}${unit}`;
  if (req.op === ">=") return `≥ ${req.min ?? "?"}${unit}`;
  return `${req.min ?? "?"}–${req.max ?? "?"}${unit}`;
}

export interface LabData {
  parts: PartData[];
  calcs: { id: string; data: CalcData }[];
  runs: SimRunData[];
}

/** The value a requirement is checked against, and where it came from. */
export function requirementValue(req: RequirementData, conceptId: string, lab: LabData): { value: number | null; basis: string } {
  if (req.source === "bom_mass") {
    const value = bomMass(lab.parts.filter((p) => p.concept_id === conceptId), lab.calcs);
    return { value, basis: value === null ? "no BOM" : "BOM roll-up" };
  }
  if (req.source === "sim_sf") {
    const sfs = lab.runs
      .filter((r) => r.concept_id === conceptId && r.status === "imported")
      .map(safetyFactor)
      .filter((x): x is number => x !== null);
    // The weakest result decides: one good run doesn't cancel a bad one.
    return sfs.length ? { value: Math.min(...sfs), basis: `${sfs.length} simulation run${sfs.length === 1 ? "" : "s"}` } : { value: null, basis: "no simulation" };
  }
  const v = req.values[conceptId];
  return { value: v?.value ?? null, basis: v?.basis ?? "" };
}

export interface ConceptStanding {
  pass: number;
  fail: number;
  open: number;
  failedMust: string[];
}

export function standing(reqs: RequirementData[], conceptId: string, lab: LabData): ConceptStanding {
  const out: ConceptStanding = { pass: 0, fail: 0, open: 0, failedMust: [] };
  for (const r of reqs) {
    const verdict = meets(r, requirementValue(r, conceptId, lab).value);
    out[verdict]++;
    if (verdict === "fail" && r.priority === "must") out.failedMust.push(r.code);
  }
  return out;
}
