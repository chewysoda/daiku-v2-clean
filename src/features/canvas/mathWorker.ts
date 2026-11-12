/// <reference lib="webworker" />
// Runs the math model off the main thread, so the board stays responsive while it thinks.
import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import { argmax, decodeTokens, END_TOKEN, INPUT_SIZE, MAX_TOKENS, START_TOKEN, tidyLatex, vocabularyFrom } from "./mathDecode";

// One thread: more would need the app to be cross-origin isolated, for little gain on short formulas.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };

type Loaded = { encoder: ort.InferenceSession; decoder: ort.InferenceSession; vocabulary: string[] };
let loading: Promise<Loaded> | null = null;

async function bytesOf(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The math model is missing (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

function load(base: (file: string) => string): Promise<Loaded> {
  loading ??= (async () => {
    const options: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"] };
    const [encoder, decoder, tokenizer] = await Promise.all([
      bytesOf(base("encoder_model.onnx")).then((b) => ort.InferenceSession.create(b, options)),
      bytesOf(base("decoder_model.onnx")).then((b) => ort.InferenceSession.create(b, options)),
      fetch(base("tokenizer.json")).then((r) => r.json()),
    ]);
    return { encoder, decoder, vocabulary: vocabularyFrom(tokenizer) };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

async function read(pixels: Float32Array, urls: Record<string, string>): Promise<string> {
  const { encoder, decoder, vocabulary } = await load((file) => urls[file]);
  const encoded = await encoder.run({ [encoder.inputNames[0]]: new ort.Tensor("float32", pixels, [1, 3, INPUT_SIZE, INPUT_SIZE]) });
  const hidden = encoded[encoder.outputNames[0]];

  // One token at a time, always taking the likeliest, until it says it's finished.
  const tokens = [START_TOKEN];
  for (let step = 0; step < MAX_TOKENS; step++) {
    const ids = new ort.Tensor("int64", BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]);
    const feeds: Record<string, ort.Tensor> = {};
    for (const name of decoder.inputNames) {
      if (name === "input_ids") feeds[name] = ids;
      else if (name === "encoder_hidden_states") feeds[name] = hidden;
      else if (name === "attention_mask") feeds[name] = new ort.Tensor("int64", new BigInt64Array(tokens.length).fill(1n), [1, tokens.length]);
      else throw new Error(`The math model needs an input Daiku doesn't provide: ${name}`);
    }
    const out = await decoder.run(feeds);
    const logits = out[decoder.outputNames[0]];
    const size = logits.dims[2];
    const next = argmax(logits.data as Float32Array, (tokens.length - 1) * size, size);
    if (next === END_TOKEN) break;
    tokens.push(next);
  }
  return tidyLatex(decodeTokens(tokens, vocabulary));
}

self.onmessage = async (e: MessageEvent<{ id: number; pixels: Float32Array; urls: Record<string, string> }>) => {
  const { id, pixels, urls } = e.data;
  try {
    self.postMessage({ id, latex: await read(pixels, urls) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
