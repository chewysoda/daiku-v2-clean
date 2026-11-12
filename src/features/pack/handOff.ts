/** Handing a pack over: as a zip saved to disk, or as text on the clipboard. Used by every way of sending to Claude. */
import { useStore } from "../../data/store";
import { toast } from "../../design/primitives";
import { buildClaudePack, claudePrompt, packBase, PackOptions, packSummary, shapeFor } from "../../lib/claudePack";
import { listPackItems } from "../../lib/packPlan";
import { parseSent, printsOf } from "../../lib/packBudget";
import { copyText } from "../../lib/platform";
import { saveBytes } from "../../lib/saveFile";

export interface SendStat {
  at: string;
  /** What went. */
  tokens: number;
  /** What would have gone with no budget and no diff. */
  full: number;
}

export function parseSends(json: string): SendStat[] {
  try {
    const v = JSON.parse(json) as SendStat[];
    return Array.isArray(v) ? v.filter((x) => typeof x.tokens === "number" && typeof x.full === "number") : [];
  } catch {
    return [];
  }
}

/** The options with the last send attached, so a diff pack knows what to compare against. */
export const withLastSent = <T extends Omit<PackOptions, "includeFiles">>(options: T): T => ({ ...options, lastSent: parseSent(useStore.getState().config.pack_sent) });

/** Remembers what went, item by item, and how big it was next to sending everything. */
async function sent(options: Omit<PackOptions, "includeFiles">, tokens: number) {
  const state = useStore.getState();
  const { setSetting } = state;
  setSetting("claude_sent", "1");
  const base = packBase(state, options.includeSamples, options.plan?.project ?? null);
  const items = listPackItems(base);
  const shaped = shapeFor(base, { ...options, includeFiles: false }, items);
  const cut = new Set(shaped.budget?.cut.map((i) => i.id));
  // Unchanged items were sent before, so they still count as with the AI.
  const carried = items.filter((i) => !(options.plan?.excluded ?? []).includes(i.id) && !cut.has(i.id));
  setSetting("pack_sent", JSON.stringify({ at: new Date().toISOString(), prints: printsOf(base, carried) }));
  const plain = options.plan ? { ...options.plan, budget: null, diffOnly: false } : undefined;
  const full = plain ? (await packSummary(state, { ...options, includeFiles: false, plan: plain })).tokens : tokens;
  const log = [...parseSends(state.config.pack_sends), { at: new Date().toISOString(), tokens, full }].slice(-50);
  setSetting("pack_sends", JSON.stringify(log));
}

export async function savePack(options: PackOptions, fileName: string): Promise<void> {
  const full = withLastSent(options);
  const { bytes, missing } = await buildClaudePack(useStore.getState(), full);
  const path = await saveBytes(fileName, bytes, "Zip archive", ["zip"], "application/zip");
  if (!path) return;
  await sent(full, (await packSummary(useStore.getState(), full)).tokens);
  if (missing.length) toast(`Saved, but ${missing.length} file${missing.length === 1 ? " was" : "s were"} unreadable: ${missing.join(", ")}`, "error");
  else toast("Saved. Unzip it and open the folder with Claude Code, or add it to a Claude project.");
}

/** Copies the pack as text, or the person's own edited version of it when they give one. */
export async function copyPack(options: Omit<PackOptions, "includeFiles">, edited?: string): Promise<void> {
  const full = withLastSent(options);
  const text = edited ?? (await claudePrompt(useStore.getState(), full));
  if (!(await copyText(text))) {
    toast("Couldn't reach the clipboard. Save a zip instead.", "error");
    return;
  }
  const tokens = Math.ceil(text.length / 4);
  await sent(full, tokens);
  toast(`Copied about ${tokens.toLocaleString()} tokens. Paste it into a chat with Claude.`);
}
