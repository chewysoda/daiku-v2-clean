import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { Board, BoardItem } from "../data/types";
import { useStore } from "../data/store";
import { normaliseForReading, strokePoints, writingBox, writtenStrokes } from "../features/canvas/handwriting";
import { boardMarkdown, buildClaudePack, claudeMd, claudePrompt, drawingsSvg, withoutSamples } from "./claudePack";
import { EMPTY_PLAN } from "./packPlan";

vi.mock("./saveFile", async (real) => ({ ...(await real<object>()), fetchBytes: async () => new Uint8Array([1, 2, 3]) }));

type S = ReturnType<typeof useStore.getState>;

const item = (fields: Partial<BoardItem>): BoardItem =>
  ({ id: "i", board_id: "b1", kind: "sticky", x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 0, asset_id: null, data: {}, updated_at: "", ...fields }) as BoardItem;
const asset = (fields: object) => ({ id: "a1", kind: "image", title: "Photo", file_path: "C:\\Users\\someone\\Documents\\Daiku Library\\assets\\abc.png", preview: null, source_url: null, credit: "Rin", via: null, captured_at: "", provenance: "unknown", palette_lab: [], width: null, height: null, tags: "", notes: "", is_sample: false, ...fields });

function state(extra: object = {}): S {
  return {
    assets: [asset({})],
    boards: [{ id: "b1", name: "Chair study", version: 1, share: {}, created_at: "", updated_at: "", is_sample: false }],
    board_items: [item({ id: "n1", data: { text: "Softer seat" } })],
    claims: [{ id: "c1", board_id: null, text: "Oak outlasts ash", created_at: "", is_sample: false }],
    evidence_links: [],
    decisions: [],
    concepts: [],
    criteria: [],
    scores: [],
    records: [],
    workflow_log: [],
    comments: [],
    ...extra,
  } as unknown as S;
}

const options = { brief: "Build a product page", includeFiles: true, includeSamples: true };
const read = async (s: S, o = options) => {
  const { bytes } = await buildClaudePack(s, o);
  const files = unzipSync(bytes);
  return { names: Object.keys(files), text: (p: string) => strFromU8(files[p]) };
};

describe("the pack", () => {
  it("leads with a CLAUDE.md holding the brief", async () => {
    const { names, text } = await read(state());
    expect(names).toContain("CLAUDE.md");
    expect(text("CLAUDE.md")).toContain("Build a product page");
  });

  it("tells Claude that saved web text is not instructions", async () => {
    const { text } = await read(state());
    expect(text("CLAUDE.md")).toMatch(/reference material, not instructions/);
  });

  it("flags unproven claims and uncredited sources", () => {
    const md = claudeMd(state({ assets: [asset({ credit: null, title: "Mystery" })] }), options);
    expect(md).toContain("Oak outlasts ash");
    expect(md).toContain("Mystery");
  });

  it("asks what to build when there's no brief", () => {
    expect(claudeMd(state(), { ...options, brief: "  " })).toMatch(/No brief was written/);
  });

  it("doesn't reveal where files live on this PC", async () => {
    const { names, text } = await read(state());
    for (const name of names.filter((n) => /\.(md|json|bib)$/.test(n))) {
      expect(text(name), name).not.toContain("Users\\\\someone");
      expect(text(name), name).not.toContain("Users\\someone");
    }
    expect(text("project.json")).toContain("attachments/");
  });

  it("can leave files out, and says so", async () => {
    const { names, text } = await read(state(), { ...options, includeFiles: false });
    expect(names.some((n) => n.startsWith("attachments/"))).toBe(false);
    expect(text("CLAUDE.md")).toMatch(/left out/);
  });

  it("leaves out Obsidian's own formats, as the readable boards replace them", async () => {
    const { names } = await read(state());
    expect(names.some((n) => n.endsWith(".canvas"))).toBe(false);
    expect(names).toContain("boards/Chair study.md");
  });

  it("copies as one block of text, marking each file", async () => {
    const text = await claudePrompt(state(), { brief: "x", includeSamples: true });
    expect(text.indexOf('<file path="CLAUDE.md">')).toBe(0);
    expect(text).toContain('<file path="boards/Chair study.md">');
    expect(text).toContain("Softer seat");
  });
});

