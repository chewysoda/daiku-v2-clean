import Database from "@tauri-apps/plugin-sql";
import { Asset, TABLES, TableName, Tables } from "./types";
import { ftsQuery, tokens } from "../lib/search";
import { isTauri } from "../lib/platform";

export interface Repo {
  readonly persistent: boolean;
  all<T extends TableName>(table: T): Promise<Tables[T][]>;
  put<T extends TableName>(table: T, row: Tables[T]): Promise<void>;
  /** Many rows of one table in as few round trips as possible. */
  putMany<T extends TableName>(table: T, rows: Tables[T][]): Promise<void>;
  del(table: TableName, id: string): Promise<void>;
  /** Every row of a table, for restoring a backup. */
  clear(table: TableName): Promise<void>;
  /** Asset ids matching a text query, best match first. */
  searchAssets(query: string): Promise<string[]>;
}

const JSON_COLUMNS = new Set(["palette_lab", "share", "data"]);
const BOOL_COLUMNS = new Set(["is_sample", "is_assumption", "is_guest"]);


function encode(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (JSON_COLUMNS.has(key)) out[key] = JSON.stringify(value);
    else if (BOOL_COLUMNS.has(key)) out[key] = value ? 1 : 0;
    else out[key] = value ?? null;
  }
  return out;
}

function decode<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    if (JSON_COLUMNS.has(key)) out[key] = JSON.parse((out[key] as string) || "null");
    else if (BOOL_COLUMNS.has(key)) out[key] = Boolean(out[key]);
  }
  return out as T;
}

class SqliteRepo implements Repo {
  readonly persistent = true;
  constructor(private db: Database) {}

  async all<T extends TableName>(table: T) {
    const rows = await this.db.select<Record<string, unknown>[]>(`SELECT * FROM ${table}`);
    return rows.map((r) => decode<Tables[T]>(r));
  }

  async put<T extends TableName>(table: T, row: Tables[T]) {
    await this.putMany(table, [row]);
  }

  async putMany<T extends TableName>(table: T, rows: Tables[T][]) {
    // Rows can carry different columns (older rows lack newer optional fields), and one statement
    // needs one column list, so rows are grouped by shape first.
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const data = encode(row as object);
      const shape = Object.keys(data).join(",");
      groups.set(shape, [...(groups.get(shape) ?? []), data]);
    }
    for (const [shape, group] of groups) {
      const cols = shape.split(",");
      const updates = cols
        .filter((c) => c !== "id")
        .map((c) => `${c} = excluded.${c}`)
        .join(", ");
      // SQLite allows 32766 parameters per statement.
      const perStatement = Math.max(1, Math.floor(32000 / cols.length));
      for (let start = 0; start < group.length; start += perStatement) {
        const chunk = group.slice(start, start + perStatement);
        const values = chunk.map((_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(", ")})`).join(", ");
        await this.db.execute(
          // Upsert rather than INSERT OR REPLACE so the FTS triggers keep the index correct.
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}
           ON CONFLICT(id) DO UPDATE SET ${updates}`,
          chunk.flatMap((d) => cols.map((c) => d[c])),
        );
      }
    }
  }

  async del(table: TableName, id: string) {
    await this.db.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }

  async clear(table: TableName) {
    await this.db.execute(`DELETE FROM ${table}`);
  }

  async searchAssets(query: string) {
    const match = ftsQuery(query);
    if (!match) return [];
    const rows = await this.db.select<{ id: string }[]>(
      `SELECT a.id FROM assets_fts f JOIN assets a ON a.rowid = f.rowid
       WHERE assets_fts MATCH $1 ORDER BY bm25(assets_fts) LIMIT 500`,
      [match],
    );
    return rows.map((r) => r.id);
  }
}

/**
 * Stand-in used when the UI runs in an ordinary browser (`npm run dev`, Playwright tests).
 * It keeps data in localStorage, and the desktop app never uses it.
 */
export class MemoryRepo implements Repo {
  readonly persistent = false;
  private data = new Map<TableName, Map<string, unknown>>();
  private key = "daiku-preview-db";

  constructor(private storage: Storage | null = null) {
    for (const t of TABLES) this.data.set(t, new Map());
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, [string, unknown][]>;
        for (const t of TABLES) this.data.set(t, new Map(parsed[t] ?? []));
      }
    } catch {
      // A corrupt preview store just starts fresh.
    }
  }

  private flush() {
    try {
      const out: Record<string, [string, unknown][]> = {};
      for (const [t, rows] of this.data) out[t] = [...rows.entries()];
      this.storage?.setItem(this.key, JSON.stringify(out));
    } catch {
      // Preview only: storage can be full or blocked.
    }
  }

  async all<T extends TableName>(table: T) {
    return [...this.data.get(table)!.values()] as Tables[T][];
  }
  async put<T extends TableName>(table: T, row: Tables[T]) {
    await this.putMany(table, [row]);
  }
  async putMany<T extends TableName>(table: T, rows: Tables[T][]) {
    for (const row of rows) this.data.get(table)!.set((row as { id: string }).id, row);
    this.flush();
  }
  async del(table: TableName, id: string) {
    this.data.get(table)!.delete(id);
    this.flush();
  }
  async clear(table: TableName) {
    this.data.get(table)!.clear();
    this.flush();
  }
  async searchAssets(query: string) {
    const terms = tokens(query);
    if (!terms.length) return [];
    const assets = [...this.data.get("assets")!.values()] as Asset[];
    return assets
      .map((a) => {
        const hay = `${a.title} ${a.credit} ${a.via} ${a.tags} ${a.notes}`.toLowerCase();
        return { id: a.id, hits: terms.filter((t) => hay.includes(t)).length };
      })
      .filter((r) => r.hits > 0)
      .sort((x, y) => y.hits - x.hits)
      .map((r) => r.id);
  }
}

export async function openRepo(): Promise<Repo> {
  if (isTauri) return new SqliteRepo(await Database.load("sqlite:daiku.db"));
  return new MemoryRepo(window.localStorage);
}
