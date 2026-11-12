import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const shots = process.env.RECORD_SHOTS;

test("weighing evidence, logging a decision and reading the readiness check", async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/#/lab");

  // Rate one piece of evidence on a score that's still a guess, so this is its only source.
  const cells = page.locator(".score-btn");
  await expect(cells.first()).toBeVisible();
  const guessAt = await cells.evaluateAll((all) => all.findIndex((b) => b.querySelector(".dot-guess")));
  const firstScore = cells.nth(guessAt);
  await firstScore.click();
  await page.getByRole("button", { name: "Link a source" }).click();
  await page.locator(".ev-list .palette-row").first().click();
  const card = page.getByTestId("evidence-card").first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Weak" }).click();
  await expect(card.getByRole("button", { name: "Weak" })).toHaveAttribute("aria-pressed", "true");
  await card.getByLabel(/source type/).selectOption("article");
  await card.getByLabel(/limitations/).fill("One small study");
  await expect(firstScore.locator(".ev-mark").first()).toHaveText("W");

  // Marked against, it asks how it was weighed, and the score goes back to being a guess.
  await card.getByLabel(/stance/).selectOption("against");
  await expect(card.getByLabel(/how you weighed this/)).toBeVisible();
  await expect(firstScore.locator(".dot-guess")).toBeVisible();
  await card.getByLabel(/stance/).selectOption("for");
  if (shots) await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/1-evidence-card.png` });
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);

  // Before logging: blocked, and it says why.
  await page.getByRole("link", { name: "Decision record" }).click();
  await expect(page.getByTestId("readiness-title")).toHaveText("Not ready yet.");
  await expect(page.locator('[data-rule="no_record"]')).toBeVisible();
  // A long run of one kind collapses to a line that counts them, and still opens.
  const many = page.locator(".ready-many[data-rule=unrated_evidence]");
  await expect(many.locator("summary")).toContainText("need a strength rating");
  await many.locator("summary").click();
  await expect(many.locator("li").first()).toBeVisible();
  await expect(page.locator('[data-rule="weak_only"]').first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence" })).toContainText("One small study");
  if (shots) await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/2-readiness.png`, fullPage: true });

  // Every rejected concept needs its own reason.
  await page.getByRole("button", { name: "Log this decision" }).click();
  await page.getByLabel("Why", { exact: true }).fill("Lowest cost once quoted");
  const submit = page.getByRole("button", { name: "Log decision" });
  await expect(submit).toBeDisabled();
  if (shots) await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/3-log-dialog.png` });
  for (const why of await page.getByLabel(/^Why not /).all()) await why.fill("Too heavy for the brief");
  await submit.click();

  await expect(page.getByTestId("record-chosen")).toContainText("Lowest cost once quoted");
  await expect(page.getByTestId("record-rejected")).toContainText("Too heavy for the brief");
  await expect(page.locator('[data-rule="no_record"]')).toHaveCount(0);
  await expect(page.locator('[data-rule="no_rejection_reason"]')).toHaveCount(0);

  // It saves as a real file.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as Markdown" }).click();
  expect((await download).suggestedFilename()).toMatch(/record\.md$/);

  // Changing a score after logging makes the record out of date.
  await page.getByRole("link", { name: "Decision matrix" }).click();
  await page.locator(".score-btn").first().click();
  const values = page.getByRole("group", { name: "Score" }).getByRole("button");
  const pressed = await values.evaluateAll((b) => b.findIndex((x) => x.getAttribute("aria-pressed") === "true"));
  await values.nth(pressed === 0 ? 1 : 0).click();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await page.getByRole("link", { name: "Decision record" }).click();
  await expect(page.locator('[data-rule="stale_record"]')).toBeVisible();
  if (shots) await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/4-record.png`, fullPage: true });

  // Phone width: nothing pushes the page sideways.
  await page.setViewportSize({ width: 390, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (shots) await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/5-phone.png` });
});

test("an open evidence card has no serious accessibility problems", async ({ page }) => {
  await page.goto("/#/lab");
  await page.locator(".score-btn").first().click();
  await expect(page.getByTestId("evidence-card").first()).toBeVisible();
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page }).include(".score-pop").analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
