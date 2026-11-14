import { expect, Page, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

const strip = (page: Page) => page.getByRole("list", { name: "Research tabs" });
const openPdf = async (page: Page) => {
  await page.getByRole("button", { name: "Open a PDF in a new tab" }).click();
  await page.getByRole("dialog", { name: "Open a PDF" }).getByRole("button", { name: /Rocking-chair|study|Study/i }).first().click();
};

test.describe("research tabs", () => {
  test("opens up to five tabs of any kind, then says why it can't", async ({ page }) => {
    await page.goto("/#/explore");
    await expect(strip(page).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "New web tab" }).click();
    await openPdf(page);
    await expect(strip(page).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "New draft in a tab" }).click();
    await page.getByRole("dialog", { name: "New draft" }).getByRole("textbox").fill("Findings");
    await page.getByRole("dialog", { name: "New draft" }).getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: "New web tab" }).click();
    await expect(strip(page).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "New web tab" })).toBeDisabled();
    await expect(page.getByTestId("tab-count")).toHaveText("5 of 5");
  });

  test("keeps tabs while visiting other screens, and closes them", async ({ page }) => {
    await page.goto("/#/explore");
    await page.getByRole("button", { name: "New web tab" }).click();
    await expect(strip(page).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search or run a command").fill("Go to Explore");
    await page.keyboard.press("Enter");
    await expect(strip(page).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Close tab 2" }).click();
    await expect(strip(page).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Close tab 1" }).click();
    await expect(strip(page).getByRole("listitem")).toHaveCount(1);
  });

  test("reads a PDF in a tab, with its highlights side panel", async ({ page }) => {
    await page.goto("/#/explore");
    await openPdf(page);
    await expect(page.getByTestId("pdf-page").locator("canvas")).toBeVisible();
    await expect(strip(page).locator('[aria-current="true"]')).toContainText(/study/i);
    await expect(page.getByRole("complementary", { name: "Highlights" })).toBeVisible();
  });
});

test.describe("snips in a PDF", () => {
  test("drags out a snip, and offers it with the document's credit and page", async ({ page }) => {
    await page.goto("/#/reader/a-paper");
    const pdf = page.getByTestId("pdf-page");
    await expect(pdf.locator("canvas")).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Snip", exact: true }).click();
    const overlay = page.getByTestId("snip-overlay");
    await expect(overlay).toBeVisible();
    const box = (await overlay.boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 220, { steps: 5 });
    await page.mouse.up();
    const tray = page.getByRole("complementary", { name: "Save to Library" });
    await expect(tray).toBeVisible();
    await expect(tray.getByRole("img", { name: "Your snip" })).toBeVisible();
    const size = await tray.getByRole("img", { name: "Your snip" }).evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]);
    expect(size[0]).toBeGreaterThan(100);
    await expect(tray.getByLabel("Credit")).not.toHaveValue("");
    await expect(tray).toContainText(", p. 1");
  });

  test("Escape cancels a snip and brings the highlights back", async ({ page }) => {
    await page.goto("/#/reader/a-paper");
    await expect(page.getByTestId("pdf-page").locator("canvas")).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Snip", exact: true }).click();
    await expect(page.getByTestId("snip-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("snip-overlay")).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Highlights" })).toBeVisible();
  });
});

test.describe("drafting", () => {
  const start = async (page: Page, title = "Findings") => {
    await page.goto("/#/draft");
    await page.getByRole("button", { name: "New draft" }).click();
    await page.getByRole("dialog", { name: "New draft" }).getByRole("textbox").fill(title);
    await page.getByRole("dialog", { name: "New draft" }).getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Draft title")).toHaveValue(title);
  };

  test("writes with live Markdown and LaTeX, and keeps it after a restart", async ({ page }) => {
    await start(page);
    await page.getByLabel("Draft body").fill("# Result\n\nThe load is $\\frac{F}{A}$ here");
    await expect(page.getByTestId("draft-preview").locator("h1")).toHaveText("Result");
    await expect(page.getByTestId("draft-preview").locator(".katex")).toBeVisible();
    await expect(page.getByTestId("draft-words")).toHaveText("7 words");
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByLabel("Draft body")).toHaveValue(/# Result/);
  });

  test("inserts research with its credit, and shows a picture from the Library", async ({ page }) => {
    await start(page);
    const side = page.getByRole("complementary", { name: "From your research" });
    await side.getByRole("button", { name: /^Insert picture/ }).first().click();
    await expect(page.getByLabel("Draft body")).toHaveValue(/!\[\[.+\]\]\n\n\*Figure: /);
    await expect(page.getByTestId("draft-preview").locator(".draft-figure img")).toBeVisible();
  });

  test("goes in the pack", async ({ page }) => {
    await start(page, "Write-up");
    await page.getByLabel("Draft body").fill("Body text");
    await page.waitForTimeout(250);
    await page.goto("/#/handoff");
    await expect(page.locator(".ho-group.included")).toContainText("Write-up");
    await expect(page.getByRole("region", { name: "Pack tray" })).not.toContainText("0 items");
  });

  test("opens from the palette, and in a research tab", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search or run a command").fill("Drafting");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Drafting" })).toBeVisible();
    await page.goto("/#/explore");
    await page.getByRole("button", { name: "New draft in a tab" }).click();
    await page.getByRole("dialog", { name: "New draft" }).getByRole("textbox").fill("Tabbed");
    await page.getByRole("dialog", { name: "New draft" }).getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Draft title")).toHaveValue("Tabbed");
    await expect(strip(page).locator('[aria-current="true"]')).toContainText("Tabbed");
  });
});

