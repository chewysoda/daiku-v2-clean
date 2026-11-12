import { useEffect, useMemo, useState } from "react";
import { readTextFromUrl, wordCount } from "../../lib/ocr";
import { useNavigate, useSearchParams } from "react-router";
import { Asset, useStore } from "../../data/store";
import { AssetKind } from "../../data/types";
import { Icon } from "../../design/Icon";
import { AssetImage, ConfirmDialog, Pill, Popover, Swatch, toast } from "../../design/primitives";
import { colourName, nearbyColours } from "../../lib/color";
import { copyText, mediaUrl, openExternal, isTauri } from "../../lib/platform";
import { creditLine, filterAssets, isCredited } from "../../lib/search";
import { filesInScope, parseScope, projectsIn, scopeKey as keyOf } from "../../lib/projects";
import { addAssetsToBoard } from "../canvas/boardOps";
import { AssetProjects, ProjectScopeSelect, ProjectsDialog } from "./Projects";
import { pickAndImport } from "./importing";
import { CodeDialog } from "./CodeDialog";
import { LANGUAGE_CHOICES, codeTags, languageOf, lineCount } from "../../lib/github";
import "./library.css";
import { PACK_DRAG_TYPE } from "../../app/PackTray";
import { readerHref } from "../../app/ReaderPanel";

const TABS: { kind: AssetKind | "all"; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Video" },
  { kind: "pdf", label: "PDFs" },
  { kind: "link", label: "Links" },
  { kind: "quote", label: "Quotes" },
  { kind: "code", label: "Code" },
  { kind: "file", label: "Files" },
  { kind: "3d", label: "3D" },
];

function AssetDetails({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const update = useStore((s) => s.updateAsset);
  const remove = useStore((s) => s.deleteAsset);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [readingText, setReadingText] = useState(false);
  return (
    <aside className="asset-panel" aria-label={`Details for ${asset.title}`}>
      <div className="asset-panel-head">
        <h2 className="fr">Where it's from</h2>
        <button type="button" className="ib" aria-label="Close details" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="asset-panel-image">
        <AssetImage asset={asset} />
      </div>
      <label className="lbl">
        <span className="cap">title</span>
        <input className="field" value={asset.title} onChange={(e) => update(asset.id, { title: e.target.value })} />
      </label>
      <label className="lbl">
        <span className="cap">credit (maker or rights holder)</span>
        <input
          className="field"
          value={asset.credit ?? ""}
          placeholder="no source yet"
          onChange={(e) => update(asset.id, { credit: e.target.value })}
        />
      </label>
      <label className="lbl">
        <span className="cap">source link</span>
        <input
          className="field"
          value={asset.source_url ?? ""}
          placeholder="https://"
          onChange={(e) => update(asset.id, { source_url: e.target.value })}
        />
      </label>
      {asset.kind === "file" && /\.(pyw?|ipynb)$/i.test(asset.file_path ?? "") && <FileSource url={mediaUrl(asset)} />}
      {asset.kind === "code" && <CodeSource asset={asset} />}
      {asset.kind === "quote" && (
        <label className="lbl">
          <span className="cap">highlighted text</span>
          <textarea className="field" rows={8} value={asset.notes} onChange={(e) => update(asset.id, { notes: e.target.value })} />
        </label>
      )}
      <label className="lbl">
        <span className="cap">tags</span>
        <input className="field" value={asset.tags} onChange={(e) => update(asset.id, { tags: e.target.value })} />
      </label>
      <AssetProjects asset={asset} />
      <label className="lbl">
        <span className="cap">how it was made (your call, not a detector's)</span>
        <select
          className="field"
          value={asset.provenance}
          onChange={(e) => update(asset.id, { provenance: e.target.value as Asset["provenance"] })}
        >
          <option value="unknown">Not sure</option>
          <option value="human">Human-made</option>
          <option value="ai">AI-generated</option>
        </select>
      </label>
      {asset.palette_lab.length > 0 && (
        <div className="asset-panel-pal">
          {asset.palette_lab.map((c) => (
            <span key={c.hex} title={c.hex} style={{ background: c.hex }} />
          ))}
        </div>
      )}
      <div className="asset-panel-actions">
        {asset.kind === "pdf" && mediaUrl(asset) && (
          <Pill className="small" ink onClick={() => navigate(readerHref("/library", asset.id))}>
            Open in Reader
          </Pill>
        )}
        {asset.kind === "3d" && mediaUrl(asset) && (
          <Pill className="small" ink onClick={() => navigate(`/cad/${asset.id}`)}>
            Open in viewer
          </Pill>
        )}
        {asset.kind === "image" && isTauri && mediaUrl(asset) && (
          <Pill
            className="small"
            disabled={readingText}
            onClick={async () => {
              setReadingText(true);
              try {
                const found = await readTextFromUrl(mediaUrl(asset)!);
                if (!found) toast("No text found in this image.");
                else if (await copyText(found)) toast(`Copied ${wordCount(found)} words`);
                else toast("Couldn't reach the clipboard", "error");
              } catch (e) {
                toast(String(e), "error");
              } finally {
                setReadingText(false);
              }
            }}
          >
            {readingText ? "Reading…" : "Copy text"}
          </Pill>
        )}
        <Pill
          className="small"
          disabled={!asset.source_url}
          onClick={() => asset.source_url && void openExternal(asset.source_url)}
        >
          Open source
        </Pill>
        <Pill
          className="small"
          onClick={async () => {
            toast((await copyText(creditLine(asset))) ? "Credit copied" : "Couldn't reach the clipboard", "info");
          }}
        >
          Copy credit
        </Pill>
        <Pill className="small" onClick={() => setConfirming(true)}>
          Remove
        </Pill>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Remove from library?"
          body={`“${asset.title}” leaves the library and any boards using it. The file stays in your library folder.`}
          action="Remove"
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            remove(asset.id);
            onClose();
          }}
        />
      )}
    </aside>
  );
}

