import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { Asset, DeckData, Slide, uid } from "../../data/types";
import { Icon } from "../../design/Icon";
import { AssetImage, ConfirmDialog, Pill, PromptDialog, toast } from "../../design/primitives";
import { mediaUrl } from "../../lib/platform";
import { saveBytes, saveText } from "../../lib/saveFile";
import { isCredited } from "../../lib/search";
import { safeFileName } from "../../lib/studio";
import "../studio.css";
import { deckFromBoard, exportCheck, fingerprint, markdownOutline, matrixTable, references, requirementsTable, sectionContent, TableData } from "./deckData";

type S = ReturnType<typeof useStore.getState>;

/** PowerPoint can't take SVG sample art reliably, so every image goes in as a PNG. */
async function imageAsPng(asset: Asset): Promise<{ data: string; ratio: number } | null> {
  const url = mediaUrl(asset);
  if (!url || asset.kind !== "image") return null;
  try {
    const blob = await (await fetch(url)).blob();
    const object = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = object;
      await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth || 800, img.naturalHeight || 800));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((img.naturalWidth || 800) * scale);
      canvas.height = Math.round((img.naturalHeight || 800) * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/png"), ratio: canvas.width / canvas.height };
    } finally {
      URL.revokeObjectURL(object);
    }
  } catch {
    return null;
  }
}

const INK = "1E1F1C";
const MUTED = "6B6D66";
const SAGE = "4E6450";
const CLAY = "9C5530";
// The brand's Fraunces and Comfortaa may not be on the viewer's machine, so slides name fonts
// that exist everywhere and stay editable.
const DISPLAY = "Georgia";
const BODY = "Segoe UI";

async function buildPptx(s: S, deck: DeckData): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  const heading = { x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontFace: DISPLAY, fontSize: 30, italic: true, color: INK };

  const addTable = (out: ReturnType<typeof pptx.addSlide>, t: TableData) => {
    const cell = (text: string, opts: Record<string, unknown> = {}) => ({ text, options: { fontFace: BODY, fontSize: 13, color: INK, ...opts } });
    const rows = [
      t.header.map((h) => cell(h, { bold: true, color: MUTED, fontSize: 11 })),
      ...t.rows.map((r) => r.cells.map((c, i) => cell(c, r.guess[i] ? { color: CLAY } : c === "FAIL" ? { bold: true } : {}))),
      ...(t.footer.length ? [t.footer.map((c) => cell(c, { bold: true }))] : []),
    ];
    out.addTable(rows, { x: 0.6, y: 1.5, w: 12.1, border: { type: "solid", color: "D9D5CB", pt: 0.5 } });
  };

  for (const x of deck.slides) {
    const out = pptx.addSlide();
    out.background = { color: "FBFAF7" };
    if (x.notes) out.addNotes(x.notes);
    if (x.kind === "title") {
      out.addText(x.title, { x: 0.8, y: 2.6, w: 11.7, h: 1.4, fontFace: DISPLAY, fontSize: 48, italic: true, color: INK });
      if (x.body) out.addText(x.body, { x: 0.8, y: 4.0, w: 11.7, h: 0.6, fontFace: BODY, fontSize: 18, color: SAGE });
      continue;
    }
    out.addText(x.title, heading);
    if (x.kind === "section") {
      const c = sectionContent(s, x.ref);
      const shown = c.images.slice(0, 3);
      let left = 0.6;
      const credits: string[] = [];
      for (const a of shown) {
        const image = await imageAsPng(a);
        if (!image) continue;
        const h = 3.6;
        const w = Math.min(h * image.ratio, 4.8);
        out.addImage({ data: image.data, x: left, y: 1.5, w, h: w / image.ratio });
        left += w + 0.25;
        credits.push(`${a.title}: ${isCredited(a) ? a.credit : "no source yet"}`);
      }
      if (c.texts.length || x.body) {
        const lines = [...(x.body ? [x.body] : []), ...c.texts].join("\n");
        out.addText(lines, { x: 0.6, y: 5.25, w: 12.1, h: 1.2, fontFace: BODY, fontSize: 15, color: INK, valign: "top" });
      }
      // Every image keeps its credit line on the slide.
      if (credits.length) out.addText(credits.join("  ·  "), { x: 0.6, y: 6.75, w: 12.1, h: 0.4, fontFace: "Consolas", fontSize: 10, color: MUTED });
    } else if (x.kind === "matrix" || x.kind === "requirements") {
      const t = x.kind === "matrix" ? matrixTable(s, x.ref) : requirementsTable(s, x.ref);
      if (t) addTable(out, t);
      if (x.kind === "matrix" && t?.rows.some((r) => r.guess.some(Boolean))) {
        out.addText("(guess) = no source linked yet", { x: 0.6, y: 6.75, w: 12.1, h: 0.4, fontFace: "Consolas", fontSize: 10, color: CLAY });
      }
    } else if (x.body) {
      out.addText(x.body, { x: 0.6, y: 1.5, w: 12.1, h: 5, fontFace: BODY, fontSize: 18, color: INK, valign: "top" });
    }
  }
  const refs = references(s, deck);
  if (refs.length) {
    const out = pptx.addSlide();
    out.background = { color: "FBFAF7" };
    out.addText("References", heading);
    out.addText(refs.map((a) => `${a.title}: ${isCredited(a) ? a.credit : "no source yet"}`).join("\n"), { x: 0.6, y: 1.5, w: 12.1, h: 5.2, fontFace: BODY, fontSize: 14, color: INK, valign: "top" });
  }
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

