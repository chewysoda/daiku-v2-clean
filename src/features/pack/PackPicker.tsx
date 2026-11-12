/** Which pack is out, and making, renaming or removing one. Each pack belongs to a project or to all work. */
import { useMemo, useState } from "react";
import { useStore } from "../../data/store";
import { ConfirmDialog, Pill, toast } from "../../design/primitives";
import { allTemplates, parseShelf, specFrom } from "../../lib/packs";
import { projectsIn } from "../../lib/projects";
import { newPack, removePack, renameCurrentPack, switchPack } from "./packShelf";

export function PackPicker() {
  const shelfJson = useStore((s) => s.config.packs);
  const templatesJson = useStore((s) => s.config.brief_templates);
  const projectNow = useStore((s) => s.config.project_current);
  const records = useStore((s) => s.records);
  const shelf = useMemo(() => parseShelf(shelfJson), [shelfJson]);
  const projects = useMemo(() => projectsIn({ records }), [records]);
  const templates = useMemo(() => allTemplates(templatesJson), [templatesJson]);
  const current = shelf.list.find((p) => p.id === shelf.current);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState("");
  const [project, setProject] = useState(projectNow);
  const [template, setTemplate] = useState("");

  const projectName = (id: string) => (id ? (projects.find((p) => p.id === id)?.data.name ?? "Removed project") : "All work");
  // Grouped by project, so a project's packs sit together.
  const groups = [...new Set(["", ...projects.map((p) => p.id), ...shelf.list.map((p) => p.project)])]
    .map((id) => ({ id, packs: shelf.list.filter((p) => p.project === id) }))
    .filter((g) => g.packs.length);

  const create = () => {
    const t = templates.find((x) => x.id === template);
    newPack(name, project, t ? specFrom(t) : undefined);
    setMaking(false);
    setName("");
    setTemplate("");
    toast(t ? `New pack, started from “${t.name}”.` : "New pack started.", "info");
  };

  return (
    <div className="ho-packs" aria-label="Packs" role="group">
      <select className="field ho-pack-select" aria-label="Pack" value={shelf.current} onChange={(e) => switchPack(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g.id || "all"} label={projectName(g.id)}>
            {g.packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {renaming != null ? (
        <form
          className="ho-inline"
          onSubmit={(e) => {
            e.preventDefault();
            renameCurrentPack(renaming);
            setRenaming(null);
          }}
        >
          <input className="field" autoFocus aria-label="Pack name" value={renaming} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
          <Pill className="small" type="submit">
            Rename
          </Pill>
        </form>
      ) : (
        <>
          <button type="button" className="ho-text-btn" onClick={() => setRenaming(current?.name ?? "")}>
            Rename
          </button>
          {shelf.list.length > 1 && (
            <button type="button" className="ho-text-btn" onClick={() => setRemoving(true)}>
              Remove
            </button>
          )}
          <Pill
            className="small"
            onClick={() => {
              setProject(projectNow);
              setMaking((m) => !m);
            }}
          >
            New pack
          </Pill>
        </>
      )}
      {making && (
        <form
          className="card ho-card ho-new-pack"
          aria-label="New pack"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input className="field" autoFocus aria-label="New pack name" placeholder="Name, e.g. Pin checker v1" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="field" aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All work</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.data.name || "Untitled project"}
              </option>
            ))}
          </select>
          <select className="field" aria-label="Brief template" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Empty brief</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="ho-inline">
            <Pill ink className="small" type="submit">
              Create
            </Pill>
            <button type="button" className="ho-text-btn" onClick={() => setMaking(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {removing && current && (
        <ConfirmDialog
          title={`Remove “${current.name}”?`}
          body="Its brief, items, review and send history go with it. Your sources, boards and decisions stay."
          action="Remove pack"
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            removePack(current.id);
            setRemoving(false);
          }}
        />
      )}
    </div>
  );
}
