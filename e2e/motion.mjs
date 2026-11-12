// Captures frames of the animations for a person to look at, and measures frame pacing.
// With the dev server running: node e2e/motion.mjs <output folder>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

await page.goto("http://localhost:1420/#/threads");
await page.getByTestId("graph").locator("canvas").first().waitFor();
for (const ms of [60, 200, 400, 800, 1600]) {
  await page.waitForTimeout(ms === 60 ? 60 : ms / 2);
  await shot(`threads-bloom-${ms}`);
}
await page.waitForTimeout(1500);
await shot("threads-idle");

const pacing = await page.evaluate(
  () =>
    new Promise((done) => {
      const gaps = [];
      let last = performance.now();
      const step = (t) => {
        gaps.push(t - last);
        last = t;
        if (gaps.length < 180) requestAnimationFrame(step);
        else {
          gaps.sort((a, b) => a - b);
          done({ medianMs: gaps[90], p99Ms: gaps[178] });
        }
      };
      requestAnimationFrame(step);
    }),
);

await page.getByLabel("Details").getByRole("button").first().click();
await page.waitForTimeout(350);
await shot("threads-ripple");
await page.waitForTimeout(1200);
await shot("threads-selected");
await page.getByRole("button", { name: "Sources", exact: true }).click();
await page.waitForTimeout(200);
await shot("threads-filter-mid");
await page.waitForTimeout(900);
await shot("threads-filter-end");

await page.getByRole("link", { name: "Home", exact: true }).click();
await page.waitForTimeout(90);
await shot("home-entering");
await page.waitForTimeout(800);
await page.locator(".board-card").first().hover();
await page.waitForTimeout(450);
await shot("home-hover");
await page.keyboard.press("Control+k");
await page.waitForTimeout(70);
await shot("palette-entering");
await page.keyboard.press("Escape");

console.log(JSON.stringify({ pacing, errors }, null, 1));
await browser.close();
