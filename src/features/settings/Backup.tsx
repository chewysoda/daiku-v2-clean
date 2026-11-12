/** Backing up everything to one zip, and restoring from one. Restoring replaces what's here, so it asks first. */
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MACHINE_SETTINGS, useStore } from "../../data/store";
import { TABLES } from "../../data/types";
import { ConfirmDialog, Pill, toast } from "../../design/primitives";
import { BackupRows, buildBackup, OpenedBackup, openBackup, restoredRows } from "../../lib/backup";
import { fileUrl, isTauri, native } from "../../lib/platform";
import { fetchBytes, saveBytes } from "../../lib/saveFile";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function Backup() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"" | "backup" | "restore">("");
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const backUp = async () => {
    setBusy("backup");
    try {
      await useStore.getState().flush();
      const s = useStore.getState();
      const rows = Object.fromEntries(TABLES.map((t) => [t, s[t]])) as unknown as BackupRows;
      // The live settings, as the table only holds what's been saved.
      rows.settings =Object.entries(s.config).map(([id, value]) => ({ id, value: String(value) }));
      const read = async (id: string) => {
        const a = s.assets.find((x) => x.id === id);
        const url = a && fileUrl(a);
        return url ? fetchBytes(url) : null;
      };
      const day = new Date().toISOString().slice(0, 10);
      const { bytes, missing } = await buildBackup(rows, read, new Date().toISOString());
      const path = await saveBytes(`Daiku backup ${day}.zip`, bytes, "Zip archive", ["zip"], "application/zip");
      if (path) toast(missing.length ? `Backed up, but ${plural(missing.length, "file")} couldn't be read: ${missing.join(", ")}` : "Backed up. Keep the zip somewhere safe.", missing.length ? "error" : "info");
    } catch (e) {
      toast(`Backup failed: ${e}`, "error");
    } finally {
      setBusy("");
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      setOpened(openBackup(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const restore = async (backup: OpenedBackup) => {
    setOpened(null);
    setBusy("restore");
    try {
      const store = async (bytes: Uint8Array, ext: string) => (isTauri ? (await native.storeFile(bytes, ext)).file_path : null);
      const preview = (bytes: Uint8Array) => URL.createObjectURL(new Blob([bytes as BlobPart]));
      const { rows, missing } = await restoredRows(backup, store, preview);
      await useStore.getState().replaceAll(rows, MACHINE_SETTINGS);
      navigate("/board");
      toast(missing.length ? `Restored, but ${plural(missing.length, "file")} weren't in the backup: ${missing.join(", ")}` : "Restored.", missing.length ? "error" : "info");
    } catch (e) {
      toast(`Restore failed, and nothing was replaced unless it says so above: ${e}`, "error");
    } finally {
      setBusy("");
    }
  };

  const c = opened?.counts ?? {};
  return (
    <section className="set-group" aria-label="Backup">
      <div className="set-row">
        <span>
          <b>Back up everything</b>
          <span className="cap">One zip with every board, source, claim, decision, pack and setting, and your library files. Restore it here or on another computer.</span>
        </span>
        <Pill disabled={!!busy} onClick={() => void backUp()}>
          {busy === "backup" ? "Backing up…" : "Back up"}
        </Pill>
      </div>
      <div className="set-row">
        <span>
          <b>Restore from a backup</b>
          <span className="cap">Replaces everything in Daiku with the backup. Your library folder setting stays.</span>
        </span>
        <Pill disabled={!!busy} onClick={() => picker.current?.click()}>
          {busy === "restore" ? "Restoring…" : "Restore…"}
        </Pill>
        <input
          ref={picker}
          type="file"
          accept=".zip,application/zip"
          hidden
          aria-label="Backup file"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {opened && (
        <ConfirmDialog
          title="Replace everything with this backup?"
          body={`Made ${new Date(opened.index.made_at).toLocaleString()}: ${plural(c.boards ?? 0, "board")}, ${plural(c.assets ?? 0, "source")}, ${plural(c.claims ?? 0, "claim")}, ${plural(c.decisions ?? 0, "decision")}. What's in Daiku now will be gone, so back it up first if you might want it.`}
          action="Replace with backup"
          onClose={() => setOpened(null)}
          onConfirm={() => void restore(opened)}
        />
      )}
    </section>
  );
}
