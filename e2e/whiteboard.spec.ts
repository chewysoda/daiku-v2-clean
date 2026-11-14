import { freshPack } from "./fresh";
import { expect, Page, test } from "@playwright/test";
import { withOlderSamples } from "./samples";

test.beforeEach(async ({ page }) => {
  await withOlderSamples(page);
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function emptyBoard(page: Page) {
  await page.goto("/#/canvas/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
  // A bare stretch of board, well away from anything: pan the sample items out of the way.
  await page.mouse.move(700, 450);
  await page.keyboard.down("Control");
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 300);
  await page.keyboard.up("Control");
}

async function draw(page: Page, points: [number, number][]) {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.up();
}

const strokes = (page: Page) => page.getByTestId("item-stroke");
const shapes = (page: Page) => page.getByTestId("item-shape");

// Far from the toolbar, the bars and the minimap.
const SCRIBBLE: [number, number][] = [[300, 120], [340, 90], [380, 130], [420, 95], [460, 125]];

test.describe("pencil and marker", () => {
  test("draws, stays on the tool for the next stroke, and undoes", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, SCRIBBLE);
    await expect(strokes(page)).toHaveCount(1);
    await draw(page, SCRIBBLE.map(([x, y]) => [x, y + 60] as [number, number]));
    await expect(strokes(page)).toHaveCount(2);
    // No pause: each stroke undoes on its own, however quickly the next one followed.
    await page.keyboard.press("Control+z");
    await expect(strokes(page)).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(strokes(page)).toHaveCount(0);
  });

  test("a single tap leaves a visible dot", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await page.mouse.click(400, 150);
    await expect(strokes(page)).toHaveCount(1);
    const box = (await strokes(page).locator("path").last().boundingBox())!;
    expect(box.width).toBeGreaterThan(0);
  });

  test("Shift draws a straight line", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await page.keyboard.down("Shift");
    await draw(page, [[300, 120], [380, 180], [500, 124]]);
    await page.keyboard.up("Shift");
    await expect(strokes(page)).toHaveAttribute("data-points", "2");
  });

  test("customises colour, thickness, opacity and line style, and remembers them", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    const bar = page.getByRole("toolbar", { name: "Pencil style" });
    await bar.getByRole("button", { name: "Colour #E5484D" }).click();
    await bar.getByLabel("Thickness").fill("12");
    await bar.getByLabel("Opacity").fill("50");
    await bar.getByLabel("Line style").selectOption("dashed");
    await draw(page, SCRIBBLE);
    const line = strokes(page).locator("path").last();
    await expect(line).toHaveAttribute("stroke", "#E5484D");
    await expect(line).toHaveAttribute("stroke-width", "12");
    await expect(line).toHaveAttribute("stroke-opacity", "0.5");
    await expect(line).toHaveAttribute("stroke-dasharray", /\d/);

    await page.reload();
    await expect(page.getByTestId("item-sticky").first()).toBeVisible();
    await page.keyboard.press("p");
    await expect(page.getByRole("toolbar", { name: "Pencil style" }).getByLabel("Thickness")).toHaveValue("12");
  });

  test("the marker is its own tool, translucent by default", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("m");
    await draw(page, SCRIBBLE);
    const line = strokes(page).locator("path").last();
    await expect(line).toHaveAttribute("stroke-opacity", "0.45");
    await expect(line).toHaveAttribute("stroke-width", "18");
    await expect(line).toHaveAttribute("stroke", "#F2D544");
  });

  test("the pencil draws a natural line by default, and can draw an even one", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, SCRIBBLE);
    const natural = strokes(page).first().locator("path").last();
    await expect(natural).toHaveAttribute("d", /Z$/);
    await expect(natural).not.toHaveAttribute("stroke", /./);

    await page.getByRole("toolbar", { name: "Pencil style" }).getByRole("button", { name: "Natural" }).click();
    await draw(page, SCRIBBLE.map(([x, y]) => [x, y + 80] as [number, number]));
    await expect(strokes(page).nth(1).locator("path").last()).toHaveAttribute("stroke-width", "3");
  });

  test("a marker doesn't pick up the pencil's colour", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await page.getByRole("toolbar", { name: "Pencil style" }).getByRole("button", { name: "Colour #E5484D" }).click();
    await page.keyboard.press("m");
    await draw(page, SCRIBBLE);
    await expect(strokes(page).locator("path").last()).toHaveAttribute("stroke", "#F2D544");
  });

  test("shortcuts keep working right after using a slider or menu in the bar", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await page.getByRole("toolbar", { name: "Pencil style" }).getByLabel("Thickness").fill("6");
    await page.keyboard.press("m");
    await expect(page.getByRole("toolbar", { name: "Marker style" })).toBeVisible();

    await page.getByRole("toolbar", { name: "Marker style" }).getByLabel("Line style").selectOption("dashed");
    await draw(page, SCRIBBLE);
    await page.keyboard.press("r");
    await expect(page.getByRole("toolbar", { name: "Shape style" })).toBeVisible();
  });

  test("a drawn stroke survives a reload", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, SCRIBBLE);
    await expect(strokes(page)).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.reload();
    await expect(strokes(page)).toHaveCount(1);
  });

  test("a stroke can be selected, restyled, moved and locked like anything else", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, [[300, 100], [500, 100]]);
    await page.keyboard.press("v");
    await page.mouse.click(400, 100);
    const bar = page.getByRole("toolbar", { name: "Stroke style" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Colour #3F6FB5" }).click();
    await expect(strokes(page).locator("path").last()).toHaveAttribute("fill", "#3F6FB5");

    const left = () => strokes(page).evaluate((n: HTMLElement) => parseFloat(n.style.left));
    const before = await left();
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(left).toBeCloseTo(before + 10);
    await page.keyboard.press("l");
    await page.keyboard.press("Delete");
    await expect(strokes(page)).toHaveCount(1);
  });

  test("clicking inside a stroke's empty box doesn't select it", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, [[300, 100], [300, 300], [600, 300]]);
    await page.keyboard.press("v");
    await page.mouse.click(520, 140);
    await expect(page.getByRole("toolbar", { name: "Stroke style" })).toHaveCount(0);
  });
});

