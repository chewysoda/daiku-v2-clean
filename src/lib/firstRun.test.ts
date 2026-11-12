import { describe, expect, it } from "vitest";
import { useStore } from "../data/store";
import { firstRunSteps } from "./firstRun";

type S = ReturnType<typeof useStore.getState>;

const empty = (): S =>
  ({ assets: [], boards: [], board_items: [], claims: [], evidence_links: [], decisions: [], concepts: [], criteria: [], scores: [], comments: [], records: [], config: { claude_sent: "" } }) as unknown as S;
const done = (s: S) => Object.fromEntries(firstRunSteps(s).map((x) => [x.id, x.done]));

describe("first-run steps", () => {
  it("start with nothing done", () => {
    expect(Object.values(done(empty()))).toEqual([false, false, false, false, false]);
  });
  it("don't count the sample data as the person's work", () => {
    const s = empty();
    s.assets = [{ id: "a", is_sample: true }] as S["assets"];
    s.boards = [{ id: "b", is_sample: true }] as S["boards"];
    s.board_items = [{ id: "i", board_id: "b", asset_id: "a" }] as S["board_items"];
    expect(done(s).collect).toBe(false);
    expect(done(s).arrange).toBe(false);
  });
  it("tick as the person does each thing, and point at their own board", () => {
    const s = empty();
    s.assets = [{ id: "a", is_sample: false }] as S["assets"];
    s.boards = [{ id: "b", is_sample: false }] as S["boards"];
    s.board_items = [{ id: "i", board_id: "b", asset_id: "a" }] as S["board_items"];
    s.claims = [{ id: "c", is_sample: false }] as S["claims"];
    s.evidence_links = [{ id: "e", asset_id: "a", target_type: "claim", target_id: "c", is_sample: false }] as S["evidence_links"];
    s.config = { ...s.config, claude_sent: "1" };
    const steps = firstRunSteps(s);
    expect(steps.filter((x) => x.done).map((x) => x.id)).toEqual(["collect", "arrange", "question", "send"]);
    expect(steps.find((x) => x.id === "arrange")?.to).toBe("/board/b");
  });
});
