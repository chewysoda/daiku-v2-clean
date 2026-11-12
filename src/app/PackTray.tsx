/**
 * The pack, always in view, like a receipt: what's pinned, what's in, what's out, and what it costs in
 * tokens. Dropping a source or a card here puts it in the pack. Opening it lists every line.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon } from "../design/Icon";
import { toast } from "../design/primitives";
import { setIncluded, setPinned } from "../lib/packPlan";
import { formatTokens, Placement, updatePlan, usePack } from "../features/pack/usePack";

/** What a dragged card or source carries, so anything in the app can be dropped on the tray. */
export const PACK_DRAG_TYPE = "application/x-daiku-pack-item";

const LABEL: Record<Placement, string> = { pinned: "Pinned", included: "Included", out: "Left out" };

function Meter({ tokens, budget }: { tokens: Record<Placement, number>; budget: number | null }) {
  const sent = tokens.pinned + tokens.included;
  // The scale is the budget, or what would go with nothing left out, whichever is larger.
  const scale = Math.max(budget ?? 0, sent + tokens.out, 1);
  const over = budget != null && sent > budget;
  return (
    <span className={`pt-meter ${over ? "over" : ""}`} aria-hidden="true">
      <span className="pt-seg out" style={{ transform: `scaleX(${(sent + tokens.out) / scale})` }} />
      <span className="pt-seg included" style={{ transform: `scaleX(${sent / scale})` }} />
      <span className="pt-seg pinned" style={{ transform: `scaleX(${tokens.pinned / scale})` }} />
      {budget != null && <span className="pt-budget" style={{ left: `${(budget / scale) * 100}%` }} />}
    </span>
  );
}

export function PackTray() {
  const { plan, summary, rows, tokens } = usePack();
  const open = useStore((s) => s.config.tray === "open");
  const setSetting = useStore((s) => s.setSetting);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dropping, setDropping] = useState(false);
  const inPack = rows.filter((r) => r.place !== "out").length;
  const sent = tokens.pinned + tokens.included;
  const conflict = summary?.shaped.budget?.conflict;
  const onHandoff = pathname.startsWith("/handoff");

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const ids = (e.dataTransfer.getData(PACK_DRAG_TYPE) || "").split(",").filter(Boolean);
    if (!ids.length) return;
    updatePlan((p) => setIncluded(p, ids, true));
    toast(`Added ${ids.length === 1 ? "it" : ids.length} to the pack.`, "info");
  };

  return (
    <section
      className={`packtray glass-1 ${open ? "open" : ""} ${dropping ? "dropping" : ""}`}
      aria-label="Pack tray"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(PACK_DRAG_TYPE)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={drop}
    >
      {open && (
        <div className="pt-receipt" id="pt-receipt">
          {(["pinned", "included", "out"] as Placement[]).map((place) => {
            const list = rows.filter((r) => r.place === place);
            return (
              <div key={place} className={`pt-col ${place}`}>
                <h3 className="pt-col-head">
                  <span className={`pt-key ${place}`} aria-hidden="true" />
                  {LABEL[place]}
                  <span className="pt-num">{formatTokens(list.reduce((n, r) => n + r.tokens, 0))}</span>
                </h3>
                {!list.length && <p className="cap">{place === "pinned" ? "Press P on a selected card to pin it." : place === "out" ? "Nothing left out." : "Nothing else yet."}</p>}
                <ul>
                  {list.slice(0, 7).map((r) => (
                    <li key={r.item.id} title={r.reason || undefined}>
                      <span className="pt-line-title">{r.item.title || "Untitled"}</span>
                      {r.reason ? <span className="cap pt-reason">{r.reason}</span> : <span className="pt-num">{formatTokens(r.tokens)}</span>}
                      {place !== "out" && (
                        <button
                          type="button"
                          className="pt-pin"
                          aria-label={place === "pinned" ? `Unpin ${r.item.title}` : `Pin ${r.item.title}`}
                          aria-pressed={place === "pinned"}
                          onClick={() => updatePlan((p) => setPinned(p, r.item.id, place !== "pinned"))}
                        >
                          <Icon name="pin" size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                  {list.length > 7 && <li className="cap">and {list.length - 7} more in Handoff</li>}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-bar">
        <button type="button" className="pt-toggle" aria-expanded={open} aria-controls="pt-receipt" onClick={() => setSetting("tray", open ? "" : "open")}>
          <Icon name="tray" size={18} />
          <span className="pt-title">Pack</span>
          <span className="pt-count" data-testid="pt-count">
            {summary ? `${inPack} item${inPack === 1 ? "" : "s"}` : "…"}
          </span>
        </button>
        <Meter tokens={tokens} budget={plan.budget} />
        <span className="pt-total" data-testid="pt-tokens">
          <b>{formatTokens(summary?.tokens ?? sent)}</b>
          {plan.budget != null && <span> / {formatTokens(plan.budget)}</span>}
          <span className="pt-unit"> tokens, estimate</span>
        </span>
        {conflict && (
          <span className="pt-warn" role="status">
            <Icon name="warning" size={16} />
            Pinned items alone are over budget
          </span>
        )}
        {!onHandoff && (
          <button type="button" className="pill ink small pt-go" title="Ctrl+Enter" onClick={() => navigate("/handoff")}>
            Open Handoff
            <kbd className="pt-kbd">⌃↵</kbd>
          </button>
        )}
      </div>
    </section>
  );
}