/** A saved snippet or repository file: its language, and its text to read, edit and copy. Never run. */
function CodeSource({ asset }: { asset: Asset }) {
  const update = useStore((s) => s.updateAsset);
  const language = languageOf(asset);
  return (
    <>
      <label className="lbl">
        <span className="cap">language</span>
        <select className="field" value={language} onChange={(e) => update(asset.id, { tags: codeTags(e.target.value, asset.tags) })}>
          {!LANGUAGE_CHOICES.includes(language) && <option value={language}>{language}</option>}
          {LANGUAGE_CHOICES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="lbl">
        <span className="cap">code · {lineCount(asset.notes)} lines · shown here, never run</span>
        <textarea className="field code-field" rows={14} spellCheck={false} value={asset.notes} onChange={(e) => update(asset.id, { notes: e.target.value })} />
      </label>
      {asset.via && <span className="cap">from {asset.via}</span>}
      <Pill className="small" onClick={async () => toast((await copyText(asset.notes)) ? "Code copied" : "Couldn't reach the clipboard")}>
        Copy code
      </Pill>
    </>
  );
}

/** A code file's text, to read and copy. Daiku only ever shows it: nothing in the app can run it. */
function FileSource({ url }: { url: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    if (url) {
      void fetch(url)
        .then((r) => r.text())
        .then((t) => {
          if (!stale) setText(t);
        })
        .catch(() => undefined);
    }
    return () => {
      stale = true;
    };
  }, [url]);
  const MAX = 200000;
  return (
    <div className="lbl">
      <span className="cap">source · shown here, never run</span>
      <pre className="file-source" tabIndex={0} aria-label="File source">{text === null ? "Loading…" : text.length > MAX ? `${text.slice(0, MAX)}\n… and more` : text}</pre>
      {text !== null && (
        <Pill className="small" onClick={async () => toast((await copyText(text)) ? "Copied" : "Couldn't reach the clipboard")}>
          Copy code
        </Pill>
      )}
    </div>
  );
}

