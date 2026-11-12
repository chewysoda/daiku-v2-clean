import { describe, expect, it } from "vitest";
import { boardSize, isSvgMarkup, isVectorPath, svgInfo } from "./svg";

describe("isSvgMarkup", () => {
  it("recognises SVG, however it starts", () => {
    expect(isSvgMarkup("<svg></svg>")).toBe(true);
    expect(isSvgMarkup('  \n<svg xmlns="x"><path/></svg>')).toBe(true);
    expect(isSvgMarkup('<?xml version="1.0"?>\n<svg></svg>')).toBe(true);
    expect(isSvgMarkup('<?xml version="1.0"?><!-- Made in a tool --><!DOCTYPE svg PUBLIC "x" "y"><svg></svg>')).toBe(true);
  });

  it("doesn't mistake other text for it", () => {
    for (const t of ["hello", "a note about <svg> files", "<svgfoo></svgfoo>", "<html><svg></svg></html>", ""]) {
      expect(isSvgMarkup(t), t).toBe(false);
    }
  });
});

describe("isVectorPath", () => {
  it("knows an SVG by its file, not its name elsewhere in the path", () => {
    expect(isVectorPath("C:/a/b.svg")).toBe(true);
    expect(isVectorPath("C:/a/B.SVG")).toBe(true);
    expect(isVectorPath("/assets/x.svg?v=2")).toBe(true);
    expect(isVectorPath("blob:http://x/1#svg")).toBe(true);
    expect(isVectorPath("C:/svg/b.png")).toBe(false);
    expect(isVectorPath(null)).toBe(false);
  });
});

describe("svgInfo", () => {
  it("reads a size in pixels and in other units", () => {
    expect(svgInfo('<svg width="200" height="100">')).toMatchObject({ width: 200, height: 100 });
    expect(svgInfo('<svg width="200px" height="100px">')).toMatchObject({ width: 200, height: 100 });
    expect(svgInfo('<svg width="1in" height="2in">')).toMatchObject({ width: 96, height: 192 });
  });

  it("falls back to the viewBox", () => {
    expect(svgInfo('<svg viewBox="0 0 24 48">')).toMatchObject({ width: 24, height: 48 });
    expect(svgInfo("<svg viewBox='0,0,24,48'>")).toMatchObject({ width: 24, height: 48 });
    expect(svgInfo('<svg width="100%" height="100%" viewBox="0 0 80 40">')).toMatchObject({ width: 80, height: 40 });
  });

  it("works out a missing side from the viewBox's shape", () => {
    expect(svgInfo('<svg width="100" viewBox="0 0 50 25">')).toMatchObject({ width: 100, height: 50 });
    expect(svgInfo('<svg height="100" viewBox="0 0 50 25">')).toMatchObject({ width: 200, height: 100 });
  });

  it("uses the web's default when it says nothing, or nonsense", () => {
    expect(svgInfo("<svg>")).toMatchObject({ width: 300, height: 150 });
    expect(svgInfo('<svg width="abc" viewBox="0 0 0 0">')).toMatchObject({ width: 300, height: 150 });
    expect(svgInfo("not svg at all")).toMatchObject({ width: 300, height: 150 });
  });

  it("reads the title and author", () => {
    const info = svgInfo(`<svg><metadata><rdf:RDF><cc:Work><dc:title>Chair &amp; table</dc:title><dc:creator><cc:Agent><dc:title>Rin Kato</dc:title></cc:Agent></dc:creator></cc:Work></rdf:RDF></metadata></svg>`);
    expect(info.title).toBe("Chair & table");
    expect(info.creator).toBe("Rin Kato");
  });

  it("reads a plain title, and leaves the author blank when there's none", () => {
    const info = svgInfo("<svg><title>  Bracket   icon </title></svg>");
    expect(info.title).toBe("Bracket icon");
    expect(info.creator).toBe("");
  });
});

describe("boardSize", () => {
  it("enlarges tiny icons, keeping their shape", () => {
    expect(boardSize(24, 12)).toEqual({ w: 120, h: 60 });
  });

  it("brings down huge drawings, keeping their shape", () => {
    expect(boardSize(3600, 1800)).toEqual({ w: 360, h: 180 });
  });

  it("leaves a sensible size alone", () => {
    expect(boardSize(200, 100)).toEqual({ w: 200, h: 100 });
  });
});
