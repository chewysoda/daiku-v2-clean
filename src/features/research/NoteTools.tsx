import { RefObject, useEffect, useRef, useState } from "react";
import { MathText } from "../../design/MathText";
import { Pill } from "../../design/primitives";
import { Edit, formulaBlock, formulaEdit, LATEX_SNIPPETS, padStrokesToItems, snippetEdit } from "../../lib/noteEdit";
import { readTextFromBlob } from "../../lib/ocr";
import { isTauri } from "../../lib/platform";
import { readHandwriting } from "../canvas/handwriting";

type P = [number, number];
export type Capture = { kind: "picture"; picture: Blob } | { kind: "pen" };

/**
 * Changes the note through the browser's own editing, so Ctrl Z takes back an insert like any typing.
 * The fallback covers a webview without that command, and costs only the undo.
 */
export function applyEdit(box: HTMLTextAreaElement, make: (body: string, start: number, end: number) => Edit, fallback: (body: string) => void) {
  const start = box.selectionStart;
  const end = box.selectionEnd;
  const edit = make(box.value, start, end);
  box.focus();
  box.setSelectionRange(start, end);
  if (!document.execCommand("insertText", false, edit.text)) fallback(box.value.slice(0, start) + edit.text + box.value.slice(end));
  requestAnimationFrame(() => box.setSelectionRange(start + edit.from, start + edit.to));
}

export function NoteToolbar({ box, onBody, onCapture }: { box: RefObject<HTMLTextAreaElement | null>; onBody: (body: string) => void; onCapture: (c: Capture) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const apply = (make: (body: string, start: number, end: number) => Edit) => {
    if (box.current) applyEdit(box.current, make, onBody);
  };
  return (
    <div className="note-tools" role="toolbar" aria-label="Note tools">
      <Pill className="small" title="Wraps what's selected. Writes as $...$" onClick={() => apply((b, s, e) => formulaEdit(b.slice(s, e), false))}>
        Formula
      </Pill>
      <Pill className="small" title="A formula on its own line. Writes as $$...$$" onClick={() => apply((b, s, e) => formulaEdit(b.slice(s, e), true))}>
        Block formula
      </Pill>
      <select
        className="field note-snippet"
        aria-label="Insert LaTeX"
        value=""
        onChange={(e) => {
          const tex = e.target.value;
          if (tex) apply((b, s) => snippetEdit(b, s, tex));
        }}
      >
        <option value="">Insert LaTeX…</option>
        {LATEX_SNIPPETS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((i) => (
              <option key={i.label} value={i.tex}>
                {i.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="note-tools-gap" />
      <Pill className="small" title="Reads text or a formula from a picture. You can also paste or drop one into the note" onClick={() => file.current?.click()}>
        Read a picture
      </Pill>
      <Pill className="small" title="Write with a pen or mouse, and it's read into the note" onClick={() => onCapture({ kind: "pen" })}>
        Write by hand
      </Pill>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose a picture to read"
        onChange={(e) => {
          const picture = e.target.files?.[0];
          e.target.value = "";
          if (picture) onCapture({ kind: "picture", picture });
        }}
      />
    </div>
  );
}

/** The first picture in a paste or drop, if there is one. */
export const pictureIn = (data: DataTransfer | null): File | null => [...(data?.files ?? [])].find((f) => f.type.startsWith("image/")) ?? null;

const PAD = { w: 640, h: 220 };

function paintPad(canvas: HTMLCanvasElement | null, all: P[][]) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const ratio = canvas.width / PAD.w;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, PAD.w, PAD.h);
  ctx.strokeStyle = "#1e1f1c";
  ctx.fillStyle = "#1e1f1c";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of all) {
    ctx.beginPath();
    if (s.length === 1) {
      ctx.arc(s[0][0], s[0][1], 1.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}

function WritingPad({ strokes, onChange }: { strokes: P[][]; onChange: (s: P[][]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<P[] | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = PAD.w * (window.devicePixelRatio || 1);
    c.height = PAD.h * (window.devicePixelRatio || 1);
    paintPad(c, strokes);
  }, [strokes]);

  const at = (e: { clientX: number; clientY: number }): P => {
    const box = canvas.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - box.left) / box.width) * PAD.w * 10) / 10, Math.round(((e.clientY - box.top) / box.height) * PAD.h * 10) / 10];
  };
  return (
    <canvas
      ref={canvas}
      className="write-pad"
      data-testid="write-pad"
      role="img"
      aria-label="Writing pad. Write here with a pen or mouse."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = [at(e)];
        paintPad(canvas.current, [...strokes, drawing.current]);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        // A pen reports more points than one frame shows, and the recogniser reads better with all of them.
        const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const point of coalesced.length ? coalesced : [e.nativeEvent]) drawing.current.push(at(point));
        paintPad(canvas.current, [...strokes, drawing.current]);
      }}
      onPointerUp={() => {
        if (drawing.current) onChange([...strokes, drawing.current]);
        drawing.current = null;
      }}
      onPointerCancel={() => {
        drawing.current = null;
        paintPad(canvas.current, strokes);
      }}
    />
  );
}

