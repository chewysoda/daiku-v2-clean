import { Asset, Board, BoardItem, Claim, Concept, Criterion, Decision, EvidenceLink, ItemData, ItemKind, RecordDataMap, RecordRow, RecordType, Score } from "./types";

/**
 * The first-launch sample: planning an ESP32 node programmer, from sources to a brief Claude can build from.
 * Every quote is copied word for word from the page it credits (read on 10 Nov 2026), and every row is
 * is_sample. The decision's scores are illustrative: two are backed by a source, the rest are guesses and
 * look like guesses. There are no pictures: the docs state no licence for bundling theirs.
 */
const T0 = Date.parse("2026-11-10T09:00:00Z");
const at = (minutesAgo: number) => new Date(T0 - minutesAgo * 60000).toISOString();

export const ESP_BOARD = "b-esp32";
export const ESP_DECISION = "d-esp32";
export const ESP_PROJECT = "pr-esp32";
export const ESP_NOTE = "note-esp32";

const ESPRESSIF = "Espressif Systems (Shanghai) Co., Ltd. © 2016–2026. Docs text licence not stated; quoted with credit";
const READ = "2026-11-10T08:00:00Z";

const link = (id: string, title: string, url: string, credit: string, notes: string, tags: string): Asset => ({
  id,
  kind: "link",
  title,
  file_path: null,
  preview: null,
  source_url: url,
  credit,
  via: new URL(url).hostname,
  captured_at: READ,
  provenance: "human",
  palette_lab: [],
  width: null,
  height: null,
  tags: `esp32 sample ${tags}`,
  notes,
  is_sample: true,
});

/** A passage, exactly as it appears on the page it credits. */
const quote = (id: string, title: string, text: string, from: Asset): Asset => ({ ...link(id, title, from.source_url!, from.credit!, text, "quote"), kind: "quote" });

const gpio = link(
  "esp-src-gpio",
  "ESP-IDF Programming Guide: GPIO & RTC GPIO (ESP32)",
  "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html",
  ESPRESSIF,
  "ESP-IDF v6.1. Pin rules for the ESP32: input-only pins, strapping pins, flash pins, ADC2 with Wi-Fi.",
  "gpio pins datasheet",
);
const adc = link(
  "esp-src-adc",
  "ESP-IDF Programming Guide: ADC Oneshot Mode Driver (ESP32)",
  "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/adc/adc_oneshot.html",
  ESPRESSIF,
  "ESP-IDF v6.1. The full ADC driver page. Long; the one line that matters is in the ADC2 claim.",
  "adc wifi",
);
const arduino = link(
  "esp-src-arduino",
  "Arduino core for the ESP32",
  "https://github.com/espressif/arduino-esp32",
  "Espressif Systems; LGPL-2.1 licence",
  "Arduino core for the ESP32 family of SoCs. Docs: https://docs.espressif.com/projects/arduino-esp32/en/latest/getting_started.html",
  "arduino code target",
);
const reactflow = link(
  "esp-src-reactflow",
  "React Flow: custom nodes and connection validation",
  "https://reactflow.dev/examples/interaction/validation",
  "xyflow team, webkid GmbH; MIT licence",
  "The node editor library. Custom nodes: https://reactflow.dev/learn/customization/custom-nodes",
  "react node editor",
);
const cli = link(
  "esp-src-cli",
  "Arduino CLI: Getting started",
  "https://arduino.github.io/arduino-cli/1.5/getting-started/",
  "Arduino SA; GPL-3.0 licence",
  "Compiling and uploading from the command line. The examples use an MKR1000; an ESP32 uses the esp32:esp32:esp32 board name.",
  "compile upload cli",
);

const quotes: Asset[] = [
  quote("esp-q-input", "GPIO34-39 are input only", "GPI: GPIO34-39 can only be set as input mode and do not have software-enabled pullup or pulldown functions.", gpio),
  quote("esp-q-adc2", "ADC2 and Wi-Fi", "ADC2 pins cannot be used when Wi-Fi is used.", gpio),
  quote("esp-q-strap", "Strapping pins", "Strapping pin: GPIO0, GPIO2, GPIO5, GPIO12 (MTDI), and GPIO15 (MTDO) are strapping pins.", gpio),
  quote("esp-q-flash", "Flash pins", "SPI0/1: GPIO6-11 and GPIO16-17 are usually connected to the SPI flash and PSRAM integrated on the module", gpio),
  quote("esp-q-valid", "Validating connections", "You can pass a validation function isValidConnection to the ReactFlow component", reactflow),
  quote("esp-q-compile", "Compiling a sketch", "To compile the sketch you run the `compile` command, passing the proper FQBN string:", cli),
];

