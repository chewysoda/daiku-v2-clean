import { describe, expect, it } from "vitest";
import { addTab, closeTab, freeSlot, MAX_TABS, NewTab, ResearchTab, TabsState } from "./researchTabs";

const empty: TabsState = { tabs: [], active: "" };
const add = (s: TabsState, t: NewTab) => addTab(s, t)!;
const web = (n: number) => {
  let s = empty;
  for (let i = 0; i < n; i++) s = add(s, { kind: "web" });
  return s;
};
const slots = (tabs: ResearchTab[]) => tabs.flatMap((t) => (t.kind === "web" ? [t.slot] : []));

describe("research tabs", () => {
  it("holds five and refuses a sixth", () => {
    const full = web(MAX_TABS);
    expect(full.tabs).toHaveLength(5);
    expect(addTab(full, { kind: "web" })).toBeNull();
    expect(addTab(full, { kind: "draft", draftId: "d" })).toBeNull();
  });
  it("gives each web tab its own browser pane", () => {
    expect(slots(web(5).tabs)).toEqual([0, 1, 2, 3, 4]);
  });
  it("reuses a closed tab's pane", () => {
    const s = web(3);
    const closed = closeTab(s, s.tabs[1].id);
    expect(freeSlot(closed.tabs)).toBe(1);
    expect(slots(add(closed, { kind: "web" }).tabs)).toEqual([0, 2, 1]);
  });
  it("mixes kinds in the same five", () => {
    let s = web(3);
    s = add(s, { kind: "pdf", assetId: "a" });
    s = add(s, { kind: "draft", draftId: "d" });
    expect(s.tabs).toHaveLength(5);
    expect(addTab(s, { kind: "pdf", assetId: "b" })).toBeNull();
  });
  it("goes to a PDF or draft that's already open, even when full", () => {
    let s = web(4);
    s = add(s, { kind: "pdf", assetId: "a" });
    const pdf = s.tabs[4].id;
    s = { ...s, active: s.tabs[0].id };
    const again = addTab(s, { kind: "pdf", assetId: "a" })!;
    expect(again.tabs).toHaveLength(5);
    expect(again.active).toBe(pdf);
  });
  it("moves to a neighbour on closing the active tab", () => {
    const s = web(3);
    const [a, b, c] = s.tabs;
    expect(closeTab({ ...s, active: b.id }, b.id).active).toBe(c.id);
    expect(closeTab({ ...s, active: c.id }, c.id).active).toBe(b.id);
    expect(closeTab({ ...s, active: a.id }, c.id).active).toBe(a.id);
  });
  it("always leaves a tab to work in", () => {
    const s = web(1);
    const after = closeTab(s, s.tabs[0].id);
    expect(after.tabs).toHaveLength(1);
    expect(after.tabs[0].kind).toBe("web");
    expect(after.active).toBe(after.tabs[0].id);
  });
});
