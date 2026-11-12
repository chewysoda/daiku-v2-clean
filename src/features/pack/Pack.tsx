/**
 * Handoff: build the pack the AI will read. A brief, then everything in three groups (pinned, included,
 * left out, each with its reason), a budget bar, and the exact text before it goes. Review sits beside it.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, PromptDialog, toast } from "../../design/primitives";
import { claudePrompt, PackSummary } from "../../lib/claudePack";
import { DELIVERABLES, Deliverable, DeliverableKind } from "../../lib/deliverable";
import { parseSent } from "../../lib/packBudget";
import { addGroup, editGroup, moveGroup, PRIORITIES, Priority, PackPlan, placeItem, removeGroup, setIncluded, setItemNote, setPinned, setPriority } from "../../lib/packPlan";
import { CodeCard, ModelsCard } from "./BuildMaterial";
import { musts, setCheck } from "../../lib/appSpec";
import { AppSpecView, PromptsView } from "./AppViews";
import { copyPack, parseSends, savePack } from "./handOff";
import { ReviewView } from "./Review";
import { ExtractView } from "./Extract";
import { PackPicker } from "./PackPicker";
import { parseTemplates, templateFrom } from "../../lib/packs";
import { uid } from "../../data/types";
import { formatTokens, PackRow, Placement, updatePlan, usePack } from "./usePack";
import "../studio.css";
import "./pack.css";
import "./handoff.css";

type Update = (change: (plan: PackPlan) => PackPlan) => void;
const update: Update = updatePlan;

const GROUPS: { place: Placement; title: string; note: string }[] = [
  { place: "pinned", title: "Pinned", note: "Always sent, whatever the budget." },
  { place: "included", title: "Included", note: "Sent while the budget allows, highest weight first." },
  { place: "out", title: "Left out", note: "Not sent. The AI is told they exist, so it can ask." },
];

const TYPE_LABEL: Record<string, string> = { draft: "Draft", board: "Board", decision: "Decision", source: "Source", note: "Note", claim: "Claim", interviews: "Interviews", deck: "Deck", progress: "Progress", history: "History" };

/** Starting points for the goal, so nobody faces an empty box. Each is a sentence to edit, not a mode. */
const BRIEF_STARTERS: { label: string; text: string }[] = [
  { label: "Website", text: "A website for this project, built from the boards: their pictures, palette and type. Phones first. Show the 3D models picked below so visitors can turn them, and cite every claim." },
  { label: "App", text: "An app that does the main task in the spec end to end, with the screens and data described there. Keep the decisions made in Decide." },
  { label: "Program", text: "A program that reads the inputs described in the spec and writes the results to files, with clear errors and a --help." },
  { label: "My own version", text: "My own version of the repository below: keep what works, change what the brief lists, and keep its licence and credits." },
  { label: "Product page", text: "A product page for the chosen concept, using the pictures, palette and claims on the board. Cite every claim's source." },
  { label: "Working prototype", text: "A working prototype of the app described in the spec. Follow the code I saved as the pattern to copy, and keep the decisions made in Decide." },
  { label: "Calculator", text: "A calculator for the loads and requirements in Decide, showing each input and where its value comes from." },
  { label: "Report", text: "A short design report: the brief, the options we looked at, the decision and the evidence behind it." },
];

