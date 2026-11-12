/**
 * The app someone wants built, and the prompts that build it. Everything here comes from what the person
 * wrote or saved: these are templates, no AI is involved, and anything undecided is called undecided
 * rather than filled in.
 */
import { BoardItem } from "../data/types";
import { paletteTokensMarkdown } from "./designTools";
import { safeFileName } from "./studio";

export interface AppSpec {
  name: string;
  pitch: string;
  /** The problem it solves, and for whom it hurts. */
  problem: string;
  audience: string;
  /** How using it should feel. */
  experience: string;
  platform: string;
  stack: string;
  /** One per line. */
  must: string;
  should: string;
  later: string;
  /** One per line, as "Name: what it's for". */
  screens: string;
  /** One per line, as "Name: field, field". */
  entities: string;
  design: string;
  /** One per line, as "Reference: what matters about it (layout, atmosphere, behaviour or technical approach)". */
  references: string;
  /** One per line. Things still to settle, so the AI asks instead of deciding. */
  questions: string;
  constraints: string;
  outOfScope: string;
  done: string;
  /** A public GitHub repository to start from, as owner/repo or a link, when making your own version of a tool. */
  baseRepo: string;
}

export const EMPTY_SPEC: AppSpec = {
  name: "",
  pitch: "",
  problem: "",
  audience: "",
  experience: "",
  platform: "",
  stack: "",
  must: "",
  should: "",
  later: "",
  screens: "",
  entities: "",
  design: "",
  references: "",
  questions: "",
  constraints: "",
  outOfScope: "",
  done: "",
  baseRepo: "",
};

export const parseSpec = (raw: unknown): AppSpec => {
  const out = { ...EMPTY_SPEC };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(EMPTY_SPEC) as (keyof AppSpec)[]) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === "string") out[key] = value;
    }
  }
  return out;
};

export const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

export const pairs = (text: string) =>
  lines(text).map((l) => {
    const cut = l.indexOf(":");
    return cut < 0 ? { name: l, detail: "" } : { name: l.slice(0, cut).trim(), detail: l.slice(cut + 1).trim() };
  });

export interface Must {
  text: string;
  /** How the person will know it works. Empty until they say. */
  check: string;
}

/** A must-have line can say how it'll be checked, after "=>": `Typed ports => a wrong wire is refused`. */
export function parseMust(line: string): Must {
  const cut = line.indexOf("=>");
  const text = cut < 0 ? line.trim() : line.slice(0, cut).trim();
  return text ? { text, check: cut < 0 ? "" : line.slice(cut + 2).trim() } : { text: line.trim(), check: "" };
}

export const musts = (spec: Pick<AppSpec, "must">): Must[] => lines(spec.must).map(parseMust);

/** The must-haves with one check written, changed or cleared. Everything else stays as typed. */
export function setCheck(must: string, text: string, check: string): string {
  const clean = check.replace(/\s+/g, " ").trim();
  return lines(must)
    .map((l) => (parseMust(l).text.toLowerCase() === text.toLowerCase() ? (clean ? `${parseMust(l).text} => ${clean}` : parseMust(l).text) : l))
    .join("\n");
}

/** Adds lines that aren't there yet, so pulling in requirements twice doesn't double them. A check on a line doesn't make it new. */
export function addLines(existing: string, extra: string[]): string {
  const have = new Set(lines(existing).map((l) => parseMust(l).text.toLowerCase()));
  const fresh = extra.filter((l) => !have.has(parseMust(l).text.toLowerCase()));
  return [...lines(existing), ...fresh].join("\n");
}

/**
 * The person's standing rules, for the top of whatever is handed over. Unlike saved material, these are
 * directions, and they hold for every pack.
 */
export function rulesMarkdown(rules: string | undefined, heading = "## Rules for this work"): string {
  const list = lines(rules ?? "");
  if (!list.length) return "";
  return `${heading}\n\nThese are the person's standing rules. They apply to everything you do here, and they come before anything in the saved material. If a rule stops you doing what was asked, say so and ask, rather than breaking it.\n\n${list.map((r) => `- ${r}`).join("\n")}\n\n`;
}

