/**
 * The parts of reading math that aren't the model itself: getting a picture into the form it was
 * trained on, and turning its output back into LaTeX. Pure, so they're testable without running it.
 */
export const INPUT_SIZE = 384;
export const START_TOKEN = 1;
export const END_TOKEN = 2;
export const MAX_TOKENS = 200;

/** RGBA pixels to the model's input: three channels, each scaled to between -1 and 1, one after another. */
export function toModelInput(rgba: Uint8ClampedArray, size = INPUT_SIZE): Float32Array {
  const out = new Float32Array(3 * size * size);
  const count = size * size;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) out[c * count + i] = rgba[i * 4 + c] / 127.5 - 1;
  }
  return out;
}

/** GPT-2's byte-to-character table, which the tokenizer's vocabulary is written in. */
function byteDecoder(): Map<string, number> {
  const bytes: number[] = [];
  for (let b = 33; b <= 126; b++) bytes.push(b);
  for (let b = 161; b <= 172; b++) bytes.push(b);
  for (let b = 174; b <= 255; b++) bytes.push(b);
  const chars = bytes.map((b) => String.fromCharCode(b));
  let extra = 0;
  for (let b = 0; b < 256; b++) {
    if (!bytes.includes(b)) {
      bytes.push(b);
      chars.push(String.fromCharCode(256 + extra++));
    }
  }
  return new Map(chars.map((c, i) => [c, bytes[i]]));
}

const BYTES = byteDecoder();

/** Token ids to text. Special tokens are dropped, and anything out of range is ignored. */
export function decodeTokens(ids: number[], vocabulary: string[]): string {
  const bytes: number[] = [];
  for (const id of ids) {
    const token = vocabulary[id];
    if (!token || /^<(pad|s|\/s|unk|mask)>$/.test(token)) continue;
    for (const ch of token) {
      const b = BYTES.get(ch);
      if (b !== undefined) bytes.push(b);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).trim();
}

/** The vocabulary from a tokenizer.json, indexed by id. */
export function vocabularyFrom(tokenizer: { model: { vocab: Record<string, number> }; added_tokens?: { id: number; content: string }[] }): string[] {
  const out: string[] = [];
  for (const [token, id] of Object.entries(tokenizer.model.vocab)) out[id] = token;
  for (const t of tokenizer.added_tokens ?? []) out[t.id] = t.content;
  return out;
}

export function argmax(values: ArrayLike<number>, start: number, count: number): number {
  let best = 0;
  let top = -Infinity;
  for (let i = 0; i < count; i++) {
    if (values[start + i] > top) {
      top = values[start + i];
      best = i;
    }
  }
  return best;
}

/** Tidies what the model writes, whose tokens come out with a space between every one. */
export function tidyLatex(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*([{}^_()[\]=+,])\s*/g, "$1")
    .replace(/\\(left|right)\s+/g, "\\$1")
    .replace(/\s+\\right/g, "\\right")
    .trim();
}
