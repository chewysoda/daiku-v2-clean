/**
 * Plain JSON files and organised pictures, named however the person wants, as a zip. Local only. Every
 * picture keeps its credit in the index, guesses stay marked as guesses, and interview notes need consent.
 */
import { strToU8, zipSync } from "fflate";
import { selectRecords, useStore } from "../data/store";
import { Asset, EvidenceLink, RecordRow } from "../data/types";
import { sourceTypeLabel, strengthOf } from "./readiness";
import { buildGraph } from "../features/threads/graph";
import { withoutSamples } from "./claudePack";
import { cleanFormats, DATASET_FORMATS, exportReadme, FormatId, formatEndings, isCompressed, renderFormat, sourcesCsv } from "./dataFormats";
import { withConsentOnly } from "./packPlan";
import { convertImage, ExportImageFormat, isExportImageFormat } from "./imageFormats";
import { fileUrl, mediaUrl } from "./platform";
import { narrowToProject, projectsIn } from "./projects";
import { fetchBytes } from "./saveFile";
import { ranking, weightedTotals } from "./scoring";
import { isCredited } from "./search";
import { safeFileName, stanceOf } from "./studio";
import { extOf } from "./vault";

type S = ReturnType<typeof useStore.getState>;

export const DATASETS = [
  { id: "graphs", label: "Graphs", hint: "The Threads map: every node and link", file: "graphs" },
  { id: "weightage", label: "Weightage", hint: "Criteria weights, scores and totals", file: "weightage" },
  { id: "moodboards", label: "Mood boards", hint: "Boards, sections, notes, palettes and pictures", file: "moodboards" },
  { id: "research", label: "Research", hint: "Claims, evidence, notes, drafts, highlights and interviews", file: "research" },
  { id: "snips", label: "Snips", hint: "Snips and saved quotes, with their credit", file: "snips" },
  { id: "contacts", label: "Contacts", hint: "Interview participants, by code, and everyone credited", file: "contacts" },
] as const;
export type DatasetId = (typeof DATASETS)[number]["id"];

export type ImageOrganise = "flat" | "project" | "board" | "kind" | "credit";
export const ORGANISE: { id: ImageOrganise; label: string }[] = [
  { id: "flat", label: "All in one folder" },
  { id: "project", label: "A folder per project" },
  { id: "board", label: "A folder per board" },
  { id: "kind", label: "A folder per kind" },
  { id: "credit", label: "A folder per credit" },
];

export interface ExportPlan {
  /** "all", or a project's id. */
  scope: string;
  includeSamples: boolean;
  zipName: string;
  sets: Record<DatasetId, { on: boolean; folder: string; file: string; formats?: FormatId[] }>;
  images: {
    on: boolean;
    folder: string;
    organise: ImageOrganise;
    numbered: boolean;
    /** What to write images as. Everything else stays as it is. */
    convert?: ExportImageFormat;
    /** Pictures left out, by asset id. */
    excluded: string[];
    /** Names and folders chosen for single pictures, by asset id. */
    renames: Record<string, { name?: string; folder?: string }>;
  };
}

export const defaultPlan = (): ExportPlan => ({
  scope: "",
  includeSamples: false,
  zipName: "Daiku export",
  sets: Object.fromEntries(DATASETS.map((d) => [d.id, { on: true, folder: "data", file: d.file }])) as ExportPlan["sets"],
  images: { on: true, folder: "images", organise: "flat", numbered: false, excluded: [], renames: {} },
});

export function parseExportPlan(json: string): ExportPlan {
  const base = defaultPlan();
  try {
    const p = JSON.parse(json) as Partial<ExportPlan> | null;
    if (!p || typeof p !== "object") return base;
    for (const d of DATASETS) if (p.sets?.[d.id]) base.sets[d.id] = { ...base.sets[d.id], ...p.sets[d.id] };
    const organise = ORGANISE.some((o) => o.id === p.images?.organise) ? p.images!.organise : base.images.organise;
    return {
      ...base,
      scope: typeof p.scope === "string" ? p.scope : "",
      includeSamples: p.includeSamples === true,
      zipName: typeof p.zipName === "string" ? p.zipName : base.zipName,
      sets: base.sets,
      images: { ...base.images, ...p.images, organise, excluded: Array.isArray(p.images?.excluded) ? p.images.excluded : [], renames: p.images?.renames && typeof p.images.renames === "object" ? p.images.renames : {} },
    };
  } catch {
    return base;
  }
}

