import { useStore } from "../../data/store";
import { EvidenceLink, EvidenceStrength, SourceType } from "../../data/types";
import { Icon } from "../../design/Icon";
import { SOURCE_TYPES, STRENGTHS, strengthOf } from "../../lib/readiness";
import { stanceOf } from "../../lib/studio";
import "./evidence.css";

/** One piece of evidence, with what makes it weighable. Used on both scores and claims. */
export function EvidenceCard({ link, conflicted }: { link: EvidenceLink; conflicted: boolean }) {
  const asset = useStore((s) => s.assets.find((a) => a.id === link.asset_id));
  const title = asset?.title ?? "Removed";
  const update = useStore((s) => s.updateEvidence);
  const unlink = useStore((s) => s.unlinkEvidence);
  const strength = strengthOf(link);
  const against = stanceOf(link) === "against";
  return (
    <div className="ev-card" data-testid="evidence-card">
      <div className="ev-row">
        <span className="ev-title">{title}</span>
        <button type="button" aria-label={`Unlink ${title}`} onClick={() => unlink(link.id)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <span className="cap">
        {asset?.credit || "no source yet"}
        {!against && link.note ? ` · ${link.note}` : ""}
      </span>
      <div className="ev-fields">
        <select className="field" aria-label={`${title}: stance`} value={stanceOf(link)} onChange={(e) => update(link.id, { stance: e.target.value as "for" | "against" })}>
          <option value="for">For</option>
          <option value="against">Against</option>
        </select>
        <select className="field" aria-label={`${title}: source type`} value={link.source_type ?? ""} onChange={(e) => update(link.id, { source_type: (e.target.value || null) as SourceType | null })}>
          <option value="">Source type…</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="ev-strength" role="group" aria-label={`${title}: strength`}>
        {STRENGTHS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`ev-strength-btn ${strength === x.id ? "on" : ""}`}
            aria-pressed={strength === x.id}
            // Pressing the chosen rating again clears it, for a rating given by mistake.
            onClick={() => update(link.id, { strength: strength === x.id ? null : (x.id as EvidenceStrength) })}
          >
            {x.label}
          </button>
        ))}
      </div>
      <input className="field" aria-label={`${title}: limitations`} placeholder="Limitations, in one line" value={link.limitation ?? ""} onChange={(e) => update(link.id, { limitation: e.target.value })} />
      {against && (
        <input
          className={`field ${conflicted && !link.note?.trim() ? "ev-needs" : ""}`}
          aria-label={`${title}: how you weighed this`}
          placeholder="How you weighed this against the rest"
          value={link.note ?? ""}
          onChange={(e) => update(link.id, { note: e.target.value })}
        />
      )}
    </div>
  );
}
