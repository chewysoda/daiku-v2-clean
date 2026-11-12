import { useRef, useState } from "react";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, PromptDialog, toast } from "../../design/primitives";
import { backdropKindOf } from "../../lib/appearance";
import { paletteFromImage, paletteFromVideo } from "../../lib/color";
import { backdropPoster, backdropUrl, isFileInUse, Look, looksFromImage, parseLooks, SUGGESTED_LOOKS, themeBackground } from "../../lib/looks";

function LookCard({ look, on, onClick, onRemove }: { look: Look; on: boolean; onClick: () => void; onRemove?: () => void }) {
  const url = backdropUrl(look.backdrop);
  const poster = backdropPoster(look.backdrop);
  const video = useRef<HTMLVideoElement>(null);
  const fade = { opacity: Math.max(0.25, 1 - look.dim / 100) };
  // A video tile shows its still, and plays only while pointed at.
  const preview = (play: boolean) => {
    const el = video.current;
    if (!el) return;
    if (play) void el.play().catch(() => undefined);
    else el.pause();
  };
  return (
    <div className={`look ${on ? "on" : ""}`}>
      <button
        type="button"
        className="look-card"
        aria-pressed={on}
        aria-label={`Use the ${look.name} look${look.kind === "video" ? ", a moving background" : ""}`}
        style={{ background: themeBackground(look.theme) }}
        onClick={onClick}
        onPointerEnter={() => preview(true)}
        onPointerLeave={() => preview(false)}
        onFocus={() => preview(true)}
        onBlur={() => preview(false)}
      >
        {look.kind === "video" ? (
          url ? (
            // Your own video has no stored still, so the tile loads just enough to show a frame from it.
            <video ref={video} src={poster ? url : `${url}#t=1`} poster={poster || undefined} muted loop playsInline preload={poster ? "none" : "metadata"} style={fade} />
          ) : null
        ) : url ? (
          <img src={url} alt="" style={fade} draggable={false} />
        ) : null}
        {look.kind === "video" && (
          <span className="look-kind" aria-hidden="true">
            <Icon name="play" size={10} fill />
            Video
          </span>
        )}
        <span className="look-dots" aria-hidden="true">
          {look.accent && <i style={{ background: look.accent }} />}
        </span>
      </button>
      <span className="look-name">
        <span>{look.name}</span>
        {onRemove && (
          <button type="button" className="link-btn" aria-label={`Forget the ${look.name} look`} onClick={onRemove}>
            Forget
          </button>
        )}
      </span>
    </div>
  );
}

/** Ready-made looks, ones made from your own image, and any you've saved. */
export function ThemeGallery({
  pickMedia,
  removeFile,
}: {
  /** Asks for an image or video, and copies it into place. */
  pickMedia: () => Promise<{ path: string; name: string } | null>;
  removeFile: (path: string) => void;
}) {
  const config = useStore((s) => s.config);
  const setSetting = useStore((s) => s.setSetting);
  const saved = parseLooks(config.saved_looks);
  const [fromImage, setFromImage] = useState<Look[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);

  const isCurrent = (l: Look) => l.theme === config.theme && l.accent === config.accent && l.backdrop === config.backdrop_path;

  /** Lets go of the current background's file, unless something still needs it. */
  const release = (old: string, next: string, looks = saved) => {
    const pending = fromImage?.[0]?.backdrop;
    if (old && !old.startsWith("builtin:") && old !== next && old !== pending && !isFileInUse(old, looks, next)) removeFile(old);
  };

  const apply = (l: Look) => {
    release(config.backdrop_path, l.backdrop);
    setSetting("theme", l.theme);
    setSetting("accent", l.accent);
    setSetting("backdrop_path", l.backdrop);
    setSetting("backdrop_kind", l.kind);
    setSetting("backdrop_dim", String(l.dim));
    if (l.fonts) {
      setSetting("font_ui", l.fonts.ui);
      setSetting("font_display", l.fonts.display);
      setSetting("font_mono", l.fonts.mono);
    }
  };

  const startFromImage = async () => {
    setBusy(true);
    try {
      const file = await pickMedia();
      if (!file) return;
      const kind = backdropKindOf(file.name) === "video" ? "video" : "image";
      const url = backdropUrl(file.path);
      const palette = kind === "video" ? await paletteFromVideo(url) : await paletteFromImage(url);
      // Replacing an earlier set of suggestions that was never used.
      const earlier = fromImage?.[0]?.backdrop;
      if (earlier && earlier !== config.backdrop_path && !isFileInUse(earlier, saved, config.backdrop_path)) removeFile(earlier);
      setFromImage(looksFromImage(file.path, palette, kind));
    } catch (e) {
      toast(`Couldn't use that file: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="set-group looks" aria-label="Looks">
      <div className="set-row">
        <span>
          <b>Suggested themes</b>
          <span className="cap">A theme, accent colour and background together. All of them work offline, and you can still change any part afterwards.</span>
        </span>
        <span className="set-actions">
          <Pill onClick={() => setNaming(true)}>Save this look…</Pill>
          <Pill ink disabled={busy} onClick={() => void startFromImage()}>
            {busy ? "Reading colours…" : "Use my image or video…"}
          </Pill>
        </span>
      </div>

      {fromImage && (
        <>
          <span className="cap looks-head">from your {fromImage[0]?.kind === "video" ? "video" : "image"} · the accent comes from its own colours</span>
          <div className="look-grid" role="group" aria-label={`Looks from your ${fromImage[0]?.kind === "video" ? "video" : "image"}`}>
            {fromImage.map((l) => (
              <LookCard key={l.id} look={l} on={isCurrent(l)} onClick={() => apply(l)} />
            ))}
          </div>
        </>
      )}
      {saved.length > 0 && (
        <>
          <span className="cap looks-head">yours</span>
          <div className="look-grid" role="group" aria-label="Your saved looks">
            {saved.map((l) => (
              <LookCard
                key={l.id}
                look={l}
                on={isCurrent(l)}
                onClick={() => apply(l)}
                onRemove={() => {
                  const rest = saved.filter((x) => x.id !== l.id);
                  setSetting("saved_looks", JSON.stringify(rest));
                  if (l.backdrop && !l.backdrop.startsWith("builtin:") && !isFileInUse(l.backdrop, rest, config.backdrop_path)) removeFile(l.backdrop);
                }}
              />
            ))}
          </div>
        </>
      )}
      <span className="cap looks-head">suggested</span>
      <div className="look-grid" role="group" aria-label="Suggested looks">
        {SUGGESTED_LOOKS.map((l) => (
          <LookCard key={l.id} look={l} on={isCurrent(l)} onClick={() => apply(l)} />
        ))}
      </div>

      {naming && (
        <PromptDialog
          title="Save this look"
          placeholder="Name it"
          action="Save"
          onClose={() => setNaming(false)}
          onSubmit={(name) => {
            const look: Look = {
              id: `${Date.now()}`,
              name,
              theme: config.theme as Look["theme"],
              accent: config.accent,
              backdrop: config.backdrop_path,
              kind: config.backdrop_kind as Look["kind"],
              dim: Number(config.backdrop_dim) || 70,
              fonts: { ui: config.font_ui, display: config.font_display, mono: config.font_mono },
            };
            setSetting("saved_looks", JSON.stringify([look, ...saved].slice(0, 24)));
            setNaming(false);
            toast(`Saved ${name}.`);
          }}
        />
      )}
    </section>
  );
}
