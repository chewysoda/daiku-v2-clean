import { describe, expect, it } from "vitest";
import { Asset } from "../data/types";
import { cleanFormats, DATASET_FORMATS, exportReadme, formatEndings, isCompressed, renderFormat, sourcesCsv } from "./dataFormats";

const asset = (fields: Partial<Asset>) => ({ id: "a", kind: "image", title: "Photo", credit: "Rin", source_url: null, provenance: "unknown", file_path: null, preview: null, via: null, captured_at: "2026-01-01", palette_lab: [], width: null, height: null, tags: "", notes: "", is_sample: false, ...fields }) as Asset;

const weightage = {
  decisions: [
    {
      title: "Which base?",
      criteria: [{ id: "q1", name: "Cost", weight: 0.5 }, { id: "q2", name: "Look", weight: 0.5 }],
      concepts: [{ id: "c1", label: "A", name: "Oak", total: 3.5, rank: 1 }],
      scores: [{ concept: "c1", criterion: "q1", value: 4, basis: "guess", evidence: [] }],
    },
  ],
};

describe("what each kind of data offers", () => {
  it("always has JSON on offer as the complete copy, and something besides it", () => {
    for (const [id, f] of Object.entries(DATASET_FORMATS)) {
      expect(f.offered, id).toContain("json");
      expect(f.offered.length, id).toBeGreaterThan(1);
      for (const s of f.standard) expect(f.offered, id).toContain(s);
    }
  });

  it("can render everything it offers", () => {
    const samples: Record<string, unknown> = {
      graphs: { nodes: [], edges: [] },
      weightage,
      moodboards: { boards: [] },
      research: { claims: [], notes: [], drafts: [], highlights: [], interviews: [] },
      snips: { snips: [] },
      contacts: { participants: [], credited: [] },
    };
    for (const [id, f] of Object.entries(DATASET_FORMATS)) {
      for (const format of f.offered.filter((x) => x !== "json")) {
        const out = renderFormat(id, format, samples[id], []);
        expect(Object.keys(out).sort(), `${id} ${format}`).toEqual([...formatEndings(id, format)].sort());
      }
    }
  });

  it("uses the standard set until a choice is saved, and drops anything not on offer", () => {
    expect(cleanFormats("weightage", undefined)).toEqual(DATASET_FORMATS.weightage.standard);
    expect(cleanFormats("weightage", ["md", "graphml", 3])).toEqual(["md"]);
    expect(cleanFormats("weightage", [])).toEqual([]);
  });
});

describe("weightage as a spreadsheet", () => {
  const csv = renderFormat("weightage", "csv", weightage, [])[".csv"];

  it("has a row per score, marking guesses", () => {
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("guess");
    expect(lines[1]).toContain("4");
  });

  it("leaves a missing score empty rather than reading as zero", () => {
    const line = csv.trim().split(/\r?\n/)[2];
    expect(line).toContain("not scored");
    expect(line).not.toMatch(/,0,/);
  });

  it("quotes values holding commas", () => {
    const out = renderFormat("weightage", "csv", { decisions: [{ ...weightage.decisions[0], title: "Oak, or ash?" }] }, [])[".csv"];
    expect(out).toContain('"Oak, or ash?"');
  });
});

describe("weightage to read", () => {
  it("makes a table, marks guesses, and can't be broken by a pipe", () => {
    const md = renderFormat("weightage", "md", { decisions: [{ ...weightage.decisions[0], criteria: [{ id: "q1", name: "Cost | price", weight: 0.5 }] }] }, [])[".md"];
    expect(md).toContain("4 (guess)");
    expect(md).toContain("Cost \\| price");
    expect(md).toContain("**3.50**");
  });
});

describe("graph formats", () => {
  const g = {
    nodes: [{ id: "n1", label: 'Oak & "ash" <1>', type: "note", gap: true }, { id: "n2", label: "B", type: "board", gap: false }],
    edges: [{ id: "e1", source: "n1", target: "n2", kind: "supports" }, { id: "e2", source: "n1", target: "gone", kind: "x" }],
  };

  it("escapes labels, so the XML stays valid", () => {
    const xml = renderFormat("graphs", "graphml", g, [])[".graphml"];
    expect(xml).toContain("Oak &amp; &quot;ash&quot; &lt;1&gt;");
    expect(xml).not.toContain("<1>");
  });

  it("leaves out an edge to a node that isn't there, which graph tools reject", () => {
    const xml = renderFormat("graphs", "graphml", g, [])[".graphml"];
    expect(xml).toContain('source="n1" target="n2"');
    expect(xml).not.toContain("gone");
  });

  it("splits into node and edge sheets", () => {
    const out = renderFormat("graphs", "csv", g, []);
    expect(out["-nodes.csv"]).toContain("unsupported");
    expect(out["-edges.csv"]).toContain("supports");
  });
});

describe("research", () => {
  it("says when a claim has no evidence", () => {
    const md = renderFormat("research", "md", { claims: [{ text: "Oak lasts", status: "assumption", evidence: [] }], notes: [], drafts: [], highlights: [], interviews: [] }, [])[".md"];
    expect(md).toContain("still an assumption");
  });

  it("only lists real references", () => {
    const bib = renderFormat("research", "bib", {}, [asset({ kind: "pdf", title: "A paper" }), asset({ kind: "image", title: "No source" })])[".bib"];
    expect(bib).toContain("A paper");
    expect(bib).not.toContain("No source");
  });
});

describe("files stay files", () => {
  it("lists everything, including links and quotes with no file", () => {
    const placed = new Map([["a", { path: "images/p.jpg", bytes: 10, sha256: "abc" }]]);
    const csv = sourcesCsv([asset({}), asset({ id: "l", kind: "link", title: "A site", source_url: "https://x.example", credit: null })], placed);
    expect(csv).toContain("images/p.jpg");
    expect(csv).toContain("abc");
    expect(csv).toContain("https://x.example");
    expect(csv).toContain("no source yet");
  });

  it("doesn't compress what's already compressed", () => {
    expect(isCompressed("a/b.JPG")).toBe(true);
    expect(isCompressed("video.mp4")).toBe(true);
    expect(isCompressed("drawing.svg")).toBe(false);
    expect(isCompressed("data.json")).toBe(false);
  });

  it("explains itself", () => {
    const text = exportReadme([{ label: "Graphs", why: "a network", files: ["data/graphs.csv"] }], 2, "images");
    expect(text).toContain("data/graphs.csv");
    expect(text).toContain("2 original files");
    expect(text).toContain("no source yet");
  });
});
