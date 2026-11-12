import { CSSProperties, useState } from "react";
import { DashStyle, Figure } from "../../data/types";
import { Popover } from "../../design/primitives";
import { DASHES, DRAW_COLORS, DrawStyle, FIGURES } from "./drawing";

/** Colour, weight, opacity and line style, for a drawing tool or for selected drawings. */
export function DrawBar({
  label,
  value,
  showFill,
  showFigures,
  showFeel,
  showSketchy,
  style,
  onChange,
  menu,
}: {
  label: string;
  value: DrawStyle;
  showFill: boolean;
  showFigures: boolean;
  showFeel?: boolean;
  showSketchy?: boolean;
  style: CSSProperties;
  onChange: (changes: Partial<DrawStyle>) => void;
  /** Actions for a selected drawing. A tool has none. */
  menu?: { label: string; onClick: () => void }[];
}) {
  const [more, setMore] = useState(false);
  return (
    <div className="ctx-bar draw-bar" role="toolbar" aria-label={label} data-ui style={style}>
      {showFigures &&
        FIGURES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ctx ctx-figure ${value.figure === f.id ? "on" : ""}`}
            aria-label={f.label}
            aria-pressed={value.figure === f.id}
            title={f.label}
            onClick={() => onChange({ figure: f.id as Figure })}
          >
            {f.glyph}
          </button>
        ))}
      {showFigures && <span className="ctx-sep" />}
      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`ctx-swatch ${value.color?.toLowerCase() === c.toLowerCase() ? "on" : ""}`}
          style={{ background: c }}
          aria-label={`Colour ${c}`}
          aria-pressed={value.color?.toLowerCase() === c.toLowerCase()}
          onClick={() => onChange({ color: c })}
        />
      ))}
      <label className="ctx-swatch ctx-custom" title="Any colour">
        <input type="color" aria-label="Custom colour" value={value.color ?? "#1E1F1C"} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <span className="ctx-sep" />
      <label className="ctx-tilt" title="Thickness">
        <span className="ctx-dot" aria-hidden="true" style={{ width: Math.min(14, 3 + value.width / 3), height: Math.min(14, 3 + value.width / 3) }} />
        <input type="range" min={1} max={40} step={1} aria-label="Thickness" value={value.width} onChange={(e) => onChange({ width: Number(e.target.value) })} />
      </label>
      <label className="ctx-tilt" title="Opacity">
        <span aria-hidden="true">◐</span>
        <input type="range" min={10} max={100} step={5} aria-label="Opacity" value={Math.round(value.opacity * 100)} onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })} />
      </label>
      <select className="ctx-select" aria-label="Line style" value={value.dash} onChange={(e) => onChange({ dash: e.target.value as DashStyle })}>
        {DASHES.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      {showFeel && (
        <button
          type="button"
          className={`ctx ${value.feel === "natural" && value.dash === "solid" ? "on" : ""}`}
          aria-pressed={value.feel === "natural" && value.dash === "solid"}
          title="A line that swells and thins as you draw, and responds to stylus pressure"
          disabled={value.dash !== "solid"}
          onClick={() => onChange({ feel: value.feel === "natural" ? "even" : "natural" })}
        >
          Natural
        </button>
      )}
      {showSketchy && (
        <button type="button" className={`ctx ${value.sketchy ? "on" : ""}`} aria-pressed={!!value.sketchy} title="Make it look drawn by hand" onClick={() => onChange({ sketchy: !value.sketchy })}>
          Sketchy
        </button>
      )}
      {showFill && (
        <>
          <span className="ctx-sep" />
          <label className="ctx-swatch ctx-fill" title="Fill colour" style={value.fill ? { background: value.fill } : undefined}>
            <input type="color" aria-label="Fill colour" value={value.fill ?? "#FBFAF7"} onChange={(e) => onChange({ fill: e.target.value })} />
          </label>
          <button type="button" className="ctx" aria-label="No fill" title="No fill" disabled={!value.fill} onClick={() => onChange({ fill: undefined })}>
            ∅
          </button>
        </>
      )}
      {menu && (
        <div className="ctx-anchor">
          <button type="button" className="ctx" aria-label="More" onClick={() => setMore((m) => !m)}>
            ⋯
          </button>
          {more && (
            <Popover className="more-pop" onClose={() => setMore(false)}>
              {menu.map((m) => (
                <button key={m.label} type="button" className="palette-row" onClick={m.onClick}>
                  {m.label}
                </button>
              ))}
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}
