import { useLocation } from "react-router";
import { useLatestBoard } from "../data/store";

/**
 * The board on screen. "/board" on its own opens the latest board, so that counts too: otherwise the
 * sidebar would say "All work" while a project's board is open, and a claim made in the Reader beside
 * that board would belong to no board.
 */
export function useBoardHere(): string | null {
  const { pathname } = useLocation();
  const latest = useLatestBoard();
  if (pathname.startsWith("/board/")) return pathname.split("/")[2] || null;
  return pathname === "/board" ? (latest?.id ?? null) : null;
}
