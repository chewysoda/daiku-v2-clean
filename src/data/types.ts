/** "code" is a snippet or a repository file: its text is in `notes`, its language in a `lang:` tag. */
export type AssetKind = "image" | "video" | "pdf" | "link" | "3d" | "quote" | "code" | "file";
/** A user-set flag. Detectors aren't reliable enough, so the app never infers "human". */
export type Provenance = "human" | "ai" | "unknown";

export interface PaletteColor {
  l: number;
  a: number;
  b: number;
  weight: number;
  hex: string;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  title: string;
  file_path: string | null;
  preview: string | null;
  source_url: string | null;
  credit: string | null;
  via: string | null;
  captured_at: string;
  provenance: Provenance;
  palette_lab: PaletteColor[];
  width: number | null;
  height: number | null;
  tags: string;
  notes: string;
  is_sample: boolean;
}

export interface ShareInfo {
  headline?: string;
  tagline?: string;
  summary?: string;
  recipient?: string;
}

export interface Board {
  id: string;
  name: string;
  version: number;
  share: ShareInfo;
  created_at: string;
  updated_at: string;
  is_sample: boolean;
}

/** "folder" holds uploaded files turned into Markdown: their asset ids are in `files`, its name in `caption`. */
export type ItemKind = "image" | "sticky" | "text" | "section" | "palette" | "connector" | "sticker" | "stroke" | "shape" | "folder";
export type ConnectorKind = "plain" | "supports" | "contradicts" | "inspired-by" | "requires";

export type TextSize = "s" | "m" | "l" | "xl";
export type DashStyle = "solid" | "dashed" | "dotted";
export type Figure = "rect" | "ellipse" | "diamond" | "triangle" | "line" | "arrow";

export interface ItemData {
  text?: string;
  /** How it looks. All optional, so older boards keep their look. */
  color?: string;
  font?: string;
  textSize?: TextSize;
  align?: "left" | "center" | "right";
  shape?: "note" | "rounded" | "circle";
  emoji?: boolean;
  /** A sticker made from a picture: a small PNG or SVG held as a data URL, and its width over its height. */
  picture?: string;
  ratio?: number;
  locked?: boolean;
  /** Drawings. A stroke's points are flat [x, y, x, y...], relative to its box when it was drawn (vw by vh). */
  points?: number[];
  /** How firmly each point was drawn, for a natural pencil line. */
  pressure?: number[];
  feel?: "natural" | "even";
  sketchy?: boolean;
  vw?: number;
  vh?: number;
  width?: number;
  opacity?: number;
  dash?: DashStyle;
  fill?: string;
  figure?: Figure;
  flipX?: boolean;
  flipY?: boolean;
  author?: string;
  caption?: string;
  focusX?: number;
  focusY?: number;
  from?: string;
  to?: string;
  connector?: ConnectorKind;
  /** How a connector is drawn. What it means stays in `connector`. */
  look?: "curve" | "wavy" | "loopy" | "zigzag" | "hops";
  colors?: string[];
  count?: number;
  /** A folder's files, as Library asset ids, in the order they were added. */
  files?: string[];
  /** A sticky that stands for a claim: it shows the claim, its evidence and its state. */
  claim?: string;
  /** Put on the board from an AI's answer and not yet accepted. Shown dashed, and left out of packs until accepted. */
  proposed?: "claude";
}

export interface BoardItem {
  id: string;
  board_id: string;
  kind: ItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  asset_id: string | null;
  data: ItemData;
  updated_at: string;
}

export interface Claim {
  id: string;
  board_id: string | null;
  text: string;
  created_at: string;
  is_sample: boolean;
}

export type EvidenceStrength = "strong" | "medium" | "weak";
export type SourceType = "paper" | "standard" | "datasheet" | "test" | "simulation" | "calculation" | "interview" | "expert" | "article" | "product" | "other";

export interface EvidenceLink {
  id: string;
  asset_id: string;
  target_type: "claim" | "score";
  target_id: string;
  note: string;
  /** Older rows have none, which means "for". */
  stance?: "for" | "against";
  /** A person's rating. Empty until someone rates it: the app never infers one. */
  strength?: EvidenceStrength | null;
  source_type?: SourceType | null;
  /** One line on what this source can't tell you. */
  limitation?: string | null;
  created_at: string;
  is_sample: boolean;
}

export interface Decision {
  id: string;
  board_id: string | null;
  title: string;
  created_at: string;
  is_sample: boolean;
}

export interface Concept {
  id: string;
  decision_id: string;
  label: string;
  name: string;
  asset_id: string | null;
  flag: string;
  sort: number;
}

export interface Criterion {
  id: string;
  decision_id: string;
  name: string;
  /** Fraction of the total, 0..1 */
  weight: number;
  sort: number;
}

export interface Score {
  id: string;
  concept_id: string;
  criterion_id: string;
  value: number;
  is_assumption: boolean;
}

export interface Comment {
  id: string;
  board_id: string;
  parent_id: string | null;
  author: string;
  is_guest: boolean;
  text: string;
  asset_id: string | null;
  pin_x: number | null;
  pin_y: number | null;
  created_at: string;
  is_sample: boolean;
}

export interface Setting {
  id: string;
  value: string;
}

