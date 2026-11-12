import { describe, expect, it } from "vitest";
import { createPack, deletePack, EMPTY_LIVE, FIRST_PACK_ID, Live, packsFor, parseShelf, specFrom, switchTo, templateFrom, BUILT_IN_TEMPLATES } from "./packs";
import { parsePlan } from "./packPlan";
import { EMPTY_SPEC } from "./appSpec";

const live = (brief: string): Live => ({ ...EMPTY_LIVE, claude_brief: brief, pack_plan: JSON.stringify({ budget: 1000 }) });

describe("packs", () => {
  it("starts with the one pack that's already live", () => {
    const shelf = parseShelf("");
    expect(shelf.current).toBe(FIRST_PACK_ID);
    expect(shelf.list).toHaveLength(1);
    expect(parseShelf("not json").list).toHaveLength(1);
  });

  it("keeps the live pack when another is made, and brings it back on switching", () => {
    const made = createPack(parseShelf(""), live("first brief"), "p2", "Second", "proj-a");
    expect(made.shelf.current).toBe("p2");
    expect(made.live.claude_brief).toBe("");
    expect(parsePlan(made.live.pack_plan).project).toBe("proj-a");
    // Work on the new pack, then go back.
    const back = switchTo(made.shelf, { ...made.live, claude_brief: "second brief" }, FIRST_PACK_ID)!;
    expect(back.live.claude_brief).toBe("first brief");
    expect(parsePlan(back.live.pack_plan).budget).toBe(1000);
    const again = switchTo(back.shelf, back.live, "p2")!;
    expect(again.live.claude_brief).toBe("second brief");
  });

  it("switching to the pack already out does nothing", () => {
    expect(switchTo(parseShelf(""), live("x"), FIRST_PACK_ID)).toBeNull();
  });

  it("lists a project's packs, and survives a round trip through JSON", () => {
    const made = createPack(parseShelf(""), live("a"), "p2", "Second", "proj-a");
    const shelf = parseShelf(JSON.stringify(made.shelf));
    expect(packsFor(shelf, "proj-a").map((p) => p.id)).toEqual(["p2"]);
    expect(packsFor(shelf, "").map((p) => p.id)).toEqual([FIRST_PACK_ID]);
  });

  it("never removes the last pack, and removing the current one brings out another", () => {
    expect(deletePack(parseShelf(""), FIRST_PACK_ID)).toBeNull();
    const made = createPack(parseShelf(""), live("first"), "p2", "Second", "");
    const gone = deletePack(made.shelf, "p2")!;
    expect(gone.shelf.current).toBe(FIRST_PACK_ID);
    expect(gone.live?.claude_brief).toBe("first");
  });

  it("a template fills only its own fields, and saving one leaves out empty fields and the name", () => {
    const spec = specFrom(BUILT_IN_TEMPLATES[2]);
    expect(spec.done).toMatch(/test reproduces/);
    expect(spec.audience).toBe("");
    const t = templateFrom({ ...EMPTY_SPEC, name: "Pin checker", must: "Typed ports" }, "t1", "  ");
    expect(t.spec).toEqual({ must: "Typed ports" });
    expect(t.name).toBe("My template");
  });
});
