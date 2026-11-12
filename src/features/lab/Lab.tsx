import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Concept, Criterion, Score, useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { AssetImage, ConfirmDialog, Pill, Popover, PromptDialog } from "../../design/primitives";
import { assumptionRisks, CLOSE_MARGIN, compensator, crossoverWeight, moveWeight, ranking, verdict, weightedTotals } from "../../lib/scoring";
import { bestStrength, isUnresolvedConflict } from "../../lib/readiness";
import { stanceOf } from "../../lib/studio";
import { EvidenceCard } from "./EvidenceCard";
import { GateBanner, LabTabs, LogDecision } from "./Engineering";
import { DecisionTitle, NewDecisionDialog, ProjectSelect } from "./LabAll";
import { groupByProject } from "./labTemplates";
import { SendToClaude } from "../pack/SendToClaude";
import "./lab.css";

const pct = (w: number) => `${(w * 100).toFixed(w * 1000 % 10 === 0 ? 0 : 1)}%`;

function ScoreCell({ concept, criterion, score }: { concept: Concept; criterion: Criterion; score?: Score }) {
  const setScore = useStore((s) => s.setScore);
  const assets = useStore((s) => s.assets);
  const allLinks = useStore((s) => s.evidence_links);
  const link = useStore((s) => s.linkEvidence);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const links = score ? allLinks.filter((l) => l.target_type === "score" && l.target_id === score.id) : [];

  const guess = !score || score.is_assumption;
  const backing = links.filter((l) => stanceOf(l) === "for").length;
  const conflicted = isUnresolvedConflict(links);
  const best = bestStrength(links);
  return (
    <td className="score-cell">
      <button
        type="button"
        className="score-btn"
        aria-label={`${concept.name}, ${criterion.name}: ${score ? score.value : "not scored"}${guess ? ", a guess" : `, sourced${best ? `, ${best} evidence` : ", not rated"}`}${conflicted ? ", sources disagree" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {score && guess && <span className="dot-guess" />}
        {score ? score.value : "–"}
        {!guess && (
          <span className="ev-mark" data-testid={`mark-${concept.label}-${criterion.name}`} title={best ? `Best evidence: ${best}` : "Evidence not rated"}>
            {best ? best[0].toUpperCase() : "?"}
          </span>
        )}
        {conflicted && (
          <span className="ev-mark" title="Sources disagree">
            ±
          </span>
        )}
      </button>
      {open && (
        <Popover className="score-pop" label={`${concept.name}, ${criterion.name}: score and evidence`} onClose={() => setOpen(false)}>
          <span className="cap">
            {concept.label} · {criterion.name}
          </span>
          <div className="score-values" role="group" aria-label="Score">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                className={`score-value ${score?.value === v ? "on" : ""}`}
                aria-pressed={score?.value === v}
                onClick={() => setScore(concept.id, criterion.id, v)}
              >
                {v}
              </button>
            ))}
          </div>
          {guess ? (
            <p className="score-note guess">A guess until you link a source.</p>
          ) : (
            <p className="score-note">Backed by {backing === 1 ? "a source" : `${backing} sources`}.</p>
          )}
          {links.map((l) => (
            <EvidenceCard key={l.id} link={l} conflicted={conflicted} />
          ))}
          {score &&
            (picking ? (
              <div className="ev-list">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="palette-row"
                    onClick={() => {
                      link(a.id, "score", score.id);
                      setPicking(false);
                    }}
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            ) : (
              <Pill className="small" onClick={() => setPicking(true)}>
                <Icon name="link" size={14} />
                Link a source
              </Pill>
            ))}
        </Popover>
      )}
    </td>
  );
}

function ConceptCard({ concept, total, faded }: { concept: Concept; total: number; faded: boolean }) {
  const asset = useStore((s) => s.assets.find((a) => a.id === concept.asset_id));
  const assets = useStore((s) => s.assets);
  const update = useStore((s) => s.updateConcept);
  const remove = useStore((s) => s.deleteConcept);
  const [editing, setEditing] = useState(false);
  return (
    <article className="concept">
      <div className="concept-im">
        {asset ? <AssetImage asset={asset} /> : <div className="concept-empty cap">no image yet</div>}
        {concept.flag && (
          <span className="concept-tag">
            <span className="dot-guess" />
            {concept.flag}
          </span>
        )}
        <button type="button" className="ib concept-edit" aria-label={`Edit ${concept.name}`} onClick={() => setEditing((e) => !e)}>
          <Icon name="more" size={18} />
        </button>
        {editing && (
          <Popover className="concept-pop" onClose={() => setEditing(false)}>
            <label className="lbl">
              <span className="cap">name</span>
              <input className="field" value={concept.name} onChange={(e) => update(concept.id, { name: e.target.value })} />
            </label>
            <label className="lbl">
              <span className="cap">warning shown on the image</span>
              <input className="field" value={concept.flag} placeholder="e.g. misses 7 kg limit" onChange={(e) => update(concept.id, { flag: e.target.value })} />
            </label>
            <label className="lbl">
              <span className="cap">image</span>
              <select className="field" value={concept.asset_id ?? ""} onChange={(e) => update(concept.id, { asset_id: e.target.value || null })}>
                <option value="">None</option>
                {assets
                  .filter((a) => a.kind === "image")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </label>
            <Pill className="small" onClick={() => remove(concept.id)}>
              Remove concept
            </Pill>
          </Popover>
        )}
      </div>
      <div className="concept-meta">
        <span className="concept-names">
          <span className="cap">concept {concept.label.toLowerCase()}</span>
          <span className="fr">{concept.name}</span>
        </span>
        <span className="concept-score">
          <span className={`fr ${faded ? "faded" : ""}`}>{total.toFixed(2)}</span>
          <span className="cap">/5</span>
        </span>
      </div>
    </article>
  );
}

/**
 * The ranking, live: rows re-sort as weights move, sliding to their new place so the change can be
 * followed. A concept with any guessed score says so.
 */
function Ranking({ concepts, totals, order, guesses }: { concepts: Concept[]; totals: Record<string, number>; order: string[]; guesses: Set<string> }) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
    for (const [id, el] of rows.current) {
      const top = el.offsetTop;
      const before = last.current.get(id);
      if (!reduce && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(0.77, 0, 0.175, 1)" });
      }
      last.current.set(id, top);
    }
  }, [order]);
  if (concepts.length < 2) return null;
  const max = Math.max(...Object.values(totals), 0.0001);
  const ranked = order.map((id) => concepts.find((c) => c.id === id)).filter((c): c is Concept => !!c);
  return (
    <section className="rank" aria-label="Ranking">
      <ol className="rank-list">
        {ranked.map((c, i) => (
          <li
            key={c.id}
            ref={(el) => {
              if (el) rows.current.set(c.id, el);
              else rows.current.delete(c.id);
            }}
            className={`rank-row ${i === 0 ? "lead" : ""}`}
          >
            <span className="rank-pos">{i + 1}</span>
            <span className="rank-name">
              {c.label} · {c.name}
            </span>
            <span className="rank-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${(totals[c.id] ?? 0) / max})` }} />
            </span>
            <span className="rank-total" data-testid={`rank-${c.label}`}>
              {(totals[c.id] ?? 0).toFixed(2)}
            </span>
            {guesses.has(c.id) && <span className="state guess">has guesses</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Lab() {
  const { decisionId } = useParams();
  const navigate = useNavigate();
  const decisions = useStore((s) => s.decisions);
  const boards = useStore((s) => s.boards);
  const allConcepts = useStore((s) => s.concepts);
  const allCriteria = useStore((s) => s.criteria);
  const scores = useStore((s) => s.scores);
  const addConcept = useStore((s) => s.addConcept);
  const addCriterion = useStore((s) => s.addCriterion);
  const updateCriterion = useStore((s) => s.updateCriterion);
  const deleteCriterion = useStore((s) => s.deleteCriterion);
  const deleteDecision = useStore((s) => s.deleteDecision);
  const setWeights = useStore((s) => s.setWeights);
  const [dialog, setDialog] = useState<"decision" | "concept" | "criterion" | "delete" | "log" | null>(null);

  const decision = decisions.find((d) => d.id === decisionId) ?? decisions[0];
  const board = boards.find((b) => b.id === decision?.board_id);
  const concepts = useMemo(
    () => allConcepts.filter((c) => c.decision_id === decision?.id).sort((a, b) => a.sort - b.sort),
    [allConcepts, decision?.id],
  );
  const savedCriteria = useMemo(
    () => allCriteria.filter((c) => c.decision_id === decision?.id).sort((a, b) => a.sort - b.sort),
    [allCriteria, decision?.id],
  );

  // What-if weights live here until "Keep these weights": sliding shouldn't rewrite the record.
  const [trial, setTrial] = useState<Criterion[] | null>(null);
  useEffect(() => setTrial(null), [decision?.id, savedCriteria]);
  const criteria = trial ?? savedCriteria;
  const ids = concepts.map((c) => c.id);
  const totals = weightedTotals(ids, criteria, scores);
  const order = ranking(totals);
  const v = verdict(ids, criteria, scores);
  const sumWeights = savedCriteria.reduce((s, c) => s + c.weight, 0);

  const label = (id: string | null) => concepts.find((c) => c.id === id)?.label ?? "";
  // The slider tests the criterion carrying the riskiest guess, or else the heaviest one.
  const risk = assumptionRisks(ids, savedCriteria, scores)[0];
  const focusId = risk?.criterion ?? [...savedCriteria].sort((a, b) => b.weight - a.weight)[0]?.id;
  const focus = criteria.find((c) => c.id === focusId);
  const cross = focusId ? crossoverWeight(ids, savedCriteria, scores, focusId) : null;
  const other = focusId ? compensator(savedCriteria, focusId) : null;
  const riskCriterion = criteria.find((c) => c.id === risk?.criterion);
  const riskConcept = concepts.find((c) => c.id === risk?.concept);

  if (!decision) {
    return (
      <main className="page lab">
        <div className="page-head">
          <h1 className="fr page-title">Lab</h1>
        </div>
        <p className="lab-empty">Compare concepts against weighted criteria, with every score tied to its evidence.</p>
        <div>
          <Pill ink onClick={() => setDialog("decision")}>
            <Icon name="plus" size={18} />
            New decision
          </Pill>
        </div>
        {dialog === "decision" && <NewDecisionDialog initialBoard={null} onClose={() => setDialog(null)} />}
      </main>
    );
  }

  const verdictTitle =
    v.kind === "empty" ? "Not enough to compare yet." : v.kind === "close" ? "Too close to call." : v.kind === "fragile" ? "The lead rests on a guess." : `${label(v.leader)} leads.`;

  return (
    <main className="page lab">
      <div className="page-head">
        <div className="page-head-text">
          <DecisionTitle decision={decision} as="h1" className="fr page-title" />
          <span className="page-sub">
            {board ? `${board.name} · ` : ""}decision{decision.is_sample ? " · sample data" : ""}
          </span>
        </div>
        <div className="lab-head-actions">
          <ProjectSelect decision={decision} />
          <Link className="pill" to="/decide/all">
            All projects
          </Link>
          <select
            className="field decision-select"
            aria-label="Switch decision"
            value={decision.id}
            onChange={(e) => navigate(`/decide/${e.target.value}`)}
          >
            {groupByProject(decisions, boards).map((group) => (
              <optgroup key={group.id ?? "none"} label={group.name}>
                {group.decisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Pill onClick={() => setDialog("decision")}>
            <Icon name="plus" size={16} />
            New
          </Pill>
          <SendToClaude focus={{ type: "decision", id: decision.id }} name={decision.title} />
          <button type="button" className="ib" aria-label="Delete this decision" title="Delete this decision" onClick={() => setDialog("delete")}>
            <Icon name="remove" size={18} />
          </button>
        </div>
      </div>

      <LabTabs decisionId={decision.id} />
      <GateBanner decisionId={decision.id} leaderId={order[0] ?? null} leaderLabel={concepts.find((c) => c.id === order[0])?.label ?? ""} />

      <Ranking concepts={concepts} totals={totals} order={order} guesses={new Set(scores.filter((x) => x.is_assumption).map((x) => x.concept_id))} />
      <section aria-label="Concepts" className="concepts">
        {concepts.map((c) => (
          <ConceptCard key={c.id} concept={c} total={totals[c.id]} faded={order.indexOf(c.id) > 1} />
        ))}
        <button type="button" className="concept-add" onClick={() => setDialog("concept")}>
          <Icon name="plus" size={22} />
          Add concept
        </button>
      </section>

      <div className="lab-grid">
        <section aria-label="Verdict" className="verdict">
          <h2 className="fr">{verdictTitle}</h2>
          {v.kind !== "empty" && (
            <p>
              {label(v.leader)} leads by {v.margin.toFixed(2)}
              {riskCriterion && riskConcept ? (
                <>
                  , but its {riskCriterion.name.toLowerCase()} score is <span className="guess">a guess, not a source</span>. At {risk.droppedTo} instead of {risk.value},{" "}
                  {riskConcept.label} drops to {risk.total.toFixed(2)}
                  {risk.newLeader ? ` and ${label(risk.newLeader)} leads` : ` and stays ahead`}.
                </>
              ) : v.margin < CLOSE_MARGIN ? (
                ", within the margin where small score changes matter."
              ) : (
                ", and no guess on the leader can flip it by a point."
              )}
            </p>
          )}
          {focus && (
            <div className="whatif">
              <label htmlFor="whatif" className="whatif-head">
                <span>How much does {focus.name.toLowerCase()} matter?</span>
                <span className="cap whatif-val">{pct(focus.weight)}</span>
              </label>
              <input
                id="whatif"
                type="range"
                min={0}
                max={Math.round(((savedCriteria.find((c) => c.id === focus.id)?.weight ?? 0) + (other?.weight ?? 0)) * 1000) / 10}
                step={0.5}
                value={focus.weight * 100}
                onChange={(e) => setTrial(moveWeight(savedCriteria, focus.id, Number(e.target.value) / 100) as Criterion[])}
              />
              <span className="cap">
                {cross
                  ? `${label(cross.overtaker)} takes the lead ${cross.weight < (savedCriteria.find((c) => c.id === focus.id)?.weight ?? 0) ? "below" : "above"} ${pct(cross.weight)} (weight moved to ${cross.movedTo.toLowerCase()})`
                  : `The leader doesn't change at any weight (moved to ${other?.name.toLowerCase() ?? "other criteria"})`}
              </span>
              {trial && (
                <div className="whatif-actions">
                  <Pill className="small" onClick={() => setTrial(null)}>
                    Reset
                  </Pill>
                  <Pill className="small" onClick={() => setWeights(trial)}>
                    Keep these weights
                  </Pill>
                </div>
              )}
            </div>
          )}
          <div className="verdict-actions">
            {riskCriterion && riskConcept && (
              <Pill
                ink
                onClick={() =>
                  navigate(`/explore?web=${encodeURIComponent(`${riskConcept.name} ${riskCriterion.name}`)}`)
                }
              >
                Find a {riskCriterion.name.toLowerCase()} source
              </Pill>
            )}
            <Pill onClick={() => setDialog("criterion")}>Add criterion</Pill>
            <Pill onClick={() => setDialog("log")}>Log this decision</Pill>
          </div>
        </section>

        <section aria-label="Decision matrix" className="matrix-wrap">
          <table className="mx">
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Weight</th>
                {concepts.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {criteria.map((q) => (
                <tr key={q.id} className={q.id === risk?.criterion ? "risky" : ""}>
                  <td>
                    <input
                      className="cell-input"
                      aria-label="Criterion name"
                      value={q.name}
                      onChange={(e) => updateCriterion(q.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="n">
                    <input
                      className="cell-input weight"
                      aria-label={`${q.name} weight, percent`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(q.weight * 1000) / 10}
                      onChange={(e) => updateCriterion(q.id, { weight: Number(e.target.value) / 100 })}
                    />
                    %
                  </td>
                  {concepts.map((c) => (
                    <ScoreCell
                      key={c.id}
                      concept={c}
                      criterion={q}
                      score={scores.find((s) => s.concept_id === c.id && s.criterion_id === q.id)}
                    />
                  ))}
                  <td className="row-x">
                    <button type="button" aria-label={`Remove ${q.name}`} onClick={() => deleteCriterion(q.id)}>
                      <Icon name="close" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="totals">
                <td>Weighted total</td>
                <td className={`n ${Math.abs(sumWeights - 1) > 0.001 ? "guess" : ""}`}>{Math.abs(sumWeights - 1) > 0.001 ? `${pct(sumWeights)}, not 100%` : ""}</td>
                {concepts.map((c) => (
                  <td key={c.id} className={`fr total ${order.indexOf(c.id) > 1 ? "faded" : ""}`} data-testid={`total-${c.label}`}>
                    {totals[c.id].toFixed(2)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
          <p className="cap legend-row">
            <span className="dot-guess" /> guess · every other score links to its source, marked S, M or W for its best evidence, ? if not rated, ± if sources disagree. Click a score to change it or link one.
          </p>
        </section>
      </div>

      {dialog === "decision" && <NewDecisionDialog initialBoard={board?.id ?? null} onClose={() => setDialog(null)} />}
      {dialog === "concept" && (
        <PromptDialog
          title="Add concept"
          placeholder="Concept name"
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(t) => {
            addConcept(decision.id, t);
            setDialog(null);
          }}
        />
      )}
      {dialog === "criterion" && (
        <PromptDialog
          title="Add criterion"
          placeholder="Criterion name"
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(t) => {
            addCriterion(decision.id, t);
            setDialog(null);
          }}
        />
      )}
      {dialog === "log" && <LogDecision decisionId={decision.id} concepts={concepts} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete this decision?"
          body={`“${decision.title}”, its concepts, criteria and scores will be removed. Library items aren't affected.`}
          action="Delete"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            deleteDecision(decision.id);
            setDialog(null);
            navigate("/decide");
          }}
        />
      )}
    </main>
  );
}
