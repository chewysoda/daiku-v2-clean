# Daiku v2: resource audit (step A0)

Verdicts follow `DAIKU_V2_GLASS_PROMPT.md` A3. **Nothing has been deleted.** Anything marked "Archive" is moved to
`design/archive/` only in step A9, and only after a yes.

## Brand (`design/brand/`)
| Resource | Verdict | Used by |
|---|---|---|
| monogram-sage / ink / white / small-no-slit | Keep | `src/design/Icon.tsx` (Monogram), installer, share page |
| wordmark-* | Keep, rare use | Title bar, About |
| lockup-horizontal | Keep | Installer, share page |
| app-icon-light / dark (+1024) | Improve later: frosted-tile variant, same shape | `src-tauri/icons` |
| _brand-sheet.png | Keep; redo after an icon change | Docs only |

## Tokens and design code
| Resource | Verdict | Done in v2 |
|---|---|---|
| `design/design/tokens.json` | Improve | Glass levels, solid fallbacks, `conflict` amber, selection set to brand lilac, accent split from sourced, dark finalised |
| `src/design/tokens.css`, `tokens.ts` | Regenerated only | `npm run tokens` |
| `src/design/global.css` | Improve | Glass layer added in `src/design/glass.css`; hard-coded colours left for a later pass |
| `src/design/motion.css` | Improve | Spring timings for tray, panels, palette |
| `src/design/primitives.tsx` | Improve | `GlassPanel`, `Chip`, `StateBadge` |
| `Icon.tsx`, `MarkdownText`, `MathText` | Keep | |

## Icons (`design/icons/`)
Keep the 1.5 px set. Add `handoff`, `pin`, `review`, `tray` drawn on the same grid. Nothing removed.

## Pictures and backdrops
| Resource | Verdict | Used by |
|---|---|---|
| `design/images/` furniture set (boucle, oak, walnut, ply, frp, linen, lounge, room, shadow, sketch, swatch, tube, detail) | Archive in A9 with the chair sample | `src/data/seed.ts`, `seedAgents.ts` (CHAIR_PROJECT) |
| `design/images/agent-*` | Archive in A9 if the agent sample goes | `seedAgents.ts`, `Home.tsx` |
| `src/design/backdrops/` aurora, rosewood, terracotta, workshop | Trim from the gallery (too loud behind glass); files kept | `ThemeGallery.tsx` |
| `src/design/backdrops/` graphite, nocturne, paper, blueprint | Keep | `ThemeGallery.tsx` |
| `public/samples/chair.stl`, `study.pdf` | Archive in A9 with the chair sample; CAD viewer stays | `seed.ts` |
| `design/screens/v2/` | Keep as reference | |
| `design/screens/v1-light`, `dark-charcoal`, `dark-forest` | Archive in A9 | Docs only |
| `design/wireframes/` | Keep | |

## Sample data
| Resource | Verdict |
|---|---|
| `src/data/seed.ts` (chair) | Replace with the ESP32 sample (Part B) in A9 |
| `src/data/seedAgents.ts` | Off first launch; keep the file. **Ask before removing.** |
| `withoutSamples()`, `is_sample` | Keep |

## Screens
| Screen | v2 |
|---|---|
| Canvas | **Board** (`/board`), home |
| Library | **Library** |
| Lab | **Decide** (`/decide`) |
| Build pack + Send to Claude | **Handoff** (`/handoff`), with Review |
| Home | Off the sidebar; `/home` in Ctrl+K |
| Explore, Threads, Notes, Drafting, Progress, Export, Share, Settings | Kept, reached from Ctrl+K |
| Reader | Right side panel over any screen; the full page stays |
| Old routes | Redirect (`/canvas` → `/board`, `/lab` → `/decide`, `/pack` → `/handoff`) |

## Choices made without asking (say if you want them changed)
- **Fonts:** UI stays Segoe UI Variable, which ships with Windows 11, so no new font download. Fraunces for rare titles, DM Mono for data. Geist or Inter can still be swapped in with one token.
- **Accent split:** the interactive accent is a neutral (ink in light, near-white in dark). Sage now only means brand and "sourced".
- **Selection:** brand lilac `#8F82CF`, as the brand rules say. `tokens.json` had blue.
- **Default theme for new installs:** dark. Existing installs keep theirs.
