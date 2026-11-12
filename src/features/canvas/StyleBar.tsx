import { useState } from "react";
import { BoardItem, ItemData } from "../../data/types";
import { Popover } from "../../design/primitives";
import { CustomFont } from "../../lib/appearance";
import { AlignMode, BUILT_IN_FONTS, nextSize, NOTE_COLORS, PictureSticker, SHAPES, TEXT_COLORS } from "./itemStyle";

const ALIGN_ORDER: NonNullable<ItemData["align"]>[] = ["left", "center", "right"];
const ALIGN_GLYPH = { left: "⇤", center: "↔", right: "⇥" };

/** Styling for the selected sticky note, sticker or text box. */
export function StyleBar({
  item,
  fonts,
  left,
  top,
  onData,
  onTilt,
  onDuplicate,
  onFront,
  onBack,
  onToggleLock,
  onDelete,
}: {
  item: BoardItem;
  fonts: CustomFont[];
  left: number;
  top: number;
  onData: (changes: Partial<ItemData>) => void;
  onTilt: (degrees: number) => void;
  onDuplicate: () => void;
  onFront: () => void;
  onBack: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  const d = item.data;
  const isText = item.kind === "text";
  const isEmoji = !!d.emoji;
  const colors = isText ? TEXT_COLORS : NOTE_COLORS;
  const align = d.align ?? "left";
  const shape = SHAPES.find((s) => s.id === (d.shape ?? "note")) ?? SHAPES[0];

  return (
    <div className="ctx-bar style-bar" role="toolbar" aria-label={`Style ${item.kind}`} data-ui style={{ left, top }}>
      {!isEmoji && (
        <>
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className={`ctx-swatch ${d.color?.toLowerCase() === c.toLowerCase() ? "on" : ""}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={d.color?.toLowerCase() === c.toLowerCase()}
              onClick={() => onData({ color: c })}
            />
          ))}
          <label className="ctx-swatch ctx-custom" title="Any colour">
            <input type="color" aria-label="Custom colour" value={d.color ?? "#E9D9A2"} onChange={(e) => onData({ color: e.target.value })} />
          </label>
          <span className="ctx-sep" />
          <select className="ctx-select" aria-label="Font" value={d.font ?? ""} onChange={(e) => onData({ font: e.target.value || undefined })}>
            <option value="">Default font</option>
            {BUILT_IN_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
            {fonts.map((f) => (
              <option key={f.path} value={f.family}>
                {f.family}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="button" className="ctx" aria-label="Smaller" title="Smaller" disabled={d.textSize === "s"} onClick={() => onData({ textSize: nextSize(d.textSize, -1) })}>
        A−
      </button>
      <button type="button" className="ctx" aria-label="Larger" title="Larger" disabled={d.textSize === "xl"} onClick={() => onData({ textSize: nextSize(d.textSize, 1) })}>
        A+
      </button>
      {item.kind !== "sticker" && (
        <button
          type="button"
          className="ctx"
          aria-label={`Text aligned ${align}. Change alignment`}
          title="Text alignment"
          onClick={() => onData({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(align) + 1) % ALIGN_ORDER.length] })}
        >
          {ALIGN_GLYPH[align]}
        </button>
      )}
      {item.kind === "sticky" && (
        <button
          type="button"
          className="ctx"
          aria-label={`Shape ${shape.label}. Change shape`}
          title="Shape"
          onClick={() => onData({ shape: SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length].id })}
        >
          {shape.label}
        </button>
      )}
      <label className="ctx-tilt" title="Tilt">
        <span aria-hidden="true">∠</span>
        <input type="range" min={-20} max={20} step={1} aria-label="Tilt" value={item.rotation} onChange={(e) => onTilt(Number(e.target.value))} />
      </label>
      <div className="ctx-anchor">
        <button type="button" className="ctx" aria-label="More" onClick={() => setMore((m) => !m)}>
          ⋯
        </button>
        {more && (
          <Popover className="more-pop" onClose={() => setMore(false)}>
            <button type="button" className="palette-row" onClick={onDuplicate}>
              Duplicate <span className="cap">Ctrl D</span>
            </button>
            <button type="button" className="palette-row" onClick={onFront}>
              Bring to front <span className="cap">]</span>
            </button>
            <button type="button" className="palette-row" onClick={onBack}>
              Send to back <span className="cap">[</span>
            </button>
            <button type="button" className="palette-row" onClick={onToggleLock}>
              {d.locked ? "Unlock" : "Lock"} <span className="cap">L</span>
            </button>
            <button type="button" className="palette-row" onClick={onDelete}>
              Delete <span className="cap">Del</span>
            </button>
          </Popover>
        )}
      </div>
    </div>
  );
}

const ALIGN_BUTTONS: { mode: AlignMode; label: string; glyph: string }[] = [
  { mode: "left", label: "Align left edges", glyph: "⇤" },
  { mode: "center", label: "Align centres", glyph: "↔" },
  { mode: "right", label: "Align right edges", glyph: "⇥" },
  { mode: "top", label: "Align top edges", glyph: "⤒" },
  { mode: "middle", label: "Align middles", glyph: "↕" },
  { mode: "bottom", label: "Align bottom edges", glyph: "⤓" },
  { mode: "spread-x", label: "Space evenly across", glyph: "⋯" },
  { mode: "spread-y", label: "Space evenly down", glyph: "⋮" },
];

/** Lining up several selected items. */
export function AlignBar({ left, top, onAlign, onToText, onToLatex }: { left: number; top: number; onAlign: (mode: AlignMode) => void; onToText?: () => void; onToLatex?: () => void }) {
  return (
    <div className="ctx-bar" role="toolbar" aria-label="Align selection" data-ui style={{ left, top }}>
      {ALIGN_BUTTONS.map((b) => (
        <button key={b.mode} type="button" className="ctx" aria-label={b.label} title={b.label} onClick={() => onAlign(b.mode)}>
          {b.glyph}
        </button>
      ))}
      {onToText && (
        <>
          <span className="ctx-sep" />
          <button type="button" className="ctx" title="Turn this handwriting into typed text" onClick={onToText}>
            To text
          </button>
          {onToLatex && (
            <button type="button" className="ctx" title="Read this handwritten math as a LaTeX formula" onClick={onToLatex}>
              To LaTeX
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Every sticker on offer, plus any you've made. */
export function StickerPicker({
  labels,
  emoji,
  custom,
  pictures,
  onPick,
  onPickPicture,
  onUpload,
  onForgetPicture,
  onCreate,
  onForget,
}: {
  labels: string[];
  emoji: string[];
  custom: string[];
  pictures: PictureSticker[];
  onPickPicture: (sticker: PictureSticker) => void;
  onUpload: (files: File[]) => void;
  onForgetPicture: (id: string) => void;
  onPick: (text: string, isEmoji: boolean) => void;
  onCreate: (text: string) => void;
  onForget: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <>
      <form
        className="sticker-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onCreate(text.trim());
        }}
      >
        <input className="field" autoFocus maxLength={40} aria-label="New sticker text" placeholder="Make your own…" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
      <label className="pill small sticker-upload">
        Upload SVG or PNG
        <input
          type="file"
          className="sr-only"
          accept=".svg,.png,image/svg+xml,image/png"
          multiple
          aria-label="Upload sticker pictures"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) onUpload(files);
          }}
        />
      </label>
      {pictures.length > 0 && (
        <div className="sticker-pictures">
          {pictures.map((s) => (
            <span className="sticker-picture" key={s.id}>
              <button type="button" aria-label={`Picture sticker ${s.name}`} title={s.name} onClick={() => onPickPicture(s)}>
                <img src={s.src} alt="" draggable={false} />
              </button>
              <button type="button" className="sticker-picture-x" aria-label={`Forget picture sticker ${s.name}`} onClick={() => onForgetPicture(s.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {custom.length > 0 && <span className="cap sticker-head">yours</span>}
      {custom.map((s) => (
        <div className="sticker-mine" key={s}>
          <button type="button" className="palette-row" onClick={() => onPick(s, false)}>
            {s}
          </button>
          <button type="button" className="cm-x" aria-label={`Forget sticker ${s}`} onClick={() => onForget(s)}>
            ×
          </button>
        </div>
      ))}
      <span className="cap sticker-head">labels</span>
      {labels.map((s) => (
        <button key={s} type="button" className="palette-row" onClick={() => onPick(s, false)}>
          {s}
        </button>
      ))}
      <span className="cap sticker-head">emoji</span>
      <div className="sticker-emoji">
        {emoji.map((s) => (
          <button key={s} type="button" aria-label={`Emoji ${s}`} onClick={() => onPick(s, true)}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}
