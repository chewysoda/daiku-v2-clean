/**
 * Starting points for a new board or project. Each template is a set of labelled sections in the
 * order the work usually goes, and each section holds a few short questions as sticky notes: the
 * basic structural questions for that kind of project. No sample answers, only questions to answer.
 * A project made from one also gets a Handoff pack started from the matching brief template.
 *
 * Sections are laid out on a grid here rather than placed by hand, so they never overlap and each
 * one is as tall as its questions need.
 */
import { BoardItem, now, uid } from "../data/types";
import type { IconName } from "../design/Icon";

export interface StartSectionSpec {
  title: string;
  /** Width in grid columns (1 to 4). */
  span: number;
  /** Questions, one sticky each. */
  questions: string[];
}

export interface StartTemplate {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  /** Rows of sections, top to bottom, in the order the work usually goes. */
  rows: StartSectionSpec[][];
  /** The brief template (lib/packs) a new project's pack starts from. */
  briefTemplate?: string;
}

/** A laid-out section, in board units. */
export interface StartSection {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  notes: { text: string; x: number; y: number; w: number; h: number }[];
}

const COL = 300;
const GAP = 40;
const PAD = 24;
const HEAD = 56;
const NOTE_W = 210;
const NOTE_H = 128;
const NOTE_GAP = 16;

const S = (title: string, span: number, ...questions: string[]): StartSectionSpec => ({ title, span, questions });

export const START_TEMPLATES: StartTemplate[] = [
  { id: "blank", name: "Blank", blurb: "An empty board. Add sections as you go.", icon: "board", rows: [] },
  {
    id: "website",
    name: "Website",
    blurb: "Goal, look, pages, words, media, the technical side and a launch check.",
    icon: "explore",
    briefTemplate: "tpl-website",
    rows: [
      [
        S("Goal and audience", 2, "Who is the site for?", "What should a visitor do before they leave?", "How will you know it worked?"),
        S("Inspiration", 2, "Paste three sites you like. What exactly do you like about each?", "Any sites it must not look like?"),
      ],
      [
        S("Look: colour, type, imagery", 2, "Which colours? Drop a picture to pull its palette.", "Which fonts, or what feel: classic, technical, playful?", "What logo, photos or illustrations do you already have?"),
        S("Pages", 2, "Home: the one message, in a sentence.", "Which other pages? One note each, with its purpose.", "What goes in the menu, and in what order?"),
      ],
      [
        S("Words", 2, "The headline, in under ten words.", "Three proof points, each with a source.", "What does the main button say?"),
        S("Media and 3D", 1, "Which photos do you have, and which are missing?", "Any 3D models to show? Pick them for the site in Handoff."),
        S("Technical", 1, "Domain and hosting?", "Forms, shop, blog or editable content?", "Analytics, or none?"),
      ],
      [S("Launch check", 4, "Works at phone width?", "Passes an accessibility check?", "A title and description for every page?", "Every link and form tested?")],
    ],
  },
  {
    id: "app",
    name: "App",
    blurb: "Problem, users, the main flow, screens, data, features by priority, risks.",
    icon: "canvas",
    briefTemplate: "tpl-app",
    rows: [
      [
        S("Problem", 2, "What's hard or slow today?", "What do people use instead right now?", "Why now?"),
        S("Users", 2, "Who uses it? Describe one real person.", "What are they trying to get done?", "Where and on what device do they use it?"),
      ],
      [S("Main flow", 4, "1. Where does someone start?", "2. What's the first thing they do?", "3. What happens next?", "4. How do they know they're done?")],
      [
        S("Screens", 2, "Which screens? One note each, with what it's for.", "Sketch the main one, or drop screenshots of apps that do it well."),
        S("Data", 2, "What does it store? One note per thing, with its fields.", "What's private, and who can see what?", "Does it work offline?"),
      ],
      [
        S("Must have", 1, "Without this, it's pointless:"),
        S("Should have", 1, "Expected, but it could ship without:"),
        S("Later", 1, "Nice ideas for after launch:"),
        S("Platform and tech", 1, "Web, Windows, Mac, iOS or Android first?", "Accounts, or local only?"),
      ],
      [
        S("Risks and questions", 2, "What could make this fail?", "What still needs deciding? Weigh big choices in Decide."),
        S("Done when", 2, "What must someone new manage without help?", "What will you measure after launch?"),
      ],
    ],
  },
  {
    id: "program",
    name: "Program",
    blurb: "Purpose, inputs and outputs, the steps, rules, the interface, code and tests.",
    icon: "text",
    briefTemplate: "tpl-program",
    rows: [
      [
        S("Purpose", 2, "What job does it do, in one sentence?", "Who runs it, and how often?"),
        S("Environment", 2, "Which OS and language?", "What must already be installed?", "Does it need network access?"),
      ],
      [
        S("Inputs", 2, "What does it read: files, options, data from elsewhere?", "Drop an example of each input."),
        S("Outputs", 2, "What does it write, and where?", "Drop an example of the correct result."),
      ],
      [S("Steps", 4, "1. Read and check the input.", "2. What's the main work it does?", "3. What does it write?", "4. What does it report when finished?")],
      [
        S("Rules and edge cases", 2, "What must it never do?", "Empty, huge or broken input: what then?", "What happens halfway through a failure?"),
        S("Interface", 2, "Command name and options. Is a --help needed?", "What does an error message say, and how does it say to fix it?"),
      ],
      [
        S("Code to reuse", 2, "Snippets or files to copy the pattern from. Add them in Handoff's Code card."),
        S("Tests", 2, "Which example proves it works?", "Which edge cases need a test?"),
      ],
    ],
  },
  {
    id: "own-version",
    name: "My own version of a tool",
    blurb: "The original, what to keep, change, add and remove, the code map and licence.",
    icon: "link",
    briefTemplate: "tpl-own-version",
    rows: [
      [
        S("The original", 2, "Which repository? Set it in Handoff's Code card.", "What does it do well?", "Screenshots of it as it is."),
        S("Why your own version", 2, "What doesn't suit you about it?", "Who else would use yours?"),
      ],
      [
        S("Keep", 1, "What already works and must stay?"),
        S("Change", 1, "What should behave differently?"),
        S("Add", 1, "What's missing?"),
        S("Remove", 1, "What do you never use?"),
      ],
      [
        S("Code map", 2, "Which files or folders hold what you'll change?", "How do you build and run it?"),
        S("Licence and credit", 2, "What licence does it have? Can you change and share it?", "How will you credit the original authors?"),
      ],
      [S("Done when", 4, "It builds and runs as before.", "The original tests still pass.", "Each change has a test or a way to see it working.")],
    ],
  },
  {
    id: "moodboard",
    name: "Moodboard",
    blurb: "Mood words, pictures, materials, colour, type and what to avoid.",
    icon: "image",
    rows: [
      [
        S("Mood", 1, "Three words for how it should feel.", "Who is it for?"),
        S("Pictures", 3, "Drop pictures that feel right. Say what you like in each.", "Which one is closest to the final look?"),
      ],
      [
        S("Materials and texture", 2, "Which materials and finishes?", "Smooth or rough, warm or cool?", "Anything it can't be, for cost, weight or care?"),
        S("Colour", 1, "Drop a picture to pull its palette.", "One accent colour, or many?"),
        S("Type", 1, "Which fonts, or what feel?", "Serif, sans or hand-drawn?"),
      ],
      [S("Avoid", 4, "What should it never look like? Drop examples.", "Which clichés of this kind of thing should it steer clear of?")],
    ],
  },
];

