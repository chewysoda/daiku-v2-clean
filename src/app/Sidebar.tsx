/**
 * The four places to go, the project you're in, and that project's boards. Everything else is in Ctrl+K,
 * so the sidebar stays short enough to take in at a glance.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon, IconName, Monogram } from "../design/Icon";
import { Avatar } from "../design/primitives";
import { projectsIn } from "../lib/projects";
import { followProject } from "../features/pack/packShelf";
import { NewDialog } from "./NewDialog";

export const SECTIONS: { to: string; label: string; icon: IconName; hint: string }[] = [
  { to: "/board", label: "Board", icon: "board", hint: "Your research, laid out" },
  { to: "/library", label: "Library", icon: "library", hint: "Every source in one list" },
  { to: "/decide", label: "Decide", icon: "decide", hint: "Weigh the options" },
  { to: "/handoff", label: "Handoff", icon: "handoff", hint: "What the AI will read" },
];

/** Every other screen, one click away. Ctrl+K reaches them too, with their shortcuts. */
export const TOOLS: { to: string; label: string; icon: IconName }[] = [
  { to: "/home", label: "Start", icon: "home" },
  { to: "/explore", label: "Explore", icon: "explore" },
  { to: "/explore/claims", label: "Claims", icon: "link" },
  { to: "/explore/interviews", label: "Interviews", icon: "comment" },
  { to: "/threads", label: "Threads", icon: "threads" },
  { to: "/notes", label: "Notes", icon: "text" },
  { to: "/draft", label: "Drafting", icon: "pencil" },
  { to: "/progress", label: "Progress", icon: "check" },
  { to: "/share", label: "Present and share", icon: "nav-present" },
  { to: "/export", label: "Export", icon: "download" },
];

/** The tools list, folded away until opened, remembered. Ctrl+K reaches every tool either way. */
function Tools({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("daiku.tools") === "open";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("daiku.tools", o ? "closed" : "open");
      } catch {
        // Not remembered; it still works for now.
      }
      return !o;
    });
  };
  return (
    <div className="side-tools">
      {!collapsed && (
        <button type="button" className="side-label side-fold" aria-expanded={open} onClick={toggle}>
          Tools
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: open ? undefined : "rotate(-90deg)" }}>
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {(open || collapsed) &&
        TOOLS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/explore"} className="side-link side-tool" aria-label={t.label} title={collapsed ? t.label : undefined}>
            {({ isActive }) => (
              <>
                <Icon name={t.icon} size={18} fill={isActive} />
                {!collapsed && <span className="side-link-label">{t.label}</span>}
              </>
            )}
          </NavLink>
        ))}
    </div>
  );
}

const ALL = "";

function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const records = useStore((s) => s.records);
  const boards = useStore((s) => s.boards);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const projects = useMemo(() => projectsIn({ records }), [records]);
  const boardId = pathname.startsWith("/board/") ? pathname.split("/")[2] : null;
  const current = projects.find((p) => boardId && p.data.board_ids.includes(boardId));
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  // Remembered, so Handoff knows which project's packs to show, and packs follow the project you're in.
  // Only a board says which project you're in; other screens keep the last one.
  const here = boardId ? (current?.id ?? "") : null;
  useEffect(() => {
    if (here == null || useStore.getState().config.project_current === here) return;
    useStore.getState().setSetting("project_current", here);
    followProject(here);
  }, [here]);
  const pick = (id: string) => {
    setOpen(false);
    if (useStore.getState().config.project_current !== id) {
      useStore.getState().setSetting("project_current", id);
      followProject(id);
    }
    const project = projects.find((p) => p.id === id);
    const first = project?.data.board_ids.find((b) => boards.some((x) => x.id === b)) ?? boards[0]?.id;
    navigate(first ? `/board/${first}` : "/board");
  };
  const name = current?.data.name || "All work";
  return (
    <div className="side-project">
      <button type="button" className="side-project-btn" aria-haspopup="listbox" aria-expanded={open} title={collapsed ? `Project: ${name}` : undefined} onClick={() => setOpen((o) => !o)}>
        <span className="side-project-mark" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="side-project-name">{name}</span>
            <svg className="side-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>
      {open && (
        <ul className="side-menu glass-3" role="listbox" aria-label="Switch project" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <li>
            <button type="button" role="option" aria-selected={!current} onClick={() => pick(ALL)}>
              All work
            </button>
          </li>
          {projects.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={current?.id === p.id} onClick={() => pick(p.id)}>
                {p.data.name || "Untitled project"}
                {p.data.working && <span className="cap">working</span>}
              </button>
            </li>
          ))}
          <li className="side-menu-sep" role="separator" />
          <li>
            <button
              type="button"
              className="side-menu-new"
              onClick={() => {
                setOpen(false);
                setStarting(true);
              }}
            >
              New project…
              <Icon name="plus" size={14} />
            </button>
          </li>
        </ul>
      )}
      {starting && <NewDialog kind="project" onClose={() => setStarting(false)} />}
    </div>
  );
}