test.describe("eraser", () => {
  test("rubs out strokes it touches, leaves others, and undoes", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, [[500, 300], [700, 300]]);
    await draw(page, [[500, 400], [700, 400]]);
    await page.waitForTimeout(700);
    await page.keyboard.press("e");
    await draw(page, [[600, 270], [600, 330]]);
    await expect(strokes(page)).toHaveCount(1);
    await page.waitForTimeout(700);
    await page.keyboard.press("Control+z");
    await expect(strokes(page)).toHaveCount(2);
  });

  test("leaves notes, images and locked drawings alone", async ({ page }) => {
    await emptyBoard(page);
    const notes = await page.getByTestId("item-sticky").count();
    await page.keyboard.press("p");
    await draw(page, [[300, 100], [500, 100]]);
    await page.keyboard.press("v");
    await page.mouse.click(400, 100);
    await page.keyboard.press("l");
    await page.keyboard.press("e");
    await draw(page, [[400, 60], [400, 140]]);
    await expect(strokes(page)).toHaveCount(1);
    const note = (await page.getByTestId("item-sticky").first().boundingBox())!;
    await draw(page, [[note.x + 10, note.y + 10], [note.x + 40, note.y + 40]]);
    await expect(page.getByTestId("item-sticky")).toHaveCount(notes);
  });
});

