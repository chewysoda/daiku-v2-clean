import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { Concept, RecordRow, RequirementData } from "../../data/types";
import { Icon } from "../../design/Icon";
import { ConfirmDialog, Pill, PromptDialog } from "../../design/primitives";
import { bomMass, convergenceStep, LabData, meets, partMass, requirementValue, runCalc, safetyFactor, standing, targetText, Verdict } from "../../lib/engineering";
import { matrixTotals } from "../../lib/decisionRecord";
import { ranking } from "../../lib/scoring";
import { pickAndImport } from "../library/importing";
import "../studio.css";

/** Must-haves gate the ranking: a leading concept that fails one always carries this warning. */
export function GateBanner({ decisionId, leaderId, leaderLabel }: { decisionId: string; leaderId: string | null; leaderLabel: string }) {
  const records = useStore((s) => s.records);
  const navigate = useNavigate();
  if (!leaderId) return null;
  const reqs = selectRecords(records, "requirement", decisionId).map((r) => r.data);
  const lab: LabData = {
    parts: selectRecords(records, "part", decisionId).map((p) => p.data),
    calcs: selectRecords(records, "calc", decisionId).map((c) => ({ id: c.id, data: c.data })),
    runs: selectRecords(records, "sim_run", decisionId).map((r) => r.data),
  };
  const failed = standing(reqs, leaderId, lab).failedMust;
  if (!failed.length) return null;
  return (
    <div className="gate-warn" role="alert" data-testid="gate-warning">
      <b>Concept {leaderLabel} leads the matrix but fails a must-have.</b>
      <span>{failed.join(", ")} failing. Must-haves gate the ranking, so this warning stays until they pass.</span>
      <Pill className="small" onClick={() => navigate(`/decide/${decisionId}/requirements`)}>
        See requirements
      </Pill>
    </div>
  );
}

