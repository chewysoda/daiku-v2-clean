import { describe, expect, it } from "vitest";
import { mathToMathml } from "../design/MathText";
import { hasMath, splitMath } from "./math";

const math = (tex: string, display = false) => ({ kind: "math", tex, display });
const text = (t: string) => ({ kind: "text", text: t });

describe("splitMath", () => {
  it("finds inline math", () => {
    expect(splitMath("so $E=mc^2$ holds")).toEqual([text("so "), math("E=mc^2"), text(" holds")]);
    expect(splitMath("\\(x+1\\)")).toEqual([math("x+1")]);
  });

  it("finds display math, across lines", () => {
    expect(splitMath("$$a\nb$$")).toEqual([math("a\nb", true)]);
    expect(splitMath("see \\[ \\int x \\]")).toEqual([text("see "), math("\\int x", true)]);
  });

  it("leaves prices alone", () => {
    for (const s of ["It costs $5 and $10", "$5-$10", "between $ and $", "US$ 40", "pay $100"]) {
      expect(hasMath(s), s).toBe(false);
    }
  });

  it("treats an escaped dollar as a dollar", () => {
    expect(splitMath("\\$5 and $x$")).toEqual([text("$5 and "), math("x")]);
    expect(splitMath("$a\\$b$")).toEqual([math("a\\$b")]);
  });

  it("leaves unfinished math as text", () => {
    for (const s of ["$x", "$$x", "\\(x", "\\[x", "$$$$", "$a\nb$"]) {
      expect(splitMath(s), s).toEqual([text(s)]);
    }
  });

  it("handles empty and plain text", () => {
    expect(splitMath("")).toEqual([]);
    expect(splitMath("plain")).toEqual([text("plain")]);
  });

  it("finds several in a row", () => {
    expect(splitMath("$a$ and $b$")).toEqual([math("a"), text(" and "), math("b")]);
  });
});

describe("exported math", () => {
  const esc = (s: string) => s.replace(/</g, "&lt;");

  it("uses MathML, and escapes the text around it", async () => {
    const html = (await mathToMathml(esc))("<b> $x^2$");
    expect(html).toContain("&lt;b>");
    expect(html).toContain("<math");
    expect(html).not.toContain("katex-html");
  });

  it("refuses links and scripts inside a formula", async () => {
    const html = (await mathToMathml(esc))(String.raw`$\href{javascript:alert(1)}{x}$ $\includegraphics{a.png}$`);
    expect(html).not.toContain("javascript:alert(1)\"");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
  });
});
