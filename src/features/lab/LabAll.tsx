import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Decision, useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { ConfirmDialog, Pill, toast } from "../../design/primitives";
import { ranking, weightedTotals } from "../../lib/scoring";
import { groupByProject, LAB_TEMPLATES, summarise, templateById } from "./labTemplates";
import "./lab.css";

/** Starts a decision from a template, in a chosen project. Returns its id. */
export function useCreateDecision() {
  const createDecision = useStore((s) => s.createDecision);
  const addCriterion = useStore((s) => s.addCriterion);
  const setWeights = useStore((s) => s.setWeights);
  return (title: string, boardId: string | null, templateId: string) => {
    const decision = createDecision(title, boardId);
    const template = templateById(templateId);
    for (const [name] of template.criteria) addCriterion(decision.id, name);
    const added = useStore.getState().criteria.filter((c) => c.decision_id === decision.id).sort((a, b) => a.sort - b.sort);
    setWeights(added.map((c, i) => ({ id: c.id, weight: template.criteria[i][1] / 100 })));
    return decision.id;
  };
}

/** A new decision: what it's about, which project it belongs to, and what to start from. */
export function NewDecisionDialog({ initialBoard, onClose }: { initialBoard: string | null; onClose: () => void }) {
  const boards = useStore((s) => s.boards);
  const create = useCreateDecision();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [board, setBoard] = useState(initialBoard ?? "");
  const [template, setTemplate] = useState("blank");
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-label="New decision"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) {
            const id = create(title.trim(), board || null, template);
            onClose();
            navigate(`/decide/${id}`);
          }
        }}
      >
        <h2 className="fr dialog-title">New decision</h2>
        <input autoFocus className="field" aria-label="New decision" placeholder={templateById(template).placeholder} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} />
        <label className="lbl">
          <span className="cap">project</span>
          <select className="field" aria-label="Project" value={board} onChange={(e) => setBoard(e.target.value)}>
            <option value="">No project</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lbl">
          <span className="cap">start from</span>
          <select className="field" aria-label="Start from" value={template} onChange={(e) => setTemplate(e.target.value)}>
            {LAB_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.criteria.length ? ` (${t.criteria.length} criteria)` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <Pill onClick={onClose}>Cancel</Pill>
          <Pill ink type="submit" disabled={!title.trim()}>
            Create
          </Pill>
        </div>
      </form>
    </div>
  );
}