/** A folder path the person typed, safe to unzip anywhere: no "..", no drive letters, no leading slash. */
export function cleanFolder(path: string): string {
  return path
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => safeFileName(part))
    .join("/");
}

/** A file name without the extension, which the app adds. */
export const cleanName = (name: string, extension: string, fallback: string) => {
  const bare = name.trim().replace(new RegExp(`\\.${extension}$`, "i"), "");
  return safeFileName(bare || fallback);
};

const join = (folder: string, file: string) => [folder, file].filter(Boolean).join("/");

/** What the export covers. A project is narrowed to itself, and consent always applies. */
export function exportScope(state: S, plan: ExportPlan): S {
  const project = projectsIn(state).find((p) => p.id === plan.scope);
  if (project) return withConsentOnly(narrowToProject(state, project.data));
  return withConsentOnly(plan.includeSamples ? state : withoutSamples(state));
}

export const isPicture = (a: Asset) => !!mediaUrl(a) && (a.kind === "image" || a.kind === "pdf" || a.kind === "video" || a.kind === "3d" || a.kind === "file");

/** Where each picture goes. Pure, so the preview and the zip can't disagree. */
export function imagePaths(state: S, s: S, plan: ExportPlan): Map<string, string> {
  const out = new Map<string, string>();
  if (!plan.images.on) return out;
  const root = cleanFolder(plan.images.folder);
  const projects = projectsIn(state);
  const groupFor = (a: Asset): string => {
    switch (plan.images.organise) {
      case "kind":
        return a.kind;
      case "credit":
        return isCredited(a) ? a.credit! : "no source yet";
      case "board": {
        const on = s.board_items.find((i) => i.asset_id === a.id);
        return s.boards.find((b) => b.id === on?.board_id)?.name ?? "not on a board";
      }
      case "project": {
        const owner = projects.find((p) => p.data.asset_ids.includes(a.id) || s.board_items.some((i) => i.asset_id === a.id && p.data.board_ids.includes(i.board_id)));
        return owner?.data.name ?? "no project";
      }
      default:
        return "";
    }
  };
  const taken = new Set<string>();
  s.assets.filter((a) => isPicture(a) && !plan.images.excluded.includes(a.id)).forEach((a, i) => {
    const custom = plan.images.renames[a.id];
    const folder = custom?.folder?.trim() ? join(root, cleanFolder(custom.folder)) : join(root, cleanFolder(groupFor(a)));
    const convert = plan.images.convert;
    const extension = a.kind === "image" && isExportImageFormat(convert) && convert !== "original" ? convert : extOf(a);
    const named = cleanName(custom?.name ?? "", extension, a.title);
    const base = !custom?.name?.trim() && plan.images.numbered ? `${String(i + 1).padStart(3, "0")} ${named}` : named;
    let path = join(folder, `${base}.${extension}`);
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = join(folder, `${base} ${n}.${extension}`);
    taken.add(path.toLowerCase());
    out.set(a.id, path);
  });
  return out;
}

/** Ratings stay empty when nobody has given one, so a reader can tell them from a real rating. */
const evidenceWeight = (l: EvidenceLink) => ({ stance: stanceOf(l), strength: strengthOf(l), source_type: sourceTypeLabel(l), limitation: l.limitation?.trim() || null });

