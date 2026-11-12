import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Board, useStore } from "../../data/store";
import { ESP_BOARD } from "../../data/seedEsp32";
import { firstRunSteps } from "../../lib/firstRun";
import { Icon } from "../../design/Icon";
import { AssetImage, Pill } from "../../design/primitives";
import { asWebUrl } from "../../lib/web";
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
        <span className="home-thumb">{picture && <AssetImage asset={picture} />}</span>
        <span className="home-row-name">{board.name}</span>
        <span className="cap">edited {timeAgo(board.updated_at)}</span>
      </Link>
    </li>
  );
}

/** One line per thing that needs a person, and nothing when nothing does. */
function NeedsALook() {
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const scores = useStore((s) => s.scores);
  const unsourced = claims.filter((c) => !links.some((l) => l.target_type === "claim" && l.target_id === c.id));
  const guesses = scores.filter((x) => x.is_assumption).length;
  if (!unsourced.length && !guesses) return null;
  return (
    <section aria-label="Needs a look" className="home-section">
      <h2 className="cap">needs a look</h2>
      <ul className="home-lines">
        {unsourced.length > 0 && (
          <li>
            <Link to="/explore/claims">
              {unsourced.length} {unsourced.length === 1 ? "claim still needs" : "claims still need"} a source
            </Link>
          </li>
        )}
        {guesses > 0 && (
          <li>
            <Link to="/decide">
              {guesses} {guesses === 1 ? "score is" : "scores are"} <span className="guess">still a guess</span>
            </Link>
          </li>
        )}
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
  const boards = useStore((s) => s.boards);
  const startHidden = useStore((s) => !!s.config.example_hidden);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);

  const recent = useMemo(() => [...boards].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3), [boards]);

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
        <h1 className="fr page-title">
          Home
        </h1>
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

      <div className="home-columns">
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
        <NeedsALook />
      </div>

      {!startHidden && <StartHere />}

      {naming && <NewDialog kind="board" onClose={() => setNaming(false)} />}
    </main>
  );
}
