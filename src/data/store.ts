import { create } from "zustand";
import { Repo, openRepo } from "./repo";
import { ESP_BOARD, ESP_BOARD_ITEMS, ESP_BRIEF, ESP_ITEMS_AT, ESP_REVIEW, ESP_V1_ITEM_IDS, esp32Plan, SEED_ESP32 } from "./seedEsp32";
import {
  Asset,
  Board,
  BoardItem,
  Claim,
  Comment,
  Concept,
  Criterion,
  Decision,
  EvidenceLink,
  LogEntry,
  RecordDataMap,
  RecordRow,
  RecordType,
  Score,
  TABLES,
  TableName,
  Tables,
  now,
  uid,
} from "./types";
import { isTauri, native } from "../lib/platform";
import { EngineId } from "../lib/web";

export interface Settings {
  name: string;
  theme: string;
  library_dir: string;
  engine: EngineId;
  seeded: string;
  seeded_v2: string;
  font_ui: string;
  font_display: string;
  font_mono: string;
  /** JSON list of imported fonts. */
  custom_fonts: string;
  backdrop_path: string;
  backdrop_kind: string;
  backdrop_dim: string;
  backdrop_paused: string;
  /** "off" skips the hello and greeting when Daiku opens. */
  greeting_intro: string;
  accent: string;
  ui_scale: string;
  motion: string;
  canvas_grid: string;
  canvas_snap: string;
  start_screen: string;
  last_route: string;
  /** JSON list of stickers you've made. */
  custom_stickers: string;
  /** JSON list of stickers made from your own PNG and SVG files. */
  picture_stickers: string;
  /** JSON of the last look chosen for a sticky note. */
  sticky_style: string;
  /** JSON of each drawing tool's last look. */
  draw_styles: string;
  /** JSON of the Threads map's shape. */
  graph_layout: string;
  /** What the person wants Claude to build, kept between exports. */
  claude_brief: string;
  /** The person's standing rules, one per line, sent with every pack. */
  claude_rules: string;
  /** JSON list of looks the person saved. */
  saved_looks: string;
  /** JSON of how the build pack is organised. */
  pack_plan: string;
  /** JSON of the Export page's names and folders. */
  export_plan: string;
  /** The Library's view: working projects, or all files. */
  library_scope: string;
  /** Whether Home's "Start here" (once the example strip, hence the name) has been put away. */
  example_hidden: string;
  /** Set once something has been handed to Claude, which finishes the first-run steps. */
  claude_sent: string;
  /** JSON of what the last pack carried, item by item, for packs of only what changed. */
  pack_sent: string;
  /** JSON list of recent sends and their token counts, to show what the budget saves. */
  pack_sends: string;
  /** JSON of the build review: criteria marks, returned output and saved brief versions. */
  pack_review: string;
  /** The Ollama model Extract uses. Empty means the default. */
  local_model: string;
  /** "reduced" makes every glass layer solid. */
  transparency: string;
  /** "collapsed" shrinks the sidebar to icons. */
  sidebar: string;
  /** Set once the ESP32 sample project has been added. */
  seeded_v4: string;
  /** Set once the ESP32 board has its claim cards. */
  seeded_v5: string;
  /** "open" shows the pack tray's itemised breakdown. */
  tray: string;
  seeded_v3: string;
  /** JSON of every pack and which one is out: see lib/packs.ts. */
  packs: string;
  /** JSON list of brief templates the person saved. */
  brief_templates: string;
  /** The project being worked in, or "" for all work. Packs follow it. */
  project_current: string;
  /** JSON of how often each screen was opened, on this device only. See lib/screenUse.ts. */
  screen_visits: string;
}

