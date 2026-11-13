import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function wordFile() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Motor choice", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun("The stepper is "), new TextRun({ text: "quieter", bold: true }), new TextRun(".")] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

test("uploads files as Markdown into a folder on the board, and opens it", async ({ page }) => {
  await page.goto("/#/canvas/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
  const folders = page.getByTestId("item-folder");
  await expect(folders).toHaveCount(0);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload files as Markdown" }).click();
  await (await chooser).setFiles([
    { name: "motor notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await wordFile() },
    { name: "parts.csv", mimeType: "text/csv", buffer: Buffer.from("Part,Cost\nMotor,12.50\n") },
    { name: "study.pdf", mimeType: "application/pdf", buffer: readFileSync("public/samples/study.pdf") },
  ]);

  await expect(folders).toHaveCount(1);
  await expect(folders).toContainText("3 files");

  await folders.dblclick();
  const dialog = page.getByRole("dialog", { name: /^Folder:/ });
  await expect(dialog).toBeVisible();
  const files = dialog.getByRole("list", { name: "Files in this folder" });
  await expect(files).toContainText("motor notes");
  await expect(files).toContainText("Word");
  await expect(dialog.locator(".folder-md h1")).toHaveText("Motor choice");
  await expect(dialog.locator(".folder-md strong")).toHaveText("quieter");

  await files.getByRole("button", { name: /^parts/ }).click();
  await expect(dialog.locator(".folder-md td").first()).toHaveText("Motor");

  await files.getByRole("button", { name: /^study/ }).click();
  await dialog.getByRole("button", { name: "Show Markdown" }).click();
  await expect(dialog.locator(".folder-raw")).toContainText("## Page 1");

  await dialog.getByLabel("Folder name").fill("Motor research");
  await dialog.getByLabel("Folder name").press("Enter");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(folders).toContainText("Motor research");
});

test("scrolling zooms the board, and shift+scroll pans", async ({ page }) => {
  await page.goto("/#/canvas/b-furniture");
  await expect(page.getByTestId("item-sticky").first()).toBeVisible();
  const zoom = page.getByTestId("zoom");
  const before = await zoom.textContent();
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -300);
  await expect(zoom).not.toHaveText(before!);
  const zoomed = await zoom.textContent();
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 200);
  await page.keyboard.up("Shift");
  await expect(zoom).toHaveText(zoomed!);
});
