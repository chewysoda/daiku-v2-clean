import { expect, Page, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

const board = (page: Page) => page.goto("/#/canvas/b-furniture");

async function addSticky(page: Page, text: string) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.locator(".viewport").click({ position: { x: 700, y: 120 } });
  await page.getByLabel("Sticky note text").fill(text);
  await page.locator(".viewport").click({ position: { x: 1000, y: 560 } });
  const sticky = page.getByTestId("item-sticky").filter({ hasText: text });
  await sticky.click();
  return sticky;
}

const itemCount = (page: Page, kind: string) => page.getByTestId(`item-${kind}`).count();

test.describe("sticky note styling", () => {
  test("changes colour with readable text, font, size, shape and tilt, and undoes", async ({ page }) => {
    await board(page);
    const sticky = await addSticky(page, "Style me");
    const bar = page.getByRole("toolbar", { name: "Style sticky" });

    await bar.getByRole("button", { name: "Colour #1E1F1C" }).click();
    await expect(sticky).toHaveCSS("background-color", "rgb(30, 31, 28)");
    await expect(sticky).toHaveCSS("color", "rgb(251, 250, 247)");

    await bar.getByLabel("Font").selectOption("hand");
    await expect(sticky).toHaveCSS("font-family", /Segoe Print/);

    await bar.getByRole("button", { name: "Larger" }).click();
    await expect(sticky).toHaveCSS("font-size", "18px");
    await expect(sticky.locator("p")).toHaveCSS("font-size", "18px");

    await bar.getByRole("button", { name: /Change shape/ }).click();
    await expect(sticky).toHaveCSS("border-radius", "18px");

    // Undo groups edits made in quick succession, so this one has to stand apart.
    await page.waitForTimeout(800);
    await bar.getByLabel("Tilt").fill("10");
    await expect.poll(() => sticky.evaluate((el) => el.style.transform)).toBe("rotate(10deg)");
    await page.waitForTimeout(800);

    await page.locator(".viewport").click({ position: { x: 1100, y: 700 } });
    await page.keyboard.press("Control+z");
    await expect.poll(() => sticky.evaluate((el) => el.style.transform)).not.toBe("rotate(10deg)");
    await expect(sticky).toHaveCSS("background-color", "rgb(30, 31, 28)");
  });

  test("keeps the style bar fully on screen for a note at the right edge", async ({ page }) => {
    await board(page);
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.mouse.click(1330, 300);
    await page.getByLabel("Sticky note text").fill("Edge");
    await page.mouse.click(700, 40);
    await page.getByTestId("item-sticky").filter({ hasText: "Edge" }).click();
    const more = page.getByRole("toolbar", { name: "Style sticky" }).getByRole("button", { name: "More" });
    const box = (await more.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    await more.click();
    await expect(page.getByRole("button", { name: /Bring to front/ })).toBeVisible();
  });

  test("gives the next new sticky the last colour you used", async ({ page }) => {
    await board(page);
    await addSticky(page, "First");
    await page.getByRole("toolbar", { name: "Style sticky" }).getByRole("button", { name: "Colour #B4D0F0" }).click();
    await page.locator(".viewport").click({ position: { x: 1100, y: 700 } });
    await addSticky(page, "Second");
    await expect(page.getByTestId("item-sticky").filter({ hasText: "Second" })).toHaveCSS("background-color", "rgb(180, 208, 240)");
  });

  test("leaves existing notes looking as they did", async ({ page }) => {
    await board(page);
    // No style of its own, so the stylesheet still decides how it looks.
    expect(await page.getByTestId("item-sticky").first().evaluate((el: HTMLElement) => el.style.background)).toBe("");
  });
});

test.describe("stickers", () => {
  const open = (page: Page) => page.getByRole("button", { name: "Sticker", exact: true }).click();

  test("makes your own, remembers it, and can edit it", async ({ page }) => {
    await board(page);
    await open(page);
    await page.getByLabel("New sticker text").fill("Ship it");
    await page.keyboard.press("Enter");
    const sticker = page.getByTestId("item-sticker").filter({ hasText: "Ship it" });
    await expect(sticker).toBeVisible();

    await open(page);
    await expect(page.getByRole("button", { name: "Ship it", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await sticker.dblclick();
    await page.getByLabel("Sticker text").fill("Shipped");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("item-sticker").filter({ hasText: "Shipped" })).toBeVisible();
  });

  test("adds emoji, and recolours word stickers", async ({ page }) => {
    await board(page);
    await open(page);
    await page.getByRole("button", { name: "Emoji 🔥" }).click();
    const fire = page.getByTestId("item-sticker").filter({ hasText: "🔥" });
    await expect(fire).toBeVisible();
    await expect(fire).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.getByRole("toolbar", { name: "Style sticker" }).getByRole("button", { name: "Larger" }).click();
    await expect(fire).toHaveCSS("font-size", "64px");

    await open(page);
    await page.getByRole("button", { name: "Verified", exact: true }).click();
    const word = page.getByTestId("item-sticker").filter({ hasText: "Verified" }).last();
    await page.getByRole("toolbar", { name: "Style sticker" }).getByRole("button", { name: "Colour #CFE3A6" }).click();
    await expect(word).toHaveCSS("background-color", "rgb(207, 227, 166)");
  });
});

test.describe("picture stickers", () => {
  const open = (page: Page) => page.getByRole("button", { name: "Sticker", exact: true }).click();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" rx="20" fill="#7A5FC0"/><script>window.hacked = true</script></svg>';
  // A 2 by 1 red PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR4nGP4z8DwHwQZYAwAR8oH+WUDX3AAAAAASUVORK5CYII=", "base64");
  const upload = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.getByLabel("Upload sticker pictures").setInputFiles(files);

  test("makes a sticker from an SVG, keeps its shape, and remembers it", async ({ page }) => {
    await board(page);
    await open(page);
    await upload(page, [{ name: "team-badge.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) }]);
    const sticker = page.getByTestId("item-sticker").filter({ has: page.getByRole("img", { name: "team badge" }) });
    await expect(sticker).toBeVisible();
    const box = (await sticker.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(2, 1);
    await expect(sticker).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // It's shown as a picture, so nothing inside the file runs.
    expect(await page.evaluate(() => (window as { hacked?: boolean }).hacked)).toBeUndefined();

    await page.getByRole("toolbar", { name: "Style sticker" }).getByRole("button", { name: "Larger" }).click();
    await expect.poll(async () => (await sticker.boundingBox())!.width).toBeGreaterThan(box.width * 1.3);

    await page.reload();
    await expect(page.getByTestId("item-sticker").getByRole("img", { name: "team badge" })).toBeVisible();
    await open(page);
    await page.getByRole("button", { name: "Picture sticker team badge", exact: true }).click();
    await expect(page.getByTestId("item-sticker").getByRole("img", { name: "team badge" })).toHaveCount(2);

    await open(page);
    await page.getByRole("button", { name: "Forget picture sticker team badge" }).click({ force: true });
    await expect(page.getByRole("button", { name: "Picture sticker team badge", exact: true })).toHaveCount(0);
    // Forgetting one only takes it off the menu.
    await expect(page.getByTestId("item-sticker").getByRole("img", { name: "team badge" })).toHaveCount(2);
  });

  test("takes PNGs, several at once, and turns away anything else", async ({ page }) => {
    await board(page);
    await open(page);
    await upload(page, [
      { name: "Red dot.png", mimeType: "image/png", buffer: png },
      { name: "second.png", mimeType: "image/png", buffer: png },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
      { name: "broken.svg", mimeType: "image/svg+xml", buffer: Buffer.from("not an svg") },
    ]);
    await expect(page.getByText("notes.txt: Stickers can be made from SVG or PNG files.")).toBeVisible();
    await expect(page.getByText("broken.svg: That doesn't look like an SVG file.")).toBeVisible();
    const sticker = page.getByTestId("item-sticker").getByRole("img", { name: "Red dot" });
    await expect(sticker).toBeVisible();
    expect(await sticker.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await open(page);
    await expect(page.getByRole("button", { name: /^Picture sticker / })).toHaveCount(2);
  });
});

test.describe("canvas quality of life", () => {
  test("the board can't be scrolled sideways out of place", async ({ page }) => {
    await board(page);
    await addSticky(page, "Anchor");
    for (const selector of [".viewport", ".canvas"]) {
      const left = await page.locator(selector).evaluate((el) => {
        el.scrollLeft = 500;
        return el.scrollLeft;
      });
      expect(left, selector).toBe(0);
    }
  });

  test("shows every emoji in the sticker menu in full", async ({ page }) => {
    await board(page);
    await page.getByRole("button", { name: "Sticker", exact: true }).click();
    const fits = await page.locator(".sticker-emoji").evaluate((grid) => {
      const edge = grid.getBoundingClientRect().right;
      return [...grid.children].every((b) => b.getBoundingClientRect().right <= edge + 0.5);
    });
    expect(fits).toBe(true);
    expect(await page.locator(".sticker-emoji").evaluate((g) => g.scrollWidth <= g.clientWidth)).toBe(true);
  });

  const position = (el: ReturnType<Page["getByTestId"]>) => el.evaluate((n: HTMLElement) => [parseFloat(n.style.left), parseFloat(n.style.top)]);

  test("nudges with the arrow keys", async ({ page }) => {
    await board(page);
    const sticky = await addSticky(page, "Nudge");
    const [x, y] = await position(sticky);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    await expect
      .poll(async () => {
        const [nx, ny] = await position(sticky);
        return [Math.round((nx - x) * 100) / 100, Math.round((ny - y) * 100) / 100];
      })
      .toEqual([1, 10]);
  });

  test("snaps to the grid when dragging, with G to toggle", async ({ page }) => {
    await board(page);
    const sticky = await addSticky(page, "Snap");
    await page.keyboard.press("g");
    await expect(page.locator(".toast")).toContainText("Snap to grid on");
    const box = (await sticky.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 77, box.y + 91, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const [x, y] = await position(sticky);
        return [Math.abs(Math.round(x) % 26), Math.abs(Math.round(y) % 26), Number.isInteger(x), Number.isInteger(y)];
      })
      .toEqual([0, 0, true, true]);
  });

  test("locks an item against moving, resizing and deleting", async ({ page }) => {
    await board(page);
    const sticky = await addSticky(page, "Locked");
    await page.keyboard.press("l");
    const before = await position(sticky);
    const box = (await sticky.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 140, { steps: 4 });
    await page.mouse.up();
    expect(await position(sticky)).toEqual(before);
    await sticky.click();
    await page.keyboard.press("ArrowLeft");
    expect(await position(sticky)).toEqual(before);
    await page.keyboard.press("Delete");
    await expect(sticky).toBeVisible();
    await page.keyboard.press("l");
    await page.keyboard.press("Delete");
    await expect(sticky).toHaveCount(0);
  });

  test("aligns a multiple selection", async ({ page }) => {
    await board(page);
    await addSticky(page, "One");
    await page.locator(".viewport").click({ position: { x: 1000, y: 560 } });
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.locator(".viewport").click({ position: { x: 900, y: 300 } });
    await page.getByLabel("Sticky note text").fill("Two");
    await page.locator(".viewport").click({ position: { x: 1000, y: 560 } });
    const one = page.getByTestId("item-sticky").filter({ hasText: "One" });
    const two = page.getByTestId("item-sticky").filter({ hasText: "Two" });
    await one.click();
    await two.click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Align top edges" }).click();
    await expect.poll(async () => (await position(one))[1] === (await position(two))[1]).toBe(true);
  });

  test("changes stacking order", async ({ page }) => {
    await board(page);
    const sticky = await addSticky(page, "Stack");
    const z = () => sticky.evaluate((n: HTMLElement) => Number(n.style.zIndex));
    const start = await z();
    await page.keyboard.press("[");
    await expect.poll(z).toBeLessThan(start);
    await page.keyboard.press("]");
    await expect.poll(z).toBeGreaterThanOrEqual(start);
  });

  test("copies and pastes items, and pastes text and pictures from elsewhere", async ({ page }) => {
    await board(page);
    await addSticky(page, "Copy me");
    const paste = (data: Record<string, string>, png = false) =>
      page.evaluate(
        async ([d, withPng]) => {
          const dt = new DataTransfer();
          for (const [k, v] of Object.entries(d as Record<string, string>)) dt.setData(k, v);
          if (withPng) {
            const c = document.createElement("canvas");
            c.width = c.height = 40;
            const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
            dt.items.add(new File([blob], "image.png", { type: "image/png" }));
          }
          window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
        },
        [data, png] as const,
      );
    const copied = await page.evaluate(() => {
      const dt = new DataTransfer();
      window.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData("application/x-daiku-items");
    });
    expect(copied).toContain("Copy me");

    await paste({ "application/x-daiku-items": copied, "text/plain": "Copy me" });
    await expect(page.getByTestId("item-sticky").filter({ hasText: "Copy me" })).toHaveCount(2);

    await paste({ "text/plain": "From another app" });
    await expect(page.getByTestId("item-sticky").filter({ hasText: "From another app" })).toBeVisible();

    const images = await itemCount(page, "image");
    await paste({}, true);
    await expect.poll(() => itemCount(page, "image")).toBe(images + 1);
  });

  test("ignores pasted items that are malformed", async ({ page }) => {
    await board(page);
    await expect(page.getByTestId("item-sticky").first()).toBeVisible();
    const stickies = await itemCount(page, "sticky");
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("application/x-daiku-items", '[{"kind":"connector"},{"kind":"sticky","x":"NaN"}]');
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    });
    await page.waitForTimeout(200);
    expect(await itemCount(page, "sticky")).toBe(stickies);
  });
});

test.describe("general customisation", () => {
  test("changes the accent colour, and resets it", async ({ page }) => {
    await page.goto("/#/settings");
    const root = page.locator("html");
    const accent = () => root.evaluate((el) => el.style.getPropertyValue("--c-accent"));
    await page.getByRole("button", { name: "Accent Blue" }).click();
    await expect.poll(accent).not.toBe("");
    await page.getByRole("button", { name: "Accent Neutral" }).click();
    await expect.poll(accent).toBe("");
  });

  test("turns animations off", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Animations").selectOption("off");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.goto("/#/threads");
    await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
  });

  test("changes the canvas grid", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("Canvas grid").selectOption("lines");
    await page.goto("/#/home");
    await page.getByRole("link", { name: "Continue Furniture Study" }).click();
    await expect(page.locator(".line-grid")).toBeVisible();
    await expect(page.locator(".dot-grid")).toHaveCount(0);
  });

  test("can reopen on the last screen", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByLabel("When Daiku opens").selectOption("last");
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await page.waitForTimeout(200);
    // A fresh window, as going to "/" in this one would itself count as the last screen.
    const fresh = await page.context().newPage();
    await fresh.goto("/");
    await expect(fresh).toHaveURL(/#\/library/);
  });
});

test.describe("keyboard", () => {
  test("shows a shortcuts list on ?, and closes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toContainText("Sticky note");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("doesn't open the list while typing", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByPlaceholder("Your name").fill("a?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Your name")).toHaveValue("a?");
  });

  test("moves between screens with Ctrl and a number", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await page.keyboard.press("Control+2");
    await expect(page).toHaveURL(/#\/library/);
    await page.keyboard.press("Control+4");
    await expect(page).toHaveURL(/#\/handoff/);
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/#\/handoff/);
    await page.keyboard.press("Control+,");
    await expect(page).toHaveURL(/#\/settings/);
  });
});
