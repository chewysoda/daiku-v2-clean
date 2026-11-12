import { Asset, Board, BoardItem, Claim, Concept, Criterion, Decision, EvidenceLink, ItemData, ItemKind, PaletteColor, RecordDataMap, RecordRow, RecordType, Score } from "./types";
import { hexToLab } from "../lib/color";

/**
 * The worked example: a mood board for an AI agent's look and feel, from first pictures to a written
 * direction. Everything is is_sample. The art is drawn for this example, and the quotes and scores are
 * made up to show how the app works, so they say so. None of it is presented as a real finding.
 */
const T0 = Date.parse("2026-11-02T08:00:00Z");
const at = (minutesAgo: number) => new Date(T0 - minutesAgo * 60000).toISOString();
const pal = (...entries: [string, number][]): PaletteColor[] => entries.map(([hex, weight]) => ({ ...hexToLab(hex)!, weight, hex }));

export const AGENT_BOARD = "b-agents";
export const AGENT_DECISION = "d-agents";
export const AGENT_DRAFT = "dr-agents";
export const AGENT_NOTE = "note-agents";

const ART = "Daiku sample art";

const image = (id: string, title: string, preview: string, tags: string, palette_lab: PaletteColor[]): Asset => ({
  id,
  kind: "image",
  title,
  file_path: null,
  preview,
  source_url: null,
  credit: ART,
  via: null,
  captured_at: at(600),
  provenance: "human",
  palette_lab,
  width: 800,
  height: 800,
  tags,
  notes: "",
  is_sample: true,
});

const quote = (id: string, title: string, notes: string): Asset => ({
  ...image(id, title, "", "agent snip quote sample", []),
  kind: "quote",
  preview: null,
  width: null,
  height: null,
  credit: null,
  notes,
  provenance: "unknown",
});

const assets: Asset[] = [
  image("ag-orbit", "Orbit: an agent at rest", "agent-orbit", "agent calm orbit presence indigo", pal(["#1F2433", 0.6], ["#8FA3E8", 0.3], ["#E9ECF8", 0.1])),
  image("ag-steps", "Steps: showing its work", "agent-steps", "agent steps progress trust legible", pal(["#F3F1EA", 0.7], ["#2F6B5B", 0.2], ["#D9D4C5", 0.1])),
  image("ag-grid", "Signal grid", "agent-grid", "agent grid system pattern data", pal(["#10201C", 0.7], ["#58C7A4", 0.2], ["#274139", 0.1])),
  image("ag-hand", "Handing over", "agent-hand", "agent human control handover warm", pal(["#F6E7D8", 0.6], ["#D9774F", 0.3], ["#3B2A22", 0.1])),
  image("ag-type", "Type: plain and exact", "agent-type", "agent type mono legible", pal(["#FAF9F5", 0.8], ["#23252B", 0.2])),
  image("ag-wave", "Thinking, quietly", "agent-wave", "agent motion waveform thinking", pal(["#E7ECF7", 0.6], ["#5B74D6", 0.3], ["#AFBCEB", 0.1])),
  quote("ag-q1", "[Sample] Show the steps", "[Sample quote, written for this example] I don't need it to sound clever. I need to see what it's doing and stop it when it goes wrong."),
  quote("ag-q2", "[Sample] Not a mascot", "[Sample quote, written for this example] The cute faces make me trust it less when the work matters."),
];

const boards: Board[] = [
  {
    id: AGENT_BOARD,
    name: "Agents mood board",
    version: 1,
    share: { headline: "An agent you can watch working", tagline: "Calm, legible, and easy to stop.", summary: "A worked example: the look and feel of an AI agent, from first pictures to a written direction." },
    created_at: at(4000),
    updated_at: at(200),
    is_sample: true,
  },
];

let z = 100;
const item = (id: string, kind: ItemKind, x: number, y: number, w: number, h: number, asset_id: string | null = null, data: ItemData = {}): BoardItem => ({
  id,
  board_id: AGENT_BOARD,
  kind,
  x,
  y,
  w,
  h,
  rotation: 0,
  z: z++,
  asset_id,
  data,
  updated_at: at(200),
});

const board_items: BoardItem[] = [
  item("agi-s1", "section", 40, 40, 700, 520, null, { text: "Presence: how it feels when idle" }),
  item("agi-s2", "section", 780, 40, 700, 520, null, { text: "Trust: how it shows its work" }),
  item("agi-s3", "section", 40, 600, 1440, 340, null, { text: "Language: colour, type, motion" }),
  item("agi-1", "image", 70, 100, 300, 300, "ag-orbit"),
  item("agi-2", "image", 400, 100, 300, 300, "ag-wave"),
  item("agi-n1", "sticky", 70, 420, 300, 110, null, { text: "It should feel present, not performing. No face, no mascot." }),
  item("agi-3", "image", 810, 100, 300, 300, "ag-steps"),
  item("agi-4", "image", 1140, 100, 300, 300, "ag-hand"),
  item("agi-n2", "sticky", 810, 420, 300, 110, null, { text: "Every step visible. Stopping it is always one click away." }),
  item("agi-c1", "connector", 0, 0, 0, 0, null, { from: "agi-n1", to: "agi-n2", connector: "supports" }),
  item("agi-5", "image", 70, 660, 250, 250, "ag-grid"),
  item("agi-6", "image", 350, 660, 250, 250, "ag-type"),
  item("agi-p", "palette", 630, 680, 360, 110, null, { colors: ["#1F2433", "#5B74D6", "#E7ECF7", "#2F6B5B", "#D9774F"], caption: "the sample art" }),
  item("agi-t", "text", 630, 810, 800, 90, null, { text: "Indigo for thinking, green for done, and clay only where a person needs to step in." }),
];

