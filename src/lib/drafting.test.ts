import { describe, expect, it } from "vitest";
import { Asset } from "../data/types";
import { citeLine, figureEmbed, quoteBlock, splitFigures, wordsIn } from "./drafting";

const asset = (fields: Partial<Asset> = {}) => ({ id: "a", kind: "image", title: "Oak test", credit: "Rin", ...fields }) as Asset;

describe("citations in a draft", () => {
  it("carries the credit and page", () => {
    expect(citeLine(asset(), 4)).toBe("Rin, Oak test, p. 4");
  });
  it("keeps a missing source visible instead of dropping it", () => {
    expect(citeLine(asset({ credit: null }))).toBe("[no source yet], Oak test");
    expect(citeLine(undefined, 2)).toBe("[no source yet], p. 2");
  });
  it("quotes every line, so a long quote stays one block", () => {
    expect(quoteBlock("one\ntwo", asset())).toBe("> one\n> two\n>\n> — Rin, Oak test");
  });
  it("credits a picture alongside the picture", () => {
    expect(figureEmbed(asset())).toBe("![[Oak test]]\n\n*Figure: Rin, Oak test*");
  });
  it("can't be broken by a title with brackets", () => {
    const parts = splitFigures(figureEmbed(asset({ title: "Fig [2] | x" })));
    expect(parts[0].kind).toBe("figure");
  });
});

describe("reading a draft", () => {
  it("splits text from figures, in order", () => {
    expect(splitFigures("a ![[B]] c")).toEqual([{ kind: "text", text: "a " }, { kind: "figure", title: "B" }, { kind: "text", text: " c" }]);
    expect(splitFigures("plain")).toEqual([{ kind: "text", text: "plain" }]);
    expect(splitFigures("")).toEqual([]);
  });
  it("leaves ordinary links alone", () => {
    expect(splitFigures("see [[B]]")).toEqual([{ kind: "text", text: "see [[B]]" }]);
  });
  it("counts words", () => {
    expect(wordsIn("  two words\n")).toBe(2);
    expect(wordsIn("   ")).toBe(0);
  });
});
