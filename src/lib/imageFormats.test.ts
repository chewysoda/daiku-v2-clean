import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { kindForName } from "../features/library/importing";
import { encodeBmp, encodeTiff, EXPORT_IMAGE_FORMATS, IMPORT_FILE_EXTENSIONS, IMPORT_IMAGE_EXTENSIONS, isExportImageFormat, pythonLiteral, pythonModule, wrapIco } from "./imageFormats";

// Two pixels: opaque red, then fully transparent.
const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);

describe("BMP", () => {
  const bmp = encodeBmp(pixels, 2, 1);
  const view = new DataView(bmp.buffer);

  it("has a correct header", () => {
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM");
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(view.getInt32(18, true)).toBe(2);
    expect(view.getInt32(22, true)).toBe(1);
  });

  it("stores blue, green, red, and flattens transparency on white", () => {
    expect([bmp[54], bmp[55], bmp[56]]).toEqual([0, 0, 255]);
    expect([bmp[57], bmp[58], bmp[59]]).toEqual([255, 255, 255]);
  });

  it("pads rows to four bytes", () => {
    expect(encodeBmp(new Uint8ClampedArray(4), 1, 1).length).toBe(54 + 4);
    expect(encodeBmp(new Uint8ClampedArray(20), 5, 1).length).toBe(54 + 16);
  });

  it("runs bottom to top", () => {
    const tall = encodeBmp(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), 1, 2);
    expect([tall[54], tall[55], tall[56]]).toEqual([0, 255, 0]);
  });
});

describe("TIFF", () => {
  const tiff = encodeTiff(pixels, 2, 1);
  const view = new DataView(tiff.buffer);
  const tag = (id: number) => {
    const at = view.getUint32(4, true);
    for (let i = 0; i < view.getUint16(at, true); i++) {
      const e = at + 2 + i * 12;
      if (view.getUint16(e, true) === id) return view.getUint16(e + 2, true) === 3 && view.getUint32(e + 4, true) === 1 ? view.getUint16(e + 8, true) : view.getUint32(e + 8, true);
    }
    return null;
  };

  it("has a correct header and size tags", () => {
    expect([tiff[0], tiff[1], view.getUint16(2, true)]).toEqual([0x49, 0x49, 42]);
    expect(tag(256)).toBe(2);
    expect(tag(257)).toBe(1);
    expect(tag(279)).toBe(8);
  });

  it("keeps pixels and transparency", () => {
    expect([...tiff.slice(8, 16)]).toEqual([...pixels]);
    expect(tag(338)).toBe(2);
  });

  it("lists tags in ascending order, as the format requires", () => {
    const at = view.getUint32(4, true);
    const ids = Array.from({ length: view.getUint16(at, true) }, (_, i) => view.getUint16(at + 2 + i * 12, true));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("points to its eight-bit samples", () => {
    const bits = tag(258)!;
    expect([0, 1, 2, 3].map((i) => view.getUint16(bits + i * 2, true))).toEqual([8, 8, 8, 8]);
  });
});

describe("ICO", () => {
  it("wraps a PNG, using 0 to mean 256", () => {
    const png = new Uint8Array([1, 2, 3]);
    const ico = wrapIco(png, 256, 32);
    expect([...ico.slice(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(32);
    expect(new DataView(ico.buffer).getUint32(14, true)).toBe(3);
    expect([...ico.slice(22)]).toEqual([1, 2, 3]);
  });
});

describe("what can be brought in", () => {
  it("treats every image format as an image, whatever its case", () => {
    for (const ext of IMPORT_IMAGE_EXTENSIONS) expect(kindForName(`a.${ext}`), ext).toBe("image");
    expect(kindForName("PHOTO.HEIC")).toBe("image");
  });

  it("treats Python as a file", () => {
    for (const ext of IMPORT_FILE_EXTENSIONS) expect(kindForName(`script.${ext}`), ext).toBe("file");
  });

  it("doesn't confuse other files", () => {
    expect(kindForName("a.pdf")).toBe("pdf");
    expect(kindForName("a.mp4")).toBe("video");
    expect(kindForName("a.tiff.zip")).toBe("link");
  });
});

describe("export image choices", () => {
  it("defaults to something real, and rejects anything else", () => {
    expect(EXPORT_IMAGE_FORMATS[0].id).toBe("original");
    expect(isExportImageFormat("gif")).toBe(true);
    expect(isExportImageFormat("exe")).toBe(false);
  });
});

describe("Python", () => {
  it("writes Python's own forms", () => {
    expect(pythonLiteral(null)).toBe("None");
    expect(pythonLiteral(true)).toBe("True");
    expect(pythonLiteral(false)).toBe("False");
    expect(pythonLiteral(1.5)).toBe("1.5");
    expect(pythonLiteral(NaN)).toBe("None");
    expect(pythonLiteral([])).toBe("[]");
    expect(pythonLiteral({})).toBe("{}");
  });

  it("can't be made to run anything by what's in a note", () => {
    const nasty = '"""\nimport os; os.system("x")\n"""';
    expect(pythonLiteral(nasty).split("\n")).toHaveLength(1);
  });

  // The real test: Python itself reads it back as plain data, and it's the same data.
  it("reads back exactly in real Python, as a literal with no code", () => {
    const data = { s: 'He said "hi"\n\\ é 日本 😀 """', n: 3.5, t: true, f: false, none: null, list: [1, [2], { k: "v" }], empty: [], "odd key": {} };
    let python = "python";
    try {
      execFileSync(python, ["--version"]);
    } catch {
      python = "python3";
    }
    const script = "import ast,json,sys;t=sys.stdin.buffer.read().decode('utf8');print(json.dumps(ast.literal_eval(t.split('DATA = ',1)[1])))";
    const out = execFileSync(python, ["-c", script], { input: Buffer.from(pythonModule("graphs", data), "utf8"), encoding: "utf8" });
    expect(JSON.parse(out)).toEqual(data);
  });
});
