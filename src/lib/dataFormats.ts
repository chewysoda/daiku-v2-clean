/**
 * Not everything belongs in JSON. Scores are for a spreadsheet, research is for reading, and a graph
 * is for graph tools, so each kind of data gets the formats that suit it. JSON stays on offer as the
 * complete copy. Photos, PDFs, video and 3D models are never put inside any of these: they stay as
 * their original files, and these formats only point to them.
 */
import { Asset } from "../data/types";
import { pythonModule } from "./imageFormats";
import { isCredited } from "./search";
import { bibEntry, toCsv } from "./studio";

export type FormatId = "json" | "csv" | "md" | "graphml" | "bib" | "py";

export const FORMAT_LABEL: Record<FormatId, { label: string; hint: string }> = {
  json: { label: "JSON", hint: "Complete and exact, for code and for bringing back in" },
  csv: { label: "CSV", hint: "Opens in Excel, Sheets or anything else with rows" },
  md: { label: "Markdown", hint: "For reading, and for Obsidian or Claude" },
  graphml: { label: "GraphML", hint: "Opens in Gephi, yEd and other graph tools" },
  py: { label: "Python", hint: "A .py file of plain data, to import into a script. Nothing in it runs" },
  bib: { label: "BibTeX", hint: "References for Zotero, LaTeX and citation managers" },
};

/** What each kind of data can be written as, and what's on until you say otherwise. */
export const DATASET_FORMATS: Record<string, { offered: FormatId[]; standard: FormatId[]; why: string }> = {
  graphs: { offered: ["json", "csv", "graphml", "py"], standard: ["json", "csv", "graphml"], why: "a network, so graph tools can open it, and a spreadsheet can list it" },
  weightage: { offered: ["json", "csv", "md", "py"], standard: ["json", "csv"], why: "numbers in rows, so a spreadsheet can check and rework them" },
  moodboards: { offered: ["json", "md", "py"], standard: ["json", "md"], why: "mostly words and pictures, which read better as a document" },
  research: { offered: ["json", "md", "bib", "py"], standard: ["json", "md", "bib"], why: "writing to read, plus references to cite" },
  snips: { offered: ["json", "md", "py"], standard: ["json", "md"], why: "quotes to read, with the snipped pictures as files" },
  contacts: { offered: ["json", "csv", "py"], standard: ["json", "csv"], why: "a list of people, which suits a spreadsheet" },
};

/** The files a format makes, as endings on the dataset's name. */
export function formatEndings(dataset: string, format: FormatId): string[] {
  if (format === "csv" && dataset === "graphs") return ["-nodes.csv", "-edges.csv"];
  return [`.${format}`];
}

export const cleanFormats = (dataset: string, saved: unknown): FormatId[] => {
  const spec = DATASET_FORMATS[dataset];
  if (!Array.isArray(saved)) return spec.standard;
  return spec.offered.filter((f) => saved.includes(f));
};

const xml = (text: unknown) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // XML can't hold most control characters at all, even escaped.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

interface GraphData {
  nodes: { id: string; label: string; type: string; gap: boolean }[];
  edges: { id: string; source: string; target: string; kind: string; strength?: string | null }[];
}

