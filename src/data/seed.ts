import {
  Asset,
  Board,
  BoardItem,
  Claim,
  Comment,
  Concept,
  Criterion,
  Decision,
  EvidenceLink,
  ItemData,
  ItemKind,
  PaletteColor,
  RecordDataMap,
  RecordRow,
  RecordType,
  RequirementData,
  Score,
} from "./types";
import { hexToLab } from "../lib/color";

/**
 * First-run demo data, taken from the v2 wireframes. Everything here is is_sample: the UI says
 * so, and Settings removes it. Placeholders in [brackets] are from the design package and are
 * not real people or sources. Palettes are hand-picked to match the placeholder art.
 */
const T0 = Date.parse("2026-11-02T08:00:00Z");
const at = (minutesAgo: number) => new Date(T0 - minutesAgo * 60000).toISOString();

const pal = (...entries: [string, number][]): PaletteColor[] =>
  entries.map(([hex, weight]) => ({ ...hexToLab(hex)!, weight, hex }));

type AssetSeed = [
  id: string,
  title: string,
  preview: string,
  credit: string,
  tags: string,
  palette: PaletteColor[],
  provenance?: Asset["provenance"],
];

const ASSETS: AssetSeed[] = [
  ["a-lounge", "Lounge, oak legs", "lounge", "[maker]", "chair lounge soft curves boucle oak form comfort", pal(["#E4DCCD", 0.55], ["#C2A98A", 0.35], ["#8A6A4C", 0.1]), "human"],
  ["a-oak", "Rift oak", "oak", "[mill]", "wood oak grain warm material", pal(["#C9A67D", 0.7], ["#D9BE98", 0.2], ["#B48F67", 0.1]), "human"],
  ["a-sketch", "Shell sketch", "sketch", "yours", "sketch pencil drawing shell form", pal(["#F2EDE3", 0.9], ["#3E403B", 0.1]), "human"],
  ["a-room", "Reading corner", "room", "[studio]", "room interior reading corner plant chair soft", pal(["#E6DACA", 0.55], ["#C2A98A", 0.3], ["#5F7A62", 0.08], ["#B86E4B", 0.07]), "human"],
  ["a-ply", "Ply edge", "ply", "[mill]", "plywood edge layers wood production", pal(["#D9BE98", 0.6], ["#B48F67", 0.4]), "human"],
  ["a-walnut", "Walnut veneer", "walnut", "[mill]", "wood walnut dark veneer material", pal(["#80604A", 0.8], ["#634735", 0.2]), "human"],
  ["a-swatch", "Clay and sage", "swatch", "[maker]", "swatches clay sage colour material", pal(["#E9E1D3", 0.45], ["#C77B57", 0.3], ["#AFC1AC", 0.25]), "human"],
  ["a-boucle", "Bouclé, ivory", "boucle", "[mill]", "fabric boucle ivory textile upholstery texture", pal(["#CDBFAB", 0.75], ["#E9E1D3", 0.25]), "human"],
  ["a-detail", "Edge, raking light", "detail", "[studio]", "detail edge shell dark light", pal(["#2E332D", 0.7], ["#3E3226", 0.2], ["#B48F67", 0.1]), "human"],
  ["a-linen", "Linen weave", "linen", "[mill]", "fabric linen weave textile", pal(["#CFC6B4", 0.85], ["#E9E1D3", 0.15]), "human"],
  ["a-shadow", "Leaf shadow", "shadow", "yours", "shadow leaf plaster light", pal(["#E9E1D3", 0.7], ["#C9BFAE", 0.3]), "human"],
  ["a-tube", "Tube base", "tube", "", "steel tube metal base frame production", pal(["#DDD8CF", 0.65], ["#7A7C74", 0.35]), "unknown"],
  ["a-frp", "FRP sample", "frp", "[lab]", "frp shell sage composite green sample", pal(["#CFD8CF", 0.5], ["#7E9180", 0.5]), "human"],
];