/** The six data files. `fileOf` says where each picture went, or null if it isn't in the zip. */
export function datasets(s: S, fileOf: (id: string) => string | null): Record<DatasetId, unknown> {
  const assetRef = (id: string | null) => {
    const a = s.assets.find((x) => x.id === id);
    return a ? { id: a.id, title: a.title, credit: isCredited(a) ? a.credit : null, source: a.source_url, file: fileOf(a.id) } : null;
  };
  const graph = buildGraph({ boards: s.boards, items: s.board_items, assets: s.assets, claims: s.claims, links: s.evidence_links, decisions: s.decisions, concepts: s.concepts, criteria: s.criteria, scores: s.scores });
  const records = <T extends RecordRow["type"]>(type: T) => selectRecords(s.records, type);
  const credited = new Map<string, string[]>();
  for (const a of s.assets) if (isCredited(a)) credited.set(a.credit!, [...(credited.get(a.credit!) ?? []), a.title]);
  const participants = records("participant");
  return {
    graphs: { nodes: graph.nodes, edges: graph.edges },
    weightage: {
      decisions: s.decisions.map((d) => {
        const concepts = s.concepts.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort);
        const criteria = s.criteria.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort);
        const scores = s.scores.filter((x) => concepts.some((c) => c.id === x.concept_id));
        const totals = weightedTotals(concepts.map((c) => c.id), criteria, scores);
        const order = ranking(totals);
        return {
          id: d.id,
          title: d.title,
          criteria: criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
          concepts: concepts.map((c) => ({ id: c.id, label: c.label, name: c.name, total: totals[c.id], rank: order.indexOf(c.id) + 1 })),
          scores: scores.map((x) => ({
            concept: x.concept_id,
            criterion: x.criterion_id,
            value: x.value,
            basis: x.is_assumption ? "guess" : "backed",
            evidence: s.evidence_links.filter((l) => l.target_type === "score" && l.target_id === x.id).map((l) => ({ ...assetRef(l.asset_id), ...evidenceWeight(l) })),
          })),
        };
      }),
    },
    moodboards: {
      boards: s.boards.map((b) => {
        const items = s.board_items.filter((i) => i.board_id === b.id);
        return {
          id: b.id,
          name: b.name,
          summary: b.share?.summary ?? null,
          sections: items.filter((i) => i.kind === "section").map((i) => ({ id: i.id, name: i.data.text ?? "", x: i.x, y: i.y, w: i.w, h: i.h })),
          notes: items.filter((i) => i.kind === "sticky" || i.kind === "text").map((i) => ({ id: i.id, kind: i.kind, text: i.data.text ?? "", x: i.x, y: i.y })),
          palettes: items.filter((i) => i.kind === "palette").map((i) => ({ id: i.id, colors: i.data.colors ?? [], caption: i.data.caption ?? null })),
          images: items.filter((i) => i.kind === "image").map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, asset: assetRef(i.asset_id) })),
          links: items.filter((i) => i.kind === "connector").map((i) => ({ from: i.data.from, to: i.data.to, kind: i.data.connector ?? "plain" })),
        };
      }),
    },
    research: {
      claims: s.claims.map((c) => {
        const links = s.evidence_links.filter((l) => l.target_type === "claim" && l.target_id === c.id);
        return { id: c.id, text: c.text, status: links.length ? "has evidence" : "assumption", evidence: links.map((l) => ({ ...evidenceWeight(l), note: l.note, source: assetRef(l.asset_id) })) };
      }),
      notes: records("note").map((n) => ({ id: n.id, title: n.data.title, body: n.data.body })),
      drafts: records("draft").map((d) => ({ id: d.id, title: d.data.title, body: d.data.body })),
      highlights: records("highlight").map((h) => ({ source: assetRef(h.data.asset_id), page: h.data.page, kind: h.data.kind, text: h.data.text })),
      interviews: records("interview_note").map((n) => ({
        participant: participants.find((p) => p.id === n.data.participant_id)?.data.code ?? null,
        theme: records("theme").find((t) => t.id === n.data.theme_id)?.data.name ?? null,
        text: n.data.text,
      })),
    },
    snips: {
      snips: s.assets.filter((a) => a.kind === "quote" || a.tags.split(/\s+/).includes("snip")).map((a) => ({ id: a.id, kind: a.kind, title: a.title, text: a.kind === "quote" ? a.notes : null, credit: isCredited(a) ? a.credit : null, source: a.source_url, captured: a.captured_at, file: fileOf(a.id) })),
    },
    contacts: {
      note: "Daiku doesn't keep an address book. This lists interview participants by code, with consent on record, and the people or organisations credited on sources.",
      participants: participants.map((p) => ({ code: p.data.code, context: p.data.context })),
      credited: [...credited].map(([name, works]) => ({ name, works })),
    },
  };
}

async function sha256(bytes: Uint8Array): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export interface ExportLayout {
  files: { path: string; dataset?: DatasetId; format?: FormatId; ending?: string; assetId?: string }[];
  images: { asset: Asset; path: string }[];
  zipName: string;
}

