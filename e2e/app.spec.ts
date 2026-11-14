import { expect, Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

test("Home shows the example's board, decision and feed", async ({ page }) => {
  await page.goto("/#/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  await expect(page.getByRole("link", { name: "Continue ESP32 Node Programmer" })).toBeVisible();
  await expect(page.getByLabel("Needs a look")).toContainText("still a guess");
  await expect(page.getByRole("main").getByText("ESP32 Node Programmer").first()).toBeVisible();
});

test("opens on the board, and every sidebar link opens its screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/board/);
  for (const [label, heading] of [
    ["Library", "Library"],
    ["Decide", "Which code target first?"],
    ["Handoff", "Handoff"],
    ["Settings", "Settings"],
  ]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("Decide shows the expected totals and flips when a guess is corrected", async ({ page }) => {
  await page.goto("/#/decide");
  await expect(page.getByTestId("total-A")).toHaveText("4.40");
  await expect(page.getByTestId("total-B")).toHaveText("3.30");
  await expect(page.getByTestId("total-C")).toHaveText("3.35");
  await expect(page.getByRole("heading", { name: "A leads." })).toBeVisible();

  // The enclosure's lead rests on a guess: printed PLA's pin access.
  await page.goto("/#/decide/d-esp32-case");
  await expect(page.getByTestId("total-A")).toHaveText("4.15");
  await expect(page.getByTestId("total-C")).toHaveText("3.80");
  await expect(page.getByLabel("Verdict")).toContainText("its pin access score is a guess");
  await expect(page.getByLabel("Verdict")).toContainText("C takes the lead above 36.7%");
  await page.getByRole("button", { name: /Printed PLA tray, Pin access: 5, a guess/ }).click();
  await page.getByRole("group", { name: "Score" }).getByRole("button", { name: "2" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("total-A")).toHaveText("3.40");
  // C now leads, but C's own protection score is a guess too, and the verdict says so.
  await expect(page.getByRole("heading", { name: "The lead rests on a guess." })).toBeVisible();
  await expect(page.getByLabel("Verdict")).toContainText("C leads by 0.25");
});

test("linking a source turns a guess into a sourced score; unlinking reverts it", async ({ page }) => {
  await page.goto("/#/decide/d-esp32-case");
  await page.getByRole("button", { name: /Printed PLA tray, Cost: 4, a guess/ }).click();
  await page.getByRole("button", { name: "Link a source" }).click();
  await page.getByRole("button", { name: "Enclosure tray v1" }).click();
  await expect(page.getByRole("button", { name: /Printed PLA tray, Cost: 4, sourced/ })).toBeVisible();
  await page.getByRole("button", { name: "Unlink Enclosure tray v1" }).click();
  await expect(page.getByRole("button", { name: /Printed PLA tray, Cost: 4, a guess/ })).toBeVisible();
});

test("the what-if slider only keeps weights when asked", async ({ page }) => {
  await page.goto("/#/decide/d-esp32-case");
  await page.getByLabel("How much does pin access matter?").fill("15");
  await expect(page.getByTestId("total-B")).not.toHaveText("3.55");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("total-B")).toHaveText("3.55");
});

test("Library searches by text and colour, and adds to a board with credits", async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByRole("figure")).toHaveCount(18);
  await page.getByLabel(/Search the library/).fill("breadboard");
  await expect(page.getByRole("figure")).toHaveCount(1);
  await page.getByLabel(/Search the library/).fill("");
  await expect(page.getByRole("figure")).toHaveCount(18);

  await page.goto("/#/library?colour=%23B4B499");
  await expect(page.getByRole("figure").first()).toContainText("ESP32 die shot");
  await expect(page.getByText(/near /)).toBeVisible();

  await page.goto("/#/library");
  // Everything in the example is credited, so this keeps it all.
  await page.getByLabel("Credited only").check();
  await expect(page.getByRole("figure")).toHaveCount(18);
  await page.getByLabel("Credited only").uncheck();
  await page.getByText("ESP32 die shot").first().hover();
  await page.getByRole("button", { name: "Select ESP32 die shot" }).click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Add to board" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ESP32 Enclosure" }).click();
  await expect(page.getByRole("button", { name: "ESP32 Enclosure" })).toBeVisible();
});

