import { describe, expect, it } from "vitest";
import { argmax, decodeTokens, tidyLatex, toModelInput, vocabularyFrom } from "./mathDecode";

describe("toModelInput", () => {
  it("scales pixels to between -1 and 1, one channel after another", () => {
    const rgba = new Uint8ClampedArray([0, 255, 127.5, 255, 255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const out = toModelInput(rgba, 2);
    expect(out.length).toBe(12);
    expect(out[0]).toBeCloseTo(-1); // First pixel, red.
    expect(out[1]).toBeCloseTo(1); // Second pixel, red.
    expect(out[4]).toBeCloseTo(1); // First pixel, green.
    expect(out[8]).toBeCloseTo(0, 1); // First pixel, blue.
    expect(out[11]).toBeCloseTo(1); // Last pixel, blue.
  });

  it("ignores transparency", () => {
    const opaque = toModelInput(new Uint8ClampedArray([10, 20, 30, 255]), 1);
    const clear = toModelInput(new Uint8ClampedArray([10, 20, 30, 0]), 1);
    expect(opaque).toEqual(clear);
  });
});

describe("decodeTokens", () => {
  const vocabulary = ["<pad>", "<s>", "</s>", "<unk>", "<mask>", "\\frac", "Ġ", "{", "x", "}", "Ġy"];

  it("joins tokens, and turns the space marker back into a space", () => {
    expect(decodeTokens([5, 7, 8, 9, 10], vocabulary)).toBe("\\frac{x} y");
  });

  it("drops the model's own control tokens", () => {
    expect(decodeTokens([1, 8, 2, 0, 3], vocabulary)).toBe("x");
  });

  it("ignores an id it doesn't know", () => {
    expect(decodeTokens([8, 999], vocabulary)).toBe("x");
  });
});

describe("vocabularyFrom", () => {
  it("indexes tokens by id, including the added ones", () => {
    expect(vocabularyFrom({ model: { vocab: { a: 1, b: 0 } }, added_tokens: [{ id: 2, content: "</s>" }] })).toEqual(["b", "a", "</s>"]);
  });
});

describe("argmax", () => {
  it("looks only within the range given", () => {
    expect(argmax([9, 1, 5, 2, 9], 1, 3)).toBe(1);
  });
});

describe("tidyLatex", () => {
  it("closes up the spaces between tokens", () => {
    expect(tidyLatex("\\frac { x ^ { 2 } } { y } = 1")).toBe("\\frac{x^{2}}{y}=1");
  });

  it("keeps the space a command needs before a letter", () => {
    expect(tidyLatex("\\alpha x")).toBe("\\alpha x");
    expect(tidyLatex("\\sin x + 1")).toBe("\\sin x+1");
  });

  it("tidies a left and right pair", () => {
    expect(tidyLatex("\\left ( x \\right )")).toBe("\\left(x\\right)");
  });
});
