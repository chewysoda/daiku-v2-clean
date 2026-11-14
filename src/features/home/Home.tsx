import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Board, useStore } from "../../data/store";
import { ESP_BOARD } from "../../data/seedEsp32";
import { firstRunSteps } from "../../lib/firstRun";
import { Icon } from "../../design/Icon";
import { AssetImage, Pill } from "../../design/primitives";
import { asWebUrl } from "../../lib/web";
import { greetingFor } from "../../lib/greeting";
import { projectsIn } from "../../lib/projects";
import { projectSummary, ProjectSummary, standingText } from "../../lib/projectSummary";
import { pickAndImport } from "../library/importing";
import { NewDialog } from "../../app/NewDialog";
import "./home.css";


export function timeAgo(iso: string): string {
  const mins = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / (60 * 24))} d ago`;
}

function useLastPicture(boardId: string) {
  const items = useStore((s) => s.board_items);
  const assets = useStore((s) => s.assets);
  return useMemo(() => {
    const on = items.find((i) => i.board_id === boardId && i.kind === "image" && i.asset_id);
    return assets.find((a) => a.id === on?.asset_id && a.kind === "image") ?? null;
  }, [items, assets, boardId]);
}

function BoardRow({ board }: { board: Board }) {
  const picture = useLastPicture(board.id);
  return (
    <li>
      <Link to={`/board/${board.id}`} className="home-row" aria-label={`Continue ${board.name}`}>
        <span className="home-thumb">{picture ? <AssetImage asset={picture} /> : <Icon name="board" size={20} />}</span>
        <span className="home-row-name">{board.name}</span>
        <span className="cap">edited {timeAgo(board.updated_at)}</span>
      </Link>
    </li>
  );
}

/** The project in numbers, each one a door to where it's worked on. */
function AtAGlance({ p }: { p: ProjectSummary }) {
  const records = useStore((s) => s.records);
  const setSetting = useStore((s) => s.setSetting);
  const projects = useMemo(() => projectsIn({ records }), [records]);
  const share = p.claims ? Math.round((p.backed / p.claims) * 100) : 0;
  const scored = p.decisions.filter((d) => d.kind !== "empty").length;
  const tiles: { label: string; value: string; note: string; to: string; meter?: number }[] = [
    {
      label: "Sources",
      value: String(p.sources.length),
      note: p.sources.length ? `${p.credited} with their credit` : "nothing saved yet",
      to: "/library",
    },
    {
      label: "Claims backed",
      value: p.claims ? `${p.backed}/${p.claims}` : "0",
      note: p.claims ? `${share}% have evidence` : "no claims yet",
      to: "/explore/claims",
      meter: p.claims ? p.backed / p.claims : undefined,
    },
    {
      label: "Decisions",
      value: String(p.decisions.length),
      note: p.decisions.length ? `${scored} scored` : "none started",
      to: "/decide",
    },
    {
      label: "Guesses left",
      value: String(p.guesses),
      note: p.guesses ? "scores with no evidence" : "every score is backed",
      to: "/decide",
    },
  ];
  return (
    <section aria-label="At a glance" className="home-glance">
      <div className="home-glance-head">
        <label className="home-project">
          <span className="sr-only">Project</span>
          <select className="home-project-pick" value={p.projectId ?? ""} onChange={(e) => setSetting("project_current", e.target.value)}>
            <option value="">All work</option>
            {projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.data.name || "Untitled project"}
              </option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <span className="cap">
          {p.boards.length} {p.boards.length === 1 ? "board" : "boards"}
          {p.lastActive && <> · last worked on {timeAgo(p.lastActive)}</>}
        </span>
      </div>
      <ul className="home-tiles">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link to={t.to} className="home-tile">
              <span className="cap">{t.label}</span>
              <span className="home-tile-value">{t.value}</span>
              {t.meter !== undefined && (
                <span className="home-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(t.meter * 100)}%` }} />
                </span>
              )}
              <span className="home-tile-note">{t.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each decision and who's ahead, in one sentence. */
function Decisions({ p }: { p: ProjectSummary }) {
  if (!p.decisions.length) return null;
  return (
    <section aria-label="Decisions" className="home-section">
      <div className="home-section-head">
        <h2 className="cap">decisions</h2>
        <Link to="/decide/all" className="cap">
          all decisions →
        </Link>
      </div>
      <ul className="home-rows">
        {p.decisions.slice(0, 3).map((d) => (
          <li key={d.decision.id}>
            <Link to={`/decide/${d.decision.id}`} className="home-row">
              <span className={`home-thumb home-standing ${d.kind}`}>
                <Icon name="decide" size={18} />
              </span>
              <span className="home-row-text">
                <span className="home-row-name">{d.decision.title || "Untitled decision"}</span>
                <span className="cap">{standingText(d)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line per thing that needs a person, and nothing when nothing does. */
function NeedsALook({ p }: { p: ProjectSummary }) {
  const unsourced = p.claims - p.backed;
  const uncredited = p.sources.length - p.credited;
  if (!unsourced && !p.guesses && !uncredited) return null;
  return (
    <section aria-label="Needs a look" className="home-section">
      <h2 className="cap">needs a look</h2>
      <ul className="home-lines">
        {unsourced > 0 && (
          <li>
            <Link to="/explore/claims">
              {unsourced} {unsourced === 1 ? "claim still needs" : "claims still need"} a source
            </Link>
          </li>
        )}
        {p.guesses > 0 && (
          <li>
            <Link to="/decide">
              {p.guesses} {p.guesses === 1 ? "score is" : "scores are"} <span className="guess">still a guess</span>
            </Link>
          </li>
        )}
        {uncredited > 0 && (
          <li>
            <Link to="/library">
              {uncredited} {uncredited === 1 ? "source doesn't say" : "sources don't say"} where it came from
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/** The latest things saved, so a new source is easy to find again and place. */
function RecentlySaved({ p }: { p: ProjectSummary }) {
  if (!p.sources.length) return null;
  return (
    <section aria-label="Recently saved" className="home-section">
      <div className="home-section-head">
        <h2 className="cap">recently saved</h2>
        <Link to="/library" className="cap">
          library →
        </Link>
      </div>
      <ul className="home-saved">
        {p.sources.slice(0, 5).map((a) => (
          <li key={a.id}>
            <Link to={`/library?q=${encodeURIComponent(a.title)}`}>{a.title || "Untitled"}</Link>
            <span className="cap">{a.credit || hostOf(a.source_url) || "no credit yet"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The first research loop, ticked off from what's actually been done. It can be put away. */
function StartHere() {
  // A short key, so this only re-renders when a step ticks or its link moves.
  const key = useStore((s) => firstRunSteps(s).map((step) => `${+step.done}${step.to}`).join("|"));
  const steps = useMemo(() => (key ? firstRunSteps(useStore.getState()) : []), [key]);
  const hasExample = useStore((s) => s.boards.some((b) => b.id === ESP_BOARD));
  const setSetting = useStore((s) => s.setSetting);
  const next = steps.find((step) => !step.done);
  if (!next) return null;
  const count = steps.filter((step) => step.done).length;
  return (
    <section aria-label="Start here" className="home-section start-here">
      <div className="home-section-head">
        <h2 className="cap">
          start here · {count} of {steps.length} done
        </h2>
        <button type="button" className="link-btn" onClick={() => setSetting("example_hidden", "1")}>
          Hide
        </button>
      </div>
      <ol className="start-steps">
        {steps.map((step, i) => (
          <li key={step.id} className={step === next ? "next" : step.done ? "done" : ""}>
            <span className="start-mark" aria-hidden="true">
              {step.done ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="start-text">
              <Link to={step.to}>{step.label}</Link>
              {step === next && <span className="start-hint">{step.hint}</span>}
            </span>
            <span className="sr-only">{step.done ? "done" : "to do"}</span>
          </li>
        ))}
      </ol>
      {hasExample && (
        <Link to={`/board/${ESP_BOARD}`} className="cap start-example">
          See every step on the example board →
        </Link>
      )}
    </section>
  );
}

export function Home() {
  const name = useStore((s) => s.config.name);
  const projectId = useStore((s) => s.config.project_current);
  const rows = useStore(
    useShallow((s) => ({
      records: s.records,
      boards: s.boards,
      assets: s.assets,
      board_items: s.board_items,
      claims: s.claims,
      evidence_links: s.evidence_links,
      decisions: s.decisions,
      concepts: s.concepts,
      criteria: s.criteria,
      scores: s.scores,
    })),
  );
  const summary = useMemo(() => projectSummary(rows, projectId), [rows, projectId]);
  const startHidden = useStore((s) => !!s.config.example_hidden);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);

  const recent = summary.boards.slice(0, 4);

  const submit = () => {
    const text = query.trim();
    if (!text) return;
    const url = asWebUrl(text);
    // A pasted link opens in the browser pane, where it can be saved with its credit.
    if (url) navigate(`/explore?url=${encodeURIComponent(url)}`);
    else navigate(`/library?q=${encodeURIComponent(text)}`);
  };

  return (
    <main className="page home">
      <div className="page-head">
        <div className="home-title">
          <span className="cap">{greetingFor(new Date().getHours(), name)}</span>
          <h1 className="fr page-title">Home</h1>
        </div>
        <div className="head-actions">
          <Pill onClick={() => void pickAndImport()}>
            <Icon name="import" size={18} />
            Import
          </Pill>
          <Pill ink onClick={() => setNaming(true)}>
            <Icon name="plus" size={18} />
            New board
          </Pill>
        </div>
      </div>

      <form
        className="omni"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Paste a link, or search your library" placeholder="Paste a link, or search your library" />
        {query.trim() ? (
          <button type="button" className="pill small" title="Search the web in Explore" onClick={() => navigate(`/explore?web=${encodeURIComponent(query.trim())}`)}>
            <Icon name="explore" size={16} />
            Search the web
          </button>
        ) : (
          <kbd className="cap kbd">Ctrl K</kbd>
        )}
      </form>

      <AtAGlance p={summary} />

      <div className="home-columns">
        <div className="home-stack">
          <section aria-label="Pick up where you left off" className="home-section">
            <div className="home-section-head">
              <h2 className="cap">pick up where you left off</h2>
              <Link to="/board" className="cap">
                all boards →
              </Link>
            </div>
            {recent.length ? (
              <ul className="home-rows">
                {recent.map((b) => (
                  <BoardRow key={b.id} board={b} />
                ))}
              </ul>
            ) : (
              <p className="cap">No boards yet. Start one, or import some pictures.</p>
            )}
          </section>
          <Decisions p={summary} />
        </div>
        <div className="home-stack">
          <NeedsALook p={summary} />
          <RecentlySaved p={summary} />
        </div>
      </div>

      {!startHidden && <StartHere />}

      {naming && <NewDialog kind="board" onClose={() => setNaming(false)} />}
    </main>
  );
}