test("Home's search and swatches lead to the Library", async ({ page }) => {
  await page.goto("/#/home");
  await page.getByLabel(/Paste a link/).fill("pins");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByLabel(/Search the library/)).toHaveValue("pins");
});

test("a pasted link goes to the browser pane, which explains itself outside the desktop app", async ({ page }) => {
  await page.goto("/#/home");
  await page.getByLabel(/Paste a link/).fill("https://example.com/chair");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await expect(page.getByLabel("Search the web or enter an address")).toHaveValue("https://example.com/chair");
  await expect(page.getByRole("alert")).toContainText("desktop app");
});

test.describe("canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/canvas/b-esp32");
    await expect(page.getByRole("button", { name: "ESP32 Node Programmer" })).toBeVisible();
  });

  test("renders the seeded board with provenance marks", async ({ page }) => {
    await expect(page.getByTestId("item-image").first()).toBeVisible();
    await expect(page.getByTestId("item-sticky").filter({ hasText: "no pull-up" })).toBeVisible();
    await expect(page.getByRole("img", { name: "sourced" }).first()).toBeVisible();
    await expect(page.getByText("no evidence yet")).toBeVisible();
  });

  test("adds a sticky, undoes it, and redoes it", async ({ page }) => {
    await expect(page.getByTestId("item-sticky").first()).toBeVisible();
    // Only what's on screen is mounted, so count the new note itself.
    const note = page.getByTestId("item-sticky").filter({ hasText: "Test note" });
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.mouse.click(1100, 640);
    await page.getByLabel("Sticky note text").fill("Test note");
    await page.mouse.click(1380, 300);
    await expect(note).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(note).toHaveCount(1);
  });

  test("selecting an image shows where it's from, and dragging moves it", async ({ page }) => {
    const image = page.getByRole("img", { name: "ESP32 dev board" });
    await image.click();
    await expect(page.getByLabel("Where it's from")).toContainText("Ubahnverleih");
    await expect(page.getByLabel("Where it's from")).toContainText("Human-made");
    await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeVisible();
    const box = (await image.boundingBox())!;
    // Near the top: the details panel can sit over the lower half of a picture low on the screen.
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + 48, { steps: 5 });
    await page.mouse.up();
    const after = (await image.boundingBox())!;
    expect(after.x).toBeLessThan(box.x - 100);
  });

  test("zoom buttons change the zoom, and a section drag carries its contents", async ({ page }) => {
    const zoom = page.getByTestId("zoom");
    // The board fits itself to the window once the layout settles; wait for that before reading it.
    let start = await zoom.textContent();
    await expect.poll(async () => {
      const now = await zoom.textContent();
      const same = now === start;
      start = now;
      return same;
    }, { intervals: [300] }).toBe(true);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoom).not.toHaveText(start!);
    await zoom.click();
    await expect(zoom).toHaveText(start!);

    const image = page.getByRole("img", { name: "ESP32 die shot" });
    const before = (await image.boundingBox())!;
    const label = (await page.getByText("The board", { exact: true }).boundingBox())!;
    await page.mouse.move(label.x + 5, label.y + 5);
    await page.mouse.down();
    await page.mouse.move(label.x + 80, label.y + 60, { steps: 4 });
    await page.mouse.up();
    const after = (await image.boundingBox())!;
    expect(after.x).toBeGreaterThan(before.x + 40);
  });

  test("the canvas survives a reload", async ({ page }) => {
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.mouse.click(1100, 640);
    await page.getByLabel("Sticky note text").fill("Persisted note");
    await page.mouse.click(1380, 300);
    await expect(page.getByTestId("save-state")).toContainText("browser preview");
    await page.reload();
    await expect(page.getByText("Persisted note")).toBeVisible();
  });
});

test("Threads draws a graph and lists what's unsupported", async ({ page }) => {
  await page.goto("/#/threads");
  await expect(page.getByTestId("graph").locator("canvas").first()).toBeVisible();
  await expect(page.getByLabel("Details")).toContainText("Beginners will prefer");
  await page.getByLabel("Details").getByRole("button", { name: /Beginners will prefer/ }).click();
  await expect(page.getByLabel("Details").getByRole("link", { name: "Open" })).toBeVisible();
});

