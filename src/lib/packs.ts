/**
 * Several packs, each belonging to a project (or to all work). The settings the rest of the app reads
 * (pack_plan, claude_brief, pack_review, pack_sent, pack_sends) stay the working copy of the current pack;
 * switching stores that copy on the shelf and brings another one out.
 */
import { AppSpec, EMPTY_SPEC } from "./appSpec";
import { EMPTY_PLAN } from "./packPlan";

export const LIVE_KEYS = ["pack_plan", "claude_brief", "pack_review", "pack_sent", "pack_sends"] as const;
export type LiveKey = (typeof LIVE_KEYS)[number];
export type Live = Record<LiveKey, string>;

export const EMPTY_LIVE: Live = { pack_plan: "", claude_brief: "", pack_review: "", pack_sent: "", pack_sends: "[]" };

export interface PackEntry {
  id: string;
  name: string;
  /** A project's id, or "" for all work. */
  project: string;
  /** The pack as it was when last put away. The current pack's copy is out of date until it's stored. */
  saved: Live;
}

export interface Shelf {
  /** The pack whose content is in the live settings. */
  current: string;
  list: PackEntry[];
}

export const FIRST_PACK_ID = "pack-1";

export function parseShelf(json: string): Shelf {
  try {
    const v = JSON.parse(json) as Partial<Shelf> | null;
    if (v && typeof v === "object" && Array.isArray(v.list) && v.list.length) {
      const list = v.list
        .filter((p) => p && typeof p.id === "string")
        .map((p) => ({ id: p.id, name: String(p.name ?? "Pack"), project: String(p.project ?? ""), saved: { ...EMPTY_LIVE, ...(p.saved ?? {}) } }));
      if (list.length) return { current: list.some((p) => p.id === v.current) ? String(v.current) : list[0].id, list };
    }
  } catch {
    // Unreadable: start with the one pack that's live now.
  }
  // Before packs existed there was one, and it's the one in the live settings.
  return { current: FIRST_PACK_ID, list: [{ id: FIRST_PACK_ID, name: "Pack", project: "", saved: { ...EMPTY_LIVE } }] };
}

/** The shelf with the live settings stored as the current pack. */
export const stash = (shelf: Shelf, live: Live): Shelf => ({
  ...shelf,
  list: shelf.list.map((p) => (p.id === shelf.current ? { ...p, saved: { ...live } } : p)),
});

/** Puts the current pack away and brings out another. Returns what to write to the live settings. */
export function switchTo(shelf: Shelf, live: Live, id: string): { shelf: Shelf; live: Live } | null {
  if (id === shelf.current) return null;
  const target = shelf.list.find((p) => p.id === id);
  if (!target) return null;
  return { shelf: { ...stash(shelf, live), current: id }, live: { ...target.saved } };
}

/** A new, empty pack for a project, made current. A template fills its spec. */
export function createPack(shelf: Shelf, live: Live, id: string, name: string, project: string, spec: AppSpec = EMPTY_SPEC): { shelf: Shelf; live: Live } {
  const fresh: Live = { ...EMPTY_LIVE, pack_plan: JSON.stringify({ ...EMPTY_PLAN, project: project || null, app: spec }) };
  const entry: PackEntry = { id, name: name.trim() || "Untitled pack", project, saved: fresh };
  return { shelf: { current: id, list: [...stash(shelf, live).list, entry] }, live: fresh };
}

export const renamePack = (shelf: Shelf, id: string, name: string): Shelf => ({
  ...shelf,
  list: shelf.list.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
});

/** Removes a pack. The last one can't go; removing the current one brings out a neighbour. */
export function deletePack(shelf: Shelf, id: string): { shelf: Shelf; live: Live | null } | null {
  if (shelf.list.length < 2 || !shelf.list.some((p) => p.id === id)) return null;
  const list = shelf.list.filter((p) => p.id !== id);
  if (id !== shelf.current) return { shelf: { ...shelf, list }, live: null };
  const next = list[0];
  return { shelf: { current: next.id, list }, live: { ...next.saved } };
}

/** A project's packs, the current one included wherever it belongs. */
export const packsFor = (shelf: Shelf, project: string) => shelf.list.filter((p) => p.project === project);

// ── Brief templates ─────────────────────────────────────────────────────────────────────────────

export interface BriefTemplate {
  id: string;
  name: string;
  /** Only the fields a template sets; everything else stays empty. */
  spec: Partial<AppSpec>;
  /** Built in, so it can't be removed. */
  builtIn?: boolean;
}

