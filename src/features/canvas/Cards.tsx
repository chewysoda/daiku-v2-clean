/**
 * Cards for things that aren't pictures. Each one shows what it is at a glance: its kind, the words that
 * matter, where it's from, and whether it's backed. State is always a shape or a word, never colour alone.
 */
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { Asset, useStore } from "../../data/store";
import { Icon, IconName } from "../../design/Icon";
import { openExternal } from "../../lib/platform";
import { isCredited } from "../../lib/search";
import { readerHref } from "../../app/ReaderPanel";

const KIND: Record<string, { label: string; icon: IconName }> = {
  quote: { label: "Quote", icon: "text" },
  link: { label: "Page", icon: "link" },
  pdf: { label: "PDF", icon: "text" },
  code: { label: "Code", icon: "connector" },
  video: { label: "Video", icon: "play" },
  "3d": { label: "3D model", icon: "shapes" },
  file: { label: "File", icon: "download" },
};

const site = (a: Asset) => {
  if (a.via) return a.via.replace(/^www\./, "");
  try {
    return a.source_url ? new URL(a.source_url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

/** Opens a source where it reads best: PDFs beside the board, everything else at its address. */
export function useOpenSource() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (a: Asset) => {
    if (a.kind === "pdf") navigate(readerHref(pathname, a.id));
    else if (a.source_url) void openExternal(a.source_url);
  };
}

export function SourceCard({ asset }: { asset: Asset }) {
  const backs = useStore((s) => s.evidence_links.filter((l) => l.asset_id === asset.id && l.target_type === "claim").length);
  const kind = KIND[asset.kind] ?? KIND.file;
  const credited = isCredited(asset);
  const from = site(asset);
  const quote = asset.kind === "quote" && asset.notes.trim();
  return (
    <div className={`src-card ${asset.kind} ${credited ? "" : "uncredited"}`} data-testid="source-card">
      <div className="src-top">
        <span className="src-kind">
          <Icon name={kind.icon} size={13} />
          {kind.label}
        </span>
        {from && <span className="src-site">{from}</span>}
      </div>
      {quote ? <blockquote className="src-quote">{quote}</blockquote> : null}
      <div className={quote ? "src-title small" : "src-title"}>{asset.title}</div>
      <div className="src-foot">
        {credited ? (
          <span className="state sourced">
            <Icon name="check" size={11} />
            credited
          </span>
        ) : (
          <span className="state guess">no source yet</span>
        )}
        {backs > 0 && (
          <span className="src-backs">
            backs {backs} claim{backs === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}

/** A claim on the board. Sourced: solid, with a chip that opens the passage. A guess: dashed, and says so. */
export function ClaimCard({ claimId, fallback }: { claimId: string; fallback: string }) {
  const claim = useStore((s) => s.claims.find((c) => c.id === claimId));
  const allLinks = useStore((s) => s.evidence_links);
  const links = useMemo(() => allLinks.filter((l) => l.target_type === "claim" && l.target_id === claimId), [allLinks, claimId]);
  const assets = useStore((s) => s.assets);
  const open = useOpenSource();
  const pros = links.filter((l) => l.stance !== "against");
  const cons = links.filter((l) => l.stance === "against");
  const first = assets.find((a) => a.id === pros[0]?.asset_id);
  const sourced = pros.length > 0;
  return (
    <div className={`claim-card ${sourced ? "sourced" : "guess"} ${cons.length ? "conflict" : ""}`} data-testid="claim-card">
      <span className="claim-mark" aria-hidden="true">
        “
      </span>
      <span className="claim-label">{sourced ? "Claim" : "Claim · guess"}</span>
      <p className="claim-text">{claim?.text ?? fallback}</p>
      <div className="claim-foot">
        {first ? (
          <button
            type="button"
            className="src-chip"
            title={`Open ${first.title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              open(first);
            }}
          >
            <Icon name="link" size={11} />
            {first.title}
          </button>
        ) : (
          <span className="state guess">no evidence yet</span>
        )}
        {pros.length > 1 && <span className="cap">+{pros.length - 1}</span>}
        {cons.length > 0 && (
          <span className="state conflict">
            <Icon name="warning" size={11} />
            {cons.length} against
          </span>
        )}
      </div>
    </div>
  );
}
