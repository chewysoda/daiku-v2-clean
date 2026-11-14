import { Asset, Board, BoardItem, Claim, Comment, Concept, Criterion, Decision, EvidenceLink, ItemData, ItemKind, PaletteColor, RecordDataMap, RecordRow, RecordType, RequirementData, Score } from "./types";
import { hexToLab } from "../lib/color";

/**
 * The example project: planning an ESP32 node programmer, from sources to a brief Claude can build from. It
 * touches every part of Daiku: boards, the Library (links, quotes, photos, a PDF, a 3D model, code), claims
 * with evidence for and against, two decisions (one with requirements, a BOM, calculations and simulation
 * runs), interviews, notes, a draft, milestones and share comments.
 *
 * Every quote is copied word for word from the page it credits (read on 10 Nov 2026), and every row is
 * is_sample. The photos are from Wikimedia Commons under the licence in each credit. The PDF, the enclosure
 * model, the code and the interviews were written for this example, and say so. The scores are illustrative:
 * the backed ones cite a source, the rest are guesses and look like guesses.
 */
const T0 = Date.parse("2026-11-10T09:00:00Z");
const at = (minutesAgo: number) => new Date(T0 - minutesAgo * 60000).toISOString();

export const ESP_BOARD = "b-esp32";
export const ESP_DECISION = "d-esp32";
export const ESP_PROJECT = "pr-esp32";
export const ESP_NOTE = "note-esp32";
export const ESP_CASE_BOARD = "b-esp32-case";
export const ESP_CASE_DECISION = "d-esp32-case";
export const ESP_FILE = "note-esp32-scoring";
export const ESP_DRAFT = "draft-esp32";

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

const pal = (...entries: [string, number][]): PaletteColor[] => entries.map(([hex, weight]) => ({ ...hexToLab(hex)!, weight, hex }));

/** A photo from Wikimedia Commons, bundled in public/samples/esp32 with its credit and licence. */
const photo = (id: string, title: string, file: string, width: number, height: number, credit: string, page: string, tags: string, palette_lab: PaletteColor[]): Asset => ({
  id,
  kind: "image",
  title,
  file_path: null,
  preview: `/samples/esp32/${file}`,
  source_url: `https://commons.wikimedia.org/wiki/${page}`,
  credit,
  via: "commons.wikimedia.org",
  captured_at: READ,
  provenance: "human",
  palette_lab,
  width,
  height,
  tags: `esp32 sample photo ${tags}`,
  notes: "",
  is_sample: true,
});

const photos: Asset[] = [
  photo("esp-img-devkitc", "ESP32-DevKitC and its WROOM-32 module", "devkitc-module.jpg", 800, 800, "Brian Krent; CC BY-SA 4.0, via Wikimedia Commons", "File:Espressif_ESP-WROOM-32_Wi-Fi_%26_Bluetooth_Module.jpg", "devkitc module board hardware", pal(["#363B43", 0.27], ["#E8EAE9", 0.26], ["#161920", 0.27], ["#767D82", 0.2])),
  photo("esp-img-board", "ESP32 dev board", "dev-board.jpg", 1280, 983, "Ubahnverleih; CC0, via Wikimedia Commons", "File:ESP32_Espressif_ESP-WROOM-32_Dev_Board.jpg", "dev board pins hardware", pal(["#FFFFFF", 0.33], ["#FEFDFA", 0.31], ["#393029", 0.25], ["#D1C9BB", 0.11])),
  photo("esp-img-breadboard", "ESP32 with an OLED on a breadboard", "breadboard-oled.jpg", 1280, 548, "King of Pwnt; CC0, via Wikimedia Commons", "File:ESP32_SH1106_Power-Meter_01.jpg", "breadboard oled display wiring prototype", pal(["#545250", 0.34], ["#030304", 0.26], ["#322D2D", 0.23], ["#B2B5B7", 0.17])),
  photo("esp-img-die", "ESP32 die shot", "die-shot.jpg", 1280, 1234, "Mikhail Svarichevsky (Zeptobars.com); CC BY 3.0, via Wikimedia Commons", "File:ESP32-Dieshot.jpg", "chip die silicon", pal(["#B4B499", 0.38], ["#C0C1A5", 0.28], ["#B0BC9C", 0.2], ["#63676A", 0.14])),
];

