// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Asset } from "../data/types";
import { MemoryRepo } from "../data/repo";
import { SEED } from "../data/seed";
import { BoardDoc } from "../features/canvas/boardDoc";
import { CONNECTOR_LOOKS, connectorPath, connectorShape, fitView, itemsInSection, visibleItems, zoomAt } from "../features/canvas/geometry";
import { buildGraph, neighbourhood } from "../features/threads/graph";
import { esc, renderSharePage } from "../features/share/exportPage";
import { deltaE, hexToLab, kmeansPalette } from "./color";
import { parseArxiv, parseCrossref, parseOpenAlex, parseSemanticScholar, requestUrl } from "./scholar";
import { colourDistance, creditLine, filterAssets, ftsQuery, tokens } from "./search";
import { asWebUrl, draftCredit, isAggregator, parseCapture, resolveBrowserInput, searchUrl } from "./web";

const asset = (over: Partial<Asset>): Asset => ({
  id: "x",
  kind: "image",
  title: "t",
  file_path: null,
  preview: null,
  source_url: null,
  credit: null,
  via: null,
  captured_at: "2026-01-01T00:00:00Z",
  provenance: "unknown",
  palette_lab: [],
  width: null,
  height: null,
  tags: "",
  notes: "",
  is_sample: false,
  ...over,
});

