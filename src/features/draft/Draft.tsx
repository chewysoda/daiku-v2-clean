import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { selectRecords, useStore } from "../../data/store";
import { Asset, RecordRow } from "../../data/types";
import { AssetImage, ConfirmDialog, Pill, PromptDialog, toast } from "../../design/primitives";
import { MarkdownText } from "../../design/MarkdownText";
import { citeLine, figureEmbed, quoteBlock, splitFigures, wordsIn } from "../../lib/drafting";
import { blockEdit } from "../../lib/noteEdit";
import { mediaUrl } from "../../lib/platform";
import { saveText } from "../../lib/saveFile";
import { safeFileName } from "../../lib/studio";
import { applyEdit, Capture, CaptureDialog, NoteToolbar, pictureIn } from "../research/NoteTools";
import "../studio.css";
import "./draft.css";

/**
 * Written Markdown with pictures from the Library only. They're drawn from local files, by title, so a
 * draft can show a snip without the page ever fetching anything from the web.
 */
function DraftPreview({ body, assets }: { body: string; assets: Asset[] }) {
  const parts = useMemo(() => splitFigures(body), [body]);
  return (
    <div className="draft-page" data-testid="draft-preview" tabIndex={0} role="region" aria-label="Preview">
      {parts.map((part, i) => {
        if (part.kind === "text") return <MarkdownText key={i} text={part.text} />;
        const asset = assets.find((a) => a.title.toLowerCase() === part.title.toLowerCase());
        return asset && asset.kind === "image" && mediaUrl(asset) ? (
          <figure key={i} className="draft-figure">
            <AssetImage asset={asset} />
          </figure>
        ) : (
          <p key={i} className="cap guess">
            No picture called “{part.title}” in the Library.
          </p>
        );
      })}
    </div>
  );
}

/** What's been saved while researching, ready to drop in with its credit. */
function ResearchPanel({ onInsert }: { onInsert: (block: string) => void }) {
  const assets = useStore((s) => s.assets);
  const records = useStore((s) => s.records);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const highlights = selectRecords(records, "highlight");
  const quotes = assets.filter((a) => a.kind === "quote" && matches(`${a.title} ${a.notes}`));
  const pictures = assets.filter((a) => a.kind === "image" && matches(a.title));
  const marks = highlights.filter((h) => matches(h.data.text));
  const assetOf = (h: RecordRow<"highlight">) => assets.find((a) => a.id === h.data.asset_id);
  return (
    <aside className="draft-side" aria-label="From your research">
      <span className="cap">From your research</span>
      <input className="field" type="search" aria-label="Find in your research" placeholder="Find…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!quotes.length && !pictures.length && !marks.length && <p className="cap">{q ? "Nothing matches." : "Snips, quotes and PDF highlights you save show up here."}</p>}
      {marks.map((h) => {
        const source = assetOf(h);
        return (
          <button key={h.id} type="button" className="draft-source" aria-label={`Insert highlight: ${h.data.text.slice(0, 60)}`} onClick={() => onInsert(quoteBlock(h.data.text, source, h.data.page))}>
            <span className="cap">highlight · p. {h.data.page}</span>
            <span className="draft-source-text">{h.data.text}</span>
            <span className="cap">{citeLine(source, h.data.page)}</span>
          </button>
        );
      })}
      {quotes.map((a) => (
        <button key={a.id} type="button" className="draft-source" aria-label={`Insert quote: ${a.title}`} onClick={() => onInsert(quoteBlock(a.notes, a))}>
          <span className="cap">quote</span>
          <span className="draft-source-text">{a.notes}</span>
          <span className="cap">{citeLine(a)}</span>
        </button>
      ))}
      {pictures.map((a) => (
        <button key={a.id} type="button" className="draft-source picture" aria-label={`Insert picture: ${a.title}`} onClick={() => onInsert(figureEmbed(a))}>
          <span className="draft-thumb">
            <AssetImage asset={a} />
          </span>
          <span className="cap">{citeLine(a)}</span>
        </button>
      ))}
    </aside>
  );
}

