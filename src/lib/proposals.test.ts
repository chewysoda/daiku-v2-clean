import { describe, expect, it } from "vitest";
import { BoardItem } from "../data/types";
import { accepted, isProposal, proposalCard, withoutProposals } from "./proposals";

const item = (over: Partial<BoardItem>): BoardItem => ({ id: "a", board_id: "b", kind: "sticky", x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 1, asset_id: null, data: {}, updated_at: "", ...over });

describe("proposed cards", () => {
  it("land to the right of the person's work, on top, marked as Claude's", () => {
    const card = proposalCard("b", "  Use a token bucket  ", [item({ x: 10, y: 40, w: 200, z: 5 }), item({ id: "c", board_id: "other", x: 9000 })], "p1", "t");
    expect(card).toMatchObject({ board_id: "b", kind: "sticky", x: 290, y: 40, z: 6, data: { text: "Use a token bucket", proposed: "claude", author: "Claude" } });
    expect(isProposal(card)).toBe(true);
  });

  it("stack under the proposals already waiting", () => {
    const first = proposalCard("b", "One", [item({})], "p1", "t");
    const second = proposalCard("b", "Two", [item({}), first], "p2", "t");
    expect(second.x).toBe(first.x);
    expect(second.y).toBe(first.y + first.h + 24);
  });

  it("start at the corner of an empty board", () => {
    expect(proposalCard("b", "One", [], "p1", "t")).toMatchObject({ x: 64, y: 64 });
  });

  it("grow with the text, up to a limit", () => {
    const short = proposalCard("b", "Short", [], "p", "t").h;
    const long = proposalCard("b", "word ".repeat(400), [], "p", "t").h;
    expect(long).toBeGreaterThan(short);
    expect(long).toBe(340);
  });

  it("become ordinary notes when accepted, still signed", () => {
    expect(accepted({ text: "x", proposed: "claude", author: "Claude" })).toEqual({ text: "x", author: "Claude" });
  });

  it("stay out of what goes to an AI until accepted", () => {
    const s = { board_items: [item({ id: "mine" }), item({ id: "theirs", data: { proposed: "claude" } })] };
    expect(withoutProposals(s).board_items.map((i) => i.id)).toEqual(["mine"]);
    const none = { board_items: [item({})] };
    expect(withoutProposals(none)).toBe(none);
  });
});