/** What the zip will hold, in order. Reads no files. */
export function exportLayout(state: S, plan: ExportPlan): ExportLayout {
  const s = exportScope(state, plan);
  const paths = imagePaths(state, s, plan);
  const taken = new Set(["index.json", "readme.txt", "sources.csv", ...[...paths.values()].map((p) => p.toLowerCase())]);
  const files: ExportLayout["files"] = [{ path: "README.txt" }, { path: "index.json" }, { path: "sources.csv" }];
  for (const d of DATASETS) {
    const set = plan.sets[d.id];
    if (!set.on) continue;
    const folder = cleanFolder(set.folder);
    const name = cleanName(set.file, "json", d.file);
    // Every file of a dataset shares one name, so a clash moves them all together.
    const formats = cleanFormats(d.id, set.formats);
    const endings = formats.flatMap((format) => formatEndings(d.id, format).map((ending) => ({ format, ending })));
    const clashes = (base: string) => endings.some((e) => taken.has(join(folder, `${base}${e.ending}`).toLowerCase()));
    let base = name;
    for (let n = 2; clashes(base); n++) base = `${name} ${n}`;
    for (const { format, ending } of endings) {
      const path = join(folder, `${base}${ending}`);
      taken.add(path.toLowerCase());
      files.push({ path, dataset: d.id, format, ending });
    }
  }
  const images = s.assets.filter((a) => paths.has(a.id)).map((asset) => ({ asset, path: paths.get(asset.id)! }));
  for (const i of images) files.push({ path: i.path, assetId: i.asset.id });
  return { files, images, zipName: `${cleanName(plan.zipName, "zip", "Daiku export")}.zip` };
}

export async function buildExport(state: S, plan: ExportPlan): Promise<{ bytes: Uint8Array; name: string; missing: string[] }> {
  const s = exportScope(state, plan);
  const layout = exportLayout(state, plan);
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  const placed = new Map<string, string>();
  const facts = new Map<string, { path: string; bytes: number; sha256: string | null }>();
  for (const { asset, path } of layout.images) {
    try {
      const convert = plan.images.convert;
      if (asset.kind === "image" && isExportImageFormat(convert) && convert !== "original") {
        // From what's shown, as that's the readable copy of a format like HEIC.
        const shown = mediaUrl(asset)!;
        const source = /\.png$/i.test(shown.split("?")[0]) ? "png" : extOf(asset);
        files[path] = await convertImage(await fetchBytes(shown), source, convert);
      } else {
        files[path] = await fetchBytes(fileUrl(asset)!);
      }
      placed.set(asset.id, path);
      facts.set(asset.id, { path, bytes: files[path].length, sha256: await sha256(files[path]) });
    } catch {
      missing.push(asset.title);
    }
  }
  const data = datasets(s, (id) => placed.get(id) ?? null);
  const exported_at = new Date().toISOString();
  for (const f of layout.files) {
    if (f.dataset && f.format !== "json") files[f.path] = strToU8(renderFormat(f.dataset, f.format!, data[f.dataset], s.assets)[f.ending!]);
    else if (f.dataset) files[f.path] = strToU8(JSON.stringify({ format: `daiku-${f.dataset}`, version: 1, exported_at, ...(data[f.dataset] as object) }, null, 2));
  }
  files["index.json"] = strToU8(
    JSON.stringify(
      {
        format: "daiku-export",
        version: 1,
        exported_at,
        project: projectsIn(state).find((p) => p.id === plan.scope)?.data.name ?? null,
        data: layout.files.filter((f) => f.dataset).map((f) => ({ dataset: f.dataset, file: f.path })),
        images: layout.images.filter((i) => placed.has(i.asset.id)).map((i) => ({ file: i.path, title: i.asset.title, credit: isCredited(i.asset) ? i.asset.credit : null, source: i.asset.source_url, provenance: i.asset.provenance })),
      },
      null,
      2,
    ),
  );
  files["sources.csv"] = strToU8(sourcesCsv(s.assets, facts));
  files["README.txt"] = strToU8(
    exportReadme(
      DATASETS.filter((d) => layout.files.some((f) => f.dataset === d.id)).map((d) => ({ label: d.label, why: DATASET_FORMATS[d.id].why, files: layout.files.filter((f) => f.dataset === d.id).map((f) => f.path) })),
      placed.size,
      cleanFolder(plan.images.folder),
    ),
  );
  // Photos and video are compressed already, so they're stored as they are: quicker, and no bigger.
  const zipped = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, [bytes, { level: isCompressed(path) ? 0 : 6 }] as [Uint8Array, { level: 0 | 6 }]]));
  return { bytes: zipSync(zipped), name: layout.zipName, missing };
}
