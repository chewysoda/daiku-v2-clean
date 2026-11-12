import { expect, Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/#/canvas/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
});

const pasteText = (page: Page, text: string) =>
  page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, text);

const pasteFile = (page: Page, text: string) =>
  page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], "drawing.svg", { type: "image/svg+xml" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, text);

const BRACKET = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><title>Bracket</title><rect width="400" height="100" fill="#3f6fb5"/></svg>';
const svgImages = (page: Page) => page.locator("img.is-svg");

test("pasting SVG code places a picture that keeps its shape", async ({ page }) => {
  const before = await page.getByTestId("item-image").count();
  await pasteText(page, BRACKET);
  await expect(page.getByTestId("item-image")).toHaveCount(before + 1);
  const image = svgImages(page).last();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(image).toHaveAttribute("alt", "Bracket");
  const item = page.getByTestId("item-image").last();
  const [w, h] = await item.evaluate((n: HTMLElement) => [parseFloat(n.style.width), parseFloat(n.style.height)]);
  expect(w / h).toBeCloseTo(4, 1);
});

test("an SVG file pasted from elsewhere stays an SVG", async ({ page }) => {
  await pasteFile(page, BRACKET);
  await expect(svgImages(page).last()).toBeVisible();
});

test("fits the whole drawing, rather than cropping it like a photo", async ({ page }) => {
  await pasteText(page, BRACKET);
  await expect(svgImages(page).last()).toHaveCSS("object-fit", "contain");
});

test("never runs a script inside one", async ({ page }) => {
  const nasty = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" onload="window.__pwned=1"><script>window.__pwned=1</script><image href="https://tracker.example/p.png"/><rect width="50" height="50"/></svg>`;
  const external: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("tracker.example")) external.push(r.url());
  });
  await pasteText(page, nasty);
  await expect(svgImages(page).last()).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(external).toEqual([]);
  // Shown as a picture, and never added to the page as markup.
  expect(await page.locator(".world svg rect").count()).toBe(0);
});

test("the sample pictures still fill their frames like photos", async ({ page }) => {
  await expect(page.getByTestId("item-image").first().locator("img")).toHaveCSS("object-fit", "cover");
  await expect(page.locator("img.is-svg")).toHaveCount(0);
});

test("ordinary text mentioning SVG still makes a note", async ({ page }) => {
  await pasteText(page, "Remember to export the <svg> files");
  await expect(page.getByTestId("item-sticky").filter({ hasText: "Remember to export" })).toBeVisible();
});

test("a broken file says so, rather than adding an empty frame", async ({ page }) => {
  const before = await page.getByTestId("item-image").count();
  await pasteFile(page, "this is not an svg");
  await expect(page.locator(".toast.error")).toBeVisible();
  expect(await page.getByTestId("item-image").count()).toBe(before);
});

test("is in the Library with its title, and can be undone off the board", async ({ page }) => {
  await pasteText(page, BRACKET);
  await expect(svgImages(page).last()).toBeVisible();
  const before = await page.getByTestId("item-image").count();
  await page.waitForTimeout(600);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("item-image")).toHaveCount(before - 1);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.locator(".lib-card").filter({ hasText: "Bracket" })).toBeVisible();
});
