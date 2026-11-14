import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

test.describe("engineering Lab", () => {
  test("requirements gate the leader and match the wireframe's standing", async ({ page }) => {
    await page.goto("/#/lab");
    await expect(page.getByTestId("gate-warning")).toContainText("Concept A leads the matrix but fails a must-have");
    await page.getByRole("link", { name: "Requirements" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Requirements" })).toBeVisible();
    await expect(page.getByTestId("req-R2-A")).toContainText("7.15 kg");
    await expect(page.getByTestId("req-R2-A")).toHaveClass(/fail/);
    await expect(page.getByTestId("req-R1-A")).toContainText("SF 2.11");
    await expect(page.getByTestId("standing-A")).toContainText("4 pass · 1 fail · 1 open");
    await expect(page.getByTestId("standing-B")).toContainText("1 pass · 0 fail · 5 open");
  });

  test("a what-if in a calc flows to the BOM and clears the mass failure", async ({ page }) => {
    await page.goto("/#/lab/d-chair/bom");
    await expect(page.getByTestId("calc-C1")).toHaveText("= 3.67 kg");
    await expect(page.getByTestId("bom-total")).toHaveText("7.15 kg");
    await expect(page.getByTestId("bom-verdict")).toHaveClass(/fail/);
    await page.getByLabel("C1 input t").fill("10 mm");
    await expect(page.getByTestId("calc-C1")).toHaveText("= 3.06 kg");
    await expect(page.getByTestId("bom-total")).toHaveText("6.54 kg");
    await expect(page.getByTestId("bom-verdict")).toHaveClass(/pass/);
    await page.getByLabel("C1 input t").fill("10 kg");
    await expect(page.getByTestId("calc-C1")).toContainText("units don't match");
    await expect(page.getByTestId("bom-total")).toHaveText("a part has no mass");
    await page.getByRole("link", { name: "Decision matrix" }).click();
    await expect(page.getByTestId("total-A")).toHaveText("3.75");
  });

  test("a typed-in value needs a basis, and a run updates the safety factor", async ({ page }) => {
    await page.goto("/#/lab/d-chair/requirements");
    await page.getByTestId("req-R4-B").click();
    await page.getByLabel("R4 value for FRP shell").fill("700");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByLabel("R4 value for FRP shell")).toBeVisible();
    await page.getByLabel("Basis").fill("Bench measurement");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("req-R4-B")).toHaveClass(/fail/);

    await page.goto("/#/lab/d-chair/simulate");
    await expect(page.getByTestId("run-sf")).toHaveText("2.11");
    await expect(page.getByTestId("convergence")).toContainText("converged, last step 1.1%");
    await page.getByLabel("Max von Mises (MPa)").fill("25");
    await expect(page.getByTestId("run-sf")).toHaveText("1.6");
    await page.getByRole("link", { name: "Requirements" }).click();
    await expect(page.getByTestId("req-R1-A")).toHaveClass(/fail/);
  });

  test("logging a decision needs a reason, meets its gate, and reaches the log", async ({ page }) => {
    await page.goto("/#/progress");
    await expect(page.getByTestId("gate-mile-1")).toContainText("not met");
    await page.goto("/#/lab");
    await page.getByRole("button", { name: "Log this decision" }).click();
    await expect(page.getByRole("button", { name: "Log decision" })).toBeDisabled();
    await page.getByLabel("Why", { exact: true }).fill("Lowest cost once quoted");
    // Every rejected concept needs its own reason before this can be logged.
    await expect(page.getByRole("button", { name: "Log decision" })).toBeDisabled();
    for (const why of await page.getByLabel(/^Why not /).all()) await why.fill("Too heavy for the brief");
    await page.getByRole("button", { name: "Log decision" }).click();
    await page.goto("/#/progress");
    await expect(page.getByTestId("gate-mile-1")).toHaveText("✓ met");
    await expect(page.getByTestId("count-decisions_logged")).toHaveText("1");
    await page.getByRole("link", { name: "Workflow log" }).click();
    await expect(page.getByRole("row", { name: /Chose A: Oak ply shell.*Lowest cost once quoted/ })).toBeVisible();
  });
});

