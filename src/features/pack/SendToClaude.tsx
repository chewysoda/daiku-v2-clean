import { useState } from "react";
import { Link } from "react-router";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { focusOptions } from "../../lib/claudePack";
import { PackFocus } from "../../lib/packPlan";
import { safeFileName } from "../../lib/studio";
import { copyPack, savePack } from "./handOff";
import "./pack.css";

/** Sends one board or decision to Claude, with its sources and claims, from wherever it's open. */
export function SendToClaude({ focus, name }: { focus: PackFocus; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pill onClick={() => setOpen(true)} title={`Send “${name}” to Claude`}>
        Send to Claude
      </Pill>
      {open && <SendDialog focus={focus} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendDialog({ focus, name, onClose }: { focus: PackFocus; name: string; onClose: () => void }) {
  const saved = useStore((s) => s.config.claude_brief);
  const setSetting = useStore((s) => s.setSetting);
  const [brief, setBrief] = useState(saved);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    if (brief !== saved) setSetting("claude_brief", brief);
    try {
      await work();
      onClose();
    } catch (e) {
      toast(`Couldn't make the pack: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const options = (includeFiles: boolean) => focusOptions(useStore.getState(), focus, brief, includeFiles);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Send to Claude" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 className="fr dialog-title">Send “{name}” to Claude</h2>
        <p className="dialog-body">
          Only this {focus.type}, with its sources and claims. Credits travel with every source, and nothing leaves this device
          until you paste or upload it.
        </p>
        <label className="send-brief">
          <span className="cap">What should Claude do with it?</span>
          <textarea
            autoFocus
            className="field"
            rows={3}
            value={brief}
            placeholder="Summarise what the evidence says, and what's still a guess."
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <Link className="link-btn send-more" to="/handoff" onClick={onClose}>
            More in Build pack
          </Link>
          <Pill disabled={busy} onClick={() => void run(() => savePack(options(true), `${safeFileName(name)} for Claude.zip`))}>
            Save zip
          </Pill>
          <Pill ink disabled={busy} onClick={() => void run(() => copyPack(options(false)))}>
            {busy ? "Working…" : "Copy for a chat"}
          </Pill>
        </div>
      </div>
    </div>
  );
}
