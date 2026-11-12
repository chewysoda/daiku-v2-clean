/**
 * Finds TeX math in ordinary text. Understands $...$, $$...$$, \(...\) and \[...\], and uses the
 * same rule as Pandoc so that prices stay text: an opening $ can't be followed by a space, and a
 * closing $ can't follow a space or come before a digit. "\$" is a literal dollar sign.
 */
export type Segment = { kind: "text"; text: string } | { kind: "math"; tex: string; display: boolean };

export function splitMath(source: string): Segment[] {
  const out: Segment[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ kind: "text", text });
    text = "";
  };
  const math = (tex: string, display: boolean) => {
    flush();
    out.push({ kind: "math", tex, display });
  };

  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "\\$") {
      text += "$";
      i += 2;
      continue;
    }
    if (two === "$$" || two === "\\[" || two === "\\(") {
      const close = two === "$$" ? "$$" : two === "\\[" ? "\\]" : "\\)";
      const end = source.indexOf(close, i + 2);
      if (end > i + 2 && source.slice(i + 2, end).trim()) {
        math(source.slice(i + 2, end).trim(), two !== "\\(");
        i = end + 2;
        continue;
      }
    } else if (source[i] === "$") {
      const end = closingDollar(source, i + 1);
      if (end > 0) {
        math(source.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
    }
    text += source[i];
    i++;
  }
  flush();
  return out;
}

function closingDollar(s: string, from: number): number {
  if (from >= s.length || /\s/.test(s[from])) return -1;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\n") return -1;
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === "$") {
      const validEnd = i > from && !/\s/.test(s[i - 1]) && !/\d/.test(s[i + 1] ?? "");
      return validEnd ? i : -1;
    }
  }
  return -1;
}

export const hasMath = (source: string) => splitMath(source).some((s) => s.kind === "math");