const assets: Asset[] = ASSETS.map(([id, title, preview, credit, tags, palette_lab, provenance], i) => ({
  id,
  kind: "image",
  title,
  file_path: null,
  preview,
  source_url: null,
  credit: credit || null,
  via: credit && credit !== "yours" ? "[site]" : null,
  captured_at: at(60 * 24 + i * 40),
  provenance: provenance ?? "unknown",
  palette_lab,
  width: 800,
  height: 800,
  tags,
  notes: "",
  is_sample: true,
}));

assets.push({
  id: "a-study",
  kind: "pdf",
  title: "[Study on textured upholstery]",
  file_path: null,
  preview: null,
  source_url: null,
  credit: "[author]",
  via: null,
  captured_at: at(60 * 30),
  provenance: "human",
  palette_lab: [],
  width: null,
  height: null,
  tags: "paper study upholstery texture comfort",
  notes: "",
  is_sample: true,
});

const board = (id: string, name: string, version: number, minutesAgo: number, share = {}): Board => ({
  id,
  name,
  version,
  share,
  created_at: at(minutesAgo + 6000),
  updated_at: at(minutesAgo),
  is_sample: true,
});

const boards: Board[] = [
  board("b-furniture", "Furniture Study", 3, 120, {
    headline: "A softer reading chair",
    tagline: "Soft forms, honest materials.",
    summary:
      "A rounded oak ply shell, softened with bouclé where you sit. We're confirming one cost figure before the final pick, and you'll see it here when it lands.",
  }),
  board("b-material", "Material Exploration", 1, 1440),
  board("b-gripper", "Gripper Concept", 1, 2880),
  board("b-brand", "Brand Direction", 1, 4320),
];

let z = 0;
const item = (
  id: string,
  board_id: string,
  kind: ItemKind,
  x: number,
  y: number,
  w: number,
  h: number,
  asset_id: string | null = null,
  data: ItemData = {},
  rotation = 0,
): BoardItem => ({ id, board_id, kind, x, y, w, h, rotation, z: z++, asset_id, data, updated_at: at(120) });

const F = "b-furniture";
const items: BoardItem[] = [
  item("i-form", F, "section", 48, 40, 480, 480, null, { text: "form" }),
  item("i-lounge", F, "image", 64, 90, 272, 340, "a-lounge", { caption: "lounge chair" }),
  item("i-sketch", F, "image", 362, 90, 156, 196, "a-sketch", { caption: "sketch v2" }, 1.2),
  item("i-detail", F, "image", 362, 320, 156, 110, "a-detail", { caption: "edge" }),
  item("i-materials", F, "section", 556, 40, 400, 480, null, { text: "materials" }),
  item("i-boucle", F, "image", 572, 90, 116, 116, "a-boucle", { caption: "bouclé" }),
  item("i-oak", F, "image", 700, 90, 116, 116, "a-oak", { caption: "oak ply" }),
  item("i-frp", F, "image", 828, 90, 116, 116, "a-frp", { caption: "frp" }),
  item("i-study", F, "image", 572, 246, 372, 82, "a-study", {}),
  item("i-palette", F, "palette", 572, 350, 372, 150, null, {
    colors: ["#E9E1D3", "#C9A67D", "#7E9180", "#B86E4B", "#3E3226"],
  }),
  item("i-comfort", F, "section", 974, 40, 330, 480, null, { text: "comfort" }),
  item("i-room", F, "image", 990, 142, 290, 207, "a-room", {}),
  item("i-link", F, "connector", 0, 0, 0, 0, null, { from: "i-study", to: "i-room", connector: "supports" }),
  item("i-production", F, "section", 48, 536, 880, 250, null, { text: "production" }),
  item("i-note", F, "sticky", 64, 584, 194, 126, null, { text: "Ask the workshop about FRP mould lead time", author: "RK" }, -1.5),
  item("i-tube", F, "image", 288, 584, 176, 140, "a-tube", { caption: "tube base" }),
  item("i-plyedge", F, "image", 478, 584, 140, 140, "a-ply", { caption: "ply edge" }),
  item("i-hand", F, "text", 640, 600, 240, 64, null, { text: "check tooling cost before scoring in Lab" }),
];

const mosaic = (board_id: string, ids: string[]) =>
  ids.map((asset, i) =>
    item(`i-${board_id}-${i}`, board_id, "image", 64 + (i % 2) * 300, 64 + Math.floor(i / 2) * 280, 280, 260, asset),
  );
