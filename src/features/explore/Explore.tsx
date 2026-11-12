import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, PromptDialog, toast } from "../../design/primitives";
import { copyText, isTauri, mediaUrl, native, openExternal, PaneBounds } from "../../lib/platform";
import { readTextFromBlob, wordCount } from "../../lib/ocr";
import {
  Capture,
  ENGINES,
  EngineId,
  hostOf,
  parseCapture,
  resolveBrowserInput,
} from "../../lib/web";
import { Box } from "../../lib/snip";
import { SnipOverlay } from "./SnipOverlay";
import { Paper, paperCredit, SCHOLAR_SOURCES, ScholarSource, searchSource, SourceResult } from "../../lib/scholar";
import { newAsset, pickAndImport } from "../library/importing";
import { CaptureTray } from "./CaptureTray";
import { MAX_TABS, ResearchTab, useResearchTabs } from "./researchTabs";
import "./explore.css";

type Tab = "web" | "papers";

const Reader = lazy(() => import("../reader/Reader"));
const DraftEditor = lazy(async () => ({ default: (await import("../draft/Draft")).DraftEditor }));

/** Open-claims side panel: the reason to search in the first place. */
function OpenClaims({ onSearch }: { onSearch: (text: string) => void }) {
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const open = claims.filter((c) => !links.some((l) => l.target_type === "claim" && l.target_id === c.id));
  if (!open.length) return null;
  return (
    <div className="claims-list">
      <span className="cap">open claims needing sources · {open.length}</span>
      {open.map((c) => (
        <button key={c.id} type="button" className="claim-chip" onClick={() => onSearch(c.text)}>
          {c.text}
        </button>
      ))}
    </div>
  );
}

