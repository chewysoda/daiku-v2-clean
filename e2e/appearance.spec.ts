import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const FONT = "node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2";
const FONT_2 = "node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2";
const FONT_3 = "node_modules/@fontsource/comfortaa/files/comfortaa-latin-600-normal.woff2";
const IMAGE = "src-tauri/icons/128x128.png";
const VIDEO = "e2e/fixtures/loop.webm";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function choose(page: Page, button: string, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: button }).click()]);
  await chooser.setFiles(file);
}

test.describe("cutting mat themes", () => {
  test("recolours the app, and draws a mat with rulers on the canvas", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Theme").selectOption("mat-blue");
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-mat", "blue");
    await expect(root).toHaveAttribute("data-theme", "dark");
    expect(await root.evaluate((el) => getComputedStyle(el).getPropertyValue("--c-bg").trim())).toBe("#16324B");

    await page.goto("/#/home");
    await page.getByRole("link", { name: "Continue Furniture Study" }).click();
    const mat = page.getByTestId("cutting-mat");
    await expect(mat).toBeVisible();
    // Something was really drawn, in the mat's colour.
    await expect
      .poll(() =>
        mat.evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(c.width / 2 + 3, c.height / 2 + 3, 1, 1).data].slice(0, 3).join()),
      )
      .toBe("28,63,94");
  });

  test("goes back to plain themes cleanly", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Theme").selectOption("mat-rose");
    await page.getByLabel("Theme").selectOption("light");
    const root = page.locator("html");
    await expect(root).not.toHaveAttribute("data-mat");
    expect(await root.evaluate((el) => el.style.getPropertyValue("--c-bg"))).toBe("");
    await page.goto("/#/home");
    await page.getByRole("link", { name: "Continue Furniture Study" }).click();
    await expect(page.getByTestId("item-sticky").first()).toBeVisible();
    await expect(page.getByTestId("cutting-mat")).toHaveCount(0);
  });

  test("is remembered after a reload", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Theme").selectOption("mat-green");
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-mat", "green");
    await expect(page.getByLabel("Theme")).toHaveValue("mat-green");
  });
});

test.describe("custom fonts", () => {
  test("imports a different font for each slot", async ({ page }) => {
    await page.goto("/#/settings");
    const root = page.locator("html");
    const slots = [
      ["Import interface font", "Interface font", "--font-ui", FONT, "dm mono latin 400 normal"],
      ["Import heading font", "Heading font", "--font-display", FONT_2, "dm mono latin 500 normal"],
      ["Import data font", "Data font", "--font-mono", FONT_3, "comfortaa latin 600 normal"],
    ];
    for (const [button, select, token, file, family] of slots) {
      await choose(page, button, file);
      await expect(page.getByLabel(select, { exact: true })).toHaveValue(family);
      await expect.poll(() => root.evaluate((el, t) => el.style.getPropertyValue(t), token)).toContain(family);
    }
    // Each stayed on its own slot, and all three can be picked anywhere.
    await expect(page.getByLabel("Interface font", { exact: true })).toHaveValue(slots[0][4]);
    await expect(page.getByLabel("Heading font", { exact: true })).toHaveValue(slots[1][4]);
    await expect(page.getByRole("list", { name: "Your fonts" }).getByRole("button")).toHaveCount(3);
    await page.getByLabel("Data font", { exact: true }).selectOption(slots[0][4]);
    await expect(page.getByLabel("Data font", { exact: true })).toHaveValue(slots[0][4]);
  });

  test("keeps each import button beside its font menu", async ({ page }) => {
    // Reduced motion, as rows measured while rising into place would differ from one another.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/settings");
    for (const name of ["Interface font", "Heading font", "Data font"]) {
      // Retried, as fonts settling can shift a row between the two measurements.
      await expect(async () => {
        const select = (await page.getByLabel(name, { exact: true }).boundingBox())!;
        const button = (await page.getByRole("button", { name: `Import ${name.toLowerCase()}` }).boundingBox())!;
        expect(Math.abs(select.y + select.height / 2 - (button.y + button.height / 2))).toBeLessThan(2);
        expect(button.x).toBeGreaterThanOrEqual(select.x + select.width);
      }).toPass({ timeout: 5000 });
    }
  });

  test("removing a font resets only the slots using it", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Import interface font", FONT);
    await choose(page, "Import heading font", FONT_2);
    await page.getByRole("button", { name: "Remove dm mono latin 400 normal" }).click();
    await expect(page.getByLabel("Interface font", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Heading font", { exact: true })).toHaveValue("dm mono latin 500 normal");
  });

  test("imports a font, applies it to the interface, and removes it", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Import interface font", FONT);
    const family = "dm mono latin 400 normal";
    await expect(page.getByRole("list", { name: "Your fonts" })).toContainText(family);

    const body = page.locator("body");
    await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily)).toContain(family);
    expect(await page.evaluate((f) => document.fonts.check(`16px "${f}"`), family)).toBe(true);

    await page.getByRole("button", { name: `Remove ${family}` }).click();
    await expect(page.getByLabel("Interface font", { exact: true })).toHaveValue("");
    await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Segoe UI Variable");
  });

  test("refuses a file that isn't a font", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Import interface font", { name: "fake.ttf", mimeType: "font/ttf", buffer: Buffer.from("not a font") });
    await expect(page.locator(".toast.error")).toContainText("couldn't be read as a font");
    await expect(page.getByRole("list", { name: "Your fonts" })).toHaveCount(0);
    await expect(page.getByLabel("Interface font", { exact: true })).toHaveValue("");
  });

  test("offers fonts already on the PC", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Heading font", { exact: true }).selectOption("Georgia");
    await expect.poll(() => page.locator("html").evaluate((el) => el.style.getPropertyValue("--font-display"))).toContain("Georgia");
  });
});

