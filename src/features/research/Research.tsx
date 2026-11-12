import { useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { Claim } from "../../data/types";
import { Icon } from "../../design/Icon";
import { MathText } from "../../design/MathText";
import { hasMath } from "../../lib/math";
import { hasMarkdown, MarkdownText } from "../../design/MarkdownText";
import { ConfirmDialog, Pill, PromptDialog, toast } from "../../design/primitives";
import { claimStrength, parseInterviewNotes, parseWikiLinks, stanceOf } from "../../lib/studio";
import { isUnresolvedConflict } from "../../lib/readiness";
import { EvidenceCard } from "../lab/EvidenceCard";
import { blockEdit } from "../../lib/noteEdit";
import { applyEdit, Capture, CaptureDialog, NoteToolbar, pictureIn } from "./NoteTools";
import "../studio.css";

function ExploreTabs() {
  return (
    <nav className="seg-group" aria-label="Explore sections">
      <NavLink to="/explore" end className={({ isActive }) => `seg ${isActive ? "on" : ""}`}>
        Discover
      </NavLink>
      <NavLink to="/explore/claims" className={({ isActive }) => `seg ${isActive ? "on" : ""}`}>
        Claims
      </NavLink>
      <NavLink to="/explore/interviews" className={({ isActive }) => `seg ${isActive ? "on" : ""}`}>
        Interviews
      </NavLink>
    </nav>
  );
}

export function Claims() {
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const assets = useStore((s) => s.assets);
  const boards = useStore((s) => s.boards);
  const records = useStore((s) => s.records);
  const addClaim = useStore((s) => s.addClaim);
  const deleteClaim = useStore((s) => s.deleteClaim);
  const linkEvidence = useStore((s) => s.linkEvidence);
  const navigate = useNavigate();
  // Threads opens a claim by id, so the screen lands on that claim instead of the first one.
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(() => params.get("claim"));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [stance, setStance] = useState<"for" | "against">("for");

  const rows = useMemo(
    () =>
      claims.map((claim: Claim) => {
        const own = links.filter((l) => l.target_type === "claim" && l.target_id === claim.id);
        const forLinks = own.filter((l) => stanceOf(l) === "for");
        const against = own.filter((l) => stanceOf(l) === "against");
        return { claim, forLinks, against, strength: claimStrength(forLinks.length, against.length, forLinks.map((l) => l.strength)) };
      }),
    [claims, links],
  );
  const counts = (s: string) => rows.filter((r) => r.strength === s).length;
  const focus = rows.find((r) => r.claim.id === selected) ?? rows[0];
  const caveats = focus ? selectRecords(records, "highlight").filter((h) => h.data.kind === "limitation" && h.data.claim_id === focus.claim.id) : [];
  const anySample = rows.some((r) => r.claim.is_sample);

  return (
    <main className="page lab-eng">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Claims</h1>
          <span className="page-sub">Every claim your study leans on, with the evidence for and against it.</span>
        </div>
        <ExploreTabs />
      </div>
      <div className="eng-bar">
        <span className="cap">
          {counts("strong")} strong · {counts("medium")} medium · {counts("mixed")} mixed · {counts("assumption")} assumptions{anySample ? " · sample data" : ""}
        </span>
        <Pill onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          Claim
        </Pill>
      </div>
      <div className="eng-cols">
        <div className="eng-main">
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>For</th>
                  <th>Against</th>
                  <th>Strength</th>
                  <th>Used in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.claim.id} className={focus?.claim.id === r.claim.id ? "row-on" : ""} onClick={() => setSelected(r.claim.id)}>
                    <td>
                      <button type="button" className="link-btn plain" onClick={() => setSelected(r.claim.id)}>
                        <MathText text={r.claim.text} />
                      </button>
                    </td>
                    <td className="mono">{r.forLinks.length}</td>
                    <td className="mono">{r.against.length}</td>
                    <td>
                      <span className={`tag ${r.strength === "assumption" ? "assume" : ""}`} data-testid={`strength-${r.claim.id}`}>
                        {r.strength}
                      </span>
                    </td>
                    <td className="cap">{boards.find((b) => b.id === r.claim.board_id)?.name ?? "–"}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      No claims yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="cap legend-row">strong = 3+ for, none against, and at least one rated strong once any are rated · medium = 1–2 for · mixed = any source against · assumption = no sources</p>
        </div>
        <aside className="eng-side">
          {focus && (
            <div className="card side-card" aria-label="Claim details">
              <span className="cap">Claim · {focus.strength}</span>
              <h2 className="fr side-title"><MathText text={focus.claim.text} /></h2>
              <span className="cap">For · {focus.forLinks.length}</span>
              {focus.forLinks.map((l) => <EvidenceCard key={l.id} link={l} conflicted={isUnresolvedConflict([...focus.forLinks, ...focus.against])} />)}
              <span className="cap">Against · {focus.against.length}</span>
              {focus.against.map((l) => <EvidenceCard key={l.id} link={l} conflicted={isUnresolvedConflict([...focus.forLinks, ...focus.against])} />)}
              {caveats.map((c) => (
                <span key={c.id} className="cap">
                  Caveat, p. {c.data.page}: {c.data.text}
                </span>
              ))}
              <div className="form-row">
                <select className="field" aria-label="Stance" value={stance} onChange={(e) => setStance(e.target.value as "for" | "against")}>
                  <option value="for">for</option>
                  <option value="against">against</option>
                </select>
                <select
                  className="field"
                  aria-label="Add a source"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      linkEvidence(e.target.value, "claim", focus.claim.id, stance);
                      toast(`Added as evidence ${stance}`);
                    }
                  }}
                >
                  <option value="">Add a source…</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sel-actions">
                <Pill className="small" onClick={() => navigate(`/explore?web=${encodeURIComponent(focus.claim.text)}`)}>
                  Find more sources
                </Pill>
                <Pill className="small" onClick={() => setRemoving(true)}>
                  Remove claim
                </Pill>
              </div>
            </div>
          )}
        </aside>
      </div>
      {adding && (
        <PromptDialog
          title="New claim"
          placeholder="What are you claiming?"
          onClose={() => setAdding(false)}
          onSubmit={(text) => {
            const c = addClaim(text, null);
            setSelected(c.id);
            setAdding(false);
          }}
        />
      )}
      {removing && focus && (
        <ConfirmDialog
          title="Remove this claim?"
          body={`“${focus.claim.text}” and its evidence links will be removed. The sources stay in your Library.`}
          action="Remove"
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            deleteClaim(focus.claim.id);
            setSelected(null);
            setRemoving(false);
          }}
        />
      )}
    </main>
  );
}

