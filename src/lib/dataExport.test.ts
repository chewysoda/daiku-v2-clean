import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { SEED_V3 } from "../data/seedAgents";
import { useStore } from "../data/store";
import { buildExport, cleanFolder, cleanName, defaultPlan, exportLayout, ExportPlan, parseExportPlan } from "./dataExport";
import { filesInScope, narrowToProject, parseScope, projectAssetIds, rowsInScope } from "./projects";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1]) }));

type S = ReturnType<typeof useStore.getState>;

const other = { id: "a-other", kind: "image", title: "Other project picture", file_path: null, preview: "lounge", source_url: null, credit: "Rin", via: null, captured_at: "", provenance: "human", palette_lab: [], width: 1, height: 1, tags: "", notes: "", is_sample: false };
const project = () =>
  ({
    comments: [],
    workflow_log: [],
    ...SEED_V3,
    assets: [...SEED_V3.assets, other],
    records: [
      ...SEED_V3.records,
      { id: "p-yes", type: "participant", parent_id: null, data: { code: "P1", context: "uses agents daily", consent: true }, is_sample: false },
      { id: "p-no", type: "participant", parent_id: null, data: { code: "P2", context: "NOCONSENT", consent: false }, is_sample: false },
      { id: "n-no", type: "interview_note", parent_id: null, data: { participant_id: "p-no", theme_id: null, text: "NOCONSENT note" }, is_sample: false },
    ],
  }) as unknown as S;

const plan = (change: (p: ExportPlan) => void = () => {}): ExportPlan => {
  const p = defaultPlan();
  p.scope = "all";
  p.includeSamples = true;
  change(p);
  return p;
};

const zip = async (p: ExportPlan, s = project()) => {
  const out = await buildExport(s, p);
  const files = unzipSync(out.bytes);
  return { ...out, names: Object.keys(files), json: (f: string) => JSON.parse(strFromU8(files[f])), raw: Object.entries(files).filter(([n]) => n.endsWith(".json")).map(([, b]) => strFromU8(b)).join("\n") };
};