/** Files written for this example: study notes for the Reader, an enclosure model for the CAD viewer, and code. */
const madeHere = (id: string, kind: Asset["kind"], title: string, preview: string | null, credit: string, tags: string, notes = ""): Asset => ({
  id,
  kind,
  title,
  file_path: null,
  preview,
  source_url: null,
  credit,
  via: null,
  captured_at: READ,
  provenance: "human",
  palette_lab: [],
  width: null,
  height: null,
  tags: `esp32 sample ${tags}`,
  notes,
  is_sample: true,
});

export const ESP_PAPER = "esp-paper";
export const ESP_CAD = "esp-cad";
export const ESP_CODE = "esp-code";

const BLINK = `// Blink plus button, with no delay(): one millis() scheduler, so the board can do several things at once.
const int LED = 2;      // the DevKitC's on-board LED
const int BUTTON = 4;   // not 34-39: those are input only and have no pull-up

unsigned long lastBlink = 0;
bool ledOn = false;

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
}

void loop() {
  unsigned long now = millis();
  if (now - lastBlink >= 500) {
    lastBlink = now;
    ledOn = !ledOn;
  }
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, ledOn || pressed ? HIGH : LOW);
}
`;

const made: Asset[] = [
  madeHere(ESP_PAPER, "pdf", "Picking a first code target (sample study notes)", "/samples/esp32/code-target-notes.pdf", "Daiku sample notes, written for this example", "study paper code target reader"),
  madeHere(ESP_CAD, "3d", "Enclosure tray v1", "/samples/esp32/enclosure.stl", "Daiku sample model, made for this example", "cad enclosure case stl"),
  madeHere(ESP_CODE, "code", "blink_button.ino", null, "Daiku sample code, written for this example; MIT licence", "code lang:arduino blink button millis", BLINK),
];

const assets: Asset[] = [gpio, adc, arduino, reactflow, cli, ...quotes, ...photos, ...made];

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
  {
    id: ESP_CASE_BOARD,
    name: "ESP32 Enclosure",
    version: 1,
    share: { headline: "A case that keeps the pins in reach", tagline: "Printed, light, and open where it matters.", summary: "A sample project: choosing an enclosure for the node programmer's test board." },
    created_at: at(2000),
    updated_at: at(90),
    is_sample: true,
  },
];