const DEFAULTS: Settings = {
  name: "",
  theme: "dark",
  library_dir: "",
  engine: "duckduckgo",
  seeded: "",
  seeded_v2: "",
  font_ui: "",
  font_display: "",
  font_mono: "",
  custom_fonts: "[]",
  backdrop_path: "",
  backdrop_kind: "",
  backdrop_dim: "70",
  backdrop_paused: "",
  greeting_intro: "",
  accent: "",
  ui_scale: "1",
  motion: "",
  canvas_grid: "dots",
  canvas_snap: "",
  start_screen: "home",
  last_route: "",
  custom_stickers: "[]",
  picture_stickers: "[]",
  sticky_style: "",
  draw_styles: "",
  graph_layout: "",
  claude_brief: "",
  claude_rules: "",
  saved_looks: "[]",
  pack_plan: "",
  export_plan: "",
  library_scope: "",
  example_hidden: "",
  claude_sent: "",
  pack_sent: "",
  pack_sends: "[]",
  pack_review: "",
  local_model: "",
  transparency: "",
  sidebar: "",
  seeded_v4: "",
  seeded_v5: "",
  tray: "",
  seeded_v3: "",
  packs: "",
  brief_templates: "[]",
  project_current: "",
  screen_visits: "",
};

type Rows = { [T in TableName]: Tables[T][] };

interface State extends Rows {
  ready: boolean;
  error: string | null;
  pendingWrites: number;
  saveError: string | null;
  config: Settings;
  /** Opens the database, or the given repo (tests). */
  init: (testRepo?: Repo) => Promise<void>;
  /** Resolves once every change so far is on disk, or has failed. */
  flush: () => Promise<void>;
  /** Writes again whatever failed to save, from what's in memory now. */
  retrySaves: () => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setLibraryDir: (path: string) => Promise<void>;

  putAsset: (asset: Asset) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  searchAssets: (query: string) => Promise<string[]>;

  createBoard: (name: string) => Board;
  renameBoard: (id: string, name: string) => void;
  updateShare: (id: string, patch: Board["share"]) => void;
  deleteBoard: (id: string) => void;
  touchBoard: (id: string) => void;
  putItems: (items: BoardItem[]) => void;
  deleteItems: (ids: string[]) => void;

  addClaim: (text: string, boardId: string | null) => Claim;
  deleteClaim: (id: string) => void;
  linkEvidence: (assetId: string, type: EvidenceLink["target_type"], targetId: string, stance?: "for" | "against", note?: string) => void;
  addRecord: <T extends RecordType>(type: T, parentId: string | null, data: RecordDataMap[T], why?: string) => RecordRow<T>;
  updateRecord: <T extends RecordType>(id: string, patch: Partial<RecordDataMap[T]>) => void;
  deleteRecord: (id: string) => void;
  unlinkEvidence: (id: string) => void;
  updateEvidence: (id: string, patch: Partial<Pick<EvidenceLink, "stance" | "strength" | "source_type" | "limitation" | "note">>) => void;

  createDecision: (title: string, boardId: string | null) => Decision;
  deleteDecision: (id: string) => void;
  renameDecision: (id: string, title: string) => void;
  updateDecision: (id: string, patch: Partial<Decision>) => void;
  duplicateDecision: (id: string) => string | null;
  addConcept: (decisionId: string, name: string) => void;
  updateConcept: (id: string, patch: Partial<Concept>) => void;
  deleteConcept: (id: string) => void;
  addCriterion: (decisionId: string, name: string) => void;
  updateCriterion: (id: string, patch: Partial<Criterion>) => void;
  setWeights: (criteria: Pick<Criterion, "id" | "weight">[]) => void;
  deleteCriterion: (id: string) => void;
  setScore: (conceptId: string, criterionId: string, value: number) => void;

  addComment: (comment: Omit<Comment, "id" | "created_at" | "is_sample">) => void;
  deleteComment: (id: string) => void;
  removeSampleData: () => void;
  /**
   * Replaces everything with a backup's rows. Settings that belong to this computer (the library folder)
   * are kept. Resolves once it's all on disk.
   */
  replaceAll: (rows: Partial<Rows>, keepSettings: (keyof Settings)[]) => Promise<void>;
}

let repo: Repo | null = null;
let writes: Promise<unknown> = Promise.resolve();

const emptyRows = () => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Rows;

