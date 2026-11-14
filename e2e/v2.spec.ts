import { expect, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

test("the Reader opens beside the board and closes with Esc", async ({ page }) => {
  await page.goto("/#/board/b-furniture?read=a-paper");
  const panel = page.getByRole("complementary", { name: /^Reading / });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "Furniture Study" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/#\/board\/b-furniture$/);
});

test("P pins the selected card's source in the pack, and P again unpins it", async ({ page }) => {
  await page.goto("/#/handoff");
  await page.getByLabel("Include the sample project").check();
  await page.goto("/#/board/b-furniture");
  await page.getByRole("img", { name: "Lounge, oak legs" }).click();
  await page.keyboard.press("p");
  await expect(page.locator(".toast")).toContainText("Pinned");
  await page.goto("/#/handoff");
  await expect(page.locator(".ho-group.pinned")).not.toContainText("Pin what the AI must always see");
  await page.goto("/#/board/b-furniture");
  await page.getByRole("img", { name: "Lounge, oak legs" }).click();
  await page.keyboard.press("p");
  await expect(page.locator(".toast").last()).toContainText("Unpinned");
});

test("Ctrl+N adds a note ready to type", async ({ page }) => {
  await page.goto("/#/board/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
  const before = await page.getByTestId("item-sticky").count();
  await page.keyboard.press("Control+n");
  await page.getByLabel("Sticky note text").fill("From the keyboard");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("item-sticky")).toHaveCount(before + 1);
});

test("the tray opens into a receipt, and the sidebar collapses to icons", async ({ page }) => {
  await page.goto("/#/library");
  const tray = page.getByRole("region", { name: "Pack tray" });
  await tray.getByRole("button", { name: /Pack/ }).click();
  await expect(tray.getByRole("heading", { name: /Pinned/ })).toBeVisible();
  await expect(tray.getByRole("heading", { name: /Left out/ })).toBeVisible();
  await page.keyboard.press("Control+\\");
  await expect(page.locator(".sidebar.collapsed")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Decide", exact: true })).toBeVisible();
});

test("reduce transparency makes the glass solid; the browser preview never claims Mica", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.locator("html")).not.toHaveAttribute("data-mica", "on");
  await page.getByLabel("Reduce transparency").selectOption("on");
  await expect(page.locator("html")).toHaveAttribute("data-glass", "solid");
  await page.goto("/#/library");
  const filter = await page.locator(".sidebar").evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(filter).toBe("none");
});

test("Decide ranks the sample's options live, and marks guesses", async ({ page }) => {
  await page.goto("/#/decide/d-esp32");
  const rank = page.getByRole("region", { name: "Ranking" });
  await expect(rank.getByRole("listitem").first()).toContainText("Arduino C++");
  await expect(page.getByTestId("rank-A")).toHaveText("4.40");
  await expect(rank.getByRole("listitem").first()).toContainText("has guesses");
});

test("the board shows quotes as quotes, and claims as sourced or guessed", async ({ page }) => {
  await page.goto("/#/board/b-esp32");
  await expect(page.getByTestId("source-card").filter({ hasText: "GPIO34-39 can only be set as input mode" })).toBeVisible();
  const sourced = page.getByTestId("claim-card").filter({ hasText: "GPIO 34–39 are input only" });
  await expect(sourced).toHaveClass(/sourced/);
  await expect(sourced.getByRole("button", { name: /GPIO34-39 are input only/ })).toBeVisible();
  await expect(page.getByTestId("claim-card").filter({ hasText: "Beginners" })).toHaveClass(/guess/);
});

test("the Tools list starts folded; Ctrl+K still reaches every tool", async ({ page }) => {
  await page.goto("/#/library");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("button", { name: "Tools" })).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Threads" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Tools" }).click();
  await expect(nav.getByRole("link", { name: "Threads" })).toBeVisible();
});

