import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon } from "../design/Icon";
import { searchContent } from "../lib/contentSearch";
import { readerHref } from "./ReaderPanel";

interface Command {
  label: string;
  hint: string;
  run: () => void;
  /** Shown beside it, so the shortcut is learnt just by using the palette. */
  keys?: string;
  /** Other words that find it, such as a screen's old name. */
  also?: string;
  /** The words around a match inside the work. */
  snippet?: string;
}

const HIT_LABEL = { source: "source", claim: "claim", note: "note", draft: "draft", board: "on a board" } as const;

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const boards = useStore((s) => s.boards);
  const decisions = useStore((s) => s.decisions);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const setting = (key: "sidebar" | "transparency" | "tray", on: string) => () => {
      const { config, setSetting } = useStore.getState();
      setSetting(key, config[key] === on ? "" : on);
    };
    return [
      { label: "Go to Board", hint: "section", keys: "Ctrl 1", also: "canvas home", run: go("/board") },
      { label: "Go to Library", hint: "section", keys: "Ctrl 2", also: "sources files claims", run: go("/library") },
      { label: "Go to Decide", hint: "section", keys: "Ctrl 3", also: "lab matrix weights", run: go("/decide") },
      { label: "Go to Handoff", hint: "section", keys: "Ctrl Enter", also: "build pack send to claude", run: go("/handoff") },
      { label: "Add a source", hint: "action", also: "explore paste link web capture import", run: go("/explore") },
      { label: "Preview the pack as the AI sees it", hint: "action", run: go("/handoff/preview") },
      { label: "Review what came back", hint: "action", also: "revision", run: go("/handoff/review") },
      { label: "Show links between cards", hint: "action", also: "threads graph", run: go("/threads") },
      { label: "Collapse or expand the sidebar", hint: "action", keys: "Ctrl \\", run: setting("sidebar", "collapsed") },
      { label: "Show or hide the pack receipt", hint: "action", also: "tray", run: setting("tray", "open") },
      { label: "Reduce transparency", hint: "setting", also: "glass solid", run: setting("transparency", "reduced") },
      { label: "Go to Start", hint: "screen", also: "home start here", run: go("/home") },
      { label: "Go to Explore", hint: "screen", run: go("/explore") },
      { label: "Go to Threads", hint: "screen", run: go("/threads") },
      { label: "Go to Share", hint: "screen", run: go("/share") },
      { label: "Go to Notes", hint: "screen", run: go("/notes") },
      { label: "Go to Claims", hint: "screen", run: go("/explore/claims") },
      { label: "Go to Interviews", hint: "screen", run: go("/explore/interviews") },
      { label: "Go to Progress", hint: "screen", run: go("/progress") },
      { label: "Go to Heat maps", hint: "screen", run: go("/progress/heatmaps") },
      { label: "Go to Workflow log", hint: "screen", run: go("/progress/log") },

      { label: "Go to Drafting", hint: "screen", run: go("/draft") },
      { label: "Go to Export", hint: "screen", run: go("/export") },
      { label: "Settings", hint: "screen", keys: "Ctrl ,", run: go("/settings") },
      ...boards.map((b) => ({ label: b.name, hint: "board", run: go(`/board/${b.id}`) })),
      ...decisions.flatMap((d) => [
        { label: d.title, hint: "decision", run: go(`/decide/${d.id}`) },
        { label: `Requirements: ${d.title}`, hint: "lab", run: go(`/decide/${d.id}/requirements`) },
        { label: `Properties & BOM: ${d.title}`, hint: "lab", run: go(`/decide/${d.id}/bom`) },
        { label: `Simulate: ${d.title}`, hint: "lab", run: go(`/decide/${d.id}/simulate`) },
      ]),
    ];
  }, [boards, decisions, navigate]);

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q) || (!!c.also && c.also.includes(q)));
  // Matches inside sources, claims, notes, drafts and board notes, read from memory as you type.
  const found = useMemo<Command[]>(() => {
    if (!trimmed) return [];
    const s = useStore.getState();
    return searchContent(s, trimmed).map((h) => ({
      label: h.title,
      hint: HIT_LABEL[h.kind],
      snippet: h.snippet,
      run: () => navigate(h.read ? readerHref(pathname, h.to) : h.to),
    }));
  }, [trimmed, navigate, pathname]);
  const results: Command[] = trimmed
    ? [
        ...filtered,
        ...found,
        {
          label: `Search library for “${trimmed}”`,
          hint: "library",
          run: () => navigate(`/library?q=${encodeURIComponent(trimmed)}`),
        },
        {
          label: `Search the web for “${trimmed}”`,
          hint: "explore",
          run: () => navigate(`/explore?web=${encodeURIComponent(trimmed)}`),
        },
      ]
    : filtered;
  const index = Math.min(active, Math.max(results.length - 1, 0));

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <label className="palette-input">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            aria-label="Search or run a command"
            placeholder="Search, jump, or run a command…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(index + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(index - 1, 0));
              }
              if (e.key === "Enter") run(results[index]);
            }}
          />
        </label>
        <ul className="palette-list">
          {results.map((c, i) => (
            <li key={`${c.hint}-${c.label}`}>
              <button
                type="button"
                className={`palette-row ${i === index ? "on" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="palette-label">
                  <span>{c.label}</span>
                  {c.snippet && <span className="palette-snippet">{c.snippet}</span>}
                </span>
                <span className="palette-meta">
                  {c.keys && <kbd className="palette-kbd">{c.keys}</kbd>}
                  <span className="cap">{c.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
