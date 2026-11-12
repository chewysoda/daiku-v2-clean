import type { CSSProperties } from "react";
import { BoardItem } from "../../data/types";
import { MathText } from "../../design/MathText";
import { useMemo } from "react";
import { arrowHead, dashArray, figurePath, smoothPath } from "./drawing";
import { pencilPath, seedOf, sketchPaths } from "./pencil";
import { fontCss, inkOn } from "./itemStyle";

const THEME_INK = "var(--c-text)";
/** Marks thinner than this would be fiddly to click, so an invisible wider line sits behind them. */
const MIN_GRAB = 12;

export function strokeProps(data: BoardItem["data"]) {
  const width = data.width ?? 2;
  return {
    fill: "none",
    stroke: data.color ?? THEME_INK,
    strokeWidth: width,
    strokeOpacity: data.opacity ?? 1,
    strokeDasharray: dashArray(data.dash, width),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

/** A pencil or marker line on the board. */
export function StrokeItem({ it, selected, style }: { it: BoardItem; selected: boolean; style: CSSProperties }) {
  const d = useMemo(() => smoothPath(it.data.points ?? []), [it.data.points]);
  const width = it.data.width ?? 2;
  // A dash needs a line to run along, so a dashed stroke stays an even one.
  const natural = it.data.feel === "natural" && (it.data.dash ?? "solid") === "solid";
  const outline = useMemo(() => (natural ? pencilPath(it.data.points ?? [], it.data.pressure, width) : ""), [natural, it.data.points, it.data.pressure, width]);
  return (
    <div className={`drawn ${selected ? "sel" : ""}`} data-testid="item-stroke" data-points={(it.data.points?.length ?? 0) / 2} style={style}>
      <svg width="100%" height="100%" viewBox={`0 0 ${it.data.vw || it.w} ${it.data.vh || it.h}`} preserveAspectRatio="none">
        <g data-item={it.id}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(width, MIN_GRAB)} strokeLinecap="round" />
          {natural ? <path d={outline} fill={it.data.color ?? THEME_INK} fillOpacity={it.data.opacity ?? 1} /> : <path d={d} {...strokeProps(it.data)} />}
        </g>
      </svg>
    </div>
  );
}

/** A rectangle, ellipse, diamond, triangle, line or arrow. Closed shapes can hold a label. */
export function ShapeItem({
  it,
  selected,
  style,
  editing,
  onLabel,
}: {
  it: BoardItem;
  selected: boolean;
  style: CSSProperties;
  editing: boolean;
  onLabel: (text: string) => void;
}) {
  const figure = it.data.figure ?? "rect";
  const { width: boxW, height: boxH } = { width: it.w, height: it.h };
  const d = figurePath(figure, boxW, boxH, it.data.flipX, it.data.flipY);
  const stroke = strokeProps(it.data);
  const open = figure === "line" || figure === "arrow";
  const labelColor = it.data.fill && !it.data.sketchy ? inkOn(it.data.fill) : (it.data.color ?? THEME_INK);
  const sketch = useMemo(
    () =>
      it.data.sketchy
        ? sketchPaths(figure, boxW, boxH, { seed: seedOf(it.id), color: it.data.color ?? THEME_INK, fill: open ? undefined : it.data.fill, width: it.data.width ?? 2, flipX: it.data.flipX, flipY: it.data.flipY })
        : null,
    [it.data.sketchy, figure, boxW, boxH, it.id, it.data.color, it.data.fill, it.data.width, it.data.flipX, it.data.flipY, open],
  );
  return (
    <div className={`drawn ${selected ? "sel" : ""}`} data-testid="item-shape" data-figure={figure} style={style}>
      <svg width="100%" height="100%" viewBox={`0 0 ${boxW} ${boxH}`} preserveAspectRatio="none">
        <g data-item={it.id}>
          <path d={d} fill={open ? "none" : (it.data.fill ?? "none")} stroke="transparent" strokeWidth={Math.max(it.data.width ?? 2, MIN_GRAB)} />
          {sketch ? (
            <g opacity={it.data.opacity ?? 1} data-sketchy="true">
              {sketch.map((p, i) => (
                <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
          ) : (
            <path d={d} {...stroke} fill={open ? "none" : (it.data.fill ?? "none")} fillOpacity={it.data.opacity ?? 1} />
          )}
          {figure === "arrow" && <path d={arrowHead(boxW, boxH, it.data.width ?? 2, it.data.flipX, it.data.flipY)} {...stroke} strokeDasharray={undefined} />}
        </g>
      </svg>
      {!open && (editing || it.data.text) && (
        <div className="shape-label" style={{ color: labelColor, fontFamily: fontCss(it.data.font) }}>
          {editing ? (
            <textarea
              autoFocus
              data-ui
              aria-label="Shape label"
              defaultValue={it.data.text}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => onLabel(e.target.value.trim())}
            />
          ) : (
            <span>
              <MathText text={it.data.text ?? ""} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