function PapersTab({ initial, onOpen }: { initial: string; onOpen: (url: string) => void }) {
  const assets = useStore((s) => s.assets);
  const putAsset = useStore((s) => s.putAsset);
  const [query, setQuery] = useState(initial);
  const [sources, setSources] = useState<ScholarSource[]>(["OpenAlex", "arXiv", "Crossref"]);
  const [openOnly, setOpenOnly] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const [results, setResults] = useState<SourceResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (text = query) => {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setResults(await Promise.all(sources.map((s) => searchSource(s, q, { since, openAccessOnly: openOnly }))));
    setBusy(false);
  };

  useEffect(() => {
    if (initial) void run(initial);
    // Only when arriving with a query from elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const papers = useMemo(() => {
    const seen = new Set<string>();
    return (results ?? [])
      .flatMap((r) => r.papers)
      .filter((p) => {
        const key = p.title.toLowerCase().replace(/\W+/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [results]);
  const errors = (results ?? []).filter((r) => r.error);

  const save = (p: Paper) => {
    putAsset(
      newAsset({
        kind: "pdf",
        title: p.title,
        source_url: p.url,
        credit: paperCredit(p),
        via: p.source,
        tags: [p.venue, p.year].filter(Boolean).join(" "),
        provenance: "unknown",
      }),
    );
    toast("Added to Library with its citation");
  };

  return (
    <div className="papers">
      <form
        className="explore-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Icon name="search" />
        <input
          value={query}
          aria-label="Search papers"
          placeholder="perceived comfort of textured upholstery"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Pill ink type="submit" disabled={busy || !sources.length || !query.trim()}>
          {busy ? "Searching…" : "Search"}
        </Pill>
      </form>
      <div className="papers-filters">
        <span className="cap">sources</span>
        {SCHOLAR_SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip-toggle ${sources.includes(s) ? "on" : ""}`}
            aria-pressed={sources.includes(s)}
            onClick={() => setSources((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
          >
            {s}
          </button>
        ))}
        <span className="omni-sep" />
        <label className="check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open access only
        </label>
        <label className="check">
          Since
          <select
            className="field since"
            value={since ?? ""}
            onChange={(e) => setSince(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Any year</option>
            <option value="2020">2020</option>
            <option value="2015">2015</option>
            <option value="2010">2010</option>
          </select>
        </label>
      </div>
      {errors.map((e) => (
        <p key={e.source} className="cap guess" role="status">
          {e.source}: {e.error}
        </p>
      ))}
      {results && !papers.length && !busy && !errors.length && <p className="cap">No results. Try broader words.</p>}
      <div className="paper-list">
        {papers.map((p) => {
          const saved = assets.some((a) => a.source_url === p.url);
          return (
            <article className="paper" key={p.key}>
              <div className="paper-text">
                <h3>{p.title}</h3>
                <span className="cap">
                  {[paperCredit(p), p.venue, p.citedBy != null ? `cited by ${p.citedBy}` : ""].filter(Boolean).join(" · ")}
                </span>
                <span className="paper-tags">
                  {p.openAccess && <span className="tag">open access</span>}
                  <span className="tag">{p.source}</span>
                </span>
              </div>
              <div className="paper-actions">
                <Pill className="small" title="Open in a research tab, to snip and save from it" onClick={() => (isTauri ? onOpen(p.url) : void openExternal(p.url))}>
                  Open
                </Pill>
                <Pill className="small" ink disabled={saved} onClick={() => save(p)}>
                  {saved ? "In your library" : "Add to Library"}
                </Pill>
              </div>
            </article>
          );
        })}
      </div>
      <p className="cap footnote">Searches free, open scholarly indexes. No paid APIs, no account.</p>
    </div>
  );
}

/** So a link from elsewhere opens once, and not again each time its tab is revisited. */
let lastStart = "";

function WebTab({ tab, startUrl, startQuery }: { tab: Extract<ResearchTab, { kind: "web" }>; startUrl: string | null; startQuery: string | null }) {
  const slot = tab.slot;
  const patchWeb = useResearchTabs((s) => s.patchWeb);
  const engine = useStore((s) => s.config.engine);
  const setSetting = useStore((s) => s.setSetting);
  const paneRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(tab.opened);
  const address = tab.address;
  const [images, setImages] = useState(false);
  const { title, loading, opened } = tab;
  const [capture, setCaptureState] = useState<Capture | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snipSrc, setSnipSrc] = useState<string | null>(null);
  const [snipForText, setSnipForText] = useState(false);
  const snipping = useRef(false);

  // Each capture gets a fresh tray, so a second one can't inherit the first one's text or picks.
  const setCapture = (next: Capture | null) => {
    setCaptureState((old) => {
      if (old?.snip) URL.revokeObjectURL(old.snip.url);
      return next;
    });
    setCaptureCount((n) => n + 1);
  };

  const setAddress = (value: string) => patchWeb(slot, { address: value });

  const bounds = (): PaneBounds | null => {
    const r = paneRef.current?.getBoundingClientRect();
    if (!r) return null;
    const ratio = window.devicePixelRatio || 1;
    return {
      x: Math.round(r.left * ratio),
      y: Math.round(r.top * ratio),
      w: Math.round(r.width * ratio),
      h: Math.round(r.height * ratio),
    };
  };

  const open = async (url: string) => {
    const b = bounds();
    if (!b) return;
    setAddress(url);
    setError(null);
    if (!isTauri) {
      setError("The browser pane is part of the desktop app. Run `npm run tauri dev` to use it.");
      return;
    }
    try {
      patchWeb(slot, { loading: true });
      await native.exploreOpen(slot, url, b);
      openedRef.current = true;
      patchWeb(slot, { opened: true });
    } catch (e) {
      patchWeb(slot, { loading: false });
      setError(String(e));
    }
  };

  const showPane = () => {
    const b = bounds();
    if (openedRef.current && b && !snipping.current) void native.exploreShow(slot, b);
    else if (!openedRef.current) void native.exploreHide();
  };

  const startSnip = async (forText: boolean) => {
    setSnipForText(forText);
    try {
      const png = await native.exploreSnapshot(slot);
      snipping.current = true;
      setSnipSrc(URL.createObjectURL(new Blob([png], { type: "image/png" })));
    } catch (e) {
      toast(`Couldn't snip this page: ${e}`, "error");
    }
  };

  const endSnip = () => {
    snipping.current = false;
    setSnipSrc((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    showPane();
  };

  const finishSnip = async (box: Box) => {
    try {
      const shot = new Image();
      shot.src = snipSrc!;
      await shot.decode();
      const canvas = document.createElement("canvas");
      canvas.width = box.w;
      canvas.height = box.h;
      canvas.getContext("2d")!.drawImage(shot, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("the image couldn't be created");
      const page = { pageUrl: tab.pageUrl || address, pageTitle: tab.title, author: "", site: "" };
      if (snipForText) {
        const found = await readTextFromBlob(blob);
        if (!found) {
          toast("No text found there. Try a tighter box, or zoom the page in first.");
        } else if (await copyText(found)) {
          toast(`Copied ${wordCount(found)} word${wordCount(found) === 1 ? "" : "s"}`);
        } else {
          // Nothing lost: the tray shows the text for copying by hand.
          toast("Couldn't reach the clipboard, so here's the text.", "error");
          setCapture({ kind: "selection", page, images: [], text: found });
        }
        return;
      }
      setCapture({
        kind: "snip",
        page,
        images: [],
        snip: { url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), width: box.w, height: box.h },
      });
    } catch (e) {
      toast(`Couldn't make that snip: ${e}`, "error");
    } finally {
      endSnip();
    }
  };

  const submit = (text = address, asImages = images) => {
    if (text.trim()) void open(resolveBrowserInput(text, engine, asImages));
  };

  // Keep the native pane glued to its placeholder, and out of the way when leaving the screen.
  useEffect(() => {
    if (!isTauri) return;
    const sync = () => showPane();
    const ro = new ResizeObserver(sync);
    if (paneRef.current) ro.observe(paneRef.current);
    window.addEventListener("resize", sync);
    const overlay = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail) void native.exploreHide();
      else sync();
    };
    window.addEventListener("daiku:overlay", overlay);
    sync();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("daiku:overlay", overlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Captures from this tab's pane. Capture payloads are untrusted, so parseCapture validates them.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void)[] = [];
    let cancelled = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const offs = await Promise.all([
        listen<{ tab: number; payload: string }>("explore://capture", (e) => {
          if (e.payload.tab !== slot) return;
          const parsed = parseCapture(e.payload.payload);
          if (parsed) setCapture(parsed);
        }),
      ]);

      if (cancelled) offs.forEach((off) => off());
      else unlisten = offs;
    })();
    return () => {
      cancelled = true;
      unlisten.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving with a link or query from Home, Lab or the command palette.
  useEffect(() => {
    const key = `${startUrl}|${startQuery}|${engine}`;
    if ((!startUrl && !startQuery) || lastStart === key) return;
    lastStart = key;
    if (startUrl) void open(startUrl);
    else if (startQuery) void open(resolveBrowserInput(startQuery, engine));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startUrl, startQuery, engine]);

  return (
    <div className="web">
      <div className="browser">
        <div className="browser-bar">
          <button type="button" className="ib" aria-label="Back" disabled={!opened} onClick={() => void native.exploreAction(slot, "back")}>
            <span className="flip"><Icon name="arrow-right" size={18} /></span>
          </button>
          <button type="button" className="ib" aria-label="Forward" disabled={!opened} onClick={() => void native.exploreAction(slot, "forward")}>
            <Icon name="arrow-right" size={18} />
          </button>
          <form
            className="address"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <span className={loading ? "dot-guess" : "dot-sourced"} aria-hidden="true" />
            <input
              aria-label="Search the web or enter an address"
              placeholder={`Search ${ENGINES[engine].name} or paste a link`}
              value={address}
              spellCheck={false}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setAddress(e.target.value)}
            />
          </form>
          <label className="check" title="Search for images">
            <input
              type="checkbox"
              checked={images}
              onChange={(e) => {
                setImages(e.target.checked);
              }}
            />
            Images
          </label>
          <select
            className="field engine"
            aria-label="Search engine"
            value={engine}
            onChange={(e) => setSetting("engine", e.target.value as EngineId)}
          >
            {Object.entries(ENGINES).map(([id, e]) => (
              <option key={id} value={id}>
                {e.name}
              </option>
            ))}
          </select>
          <Pill disabled={!opened || !!snipSrc} title="Save part of the page as an image" onClick={() => void startSnip(false)}>
            <Icon name="crop" size={16} />
            Snip
          </Pill>
          <Pill disabled={!opened || !!snipSrc} title="Drag over any text, including in pictures, to copy it" onClick={() => void startSnip(true)}>
            <Icon name="text" size={16} />
            Copy text
          </Pill>
          <Pill ink disabled={!opened} onClick={() => void native.exploreAction(slot, "collect")}>
            <Icon name="download" size={16} />
            Save from page
          </Pill>
        </div>
        <div className="browser-body">
          <div ref={paneRef} className="browser-pane" data-testid="browser-pane">
            {!opened && (
              <div className="browser-empty">
                <h2 className="fr">Search the web, keep the credit.</h2>
                <p>
                  This is a Chromium browser inside Daiku. Highlight text or hover an image and press <b>Save to Daiku</b>, press{" "}
                  <b>Snip</b> to grab any part of the page, or use <b>Save from page</b>. It all goes to your Library with its source
                  and credit attached.
                </p>
                {error && (
                  <p className="guess" role="alert">
                    {error}
                  </p>
                )}
                <OpenClaims
                  onSearch={(t) => {
                    setAddress(t);
                    submit(t, false);
                  }}
                />
                <p className="cap">Nothing connects to the internet until you search. Daiku doesn't track what you browse.</p>
              </div>
            )}
            {snipSrc && <SnipOverlay src={snipSrc} hint={snipForText ? "Drag over the text you want to copy. Esc cancels." : "Drag around what you want to keep. Esc cancels."} onReady={() => void native.exploreHide()} onCancel={endSnip} onSnip={(box) => void finishSnip(box)} />}
          </div>
          {capture && <CaptureTray key={captureCount} capture={capture} onClose={() => setCapture(null)} />}
        </div>
        <span className="sr-only" aria-live="polite">{title}</span>
      </div>
    </div>
  );
}

/** Keeps every tab's title and address current, including tabs that aren't showing. */
function useNavEvents() {
  const patchWeb = useResearchTabs((s) => s.patchWeb);
  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ tab: number; url: string; title: string | null; loading: boolean }>("explore://nav", (e) => {
        const { tab, url, title, loading } = e.payload;
        const current = useResearchTabs.getState().tabs.find((t) => t.kind === "web" && t.slot === tab);
        const changed = current?.kind === "web" && url && url !== current.pageUrl;
        patchWeb(tab, { loading, ...(url ? { pageUrl: url, address: url } : {}), ...(title !== null ? { title } : changed ? { title: "" } : {}) });
      }).then((un) => {
        if (cancelled) un();
        else off = un;
      }),
    );
    return () => {
      cancelled = true;
      off?.();
    };
  }, [patchWeb]);
}

function PdfPicker({ onPick, onClose }: { onPick: (assetId: string) => void; onClose: () => void }) {
  const assets = useStore((s) => s.assets);
  const pdfs = assets.filter((a) => a.kind === "pdf" && mediaUrl(a));
  // On the window, as nothing in the dialog has focus until something's clicked.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog pdf-picker" role="dialog" aria-label="Open a PDF">
        <h2 className="fr dialog-title">Open a PDF</h2>
        <div className="pdf-picker-list">
          {pdfs.map((a) => (
            <button key={a.id} type="button" className="note-row" onClick={() => onPick(a.id)}>
              {a.title}
              <span className="cap"> · {a.credit || "no source yet"}</span>
            </button>
          ))}
          {!pdfs.length && <p className="cap">No PDFs in your Library yet.</p>}
        </div>
        <div className="dialog-actions">
          <Pill onClick={onClose}>Cancel</Pill>
          <Pill
            ink
            onClick={async () => {
              if (!isTauri) {
                toast("Choosing a file needs the desktop app.", "error");
                return;
              }
              const added = (await pickAndImport()).find((a) => a.kind === "pdf");
              if (added) onPick(added.id);
              else toast("That wasn't a PDF, so it's in your Library but not opened here.");
            }}
          >
            Choose a file…
          </Pill>
        </div>
      </div>
    </div>
  );
}

