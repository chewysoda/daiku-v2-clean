import { useState } from "react";
import { selectRecords, useStore } from "../../data/store";
import { Asset, ProjectData } from "../../data/types";
import { ConfirmDialog, Pill } from "../../design/primitives";
import { NewDialog } from "../../app/NewDialog";
import { parseScope, projectAssetIds, ProjectRow, projectsIn, scopeKey } from "../../lib/projects";

const toggled = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

/** Name projects, mark what's being worked on, and choose what's in each. */
export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const records = useStore((s) => s.records);
  const boards = useStore((s) => s.boards);
  const decisions = useStore((s) => s.decisions);
  const update = useStore((s) => s.updateRecord);
  const remove = useStore((s) => s.deleteRecord);
  const projects = selectRecords(records, "project");
  const [removing, setRemoving] = useState<ProjectRow | null>(null);
  const set = (p: ProjectRow, fields: Partial<ProjectData>) => update<"project">(p.id, fields);
  const [starting, setStarting] = useState(false);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog projects-dialog" role="dialog" aria-label="Projects" onKeyDown={(e) => e.key === "Escape" && !removing && onClose()}>
        <h2 className="fr dialog-title">Projects</h2>
        <p className="dialog-body">Files from projects you aren't working on leave Current projects in the Library. They're still under All projects, and removing a project deletes none of them.</p>
        {!projects.length && <p className="cap">No projects yet.</p>}
        <ul className="projects-list">
          {projects.map((p) => (
            <li key={p.id} className="project-row">
              <div className="project-top">
                <input className="field" aria-label={`Name of ${p.data.name}`} value={p.data.name} onChange={(e) => set(p, { name: e.target.value })} />
                <label className="check">
                  <input type="checkbox" aria-label={`Working on ${p.data.name}`} checked={p.data.working} onChange={(e) => set(p, { working: e.target.checked })} />
                  Working on it
                </label>
                <button type="button" className="link-btn" onClick={() => setRemoving(p)}>
                  Remove
                </button>
              </div>
              <details>
                <summary className="cap">
                  {p.data.board_ids.length} board{p.data.board_ids.length === 1 ? "" : "s"}, {p.data.decision_ids.length} decision{p.data.decision_ids.length === 1 ? "" : "s"}
                </summary>
                <div className="project-picks">
                  {boards.map((b) => (
                    <label key={b.id} className="check project-pick">
                      <input type="checkbox" checked={p.data.board_ids.includes(b.id)} onChange={(e) => set(p, { board_ids: toggled(p.data.board_ids, b.id, e.target.checked) })} />
                      {b.name}
                    </label>
                  ))}
                  {decisions.map((d) => (
                    <label key={d.id} className="check project-pick">
                      <input type="checkbox" checked={p.data.decision_ids.includes(d.id)} onChange={(e) => set(p, { decision_ids: toggled(p.data.decision_ids, d.id, e.target.checked) })} />
                      {d.title}
                    </label>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <Pill onClick={() => setStarting(true)}>New project…</Pill>
          {starting && <NewDialog kind="project" onClose={() => setStarting(false)} />}
          <Pill ink onClick={onClose}>
            Done
          </Pill>
        </div>
      </div>
      {removing && (
        <ConfirmDialog
          title="Remove this project?"
          body={`“${removing.data.name}” goes, but its boards, decisions and files all stay.`}
          action="Remove"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            remove(removing.id);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

/** Which projects a file is in, for its details panel. */
export function AssetProjects({ asset }: { asset: Asset }) {
  const records = useStore((s) => s.records);
  const items = useStore((s) => s.board_items);
  const concepts = useStore((s) => s.concepts);
  const scores = useStore((s) => s.scores);
  const claims = useStore((s) => s.claims);
  const links = useStore((s) => s.evidence_links);
  const update = useStore((s) => s.updateRecord);
  const projects = projectsIn({ records });
  if (!projects.length) return null;
  return (
    <fieldset className="asset-projects">
      <legend className="cap">projects</legend>
      {projects.map((p) => {
        const inIt = projectAssetIds({ records, board_items: items, concepts, scores, claims, evidence_links: links }, p.data).has(asset.id);
        // On one of the project's boards, or used by it, so unticking wouldn't take it out.
        const fixed = inIt && !p.data.asset_ids.includes(asset.id);
        return (
          <label key={p.id} className="check" title={fixed ? "It's on this project's board" : undefined}>
            <input type="checkbox" disabled={fixed} checked={inIt} onChange={(e) => update<"project">(p.id, { asset_ids: toggled(p.data.asset_ids, asset.id, e.target.checked) })} />
            {p.data.name}
          </label>
        );
      })}
    </fieldset>
  );
}

/** Current projects or all projects. The Library and Threads share one choice, so they always agree. */
export function ProjectScopeSelect() {
  const records = useStore((s) => s.records);
  const saved = useStore((s) => s.config.library_scope);
  const setSetting = useStore((s) => s.setSetting);
  const projects = projectsIn({ records });
  return (
    <select className="field lib-scope-select" aria-label="Which projects" value={scopeKey(parseScope(saved, projects))} onChange={(e) => setSetting("library_scope", e.target.value)}>
      <option value="working">Current projects</option>
      <option value="all">All projects</option>
      {projects.length > 0 && (
        <optgroup label="One project">
          {projects.map((p) => (
            <option key={p.id} value={`project:${p.id}`}>
              {p.data.name}
            </option>
          ))}
          <option value="unfiled">Not in a project</option>
        </optgroup>
      )}
    </select>
  );
}