function TablePreview({ table }: { table: TableData | null }) {
  if (!table) return <p className="cap">The linked content is gone.</p>;
  return (
    <table className="tbl slide-table">
      <thead>
        <tr>
          {table.header.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, i) => (
          <tr key={i}>
            {r.cells.map((c, j) => (
              <td key={j} className={r.guess[j] ? "guess" : ""}>
                {c}
              </td>
            ))}
          </tr>
        ))}
        {table.footer.length > 0 && (
          <tr className="totals">
            {table.footer.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SlidePreview({ state, slide }: { state: S; slide: Slide }) {
  const content = slide.kind === "section" ? sectionContent(state, slide.ref) : null;
  return (
    <div className="slide" data-testid="slide-preview">
      <h2 className={`fr slide-title ${slide.kind === "title" ? "big" : ""}`}>{slide.title}</h2>
      {slide.body && <p className="slide-body">{slide.body}</p>}
      {content && (
        <>
          <div className="slide-images">
            {content.images.slice(0, 3).map((a) => (
              <figure key={a.id}>
                <div className="slide-im">
                  <AssetImage asset={a} />
                </div>
                <figcaption className="cap">{isCredited(a) ? a.credit : "no source yet"}</figcaption>
              </figure>
            ))}
          </div>
          {content.texts.map((t) => (
            <p key={t} className="slide-body">
              {t}
            </p>
          ))}
        </>
      )}
      {slide.kind === "matrix" && <TablePreview table={matrixTable(state, slide.ref)} />}
      {slide.kind === "requirements" && <TablePreview table={requirementsTable(state, slide.ref)} />}
    </div>
  );
}

export default function Deck() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const state = useStore();
  const decks = selectRecords(state.records, "deck");
  const deck = decks.find((d) => d.id === deckId) ?? decks[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const newDeck = (title: string) => {
    const board = [...state.boards].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const decision = state.decisions.find((d) => d.board_id === board?.id) ?? state.decisions[0];
    const row = state.addRecord("deck", null, deckFromBoard(state, board?.id ?? null, decision?.id ?? null, title));
    setDialog(null);
    navigate(`/deck/${row.id}`);
  };

  if (!deck) {
    return (
      <main className="page lab-eng">
        <h1 className="fr page-title">Deck Studio</h1>
        <p>Build a slide deck from your latest board and decision, then edit it and export an editable PowerPoint.</p>
        <div>
          <Pill ink onClick={() => setDialog("new")}>
            <Icon name="plus" size={16} />
            New deck from board
          </Pill>
        </div>
        {dialog === "new" && <PromptDialog title="New deck" initial="Design review" onClose={() => setDialog(null)} onSubmit={newDeck} />}
      </main>
    );
  }

  const data = deck.data;
  const slide = data.slides.find((x) => x.id === selected) ?? data.slides[0];
  const setSlides = (slides: Slide[]) => state.updateRecord<"deck">(deck.id, { slides });
  const patch = (id: string, p: Partial<Slide>) => setSlides(data.slides.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (id: string, by: number) => {
    const i = data.slides.findIndex((x) => x.id === id);
    const j = i + by;
    if (j < 0 || j >= data.slides.length) return;
    const next = [...data.slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  };
  const check = exportCheck(state, data);
  const staleIds = new Set(data.slides.filter((x) => check.stale.includes(x.title)).map((x) => x.id));
  const issues = check.stale.length + (check.guesses ? 1 : 0) + check.uncredited.length;

  const exportPptx = async () => {
    setBusy(true);
    try {
      const bytes = await buildPptx(state, data);
      const path = await saveBytes(`${safeFileName(data.title, "Deck")}.pptx`, bytes, "PowerPoint", ["pptx"], "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      if (path) toast("PowerPoint exported");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const exportOutline = async () => {
    const path = await saveText(`${safeFileName(data.title, "Deck")}.md`, markdownOutline(state, data), "Markdown", ["md"], "text/markdown");
    if (path) toast("Outline exported");
  };

  return (
    <main className="reader" aria-label="Deck Studio">
      <header className="reader-head">
        <input className="fr reader-title deck-name" aria-label="Deck title" value={data.title} onChange={(e) => state.updateRecord<"deck">(deck.id, { title: e.target.value })} />
        <span className="cap">{data.slides.length} slides</span>
        <div className="reader-gap" />
        {decks.length > 1 && (
          <select className="field decision-select" aria-label="Switch deck" value={deck.id} onChange={(e) => navigate(`/deck/${e.target.value}`)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.data.title}
              </option>
            ))}
          </select>
        )}
        <Pill onClick={() => setDialog("new")}>
          <Icon name="plus" size={16} />
          New
        </Pill>
        <button type="button" className="ib" aria-label="Delete this deck" title="Delete this deck" onClick={() => setDialog("delete")}>
          <Icon name="remove" size={18} />
        </button>
        <Pill ink disabled={busy} onClick={() => setChecked(true)}>
          Export…
        </Pill>
      </header>
      <div className="reader-body">
        <nav className="reader-thumbs deck-thumbs" aria-label="Slides">
          {data.slides.map((x, i) => (
            <div key={x.id} className={`thumb ${x.id === slide?.id ? "on" : ""}`}>
              <button type="button" className="thumb-main" aria-current={x.id === slide?.id} onClick={() => setSelected(x.id)}>
                <span className="cap">{i + 1}</span> {x.title}
                {staleIds.has(x.id) && <span className="tag stale">update</span>}
              </button>
              <span className="thumb-actions">
                <button type="button" aria-label={`Move ${x.title} up`} onClick={() => move(x.id, -1)}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${x.title} down`} onClick={() => move(x.id, 1)}>
                  ↓
                </button>
                <button type="button" aria-label={`Remove slide ${x.title}`} onClick={() => setSlides(data.slides.filter((y) => y.id !== x.id))}>
                  ×
                </button>
              </span>
            </div>
          ))}
          <Pill className="small" onClick={() => {
            const added: Slide = { id: uid(), kind: "text", title: "New slide", body: "", notes: "", ref: null, fingerprint: "" };
            setSlides([...data.slides, added]);
            setSelected(added.id);
          }}>
            <Icon name="plus" size={14} />
            Slide
          </Pill>
        </nav>
        <div className="reader-stage">{slide ? <SlidePreview state={state} slide={slide} /> : <p>No slides. Add one on the left.</p>}</div>
        <aside className="reader-side" aria-label="Slide details">
          {slide && (
            <>
              {staleIds.has(slide.id) && (
                <div className="gate-warn">
                  <b>The board changed.</b>
                  <span>The preview and export already use the latest content. Mark it as reviewed to clear this flag.</span>
                  <Pill className="small" onClick={() => patch(slide.id, { fingerprint: fingerprint(state, slide) })}>
                    Mark reviewed
                  </Pill>
                </div>
              )}
              <label className="lbl">
                <span className="cap">title</span>
                <input className="field" aria-label="Slide title" value={slide.title} onChange={(e) => patch(slide.id, { title: e.target.value })} />
              </label>
              <label className="lbl">
                <span className="cap">text</span>
                <textarea className="field paste" aria-label="Slide text" value={slide.body} onChange={(e) => patch(slide.id, { body: e.target.value })} />
              </label>
              <label className="lbl">
                <span className="cap">speaker notes</span>
                <textarea className="field paste" aria-label="Speaker notes" value={slide.notes} onChange={(e) => patch(slide.id, { notes: e.target.value })} />
              </label>
            </>
          )}
        </aside>
      </div>
      {dialog === "new" && <PromptDialog title="New deck" initial="Design review" onClose={() => setDialog(null)} onSubmit={newDeck} />}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete this deck?"
          body={`“${data.title}” will be removed. The board and decision it was built from aren't affected.`}
          action="Delete"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            state.deleteRecord(deck.id);
            setDialog(null);
            navigate("/deck");
          }}
        />
      )}
      {checked && (
        <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && setChecked(false)}>
          <div className="dialog" role="dialog" aria-label="Export check">
            <h2 className="fr dialog-title">Export check</h2>
            {issues === 0 ? (
              <p className="dialog-body">Nothing to flag.</p>
            ) : (
              <ul className="dialog-body check-list" data-testid="export-check">
                {check.guesses > 0 && <li className="guess">{check.guesses} matrix scores are guesses. They're marked “(guess)” on the slide.</li>}
                {check.uncredited.map((t) => (
                  <li key={t}>“{t}” has no source yet. Its credit line says so.</li>
                ))}
                {check.stale.map((t) => (
                  <li key={t}>“{t}” changed since it was last reviewed.</li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <Pill onClick={() => setChecked(false)}>Cancel</Pill>
              <Pill
                onClick={() => {
                  setChecked(false);
                  void exportOutline();
                }}
              >
                Markdown outline
              </Pill>
              <Pill
                ink
                disabled={busy}
                onClick={() => {
                  setChecked(false);
                  void exportPptx();
                }}
              >
                PowerPoint
              </Pill>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