test.describe("shapes", () => {
  const pickShape = async (page: Page, name: string) => {
    await page.keyboard.press("r");
    await page.getByRole("toolbar", { name: "Shape style" }).getByRole("button", { name, exact: true }).click();
  };

  for (const [name, figure] of [["Rectangle", "rect"], ["Ellipse", "ellipse"], ["Diamond", "diamond"], ["Triangle", "triangle"], ["Line", "line"], ["Arrow", "arrow"]] as const) {
    test(`draws a ${figure}`, async ({ page }) => {
      await emptyBoard(page);
      await pickShape(page, name);
      await draw(page, [[320, 110], [520, 240]]);
      await expect(shapes(page)).toHaveCount(1);
      await expect(shapes(page)).toHaveAttribute("data-figure", figure);
      // Back to Select with it selected, ready to adjust.
      await expect(page.getByRole("toolbar", { name: "Shape style" })).toBeVisible();
    });
  }

  test("shapes can look drawn by hand, and stay that way", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Rectangle");
    await page.getByRole("toolbar", { name: "Shape style" }).getByRole("button", { name: "Sketchy" }).click();
    await draw(page, [[320, 110], [520, 240]]);
    const sketch = shapes(page).locator('[data-sketchy="true"] path');
    await expect(sketch.first()).toBeVisible();
    const before = await sketch.first().getAttribute("d");
    await page.waitForTimeout(400);
    await page.reload();
    await expect(shapes(page).locator('[data-sketchy="true"] path').first()).toHaveAttribute("d", before!);
  });

  test("an arrow drawn backwards points the way it was drawn", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Arrow");
    await draw(page, [[520, 240], [320, 110]]);
    await page.keyboard.press("Escape");
    const line = await shapes(page).locator("path").nth(1).getAttribute("d");
    expect(line).toMatch(/^M\d+(\.\d+)? \d+(\.\d+)?L0 0$/);
  });

  test("a click makes a usable shape rather than a speck", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Rectangle");
    await page.mouse.click(400, 150);
    const w = await shapes(page).evaluate((n: HTMLElement) => parseFloat(n.style.width));
    expect(w).toBe(160);
  });

  test("Shift makes a perfect square", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Rectangle");
    await page.keyboard.down("Shift");
    await draw(page, [[320, 110], [520, 170]]);
    await page.keyboard.up("Shift");
    const [w, h] = await shapes(page).evaluate((n: HTMLElement) => [n.style.width, n.style.height]);
    expect(w).toBe(h);
  });

  test("takes a fill and a label, with readable text", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Rectangle");
    const toolBar = page.getByRole("toolbar", { name: "Shape style" });
    await toolBar.getByLabel("Fill colour").fill("#1e1f1c");
    await draw(page, [[320, 110], [520, 240]]);
    const body = shapes(page).locator("path").nth(1);
    await expect(body).toHaveAttribute("fill", "#1e1f1c");

    await page.mouse.dblclick(420, 175);
    await page.getByLabel("Shape label").fill("Bracket");
    await page.mouse.click(700, 60);
    const label = shapes(page).locator(".shape-label");
    await expect(label).toContainText("Bracket");
    await expect(label).toHaveCSS("color", "rgb(251, 250, 247)");

    await page.mouse.click(420, 175);
    await page.getByRole("toolbar", { name: "Shape style" }).getByRole("button", { name: "No fill" }).click();
    await expect(shapes(page).locator("path").nth(1)).toHaveAttribute("fill", "none");
  });

  test("resizes without distorting a thin line's minimum size", async ({ page }) => {
    await emptyBoard(page);
    await pickShape(page, "Line");
    await page.keyboard.down("Shift");
    await draw(page, [[320, 150], [520, 151]]);
    await page.keyboard.up("Shift");
    const h = await shapes(page).evaluate((n: HTMLElement) => parseFloat(n.style.height));
    expect(h).toBeLessThanOrEqual(1);
  });
});