let z = 300;
const item = (id: string, kind: ItemKind, x: number, y: number, w: number, h: number, asset_id: string | null = null, data: ItemData = {}, board_id = ESP_BOARD): BoardItem => ({
  id,
  board_id,
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

/** Added later: pictures, the study notes and the code. Their own sections, below the first layout. */
const PARTS_AT = at(45);
const later: BoardItem[] = [
  item("espi-s6", "section", 40, 1420, 760, 520, null, { text: "The board" }),
  item("espi-p1", "image", 70, 1480, 300, 300, "esp-img-devkitc", { caption: "DevKitC" }),
  item("espi-p2", "image", 400, 1480, 370, 284, "esp-img-board", { caption: "dev board" }),
  item("espi-p3", "image", 70, 1800, 300, 110, "esp-img-die", { caption: "die shot" }),
  item("espi-pal", "palette", 400, 1790, 370, 120, null, { colors: ["#161920", "#363B43", "#767D82", "#E8EAE9", "#D1C9BB"], caption: "the board photos" }),
  item("espi-s7", "section", 840, 1100, 660, 840, null, { text: "Study and code" }),
  item("espi-st", "image", 870, 1160, 600, 110, ESP_PAPER),
  item("espi-p4", "image", 870, 1300, 600, 257, "esp-img-breadboard", { caption: "first prototype" }),
  item("espi-code", "image", 870, 1590, 360, 320, ESP_CODE),
  item("espi-n9", "sticky", 1250, 1590, 220, 160, null, { text: "Pin 4, not 34: the input-only pins have no pull-up.", author: "[Maker]" }),
  item("espi-c5", "connector", 0, 0, 0, 0, null, { from: "espi-n9", to: "espi-code", connector: "plain" }),
].map((i) => ({ ...i, updated_at: PARTS_AT }));

/** The enclosure board: the model, a photo, and what the case must do. */
const case_items: BoardItem[] = [
  item("espe-s1", "section", 40, 40, 760, 560, null, { text: "Case options" }, ESP_CASE_BOARD),
  item("espe-cad", "image", 70, 100, 330, 110, ESP_CAD, {}, ESP_CASE_BOARD),
  item("espe-p1", "image", 430, 100, 340, 340, "esp-img-devkitc", { caption: "what goes inside" }, ESP_CASE_BOARD),
  item("espe-n1", "sticky", 70, 240, 330, 130, null, { text: "The USB slot must clear the cable's plug, not just the port." }, ESP_CASE_BOARD),
  item("espe-n2", "sticky", 70, 400, 330, 130, null, { text: "Headers stay reachable: makers rewire more than they reflash." }, ESP_CASE_BOARD),
  item("espe-t1", "text", 430, 460, 340, 110, null, { text: "Which enclosure? The printed tray leads, and its drop test passed." }, ESP_CASE_BOARD),
  item("espe-c1", "connector", 0, 0, 0, 0, null, { from: "espe-n1", to: "espe-cad", connector: "plain" }, ESP_CASE_BOARD),
].map((i) => ({ ...i, updated_at: at(90) }));

board_items.push(...later, ...case_items);

export const ESP_BOARD_ITEMS = board_items.filter((i) => i.board_id === ESP_BOARD);

const claims: Claim[] = [
  { id: "esp-c1", board_id: ESP_BOARD, text: "GPIO 34–39 are input only", created_at: at(300), is_sample: true },
  { id: "esp-c2", board_id: ESP_BOARD, text: "ADC2 pins can't be used while Wi-Fi is on", created_at: at(290), is_sample: true },
  { id: "esp-c3", board_id: ESP_BOARD, text: "Beginners will prefer Arduino-style code over ESP-IDF", created_at: at(280), is_sample: true },
  { id: "esp-c4", board_id: ESP_BOARD, text: "A millis() scheduler keeps generated code responsive", created_at: at(270), is_sample: true },
  { id: "esp-c5", board_id: ESP_BOARD, text: "MicroPython has a library for every sensor we need", created_at: at(265), is_sample: true },
];

const decisions: Decision[] = [
  { id: ESP_DECISION, board_id: ESP_BOARD, title: "Which code target first?", created_at: at(270), is_sample: true },
  { id: ESP_CASE_DECISION, board_id: ESP_CASE_BOARD, title: "Which enclosure?", created_at: at(200), is_sample: true },
];

const concepts: Concept[] = [
  { id: "espk-a", decision_id: ESP_DECISION, label: "A", name: "Arduino C++", asset_id: null, flag: "", sort: 0 },
  { id: "espk-b", decision_id: ESP_DECISION, label: "B", name: "ESP-IDF C", asset_id: null, flag: "", sort: 1 },
  { id: "espk-c", decision_id: ESP_DECISION, label: "C", name: "MicroPython", asset_id: null, flag: "", sort: 2 },
  { id: "espc-a", decision_id: ESP_CASE_DECISION, label: "A", name: "Printed PLA tray", asset_id: null, flag: "", sort: 0 },
  { id: "espc-b", decision_id: ESP_CASE_DECISION, label: "B", name: "Off-the-shelf ABS box", asset_id: null, flag: "USB slot too narrow", sort: 1 },
  { id: "espc-c", decision_id: ESP_CASE_DECISION, label: "C", name: "Bare board on standoffs", asset_id: "esp-img-board", flag: "", sort: 2 },
];

const criteria: Criterion[] = [
  { id: "espq-1", decision_id: ESP_DECISION, name: "Beginner-friendly", weight: 0.35, sort: 0 },
  { id: "espq-2", decision_id: ESP_DECISION, name: "Library coverage", weight: 0.25, sort: 1 },
  { id: "espq-3", decision_id: ESP_DECISION, name: "Build tools on Windows", weight: 0.2, sort: 2 },
  { id: "espq-4", decision_id: ESP_DECISION, name: "Runtime speed", weight: 0.1, sort: 3 },
  { id: "espq-5", decision_id: ESP_DECISION, name: "Room to grow", weight: 0.1, sort: 4 },
  { id: "espcq-1", decision_id: ESP_CASE_DECISION, name: "Protection", weight: 0.3, sort: 0 },
  { id: "espcq-2", decision_id: ESP_CASE_DECISION, name: "Pin access", weight: 0.25, sort: 1 },
  { id: "espcq-3", decision_id: ESP_CASE_DECISION, name: "Cost", weight: 0.2, sort: 2 },
  { id: "espcq-4", decision_id: ESP_CASE_DECISION, name: "Mass", weight: 0.15, sort: 3 },
  { id: "espcq-5", decision_id: ESP_CASE_DECISION, name: "Lead time", weight: 0.1, sort: 4 },
];

// Illustrative sample scores. The backed ones below cite a source; the rest are guesses.
const VALUES: [string, number[]][] = [
  ["espk-a", [5, 5, 4, 3, 3]],
  ["espk-b", [2, 4, 3, 5, 5]],
  ["espk-c", [4, 3, 4, 2, 2]],
];
const CASE_VALUES: [string, number[]][] = [
  ["espc-a", [4, 5, 4, 4, 3]],
  ["espc-b", [5, 2, 3, 3, 5]],
  ["espc-c", [1, 5, 5, 5, 5]],
];
const BACKED = new Set(["esps-espk-a-2", "esps-espk-b-4", "esps-espc-a-0", "esps-espc-a-3"]);
const scoresOf = (rows: [string, number[]][], prefix: string) =>
  rows.flatMap(([concept_id, values]) =>
    values.map((value, i): Score => {
      const id = `esps-${concept_id}-${i}`;
      return { id, concept_id, criterion_id: `${prefix}-${i + 1}`, value, is_assumption: !BACKED.has(id) };
    }),
  );
const scores: Score[] = [...scoresOf(VALUES, "espq"), ...scoresOf(CASE_VALUES, "espcq")];

const ev = (id: string, asset_id: string, target_type: "claim" | "score", target_id: string, note: string, more: Partial<EvidenceLink> = {}): EvidenceLink => ({
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
  ...more,
});

const SAMPLE_STUDY = { strength: "weak", source_type: "paper", limitation: "Sample notes with made-up participants" } as const;
const evidence_links: EvidenceLink[] = [
  ev("espe-1", "esp-q-input", "claim", "esp-c1", "Espressif's GPIO guide, word for word"),
  ev("espe-2", "esp-q-adc2", "claim", "esp-c2", "Espressif's GPIO guide, word for word"),
  ev("espe-3", "esp-q-compile", "score", "esps-espk-a-2", "One official command-line tool compiles and uploads"),
  ev("espe-4", "esp-src-gpio", "score", "esps-espk-b-4", "ESP-IDF is Espressif's own framework, documented down to each peripheral"),
  ev("espe-5", ESP_PAPER, "claim", "esp-c4", "Sample study notes, p. 2", SAMPLE_STUDY),
  ev("espe-6", ESP_PAPER, "claim", "esp-c5", "Two sensor libraries were missing", { ...SAMPLE_STUDY, stance: "against" }),
  ev("espe-7", ESP_CAD, "score", "esps-espc-a-0", "Drop run 01 on this model: safety factor 2.7", { strength: "medium", source_type: "simulation" }),
  ev("espe-8", ESP_CAD, "score", "esps-espc-a-3", "Tray mass from the model's walls, calc C1", { strength: "medium", source_type: "calculation" }),
];

const rec = <T extends RecordType>(id: string, type: T, parent_id: string | null, data: RecordDataMap[T]): RecordRow => ({ id, type, parent_id, data, created_at: at(240), updated_at: at(60), is_sample: true }) as RecordRow;

const creq = (code: string, text: string, priority: "must" | "want", verified_by: string, op: RequirementData["op"], min: number | null, max: number | null, unit: string, source: RequirementData["source"], why: string, values: RequirementData["values"] = {}) =>
  rec(`espr-${code}`, "requirement", ESP_CASE_DECISION, { code, text, priority, why, op, min, max, unit, source, verified_by, values });

const cpart = (id: string, name: string, material: string, qty: string, mass_kg: number | null, calc_id: string | null, basis: string) =>
  rec(id, "part", ESP_CASE_DECISION, { concept_id: "espc-a", name, material, qty, mass_kg, calc_id, basis, cost: "[quote]" });

const crun = (id: string, name: string, concept_id: string, max_stress_mpa: number | null, allowable_mpa: number | null, deflection_mm: number | null, status: "imported" | "queued", convergence: { mesh: string; value: number }[] = []) =>
  rec(id, "sim_run", ESP_CASE_DECISION, {
    name,
    concept_id,
    status,
    solver: status === "queued" ? "" : "[sample] FEA, the drop as an equivalent static load",
    load_case: "1 m drop onto a desk, landing on one corner",
    max_stress_mpa,
    allowable_mpa,
    deflection_mm,
    convergence,
    asset_ids: [ESP_CAD],
  });

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
  rec(ESP_FILE, "note", null, {
    title: "How the code target is scored",
    body: `## The question

Which code target gets a beginner from an empty canvas to a blinking LED fastest, without hiding what the code does?

## How it's scored

Beginner-friendliness is weighted highest:

$$score = 0.35 \\cdot beginner + 0.25 \\cdot libraries + 0.2 \\cdot tools + 0.1 \\cdot speed + 0.1 \\cdot growth$$

## Linked

- The hard limits any target must respect: [[Pin rules to enforce]]
- supports:: [[A millis() scheduler keeps generated code responsive]]
- Still to write: [[Sensor library checklist]]`,
  }),
  rec(ESP_DRAFT, "draft", null, {
    title: "ESP32 editor: why Arduino first",
    body: `# Why Arduino first

This is a sample draft, showing how research turns into writing. The study it quotes is sample notes, written for this example.

Arduino C++ leads the decision. Its one command-line tool compiles and uploads, and most sensor examples are written for it:

> To compile the sketch you run the \`compile\` command, passing the proper FQBN string:
>
> — Arduino SA; GPL-3.0 licence, Compiling a sketch

![[ESP32 with an OLED on a breadboard]]

*Figure: King of Pwnt; CC0, via Wikimedia Commons, ESP32 with an OLED on a breadboard*

## Still open

Two of Arduino's scores are guesses until five makers have tried it.`,
  }),
  // Highlights in the sample study notes, as the Reader saves them.
  rec("esph-1", "highlight", ESP_PAPER, { asset_id: ESP_PAPER, page: 2, kind: "supports", text: "Generated code was easier to follow when each node became one function and the main loop used a millis() scheduler instead of delay().", rects: [{ x: 0.115, y: 0.326, w: 0.77, h: 0.022 }, { x: 0.115, y: 0.348, w: 0.5, h: 0.022 }], claim_id: "esp-c4" }),
  rec("esph-2", "highlight", ESP_PAPER, { asset_id: ESP_PAPER, page: 3, kind: "limitation", text: "Five people is a small group, and none had used ESP-IDF before.", rects: [{ x: 0.115, y: 0.102, w: 0.56, h: 0.022 }], claim_id: null }),
  // The enclosure decision's engineering: requirements, calculations, parts, materials and simulation runs.
  creq("R1", "Survives a 1 m drop onto a desk, safety factor ≥ 2.0", "must", "Drop runs 01–02", ">=", 2, null, "", "sim_sf", "Makers knock boards off desks."),
  creq("R2", "Mass with the board ≤ 0.035 kg", "must", "BOM roll-up", "<=", null, 0.035, "kg", "bom_mass", "Light enough to hang from its USB cable without pulling the port."),
  creq("R3", "USB slot at least 12 mm wide", "must", "CAD measure, supplier drawing", ">=", 12, null, "mm", "manual", "The cable's plug, not just the port, has to fit.", { "espc-a": { value: 12, basis: "Enclosure tray v1, slot" }, "espc-b": { value: 9, basis: "[sample] supplier drawing" } }),
  creq("R4", "Footprint within 72 mm", "must", "CAD bounding box", "<=", null, 72, "mm", "manual", "Fits beside a laptop on a small desk.", { "espc-a": { value: 70, basis: "Enclosure tray v1, bounding box" } }),
  creq("R5", "At least 30% recycled material by mass", "want", "Filament spec", ">=", 30, null, "%", "manual", "A sustainability goal.", { "espc-a": { value: 0, basis: "virgin PLA" } }),
  rec("espcalc-1", "calc", ESP_CASE_DECISION, { code: "C1", title: "Tray mass", inputs: [{ name: "A", expr: "0.0094 m^2" }, { name: "t", expr: "2 mm" }, { name: "rho", expr: "1240 kg/m^3" }], formula: "A * t * rho", unit: "kg", basis: "ρ from Properties (PLA)" }),
  rec("espcalc-2", "calc", ESP_CASE_DECISION, { code: "C2", title: "Power draw", inputs: [{ name: "V", expr: "3.3 V" }, { name: "I", expr: "0.11 A" }], formula: "V * I", unit: "W", basis: "[sample] typical currents: board, OLED and LED" }),
  cpart("esppart-1", "DevKitC board", "PCB", "1", 0.01, null, "[sample] kitchen scale"),
  cpart("esppart-2", "Tray", "PLA, 2 mm walls", "1", null, "espcalc-1", "calc C1"),
  cpart("esppart-3", "OLED display", "1.3 in module", "1", 0.004, null, "[sample] supplier spec"),
  cpart("esppart-4", "Screws", "M2 × 6 steel", "4", 0.002, null, "estimate"),
  rec("espmat-1", "material", ESP_CASE_DECISION, { name: "PLA", props: [{ name: "density", value: "1240 kg/m³" }, { name: "allowable stress", value: "30 MPa" }], source: "typical datasheet values" }),
  rec("espmat-2", "material", ESP_CASE_DECISION, { name: "ABS", props: [{ name: "density", value: "1040 kg/m³" }, { name: "allowable stress", value: "40 MPa" }], source: "typical datasheet values" }),
  crun("esprun-1", "Run 01 · A PLA tray 2 mm", "espc-a", 11, 30, 0.4, "imported", [{ mesh: "2 mm", value: 10.2 }, { mesh: "1 mm", value: 10.9 }, { mesh: "0.5 mm", value: 11 }]),
  crun("esprun-2", "Run 02 · B ABS box", "espc-b", 14, 40, 0.3, "imported"),
  crun("esprun-3", "Run 03 · A PLA tray 1.5 mm", "espc-a", null, null, null, "queued"),
  // Interviews: made up for the example, and they say so.
  ...[
    ["school robotics club", true],
    ["home workshop", true],
    ["makerspace", true],
    ["university lab", true],
    ["home workshop", false],
  ].map(([context, consent], i) => rec(`esppt-${i + 1}`, "participant", null, { code: `P${i + 1}`, context: context as string, consent: consent as boolean })),
  rec("espth-wiring", "theme", null, { name: "Wiring mistakes" }),
  rec("espth-code", "theme", null, { name: "Reading the code" }),
  rec("espth-upload", "theme", null, { name: "Uploading" }),
  ...(
    [
      [1, "espth-wiring", "Wired a button to pin 35 and couldn't work out why the pull-up did nothing"],
      [2, "espth-wiring", "Wants the editor to say why a wire is wrong, not just refuse it"],
      [3, "espth-wiring", "Lost an afternoon to a strapping pin that stopped the board booting"],
      [1, "espth-code", "Copies code from examples and changes the pin numbers"],
      [4, "espth-code", "Would read the generated code if each block became one function"],
      [2, "espth-upload", "Never knows which COM port is the board"],
      [5, "espth-upload", "Gave up on ESP-IDF at the toolchain install"],
    ] as const
  ).map(([p, theme_id, text], i) => rec(`espin-${i + 1}`, "interview_note", null, { participant_id: `esppt-${p}`, theme_id, text: `[Sample] ${text}` })),
  rec("espmile-1", "milestone", null, { title: "Code target chosen", date: "2026-12-01", gate: "decision_logged", decision_id: ESP_DECISION }),
  rec("espmile-2", "milestone", null, { title: "Enclosure must-haves verified", date: "2027-01-15", gate: "all_must_verified", decision_id: ESP_CASE_DECISION }),
  rec(ESP_PROJECT, "project", null, {
    name: "ESP32 Node Programmer",
    working: true,
    board_ids: [ESP_BOARD, ESP_CASE_BOARD],
    decision_ids: [ESP_DECISION, ESP_CASE_DECISION],
    asset_ids: assets.map((a) => a.id),
    record_ids: [ESP_NOTE, ESP_FILE, ESP_DRAFT],
  }),
];

const comment = (id: string, parent_id: string | null, author: string, text: string, asset_id: string | null, pin: [number, number] | null, minutesAgo: number): Comment => ({
  id,
  board_id: ESP_BOARD,
  parent_id,
  author,
  is_guest: false,
  text,
  asset_id,
  pin_x: pin?.[0] ?? null,
  pin_y: pin?.[1] ?? null,
  created_at: at(minutesAgo),
  is_sample: true,
});

const comments: Comment[] = [
  comment("espm-1", null, "[Reviewer]", "Is the OLED on the same I2C pins the editor will default to?", "esp-img-breadboard", [62, 40], 30),
  comment("espm-1r", "espm-1", "[Maker]", "Yes, 21 and 22. I'll note it on the board.", null, null, 20),
  comment("espm-2", null, "[Reviewer]", "Which pin is the on-board LED on this DevKitC?", "esp-img-devkitc", [30, 70], 15),
];

export const SEED_ESP32 = { assets, boards, board_items, claims, evidence_links, decisions, concepts, criteria, scores, records, comments };

/** The brief the sample's pack carries. */
export const ESP_BRIEF = "A desktop node editor that turns a graph into an Arduino sketch for an ESP32 DevKitC, and uploads it.";

/**
 * The sample's pack: its own items only, the two sourced claims and the decision pinned, and the long ADC
 * page left out with its reason. Everything else in the sample data is left out too.
 */
export function esp32Plan(allSampleIds: string[]) {
  const own = new Set<string>([ESP_BOARD, ESP_CASE_BOARD, ESP_DECISION, ESP_CASE_DECISION, ESP_NOTE, ESP_FILE, ESP_DRAFT, ...assets.map((a) => a.id), ...claims.map((c) => c.id)]);
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
