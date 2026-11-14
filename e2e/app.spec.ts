import { expect, Page, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

test("Home shows the design's board, decision and feed", async ({ page }) => {
  await page.goto("/#/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  await expect(page.getByRole("link", { name: "Continue Furniture Study" })).toBeVisible();
  await expect(page.getByLabel("Needs a look")).toContainText("still a guess");
  await expect(page.getByRole("main").getByText("ESP32 Node Programmer").first()).toBeVisible();
});

test("opens on the board, and every sidebar link opens its screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/board/);
  for (const [label, heading] of [
    ["Library", "Library"],
    ["Decide", "Which chair base?"],
    ["Handoff", "Handoff"],
    ["Settings", "Settings"],
  ]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("Lab shows the expected totals and flips when a guess is corrected", async ({ page }) => {
  await page.goto("/#/lab");
  await expect(page.getByTestId("total-A")).toHaveText("3.75");
  await expect(page.getByTestId("total-B")).toHaveText("3.70");
  await expect(page.getByTestId("total-C")).toHaveText("3.35");
  await expect(page.getByRole("heading", { name: "Too close to call." })).toBeVisible();
  await expect(page.getByLabel("Verdict")).toContainText("A drops to 3.55 and B leads");
  await expect(page.getByLabel("Verdict")).toContainText("B takes the lead below 18.3%");

  await page.getByRole("button", { name: /Oak ply shell, Cost: 4, a guess/ }).click();
  await page.getByRole("group", { name: "Score" }).getByRole("button", { name: "3" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("total-A")).toHaveText("3.55");
});

test("linking a source turns a guess into a sourced score; unlinking reverts it", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByRole("button", { name: /Oak ply shell, Cost: 4, a guess/ }).click();
  await page.getByRole("button", { name: "Link a source" }).click();
  await page.getByRole("button", { name: "Rift oak" }).click();
  await expect(page.getByRole("button", { name: /Oak ply shell, Cost: 4, sourced/ })).toBeVisible();
  await page.getByRole("button", { name: "Unlink Rift oak" }).click();
  await expect(page.getByRole("button", { name: /Oak ply shell, Cost: 4, a guess/ })).toBeVisible();
});

test("the what-if slider only keeps weights when asked", async ({ page }) => {
  await page.goto("/#/lab");
  await page.getByLabel("How much does cost matter?").fill("15");
  await expect(page.getByTestId("total-B")).not.toHaveText("3.70");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("total-B")).toHaveText("3.70");
});

test("Library searches by text and colour, and adds to a board with credits", async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByRole("figure")).toHaveCount(35);
  await page.getByLabel(/Search the library/).fill("walnut");
  await expect(page.getByRole("figure")).toHaveCount(1);
  await page.getByLabel(/Search the library/).fill("");
  await expect(page.getByRole("figure")).toHaveCount(35);

  await page.goto("/#/library?colour=%23C9A67D");
  await expect(page.getByRole("figure").first()).toContainText("Rift oak");
  await expect(page.getByText(/near oak/)).toBeVisible();

  await page.goto("/#/library");
  await page.getByLabel("Credited only").check();
  await expect(page.getByText("Tube base")).toHaveCount(0);
  await page.getByLabel("Credited only").uncheck();
  await page.getByText("Walnut veneer").hover();
  await page.getByRole("button", { name: "Select Walnut veneer" }).click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Add to board" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Brand Direction" }).click();
  await expect(page.getByRole("button", { name: "Brand Direction" })).toBeVisible();
});

test("Home's search and swatches lead to the Library", async ({ page }) => {
  await page.goto("/#/home");
  await page.getByLabel(/Paste a link/).fill("oak");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByLabel(/Search the library/)).toHaveValue("oak");
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
    await page.goto("/#/canvas/b-furniture");
    await expect(page.getByRole("button", { name: "Furniture Study" })).toBeVisible();
  });

  test("renders the seeded board with provenance marks", async ({ page }) => {
    await expect(page.getByTestId("item-image").first()).toBeVisible();
    await expect(page.getByTestId("item-sticky")).toContainText("mould lead time");
    await expect(page.getByLabel("assumption, no source yet")).toBeVisible();
    await expect(page.getByText("no source yet")).toBeVisible();
  });

  test("adds a sticky, undoes it, and redoes it", async ({ page }) => {
    await expect(page.getByTestId("item-sticky").first()).toBeVisible();
    const before = await page.getByTestId("item-sticky").count();
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.mouse.click(1100, 640);
    await page.getByLabel("Sticky note text").fill("Test note");
    await page.mouse.click(1380, 300);
    await expect(page.getByText("Test note")).toBeVisible();
    await expect(page.getByTestId("item-sticky")).toHaveCount(before + 1);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("item-sticky")).toHaveCount(before);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByTestId("item-sticky")).toHaveCount(before + 1);
  });

  test("selecting an image shows where it's from, and dragging moves it", async ({ page }) => {
    const image = page.getByRole("img", { name: "Reading corner" });
    await image.click();
    await expect(page.getByLabel("Where it's from")).toContainText("[studio]");
    await expect(page.getByLabel("Where it's from")).toContainText("Human-made");
    await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeVisible();
    const box = (await image.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 + 40, { steps: 5 });
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

    const image = page.getByRole("img", { name: "Lounge, oak legs" });
    const before = (await image.boundingBox())!;
    const label = (await page.getByText("form", { exact: true }).boundingBox())!;
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
  await expect(page.getByLabel("Details")).toContainText("Tube base");
  await page.getByLabel("Details").getByRole("button", { name: /Tube base/ }).click();
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
  await page.goto("/#/share/b-furniture");
  await expect(page.getByLabel("Headline")).toHaveValue("A softer reading chair");
  await expect(page.getByLabel("Comments")).toContainText("darker oak");
  await page.getByPlaceholder("Write a comment…").fill("Looks good");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByLabel("Comments")).toContainText("Looks good");
  await expect(page.getByLabel("Comments")).toContainText("3 open");
});

test("Share exports a self-contained page", async ({ page }) => {
  await page.goto("/#/share/b-furniture");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export share page" }).click();
  expect((await download).suggestedFilename()).toBe("A softer reading chair.html");
});

test("Present steps through sections", async ({ page }) => {
  await page.goto("/#/present/b-furniture");
  await expect(page.getByRole("heading", { name: "form" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "materials" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Furniture Study" })).toBeVisible();
});

test("the command palette navigates and searches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search or run a command").fill("gripper");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Gripper Concept" })).toBeVisible();
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
  await expect(page.getByText("Furniture Study")).toHaveCount(0);
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
