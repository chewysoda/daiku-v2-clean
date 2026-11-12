/** Which screens get opened, for usability sessions. Counted on this device only, and never sent. */
import { useMemo, useState } from "react";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { parseVisits, visitTable } from "../../lib/screenUse";

export function ScreenUse() {
  const json = useStore((s) => s.config.screen_visits);
  const setSetting = useStore((s) => s.setSetting);
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => visitTable(parseVisits(json)), [json]);
  const never = rows.filter((r) => !r.count).length;
  return (
    <section className="set-group" aria-label="Screen use">
      <div className="set-row">
        <span>
          <b>Screen use</b>
          <span className="cap">How often each screen was opened on this device, for usability sessions. Never sent anywhere. {never} never opened.</span>
        </span>
        <span className="ho-inline">
          <Pill className="small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"}
          </Pill>
          <Pill
            className="small"
            onClick={() => {
              setSetting("screen_visits", "");
              toast("Counts reset. Start the session.", "info", { label: "Undo", run: () => setSetting("screen_visits", json) });
            }}
          >
            Reset
          </Pill>
        </span>
      </div>
      {open && (
        <table className="ho-table" aria-label="Screens by use">
          <thead>
            <tr>
              <th>Screen</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.screen}>
                <td>{r.screen}</td>
                <td>{r.count || "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