test("Make claim turns selected words into a sourced claim card on the open board", async ({ page }) => {
  await page.goto("/#/board/b-furniture?read=a-paper");
  await expect(page.locator(".textLayer span", { hasText: "Background" })).toBeVisible();
  await page.locator(".textLayer span", { hasText: "Background" }).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Make claim" }).click();
  await expect(page.locator(".toast")).toContainText("Claim made and put on the board");
  const card = page.getByTestId("claim-card").filter({ hasText: "Background" });
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/sourced/);
});

const pasteText = (page: import("@playwright/test").Page, text: string) =>
  page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, text);

test("a link pasted on the board becomes a credited source card, and isn't saved twice", async ({ page }) => {
  await page.goto("/#/board/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
  await pasteText(page, "https://docs.espressif.com/projects/arduino-esp32/gpio-pin_limits.html");
  await expect(page.locator(".toast")).toContainText("credited to docs.espressif.com");
  const card = page.getByTestId("source-card").filter({ hasText: "Gpio pin limits" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("credited");
  await pasteText(page, "https://docs.espressif.com/projects/arduino-esp32/gpio-pin_limits.html");
  await expect(page.locator(".toast").last()).toContainText("Already in the Library");
});

test("a link pasted anywhere else is saved to the Library straight away", async ({ page }) => {
  await page.goto("/#/decide");
  await pasteText(page, "https://reactflow.dev/learn/custom-nodes");
  await expect(page.locator(".toast")).toContainText("Saved to the Library");
  await expect(page).toHaveURL(/#\/decide/);
  await page.goto("/#/library");
  await expect(page.getByText("Custom nodes").first()).toBeVisible();
});

test("packs: a new pack starts empty, and switching back brings the first one's brief back", async ({ page }) => {
  await page.goto("/#/handoff");
  const goal = page.getByLabel("What do you want built?");
  await goal.fill("First pack's goal");
  await page.getByRole("button", { name: "New pack" }).click();
  await page.getByLabel("New pack name").fill("Pin checker");
  await page.getByLabel("Brief template").selectOption({ label: "Bug fix" });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(goal).toHaveValue("");
  await expect(page.getByLabel("Done when")).toHaveValue(/test reproduces/);
  await goal.fill("Second pack's goal");
  await page.getByLabel("Pack", { exact: true }).selectOption({ label: "Pack" });
  await expect(goal).toHaveValue("First pack's goal");
  await page.getByLabel("Pack", { exact: true }).selectOption({ label: "Pin checker" });
  await expect(goal).toHaveValue("Second pack's goal");
});

test("Ctrl+K finds words inside the work, not just names, and opens where they are", async ({ page }) => {
  await page.goto("/#/library");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search or run a command").fill("mould lead");
  const hit = page.locator(".palette-row").filter({ hasText: "on a board" });
  await expect(hit).toContainText("Furniture Study");
  await expect(hit).toContainText("FRP mould lead time");
  await hit.click();
  await expect(page).toHaveURL(/#\/board\/b-furniture/);
});

test("a backup restores what changed since, after asking", async ({ page }) => {
  await page.goto("/#/settings");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up", exact: true }).click();
  const file = await (await downloading).path();
  await expect(page.locator(".toast")).toContainText(/Backed up/);

  await page.goto("/#/handoff");
  await page.getByLabel("What do you want built?").fill("Changed after the backup");

  await page.goto("/#/settings");
  await page.getByLabel("Backup file").setInputFiles(file);
  const dialog = page.getByRole("alertdialog", { name: "Replace everything with this backup?" });
  await expect(dialog).toContainText("board");
  await dialog.getByRole("button", { name: "Replace with backup" }).click();
  await expect(page.locator(".toast")).toContainText("Restored");
  await page.goto("/#/handoff");
  await expect(page.getByLabel("What do you want built?")).not.toHaveValue("Changed after the backup");

  // Survives a reload, so it was written, not just shown.
  await page.reload();
  await expect(page.getByLabel("What do you want built?")).not.toHaveValue("Changed after the backup");
});

test("restoring something that isn't a backup says so and changes nothing", async ({ page }) => {
  await page.goto("/#/settings");
  await page.getByLabel("Backup file").setInputFiles({ name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await expect(page.locator(".toast")).toContainText("isn't a zip");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
