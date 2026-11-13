// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { delimitedToMarkdown, htmlToMarkdown, parseDelimited, pptxToMarkdown, tableMarkdown, toMarkdown, xlsxToMarkdown } from "./markItDown";

describe("markItDown", () => {
  it("reads CSV with quoted commas, quotes and line breaks", () => {
    expect(parseDelimited('a,b\n"x, y","say ""hi"""\n"two\nlines",3')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "3"],
    ]);
  });

  it("makes a square table, escaping pipes", () => {
    expect(tableMarkdown([["Name", "Note"], ["a|b"]])).toBe("| Name | Note |\n| --- | --- |\n| a\\|b |  |");
    expect(delimitedToMarkdown("x\ty\n1\t2", "\t")).toBe("| x | y |\n| --- | --- |\n| 1 | 2 |");
  });

  it("turns HTML into Markdown and drops scripts", () => {
    const md = htmlToMarkdown(
      `<h1>Title</h1><p>Some <b>bold</b> and <a href="https://x.org">a link</a>.</p><script>alert(1)</script>
       <ul><li>one</li><li>two<ul><li>inner</li></ul></li></ul><table><tr><th>A</th></tr><tr><td>1</td></tr></table>`,
    );
    expect(md).toContain("# Title");
    expect(md).toContain("Some **bold** and [a link](https://x.org).");
    expect(md).toContain("- one\n- two\n  - inner");
    expect(md).toContain("| A |\n| --- |\n| 1 |");
    expect(md).not.toContain("alert");
  });

  it("reads each Excel sheet as a table, with shared strings", () => {
    const zip = zipSync({
      "xl/workbook.xml": strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Parts" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/sharedStrings.xml": strToU8(`<sst><si><t>Part</t></si><si><t>Cost</t></si><si><t>Motor</t></si></sst>`),
      "xl/worksheets/sheet1.xml": strToU8(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>12.5</v></c></row></sheetData></worksheet>`,
      ),
    });
    expect(xlsxToMarkdown(zip)).toBe("## Parts\n\n| Part | Cost |  |\n| --- | --- | --- |\n| Motor |  | 12.5 |");
  });

  it("reads PowerPoint slides in order, with titles and notes", () => {
    const slide = (title: string, body: string) =>
      strToU8(`<p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`);
    const zip = zipSync({
      "ppt/slides/slide10.xml": slide("Last", "bye"),
      "ppt/slides/slide2.xml": slide("Intro", "hello"),
      "ppt/notesSlides/notesSlide2.xml": strToU8(`<p:notes xmlns:p="p" xmlns:a="a"><a:p><a:t>Say it slowly</a:t></a:p><a:p><a:t>2</a:t></a:p></p:notes>`),
    });
    expect(pptxToMarkdown(zip)).toBe("## Slide 2: Intro\n\n- hello\n\n> Notes: Say it slowly\n\n## Slide 10: Last\n\n- bye");
  });

  it("picks the reader from the file name", async () => {
    expect(await toMarkdown("notes.md", strToU8("# Hi\n"))).toEqual({ markdown: "# Hi", format: "Markdown" });
    expect((await toMarkdown("data.json", strToU8('{"a":1}'))).markdown).toBe('```json\n{\n  "a": 1\n}\n```');
    expect((await toMarkdown("a.py", strToU8("x = '```'"))).markdown).toBe("````python\nx = '```'\n````");
    await expect(toMarkdown("photo.heic", new Uint8Array())).rejects.toThrow(/can't be read/);
  });
});
