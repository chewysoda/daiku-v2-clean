import { useMemo, useState } from "react";
import { useStore } from "../../data/store";
import { Icon } from "../../design/Icon";
import { Pill, toast } from "../../design/primitives";
import { readTextFromBlob, wordCount } from "../../lib/ocr";
import { copyText, native } from "../../lib/platform";
import { Capture, CapturedImage, draftCredit, hostOf, isAggregator, quoteTitle } from "../../lib/web";
import { fillPalette, newAsset } from "../library/importing";
import "./explore.css";

interface TrayItem extends CapturedImage {
  key: string;
  picked: boolean;
}

/** Saved images are reviewed here first: a web page can't put anything in the library by itself. */
export function CaptureTray({ capture, onClose }: { capture: Capture; onClose: () => void }) {
  const putAsset = useStore((s) => s.putAsset);
  const assets = useStore((s) => s.assets);
  const initialCredit = useMemo(() => draftCredit(capture.page), [capture]);
  const [credit, setCredit] = useState(initialCredit.credit);
  const [human, setHuman] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TrayItem[]>(() =>
    // Highlighting an image already says you want it, whereas Save from page lists everything.
    capture.images.map((i) => ({ ...i, key: i.src, picked: capture.images.length === 1 || capture.kind === "selection" })),
  );
  const [text, setText] = useState(capture.text ?? "");
  const [reading, setReading] = useState(false);
  const [readDone, setReadDone] = useState(false);
  const isSelection = capture.kind === "selection";
  const snip = capture.snip;
  const aggregator = isAggregator(capture.page.pageUrl);
  const picked = items.filter((i) => i.picked);

  const saveAll = async () => {
    setSaving(true);
    let done = 0;
    const page = draftCredit(capture.page);
    if (text.trim()) {
      putAsset(
        newAsset({
          kind: "quote",
          tags: "snip quote",
          title: quoteTitle(text),
          notes: text.trim(),
          source_url: page.source_url || null,
          credit: credit.trim() || null,
          via: page.via || capture.page.pageTitle || null,
          provenance: human ? "human" : "unknown",
        }),
      );
      done++;
    }
    if (snip) {
      try {
        const stored = await native.storeSnip(snip.bytes);
        if (!assets.some((a) => a.file_path === stored.file_path)) {
          const asset = newAsset({
            kind: "image",
            tags: "snip",
            title: capture.page.pageTitle.trim() || `Snip from ${page.via}`,
            file_path: stored.file_path,
            source_url: page.source_url || null,
            credit: credit.trim() || null,
            via: page.via || null,
            width: snip.width,
            height: snip.height,
            provenance: human ? "human" : "unknown",
          });
          putAsset(asset);
          void fillPalette(asset);
        }
        done++;
      } catch (e) {
        toast(String(e), "error");
      }
    }
    for (const image of picked) {
      try {
        const stored = await native.saveUrl(image.src, capture.page.pageUrl);
        const existing = assets.find((a) => a.file_path === stored.file_path);
        if (existing) {
          done++;
          continue;
        }
        const draft = draftCredit(capture.page, image.alt);
        const asset = newAsset({
          kind: "image",
          title: draft.title,
          file_path: stored.file_path,
          source_url: draft.source_url || null,
          credit: credit.trim() || null,
          via: draft.via,
          width: image.width || null,
          height: image.height || null,
          provenance: human ? "human" : "unknown",
        });
        putAsset(asset);
        void fillPalette(asset);
        done++;
      } catch (e) {
        toast(`${hostOf(image.src)}: ${e}`, "error");
      }
    }
    setSaving(false);
    if (done) {
      toast(`Saved ${done} to Library${credit.trim() ? `, credited to ${credit.trim()}` : ", no source yet"}`);
      onClose();
    }
  };

  const saveLink = () => {
    const draft = draftCredit(capture.page);
    putAsset(
      newAsset({
        kind: "link",
        title: draft.title,
        source_url: draft.source_url,
        credit: credit.trim() || null,
        via: draft.via,
        provenance: human ? "human" : "unknown",
      }),
    );
    toast("Link saved to Library");
    onClose();
  };

  const readSnip = async () => {
    if (!snip) return;
    setReading(true);
    try {
      const found = await readTextFromBlob(new Blob([snip.bytes.slice()], { type: "image/png" }));
      if (!found) {
        toast("No text found in this snip.");
        return;
      }
      setText(found);
      setReadDone(true);
      toast((await copyText(found)) ? `Copied ${wordCount(found)} words` : "Read the text, but couldn't reach the clipboard. It's in the box below.");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setReading(false);
    }
  };

  const parts = [
    text.trim() ? "text" : "",
    snip ? "snip" : "",
    picked.length ? `${picked.length} image${picked.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <aside className="tray" aria-label="Save to Library">
      <div className="tray-head">
        <h2 className="fr">Save to Library</h2>
        <button type="button" className="ib" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <span className="cap tray-source" title={capture.page.pageUrl}>
        from {hostOf(capture.page.pageUrl) || capture.page.pageTitle}
      </span>
      <label className="lbl">
        <span className="cap">credit (maker or rights holder)</span>
        <input
          className="field"
          value={credit}
          placeholder="no source yet"
          aria-label="Credit"
          onChange={(e) => setCredit(e.target.value)}
        />
      </label>
      {aggregator && (
        <p className="tray-warn">
          This is a search or pin page, not where this came from. Open the result first to credit the real source.
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={human} onChange={(e) => setHuman(e.target.checked)} />I know this is human-made
      </label>
      {snip && (
        <figure className="tray-snip">
          <img src={snip.url} alt="Your snip" />
          <figcaption className="cap dim">
            {snip.width} × {snip.height}
          </figcaption>
          <Pill className="small" disabled={reading} onClick={() => void readSnip()}>
            {reading ? "Reading…" : "Copy text from snip"}
          </Pill>
        </figure>
      )}
      {((isSelection && (capture.text ?? "") !== "") || readDone) && (
        <label className="lbl">
          <span className="cap">{readDone ? "text in this snip (clear it to save only the picture)" : "highlighted text"}</span>
          <textarea className="field tray-quote" rows={7} aria-label="Highlighted text" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {items.length > 0 ? (
        <>
          {items.length > 1 && (
            <div className="tray-count">
              <span className="cap">
                {picked.length} of {items.length} images
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => setItems((cur) => cur.map((i) => ({ ...i, picked: !picked.length })))}
              >
                {picked.length ? "Clear" : "Select all"}
              </button>
            </div>
          )}
          <div className="tray-grid">
            {items.map((i) => (
              <button
                key={i.key}
                type="button"
                className={`tray-thumb ${i.picked ? "on" : ""}`}
                aria-pressed={i.picked}
                aria-label={i.alt || `Image from ${hostOf(i.src)}`}
                onClick={() => setItems((cur) => cur.map((x) => (x.key === i.key ? { ...x, picked: !x.picked } : x)))}
              >
                <span className="tray-preview">
                  <img src={i.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
                </span>
                <span className="cap">{i.alt || hostOf(i.src)}</span>
                <span className="cap dim">{i.width ? `${i.width} × ${i.height}` : "size unknown"}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        !isSelection && !snip && <p className="cap">No large images on this page.</p>
      )}
      <div className="tray-actions">
        <Pill ink disabled={!parts.length || saving} onClick={() => void saveAll()}>
          {saving ? "Saving…" : parts.length ? `Save ${parts.join(" and ")}` : "Save"}
        </Pill>
        {!isSelection && !snip && <Pill onClick={saveLink}>Save link</Pill>}
      </div>
    </aside>
  );
}