export interface ConceptValue {
  value: number | null;
  basis: string;
}
export interface RequirementData {
  code: string;
  text: string;
  priority: "must" | "want";
  why: string;
  op: "<=" | ">=" | "between";
  min: number | null;
  max: number | null;
  unit: string;
  /** Where the checked value comes from: typed in, the BOM roll-up, or the simulation runs. */
  source: "manual" | "bom_mass" | "sim_sf";
  verified_by: string;
  values: Record<string, ConceptValue>;
}
export interface PartData {
  concept_id: string;
  name: string;
  material: string;
  qty: string;
  mass_kg: number | null;
  /** When set, the mass comes from this calculation and mass_kg is ignored. */
  calc_id: string | null;
  basis: string;
  cost: string;
}
export interface CalcData {
  code: string;
  title: string;
  inputs: { name: string; expr: string }[];
  formula: string;
  unit: string;
  basis: string;
}
export interface MaterialData {
  name: string;
  props: { name: string; value: string }[];
  source: string;
}
export interface SimRunData {
  name: string;
  concept_id: string;
  status: "imported" | "queued";
  solver: string;
  load_case: string;
  max_stress_mpa: number | null;
  allowable_mpa: number | null;
  deflection_mm: number | null;
  convergence: { mesh: string; value: number }[];
  asset_ids: string[];
}
export type HighlightKind = "supports" | "method" | "limitation";
export interface HighlightData {
  asset_id: string;
  page: number;
  kind: HighlightKind;
  text: string;
  /** Fractions of the page, so marks survive any zoom. */
  rects: { x: number; y: number; w: number; h: number }[];
  claim_id: string | null;
}
export interface ParticipantData {
  code: string;
  context: string;
  consent: boolean;
}
export interface ThemeData {
  name: string;
}
export interface InterviewNoteData {
  participant_id: string;
  theme_id: string | null;
  text: string;
}
export interface NoteData {
  title: string;
  body: string;
}
export interface DraftData {
  title: string;
  body: string;
}
export interface ProjectData {
  name: string;
  /** Being worked on now, so its files stay in the Library's working view. */
  working: boolean;
  board_ids: string[];
  decision_ids: string[];
  asset_ids: string[];
  /** Notes, drafts and other records added to it. */
  record_ids: string[];
}
export type GateRule = "no_guessed_scores" | "no_failed_must" | "all_must_verified" | "all_claims_evidenced" | "decision_logged";
export interface MilestoneData {
  title: string;
  date: string;
  gate: GateRule;
  decision_id: string | null;
}
export interface CheckCounts {
  scores_backed: number;
  scores_guessed: number;
  must_passed: number;
  must_failed: number;
  must_open: number;
  claims_with: number;
  claims_without: number;
  decisions_logged: number;
}
export interface CheckData {
  label: string;
  counts: CheckCounts;
}
export interface RejectedConcept {
  concept_id: string;
  label: string;
  name: string;
  reason: string;
}
export interface DecisionLogData {
  decision_id: string;
  concept_id: string;
  title: string;
  reason: string;
  /** Older logs have none, and the readiness check asks for them. */
  rejected?: RejectedConcept[];
  /** Each concept's total when logged, so the record can tell when the matrix has moved on. */
  totals?: Record<string, number>;
}
export type SlideKind = "title" | "section" | "matrix" | "requirements" | "text";
export interface Slide {
  id: string;
  kind: SlideKind;
  title: string;
  body: string;
  notes: string;
  /** Board section, for section slides, or decision, for matrix and requirements slides. */
  ref: string | null;
  /** What the linked content looked like when last accepted, to flag out-of-date slides. */
  fingerprint: string;
}
export interface DeckData {
  title: string;
  slides: Slide[];
}

export interface RecordDataMap {
  requirement: RequirementData;
  part: PartData;
  calc: CalcData;
  material: MaterialData;
  sim_run: SimRunData;
  highlight: HighlightData;
  participant: ParticipantData;
  theme: ThemeData;
  interview_note: InterviewNoteData;
  note: NoteData;
  draft: DraftData;
  project: ProjectData;
  milestone: MilestoneData;
  check: CheckData;
  decision_log: DecisionLogData;
  deck: DeckData;
}
export type RecordType = keyof RecordDataMap;

export interface RecordRow<T extends RecordType = RecordType> {
  id: string;
  type: T;
  parent_id: string | null;
  data: RecordDataMap[T];
  created_at: string;
  updated_at: string;
  is_sample: boolean;
}

export interface LogEntry {
  id: string;
  at: string;
  actor: string;
  action: "create" | "update" | "delete";
  target_type: string;
  target_id: string;
  summary: string;
  before: string | null;
  after: string | null;
  why: string | null;
}

export interface Tables {
  assets: Asset;
  boards: Board;
  board_items: BoardItem;
  claims: Claim;
  evidence_links: EvidenceLink;
  decisions: Decision;
  concepts: Concept;
  criteria: Criterion;
  scores: Score;
  comments: Comment;
  settings: Setting;
  records: RecordRow;
  workflow_log: LogEntry;
}
export type TableName = keyof Tables;

export const TABLES: TableName[] = [
  "assets",
  "boards",
  "board_items",
  "claims",
  "evidence_links",
  "decisions",
  "concepts",
  "criteria",
  "scores",
  "comments",
  "settings",
  "records",
  "workflow_log",
];

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
