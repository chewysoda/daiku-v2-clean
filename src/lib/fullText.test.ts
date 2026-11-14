// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { Asset } from "../data/types";
import { fullText, hasFullText, MAX_FULL_TEXT } from "./fullText";

const asset = (over: Partial<Asset>): Asset => ({
  id: "a1", kind: "file", title: "Doc", file_path: "C:/lib/doc.csv", preview: null, source_url: null, credit: "yours", via: null,
  captured_at: "2026-01-01", provenance: "user", palette_lab: [], width: null, height: null, tags: "", notes: "", is_sample: false,
  ...over,
} as Asset);

describe("fullText", () => {
  it("picks documents, and skips pictures, code and files already uploaded as Markdown", () => {
    expect(hasFullText(asset({ kind: "pdf", file_path: "C:/lib/paper.pdf" }))).toBe(true);
    expect(hasFullText(asset({ file_path: "C:/lib/report.docx" }))).toBe(true);
    expect(hasFullText(asset({ kind: "image", file_path: "C:/lib/x.png" }))).toBe(false);
    expect(hasFullText(asset({ file_path: "C:/lib/main.rs" }))).toBe(false);
    expect(hasFullText(asset({ file_path: "C:/lib/report.docx", tags: "markdown" }))).toBe(false);
  });

  it("turns a file into Markdown once, and cuts very long text", async () => {
    let reads = 0;
    const bytes = async () => (reads++, strToU8("name,score\nlamp,4"));
    const a = asset({ id: "csv1" });
    expect(await fullText(a, bytes)).toBe("| name | score |\n| --- | --- |\n| lamp | 4 |");
    await fullText(a, bytes);
    expect(reads).toBe(1);
    const long = await fullText(asset({ id: "long", file_path: "C:/lib/long.txt" }), async () => strToU8("x".repeat(MAX_FULL_TEXT + 10)));
    expect(long.length).toBeLessThan(MAX_FULL_TEXT + 200);
    expect(long).toMatch(/cut to keep the pack small/);
  });

  it("says when a file has no text, and retries a file that failed", async () => {
    expect(await fullText(asset({ id: "empty", file_path: "C:/lib/e.txt" }), async () => strToU8("  "))).toMatch(/no text/);
    const b = asset({ id: "flaky", file_path: "C:/lib/f.txt" });
    await expect(fullText(b, async () => Promise.reject(new Error("offline")))).rejects.toThrow();
    expect(await fullText(b, async () => strToU8("back"))).toBe("back");
  });
});
