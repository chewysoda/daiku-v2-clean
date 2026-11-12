import { describe, expect, it } from "vitest";
import { EMPTY_SPEC, specGaps, specMarkdown } from "./appSpec";
import { compareSpecs, criteria, EMPTY_REVIEW, keywords, lineDiff, parseReview, revisionMarkdown, saveVersion, suggestMark, tally } from "./review";
import { canPreview, isReusable, kindOf, previewDoc, setReusable, stackOf, withTag } from "./snippets";

const spec = { ...EMPTY_SPEC, name: "Daiku", must: "Budget packer\nDiff packs", done: "Pack fits the budget\nBudget packer" };

describe("the review", () => {
  it("checks each must-have and each line of done, once", () => {
    expect(criteria(spec).map((c) => c.text)).toEqual(["Budget packer", "Diff packs", "Pack fits the budget"]);
  });

  it("leaves criteria unchecked until marked", () => {
    const review = { ...EMPTY_REVIEW, marks: { "Budget packer": "met" as const, "Diff packs": "unmet" as const } };
    expect(tally(review, criteria(spec))).toEqual({ met: 1, partly: 0, unmet: 1, open: 1 });
  });

  it("drops marks it doesn't know", () => {
    expect(parseReview(JSON.stringify({ marks: { a: "met", b: "great" } })).marks).toEqual({ a: "met" });
    expect(parseReview("not json")).toEqual(EMPTY_REVIEW);
  });

  it("compares versions field by field, and line by line", () => {
    const after = { ...spec, must: "Budget packer\nMCP server" };
    expect(compareSpecs(spec, after).map((c) => c.field)).toEqual(["must"]);
    expect(lineDiff(spec.must, after.must)).toEqual({ removed: ["Diff packs"], added: ["MCP server"] });
  });

  it("writes a revision with what's open first, what's met to keep, and how the brief moved", () => {
    const review = saveVersion({ ...EMPTY_REVIEW, marks: { "Budget packer": "met", "Diff packs": "unmet" }, notes: { "Diff packs": "Sends everything" } }, spec, "Cut diff packs for now", "v1", "2026-11-01T00:00:00Z");
    const md = revisionMarkdown({ ...spec, must: "Budget packer\nDiff packs\nReview screen" }, review);
    expect(md.indexOf("## Not met yet")).toBeLessThan(md.indexOf("## Already met"));
    expect(md).toContain("  - Sends everything");
    expect(md).toContain("Why: Cut diff packs for now");
    expect(md).toContain("added: Review screen");
  });
});

describe("checks and rules in the review", () => {
  const checked = { ...spec, must: "Budget packer => a pack over budget names what was cut\nDiff packs" };

  it("keeps a mark when a check is added to its must-have", () => {
    expect(criteria(checked).map((c) => c.text)).toEqual(criteria(spec).map((c) => c.text));
    expect(criteria(checked)[0]).toEqual({ text: "Budget packer", from: "must", check: "a pack over budget names what was cut" });
    expect(criteria(checked)[1]).toEqual({ text: "Diff packs", from: "must" });
  });

  it("carries each check and the standing rules into the revision", () => {
    const md = revisionMarkdown(checked, { ...EMPTY_REVIEW, marks: { "Budget packer": "unmet" }, notes: { "Budget packer": "Cuts silently" } }, "Never add a dependency without asking");
    expect(md).toContain("- Budget packer\n  - Check: a pack over budget names what was cut\n  - Cuts silently");
    expect(md).toContain("## Rules that still apply");
    expect(md).toContain("- Never add a dependency without asking");
    expect(md.indexOf("## Rules that still apply")).toBeLessThan(md.indexOf("## Not met yet"));
    expect(md).toContain("Where an item has a check, run it and show the result.");
    expect(revisionMarkdown(checked, EMPTY_REVIEW)).not.toContain("Rules that still apply");
  });
});

describe("the vision brief", () => {
  it("asks about the problem when it's empty", () => {
    expect(specGaps(EMPTY_SPEC)).toContain("The problem it solves");
  });

  it("writes references and open questions only when there are some", () => {
    expect(specMarkdown(EMPTY_SPEC, [])).not.toContain("Open questions");
    const md = specMarkdown({ ...EMPTY_SPEC, references: "Linear: dense, calm layout", questions: "Mac build?" }, []);
    expect(md).toContain("- **Linear**: dense, calm layout");
    expect(md).toContain("## Open questions (ask, don't decide)\n\n- Mac build?");
  });
});

describe("snippets", () => {
  it("reads and sets kind and stack tags", () => {
    const tags = withTag(withTag("code lang:css", "kind", "button"), "stack", "html-css");
    expect(kindOf({ tags })).toBe("button");
    expect(stackOf({ tags })).toBe("html-css");
    expect(kindOf({ tags: withTag(tags, "kind", null) })).toBe(null);
    expect(kindOf({ tags: "kind:spaceship" })).toBe(null);
  });

  it("marks snippets for reuse", () => {
    expect(isReusable({ kind: "code", tags: setReusable("code", true) })).toBe(true);
    expect(isReusable({ kind: "code", tags: setReusable("code reuse", false) })).toBe(false);
  });

  it("runs only plain web code", () => {
    expect(canPreview({ kind: "code", tags: "code lang:css", title: "a.css" })).toBe(true);
    expect(canPreview({ kind: "code", tags: "code lang:tsx", title: "a.tsx" })).toBe(false);
  });

  it("blocks the network and can't be closed early", () => {
    const doc = previewDoc({ tags: "lang:css", title: "a.css", notes: "button{color:red}</style><script>alert(1)</script>" });
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("</style><script>");
  });
});

describe("suggested marks", () => {
  const answer = `Here's the plan.
- The budget packer trims each pack to fit the token budget.
- Diff packs are out of scope for v1, we'll add them later.
Export writes a zip with the board and its files.`;

  it("reads a sentence that covers the criterion as met, and quotes it", () => {
    const s = suggestMark("Budget packer", answer);
    expect(s?.mark).toBe("met");
    expect(s?.quote).toContain("budget packer trims");
  });

  it("reads a covered criterion that was put off as partly", () => {
    expect(suggestMark("Diff packs", answer)?.mark).toBe("partly");
  });

  it("reads words spread across the answer as partly", () => {
    expect(suggestMark("Export the board as a PDF file", answer)?.mark).toBe("partly");
  });

  it("reads a criterion the answer never touches as not mentioned", () => {
    const s = suggestMark("Works offline with SQLite", answer);
    expect(s?.mark).toBe("unmet");
    expect(s?.quote).toBeUndefined();
  });

  it("matches word forms and keeps numbers", () => {
    expect(keywords("Packing 3 packs at 80 mA")).toEqual(["pack", "3", "80"]);
  });

  it("says nothing without an answer or without words to look for", () => {
    expect(suggestMark("Budget packer", "  ")).toBeNull();
    expect(suggestMark("it is the", answer)).toBeNull();
  });
});