function graphml(g: GraphData): string {
  const ids = new Set(g.nodes.map((n) => n.id));
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="type" for="node" attr.name="type" attr.type="string"/>
  <key id="unsupported" for="node" attr.name="unsupported" attr.type="boolean"/>
  <key id="kind" for="edge" attr.name="kind" attr.type="string"/>
  <key id="strength" for="edge" attr.name="strength" attr.type="string"/>
  <graph edgedefault="directed">
${g.nodes
  .map((n) => `    <node id="${xml(n.id)}"><data key="label">${xml(n.label)}</data><data key="type">${xml(n.type)}</data><data key="unsupported">${n.gap}</data></node>`)
  .join("\n")}
${g.edges
  .filter((e) => ids.has(e.source) && ids.has(e.target))
  .map((e) => `    <edge id="${xml(e.id)}" source="${xml(e.source)}" target="${xml(e.target)}"><data key="kind">${xml(e.kind)}</data>${e.strength ? `<data key="strength">${xml(e.strength)}</data>` : ""}</edge>`)
  .join("\n")}
  </graph>
</graphml>
`;
}

interface WeightageData {
  decisions: {
    title: string;
    criteria: { id: string; name: string; weight: number }[];
    concepts: { id: string; label: string; name: string; total: number; rank: number }[];
    scores: { concept: string; criterion: string; value: number; basis: string; evidence: ({ title: string } | null)[] }[];
  }[];
}

function weightageCsv(w: WeightageData): string {
  const rows: (string | number)[][] = [["decision", "criterion", "weight", "concept", "score", "basis", "evidence", "concept total", "concept rank"]];
  for (const d of w.decisions) {
    for (const q of d.criteria) {
      for (const c of d.concepts) {
        const s = d.scores.find((x) => x.concept === c.id && x.criterion === q.id);
        // A cell with no score stays empty, as a zero would read as a real, very low score.
        rows.push([d.title, q.name, q.weight, `${c.label}: ${c.name}`, s?.value ?? "", s?.basis ?? "not scored", (s?.evidence ?? []).map((e) => e?.title ?? "").filter(Boolean).join("; "), c.total, c.rank]);
      }
    }
  }
  return toCsv(rows as string[][]);
}

function weightageMd(w: WeightageData): string {
  return `# Weightage\n\n${w.decisions
    .map((d) => {
      const head = ["Criterion", "Weight", ...d.concepts.map((c) => `${c.label}: ${c.name}`)];
      const body = d.criteria.map((q) => [
        q.name,
        `${Math.round(q.weight * 100)}%`,
        ...d.concepts.map((c) => {
          const s = d.scores.find((x) => x.concept === c.id && x.criterion === q.id);
          return s ? `${s.value}${s.basis === "guess" ? " (guess)" : ""}` : "–";
        }),
      ]);
      const totals = ["**Total**", "", ...d.concepts.map((c) => `**${c.total.toFixed(2)}**`)];
      const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
      return `## ${d.title}\n\n${[row(head), row(head.map(() => "---")), ...body.map(row), row(totals)].join("\n")}`;
    })
    .join("\n\n")}\n`;
}

type AssetRef = { title: string; credit: string | null; source: string | null; file: string | null } | null;

const refLine = (a: AssetRef) => (a ? `${a.title} (${a.credit ? `credit: ${a.credit}` : "no source yet"})${a.file ? `, file: ${a.file}` : ""}${a.source ? `, source: ${a.source}` : ""}` : "file removed");

function moodboardsMd(m: {
  boards: { name: string; summary: string | null; sections: { name: string }[]; notes: { text: string }[]; palettes: { colors: string[]; caption: string | null }[]; images: { asset: AssetRef }[] }[];
}): string {
  return `# Mood boards\n\n${m.boards
    .map((b) =>
      [
        `## ${b.name}`,
        b.summary ?? "",
        b.sections.length ? `Sections: ${b.sections.map((s) => s.name).filter(Boolean).join(", ")}` : "",
        b.notes.length ? `### Notes\n\n${b.notes.map((n) => `- ${n.text.replace(/\s*\n\s*/g, " ")}`).join("\n")}` : "",
        b.images.length ? `### Pictures\n\n${b.images.map((i) => `- ${refLine(i.asset)}`).join("\n")}` : "",
        b.palettes.length ? `### Palettes\n\n${b.palettes.map((p) => `- ${p.caption ? `${p.caption}: ` : ""}${p.colors.join(", ")}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .join("\n\n")}\n`;
}

function researchMd(r: {
  claims: { text: string; status: string; evidence: { stance: string; source?: AssetRef; note?: string }[] }[];
  notes: { title: string; body: string }[];
  drafts: { title: string; body: string }[];
  highlights: { source: AssetRef; page: number; text: string }[];
  interviews: { participant: string | null; theme: string | null; text: string }[];
}): string {
  const part = (title: string, body: string[]) => (body.length ? [`## ${title}`, ...body].join("\n\n") : "");
  return `${[
    "# Research",
    part("Claims", r.claims.map((c) => `### ${c.text}\n\n${c.evidence.length ? c.evidence.map((e) => `- ${e.stance}: ${e.source ? refLine(e.source) : "a source"}${e.note ? `. ${e.note}` : ""}`).join("\n") : "*No evidence yet, so this is still an assumption.*"}`)),
    part("Notes", r.notes.map((n) => `### ${n.title}\n\n${n.body}`)),
    part("Drafts", r.drafts.map((n) => `### ${n.title}\n\n${n.body}`)),
    part("Highlights", r.highlights.map((h) => `> ${h.text.replace(/\n/g, " ")}\n\n${refLine(h.source)}, p. ${h.page}`)),
    part("Interviews", r.interviews.map((i) => `- ${i.participant ?? "Unknown"}${i.theme ? ` (${i.theme})` : ""}: ${i.text.replace(/\s*\n\s*/g, " ")}`)),
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}

