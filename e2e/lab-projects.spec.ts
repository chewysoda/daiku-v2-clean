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
  await page.getByRole("button", { name: "Rename Which chair base?" }).click();
  await page.getByLabel("Decision name").fill("Which leg?");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "Which chair base?" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Which chair base?" }).click();
  await page.getByLabel("Decision name").fill("Which leg?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Which leg?" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Which leg?" })).toBeVisible();
});

test("won't rename to nothing", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: "Rename Which chair base?" }).click();
  await page.getByLabel("Decision name").fill("   ");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Which chair base?" })).toBeVisible();
});

test("a template starts a decision for any kind of project, adding up to 100%", async ({ page }) => {
  await page.goto("/#/lab");
  await newDecision(page, "Which database?", "Brand Direction", "software");
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
  const project = page.getByLabel("Project for Which chair base?");
  await project.selectOption({ label: "Brand Direction" });
  await page.getByRole("link", { name: "All projects" }).click();
  await expect(page.getByRole("region", { name: "Brand Direction" })).toContainText("Which chair base?");
  await expect(page.getByRole("region", { name: "Furniture Study" })).toHaveCount(0);
});

test("shows every project's decisions, with how far along they are", async ({ page }) => {
  await page.goto("/#/lab/all");
  await expect(page.getByRole("heading", { level: 1, name: "All projects" })).toBeVisible();
  const row = page.getByTestId("lab-row").filter({ hasText: "Which chair base?" });
  await expect(row).toContainText("3 concepts");
  await expect(row).toContainText("guess");
  await expect(row).toContainText("leads at");
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Which chair base?" })).toBeVisible();
});

test("can start a decision in a project that has none, from the overview", async ({ page }) => {
  await page.goto("/#/lab/all");
  await page.getByRole("button", { name: "Start a decision in Gripper Concept" }).click();
  const dialog = page.getByRole("dialog", { name: "New decision" });
  await expect(dialog.getByLabel("Project")).not.toHaveValue("");
  await dialog.getByRole("textbox").fill("Which grip?");
  await dialog.getByLabel("Start from").selectOption("engineering");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByLabel("Criterion name")).toHaveCount(5);
  await page.goto("/#/lab/all");
  await expect(page.getByRole("region", { name: "Gripper Concept" })).toContainText("Which grip?");
});

test("duplicates a decision with its scores, independent of the original", async ({ page }) => {
  await page.goto("/#/lab/all");
  await expect(page.getByTestId("lab-row").first()).toBeVisible();
  const before = await page.getByTestId("lab-row").count();
  await page.getByRole("button", { name: "Duplicate Which chair base?" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(before + 1);
  const copy = page.getByTestId("lab-row").filter({ hasText: "Which chair base? (copy)" });
  await expect(copy).toContainText("3 concepts");
  await expect(copy).toContainText("leads at");

  await copy.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("total-A")).toHaveText("3.75");
  await page.getByLabel("Criterion name").first().fill("Changed in the copy");
  await page.goto("/#/lab/all");
  await page.getByTestId("lab-row").filter({ has: page.getByRole("button", { name: "Rename Which chair base?", exact: true }) }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Criterion name").first()).not.toHaveValue("Changed in the copy");
});

test("a copied score keeps its source, and stays a guess if it was one", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: /Oak ply shell, Cost: 4, a guess/ }).click();
  await page.getByRole("button", { name: "Link a source" }).click();
  await page.getByRole("button", { name: "Rift oak" }).click();
  await expect(page.getByRole("button", { name: /Oak ply shell, Cost: 4, sourced/ })).toBeVisible();
  await page.goto("/#/lab/all");
  await page.getByRole("button", { name: "Duplicate Which chair base?" }).click();
  await page.getByTestId("lab-row").filter({ hasText: "(copy)" }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: /Oak ply shell, Cost: 4, sourced/ })).toBeVisible();
});

test("deletes from the overview after asking, and filters", async ({ page }) => {
  await page.goto("/#/lab/all");
  await page.getByLabel("Filter decisions").fill("zzz");
  await expect(page.getByText("Nothing matches that.")).toBeVisible();
  await page.getByLabel("Filter decisions").fill("chair");
  await expect(page.getByTestId("lab-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Which chair base?" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Which chair base?" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("lab-row")).toHaveCount(0);
});

test("the switcher groups decisions by project", async ({ page }) => {
  await page.goto("/#/lab");
  await newDecision(page, "Loose one", null, "blank");
  const groups = await page.getByLabel("Switch decision").locator("optgroup").evaluateAll((els) => els.map((e) => e.getAttribute("label")));
  expect(groups).toContain("Furniture Study");
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
  // An old link, or a last page saved before it went, lands on the board.
  await page.goto("/#/deck");
  await expect(page).toHaveURL(/#\/board/);
});