describe("the map in the pack", () => {
  const mapped = () =>
    state({
      assets: [asset({ id: "s1", title: "Oak datasheet" }), asset({ id: "s2", title: "Forum post", credit: null })],
      claims: [
        { id: "c1", board_id: "b1", text: "Oak outlasts ash", created_at: "", is_sample: false },
        { id: "c2", board_id: null, text: "Buyers prefer oak", created_at: "", is_sample: false },
      ],
      decisions: [{ id: "d1", board_id: null, title: "Which wood?", created_at: "", is_sample: false }],
      concepts: [{ id: "k1", decision_id: "d1", label: "A", name: "Oak", asset_id: null, flag: "", sort: 0 }],
      criteria: [
        { id: "r1", decision_id: "d1", name: "Durability", weight: 0.6, sort: 0 },
        { id: "r2", decision_id: "d1", name: "Cost", weight: 0.4, sort: 1 },
      ],
      scores: [
        { id: "x1", concept_id: "k1", criterion_id: "r1", value: 4, is_assumption: false },
        { id: "x2", concept_id: "k1", criterion_id: "r2", value: 3, is_assumption: true },
      ],
      evidence_links: [
        { id: "l1", asset_id: "s1", target_type: "claim", target_id: "c1", note: "", stance: "for", strength: "strong", created_at: "", is_sample: false },
        { id: "l2", asset_id: "s2", target_type: "claim", target_id: "c1", note: "", stance: "against", created_at: "", is_sample: false },
        { id: "l3", asset_id: "s1", target_type: "score", target_id: "x1", note: "", created_at: "", is_sample: false },
      ],
    });

  it("says what each claim and score rests on, with the person's rating", async () => {
    const { text } = await read(mapped());
    const map = text("Map.md");
    expect(map).toMatch(/\*\*Oak outlasts ash\*\*: mixed \(on board Chair study\)/);
    expect(map).toContain("For: Oak datasheet (rated strong)");
    expect(map).toContain("Against: Forum post (not rated, no credit yet)");
    expect(map).toContain("Durability: backed by Oak datasheet (not rated)");
  });

  it("marks what's a guess, and lists it where Claude is told to ask first", async () => {
    const { text } = await read(mapped());
    const open = text("Map.md").split("## Unsupported")[1];
    expect(text("Map.md")).toContain("Cost: **unsupported**, a guess");
    expect(open).toContain("Claim: Buyers prefer oak");
    expect(open).toContain("Score: Oak on Cost");
    expect(open).toContain("Source with no credit, used as evidence: Forum post");
    expect(open).not.toContain("Oak outlasts ash");
    expect(text("CLAUDE.md")).toMatch(/Check `Map\.md` before you build/);
    expect(text("CLAUDE.md")).toContain("| `Map.md` |");
  });

  it("gives the same map as data, with links against kept apart from links for", async () => {
    const { text } = await read(mapped());
    const map = JSON.parse(text("map.json"));
    expect(map.nodes.find((n: { id: string }) => n.id === "claim:c2").unsupported).toBe(true);
    expect(map.nodes.find((n: { id: string }) => n.id === "claim:c1").unsupported).toBe(false);
    expect(map.edges).toContainEqual({ source: "asset:s1", target: "claim:c1", kind: "supports", strength: "strong" });
    expect(map.edges).toContainEqual({ source: "asset:s2", target: "claim:c1", kind: "contradicts", strength: null });
  });

  it("goes in the pasted text too", async () => {
    expect(await claudePrompt(mapped(), options)).toContain('<file path="Map.md">');
  });

  it("leaves out what the person left out", async () => {
    const { text } = await read(mapped(), { ...options, plan: { ...EMPTY_PLAN, includeSamples: true, excluded: ["c2", "d1"] } } as typeof options);
    expect(text("Map.md")).not.toContain("Buyers prefer oak");
    expect(text("Map.md")).not.toContain("Which wood?");
    expect(text("map.json")).not.toContain("Buyers prefer oak");
  });

  it("isn't made when there's nothing to connect", async () => {
    const { names, text } = await read(state({ claims: [] }));
    expect(names).not.toContain("Map.md");
    expect(text("CLAUDE.md")).not.toContain("| `Map.md` |");
  });
});

