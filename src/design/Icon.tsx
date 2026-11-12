// Phosphor icons (MIT), regular weight, with the fill weight for the current place.
const load = (files: Record<string, string>, dir: string) =>
  Object.fromEntries(
    Object.entries(files).map(([path, svg]) => [
      path.replace(dir, "").replace(".svg", ""),
      svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""),
    ]),
  ) as Record<string, string>;

const inner = load(
  import.meta.glob("/design/icons/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
  "/design/icons/",
);
const filled = load(
  import.meta.glob("/design/icons/fill/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
  "/design/icons/fill/",
);

export type IconName =
  | "arrow-right" | "canvas" | "check" | "close" | "comment" | "connector" | "crop" | "download"
  | "explore" | "hand" | "home" | "image" | "import" | "lab" | "library" | "link" | "maximize"
  | "minimize" | "more" | "nav-present" | "palette" | "play" | "plus" | "remove" | "search"
  | "select" | "settings" | "stickers" | "sticky-note" | "text" | "threads" | "zoom-in" | "zoom-out" | "pencil" | "marker" | "eraser" | "shapes"
  | "board" | "decide" | "handoff" | "pin" | "review" | "tray" | "sidebar" | "brief" | "warning" | "open";

export function Icon({ name, size = 20, fill = false }: { name: IconName; size?: number; fill?: boolean }) {
  return (
    <svg
      className="i"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      aria-hidden="true"
      // These are the app's own bundled SVGs, never user or web content.
      dangerouslySetInnerHTML={{ __html: (fill ? filled[name] : undefined) ?? inner[name] ?? "" }}
    />
  );
}

/** Rail logo. Brand rule: below 32 px use the no-slit monogram. */
export function Monogram({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="monogram"
      width={size}
      height={size * (164 / 176)}
      viewBox="16 18 176 164"
      role="img"
      aria-label="daiku"
    >
      <g fill="currentColor">
        <path d="M110 96C94 80 60 78 42 92C24 106 20 140 36 156C50 170 84 174 110 156L110 147C88 162 64 160 54 147C44 134 44 110 57 99C70 88 92 89 110 104Z" />
        <path d="M105 172C105 124 105 84 107 58C109 38 101 25 84 22C102 26 120 32 120 60C120 92 120 132 121 168C123 172 127 173 130 172C122 177 110 177 105 172Z" />
        <path d="M119 112C130 92 152 72 186 60C182 88 166 108 140 118C146 124 152 140 162 158C168 168 176 171 186 169C174 177 156 176 148 166C140 154 132 140 119 134Z" />
      </g>
    </svg>
  );
}
