import { useState } from "react";
import { Link } from "react-router";
import { useStore } from "../../data/store";
import { ConfirmDialog, Pill, toast } from "../../design/primitives";
import { isTauri } from "../../lib/platform";
import { saveBytes } from "../../lib/saveFile";
import { ENGINES, EngineId } from "../../lib/web";
import { AppearanceSettings } from "./AppearanceSettings";
import { Updates } from "./Updates";
import { Backup } from "./Backup";
import { ScreenUse } from "./ScreenUse";
import "./settings.css";

export default function Settings() {
  const config = useStore((s) => s.config);
  const setSetting = useStore((s) => s.setSetting);
  const setLibraryDir = useStore((s) => s.setLibraryDir);
  const removeSampleData = useStore((s) => s.removeSampleData);
  const hasSamples = useStore((s) => s.assets.some((a) => a.is_sample) || s.boards.some((b) => b.is_sample));
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportVault = async () => {
    setExporting(true);
    try {
      const { buildVault } = await import("../../lib/vault");
      const { bytes, missing } = await buildVault(useStore.getState());
      const path = await saveBytes("Daiku vault.zip", bytes, "Zip archive", ["zip"], "application/zip");
      if (path) toast(missing.length ? `Exported, but ${missing.length} file${missing.length === 1 ? " was" : "s were"} unreadable: ${missing.join(", ")}` : "Vault exported. Unzip it and open the folder in Obsidian.", missing.length ? "error" : "info");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    } finally {
      setExporting(false);
    }
  };

  const chooseFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, title: "Choose your library folder" });
    if (typeof picked !== "string") return;
    try {
      await setLibraryDir(picked);
      toast("New items will be saved there. Existing files stay where they are.");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <main className="page settings">
      <h1 className="fr page-title">Settings</h1>
      <section className="set-group">
        <label className="set-row">
          <span>
            <b>Your name</b>
            <span className="cap">Shown on what you share.</span>
          </span>
          <input className="field" value={config.name} placeholder="Your name" onChange={(e) => setSetting("name", e.target.value)} />
        </label>
        <label className="set-row">
          <span>
            <b>Opening greeting</b>
            <span className="cap">A short intro video at startup. Click or press any key to skip it.</span>
          </span>
          <input type="checkbox" className="set-check" checked={config.greeting_intro !== "off"} onChange={(e) => setSetting("greeting_intro", e.target.checked ? "" : "off")} />
        </label>
        <label className="set-row">
          <span>
            <b>Search engine for Explore</b>
            <span className="cap">Used only when you search the web.</span>
          </span>
          <select className="field" value={config.engine} onChange={(e) => setSetting("engine", e.target.value as EngineId)}>
            {Object.entries(ENGINES).map(([id, e]) => (
              <option key={id} value={id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <AppearanceSettings />
      <section className="set-group">
        <div className="set-row">
          <span>
            <b>Library folder</b>
            <span className="cap">Your files, as normal files you can see. {isTauri ? config.library_dir : "Available in the desktop app."}</span>
          </span>
          <Pill disabled={!isTauri} onClick={() => void chooseFolder()}>
            Change…
          </Pill>
        </div>
        <div className="set-row">
          <span>
            <b>Sample data</b>
            <span className="cap">{hasSamples ? "The demo boards, images and decision from the design package." : "Removed."}</span>
          </span>
          <Pill disabled={!hasSamples} onClick={() => setConfirming(true)}>
            Remove sample data
          </Pill>
        </div>
      </section>
      <section className="set-group">
        <div className="set-row">
          <span>
            <b>Export everything</b>
            <span className="cap">An Obsidian vault as a zip: Markdown notes, JSON Canvas boards, your files, BibTeX references, the log, and a plain JSON copy of the whole project.</span>
          </span>
          <Pill disabled={exporting} onClick={() => void exportVault()}>
            {exporting ? "Exporting…" : "Export vault"}
          </Pill>
        </div>
      </section>
      <Backup />
      <section className="set-group" aria-label="Build with AI">
        <div className="set-row">
          <span>
            <b>Build with Claude or another AI</b>
            <span className="cap">Choose what goes in, arrange it into groups, and save it as a zip.</span>
          </span>
          <Link className="pill" to="/handoff">
            Open Handoff
          </Link>
        </div>
      </section>
      <ScreenUse />
      <Updates />
      <section className="set-group about">
        <span className="cap">
          Local-first. Nothing leaves this device unless you search the web in Explore or export a page. No accounts, no analytics.
        </span>
      </section>
      {confirming && (
        <ConfirmDialog
          title="Remove sample data?"
          body="The demo boards, images, claims and decision go away. Anything you added yourself stays, though sample images on your own boards will show as removed."
          action="Remove"
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            removeSampleData();
            setConfirming(false);
          }}
        />
      )}
    </main>
  );
}
