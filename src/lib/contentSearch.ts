/**
 * Searching inside the work, not just the names of places: sources, claims, notes, drafts and the words
 * on boards. Every word typed has to appear; titles count for more than body text. Runs in memory.
 */
import { BoardItem, RecordRow } from "../data/types";
import { useStore } from "../data/store";
import { tokens } from "./search";

type S = Pick<ReturnType<typeof useStore.getState>, "assets" | "claims" | "records" | "board_items" | "boards">;

export type HitKind = "source" | "claim" | "note" | "draft" | "board";

export interface Hit {
  kind: HitKind;
  id: string;
  title: string;
  /** The words around the first match. */
  snippet: string;
  /** Where it opens. Sources that are PDFs say "read" so the caller can open them beside the screen. */
  to: string;
  read?: boolean;
  score: number;
}

/** About 80 characters around the first word found, on one line. */
export function snippetOf(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return flat.slice(0, 80);
  const start = Math.max(0, at - 30);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 80)}${start + 80 < flat.length ? "…" : ""}`;
}

export function searchContent(s: S, query: string, limit = 8): Hit[] {
  const words = tokens(query);
  if (!words.length || query.trim().length < 2) return [];
  const hits: Hit[] = [];
  const consider = (kind: HitKind, id: string, title: string, body: string, to: string, read = false) => {
    const t = title.toLowerCase();
    const b = body.toLowerCase();
    if (!words.every((w) => t.includes(w) || b.includes(w))) return;
    const score = words.filter((w) => t.includes(w)).length * 3 + words.filter((w) => b.includes(w)).length;
    const inTitle = words.every((w) => t.includes(w));
    hits.push({ kind, id, title: title || "Untitled", snippet: inTitle ? "" : snippetOf(body, words), to, read, score });
  };

  for (const a of s.assets) {
    const pdf = a.kind === "pdf";
    consider("source", a.id, a.title, `${a.notes} ${a.credit ?? ""} ${a.tags}`, pdf ? a.id : `/library?q=${encodeURIComponent(a.title)}`, pdf);
  }
  for (const c of s.claims) consider("claim", c.id, c.text, "", c.board_id ? `/board/${c.board_id}` : "/explore/claims");
  for (const r of s.records) {
    if (r.type === "note") {
      const n = (r as RecordRow<"note">).data;
      consider("note", r.id, n.title, n.body, `/notes?note=${r.id}`);
    } else if (r.type === "draft") {
      const d = (r as RecordRow<"draft">).data;
      consider("draft", r.id, d.title, d.body, `/draft/${r.id}`);
    }
  }
  // Words on boards: one hit per board, as the board is where they open.
  const boardName = new Map(s.boards.map((b) => [b.id, b.name]));
  const byBoard = new Map<string, BoardItem[]>();
  for (const i of s.board_items) {
    if (!i.data.text || i.data.claim || !boardName.has(i.board_id)) continue;
    byBoard.set(i.board_id, [...(byBoard.get(i.board_id) ?? []), i]);
  }
  for (const [boardId, items] of byBoard) {
    const text = items.map((i) => i.data.text).join(" · ");
    const words_ = words;
    if (!words_.every((w) => text.toLowerCase().includes(w))) continue;
    hits.push({ kind: "board", id: boardId, title: boardName.get(boardId) || "Untitled board", snippet: snippetOf(text, words_), to: `/board/${boardId}`, score: words_.length });
  }
  return hits.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title)).slice(0, limit);
}