function TabStrip({ onPdf, onDraft }: { onPdf: () => void; onDraft: () => void }) {
  const { tabs, active, select, close, open } = useResearchTabs();
  const assets = useStore((s) => s.assets);
  const records = useStore((s) => s.records);
  const drafts = useMemo(() => selectRecords(records, "draft"), [records]);
  const full = tabs.length >= MAX_TABS;
  const name = (t: ResearchTab) => {
    if (t.kind === "web") return t.title || (t.pageUrl ? hostOf(t.pageUrl) : "New tab");
    if (t.kind === "pdf") return assets.find((a) => a.id === t.assetId)?.title ?? "Removed PDF";
    return drafts.find((d) => d.id === t.draftId)?.data.title ?? "Removed draft";
  };
  return (
    <div className="research-strip">
      <ul className="research-tabs" aria-label="Research tabs">
        {tabs.map((t, i) => (
          <li key={t.id} className={`research-tab ${t.id === active ? "on" : ""}`}>
            <button type="button" aria-current={t.id === active} title={name(t)} onClick={() => select(t.id)}>
              <Icon name={t.kind === "web" ? "explore" : t.kind === "pdf" ? "library" : "pencil"} size={14} />
              <span className="research-tab-name">{name(t)}</span>
            </button>
            <button
              type="button"
              className="research-tab-x"
              aria-label={`Close tab ${i + 1}`}
              onClick={() => {
                const gone = close(t.id);
                if (gone?.kind === "web" && gone.opened) void native.exploreClose(gone.slot);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <span className="cap nowrap" data-testid="tab-count" title={full ? "Close a tab to open another" : undefined}>
        {tabs.length} of {MAX_TABS}
      </span>
      <Pill className="small" disabled={full} aria-label="New web tab" onClick={() => open({ kind: "web" })}>
        + Web
      </Pill>
      <Pill className="small" disabled={full} aria-label="Open a PDF in a new tab" onClick={onPdf}>
        + PDF
      </Pill>
      <Pill className="small" disabled={full} aria-label="New draft in a tab" onClick={onDraft}>
        + Draft
      </Pill>
    </div>
  );
}

function Workspace({ startUrl, startQuery }: { startUrl: string | null; startQuery: string | null }) {
  const { tabs, active, open: openTab, select } = useResearchTabs();
  const addRecord = useStore((s) => s.addRecord);
  const [dialog, setDialog] = useState<"pdf" | "draft" | null>(null);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  useNavEvents();

  // A link from elsewhere needs a web tab: this one, else an open one, else a new one.
  const arriving = !!(startUrl || startQuery);
  useEffect(() => {
    if (!arriving || current.kind === "web") return;
    const web = tabs.find((t) => t.kind === "web");
    if (web) select(web.id);
    else if (!openTab({ kind: "web" })) toast("All five tabs are in use. Close one to open that link.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arriving]);

  // The panes float above the page, so they step aside for dialogs and for tabs that aren't web pages.
  useEffect(() => {
    if (!isTauri) return;
    if (dialog) window.dispatchEvent(new CustomEvent("daiku:overlay", { detail: true }));
    else if (current.kind === "web") window.dispatchEvent(new CustomEvent("daiku:overlay", { detail: false }));
    else void native.exploreHide();
  }, [dialog, current.kind, current.id]);
  useEffect(
    () => () => {
      if (isTauri) void native.exploreHide();
    },
    [],
  );

  return (
    <div className="research">
      <TabStrip onPdf={() => setDialog("pdf")} onDraft={() => setDialog("draft")} />
      <Suspense fallback={<div className="research-doc" />}>
        {current.kind === "web" && <WebTab key={current.id} tab={current} startUrl={startUrl} startQuery={startQuery} />}
        {current.kind === "pdf" && (
          <div className="research-pane">
            <Reader key={current.id} assetId={current.assetId} embedded />
          </div>
        )}
        {current.kind === "draft" && (
          <div className="research-pane research-doc">
            <DraftEditor key={current.id} draftId={current.draftId} />
          </div>
        )}
      </Suspense>
      {dialog === "pdf" && (
        <PdfPicker
          onClose={() => setDialog(null)}
          onPick={(assetId) => {
            openTab({ kind: "pdf", assetId });
            setDialog(null);
          }}
        />
      )}
      {dialog === "draft" && (
        <PromptDialog
          title="New draft"
          placeholder="Title"
          onClose={() => setDialog(null)}
          onSubmit={(title) => {
            const row = addRecord("draft", null, { title, body: "" });
            openTab({ kind: "draft", draftId: row.id });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const webQuery = params.get("web");
  const startUrl = params.get("url");
  const paperQuery = params.get("q") ?? "";
  const [tab, setTab] = useState<Tab>(paperQuery ? "papers" : "web");

  useEffect(() => {
    if (webQuery || startUrl) setTab("web");
    else if (paperQuery) setTab("papers");
  }, [webQuery, startUrl, paperQuery]);

  return (
    <main className="page explore">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Explore</h1>
          <span className="page-sub">Find references, papers and data that back, or break, your claims.</span>
        </div>
        <div className="seg-group">
          <div className="seg-tabs" role="tablist" aria-label="Explore views">
          <button type="button" role="tab" aria-selected={tab === "web"} className={`seg ${tab === "web" ? "on" : ""}`} onClick={() => setTab("web")}>
            Web
          </button>
          <button type="button" role="tab" aria-selected={tab === "papers"} className={`seg ${tab === "papers" ? "on" : ""}`} onClick={() => setTab("papers")}>
            Papers
          </button>
          </div>
          <Link className="seg" to="/explore/claims">
            Claims
          </Link>
          <Link className="seg" to="/explore/interviews">
            Interviews
          </Link>
        </div>
      </div>
      {tab === "web" ? <Workspace startUrl={startUrl} startQuery={webQuery} /> : <PapersTab
          initial={paperQuery}
          onOpen={(url) => {
            if (!useResearchTabs.getState().open({ kind: "web" })) toast("All five tabs are in use, so this opens in one of them.");
            setParams({ url });
            setTab("web");
          }}
        />}
    </main>
  );
}