const claims: Claim[] = [
  { id: "agc-1", board_id: AGENT_BOARD, text: "People trust an agent more when they can see its steps", created_at: at(500), is_sample: true },
  { id: "agc-2", board_id: AGENT_BOARD, text: "A mascot makes an agent feel less serious", created_at: at(490), is_sample: true },
  { id: "agc-3", board_id: AGENT_BOARD, text: "A stop button matters more than a faster answer", created_at: at(480), is_sample: true },
];

// The quotes are sample text, so these show how evidence looks without claiming to prove anything.
const evidence_links: EvidenceLink[] = [
  { id: "age-1", asset_id: "ag-q1", target_type: "claim", target_id: "agc-1", note: "[Sample] One made-up interview, to show how evidence looks", stance: "for", created_at: at(470), is_sample: true },
  { id: "age-2", asset_id: "ag-q2", target_type: "claim", target_id: "agc-2", note: "[Sample] One made-up interview, to show how evidence looks", stance: "for", created_at: at(460), is_sample: true },
];

const decisions: Decision[] = [{ id: AGENT_DECISION, board_id: AGENT_BOARD, title: "Which character should the agent have?", created_at: at(450), is_sample: true }];

const concepts: Concept[] = [
  { id: "agk-a", decision_id: AGENT_DECISION, label: "A", name: "Quiet operator", asset_id: "ag-steps", flag: "", sort: 0 },
  { id: "agk-b", decision_id: AGENT_DECISION, label: "B", name: "Calm presence", asset_id: "ag-orbit", flag: "", sort: 1 },
  { id: "agk-c", decision_id: AGENT_DECISION, label: "C", name: "Friendly guide", asset_id: "ag-hand", flag: "", sort: 2 },
];

const criteria: Criterion[] = [
  { id: "agq-1", decision_id: AGENT_DECISION, name: "Trust", weight: 0.4, sort: 0 },
  { id: "agq-2", decision_id: AGENT_DECISION, name: "Legibility", weight: 0.35, sort: 1 },
  { id: "agq-3", decision_id: AGENT_DECISION, name: "Warmth", weight: 0.25, sort: 2 },
];

const VALUES: [string, number[]][] = [
  ["agk-a", [5, 5, 2]],
  ["agk-b", [4, 3, 3]],
  ["agk-c", [2, 3, 5]],
];

// All guesses until someone tests them, and shown as guesses.
const scores: Score[] = VALUES.flatMap(([concept_id, values]) => values.map((value, i) => ({ id: `ags-${concept_id}-${i}`, concept_id, criterion_id: `agq-${i + 1}`, value, is_assumption: true })));

const rec = <T extends RecordType>(id: string, type: T, parent_id: string | null, data: RecordDataMap[T]): RecordRow => ({ id, type, parent_id, data, created_at: at(400), updated_at: at(200), is_sample: true }) as RecordRow;

const records: RecordRow[] = [
  rec(AGENT_NOTE, "note", null, {
    title: "Agent research file",
    body: `## The question

What should an AI agent look and feel like, when people need to trust it with real work?

## What to find out

- supports:: [[People trust an agent more when they can see its steps]]
- supports:: [[A stop button matters more than a faster answer]]
- [[A mascot makes an agent feel less serious]], which still needs testing

## Sources to look for

Studies on trust in automation, and how people use tools that act for them. Nothing here is sourced yet: this example shows where the sources go.

## A way to score it

Trust is weighted highest:

$$score = 0.4 \\cdot trust + 0.35 \\cdot legibility + 0.25 \\cdot warmth$$`,
  }),
  rec(AGENT_DRAFT, "draft", null, {
    title: "Agents: design direction",
    body: `# An agent you can watch working

This is a sample draft, showing how research turns into writing. Its quotes are made up for the example.

The direction is **calm, legible and easy to stop**. The agent has no face or mascot. It shows each step as it works, and a person can step in at any point.

> [Sample quote, written for this example] I don't need it to sound clever. I need to see what it's doing and stop it when it goes wrong.
>
> — [no source yet], [Sample] Show the steps

![[Steps: showing its work]]

*Figure: Daiku sample art, Steps: showing its work*

## Still open

The character scores in the Lab are guesses until they've been tested with people.`,
  }),
  rec("pr-agents", "project", null, { name: "Agents mood board", working: true, board_ids: [AGENT_BOARD], decision_ids: [AGENT_DECISION], asset_ids: ["ag-q1", "ag-q2"], record_ids: [AGENT_NOTE, AGENT_DRAFT] }),
];

export const SEED_V3 = { assets, boards, board_items, claims, evidence_links, decisions, concepts, criteria, scores, records };

/** The earlier samples as a project too, so the Library can show projects from the start. */
export const CHAIR_PROJECT = rec("pr-chair", "project", null, {
  name: "Furniture study",
  working: true,
  board_ids: ["b-furniture", "b-material", "b-gripper", "b-brand"],
  decision_ids: ["d-chair"],
  asset_ids: [],
  record_ids: ["note-1"],
});