// Reads a node's place from the graph itself. Cytoscape keeps its instance on the container.
const nodePlace = (page: Page) =>
  page.getByTestId("graph").evaluate((el) => {
    const cy = (el as unknown as { _cyreg: { cy: { nodes(): { position(): { x: number; y: number } }[] } } })._cyreg.cy;
    const p = cy.nodes()[0].position();
    return `${p.x},${p.y}`;
  });

test("Threads drifts, and Pause motion stops it", async ({ page }) => {
  await page.goto("/#/threads");
  await page.waitForTimeout(2500);
  const a = await nodePlace(page);
  await page.waitForTimeout(400);
  expect(await nodePlace(page)).not.toBe(a);

  await page.getByRole("button", { name: "Pause motion" }).click();
  await page.waitForTimeout(2500);
  const b = await nodePlace(page);
  await page.waitForTimeout(400);
  expect(await nodePlace(page)).toBe(b);

  await page.reload();
  await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
});

test("Threads holds still when the system asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/threads");
  await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
  await page.waitForTimeout(300);
  const a = await nodePlace(page);
  await page.waitForTimeout(400);
  expect(await nodePlace(page)).toBe(a);
});

test("Threads keeps the same graph when filtering, and restores it", async ({ page }) => {
  await page.goto("/#/threads");
  await page.waitForTimeout(1500);
  const graph = page.getByTestId("graph");
  const count = () =>
    graph.evaluate((el) => (el as unknown as { _cyreg: { cy: { nodes(): { length: number } } } })._cyreg.cy.nodes().length);
  const all = await count();
  await graph.evaluate((el) => ((el as unknown as { _mark: unknown })._mark = (el as unknown as { _cyreg: { cy: unknown } })._cyreg.cy));
  await page.getByRole("button", { name: "Canvases", exact: true }).click();
  await expect.poll(count).toBeLessThan(all);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect.poll(count).toBe(all);
  expect(
    await graph.evaluate((el) => {
      const e = el as unknown as { _mark: unknown; _cyreg: { cy: unknown } };
      return e._mark === e._cyreg.cy;
    }),
  ).toBe(true);
});

test("Share shows the page and comments, and takes a new one", async ({ page }) => {
  await page.goto("/#/share/b-esp32");
  await expect(page.getByLabel("Headline")).toHaveValue("Wire blocks, get firmware");
  await expect(page.getByLabel("Comments")).toContainText("I2C pins");
  await page.getByPlaceholder("Write a comment…").fill("Looks good");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByLabel("Comments")).toContainText("Looks good");
  await expect(page.getByLabel("Comments")).toContainText("3 open");
});

test("Share exports a self-contained page", async ({ page }) => {
  await page.goto("/#/share/b-esp32");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export share page" }).click();
  expect((await download).suggestedFilename()).toBe("Wire blocks get firmware.html");
});

test("Present steps through sections", async ({ page }) => {
  await page.goto("/#/present/b-esp32");
  await expect(page.getByRole("heading", { name: "Hardware" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Editor" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "ESP32 Node Programmer" })).toBeVisible();
});

test("the command palette navigates and searches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search or run a command").fill("ESP32 Enclosure");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "ESP32 Enclosure" })).toBeVisible();
});

test("settings: name is kept, dark theme applies, sample data removes cleanly", async ({ page }) => {
  await page.goto("/#/settings");
  await page.getByPlaceholder("Your name").fill("Test Person");
  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Remove sample data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByPlaceholder("Your name")).toHaveValue("Test Person");
  await page.goto("/#/home");
  await expect(page.getByText("ESP32 Node Programmer")).toHaveCount(0);
  await page.goto("/#/library");
  await expect(page.getByText("Your library is empty.")).toBeVisible();
  await page.goto("/#/lab");
  await expect(page.getByRole("button", { name: "New decision" })).toBeVisible();
  await page.goto("/#/threads");
  await expect(page.getByRole("heading", { name: "Threads" })).toBeVisible();
});

test("the app makes no network requests on its own", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const host = new URL(r.url()).hostname;
    if (!["localhost", ""].includes(host)) external.push(r.url());
  });
  for (const path of ["/", "/#/canvas", "/#/library", "/#/explore", "/#/threads", "/#/lab", "/#/share"]) {
    await page.goto(path);
    await page.waitForTimeout(250);
  }
  expect(external).toEqual([]);
});