/** Three steps, so it's clear what's done and what's left before the pack is worth sending. */
function Readiness({ brief, going, summary }: { brief: string; going: number; summary: PackSummary | null }) {
  const steps = [
    { label: "Say what to build", done: brief.trim().length >= 12, hint: "Write a sentence or two as the goal." },
    { label: "Choose the material", done: going > 0, hint: "Put at least one item in the pack." },
    { label: "Check the flags", done: !!summary && !summary.uncredited && !summary.unsupportedClaims && !summary.unlicensedCode, hint: "Optional. The AI is told about anything left open." },
  ];
  return (
    <ol className="pack-steps" aria-label="Before you send">
      {steps.map((st, i) => (
        <li key={st.label} className={st.done ? "done" : ""}>
          <span className="pack-step-num" aria-hidden="true">
            {st.done ? "✓" : i + 1}
          </span>
          <span>
            <b>{st.label}</b>
            <span className="cap">{st.done ? "Done" : st.hint}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** What the zip holds, folder by folder, before it's made. */
function ZipTree({ summary, includeFiles }: { summary: PackSummary; includeFiles: boolean }) {
  return (
    <details className="ho-zip">
      <summary className="ho-label">In the zip</summary>
      <ul className="pack-tree" aria-label="Files in the zip">
        {summary.folders
          .filter((f) => f.name)
          .map((f) => (
            <li key={f.name}>
              <details>
                <summary>
                  <span className="mono">{f.name}/</span> <span className="cap">{f.files.length}</span>
                </summary>
                <ul>
                  {f.files.map((name) => (
                    <li key={name} className="small-line">
                      {name}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        {includeFiles && summary.attachments > 0 && (
          <li>
            <span className="mono">attachments/</span> <span className="cap">{summary.attachments}</span>
          </li>
        )}
        {summary.folders
          .find((f) => !f.name)
          ?.files.map((name) => (
            <li key={name} className="mono">
              {name}
            </li>
          ))}
      </ul>
    </details>
  );
}

/** Keeps this brief's filled-in fields as a template for new packs. */
function saveTemplate(plan: PackPlan, name: string) {
  const { config, setSetting } = useStore.getState();
  const t = templateFrom(plan.app, uid(), name);
  if (!Object.keys(t.spec).length) {
    toast("The brief is empty, so there's nothing to keep yet.", "error");
    return;
  }
  setSetting("brief_templates", JSON.stringify([...parseTemplates(config.brief_templates), t]));
  toast(`Saved “${t.name}”. Pick it when you make a new pack.`, "info");
}

/** The four questions every brief answers. Goal is the pack's own brief; the rest live in the spec. */
function Brief({ plan }: { plan: PackPlan }) {
  const brief = useStore((s) => s.config.claude_brief);
  const rules = useStore((s) => s.config.claude_rules);
  const mustList = musts(plan.app);
  const setSetting = useStore((s) => s.setSetting);
  const setSpec = (key: "audience" | "must" | "done", value: string) => update((p) => ({ ...p, app: { ...p.app, [key]: value } }));
  const [naming, setNaming] = useState(false);
  return (
    <section className="card ho-card ho-brief" aria-label="Brief">
      <div className="ho-card-head">
        <h2 className="ho-h2">Brief</h2>
        <span className="cap">The AI reads this first.</span>
        <button type="button" className="ho-text-btn" onClick={() => setNaming(true)}>
          Save as template
        </button>
      </div>
      {naming && (
        <PromptDialog
          title="Save the brief as a template"
          placeholder="Template name"
          initial={plan.app.name ? `Like ${plan.app.name}` : "My template"}
          action="Save template"
          onClose={() => setNaming(false)}
          onSubmit={(name) => {
            saveTemplate(plan, name);
            setNaming(false);
          }}
        />
      )}
      <div className="ho-brief-grid">
        <label className="ho-field wide">
          <span className="ho-label">Goal</span>
          <textarea className="field" rows={2} aria-label="What do you want built?" placeholder="A desktop node editor that turns a graph into an Arduino sketch and uploads it." value={brief} onChange={(e) => setSetting("claude_brief", e.target.value)} />
          <span className="pack-starters" role="group" aria-label="Start from an example">
            <span className="cap">Start from</span>
            {BRIEF_STARTERS.map((b) => (
              <button
                key={b.label}
                type="button"
                className="ho-chip"
                title={b.text}
                onClick={() => {
                  const current = brief.trim();
                  setSetting("claude_brief", current ? `${current}\n\n${b.text}` : b.text);
                }}
              >
                {b.label}
              </button>
            ))}
          </span>
        </label>
        <label className="ho-field">
          <span className="ho-label">Audience</span>
          <textarea className="field" rows={3} aria-label="Audience" placeholder="Makers who know what a pin is, but not C++." value={plan.app.audience} onChange={(e) => setSpec("audience", e.target.value)} />
        </label>
        <label className="ho-field">
          <span className="ho-label">Must-haves</span>
          <textarea className="field" rows={3} aria-label="Must-haves" placeholder={"One per line\nTyped ports\nPin checks"} value={plan.app.must} onChange={(e) => setSpec("must", e.target.value)} />
        </label>
        <label className="ho-field">
          <span className="ho-label">Done when</span>
          <textarea className="field" rows={3} aria-label="Done when" placeholder="The blink example runs on a real board." value={plan.app.done} onChange={(e) => setSpec("done", e.target.value)} />
        </label>
        {mustList.length > 0 && (
          <div className="ho-field wide" role="group" aria-label="How you'll check each must-have">
            <span className="ho-label">How you'll check each must-have</span>
            <span className="cap">Something you can run or see. The AI is told to show each check passing, and Review lists them beside what came back.</span>
            <ul className="ho-checks">
              {mustList.map((m) => (
                <li key={m.text}>
                  <span className="ho-check-must">{m.text}</span>
                  {/* Kept on leaving the box: the must-haves above hold the check, so each keystroke would move them. */}
                  <input
                    key={m.check}
                    className="field"
                    aria-label={`Check for: ${m.text}`}
                    placeholder="A wire of the wrong type is refused, with a reason"
                    defaultValue={m.check}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== m.check) setSpec("must", setCheck(plan.app.must, m.text, e.target.value));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        <label className="ho-field wide">
          <span className="ho-label">Rules for every pack</span>
          <textarea
            className="field"
            rows={3}
            aria-label="Rules for every pack"
            placeholder={"One per line. These go at the top of every pack, whatever the brief.\nNever add a dependency without asking\nDon't change files outside src/"}
            value={rules}
            onChange={(e) => setSetting("claude_rules", e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function Row({ row, plan, weights }: { row: PackRow; plan: PackPlan; weights: boolean }) {
  const { item, place } = row;
  const pinned = plan.pinned.includes(item.id);
  const out = plan.excluded.includes(item.id);
  const [noting, setNoting] = useState(false);
  const note = plan.notes[item.id] ?? "";
  return (
    <li className={`ho-row ${place}`}>
      <div className="ho-row-main">
        <span className="ho-type">{TYPE_LABEL[item.type] ?? item.type}</span>
        <span className="ho-item-title" title={item.title}>
          {item.title || "Untitled"}
        </span>
        {item.flag && <span className={`state ${item.flag === "no evidence" || item.flag === "no source yet" ? "guess" : "conflict"}`}>{item.flag}</span>}
        {row.reason && <span className="ho-reason">{row.reason}</span>}
        <span className="ho-tokens">{formatTokens(row.tokens)}</span>
        {weights && !out && (
          <select className="field ho-weight" aria-label={`Weight of ${item.title}`} value={plan.priority[item.id] ?? "normal"} onChange={(e) => update((p) => setPriority(p, item.id, e.target.value as Priority))}>
            {PRIORITIES.map((w) => (
              <option key={w} value={w}>
                {w === "must" ? "Must" : w[0].toUpperCase() + w.slice(1)}
              </option>
            ))}
          </select>
        )}
        <span className="ho-actions">
          {!out && (
            <button type="button" className={`ho-icon ${pinned ? "on" : ""}`} aria-pressed={pinned} aria-label={pinned ? `Unpin ${item.title}` : `Pin ${item.title}`} title={pinned ? "Unpin" : "Pin: always send"} onClick={() => update((p) => setPinned(p, item.id, !pinned))}>
              <Icon name="pin" size={15} />
            </button>
          )}
          {!out && !noting && !note && (
            <button type="button" className="ho-icon" aria-label={`Add a note about ${item.title}`} title="Add a note for the AI" onClick={() => setNoting(true)}>
              <Icon name="text" size={15} />
            </button>
          )}
          <button type="button" className="ho-text-btn" aria-label={out ? `Include ${item.title}` : `Leave out ${item.title}`} onClick={() => update((p) => setPinned(setIncluded(p, [item.id], out), item.id, false))}>
            {out ? "Put back" : "Leave out"}
          </button>
        </span>
      </div>
      {!out && (noting || note) && (
        <input
          className="field ho-note"
          autoFocus={noting && !note}
          aria-label={`Note for the AI about ${item.title}`}
          placeholder="What should the AI know about this?"
          value={note}
          onChange={(e) => update((p) => setItemNote(p, item.id, e.target.value))}
          onBlur={() => setNoting(false)}
        />
      )}
    </li>
  );
}

function Contents({ rows, plan, weights }: { rows: PackRow[]; plan: PackPlan; weights: boolean }) {
  const [query, setQuery] = useState("");
  const [showOut, setShowOut] = useState(true);
  const q = query.trim().toLowerCase();
  // Matches the title or the kind, so "source" finds every source.
  const shown = q ? rows.filter((r) => r.item.title.toLowerCase().includes(q) || (TYPE_LABEL[r.item.type] ?? "").toLowerCase().startsWith(q)) : rows;
  const shownIn = shown.filter((r) => r.place !== "out").map((r) => r.item.id);
  return (
    <section className="card ho-card" aria-label="What goes in">
      <div className="ho-card-head">
        <h2 className="ho-h2">What goes in</h2>
        <span className="cap" data-testid="pack-count">
          {rows.filter((r) => r.place !== "out").length} of {rows.length} going
        </span>
        {q && shownIn.length > 0 && (
          <button type="button" className="ho-text-btn" onClick={() => update((p) => setIncluded(p, shownIn, false))}>
            Leave out all {shownIn.length} shown
          </button>
        )}
        <input className="field ho-search" type="search" aria-label="Find an item" placeholder="Find an item or a kind" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!rows.length && (
        <div className="ho-empty">
          {plan.includeSamples ? (
            "Nothing to send yet. Add a source to the Library or a card to a board, and it shows up here."
          ) : (
            <>
              Your own work shows up here. Until you have some, try it with the sample project.{" "}
              <button type="button" className="ho-text-btn" onClick={() => update((p) => ({ ...p, includeSamples: true }))}>
                Include the sample project
              </button>
            </>
          )}
        </div>
      )}
      {GROUPS.map(({ place, title, note }) => {
        const list = shown.filter((r) => r.place === place);
        if (!rows.length) return null;
        const total = list.reduce((n, r) => n + r.tokens, 0);
        const folded = place === "out" && !showOut;
        return (
          <div key={place} className={`ho-group ${place}`}>
            <div className="ho-group-head">
              <span className={`pt-key ${place}`} aria-hidden="true" />
              <h3 className="ho-h3">{title}</h3>
              <span className="ho-count">{list.length}</span>
              <span className="cap ho-group-note">{note}</span>
              <span className="ho-tokens">{formatTokens(total)}</span>
              {place === "out" && list.length > 0 && (
                <button type="button" className="ho-text-btn" aria-expanded={!folded} onClick={() => setShowOut((s) => !s)}>
                  {folded ? "Show" : "Hide"}
                </button>
              )}
            </div>
            {!folded && (
              <ul className="ho-rows">
                {list.map((r) => (
                  <Row key={r.item.id} row={r} plan={plan} weights={weights} />
                ))}
                {!list.length && <li className="ho-none">{place === "pinned" ? "Pin what the AI must always see: the key claims and the decision." : q ? `Nothing matches “${query.trim()}”.` : "Nothing here."}</li>}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Groups({ plan, rows }: { plan: PackPlan; rows: PackRow[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const g = plan.placed[r.item.id];
    if (g && r.place !== "out") counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return (
    <div className="ho-opt">
      <div className="ho-opt-head">
        <span className="ho-label">Reading order</span>
        <Pill className="small" onClick={() => update((p) => addGroup(p))}>
          Add group
        </Pill>
      </div>
      <p className="cap">Groups become numbered folders, read in order. Without any, things go in folders by type.</p>
      <ol className="pack-groups">
        {plan.groups.map((g, i) => (
          <li key={g.id} className="pack-group">
            <div className="pack-group-fields">
              <input className="field" aria-label={`Name of group ${i + 1}`} value={g.name} onChange={(e) => update((p) => editGroup(p, g.id, { name: e.target.value }))} />
              <input className="field" aria-label={`How the AI should use group ${i + 1}`} placeholder="How should the AI use this?" value={g.instruction} onChange={(e) => update((p) => editGroup(p, g.id, { instruction: e.target.value }))} />
              <select className="field" aria-label={`Add an item to group ${i + 1}`} value="" onChange={(e) => e.target.value && update((p) => placeItem(p, e.target.value, g.id))}>
                <option value="">Add an item… ({counts.get(g.id) ?? 0} in it)</option>
                {rows
                  .filter((r) => r.place !== "out" && plan.placed[r.item.id] !== g.id)
                  .map((r) => (
                    <option key={r.item.id} value={r.item.id}>
                      {r.item.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="pack-group-actions">
              <button type="button" className="link-btn" disabled={i === 0} aria-label={`Move group ${i + 1} up`} onClick={() => update((p) => moveGroup(p, g.id, -1))}>
                Up
              </button>
              <button type="button" className="link-btn" aria-label={`Remove group ${i + 1}`} onClick={() => update((p) => removeGroup(p, g.id))}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Flags({ summary }: { summary: PackSummary }) {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const lines = [
    summary.guessedScores ? { t: `${n(summary.guessedScores, "score is a guess", "scores are guesses")}`, k: "guess" } : null,
    summary.unsupportedClaims ? { t: `${n(summary.unsupportedClaims, "claim has", "claims have")} no evidence`, k: "guess" } : null,
    summary.uncredited ? { t: `${n(summary.uncredited, "source has", "sources have")} no credit`, k: "guess" } : null,
    summary.unlicensedCode ? { t: `${n(summary.unlicensedCode, "code file has", "code files have")} no licence: read and cite only`, k: "conflict" } : null,
    summary.historyHeldBack ? { t: "History stays out, as it mentions what's left out", k: "out" } : null,
    summary.noConsentNotes ? { t: `${n(summary.noConsentNotes, "interview note stays", "interview notes stay")} out: no consent recorded`, k: "out" } : null,
  ].filter((x): x is { t: string; k: string } => !!x);
  if (!lines.length) return null;
  return (
    <div className="ho-flags" data-testid="pack-flags">
      <span className="ho-label">The AI is told about these</span>
      {lines.map((l) => (
        <span key={l.t} className={`state ${l.k}`}>
          {l.t}
        </span>
      ))}
    </div>
  );
}

function MoreOptions({ plan, rows, weights, setWeights }: { plan: PackPlan; rows: PackRow[]; weights: boolean; setWeights: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const d = plan.deliverable;
  const startNew = () => {
    const { config, setSetting } = useStore.getState();
    const before = { plan: config.pack_plan, brief: config.claude_brief };
    setSetting("pack_plan", "");
    setSetting("claude_brief", "");
    toast("Started a new pack.", "info", {
      label: "Undo",
      run: () => {
        setSetting("pack_plan", before.plan);
        setSetting("claude_brief", before.brief);
      },
    });
  };
  const setD = (fields: Partial<Deliverable>) => update((p) => ({ ...p, deliverable: { ...p.deliverable, ...fields } }));
  return (
    <section className="card ho-card" aria-label="More options">
      <button type="button" className="ho-disclose" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ho-h2">More options</span>
        <span className="cap">Budget, weights, what to hand back, reading order</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ho-opts">
          <div className="ho-opt">
            <span className="ho-label">Token budget</span>
            <div className="ho-inline">
              <input
                className="field ho-num"
                type="number"
                min={0}
                step={1000}
                aria-label="Token budget"
                placeholder="No limit"
                value={plan.budget ?? ""}
                onChange={(e) => update((p) => ({ ...p, budget: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : null }))}
              />
              {[8000, 20000, 40000, 100000].map((b) => (
                <button key={b} type="button" className={`ho-chip ${plan.budget === b ? "on" : ""}`} onClick={() => update((p) => ({ ...p, budget: b }))}>
                  {formatTokens(b)}
                </button>
              ))}
            </div>
            <p className="cap">Counted for Claude with the usual estimate of four characters a token. Pinned items always go, and a conflict is named instead of dropped.</p>
          </div>
          <div className="ho-opt">
            <label className="check">
              <input type="checkbox" checked={weights} onChange={(e) => setWeights(e.target.checked)} />
              Show weights on each item
            </label>
            <label className="check">
              <input type="checkbox" checked={plan.diffOnly} onChange={(e) => update((p) => ({ ...p, diffOnly: e.target.checked }))} />
              Send only what changed since the last pack
            </label>
            <label className="check">
              <input type="checkbox" checked={plan.includeFiles} onChange={(e) => update((p) => ({ ...p, includeFiles: e.target.checked }))} />
              Put pictures and files in the zip
            </label>
          </div>
          <div className="ho-opt">
            <span className="ho-label">What to hand back</span>
            <div className="ho-inline" role="radiogroup" aria-label="What to hand back">
              {DELIVERABLES.map((x) => (
                <button key={x.kind} type="button" role="radio" aria-checked={d.kind === x.kind} className={`ho-chip ${d.kind === x.kind ? "on" : ""}`} onClick={() => setD({ kind: d.kind === x.kind ? ("" as DeliverableKind) : x.kind })}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className="ho-inline">
              <select className="field" aria-label="Depth" value={d.depth} onChange={(e) => setD({ depth: e.target.value as Deliverable["depth"] })}>
                <option value="short">Short</option>
                <option value="standard">Standard depth</option>
                <option value="thorough">Thorough</option>
              </select>
              <input className="field" aria-label="Format" placeholder="Format, e.g. Markdown" value={d.format} onChange={(e) => setD({ format: e.target.value })} />
              <input className="field" aria-label="Tone" placeholder="Tone, e.g. plain" value={d.tone} onChange={(e) => setD({ tone: e.target.value })} />
            </div>
            <input className="field" aria-label="Technical constraints" placeholder="Technical constraints, e.g. no new dependencies" value={d.constraints} onChange={(e) => setD({ constraints: e.target.value })} />
          </div>
          <Groups plan={plan} rows={rows} />
          <div className="ho-opt">
            <span className="ho-label">Start over</span>
            <p className="cap">Clears the brief, pins, weights, left-out items, groups and budget, ready for a project of your own.</p>
            <div>
              <Pill className="small" onClick={startNew}>
                Start a new pack
              </Pill>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** The budget, like a receipt: what's pinned, what's in, what's out, and the total against the limit. */
function Budget({ plan, tokens, summary }: { plan: PackPlan; tokens: Record<Placement, number>; summary: PackSummary | null }) {
  const sent = tokens.pinned + tokens.included;
  const budget = plan.budget;
  const over = budget != null && sent > budget;
  const scale = Math.max(budget ?? 0, sent + tokens.out, 1);
  const sends = parseSends(useStore((s) => s.config.pack_sends));
  const last = sends[sends.length - 1];
  return (
    <section className={`card ho-card ho-budget ${over ? "over" : ""}`} aria-label="Budget">
      <div className="ho-card-head">
        <h2 className="ho-h2">Budget</h2>
        <span className="cap">Claude · estimate</span>
      </div>
      <div className="ho-total">
        <b data-testid="pack-tokens">{formatTokens(summary?.tokens ?? sent)}</b>
        <span>{budget != null ? ` of ${formatTokens(budget)} tokens` : " tokens"}</span>
      </div>
      <div className={`pt-meter ho-meter ${over ? "over" : ""}`} aria-hidden="true">
        <span className="pt-seg out" style={{ transform: `scaleX(${(sent + tokens.out) / scale})` }} />
        <span className="pt-seg included" style={{ transform: `scaleX(${sent / scale})` }} />
        <span className="pt-seg pinned" style={{ transform: `scaleX(${tokens.pinned / scale})` }} />
        {budget != null && <span className="pt-budget" style={{ left: `${(budget / scale) * 100}%` }} />}
      </div>
      <dl className="ho-receipt">
        {(["pinned", "included", "out"] as Placement[]).map((p) => (
          <div key={p}>
            <dt>
              <span className={`pt-key ${p}`} aria-hidden="true" />
              {GROUPS.find((g) => g.place === p)!.title}
            </dt>
            <dd>{formatTokens(tokens[p])}</dd>
          </div>
        ))}
        <div className="ho-receipt-total">
          <dt>Brief, spec and CLAUDE.md</dt>
          <dd>{summary ? formatTokens(Math.max(0, summary.tokens - sent)) : "…"}</dd>
        </div>
      </dl>
      {over && (
        <p className="state conflict ho-conflict" role="status">
          <Icon name="warning" size={14} />
          {summary?.shaped.budget?.conflict ? `Pinned and must-have items need ${formatTokens(sent)}. Raise the budget or unpin something.` : `Over by ${formatTokens(sent - budget!)}.`}
        </p>
      )}
      {last && last.full > last.tokens && (
        <p className="cap ho-saved">
          Last send: {formatTokens(last.tokens)} instead of {formatTokens(last.full)}, {Math.round((1 - last.tokens / last.full) * 100)}% smaller.
        </p>
      )}
    </section>
  );
}

function PackView() {
  const { plan, brief, summary, rows, tokens } = usePack();
  const [weights, setWeights] = useState(() => Object.keys(plan.priority).length > 0);
  const [busy, setBusy] = useState(false);
  const work = async (job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } catch (e) {
      toast(`Couldn't make the pack: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const options = { brief, includeFiles: plan.includeFiles, includeSamples: plan.includeSamples, plan };
  return (
    <div className="ho-cols">
      <div className="ho-main">
        <Readiness brief={brief} going={rows.filter((r) => r.place !== "out").length} summary={summary} />
        <Brief plan={plan} />
        <CodeCard plan={plan} rows={rows} />
        <ModelsCard plan={plan} rows={rows} />
        <Contents rows={rows} plan={plan} weights={weights} />
        <MoreOptions plan={plan} rows={rows} weights={weights} setWeights={setWeights} />
      </div>
      <aside className="ho-side" aria-label="Send">
        <Budget plan={plan} tokens={tokens} summary={summary} />
        <section className="card ho-card">
          <div className="ho-send">
            <Pill ink disabled={busy} onClick={() => void work(() => copyPack(options))}>
              Copy as text
            </Pill>
            <Pill disabled={busy} onClick={() => void work(() => savePack(options, "Daiku pack.zip"))}>
              Export zip
            </Pill>
          </div>
          <NavLink to="/handoff/preview" className="ho-text-btn">
            Preview as the AI sees it
          </NavLink>
          <label className="check ho-check">
            <input type="checkbox" checked={plan.includeSamples} onChange={(e) => update((p) => ({ ...p, includeSamples: e.target.checked }))} />
            Include the sample project
          </label>
          {summary && <Flags summary={summary} />}
          {summary && <ZipTree summary={summary} includeFiles={plan.includeFiles} />}
          <span className="cap" data-testid="pack-attachments">
            {plan.includeFiles ? `${summary?.attachments ?? 0} files attached in the zip` : "Pictures and files left out of the zip"}
          </span>
        </section>
      </aside>
    </div>
  );
}

/** The exact text, editable. Edits are for this send only; the pack itself doesn't change. */
function PreviewView() {
  const { plan, brief, summary } = usePack();
  const sent = useStore((s) => s.config.pack_sent);
  const [text, setText] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    void claudePrompt(useStore.getState(), { brief, includeSamples: plan.includeSamples, plan, lastSent: parseSent(sent) }).then((t) => {
      if (!stale) setText(t);
    });
    return () => {
      stale = true;
    };
  }, [brief, plan, sent, summary]);
  const shown = edited ?? text ?? "";
  return (
    <div className="ho-preview">
      <div className="ho-preview-bar">
        <span className="cap">
          {text == null ? "Writing it out…" : `About ${formatTokens(Math.ceil(shown.length / 4))} tokens. ${edited != null ? "Edited for this send." : "Exactly what gets copied."}`}
        </span>
        {edited != null && (
          <button type="button" className="ho-text-btn" onClick={() => setEdited(null)}>
            Undo my edits
          </button>
        )}
        <Pill ink className="small" disabled={text == null} onClick={() => void copyPack({ brief, includeSamples: plan.includeSamples, plan }, edited ?? undefined)}>
          Copy this
        </Pill>
      </div>
      <textarea className="ho-preview-text" aria-label="The pack, as the AI will read it" spellCheck={false} value={shown} onChange={(e) => setEdited(e.target.value)} />
    </div>
  );
}

function HistoryView() {
  const sends = parseSends(useStore((s) => s.config.pack_sends));
  const totals = useMemo(() => sends.reduce((a, s) => ({ sent: a.sent + s.tokens, full: a.full + s.full }), { sent: 0, full: 0 }), [sends]);
  if (!sends.length) return <p className="ho-empty">Nothing sent yet. Copy or export a pack, and each send is listed here with its size.</p>;
  return (
    <section className="card ho-card" aria-label="Sends">
      <div className="ho-card-head">
        <h2 className="ho-h2">Sends</h2>
        <span className="cap">
          {formatTokens(totals.sent)} tokens sent, {formatTokens(totals.full - totals.sent)} saved by the budget and diffs
        </span>
      </div>
      <table className="ho-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Sent</th>
            <th>Without budget or diff</th>
            <th>Saved</th>
          </tr>
        </thead>
        <tbody>
          {[...sends].reverse().map((s) => (
            <tr key={s.at}>
              <td>{new Date(s.at).toLocaleString()}</td>
              <td>{formatTokens(s.tokens)}</td>
              <td>{formatTokens(s.full)}</td>
              <td>{s.full > s.tokens ? `${Math.round((1 - s.tokens / s.full) * 100)}%` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const TABS = [
  { to: "/handoff", label: "Pack", end: true },
  { to: "/handoff/preview", label: "Preview" },
  { to: "/handoff/review", label: "Review" },
  { to: "/handoff/spec", label: "Full spec" },
  { to: "/handoff/prompts", label: "Prompts" },
  { to: "/handoff/extract", label: "Extract" },
  { to: "/handoff/history", label: "History" },
];

export default function Pack() {
  const { view } = useParams();
  const { plan } = usePack();
  return (
    <main className="page ho" aria-label="Handoff">
      <div className="page-head ho-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Handoff</h1>
          <p className="page-sub">What the AI will read, and why. Nothing leaves this computer until you copy or export it.</p>
          <PackPicker />
        </div>
        <nav className="seg-group" aria-label="Handoff views">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `seg ${isActive ? "on" : ""}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {!view && <PackView />}
      {view === "preview" && <PreviewView />}
      {view === "review" && <ReviewView plan={plan} />}
      {view === "extract" && <ExtractView />}
      {view === "spec" && (
        <div className="ho-narrow">
          <AppSpecView plan={plan} update={update} />
        </div>
      )}
      {view === "prompts" && (
        <div className="ho-narrow">
          <PromptsView plan={plan} />
        </div>
      )}
      {view === "history" && (
        <div className="ho-narrow">
          <HistoryView />
        </div>
      )}
    </main>
  );
}
