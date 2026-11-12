// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hasMarkdown, markdownToHtml } from "./MarkdownText";

describe("Markdown in notes", () => {
  it("formats headings, emphasis, lists and links", async () => {
    const html = await markdownToHtml("# Title\n\n**bold** and *it*\n\n- one\n\n[site](https://example.com)");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('href="https://example.com"');
  }, 20000);

  it("removes scripts, handlers and javascript links", async () => {
    const html = await markdownToHtml('<script>alert(1)</script><b onclick="x()">hi</b> [a](javascript:alert(1))');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toMatch(/href="\s*javascript/i);
  }, 20000);

  it("never loads a remote picture, which would break the no-network promise", async () => {
    const html = await markdownToHtml('![x](https://tracker.example/p.png) <img src="https://tracker.example/q.png"><iframe src="https://x.example"></iframe>');
    expect(html).not.toContain("tracker.example");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
  }, 20000);

  it("keeps a formula's underscores and stars out of Markdown's hands", async () => {
    const html = await markdownToHtml(String.raw`Sum $a_1 * b_1 * c_1$ done`);
    expect(html).toContain("katex");
    expect(html).not.toContain("<em>");
  }, 20000);

  it("knows what's worth a preview", () => {
    expect(hasMarkdown("# Heading")).toBe(true);
    expect(hasMarkdown("some **bold** text")).toBe(true);
    expect(hasMarkdown("- a list")).toBe(true);
    expect(hasMarkdown("[a](https://b.c)")).toBe(true);
    expect(hasMarkdown("It costs $5 or $10")).toBe(false);
    expect(hasMarkdown("A plain sentence, with 2 * 3 in it.")).toBe(false);
    expect(hasMarkdown("See also [[Comfort questions]].")).toBe(false);
  });
});

