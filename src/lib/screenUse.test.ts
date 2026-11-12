import { describe, expect, it } from "vitest";
import { countVisit, parseVisits, screenKey, visitTable } from "./screenUse";

describe("screen use", () => {
  const ids = new Set(["d1", "b1", "a1"]);

  it("names a screen without the ids in its address", () => {
    expect(screenKey("/decide/d1/requirements", ids)).toBe("decide/requirements");
    expect(screenKey("/board/b1", ids)).toBe("board");
    expect(screenKey("/handoff/review", ids)).toBe("handoff/review");
    expect(screenKey("/reader/a1", ids)).toBe("reader");
    expect(screenKey("/present/b1", ids)).toBeNull();
    expect(screenKey("/", ids)).toBeNull();
  });

  it("counts, and lists screens never opened first", () => {
    const v = countVisit(countVisit(parseVisits(""), "board"), "board");
    expect(v).toEqual({ board: 2 });
    const table = visitTable(v);
    expect(table[table.length - 1]).toEqual({ screen: "board", count: 2 });
    expect(table.find((r) => r.screen === "decide/simulate")).toEqual({ screen: "decide/simulate", count: 0 });
  });
});
