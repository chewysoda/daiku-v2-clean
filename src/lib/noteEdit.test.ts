import { describe, expect, it } from "vitest";
import { strokePoints, writtenStrokes } from "../features/canvas/handwriting";
import { blockEdit, formulaBlock, formulaEdit, insideFormula, padStrokesToItems, snippetEdit, stripDelimiters } from "./noteEdit";

describe("note formulas", () => {
  it("wraps a selection, or leaves a placeholder selected", () => {
    expect(formulaEdit("E = mc^2", false)).toEqual({ text: "$E = mc^2$", from: 1, to: 9 });
    const empty = formulaEdit("", false);
    expect(empty.text.slice(empty.from, empty.to)).toBe("x");
    const block = formulaEdit("", true);
    expect(block.text).toBe("$$\nx\n$$");
    expect(block.text.slice(block.from, block.to)).toBe("x");
  });
  it("knows when the cursor is in a formula", () => {
    expect(insideFormula("see $x^2$ here", 6)).toBe(true);
    expect(insideFormula("see $x^2$ here", 2)).toBe(false);
    expect(insideFormula("see $x^2$ here", 12)).toBe(false);
    expect(insideFormula("$$\nx\n$$", 3)).toBe(true);
  });
  it("doesn't take prices for a formula", () => {
    expect(insideFormula("costs $5 and $6 today", 9)).toBe(false);
  });
  it("adds dollar signs to a snippet only when they're needed", () => {
    expect(snippetEdit("plain", 2, "\\pi").text).toBe("$\\pi$");
    expect(snippetEdit("$x + y$", 3, "\\pi").text).toBe("\\pi");
  });
  it("strips delimiters so a block never doubles them", () => {
    expect(stripDelimiters("$$x^2$$")).toBe("x^2");
    expect(stripDelimiters("\\[ x \\]")).toBe("x");
    expect(stripDelimiters("$x$")).toBe("x");
    expect(formulaBlock(" $$a$$ ")).toBe("$$\na\n$$");
  });
});

describe("placing read text in a note", () => {
  it("gives it a line of its own", () => {
    expect(blockEdit("ab", 2, 2, "T").text).toBe("\n\nT");
    expect(blockEdit("", 0, 0, "T").text).toBe("T");
    expect(blockEdit("a\n\nb", 3, 3, "T").text).toBe("T\n\n");
    expect(blockEdit("a\nb", 2, 2, "T").text).toBe("\nT\n\n");
    expect(blockEdit("a\nb", 1, 1, "T").text).toBe("\n\nT\n");
  });
  it("leaves the cursor after the block", () => {
    const e = blockEdit("ab", 2, 2, "T");
    expect(e.from).toBe(3);
    expect(e.to).toBe(3);
  });
});

describe("the writing pad", () => {
  it("hands the recognisers exactly the points that were drawn", () => {
    const drawn: [number, number][][] = [[[10, 20], [30, 40]], [[50, 60]]];
    const items = padStrokesToItems(drawn, 640, 220) as never[];
    expect(writtenStrokes(items).map(strokePoints)).toEqual(drawn);
  });
});