items.push(
  ...mosaic("b-material", ["a-swatch", "a-linen", "a-walnut"]),
  ...mosaic("b-gripper", ["a-tube", "a-detail", "a-ply"]),
  ...mosaic("b-brand", ["a-frp", "a-shadow", "a-boucle"]),
);

const claims: Claim[] = [
  { id: "c-softness", board_id: F, text: "Bouclé lowers perceived hardness", created_at: at(500), is_sample: true },
  { id: "c-cost", board_id: F, text: "A's unit cost is lower than B's", created_at: at(400), is_sample: true },
  { id: "c-weight", board_id: F, text: "Steel frames are heavier than ply shells", created_at: at(300), is_sample: true },
];

const D = "d-chair";
const decisions: Decision[] = [
  { id: D, board_id: F, title: "Which chair base?", created_at: at(2000), is_sample: true },
];

const concepts: Concept[] = [
  { id: "k-a", decision_id: D, label: "A", name: "Oak ply shell", asset_id: "a-lounge", flag: "misses 7 kg limit", sort: 0 },
  { id: "k-b", decision_id: D, label: "B", name: "FRP shell", asset_id: "a-frp", flag: "mass not checked", sort: 1 },
  { id: "k-c", decision_id: D, label: "C", name: "Steel tube", asset_id: "a-tube", flag: "", sort: 2 },
];

// From wireframes/V2-Lab.dc.html. Expected totals: A 3.75, B 3.70, C 3.35.
const MATRIX: [name: string, weight: number, a: number, b: number, c: number, guesses: string][] = [
  ["Comfort", 0.25, 4, 5, 3, ""],
  ["Strength", 0.2, 3, 4, 5, ""],
  ["Cost", 0.2, 4, 2, 3, "a"],
  ["Weight", 0.15, 3, 5, 2, "c"],
  ["Manufacturability", 0.1, 4, 3, 4, "c"],
  ["Sustainability", 0.1, 5, 2, 3, "b"],
];

const criteria: Criterion[] = [];
const scores: Score[] = [];
const evidence_links: EvidenceLink[] = [];
const EVIDENCE = ["a-study", "a-boucle", "a-oak", "a-ply"];
MATRIX.forEach(([name, weight, a, b, c, guesses], sort) => {
  const id = `q-${name.toLowerCase()}`;
  criteria.push({ id, decision_id: D, name, weight, sort });
  (["a", "b", "c"] as const).forEach((label, col) => {
    const value = [a, b, c][col];
    const is_assumption = guesses.includes(label);
    const sid = `s-${label}-${id}`;
    scores.push({ id: sid, concept_id: `k-${label}`, criterion_id: id, value, is_assumption });
    if (!is_assumption) {
      evidence_links.push({
        id: `e-${sid}`,
        asset_id: EVIDENCE[(sort + col) % EVIDENCE.length],
        target_type: "score",
        target_id: sid,
        note: "",
        created_at: at(600),
        is_sample: true,
      });
    }
  });
});
evidence_links.push({
  id: "e-room",
  asset_id: "a-room",
  target_type: "claim",
  target_id: "c-softness",
  note: "",
  created_at: at(500),
  is_sample: true,
});

const comment = (
  id: string,
  parent_id: string | null,
  author: string,
  is_guest: boolean,
  text: string,
  asset_id: string | null,
  pin: [number, number] | null,
  minutesAgo: number,
): Comment => ({
  id,
  board_id: F,
  parent_id,
  author,
  is_guest,
  text,
  asset_id,
  pin_x: pin?.[0] ?? null,
  pin_y: pin?.[1] ?? null,
  created_at: at(minutesAgo),
  is_sample: true,
});

const comments: Comment[] = [
  comment("m-1", null, "[Reviewer]", false, "Love this shape. Could we see it in a darker oak?", "a-room", [34, 50], 10),
  comment("m-1r", "m-1", "[Designer]", false, "Yes, walnut-stained options tomorrow.", null, null, 2),
  comment("m-2", null, "[Reviewer]", false, "Is this the actual finish or a reference?", "a-oak", [78, 18], 6),
];