test.describe("handwriting", () => {
  test("offers To text once writing is selected", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, [[500, 200], [540, 260]]);
    await draw(page, [[560, 200], [600, 260]]);
    await page.keyboard.press("v");
    await draw(page, [[470, 170], [630, 290]]);
    const bar = page.getByRole("toolbar", { name: "Align selection" });
    await expect(bar.getByRole("button", { name: "To text" })).toBeVisible();
  });

  test("reads handwritten math as a formula, on this machine, and undoes", async ({ page }) => {
    test.setTimeout(180000);
    const external: string[] = [];
    page.on("request", (r) => {
      if (!["localhost", ""].includes(new URL(r.url()).hostname)) external.push(r.url());
    });
    await emptyBoard(page);
    await page.keyboard.press("p");
    // An x, and a raised 2.
    await draw(page, [[500, 240], [560, 320]]);
    await draw(page, [[560, 240], [500, 320]]);
    await draw(page, [[580, 215], [595, 200], [612, 205], [612, 222], [580, 252], [618, 252]]);
    await page.keyboard.press("v");
    await draw(page, [[470, 170], [650, 350]]);
    await page.getByRole("toolbar", { name: "Align selection" }).getByRole("button", { name: "To LaTeX" }).click();
    await expect(page.getByTestId("item-text").locator(".katex")).toBeVisible({ timeout: 150000 });
    await expect(strokes(page)).toHaveCount(0);
    expect(external).toEqual([]);
    await page.waitForTimeout(600);
    await page.keyboard.press("Control+z");
    await expect(strokes(page)).toHaveCount(3);
  });

  test("a selection with no writing in it doesn't offer it", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("Control+a");
    await expect(page.getByRole("toolbar", { name: "Align selection" }).getByRole("button", { name: "To text" })).toHaveCount(0);
  });
});

test.describe("the whole board", () => {
  test("copies and pastes drawings", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await draw(page, [[300, 100], [500, 100]]);
    await page.keyboard.press("v");
    await page.mouse.click(400, 100);
    const copied = await page.evaluate(() => {
      const dt = new DataTransfer();
      window.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData("application/x-daiku-items");
    });
    await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.setData("application/x-daiku-items", data);
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, copied);
    await expect(strokes(page)).toHaveCount(2);
  });

  test("Escape puts the drawing tool down", async ({ page }) => {
    await emptyBoard(page);
    await page.keyboard.press("p");
    await expect(page.getByRole("toolbar", { name: "Pencil style" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar", { name: "Pencil style" })).toHaveCount(0);
  });

  test("the shortcuts list covers the new tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("Eraser");
  });
});

