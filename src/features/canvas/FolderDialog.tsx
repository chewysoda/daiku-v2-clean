import { useEffect, useState } from "react";
import { useStore } from "../../data/store";
import { Asset, BoardItem } from "../../data/types";
import { Icon } from "../../design/Icon";
import { MarkdownText } from "../../design/MarkdownText";
import { Pill, toast } from "../../design/primitives";
import { copyText } from "../../lib/platform";
import { folderMarkdown, pickFiles, uploadAsMarkdown } from "./folderUpload";

/**
 * What's inside a folder on the board: its files on the left, the chosen one as Markdown on the right.
 * Changes go back through `onChange`, so they land in the board's undo history like any other edit.
 */
export function FolderDialog({ item, onChange, onClose }: { item: BoardItem; onChange: (data: BoardItem["data"]) => void; onClose: () => void }) {
  const assets = useStore((s) => s.assets);
  const ids = item.data.files ?? [];
  const files = ids.map((id) => assets.find((a) => a.id === id)).filter((a): a is Asset => !!a);
  const [chosen, setChosen] = useState<string | null>(files[0]?.id ?? null);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = item.data.caption || "Folder";
  const open = files.find((f) => f.id === chosen) ?? files[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addFiles = async () => {
    const picked = await pickFiles();
    if (!picked.length) return;
    setBusy(true);
    const created = await uploadAsMarkdown(picked);
    setBusy(false);
    if (!created.length) return;
    onChange({ ...item.data, files: [...ids, ...created.map((a) => a.id)] });
    setChosen(created[0].id);
  };

  const removeFile = (id: string) => {
    onChange({ ...item.data, files: ids.filter((f) => f !== id) });
    if (chosen === id) setChosen(null);
  };

  const copy = async (text: string, what: string) => {
    await copyText(text);
    toast(`Copied ${what} as Markdown.`);
  };

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog folder-dialog" role="dialog" aria-label={`Folder: ${name}`}>
        <div className="folder-head">
          <Icon name="folder" size={22} fill />
          <input
            className="field folder-name fr"
            aria-label="Folder name"
            defaultValue={name}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== name) onChange({ ...item.data, caption: next });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <button type="button" className="tb" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="folder-body">
          <ul className="folder-files" aria-label="Files in this folder">
            {files.map((f) => (
              <li key={f.id}>
                <button type="button" className={`folder-file ${open?.id === f.id ? "on" : ""}`} onClick={() => setChosen(f.id)}>
                  <span className="folder-file-name">{f.title}</span>
                  <span className="cap">{f.via?.match(/\((\w+)/)?.[1] ?? "Markdown"}</span>
                </button>
                <button type="button" className="tb folder-remove" aria-label={`Take ${f.title} out of the folder`} onClick={() => removeFile(f.id)}>
                  <Icon name="remove" size={14} />
                </button>
              </li>
            ))}
            {!files.length && <li className="cap folder-empty">No files yet. Add some to read them here as Markdown.</li>}
          </ul>
          <div className="folder-preview">
            {open ? (
              <>
                <div className="folder-preview-bar">
                  <b className="fr">{open.title}</b>
                  <Pill onClick={() => setRaw((r) => !r)} aria-pressed={raw}>
                    {raw ? "Show formatted" : "Show Markdown"}
                  </Pill>
                  <Pill onClick={() => copy(open.notes, open.title)}>Copy</Pill>
                </div>
                {raw ? <pre className="folder-raw">{open.notes}</pre> : <div className="folder-md"><MarkdownText text={open.notes || "(empty)"} /></div>}
              </>
            ) : (
              <p className="cap">Pick a file to read it.</p>
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <Pill onClick={() => copy(folderMarkdown(name, files), `all ${files.length} files`)} disabled={!files.length}>
            Copy all
          </Pill>
          <Pill ink onClick={addFiles} disabled={busy}>
            {busy ? "Reading…" : "Add files"}
          </Pill>
        </div>
      </div>
    </div>
  );
}