test.describe("research", () => {
  test("Reader opens a PDF, highlights a selection and turns it into evidence", async ({ page }) => {
    await page.goto("/#/library?q=try%20the%20Reader");
    await page.getByRole("figure", { name: /try the Reader/ }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Open in Reader" }).click();
    await expect(page.getByText("2 pages")).toBeVisible();
    const span = page.locator(".textLayer span", { hasText: "Background" });
    await expect(span).toBeVisible();
    await span.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.getByRole("button", { name: "supports", exact: true }).click();
    await expect(page.locator(".hl-mark.supports").first()).toBeVisible();
    await expect(page.getByLabel("Highlights")).toContainText("[Background: perceived softness");
    await expect(page.getByLabel("Highlights")).toContainText("p. 1");
    await page.getByLabel("Turn into evidence for a claim").selectOption({ label: "A's unit cost is lower than B's" });
    await expect(page.getByLabel("Highlights")).toContainText("Evidence on");
    await page.goto("/#/explore/claims");
    await expect(page.getByTestId("strength-c-cost")).toHaveText("medium");
    await page.goto("/#/reader/a-paper");
    await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: /^2/ }).click();
    await expect(page.locator(".textLayer span", { hasText: "only one fabric family" })).toBeVisible();
  });

  test("Claims rate by evidence, and a source against makes one mixed", async ({ page }) => {
    await page.goto("/#/explore/claims");
    await expect(page.getByRole("heading", { level: 1, name: "Claims" })).toBeVisible();
    await expect(page.getByTestId("strength-c-weight")).toHaveText("assumption");
    await page.getByRole("button", { name: "Steel frames are heavier than ply shells" }).click();
    await page.getByLabel("Stance").selectOption("against");
    await page.getByLabel("Add a source").selectOption({ label: "Rift oak" });
    await expect(page.getByTestId("strength-c-weight")).toHaveText("mixed");
    await page.getByRole("button", { name: "Unlink Rift oak" }).click();
    await expect(page.getByTestId("strength-c-weight")).toHaveText("assumption");
  });

  test("Interviews count people, import notes and feed requirements", async ({ page }) => {
    await page.goto("/#/explore/interviews");
    await expect(page.getByTestId("theme-t-carry")).toHaveText("4 of 6");
    await page.getByRole("button", { name: "Import notes" }).click();
    await page.getByLabel("Notes to import").fill("P7: Wants wheels");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByLabel("Unsorted notes")).toContainText("Wants wheels");
    await expect(page.getByTestId("theme-t-carry")).toHaveText("4 of 7");
    await page.getByLabel("Unsorted notes").getByLabel("Theme").selectOption({ label: "Carrying & moving" });
    await expect(page.getByTestId("theme-t-carry")).toHaveText("5 of 7");
    await page.getByRole("button", { name: "Add as requirement" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.goto("/#/lab/d-chair/requirements");
    await expect(page.getByRole("cell", { name: "Addresses “Carrying & moving”" })).toBeVisible();
  });

  test("Notes link, create placeholders and show backlinks", async ({ page }) => {
    await page.goto("/#/notes");
    await expect(page.getByLabel("Note title")).toHaveValue("Why bouclé");
    await page.getByLabel("Links").getByRole("button", { name: /Comfort questions/ }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Comfort questions");
    await expect(page.getByLabel("Links")).toContainText("Backlinks · 1");
    await page.getByLabel("Links").getByRole("button", { name: "Why bouclé" }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Why bouclé");
    await expect(page.getByRole("link", { name: /Bouclé lowers perceived hardness/ })).toBeVisible();
  });
});

test("CAD viewer loads an STL and reports its bounding box", async ({ page }) => {
  await page.goto("/#/cad/a-cad");
  await expect(page.getByTestId("cad-box")).toHaveText("590 × 560 × 780");
  await page.getByRole("button", { name: "Top" }).click();
  await page.getByRole("button", { name: "Section" }).click();
  await expect(page.getByRole("button", { name: "Section" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-testid=cad-canvas] canvas")).toBeVisible();
});

test("Progress saves checks and draws heat maps from the data", async ({ page }) => {
  await page.goto("/#/progress");
  await expect(page.getByTestId("count-must_failed")).toHaveText("1");
  await page.getByRole("button", { name: "Save a progress check" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("figure").first()).toContainText("Scores still guessed");
  await page.getByRole("link", { name: "Heat maps" }).click();
  await expect(page.getByLabel("Matrix heat map").locator("td").first()).toBeVisible();
  await expect(page.getByLabel("Traceability heat map")).toContainText("Fail");
  await expect(page.getByLabel("Activity calendar").locator(".day").first()).toBeVisible();
  await expect(page.getByLabel("Board coverage")).toContainText(/\d\/\d/);
});

test.describe("exports", () => {
  test("Settings exports an Obsidian vault with every part", async ({ page }) => {
    await page.goto("/#/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export vault" }).click();
    const file = await download;
    const zip = unzipSync(readFileSync(await file.path()));
    const names = Object.keys(zip);
    expect(names).toContain("project.json");
    expect(names).toContain("references.bib");
    expect(names).toContain("Workflow log.md");
    expect(names).toContain("workflow-log.csv");
    expect(names).toContain("Notes/Why bouclé.md");
    expect(names.some((n) => n.startsWith("attachments/") && n.endsWith(".pdf"))).toBe(true);
    expect(names.some((n) => n.startsWith("attachments/") && n.endsWith(".stl"))).toBe(true);
    expect(strFromU8(zip["Notes/Why bouclé.md"])).toContain("supports:: [[Bouclé lowers perceived hardness]]");
    const canvas = JSON.parse(strFromU8(zip[names.find((n) => n.endsWith(".canvas"))!]));
    expect(canvas.nodes.length).toBeGreaterThan(0);
    for (const f of canvas.nodes.filter((n: { type: string }) => n.type === "file")) expect(names).toContain(f.file);
    const decision = strFromU8(zip[names.find((n) => n.startsWith("Decisions/"))!]);
    expect(decision).toContain("(guess)");
    expect(decision).toContain("frozen_at");
    const project = JSON.parse(strFromU8(zip["project.json"]));
    expect(project.format).toBe("daiku-project");
    expect(project.settings).toBeUndefined();
    expect(project.records.length).toBeGreaterThan(10);
  });

  test("removing sample data removes the new samples too, and is logged once", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Remove sample data" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.goto("/#/explore/interviews");
    await expect(page.getByText("participants · 0")).toBeVisible();
    await page.goto("/#/progress/log");
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").nth(1)).toContainText("Removed the sample data");
  });
});
