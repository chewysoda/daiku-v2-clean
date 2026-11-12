import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useStore } from "../../data/store";
import { Pill, toast } from "../../design/primitives";
import { isTauri, native } from "../../lib/platform";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "off" }
  | { kind: "latest" }
  | { kind: "ready"; update: Update }
  | { kind: "installing" };

function lineFor(state: State): string {
  switch (state.kind) {
    case "idle":
      return "Daiku only looks for a new version when you ask.";
    case "checking":
      return "Looking for a new version…";
    case "off":
      return "Updates aren't set up for this copy. Whoever built it can turn them on with npm run updates:setup.";
    case "latest":
      return "This is the latest version.";
    case "ready":
      return `Version ${state.update.version} is ready. Your work is saved first, then Daiku restarts.`;
    case "installing":
      return "Downloading the update. Daiku will close and reopen.";
  }
}

/** The version, and new ones on request. Nothing is checked until the person asks. */
export function Updates() {
  const [version, setVersion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!isTauri) return;
    void import("@tauri-apps/api/app").then(({ getVersion }) => getVersion().then(setVersion));
  }, []);
  if (!isTauri) return null;

  const check = async () => {
    setState({ kind: "checking" });
    try {
      if (!(await native.updatesEnabled())) return setState({ kind: "off" });
      const { check: find } = await import("@tauri-apps/plugin-updater");
      const update = await find();
      setState(update ? { kind: "ready", update } : { kind: "latest" });
    } catch (e) {
      setState({ kind: "idle" });
      toast(`Couldn't check for updates: ${e}`, "error");
    }
  };

  const install = async (update: Update) => {
    setState({ kind: "installing" });
    try {
      // On Windows the installer takes over and Daiku closes without asking, so saves land first.
      await useStore.getState().flush();
      await update.downloadAndInstall();
    } catch (e) {
      setState({ kind: "ready", update });
      toast(`The update didn't install: ${e}`, "error");
    }
  };


  return (
    <section className="set-group" aria-label="Updates">
      <div className="set-row">
        <span>
          <b>Daiku {version}</b>
          <span className="cap" role="status">
            {lineFor(state)}
          </span>
        </span>
        {state.kind === "ready" ? (
          <Pill ink onClick={() => void install(state.update)}>
            Install and restart
          </Pill>
        ) : (
          <Pill disabled={state.kind === "checking" || state.kind === "installing"} onClick={() => void check()}>
            Check for updates
          </Pill>
        )}
      </div>
    </section>
  );
}
