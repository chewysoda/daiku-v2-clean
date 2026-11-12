import { useEffect, useRef } from "react";
import { useStore } from "../data/store";
import { applyAccent, applyFonts, applyTheme, dimFrom, parseCustomFonts } from "../lib/appearance";
import { backdropUrl } from "../lib/looks";
import { isTauri, localFileUrl, native } from "../lib/platform";

const loaded = new Set<string>();

/** Makes an imported font available to the page. False if the file can't be read as a font. */
export async function loadFont(family: string, path: string): Promise<boolean> {
  if (loaded.has(path)) return true;
  try {
    // A wide weight range means one file serves all the app's weights, without faked bold.
    const face = new FontFace(family, `url("${localFileUrl(path)}")`, { weight: "100 900" });
    await face.load();
    document.fonts.add(face);
    loaded.add(path);
    return true;
  } catch (e) {
    console.warn(`Font ${family} failed to load:`, e);
    return false;
  }
}

/** Keeps <html> in step with the saved theme, fonts and background. */
export function useAppearance() {
  const theme = useStore((s) => s.config.theme);
  const customFonts = useStore((s) => s.config.custom_fonts);
  const ui = useStore((s) => s.config.font_ui);
  const display = useStore((s) => s.config.font_display);
  const mono = useStore((s) => s.config.font_mono);
  const backdrop = useStore((s) => s.config.backdrop_path);
  const dim = useStore((s) => s.config.backdrop_dim);

  const accent = useStore((s) => s.config.accent);
  const scale = useStore((s) => s.config.ui_scale);
  const motion = useStore((s) => s.config.motion);
  const transparency = useStore((s) => s.config.transparency);

  useEffect(() => {
    applyTheme(theme);
    applyAccent(accent);
  }, [theme, accent]);

  useEffect(() => {
    if (motion === "off") document.documentElement.dataset.motion = "off";
    else delete document.documentElement.dataset.motion;
  }, [motion]);

  // Glass goes solid when asked, or when the system asks for less transparency.
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia?.("(prefers-reduced-transparency: reduce)");
    const apply = () => {
      if (transparency === "reduced" || query?.matches) root.dataset.glass = "solid";
      else delete root.dataset.glass;
    };
    apply();
    query?.addEventListener?.("change", apply);
    return () => query?.removeEventListener?.("change", apply);
  }, [transparency]);

  // Mica sits behind the page only when the window could turn it on; otherwise the page stays solid.
  useEffect(() => {
    if (!isTauri) return;
    void native
      .windowMaterial()
      .then((m) => {
        if (m === "mica") document.documentElement.dataset.mica = "on";
      })
      .catch(() => undefined);
  }, []);

  // The webview's own zoom, as the browser pane's position is worked out from devicePixelRatio.
  useEffect(() => {
    if (!isTauri) return;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .setZoom(Number(scale) || 1)
        .catch((e) => console.warn("Couldn't set the interface size:", e)),
    );
  }, [scale]);

  useEffect(() => {
    let stale = false;
    void Promise.all(parseCustomFonts(customFonts).map((f) => loadFont(f.family, f.path))).then(() => {
      // Applied after loading, so text doesn't flash in a fallback font first.
      if (!stale) applyFonts({ ui, display, mono });
    });
    return () => {
      stale = true;
    };
  }, [customFonts, ui, display, mono]);

  useEffect(() => {
    const root = document.documentElement;
    if (backdrop) root.dataset.backdrop = "on";
    else delete root.dataset.backdrop;
    root.style.setProperty("--backdrop-dim", String(dimFrom(dim) / 100));
  }, [backdrop, dim]);
}

/** The chosen background image or video. A file that's gone or unplayable just leaves the plain theme. */
export function Backdrop() {
  const path = useStore((s) => s.config.backdrop_path);
  const kind = useStore((s) => s.config.backdrop_kind);
  const paused = useStore((s) => s.config.backdrop_paused === "1");
  const motionOff = useStore((s) => s.config.motion === "off");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // A background video is something the person chose, so the system's reduce-motion setting
    // doesn't stop it (Windows turns that on with "Animation effects" off, often for speed).
    // It stops for the app's own pause and motion settings, and while the window can't be seen.
    const sync = () => {
      if (paused || motionOff || document.hidden) el.pause();
      else void el.play().catch(() => undefined);
    };
    sync();
    el.addEventListener("loadeddata", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      el.removeEventListener("loadeddata", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, motionOff, path, kind]);

  if (!path) return null;
  const clear = () => {
    delete document.documentElement.dataset.backdrop;
  };
  return (
    <div className="backdrop" aria-hidden="true" data-testid="backdrop">
      {kind === "video" ? (
        <video key={path} ref={video} src={backdropUrl(path)} muted loop playsInline autoPlay={!paused && !motionOff} onError={clear} />
      ) : (
        <img key={path} src={backdropUrl(path)} alt="" onError={clear} />
      )}
    </div>
  );
}
