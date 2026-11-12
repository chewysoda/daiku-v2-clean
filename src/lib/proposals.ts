/**
 * Cards proposed from an AI's answer. A proposal is an ordinary sticky marked `proposed`: the board draws it dashed
 * with Accept and Reject, and packs leave it out until it's accepted, so the AI never reads its own words back as
 * the person's. Accepting keeps the card, signed by who proposed it; rejecting removes it. Both are one undo.
 */
import { BoardItem } from "../data/types";

export const PROPOSER = "Claude";
const W = 240;
const GAP = 24;

export const isProposal = (item: Pick<BoardItem, "data">) => item.data.proposed === "claude";

/** Tall enough for the text at the sticky's size, within reason: a long passage scrolls rather than towers. */
function heightFor(text: string): number {
  const rows = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 28)), 0);
  return Math.min(340, Math.max(110, 64 + rows * 21));
}

/**
 * A proposed card for `text`, in a column to the right of everything on the board, below any proposals already
 * waiting there, so new ones never land on the person's own work.
 */
export function proposalCard(boardId: string, text: string, existing: BoardItem[], id: string, at: string): BoardItem {
  const placed = existing.filter((i) => i.board_id === boardId && i.kind !== "connector");
  const own = placed.filter((i) => !isProposal(i));
  const waiting = placed.filter(isProposal);
  const x = waiting.length ? Math.min(...waiting.map((i) => i.x)) : own.length ? Math.max(...own.map((i) => i.x + i.w)) + 80 : 64;
  const y = waiting.length ? Math.max(...waiting.map((i) => i.y + i.h)) + GAP : own.length ? Math.min(...own.map((i) => i.y)) : 64;
  const z = existing.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  const clean = text.trim();
  return { id, board_id: boardId, kind: "sticky", x, y, w: W, h: heightFor(clean), rotation: 0, z, asset_id: null, data: { text: clean, proposed: "claude", author: PROPOSER }, updated_at: at };
}

/** The card's data once accepted: an ordinary note that still says who wrote it. */
export function accepted(data: BoardItem["data"]): BoardItem["data"] {
  const rest = { ...data, author: data.author ?? PROPOSER };
  delete rest.proposed;
  return rest;
}

/** Everything without proposals still waiting, for anything that goes to an AI or out as the person's work. */
export function withoutProposals<S extends { board_items: BoardItem[] }>(s: S): S {
  return s.board_items.some(isProposal) ? { ...s, board_items: s.board_items.filter((i) => !isProposal(i)) } : s;
}
