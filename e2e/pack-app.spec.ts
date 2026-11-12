import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { freshPack } from "./fresh";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  await freshPack(page, false);
  await page.goto("/#/handoff/spec");
});

test("a spec becomes prompts and a zip, and survives a restart", async ({ page }) => {
  const main = page.getByRole("main", { name: "Handoff" });
  await expect(main.getByRole("region", { name: "Still undecided" })).toContainText("Screens");
  await main.getByLabel("Name", { exact: true }).fill("Proto Tracker");
  await main.getByLabel("Must have (non-negotiable)").fill("Log a test");
  await main.getByLabel("Screens", { exact: true }).fill("Dashboard: see every prototype");
  await expect(main.getByRole("region", { name: "Still undecided" })).not.toContainText("Screens");

  await main.getByRole("link", { name: "Prompts" }).click();
  await expect(main.getByRole("listitem", { name: "Screen - Dashboard" })).toContainText("see every prototype");
  await expect(main.getByRole("listitem", { name: "Feature - Log a test" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Copy prompt: Start here" })).toBeVisible();

  await main.getByRole("link", { name: "Pack", exact: true }).click();
  await expect(main.getByLabel("Must-haves")).toHaveValue("Log a test");
  const [download] = await Promise.all([page.waitForEvent("download"), main.getByRole("button", { name: "Export zip" }).click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  expect(strFromU8(files["app/SPEC.md"])).toContain("Proto Tracker");
  expect(strFromU8(files["prompts/02 Screen - Dashboard.md"])).toContain("see every prototype");

  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole("link", { name: "Full spec" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Proto Tracker");
});

test("copies a prompt", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#/handoff/prompts");
  await page.getByRole("button", { name: "Copy prompt: Start here" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Don't write any code yet");
});

test("brings in Lab requirements once, sorted by priority", async ({ page }) => {
  const main = page.getByRole("main", { name: "Handoff" });
  await main.getByRole("link", { name: "Pack", exact: true }).click();
  await main.getByLabel("Include the sample project").check();
  await main.getByRole("link", { name: "Full spec" }).click();
  await main.getByRole("button", { name: "Bring in Lab requirements" }).click();
  const must = main.getByLabel("Must have (non-negotiable)");
  await expect(must).not.toHaveValue("");
  const first = await must.inputValue();
  await main.getByRole("button", { name: "Bring in Lab requirements" }).click();
  await expect(must).toHaveValue(first);
});

test("review marks each must-have and starts a revision pack", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const main = page.getByRole("main", { name: "Handoff" });
  await main.getByRole("link", { name: "Pack", exact: true }).click();
  await main.getByLabel("Must-haves").fill("Wire check\nPort colours");
  await main.getByRole("link", { name: "Review", exact: true }).click();
  await main.getByLabel("The AI's answer").fill("Here's the editor plan.");
  await main.getByRole("radiogroup", { name: "How well it meets: Wire check" }).getByRole("radio", { name: "Met", exact: true }).click();
  await main.getByRole("radiogroup", { name: "How well it meets: Port colours" }).getByRole("radio", { name: "Unmet" }).click();
  await main.getByLabel("What's missing: Port colours").fill("No GPIO 34 rule");
  await expect(main.getByRole("region", { name: "Checklist" })).toContainText("1 met · 0 partly · 1 unmet · 0 to check");
  await main.getByRole("button", { name: "Start revision pack" }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.indexOf("## Not met yet")).toBeLessThan(text.indexOf("## Already met"));
  expect(text).toContain("No GPIO 34 rule");
});

test("checks for must-haves and standing rules go out with the pack, and back into the review", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const main = page.getByRole("main", { name: "Handoff" });
  await main.getByRole("link", { name: "Pack", exact: true }).click();
  await main.getByLabel("Must-haves").fill("Typed ports\nPin checks");
  await main.getByLabel("Check for: Typed ports").fill("A wire of the wrong type is refused");
  await main.getByLabel("Check for: Typed ports").press("Enter");
  // The check lives on the must-have's own line, so it's there in the full spec too.
  await expect(main.getByLabel("Must-haves")).toHaveValue("Typed ports => A wire of the wrong type is refused\nPin checks");
  await expect(main.getByLabel("Check for: Typed ports")).toHaveValue("A wire of the wrong type is refused");
  await main.getByLabel("Rules for every pack").fill("Never add a dependency without asking");

  const [download] = await Promise.all([page.waitForEvent("download"), main.getByRole("button", { name: "Export zip" }).click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  expect(strFromU8(files["CLAUDE.md"])).toContain("## Rules for this work");
  expect(strFromU8(files["CLAUDE.md"])).toContain("- Never add a dependency without asking");
  expect(strFromU8(files["app/SPEC.md"])).toContain("- Typed ports\n  - Check: A wire of the wrong type is refused");
  expect(strFromU8(files["app/SPEC.md"])).toMatch(/- Pin checks\n {2}- Check: _not decided/);
  const feature = Object.keys(files).find((n) => n.includes("Feature - Typed ports"))!;
  expect(strFromU8(files[feature])).toContain("It's done when: A wire of the wrong type is refused");

  await main.getByRole("link", { name: "Review", exact: true }).click();
  const list = main.getByRole("region", { name: "Checklist" });
  await expect(list).toContainText("Check: A wire of the wrong type is refused");
  await list.getByRole("radiogroup", { name: "How well it meets: Typed ports" }).getByRole("radio", { name: "Unmet" }).click();
  await list.getByRole("button", { name: "Start revision pack" }).click();
  // The Windows clipboard hands text back with its own line endings.
  const revision = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(revision).toContain("## Rules that still apply");
  expect(revision).toContain("- Typed ports\n  - Check: A wire of the wrong type is refused");

  // Rules outlast the pack: a new one starts with them already there.
  await main.getByRole("link", { name: "Pack", exact: true }).click();
  await main.getByRole("button", { name: /More options/ }).click();
  await main.getByRole("button", { name: "Start a new pack" }).click();
  await expect(main.getByLabel("Must-haves")).toHaveValue("");
  await expect(main.getByLabel("Rules for every pack")).toHaveValue("Never add a dependency without asking");
});
