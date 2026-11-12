import { expect, test } from "@playwright/test";

test("pasting an answer gives each unmarked row a hint, and using one marks it", async ({ page }) => {
  await page.goto("/#/handoff/review");
  const criterion = (await page.locator(".rv-row.open .rv-crit").first().textContent())!.trim();
  const row = page.locator(".rv-row", { has: page.locator(".rv-crit", { hasText: criterion }) });
  await page.getByLabel("The AI's answer").fill(`Done. ${criterion} is in place and tested.\nEverything else is planned for later.`);

  await expect(row.getByRole("button", { name: /Looks met · use/ })).toBeVisible();
  await expect(row.locator(".rv-quote")).toContainText(criterion);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  await row.getByRole("button", { name: /Looks met · use/ }).click();
  await expect(row.getByRole("radio", { name: "Met", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(row.locator(".rv-hint")).toHaveCount(0);
});