/** A decision only counts once its reasons are written down: why this one, and why not each of the others. */
export function LogDecision({ decisionId, concepts, onClose }: { decisionId: string; concepts: Concept[]; onClose: () => void }) {
  const add = useStore((s) => s.addRecord);
  // Taken once: the matrix can't change while this dialog is open.
  const [totals] = useState(() => matrixTotals(useStore.getState(), decisionId));
  const [concept, setConcept] = useState(concepts[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [whyNot, setWhyNot] = useState<Record<string, string>>({});
  const others = concepts.filter((c) => c.id !== concept);
  const leader = concepts.find((c) => c.id === ranking(totals)[0]);
  const complete = Boolean(reason.trim()) && others.every((c) => whyNot[c.id]?.trim());
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog form-grid"
        aria-label="Log this decision"
        onSubmit={(e) => {
          e.preventDefault();
          const why = reason.trim();
          const chosen = concepts.find((c) => c.id === concept);
          if (!complete || !chosen) return;
          const rejected = others.map((c) => ({ concept_id: c.id, label: c.label, name: c.name, reason: whyNot[c.id].trim() }));
          add("decision_log", decisionId, { decision_id: decisionId, concept_id: chosen.id, title: `Chose ${chosen.label}: ${chosen.name}`, reason: why, rejected, totals }, why);
          onClose();
        }}
      >
        <h2 className="fr dialog-title">Log this decision</h2>
        <label className="lbl">
          <span className="cap">chosen concept</span>
          <select className="field" value={concept} onChange={(e) => setConcept(e.target.value)}>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lbl">
          <span className="cap">why, required</span>
          <textarea autoFocus className="field paste" aria-label="Why" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {leader && leader.id !== concept && <p className="score-note">{leader.label} leads the matrix right now, so your reason should explain why you're choosing differently.</p>}
        {others.map((c) => (
          <label key={c.id} className="lbl">
            <span className="cap">
              why not {c.label}: {c.name}, required
            </span>
            <textarea className="field paste log-why-not" aria-label={`Why not ${c.label}`} value={whyNot[c.id] ?? ""} onChange={(e) => setWhyNot({ ...whyNot, [c.id]: e.target.value })} />
          </label>
        ))}
        <div className="dialog-actions">
          <Pill onClick={onClose}>Cancel</Pill>
          <Pill ink type="submit" disabled={!complete}>
            Log decision
          </Pill>
        </div>
      </form>
    </div>
  );
}

export function LabTabs({ decisionId }: { decisionId: string }) {
  const { pathname } = useLocation();
  const tabs = [
    { to: `/decide/${decisionId}/requirements`, label: "Requirements" },
    { to: `/decide/${decisionId}`, label: "Decision matrix", end: true },
    { to: `/decide/${decisionId}/simulate`, label: "Simulate" },
    { to: `/decide/${decisionId}/bom`, label: "Properties & BOM" },
    { to: `/decide/${decisionId}/record`, label: "Decision record" },
  ];
  return (
    <nav className="seg-group lab-tabs" aria-label="Lab views">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          // Plain /decide shows the matrix of the latest decision, so that tab is the current one there too.
          className={({ isActive }) => `seg ${isActive || (t.end && pathname === "/decide") ? "on" : ""}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function useLab() {
  const { decisionId } = useParams();
  const decisions = useStore((s) => s.decisions);
  const allConcepts = useStore((s) => s.concepts);
  const records = useStore((s) => s.records);
  const decision = decisions.find((d) => d.id === decisionId) ?? decisions[0] ?? null;
  return useMemo(() => {
    const id = decision?.id ?? "";
    const concepts = allConcepts.filter((c) => c.decision_id === id).sort((a, b) => a.sort - b.sort);
    const requirements = selectRecords(records, "requirement", id);
    const parts = selectRecords(records, "part", id);
    const calcs = selectRecords(records, "calc", id);
    const materials = selectRecords(records, "material", id);
    const runs = selectRecords(records, "sim_run", id);
    const lab: LabData = { parts: parts.map((p) => p.data), calcs: calcs.map((c) => ({ id: c.id, data: c.data })), runs: runs.map((r) => r.data) };
    return { decision, concepts, requirements, parts, calcs, materials, runs, lab };
  }, [decision, allConcepts, records]);
}

export function Shell({ title, sample, children, side }: { title: string; sample: boolean; children: React.ReactNode; side?: React.ReactNode }) {
  const { decision } = useLab();
  if (!decision) {
    return (
      <main className="page">
        <h1 className="fr page-title">{title}</h1>
        <p>Create a decision in the Lab first.</p>
      </main>
    );
  }
  return (
    <main className="page lab-eng">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">{title}</h1>
          <span className="page-sub">
            {decision.title}
            {sample ? " · sample data" : ""}
          </span>
        </div>
        <LabTabs decisionId={decision.id} />
      </div>
      <div className={side ? "eng-cols" : ""}>
        <div className="eng-main">{children}</div>
        {side && <aside className="eng-side">{side}</aside>}
      </div>
    </main>
  );
}

const MARK: Record<Verdict, string> = { pass: "✓", fail: "✗", open: "○" };

function fmt(value: number | null, unit = "") {
  if (value === null) return "–";
  const text = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${text} ${unit}` : text;
}

function RequirementCell({ row, concept, lab }: { row: RecordRow<"requirement">; concept: Concept; lab: LabData }) {
  const update = useStore((s) => s.updateRecord);
  const [editing, setEditing] = useState(false);
  const req = row.data;
  const { value, basis } = requirementValue(req, concept.id, lab);
  const verdict = meets(req, value);
  const label = value !== null ? fmt(value, req.source === "sim_sf" ? "" : req.unit) : basis.startsWith("no") ? basis : "not verified";
  const text = `${verdict === "open" ? label : `${req.source === "sim_sf" ? "SF " : ""}${label}`}`;

  if (editing && req.source === "manual") {
    const current = req.values[concept.id];
    return (
      <td>
        <form
          className="req-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const raw = String(data.get("value")).trim();
            const basisText = String(data.get("basis")).trim();
            update<"requirement">(row.id, {
              values: { ...req.values, [concept.id]: { value: raw === "" ? null : Number(raw), basis: basisText } },
            });
            setEditing(false);
          }}
        >
          <input autoFocus className="field" name="value" type="number" step="any" aria-label={`${req.code} value for ${concept.name}`} defaultValue={current?.value ?? ""} />
          {/* A value without a stated basis isn't verification, so the basis is required. */}
          <input className="field" name="basis" required placeholder="Where's this from?" aria-label="Basis" defaultValue={current?.basis ?? ""} />
          <Pill className="small" type="submit">
            Save
          </Pill>
        </form>
      </td>
    );
  }
  return (
    <td>
      <button
        type="button"
        className={`req-chip ${verdict}`}
        title={basis || "No evidence attached"}
        disabled={req.source !== "manual"}
        data-testid={`req-${req.code}-${concept.label}`}
        onClick={() => setEditing(true)}
      >
        <span aria-hidden="true">{MARK[verdict]}</span> {text}
        <span className="sr-only">, {verdict === "open" ? "not verified yet" : verdict}</span>
      </button>
    </td>
  );
}

const BLANK: RequirementData = { code: "", text: "", priority: "must", why: "", op: "<=", min: null, max: null, unit: "", source: "manual", verified_by: "", values: {} };

function RequirementDialog({ decisionId, nextCode, onClose }: { decisionId: string; nextCode: string; onClose: () => void }) {
  const add = useStore((s) => s.addRecord);
  const [d, setD] = useState<RequirementData>({ ...BLANK, code: nextCode });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog form-grid"
        aria-label="New requirement"
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.text.trim()) return;
          add("requirement", decisionId, d);
          onClose();
        }}
      >
        <h2 className="fr dialog-title">New requirement</h2>
        <label className="lbl">
          <span className="cap">requirement</span>
          <input autoFocus className="field" value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
        </label>
        <label className="lbl">
          <span className="cap">why</span>
          <input className="field" value={d.why} onChange={(e) => setD({ ...d, why: e.target.value })} />
        </label>
        <div className="form-row">
          <label className="lbl">
            <span className="cap">priority</span>
            <select className="field" value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value as "must" | "want" })}>
              <option value="must">must</option>
              <option value="want">want</option>
            </select>
          </label>
          <label className="lbl">
            <span className="cap">check</span>
            <select className="field" value={d.op} onChange={(e) => setD({ ...d, op: e.target.value as RequirementData["op"] })}>
              <option value="<=">at most</option>
              <option value=">=">at least</option>
              <option value="between">between</option>
            </select>
          </label>
          {d.op !== "<=" && (
            <label className="lbl">
              <span className="cap">min</span>
              <input className="field" type="number" step="any" onChange={(e) => setD({ ...d, min: num(e.target.value) })} />
            </label>
          )}
          {d.op !== ">=" && (
            <label className="lbl">
              <span className="cap">max</span>
              <input className="field" type="number" step="any" onChange={(e) => setD({ ...d, max: num(e.target.value) })} />
            </label>
          )}
          <label className="lbl">
            <span className="cap">unit</span>
            <input className="field" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
          </label>
        </div>
        <label className="lbl">
          <span className="cap">value comes from</span>
          <select className="field" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value as RequirementData["source"] })}>
            <option value="manual">typed in, with a stated basis</option>
            <option value="bom_mass">BOM roll-up (mass, kg)</option>
            <option value="sim_sf">simulation runs (safety factor)</option>
          </select>
        </label>
        <label className="lbl">
          <span className="cap">verified by</span>
          <input className="field" value={d.verified_by} onChange={(e) => setD({ ...d, verified_by: e.target.value })} />
        </label>
        <div className="dialog-actions">
          <Pill onClick={onClose}>Cancel</Pill>
          <Pill ink type="submit" disabled={!d.text.trim()}>
            Add
          </Pill>
        </div>
      </form>
    </div>
  );
}

