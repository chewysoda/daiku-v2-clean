/**
 * The tabs in Explore: up to five, each a web page, a PDF or a draft. They last for as long as the app
 * is open, like the browser panes behind them. They aren't restored on the next launch, because
 * reopening a web tab would connect to the internet before anyone had asked it to.
 */
import { create } from "zustand";
import { uid } from "../../data/types";

export const MAX_TABS = 5;

export type ResearchTab =
  | { id: string; kind: "web"; slot: number; title: string; address: string; pageUrl: string; opened: boolean; loading: boolean }
  | { id: string; kind: "pdf"; assetId: string }
  | { id: string; kind: "draft"; draftId: string };

export type NewTab = { kind: "web" } | { kind: "pdf"; assetId: string } | { kind: "draft"; draftId: string };

/** The lowest browser pane no web tab is using. There's one per tab, so five is always enough. */
export function freeSlot(tabs: ResearchTab[]): number {
  const used = new Set(tabs.flatMap((t) => (t.kind === "web" ? [t.slot] : [])));
  for (let slot = 0; slot < MAX_TABS; slot++) if (!used.has(slot)) return slot;
  return -1;
}

const makeTab = (tabs: ResearchTab[], fresh: NewTab): ResearchTab =>
  fresh.kind === "web" ? { id: uid(), kind: "web", slot: freeSlot(tabs), title: "", address: "", pageUrl: "", opened: false, loading: false } : { id: uid(), ...fresh };

const sameContent = (t: ResearchTab, fresh: NewTab) => (t.kind === "pdf" && fresh.kind === "pdf" && t.assetId === fresh.assetId) || (t.kind === "draft" && fresh.kind === "draft" && t.draftId === fresh.draftId);

export interface TabsState {
  tabs: ResearchTab[];
  active: string;
}

/** Adds a tab, unless it's already open, in which case it goes there. Null means there's no room. */
export function addTab(state: TabsState, fresh: NewTab): TabsState | null {
  const open = state.tabs.find((t) => sameContent(t, fresh));
  if (open) return { ...state, active: open.id };
  if (state.tabs.length >= MAX_TABS) return null;
  const tab = makeTab(state.tabs, fresh);
  return { tabs: [...state.tabs, tab], active: tab.id };
}

/** Closes a tab and moves to its neighbour. The last one closing leaves a fresh web tab. */
export function closeTab(state: TabsState, id: string): TabsState {
  const at = state.tabs.findIndex((t) => t.id === id);
  if (at < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (!tabs.length) {
    const tab = makeTab([], { kind: "web" });
    return { tabs: [tab], active: tab.id };
  }
  return { tabs, active: state.active === id ? tabs[Math.min(at, tabs.length - 1)].id : state.active };
}

const first = makeTab([], { kind: "web" });

export const useResearchTabs = create<
  TabsState & {
    open: (fresh: NewTab) => boolean;
    close: (id: string) => ResearchTab | undefined;
    select: (id: string) => void;
    patchWeb: (slot: number, fields: Partial<Extract<ResearchTab, { kind: "web" }>>) => void;
  }
>((set, get) => ({
  tabs: [first],
  active: first.id,
  open: (fresh) => {
    const next = addTab(get(), fresh);
    if (next) set(next);
    return !!next;
  },
  close: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    set(closeTab(get(), id));
    return tab;
  },
  select: (id) => set({ active: id }),
  patchWeb: (slot, fields) => set({ tabs: get().tabs.map((t) => (t.kind === "web" && t.slot === slot ? { ...t, ...fields } : t)) }),
}));