describe("browser input", () => {
  it("treats addresses as addresses and everything else as a search", () => {
    expect(asWebUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(asWebUrl("example.com")).toBe("https://example.com/");
    expect(asWebUrl("arxiv.org/abs/1234.5678")).toBe("https://arxiv.org/abs/1234.5678");
    expect(asWebUrl("warm oak, soft curves")).toBeNull();
    expect(asWebUrl("oak")).toBeNull();
  });

  it("never treats a dangerous scheme as an address", () => {
    for (const u of ["javascript:alert(1)", "file:///C:/Windows/win.ini", "ms-settings:display", "data:text/html,x"]) {
      expect(asWebUrl(u)).toBeNull();
      expect(resolveBrowserInput(u, "duckduckgo")).toMatch(/^https:\/\/duckduckgo\.com\/\?q=/);
    }
  });

  it("encodes queries and supports image search", () => {
    expect(searchUrl("duckduckgo", "oak & ply")).toBe("https://duckduckgo.com/?q=oak%20%26%20ply");
    expect(searchUrl("bing", "oak", true)).toBe("https://www.bing.com/images/search?q=oak");
  });
});

describe("capture payloads are untrusted", () => {
  const good = (images: unknown) =>
    JSON.stringify({ kind: "image", page: { pageUrl: "https://maker.example/chair", pageTitle: "Chair", author: "Ana", site: "Maker" }, images });

  it("accepts a normal payload", () => {
    const c = parseCapture(good([{ src: "https://maker.example/a.jpg", alt: "A", width: 800, height: 600 }]));
    expect(c?.images[0].src).toBe("https://maker.example/a.jpg");
  });

  it("rejects garbage, drops non-web images, and caps long strings", () => {
    expect(parseCapture("not json")).toBeNull();
    expect(parseCapture("null")).toBeNull();
    expect(parseCapture(JSON.stringify({ page: { pageUrl: "file:///etc/passwd" }, images: [] }))).toBeNull();
    const c = parseCapture(good([{ src: "file:///C:/secret.png" }, { src: "javascript:alert(1)" }, { src: 42 }, { src: "http://ok.example/a.png", alt: "x".repeat(9000) }]));
    expect(c?.images).toHaveLength(1);
    expect(c?.images[0].alt.length).toBe(300);
  });
});

describe("credit", () => {
  const page = { pageUrl: "https://www.studio.example/work/chair", pageTitle: "Chair", author: "", site: "" };

  it("prefers the named author, then the site", () => {
    expect(draftCredit({ ...page, author: "Ana Ruiz" }).credit).toBe("Ana Ruiz");
    expect(draftCredit({ ...page, site: "Studio" }).credit).toBe("Studio");
    expect(draftCredit(page).credit).toBe("studio.example");
  });

  it("never credits a search or pin page as the source", () => {
    for (const u of ["https://duckduckgo.com/?q=x", "https://www.google.com/search?q=x", "https://www.bing.com/images/search?q=x", "https://www.pinterest.com/pin/1"]) {
      expect(isAggregator(u)).toBe(true);
      expect(draftCredit({ ...page, pageUrl: u }).credit).toBe("");
    }
  });

  it("writes a copyable credit line, and admits when there's no source", () => {
    expect(creditLine(asset({ title: "Oak", credit: "Mill", source_url: "https://m.example" }))).toBe("Oak · © Mill · https://m.example");
    expect(creditLine(asset({ title: "Oak" }))).toBe("Oak · no source yet");
  });
});

describe("search", () => {
  it("builds FTS queries that can't inject syntax", () => {
    expect(tokens("warm oak, soft curves")).toEqual(["warm", "oak", "soft", "curves"]);
    expect(ftsQuery("warm oak")).toBe('"warm"* OR "oak"*');
    expect(ftsQuery('title:x" NEAR(')).toBe('"title"* OR "x"* OR "near"*');
    expect(ftsQuery("  ,, ")).toBe("");
  });

  it("filters on provenance and credit, and treats blank credit as uncredited", () => {
    const list = [asset({ id: "a", provenance: "human", credit: "M" }), asset({ id: "b", provenance: "ai", credit: "M" }), asset({ id: "c", credit: "   " })];
    const base = { ids: null, kind: "all" as const, colour: null, humanOnly: false, creditedOnly: false };
    expect(filterAssets(list, { ...base, humanOnly: true }).map((a) => a.id)).toEqual(["a"]);
    expect(filterAssets(list, { ...base, creditedOnly: true }).map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps text-search ranking order", () => {
    const list = [asset({ id: "a" }), asset({ id: "b" }), asset({ id: "c" })];
    const r = filterAssets(list, { ids: ["c", "a"], kind: "all", colour: null, humanOnly: false, creditedOnly: false });
    expect(r.map((a) => a.id)).toEqual(["c", "a"]);
  });

  it("finds images by colour, closest first", () => {
    const palette = (hex: string) => [{ ...hexToLab(hex)!, weight: 1, hex }];
    const list = [asset({ id: "green", palette_lab: palette("#2E8B57") }), asset({ id: "oak", palette_lab: palette("#C9A67D") }), asset({ id: "honey", palette_lab: palette("#B48F67") }), asset({ id: "none" })];
    const r = filterAssets(list, { ids: null, kind: "all", colour: "#C9A67D", humanOnly: false, creditedOnly: false });
    expect(r.map((a) => a.id)).toEqual(["oak", "honey"]);
    expect(colourDistance(asset({}), "#C9A67D")).toBe(Infinity);
  });

  it("finds the seeded oak images from the Home swatch", () => {
    const r = filterAssets(SEED.assets, { ids: null, kind: "all", colour: "#C9A67D", humanOnly: false, creditedOnly: false });
    expect(r[0].id).toBe("a-oak");
  });
});

describe("palette", () => {
  it("separates distinct colours and orders by coverage", () => {
    const a = hexToLab("#C9A67D")!;
    const b = hexToLab("#2E332D")!;
    const pixels = [...Array(75).fill(a), ...Array(25).fill(b)].map((p) => ({ ...p }));
    const palette = kmeansPalette(pixels, 2);
    expect(palette).toHaveLength(2);
    expect(palette[0].weight).toBeCloseTo(0.75);
    expect(deltaE(palette[0], a)).toBeLessThan(1);
    expect(palette[0].hex).toBe("#C9A67D");
  });

  it("is deterministic and handles empty or single-colour images", () => {
    const pixels = ["#112233", "#AABBCC", "#445566", "#DDCCBB", "#778899"].map((h) => hexToLab(h)!);
    expect(kmeansPalette(pixels.map((p) => ({ ...p })), 3)).toEqual(kmeansPalette(pixels.map((p) => ({ ...p })), 3));
    expect(kmeansPalette([])).toEqual([]);
    expect(kmeansPalette(Array(10).fill(0).map(() => hexToLab("#123456")!), 5)).toHaveLength(1);
  });
});

describe("scholarly parsers", () => {
  it("reads OpenAlex", () => {
    const [p] = parseOpenAlex({ results: [{ id: "W1", display_name: "T", publication_year: 2021, cited_by_count: 4, authorships: [{ author: { display_name: "A B" } }], open_access: { is_oa: true }, primary_location: { landing_page_url: "https://x.example", source: { display_name: "J" } } }] });
    expect(p).toMatchObject({ title: "T", year: 2021, citedBy: 4, venue: "J", openAccess: true, url: "https://x.example", authors: ["A B"] });
  });
  it("reads Crossref and Semantic Scholar", () => {
    expect(parseCrossref({ message: { items: [{ DOI: "10.1/x", title: ["T"], author: [{ given: "A", family: "B" }], issued: { "date-parts": [[2019]] }, URL: "https://doi.org/10.1/x" }] } })[0]).toMatchObject({ title: "T", year: 2019, authors: ["A B"] });
    expect(parseSemanticScholar({ data: [{ paperId: "1", title: "T", authors: [{ name: "A" }], year: 2020, url: "https://s.example", isOpenAccess: true }] })[0]).toMatchObject({ title: "T", openAccess: true });
  });
  it("reads arXiv's Atom feed", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1</id><published>2022-05-01T00:00:00Z</published><title> Soft
      chairs </title><author><name>A B</name></author></entry></feed>`;
    expect(parseArxiv(xml)[0]).toMatchObject({ title: "Soft chairs", year: 2022, authors: ["A B"], openAccess: true });
  });
  it("tolerates empty responses", () => {
    expect(parseOpenAlex({})).toEqual([]);
    expect(parseCrossref(null)).toEqual([]);
    expect(parseSemanticScholar(undefined)).toEqual([]);
  });
  it("encodes queries and applies filters", () => {
    const u = requestUrl("OpenAlex", "a&b", { since: 2015, openAccessOnly: true });
    expect(u).toContain("search=a%26b");
    expect(u).toContain("from_publication_date:2015-01-01,open_access.is_oa:true");
  });
});

describe("board document", () => {
  const item = (id: string, over = {}) => ({ id, board_id: "b", kind: "sticky" as const, x: 0, y: 0, w: 10, h: 10, rotation: 0, z: 0, asset_id: null, data: {}, updated_at: "", ...over });

  it("reports changes, then undoes and redoes them", () => {
    const doc = new BoardDoc([item("a")]);
    const seen: string[] = [];
    doc.observe((changed, removed) => seen.push(`+${changed.map((c) => c.id)} -${removed}`));
    doc.patch([{ id: "a", changes: { x: 50 } }]);
    expect(doc.get("a")!.x).toBe(50);
    expect(seen).toEqual(["+a -"]);
    doc.undo();
    expect(doc.get("a")!.x).toBe(0);
    doc.redo();
    expect(doc.get("a")!.x).toBe(50);
    doc.destroy();
  });

  it("doesn't let undo remove what was loaded from disk", () => {
    const doc = new BoardDoc([item("a")]);
    doc.undo();
    expect(doc.get("a")).toBeDefined();
    doc.destroy();
  });

  it("removes a connector along with either end, and undo restores both", () => {
    const doc = new BoardDoc([item("a"), item("b"), item("c", { kind: "connector", data: { from: "a", to: "b" } })]);
    doc.remove(["a"]);
    expect(doc.get("c")).toBeUndefined();
    doc.undo();
    expect(doc.get("a")).toBeDefined();
    expect(doc.get("c")).toBeDefined();
    doc.destroy();
  });
});

describe("canvas geometry", () => {
  it("zooms around the cursor, keeping that point still", () => {
    const v = zoomAt({ x: 100, y: 50, zoom: 1 }, 300, 200, 2);
    expect((300 - v.x) / v.zoom).toBeCloseTo(200);
    expect((200 - v.y) / v.zoom).toBeCloseTo(150);
  });
  it("clamps zoom", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 1000).zoom).toBe(4);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.0001).zoom).toBe(0.1);
  });
  it("only mounts what's on screen, keeping the selection", () => {
    const base = SEED.board_items[0];
    const near = { ...base, id: "near", kind: "image" as const, x: 10, y: 10, w: 10, h: 10 };
    const far = { ...base, id: "far", kind: "image" as const, x: 99999, y: 99999, w: 10, h: 10 };
    const kept = { ...far, id: "kept" };
    const ids = visibleItems([near, far, kept], { x: 0, y: 0, zoom: 1 }, 800, 600, ["kept"]).map((i) => i.id);
    expect(ids).toEqual(["near", "kept"]);
  });
  it("fits content without magnifying it, and survives an empty board", () => {
    const base = SEED.board_items[0];
    expect(fitView([{ ...base, kind: "image", x: 0, y: 0, w: 10, h: 10 }], 1000, 800).zoom).toBe(1);
    expect(fitView([], 1000, 800).zoom).toBe(1);
  });
  it("finds a section's contents by centre point", () => {
    const form = SEED.board_items.find((i) => i.id === "i-form")!;
    const inside = itemsInSection(form, SEED.board_items.filter((i) => i.board_id === form.board_id)).map((i) => i.id);
    expect(inside.sort()).toEqual(["i-detail", "i-lounge", "i-sketch"]);
  });
  it("draws connectors from edge to edge", () => {
    const d = connectorPath({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 });
    expect(d.startsWith("M 10 5")).toBe(true);
    expect(d.endsWith("100 5")).toBe(true);
  });
  it("gives every connector look an arrowhead at the far card, and the same two ends", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 300, y: 0, w: 10, h: 10 };
    const seen = new Set<string>();
    for (const look of CONNECTOR_LOOKS) {
      const { d, head } = connectorShape(a, b, look);
      expect(d.startsWith("M 10 5"), look).toBe(true);
      expect(d.endsWith("300 5"), look).toBe(true);
      expect(d, look).not.toMatch(/NaN|Infinity/);
      // The tip is the middle point of the chevron. The curve arrives at a slant; the rest arrive straight.
      expect(head, look).toContain(" L 300 5 L ");
      if (look !== "curve") expect(head, look).toBe("M 285 11.5 L 300 5 L 285 -1.5 L 289.5 5 Z");
      seen.add(d);
    }
    expect(seen.size).toBe(CONNECTOR_LOOKS.length);
  });
  it("points the arrowhead along a slanted connector, and draws short ones plainly", () => {
    const { head } = connectorShape({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 300, w: 10, h: 10 }, "zigzag");
    expect(head).toBe("M -1.5 285 L 5 300 L 11.5 285 L 5 289.5 Z");
    const near = { x: 30, y: 0, w: 10, h: 10 };
    expect(connectorShape({ x: 0, y: 0, w: 10, h: 10 }, near, "loopy").d).toBe(connectorPath({ x: 0, y: 0, w: 10, h: 10 }, near));
    expect(connectorShape({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }).head).toBe("");
  });
});

describe("threads graph", () => {
  const graph = buildGraph({ boards: SEED.boards, items: SEED.board_items, assets: SEED.assets, claims: SEED.claims, links: SEED.evidence_links, decisions: SEED.decisions, concepts: SEED.concepts, criteria: SEED.criteria, scores: SEED.scores });

  it("only has edges between real nodes", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });
  it("flags gaps: the unsourced tube base, and claims with no evidence, but not a backed claim", () => {
    const gap = (id: string) => graph.nodes.find((n) => n.id === id)?.gap;
    expect(gap("asset:a-tube")).toBe(true);
    expect(gap("claim:c-cost")).toBe(true);
    expect(gap("claim:c-softness")).toBe(false);
    expect(gap("concept:k-a")).toBe(true);
  });
  it("limits by depth", () => {
    const near = neighbourhood("claim:c-softness", graph.edges, 1);
    expect(near.has("asset:a-room")).toBe(true);
    expect(near.has("decision:d-chair")).toBe(false);
  });
});

describe("exported share page", () => {
  const evil = '<img src=x onerror=alert(1)>';
  const board = { ...SEED.boards[0], name: evil, share: { headline: evil, summary: evil, tagline: evil, recipient: evil } };
  const html = renderSharePage({
    board,
    images: [{ asset: asset({ id: "a", title: evil, credit: evil, source_url: "javascript:alert(1)" }), src: "data:image/png;base64,AAAA" }],
    comments: [{ id: "c", board_id: board.id, parent_id: null, author: evil, is_guest: true, text: evil, asset_id: "a", pin_x: 10, pin_y: 20, created_at: "", is_sample: false }],
    from: evil,
  });

  it("escapes everything the user or a web page supplied", () => {
    expect(esc('<a href="x">')).toBe("&lt;a href=&quot;x&quot;&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
  });
  it("has no scripts or remote requests, and locks that in with a CSP", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("default-src 'none'; img-src data:");
    expect(html.replace(/https?:\/\/[^"]*"\s*rel/g, "")).not.toMatch(/src="https?:/);
  });
});

describe("sample data", () => {
  it("is all marked as sample, so Settings can remove it", () => {
    expect(SEED.assets.every((a) => a.is_sample)).toBe(true);
    expect(SEED.boards.every((b) => b.is_sample)).toBe(true);
    expect(SEED.decisions.every((d) => d.is_sample)).toBe(true);
  });
  it("marks a score as sourced only when it has evidence", () => {
    for (const s of SEED.scores) {
      const linked = SEED.evidence_links.some((l) => l.target_type === "score" && l.target_id === s.id);
      expect(linked).toBe(!s.is_assumption);
    }
  });
  it("loads into the preview repo", async () => {
    const repo = new MemoryRepo();
    for (const a of SEED.assets) await repo.put("assets", a);
    expect((await repo.all("assets")).length).toBe(SEED.assets.length);
    expect((await repo.searchAssets("walnut"))[0]).toBe("a-walnut");
  });
});