const assets: Asset[] = [gpio, adc, arduino, reactflow, cli, ...quotes];

const boards: Board[] = [
  {
    id: ESP_BOARD,
    name: "ESP32 Node Programmer",
    version: 1,
    share: { headline: "Wire blocks, get firmware", tagline: "A visual editor for the ESP32.", summary: "A sample project: research for a node editor that turns a graph into an Arduino sketch." },
    created_at: at(3000),
    // The newest board, so a fresh install opens on it.
    updated_at: new Date(T0).toISOString(),
    is_sample: true,
  },
];

let z = 300;
const item = (id: string, kind: ItemKind, x: number, y: number, w: number, h: number, asset_id: string | null = null, data: ItemData = {}): BoardItem => ({
  id,
  board_id: ESP_BOARD,
  kind,
  x,
  y,
  w,
  h,
  rotation: 0,
  z: z++,
  asset_id,
  data,
  updated_at: at(60),
});

/** The first layout, kept so an unchanged board can be moved to the current one (see the store). */
export const ESP_V1_ITEM_IDS = ["espi-s1", "espi-s2", "espi-s3", "espi-s4", "espi-s5", "espi-1", "espi-2", "espi-q1", "espi-q2", "espi-q3", "espi-q4", "espi-n1", "espi-3", "espi-q5", "espi-n2", "espi-n3", "espi-4", "espi-q6", "espi-5", "espi-n4", "espi-t1", "espi-n5", "espi-n6", "espi-n7", "espi-c1", "espi-c2"];
export const ESP_ITEMS_AT = at(60);

const board_items: BoardItem[] = [
  item("espi-s1", "section", 40, 40, 760, 900, null, { text: "Hardware" }),
  item("espi-s2", "section", 840, 40, 660, 560, null, { text: "Editor" }),
  item("espi-s3", "section", 40, 980, 760, 400, null, { text: "Code generation" }),
  item("espi-s4", "section", 840, 640, 660, 420, null, { text: "Decisions" }),
  item("espi-s5", "section", 1540, 40, 420, 640, null, { text: "Brief" }),
  // Hardware: the guide, then its lines, then the claims they back.
  item("espi-1", "image", 70, 100, 330, 110, "esp-src-gpio"),
  item("espi-2", "image", 430, 100, 330, 110, "esp-src-adc"),
  item("espi-q1", "image", 70, 240, 330, 150, "esp-q-input"),
  item("espi-q2", "image", 430, 240, 330, 150, "esp-q-adc2"),
  item("espi-cl1", "sticky", 70, 420, 330, 150, null, { claim: "esp-c1", text: "GPIO 34–39 are input only" }),
  item("espi-cl2", "sticky", 430, 420, 330, 150, null, { claim: "esp-c2", text: "ADC2 pins can't be used while Wi-Fi is on" }),
  item("espi-q3", "image", 70, 600, 330, 150, "esp-q-strap"),
  item("espi-q4", "image", 430, 600, 330, 150, "esp-q-flash"),
  item("espi-n1", "sticky", 70, 780, 690, 110, null, { text: "Every pin rule gets a test, and cites the line it comes from." }),
  // Editor
  item("espi-3", "image", 870, 100, 330, 110, "esp-src-reactflow"),
  item("espi-q5", "image", 870, 240, 330, 150, "esp-q-valid"),
  item("espi-n2", "sticky", 1230, 240, 240, 150, null, { text: "Wrong wires are refused with a reason, never silently." }),
  item("espi-n3", "sticky", 870, 420, 600, 110, null, { text: "Ports are typed: event, digital, analog, number. Colour plus shape, never colour alone." }),
  // Decisions
  item("espi-t1", "text", 870, 700, 600, 80, null, { text: "Which code target first? Arduino leads, but two of its scores are guesses." }),
  item("espi-cl3", "sticky", 870, 820, 330, 160, null, { claim: "esp-c3", text: "Beginners will prefer Arduino-style code over ESP-IDF" }),
  item("espi-n8", "sticky", 1230, 820, 240, 160, null, { text: "Test this with five makers before it decides anything." }),
  // Code generation
  item("espi-4", "image", 70, 1040, 330, 110, "esp-src-cli"),
  item("espi-5", "image", 430, 1040, 330, 110, "esp-src-arduino"),
  item("espi-q6", "image", 70, 1180, 330, 150, "esp-q-compile"),
  item("espi-n4", "sticky", 430, 1180, 330, 150, null, { text: "No delay(): one millis() scheduler, so the board can do several things at once." }),
  // Brief
  item("espi-n5", "sticky", 1570, 100, 360, 170, null, { text: "Goal: a desktop node editor that turns a graph into an Arduino sketch for an ESP32 DevKitC, and uploads it." }),
  item("espi-n6", "sticky", 1570, 300, 360, 130, null, { text: "For makers who know what a pin is, but not C++." }),
  item("espi-n7", "sticky", 1570, 460, 360, 170, null, { text: "Done when the blink-plus-button and sensor-to-MQTT examples run on a real board." }),
  // Each quote backs its claim; the guess backs nothing yet.
  item("espi-c1", "connector", 0, 0, 0, 0, null, { from: "espi-q1", to: "espi-cl1", connector: "supports" }),
  item("espi-c3", "connector", 0, 0, 0, 0, null, { from: "espi-q2", to: "espi-cl2", connector: "supports" }),
  item("espi-c2", "connector", 0, 0, 0, 0, null, { from: "espi-q5", to: "espi-n2", connector: "supports" }),
  item("espi-c4", "connector", 0, 0, 0, 0, null, { from: "espi-n8", to: "espi-cl3", connector: "plain" }),
];

