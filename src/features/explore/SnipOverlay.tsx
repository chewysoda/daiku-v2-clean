import { useEffect, useRef, useState } from "react";
import { Box, boxFromDrag, isRealSnip, toImagePixels } from "../../lib/snip";

/**
 * Drag a box over a frozen picture of the page. The native pane can't have anything drawn over it
 * and the page mustn't be involved, so this runs on a screenshot, in the app's own view. That's
 * also why it works on PDFs, video frames and canvases, which can't be saved any other way.
 */
export function SnipOverlay({
  src,
  hint,
  onReady,
  onCancel,
  onSnip,
}: {
  src: string;
  hint: string;
  /** The picture is on screen, so the live pane can step aside without a flash. */
  onReady: () => void;
  onCancel: () => void;
  /** The chosen area, in the screenshot's own pixels. */
  onSnip: (box: Box) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    root.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);

  const at = (e: React.PointerEvent) => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      ref={root}
      className="snip"
      data-testid="snip-overlay"
      tabIndex={-1}
      role="application"
      aria-label="Snip. Drag around what you want to keep. Press Escape to cancel."
      onContextMenu={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = at(e);
        setBox(null);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const { clientWidth: w, clientHeight: h } = root.current!;
        setBox(boxFromDrag(start.current, at(e), w, h));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const { clientWidth: w, clientHeight: h } = root.current!;
        const finished = boxFromDrag(start.current, at(e), w, h);
        start.current = null;
        const img = image.current!;
        if (isRealSnip(finished)) onSnip(toImagePixels(finished, w, h, img.naturalWidth, img.naturalHeight));
        else setBox(null);
      }}
    >
      <img ref={image} src={src} alt="" draggable={false} onLoad={onReady} />
      {box ? (
        <div className="snip-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      ) : (
        <div className="snip-shade" />
      )}
      {!box && <span className="snip-hint">{hint}</span>}
    </div>
  );
}
