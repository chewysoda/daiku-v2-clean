/**
 * Ollama on this computer, for Extract. The model is loaded only while Extract is working: every request
 * asks Ollama to let it go after a short idle time, and Extract unloads it outright when a run ends or the
 * screen closes.
 */
import { isTauri, native } from "./platform";

export const DEFAULT_LOCAL_MODEL = "qwen2.5:1.5b";
const ENDPOINT = "http://127.0.0.1:11434";
/** If Daiku is closed mid-run and can't unload it, Ollama does so itself after this. */
export const IDLE_UNLOAD = "2m";
/** The longest one passage may take. The desktop app enforces the same limit natively. */
export const PASSAGE_LIMIT_MS = 120_000;

async function call(path: string, body?: object): Promise<string> {
  const text = body ? JSON.stringify(body) : null;
  if (isTauri) return native.localModel(path, text);
  // The browser preview talks to Ollama directly. A plain-text body keeps it a simple request.
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}${path}`, { ...(text ? { method: "POST", body: text } : {}), signal: AbortSignal.timeout(path === "/api/chat" ? PASSAGE_LIMIT_MS : 15_000) });
  } catch (e) {
    // The message is what the person reads; the browser's own error says nothing more useful. (The target's
    // library has no Error `cause` option.)
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    // eslint-disable-next-line preserve-caught-error
    throw new Error(timedOut ? `the model took longer than ${PASSAGE_LIMIT_MS / 1000} seconds, so this passage was skipped` : "Ollama isn't running on this computer");
  }
  const reply = await response.text();
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${reply.slice(0, 300)}`);
  return reply;
}

export interface ModelStatus {
  /** Ollama answered. */
  running: boolean;
  installed: boolean;
  /** In memory right now. */
  loaded: boolean;
}

const named = (model: string) => (m: { name?: string; model?: string }) => m.name === model || m.model === model || m.name === `${model}:latest`;

export async function modelStatus(model: string): Promise<ModelStatus> {
  try {
    const tags = JSON.parse(await call("/api/tags")) as { models?: { name?: string }[] };
    const ps = JSON.parse(await call("/api/ps")) as { models?: { name?: string }[] };
    return { running: true, installed: (tags.models ?? []).some(named(model)), loaded: (ps.models ?? []).some(named(model)) };
  } catch {
    return { running: false, installed: false, loaded: false };
  }
}

/** One question, answered as JSON text. There are no tools in the request, and Rust strips any anyway. */
export async function askModel(model: string, system: string, user: string, schema: object): Promise<string> {
  const reply = JSON.parse(
    await call("/api/chat", {
      model,
      stream: false,
      format: schema,
      keep_alive: IDLE_UNLOAD,
      // A passage's records are short; a cap keeps a runaway answer from taking minutes.
      options: { temperature: 0, num_ctx: 8192, num_predict: 600 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  ) as { message?: { content?: string } };
  return reply.message?.content ?? "";
}

/** Takes the model out of memory now. Never throws: there is nothing to do if Ollama has gone. */
export async function unloadModel(model: string): Promise<void> {
  try {
    await call("/api/generate", { model, keep_alive: 0 });
  } catch {
    // Already gone, or Ollama isn't running.
  }
}