export const ESP_BOARD_ITEMS = board_items;

const claims: Claim[] = [
  { id: "esp-c1", board_id: ESP_BOARD, text: "GPIO 34–39 are input only", created_at: at(300), is_sample: true },
  { id: "esp-c2", board_id: ESP_BOARD, text: "ADC2 pins can't be used while Wi-Fi is on", created_at: at(290), is_sample: true },
  { id: "esp-c3", board_id: ESP_BOARD, text: "Beginners will prefer Arduino-style code over ESP-IDF", created_at: at(280), is_sample: true },
];

const decisions: Decision[] = [{ id: ESP_DECISION, board_id: ESP_BOARD, title: "Which code target first?", created_at: at(270), is_sample: true }];

const concepts: Concept[] = [
  { id: "espk-a", decision_id: ESP_DECISION, label: "A", name: "Arduino C++", asset_id: null, flag: "", sort: 0 },
  { id: "espk-b", decision_id: ESP_DECISION, label: "B", name: "ESP-IDF C", asset_id: null, flag: "", sort: 1 },
  { id: "espk-c", decision_id: ESP_DECISION, label: "C", name: "MicroPython", asset_id: null, flag: "", sort: 2 },
];

const criteria: Criterion[] = [
  { id: "espq-1", decision_id: ESP_DECISION, name: "Beginner-friendly", weight: 0.35, sort: 0 },
  { id: "espq-2", decision_id: ESP_DECISION, name: "Library coverage", weight: 0.25, sort: 1 },
  { id: "espq-3", decision_id: ESP_DECISION, name: "Build tools on Windows", weight: 0.2, sort: 2 },
  { id: "espq-4", decision_id: ESP_DECISION, name: "Runtime speed", weight: 0.1, sort: 3 },
  { id: "espq-5", decision_id: ESP_DECISION, name: "Room to grow", weight: 0.1, sort: 4 },
];

// Illustrative sample scores. The two backed below are sourced; the rest are guesses.
const VALUES: [string, number[]][] = [
  ["espk-a", [5, 5, 4, 3, 3]],
  ["espk-b", [2, 4, 3, 5, 5]],
  ["espk-c", [4, 3, 4, 2, 2]],
];
const BACKED = new Set(["esps-espk-a-2", "esps-espk-b-4"]);
const scores: Score[] = VALUES.flatMap(([concept_id, values]) =>
  values.map((value, i) => {
    const id = `esps-${concept_id}-${i}`;
    return { id, concept_id, criterion_id: `espq-${i + 1}`, value, is_assumption: !BACKED.has(id) };
  }),
);

const ev = (id: string, asset_id: string, target_type: "claim" | "score", target_id: string, note: string): EvidenceLink => ({
  id,
  asset_id,
  target_type,
  target_id,
  note,
  stance: "for",
  strength: "strong",
  source_type: "standard",
  limitation: null,
  created_at: at(250),
  is_sample: true,
});

const evidence_links: EvidenceLink[] = [
  ev("espe-1", "esp-q-input", "claim", "esp-c1", "Espressif's GPIO guide, word for word"),
  ev("espe-2", "esp-q-adc2", "claim", "esp-c2", "Espressif's GPIO guide, word for word"),
  ev("espe-3", "esp-q-compile", "score", "esps-espk-a-2", "One official command-line tool compiles and uploads"),
  ev("espe-4", "esp-src-gpio", "score", "esps-espk-b-4", "ESP-IDF is Espressif's own framework, documented down to each peripheral"),
];