async function pictureToSheet(picture: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(picture);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const sheet = document.createElement("canvas");
    sheet.width = Math.max(1, image.naturalWidth);
    sheet.height = Math.max(1, image.naturalHeight);
    const ctx = sheet.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.drawImage(image, 0, 0);
    return sheet;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reading is often wrong, so nothing reaches the note until a person has seen it and can fix it.
 * The picture isn't kept: notes hold text only.
 */
export function CaptureDialog({ capture, onInsert, onClose }: { capture: Capture; onInsert: (block: string) => void; onClose: () => void }) {
  const [strokes, setStrokes] = useState<P[][]>([]);
  const [reading, setReading] = useState<"text" | "formula" | null>(null);
  const [mode, setMode] = useState<"text" | "formula" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const job = useRef(0);
  useEffect(() => {
    if (capture.kind !== "picture") return;
    const url = URL.createObjectURL(capture.picture);
    setPictureUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capture]);
  const pen = capture.kind === "pen";
  const nothing = pen && !strokes.length;

  const read = async (as: "text" | "formula") => {
    const mine = ++job.current;
    setReading(as);
    setError(null);
    try {
      const items = padStrokesToItems(strokes, PAD.w, PAD.h) as never;
      let found: string;
      if (as === "text") {
        if (!isTauri) throw new Error("Reading text needs the desktop app, as it uses the recogniser built into Windows.");
        found = capture.kind === "pen" ? await readHandwriting(items) : await readTextFromBlob(capture.picture);
      } else {
        const { readMathHandwriting, readMathPicture } = await import("../canvas/handwritingMath");
        found = capture.kind === "pen" ? await readMathHandwriting(items) : await readMathPicture(await pictureToSheet(capture.picture));
      }
      if (mine !== job.current) return;
      setMode(as);
      setResult(found.trim());
      if (!found.trim()) setError(as === "text" ? "No text found. Try a sharper picture, or write a little larger." : "Couldn't make out a formula. Try writing a little larger.");
    } catch (e) {
      if (mine === job.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === job.current) setReading(null);
    }
  };

  const insert = () => {
    if (!result.trim() || !mode) return;
    onInsert(mode === "formula" ? formulaBlock(result) : result.trim());
  };

  const close = () => {
    job.current++;
    onClose();
  };
  // On the window, as nothing in the dialog has focus until something's clicked.
  const closing = useRef(close);
  useEffect(() => {
    closing.current = close;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && closing.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog capture-dialog" role="dialog" aria-label={pen ? "Write by hand" : "Read a picture"}>
        <h2 className="fr dialog-title">{pen ? "Write by hand" : "Read a picture"}</h2>
        {pen ? (
          <>
            <WritingPad strokes={strokes} onChange={setStrokes} />
            <div className="eng-actions">
              <button type="button" className="link-btn" disabled={nothing} onClick={() => setStrokes(strokes.slice(0, -1))}>
                Undo stroke
              </button>
              <button type="button" className="link-btn" disabled={nothing} onClick={() => setStrokes([])}>
                Clear
              </button>
            </div>
          </>
        ) : (
          pictureUrl && <img className="capture-picture" src={pictureUrl} alt="The picture to read" />
        )}
        <div className="eng-actions">
          <Pill autoFocus={!pen} disabled={nothing || !!reading} onClick={() => void read("text")}>
            {reading === "text" ? "Reading…" : "Read as text"}
          </Pill>
          <Pill disabled={nothing || !!reading} onClick={() => void read("formula")}>
            {reading === "formula" ? "Reading… the first time takes a moment" : "Read as LaTeX"}
          </Pill>
        </div>
        {error && (
          <p role="alert" className="fail-text">
            {error}
          </p>
        )}
        {mode && (
          <label className="lbl">
            <span className="cap">{mode === "formula" ? "LaTeX" : "Text"}. Check it, as reading isn't always right</span>
            <textarea className="field" rows={mode === "formula" ? 2 : 5} aria-label="What was read" value={result} onChange={(e) => setResult(e.target.value)} />
          </label>
        )}
        {mode === "formula" && result.trim() && (
          <div className="capture-preview" data-testid="capture-preview">
            <MathText text={formulaBlock(result).replace(/\n/g, " ")} />
          </div>
        )}
        <div className="dialog-actions">
          <Pill onClick={close}>Cancel</Pill>
          <Pill ink disabled={!result.trim() || !mode} onClick={insert}>
            Insert in note
          </Pill>
        </div>
      </div>
    </div>
  );
}
