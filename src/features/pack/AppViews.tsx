import { useMemo } from "react";
import { selectRecords, useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { addLines, AppSpec, buildPrompts, specGaps } from "../../lib/appSpec";
import { packBase } from "../../lib/claudePack";
import { applyPlan, PackPlan } from "../../lib/packPlan";
import { copyText } from "../../lib/platform";

type Field = { key: keyof AppSpec; label: string; hint?: string; rows?: number };

const SECTIONS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: "The app",
    fields: [
      { key: "name", label: "Name" },
      { key: "pitch", label: "What it does", rows: 2, hint: "A visual editor that turns wired blocks into ESP32 firmware." },
      { key: "problem", label: "The problem", rows: 2, hint: "Makers can wire a circuit but stall at writing C++ for it." },
      { key: "audience", label: "Who it's for", rows: 2, hint: "Makers who know what a pin is, but not C++." },
      { key: "experience", label: "How it should feel", rows: 2, hint: "Like snapping blocks together. Mistakes are caught before upload." },
      { key: "platform", label: "Where it runs", hint: "Web, Windows desktop, iPhone…" },
      { key: "stack", label: "Technology", hint: "Leave empty and the AI recommends one, then waits for your OK." },
    ],
  },
  {
    title: "Features",
    note: "One per line. Each must-have gets its own prompt.",
    fields: [
      { key: "must", label: "Must have (non-negotiable)", rows: 4 },
      { key: "should", label: "Should have (preferences)", rows: 3 },
      { key: "later", label: "Later (don't build yet)", rows: 2 },
    ],
  },
  {
    title: "Screens and data",
    note: "One per line. Each screen gets its own prompt.",
    fields: [
      { key: "screens", label: "Screens", rows: 4, hint: "Dashboard: see every prototype and its status" },
      { key: "entities", label: "Data it stores", rows: 4, hint: "Prototype: name, material, mass, status" },
    ],
  },
  {
    title: "Boundaries",
    fields: [
      { key: "design", label: "Design direction", rows: 3, hint: "Palettes from your boards are added automatically." },
      { key: "references", label: "References, and what matters about each", rows: 3, hint: "Linear: dense, calm lists (layout)\nArduino IDE: the serial monitor (behaviour)" },
      { key: "questions", label: "Open questions", rows: 2, hint: "The AI asks about these instead of deciding. One per line." },
      { key: "constraints", label: "Constraints", rows: 2, hint: "Works offline. Free tools only." },
      { key: "outOfScope", label: "Out of scope", rows: 2 },
      { key: "done", label: "Done means", rows: 3, hint: "How you'll check that it works." },
    ],
  },
];

export function AppSpecView({ plan, update }: { plan: PackPlan; update: (change: (plan: PackPlan) => PackPlan) => void }) {
  const spec = plan.app;
  const gaps = specGaps(spec);
  const set = (key: keyof AppSpec, value: string) => update((p) => ({ ...p, app: { ...p.app, [key]: value } }));

  /** Only ever copies what's written in the Lab, and leaves out anything left out of the pack. */
  const pullRequirements = () => {
    const s = applyPlan(packBase(useStore.getState(), plan.includeSamples, plan.project), plan);
    const reqs = selectRecords(s.records, "requirement");
    if (!reqs.length) {
      toast("No requirements to bring in. Add some in the Lab first.");
      return;
    }
    const text = (priority: "must" | "want") => reqs.filter((r) => r.data.priority === priority).map((r) => r.data.text);
    update((p) => ({ ...p, app: { ...p.app, must: addLines(p.app.must, text("must")), should: addLines(p.app.should, text("want")) } }));
    toast(`Brought in ${reqs.length} requirement${reqs.length === 1 ? "" : "s"} from the Lab.`);
  };

  return (
    <div className="eng-main">
      <section className="card pack-card" aria-label="Still undecided">
        {gaps.length ? (
          <>
            <h2 className="pack-h2">Still undecided</h2>
            <p className="cap">The AI is told to ask about anything left empty, rather than guess. {gaps.join(" · ")}</p>
          </>
        ) : (
          <h2 className="pack-h2">Every question has an answer</h2>
        )}
      </section>
      {SECTIONS.map((section) => (
        <section key={section.title} className="card pack-card" aria-label={section.title}>
          <div className="pack-card-head">
            <div>
              <h2 className="pack-h2">{section.title}</h2>
              {section.note && <p className="cap">{section.note}</p>}
            </div>
            {section.title === "Features" && (
              <Pill className="small" onClick={pullRequirements}>
                Bring in Lab requirements
              </Pill>
            )}
          </div>
          {section.fields.map((f) => (
            <label key={f.key} className="lbl">
              <span className="cap">{f.label}</span>
              {f.rows ? (
                <textarea className="field" rows={f.rows} aria-label={f.label} placeholder={f.hint} value={spec[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input className="field" aria-label={f.label} placeholder={f.hint} value={spec[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PromptsView({ plan }: { plan: PackPlan }) {
  const prompts = useMemo(() => buildPrompts(plan.app), [plan.app]);
  const copy = async (text: string, what: string) => {
    toast((await copyText(text)) ? `Copied ${what}.` : "Couldn't reach the clipboard.", "info");
  };
  return (
    <div className="eng-main">
      <section className="card pack-card">
        <div className="pack-card-head">
          <div>
            <h2 className="pack-h2">{prompts.length} prompts, to paste in order</h2>
            <p className="cap">Open the unzipped folder in your AI tool, then paste them one at a time and check each result. They update as the app spec changes, and they're in the zip under prompts/.</p>
          </div>
          <Pill className="small" onClick={() => void copy(prompts.map((p) => `# ${p.title}\n\n${p.body}`).join("\n\n"), "every prompt")}>
            Copy all
          </Pill>
        </div>
      </section>
      <ol className="pack-prompts">
        {prompts.map((p, i) => (
          <li key={p.file} className="card pack-card" aria-label={p.title}>
            <div className="pack-card-head">
              <h2 className="pack-h2">
                {i}. {p.title}
              </h2>
              <Pill className="small" aria-label={`Copy prompt: ${p.title}`} onClick={() => void copy(p.body, "the prompt")}>
                Copy
              </Pill>
            </div>
            <pre className="pack-prompt">{p.body}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}