test.describe("background image and video", () => {
  test("shows an image behind the app, dimmed, and removes it", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Choose…", IMAGE);
    const backdrop = page.getByTestId("backdrop");
    await expect(backdrop.locator("img")).toBeVisible();
    await expect.poll(() => backdrop.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

    // The app's own background has to step aside, or the image would never show.
    expect(await page.locator(".shell").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

    await page.getByLabel("Background dimming").fill("50");
    expect(await page.locator("html").evaluate((el) => el.style.getPropertyValue("--backdrop-dim"))).toBe("0.5");

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(backdrop).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-backdrop");
  });

  test("plays a muted looping video, and can pause it", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Choose…", VIDEO);
    const video = page.getByTestId("backdrop").locator("video");
    await expect(video).toBeVisible();
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted && v.loop)).toBe(true);
    const time = () => video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect.poll(time).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

    await page.getByLabel("Pause background video").check();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });

  // A background video is the person's own choice, so the system's reduce-motion setting (which
  // Windows turns on with "Animation effects" off) doesn't stop it; Daiku's own Motion setting does.
  test("keeps a chosen video playing under system reduced motion, and stops it when Daiku's animations are off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/settings");
    await choose(page, "Choose…", VIDEO);
    const video = page.getByTestId("backdrop").locator("video");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await page.getByLabel("Animations").selectOption("off");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });

  test("falls back to the plain theme if the file is damaged", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Choose…", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("nope") });
    await expect(page.locator("html")).not.toHaveAttribute("data-backdrop");
  });

  test("refuses other file types", async ({ page }) => {
    await page.goto("/#/settings");
    await choose(page, "Choose…", { name: "a.txt", mimeType: "text/plain", buffer: readFileSync(IMAGE) });
    await expect(page.locator(".toast.error")).toBeVisible();
    await expect(page.getByTestId("backdrop")).toHaveCount(0);
  });
});

test.describe("TeX and LaTeX", () => {
  test("double-clicking a plain sticky opens it for editing", async ({ page }) => {
    await page.goto("/#/canvas/b-furniture");
    await page.getByTestId("item-sticky").first().dblclick();
    await expect(page.getByLabel("Sticky note text")).toBeVisible();
  });

  test("typesets math in a sticky note, and keeps the source for editing", async ({ page }) => {
    await page.goto("/#/canvas/b-furniture");
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.locator(".viewport").click({ position: { x: 500, y: 300 } });
    const source = String.raw`Stress: $\sigma = \frac{F}{A}$`;
    await page.getByLabel("Sticky note text").fill(source);
    await page.locator(".viewport").click({ position: { x: 900, y: 600 } });
    const sticky = page.getByTestId("item-sticky").filter({ hasText: "Stress" });
    await expect(sticky.locator(".katex")).toBeVisible();
    // KaTeX's fonts and sizing really applied: a fraction is taller than a line of text.
    await expect(sticky.locator(".katex .mfrac")).toBeVisible();
    await sticky.dblclick();
    await expect(page.getByLabel("Sticky note text")).toHaveValue(source);
  });

  test("previews math in a note, leaves prices alone, and shows errors without breaking", async ({ page }) => {
    await page.goto("/#/notes");
    await page.getByRole("button", { name: "Note", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByRole("textbox").fill("Maths");
    await dialog.getByRole("button", { name: "Create" }).click();
    const body = page.getByLabel("Note body");

    await body.fill("It costs $5 or $10");
    await expect(page.getByTestId("note-preview")).toHaveCount(0);

    await body.fill(String.raw`Energy $$E = mc^2$$ and a typo $\frac{1$`);
    const preview = page.getByTestId("note-preview");
    await expect(preview.locator(".katex-display")).toBeVisible();
    await expect(preview.locator(".katex-error")).toBeVisible();
  });

  test("previews Markdown, and keeps links from navigating the app away", async ({ page }) => {
    await page.goto("/#/notes");
    await page.getByRole("button", { name: "Note", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByRole("textbox").fill("Formatted");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.getByLabel("Note body").fill("# Big\n\n**bold** [a link](https://example.com)\n\n![tracker](https://tracker.example/p.png)");
    const md = page.getByTestId("markdown");
    await expect(md.locator("h1")).toHaveText("Big");
    await expect(md.locator("strong")).toHaveText("bold");
    await expect(md.locator("img")).toHaveCount(0);
    const url = page.url();
    const popup = page.waitForEvent("popup").catch(() => null);
    await md.locator("a").click();
    await popup;
    expect(page.url()).toBe(url);
  });

  test("loads nothing from the network, and only when math is present", async ({ page }) => {
    const external: string[] = [];
    let katexLoaded = false;
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.hostname !== "localhost") external.push(r.url());
      if (/katex/i.test(url.pathname)) katexLoaded = true;
    });
    await page.goto("/#/threads");
    await page.waitForTimeout(400);
    expect(katexLoaded).toBe(false);
    expect(external).toEqual([]);
  });
});