export const SEED = {
  assets,
  boards,
  board_items: items,
  claims,
  decisions,
  concepts,
  criteria,
  scores,
  evidence_links,
  comments,
};

// --- Engineering, research and progress samples, added in v0.2. Values come from the v1 wireframes.
const rec = <T extends RecordType>(id: string, type: T, parent_id: string | null, data: RecordDataMap[T]): RecordRow =>
  ({ id, type, parent_id, data, created_at: at(600), updated_at: at(600), is_sample: true }) as RecordRow;

const req = (
  code: string,
  text: string,
  priority: "must" | "want",
  verified_by: string,
  op: RequirementData["op"],
  min: number | null,
  max: number | null,
  unit: string,
  source: RequirementData["source"],
  why: string,
  values: RequirementData["values"] = {},
) => rec(`r-${code}`, "requirement", D, { code, text, priority, why, op, min, max, unit, source, verified_by, values });

const part = (id: string, name: string, material: string, qty: string, mass_kg: number | null, calc_id: string | null, basis: string) =>
  rec(id, "part", D, { concept_id: "k-a", name, material, qty, mass_kg, calc_id, basis, cost: "[quote]" });

const run = (
  id: string,
  name: string,
  concept_id: string,
  max_stress_mpa: number | null,
  allowable_mpa: number | null,
  deflection_mm: number | null,
  status: "imported" | "queued",
  convergence: { mesh: string; value: number }[] = [],
) =>
  rec(id, "sim_run", D, {
    name,
    concept_id,
    status,
    solver: status === "queued" ? "" : "ANSYS Mechanical",
    load_case: "[standard] seat static load, fixed at 4 base mounts",
    max_stress_mpa,
    allowable_mpa,
    deflection_mm,
    convergence,
    asset_ids: [],
  });

const person = (n: number, context: string) => rec(`p-${n}`, "participant", null, { code: `P${n}`, context, consent: true });
const theme = (id: string, name: string) => rec(id, "theme", null, { name });
const inote = (id: string, participant: number, theme_id: string, text: string) =>
  rec(id, "interview_note", null, { participant_id: `p-${participant}`, theme_id, text });

const studyAsset = (id: string, kind: Asset["kind"], title: string, preview: string, tags: string): Asset => ({
  id,
  kind,
  title,
  file_path: null,
  preview,
  source_url: null,
  credit: "[maker]",
  via: null,
  captured_at: at(60 * 20),
  provenance: "human",
  palette_lab: [],
  width: null,
  height: null,
  tags,
  notes: "",
  is_sample: true,
});