const rec = <T extends RecordType>(id: string, type: T, parent_id: string | null, data: RecordDataMap[T]): RecordRow => ({ id, type, parent_id, data, created_at: at(240), updated_at: at(60), is_sample: true }) as RecordRow;

const records: RecordRow[] = [
  rec(ESP_NOTE, "note", null, {
    title: "Pin rules to enforce",
    body: `## From Espressif's GPIO guide

- supports:: [[GPIO 34–39 are input only]]
- supports:: [[ADC2 pins can't be used while Wi-Fi is on]]
- Strapping pins (0, 2, 5, 12, 15): warn, as they can affect boot
- Flash pins (6–11): never offer them

## Still a guess

[[Beginners will prefer Arduino-style code over ESP-IDF]] has no source yet. Test it with five makers before it decides anything.`,
  }),
  rec(ESP_PROJECT, "project", null, {
    name: "ESP32 Node Programmer",
    working: true,
    board_ids: [ESP_BOARD],
    decision_ids: [ESP_DECISION],
    asset_ids: assets.map((a) => a.id),
    record_ids: [ESP_NOTE],
  }),
];

export const SEED_ESP32 = { assets, boards, board_items, claims, evidence_links, decisions, concepts, criteria, scores, records };

/** The brief the sample's pack carries. */
export const ESP_BRIEF = "A desktop node editor that turns a graph into an Arduino sketch for an ESP32 DevKitC, and uploads it.";

/**
 * The sample's pack: its own items only, the two sourced claims and the decision pinned, and the long ADC
 * page left out with its reason. Everything else in the sample data is left out too.
 */
export function esp32Plan(allSampleIds: string[]) {
  const own = new Set<string>([ESP_BOARD, ESP_DECISION, ESP_NOTE, ...assets.map((a) => a.id), ...claims.map((c) => c.id)]);
  return {
    includeSamples: true,
    excluded: [...allSampleIds.filter((id) => !own.has(id)), "esp-src-adc", "pack:interviews", "pack:progress", "pack:history"],
    pinned: ["esp-c1", "esp-c2", ESP_DECISION],
    notes: { "esp-src-adc": "Over budget, so left out: the ADC2 claim carries the one line that matters." },
    priority: { "esp-c3": "low" },
    groups: [],
    placed: {},
    includeFiles: true,
    budget: 20000,
    diffOnly: false,
    deliverable: { kind: "plan", depth: "standard", format: "Markdown", tone: "plain", constraints: "Tauri 2, React and TypeScript. No delay() in generated code." },
    app: {
      name: "ESP32 Node Programmer",
      pitch: ESP_BRIEF,
      problem: "Makers can wire a circuit, but stall at writing C++ for it.",
      audience: "Makers who know what a pin is, but not C++.",
      experience: "Like snapping blocks together. Mistakes are caught before upload, with the reason.",
      platform: "Windows desktop",
      stack: "Tauri 2, React, TypeScript, React Flow, arduino-cli",
      must: "Typed ports\nPin validation\nCode preview\nOne-click upload\nSerial monitor",
      should: "MQTT publish and subscribe\nTrace a code line back to its node",
      later: "MicroPython target",
      screens: "Editor: node library, canvas, inspector, code and serial panel",
      entities: "Graph: board, nodes, wires\nNode: kind, params, pins",
      design: "The same glass look as Daiku: controls on glass, the canvas solid.",
      references: "React Flow validation example: refusing wrong wires (behaviour)\nArduino CLI: compile and upload commands (technical approach)",
      questions: "Bundle arduino-cli, or ask people to install it?",
      constraints: "Wi-Fi passwords never go in the graph, the sketch, logs or a Daiku pack.",
      outOfScope: "Boards other than the ESP32 DevKitC",
      done: "The blink-plus-button example runs on a real board\nThe sensor-to-MQTT example publishes to a test broker",
    },
  };
}

/** A sample answer, marked against the brief, so Review isn't empty on first launch. */
export const ESP_REVIEW = {
  output: `[Sample answer, written for this example]

Plan for the ESP32 node editor:
1. Tauri shell with a React Flow canvas and a node library.
2. Typed ports, refusing wrong wires with a reason.
3. Pin rules for the DevKitC, each with a test.
4. Code generation with a live preview panel.
5. arduino-cli compile and upload, then a serial monitor.`,
  marks: { "Typed ports": "met", "Pin validation": "met", "Code preview": "met", "One-click upload": "partly", "Serial monitor": "unmet" },
  notes: { "One-click upload": "Upload is two steps: pick a port, then upload.", "Serial monitor": "Not in the plan." },
  versions: [],
};
