import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

// The example's enclosure decision carries the engineering: requirements, a BOM, calculations and drop-test runs.
const CASE = "/#/decide/d-esp32-case";

test.describe("engineering Lab", () => {
  test("requirements gate the leader, and each concept's standing adds up", async ({ page }) => {
    await page.goto(CASE);
    await expect(page.getByTestId("gate-warning")).toContainText("Concept A leads the matrix but fails a must-have");
    await page.getByRole("link", { name: "Requirements" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Requirements" })).toBeVisible();
    await expect(page.getByTestId("req-R2-A")).toContainText("0.0393 kg");
    await expect(page.getByTestId("req-R2-A")).toHaveClass(/fail/);
    await expect(page.getByTestId("req-R1-A")).toContainText("SF 2.73");
    await expect(page.getByTestId("standing-A")).toContainText("3 pass · 2 fail · 0 open");
    await expect(page.getByTestId("standing-B")).toContainText("1 pass · 1 fail · 3 open");
  });

  test("a what-if in a calc flows to the BOM and clears the mass failure", async ({ page }) => {
    await page.goto(`${CASE}/bom`);
    await expect(page.getByTestId("calc-C1")).toHaveText("= 0.0233 kg");
    await expect(page.getByTestId("bom-total")).toHaveText("0.0393 kg");
    await expect(page.getByTestId("bom-verdict")).toHaveClass(/fail/);
    await page.getByLabel("C1 input t").fill("1.5 mm");
    await expect(page.getByTestId("calc-C1")).toHaveText("= 0.0175 kg");
    await expect(page.getByTestId("bom-total")).toHaveText("0.0335 kg");
    await expect(page.getByTestId("bom-verdict")).toHaveClass(/pass/);
    await page.getByLabel("C1 input t").fill("1.5 kg");
    await expect(page.getByTestId("calc-C1")).toContainText("units don't match");
    await expect(page.getByTestId("bom-total")).toHaveText("a part has no mass");
    await page.getByRole("link", { name: "Decision matrix" }).click();
    await expect(page.getByTestId("total-A")).toHaveText("4.15");
  });

  test("a typed-in value needs a basis, and a run updates the safety factor", async ({ page }) => {
    await page.goto(`${CASE}/requirements`);
    await page.getByTestId("req-R4-B").click();
    await page.getByLabel("R4 value for Off-the-shelf ABS box").fill("80");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByLabel("R4 value for Off-the-shelf ABS box")).toBeVisible();
    await page.getByLabel("Basis").fill("Supplier drawing");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("req-R4-B")).toHaveClass(/fail/);

    await page.goto(`${CASE}/simulate`);
    await expect(page.getByTestId("run-sf")).toHaveText("2.73");
    await expect(page.getByTestId("convergence")).toContainText("converged, last step 0.9%");
    await page.getByLabel("Max von Mises (MPa)").fill("20");
    await expect(page.getByTestId("run-sf")).toHaveText("1.5");
    await page.getByRole("link", { name: "Requirements" }).click();
    await expect(page.getByTestId("req-R1-A")).toHaveClass(/fail/);
  });

  test("logging a decision needs a reason, meets its gate, and reaches the log", async ({ page }) => {
    await page.goto("/#/progress");
    await expect(page.getByTestId("gate-espmile-1")).toContainText("not met");
    await page.goto("/#/lab");
    await page.getByRole("button", { name: "Log this decision" }).click();
    await expect(page.getByRole("button", { name: "Log decision" })).toBeDisabled();
    await page.getByLabel("Why", { exact: true }).fill("One tool compiles and uploads");
    // Every rejected concept needs its own reason before this can be logged.
    await expect(page.getByRole("button", { name: "Log decision" })).toBeDisabled();
    for (const why of await page.getByLabel(/^Why not /).all()) await why.fill("Harder to set up on Windows");
    await page.getByRole("button", { name: "Log decision" }).click();
    await page.goto("/#/progress");
    await expect(page.getByTestId("gate-espmile-1")).toHaveText("✓ met");
    await expect(page.getByTestId("count-decisions_logged")).toHaveText("1");
    await page.getByRole("link", { name: "Workflow log" }).click();
    await expect(page.getByRole("row", { name: /Chose A: Arduino C\+\+.*One tool compiles and uploads/ })).toBeVisible();
  });
});

