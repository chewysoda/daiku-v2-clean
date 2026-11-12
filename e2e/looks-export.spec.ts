import { expect, Page, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const IMAGE = "src-tauri/icons/128x128.png";

async function pickImage(page: Page) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Use my image or video…" }).click()]);
  await chooser.setFiles(IMAGE);
}

test.describe("suggested themes", () => {
  test("applies a theme, accent and background together, and shows which is on", async ({ page }) => {
    await page.goto("/#/settings");
    const card = page.getByRole("button", { name: "Use the Blueprint look" });
    await card.click();
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-mat", "blue");
    await expect(root).toHaveAttribute("data-backdrop", "on");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    const art = page.getByTestId("backdrop").locator("img");
    await expect.poll(() => art.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    expect(await root.evaluate((el) => el.style.getPropertyValue("--c-accent"))).not.toBe("");

    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole("button", { name: "Use the Blueprint look" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.getByTestId("backdrop").locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });

  test("every suggested background really loads", async ({ page }) => {
    await page.goto("/#/settings");
    const group = page.getByRole("group", { name: "Suggested looks" });
    const thumbs = group.locator("img");
    // Four drawn backgrounds and the Steins;Gate picture, plus the Roommates video.
    await expect(thumbs).toHaveCount(5);
    for (const t of await thumbs.all()) {
      await expect.poll(() => t.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    }
    const video = group.locator("video");
    await expect(video).toHaveCount(1);
    await group.getByRole("button", { name: /Roommates/ }).hover();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(1);
  });

  test("suggests looks from your own image, using its colours", async ({ page }) => {
    await page.goto("/#/settings");
    await pickImage(page);
    const group = page.getByRole("group", { name: "Looks from your image" });
    await expect(group.getByRole("button")).toHaveCount(3);
    await group.getByRole("button").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-backdrop", "on");
    await expect(page.getByTestId("backdrop").locator("img")).toBeVisible();
    await expect(group.getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  });

  test("saves your own look, brings it back, and forgets it", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Use the Paper look" }).click();
    await page.getByRole("button", { name: "Save this look…" }).click();
    const dialog = page.getByRole("dialog", { name: "Save this look" });
    await dialog.getByRole("textbox").fill("Mine");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Use the Blueprint look" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-mat", "blue");
    await page.getByRole("button", { name: "Use the Mine look" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-mat");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Forget the Mine look" }).click();
    await expect(page.getByRole("button", { name: "Use the Mine look" })).toHaveCount(0);
  });

  test("the rest of the theme settings still work after choosing one", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Use the Blueprint look" }).click();
    await page.getByLabel("Theme").selectOption("light");
    await expect(page.locator("html")).not.toHaveAttribute("data-mat");
    await expect(page.getByRole("button", { name: "Use the Blueprint look" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByTestId("backdrop")).toHaveCount(0);
  });
});

test.describe("export formats", () => {
  const exportZip = async (page: Page) => {
    await expect(page.getByTestId("export-count")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export|Save/ }).last().click()]);
    const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
    return { names: Object.keys(files), text: (p: string) => strFromU8(files[p]), raw: (p: string) => files[p] };
  };

  test("gives each kind of data the formats that suit it, and files stay files", async ({ page }) => {
    await page.goto("/#/export");
    const zip = await exportZip(page);
    for (const f of ["data/weightage.csv", "data/graphs-nodes.csv", "data/graphs-edges.csv", "data/graphs.graphml", "data/research.md", "data/moodboards.md", "data/contacts.csv", "sources.csv", "README.txt"]) {
      expect(zip.names, f).toContain(f);
    }
    expect(zip.names).toContain("data/weightage.json");
    expect(zip.text("README.txt")).toContain("can't sensibly go inside a data file");
    // Pictures aren't smuggled into data files as encoded text.
    for (const name of zip.names.filter((n) => /\.(json|csv|md)$/.test(n))) {
      expect(zip.text(name), name).not.toContain("base64,");
    }
  });

  test("lets you turn a format off, even JSON, and the preview agrees", async ({ page }) => {
    await page.goto("/#/export");
    await page.getByRole("checkbox", { name: "Weightage as JSON" }).uncheck();
    await page.getByRole("checkbox", { name: "Weightage as Markdown" }).check();
    const list = page.getByRole("list", { name: "Files in the zip" });
    await expect(list).toContainText("weightage.md");
    await expect(list).not.toContainText("weightage.json");
    const zip = await exportZip(page);
    expect(zip.names).toContain("data/weightage.md");
    expect(zip.names).not.toContain("data/weightage.json");
    expect(zip.names).toContain("data/weightage.csv");
  });

  test("remembers the formats you chose", async ({ page }) => {
    await page.goto("/#/export");
    await page.getByRole("checkbox", { name: "Contacts as CSV" }).uncheck();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Contacts as CSV" })).not.toBeChecked();
  });
});

test.describe("image formats", () => {
  const MAGIC: [string, string, number[]][] = [
    ["png", ".png", [0x89, 0x50, 0x4e, 0x47]],
    ["jpg", ".jpg", [0xff, 0xd8, 0xff]],
    ["webp", ".webp", [0x52, 0x49, 0x46, 0x46]],
    ["gif", ".gif", [0x47, 0x49, 0x46, 0x38]],
    ["bmp", ".bmp", [0x42, 0x4d]],
    ["tiff", ".tiff", [0x49, 0x49, 0x2a, 0x00]],
    ["ico", ".ico", [0x00, 0x00, 0x01, 0x00]],
  ];
  for (const [format, ending, magic] of MAGIC) {
    test(`writes real ${format.toUpperCase()} files`, async ({ page }) => {
      await page.goto("/#/export");
      await page.getByLabel("Image format").selectOption(format);
      const list = page.getByRole("list", { name: "Files in the zip" });
      await expect(list).toContainText(ending);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export zip" }).click()]);
      const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
      const images = Object.keys(files).filter((n) => n.startsWith("images/"));
      expect(images.length).toBeGreaterThan(0);
      for (const name of images) {
        expect(name.endsWith(ending), name).toBe(true);
        expect([...files[name].slice(0, magic.length)], name).toEqual(magic);
      }
    });
  }

  test("the browser can open what was converted", async ({ page }) => {
    await page.goto("/#/export");
    for (const format of ["bmp", "gif", "ico"]) {
      await page.getByLabel("Image format").selectOption(format);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export zip" }).click()]);
      const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
      const name = Object.keys(files).find((n) => n.startsWith("images/"))!;
      const size = await page.evaluate(async ([bytes, type]) => {
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([new Uint8Array(bytes as number[])], { type: type as string }));
        await img.decode();
        return img.naturalWidth;
      }, [[...files[name]], format === "ico" ? "image/x-icon" : `image/${format}`] as const);
      expect(size, format).toBeGreaterThan(0);
    }
  });

  test("originals are the default, and Python is an extra data format", async ({ page }) => {
    await page.goto("/#/export");
    await expect(page.getByLabel("Image format")).toHaveValue("original");
    await page.getByRole("checkbox", { name: "Weightage as Python" }).check();
    await expect(page.getByRole("list", { name: "Files in the zip" })).toContainText("weightage.py");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export zip" }).click()]);
    const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
    expect(strFromU8(files["data/weightage.py"])).toContain("DATA = {");
    expect(Object.keys(files).filter((n) => n.startsWith("images/")).every((n) => n.endsWith(".svg"))).toBe(true);
  });
});
