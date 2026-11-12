/** Obsidian vault and project export: Markdown with YAML, JSON Canvas boards, and original files. */
import { strToU8, zipSync } from "fflate";
import { selectRecords, useStore } from "../data/store";
import { Asset, BoardItem, TABLES } from "../data/types";
import { meets, requirementValue, runCalc, safetyFactor, targetText } from "./engineering";
import { fileUrl } from "./platform";
import { fetchBytes } from "./saveFile";
import { HISTORY_ID, INTERVIEWS_ID, PROGRESS_ID } from "./packPlan";
import { evidenceMarkdown, evidenceRows } from "./decisionRecord";
import { isCredited } from "./search";
import { bibEntry, frontMatter, safeFileName, stanceOf, toCsv } from "./studio";
import { fence, languageOf } from "./github";

type S = ReturnType<typeof useStore.getState>;

export const extOf = (asset: Asset) => /\.([a-z0-9]+)(?:$|\?)/i.exec(asset.file_path ?? asset.preview ?? "")?.[1] ?? (asset.preview ? "svg" : "bin");

export function canvasFor(items: BoardItem[], fileFor: (assetId: string) => string | null): string {
  const nodes: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  for (const i of items) {
    const box = { id: i.id, x: Math.round(i.x), y: Math.round(i.y), width: Math.round(i.w), height: Math.round(i.h) };
    if (i.kind === "section") nodes.push({ ...box, type: "group", label: i.data.text ?? "" });
    else if (i.kind === "image") {
      const file = i.asset_id ? fileFor(i.asset_id) : null;
      nodes.push(file ? { ...box, type: "file", file } : { ...box, type: "text", text: i.data.caption ?? "Removed image" });
    } else if (i.kind === "connector") {
      if (i.data.from && i.data.to) {
        edges.push({ id: i.id, fromNode: i.data.from, toNode: i.data.to, toEnd: "arrow", ...(i.data.connector && i.data.connector !== "plain" ? { label: i.data.connector } : {}) });
      }
    } else if (i.kind === "stroke" || (i.kind === "shape" && !i.data.text)) {
      continue;
    } else nodes.push({ ...box, type: "text", text: i.data.text ?? (i.data.colors ?? []).join(" ") });
  }
  const known = new Set(nodes.map((n) => n.id));
  return JSON.stringify({ nodes, edges: edges.filter((e) => known.has(e.fromNode) && known.has(e.toNode)) }, null, 2);
}

