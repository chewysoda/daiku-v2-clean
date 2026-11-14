// Gets the math-reading model for the browser preview (npm run dev), pinned to one revision and checked by
// hash. The desktop app downloads the same files itself the first time someone reads a formula (models.rs).
//
// Pix2Text MFR 1.5 by breezedeus, MIT licence: https://huggingface.co/breezedeus/pix2text-mfr-1.5
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REVISION = "1cef9f0bdcd6a4c63df7de1311fb0894593340cc";
const FILES = {
  "encoder_model.onnx": "080a3f660f08bc9ebcacdd96e34be6b6400f8c7e62d7cd0dd8251badc37f610b",
  "decoder_model.onnx": "917deb98e91a0453c5f234f58a0f32f9fb037de8527c7eb4ed394daf9e692f2a",
  "tokenizer.json": "4ffbeb2143e6a38324bb6111b7a8109530d38a076a8439aa5777535f0a32758a",
};
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "models", "mfr");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

mkdirSync(dest, { recursive: true });
for (const [name, hash] of Object.entries(FILES)) {
  const path = join(dest, name);
  if (existsSync(path) && sha256(readFileSync(path)) === hash) continue;
  console.log(`Fetching ${name}…`);
  const response = await fetch(`https://huggingface.co/breezedeus/pix2text-mfr-1.5/resolve/${REVISION}/${name}`);
  if (!response.ok) throw new Error(`Couldn't fetch ${name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== hash) throw new Error(`${name} doesn't match its expected hash, so it wasn't saved.`);
  writeFileSync(path, bytes);
}
writeFileSync(join(dest, "NOTICE.txt"), `Pix2Text MFR 1.5, by breezedeus. MIT licence.\nhttps://huggingface.co/breezedeus/pix2text-mfr-1.5 (revision ${REVISION})\n`);
