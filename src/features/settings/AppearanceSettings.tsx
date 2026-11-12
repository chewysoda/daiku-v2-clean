import { useRef, useState } from "react";
import { loadFont } from "../../app/Appearance";
import { useStore } from "../../data/store";
import { Pill, Swatch, toast } from "../../design/primitives";
import { ACCENTS, UI_SCALES, backdropKindOf, dimFrom, familyFromFile, FONT_EXTENSIONS, FONT_SLOTS, IMAGE_EXTENSIONS, parseCustomFonts, SYSTEM_FONTS, THEMES, VIDEO_EXTENSIONS } from "../../lib/appearance";
import { isFileInUse, parseLooks } from "../../lib/looks";
import { isTauri, native } from "../../lib/platform";
import { ThemeGallery } from "./ThemeGallery";

/** A file chosen and copied into place: the stored path, and its original name. */
type Picked = { path: string; name: string };

const removeStored = (path: string) => {
  if (isTauri && path && !path.startsWith("builtin:")) void native.appearanceRemove(path).catch((e) => console.warn("Could not delete", path, e));
};

export function AppearanceSettings() {
  const config = useStore((s) => s.config);
  const setSetting = useStore((s) => s.setSetting);
  const fonts = parseCustomFonts(config.custom_fonts);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const resolvePick = useRef<((file: File | null) => void) | null>(null);

  const pick = async (title: string, name: string, extensions: string[]): Promise<Picked | null> => {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const source = await open({ title, filters: [{ name, extensions }] });
      if (typeof source !== "string") return null;
      return { path: await native.appearanceImport(source), name: source };
    }
    // The browser preview has no app data folder, so a choice there lasts until the page reloads.
    const el = input.current!;
    el.accept = extensions.map((e) => `.${e}`).join(",");
    el.value = "";
    const file = await new Promise<File | null>((resolve) => {
      resolvePick.current = resolve;
      el.addEventListener("cancel", () => resolve(null), { once: true });
      el.click();
    });
    return file ? { path: URL.createObjectURL(file), name: file.name } : null;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  /** Imports a font and puts it straight to use in one slot. */
  const importFont = (slot: (typeof FONT_SLOTS)[number]) =>
    run(async () => {
      const file = await pick(`Choose a font: ${slot.label}`, "Fonts", FONT_EXTENSIONS);
      if (!file) return;
      const family = familyFromFile(file.name, fonts.map((f) => f.family));
      if (!(await loadFont(family, file.path))) {
        removeStored(file.path);
        toast("That file couldn't be read as a font.", "error");
        return;
      }
      setSetting("custom_fonts", JSON.stringify([...fonts, { family, path: file.path }]));
      setSetting(slot.key, family);
      toast(`${slot.label} is now ${family}.`);
    });

  const removeFont = (family: string, path: string) => {
    for (const { key } of FONT_SLOTS) if (config[key] === family) setSetting(key, "");
    setSetting("custom_fonts", JSON.stringify(fonts.filter((f) => f.path !== path)));
    removeStored(path);
  };

  const chooseBackdrop = () =>
    run(async () => {
      const file = await pick("Choose a background image or video", "Images and video", [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
      if (!file) return;
      const kind = backdropKindOf(file.name);
      if (!kind) {
        removeStored(file.path);
        toast("That file type can't be used as a background.", "error");
        return;
      }
      const old = config.backdrop_path;
      setSetting("backdrop_kind", kind);
      setSetting("backdrop_path", file.path);
      if (!isFileInUse(old, parseLooks(config.saved_looks), file.path)) removeStored(old);
    });

  const clearBackdrop = () => {
    if (!isFileInUse(config.backdrop_path, parseLooks(config.saved_looks), "")) removeStored(config.backdrop_path);
    setSetting("backdrop_path", "");
    setSetting("backdrop_kind", "");
  };

  return (
    <>
    <ThemeGallery pickMedia={() => pick("Choose an image or video to build a look from", "Images and video", [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])} removeFile={removeStored} />
    <section className="set-group" aria-label="Appearance">
      <input
        ref={input}
        type="file"
        hidden
        data-testid="appearance-file"
        onChange={(e) => resolvePick.current?.(e.target.files?.[0] ?? null)}
      />
      <label className="set-row">
        <span>
          <b>Theme</b>
          <span className="cap">Cutting mats print a grid across the app, with rulers and angle guides on the canvas.</span>
        </span>
        <select className="field" value={config.theme} onChange={(e) => setSetting("theme", e.target.value)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="set-row">
        <span>
          <b>Accent colour</b>
          <span className="cap">Highlights, links and active items. Adjusted if needed, so it shows up on your theme.</span>
        </span>
        <span className="set-actions">
          {ACCENTS.map((a) => (
            <Swatch key={a.label} size={26} color={a.hex || "#4E6450"} label={`Accent ${a.label}`} pressed={config.accent === a.hex} onClick={() => setSetting("accent", a.hex)} />
          ))}
          <input type="color" className="set-color" aria-label="Custom accent colour" value={config.accent || "#4E6450"} onChange={(e) => setSetting("accent", e.target.value)} />
        </span>
      </div>
      <label className="set-row">
        <span>
          <b>Interface size</b>
          <span className="cap">Ctrl + and Ctrl − change it from anywhere. Ctrl 0 resets it.</span>
        </span>
        <select className="field" value={UI_SCALES.includes(config.ui_scale) ? config.ui_scale : "1"} onChange={(e) => setSetting("ui_scale", e.target.value)}>
          {UI_SCALES.map((s) => (
            <option key={s} value={s}>
              {Math.round(Number(s) * 100)}%
            </option>
          ))}
        </select>
      </label>
      <label className="set-row">
        <span>
          <b>Animations</b>
          <span className="cap">Turning them off also stops the moving map on Threads.</span>
        </span>
        <select
          className="field"
          value={config.motion === "off" ? "off" : "on"}
          onChange={(e) => {
            setSetting("motion", e.target.value === "off" ? "off" : "");
            // Threads keeps its own remembered choice, which has to follow this one.
            try {
              localStorage.setItem("daiku.threads.motion", e.target.value === "off" ? "off" : "on");
            } catch {
              // Not remembered. Threads falls back to the system setting.
            }
          }}
        >
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label className="set-row">
        <span>
          <b>Reduce transparency</b>
          <span className="cap">Makes the sidebar, tray and menus solid. Easier to read, and lighter on older graphics.</span>
        </span>
        <select className="field" aria-label="Reduce transparency" value={config.transparency === "reduced" ? "on" : "off"} onChange={(e) => setSetting("transparency", e.target.value === "on" ? "reduced" : "")}>
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </label>
      <label className="set-row">
        <span>
          <b>Canvas grid</b>
          <span className="cap">Cutting mats always draw their own.</span>
        </span>
        <select className="field" value={config.canvas_grid || "dots"} onChange={(e) => setSetting("canvas_grid", e.target.value)}>
          <option value="dots">Dots</option>
          <option value="lines">Lines</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className="set-row">
        <span>
          <b>Snap to grid</b>
          <span className="cap">Items line up as you drag them. Press G on the canvas to toggle it, or hold Alt to ignore it.</span>
        </span>
        <input type="checkbox" className="set-check" checked={config.canvas_snap === "1"} onChange={(e) => setSetting("canvas_snap", e.target.checked ? "1" : "")} />
      </label>
      <label className="set-row">
        <span>
          <b>When Daiku opens</b>
          <span className="cap">Where to start.</span>
        </span>
        <select className="field" value={config.start_screen === "last" ? "last" : "home"} onChange={(e) => setSetting("start_screen", e.target.value)}>
          <option value="home">Home</option>
          <option value="last">The last screen I used</option>
        </select>
      </label>

      <div className="set-row">
        <span>
          <b>Background</b>
          <span className="cap">
            {config.backdrop_kind ? `Your ${config.backdrop_kind}, kept on this device.` : "An image or looping video behind the app: PNG, JPG, WebP, AVIF, GIF, MP4 or WebM."}
          </span>
        </span>
        <span className="set-actions">
          {config.backdrop_path && (
            <Pill className="small" onClick={clearBackdrop}>
              Remove
            </Pill>
          )}
          <Pill disabled={busy} onClick={() => void chooseBackdrop()}>
            {config.backdrop_path ? "Change…" : "Choose…"}
          </Pill>
        </span>
      </div>
      {config.backdrop_path && (
        <label className="set-row">
          <span>
            <b>Background dimming</b>
            <span className="cap">More dimming keeps text easier to read.</span>
          </span>
          <span className="set-range">
            <input type="range" min={30} max={95} step={5} aria-label="Background dimming" value={dimFrom(config.backdrop_dim)} onChange={(e) => setSetting("backdrop_dim", e.target.value)} />
            <span className="cap">{dimFrom(config.backdrop_dim)}%</span>
          </span>
        </label>
      )}
      {config.backdrop_kind === "video" && (
        <label className="set-row">
          <span>
            <b>Pause background video</b>
            <span className="cap">Holds it on the current frame, and saves some battery.</span>
          </span>
          <input type="checkbox" className="set-check" checked={config.backdrop_paused === "1"} onChange={(e) => setSetting("backdrop_paused", e.target.checked ? "1" : "")} />
        </label>
      )}

      {FONT_SLOTS.map((slot) => {
        const { key, label, hint, defaultName } = slot;
        return (
        <div className="set-row" key={key}>
          <span>
            <b>{label}</b>
            <span className="cap">{hint}</span>
          </span>
          <span className="set-actions">
          <select className="field set-font" aria-label={label} value={config[key]} onChange={(e) => setSetting(key, e.target.value)}>
            <option value="">{defaultName} (default)</option>
            {fonts.length > 0 && (
              <optgroup label="Your fonts">
                {fonts.map((f) => (
                  <option key={f.path} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="On this PC">
              {SYSTEM_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          </select>
          <Pill disabled={busy} aria-label={`Import ${label.toLowerCase()}`} title="TTF, OTF, WOFF or WOFF2. Daiku keeps its own copy." onClick={() => void importFont(slot)}>
            Import…
          </Pill>
          </span>
        </div>
        );
      })}
      {fonts.length > 0 && (
        <ul className="font-list" aria-label="Your fonts">
          <li className="cap">your fonts · TTF, OTF, WOFF or WOFF2, copied into Daiku</li>
          {fonts.map((f) => (
            <li key={f.path}>
              <span style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
              <Pill className="small" aria-label={`Remove ${f.family}`} onClick={() => removeFont(f.family, f.path)}>
                Remove
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
    </>
  );
}
