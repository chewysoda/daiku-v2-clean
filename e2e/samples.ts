import { Page } from "@playwright/test";
import { SEED, SEED_V2 } from "../src/data/seed";
import { CHAIR_PROJECT, SEED_V3 } from "../src/data/seedAgents";

/**
 * A fresh install only gets the ESP32 sample now. Many tests were written against the earlier
 * samples (the furniture study, the engineering Lab and the agents mood board), which people who
 * installed an older Daiku still have. This puts the preview store in that state before the app
 * loads: the older samples are there and marked as seeded, so the app adds the ESP32 sample on top,
 * exactly as it does for an upgrading user.
 */
export async function withOlderSamples(page: Page) {
  const tables: Record<string, Map<string, unknown>> = {};
  const add = (seed: Record<string, { id: string }[]>) => {
    for (const [table, rows] of Object.entries(seed)) {
      tables[table] ??= new Map();
      for (const row of rows) tables[table].set(row.id, row);
    }
  };
  add(SEED as unknown as Record<string, { id: string }[]>);
  add(SEED_V2 as unknown as Record<string, { id: string }[]>);
  add(SEED_V3 as unknown as Record<string, { id: string }[]>);
  add({ records: [CHAIR_PROJECT] });
  add({ settings: ["seeded", "seeded_v2", "seeded_v3"].map((id) => ({ id, value: "1" })) });
  const db = JSON.stringify(Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, [...rows.entries()]])));
  await page.addInitScript((value) => {
    // Only on the first load, so a test that reloads sees what it saved.
    if (!window.localStorage.getItem("daiku-preview-db")) window.localStorage.setItem("daiku-preview-db", value);
  }, db);
}