/** A file name no other object in this folder is using. */
const uniquely = (used: Set<string>, name: string) => {
  let out = name;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${name} ${n}`;
  used.add(out.toLowerCase());
  return out;
};

export async function buildVault(s: S): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const { files, missing } = await vaultFiles(s);
  return { bytes: zipSync(files, { level: 6 }), missing };
}

/** The vault's contents as files. `attachments` maps each asset to where its file went. */
export async function vaultFiles(s: S, options: { attachments: boolean } = { attachments: true }) {
  const files: Record<string, Uint8Array> = {};
  const text = (path: string, body: string) => {
    files[path] = strToU8(body);
  };
  const missing: string[] = [];
  /** Where each thing ended up, so a pack can arrange them. */
  const paths = new Map<string, string>();

  // Attachments
  const attachments = new Map<string, string>();
  const usedAttachments = new Set<string>();
  for (const a of s.assets) {
    const url = options.attachments ? fileUrl(a) : null;
    if (!url) continue;
    const name = `${uniquely(usedAttachments, safeFileName(a.title))}.${extOf(a)}`;
    try {
      files[`attachments/${name}`] = await fetchBytes(url);
      attachments.set(a.id, `attachments/${name}`);
    } catch {
      missing.push(a.title);
    }
  }

  // Library items keep credit and source as properties.
  const usedSources = new Set<string>();
  const sourceNames = new Map<string, string>();
  for (const a of s.assets) {
    const name = uniquely(usedSources, safeFileName(a.title));
    sourceNames.set(a.id, name);
    const file = attachments.get(a.id);
    const marks = selectRecords(s.records, "highlight", a.id).sort((x, y) => x.data.page - y.data.page);
    const marked = marks.length ? `\n## Highlights\n\n${marks.map((h) => `- p. ${h.data.page} (${h.data.kind}): ${h.data.text}`).join("\n")}\n` : "";
    paths.set(a.id, `Sources/${name}.md`);
    text(
      `Sources/${name}.md`,
      frontMatter({ daiku_id: a.id, type: "source", kind: a.kind, credit: isCredited(a) ? a.credit : "no source yet", source: a.source_url, captured: a.captured_at, provenance: a.provenance }) +
        `\n# ${a.title}\n\n${file ? `![[${file}]]\n\n` : ""}${a.kind === "code" ? `${a.via ? `From ${a.via}.\n\n` : ""}${fence(a.notes, languageOf(a))}` : a.notes}\n${marked}`,
    );
  }

  // Notes keep their wikilinks as written.
  const usedNotes = new Set<string>();
  for (const n of selectRecords(s.records, "note")) {
    const path = `Notes/${uniquely(usedNotes, safeFileName(n.data.title))}.md`;
    paths.set(n.id, path);
    text(path, frontMatter({ daiku_id: n.id, type: "note" }) + `\n${n.data.body}\n`);
  }

  // Claims link to their evidence, and the relationship survives as a property.
  const usedClaims = new Set<string>();
  for (const c of s.claims) {
    const own = s.evidence_links.filter((l) => l.target_type === "claim" && l.target_id === c.id);
    const lines = own.map((l) => {
      const source = sourceNames.get(l.asset_id);
      return `- ${stanceOf(l) === "for" ? "supports" : "contradicts"}:: ${source ? `[[${source}]]` : "a source that isn't in this export"}${l.note ? ` (${l.note})` : ""}`;
    });
    const claimPath = `Claims/${uniquely(usedClaims, safeFileName(c.text))}.md`;
    paths.set(c.id, claimPath);
    text(claimPath, frontMatter({ daiku_id: c.id, type: "claim", evidence_state: own.length ? "backed" : "assumption" }) + `\n# ${c.text}\n\n${lines.join("\n")}\n`);
  }

  // Decisions: live analysis becomes a snapshot, frozen at export time, and says so.
  const usedDecisions = new Set<string>();
  for (const d of s.decisions) {
    const concepts = s.concepts.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort);
    const criteria = s.criteria.filter((c) => c.decision_id === d.id).sort((a, b) => a.sort - b.sort);
    const row = (cells: (string | number)[]) => `| ${cells.map((c) => String(c).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`;
    const matrix = [
      row(["Criterion", "Weight", ...concepts.map((c) => `${c.label}: ${c.name}`)]),
      row(["---", "---", ...concepts.map(() => "---")]),
      ...criteria.map((q) =>
        row([
          q.name,
          `${Math.round(q.weight * 100)}%`,
          ...concepts.map((c) => {
            const x = s.scores.find((v) => v.concept_id === c.id && v.criterion_id === q.id);
            return x ? `${x.value}${x.is_assumption ? " (guess)" : ""}` : "–";
          }),
        ]),
      ),
    ];
    const lab = {
      parts: selectRecords(s.records, "part", d.id).map((p) => p.data),
      calcs: selectRecords(s.records, "calc", d.id).map((c) => ({ id: c.id, data: c.data })),
      runs: selectRecords(s.records, "sim_run", d.id).map((r) => r.data),
    };
    const reqs = selectRecords(s.records, "requirement", d.id);
    const reqTable = reqs.length
      ? [
          "## Requirements",
          "",
          row(["ID", "Requirement", "Target", ...concepts.map((c) => c.label)]),
          row(["---", "---", "---", ...concepts.map(() => "---")]),
          ...reqs.map((r) => row([r.data.code, r.data.text, targetText(r.data), ...concepts.map((c) => meets(r.data, requirementValue(r.data, c.id, lab).value))])),
          "",
        ]
      : [];
    const logged = selectRecords(s.records, "decision_log").filter((l) => l.data.decision_id === d.id);
    const labelOf = (id: string) => concepts.find((c) => c.id === id)?.label ?? "–";
    const calcResult = (data: (typeof lab.calcs)[number]["data"]) => {
      const r = runCalc(data);
      return r.ok ? `${Math.round(r.value * 1000) / 1000} ${data.unit}`.trim() : `error: ${r.error}`;
    };
    const engineering = [
      lab.parts.length
        ? [
            "## Parts (BOM)",
            "",
            row(["Concept", "Part", "Material", "Qty", "Mass", "Cost", "Basis"]),
            row(["---", "---", "---", "---", "---", "---", "---"]),
            ...lab.parts.map((p) => {
              const calc = lab.calcs.find((c) => c.id === p.calc_id);
              const mass = calc ? `${calcResult(calc.data)} (${calc.data.code})` : p.mass_kg === null ? "unknown" : `${p.mass_kg} kg`;
              return row([labelOf(p.concept_id), p.name, p.material, p.qty, mass, p.cost, p.basis]);
            }),
            "",
          ]
        : [],
      lab.calcs.length
        ? [
            "## Calculations",
            "",
            ...lab.calcs.map(({ data: c }) => `- ${c.code} ${c.title}: ${c.formula} with ${c.inputs.map((i) => `${i.name} = ${i.expr}`).join(", ") || "no inputs"} gives ${calcResult(c)}${c.basis ? ` (basis: ${c.basis})` : ""}`),
            "",
          ]
        : [],
      selectRecords(s.records, "material", d.id).length
        ? [
            "## Materials",
            "",
            ...selectRecords(s.records, "material", d.id).map((m) => `- ${m.data.name}: ${m.data.props.map((p) => `${p.name} ${p.value}`).join(", ") || "no properties yet"}${m.data.source ? ` (source: ${m.data.source})` : " (no source yet)"}`),
            "",
          ]
        : [],
      lab.runs.length
        ? [
            "## Simulation runs",
            "",
            ...lab.runs.map((r) => {
              const sf = safetyFactor(r);
              return `- ${r.name}, concept ${labelOf(r.concept_id)}: ${r.status}, ${r.solver || "solver not given"}, ${r.load_case || "load case not given"}, stress ${r.max_stress_mpa ?? "?"} of ${r.allowable_mpa ?? "?"} MPa, deflection ${r.deflection_mm ?? "?"} mm${sf === null ? "" : `, safety factor ${sf.toFixed(2)}`}`;
            }),
            "",
          ]
        : [],
    ].flat();
    const decisionPath = `Decisions/${uniquely(usedDecisions, safeFileName(d.title))}.md`;
    paths.set(d.id, decisionPath);
    text(
      decisionPath,
      frontMatter({ daiku_id: d.id, type: "decision", frozen_at: new Date().toISOString() }) +
        `\n# ${d.title}\n\n> Snapshot from Daiku. Values were frozen at export, because Obsidian doesn't run the analysis.\n\n${matrix.join("\n")}\n\n${reqTable.join("\n")}${engineering.length ? `${engineering.join("\n")}\n` : ""}${evidenceRows(s, d.id).length ? `## Evidence\n\n${evidenceMarkdown(evidenceRows(s, d.id))}\n\n` : ""}${logged.map((l) => `## Logged: ${l.data.title}\n\n${l.data.reason}\n${(l.data.rejected ?? []).map((r) => `\n- Rejected ${r.label}: ${r.name}. ${r.reason}`).join("")}${l.data.rejected?.length ? "\n" : ""}`).join("\n")}`,
    );
  }

  // Boards, in the open JSON Canvas format.
  const usedBoards = new Set<string>();
  for (const b of s.boards) {
    const name = uniquely(usedBoards, safeFileName(b.name));
    text(`Boards/${name}.canvas`, canvasFor(s.board_items.filter((i) => i.board_id === b.id), (id) => attachments.get(id) ?? null));
  }

  // Interviews, by theme. Participants only ever appear by code.
  const interviewNotes = selectRecords(s.records, "interview_note");
  if (interviewNotes.length) {
    const participants = selectRecords(s.records, "participant");
    const codeOf = (id: string) => participants.find((p) => p.id === id)?.data.code ?? "?";
    const themes = selectRecords(s.records, "theme");
    const under = (id: string | null) => interviewNotes.filter((n) => n.data.theme_id === id).map((n) => `- ${codeOf(n.data.participant_id)}: ${n.data.text}`);
    const blocks = [...themes.map((t) => ({ name: t.data.name, lines: under(t.id) })), { name: "No theme yet", lines: under(null) }].filter((b) => b.lines.length);
    paths.set(INTERVIEWS_ID, "Research/Interviews.md");
    text(
      "Research/Interviews.md",
      `# Interview notes\n\n## Participants\n\n${participants.map((p) => `- ${p.data.code}${p.data.context ? `: ${p.data.context}` : ""}`).join("\n")}\n\n${blocks.map((b) => `## ${b.name}\n\n${b.lines.join("\n")}\n`).join("\n")}`,
    );
  }

  const usedDrafts = new Set<string>();
  for (const draft of selectRecords(s.records, "draft")) {
    const path = `Drafts/${uniquely(usedDrafts, safeFileName(draft.data.title))}.md`;
    paths.set(draft.id, path);
    text(path, `# ${draft.data.title}\n\n${draft.data.body}\n`);
  }

  const usedDecks = new Set<string>();
  for (const deck of selectRecords(s.records, "deck")) {
    const path = `Decks/${uniquely(usedDecks, safeFileName(deck.data.title))}.md`;
    paths.set(deck.id, path);
    text(path, `# ${deck.data.title}\n\n${deck.data.slides.map((sl, i) => `## ${i + 1}. ${sl.title}\n\n${sl.body}${sl.notes ? `\n\nSpeaker notes: ${sl.notes}` : ""}\n`).join("\n")}`);
  }

  const milestones = selectRecords(s.records, "milestone");
  const checks = selectRecords(s.records, "check");
  if (milestones.length || checks.length) {
    paths.set(PROGRESS_ID, "Progress.md");
    text(
      "Progress.md",
      `# Progress\n\n${milestones.length ? `## Milestones\n\n${milestones.map((m) => `- ${m.data.date}: ${m.data.title} (gate: ${m.data.gate.replace(/_/g, " ")})`).join("\n")}\n\n` : ""}${checks.length ? `## Saved checks\n\n${checks.map((c) => `- ${c.data.label}: ${Object.entries(c.data.counts).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}`).join("\n")}\n` : ""}`,
    );
  }

  // The log, the references, and everything as plain JSON so nothing is locked in.
  paths.set(HISTORY_ID, "Workflow log.md");
  const log = [...s.workflow_log].sort((a, b) => a.at.localeCompare(b.at));
  text("Workflow log.md", `# Workflow log\n\n${log.map((e) => `- ${e.at.slice(0, 16).replace("T", " ")} · ${e.actor} · ${e.summary}${e.why ? ` · why: ${e.why}` : ""}`).join("\n")}\n`);
  text("workflow-log.csv", toCsv([["at", "who", "action", "type", "summary", "before", "after", "why"], ...log.map((e) => [e.at, e.actor, e.action, e.target_type, e.summary, e.before, e.after, e.why])]));
  text("references.bib", s.assets.filter((a) => a.kind === "pdf" || a.source_url).map(bibEntry).join("\n\n") + "\n");
  const project: Record<string, unknown> = { format: "daiku-project", version: 1, exported_at: new Date().toISOString() };
  for (const t of TABLES) if (t !== "settings") project[t] = s[t];
  text("project.json", JSON.stringify(project, null, 2));
  return { files, missing, attachments, paths };
}
