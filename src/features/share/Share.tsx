import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useLatestBoard, useStore, Comment } from "../../data/store";
import { Asset, BoardItem } from "../../data/types";
import { Icon } from "../../design/Icon";
import { AssetImage, Avatar, Pill, toast } from "../../design/primitives";
import { isTauri } from "../../lib/platform";
import { isCredited } from "../../lib/search";
import { MathText } from "../../design/MathText";
import { exportSharePage } from "./exportPage";
import "./share.css";

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} m` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};

export default function Share() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const boards = useStore((s) => s.boards);
  const latest = useLatestBoard();
  const allItems = useStore((s) => s.board_items);
  const assets = useStore((s) => s.assets);
  const allComments = useStore((s) => s.comments);
  const addComment = useStore((s) => s.addComment);
  const deleteComment = useStore((s) => s.deleteComment);
  const updateShare = useStore((s) => s.updateShare);
  const name = useStore((s) => s.config.name);
  const board = boards.find((b) => b.id === boardId) ?? latest;
  const [text, setText] = useState("");
  const [pinning, setPinning] = useState(false);
  const [pending, setPending] = useState<{ asset: string; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const images = useMemo(() => {
    // Images with pinned comments come first, so a pin never loses its picture.
    const pinned = new Set(allComments.filter((c) => c.board_id === board?.id && c.pin_x !== null).map((c) => c.asset_id));
    const items = allItems
      .filter((i: BoardItem) => i.board_id === board?.id && i.kind === "image")
      .sort((a, b) => Number(pinned.has(b.asset_id)) - Number(pinned.has(a.asset_id)) || b.w * b.h - a.w * a.h);
    const seen = new Set<string>();
    const out: Asset[] = [];
    for (const i of items) {
      const a = assets.find((x) => x.id === i.asset_id);
      if (a && a.kind === "image" && !seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }
    return out.slice(0, 5);
  }, [allItems, allComments, assets, board?.id]);

  if (!board) {
    return (
      <main className="page">
        <h1 className="fr page-title">Share</h1>
        <p>Create a board first, then share it from here.</p>
      </main>
    );
  }

  const comments = allComments.filter((c) => c.board_id === board.id);
  const roots = comments.filter((c: Comment) => !c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const share = board.share;
  const palette = [...new Set(images.flatMap((a) => a.palette_lab.slice(0, 1).map((c) => c.hex)))].slice(0, 5);
  const credited = images.filter(isCredited);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    addComment({
      board_id: board.id,
      parent_id: replyTo,
      author: name || "You",
      is_guest: false,
      text: body,
      asset_id: replyTo ? null : (pending?.asset ?? null),
      pin_x: replyTo ? null : (pending?.x ?? null),
      pin_y: replyTo ? null : (pending?.y ?? null),
    });
    setText("");
    setPending(null);
    setReplyTo(null);
  };

  return (
    <div className="share-wrap">
      <main className="page share">
        <div className="share-bar no-print">
          <select className="field share-board" aria-label="Board to share" value={board.id} onChange={(e) => navigate(`/share/${e.target.value}`)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="cap share-note">Exports one self-contained page: no account, no upload.</span>
          <Pill onClick={() => navigate(`/present/${board.id}`)}>
            <Icon name="play" size={16} />
            Present
          </Pill>
          <Pill onClick={() => window.print()}>
            <Icon name="download" size={16} />
            PDF
          </Pill>
          <Pill
            ink
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const where = await exportSharePage(board, images, comments, name);
                if (where) toast(isTauri ? `Saved ${where}` : "Share page downloaded");
              } catch (e) {
                toast(`Couldn't export the page: ${e}`, "error");
              }
              setExporting(false);
            }}
          >
            {exporting ? "Exporting…" : "Export share page"}
          </Pill>
        </div>

        <div className="share-head">
          <div className="page-head-text">
            <span className="cap">
              {name ? `from ${name} · ` : ""}
              {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
            </span>
            <input
              className="inline-input fr share-title"
              aria-label="Headline"
              value={share.headline ?? board.name}
              onChange={(e) => updateShare(board.id, { headline: e.target.value })}
            />
          </div>
        </div>

        {images.length ? (
          <div className={`share-grid n${images.length}`}>
            {images.map((a) => {
              const pins = roots.filter((c) => c.asset_id === a.id && c.pin_x !== null);
              return (
                <figure
                  key={a.id}
                  className={`share-fig ${pinning ? "pinning" : ""}`}
                  onClick={(e) => {
                    if (!pinning) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setPending({ asset: a.id, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                    setPinning(false);
                  }}
                >
                  <AssetImage asset={a} />
                  {pins.map((c) => (
                    <span key={c.id} className="pin" style={{ left: `${c.pin_x}%`, top: `${c.pin_y}%` }} aria-label={`Comment ${roots.indexOf(c) + 1}`}>
                      {roots.indexOf(c) + 1}
                    </span>
                  ))}
                  {pending?.asset === a.id && <span className="pin new" style={{ left: `${pending.x}%`, top: `${pending.y}%` }}>+</span>}
                </figure>
              );
            })}
          </div>
        ) : (
          <p className="cap">This board has no images yet.</p>
        )}

        <div className="share-text">
          <textarea
            className="inline-input fr share-tag"
            aria-label="Tagline"
            placeholder="Say what this is, in a line."
            rows={2}
            value={share.tagline ?? ""}
            onChange={(e) => updateShare(board.id, { tagline: e.target.value })}
          />
          <div className="share-summary">
            <textarea
              className="inline-input"
              aria-label="Summary"
              placeholder="A short note to whoever opens this."
              rows={4}
              value={share.summary ?? ""}
              onChange={(e) => updateShare(board.id, { summary: e.target.value })}
            />
            {palette.length > 0 && (
              <div className="share-pal">
                {palette.map((hex) => (
                  <span key={hex} style={{ background: hex }} />
                ))}
                <span className="cap">palette</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <aside className="comments no-print" aria-label="Comments">
        <div className="comments-head">
          <span className="fr">Comments</span>
          <span className="cap">{roots.length} open</span>
        </div>
        <div className="comments-list">
          {roots.map((c, i) => (
            <article className="cm" key={c.id}>
              <div className="cm-head">
                <span className="pin static">{i + 1}</span>
                <Avatar name={c.author.replace(/[[\]]/g, "")} size={30} />
                <span className="cm-who">
                  <b>{c.author}</b>
                  <span className="cap">{ago(c.created_at)}</span>
                </span>
                <button type="button" className="cm-x" aria-label="Delete comment" onClick={() => deleteComment(c.id)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
              <p><MathText text={c.text} /></p>
              {comments
                .filter((r) => r.parent_id === c.id)
                .map((r) => (
                  <div className="cm-reply" key={r.id}>
                    <Avatar name={r.author.replace(/[[\]]/g, "")} size={26} />
                    <span>
                      <b>{r.author}</b> <span className="cap">{ago(r.created_at)}</span>
                      <p><MathText text={r.text} /></p>
                    </span>
                  </div>
                ))}
              <button type="button" className="link-btn cm-reply-btn" onClick={() => setReplyTo(c.id)}>
                Reply
              </button>
            </article>
          ))}
        </div>
        <label className="cm-compose">
          <span className="cap">
            {replyTo ? "replying" : pending ? "comment pinned to the image" : "add a comment"}
            {replyTo && (
              <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            )}
          </span>
          <textarea
            className="field"
            rows={3}
            placeholder="Write a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="cm-actions">
          {!replyTo && (
            <Pill className={pinning ? "armed" : ""} aria-pressed={pinning} onClick={() => setPinning((p) => !p)} disabled={!images.length}>
              {pinning ? "Click an image…" : "Pin to image"}
            </Pill>
          )}
          <Pill ink disabled={!text.trim()} onClick={submit}>
            <Icon name="comment" size={16} />
            Comment
          </Pill>
        </div>
        {credited.length > 0 && (
          <details className="credits">
            <summary>Image credits · {credited.length}</summary>
            <ul>
              {credited.map((a) => (
                <li key={a.id} className="cap">
                  {a.title} © {a.credit}
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
    </div>
  );
}
