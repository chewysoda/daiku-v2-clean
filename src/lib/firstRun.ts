/**
 * The first research loop, as five steps worked out from the person's own data. Nothing is stored
 * but the last step's flag: doing the thing is what ticks it, wherever it was done.
 */
import { useStore } from "../data/store";
import { withoutSamples } from "./claudePack";

type S = ReturnType<typeof useStore.getState>;

export interface FirstRunStep {
  id: "collect" | "arrange" | "question" | "weigh" | "send";
  label: string;
  hint: string;
  /** Where to do it. */
  to: string;
  done: boolean;
}

export function firstRunSteps(s: S): FirstRunStep[] {
  const own = withoutSamples(s);
  const board = own.boards[0];
  const decision = own.decisions[0];
  const evidenced = own.claims.some((c) => own.evidence_links.some((l) => l.target_type === "claim" && l.target_id === c.id));
  return [
    { id: "collect", label: "Save a source", hint: "Paste a link above, or import a picture or PDF. Its credit is kept with it.", to: "/explore", done: own.assets.length > 0 },
    { id: "arrange", label: "Put it on a board", hint: "Drag sources onto a board and group them into sections.", to: board ? `/board/${board.id}` : "/board", done: own.board_items.some((i) => i.asset_id) },
    { id: "question", label: "Back a claim with evidence", hint: "Write what you think is true, then link the sources that support or challenge it.", to: "/explore/claims", done: evidenced },
    { id: "weigh", label: "Weigh your options", hint: "Score options against weighted criteria. A score without a source stays marked as a guess.", to: decision ? `/decide/${decision.id}` : "/decide", done: own.scores.length > 0 },
    { id: "send", label: "Hand it to Claude", hint: "Send a board or decision to Claude, as text to paste or a zip for a project.", to: board ? `/board/${board.id}` : "/handoff", done: s.config.claude_sent === "1" },
  ];
}
