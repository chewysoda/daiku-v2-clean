import type { CSSProperties, FC } from "react";

export interface PatternWavesProps {
  preset?: "silk" | "ocean" | "pond" | "lines" | "terminal" | "mesh";
  pattern?: "dot" | "square" | "plus" | "line" | "glyph";
  wave?: "silk" | "swell" | "ripple";
  color?: string;
  backgroundColor?: string;
  spacing?: number;
  markSize?: number;
  depth?: number;
  light?: number;
  shine?: number;
  contrast?: number;
  speed?: number;
  scale?: number;
  direction?: number;
  opacity?: number;
  fade?: "edges" | "center" | "bottom" | "top" | "none";
  fadeSize?: number;
  characters?: string;
  interactive?: boolean;
  cursorSize?: number;
  cursorStrength?: number;
  intro?: boolean;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Daiku addition: overrides the system reduce-motion setting when given. */
  reducedMotion?: boolean;
}

declare const PatternWaves: FC<PatternWavesProps>;
export default PatternWaves;
