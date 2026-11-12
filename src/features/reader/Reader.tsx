import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { selectRecords, useStore } from "../../data/store";
import { HighlightData, HighlightKind, RecordRow } from "../../data/types";
import { Icon } from "../../design/Icon";
import { Pill, toast } from "../../design/primitives";
import { Box } from "../../lib/snip";
import { readTextFromBlob, wordCount } from "../../lib/ocr";
import { copyText, isTauri, mediaUrl } from "../../lib/platform";
import { Capture } from "../../lib/web";
import { CaptureTray } from "../explore/CaptureTray";
import { SnipOverlay } from "../explore/SnipOverlay";
import { fetchBytes } from "../../lib/saveFile";
import { openBoardId, placeOnBoard } from "../../lib/placeOnBoard";
import "../studio.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const KINDS: { kind: HighlightKind; label: string }[] = [
  { kind: "supports", label: "supports" },
  { kind: "method", label: "method" },
  { kind: "limitation", label: "limitation" },
];

type Pending = Pick<HighlightData, "page" | "text" | "rects">;

/** Marks the text on the page that matches what's being looked for. */
function markHits(host: HTMLElement, find: string) {
  const q = find.trim().toLowerCase();
  for (const span of host.querySelectorAll<HTMLElement>("span")) {
    span.classList.toggle("find-hit", !!q && !!span.textContent?.toLowerCase().includes(q));
  }
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function PageView({
  doc,
  page,
  highlights,
  onSelect,
  canvas,
  onRendered,
  scale,
  find,
  children,
}: {
  doc: PDFDocumentProxy;
  page: number;
  highlights: RecordRow<"highlight">[];
  onSelect: (p: Pending | null) => void;
  canvas: React.RefObject<HTMLCanvasElement | null>;
  onRendered: (ready: boolean) => void;
  scale: number;
  find: string;
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let layer: { cancel: () => void } | null = null;
    onRendered(false);
    void (async () => {
      const p = await doc.getPage(page);
      if (cancelled) return;
      const viewport = p.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current;
      // The tab can close between these steps, which clears the refs before the effect is cleaned up.
      if (!c) return;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      const render = p.render({ canvas: c, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      task = render;
      await render.promise.catch(() => {});
      if (cancelled) return;
      onRendered(true);
      const host = text.current;
      if (!host) return;
      host.replaceChildren();
      host.style.setProperty("--total-scale-factor", String(viewport.scale));
      host.style.setProperty("--scale-factor", String(viewport.scale));
      const textLayer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: host, viewport });
      layer = textLayer;
      await textLayer.render().catch(() => {});
      if (cancelled) return;
      markHits(host, find);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, scale]);

  useEffect(() => {
    if (text.current) markHits(text.current, find);
  }, [find]);

  const capture = () => {
    const selection = window.getSelection();
    const value = selection?.toString().replace(/\s+/g, " ").trim();
    if (!selection || !value || !selection.rangeCount || !wrap.current || !text.current?.contains(selection.anchorNode)) {
      onSelect(null);
      return;
    }
    const box = wrap.current.getBoundingClientRect();
    const rects = [...selection.getRangeAt(0).getClientRects()]
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => ({ x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }));
    onSelect({ page, text: value, rects });
  };

  return (
    <div ref={wrap} className="pdf-page" style={{ width: size.w || undefined, height: size.h || undefined }} data-testid="pdf-page" onMouseUp={capture}>
      <canvas ref={canvas} />
      <div className="hl-layer" aria-hidden="true">
        {highlights.flatMap((h) =>
          h.data.rects.map((r, i) => (
            <span key={`${h.id}-${i}`} className={`hl-mark ${h.data.kind}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
          )),
        )}
      </div>
      <div ref={text} className="textLayer" />
      {children}
    </div>
  );
}

export default function Reader({ assetId: givenId, embedded = false }: { assetId?: string; embedded?: boolean } = {}) {
  const params = useParams();
  const assetId = givenId ?? params.assetId;
  const navigate = useNavigate();
  const asset = useStore((s) => s.assets.find((a) => a.id === assetId));
  const records = useStore((s) => s.records);
  const claims = useStore((s) => s.claims);
  const addRecord = useStore((s) => s.addRecord);
  const updateRecord = useStore((s) => s.updateRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const linkEvidence = useStore((s) => s.linkEvidence);
  const addClaim = useStore((s) => s.addClaim);
  const boardId = openBoardId(useLocation().pathname);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [claimId, setClaimId] = useState("");
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [snip, setSnip] = useState<{ src: string; forText: boolean } | null>(null);
  const [capture, setCaptureState] = useState<Capture | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [scale, setScale] = useState(1.25);
  const stage = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; hits: { page: number; text: string }[] } | null>(null);
  const [finding, setFinding] = useState(false);

  const url = asset ? mediaUrl(asset) : null;
  const highlights = useMemo(() => selectRecords(records, "highlight", assetId ?? null), [records, assetId]);
  const onPage = highlights.filter((h) => h.data.page === page);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    setDoc(null);
    setError(null);
    void (async () => {
      try {
        const data = await fetchBytes(url);
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const d = await task.promise;
        if (!cancelled) setDoc(d);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  const setCapture = (next: Capture | null) => {
    setCaptureState((old) => {
      if (old?.snip) URL.revokeObjectURL(old.snip.url);
      return next;
    });
    setCaptureCount((n) => n + 1);
  };

  const endSnip = useCallback(() => {
    setSnip((old) => {
      if (old) URL.revokeObjectURL(old.src);
      return null;
    });
  }, []);

  /** Where a snip or quote came from: this document, so it carries the document's credit and page. */
  const sourceHere = () => ({ pageUrl: asset?.source_url ?? "", pageTitle: `${asset?.title}, p. ${page}`, author: asset?.credit ?? "", site: "" });

  /** The same saving as a web page: what's highlighted, or all of what's showing, goes through the tray. */
  const saveQuote = () => {
    if (!pending) return;
    setCapture({ kind: "selection", page: { ...sourceHere(), pageTitle: `${asset?.title}, p. ${pending.page}` }, images: [], text: pending.text });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  const savePage = async () => {
    const c = pageCanvas.current;
    if (!c) return;
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
    if (!blob) {
      toast("Couldn't read this page. Try again.", "error");
      return;
    }
    setCapture({ kind: "snip", page: sourceHere(), images: [], snip: { url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height } });
  };

  const findInDocument = async () => {
    const q = query.trim();
    if (!doc || !q) {
      setFound(null);
      return;
    }
    setFinding(true);
    try {
      const hits: { page: number; text: string }[] = [];
      for (let n = 1; n <= doc.numPages && hits.length < 100; n++) {
        const content = await (await doc.getPage(n)).getTextContent();
        const line = content.items.map((i) => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ");
        const lower = line.toLowerCase();
        for (let at = lower.indexOf(q.toLowerCase()); at >= 0 && hits.length < 100; at = lower.indexOf(q.toLowerCase(), at + q.length)) {
          hits.push({ page: n, text: line.slice(Math.max(0, at - 40), at + q.length + 60).trim() });
        }
      }
      setFound({ query: q, hits });
      if (hits[0]) setPage(hits[0].page);
    } finally {
      setFinding(false);
    }
  };

  const zoomBy = (by: 1 | -1) => {
    endSnip();
    setScale((now) => {
      const at = ZOOMS.findIndex((z) => z >= now - 0.001);
      return ZOOMS[Math.min(Math.max((at < 0 ? ZOOMS.length - 1 : at) + by, 0), ZOOMS.length - 1)];
    });
  };

  const fitWidth = async () => {
    if (!doc || !stage.current) return;
    endSnip();
    const width = (await doc.getPage(page)).getViewport({ scale: 1 }).width;
    setScale(Math.min(3, Math.max(0.5, (stage.current.clientWidth - 48) / width)));
  };

  /** Works from the page as drawn, at full resolution, so it needs no screenshot and nothing leaves the app. */
  const startSnip = async (forText: boolean) => {
    const c = pageCanvas.current;
    if (!c) return;
    window.getSelection()?.removeAllRanges();
    setPending(null);
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
    if (blob) setSnip({ src: URL.createObjectURL(blob), forText });
    else toast("Couldn't read this page. Try again.", "error");
  };

  const finishSnip = async (box: Box) => {
    const c = pageCanvas.current;
    const forText = snip?.forText;
    try {
      if (!c || !asset) return;
      const out = document.createElement("canvas");
      out.width = box.w;
      out.height = box.h;
      out.getContext("2d")!.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("the image couldn't be created");
      const source = sourceHere();
      if (forText) {
        if (!isTauri) {
          toast("Reading text needs the desktop app, as it uses the recogniser built into Windows.", "error");
          return;
        }
        const found = await readTextFromBlob(blob);
        if (!found) toast("No text found there. Try a tighter box.");
        else if (await copyText(found)) toast(`Copied ${wordCount(found)} word${wordCount(found) === 1 ? "" : "s"}`);
        else setCapture({ kind: "selection", page: source, images: [], text: found });
        return;
      }
      setCapture({ kind: "snip", page: source, images: [], snip: { url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), width: box.w, height: box.h } });
    } catch (e) {
      toast(`Couldn't make that snip: ${e}`, "error");
    } finally {
      endSnip();
    }
  };

  const citation = useCallback((p: number) => `${asset?.credit || "[no source yet]"}, ${asset?.title}, p. ${p}`, [asset]);

  const mark = (kind: HighlightKind) => {
    if (!pending || !asset) return;
    addRecord("highlight", asset.id, { asset_id: asset.id, kind, claim_id: null, ...pending });
    window.getSelection()?.removeAllRanges();
    setPending(null);
    toast(`Highlighted on p. ${pending.page}`);
  };

  /** The selected words become a claim, backed by this passage, and a card on the board if one is open. */
  const makeClaim = () => {
    if (!pending || !asset) return;
    const text = pending.text.replace(/\s+/g, " ").trim().slice(0, 280);
    const claim = addClaim(text, boardId);
    addRecord("highlight", asset.id, { asset_id: asset.id, kind: "supports", claim_id: claim.id, ...pending });
    linkEvidence(asset.id, "claim", claim.id, "for", `p. ${pending.page}: ${pending.text.slice(0, 200)}`);
    if (boardId) placeOnBoard({ boardId, text, claim: claim.id });
    window.getSelection()?.removeAllRanges();
    setPending(null);
    toast(boardId ? `Claim made and put on the board, backed by p. ${pending.page}` : `Claim made, backed by p. ${pending.page}`);
  };

  const toEvidence = (h: RecordRow<"highlight">, id: string) => {
    if (!asset) return;
    updateRecord<"highlight">(h.id, { claim_id: id });
    linkEvidence(asset.id, "claim", id, "for", `p. ${h.data.page}: ${h.data.text.slice(0, 200)}`);
    toast("Linked to the claim, with its page number");
  };

  if (!asset) {
    return (
      <main className="page">
        <h1 className="fr page-title">Reader</h1>
        <p>That document isn't in your library.</p>
      </main>
    );
  }
  const pages = doc?.numPages ?? 0;
  const go = (n: number) => {
    setPending(null);
    endSnip();
    setPage(Math.min(Math.max(1, n), Math.max(pages, 1)));
  };

  const Root = embedded ? "div" : "main";
  return (
    <Root className="reader" aria-label="Reader">
      <header className="reader-head">
        {!embedded && (
          <button type="button" className="ib" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon name="arrow-right" size={18} />
          </button>
        )}
        <h1 className="fr reader-title">{asset.title}</h1>
        <span className="cap">pdf{pages ? ` · ${pages} pages` : ""}{asset.is_sample ? " · sample" : ""}</span>
        <div className="reader-gap" />
        <label className="cap reader-page">
          Page
          <input className="field" type="number" min={1} max={pages || 1} aria-label="Page number" value={page} onChange={(e) => go(Number(e.target.value))} />
          / {pages || "–"}
        </label>
        <form
          className="reader-find"
          onSubmit={(e) => {
            e.preventDefault();
            void findInDocument();
          }}
        >
          <input className="field" type="search" aria-label="Find in this PDF" placeholder="Find in this PDF" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
        <span className="reader-zoom" role="group" aria-label="Zoom">
          <button type="button" className="ib" aria-label="Zoom out" disabled={!doc || scale <= ZOOMS[0]} onClick={() => zoomBy(-1)}>
            −
          </button>
          <button type="button" className="link-btn plain" title="Fit the page to the width" data-testid="reader-zoom" disabled={!doc} onClick={() => void fitWidth()}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="ib" aria-label="Zoom in" disabled={!doc || scale >= ZOOMS[ZOOMS.length - 1]} onClick={() => zoomBy(1)}>
            +
          </button>
        </span>
        <Pill disabled={!rendered || !!snip} title="Save part of this page as a picture, with its credit and page" onClick={() => void startSnip(false)}>
          <Icon name="crop" size={16} />
          Snip
        </Pill>
        <Pill disabled={!rendered || !!snip} title="Drag over any text, including in scanned pages, to copy it" onClick={() => void startSnip(true)}>
          <Icon name="text" size={16} />
          Copy text
        </Pill>
        <Pill ink disabled={!rendered || !!snip} title="Save this whole page to the Library, with its credit" onClick={() => void savePage()}>
          <Icon name="download" size={16} />
          Save page
        </Pill>
        <Pill
          onClick={async () => {
            toast((await copyText(citation(page))) ? "Citation copied" : "Couldn't reach the clipboard");
          }}
        >
          Cite
        </Pill>
      </header>
      <div className="reader-body">
        <nav className="reader-thumbs" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => {
            const count = highlights.filter((h) => h.data.page === n).length;
            return (
              <button key={n} type="button" className={`thumb ${n === page ? "on" : ""}`} aria-current={n === page} onClick={() => go(n)}>
                <span className="fr">{n}</span>
                <span className="cap">{count ? `${count} mark${count === 1 ? "" : "s"}` : ""}</span>
              </button>
            );
          })}
        </nav>
        <div ref={stage} className="reader-stage" tabIndex={0} role="region" aria-label="Page">
          {error && (
            <p role="alert" className="fail-text">
              Couldn't open this PDF. {error}
            </p>
          )}
          {!url && <p>This item has no file to read. Import the PDF to the Library first.</p>}
          {doc && (
            <PageView doc={doc} page={page} highlights={onPage} onSelect={setPending} canvas={pageCanvas} onRendered={setRendered} scale={scale} find={found?.query ?? ""}>
              {snip && <SnipOverlay src={snip.src} hint={snip.forText ? "Drag over the text you want to copy. Esc cancels." : "Drag around what you want to keep. Esc cancels."} onReady={() => {}} onCancel={endSnip} onSnip={(box) => void finishSnip(box)} />}
            </PageView>
          )}
        </div>
        {capture ? (
          <CaptureTray key={captureCount} capture={capture} onClose={() => setCapture(null)} />
        ) : (
        <aside className="reader-side" aria-label="Highlights">
          {finding && <p className="cap">Looking…</p>}
          {found && !finding && (
            <section className="find-results" aria-label="Find results">
              <div className="kv">
                <span className="cap" data-testid="find-count">
                  {found.hits.length === 100 ? "100+" : found.hits.length} result{found.hits.length === 1 ? "" : "s"} for “{found.query}”
                </span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setFound(null);
                    setQuery("");
                  }}
                >
                  Clear
                </button>
              </div>
              {found.hits.map((hit, i) => (
                <button key={i} type="button" className={`find-hit-row ${hit.page === page ? "on" : ""}`} onClick={() => go(hit.page)}>
                  <span className="cap">p. {hit.page}</span> {hit.text}
                </button>
              ))}
            </section>
          )}
          <span className="cap">Highlights · page {page}</span>
          {onPage.map((h) => (
            <article key={h.id} className="card hl-card">
              <span className={`hl-tag ${h.data.kind}`}>{h.data.kind}</span>
              <p>{h.data.text}</p>
              <span className="cap">{citation(h.data.page)}</span>
              {h.data.claim_id ? (
                <span className="cap ok-text">✓ Evidence on “{claims.find((c) => c.id === h.data.claim_id)?.text ?? "removed claim"}”</span>
              ) : (
                <select
                  className="field"
                  aria-label="Turn into evidence for a claim"
                  value={claimId}
                  onChange={(e) => {
                    setClaimId("");
                    if (e.target.value) toEvidence(h, e.target.value);
                  }}
                >
                  <option value="">Turn into evidence for…</option>
                  {claims.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.text}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="link-btn" onClick={() => deleteRecord(h.id)}>
                Remove highlight
              </button>
            </article>
          ))}
          {!onPage.length && <p className="cap">No highlights on this page.</p>}
          <div className="selection-box">
            <span className="cap">Selection</span>
            {pending ? (
              <>
                <p className="sel-text">“{pending.text.slice(0, 180)}”</p>
                <div className="sel-actions">
                  <Pill ink className="small" title="Turn these words into a claim, backed by this page" onClick={makeClaim}>
                    Make claim
                  </Pill>
                  {KINDS.map((k) => (
                    <Pill key={k.kind} className="small" onClick={() => mark(k.kind)}>
                      {k.label}
                    </Pill>
                  ))}
                  <Pill className="small" title="Save this text to the Library as a quote, with its credit and page" onClick={saveQuote}>
                    Save quote
                  </Pill>
                </div>
              </>
            ) : (
              <p className="cap">Select text on the page to make a claim or highlight it. Every one keeps its page number, so citations are automatic.</p>
            )}
          </div>
        </aside>
        )}
      </div>
    </Root>
  );
}