/** A decision's name, editable where it's shown. */
export function DecisionTitle({ decision, as: Tag = "span", className = "" }: { decision: Decision; as?: "h1" | "span"; className?: string }) {
  const rename = useStore((s) => s.renameDecision);
  const [editing, setEditing] = useState(false);
  if (editing) {
    const finish = (value: string) => {
      if (value.trim()) rename(decision.id, value.trim());
      setEditing(false);
    };
    return (
      <input
        autoFocus
        className={`field decision-title-input ${className}`}
        aria-label="Decision name"
        defaultValue={decision.title}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="decision-title">
      <Tag className={className}>{decision.title}</Tag>
      <button type="button" className="ib rename-btn" aria-label={`Rename ${decision.title}`} title="Rename" onClick={() => setEditing(true)}>
        <Icon name="pencil" size={15} />
      </button>
    </span>
  );
}

/** Which project a decision belongs to. */
export function ProjectSelect({ decision }: { decision: Decision }) {
  const boards = useStore((s) => s.boards);
  const update = useStore((s) => s.updateDecision);
  return (
    <select className="field project-select" aria-label={`Project for ${decision.title}`} value={decision.board_id ?? ""} onChange={(e) => update(decision.id, { board_id: e.target.value || null })}>
      <option value="">No project</option>
      {boards.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

/** Every decision in every project, editable from one place. */
export default function LabAll() {
  const decisions = useStore((s) => s.decisions);
  const boards = useStore((s) => s.boards);
  const concepts = useStore((s) => s.concepts);
  const criteria = useStore((s) => s.criteria);
  const scores = useStore((s) => s.scores);
  const duplicate = useStore((s) => s.duplicateDecision);
  const remove = useStore((s) => s.deleteDecision);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [newFor, setNewFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Decision | null>(null);
  const [filter, setFilter] = useState("");
  const shown = decisions.filter((d) => d.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const groups = groupByProject(shown, boards);
  const empty = boards.filter((b) => !decisions.some((d) => d.board_id === b.id));

  const leaderOf = (id: string) => {
    const own = concepts.filter((c) => c.decision_id === id);
    const qs = criteria.filter((c) => c.decision_id === id);
    if (own.length < 2 || !qs.length) return null;
    const totals = weightedTotals(own.map((c) => c.id), qs, scores);
    const top = ranking(totals)[0];
    const c = own.find((x) => x.id === top);
    return c ? { name: c.name, total: totals[top] } : null;
  };

  return (
    <main className="page lab lab-all">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">All projects</h1>
          <span className="page-sub">
            {decisions.length} decision{decisions.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="lab-head-actions">
          <label className="lab-filter">
            <Icon name="search" size={16} />
            <input aria-label="Filter decisions" placeholder="Filter decisions" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <Pill ink onClick={() => { setNewFor(null); setCreating(true); }}>
            <Icon name="plus" size={16} />
            New decision
          </Pill>
        </div>
      </div>

      {!decisions.length && <p className="lab-empty">No decisions yet. Start one for any project: a design, a tool, a method, a purchase.</p>}
      {decisions.length > 0 && !shown.length && <p className="lab-empty">Nothing matches that.</p>}

      {groups.map((group) => (
        <section key={group.id ?? "none"} className="lab-project" aria-label={group.name}>
          <div className="lab-project-head">
            <h2 className="fr">{group.name}</h2>
            {group.id && (
              <Link className="cap link-btn" to={`/board/${group.id}`}>
                open board
              </Link>
            )}
            <span className="grow" />
            <Pill className="small" aria-label={`New decision in ${group.name}`} onClick={() => { setNewFor(group.id); setCreating(true); }}>
              <Icon name="plus" size={14} />
              Decision
            </Pill>
          </div>
          <ul className="lab-rows">
            {group.decisions.map((d) => {
              const s = summarise(d.id, concepts, criteria, scores);
              const leader = leaderOf(d.id);
              return (
                <li key={d.id} className="lab-row" data-testid="lab-row">
                  <div className="lab-row-main">
                    <DecisionTitle decision={d} className="fr lab-row-title" />
                    <span className="cap">
                      {s.concepts} concept{s.concepts === 1 ? "" : "s"} · {s.criteria} criteria · {s.scored}/{s.cells} scored
                      {s.guesses ? (
                        <span className="guess">
                          {" "}
                          · {s.guesses} guess{s.guesses === 1 ? "" : "es"}
                        </span>
                      ) : null}
                      {leader ? ` · ${leader.name} leads at ${leader.total.toFixed(2)}` : ""}
                    </span>
                  </div>
                  <ProjectSelect decision={d} />
                  <Pill className="small" ink onClick={() => navigate(`/decide/${d.id}`)}>
                    Edit
                  </Pill>
                  <button
                    type="button"
                    className="ib"
                    aria-label={`Duplicate ${d.title}`}
                    title="Duplicate the matrix, including its scores and sources"
                    onClick={() => {
                      duplicate(d.id);
                      toast("Duplicated the matrix. Requirements, the BOM and simulations stay with the original.");
                    }}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                  <button type="button" className="ib" aria-label={`Delete ${d.title}`} title="Delete" onClick={() => setDeleting(d)}>
                    <Icon name="remove" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!filter && empty.length > 0 && (
        <section className="lab-project" aria-label="Projects with no decisions">
          <div className="lab-project-head">
            <h2 className="fr">No decisions yet</h2>
          </div>
          <div className="lab-empties">
            {empty.map((b) => (
              <Pill key={b.id} className="small" aria-label={`Start a decision in ${b.name}`} onClick={() => { setNewFor(b.id); setCreating(true); }}>
                <Icon name="plus" size={14} />
                {b.name}
              </Pill>
            ))}
          </div>
        </section>
      )}

      {creating && <NewDecisionDialog initialBoard={newFor} onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this decision?"
          body={`“${deleting.title}”, its concepts, criteria and scores will be removed. Library items aren't affected.`}
          action="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            remove(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </main>
  );
}