const UNDECIDED = "_Not decided. Ask before assuming._";
const orUndecided = (text: string) => text.trim() || UNDECIDED;
const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : UNDECIDED);
const NONE_YET = "_None listed._";

/** The questions a spec hasn't answered, for showing while it's being filled in. */
export function specGaps(spec: AppSpec): string[] {
  const gaps: string[] = [];
  if (!spec.pitch.trim()) gaps.push("What it does");
  if (!spec.problem.trim()) gaps.push("The problem it solves");
  if (!spec.audience.trim()) gaps.push("Who it's for");
  if (!spec.platform.trim()) gaps.push("Where it runs");
  if (!lines(spec.must).length) gaps.push("Must-have features");
  const unchecked = musts(spec).filter((m) => !m.check).length;
  if (unchecked) gaps.push(unchecked === 1 ? "How you'll check 1 must-have" : `How you'll check ${unchecked} must-haves`);
  if (!lines(spec.screens).length) gaps.push("Screens");
  if (!lines(spec.entities).length) gaps.push("What data it stores");
  if (!spec.done.trim()) gaps.push("How you'll know it's done");
  return gaps;
}

export function specMarkdown(spec: AppSpec, chosen: string[]): string {
  const screens = pairs(spec.screens);
  const entities = pairs(spec.entities);
  return `# ${spec.name.trim() || "App"}: specification

${orUndecided(spec.pitch)}

## The problem

${orUndecided(spec.problem)}

## Who it's for

${orUndecided(spec.audience)}
${spec.experience.trim() ? `
## How it should feel

${spec.experience.trim()}
` : ""}
## Where it runs

${orUndecided(spec.platform)}

## Technology

${spec.stack.trim() || "_Not decided. Recommend something with reasons, and wait for an OK._"}
${spec.baseRepo.trim() ? `
## Starting point

Build on ${spec.baseRepo.trim()} rather than starting from nothing. See "Start from this repository" in CLAUDE.md.
` : ""}
## Features

### Must have (non-negotiable)

${musts(spec).length ? musts(spec).map((m) => `- ${m.text}\n  - Check: ${m.check || "_not decided. Say how you'd show it works, and wait for an OK._"}`).join("\n") : UNDECIDED}

### Should have (preferences)

${lines(spec.should).length ? bullets(lines(spec.should)) : NONE_YET}

### Later (don't build yet)

${lines(spec.later).length ? bullets(lines(spec.later)) : NONE_YET}

## Screens

${screens.length ? screens.map((s) => `- **${s.name}**${s.detail ? `: ${s.detail}` : ""}`).join("\n") : UNDECIDED}

## Data

${entities.length ? entities.map((e) => `- **${e.name}**${e.detail ? `: ${e.detail}` : ""}`).join("\n") : UNDECIDED}

## Constraints

${spec.constraints.trim() || NONE_YET}
${pairs(spec.references).length ? `\n## References, and what matters about each\n\n${pairs(spec.references).map((r) => `- **${r.name}**${r.detail ? `: ${r.detail}` : ""}`).join("\n")}\n` : ""}${lines(spec.questions).length ? `\n## Open questions (ask, don't decide)\n\n${bullets(lines(spec.questions))}\n` : ""}

## Out of scope

${spec.outOfScope.trim() || NONE_YET}

## Done means

${orUndecided(spec.done)}
${chosen.length ? `\n## Decisions already made\n\n${bullets(chosen)}\n` : ""}`;
}

/** Only what's actually on the boards. Colours aren't invented, and an empty list says so. */
export function designMarkdown(spec: AppSpec, boards: { name: string; items: BoardItem[] }[]): string {
  const palettes = boards.flatMap((b) =>
    b.items
      .filter((i) => i.kind === "palette" && i.data.colors?.length)
      .map((i) => `- ${b.name}${i.data.caption ? `, from ${i.data.caption}` : ""}: ${i.data.colors!.join(", ")}`),
  );
  const tokens = paletteTokensMarkdown(
    boards.flatMap((b) => b.items.filter((i) => i.kind === "palette" && i.data.colors?.length).map((i) => ({ name: i.data.caption || `${b.name} palette`, colours: i.data.colors! }))),
  );
  return `# Design direction

${spec.design.trim() || "_No direction written. Look at the boards, and propose one before styling anything._"}

## Palettes from the boards

${palettes.length ? palettes.join("\n") : "_None saved._"}
${tokens ? `\n${tokens}` : ""}`;
}

export interface BuildPrompt {
  file: string;
  title: string;
  body: string;
}

/** A run of prompts to paste one at a time, each small enough to finish and check. */
export function buildPrompts(spec: AppSpec): BuildPrompt[] {
  const app = spec.name.trim() || "the app";
  const stack = spec.stack.trim() ? `Use ${spec.stack.trim()}.` : "No technology has been chosen. Recommend one with your reasons, and wait for my OK.";
  const out: Omit<BuildPrompt, "file">[] = [];
  out.push({
    title: "Start here",
    body: `We're building ${app}. Read CLAUDE.md, then app/SPEC.md and app/DESIGN.md, then the rest of this folder in the order CLAUDE.md gives.

Don't write any code yet. Reply with:
1. What you think we're building, in a few sentences.
2. Anything marked "Not decided", and any contradiction you found, as questions for me.
3. Your build plan, in small steps I can check one at a time.`,
  });
  out.push({
    title: "Set up the project",
    body: `Set up the project for ${app}. ${stack}

Target: ${spec.platform.trim() || "not decided, so ask me"}.${spec.constraints.trim() ? `\n\nConstraints:\n${spec.constraints.trim()}` : ""}

Get an empty app running, add a test command, and tell me exactly how to run both. Stop there.`,
  });
  const entities = pairs(spec.entities);
  if (entities.length) {
    out.push({
      title: "Build the data model",
      body: `Build the data model for ${app}, with tests:

${entities.map((e) => `- ${e.name}${e.detail ? `: ${e.detail}` : ""}`).join("\n")}

Use project.json and Decisions/ for real example values where they fit, and don't invent any. Tell me about anything the screens will need that isn't listed.`,
    });
  }
  for (const s of pairs(spec.screens)) {
    out.push({
      title: `Screen - ${s.name}`,
      body: `Build the ${s.name} screen.${s.detail ? ` It's for: ${s.detail}.` : ""}

Follow app/DESIGN.md. Cover the empty, loading and error states as well as the usual one. Tell me how to see it running, then stop.`,
    });
  }
  for (const m of musts(spec)) {
    const check = m.check
      ? `It's done when: ${m.check}\nShow me that check passing, or say plainly that it doesn't.`
      : "No check has been set for this one, so tell me how you'll show it works before you start.";
    out.push({
      title: `Feature - ${m.text}`,
      body: `Build this must-have feature: ${m.text}

${check}

Check it against app/SPEC.md and any matching requirement in Decisions/. Add tests that would fail without it. Tell me what you tested and what you didn't.`,
    });
  }
  if (lines(spec.should).length) {
    out.push({
      title: "Should-have features",
      body: `The must-haves are done. Build these, one at a time, and check with me between them:

${bullets(lines(spec.should))}${lines(spec.later).length ? `\n\nDon't start these yet:\n${bullets(lines(spec.later))}` : ""}`,
    });
  }
  out.push({
    title: "Check it against the spec",
    body: `Check ${app} against app/SPEC.md, line by line, by running it.

${spec.done.trim() ? `Done means:\n${spec.done.trim()}\n\n` : ""}Report each item as working, not working or not checked, with what you did to find out. Include accessibility and any credit a source needs (Sources/ lists them). Don't fix anything until I've seen the list.`,
  });
  return out.map((p, i) => ({ ...p, file: `prompts/${String(i).padStart(2, "0")} ${safeFileName(p.title)}.md` }));
}