export const SEED_V2: { assets: Asset[]; records: RecordRow[] } = {
  assets: [
    studyAsset("a-paper", "pdf", "[Sample study, try the Reader]", "/samples/study.pdf", "paper study reader upholstery softness"),
    studyAsset("a-cad", "3d", "Shell CAD v2", "/samples/chair.stl", "cad model chair shell stl"),
  ],
  records: [
    req("R1", "Seat static load, safety factor ≥ 2.0", "must", "FEA runs 01–03", ">=", 2, null, "", "sim_sf", "Must survive the seat load test."),
    req("R2", "Total mass ≤ 7.00 kg", "must", "BOM roll-up, CAD mass", "<=", null, 7, "kg", "bom_mass", "One-hand carry in small rooms."),
    req("R3", "Unit cost ≤ ₹[target]", "must", "supplier quote needed", "<=", null, null, "", "manual", "Has to sell at the student price point."),
    req("R4", "Footprint within 600 × 600 mm", "must", "CAD bounding box", "<=", null, 600, "mm", "manual", "Fits under a hostel desk.", { "k-a": { value: 590, basis: "Shell CAD v2, bounding box" } }),
    req("R5", "Seat height 420–460 mm", "must", "CAD measure", "between", 420, 460, "mm", "manual", "Standard desk height.", { "k-a": { value: 438, basis: "Shell CAD v2, measured" } }),
    req("R6", "At least 50% renewable material by mass", "want", "BOM materials", ">=", 50, null, "%", "manual", "Sustainability goal.", { "k-a": { value: 51, basis: "BOM materials" } }),
    rec("calc-1", "calc", D, { code: "C1", title: "Shell mass", inputs: [{ name: "A", expr: "0.45 m^2" }, { name: "t", expr: "12 mm" }, { name: "rho", expr: "680 kg/m^3" }], formula: "A * t * rho", unit: "kg", basis: "ρ from Properties" }),
    rec("calc-2", "calc", D, { code: "C2", title: "Base tube mass", inputs: [{ name: "D", expr: "22 mm" }, { name: "d", expr: "19 mm" }, { name: "L", expr: "3.2 m" }, { name: "rho", expr: "7850 kg/m^3" }], formula: "pi/4 * (D^2 - d^2) * L * rho", unit: "kg", basis: "ρ standard value" }),
    part("part-1", "Seat shell", "Oak ply 12 mm", "0.45 m²", null, "calc-1", "calc C1"),
    part("part-2", "Upholstery", "Bouclé + foam", "1 set", 0.9, null, "supplier spec"),
    part("part-3", "Base", "Steel tube Ø22 × 1.5", "3.2 m", null, "calc-2", "calc C2"),
    part("part-4", "Glides + fasteners", "Mixed", "1 set", 0.15, null, "estimate"),
    rec("mat-1", "material", D, { name: "Oak ply", props: [{ name: "density", value: "680 kg/m³" }, { name: "allowable stress", value: "40 MPa" }], source: "supplier datasheet" }),
    rec("mat-2", "material", D, { name: "Structural steel tube", props: [{ name: "density", value: "7850 kg/m³" }, { name: "yield", value: "250 MPa" }], source: "grade [spec], standard values" }),
    rec("mat-3", "material", D, { name: "FRP laminate", props: [{ name: "density", value: "[datasheet]" }, { name: "allowable stress", value: "110 MPa" }], source: "density missing, so B has no BOM" }),
    run("run-1", "Run 01 · A oak ply 12 mm", "k-a", 19, 40, 3.8, "imported", [{ mesh: "8 mm", value: 17.6 }, { mesh: "4 mm", value: 18.8 }, { mesh: "2 mm", value: 19 }]),
    run("run-2", "Run 02 · B FRP shell", "k-b", 42, 110, 2.2, "imported"),
    run("run-3", "Run 03 · C steel base", "k-c", 96, 250, null, "imported"),
    run("run-4", "Run 04 · A oak ply 10 mm", "k-a", null, null, null, "queued"),
    person(1, "hostel"),
    person(2, "shared flat"),
    person(3, "hostel"),
    person(4, "club room"),
    person(5, "studio flat"),
    person(6, "family home"),
    theme("t-carry", "Carrying & moving"),
    theme("t-rooms", "Small rooms"),
    theme("t-clean", "Cleaning fabric"),
    theme("t-price", "Price"),
    inote("n-1", 1, "t-carry", "Moves the chair between rooms every day"),
    inote("n-2", 2, "t-carry", "Can't lift a heavy chair one-handed"),
    inote("n-3", 4, "t-carry", "Stacks chairs after club events"),
    inote("n-4", 5, "t-carry", "Wants a grip point to carry it"),
    inote("n-5", 3, "t-rooms", "No space for armrests next to the bed"),
    inote("n-6", 6, "t-rooms", "Chair blocks the door when pulled out"),
    inote("n-7", 1, "t-rooms", "Pushes it fully under the desk"),
    inote("n-8", 2, "t-clean", "Worried light fabric will stain"),
    inote("n-9", 3, "t-clean", "Wants a removable cover"),
    inote("n-10", 4, "t-price", "Would pay more if it lasts years"),
    inote("n-11", 6, "t-price", "Budget is tight; asks about [₹ range]"),
    rec("note-1", "note", null, { title: "Why bouclé", body: "Texture changes how soft a seat feels.\n\nsupports:: [[Bouclé lowers perceived hardness]]\n\nSee also [[Comfort questions]]." }),
    rec("mile-1", "milestone", null, { title: "Concept frozen", date: "2026-12-01", gate: "decision_logged", decision_id: D }),
    rec("mile-2", "milestone", null, { title: "All safety-critical requirements verified", date: "2027-01-15", gate: "all_must_verified", decision_id: D }),
  ],
};
