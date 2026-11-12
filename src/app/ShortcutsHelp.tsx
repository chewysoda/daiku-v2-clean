import { useEffect } from "react";
import { Icon } from "../design/Icon";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      ["Ctrl K", "Search and commands: everything else lives here"],
      ["Ctrl 1 to 4", "Board, Library, Decide, Handoff"],
      ["Ctrl Enter", "Open Handoff"],
      ["Ctrl \\", "Collapse or expand the sidebar"],
      ["Ctrl ,", "Settings"],
      ["Ctrl + / Ctrl − / Ctrl 0", "Interface size"],
      ["?", "This list"],
    ],
  },
  {
    title: "Canvas tools",
    keys: [
      ["V", "Select"],
      ["H or Space", "Pan"],
      ["P", "Pencil (with nothing selected)"],
      ["M", "Marker"],
      ["E", "Eraser"],
      ["R", "Shapes"],
      ["T", "Text"],
      ["N", "Sticky note"],
      ["Ctrl N", "New note in the middle, ready to type"],
      ["I", "Image"],
      ["C", "Connector"],
      ["S", "Sticker"],
    ],
  },
  {
    title: "Canvas items",
    keys: [
      ["Double-click", "Edit a note, sticker or text"],
      ["Ctrl C / Ctrl V", "Copy and paste, including pictures, SVG code and text from other apps"],
      ["Ctrl D", "Duplicate"],
      ["Ctrl A", "Select everything"],
      ["Arrows", "Nudge (Shift for 10 at a time)"],
      ["[ and ]", "Send back, bring forward"],
      ["L", "Lock or unlock"],
      ["P", "Pin in the pack: always sent to the AI"],
      ["G", "Snap to grid on or off"],
      ["Shift, while drawing", "Straight lines, squares and circles"],
      ["Del", "Delete"],
      ["Ctrl Z / Ctrl Shift Z or Ctrl Y", "Undo and redo"],
    ],
  },
  {
    title: "Canvas view",
    keys: [
      ["Ctrl + scroll", "Zoom"],
      ["Shift 1", "Fit everything"],
      ["Shift 2", "Fit the selection"],
    ],
  },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog shortcuts" role="dialog" aria-label="Keyboard shortcuts">
        <div className="shortcuts-head">
          <h2 className="fr dialog-title">Keyboard shortcuts</h2>
          <button type="button" className="ib" aria-label="Close" autoFocus onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="shortcuts-cols">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <span className="cap">{g.title}</span>
              <dl>
                {g.keys.map(([k, what]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
