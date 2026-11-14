import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
});

const SCREENS: [string, string][] = [
  ["Start", "/#/home"],
  ["Board", "/#/board/b-furniture"],
  ["Library", "/#/library"],
  ["Explore", "/#/explore"],
  ["Threads", "/#/threads"],
  ["Decide", "/#/decide"],
  ["Decision record", "/#/decide/first/record"],
  ["Notes", "/#/notes"],
  ["Handoff", "/#/handoff"],
  ["Review", "/#/handoff/review"],
  ["Preview", "/#/handoff/preview"],
  ["Drafting", "/#/draft"],
  ["Export", "/#/export"],
  ["Reader", "/#/reader/a-paper"],
  ["Settings", "/#/settings"],
];

// Automated checks catch perhaps a third of accessibility problems, so this is a floor and not proof.
for (const [name, path] of SCREENS) {
  for (const theme of ["light", "dark", "mat-green"]) {
    test(`${name} has no serious accessibility problems (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/#/settings");
      await page.getByLabel("Theme").selectOption(theme);
      await page.waitForTimeout(150);
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")} (${v.nodes.length})`);
      expect(serious).toEqual([]);
    });
  }
}
