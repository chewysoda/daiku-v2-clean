import { readFileSync } from "node:fs";
import { expect, Page, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function exportZip(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export zip" }).click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  return { name: download.suggestedFilename(), names: Object.keys(files), json: (f: string) => JSON.parse(strFromU8(files[f])) };
}

/** A second project, with a board of its own, made the way a person would. */
async function newProject(page: Page, name: string) {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "Manage projects" }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: "New project…" }).click();
  const start = page.getByRole("dialog", { name: "New project" });
  await start.getByRole("textbox").fill(name);
  await start.getByText("Website", { exact: true }).click();
  await start.getByRole("button", { name: "Create project" }).click();
  await expect(page.locator(".board-project")).toHaveText(name);
}

test.describe("export page", () => {
  test("names files and folders, organises pictures, and zips it", async ({ page }) => {
    await page.goto("/#/export");
    await expect(page.getByLabel("Export from")).toHaveValue("pr-esp32");
    await page.getByLabel("Name of the zip").fill("ESP32 handoff");
    await page.getByLabel("Folder for Weightage").fill("decisions");
    await page.getByLabel("File name for Weightage").fill("code target weights");
    await page.getByLabel("Include Contacts").uncheck();
    await page.getByLabel("Pictures folder").fill("photos");
    await page.getByLabel("Organise pictures").selectOption({ label: "A folder per kind" });
    await page.getByText(/Choose and name files one by one/).click();
    await page.getByLabel("Include ESP32 die shot").uncheck();
    await page.getByLabel("File name for ESP32 dev board").fill("hero");
    await expect(page.getByRole("list", { name: "Files in the zip" })).toContainText("code target weights.json");
    const zip = await exportZip(page);
    expect(zip.name).toBe("ESP32 handoff.zip");
    expect(zip.names).toContain("decisions/code target weights.json");
    expect(zip.names).toContain("photos/image/hero.jpg");
    expect(zip.names.join()).not.toContain("die shot");
    expect(zip.names).not.toContain("data/contacts.json");
    expect(zip.json("decisions/code target weights.json").decisions[0].title).toContain("code target");
    expect(zip.json("data/moodboards.json").boards[0].name).toBe("ESP32 Node Programmer");
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByLabel("Name of the zip")).toHaveValue("ESP32 handoff");
  });

  test("only takes the chosen project", async ({ page }) => {
    await newProject(page, "Kitchen");
    await page.goto("/#/export");
    await page.getByLabel("Export from").selectOption("pr-esp32");
    const zip = await exportZip(page);
    const boards = zip.json("data/moodboards.json").boards.map((b: { name: string }) => b.name);
    expect(boards.sort()).toEqual(["ESP32 Enclosure", "ESP32 Node Programmer"]);
  });
});

test.describe("library by project", () => {
  test("a dropdown switches between current projects and all projects", async ({ page }) => {
    await page.goto("/#/library");
    const count = page.getByTestId("library-count");
    await expect(count).toContainText("18 items");
    await page.getByRole("button", { name: "Manage projects" }).click();
    const dialog = page.getByRole("dialog", { name: "Projects" });
    await dialog.getByLabel("Working on ESP32 Node Programmer").uncheck();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(count).toContainText("of 18");
    await expect(page.getByRole("button", { name: "Details for ESP32 die shot" })).toHaveCount(0);
    await page.getByLabel("Which projects").selectOption({ label: "All projects" });
    await expect(count).toContainText("18 items");
    await expect(page.getByRole("button", { name: "Details for ESP32 die shot" })).toBeVisible();
    await page.getByLabel("Which projects").selectOption({ label: "Current projects" });
    await expect(page.getByRole("button", { name: "Details for ESP32 die shot" })).toHaveCount(0);
  });

  test("narrows to one project", async ({ page }) => {
    await newProject(page, "Kitchen");
    await page.goto("/#/library");
    await page.getByLabel("Which projects").selectOption({ label: "Kitchen" });
    await expect(page.getByTestId("library-count")).toContainText("0 items of 18");
    await page.getByLabel("Which projects").selectOption({ label: "ESP32 Node Programmer" });
    await expect(page.getByTestId("library-count")).toContainText("18 items");
  });

  test("a new project starts from a template, and removing it deletes nothing", async ({ page }) => {
    await newProject(page, "Kitchen");
    // The new board has the template's sections, and belongs to the new project.
    await expect(page.getByText("Look: colour, type, imagery")).toBeVisible();
    await expect(page.getByText("What should a visitor do before they leave?")).toBeVisible();

    await page.goto("/#/library");
    await page.getByRole("button", { name: "Manage projects" }).click();
    const dialog = page.getByRole("dialog", { name: "Projects" });
    await dialog.getByRole("button", { name: "Remove" }).last().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("library-count")).toContainText("18 items");
  });
});

test.describe("home", () => {
  test("is light: no mosaic, swatches or filter row", async ({ page }) => {
    await page.goto("/#/home");
    await expect(page.locator(".continue-mosaic, .omni-filters, .bars")).toHaveCount(0);
    expect(await page.locator("main img").count()).toBeLessThanOrEqual(4);
    await expect(page.getByRole("link", { name: "Continue ESP32 Node Programmer" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Needs a look" })).toContainText("still a guess");
  });

  test("start here counts only the person's own work, links to the example, and can be hidden", async ({ page }) => {
    await page.goto("/#/home");
    const start = page.getByRole("region", { name: "Start here" });
    await expect(start).toContainText("0 of 5 done");
    await expect(start).toContainText("Paste a link above");
    await start.getByRole("link", { name: "See every step on the example board" }).click();
    await expect(page.getByTestId("item-sticky").filter({ hasText: "GPIO 34–39 are input only" })).toBeVisible();
    await page.goto("/#/home");
    await start.getByRole("button", { name: "Hide" }).click();
    await expect(start).toHaveCount(0);
  });

  test("sends one board to Claude as text, and ticks the last step", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/#/canvas/b-esp32");
    await page.getByRole("button", { name: "Send to Claude" }).click();
    const dialog = page.getByRole("dialog", { name: "Send to Claude" });
    await dialog.getByRole("textbox").fill("Say which code target the evidence favours.");
    await dialog.getByRole("button", { name: "Copy for a chat" }).click();
    await expect(dialog).toHaveCount(0);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("ESP32 Node Programmer");
    expect(text).toContain("Say which code target the evidence favours.");
    expect(text).not.toContain("ESP32 Enclosure");
    await page.goto("/#/home");
    await expect(page.getByRole("region", { name: "Start here" })).toContainText("1 of 5 done");
  });

  test("the research file shows its formula", async ({ page }) => {
    await page.goto("/#/notes");
    await page.getByRole("navigation", { name: "Notes" }).getByRole("button", { name: "How the code target is scored" }).click();
    await expect(page.getByTestId("note-preview").locator(".katex-display")).toBeVisible();
  });
});

test.describe("threads by project", () => {
  test("follows the same dropdown as the Library", async ({ page }) => {
    await page.goto("/#/threads");
    const graph = page.getByRole("navigation", { name: "Main" });
    await expect(graph).toBeVisible();
    await expect(page.getByLabel("Which projects")).toHaveValue("working");
    const search = page.getByRole("searchbox").or(page.getByLabel(/filter|search|find/i)).first();
    await expect(search).toBeVisible();
    await page.getByLabel("Which projects").selectOption({ label: "ESP32 Node Programmer" });
    await page.goto("/#/library");
    await expect(page.getByTestId("library-count")).toContainText("18 items");
    await expect(page.getByLabel("Which projects")).toHaveValue("project:pr-esp32");
  });
});
