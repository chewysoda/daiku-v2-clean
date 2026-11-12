import { readFileSync } from "node:fs";
import { expect, Page, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { freshPack } from "./fresh";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  await freshPack(page);
  await expect(page.getByTestId("pack-count")).not.toContainText("0 of 0");
});

const main = (page: Page) => page.getByRole("main", { name: "Handoff" });
const moreOptions = (page: Page) => main(page).getByRole("button", { name: /More options/ }).click();

async function exportZip(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Export zip" }).click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const names = Object.keys(files);
  return { names, text: (p: string) => strFromU8(files[p]), everything: names.map((n) => (/\.(md|json|bib)$/.test(n) ? strFromU8(files[n]) : n)).join("\n"), name: download.suggestedFilename() };
}

test("is reachable from the sidebar, the shortcut, the palette, Settings and the old address", async ({ page }) => {
  await page.goto("/#/library");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Handoff", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Handoff" })).toBeVisible();
  await page.goto("/#/library");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Handoff" })).toBeVisible();
  await page.goto("/#/settings");
  await page.getByRole("link", { name: "Open Handoff" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Handoff" })).toBeVisible();
  await page.goto("/#/pack");
  await expect(page).toHaveURL(/#\/handoff/);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search or run a command").fill("build pack");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toContainText("Go to Handoff");
});

test("organises work into groups and exports the arrangement as a zip", async ({ page }) => {
  const m = main(page);
  await m.getByLabel("What do you want built?").fill("A product page");
  await moreOptions(page);
  await m.getByRole("button", { name: "Add group" }).click();
  await m.getByLabel("Name of group 1").fill("Constraints");
  await m.getByLabel("How the AI should use group 1").fill("Follow these exactly");
  await m.getByRole("button", { name: "Add group" }).click();
  await m.getByLabel("Name of group 2").fill("Look and feel");
  await m.getByLabel("Add an item to group 2").selectOption({ label: "Furniture Study" });
  await m.getByLabel("Add an item to group 1").selectOption({ label: "Which chair base?" });
  await m.getByRole("button", { name: "Add a note about Furniture Study" }).click();
  await m.getByLabel("Note for the AI about Furniture Study").fill("Match this tone");

  const zip = await exportZip(page);
  expect(zip.name).toBe("Daiku pack.zip");
  expect(zip.names).toContain("02 Look and feel/Furniture Study.md");
  expect(zip.names).not.toContain("boards/Furniture Study.md");
  expect(zip.names.some((n) => n.startsWith("01 Constraints/"))).toBe(true);
  expect(zip.names).toContain("manifest.json");
  expect(zip.names).toContain("AGENTS.md");
  const brief = zip.text("CLAUDE.md");
  expect(brief).toContain("A product page");
  expect(brief).toContain("Follow these exactly");
  expect(brief).toContain("`02 Look and feel/Furniture Study.md`: Match this tone");
});

test("something left out is gone from the whole zip, and says why", async ({ page }) => {
  const m = main(page);
  expect((await exportZip(page)).everything).toContain("Furniture Study");
  await m.getByRole("button", { name: "Leave out Furniture Study" }).click();
  await expect(m.locator(".ho-row.out").filter({ hasText: "Furniture Study" })).toContainText("You left it out");
  const zip = await exportZip(page);
  expect(zip.everything).not.toContain("Furniture Study");
  expect(zip.text("CLAUDE.md")).toContain("left out on purpose");
});

test("keeps the arrangement after a restart", async ({ page }) => {
  const m = main(page);
  await moreOptions(page);
  await m.getByRole("button", { name: "Add group" }).click();
  await m.getByLabel("Name of group 1").fill("Constraints");
  await m.getByRole("button", { name: "Leave out Furniture Study" }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await moreOptions(page);
  await expect(main(page).getByLabel("Name of group 1")).toHaveValue("Constraints");
  await expect(main(page).getByRole("button", { name: "Include Furniture Study" })).toBeVisible();
});

test("can bulk-leave-out by kind, search, and drop the files", async ({ page }) => {
  const m = main(page);
  await m.getByLabel("Find an item").fill("source");
  await m.getByRole("button", { name: /Leave out all \d+ shown/ }).click();
  await m.getByLabel("Find an item").fill("");
  await expect(m.getByTestId("pack-attachments")).toContainText("0 files");
  await moreOptions(page);
  await m.getByLabel("Put pictures and files in the zip").uncheck();
  await expect(m.getByTestId("pack-attachments")).toContainText("left out");
  const zip = await exportZip(page);
  expect(zip.names.some((n) => n.startsWith("attachments/"))).toBe(false);
  await m.getByLabel("Find an item").fill("zzzz");
  await expect(m).toContainText("Nothing matches");
});

test("pins an item, and a budget holds back the rest with a reason", async ({ page }) => {
  const m = main(page);
  await m.getByRole("button", { name: "Pin Which chair base?" }).click();
  await expect(m.locator(".ho-group.pinned")).toContainText("Which chair base?");
  await moreOptions(page);
  await m.getByLabel("Token budget").fill("1500");
  await expect(m.locator(".ho-group.out")).toContainText("Over budget");
  const brief = (await exportZip(page)).text("CLAUDE.md");
  expect(brief).toContain("## Held back to fit the budget");
  await expect(page.getByRole("region", { name: "Pack tray" })).toContainText("/ 1,500");
});

test("names the conflict when pinned items alone are over budget", async ({ page }) => {
  const m = main(page);
  await m.getByRole("button", { name: "Pin Which chair base?" }).click();
  await moreOptions(page);
  await m.getByLabel("Token budget").fill("200");
  await expect(m.getByRole("region", { name: "Budget" })).toContainText("Raise the budget or unpin something");
  await expect(page.getByRole("region", { name: "Pack tray" })).toContainText("Pinned items alone are over budget");
});

test("previews the exact text and copies an edited version", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await main(page).getByLabel("What do you want built?").fill("Preview me");
  await main(page).getByRole("link", { name: "Preview as the AI sees it" }).click();
  const text = main(page).getByLabel("The pack, as the AI will read it");
  await expect(text).toHaveValue(/Preview me/);
  await text.fill("Just this, edited");
  await main(page).getByRole("button", { name: "Copy this" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Just this, edited");
  await page.goto("/#/handoff/history");
  await expect(main(page)).toContainText("tokens sent");
});

test("flags guesses and missing evidence in the guess style", async ({ page }) => {
  await expect(main(page).getByTestId("pack-flags").locator(".state.guess").first()).toBeVisible();
});

test("offers the sample project when there's nothing else", async ({ page }) => {
  await page.getByLabel("Include the sample project").uncheck();
  await expect(main(page)).toContainText("try it with the sample project");
});