export function Interviews() {
  const records = useStore((s) => s.records);
  const decisions = useStore((s) => s.decisions);
  const add = useStore((s) => s.addRecord);
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const participants = selectRecords(records, "participant");
  const themes = selectRecords(records, "theme");
  const notes = selectRecords(records, "interview_note");
  const requirements = selectRecords(records, "requirement");
  const [dialog, setDialog] = useState<"theme" | "req" | null>(null);
  const [importing, setImporting] = useState(false);
  const [paste, setPaste] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const focus = themes.find((t) => t.id === selected) ?? themes[0];

  const codeOf = (id: string) => participants.find((p) => p.id === id)?.data.code ?? "?";
  const reached = (themeId: string) => new Set(notes.filter((n) => n.data.theme_id === themeId).map((n) => n.data.participant_id));
  const decision = decisions[0];

  const runImport = () => {
    const parsed = parseInterviewNotes(paste);
    if (!parsed.length) {
      toast("Nothing to import. Write each note as “P1: what they said”.", "error");
      return;
    }
    const known = new Map(participants.map((p) => [p.data.code, p.id]));
    for (const { code, text } of parsed) {
      if (!known.has(code)) known.set(code, add("participant", null, { code, context: "", consent: false }).id);
      add("interview_note", null, { participant_id: known.get(code)!, theme_id: null, text });
    }
    toast(`Imported ${parsed.length} note${parsed.length === 1 ? "" : "s"}. Record consent for anyone new.`);
    setPaste("");
    setImporting(false);
  };

  const unsorted = notes.filter((n) => !n.data.theme_id);
  const themeSelect = (id: string, value: string | null) => (
    <select className="field note-theme" aria-label="Theme" value={value ?? ""} onChange={(e) => update<"interview_note">(id, { theme_id: e.target.value || null })}>
      <option value="">Unsorted</option>
      {themes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.data.name}
        </option>
      ))}
    </select>
  );

  return (
    <main className="page lab-eng">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Interviews</h1>
          <span className="page-sub">What people told you, sorted into themes you can act on.</span>
        </div>
        <ExploreTabs />
      </div>
      <div className="eng-bar">
        <div className="chips" aria-label="Participants">
          <span className="cap">participants · {participants.length}</span>
          {participants.map((p) => (
            <label key={p.id} className="chip" title={p.data.consent ? "Consent recorded" : "No consent recorded"}>
              <input type="checkbox" aria-label={`Consent recorded for ${p.data.code}`} checked={p.data.consent} onChange={(e) => update<"participant">(p.id, { consent: e.target.checked })} />
              <b>{p.data.code}</b> <span className="cap">{p.data.context}</span>
            </label>
          ))}
        </div>
        <div className="sel-actions">
          <Pill onClick={() => setImporting(true)}>Import notes</Pill>
          <Pill onClick={() => setDialog("theme")}>
            <Icon name="plus" size={16} />
            Theme
          </Pill>
        </div>
      </div>
      <div className="eng-cols">
        <div className="eng-main theme-grid">
          {themes.map((t) => (
            <section key={t.id} className={`card theme ${focus?.id === t.id ? "on" : ""}`} aria-label={t.data.name} onClick={() => setSelected(t.id)}>
              <div className="calc-head">
                <b>{t.data.name}</b>
                <span className="cap" data-testid={`theme-${t.id}`}>
                  {reached(t.id).size} of {participants.length}
                </span>
              </div>
              {notes
                .filter((n) => n.data.theme_id === t.id)
                .map((n) => (
                  <div key={n.id} className="inote">
                    <span>{n.data.text}</span>
                    <span className="cap">{codeOf(n.data.participant_id)}</span>
                  </div>
                ))}
            </section>
          ))}
          {unsorted.length > 0 && (
            <section className="card theme" aria-label="Unsorted notes">
              <b>Unsorted</b>
              {unsorted.map((n) => (
                <div key={n.id} className="inote">
                  <span>{n.data.text}</span>
                  <span className="cap">{codeOf(n.data.participant_id)}</span>
                  {themeSelect(n.id, n.data.theme_id)}
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="eng-side">
          {focus && (
            <div className="card side-card">
              <span className="cap">Theme</span>
              <h2 className="fr side-title">{focus.data.name}</h2>
              <span className="cap">
                {reached(focus.id).size} of {participants.length} participants · {[...reached(focus.id)].map(codeOf).join(" ")}
              </span>
              <Pill className="small" disabled={!decision} onClick={() => setDialog("req")}>
                Add as requirement
              </Pill>
              <button type="button" className="link-btn" onClick={() => remove(focus.id)}>
                Remove theme
              </button>
            </div>
          )}
          <div className="card side-card">
            <span className="cap">Privacy</span>
            <p className="cap">Use P-codes, not names. Notes stay on this device, and consent is recorded for {participants.filter((p) => p.data.consent).length} of {participants.length}.</p>
          </div>
        </aside>
      </div>
      {dialog === "theme" && (
        <PromptDialog
          title="New theme"
          placeholder="Theme name"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            add("theme", null, { name });
            setDialog(null);
          }}
        />
      )}
      {dialog === "req" && focus && decision && (
        <PromptDialog
          title="Add as requirement"
          initial={`Addresses “${focus.data.name}”`}
          action="Add"
          onClose={() => setDialog(null)}
          onSubmit={(text) => {
            add("requirement", decision.id, {
              code: `R${requirements.filter((r) => r.parent_id === decision.id).length + 1}`,
              text,
              priority: "want",
              why: `Raised in interviews: ${focus.data.name}, ${reached(focus.id).size} of ${participants.length}.`,
              op: "<=",
              min: null,
              max: null,
              unit: "",
              source: "manual",
              verified_by: "",
              values: {},
            });
            setDialog(null);
            toast("Added to Requirements");
          }}
        />
      )}
      {importing && (
        <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && setImporting(false)}>
          <div className="dialog" role="dialog" aria-label="Import notes">
            <h2 className="fr dialog-title">Import notes</h2>
            <textarea className="field paste" autoFocus aria-label="Notes to import" placeholder={"P1: Moves the chair every day\nP2: Can't lift it one-handed"} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <div className="dialog-actions">
              <Pill onClick={() => setImporting(false)}>Cancel</Pill>
              <Pill ink onClick={runImport}>
                Import
              </Pill>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export function Notes() {
  const records = useStore((s) => s.records);
  const claims = useStore((s) => s.claims);
  const concepts = useStore((s) => s.concepts);
  const add = useStore((s) => s.addRecord);
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const notes = selectRecords(records, "note");
  // "?note=<id>" opens one note, as when it's found with Ctrl+K.
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("note"));
  const [adding, setAdding] = useState(false);
  const note = notes.find((n) => n.id === selected) ?? notes[0];
  const bodyBox = useRef<HTMLTextAreaElement>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [dropping, setDropping] = useState(false);

  const open = (title: string) => {
    const hit = notes.find((n) => n.data.title.toLowerCase() === title.toLowerCase());
    // Linking to a name that doesn't exist yet makes a placeholder to fill in later.
    const target = hit ?? add("note", null, { title, body: "" });
    setSelected(target.id);
  };
  const resolve = (target: string): { label: string; to: string } | null => {
    const lower = target.toLowerCase();
    if (claims.some((c) => c.text.toLowerCase() === lower)) return { label: "claim", to: "/explore/claims" };
    const concept = concepts.find((c) => c.name.toLowerCase() === lower);
    if (concept) return { label: "concept", to: `/decide/${concept.decision_id}` };
    return null;
  };
  const outgoing = note ? parseWikiLinks(note.data.body) : [];
  const backlinks = note
    ? notes.filter((n) => n.id !== note.id && parseWikiLinks(n.data.body).some((l) => l.target.toLowerCase() === note.data.title.toLowerCase()))
    : [];

  return (
    <main className="page lab-eng">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Notes</h1>
          <span className="page-sub">Plain Markdown. Type [[ a name ]] to link, supports:: [[ a name ]] for a typed link, or $x^2$ for a formula.</span>
        </div>
        <Pill onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          Note
        </Pill>
      </div>
      <div className="notes-cols">
        <nav className="note-list" aria-label="Notes">
          {notes.map((n) => (
            <button key={n.id} type="button" className={`note-row ${note?.id === n.id ? "on" : ""}`} onClick={() => setSelected(n.id)}>
              {n.data.title}
            </button>
          ))}
          {!notes.length && <p className="cap">No notes yet.</p>}
        </nav>
        {note ? (
          <>
            <div className="note-edit">
              <input className="note-title fr" aria-label="Note title" value={note.data.title} onChange={(e) => update<"note">(note.id, { title: e.target.value })} />
              <NoteToolbar box={bodyBox} onBody={(body) => update<"note">(note.id, { body })} onCapture={setCapture} />
              <textarea
                ref={bodyBox}
                className={`note-body ${dropping ? "dropping" : ""}`}
                aria-label="Note body"
                value={note.data.body}
                onChange={(e) => update<"note">(note.id, { body: e.target.value })}
                onPaste={(e) => {
                  const picture = pictureIn(e.clipboardData);
                  if (picture) {
                    e.preventDefault();
                    setCapture({ kind: "picture", picture });
                  }
                }}
                onDragOver={(e) => {
                  if ([...e.dataTransfer.types].includes("Files")) {
                    e.preventDefault();
                    setDropping(true);
                  }
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  setDropping(false);
                  const picture = pictureIn(e.dataTransfer);
                  if (picture) {
                    e.preventDefault();
                    setCapture({ kind: "picture", picture });
                  }
                }}
              />
              {(hasMath(note.data.body) || hasMarkdown(note.data.body)) && (
                <div className="note-preview" data-testid="note-preview">
                  <span className="cap">preview</span>
                  <MarkdownText text={note.data.body} />
                </div>
              )}
            </div>
            <aside className="eng-side" aria-label="Links">
              <span className="cap">Links · {outgoing.length}</span>
              {outgoing.map((l) => {
                const object = resolve(l.target);
                return object ? (
                  <Link key={`${l.relation}${l.target}`} className="link-row" to={object.to}>
                    {l.relation && <span className="tag">{l.relation}</span>} {l.target} <span className="cap">{object.label}</span>
                  </Link>
                ) : (
                  <button key={`${l.relation}${l.target}`} type="button" className="link-row" onClick={() => open(l.target)}>
                    {l.relation && <span className="tag">{l.relation}</span>} {l.target}
                    {!notes.some((n) => n.data.title.toLowerCase() === l.target.toLowerCase()) && <span className="cap"> · new</span>}
                  </button>
                );
              })}
              <span className="cap">Backlinks · {backlinks.length}</span>
              {backlinks.map((b) => (
                <button key={b.id} type="button" className="link-row" onClick={() => setSelected(b.id)}>
                  {b.data.title}
                </button>
              ))}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  remove(note.id);
                  setSelected(null);
                }}
              >
                Remove note
              </button>
            </aside>
          </>
        ) : (
          <p>Create a note to start.</p>
        )}
      </div>
      {capture && note && (
        <CaptureDialog
          capture={capture}
          onClose={() => setCapture(null)}
          onInsert={(block) => {
            setCapture(null);
            if (bodyBox.current) applyEdit(bodyBox.current, (body, start, end) => blockEdit(body, start, end, block), (body) => update<"note">(note.id, { body }));
          }}
        />
      )}
      {adding && (
        <PromptDialog
          title="New note"
          placeholder="Title"
          onClose={() => setAdding(false)}
          onSubmit={(title) => {
            open(title);
            setAdding(false);
          }}
        />
      )}
    </main>
  );
}
