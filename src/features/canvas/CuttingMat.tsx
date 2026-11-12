import { useEffect, useRef } from "react";
import { MatColors } from "../../lib/appearance";
import { View } from "./geometry";
import { angleLine, gridLines, rulerLabel, stepFor } from "./matGrid";

const RULER = 22;
const ANGLES = [30, 45, 60, 120, 135, 150];

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, view: View, mat: MatColors, font: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = mat.canvas;
  ctx.fillRect(0, 0, w, h);

  const step = stepFor(view.zoom);
  const xs = gridLines(view.x, view.zoom, w, step);
  const ys = gridLines(view.y, view.zoom, h, step);
  const stroke = (alpha: number, width: number, path: () => void) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    path();
    ctx.stroke();
  };
  ctx.strokeStyle = mat.line;

  // Half-pixel positions keep one-pixel lines crisp rather than smeared over two.
  const vertical = (x: number) => {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  };
  const horizontal = (y: number) => {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  };
  stroke(0.14, 1, () => {
    for (const l of xs) if (!l.major) vertical(l.at);
    for (const l of ys) if (!l.major) horizontal(l.at);
  });
  stroke(0.34, 1, () => {
    for (const l of xs) if (l.major) vertical(l.at);
    for (const l of ys) if (l.major) horizontal(l.at);
  });

  // The angle guides printed on a real mat, fixed to the middle of the board.
  const reach = (w + h) * 2 + Math.hypot(view.x, view.y);
  stroke(0.16, 1, () => {
    for (const a of ANGLES) {
      const l = angleLine(view.x, view.y, a, reach);
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
    }
  });

  // Rulers along the top and left edges.
  ctx.globalAlpha = 1;
  ctx.fillStyle = mat.bg;
  ctx.fillRect(0, 0, w, RULER);
  ctx.fillRect(0, 0, RULER, h);
  ctx.font = `10px ${font}`;
  ctx.fillStyle = mat.line;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  stroke(0.7, 1, () => {
    for (const l of xs) {
      if (l.at < RULER) continue;
      const x = Math.round(l.at) + 0.5;
      ctx.moveTo(x, RULER);
      ctx.lineTo(x, RULER - (l.major ? 10 : 4));
    }
    for (const l of ys) {
      if (l.at < RULER) continue;
      const y = Math.round(l.at) + 0.5;
      ctx.moveTo(RULER, y);
      ctx.lineTo(RULER - (l.major ? 10 : 4), y);
    }
  });
  ctx.globalAlpha = 1;
  for (const l of xs) if (l.major && l.at >= RULER + 4) ctx.fillText(rulerLabel(l.index, step), l.at + 3, 2);
  for (const l of ys) {
    if (!l.major || l.at < RULER + 4) continue;
    ctx.save();
    ctx.translate(2, l.at + 3);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = "bottom";
    ctx.fillText(rulerLabel(l.index, step), 0, 0);
    ctx.restore();
  }
}

/** The canvas background under a cutting mat theme. Lines stay fixed to the board as it pans and zooms. */
export function CuttingMat({ view, mat }: { view: View; mat: MatColors }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ view, mat });
  latest.current = { view, mat };
  const frame = useRef(0);

  const schedule = useRef(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
      draw(ctx, w, h, latest.current.view, latest.current.mat, font);
    });
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => schedule.current());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  useEffect(() => schedule.current(), [view, mat]);

  return <canvas ref={ref} className="cutting-mat" data-testid="cutting-mat" aria-hidden="true" />;
}
