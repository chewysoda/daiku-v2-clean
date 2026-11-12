/** Starting a board or a project: a name, and a template to start from. */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useStore } from "../data/store";
import { Icon } from "../design/Icon";
import { Pill, toast } from "../design/primitives";
import { allTemplates, specFrom } from "../lib/packs";
import { layoutTemplate, questionCount, sectionCount, START_TEMPLATES, StartTemplate, startItems, startTemplate } from "../lib/startTemplates";
import { newPack } from "../features/pack/packShelf";
import "./newDialog.css";

/** The template's real layout, drawn small, so the choice shows what you'll get. */
function Layout({ template }: { template: StartTemplate }) {
  const sections = layoutTemplate(template);
  if (!sections.length) {
    return (
      <svg className="nd-layout" viewBox="0 0 180 90" aria-hidden="true">
        <rect x="6" y="6" width="168" height="78" rx="6" className="nd-blank" />
      </svg>
    );
  }
  const right = Math.max(...sections.map((s) => s.x + s.w)) + 40;
  const bottom = Math.max(...sections.map((s) => s.y + s.h)) + 40;
  return (
    <svg className="nd-layout" viewBox={`0 0 ${right} ${bottom}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {sections.map((s) => (
        <g key={s.title}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={18} className="nd-section" />
          {s.notes.map((n, i) => (
            <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} rx={10} className="nd-note" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function NewDialog({ kind, projectId = null, onClose }: { kind: "board" | "project"; projectId?: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const createBoard = useStore((s) => s.createBoard);
  const putItems = useStore((s) => s.putItems);
  const addRecord = useStore((s) => s.addRecord);
  const updateRecord = useStore((s) => s.updateRecord);
  const records = useStore((s) => s.records);
  const savedTemplates = useStore((s) => s.config.brief_templates);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(kind === "project" ? "website" : "blank");
  const template = startTemplate(picked);
  const project = useMemo(() => (projectId ? records.find((r) => r.id === projectId && r.type === "project") : null), [records, projectId]);

  const create = () => {
    const title = name.trim() || (kind === "project" ? `${template.id === "blank" ? "New" : template.name} project` : template.id === "blank" ? "Untitled board" : template.name);
    const board = createBoard(kind === "project" ? title : title);
    const items = startItems(template, board.id);
    if (items.length) putItems(items);

    if (kind === "project") {
      const p = addRecord("project", null, { name: title, working: true, board_ids: [board.id], decision_ids: [], asset_ids: [], record_ids: [] });
      useStore.getState().setSetting("project_current", p.id);
      const brief = template.briefTemplate ? allTemplates(savedTemplates).find((t) => t.id === template.briefTemplate) : undefined;
      newPack(`${title} pack`, p.id, brief ? specFrom(brief) : undefined);
      toast(brief ? `${title} started, with a Handoff pack from the ${brief.name} template.` : `${title} started.`, "info");
    } else if (project && project.type === "project") {
      const data = project.data as { board_ids: string[] };
      updateRecord<"project">(project.id, { board_ids: [...data.board_ids, board.id] });
    }
    onClose();
    navigate(`/board/${board.id}`);
  };

  const what = kind === "project" ? "project" : "board";
  // On the page itself: opened from the sidebar, its glass (backdrop-filter) would otherwise trap a fixed dialog inside it.
  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog nd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nd-title"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="nd-head">
          <h2 id="nd-title" className="fr dialog-title">
            {kind === "project" ? "New project" : project && project.type === "project" ? `New board in ${(project.data as { name: string }).name || "this project"}` : "New board"}
          </h2>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <label className="nd-name">
          <span className="ho-label">Name</span>
          <input className="field" autoFocus placeholder={kind === "project" ? "What are you making?" : "Name this board"} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="nd-templates">
          <legend className="ho-label">Start from</legend>
          <div className="nd-grid" role="radiogroup" aria-label={`Template for the new ${what}`}>
            {START_TEMPLATES.map((t) => (
              <label key={t.id} className={`nd-card ${picked === t.id ? "on" : ""}`}>
                <input type="radio" name="nd-template" className="sr-only" value={t.id} checked={picked === t.id} onChange={() => setPicked(t.id)} />
                <Layout template={t} />
                <span className="nd-card-name">
                  <Icon name={t.icon} size={16} fill={picked === t.id} />
                  {t.name}
                </span>
                <span className="nd-card-blurb">{t.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="cap nd-what">
          {sectionCount(template) ? `${sectionCount(template)} sections, in the order the work usually goes, with ${questionCount(template)} questions to answer: ${template.rows.flat().map((s) => s.title.toLowerCase()).join(", ")}.` : "Nothing on it yet."}
          {kind === "project" && template.briefTemplate ? " Handoff gets a pack for this project, started from the matching brief." : ""}
        </p>
        <div className="dialog-actions">
          <Pill type="button" onClick={onClose}>
            Cancel
          </Pill>
          <Pill ink type="submit">
            Create {what}
          </Pill>
        </div>
      </form>
    </div>,
    document.body,
  );
}
