import { useEffect, useMemo, useState } from "react";
import { hasMath, splitMath } from "../lib/math";

type Render = (tex: string, display: boolean) => string;

// KaTeX and its fonts load the first time any math appears, so most screens never pay for them.
let render: Render | null = null;
let loading: Promise<Render> | null = null;
function loadRender(): Promise<Render> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css"), import("katex/contrib/mhchem")]).then(([{ default: katex }]) => {
    render = (tex, display) =>
      // trust: false refuses \href, \includegraphics and raw HTML. A bad formula shows as red source.
      katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, maxExpand: 1000, maxSize: 40 });
    return render;
  });
  return loading;
}

/** One formula as HTML, for callers building their own markup. */
export async function renderMathHtml(tex: string, display: boolean): Promise<string> {
  return (render ?? (await loadRender()))(tex, display);
}

/** Text with any TeX in it typeset. Text with none is returned as it is, with nothing loaded. */
export function MathText({ text }: { text: string }) {
  const needed = useMemo(() => hasMath(text), [text]);
  const [, setReady] = useState(render !== null);
  useEffect(() => {
    if (needed && !render) {
      void loadRender().then(
        () => setReady(true),
        // Offline can't cause this, as it's all bundled. The source stays on screen if it ever fails.
        (e) => console.warn("Math failed to load:", e),
      );
    }
  }, [needed]);

  const segments = useMemo(() => splitMath(text), [text]);
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          s.text
        ) : render ? (
          // KaTeX escapes everything it's given, and trust: false leaves no way to inject markup.
          <span key={i} dangerouslySetInnerHTML={{ __html: render(s.tex, s.display) }} />
        ) : (
          <code key={i}>{s.tex}</code>
        ),
      )}
    </>
  );
}

/** For the exported page: MathML needs no fonts, stylesheet or script, so the file stays self-contained. */
export async function mathToMathml(escapeText: (t: string) => string): Promise<(text: string) => string> {
  const [{ default: katex }] = await Promise.all([import("katex"), import("katex/contrib/mhchem")]);
  return (text) =>
    splitMath(text)
      .map((s) =>
        s.kind === "text"
          ? escapeText(s.text)
          : katex.renderToString(s.tex, { displayMode: s.display, output: "mathml", throwOnError: false, strict: "ignore", trust: false, maxExpand: 1000 }),
      )
      .join("");
}