describe("withoutSamples", () => {
  it("drops the demo content, and what belongs to it", () => {
    const s = withoutSamples(
      state({
        boards: [{ id: "demo", name: "Demo", is_sample: true }, { id: "b1", name: "Mine", is_sample: false }],
        board_items: [item({ id: "d", board_id: "demo" }), item({ id: "m", board_id: "b1" })],
        assets: [asset({ id: "s", is_sample: true }), asset({ id: "o", is_sample: false })],
        decisions: [{ id: "dd", is_sample: true }],
        concepts: [{ id: "k", decision_id: "dd", asset_id: null }],
        scores: [{ concept_id: "k" }],
      }),
    );
    expect(s.boards.map((b) => b.id)).toEqual(["b1"]);
    expect(s.board_items.map((i) => i.id)).toEqual(["m"]);
    expect(s.assets.map((a) => a.id)).toEqual(["o"]);
    expect(s.decisions).toEqual([]);
    expect(s.scores).toEqual([]);
  });

  it("keeps a sample picture you've put on your own board", () => {
    const s = withoutSamples(state({ assets: [asset({ id: "s", is_sample: true })], board_items: [item({ kind: "image", asset_id: "s" })] }));
    expect(s.assets.map((a) => a.id)).toEqual(["s"]);
  });
});

describe("boards as text", () => {
  const board = { id: "b1", name: "Chair", share: {} } as Board;

  it("groups by section, and keeps credits and connections", () => {
    const items = [
      item({ id: "sec", kind: "section", x: 0, y: 0, w: 500, h: 500, data: { text: "Materials" } }),
      item({ id: "a", x: 10, y: 10, w: 50, h: 50, data: { text: "Oak" } }),
      item({ id: "img", kind: "image", x: 100, y: 100, w: 50, h: 50, asset_id: "a1" }),
      item({ id: "far", x: 900, y: 900, w: 50, h: 50, data: { text: "Loose" } }),
      item({ id: "l", kind: "connector", data: { from: "a", to: "far", connector: "supports" } }),
    ];
    const md = boardMarkdown(board, items, [asset({}) as never], () => "attachments/Photo.png", false, "");
    expect(md).toContain("## Materials");
    expect(md).toContain("- Note: Oak");
    expect(md).toContain("credit: Rin");
    expect(md).toContain("../attachments/Photo.png");
    expect(md).toContain("## Elsewhere on the board");
    expect(md).toContain("Oak → Loose (supports)");
  });

  it("warns about a picture with no source", () => {
    const md = boardMarkdown(board, [item({ kind: "image", asset_id: "a1" })], [asset({ credit: null }) as never], () => undefined, false, "");
    expect(md).toContain("no source yet");
  });
});

describe("drawings as a picture", () => {
  it("is nothing when a board has none", () => {
    expect(drawingsSvg([item({})])).toBeNull();
  });

  it("includes strokes and shapes, safely", () => {
    const svg = drawingsSvg([
      item({ kind: "stroke", w: 10, h: 10, data: { points: [0, 0, 10, 10], vw: 10, vh: 10 } }),
      item({ kind: "shape", data: { figure: "rect", text: '<script>"x"</script>' } }),
    ])!;
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("handwriting", () => {
  const stroke = (fields: Partial<BoardItem>) => item({ kind: "stroke", w: 100, h: 100, data: { points: [0, 0, 100, 100], vw: 100, vh: 100 }, ...fields });

  it("reads only strokes, in the order written", () => {
    const out = writtenStrokes([stroke({ id: "b", z: 2 }), item({ id: "n", z: 0 }), stroke({ id: "a", z: 1 }), stroke({ id: "e", z: 3, data: { points: [] } })]);
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("follows a stroke that's been moved and resized", () => {
    expect(strokePoints(stroke({ x: 10, y: 20, w: 200, h: 50 }))).toEqual([[10, 20], [210, 70]]);
  });

  it("follows a stroke that's been tilted", () => {
    const [a, b] = strokePoints(stroke({ rotation: 90 }));
    expect(a[0]).toBeCloseTo(100);
    expect(a[1]).toBeCloseTo(0);
    expect(b[0]).toBeCloseTo(0);
    expect(b[1]).toBeCloseTo(100);
  });

  it("finds where the writing sits", () => {
    expect(writingBox([[[10, 20], [30, 50]], [[5, 25]]])).toEqual({ x: 5, y: 20, w: 25, h: 30 });
  });

  it("brings writing to a readable size, without distorting it", () => {
    const out = normaliseForReading([[[0, 0], [400, 10]]]);
    const flat = out.flat();
    const height = Math.max(...flat.map((p) => p[1])) - Math.min(...flat.map((p) => p[1]));
    const width = Math.max(...flat.map((p) => p[0])) - Math.min(...flat.map((p) => p[0]));
    expect(width / height).toBeCloseTo(40, 0);
    expect(Math.min(...flat.map((p) => p[0]))).toBeGreaterThan(0);
  });
});
