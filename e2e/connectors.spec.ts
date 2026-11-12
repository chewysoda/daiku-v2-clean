import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

test("a connector has an arrowhead, and can be drawn in a playful look that sticks", async ({ page }) => {
  await page.goto("/#/canvas/b-furniture");
  const link = page.locator('g[data-item="i-link"]');
  await expect(link.locator(".link-head")).toHaveCount(1);
  await expect(link).toHaveAttribute("data-look", "curve");
  const plain = await link.locator(".link:not(.link-head)").getAttribute("d");

  await link.locator(".link-hit").click({ force: true });
  const bar = page.getByRole("toolbar", { name: "Connector type" });
  await expect(bar.getByRole("button", { name: "supports" })).toHaveAttribute("aria-pressed", "true");
  for (const look of ["wavy", "loopy", "zigzag", "hops"]) {
    await bar.getByRole("button", { name: `Draw it ${look}` }).click();
    await expect(link).toHaveAttribute("data-look", look);
    expect(await link.locator(".link:not(.link-head)").getAttribute("d")).not.toBe(plain);
    await expect(link.locator(".link-head")).toHaveCount(1);
  }
  // The look is how it's drawn, not what it means.
  await expect(bar.getByRole("button", { name: "supports" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator('g[data-item="i-link"]')).toHaveAttribute("data-look", "hops");
});
