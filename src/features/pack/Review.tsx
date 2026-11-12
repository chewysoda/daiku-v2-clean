/**
 * Review: what came back, beside what was asked. Each must-have and each "done when" line is marked by the
 * person as met, partly met or unmet. Unmet ones start a revision pack in one click. Once an answer is pasted, each
 * unmarked row shows a hint read from the answer's wording, which becomes a mark only when the person clicks it.
 * A passage of the answer can go onto a board as a proposed card, to accept or reject there.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useStore } from "../../data/store";
import { now, uid } from "../../data/types";
import { Pill, toast } from "../../design/primitives";
import { lines } from "../../lib/appSpec";
import { PackPlan } from "../../lib/packPlan";
import { isProposal, proposalCard } from "../../lib/proposals";
import { copyText } from "../../lib/platform";
import { compareSpecs, criteria, lineDiff, Mark, MARKS, parseReview, Review, revisionMarkdown, saveVersion, suggestMark, tally } from "../../lib/review";

const MARK_LABEL: Record<Mark, string> = { met: "Met", partly: "Partly", unmet: "Unmet" };
const HINT_LABEL: Record<Mark, string> = { met: "Looks met", partly: "Looks partly met", unmet: "Not mentioned" };
const FIELD_LABEL: Record<string, string> = { must: "Must-haves", should: "Preferences", done: "Done when", pitch: "What it does", audience: "Audience", problem: "Problem" };

export function ReviewView({ plan }: { plan: PackPlan }) {
  const json = useStore((s) => s.config.pack_review);
  const setSetting = useStore((s) => s.setSetting);
  const review = useMemo(() => parseReview(json), [json]);
  const save = (next: Review) => setSetting("pack_review", JSON.stringify(next));
  const list = criteria(plan.app);
  const counts = tally(review, list);
  const hints = useMemo(() => new Map(list.map((c) => [c.text, suggestMark(c.text, review.output)])), [list, review.output]);
  const [why, setWhy] = useState("");
  const [compareId, setCompareId] = useState("");
  const boards = useStore((s) => s.boards);
  const items = useStore((s) => s.board_items);
  const putItems = useStore((s) => s.putItems);
  // The person's own boards first, most recently worked on; the samples after.
  const boardChoices = useMemo(() => [...boards].sort((a, b) => Number(a.is_sample) - Number(b.is_sample) || b.updated_at.localeCompare(a.updated_at)), [boards]);
  const [boardPick, setBoardPick] = useState("");
  const target = boardChoices.find((b) => b.id === boardPick) ?? boardChoices[0];
  const waiting = target ? items.filter((i) => i.board_id === target.id && isProposal(i)).length : 0;
  const answer = useRef<HTMLTextAreaElement>(null);
  const [picked, setPicked] = useState("");
  const readPick = () => {
    const el = answer.current;
    setPicked(el ? el.value.slice(el.selectionStart, el.selectionEnd).trim() : "");
  };
  const addToBoard = () => {
    if (!target || !picked) return;
    const card = proposalCard(target.id, picked, useStore.getState().board_items, uid(), now());
    putItems([card]);
    toast(`Added to ${target.name} as a proposal. Accept or reject it there.`, "info", {
      label: "Undo",
      run: () => useStore.getState().deleteItems([card.id]),
    });
  };
  const compared = review.versions.find((v) => v.id === compareId) ?? review.versions[review.versions.length - 1];
  const changes = compared ? compareSpecs(compared.spec, plan.app) : [];

  // Clicking the chosen mark again clears it, back to "to check".
  const mark = (text: string, m: Mark) => {
    const marks = { ...review.marks };
    if (marks[text] === m) delete marks[text];
    else marks[text] = m;
    save({ ...review, marks });
  };
  const startRevision = async () => {
    const ok = await copyText(revisionMarkdown(plan.app, review, useStore.getState().config.claude_rules));
    toast(ok ? "Revision pack copied. Paste it into the same chat." : "Couldn't reach the clipboard.", ok ? "info" : "error");
  };

  return (
    <div className="rv">
      <section className="card ho-card rv-output" aria-label="What came back">
        <div className="ho-card-head">
          <h2 className="ho-h2">What came back</h2>
          <span className="cap">Paste the AI's answer here. It stays on this computer.</span>
        </div>
        <textarea
          ref={answer}
          className="field rv-text"
          aria-label="The AI's answer"
          placeholder="Paste the plan, spec or code summary the AI sent back."
          value={review.output}
          onChange={(e) => {
            save({ ...review, output: e.target.value });
            readPick();
          }}
          onSelect={readPick}
        />
        {review.output.trim() && boardChoices.length > 0 && (
          <div className="rv-to-board">
            <span className="cap rv-to-board-how">{picked ? `${picked.length.toLocaleString()} characters selected` : "Select part of the answer to keep it as a card."}</span>
            <select className="field" aria-label="Board to add it to" value={target?.id ?? ""} onChange={(e) => setBoardPick(e.target.value)}>
              {boardChoices.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <Pill className="small" disabled={!picked} onClick={addToBoard}>
              Add to board
            </Pill>
            {waiting > 0 && target && (
              <Link className="cap rv-waiting" to={`/board/${target.id}`}>
                {waiting} waiting for you on {target.name}
              </Link>
            )}
          </div>
        )}
      </section>
      <div className="rv-side">
        <section className="card ho-card" aria-label="Checklist">
          <div className="ho-card-head">
            <h2 className="ho-h2">Against the brief</h2>
            <span className="cap">
              {counts.met} met · {counts.partly} partly · {counts.unmet} unmet · {counts.open} to check
              {review.output.trim() && counts.open > 0 ? " · hints are a rough read of the answer's words" : ""}
            </span>
          </div>
          {!list.length && <p className="ho-empty">Add must-haves or “done when” lines to the brief, and each one becomes a row to check here.</p>}
          <ul className="rv-list">
            {list.map((c) => {
              const m = review.marks[c.text];
              const hint = m ? null : hints.get(c.text);
              return (
                <li key={c.text} className={`rv-row ${m ?? "open"}`}>
                  <div className="rv-row-main">
                    <span className="rv-from">{c.from === "must" ? "Must" : "Done"}</span>
                    <span className="rv-crit">{c.text}</span>
                    <span className="rv-marks" role="radiogroup" aria-label={`How well it meets: ${c.text}`}>
                      {MARKS.map((x) => (
                        <button key={x} type="button" role="radio" aria-checked={m === x} className={`rv-mark ${x} ${m === x ? "on" : ""}`} onClick={() => mark(c.text, x)}>
                          {MARK_LABEL[x]}
                        </button>
                      ))}
                    </span>
                  </div>
                  {c.check && <span className="cap rv-check">Check: {c.check}</span>}
                  {hint && (
                    <span className="rv-hint">
                      <button type="button" className={`rv-hint-use ${hint.mark}`} onClick={() => mark(c.text, hint.mark)} title={`${hint.why}. Click to mark it ${MARK_LABEL[hint.mark].toLowerCase()}.`}>
                        {HINT_LABEL[hint.mark]} · use
                      </button>
                      {hint.quote && <q className="cap rv-quote">{hint.quote}</q>}
                    </span>
                  )}
                  {m && m !== "met" && (
                    <input
                      className="field rv-note"
                      aria-label={`What's missing: ${c.text}`}
                      placeholder="What's missing?"
                      value={review.notes[c.text] ?? ""}
                      onChange={(e) => save({ ...review, notes: { ...review.notes, [c.text]: e.target.value } })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="ho-send">
            <Pill ink disabled={!list.length} onClick={() => void startRevision()}>
              Start revision pack
            </Pill>
          </div>
          <p className="cap">Carries what's unmet and partly met with your notes, keeps what's met, and says how the brief moved.</p>
        </section>
        <section className="card ho-card" aria-label="Brief versions">
          <div className="ho-card-head">
            <h2 className="ho-h2">Brief versions</h2>
            <span className="cap">{review.versions.length ? `${review.versions.length} saved` : "None saved yet"}</span>
          </div>
          <div className="ho-inline">
            <input className="field" aria-label="Why the direction changed" placeholder="Why it changed, e.g. cut MQTT from v1" value={why} onChange={(e) => setWhy(e.target.value)} />
            <Pill
              className="small"
              onClick={() => {
                save(saveVersion(review, plan.app, why, uid(), new Date().toISOString()));
                setWhy("");
                toast("Saved this version of the brief.", "info");
              }}
            >
              Save version
            </Pill>
          </div>
          {review.versions.length > 0 && (
            <>
              <select className="field" aria-label="Compare with" value={compared?.id ?? ""} onChange={(e) => setCompareId(e.target.value)}>
                {[...review.versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.at).toLocaleString()}
                    {v.why ? `: ${v.why}` : ""}
                  </option>
                ))}
              </select>
              {!changes.length && <p className="cap">No change since this version.</p>}
              <ul className="rv-diff">
                {changes.map((c) => {
                  const d = lineDiff(c.before, c.after);
                  const plain = !lines(c.before).length || !lines(c.after).length || (!d.added.length && !d.removed.length);
                  return (
                    <li key={c.field}>
                      <b>{FIELD_LABEL[c.field] ?? c.field}</b>
                      {plain ? (
                        <span className="cap">changed</span>
                      ) : (
                        <>
                          {d.added.map((l) => (
                            <span key={`+${l}`} className="rv-add">
                              + {l}
                            </span>
                          ))}
                          {d.removed.map((l) => (
                            <span key={`-${l}`} className="rv-del">
                              − {l}
                            </span>
                          ))}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