const LOGGED = new Set<TableName>(["assets", "boards", "board_items", "claims", "evidence_links", "decisions", "concepts", "criteria", "scores", "comments", "records"]);
const TABLE_LABEL: Partial<Record<TableName, string>> = {
  assets: "library item",
  boards: "board",
  board_items: "board",
  claims: "claim",
  evidence_links: "evidence link",
  decisions: "decision",
  concepts: "concept",
  criteria: "criterion",
  scores: "score",
  comments: "comment",
};
const RECORD_LABEL: Record<RecordType, string> = {
  requirement: "requirement",
  part: "BOM part",
  calc: "calculation",
  material: "material",
  sim_run: "simulation run",
  highlight: "highlight",
  participant: "participant",
  theme: "theme",
  interview_note: "interview note",
  note: "note",
  draft: "draft",
  project: "project",
  milestone: "milestone",
  check: "progress check",
  decision_log: "decision record",
  deck: "deck",
};
const VERB = { create: "Added", update: "Changed", delete: "Removed" };

function describe(table: TableName, action: LogEntry["action"], row: Record<string, unknown>): string {
  if (table === "board_items") return `${action === "update" ? "Edited" : VERB[action]} ${String(row.kind)} on a board`;
  if (table === "records") {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const name = data.title ?? data.name ?? data.code ?? data.label ?? data.text;
    return `${VERB[action]} ${RECORD_LABEL[row.type as RecordType]}${name ? `: ${String(name).slice(0, 80)}` : ""}`;
  }
  const name = row.title ?? row.name ?? row.text;
  return `${VERB[action]} ${TABLE_LABEL[table]}${name ? `: ${String(name).slice(0, 80)}` : ""}`;
}

function snapshotValue(table: TableName, row: Record<string, unknown>): string | null {
  if (table === "scores") return String(row.value);
  if (table === "criteria") return String(row.weight);
  return null;
}

/** A row that failed to save, as "table\u0000id". Retried from memory, so a stale write never wins. */
const dirtyKey = (table: TableName, id: string) => `${table}\u0000${id}`;