export function Requirements() {
  const { decision, concepts, requirements, lab } = useLab();
  const remove = useStore((s) => s.deleteRecord);
  const scores = useStore((s) => s.scores);
  const criteria = useStore((s) => s.criteria);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const reqs = useMemo(() => [...requirements].sort((a, b) => a.data.code.localeCompare(b.data.code, undefined, { numeric: true })), [requirements]);
  const [selected, setSelected] = useState<string | null>(null);
  const focus = reqs.find((r) => r.id === selected) ?? reqs.find((r) => concepts.some((c) => meets(r.data, requirementValue(r.data, c.id, lab).value) === "fail")) ?? reqs[0];

  const leader = useMemo(() => {
    const crit = criteria.filter((c) => c.decision_id === decision?.id);
    const totals = concepts.map((c) => ({
      c,
      total: crit.reduce((sum, q) => sum + q.weight * (scores.find((s) => s.concept_id === c.id && s.criterion_id === q.id)?.value ?? 0), 0),
    }));
    return totals.sort((a, b) => b.total - a.total)[0]?.c ?? null;
  }, [concepts, criteria, scores, decision?.id]);
  const leaderFails = leader ? standing(reqs.map((r) => r.data), leader.id, lab).failedMust : [];

  return (
    <Shell title="Requirements" sample={Boolean(decision?.is_sample)}>
      {leader && leaderFails.length > 0 && (
        <div className="gate-warn" role="alert" data-testid="gate-warning">
          <b>Concept {leader.label} leads the matrix but fails a must-have.</b>
          <span>{leaderFails.join(", ")} failing. Must-haves gate the ranking, so the Lab shows this warning until they pass.</span>
          {decision && (
            <Pill className="small" onClick={() => navigate(`/decide/${decision.id}/bom`)}>
              See the BOM
            </Pill>
          )}
        </div>
      )}
      <div className="eng-cols">
        <div className="eng-main">
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Requirement</th>
                  <th>Priority</th>
                  <th>Verified by</th>
                  {concepts.map((c) => (
                    <th key={c.id}>
                      {c.label} · {c.name}
                    </th>
                  ))}
                  <th aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id} className={focus?.id === r.id ? "row-on" : ""} onClick={() => setSelected(r.id)}>
                    <td className="mono">{r.data.code}</td>
                    <td>{r.data.text}</td>
                    <td>
                      <span className={`tag ${r.data.priority}`}>{r.data.priority}</span>
                    </td>
                    <td className="cap">{r.data.verified_by}</td>
                    {concepts.map((c) => (
                      <RequirementCell key={c.id} row={r} concept={c} lab={lab} />
                    ))}
                    <td className="row-x">
                      <button type="button" aria-label={`Remove ${r.data.code}`} onClick={() => remove(r.id)}>
                        <Icon name="close" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!reqs.length && (
                  <tr>
                    <td colSpan={5 + concepts.length} className="empty-row">
                      No requirements yet. Add one, or turn an interview theme into one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="cap legend-row">✓ verified pass · ✗ verified fail · ○ not verified yet, no evidence attached. Click a typed-in value to change it.</p>
          <div className="standing-grid">
            {concepts.map((c) => {
              const st = standing(reqs.map((r) => r.data), c.id, lab);
              return (
                <div key={c.id} className="card standing" data-testid={`standing-${c.label}`}>
                  <b>
                    {c.label} · {c.name}
                  </b>
                  <span className="cap">
                    {st.pass} pass · {st.fail} fail · {st.open} open
                  </span>
                  {st.failedMust.length > 0 && <span className="fail-text">fails {st.failedMust.join(", ")}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="eng-side">
          {focus && (
            <div className="card side-card">
              <span className="cap">
                {focus.data.code} · {focus.data.priority}
              </span>
              <h2 className="fr side-title">{focus.data.text}</h2>
              <span className="cap">target {targetText(focus.data)}</span>
              {focus.data.why && <span className="cap">why: {focus.data.why}</span>}
              {concepts.map((c) => {
                const { value, basis } = requirementValue(focus.data, c.id, lab);
                return (
                  <div key={c.id} className="kv">
                    <span>
                      {c.label} · {basis || "no evidence"}
                    </span>
                    <span className="mono">{fmt(value, focus.data.unit)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <Pill ink onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} />
            Requirement
          </Pill>
        </aside>
      </div>
      {adding && decision && <RequirementDialog decisionId={decision.id} nextCode={`R${reqs.length + 1}`} onClose={() => setAdding(false)} />}
    </Shell>
  );
}

function CalcCard({ row }: { row: RecordRow<"calc"> }) {
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const d = row.data;
  const result = runCalc(d);
  const setInput = (i: number, expr: string) => update<"calc">(row.id, { inputs: d.inputs.map((x, j) => (j === i ? { ...x, expr } : x)) });
  return (
    <article className="card calc" aria-label={`${d.code} ${d.title}`}>
      <div className="calc-head">
        <span className="cap">
          {d.code} · {d.title}
        </span>
        <button type="button" className="ib calc-x" aria-label={`Remove ${d.code}`} onClick={() => remove(row.id)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      {d.inputs.map((input, i) => (
        <label key={input.name} className="calc-input">
          <span className="mono">{input.name} =</span>
          <input className="cell-input mono" aria-label={`${d.code} input ${input.name}`} value={input.expr} onChange={(e) => setInput(i, e.target.value)} />
        </label>
      ))}
      <label className="calc-input">
        <span className="mono">=</span>
        <input className="cell-input mono" aria-label={`${d.code} formula`} value={d.formula} onChange={(e) => update<"calc">(row.id, { formula: e.target.value })} />
      </label>
      {result.ok ? (
        <b className="mono" data-testid={`calc-${d.code}`}>
          = {result.value.toFixed(2)} {d.unit}
        </b>
      ) : (
        <b className="fail-text" role="alert" data-testid={`calc-${d.code}`}>
          {result.error}
        </b>
      )}
      <span className="cap">{result.ok ? "units checked" : "not calculated"} · {d.basis || "no basis stated"}</span>
    </article>
  );
}

export function PropertiesBom() {
  const { decision, concepts, parts, calcs, materials, requirements, lab } = useLab();
  const add = useStore((s) => s.addRecord);
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"part" | "calc" | "material" | null>(null);
  const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0];
  const rows = parts.filter((p) => p.data.concept_id === concept?.id);
  const total = bomMass(rows.map((p) => p.data), lab.calcs);
  const massReq = requirements.find((r) => r.data.source === "bom_mass");
  const massVerdict = massReq ? meets(massReq.data, total) : null;
  const calcData = lab.calcs;

  return (
    <Shell
      title="Properties & BOM"
      sample={Boolean(decision?.is_sample)}
      side={
        <>
          <span className="cap">Properties</span>
          <h2 className="fr side-title">Materials in this study</h2>
          <span className="cap">every value carries its source</span>
          {materials.map((m) => (
            <div key={m.id} className="card side-card">
              <div className="calc-head">
                <b>{m.data.name}</b>
                <button type="button" className="ib calc-x" aria-label={`Remove ${m.data.name}`} onClick={() => remove(m.id)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
              {m.data.props.map((p) => (
                <div key={p.name} className="kv">
                  <span className="cap">{p.name}</span>
                  <span className="mono">{p.value}</span>
                </div>
              ))}
              <span className="tag">{m.data.source || "no source yet"}</span>
            </div>
          ))}
          <Pill ink onClick={() => setDialog("material")}>
            <Icon name="plus" size={16} />
            Material
          </Pill>
        </>
      }
    >
      <div className="eng-bar">
        <div className="seg-group" role="tablist" aria-label="Concept">
          {concepts.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === concept?.id} className={`seg ${c.id === concept?.id ? "on" : ""}`} onClick={() => setConceptId(c.id)}>
              {c.label} · {c.name}
            </button>
          ))}
        </div>
        {massReq && (
          <span className={`req-chip ${massVerdict}`} data-testid="bom-verdict">
            mass {fmt(total, "kg")} · {massReq.data.code} limit {massReq.data.max} {massVerdict === "open" ? "○" : MARK[massVerdict ?? "open"]}
          </span>
        )}
      </div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Part</th>
              <th>Material</th>
              <th>Qty / size</th>
              <th>Mass</th>
              <th>Unit cost</th>
              <th>Basis</th>
              <th aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const mass = partMass(p.data, calcData);
              return (
                <tr key={p.id}>
                  <td>{p.data.name}</td>
                  <td>{p.data.material}</td>
                  <td className="mono">{p.data.qty}</td>
                  <td className="mono">
                    {p.data.calc_id ? (
                      fmt(mass, "kg")
                    ) : (
                      <input
                        className="cell-input mono weight"
                        type="number"
                        step="any"
                        aria-label={`${p.data.name} mass in kg`}
                        value={p.data.mass_kg ?? ""}
                        onChange={(e) => update<"part">(p.id, { mass_kg: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="mono">{p.data.cost ? `₹${p.data.cost}` : "–"}</td>
                  <td>
                    {/* An estimate is an assumption, so it carries the assumption mark. */}
                    <span className={`tag ${p.data.basis === "estimate" ? "assume" : ""}`}>{p.data.basis || "no basis"}</span>
                  </td>
                  <td className="row-x">
                    <button type="button" aria-label={`Remove ${p.data.name}`} onClick={() => remove(p.id)}>
                      <Icon name="close" size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="totals">
              <td colSpan={3}>Total</td>
              <td className="mono" data-testid="bom-total">
                {total === null ? (rows.length ? "a part has no mass" : "no BOM") : fmt(total, "kg")}
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="eng-actions">
        <Pill onClick={() => setDialog("part")}>
          <Icon name="plus" size={16} />
          Part
        </Pill>
        <Pill onClick={() => setDialog("calc")}>
          <Icon name="plus" size={16} />
          Calculation
        </Pill>
      </div>
      <div className="calc-grid">
        {calcs.map((c) => (
          <CalcCard key={c.id} row={c} />
        ))}
      </div>
      <p className="cap">Change any input to see what-if results. Mass rolls up to the BOM and into the mass requirement straight away.</p>
      {dialog === "part" && decision && concept && (
        <PromptDialog
          title="Add part"
          placeholder="Part name"
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            add("part", decision.id, { concept_id: concept.id, name, material: "", qty: "1", mass_kg: null, calc_id: null, basis: "estimate", cost: "" });
            setDialog(null);
          }}
        />
      )}
      {dialog === "calc" && decision && (
        <PromptDialog
          title="Add calculation"
          placeholder="What does it work out?"
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(title) => {
            add("calc", decision.id, { code: `C${calcs.length + 1}`, title, inputs: [{ name: "a", expr: "1 m" }, { name: "b", expr: "2 m" }], formula: "a * b", unit: "m^2", basis: "" });
            setDialog(null);
          }}
        />
      )}
      {dialog === "material" && decision && (
        <PromptDialog
          title="Add material"
          placeholder="Material name"
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            add("material", decision.id, { name, props: [], source: "" });
            setDialog(null);
          }}
        />
      )}
    </Shell>
  );
}

export function Simulate() {
  const { decision, concepts, runs, requirements } = useLab();
  const add = useStore((s) => s.addRecord);
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const assets = useStore((s) => s.assets);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = runs.find((r) => r.id === selected) ?? runs[0];
  const sfReqs = requirements.filter((r) => r.data.source === "sim_sf");
  const number = (v: string) => (v === "" ? null : Number(v));

  const attach = async () => {
    if (!run) return;
    const created = await pickAndImport();
    if (created.length) update<"sim_run">(run.id, { asset_ids: [...run.data.asset_ids, ...created.map((a) => a.id)] });
  };

  const sf = run ? safetyFactor(run.data) : null;
  const step = run ? convergenceStep(run.data.convergence) : null;

  return (
    <Shell
      title="Simulation results"
      sample={Boolean(decision?.is_sample)}
      side={
        run && (
          <>
            <span className="cap">{run.data.status}</span>
            <h2 className="fr side-title">{run.data.name}</h2>
            <label className="lbl">
              <span className="cap">solver</span>
              <input className="field" value={run.data.solver} onChange={(e) => update<"sim_run">(run.id, { solver: e.target.value })} />
            </label>
            <label className="lbl">
              <span className="cap">load case</span>
              <input className="field" value={run.data.load_case} onChange={(e) => update<"sim_run">(run.id, { load_case: e.target.value })} />
            </label>
            <span className="cap">Backs as evidence</span>
            {sfReqs.map((r) => {
              const verdict = sf === null ? "open" : meets(r.data, sf);
              return (
                <span key={r.id} className={`req-chip ${verdict}`}>
                  {MARK[verdict]} {r.data.code}: SF {fmt(sf)}
                </span>
              );
            })}
            <span className="cap">Attached files · {run.data.asset_ids.length}</span>
            {run.data.asset_ids.map((id) => (
              <span key={id} className="mono small-line">
                {assets.find((a) => a.id === id)?.title ?? "removed"}
              </span>
            ))}
            <Pill className="small" onClick={() => void attach()}>
              Attach solver export
            </Pill>
            <Pill className="small" onClick={() => setConfirming(true)}>
              Remove run
            </Pill>
            <p className="cap">Daiku stores and compares results; your solver runs them. No cloud compute, no paid APIs.</p>
          </>
        )
      }
    >
      <div className="run-list" role="list">
        {runs.map((r) => {
          const value = safetyFactor(r.data);
          return (
            <button key={r.id} type="button" role="listitem" className={`card run ${r.id === run?.id ? "on" : ""}`} onClick={() => setSelected(r.id)}>
              <b>{r.data.name}</b>
              <span className="cap" data-testid={`run-${r.id}`}>
                {r.data.status === "queued" ? "queued, awaiting results" : `max ${fmt(r.data.max_stress_mpa)} MPa · SF ${fmt(value)}`}
              </span>
            </button>
          );
        })}
        <Pill onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          Run
        </Pill>
      </div>
      {run && (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Metric</th>
                <th>{run.data.name}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Max von Mises (MPa)", "max_stress_mpa"],
                  ["Allowable, from datasheet (MPa)", "allowable_mpa"],
                  ["Max deflection (mm)", "deflection_mm"],
                ] as const
              ).map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <input
                      className="cell-input mono weight"
                      type="number"
                      step="any"
                      aria-label={label}
                      value={run.data[key] ?? ""}
                      onChange={(e) =>
                        update<"sim_run">(run.id, { [key]: number(e.target.value), status: key === "max_stress_mpa" && e.target.value !== "" ? "imported" : run.data.status })
                      }
                    />
                  </td>
                </tr>
              ))}
              <tr className="totals">
                <td>Safety factor</td>
                <td className="mono" data-testid="run-sf">
                  {fmt(sf)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {run && run.data.convergence.length > 0 && (
        <section className="card conv" aria-label="Mesh convergence">
          <span className="cap">Mesh convergence</span>
          <table className="tbl">
            <tbody>
              {run.data.convergence.map((c) => (
                <tr key={c.mesh}>
                  <td className="mono">{c.mesh}</td>
                  <td className="mono">{c.value} MPa</td>
                </tr>
              ))}
            </tbody>
          </table>
          {step !== null && (
            <span className="cap" data-testid="convergence">
              {step < 0.02 ? "converged" : "not converged"}, last step {(step * 100).toFixed(1)}%
            </span>
          )}
        </section>
      )}
      {adding && decision && (
        <PromptDialog
          title="Add simulation run"
          placeholder="Run name"
          action="Add"
          onClose={() => setAdding(false)}
          onSubmit={(name) => {
            const r = add("sim_run", decision.id, { name, concept_id: concepts[0]?.id ?? "", status: "queued", solver: "", load_case: "", max_stress_mpa: null, allowable_mpa: null, deflection_mm: null, convergence: [], asset_ids: [] });
            setSelected(r.id);
            setAdding(false);
          }}
        />
      )}
      {confirming && run && (
        <ConfirmDialog
          title="Remove this run?"
          body={`“${run.data.name}” will be removed. Requirements it verified go back to being checked against the remaining runs.`}
          action="Remove"
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            remove(run.id);
            setSelected(null);
            setConfirming(false);
          }}
        />
      )}
    </Shell>
  );
}