export const startTemplate = (id: string) => START_TEMPLATES.find((t) => t.id === id) ?? START_TEMPLATES[0];

/** How many questions a template asks, for the dialog. */
export const questionCount = (t: StartTemplate) => t.rows.flat().reduce((n, s) => n + s.questions.length, 0);
export const sectionCount = (t: StartTemplate) => t.rows.flat().length;

/** Places a template's sections and notes on the board grid. */
export function layoutTemplate(template: StartTemplate): StartSection[] {
  const out: StartSection[] = [];
  let y = 40;
  for (const row of template.rows) {
    let x = 40;
    const placed = row.map((spec) => {
      const span = Math.max(1, Math.min(4, spec.span));
      const w = span * COL + (span - 1) * GAP;
      const perRow = Math.max(1, Math.floor((w - 2 * PAD + NOTE_GAP) / (NOTE_W + NOTE_GAP)));
      const lines = Math.max(1, Math.ceil(spec.questions.length / perRow));
      // Room under the questions for answers: at least one empty note's height.
      const h = HEAD + lines * (NOTE_H + NOTE_GAP) + NOTE_H + PAD;
      const notes = spec.questions.map((text, i) => ({
        text,
        x: x + PAD + (i % perRow) * (NOTE_W + NOTE_GAP),
        y: y + HEAD + Math.floor(i / perRow) * (NOTE_H + NOTE_GAP),
        w: NOTE_W,
        h: NOTE_H,
      }));
      const section = { title: spec.title, x, y, w, h, notes };
      x += w + GAP;
      return section;
    });
    const tallest = Math.max(...placed.map((s) => s.h));
    // A row's sections share one height, so the grid reads as rows.
    for (const s of placed) out.push({ ...s, h: tallest });
    y += tallest + GAP;
  }
  return out;
}

/** The board items a template lays down: each section, with its questions as stickies inside it. */
export function startItems(template: StartTemplate, boardId: string): BoardItem[] {
  const at = now();
  const items: BoardItem[] = [];
  const sections = layoutTemplate(template);
  sections.forEach((s, i) => {
    items.push({ id: uid(), board_id: boardId, kind: "section", x: s.x, y: s.y, w: s.w, h: s.h, rotation: 0, z: i + 1, asset_id: null, data: { text: s.title }, updated_at: at });
  });
  let z = 100;
  for (const s of sections) {
    for (const n of s.notes) {
      items.push({ id: uid(), board_id: boardId, kind: "sticky", x: n.x, y: n.y, w: n.w, h: n.h, rotation: 0, z: z++, asset_id: null, data: { text: n.text }, updated_at: at });
    }
  }
  return items;
}