export const BUILT_IN_TEMPLATES: BriefTemplate[] = [
  {
    id: "tpl-new-app",
    name: "New app",
    builtIn: true,
    spec: {
      must: "The one thing it has to do\nSaves work without a Save button",
      done: "Someone new can do the main task without help",
      questions: "Which platform first?",
    },
  },
  {
    id: "tpl-feature",
    name: "Feature in an existing app",
    builtIn: true,
    spec: {
      constraints: "Match the existing code style\nNo new dependencies without asking",
      outOfScope: "Refactoring code the feature doesn't touch",
      done: "Existing tests still pass\nNew tests cover the feature",
    },
  },
  {
    id: "tpl-fix",
    name: "Bug fix",
    builtIn: true,
    spec: {
      problem: "What happens, what should happen, and how to make it happen",
      constraints: "The smallest change that fixes it",
      done: "A test reproduces the bug and now passes",
    },
  },
  {
    id: "tpl-research",
    name: "Research summary",
    builtIn: true,
    spec: {
      must: "Every claim cites its source\nGuesses are marked as guesses",
      outOfScope: "Writing code",
      done: "Answers the open questions, or says which can't be answered from the sources",
    },
  },
  {
    id: "tpl-website",
    name: "Website",
    builtIn: true,
    spec: {
      platform: "The web: phones first, then desktop",
      stack: "Plain HTML, CSS and a little JavaScript unless the brief needs more",
      screens: "Home: what it is and the one action to take\nDetails: the proof, with sources\nContact: how to reach you",
      must: "Works at phone width with no sideways scrolling\nUses the board's pictures, palette and type\nEvery claim on the page cites its source\nShows the 3D models picked in Handoff, if any, that people can turn",
      design: "Follow the boards: their palette, pictures and type set the look",
      constraints: "No tracking or third-party scripts without asking\nImages have alt text",
      done: "Loads fast on a phone\nPasses an accessibility check with no errors\nEvery link and button works",
    },
  },
  {
    id: "tpl-app",
    name: "App",
    builtIn: true,
    spec: {
      platform: "Say which: web, Windows, Mac, iOS or Android",
      screens: "Start: what someone sees first\nMain: where the work happens\nSettings: what they can change",
      entities: "Item: name, created, updated",
      must: "The one task it exists for, done end to end\nSaves work without a Save button\nKeyboard and screen-reader friendly",
      should: "Undo\nImport and export",
      questions: "Which platform first?\nDoes it need accounts, or is it local only?",
      done: "Someone new does the main task without help\nThe main flow has a test",
    },
  },
  {
    id: "tpl-program",
    name: "Program",
    builtIn: true,
    spec: {
      platform: "A command-line program or script, on Windows first",
      stack: "Say the language, or let the AI recommend one with reasons",
      must: "Reads its input and writes its output in plain files\nClear error messages that say how to fix the problem\nA --help that explains every option",
      constraints: "No network access unless asked\nNever deletes or overwrites a file without asking",
      done: "Runs on the example input and gives the expected output\nTests cover the main paths",
    },
  },
  {
    id: "tpl-own-version",
    name: "My own version of a tool",
    builtIn: true,
    spec: {
      baseRepo: "owner/repo",
      problem: "What the original does that doesn't suit you, and what yours should do instead",
      must: "Keep what already works\nThe changes listed in the brief",
      constraints: "Keep the original licence and credit its authors\nChange as little of the existing code as the brief allows\nMatch its code style",
      outOfScope: "Rewriting parts the brief doesn't touch",
      done: "Builds and runs as before\nThe original tests still pass, and new ones cover the changes",
    },
  },
];

export function parseTemplates(json: string): BriefTemplate[] {
  try {
    const v = JSON.parse(json) as BriefTemplate[];
    return Array.isArray(v) ? v.filter((t) => t && typeof t.id === "string" && t.spec && typeof t.spec === "object").map((t) => ({ id: t.id, name: String(t.name), spec: t.spec })) : [];
  } catch {
    return [];
  }
}

export const allTemplates = (savedJson: string) => [...BUILT_IN_TEMPLATES, ...parseTemplates(savedJson)];

/** A spec from a template: its fields, and nothing else. */
export const specFrom = (t: BriefTemplate): AppSpec => ({ ...EMPTY_SPEC, ...t.spec });

/** Saves a brief as a template, keeping only the fields that hold something. The app's name is left out. */
export function templateFrom(spec: AppSpec, id: string, name: string): BriefTemplate {
  const filled = Object.fromEntries(Object.entries(spec).filter(([k, v]) => k !== "name" && String(v).trim())) as Partial<AppSpec>;
  return { id, name: name.trim() || "My template", spec: filled };
}
