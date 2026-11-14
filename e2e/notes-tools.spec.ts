import { expect, Page, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/#/notes");
  await expect(page.getByLabel("Note title")).toHaveValue("Why bouclé");
});

const body = (page: Page) => page.getByLabel("Note body");
const tools = (page: Page) => page.getByRole("toolbar", { name: "Note tools" });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==", "base64");

async function draw(page: Page, points: [number, number][]) {
  const box = (await page.getByTestId("write-pad").boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}

test("wraps a selection as a formula and typesets it", async ({ page }) => {
  await body(page).fill("E = mc^2");
  await body(page).selectText();
  await tools(page).getByRole("button", { name: "Formula", exact: true }).click();
  await expect(body(page)).toHaveValue("$E = mc^2$");
  await expect(page.getByTestId("note-preview").locator(".katex")).toBeVisible();
});

test("a block formula's placeholder can be typed straight over", async ({ page }) => {
  await body(page).fill("");
  await tools(page).getByRole("button", { name: "Block formula" }).click();
  await page.waitForTimeout(50);
  await page.keyboard.type("y^2");
  await expect(body(page)).toHaveValue("$$\ny^2\n$$");
  await expect(page.getByTestId("note-preview").locator(".katex-display")).toBeVisible();
});

test("LaTeX snippets go in where the cursor is, and undo like typing", async ({ page }) => {
  await body(page).fill("area ");
  await body(page).press("End");
  await tools(page).getByLabel("Insert LaTeX").selectOption({ label: "π pi" });
  await expect(body(page)).toHaveValue("area $\\pi$");
  await body(page).press("Control+z");
  await expect(body(page)).toHaveValue("area ");
});

test("a bad formula shows as red source rather than breaking the note", async ({ page }) => {
  await body(page).fill("$\\frac{$ and more");
  await expect(page.getByTestId("note-preview").locator(".katex-error")).toBeVisible();
  await expect(page.getByLabel("Note title")).toBeVisible();
});

test("writes by hand, reads it as LaTeX on this machine, and inserts only after review", async ({ page }) => {
  test.setTimeout(180000);
  const external: string[] = [];
  page.on("request", (r) => {
    if (!["localhost", ""].includes(new URL(r.url()).hostname)) external.push(r.url());
  });
  await body(page).fill("Before");
  await tools(page).getByRole("button", { name: "Write by hand" }).click();
  const dialog = page.getByRole("dialog", { name: "Write by hand" });
  await expect(dialog.getByRole("button", { name: "Read as LaTeX" })).toBeDisabled();
  await draw(page, [[0.3, 0.3], [0.5, 0.8]]);
  await draw(page, [[0.5, 0.3], [0.3, 0.8]]);
  await draw(page, [[0.55, 0.15], [0.62, 0.1], [0.66, 0.2], [0.55, 0.38], [0.68, 0.38]]);
  await dialog.getByRole("button", { name: "Read as LaTeX" }).click();
  await expect(dialog.getByLabel("What was read")).not.toHaveValue("", { timeout: 150000 });
  await expect(dialog.getByTestId("capture-preview").locator(".katex")).toBeVisible();
  await expect(body(page)).toHaveValue("Before");
  await dialog.getByLabel("What was read").fill("x^2");
  await dialog.getByRole("button", { name: "Insert in note" }).click();
  await expect(body(page)).toHaveValue("Before\n\n$$\nx^2\n$$");
  expect(external).toEqual([]);
});

test("the pad's strokes can be taken back", async ({ page }) => {
  await tools(page).getByRole("button", { name: "Write by hand" }).click();
  const dialog = page.getByRole("dialog", { name: "Write by hand" });
  await draw(page, [[0.3, 0.3], [0.5, 0.8]]);
  await expect(dialog.getByRole("button", { name: "Read as text" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Undo stroke" }).click();
  await expect(dialog.getByRole("button", { name: "Read as text" })).toBeDisabled();
});

test("a chosen picture is shown for reading, and says plainly when text needs the desktop app", async ({ page }) => {
  await tools(page).getByLabel("Choose a picture to read").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  const dialog = page.getByRole("dialog", { name: "Read a picture" });
  await expect(dialog.getByRole("img", { name: "The picture to read" })).toBeVisible();
  await dialog.getByRole("button", { name: "Read as text" }).click();
  await expect(dialog.getByRole("alert")).toContainText("desktop app");
  await expect(dialog.getByRole("button", { name: "Insert in note" })).toBeDisabled();
});

test("pasting a picture into a note opens it for reading, and never adds an image", async ({ page }) => {
  await body(page).fill("Keep me");
  await body(page).evaluate((el) => {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    return new Promise<void>((resolve) =>
      c.toBlob((blob) => {
        const data = new DataTransfer();
        data.items.add(new File([blob!], "snip.png", { type: "image/png" }));
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        resolve();
      }),
    );
  });
  const dialog = page.getByRole("dialog", { name: "Read a picture" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(body(page)).toHaveValue("Keep me");
});