test.describe("spiral map", () => {
  const places = (page: Page) =>
    page.getByTestId("graph").evaluate((el) => {
      const cy = (el as unknown as { _cyreg: { cy: { nodes(): { map<T>(f: (n: { id(): string; position(): { x: number; y: number } }) => T): T[] } } } })._cyreg.cy;
      return cy.nodes().map((n) => ({ id: n.id(), ...n.position() }));
    });

  test("lays nodes along a spiral, and remembers it", async ({ page }) => {
    await page.goto("/#/threads");
    await expect(page.getByTestId("graph").locator("canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Pause motion" }).click();
    const web = await places(page);
    await page.getByLabel("Layout").selectOption("spiral");

    await expect.poll(async () => JSON.stringify(await places(page)) !== JSON.stringify(web)).toBe(true);
    await page.waitForTimeout(1200);
    const spiral = await places(page);
    // No two nodes on top of one another.
    for (let i = 0; i < spiral.length; i++) {
      for (let j = i + 1; j < spiral.length; j++) {
        expect(Math.hypot(spiral[i].x - spiral[j].x, spiral[i].y - spiral[j].y)).toBeGreaterThan(40);
      }
    }
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByLabel("Layout")).toHaveValue("spiral");
  });

  test("order and spacing change it, and Web goes back", async ({ page }) => {
    await page.goto("/#/threads");
    await expect(page.getByTestId("graph").locator("canvas").first()).toBeVisible();
    await expect(page.getByLabel("Order")).toHaveCount(0);
    await page.getByLabel("Layout").selectOption("spiral");
    await page.waitForTimeout(900);
    const spread = (list: { x: number; y: number }[]) => Math.max(...list.map((p) => Math.hypot(p.x, p.y)));
    const near = spread(await places(page));
    await page.getByLabel("Node spacing").fill("2");
    await page.waitForTimeout(900);
    expect(spread(await places(page))).toBeGreaterThan(near * 1.3);

    await page.getByLabel("Order").selectOption("name");
    await page.waitForTimeout(700);
    await page.getByLabel("Layout").selectOption("rings");
    await page.waitForTimeout(700);
    await page.getByLabel("Layout").selectOption("web");
    await expect(page.getByLabel("Order")).toHaveCount(0);
  });

  test("draws a tree, running left to right", async ({ page }) => {
    await page.goto("/#/threads");
    await expect(page.getByTestId("graph").locator("canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Pause motion" }).click();
    await page.getByLabel("Layout").selectOption("tree");
    await page.waitForTimeout(1200);
    const list = await places(page);
    const columns = new Set(list.map((p) => Math.round(p.x)));
    expect(columns.size).toBeGreaterThan(1);
    expect(columns.size).toBeLessThan(list.length);
  });

  test("still filters, selects and shows details on a spiral", async ({ page }) => {
    await page.goto("/#/threads");
    await page.getByLabel("Layout").selectOption("spiral");
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    const count = await page.getByTestId("graph").getAttribute("data-nodes");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect.poll(async () => Number(await page.getByTestId("graph").getAttribute("data-nodes"))).toBeGreaterThan(Number(count));
    await page.getByLabel("Details").getByRole("button", { name: /Tube base/ }).click();
    await expect(page.getByLabel("Details").getByRole("link", { name: "Open" })).toBeVisible();
  });
});

test.describe("build with Claude", () => {
  test.beforeEach(async ({ page }) => {
    await freshPack(page, false);
  });

  test("saves a pack with a brief, and remembers the brief", async ({ page }) => {
    await page.goto("/#/pack");
    const section = page.getByRole("main", { name: "Handoff" });
    await section.getByLabel("What do you want built?").fill("A product page for the chair");
    await section.getByLabel("Include the sample project").check();
    const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: "Export zip" }).click()]);
    expect(download.suggestedFilename()).toBe("Daiku pack.zip");
    const { unzipSync, strFromU8 } = await import("fflate");
    const { readFileSync } = await import("node:fs");
    const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
    const names = Object.keys(files);
    expect(names).toContain("CLAUDE.md");
    expect(strFromU8(files["CLAUDE.md"])).toContain("A product page for the chair");
    expect(names).toContain("boards/Furniture Study.md");
    expect(strFromU8(files["boards/Furniture Study.md"])).toContain("Ask the workshop");
    expect(names.some((n) => n.startsWith("attachments/"))).toBe(true);
    expect(names.some((n) => n.startsWith("Decisions/"))).toBe(true);

    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole("main", { name: "Handoff" }).getByLabel("What do you want built?")).toHaveValue("A product page for the chair");
  });

  test("leaves sample data out unless asked", async ({ page }) => {
    await page.goto("/#/pack");
    const section = page.getByRole("main", { name: "Handoff" });
    const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: "Export zip" }).click()]);
    const { unzipSync } = await import("fflate");
    const { readFileSync } = await import("node:fs");
    const names = Object.keys(unzipSync(new Uint8Array(readFileSync(await download.path()))));
    expect(names).not.toContain("boards/Furniture Study.md");
    expect(names).toContain("CLAUDE.md");
  });

  test("copies everything as text", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/#/pack");
    const section = page.getByRole("main", { name: "Handoff" });
    await section.getByLabel("Include the sample project").check();
    await section.getByRole("button", { name: "Copy as text" }).click();
    await expect(page.locator(".toast")).toContainText("tokens");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('<file path="CLAUDE.md">');
    expect(text).toContain("Furniture Study");
  });
});