/** The project's boards, so moving between them is one click from anywhere. */
function BoardList() {
  const boards = useStore((s) => s.boards);
  const records = useStore((s) => s.records);
  const { pathname } = useLocation();
  const boardId = pathname.startsWith("/board/") ? pathname.split("/")[2] : null;
  const list = useMemo(() => {
    const project = projectsIn({ records }).find((p) => boardId && p.data.board_ids.includes(boardId));
    const own = project ? boards.filter((b) => project.data.board_ids.includes(b.id)) : boards;
    return [...own].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  }, [boards, records, boardId]);
  if (!list.length) return null;
  return (
    <div className="side-boards" aria-label="Boards">
      <span className="side-label">Boards</span>
      {list.map((b) => (
        <NavLink key={b.id} to={`/board/${b.id}`} className="side-board">
          <span className="side-board-dot" aria-hidden="true" />
          <span className="side-board-name">{b.name || "Untitled board"}</span>
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar({ onPalette }: { onPalette: () => void }) {
  const name = useStore((s) => s.config.name);
  const collapsed = useStore((s) => s.config.sidebar === "collapsed");
  const setSetting = useStore((s) => s.setSetting);
  return (
    <nav className={`sidebar glass-1 ${collapsed ? "collapsed" : ""}`} aria-label="Main">
      <div className="side-top">
        <Monogram size={26} />
        {!collapsed && <span className="side-wordmark">daiku.</span>}
        <button type="button" className="side-collapse" aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} title="Ctrl+\" onClick={() => setSetting("sidebar", collapsed ? "" : "collapsed")}>
          <Icon name="sidebar" size={18} />
        </button>
      </div>
      <ProjectSwitcher collapsed={collapsed} />
      <div className="side-sections">
        {SECTIONS.map((s, i) => (
          <NavLink key={s.to} to={s.to} className="side-link" aria-label={s.label} aria-keyshortcuts={`Control+${i + 1}`} title={collapsed ? `${s.label} (Ctrl+${i + 1})` : s.hint}>
            {({ isActive }) => (
              <>
                <Icon name={s.icon} fill={isActive} />
                {!collapsed && (
                  <>
                    <span className="side-link-label">{s.label}</span>
                    <kbd className="side-kbd">⌃{i + 1}</kbd>
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
      <Tools collapsed={collapsed} />
      {!collapsed && <BoardList />}
      <div className="side-gap" />
      <button type="button" className="side-link side-search" aria-label="Everything else" aria-keyshortcuts="Control+K" onClick={onPalette} title={collapsed ? "Everything else (Ctrl+K)" : undefined}>
        <Icon name="search" />
        {!collapsed && (
          <>
            <span className="side-link-label">Everything else</span>
            <kbd className="side-kbd">⌃K</kbd>
          </>
        )}
      </button>
      <NavLink to="/settings" className="side-link" aria-label="Settings" title={collapsed ? "Settings (Ctrl+,)" : undefined}>
        {({ isActive }) => (
          <>
            <Icon name="settings" fill={isActive} />
            {!collapsed && <span className="side-link-label">Settings</span>}
          </>
        )}
      </NavLink>
      <div className="side-me">
        <Avatar name={name} size={28} />
        {!collapsed && <span className="side-me-name">{name || "You"}</span>}
      </div>
    </nav>
  );
}
