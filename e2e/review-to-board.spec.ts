import { expect, Page, test } from "@playwright/test";

const SHOTS = process.env.SHOTS;

async function propose(page: Page, passage: string) {
  const box = page.getByLabel("The AI's answer");
  await box.fill(`Here's the plan.\n${passage}\nThe rest can wait.`);
  // Put the caret at the start of the passage, then select it with the keyboard, as a person would.
  await box.evaluate((el: HTMLTextAreaElement, text) => {
    const at = el.value.indexOf(text);
    el.focus();
    el.setSelectionRange(at, at);
  }, passage);
  for (let i = 0; i < passage.length; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByText(`${passage.length} characters selected`)).toBeVisible();
  await page.getByRole("button", { name: "Add to board" }).click();
}

test("a passage of the answer becomes a proposed card that can be accepted or rejected", async ({ page }) => {
  await page.goto("/#/handoff/review");
  await propose(page, "Debounce the serial monitor so it redraws at most 30 times a second.");
  await propose(page, "Drop MQTT from the first version.");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/review-add.png` });

  await page.getByRole("link", { name: /2 waiting for you on/ }).click();
  const keep = page.locator(".sticky.proposed", { hasText: "Debounce the serial monitor" });
  const drop = page.locator(".sticky.proposed", { hasText: "Drop MQTT" });
  await expect(keep).toBeVisible();
  await expect(drop).toBeVisible();
  await keep.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-proposals.png` });

  await keep.getByRole("button", { name: "Accept" }).click();
  const kept = page.locator(".sticky", { hasText: "Debounce the serial monitor" });
  await expect(kept).not.toHaveClass(/proposed/);
  await expect(kept.locator(".sticky-author")).toHaveText("Claude");

  await drop.getByRole("button", { name: "Reject" }).click();
  await expect(page.locator(".sticky", { hasText: "Drop MQTT" })).toHaveCount(0);

  // Rejecting is one undo away.
  await page.keyboard.press("Control+z");
  await expect(page.locator(".sticky.proposed", { hasText: "Drop MQTT" })).toBeVisible();
});

test("the Add to board button waits for a selection", async ({ page }) => {
  await page.goto("/#/handoff/review");
  await page.getByLabel("The AI's answer").fill("Some answer.");
  await expect(page.getByRole("button", { name: "Add to board" })).toBeDisabled();
});
