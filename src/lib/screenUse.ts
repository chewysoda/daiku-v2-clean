/**
 * How often each screen is opened, counted on this device only and never sent anywhere. It's there for
 * usability sessions: reset before one, read after, and see which screens nobody reached.
 */

/** A screen's name from its address, without ids: "/decide/abc/requirements" is "decide/requirements". */
export function screenKey(pathname: string, ids: Set<string>): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || parts[0] === "present") return null;
  return parts.filter((p, i) => i === 0 || !ids.has(p)).join("/");
}

export function parseVisits(json: string): Record<string, number> {
  try {
    const v = JSON.parse(json) as Record<string, number>;
    return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "number")) : {};
  } catch {
    return {};
  }
}

export const countVisit = (visits: Record<string, number>, key: string) => ({ ...visits, [key]: (visits[key] ?? 0) + 1 });

/** Every screen worth asking about, so the ones never opened show as 0 rather than being missing. */
export const KNOWN_SCREENS = [
  "board", "library", "decide", "handoff", "handoff/preview", "handoff/review", "handoff/spec", "handoff/prompts", "handoff/history",
  "home", "explore", "explore/claims", "explore/interviews", "threads", "notes", "draft", "progress", "progress/heatmaps", "progress/log",
  "share", "export", "settings", "reader", "cad", "decide/all", "decide/requirements", "decide/bom", "decide/simulate", "decide/record",
];

/** Screens by use, least used first, including the ones never opened. */
export const visitTable = (visits: Record<string, number>) =>
  [...new Set([...KNOWN_SCREENS, ...Object.keys(visits)])].map((screen) => ({ screen, count: visits[screen] ?? 0 })).sort((a, b) => a.count - b.count || a.screen.localeCompare(b.screen));
