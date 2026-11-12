import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Hello } from "./Hello";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon } from "../design/Icon";
import { Toaster, toast } from "../design/primitives";
import { isWebAddress } from "../lib/links";
import { saveLink } from "../features/library/importing";
import { SECTIONS, Sidebar } from "./Sidebar";
import { PackTray } from "./PackTray";
import { ReaderPanel } from "./ReaderPanel";
import { fitWindowToWebview, isTauri, native } from "../lib/platform";
import { Backdrop, useAppearance } from "./Appearance";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { stepScale } from "../lib/appearance";
import { countVisit, parseVisits, screenKey } from "../lib/screenUse";
import { Home } from "../features/home/Home";
import { Library } from "../features/library/Library";

// Heavier screens load on demand: canvas (pixi), threads (cytoscape), explore.
const Canvas = lazy(() => import("../features/canvas/Canvas"));
const Present = lazy(() => import("../features/canvas/Present"));
const Explore = lazy(() => import("../features/explore/Explore"));
const Threads = lazy(() => import("../features/threads/Threads"));
const Lab = lazy(() => import("../features/lab/Lab"));
const LabAll = lazy(() => import("../features/lab/LabAll"));
const Share = lazy(() => import("../features/share/Share"));
const Settings = lazy(() => import("../features/settings/Settings"));
const Reader = lazy(() => import("../features/reader/Reader"));
const CadViewer = lazy(() => import("../features/cad/CadViewer"));
const Pack = lazy(() => import("../features/pack/Pack"));
const Draft = lazy(() => import("../features/draft/Draft"));
const Export = lazy(() => import("../features/export/Export"));
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) => lazy(async () => ({ default: (await load())[key] }));
const loadEngineering = () => import("../features/lab/Engineering");
const Requirements = named(loadEngineering, "Requirements");
const PropertiesBom = named(loadEngineering, "PropertiesBom");
const Simulate = named(loadEngineering, "Simulate");
const DecisionRecord = named(() => import("../features/lab/DecisionRecord"), "DecisionRecord");
const loadResearch = () => import("../features/research/Research");
const Claims = named(loadResearch, "Claims");
const Interviews = named(loadResearch, "Interviews");
const Notes = named(loadResearch, "Notes");
const loadProgress = () => import("../features/progress/Progress");
const ProgressOverview = named(loadProgress, "ProgressOverview");
const HeatMaps = named(loadProgress, "HeatMaps");
const WorkflowLog = named(loadProgress, "WorkflowLog");

/** Where the title bar says you are. */
function crumb(pathname: string, boardName: string | undefined) {
  const first = pathname.split("/")[1];
  const section = SECTIONS.find((n) => n.to === `/${first}`);
  if (first === "board" && boardName) return `Board / ${boardName}`;
  const named: Record<string, string> = { settings: "Settings", reader: "Reader", cad: "CAD viewer", home: "Start", explore: "Explore", threads: "Threads", notes: "Notes", draft: "Drafting", progress: "Progress", share: "Present and share", export: "Export" };
  return section?.label ?? named[first] ?? "Board";
}

/** Opening the app: the board, or the last screen when that's what's been chosen. */
function Start() {
  const { start_screen, last_route } = useStore.getState().config;
  return <Navigate to={start_screen === "last" && last_route && last_route !== "/" ? last_route : "/board"} replace />;
}

/** An old address, kept working: everything after the old prefix carries over. */
function Moved({ from, to }: { from: string; to: string }) {
  const { pathname, search } = useLocation();
  return <Navigate to={`${to}${pathname.slice(from.length)}${search}`} replace />;
}