describe("names people type", () => {
  it("can't climb out of the zip", () => {
    expect(cleanFolder("../../etc")).toBe("etc");
    expect(cleanFolder("C:\\Users\\me")).not.toContain(":");
    expect(cleanFolder("/a//b/")).toBe("a/b");
    expect(cleanFolder("   ")).toBe("");
    expect(cleanFolder("a/./b/..")).toBe("a/b");
  });
  it("drops a typed extension and falls back when empty", () => {
    expect(cleanName("graphs.json", "json", "x")).toBe("graphs");
    expect(cleanName("", "json", "x")).toBe("x");
    expect(cleanName('a/b:"c', "json", "x")).not.toMatch(/[\\/:"]/);
  });
});

describe("the six data files", () => {
  it("writes each to the chosen folder and name", async () => {
    const { names, name } = await zip(plan((p) => {
      p.zipName = "Agents handoff.zip";
      p.sets.weightage = { on: true, folder: "scores/final", file: "weights.json" };
    }));
    expect(name).toBe("Agents handoff.zip");
    expect(names).toContain("scores/final/weights.json");
    for (const f of ["graphs", "moodboards", "research", "snips", "contacts"]) expect(names).toContain(`data/${f}.json`);
    expect(names).toContain("index.json");
  });
  it("leaves out what's unticked", async () => {
    const { names } = await zip(plan((p) => {
      p.sets.contacts.on = false;
      p.images.on = false;
    }));
    expect(names).not.toContain("data/contacts.json");
    expect(names.some((n) => n.startsWith("images/"))).toBe(false);
  });
  it("gives weights, totals and ranks, with guesses marked as guesses", async () => {
    const { json } = await zip(plan());
    const d = json("data/weightage.json").decisions[0];
    expect(d.criteria.map((c: { weight: number }) => c.weight)).toEqual([0.4, 0.35, 0.25]);
    expect(d.concepts[0]).toMatchObject({ name: "Quiet operator", rank: 1 });
    expect(d.concepts[0].total).toBeCloseTo(4.25);
    expect(d.scores.every((x: { basis: string }) => x.basis === "guess")).toBe(true);
  });
  it("gives mood boards their sections, palettes and pictures with credit", async () => {
    const { json } = await zip(plan());
    const b = json("data/moodboards.json").boards[0];
    expect(b.sections).toHaveLength(3);
    expect(b.palettes[0].colors).toContain("#5B74D6");
    expect(b.images[0].asset.credit).toBe("Daiku sample art");
    expect(b.images[0].asset.file).toMatch(/^images\//);
  });
  it("gives the graph nodes and edges", async () => {
    const g = (await zip(plan())).json("data/graphs.json");
    expect(g.nodes.length).toBeGreaterThan(3);
    expect(g.edges.length).toBeGreaterThan(0);
  });
  it("marks a claim with no evidence as an assumption", async () => {
    const r = (await zip(plan())).json("data/research.json");
    expect(r.claims.find((c: { id: string }) => c.id === "agc-3").status).toBe("assumption");
    expect(r.claims.find((c: { id: string }) => c.id === "agc-1").status).toBe("has evidence");
    expect(r.drafts[0].title).toBe("Agents: design direction");
  });
  it("finds snips and quotes, keeping a missing credit null", async () => {
    const s = (await zip(plan())).json("data/snips.json").snips;
    expect(s.map((x: { id: string }) => x.id)).toEqual(["ag-q1", "ag-q2"]);
    expect(s[0].credit).toBeNull();
  });
  it("never exports someone with no consent on record", async () => {
    const { raw, json } = await zip(plan());
    expect(raw).not.toContain("NOCONSENT");
    expect(json("data/contacts.json").participants).toEqual([{ code: "P1", context: "uses agents daily" }]);
  });
  it("gives every picture its credit in the index, and no paths from this PC", async () => {
    const { json, raw } = await zip(plan());
    const index = json("index.json");
    expect(index.images.every((i: { credit: string }) => i.credit)).toBe(true);
    expect(raw).not.toContain("C:\\");
  });
});

describe("organising pictures", () => {
  const paths = (p: ExportPlan) => exportLayout(project(), p).images.map((i) => i.path);
  it("puts them in one folder by default", () => {
    expect(paths(plan())).toContain("images/Signal grid.svg");
  });
  it("sorts by board, kind or credit", () => {
    expect(paths(plan((p) => void (p.images.organise = "board")))).toContain("images/Agents mood board/Signal grid.svg");
    expect(paths(plan((p) => void (p.images.organise = "kind")))).toContain("images/image/Signal grid.svg");
    expect(paths(plan((p) => void (p.images.organise = "credit")))).toContain("images/Daiku sample art/Signal grid.svg");
  });
  it("sorts by project, with a folder for the rest", () => {
    const all = paths(plan((p) => void (p.images.organise = "project")));
    expect(all).toContain("images/Agents mood board/Signal grid.svg");
    expect(all).toContain("images/no project/Other project picture.svg");
  });
  it("numbers them on request", () => {
    expect(paths(plan((p) => void (p.images.numbered = true)))[0]).toMatch(/^images\/001 /);
  });
  it("takes a name and folder for one picture", () => {
    const all = paths(plan((p) => void (p.images.renames["ag-grid"] = { name: "hero", folder: "final/picks" })));
    expect(all).toContain("images/final/picks/hero.svg");
    expect(all).not.toContain("images/Signal grid.svg");
  });
  it("doesn't overwrite when two pictures get the same name", () => {
    const all = paths(plan((p) => {
      p.images.renames["ag-grid"] = { name: "same" };
      p.images.renames["ag-type"] = { name: "same" };
    }));
    expect(all).toContain("images/same.svg");
    expect(all).toContain("images/same 2.svg");
  });
  it("doesn't let a data file overwrite the index", () => {
    const names = exportLayout(project(), plan((p) => void (p.sets.graphs = { on: true, folder: "", file: "index" }))).files.map((f) => f.path);
    expect(names.filter((n) => n === "index.json")).toHaveLength(1);
    expect(names).toContain("index 2.json");
  });
});

describe("choosing pictures", () => {
  it("leaves out an unticked picture, keeping its credit in the data", async () => {
    const { names, json } = await zip(plan((p) => void (p.images.excluded = ["ag-grid"])));
    expect(names).not.toContain("images/Signal grid.svg");
    expect(names).toContain("images/Type plain and exact.svg");
    const image = json("data/moodboards.json").boards[0].images.find((i: { asset: { id: string } }) => i.asset.id === "ag-grid");
    expect(image.asset).toMatchObject({ credit: "Daiku sample art", file: null });
  });
});

describe("projects", () => {
  const data = () => SEED_V3.records.find((r) => r.id === "pr-agents")!.data as never;
  it("counts files added, on its boards, and used by its decisions", () => {
    const ids = projectAssetIds(project(), data());
    expect(ids.has("ag-q1")).toBe(true);
    expect(ids.has("ag-grid")).toBe(true);
    expect(ids.has("a-other")).toBe(false);
  });
  it("narrows an export to the project", async () => {
    const s = project();
    const p = plan((x) => void (x.scope = "pr-agents"));
    const names = (await zip(p, s)).names;
    expect(names.join()).not.toContain("Other project picture");
    expect(narrowToProject(s, data()).records.some((r) => r.id === "note-agents")).toBe(true);
  });
  const withWorking = (working: boolean) => {
    const s = project();
    s.records = s.records.map((r) => (r.id === "pr-agents" ? ({ ...r, data: { ...(r.data as object), working } } as never) : r));
    return s;
  };
  it("hides a project's files when it isn't being worked on, and only then", () => {
    const titles = (s: S, scope: Parameters<typeof filesInScope>[2]) => filesInScope(s, s.assets, scope).map((a) => a.id);
    expect(titles(withWorking(true), "working")).toContain("ag-grid");
    expect(titles(withWorking(false), "working")).not.toContain("ag-grid");
    expect(titles(withWorking(false), "all")).toContain("ag-grid");
  });
  it("never hides a file that's in no project", () => {
    const s = withWorking(false);
    expect(filesInScope(s, s.assets, "working").map((a) => a.id)).toContain("a-other");
    expect(filesInScope(s, s.assets, "unfiled").map((a) => a.id)).toEqual(["a-other"]);
  });
  it("can show just one project", () => {
    const s = withWorking(true);
    const ids = filesInScope(s, s.assets, { project: "pr-agents" }).map((a) => a.id);
    expect(ids).toContain("ag-orbit");
    expect(ids).not.toContain("a-other");
  });
});

describe("threads by project", () => {
  const working = (on: boolean) => {
    const s = project();
    s.records = s.records.map((r) => (r.id === "pr-agents" ? ({ ...r, data: { ...(r.data as object), working: on } } as never) : r));
    return s;
  };
  it("shows everything for all projects", () => {
    const s = working(false);
    expect(rowsInScope(s, "all").boards).toHaveLength(1);
  });
  it("drops a project that isn't being worked on, with everything on it", () => {
    const out = rowsInScope(working(false), "working");
    expect(out.boards).toEqual([]);
    expect(out.board_items).toEqual([]);
    expect(out.decisions).toEqual([]);
    expect(out.concepts).toEqual([]);
    expect(out.scores).toEqual([]);
    expect(out.claims).toEqual([]);
    expect(out.evidence_links).toEqual([]);
    expect(out.assets.map((a) => a.id)).toEqual(["a-other"]);
  });
  it("keeps it while it's being worked on", () => {
    const out = rowsInScope(working(true), "working");
    expect(out.boards).toHaveLength(1);
    expect(out.scores.length).toBeGreaterThan(0);
  });
  it("shows one project alone, or what's in none", () => {
    const s = working(true);
    expect(rowsInScope(s, { project: "pr-agents" }).assets.map((a) => a.id)).not.toContain("a-other");
    expect(rowsInScope(s, "unfiled").boards).toEqual([]);
    expect(rowsInScope(s, "unfiled").assets.map((a) => a.id)).toEqual(["a-other"]);
  });
  it("falls back when a saved project has gone", () => {
    expect(parseScope("project:gone", [])).toBe("working");
    expect(parseScope("all", [])).toBe("all");
    expect(parseScope("", [])).toBe("working");
  });
});

describe("the agents example", () => {
  it("is all sample data", () => {
    for (const rows of [SEED_V3.assets, SEED_V3.boards, SEED_V3.claims, SEED_V3.decisions, SEED_V3.records]) for (const r of rows) expect(r.is_sample).toBe(true);
  });
  it("marks every score a guess", () => {
    expect(SEED_V3.scores.every((x) => x.is_assumption)).toBe(true);
  });
  it("labels its quotes as made up, and gives them no invented source", () => {
    for (const q of SEED_V3.assets.filter((a) => a.kind === "quote")) {
      expect(q.notes).toContain("[Sample quote");
      expect(q.credit).toBeNull();
      expect(q.source_url).toBeNull();
    }
  });
  it("has weights that add up", () => {
    expect(SEED_V3.criteria.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
  });
});

describe("the saved plan", () => {
  it("survives being empty or damaged", () => {
    expect(parseExportPlan("").zipName).toBe("Daiku export");
    expect(parseExportPlan("{bad").sets.graphs.on).toBe(true);
    expect(parseExportPlan("null").images.folder).toBe("images");
    expect(parseExportPlan('{"images":{"organise":"nonsense"}}').images.organise).toBe("flat");
  });
  it("round-trips", () => {
    const p = plan((x) => void (x.images.renames.a = { name: "n" }));
    expect(parseExportPlan(JSON.stringify(p))).toEqual(p);
  });
});
