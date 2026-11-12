/**
 * The palette panel: shown beside a selected palette card. Every colour in every format, contrast
 * grades for each pair, the palette as code, and an eyedropper to add a colour from anywhere on screen.
 */
import { useMemo, useState } from "react";
import { Icon } from "../../design/Icon";
import { toast } from "../../design/primitives";
import { colourFormats, ColourFormats, contrastPairs, paletteAsCode, PaletteFormat } from "../../lib/designTools";
import { copyText } from "../../lib/platform";

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copied` : "Couldn't reach the clipboard");

const FORMATS: (keyof ColourFormats)[] = ["hex", "rgb", "hsl", "oklch"];
const CODE: { id: PaletteFormat; label: string }[] = [
  { id: "css", label: "CSS variables" },
  { id: "tailwind", label: "Tailwind" },
  { id: "tokens", label: "Design tokens" },
];

export function PaletteTools({
  name,
  colours,
  left,
  top,
  onColours,
}: {
  name: string;
  colours: string[];
  left: number;
  top: number;
  onColours: (colours: string[]) => void;
}) {
  const [tab, setTab] = useState<"colours" | "contrast" | "code">("colours");
  const [format, setFormat] = useState<PaletteFormat>("css");
  const pairs = useMemo(() => contrastPairs(colours), [colours]);
  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

  const pick = async () => {
    if (!Dropper) return;
    try {
      const { sRGBHex } = await new Dropper().open();
      const hex = colourFormats(sRGBHex)?.hex;
      if (!hex) return;
      if (colours.some((c) => c.toUpperCase() === hex)) toast(`${hex} is already in the palette`);
      else onColours([...colours, hex]);
    } catch {
      // Cancelled with Escape: nothing to do.
    }
  };

  return (
    <div className="palette-tools glass-3" data-ui style={{ left, top }} role="dialog" aria-label={`${name}: colour tools`}>
      <div className="pt-head">
        <div className="seg-group" role="tablist" aria-label="Palette tools">
          {(
            [
              ["colours", "Colours"],
              ["contrast", "Contrast"],
              ["code", "As code"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {Dropper && (
          <button type="button" className="pill small" title="Pick a colour from anywhere on screen, and add it" onClick={() => void pick()}>
            <Icon name="palette" size={14} />
            Pick from screen
          </button>
        )}
      </div>

      {tab === "colours" && (
        <ul className="pt-colours">
          {colours.map((c) => {
            const f = colourFormats(c);
            if (!f) return null;
            return (
              <li key={c} className="pt-colour">
                <span className="pt-chip" style={{ background: f.hex }} aria-hidden="true" />
                <span className="pt-formats">
                  {FORMATS.map((k) => (
                    <button key={k} type="button" className="pt-format" title={`Copy ${k.toUpperCase()}`} onClick={() => void copy(f[k], f[k])}>
                      {f[k]}
                    </button>
                  ))}
                </span>
                <button type="button" className="ib pt-remove" aria-label={`Remove ${f.hex}`} title="Remove from the palette" onClick={() => onColours(colours.filter((x) => x !== c))}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "contrast" && (
        <div className="pt-contrast">
          <p className="cap">Text on background, best first. AA or AAA is fine for body text; AA large only for big text and icons.</p>
          <ul>
            {pairs.slice(0, 10).map((p) => (
              <li key={`${p.text}${p.background}`} className="pt-pair">
                <span className="pt-sample" style={{ color: p.text, background: p.background }}>
                  Aa
                </span>
                <span className="pt-pair-name">
                  {p.text} on {p.background}
                </span>
                <span className="pt-ratio">{p.ratio}:1</span>
                <span className={`pt-grade ${p.grade === "Fail" ? "fail" : p.grade === "AA large" ? "large" : "pass"}`}>{p.grade}</span>
              </li>
            ))}
          </ul>
          {pairs.length === 0 && <p className="cap">Add a second colour to compare.</p>}
        </div>
      )}

      {tab === "code" && (
        <div className="pt-code">
          <div className="pt-code-head">
            <select className="field" aria-label="Code format" value={format} onChange={(e) => setFormat(e.target.value as PaletteFormat)}>
              {CODE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="pill small ink" onClick={() => void copy(paletteAsCode(name, colours, format), CODE.find((c) => c.id === format)!.label)}>
              Copy
            </button>
          </div>
          <pre>{paletteAsCode(name, colours, format)}</pre>
          <p className="cap">These tokens also go into DESIGN.md when you hand this board to Claude.</p>
        </div>
      )}
    </div>
  );
}