test.describe("research", () => {
  test("Reader opens a PDF, highlights a selection and turns it into evidence", async ({ page }) => {
    await page.goto("/#/library?q=sample%20study%20notes");
    await page.getByRole("figure", { name: /sample study notes/ }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Open in Reader" }).click();
    await expect(page.getByText("3 pages")).toBeVisible();
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
    await expect(page.getByLabel("Highlights")).toContainText("Background");
    await expect(page.getByLabel("Highlights")).toContainText("p. 1");
    await page.getByLabel("Turn into evidence for a claim").selectOption({ label: "Beginners will prefer Arduino-style code over ESP-IDF" });
    await expect(page.getByLabel("Highlights")).toContainText("Evidence on");
    await page.goto("/#/explore/claims");
    await expect(page.getByTestId("strength-esp-c3")).toHaveText("medium");
    await page.goto("/#/reader/esp-paper");
    await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: /^3/ }).click();
    await expect(page.locator(".textLayer span", { hasText: "small group" })).toBeVisible();
  });

  test("Claims rate by evidence, and a source against makes one mixed", async ({ page }) => {
    await page.goto("/#/explore/claims");
    await expect(page.getByRole("heading", { level: 1, name: "Claims" })).toBeVisible();
    // The example already has one: the study found two sensor libraries missing.
    await expect(page.getByTestId("strength-esp-c5")).toHaveText("mixed");
    await expect(page.getByTestId("strength-esp-c3")).toHaveText("assumption");
    await page.getByRole("button", { name: "Beginners will prefer Arduino-style code over ESP-IDF" }).click();
    await page.getByLabel("Stance").selectOption("against");
    await page.getByLabel("Add a source").selectOption({ label: "Arduino core for the ESP32" });
    await expect(page.getByTestId("strength-esp-c3")).toHaveText("mixed");
    await page.getByRole("button", { name: "Unlink Arduino core for the ESP32" }).click();
    await expect(page.getByTestId("strength-esp-c3")).toHaveText("assumption");
  });

  test("Interviews count people, import notes and feed requirements", async ({ page }) => {
    await page.goto("/#/explore/interviews");
    await expect(page.getByTestId("theme-espth-wiring")).toHaveText("3 of 5");
    await page.getByRole("button", { name: "Import notes" }).click();
    await page.getByLabel("Notes to import").fill("P7: Plugged the sensor into a flash pin");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByLabel("Unsorted notes")).toContainText("flash pin");
    await expect(page.getByTestId("theme-espth-wiring")).toHaveText("3 of 6");
    await page.getByLabel("Unsorted notes").getByLabel("Theme").selectOption({ label: "Wiring mistakes" });
    await expect(page.getByTestId("theme-espth-wiring")).toHaveText("4 of 6");
    await page.getByRole("button", { name: "Add as requirement" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // It goes to the first decision, the code target.
    await page.goto("/#/decide/d-esp32/requirements");
    await expect(page.getByRole("cell", { name: "Addresses “Wiring mistakes”" })).toBeVisible();
  });

  test("Notes link, create placeholders and show backlinks", async ({ page }) => {
    await page.goto("/#/notes");
    await page.getByRole("navigation", { name: "Notes" }).getByRole("button", { name: "How the code target is scored" }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("How the code target is scored");
    await page.getByLabel("Links").getByRole("button", { name: /Sensor library checklist/ }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("Sensor library checklist");
    await expect(page.getByLabel("Links")).toContainText("Backlinks · 1");
    await page.getByLabel("Links").getByRole("button", { name: "How the code target is scored" }).click();
    await expect(page.getByLabel("Note title")).toHaveValue("How the code target is scored");
    await expect(page.getByRole("link", { name: /A millis\(\) scheduler keeps generated code responsive/ })).toBeVisible();
  });
});

test("CAD viewer loads an STL and reports its bounding box", async ({ page }) => {
  await page.goto("/#/cad/esp-cad");
  await expect(page.getByTestId("cad-box")).toHaveText("70 × 36 × 24");
  await page.getByRole("button", { name: "Top" }).click();
  await page.getByRole("button", { name: "Section" }).click();
  await expect(page.getByRole("button", { name: "Section" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-testid=cad-canvas] canvas")).toBeVisible();
});

test("Progress saves checks and draws heat maps from the data", async ({ page }) => {
  await page.goto("/#/progress");
  // The printed tray's mass, and the ABS box's USB slot.
  await expect(page.getByTestId("count-must_failed")).toHaveText("2");
  await page.getByRole("button", { name: "Save a progress check" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("figure").first()).toContainText("Scores still guessed");
  await page.getByRole("link", { name: "Heat maps" }).click();
  await expect(page.getByLabel("Matrix heat map").locator("td").first()).toBeVisible();
  await page.getByLabel("Decision").selectOption({ label: "Which enclosure?" });
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
    expect(names).toContain("Notes/Pin rules to enforce.md");
    expect(names.some((n) => n.startsWith("attachments/") && n.endsWith(".pdf"))).toBe(true);
    expect(names.some((n) => n.startsWith("attachments/") && n.endsWith(".stl"))).toBe(true);
    expect(names.some((n) => n.startsWith("attachments/") && n.endsWith(".jpg"))).toBe(true);
    expect(strFromU8(zip["Notes/Pin rules to enforce.md"])).toContain("supports:: [[GPIO 34–39 are input only]]");
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

  test("removing sample data removes all of the example, and is logged once", async ({ page }) => {
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