/** One draft. Used on the Drafting page and in a research tab, where sources stay a click away. */
export function DraftEditor({ draftId }: { draftId: string }) {
  const draft = useStore((s) => s.records.find((r) => r.id === draftId && r.type === "draft")) as RecordRow<"draft"> | undefined;
  const assets = useStore((s) => s.assets);
  const update = useStore((s) => s.updateRecord);
  const box = useRef<HTMLTextAreaElement>(null);
  const [capture, setCapture] = useState<Capture | null>(null);

  if (!draft) return <p className="draft-gone">This draft has been removed.</p>;
  const setBody = (body: string) => update<"draft">(draft.id, { body });
  const insert = (block: string) => {
    if (box.current) applyEdit(box.current, (body, start, end) => blockEdit(body, start, end, block), setBody);
  };
  const words = wordsIn(draft.data.body);

  return (
    <div className="draft-work">
      <div className="draft-edit">
        <div className="draft-head">
          <input className="note-title fr" aria-label="Draft title" value={draft.data.title} onChange={(e) => update<"draft">(draft.id, { title: e.target.value })} />
          <span className="cap nowrap" data-testid="draft-words">
            {words} word{words === 1 ? "" : "s"}
          </span>
          <Pill
            className="small"
            onClick={async () => {
              const path = await saveText(`${safeFileName(draft.data.title)}.md`, `# ${draft.data.title}\n\n${draft.data.body}\n`, "Markdown", ["md"], "text/markdown");
              if (path) toast("Draft saved as Markdown.");
            }}
          >
            Export
          </Pill>
        </div>
        <NoteToolbar box={box} onBody={setBody} onCapture={setCapture} />
        <div className="draft-panes">
          <textarea
            ref={box}
            className="note-body draft-body"
            aria-label="Draft body"
            placeholder="Start writing. Markdown and $LaTeX$ both work, and anything in the panel on the right goes in with its credit."
            value={draft.data.body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={(e) => {
              const picture = pictureIn(e.clipboardData);
              if (picture) {
                e.preventDefault();
                setCapture({ kind: "picture", picture });
              }
            }}
          />
          <DraftPreview body={draft.data.body} assets={assets} />
        </div>
      </div>
      <ResearchPanel onInsert={insert} />
      {capture && (
        <CaptureDialog
          capture={capture}
          onClose={() => setCapture(null)}
          onInsert={(block) => {
            setCapture(null);
            insert(block);
          }}
        />
      )}
    </div>
  );
}

export default function Draft() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const records = useStore((s) => s.records);
  const add = useStore((s) => s.addRecord);
  const remove = useStore((s) => s.deleteRecord);
  const drafts = selectRecords(records, "draft");
  const current = drafts.find((d) => d.id === draftId) ?? drafts[0];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <main className="page lab-eng draft" aria-label="Drafting">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Drafting</h1>
          <span className="page-sub">Write it up from what you've found. Quotes, snips and highlights go in with their credit.</span>
        </div>
        <Pill onClick={() => setAdding(true)}>New draft</Pill>
      </div>
      <div className="draft-cols">
        <nav className="note-list" aria-label="Drafts">
          {drafts.map((d) => (
            <button key={d.id} type="button" className={`note-row ${current?.id === d.id ? "on" : ""}`} onClick={() => navigate(`/draft/${d.id}`)}>
              {d.data.title}
            </button>
          ))}
          {!drafts.length && <p className="cap">No drafts yet.</p>}
          {current && (
            <button type="button" className="link-btn draft-remove" onClick={() => setRemoving(true)}>
              Remove this draft
            </button>
          )}
        </nav>
        {current ? <DraftEditor key={current.id} draftId={current.id} /> : <p>Start a draft to write up your research.</p>}
      </div>
      {adding && (
        <PromptDialog
          title="New draft"
          placeholder="Title"
          onClose={() => setAdding(false)}
          onSubmit={(title) => {
            const row = add("draft", null, { title, body: "" });
            setAdding(false);
            navigate(`/draft/${row.id}`);
          }}
        />
      )}
      {removing && current && (
        <ConfirmDialog
          title="Remove this draft?"
          body={`“${current.data.title}” will be deleted. This can't be undone.`}
          action="Remove"
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            remove(current.id);
            setRemoving(false);
            navigate("/draft");
          }}
        />
      )}
    </main>
  );
}
