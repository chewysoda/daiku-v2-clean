/**
 * A whole-app backup, and putting one back. Unlike Export (which reshapes data for other tools), this keeps
 * every row exactly as stored, so restoring gives back the same Daiku. Library files travel in the zip.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { TABLES, TableName, Tables } from "../data/types";

export const BACKUP_FORMAT = "daiku-backup";
export const BACKUP_VERSION = 1;
const INDEX = "daiku-backup.json";

export type BackupRows = { [T in TableName]: Tables[T][] };

export interface BackupIndex {
  format: typeof BACKUP_FORMAT;
  version: number;
  made_at: string;
  tables: Partial<BackupRows>;
  /** Asset id to its file's path inside the zip. */
  files: Record<string, string>;
}

const extOf = (path: string) => /\.([a-z0-9]{1,8})$/i.exec(path)?.[1].toLowerCase() ?? "bin";

/**
 * Packs every table and every library file into one zip. `readFile` returns an asset's bytes, or null when
 * the file can't be read; those are listed in `missing`, and the backup still holds everything else.
 */
export async function buildBackup(rows: BackupRows, readFile: (assetId: string) => Promise<Uint8Array | null>, madeAt: string): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const zip: Record<string, Uint8Array> = {};
  const files: Record<string, string> = {};
  const missing: string[] = [];
  for (const a of rows.assets) {
    if (!a.file_path) continue;
    const bytes = await readFile(a.id).catch(() => null);
    if (!bytes) {
      missing.push(a.title || a.id);
      continue;
    }
    const path = `files/${a.id}.${extOf(a.file_path)}`;
    zip[path] = bytes;
    files[a.id] = path;
  }
  const index: BackupIndex = { format: BACKUP_FORMAT, version: BACKUP_VERSION, made_at: madeAt, tables: rows, files };
  zip[INDEX] = strToU8(JSON.stringify(index));
  return { bytes: zipSync(zip, { level: 6 }), missing };
}

export interface OpenedBackup {
  index: BackupIndex;
  /** Path inside the zip to its bytes. */
  files: Record<string, Uint8Array>;
  /** Rows per table, to show what will come back before anything is replaced. */
  counts: Partial<Record<TableName, number>>;
}

/** Reads a backup zip, or says plainly why it can't. Nothing is changed. */
export function openBackup(zipBytes: Uint8Array): OpenedBackup {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new Error("That file isn't a zip.");
  }
  if (!entries[INDEX]) throw new Error("That zip isn't a Daiku backup. An Export or a pack can't be restored, only a backup.");
  let index: BackupIndex;
  try {
    index = JSON.parse(strFromU8(entries[INDEX])) as BackupIndex;
  } catch {
    throw new Error("The backup's index is damaged.");
  }
  if (!index || index.format !== BACKUP_FORMAT || typeof index.tables !== "object" || !index.tables) throw new Error("That zip isn't a Daiku backup.");
  if (index.version > BACKUP_VERSION) throw new Error("This backup was made by a newer Daiku. Update Daiku, then restore it.");
  const tables: Partial<BackupRows> = {};
  for (const t of TABLES) {
    const rows = (index.tables as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`The backup's ${t} are damaged.`);
    if (rows) (tables as Record<string, unknown>)[t] = rows;
  }
  const counts = Object.fromEntries(TABLES.map((t) => [t, tables[t]?.length ?? 0]));
  return { index: { ...index, tables, files: index.files ?? {} }, files: entries, counts };
}

/**
 * The rows to write, with each asset pointing at where its file now lives. `store` saves a file's bytes and
 * returns its new path, or null outside the desktop app; there `preview` gives a displayable address instead.
 */
export async function restoredRows(
  opened: OpenedBackup,
  store: (bytes: Uint8Array, ext: string) => Promise<string | null>,
  preview: (bytes: Uint8Array, path: string) => string | null,
): Promise<{ rows: Partial<BackupRows>; missing: string[] }> {
  const missing: string[] = [];
  const assets: Tables["assets"][] = [];
  for (const a of opened.index.tables.assets ?? []) {
    const path = opened.index.files[a.id];
    const bytes = path ? opened.files[path] : undefined;
    if (!a.file_path) {
      assets.push(a);
    } else if (!bytes) {
      missing.push(a.title || a.id);
      assets.push(a);
    } else {
      const stored = await store(bytes, extOf(path));
      assets.push(stored ? { ...a, file_path: stored } : { ...a, file_path: null, preview: preview(bytes, path) ?? a.preview });
    }
  }
  return { rows: { ...opened.index.tables, assets }, missing };
}
