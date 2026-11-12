import { useEffect, useRef } from "react";
import type { Application, TilingSprite } from "pixi.js";
import { View } from "./geometry";

const SPACING = 26;

/**
 * The canvas background, drawn with PixiJS as one GPU-tiled sprite so it costs the same at any
 * zoom. If WebGL isn't available, the CSS dot pattern under it (see canvas.css) remains.
 */
export function DotGrid({ view }: { view: View }) {
  const host = useRef<HTMLDivElement>(null);
  const sprite = useRef<TilingSprite | null>(null);
  const latest = useRef(view);
  latest.current = view;

  const apply = (s: TilingSprite, v: View) => {
    // Below half zoom the dots would turn to noise, so the grid spacing doubles.
    const step = v.zoom < 0.5 ? 2 : 1;
    s.tileScale.set(v.zoom * step);
    s.tilePosition.set(v.x, v.y);
  };

  useEffect(() => {
    let app: Application | null = null;
    let disposed = false;
    const el = host.current;
    if (!el) return;
    void (async () => {
      try {
        // Pixi needs this under a strict Content-Security-Policy with no unsafe-eval.
        await import("pixi.js/unsafe-eval");
        const { Application, Graphics, TilingSprite } = await import("pixi.js");
        const instance = new Application();
        await instance.init({
          resizeTo: el,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preference: "webgl",
        });
        if (disposed) {
          instance.destroy(true);
          return;
        }
        app = instance;
        const dot = getComputedStyle(document.documentElement).getPropertyValue("--c-canvas-dot").trim() || "#DDD7CC";
        const cell = new Graphics().rect(0, 0, SPACING, SPACING).fill({ color: 0, alpha: 0 }).circle(SPACING / 2, SPACING / 2, 1).fill(dot);
        const texture = instance.renderer.generateTexture({ target: cell, resolution: 4 });
        const tiled = new TilingSprite({ texture, width: 16384, height: 16384 });
        instance.stage.addChild(tiled);
        sprite.current = tiled;
        apply(tiled, latest.current);
        el.appendChild(instance.canvas);
        el.dataset.ready = "true";
      } catch (e) {
        console.warn("Dot grid fell back to CSS:", e);
      }
    })();
    return () => {
      disposed = true;
      sprite.current = null;
      app?.destroy(true);
      if (el) delete el.dataset.ready;
    };
  }, []);

  useEffect(() => {
    if (sprite.current) apply(sprite.current, view);
    // CSS fallback follows the same view.
    host.current?.style.setProperty("--grid-x", `${view.x}px`);
    host.current?.style.setProperty("--grid-y", `${view.y}px`);
    host.current?.style.setProperty("--grid-size", `${SPACING * view.zoom}px`);
  }, [view]);

  return <div ref={host} className="dot-grid" aria-hidden="true" />;
}
