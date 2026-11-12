/**
 * Extract: the pack's claims, evidence, decisions and code as a checked, data-only text file, made on this
 * computer. The model is in memory only while a run is going: it's unloaded when the run ends, when this
 * screen closes, and when the window does.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { packFiles } from "../../lib/claudePack";
import { indexPack, isIncomplete, renderData, renderReport, RESPONSE_SCHEMA, runExtract } from "../../lib/localExtract";
import { askModel, DEFAULT_LOCAL_MODEL, ModelStatus, modelStatus, unloadModel } from "../../lib/localModel";
import { copyText } from "../../lib/platform";
import { saveText } from "../../lib/saveFile";
import { updatePlan, usePack } from "./usePack";

interface Result {
  /** The pack had nothing to read, so the model was never asked. */
  empty?: boolean;
  incomplete: boolean;
  summary: string;
  data: string;
  report: string;
  rejected: number;
}

export function ExtractView() {
  const { plan, brief } = usePack();
  const saved = useStore((s) => s.config.local_model);
  const setSetting = useStore((s) => s.setSetting);
  const model = saved.trim() || DEFAULT_LOCAL_MODEL;
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  /** When the current passage was sent, so a slow one shows a running clock rather than looking stuck. */
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const stop = useRef(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  const check = useCallback(async () => setStatus(await modelStatus(modelRef.current)), []);

  useEffect(() => {
    void check();
    // Only while this screen is open, so it shows whether the model is in memory right now.
    const timer = setInterval(() => void check(), 5000);
    const leave = () => void unloadModel(modelRef.current);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      // Leaving the screen stops a run and lets the model go.
      stop.current = true;
      leave();
    };
  }, [check, model]);

  const start = async (focused: boolean) => {
    stop.current = false;
    setRunning(true);
    setResult(null);
    setProgress([0, 0]);
    const used = model;
    try {
      // The pack exactly as it would be exported, so the same project, consent and left-out rules apply.
      const { files } = await packFiles(useStore.getState(), { brief, includeFiles: false, includeSamples: plan.includeSamples, plan });
      const index = indexPack(files);
      if (!index.chunks.length) {
        setResult({ empty: true, incomplete: false, summary: "", data: "", report: "", rejected: 0 });
        return;
      }
      const run = await runExtract(index, {
        model: used,
        query: focused ? query : "",
        ask: (system, user) => askModel(used, system, user, RESPONSE_SCHEMA),
        onProgress: (done, total) => {
          setProgress([done, total]);
          setSince(Date.now());
          setNow(Date.now());
        },
        shouldStop: () => stop.current,
      });
      const counts = (["CLAIM", "EVIDENCE", "DECISION", "CODE"] as const).map((c) => run.records.filter((r) => r.category === c).length);
      setResult({
        incomplete: isIncomplete(run),
        summary: `${counts[0]} claims · ${counts[1]} evidence · ${counts[2]} decisions · ${counts[3]} code · ${run.visited} of ${run.eligible} passages read by the model, ${run.structured} read from Daiku's records`,
        data: renderData(run.records),
        report: renderReport(run, index.skipped),
        rejected: run.rejected.length,
      });
    } catch (e) {
      toast(`Extract stopped: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      await unloadModel(used);
      setRunning(false);
      setProgress(null);
      void check();
    }
  };

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  const ready = !!status?.running && status.installed;
  const waited = running && since ? Math.max(0, Math.round((now - since) / 1000)) : 0;
  const copy = async (text: string) => toast((await copyText(text)) ? "Copied." : "Couldn't reach the clipboard.", "info");

  return (
    <div className="ho-narrow ex">
      <section className="card ho-card" aria-label="Extract on this computer">
        <div className="ho-card-head">
          <h2 className="ho-h2">Extract on this computer</h2>
          <span className="cap">Claims, evidence, decisions and code from this pack, each with the file and lines it came from.</span>
        </div>
        <p className="cap">
          What Daiku already knows is read as it is. Notes, drafts and boards are read by a model running in Ollama on this computer, and a sentence is only kept if it's really in the
          text it cites. Nothing is sent anywhere. The model is loaded for the run and unloaded when it ends or you leave this tab.
        </p>
        <div className="ex-model">
          <label className="lbl">
            <span className="cap">Model</span>
            <input className="field" aria-label="Local model" value={saved} placeholder={DEFAULT_LOCAL_MODEL} disabled={running} onChange={(e) => setSetting("local_model", e.target.value)} />
          </label>
          <span className="ex-status" role="status" aria-label="Model status">
            {status === null
              ? "Checking Ollama…"
              : !status.running
                ? "Ollama isn't running. Start it from the Start menu."
                : !status.installed
                  ? `${model} isn't downloaded yet.`
                  : status.loaded
                    ? `${model} is in memory${running ? " for this run" : ""}.`
                    : `${model} is ready, and not in memory.`}
          </span>
          {status && !running && (!status.running || !status.installed) && (
            <Pill className="small" onClick={() => void check()}>
              Check again
            </Pill>
          )}
        </div>
        {status?.running && !status.installed && (
          <p className="cap">
            Download it from PowerShell: <code>ollama pull {model}</code>{" "}
            <button type="button" className="ho-text-btn" onClick={() => void copy(`ollama pull ${model}`)}>
              Copy
            </button>
          </p>
        )}
        <div className="ex-run">
          <Pill ink disabled={!ready || running} onClick={() => void start(false)}>
            Extract everything
          </Pill>
          <input className="field" aria-label="Only what answers this question" placeholder="Or only what answers a question, e.g. how long does the battery last" value={query} disabled={running} onChange={(e) => setQuery(e.target.value)} />
          <Pill disabled={!ready || running || !query.trim()} onClick={() => void start(true)}>
            Extract for this question
          </Pill>
          {running && (
            <Pill
              className="small"
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop
            </Pill>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={plan.includeSamples} disabled={running} onChange={(e) => updatePlan((p) => ({ ...p, includeSamples: e.target.checked }))} />
          Include the sample project
        </label>
        {running && progress && (
          <p className="cap" role="status" aria-label="Extract progress">
            {progress[1] ? `Reading passage ${Math.min(progress[0] + 1, progress[1])} of ${progress[1]}…${waited >= 5 ? ` ${waited} s` : ""}` : "Gathering the pack…"}
            {waited >= 20 && " This one is slow. On a laptop, plugging in usually helps. A passage is skipped after 2 minutes."}
          </p>
        )}
      </section>

      {result?.empty && (
        <section className="card ho-card" aria-label="Extract result">
          <div className="ho-card-head">
            <h2 className="ho-h2">Nothing to extract</h2>
          </div>
          <p className="cap">
            This pack has no claims, sources, decisions, notes, drafts or boards in it{plan.includeSamples ? "" : ", and the sample project is left out"}, so the model wasn't started.{" "}
            {plan.includeSamples ? "Add some work, or check what's left out on the Pack tab." : "Tick Include the sample project above to try it on the example, or add your own work."}
          </p>
        </section>
      )}

      {result && !result.empty && (
        <section className="card ho-card" aria-label="Extract result">
          <div className="ho-card-head">
            <h2 className="ho-h2">{result.incomplete ? "Incomplete" : "Complete"}</h2>
            <span className="cap">
              {result.summary}
              {result.rejected ? ` · ${result.rejected} rejected` : ""}
            </span>
          </div>
          {result.incomplete && <p className="cap guess">Some passages weren't read. The report lists which, and why.</p>}
          <div className="ex-actions">
            <Pill ink className="small" onClick={() => void saveText("Daiku extract.txt", result.data, "Text", ["txt"])}>
              Save data
            </Pill>
            <Pill className="small" onClick={() => void saveText("Daiku extract.report.txt", result.report, "Text", ["txt"])}>
              Save report
            </Pill>
            <Pill className="small" onClick={() => void copy(result.data)}>
              Copy data
            </Pill>
          </div>
          <pre className="ex-data" aria-label="Extracted data">
            {result.data}
          </pre>
          <details>
            <summary className="cap">Run report</summary>
            <pre className="ex-data" aria-label="Run report">
              {result.report}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