export const useStore = create<State>((set, get) => {
  const dirty = new Set<string>();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let autoRetried = false;

  /** Writes are serialised so "saved on this device" only shows once everything is on disk. */
  const persist = (work: (r: Repo) => Promise<unknown>, touched: [TableName, string][]) => {
    if (!repo) return;
    const active = repo;
    set((s) => ({ pendingWrites: s.pendingWrites + 1 }));
    writes = writes
      .then(() => work(active))
      .then(() => {
        if (!dirty.size) set({ saveError: null });
      })
      .catch((e) => {
        for (const [table, id] of touched) dirty.add(dirtyKey(table, id));
        set({ saveError: String(e) });
        // One quiet retry covers a briefly locked database; after that it waits for Retry.
        if (!retryTimer && !autoRetried) {
          autoRetried = true;
          retryTimer = setTimeout(() => void get().retrySaves(), 2000);
        }
      })
      .finally(() => set((s) => ({ pendingWrites: s.pendingWrites - 1 })));
  };

  /** Bulk operations (removing sample data) would otherwise bury the log. */
  let muted = false;
  const lastLogged = new Map<string, number>();

  const appendLog = (entry: Omit<LogEntry, "id" | "at" | "actor">) => {
    const row: LogEntry = { ...entry, id: uid(), at: now(), actor: get().config.name || "You" };
    set((s) => ({ workflow_log: [...s.workflow_log, row] }));
    persist((r) => r.put("workflow_log", row), [["workflow_log", row.id]]);
  };

  const logChange = (table: TableName, action: LogEntry["action"], row: Record<string, unknown>, before?: Record<string, unknown>) => {
    if (muted || !LOGGED.has(table)) return;
    // Repaints and palette extraction aren't decisions.
    if (action === "update" && (table === "assets" || table === "boards")) return;
    // Moves and small edits merge per object per minute so the log stays readable.
    const key = table === "board_items" ? `items:${String(row.board_id)}` : `${table}:${String(row.id)}`;
    const t = Date.now();
    const important = table === "scores" || table === "criteria";
    if (action === "update" && !important && t - (lastLogged.get(key) ?? 0) < 60000) return;
    lastLogged.set(key, t);
    appendLog({
      action,
      target_type: table === "records" ? String(row.type) : table,
      target_id: String(row.id),
      summary: describe(table, action, row),
      before: before ? snapshotValue(table, before) : null,
      after: action === "delete" ? null : snapshotValue(table, row),
      why: null,
    });
  };

  /** One state update and one write for any number of rows, so a canvas drag of 200 items stays cheap. */
  const putMany = <T extends TableName>(table: T, rows: Tables[T][]) => {
    if (!rows.length) return;
    const idOf = (r: unknown) => (r as { id: string }).id;
    const before = new Map((get()[table] as Tables[T][]).map((r) => [idOf(r), r]));
    for (const row of rows) {
      const previous = before.get(idOf(row));
      logChange(table, previous ? "update" : "create", row as unknown as Record<string, unknown>, previous as unknown as Record<string, unknown> | undefined);
    }
    const incoming = new Map(rows.map((r) => [idOf(r), r]));
    set((s) => {
      const current = s[table] as Tables[T][];
      const next = current.map((r) => incoming.get(idOf(r)) ?? r);
      const known = new Set(current.map(idOf));
      for (const [id, row] of incoming) if (!known.has(id)) next.push(row);
      return { [table]: next } as Partial<State>;
    });
    const latest = [...incoming.values()];
    persist((r) => r.putMany(table, latest), latest.map((row) => [table, idOf(row)]));
  };
  const put = <T extends TableName>(table: T, row: Tables[T]) => putMany(table, [row]);

  const remove = (table: TableName, ids: string[]) => {
    if (!ids.length) return;
    const gone = new Set(ids);
    for (const row of get()[table] as unknown as Record<string, unknown>[]) {
      if (gone.has(row.id as string)) logChange(table, "delete", row);
    }
    set((s) => ({
      [table]: (s[table] as { id: string }[]).filter((r) => !gone.has(r.id)),
    }) as Partial<State>);
    persist(
      async (r) => {
        for (const id of ids) await r.del(table, id);
      },
      ids.map((id) => [table, id]),
    );
  };

  /** Removes rows from memory only, for children the database's ON DELETE CASCADE removes. */
  const forget = (table: TableName, keep: (row: never) => boolean) => {
    set((s) => ({ [table]: (s[table] as never[]).filter(keep) }) as Partial<State>);
  };

  const dropScoresFor = (scoreIds: string[]) => {
    const gone = new Set(scoreIds);
    remove(
      "evidence_links",
      get()
        .evidence_links.filter((e) => e.target_type === "score" && gone.has(e.target_id))
        .map((e) => e.id),
    );
    remove("scores", scoreIds);
  };


  /** A score is only sourced while something supports it. Evidence against it doesn't count. */
  const settleScore = (scoreId: string) => {
    const score = get().scores.find((x) => x.id === scoreId);
    if (!score) return;
    const backed = get().evidence_links.some((e) => e.target_type === "score" && e.target_id === scoreId && e.stance !== "against");
    if (score.is_assumption === backed) put("scores", { ...score, is_assumption: !backed });
  };
  return {
    ...emptyRows(),
    ready: false,
    error: null,
    pendingWrites: 0,
    saveError: null,
    config: DEFAULTS,

    init: async (testRepo) => {
      try {
        repo = testRepo ?? (await openRepo());
        const loaded = emptyRows() as Record<TableName, unknown[]>;
        for (const t of TABLES) loaded[t] = await repo.all(t);
        const config = { ...DEFAULTS };
        for (const row of loaded.settings as { id: keyof Settings; value: string }[]) {
          (config as Record<string, string>)[row.id] = row.value;
        }
        // A fresh install starts with one example: the ESP32 Node Programmer (added just below).
        // The older furniture, engineering and agents samples are no longer seeded.
        const fresh = !config.seeded;
        if (fresh) {
          for (const id of ["seeded", "seeded_v2", "seeded_v3"] as const) {
            config[id] = "1";
            await repo.put("settings", { id, value: "1" });
          }
        }
        // The ESP32 sample: the project a fresh install opens on, with its pack and review filled in.
        // Added for anyone who still has the samples; their own pack and brief are never replaced.
        if (!config.seeded_v4) {
          if (fresh || (loaded.boards as Board[]).some((b) => b.is_sample)) {
            for (const [table, rows] of Object.entries(SEED_ESP32) as [TableName, { id: string }[]][]) {
              for (const row of rows) await repo.put(table, row as never);
              loaded[table] = [...loaded[table], ...rows];
            }
            const sampleIds = [
              ...(loaded.boards as Board[]).filter((r) => r.is_sample).map((r) => r.id),
              ...(loaded.decisions as Decision[]).filter((r) => r.is_sample).map((r) => r.id),
              ...(loaded.assets as Asset[]).filter((r) => r.is_sample).map((r) => r.id),
              ...(loaded.claims as Claim[]).filter((r) => r.is_sample).map((r) => r.id),
              ...(loaded.records as RecordRow[]).filter((r) => r.is_sample && ["note", "draft", "deck"].includes(r.type)).map((r) => r.id),
            ];
            const fills: ["pack_plan" | "claude_brief" | "pack_review", string][] = [
              ["pack_plan", JSON.stringify(esp32Plan(sampleIds))],
              ["claude_brief", ESP_BRIEF],
              ["pack_review", JSON.stringify(ESP_REVIEW)],
            ];
            for (const [id, value] of fills) {
              if (config[id]) continue;
              config[id] = value;
              await repo.put("settings", { id, value });
            }
          }
          config.seeded_v4 = "1";
          await repo.put("settings", { id: "seeded_v4", value: "1" });
        }
        // The ESP32 board's claim cards. An untouched board moves to the new layout; one that's been
        // changed keeps every item where it is and gains the cards in a column of their own.
        if (!config.seeded_v5) {
          const onBoard = (loaded.board_items as BoardItem[]).filter((i) => i.board_id === ESP_BOARD);
          if (onBoard.length && !onBoard.some((i) => i.data.claim)) {
            const untouched = onBoard.length === ESP_V1_ITEM_IDS.length && onBoard.every((i) => ESP_V1_ITEM_IDS.includes(i.id) && i.updated_at === ESP_ITEMS_AT);
            const next = untouched
              ? ESP_BOARD_ITEMS
              : ESP_BOARD_ITEMS.filter((i) => i.data.claim).map((i, n) => ({ ...i, x: 2000, y: 100 + n * 190 }));
            for (const row of next) await repo.put("board_items", row as never);
            const ids = new Set(next.map((i) => i.id));
            loaded.board_items = [...(loaded.board_items as BoardItem[]).filter((i) => !ids.has(i.id)), ...next];
          }
          config.seeded_v5 = "1";
          await repo.put("settings", { id: "seeded_v5", value: "1" });
        }
        if (isTauri) {
          if (!config.library_dir) {
            config.library_dir = await native.libraryDefaultDir();
            await repo.put("settings", { id: "library_dir", value: config.library_dir });
          }
          await native.librarySetDir(config.library_dir);
        }
        set({ ...(loaded as unknown as Rows), config, ready: true });
      } catch (e) {
        set({ error: String(e), ready: true });
      }
    },

    flush: async () => {
      // A write can queue another (a retry), so wait until nothing is left.
      while (get().pendingWrites > 0) await writes.catch(() => undefined);
    },

    retrySaves: async () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (!repo || !dirty.size) return;
      const keys = [...dirty];
      dirty.clear();
      const s = get();
      for (const key of keys) {
        const [table, id] = key.split("\u0000") as [TableName, string];
        if (table === "settings") {
          const value = (s.config as unknown as Record<string, string>)[id];
          persist((r) => r.put("settings", { id, value: String(value ?? "") }), [[table, id]]);
          continue;
        }
        const row = (s[table] as { id: string }[]).find((r) => r.id === id);
        persist((r) => (row ? r.put(table, row as never) : r.del(table, id)), [[table, id]]);
      }
      await get().flush();
      // Fully caught up: a later failure gets its own quiet retry again.
      if (!dirty.size) autoRetried = false;
    },

    setSetting: (key, value) => {
      set((s) => ({ config: { ...s.config, [key]: value } }));
      persist((r) => r.put("settings", { id: key, value: String(value) }), [["settings", key]]);
    },

    setLibraryDir: async (path) => {
      if (isTauri) await native.librarySetDir(path);
      get().setSetting("library_dir", path);
    },

    putAsset: (asset) => put("assets", asset),
    updateAsset: (id, patch) => {
      const asset = get().assets.find((a) => a.id === id);
      if (asset) put("assets", { ...asset, ...patch });
    },
    deleteAsset: (id) => {
      remove("assets", [id]);
      // Mirrors the schema's cascade: evidence goes, board images keep a "missing" placeholder.
      remove(
        "evidence_links",
        get().evidence_links.filter((e) => e.asset_id === id).map((e) => e.id),
      );
      set((s) => ({
        board_items: s.board_items.map((i) => (i.asset_id === id ? { ...i, asset_id: null } : i)),
        concepts: s.concepts.map((c) => (c.asset_id === id ? { ...c, asset_id: null } : c)),
      }));
    },
    searchAssets: async (query) => (repo ? repo.searchAssets(query) : []),

    createBoard: (name) => {
      const board: Board = {
        id: uid(),
        name,
        version: 1,
        share: {},
        created_at: now(),
        updated_at: now(),
        is_sample: false,
      };
      put("boards", board);
      return board;
    },
    renameBoard: (id, name) => {
      const board = get().boards.find((b) => b.id === id);
      if (board) put("boards", { ...board, name, updated_at: now() });
    },
    updateShare: (id, patch) => {
      const board = get().boards.find((b) => b.id === id);
      if (board) put("boards", { ...board, share: { ...board.share, ...patch } });
    },
    deleteBoard: (id) => {
      // The database cascades the board's claims, but evidence points at them by id only, so it
      // has to go explicitly or it lingers, linked to nothing.
      const claimIds = new Set(get().claims.filter((c) => c.board_id === id).map((c) => c.id));
      remove(
        "evidence_links",
        get()
          .evidence_links.filter((e) => e.target_type === "claim" && claimIds.has(e.target_id))
          .map((e) => e.id),
      );
      remove("boards", [id]);
      forget("board_items", (i: BoardItem) => i.board_id !== id);
      forget("comments", (c: Comment) => c.board_id !== id);
      forget("claims", (c: Claim) => c.board_id !== id);
      set((s) => ({
        decisions: s.decisions.map((d) => (d.board_id === id ? { ...d, board_id: null } : d)),
      }));
    },
    touchBoard: (id) => {
      const board = get().boards.find((b) => b.id === id);
      if (board) put("boards", { ...board, updated_at: now() });
    },
    putItems: (items) => putMany("board_items", items),
    deleteItems: (ids) => remove("board_items", ids),

    addClaim: (text, boardId) => {
      const claim: Claim = { id: uid(), board_id: boardId, text, created_at: now(), is_sample: false };
      put("claims", claim);
      return claim;
    },
    deleteClaim: (id) => {
      remove("claims", [id]);
      remove(
        "evidence_links",
        get()
          .evidence_links.filter((e) => e.target_type === "claim" && e.target_id === id)
          .map((e) => e.id),
      );
    },
    addRecord: (type, parentId, data, why) => {
      const row = { id: uid(), type, parent_id: parentId, data, created_at: now(), updated_at: now(), is_sample: false } as RecordRow<typeof type>;
      if (why) {
        // The reason is the point of this entry, so it's written directly, with the why attached.
        appendLog({ action: "create", target_type: type, target_id: row.id, summary: describe("records", "create", row as unknown as Record<string, unknown>), before: null, after: null, why });
        muted = true;
        put("records", row as RecordRow);
        muted = false;
      } else {
        put("records", row as RecordRow);
      }
      return row;
    },
    updateRecord: (id, patch) => {
      const row = get().records.find((r) => r.id === id);
      if (row) put("records", { ...row, data: { ...row.data, ...patch } as RecordRow["data"], updated_at: now() });
    },
    deleteRecord: (id) => {
      const notes = () => get().records.filter((r) => r.type === "interview_note") as RecordRow<"interview_note">[];
      // A participant's notes go with them; a theme's notes just become unsorted.
      remove("records", [id, ...notes().filter((n) => n.data.participant_id === id).map((n) => n.id)]);
      for (const n of notes().filter((x) => x.data.theme_id === id)) get().updateRecord<"interview_note">(n.id, { theme_id: null });
    },

    linkEvidence: (assetId, type, targetId, stance = "for", note = "") => {
      const s = get();
      if (s.evidence_links.some((e) => e.asset_id === assetId && e.target_type === type && e.target_id === targetId)) {
        return;
      }
      put("evidence_links", {
        id: uid(),
        asset_id: assetId,
        target_type: type,
        target_id: targetId,
        note,
        stance,
        created_at: now(),
        is_sample: false,
      });
      if (type === "score" && stance === "for") {
        const score = s.scores.find((x) => x.id === targetId);
        if (score) put("scores", { ...score, is_assumption: false });
      }
    },
    unlinkEvidence: (id) => {
      const link = get().evidence_links.find((e) => e.id === id);
      remove("evidence_links", [id]);
      if (link?.target_type === "score") settleScore(link.target_id);
    },
    updateEvidence: (id, patch) => {
      const link = get().evidence_links.find((e) => e.id === id);
      if (!link) return;
      put("evidence_links", { ...link, ...patch });
      if (link.target_type === "score" && patch.stance) settleScore(link.target_id);
    },

    createDecision: (title, boardId) => {
      const decision: Decision = { id: uid(), board_id: boardId, title, created_at: now(), is_sample: false };
      put("decisions", decision);
      return decision;
    },
    deleteDecision: (id) => {
      const s = get();
      const conceptIds = s.concepts.filter((c) => c.decision_id === id).map((c) => c.id);
      const scoreIds = s.scores.filter((x) => conceptIds.includes(x.concept_id)).map((x) => x.id);
      dropScoresFor(scoreIds);
      remove("concepts", conceptIds);
      remove("criteria", s.criteria.filter((c) => c.decision_id === id).map((c) => c.id));
      remove("decisions", [id]);
    },
    renameDecision: (id, title) => {
      const d = get().decisions.find((x) => x.id === id);
      if (d) put("decisions", { ...d, title });
    },
    updateDecision: (id, patch) => {
      const d = get().decisions.find((x) => x.id === id);
      if (d) put("decisions", { ...d, ...patch });
    },
    // The matrix and its evidence. Requirements and the BOM refer to concepts in ways a copy
    // couldn't honestly carry over, so they stay with the original.
    duplicateDecision: (id) => {
      const s = get();
      const original = s.decisions.find((d) => d.id === id);
      if (!original) return null;
      const copy: Decision = { ...original, id: uid(), title: `${original.title} (copy)`, created_at: now(), is_sample: false };
      put("decisions", copy);
      const conceptIds = new Map<string, string>();
      for (const c of s.concepts.filter((x) => x.decision_id === id)) {
        const newId = uid();
        conceptIds.set(c.id, newId);
        put("concepts", { ...c, id: newId, decision_id: copy.id });
      }
      const criterionIds = new Map<string, string>();
      for (const q of s.criteria.filter((x) => x.decision_id === id)) {
        const newId = uid();
        criterionIds.set(q.id, newId);
        put("criteria", { ...q, id: newId, decision_id: copy.id });
      }
      for (const score of s.scores) {
        const concept = conceptIds.get(score.concept_id);
        const criterion = criterionIds.get(score.criterion_id);
        if (!concept || !criterion) continue;
        const newId = uid();
        put("scores", { ...score, id: newId, concept_id: concept, criterion_id: criterion });
        for (const link of s.evidence_links.filter((l) => l.target_type === "score" && l.target_id === score.id)) {
          put("evidence_links", { ...link, id: uid(), target_id: newId, created_at: now(), is_sample: false });
        }
      }
      return copy.id;
    },
    addConcept: (decisionId, name) => {
      const existing = get().concepts.filter((c) => c.decision_id === decisionId);
      put("concepts", {
        id: uid(),
        decision_id: decisionId,
        label: String.fromCharCode(65 + existing.length),
        name,
        asset_id: null,
        flag: "",
        sort: existing.length,
      });
    },
    updateConcept: (id, patch) => {
      const c = get().concepts.find((x) => x.id === id);
      if (c) put("concepts", { ...c, ...patch });
    },
    deleteConcept: (id) => {
      dropScoresFor(get().scores.filter((x) => x.concept_id === id).map((x) => x.id));
      remove("concepts", [id]);
    },
    addCriterion: (decisionId, name) => {
      const existing = get().criteria.filter((c) => c.decision_id === decisionId);
      put("criteria", { id: uid(), decision_id: decisionId, name, weight: 0, sort: existing.length });
    },
    updateCriterion: (id, patch) => {
      const c = get().criteria.find((x) => x.id === id);
      if (c) put("criteria", { ...c, ...patch });
    },
    setWeights: (updates) => {
      for (const u of updates) get().updateCriterion(u.id, { weight: u.weight });
    },
    deleteCriterion: (id) => {
      dropScoresFor(get().scores.filter((x) => x.criterion_id === id).map((x) => x.id));
      remove("criteria", [id]);
    },
    setScore: (conceptId, criterionId, value) => {
      const s = get();
      const existing = s.scores.find((x) => x.concept_id === conceptId && x.criterion_id === criterionId);
      const score: Score = existing
        ? { ...existing, value }
        : // A new score has no evidence yet, so it starts as a guess.
          { id: uid(), concept_id: conceptId, criterion_id: criterionId, value, is_assumption: true };
      put("scores", score);
    },

    addComment: (comment) =>
      put("comments", { ...comment, id: uid(), created_at: now(), is_sample: false }),
    deleteComment: (id) => {
      remove("comments", [id, ...get().comments.filter((c) => c.parent_id === id).map((c) => c.id)]);
    },

    replaceAll: async (rows, keepSettings) => {
      if (!repo) return;
      await get().flush();
      const active = repo;
      const kept = new Map(keepSettings.map((k) => [k, get().config[k]]));
      const settings = ((rows.settings ?? []) as { id: string; value: string }[]).filter((r) => !kept.has(r.id as keyof Settings));
      for (const [id, value] of kept) settings.push({ id, value: String(value) });
      const next = { ...emptyRows(), ...rows, settings } as Rows;
      set((s) => ({ pendingWrites: s.pendingWrites + 1 }));
      try {
        // Children first, so nothing is left pointing at a row that's gone; then parents first.
        for (const t of [...TABLES].reverse()) await active.clear(t);
        for (const t of TABLES) if (next[t].length) await active.putMany(t, next[t] as never[]);
      } finally {
        set((s) => ({ pendingWrites: s.pendingWrites - 1 }));
      }
      const config = { ...DEFAULTS };
      for (const row of settings) (config as Record<string, string>)[row.id] = row.value;
      set({ ...next, config, saveError: null });
    },

    removeSampleData: () => {
      const s = get();
      muted = true;
      remove("records", s.records.filter((r) => r.is_sample).map((r) => r.id));
      dropScoresFor(
        s.scores.filter((x) => s.concepts.find((c) => c.id === x.concept_id && s.decisions.find((d) => d.id === c.decision_id && d.is_sample))).map((x) => x.id),
      );
      for (const d of s.decisions.filter((x) => x.is_sample)) get().deleteDecision(d.id);
      remove("evidence_links", get().evidence_links.filter((e) => e.is_sample).map((e) => e.id));
      for (const b of s.boards.filter((x) => x.is_sample)) get().deleteBoard(b.id);
      remove("claims", get().claims.filter((c) => c.is_sample).map((c) => c.id));
      for (const a of s.assets.filter((x) => x.is_sample)) get().deleteAsset(a.id);
      muted = false;
      appendLog({ action: "delete", target_type: "sample_data", target_id: "all", summary: "Removed the sample data", before: null, after: null, why: null });
    },
  };
});

/** Settings that belong to this computer, so a restored backup never overwrites them. */
export const MACHINE_SETTINGS: (keyof Settings)[] = ["library_dir"];

export const useLatestBoard = () =>
  useStore((s) => [...s.boards].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null);

/** Rows of one record type, optionally under one parent. */
export const selectRecords = <T extends RecordType>(rows: RecordRow[], type: T, parentId?: string | null): RecordRow<T>[] =>
  rows.filter((r) => r.type === type && (parentId === undefined || r.parent_id === parentId)) as RecordRow<T>[];

export type { Asset, Board, BoardItem, Claim, Comment, Concept, Criterion, Decision, EvidenceLink, Score };