function SaveState() {
  const pending = useStore((s) => s.pendingWrites);
  const saveError = useStore((s) => s.saveError);
  const persistent = useStore((s) => s.ready) && isTauri;
  if (saveError) {
    return (
      <button
        type="button"
        className="cap save-state err"
        title={`${saveError}\nClick to try saving again.`}
        role="alert"
        disabled={pending > 0}
        onClick={() => void useStore.getState().retrySaves()}
      >
        <span className="dot-guess" />
        {pending ? "retrying…" : "couldn't save · retry"}
      </button>
    );
  }
  return (
    <span className="cap save-state" data-testid="save-state">
      <span className={pending ? "dot-guess" : "dot-sourced"} />
      {pending ? "saving…" : persistent ? "saved on this device" : "browser preview"}
    </span>
  );
}

function WindowButtons() {
  if (!isTauri) return null;
  const act = async (action: "minimize" | "toggleMaximize" | "close") => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow()[action]();
  };
  return (
    <>
      <button type="button" className="win-btn" aria-label="Minimize" onClick={() => act("minimize")}>
        <Icon name="minimize" size={14} />
      </button>
      <button type="button" className="win-btn" aria-label="Maximize" onClick={() => act("toggleMaximize")}>
        <Icon name="maximize" size={14} />
      </button>
      <button type="button" className="win-btn close" aria-label="Close" onClick={() => act("close")}>
        <Icon name="close" size={14} />
      </button>
    </>
  );
}

