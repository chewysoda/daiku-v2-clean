import { expect, Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function newDecision(page: Page, title: string, project: string | null, template: string) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New decision" });
  await dialog.getByRole("textbox").fill(title);
  // A new decision starts in the project you're looking at, so "no project" has to be asked for.
  await dialog.getByLabel("Project").selectOption({ label: project ?? "No project" });
  await dialog.getByLabel("Start from").selectOption(template);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("renames a decision, with the old name back on Escape", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: "Rename Which code target first?" }).click();
  await page.getByLabel("Decision name").fill("Which language?");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "Which code target first?" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Which code target first?" }).click();
  await page.getByLabel("Decision name").fill("Which language?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Which language?" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Which language?" })).toBeVisible();
});

test("won't rename to nothing", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: "Rename Which code target first?" }).click();
  await page.getByLabel("Decision name").fill("   ");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Which code target first?" })).toBeVisible();
});

test("a template starts a decision for any kind of project, adding up to 100%", async ({ page }) => {
  await page.goto("/#/lab");
  await newDecision(page, "Which database?", "ESP32 Enclosure", "software");
  await expect(page.getByLabel("Criterion name")).toHaveCount(6);
  await expect(page.getByLabel("Criterion name").first()).toHaveValue("Fit for the job");
  await expect(page.getByText("sum", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Project for Which database?")).toHaveValue(/.+/);

  await page.getByRole("button", { name: "Add concept" }).click();
  const dialog = page.getByRole("dialog", { name: "Add concept" });
  await dialog.getByRole("textbox").fill("SQLite");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("region", { name: "Concepts" })).toContainText("SQLite");
});

test("blank still means blank", async ({ page }) => {
  await page.goto("/#/lab");
  await newDecision(page, "Empty one", null, "blank");
  await expect(page.getByLabel("Criterion name")).toHaveCount(0);
});

test("moves a decision between projects", async ({ page }) => {
  await page.goto("/#/lab");
  const project = page.getByLabel("Project for Which code target first?");
  await project.selectOption({ label: "ESP32 Enclosure" });
  await page.getByRole("link", { name: "All projects" }).click();
  await expect(page.getByRole("region", { name: "ESP32 Enclosure" })).toContainText("Which code target first?");
  await expect(page.getByRole("region", { name: "ESP32 Node Programmer" })).toHaveCount(0);
});

test("shows every project's decisions, with how far along they are", async ({ page }) => {
  await page.goto("/#/lab/all");
  await expect(page.getByRole("heading", { level: 1, name: "All projects" })).toBeVisible();
  const row = page.getByTestId("lab-row").filter({ hasText: "Which code target first?" });
  await expect(row).toContainText("3 concepts");
  await expect(row).toContainText("guess");
  await expect(row).toContainText("leads at");
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Which code target first?" })).toBeVisible();
});

test("can start a decision in a project that has none, from the overview", async ({ page }) => {
  // Both boards in the example have a decision, so take the enclosure's out of its board first.
  await page.goto("/#/decide/d-esp32-case");
  await page.getByLabel("Project for Which enclosure?").selectOption({ label: "No project" });
  await page.goto("/#/lab/all");
  await page.getByRole("button", { name: "Start a decision in ESP32 Enclosure" }).click();
  const dialog = page.getByRole("dialog", { name: "New decision" });
  await expect(dialog.getByLabel("Project")).not.toHaveValue("");
  await dialog.getByRole("textbox").fill("Which grip?");
  await dialog.getByLabel("Start from").selectOption("engineering");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByLabel("Criterion name")).toHaveCount(5);
  await page.goto("/#/lab/all");
  await expect(page.getByRole("region", { name: "ESP32 Enclosure" })).toContainText("Which grip?");
});

test("duplicates a decision with its scores, independent of the original", async ({ page }) => {
  await page.goto("/#/lab/all");
  await expect(page.getByTestId("lab-row").first()).toBeVisible();
  const before = await page.getByTestId("lab-row").count();
  await page.getByRole("button", { name: "Duplicate Which code target first?" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(before + 1);
  const copy = page.getByTestId("lab-row").filter({ hasText: "Which code target first? (copy)" });
  await expect(copy).toContainText("3 concepts");
  await expect(copy).toContainText("leads at");

  await copy.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("total-A")).toHaveText("4.40");
  await page.getByLabel("Criterion name").first().fill("Changed in the copy");
  await page.goto("/#/lab/all");
  await page.getByTestId("lab-row").filter({ has: page.getByRole("button", { name: "Rename Which code target first?", exact: true }) }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Criterion name").first()).not.toHaveValue("Changed in the copy");
});

test("a copied score keeps its source, and stays a guess if it was one", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: /Arduino C\+\+, Library coverage: 5, a guess/ }).click();
  await page.getByRole("button", { name: "Link a source" }).click();
  await page.getByRole("button", { name: "Arduino core for the ESP32" }).click();
  await expect(page.getByRole("button", { name: /Arduino C\+\+, Library coverage: 5, sourced/ })).toBeVisible();
  await page.goto("/#/lab/all");
  await page.getByRole("button", { name: "Duplicate Which code target first?" }).click();
  await page.getByTestId("lab-row").filter({ hasText: "(copy)" }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: /Arduino C\+\+, Library coverage: 5, sourced/ })).toBeVisible();
  // ESP-IDF's beginner score was a guess, and stays one in the copy.
  await expect(page.getByRole("button", { name: /ESP-IDF C, Beginner-friendly: 2, a guess/ })).toBeVisible();
});

test("deletes from the overview after asking, and filters", async ({ page }) => {
  await page.goto("/#/lab/all");
  await page.getByLabel("Filter decisions").fill("zzz");
  await expect(page.getByText("Nothing matches that.")).toBeVisible();
  await page.getByLabel("Filter decisions").fill("code target");
  await expect(page.getByTestId("lab-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Which code target first?" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Which code target first?" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(0);
});

test("the switcher groups decisions by project", async ({ page }) => {
  await page.goto("/#/lab");
  await newDecision(page, "Loose one", null, "blank");
  const groups = await page.getByLabel("Switch decision").locator("optgroup").evaluateAll((els) => els.map((e) => e.getAttribute("label")));
  expect(groups).toContain("ESP32 Node Programmer");
  expect(groups).toContain("No project");
});

test("All projects is styled on a direct visit, without the Lab having loaded first", async ({ page }) => {
  await page.goto("/#/lab/all");
  const row = page.getByTestId("lab-row").first();
  await expect(row).toHaveCSS("display", "flex");
  await expect(row.locator(".project-select")).toHaveCSS("width", "190px");
  await expect(page.locator(".lab-rows").first()).toHaveCSS("list-style-type", "none");
});

test("Deck Studio is gone from the rail and the command palette", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Main" });
  await expect(rail.getByRole("link", { name: "Decide", exact: true })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Deck Studio" })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox").last().fill("Deck Studio");
  await expect(page.getByText("Go to Deck Studio")).toHaveCount(0);
  // An old link, or a last page saved before it went, lands on Home.
  await page.goto("/#/deck");
  await expect(page).toHaveURL(/#\/home/);
});
