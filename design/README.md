# Daiku — project files

Daiku (formerly MoodboardOS): a local-first visual research and engineering workspace for evidence-backed concept selection. Windows-first desktop app.

## What's in here

| Folder | Contents |
|---|---|
| `brand/` | Leaf "dk" monogram (sage, ink, white, small no-slit version), outlined wordmark (no font needed), horizontal lockup, app icons as SVG plus 1024 px PNG. `_brand-sheet.png` previews them all. |
| `icons/` | 33 interface icons from the v2 screens. 24 px grid, 1.5 px stroke, `currentColor`, so they take the text colour. `_icon-sheet.png` previews them. |
| `images/` | 13 placeholder illustrations (oak, walnut, bouclé, linen, ply, FRP shell, steel tube, lounge chair, room, sketch, detail, swatches, leaf shadow). For demos and dev data only, not product assets. |
| `design/tokens.json` | Colours (light final, dark provisional), fonts, type sizes, spacing, radius, shadows, layout rules. |
| `screens/` | PNG renders of every wireframe: `v2/` (current direction, 5 screens), `v1-light/` (15 screens), `dark-charcoal/` and `dark-forest/` (15 each, built on v1). |
| `wireframes/` | Source of all 50 screens (`.dc.html`, Design-canvas format) plus `canvas.json` (layout). They don't run standalone; read them for exact copy, layout and SVG paths. |
| `docs/` | Build pipeline, research notes behind v2, brand rules. |

## Which screens are current

- **v2** (Home, Canvas, Library, Lab, Client share) is the visual direction to build from.
- **v1** covers features v2 hasn't redrawn yet: Threads, Present, Class Workspace, Requirements, Simulation, CAD, Calcs/BOM, Explore, Reader, Claims, Interviews. Use them for function and flow, restyled to v2.
- **Dark themes** are built on v1 and are provisional.

## Fonts (not included; all free under the SIL Open Font License)

- Fraunces: italic, `SOFT` 100, `opsz` 144 (display)
- Comfortaa: 600/700 (interface)
- DM Mono: 400/500 (captions, data)

Install from Google Fonts or the `@fontsource` npm packages. The wordmark in `brand/` is already outlined, so it doesn't need the font.

## Notes

- Text in [brackets] is a placeholder, not real content. Lab scores are sample data. Expected totals: A 3.75, B 3.70, C 3.35.
