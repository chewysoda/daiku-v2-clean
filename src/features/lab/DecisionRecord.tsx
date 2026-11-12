import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { decisionLogs, evidenceRows, readinessFor, recordMarkdown } from "../../lib/decisionRecord";
import { Finding, FindingRule, FindingTarget, sourceTypeLabel, strengthOf } from "../../lib/readiness";
import { saveText } from "../../lib/saveFile";
import { ranking, weightedTotals } from "../../lib/scoring";
import { safeFileName, stanceOf } from "../../lib/studio";
import { LogDecision, Shell } from "./Engineering";

const HEADING = { ready: "Ready to hand in.", notes: "Ready, with points to check.", blocked: "Not ready yet." };

/** Past this many of one kind, a list of near-identical lines stops being readable. */
const COLLAPSE_OVER = 3;
const SUMMARY: Partial<Record<FindingRule, (n: number) => string>> = {
  unrated_evidence: (n) => `${n} pieces of evidence need a strength rating or source type`,
  no_limitation: (n) => `${n} pieces of evidence have no note on their limitations`,
  unsupported_score: (n) => `${n} scores have no source backing them`,
  criterion_no_evidence: (n) => `${n} criteria have no evidence behind them`,
  unscored: (n) => `${n} scores are missing`,
  contradiction: (n) => `${n} places have sources for and against`,
  weak_only: (n) => `${n} scores rest only on weak evidence`,
  no_credit: (n) => `${n} sources have no credit`,
  claim_no_evidence: (n) => `${n} of this project's claims have no evidence`,
  no_rejection_reason: (n) => `${n} rejected concepts have no reason`,
};

function FindingList({ title, findings, decisionId }: { title: string; findings: Finding[]; decisionId: string }) {
  const where: Record<FindingTarget, { to: string; label: string } | null> = {
    matrix: { to: `/decide/${decisionId}`, label: "Matrix" },
    requirements: { to: `/decide/${decisionId}/requirements`, label: "Requirements" },
    claims: { to: "/explore/claims", label: "Claims" },
    record: null,
  };
  if (!findings.length) return null;
  const groups = [...new Set(findings.map((f) => f.rule))].map((rule) => findings.filter((f) => f.rule === rule));
  const row = (f: Finding, i: number) => {
    const link = where[f.to];
    return (
      <li key={i} data-rule={f.rule}>
        <span>{f.text}</span>
        {link && (
          <Link className="ready-go" to={link.to}>
            {link.label}
          </Link>
        )}
      </li>
    );
  };
  return (
    <div className="ready-group">
      <span className="cap">
        {title} · {findings.length}
      </span>
      <ul className="ready-list">
        {groups.map((group) =>
          group.length > COLLAPSE_OVER ? (
            <li key={group[0].rule} className="ready-many" data-rule={group[0].rule}>
              <details>
                <summary>{SUMMARY[group[0].rule]?.(group.length) ?? `${group.length} more like this`}</summary>
                <ul className="ready-list">{group.map(row)}</ul>
              </details>
            </li>
          ) : (
            group.map(row)
          ),
        )}
      </ul>
    </div>
  );
}

