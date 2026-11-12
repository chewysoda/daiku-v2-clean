import { useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { BoardItem, CheckCounts, GateRule, RecordRow } from "../../data/types";
import { Icon } from "../../design/Icon";
import { Pill, PromptDialog, toast } from "../../design/primitives";
import { LabData, meets, requirementValue } from "../../lib/engineering";
import { saveText } from "../../lib/saveFile";
import { isCredited } from "../../lib/search";
import { GATES, gatePasses, shareCell, stanceOf, toCsv } from "../../lib/studio";
import "../studio.css";

type S = ReturnType<typeof useStore.getState>;

export function labDataFor(records: S["records"], decisionId: string): LabData {
  return {
    parts: selectRecords(records, "part", decisionId).map((p) => p.data),
    calcs: selectRecords(records, "calc", decisionId).map((c) => ({ id: c.id, data: c.data })),
    runs: selectRecords(records, "sim_run", decisionId).map((r) => r.data),
  };
}

/** The same numbers everywhere: Overview, saved checks and milestone gates all read this. */
export function computeCounts(s: Pick<S, "scores" | "records" | "concepts" | "claims" | "evidence_links">): CheckCounts {
  const c: CheckCounts = {
    scores_backed: s.scores.filter((x) => !x.is_assumption).length,
    scores_guessed: s.scores.filter((x) => x.is_assumption).length,
    must_passed: 0,
    must_failed: 0,
    must_open: 0,
    claims_with: 0,
    claims_without: 0,
    decisions_logged: selectRecords(s.records, "decision_log").length,
  };
  for (const r of selectRecords(s.records, "requirement")) {
    if (r.data.priority !== "must" || !r.parent_id) continue;
    const lab = labDataFor(s.records, r.parent_id);
    for (const concept of s.concepts.filter((k) => k.decision_id === r.parent_id)) {
      const verdict = meets(r.data, requirementValue(r.data, concept.id, lab).value);
      if (verdict === "pass") c.must_passed++;
      else if (verdict === "fail") c.must_failed++;
      else c.must_open++;
    }
  }
  for (const claim of s.claims) {
    const backed = s.evidence_links.some((l) => l.target_type === "claim" && l.target_id === claim.id && stanceOf(l) === "for");
    if (backed) c.claims_with++;
    else c.claims_without++;
  }
  return c;
}

function Tabs() {
  return (
    <nav className="seg-group" aria-label="Progress views">
      {[
        { to: "/progress", label: "Overview", end: true },
        { to: "/progress/heatmaps", label: "Heat maps" },
        { to: "/progress/log", label: "Workflow log" },
      ].map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `seg ${isActive ? "on" : ""}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1 className="fr page-title">{title}</h1>
        <span className="page-sub">{sub}</span>
      </div>
      <Tabs />
    </div>
  );
}

const COUNT_LABELS: { key: keyof CheckCounts; label: string; assumption?: boolean }[] = [
  { key: "scores_backed", label: "scores backed" },
  { key: "scores_guessed", label: "scores guessed", assumption: true },
  { key: "must_passed", label: "must-have checks passed" },
  { key: "must_failed", label: "must-have checks failed" },
  { key: "must_open", label: "must-have checks open" },
  { key: "claims_with", label: "claims with evidence" },
  { key: "claims_without", label: "claims without evidence", assumption: true },
  { key: "decisions_logged", label: "decisions logged" },
];

/** One series per chart, so no legend or categorical colour is needed: the title names it. */
function TrendChart({ title, points }: { title: string; points: { label: string; value: number }[] }) {
  const w = 280;
  const h = 96;
  const pad = 10;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <figure className="card trend">
      <figcaption className="calc-head">
        <span className="cap">{title}</span>
        <b className="mono">{last?.value ?? 0}</b>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="trend-axis" />
        <path d={line} className="trend-line" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4} className="trend-dot" />
            {/* Hit target bigger than the mark. */}
            <circle cx={x(i)} cy={y(p.value)} r={14} fill="transparent">
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function ProgressOverview() {
  const scores = useStore((s) => s.scores);
  const records = useStore((s) => s.records);
  const concepts = useStore((s) => s.concepts);
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const add = useStore((s) => s.addRecord);
  const remove = useStore((s) => s.deleteRecord);
  const [adding, setAdding] = useState<"check" | "milestone" | null>(null);
  const [gate, setGate] = useState<GateRule>("decision_logged");
  const [date, setDate] = useState("");

  const counts = useMemo(() => computeCounts({ scores, records, concepts, claims, evidence_links: links }), [scores, records, concepts, claims, links]);
  const milestones = useMemo(() => selectRecords(records, "milestone").sort((a, b) => a.data.date.localeCompare(b.data.date)), [records]);
  const checks = useMemo(() => selectRecords(records, "check").sort((a, b) => a.created_at.localeCompare(b.created_at)), [records]);
  const previous = checks[checks.length - 1] as RecordRow<"check"> | undefined;
  const series = (key: keyof CheckCounts) => [...checks.map((c) => ({ label: c.data.label, value: c.data.counts[key] })), { label: "Now", value: counts[key] }];

  return (
    <main className="page lab-eng">
      <Head title="Progress" sub="Counts, not one percentage, and gates the app checks against the board." />
      <section aria-label="Counts" className="count-grid">
        {COUNT_LABELS.map((c) => {
          const delta = previous ? counts[c.key] - previous.data.counts[c.key] : null;
          return (
            <div key={c.key} className="card count">
              <span className={`fr count-n ${c.assumption && counts[c.key] > 0 ? "guess" : ""}`} data-testid={`count-${c.key}`}>
                {counts[c.key]}
              </span>
              <span className="cap">{c.label}</span>
              {delta !== null && delta !== 0 && (
                <span className="cap">
                  {delta > 0 ? "+" : ""}
                  {delta} since last check
                </span>
              )}
            </div>
          );
        })}
      </section>
      <div className="eng-bar">
        <h2 className="fr side-title">Milestones and gates</h2>
        <Pill onClick={() => setAdding("milestone")}>
          <Icon name="plus" size={16} />
          Milestone
        </Pill>
      </div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Date</th>
              <th>Gate</th>
              <th>Status</th>
              <th aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => {
              const ok = gatePasses(m.data.gate, counts);
              return (
                <tr key={m.id}>
                  <td>{m.data.title}</td>
                  <td className="mono">{m.data.date || "–"}</td>
                  <td className="cap">{GATES[m.data.gate]}</td>
                  <td>
                    <span className={`req-chip ${ok ? "pass" : "open"}`} data-testid={`gate-${m.id}`}>
                      {ok ? "✓ met" : "○ not met"}
                    </span>
                  </td>
                  <td className="row-x">
                    <button type="button" aria-label={`Remove ${m.data.title}`} onClick={() => remove(m.id)}>
                      <Icon name="close" size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!milestones.length && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No milestones yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="eng-bar">
        <h2 className="fr side-title">Over time</h2>
        <Pill ink onClick={() => setAdding("check")}>
          Save a progress check
        </Pill>
      </div>
      {checks.length === 0 ? (
        <p className="cap">Trends appear after your first saved check, which records today's numbers to compare against later.</p>
      ) : (
        <>
          <div className="trend-grid">
            <TrendChart title="Scores still guessed" points={series("scores_guessed")} />
            <TrendChart title="Must-have checks open" points={series("must_open")} />
            <TrendChart title="Claims without evidence" points={series("claims_without")} />
          </div>
          <div className="card table-wrap">
            <table className="tbl" aria-label="Saved checks">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Saved</th>
                  <th>Guessed</th>
                  <th>Must open</th>
                  <th>Must failed</th>
                  <th>No evidence</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td>{c.data.label}</td>
                    <td className="mono">{c.created_at.slice(0, 10)}</td>
                    <td className="mono">{c.data.counts.scores_guessed}</td>
                    <td className="mono">{c.data.counts.must_open}</td>
                    <td className="mono">{c.data.counts.must_failed}</td>
                    <td className="mono">{c.data.counts.claims_without}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {adding === "check" && (
        <PromptDialog
          title="Save a progress check"
          initial={`Week of ${new Date().toISOString().slice(0, 10)}`}
          action="Save"
          onClose={() => setAdding(null)}
          onSubmit={(label) => {
            add("check", null, { label, counts });
            setAdding(null);
            toast("Check saved");
          }}
        />
      )}
      {adding === "milestone" && (
        <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && setAdding(null)}>
          <form
            className="dialog form-grid"
            aria-label="New milestone"
            onSubmit={(e) => {
              e.preventDefault();
              const title = String(new FormData(e.currentTarget).get("title")).trim();
              if (!title) return;
              add("milestone", null, { title, date, gate, decision_id: null });
              setAdding(null);
            }}
          >
            <h2 className="fr dialog-title">New milestone</h2>
            <label className="lbl">
              <span className="cap">title</span>
              <input autoFocus className="field" name="title" required />
            </label>
            <label className="lbl">
              <span className="cap">date</span>
              <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="lbl">
              <span className="cap">gate, checked by the app</span>
              <select className="field" value={gate} onChange={(e) => setGate(e.target.value as GateRule)}>
                {Object.entries(GATES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <Pill onClick={() => setAdding(null)}>Cancel</Pill>
              <Pill ink type="submit">
                Add
              </Pill>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

/**
 * One sage ramp of its own (not the accent, which is near-white on dark themes), mixed in OKLCH so
 * the steps look even. Every cell also prints its value, so colour is never the only signal.
 */
const shade = (fraction: number) => {
  const f = Math.max(0, Math.min(1, fraction));
  return {
    style: { "--f": `${Math.round(12 + f * 88)}%` } as React.CSSProperties,
    strong: f > 0.58,
  };
};
const heatProps = (fraction: number, className = "") => {
  const { style, strong } = shade(fraction);
  return { style, className: `heat-cell ${strong ? "strong" : ""} ${className}`.trim() };
};
const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

const inside = (i: BoardItem, s: BoardItem) => i.x + i.w / 2 >= s.x && i.x + i.w / 2 <= s.x + s.w && i.y + i.h / 2 >= s.y && i.y + i.h / 2 <= s.y + s.h;

export function HeatMaps() {
  const decisions = useStore((s) => s.decisions);
  const allConcepts = useStore((s) => s.concepts);
  const allCriteria = useStore((s) => s.criteria);
  const scores = useStore((s) => s.scores);
  const records = useStore((s) => s.records);
  const boards = useStore((s) => s.boards);
  const items = useStore((s) => s.board_items);
  const assets = useStore((s) => s.assets);
  const log = useStore((s) => s.workflow_log);
  const { decisionId } = useParams();
  const [picked, setPicked] = useState<string | null>(decisionId ?? null);
  const decision = decisions.find((d) => d.id === picked) ?? decisions[0];
  const concepts = allConcepts.filter((c) => c.decision_id === decision?.id).sort((a, b) => a.sort - b.sort);
  const criteria = allCriteria.filter((c) => c.decision_id === decision?.id).sort((a, b) => a.sort - b.sort);
  const reqs = decision ? selectRecords(records, "requirement", decision.id) : [];
  const lab = decision ? labDataFor(records, decision.id) : { parts: [], calcs: [], runs: [] };

  const sections = useMemo(
    () =>
      items
        .filter((i) => i.kind === "section")
        .map((s) => {
          const images = items.filter((i) => i.board_id === s.board_id && i.kind === "image" && inside(i, s));
          const backed = images.filter((i) => {
            const a = assets.find((x) => x.id === i.asset_id);
            return a ? isCredited(a) : false;
          }).length;
          return { id: s.id, name: s.data.text || "Section", board: boards.find((b) => b.id === s.board_id)?.name ?? "", cell: shareCell(backed, images.length) };
        }),
    [items, assets, boards],
  );

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of log) counts.set(e.at.slice(0, 10), (counts.get(e.at.slice(0, 10)) ?? 0) + 1);
    const out: { day: string; n: number }[] = [];
    const today = new Date();
    // 12 full weeks, Monday-first columns.
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 11 * 7);
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      out.push({ day: key, n: counts.get(key) ?? 0 });
    }
    return out;
  }, [log]);
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  return (
    <main className="page lab-eng">
      <Head title="Heat maps" sub="Where the work is strong and where it's thin. Hover any cell for its exact count." />
      {decision && (
        <div className="eng-bar">
          <select className="field decision-select" aria-label="Decision" value={decision.id} onChange={(e) => setPicked(e.target.value)}>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <span className="heat-legend cap" aria-label="Scale: low to high">
            <span>low</span>
            <span className="heat-ramp" aria-hidden="true">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <span key={f} {...heatProps(f, "heat-swatch")} />
              ))}
            </span>
            <span>high</span>
            <span className="heat-key">
              <span className="heat-swatch hatched" aria-hidden="true" /> too little data
            </span>
            <span className="heat-key">
              <span className="heat-swatch guess-swatch" aria-hidden="true" /> a guess, not a source
            </span>
          </span>
        </div>
      )}
      <section aria-label="Matrix heat map" className="card heat">
        <div className="heat-head">
          <h2 className="heat-title">Concepts against criteria</h2>
          <span className="cap">Scores 1 to 5; the deeper the colour, the higher the score</span>
        </div>
        <div className="heat-scroll">
          <table className="heat-table">
            <thead>
              <tr>
                <th />
                {concepts.map((c) => (
                  <th key={c.id} scope="col" title={c.name}>
                    <span className="heat-col-label">{c.label}</span>
                    <span className="heat-col-name">{c.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.map((q) => (
                <tr key={q.id}>
                  <th scope="row">{q.name}</th>
                  {concepts.map((c) => {
                    const score = scores.find((s) => s.concept_id === c.id && s.criterion_id === q.id);
                    if (!score) return <td key={c.id} className="heat-cell hatched" title="Not scored" />;
                    return (
                      <td
                        key={c.id}
                        {...heatProps((score.value - 1) / 4, score.is_assumption ? "guess" : "")}
                        title={`${c.name}, ${q.name}: ${score.value}, ${score.is_assumption ? "a guess" : "backed by a source"}`}
                      >
                        {score.value}
                        {score.is_assumption && <span className="sr-only">, a guess</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {criteria.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row">Average</th>
                  {concepts.map((c) => {
                    const avg = mean(scores.filter((s) => s.concept_id === c.id && criteria.some((q) => q.id === s.criterion_id)).map((s) => s.value));
                    return (
                      <td key={c.id} className="heat-avg">
                        {avg == null ? "–" : avg.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <section aria-label="Traceability heat map" className="card heat">
        <div className="heat-head">
          <h2 className="heat-title">Requirements against concepts</h2>
          <span className="cap">Does each concept meet it, by the method named</span>
        </div>
        <div className="heat-scroll">
          <table className="heat-table">
            <thead>
              <tr>
                <th />
                {concepts.map((c) => (
                  <th key={c.id} scope="col" title={c.name}>
                    <span className="heat-col-label">{c.label}</span>
                    <span className="heat-col-name">{c.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <span className="req-code">{r.data.code}</span>
                    <span className="req-method">{r.data.verified_by || "no method"}</span>
                  </th>
                  {concepts.map((c) => {
                    const { value, basis } = requirementValue(r.data, c.id, lab);
                    const verdict = meets(r.data, value);
                    return (
                      <td key={c.id} className={`trace ${verdict}`} title={`${r.data.text}: ${basis || "no evidence"}`}>
                        <Icon name={verdict === "pass" ? "check" : verdict === "fail" ? "close" : "open"} size={14} />
                        {verdict === "pass" ? "Pass" : verdict === "fail" ? "Fail" : "Open"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Board coverage" className="card heat">
        <div className="heat-head">
          <h2 className="heat-title">Board coverage</h2>
          <span className="cap">Credited images in each section</span>
        </div>
        <div className="coverage">
          {sections.map((s) => (
            <div key={s.id} {...(s.cell.share === null ? { className: "cover-cell hatched" } : heatProps(s.cell.share, "cover-cell"))} title={`${s.board} · ${s.cell.label}`}>
              <b>{s.name}</b>
              <span className="cover-board">{s.board}</span>
              <span className="cover-share">{s.cell.label}</span>
            </div>
          ))}
          {!sections.length && <p className="cap">No sections on any board yet.</p>}
        </div>
      </section>
      <section aria-label="Activity calendar" className="card heat">
        <div className="heat-head">
          <h2 className="heat-title">Activity</h2>
          <span className="cap">Logged changes per day, last 12 weeks. This counts changes, not quality of work.</span>
        </div>
        <div className="calendar-wrap">
          <div className="calendar-days cap" aria-hidden="true">
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
            <span />
          </div>
          <div className="calendar">
            {days.map((d) => (
              <span key={d.day} {...(d.n ? heatProps(d.n / maxDay, "day") : { className: "day" })} title={`${d.day}: ${d.n} logged change${d.n === 1 ? "" : "s"}`} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export function WorkflowLog() {
  const log = useStore((s) => s.workflow_log);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...log].sort((a, b) => b.at.localeCompare(a.at)).filter((e) => !q || `${e.summary} ${e.why ?? ""} ${e.actor}`.toLowerCase().includes(q));
  }, [log, query]);

  const exportCsv = async () => {
    const csv = toCsv([["at", "who", "action", "type", "summary", "before", "after", "why"], ...rows.map((e) => [e.at, e.actor, e.action, e.target_type, e.summary, e.before, e.after, e.why])]);
    if (await saveText("daiku-workflow-log.csv", csv, "CSV", ["csv"], "text/csv")) toast("Log exported");
  };

  return (
    <main className="page lab-eng">
      <Head title="Workflow log" sub="Every change, in one append-only list: who, what, before, after and why." />
      <div className="eng-bar">
        <input className="field log-search" aria-label="Search the log" placeholder="Search the log" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Pill disabled={!rows.length} onClick={() => void exportCsv()}>
          Export CSV
        </Pill>
      </div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Before → after</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((e) => (
              <tr key={e.id}>
                <td className="mono nowrap">{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor}</td>
                <td>{e.summary}</td>
                <td className="mono">{e.before !== null || e.after !== null ? `${e.before ?? "–"} → ${e.after ?? "–"}` : ""}</td>
                <td>{e.why}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="empty-row">
                  {log.length ? "Nothing matches." : "Nothing logged yet. Changes appear here as you make them."} <Link to="/decide">Open the Lab</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
