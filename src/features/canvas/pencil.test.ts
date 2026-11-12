import { describe, expect, it } from "vitest";
import { mathToMathml } from "../../design/MathText";
import { creditFromMetadata, readCredit } from "../../lib/metadata";
import { pencilPath, pressureFrom, seedOf, sketchPaths } from "./pencil";

describe("pressureFrom", () => {
  it("uses a stylus's own pressure", () => {
    expect(pressureFrom(0.9, true, 50, 0.5)).toBe(0.9);
  });

  it("makes a fast mouse movement lighter than a slow one", () => {
    let fast = 0.5;
    let slow = 0.5;
    for (let i = 0; i < 20; i++) {
      fast = pressureFrom(0.5, false, 60, fast);
      slow = pressureFrom(0.5, false, 2, slow);
    }
    expect(fast).toBeLessThan(slow);
  });
});

describe("pencilPath", () => {
  it("makes a closed outline, including for a single tap", () => {
    expect(pencilPath([0, 0, 50, 10, 100, 0], [0.5, 0.5, 0.5], 4)).toMatch(/^M.*Z$/);
    expect(pencilPath([5, 5], [0.5], 4)).toMatch(/Z$/);
    expect(pencilPath([], [], 4)).toBe("");
  });

  it("is wider where the pressure is higher", () => {
    const span = (d: string) => {
      const ys = [...d.matchAll(/-?\d+(\.\d+)? (-?\d+(\.\d+)?)/g)].map((m) => Number(m[2]));
      return Math.max(...ys) - Math.min(...ys);
    };
    const line = [0, 0, 25, 0, 50, 0, 75, 0, 100, 0];
    expect(span(pencilPath(line, [1, 1, 1, 1, 1], 8))).toBeGreaterThan(span(pencilPath(line, [0.2, 0.2, 0.2, 0.2, 0.2], 8)));
  });
});

describe("sketchPaths", () => {
  const base = { seed: 42, color: "#000000", width: 2 };

  it("draws every figure", () => {
    for (const f of ["rect", "ellipse", "diamond", "triangle", "line", "arrow"] as const) {
      expect(sketchPaths(f, 100, 60, base).length, f).toBeGreaterThan(0);
    }
  });

  it("draws the same wobble each time, so a shape doesn't shimmer", () => {
    expect(sketchPaths("rect", 100, 60, base)).toEqual(sketchPaths("rect", 100, 60, base));
    expect(seedOf("abc")).toBe(seedOf("abc"));
    expect(seedOf("abc")).not.toBe(seedOf("abd"));
  });

  it("gives different shapes their own wobble", () => {
    expect(sketchPaths("rect", 100, 60, { ...base, seed: 1 })[0].d).not.toBe(sketchPaths("rect", 100, 60, { ...base, seed: 2 })[0].d);
  });

  it("adds hatching for a fill", () => {
    expect(sketchPaths("rect", 100, 60, { ...base, fill: "#ff0000" }).length).toBeGreaterThan(sketchPaths("rect", 100, 60, base).length);
  });
});

describe("credit from image metadata", () => {
  it("prefers the artist, and tidies the copyright line", () => {
    expect(creditFromMetadata({ Artist: "Rin Kato", Copyright: "Other" })).toBe("Rin Kato");
    expect(creditFromMetadata({ Copyright: "© 2024 Rin Kato" })).toBe("Rin Kato");
    expect(creditFromMetadata({ creator: ["Rin Kato"] })).toBe("Rin Kato");
    expect(creditFromMetadata({ rights: { "x-default": "Studio Oak" } })).toBe("Studio Oak");
  });

  it("doesn't take a placeholder for a person", () => {
    for (const junk of ["Unknown", "Copyright", "All rights reserved", "n/a", "  ", "©", "camera owner"]) {
      expect(creditFromMetadata({ Artist: junk }), junk).toBe("");
    }
    expect(creditFromMetadata({})).toBe("");
    expect(creditFromMetadata(null)).toBe("");
    expect(creditFromMetadata({ Make: "Canon" })).toBe("");
  });

  it("strips control characters a file might carry", () => {
    expect(creditFromMetadata({ Artist: "Rin\u0000 Kato\n" })).toBe("Rin Kato");
  });

  it("reads a real JPEG's Artist tag", async () => {
    expect(await readCredit(jpegWithArtist("Rin Kato"))).toBe("Rin Kato");
  });

  it("gets nothing from a file that isn't an image, without failing", async () => {
    expect(await readCredit(new TextEncoder().encode("not an image"))).toBe("");
  });
});

/** The smallest JPEG start that holds an EXIF block with one tag: Artist (0x013B). */
function jpegWithArtist(name: string): Uint8Array {
  const text = [...new TextEncoder().encode(name), 0];
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // Little-endian TIFF, first directory at 8.
    0x01, 0x00, // One entry.
    0x3b, 0x01, 0x02, 0x00, text.length, 0x00, 0x00, 0x00, 26, 0x00, 0x00, 0x00, // Artist, ASCII, at 26.
    0x00, 0x00, 0x00, 0x00, // No next directory.
    ...text,
  ];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const size = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 0xff, ...body, 0xff, 0xd9]);
}

describe("chemistry in math", () => {
  it("understands mhchem's \\ce", async () => {
    const html = (await mathToMathml((s) => s))(String.raw`$\ce{H2O}$`);
    expect(html).toContain("<math");
    expect(html).not.toContain("merror");
    expect(html).not.toContain("katex-error");
  }, 20000);
});