export function Library() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const everything = useStore((s) => s.assets);
  const boards = useStore((s) => s.boards);
  const searchAssets = useStore((s) => s.searchAssets);
  const records = useStore((s) => s.records);
  const boardItems = useStore((s) => s.board_items);
  const concepts = useStore((s) => s.concepts);
  const scores = useStore((s) => s.scores);
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const updateRecord = useStore((s) => s.updateRecord);
  const savedScope = useStore((s) => s.config.library_scope);
  const [managing, setManaging] = useState(false);
  const [addingCode, setAddingCode] = useState(false);
  const projects = useMemo(() => projectsIn({ records }), [records]);
  const scope = useMemo(() => parseScope(savedScope, projects), [savedScope, projects]);
  const scopeKey = keyOf(scope);
  const assets = useMemo(() => filesInScope({ records, board_items: boardItems, concepts, scores, claims, evidence_links: links }, everything, scope), [records, boardItems, concepts, scores, claims, links, everything, scope]);
  const hidden = everything.length - assets.length;
  const importHere = async () => keepInScope(await pickAndImport());
  /** New files join the project being viewed, so they don't vanish from the list they were added to. */
  const keepInScope = (added: Asset[]) => {
    if (typeof scope === "object" && added.length) {
      const project = projects.find((p) => p.id === scope.project);
      if (project) updateRecord<"project">(project.id, { asset_ids: [...project.data.asset_ids, ...added.map((a) => a.id)] });
    }
  };

  const query = params.get("q") ?? "";
  const colour = params.get("colour");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [humanOnly, setHumanOnly] = useState(params.get("human") === "1");
  const [creditedOnly, setCreditedOnly] = useState(params.get("credited") === "1");
  const [ids, setIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let stale = false;
    if (!query.trim()) {
      setIds(null);
      return;
    }
    const t = setTimeout(() => {
      void searchAssets(query).then((r) => {
        if (!stale) setIds(r);
      });
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, searchAssets, assets]);

  const setParam = (key: string, value: string | null) => {
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  };

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: assets.length };
    for (const a of assets) out[a.kind] = (out[a.kind] ?? 0) + 1;
    return out;
  }, [assets]);

  const results = useMemo(
    () => filterAssets(assets, { ids, kind, colour, humanOnly, creditedOnly }),
    [assets, ids, kind, colour, humanOnly, creditedOnly],
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectedAssets = selected.map((id) => assets.find((a) => a.id === id)).filter(Boolean) as Asset[];
  const detailAsset = assets.find((a) => a.id === detail);
  const uncredited = assets.filter((a) => !isCredited(a)).length;
  const summary = query || colour ? `${results.length} results` : `${assets.length} items`;

  return (
    <div className="library-wrap">
      <main className="page library">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="fr page-title">Library</h1>
            <span className="page-sub" data-testid="library-count">
              {assets.length} items{hidden ? ` of ${everything.length}` : ""} · {uncredited ? `${uncredited} without a source` : "all credited"} · stored on this device
            </span>
          </div>
          <div className="lib-search-row">
            <label className="lib-search">
              <Icon name="search" />
              {colour && (
                <span className="colour-chip">
                  <span style={{ background: colour }} />
                  {colourName(colour)}
                  <button type="button" aria-label="Clear colour" onClick={() => setParam("colour", null)}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
              )}
              <input
                aria-label="Search the library by idea, colour or maker"
                placeholder="soft curves, lounge, maker…"
                value={query}
                onChange={(e) => setParam("q", e.target.value || null)}
              />
            </label>
            <Pill onClick={() => void importHere()}>
              <Icon name="import" size={18} />
              Import
            </Pill>
            <Pill onClick={() => setAddingCode(true)}>
              <Icon name="plus" size={18} />
              Add code
            </Pill>
          </div>
        </div>

        <div className="lib-scope" role="group" aria-label="Which files">
          <ProjectScopeSelect />
          <button type="button" className="link-btn" onClick={() => setManaging(true)}>
            {projects.length ? "Manage projects" : "Make a project"}
          </button>
          {hidden > 0 && scopeKey === "working" && <span className="cap">{hidden} in projects you aren't working on</span>}
        </div>

        <div className="lib-tabs">
          <div className="seg-group" role="group" aria-label="Kind">
            {TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                className={`seg ${kind === t.kind ? "on" : ""}`}
                aria-pressed={kind === t.kind}
                onClick={() => setKind(t.kind)}
              >
                {t.label}
                <span className="seg-count">{counts[t.kind] ?? 0}</span>
              </button>
            ))}
          </div>
          <span className="grow" />
          <label className="check">
            <input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} />
            Human-made only
          </label>
          <label className="check">
            <input type="checkbox" checked={creditedOnly} onChange={(e) => setCreditedOnly(e.target.checked)} />
            Credited only
          </label>
        </div>

        {(query || colour) && (
          <div className="lib-summary">
            <span className="cap">
              {summary}
              {colour ? ` near ${colourName(colour)} · also try` : ""}
            </span>
            {colour &&
              nearbyColours(colour).map((hex) => (
                <Swatch key={hex} size={22} color={hex} label={`Search near ${hex}`} onClick={() => setParam("colour", hex)} />
              ))}
            {query && (
              <button type="button" className="link-btn" onClick={() => navigate(`/explore?web=${encodeURIComponent(query)}`)}>
                Search the web for “{query}” →
              </button>
            )}
          </div>
        )}

        {results.length === 0 ? (
          <div className="lib-empty">
            <p className="fr">{assets.length ? "Nothing matches." : everything.length ? "Nothing here yet." : "Your library is empty."}</p>
            <p className="cap">
              {assets.length ? "Try fewer filters, or look further afield." : "Import files, add code from GitHub, or save images and papers from Explore."}
            </p>
            <div className="head-row">
              <Pill onClick={() => navigate(query ? `/explore?web=${encodeURIComponent(query)}` : "/explore")}>
                <Icon name="explore" size={18} />
                Go to Explore
              </Pill>
            </div>
          </div>
        ) : (
          <section aria-label="Results" className="lib-grid">
            {results.map((a) => (
              <figure
                className="lib-card"
                key={a.id}
                draggable
                onDragStart={(e) => {
                  // Dragging onto the pack tray puts it in the pack; with a selection, the whole selection goes.
                  e.dataTransfer.setData(PACK_DRAG_TYPE, (selected.includes(a.id) ? selected : [a.id]).join(","));
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className={`lib-im ${selected.includes(a.id) ? "sel" : ""} ${a.kind !== "image" ? "doc" : ""}`}>
                  <button
                    type="button"
                    className="lib-im-btn"
                    aria-label={`Details for ${a.title}`}
                    onClick={() => setDetail(a.id)}
                  >
                    <AssetImage asset={a} />
                  </button>
                  <button
                    type="button"
                    className="ck"
                    aria-label={`Select ${a.title}`}
                    aria-pressed={selected.includes(a.id)}
                    onClick={() => toggle(a.id)}
                  >
                    <Icon name="check" size={14} />
                  </button>
                </div>
                <figcaption className="lib-meta">
                  <b>{a.title}</b>
                  {isCredited(a) ? (
                    <span className="cap" title={a.credit === "yours" ? undefined : `© ${a.credit}`}>{a.credit === "yours" ? "yours" : `© ${a.credit}`}</span>
                  ) : (
                    <span className="cap guess">no source yet</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </section>
        )}

        {selected.length > 0 && (
          <div className="lib-toolbar" role="toolbar" aria-label="Selection">
            <div className="lib-thumbs">
              {selectedAssets.slice(0, 3).map((a) => (
                <span key={a.id}>
                  <AssetImage asset={a} />
                </span>
              ))}
            </div>
            <span className="lib-count">{selected.length} selected</span>
            <div className="pop-anchor">
              <button type="button" className="tool-light" onClick={() => setPicking((p) => !p)}>
                Add to board
              </button>
              {picking && (
                <Popover className="board-picker" onClose={() => setPicking(false)}>
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="palette-row"
                      onClick={() => {
                        addAssetsToBoard(b.id, selected);
                        setPicking(false);
                        setSelected([]);
                        navigate(`/board/${b.id}`);
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                  {!boards.length && <span className="cap">Create a board on Home first.</span>}
                </Popover>
              )}
            </div>
            <button
              type="button"
              className="tool-dark"
              onClick={async () => {
                const ok = await copyText(selectedAssets.map(creditLine).join("\n"));
                toast(ok ? `Copied ${selectedAssets.length} credits` : "Couldn't reach the clipboard");
              }}
            >
              Copy credits
            </button>
            <button type="button" className="tool-x" aria-label="Clear selection" onClick={() => setSelected([])}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </main>
      {detailAsset && <AssetDetails asset={detailAsset} onClose={() => setDetail(null)} />}
      {managing && <ProjectsDialog onClose={() => setManaging(false)} />}
      {addingCode && (
        <CodeDialog
          onClose={() => setAddingCode(false)}
          onAdded={(added) => {
            keepInScope(added);
            setKind("code");
          }}
        />
      )}
    </div>
  );
}
