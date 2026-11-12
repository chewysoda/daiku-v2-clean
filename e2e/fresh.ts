import { Page } from "@playwright/test";

/** A fresh install starts with the ESP32 sample's pack. These tests start from an empty one instead. */
export async function freshPack(page: Page, includeSamples = true) {
  await page.goto("/#/handoff");
  const main = page.getByRole("main", { name: "Handoff" });
  await main.getByRole("button", { name: /More options/ }).click();
  await main.getByRole("button", { name: "Start a new pack" }).click();
  await main.getByRole("button", { name: /More options/ }).click();
  if (includeSamples) await main.getByLabel("Include the sample project").check();
}