function Frame() {
  const { pathname } = useLocation();
  const boardName = useStore((s) => (pathname.startsWith("/board/") ? s.boards.find((b) => b.id === pathname.split("/")[2])?.name : undefined));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const overlayOpen = paletteOpen || helpOpen;

  // Remember where you are. "/" itself is only a doorway (see Start), so it never counts.
  useEffect(() => {
    if (pathname !== "/" && !pathname.startsWith("/present/") && useStore.getState().config.last_route !== pathname) {
      useStore.getState().setSetting("last_route", pathname);
    }
  }, [pathname]);

  // Count which screens get opened, on this device only, for deciding what to cut after usability sessions.
  const screen = useMemo(() => {
    const s = useStore.getState();
    const ids = new Set([...s.boards, ...s.decisions, ...s.assets, ...s.records].map((r) => r.id));
    return screenKey(pathname, ids);
  }, [pathname]);
  useEffect(() => {
    if (!screen) return;
    const { config, setSetting } = useStore.getState();
    setSetting("screen_visits", JSON.stringify(countVisit(parseVisits(config.screen_visits), screen)));
  }, [screen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (ctrl && /^Digit[1-4]$/.test(e.code) && !e.shiftKey) {
        e.preventDefault();
        navigate(SECTIONS[Number(e.code.slice(5)) - 1].to);
      } else if (ctrl && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        navigate("/handoff");
      } else if (ctrl && e.key === "\\") {
        e.preventDefault();
        const { config, setSetting } = useStore.getState();
        setSetting("sidebar", config.sidebar === "collapsed" ? "" : "collapsed");
      } else if (ctrl && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
      } else if (ctrl && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
        // Also stops the webview's own zoom, which wouldn't be remembered.
        e.preventDefault();
        const { config, setSetting } = useStore.getState();
        setSetting("ui_scale", e.key === "0" ? "1" : stepScale(config.ui_scale, e.key === "-" ? -1 : 1));
      } else if (e.key === "?" && !typing && !ctrl) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Capture is a verb, not a place: a link pasted anywhere (outside a text box) is saved to the Library
  // straight away, and can be opened in Explore from the toast. The board handles its own pastes, as there
  // a paste lands where you are.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (window.location.hash.startsWith("#/board")) return;
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (!isWebAddress(text)) return;
      e.preventDefault();
      const saved = saveLink(text);
      if (!saved) return;
      toast(saved.existed ? "That link is already in the Library." : `Saved to the Library, credited to ${saved.asset.credit}.`, "info", {
        label: "Open in Explore",
        run: () => navigate(`/explore?web=${encodeURIComponent(text)}`),
      });
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [navigate]);

  // The browser pane is a native view that sits above all page content, so it has to step
  // aside while the palette is open. Explore puts it back when the palette closes.
  useEffect(() => {
    if (isTauri && overlayOpen) void native.exploreHide();
    window.dispatchEvent(new CustomEvent("daiku:overlay", { detail: overlayOpen }));
  }, [overlayOpen]);

  if (pathname.startsWith("/present/")) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/present/:boardId" element={<Present />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="shell">
      <Backdrop />
      <header className="titlebar">
        <div className="titlebar-drag" data-tauri-drag-region>
          <span className="cap" data-tauri-drag-region>
            {crumb(pathname, boardName)}
          </span>
        </div>
        <SaveState />
        <WindowButtons />
      </header>
      <div className="shell-body">
        <Sidebar onPalette={() => setPaletteOpen(true)} />
        {/* Keyed by screen, so moving between screens animates but editing within one doesn't. */}
        <div className="route-view" key={pathname.split("/")[1]}>
        <Suspense fallback={<main className="page" />}>
          <Routes>
            <Route path="/" element={<Start />} />
            <Route path="/home" element={<Home />} />
            <Route path="/canvas/*" element={<Moved from="/canvas" to="/board" />} />
            <Route path="/lab/*" element={<Moved from="/lab" to="/decide" />} />
            <Route path="/pack/*" element={<Moved from="/pack" to="/handoff" />} />
            <Route path="/board" element={<Canvas />} />
            <Route path="/board/:boardId" element={<Canvas />} />
            <Route path="/library" element={<Library />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/claims" element={<Claims />} />
            <Route path="/explore/interviews" element={<Interviews />} />
            <Route path="/reader/:assetId" element={<Reader />} />
            <Route path="/cad/:assetId" element={<CadViewer />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/progress" element={<ProgressOverview />} />
            <Route path="/progress/heatmaps" element={<HeatMaps />} />
            <Route path="/progress/log" element={<WorkflowLog />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/draft/:draftId" element={<Draft />} />
            <Route path="/export" element={<Export />} />
            <Route path="/handoff" element={<Pack />} />
            <Route path="/handoff/:view" element={<Pack />} />
            <Route path="/threads" element={<Threads />} />
            <Route path="/decide" element={<Lab />} />
            <Route path="/decide/all" element={<LabAll />} />
            <Route path="/decide/:decisionId" element={<Lab />} />
            <Route path="/decide/:decisionId/requirements" element={<Requirements />} />
            <Route path="/decide/:decisionId/bom" element={<PropertiesBom />} />
            <Route path="/decide/:decisionId/simulate" element={<Simulate />} />
            <Route path="/decide/:decisionId/record" element={<DecisionRecord />} />
            <Route path="/share" element={<Share />} />
            <Route path="/share/:boardId" element={<Share />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </div>
      </div>
      <ReaderPanel />
      {!pathname.startsWith("/settings") && <PackTray />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      <Toaster />
    </div>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
    void fitWindowToWebview();
  }, [init]);
  // Closing (the title bar button, Alt+F4 or the taskbar) waits for queued writes to land first.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const off = await getCurrentWindow().onCloseRequested(() => useStore.getState().flush());
      if (cancelled) off();
      else unlisten = off;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  useAppearance();
  // Hands over from the splash in index.html once there's something to show, including an error.
  useEffect(() => {
    if (!ready) return;
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.classList.add("gone");
    const t = setTimeout(() => splash.remove(), 300);
    return () => clearTimeout(t);
  }, [ready]);

  if (!ready) return null;
  if (error) {
    return (
      <main className="fatal" role="alert">
        <h1 className="fr page-title">Daiku couldn't start.</h1>
        <p>The local database failed to open. Your files in the library folder are untouched.</p>
        <pre>{error}</pre>
      </main>
    );
  }
  return (
    <HashRouter>
      <Frame />
      <Hello />
    </HashRouter>
  );
}
