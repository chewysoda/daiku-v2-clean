import { useMemo, useState } from "react";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { buildExport, DATASETS, DatasetId, exportLayout, exportScope, ExportPlan, ImageOrganise, isPicture, ORGANISE, parseExportPlan } from "../../lib/dataExport";
import { cleanFormats, DATASET_FORMATS, FORMAT_LABEL, FormatId } from "../../lib/dataFormats";
import { EXPORT_IMAGE_FORMATS, ExportImageFormat, isExportImageFormat } from "../../lib/imageFormats";
import { projectsIn } from "../../lib/projects";
import { saveBytes } from "../../lib/saveFile";
import "../studio.css";
import "./export.css";

export default function Export() {
  const saved = useStore((s) => s.config.export_plan);
  const setSetting = useStore((s) => s.setSetting);
  const records = useStore((s) => s.records);
  const assets = useStore((s) => s.assets);
  const boards = useStore((s) => s.boards);
  const boardItems = useStore((s) => s.board_items);
  const decisions = useStore((s) => s.decisions);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const projects = useMemo(() => projectsIn({ records }), [records]);
  const stored = useMemo(() => parseExportPlan(saved), [saved]);
  // Until something is chosen, start on the project being worked on.
  const plan: ExportPlan = useMemo(() => (stored.scope ? stored : { ...stored, scope: projects.find((p) => p.data.working)?.id ?? "all" }), [stored, projects]);
  const update = (change: (p: ExportPlan) => ExportPlan) => setSetting("export_plan", JSON.stringify(change(plan)));
  const setDataset = (id: DatasetId, fields: Partial<ExportPlan["sets"][DatasetId]>) => update((p) => ({ ...p, sets: { ...p.sets, [id]: { ...p.sets[id], ...fields } } }));
  const setImages = (fields: Partial<ExportPlan["images"]>) => update((p) => ({ ...p, images: { ...p.images, ...fields } }));
  const rename = (id: string, fields: { name?: string; folder?: string }) => setImages({ renames: { ...plan.images.renames, [id]: { ...plan.images.renames[id], ...fields } } });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the rows are what the layout is worked out from.
  const layout = useMemo(() => exportLayout(useStore.getState(), plan), [plan, records, assets, boards, boardItems, decisions]);
  const q = filter.trim().toLowerCase();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as above.
  const pictures = useMemo(() => exportScope(useStore.getState(), plan).assets.filter(isPicture), [plan, records, assets, boardItems]);
  const shownPictures = q ? pictures.filter((a) => a.title.toLowerCase().includes(q)) : pictures;
  const pathOf = (id: string) => layout.images.find((i) => i.asset.id === id)?.path;

  const tree = useMemo(() => {
    const folders = new Map<string, string[]>();
    for (const f of layout.files) {
      const cut = f.path.lastIndexOf("/");
      const folder = cut < 0 ? "" : f.path.slice(0, cut);
      folders.set(folder, [...(folders.get(folder) ?? []), f.path.slice(cut + 1)]);
    }
    return [...folders].sort(([a], [b]) => a.localeCompare(b));
  }, [layout]);

  const exportZip = async () => {
    setBusy(true);
    try {
      const { bytes, name, missing } = await buildExport(useStore.getState(), plan);
      const path = await saveBytes(name, bytes, "Zip archive", ["zip"], "application/zip");
      if (!path) return;
      if (missing.length) toast(`Exported, but ${missing.length} file${missing.length === 1 ? " was" : "s were"} unreadable: ${missing.join(", ")}`, "error");
      else toast(`Saved ${name}.`);
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page lab-eng export" aria-label="Export">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="fr page-title">Export</h1>
          <span className="page-sub">Your data in the formats that suit it, and your original files in folders, named your way, in one zip. Nothing is sent anywhere.</span>
        </div>
      </div>
      <div className="eng-cols export-cols">
        <div className="eng-main">
          <section className="card export-card" aria-label="What to export">
            <div className="form-row">
              <label className="lbl">
                <span className="cap">export from</span>
                <select className="field" aria-label="Export from" value={plan.scope} onChange={(e) => update((p) => ({ ...p, scope: e.target.value }))}>
                  <option value="all">Everything</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.data.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lbl">
                <span className="cap">name of the zip</span>
                <input className="field" aria-label="Name of the zip" value={plan.zipName} onChange={(e) => update((p) => ({ ...p, zipName: e.target.value }))} />
              </label>
            </div>
            {plan.scope === "all" && (
              <label className="check">
                <input type="checkbox" checked={plan.includeSamples} onChange={(e) => update((p) => ({ ...p, includeSamples: e.target.checked }))} />
                Include the sample data
              </label>
            )}
          </section>

          <section className="card export-card" aria-label="Data files">
            <h2 className="pack-h2-x">Data files</h2>
            <p className="cap export-why">Each kind of data gets the formats that suit it. Photos, PDFs, video and 3D models stay as their original files below, and the data points to them.</p>
            <div className="export-grid" role="group" aria-label="Data files">
              <span className="cap" />
              <span className="cap">folder</span>
              <span className="cap">file name</span>
              {DATASETS.map((d) => {
                const set = plan.sets[d.id];
                return (
                  <div key={d.id} className="export-row">
                    <label className="export-pick">
                      <input type="checkbox" aria-label={`Include ${d.label}`} checked={set.on} onChange={(e) => setDataset(d.id, { on: e.target.checked })} />
                      <span>
                        <b>{d.label}</b>
                        <span className="cap">{d.hint}</span>
                      </span>
                    </label>
                    <input className="field" aria-label={`Folder for ${d.label}`} disabled={!set.on} placeholder="top of the zip" value={set.folder} onChange={(e) => setDataset(d.id, { folder: e.target.value })} />
                    <span className="export-file">
                      <input className="field" aria-label={`File name for ${d.label}`} disabled={!set.on} value={set.file} onChange={(e) => setDataset(d.id, { file: e.target.value })} />
                    </span>
                    <div className="export-formats" role="group" aria-label={`Formats for ${d.label}`} title={`${d.label} is ${DATASET_FORMATS[d.id].why}.`}>
                      {DATASET_FORMATS[d.id].offered.map((f) => {
                        const chosen = cleanFormats(d.id, set.formats);
                        return (
                          <label key={f} className="check" title={FORMAT_LABEL[f].hint}>
                            <input
                              type="checkbox"
                              aria-label={`${d.label} as ${FORMAT_LABEL[f].label}`}
                              disabled={!set.on}
                              checked={chosen.includes(f)}
                              onChange={(e) => setDataset(d.id, { formats: (e.target.checked ? [...chosen, f] : chosen.filter((x) => x !== f)) as FormatId[] })}
                            />
                            {FORMAT_LABEL[f].label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card export-card" aria-label="Pictures and files">
            <label className="export-pick">
              <input type="checkbox" aria-label="Include pictures and files" checked={plan.images.on} onChange={(e) => setImages({ on: e.target.checked })} />
              <span>
                <b>Pictures and files</b>
                <span className="cap">Every one keeps its credit in index.json. A picture you leave out stays listed in the data files, without its file.</span>
              </span>
            </label>
            {plan.images.on && (
              <>
                <div className="form-row">
                  <label className="lbl">
                    <span className="cap">folder</span>
                    <input className="field" aria-label="Pictures folder" placeholder="top of the zip" value={plan.images.folder} onChange={(e) => setImages({ folder: e.target.value })} />
                  </label>
                  <label className="lbl">
                    <span className="cap">image format</span>
                    <select
                      className="field"
                      aria-label="Image format"
                      title={`${EXPORT_IMAGE_FORMATS.find((f) => f.id === (plan.images.convert ?? "original"))?.hint}. PDFs, video, 3D models and code always stay as they are.`}
                      value={isExportImageFormat(plan.images.convert) ? plan.images.convert : "original"}
                      onChange={(e) => setImages({ convert: e.target.value as ExportImageFormat })}
                    >
                      {EXPORT_IMAGE_FORMATS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="lbl">
                    <span className="cap">organise</span>
                    <select className="field" aria-label="Organise pictures" value={plan.images.organise} onChange={(e) => setImages({ organise: e.target.value as ImageOrganise })}>
                      {ORGANISE.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={plan.images.numbered} onChange={(e) => setImages({ numbered: e.target.checked })} />
                    Number them
                  </label>
                </div>
                <details className="export-rename">
                  <summary>
                    Choose and name files one by one ({layout.images.length} of {pictures.length})
                  </summary>
                  {pictures.length > 6 && <input className="field" type="search" aria-label="Find a picture" placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
                  <ul>
                    {shownPictures.map((asset) => {
                      const path = pathOf(asset.id);
                      return (
                        <li key={asset.id}>
                          <label className="export-pick export-path">
                            <input type="checkbox" aria-label={`Include ${asset.title}`} checked={!!path} onChange={(e) => setImages({ excluded: e.target.checked ? plan.images.excluded.filter((id) => id !== asset.id) : [...plan.images.excluded, asset.id] })} />
                            <span className="cap" title={path}>
                              {path ?? `${asset.title} (left out)`}
                            </span>
                          </label>
                          {path && (
                            <>
                              <input className="field" aria-label={`File name for ${asset.title}`} placeholder={asset.title} value={plan.images.renames[asset.id]?.name ?? ""} onChange={(e) => rename(asset.id, { name: e.target.value })} />
                              <input className="field" aria-label={`Folder for ${asset.title}`} placeholder="its usual folder" value={plan.images.renames[asset.id]?.folder ?? ""} onChange={(e) => rename(asset.id, { folder: e.target.value })} />
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </>
            )}
          </section>
        </div>
        <aside className="eng-side export-side" aria-label="What the zip holds">
          <section className="card side-card">
            <h2 className="pack-h2-x" data-testid="export-name">
              {layout.zipName}
            </h2>
            <span className="cap" data-testid="export-count">
              {layout.files.length} file{layout.files.length === 1 ? "" : "s"}
            </span>
            <ul className="export-tree" aria-label="Files in the zip">
              {tree.map(([folder, names]) => (
                <li key={folder}>
                  {folder ? <span className="mono">{folder}/</span> : null}
                  <ul className={folder ? "" : "top"}>
                    {names.slice(0, 40).map((n) => (
                      <li key={n} className="small-line">
                        {n}
                      </li>
                    ))}
                    {names.length > 40 && <li className="cap">and {names.length - 40} more</li>}
                  </ul>
                </li>
              ))}
            </ul>
            <Pill ink disabled={busy} onClick={() => void exportZip()}>
              {busy ? "Working…" : "Export zip"}
            </Pill>
          </section>
        </aside>
      </div>
    </main>
  );
}