export function DecisionRecord() {
  const { decisionId } = useParams();
  const decisions = useStore((s) => s.decisions);
  const allConcepts = useStore((s) => s.concepts);
  const allCriteria = useStore((s) => s.criteria);
  const scores = useStore((s) => s.scores);
  const links = useStore((s) => s.evidence_links);
  const assets = useStore((s) => s.assets);
  const claims = useStore((s) => s.claims);
  const records = useStore((s) => s.records);
  const [logging, setLogging] = useState(false);

  const decision = decisions.find((d) => d.id === decisionId) ?? decisions[0] ?? null;
  const id = decision?.id ?? "";
  const view = useMemo(() => {
    const state = { concepts: allConcepts, criteria: allCriteria, scores, evidence_links: links, assets, claims, records, decisions };
    const concepts = allConcepts.filter((c) => c.decision_id === id).sort((a, b) => a.sort - b.sort);
    const criteria = allCriteria.filter((c) => c.decision_id === id).sort((a, b) => a.sort - b.sort);
    const totals = weightedTotals(concepts.map((c) => c.id), criteria, scores);
    return { state, concepts, criteria, totals, leader: ranking(totals)[0], logs: decisionLogs(state, id), rows: evidenceRows(state, id), readiness: readinessFor(state, id) };
  }, [allConcepts, allCriteria, scores, links, assets, claims, records, decisions, id]);

  const { concepts, criteria, totals, leader, logs, rows, readiness } = view;
  const log = logs[logs.length - 1];
  const { counts } = readiness;

  const save = async () => {
    const path = await saveText(`${safeFileName(decision?.title ?? "", "Decision")} record.md`, recordMarkdown(view.state, id), "Markdown", ["md"], "text/markdown");
    if (path) toast("Record saved");
  };

  return (
    <Shell title="Decision record" sample={Boolean(decision?.is_sample)}>
      {decision && (
        <div className="record">
          <section className={`card ready ready-${readiness.status}`} aria-label="Readiness check" data-testid="readiness">
            <span className="cap">Readiness check</span>
            <h2 className="fr ready-title" data-testid="readiness-title">
              {HEADING[readiness.status]}
            </h2>
            <p className="ready-scope">These rules check that the record is complete and traceable. They can't tell you whether the choice is right.</p>
            <p className="cap ready-counts">
              {counts.backed} of {counts.scores} scores backed · {counts.strong} strong, {counts.medium} medium, {counts.weak} weak{counts.unrated ? `, ${counts.unrated} not rated` : ""}
              {counts.weighed ? ` · ${counts.weighed} conflicts weighed` : ""}
            </p>
            <FindingList title="Fix before handing in" findings={readiness.blockers} decisionId={decision.id} />
            <FindingList title="Worth checking" findings={readiness.warnings} decisionId={decision.id} />
          </section>

          <section className="card record-part" aria-label="The decision">
            <div className="record-head">
              <h2 className="fr side-title">The decision</h2>
              <div className="record-actions">
                <Pill className="small" onClick={() => setLogging(true)}>
                  {log ? "Log again" : "Log this decision"}
                </Pill>
                <Pill className="small" onClick={save}>
                  Save as Markdown
                </Pill>
              </div>
            </div>
            {log ? (
              <>
                <span className="cap">Chosen · logged {log.logged_at.slice(0, 10)}</span>
                <p className="record-chosen" data-testid="record-chosen">
                  <b>{log.title.replace(/^Chose /, "")}.</b> {log.reason}
                </p>
                <span className="cap">Rejected</span>
                {log.rejected?.length ? (
                  <ul className="record-rejected" data-testid="record-rejected">
                    {log.rejected.map((r) => (
                      <li key={r.concept_id}>
                        <b>
                          {r.label}: {r.name}.
                        </b>{" "}
                        {r.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>This record doesn't say why the alternatives were rejected. Log it again to add that.</p>
                )}
              </>
            ) : (
              <p>Nothing logged yet. Logging asks for the chosen concept, and why each other one was rejected.</p>
            )}
          </section>

          <section className="card record-part" aria-label="Scores">
            <h2 className="fr side-title">Scores</h2>
            <div className="record-scroll">
              <table className="mx">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Weight</th>
                    {concepts.map((c) => (
                      <th key={c.id}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((q) => (
                    <tr key={q.id}>
                      <td>{q.name}</td>
                      <td className="n">{Math.round(q.weight * 1000) / 10}%</td>
                      {concepts.map((c) => {
                        const x = scores.find((v) => v.concept_id === c.id && v.criterion_id === q.id);
                        return (
                          <td key={c.id} className="n">
                            {x ? x.value : "–"}
                            {x?.is_assumption && <span className="guess"> guess</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="totals">
                    <td>Weighted total</td>
                    <td />
                    {concepts.map((c) => (
                      <td key={c.id} className="n">
                        {totals[c.id].toFixed(2)}
                        {c.id === leader ? " highest" : ""}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card record-part" aria-label="Evidence">
            <h2 className="fr side-title">Evidence</h2>
            {rows.length ? (
              <div className="record-scroll">
                <table className="mx record-evidence">
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Source</th>
                      <th>Stance</th>
                      <th>Strength</th>
                      <th>Type</th>
                      <th>Limitations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.link.id}>
                        <td>
                          {r.concept.label} · {r.criterion.name}: {r.value}
                        </td>
                        <td>
                          {r.title}
                          <span className="cap record-credit">{r.credit ?? "no credit yet"}</span>
                        </td>
                        <td>
                          {stanceOf(r.link)}
                          {stanceOf(r.link) === "against" && <span className="cap record-credit">{r.link.note?.trim() || "not yet weighed"}</span>}
                        </td>
                        <td>{strengthOf(r.link) ?? "not rated"}</td>
                        <td>{sourceTypeLabel(r.link) ?? "not given"}</td>
                        <td>{r.link.limitation?.trim() || "none noted"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No evidence is linked yet. Click a score in the matrix to link a source.</p>
            )}
          </section>

          {logs.length > 1 && (
            <section className="card record-part" aria-label="Earlier records">
              <h2 className="fr side-title">Earlier records</h2>
              <ul className="record-rejected">
                {logs.slice(0, -1).map((l, i) => (
                  <li key={i}>
                    <span className="cap">{l.logged_at.slice(0, 10)}</span> <b>{l.title.replace(/^Chose /, "")}.</b> {l.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {logging && <LogDecision decisionId={decision.id} concepts={concepts} onClose={() => setLogging(false)} />}
        </div>
      )}
    </Shell>
  );
}