test.describe("the PDF reader matches web research", () => {
  const ready = async (page: Page) => {
    await page.goto("/#/reader/a-paper");
    await expect(page.getByTestId("pdf-page").locator("canvas")).toBeVisible();
    await expect(page.locator(".textLayer span", { hasText: "Background" })).toBeVisible();
  };
  const select = async (page: Page) => {
    await page.locator(".textLayer span", { hasText: "Background" }).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  };

  test("saves highlighted text as a quote, with its credit", async ({ page }) => {
    await ready(page);
    await select(page);
    await page.getByRole("button", { name: "Save quote" }).click();
    const tray = page.getByRole("complementary", { name: "Save to Library" });
    await expect(tray.getByLabel("Highlighted text")).toHaveValue(/Background/);
    await expect(tray.getByLabel("Credit")).not.toHaveValue("");
    await tray.getByRole("button", { name: /^Save text/ }).click();
    await page.goto("/#/library");
    await page.getByRole("button", { name: "Quotes" }).click();
    await expect(page.getByRole("figure").filter({ hasText: "Background" })).toBeVisible();
  });

  test("saves the whole page as a picture", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Save page" }).click();
    await expect(page.getByRole("complementary", { name: "Save to Library" }).getByRole("img", { name: "Your snip" })).toBeVisible();
  });

  test("zooms, redrawing the page, and fits the width", async ({ page }) => {
    await ready(page);
    const width = () => page.getByTestId("pdf-page").evaluate((el) => el.getBoundingClientRect().width);
    const before = await width();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByTestId("reader-zoom")).toHaveText("150%");
    await expect.poll(width).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(page.getByTestId("reader-zoom")).toHaveText("100%");
    await page.getByTestId("reader-zoom").click();
    await expect(page.getByTestId("reader-zoom")).not.toHaveText("100%");
  });

  test("finds text across pages and marks it", async ({ page }) => {
    await ready(page);
    await page.getByLabel("Find in this PDF").fill("Background");
    await page.getByLabel("Find in this PDF").press("Enter");
    await expect(page.getByTestId("find-count")).toContainText("1 result");
    await expect(page.locator(".textLayer .find-hit")).toHaveCount(1);
    await page.getByLabel("Find in this PDF").fill("zzzzz");
    await page.getByLabel("Find in this PDF").press("Enter");
    await expect(page.getByTestId("find-count")).toContainText("0 results");
    await expect(page.locator(".textLayer .find-hit")).toHaveCount(0);
  });

  test("works the same in a research tab", async ({ page }) => {
    await page.goto("/#/explore");
    await openPdf(page);
    await expect(page.getByRole("button", { name: "Save page" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snip", exact: true })).toBeVisible();
    await expect(page.getByLabel("Find in this PDF")).toBeVisible();
  });
});

test("Escape closes the PDF picker and the writing pad, without clicking in them first", async ({ page }) => {
  await page.goto("/#/explore");
  await page.getByRole("button", { name: "Open a PDF in a new tab" }).click();
  await expect(page.getByRole("dialog", { name: "Open a PDF" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Open a PDF" })).toHaveCount(0);
  await page.goto("/#/notes");
  await page.getByRole("button", { name: "Write by hand" }).click();
  await expect(page.getByRole("dialog", { name: "Write by hand" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Write by hand" })).toHaveCount(0);
});

