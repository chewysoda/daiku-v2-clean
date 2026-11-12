import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { BackupRows, buildBackup, openBackup, restoredRows } from "./backup";
import { TABLES } from "../data/types";

const empty = () => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as BackupRows;

describe("backup and restore", () => {
  it("round-trips every row and every file", async () => {
    const rows = empty();
    rows.assets = [
      { id: "a1", title: "Datasheet", file_path: "C:/lib/assets/abc.pdf", preview: null } as never,
      { id: "a2", title: "A link", file_path: null, preview: null, source_url: "https://x.dev" } as never,
    ];
    rows.boards = [{ id: "b1", name: "Hardware" } as never];
    rows.settings = [{ id: "claude_brief", value: "Build it" }];
    const { bytes, missing } = await buildBackup(rows, async (id) => (id === "a1" ? new Uint8Array([1, 2, 3]) : null), "2026-11-10T00:00:00Z");
    expect(missing).toEqual([]);

    const opened = openBackup(bytes);
    expect(opened.counts.assets).toBe(2);
    expect(opened.counts.boards).toBe(1);
    const stored: number[][] = [];
    const { rows: back, missing: lost } = await restoredRows(
      opened,
      async (b, ext) => {
        stored.push([...b]);
        return `D:/new/assets/x.${ext}`;
      },
      () => null,
    );
    expect(lost).toEqual([]);
    expect(stored).toEqual([[1, 2, 3]]);
    expect(back.assets?.find((a) => a.id === "a1")?.file_path).toBe("D:/new/assets/x.pdf");
    expect(back.assets?.find((a) => a.id === "a2")?.source_url).toBe("https://x.dev");
    expect(back.settings).toEqual([{ id: "claude_brief", value: "Build it" }]);
  });

  it("lists files it couldn't read, and still backs up the rest", async () => {
    const rows = empty();
    rows.assets = [{ id: "a1", title: "Gone", file_path: "C:/lib/gone.png", preview: null } as never];
    const { bytes, missing } = await buildBackup(rows, async () => null, "t");
    expect(missing).toEqual(["Gone"]);
    expect(openBackup(bytes).counts.assets).toBe(1);
  });

  it("refuses what isn't a backup, and says why", () => {
    expect(() => openBackup(new Uint8Array([1, 2, 3]))).toThrow(/isn't a zip/);
    expect(() => openBackup(zipSync({ "CLAUDE.md": strToU8("# pack") }))).toThrow(/isn't a Daiku backup/);
    const newer = zipSync({ "daiku-backup.json": strToU8(JSON.stringify({ format: "daiku-backup", version: 99, tables: {}, files: {} })) });
    expect(() => openBackup(newer)).toThrow(/newer Daiku/);
    const damaged = zipSync({ "daiku-backup.json": strToU8(JSON.stringify({ format: "daiku-backup", version: 1, tables: { boards: "x" }, files: {} })) });
    expect(() => openBackup(damaged)).toThrow(/boards are damaged/);
  });
});