function snipsMd(s: { snips: { kind: string; title: string; text?: string; notes?: string; credit: string | null; source: string | null; file?: string | null }[] }): string {
  return `# Snips and quotes\n\n${s.snips
    .map((x) => {
      const said = x.text ?? x.notes;
      return `## ${x.title}\n\n${said ? `> ${said.replace(/\n/g, "\n> ")}\n\n` : ""}${x.file ? `File: ${x.file}\n\n` : ""}${x.credit ? `Credit: ${x.credit}` : "No source yet"}${x.source ? `\n\nSource: ${x.source}` : ""}`;
    })
    .join("\n\n")}\n`;
}

function contactsCsv(c: { participants: { code: string; context: string }[]; credited: { name: string; works: string[] }[] }): string {
  return toCsv([
    ["type", "name or code", "context or works"],
    ...c.participants.map((p) => ["interview participant", p.code, p.context]),
    ...c.credited.map((p) => ["credited", p.name, p.works.join("; ")]),
  ]);
}

/** One dataset in one format, as text per ending. `assets` is for references, which come from the Library itself. */
export function renderFormat(dataset: string, format: FormatId, data: unknown, assets: Asset[]): Record<string, string> {
  const d = data as never;
  if (format === "py") return { ".py": pythonModule(dataset, data) };
  if (dataset === "graphs" && format === "graphml") return { ".graphml": graphml(d) };
  if (dataset === "graphs" && format === "csv") {
    const g = data as GraphData;
    return {
      "-nodes.csv": toCsv([["id", "label", "type", "unsupported"], ...g.nodes.map((n) => [n.id, n.label, n.type, String(n.gap)])]),
      "-edges.csv": toCsv([["source", "target", "kind", "strength"], ...g.edges.map((e) => [e.source, e.target, e.kind, e.strength ?? ""])]),
    };
  }
  if (dataset === "weightage" && format === "csv") return { ".csv": weightageCsv(d) };
  if (dataset === "weightage" && format === "md") return { ".md": weightageMd(d) };
  if (dataset === "moodboards" && format === "md") return { ".md": moodboardsMd(d) };
  if (dataset === "research" && format === "md") return { ".md": researchMd(d) };
  if (dataset === "research" && format === "bib") return { ".bib": `${assets.filter((a) => a.kind === "pdf" || a.source_url).map(bibEntry).join("\n\n")}\n` };
  if (dataset === "snips" && format === "md") return { ".md": snipsMd(d) };
  if (dataset === "contacts" && format === "csv") return { ".csv": contactsCsv(d) };
  throw new Error(`${dataset} can't be written as ${format}`);
}

/** Every saved thing, including links and quotes that have no file, with where its file went if it has one. */
export function sourcesCsv(assets: Asset[], placed: Map<string, { path: string; bytes: number; sha256: string | null }>): string {
  return toCsv([
    ["title", "kind", "file", "size in bytes", "sha256", "credit", "source", "how it was made"],
    ...assets.map((a) => {
      const file = placed.get(a.id);
      return [a.title, a.kind, file?.path ?? "", file ? String(file.bytes) : "", file?.sha256 ?? "", isCredited(a) ? a.credit! : "no source yet", a.source_url ?? "", a.provenance];
    }),
  ]);
}

/** These are compressed already, so squeezing them again costs time and saves nothing. */
export const isCompressed = (path: string) => /\.(jpe?g|png|webp|avif|gif|mp4|webm|mov|mkv|mp3|zip|glb|woff2?)$/i.test(path);

export function exportReadme(sets: { label: string; why: string; files: string[] }[], fileCount: number, folder: string): string {
  return `What's in this export
=====================

Made by Daiku. Nothing here has been sent anywhere.

DATA
${sets.map((s) => `${s.label}: ${s.why}.\n  ${s.files.join("\n  ")}`).join("\n\n") || "(none chosen)"}

FILES
${fileCount ? `${fileCount} original file${fileCount === 1 ? "" : "s"}, in ${folder || "this folder"}, exactly as they were saved.` : "No files chosen."}
Pictures, PDFs, video and 3D models stay as themselves: they can't sensibly go inside a data file, so the
data refers to them by path instead.

sources.csv lists everything saved, including links and quotes with no file, with its credit and source.
"no source yet" means the rights are unknown, so find one before using that file in anything public.

A score marked "guess" is an assumption and not a finding. index.json lists all of this for code to read.
`;
}
