/**
 * The decision record: what was chosen, what was rejected and why, and the evidence behind the scores.
 * It's what a student hands in and what the build pack's spec draws on. Reasons are the person's own
 * words, and nothing here is generated.
 */
import { selectRecords, useStore } from "../data/store";
import { Concept, Criterion, DecisionLogData, EvidenceLink, Score } from "../data/types";
import { LabData, standing } from "./engineering";
import { checkReadiness, Readiness, sourceTypeLabel, strengthOf } from "./readiness";
import { ranking, weightedTotals } from "./scoring";
import { isCredited } from "./search";
import { stanceOf } from "./studio";

type S = ReturnType<typeof useStore.getState>;

/** Every log for a decision, oldest first. Logging again adds a new one, so earlier reasoning survives. */
export function decisionLogs(s: Pick<S, "records">, decisionId: string): (DecisionLogData & { logged_at: string })[] {
  return selectRecords(s.records, "decision_log")
    .filter((l) => l.data.decision_id === decisionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((l) => ({ ...l.data, logged_at: l.created_at }));
}

const sorted = <T extends { sort: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort - b.sort);

function parts(s: Pick<S, "concepts" | "criteria" | "scores">, decisionId: string) {
  const concepts: Concept[] = sorted(s.concepts.filter((c) => c.decision_id === decisionId));
  const criteria: Criterion[] = sorted(s.criteria.filter((c) => c.decision_id === decisionId));
  const scores: Score[] = s.scores.filter((x) => concepts.some((c) => c.id === x.concept_id));
  return { concepts, criteria, scores };
}

/** Frozen into the log, so the record can tell when the matrix has moved on. */
export function matrixTotals(s: Pick<S, "concepts" | "criteria" | "scores">, decisionId: string): Record<string, number> {
  const { concepts, criteria, scores } = parts(s, decisionId);
  return weightedTotals(concepts.map((c) => c.id), criteria, scores);
}

export function readinessFor(s: Pick<S, "concepts" | "criteria" | "scores" | "evidence_links" | "assets" | "claims" | "records" | "decisions">, decisionId: string): Readiness {
  const { concepts, criteria, scores } = parts(s, decisionId);
  const reqs = selectRecords(s.records, "requirement", decisionId).map((r) => r.data);
  const lab: LabData = {
    parts: selectRecords(s.records, "part", decisionId).map((p) => p.data),
    calcs: selectRecords(s.records, "calc", decisionId).map((c) => ({ id: c.id, data: c.data })),
    runs: selectRecords(s.records, "sim_run", decisionId).map((r) => r.data),
  };
  return checkReadiness({
    decisionBoardId: s.decisions.find((d) => d.id === decisionId)?.board_id ?? null,
    concepts,
    criteria,
    scores,
    links: s.evidence_links,
    assets: s.assets,
    claims: s.claims,
    logs: decisionLogs(s, decisionId),
    failedMust: (id) => standing(reqs, id, lab).failedMust,
  });
}

/** One line of the evidence table, with the rating left blank when nobody has rated it. */
export interface EvidenceRow {
  link: EvidenceLink;
  concept: Concept;
  criterion: Criterion;
  value: number;
  title: string;
  credit: string | null;
}

/** A link whose source was left out of a pack has no asset, so it drops out here and names nothing. */
export function evidenceRows(s: Pick<S, "concepts" | "criteria" | "scores" | "evidence_links" | "assets">, decisionId: string): EvidenceRow[] {
  const { concepts, criteria, scores } = parts(s, decisionId);
  const rows: EvidenceRow[] = [];
  for (const criterion of criteria) {
    for (const concept of concepts) {
      const score = scores.find((x) => x.concept_id === concept.id && x.criterion_id === criterion.id);
      if (!score) continue;
      for (const link of s.evidence_links.filter((l) => l.target_type === "score" && l.target_id === score.id)) {
        const asset = s.assets.find((a) => a.id === link.asset_id);
        if (asset) rows.push({ link, concept, criterion, value: score.value, title: asset.title, credit: isCredited(asset) ? asset.credit : null });
      }
    }
  }
  return rows;
}

const cell = (text: string | number) => String(text).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
const row = (cells: (string | number)[]) => `| ${cells.map(cell).join(" | ")} |`;
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The chosen and rejected concepts, in the person's words. Shared by the record and the vault. */
export function reasoningMarkdown(log: DecisionLogData): string {
  const rejected = log.rejected ?? [];
  return [`## Chosen`, "", `**${log.title.replace(/^Chose /, "")}**`, "", log.reason, ...(rejected.length ? ["", "## Rejected", "", ...rejected.map((r) => `- **${r.label}: ${r.name}.** ${oneLine(r.reason)}`)] : [])].join("\n");
}

/** The evidence table, with unrated cards called what they are. */
export function evidenceMarkdown(rows: EvidenceRow[]): string {
  if (!rows.length) return "No evidence is linked to these scores.";
  return [
    row(["Criterion", "Concept", "Score", "Source", "Stance", "Strength", "Type", "Limitations", "How it was weighed"]),
    row(Array(9).fill("---")),
    ...rows.map((r) =>
      row([
        r.criterion.name,
        r.concept.label,
        r.value,
        r.credit ? `${r.title} (${r.credit})` : `${r.title} (no credit yet)`,
        stanceOf(r.link),
        strengthOf(r.link) ?? "not rated",
        sourceTypeLabel(r.link) ?? "not given",
        r.link.limitation?.trim() || "none noted",
        stanceOf(r.link) === "against" ? r.link.note?.trim() || "not yet weighed" : "",
      ]),
    ),
  ].join("\n");
}

/** The whole record, ready to hand in. It reports the readiness result rather than hiding a failure. */
export function recordMarkdown(s: Parameters<typeof readinessFor>[0], decisionId: string): string {
  const decision = s.decisions.find((d) => d.id === decisionId);
  if (!decision) return "";
  const { concepts, criteria, scores } = parts(s, decisionId);
  const logs = decisionLogs(s, decisionId);
  const log = logs[logs.length - 1];
  const totals = weightedTotals(concepts.map((c) => c.id), criteria, scores);
  const order = ranking(totals);
  const readiness = readinessFor(s, decisionId);
  const open = [...readiness.blockers, ...readiness.warnings];
  const verdict = readiness.status === "ready" ? "Ready: every readiness rule passes." : readiness.status === "notes" ? "Ready, with points to check." : "Not ready: there are problems to fix.";
  const earlier = logs.slice(0, -1);
  return `# Decision record: ${decision.title}

${log ? `Logged ${log.logged_at.slice(0, 10)}.\n\n${reasoningMarkdown(log)}` : "No decision has been logged yet."}

## Scores

${row(["Criterion", "Weight", ...concepts.map((c) => `${c.label}: ${c.name}`)])}
${row(["---", "---", ...concepts.map(() => "---")])}
${criteria
  .map((q) =>
    row([
      q.name,
      `${Math.round(q.weight * 1000) / 10}%`,
      ...concepts.map((c) => {
        const x = scores.find((v) => v.concept_id === c.id && v.criterion_id === q.id);
        return x ? `${x.value}${x.is_assumption ? " (guess)" : ""}` : "–";
      }),
    ]),
  )
  .join("\n")}
${row(["Weighted total", "", ...concepts.map((c) => `${totals[c.id].toFixed(2)}${order[0] === c.id ? " (highest)" : ""}`)])}

## Evidence

${evidenceMarkdown(evidenceRows(s, decisionId))}

## Readiness check

${verdict} These rules check that the record is complete and traceable, not that the choice is right.
${open.length ? `\n${open.map((f) => `- ${f.text}`).join("\n")}\n` : ""}${
    earlier.length
      ? `
## Earlier records

${earlier.map((l) => `- ${l.logged_at.slice(0, 10)}, ${l.title}: ${oneLine(l.reason)}`).join("\n")}
`
      : ""
  }`;
}

/** Lines for the build pack's spec: only the current record per decision, so old choices don't read as live. */
export function decisionsForSpec(s: Pick<S, "records" | "decisions">): string[] {
  return s.decisions.flatMap((d) => {
    const logs = decisionLogs(s, d.id);
    const log = logs[logs.length - 1];
    if (!log) return [];
    return [`${log.title}${log.reason ? `: ${oneLine(log.reason)}` : ""}`, ...(log.rejected ?? []).map((r) => `Rejected ${r.label}: ${r.name}: ${oneLine(r.reason)}`)];
  });
}
