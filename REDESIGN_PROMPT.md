# Daiku v2 redesign: prompt for Claude Code

Paste this file into Claude Code from the project root (`daiku-redesign/`), or say:
"Read REDESIGN_PROMPT.md and start with step 1."

---

## Your job

Redesign Daiku, a local-first Windows desktop app (Tauri 2, React, TypeScript, SQLite, zustand), so it follows the
**Daiku UI/UX Concept** (Nov 10, 2026). Work on the existing code base, one build-order step at a time. Ship each step
as a working, tested app before you start the next. This is a redesign, not a rewrite: keep the data, the store and
the shared rules.

### Read these first, in this order

1. `design/docs/ui-ux-concept.txt`: the concept, as text (source: `C:\Users\k1mchi\Downloads\Daiku UI UX Concept.docx`)
2. `README.md` and `FEATURES.md`: what exists today and how it connects
3. `design/docs/brand-rules.md` and `design/design/tokens.json`: brand, type and colour roles
4. `graphify-out/GRAPH_REPORT.md`: the code graph. Use `/graphify` to query it before you go through files by hand.
5. `design/screens/v2/` (Home, Canvas, Lab, Library, Share): the latest screen references

## Skills to use

Load the skill before the work it covers. Don't load them all at once.

| Skill | Use it for | When |
|---|---|---|
| `graphify` | Finding which files a change touches (store consumers, `focusPlan()`, `applyPlan()`, `handOff.ts`) | Before every step |
| `andrej-karpathy-skills:karpathy-guidelines` | Small, focused changes; state assumptions; define how you'll check each step | Whenever you write code |
| `tauri-v2` | Drag and drop of files from the OS, IPC, capabilities, window behaviour, anything in `src-tauri/` | Steps 2, 3, and any Rust or config work |
| `frontend-design` | The visual direction: calm, content first, neutral base, one accent | Before steps 1 and 8, and when a new surface appears |
| `emil-design-eng` | Motion and interaction polish: pack tray slide, ranking reorder, panels, toolbar, toasts | Steps 4, 6, 8 |
| `web-design-guidelines` | Reviewing UI code against interface guidelines: focus, contrast, keyboard, forms | At the end of every step |
| `design:accessibility-review` | WCAG AA check, especially dimmed "left out" cards and the board outline | Steps 5 and 8 |
| `design:design-system` | Turning the evidence states and card types into tokens and primitives | Steps 1 and 5 |
| `design:ux-copy` | Empty states, left-out reasons, toasts, palette labels | Steps 2, 4, 8 |
| `design-taste-frontend` | **Only** for the client share page and exported pages (`features/share`), which are web pages. Daiku itself is an app, not a marketing site, so don't apply its website rules to the workspace. | Share and export pages |
| `claude-api` | The token meter: count tokens with the count-tokens API (optional, online), and keep the local estimate as a fallback | Step 4 |
| `code-review` and `security-review` | Before you call a step done | End of every step |

## Design rules (from the concept)

**Thesis:** a calm desk where research turns into a brief, and the brief is always visible. Every screen answers one
question: *what will the AI see, and why?* The feelings to design for are calm (Things 3, Apple Notes), fast (Linear,
Raycast) and trustworthy (an itemised receipt).

**Test every feature:** does it make the builder's intent clearer to the AI, or does it only add another place to put
things?

### Navigation: 8 sections become 4
| Today | Becomes |
|---|---|
| Canvas | **Board**, the home of each project |
| Library | **Library**, one list of every source |
| Lab | **Decide**, a table view |
| Build pack + Send to Claude | **Handoff**, the pack builder and its history |
| Explore | An "Add source" action (Ctrl+K, paste, drop) |
| Reader | A right side panel that opens from any source |
| Claims | A card type on the board and a filter in Library |
| Threads | Connections between cards on the board |

Rule: if a section only lists objects that live elsewhere, make it a filter or a panel, not a tab. Keep the code
behind Explore, Threads, Engineering, Progress, Deck and the other screens. Reach them from the palette or panels,
and don't delete features without asking me.

### Layout
- **Sidebar (left):** the 4 sections plus the project switcher; collapses to icons.
- **Board (centre):** home. Cards show their state at a glance.
- **Reader panel (right):** opens on source click, closes with Esc. Selecting text shows the claim toolbar.
- **Pack tray (bottom):** always visible, like a cart: token meter plus the button into Handoff. It's a wide drop zone (Fitts's law).

### Visual language
- Neutral base (warm greys), one accent for focus and primary buttons. Colour means evidence state and nothing else.
- Map the concept's states onto the existing brand roles. Don't invent new hues:

| State | Look | Brand token |
|---|---|---|
| Sourced | Solid border, small source chip | Sage |
| Guess | Dashed border, italic, "guess" label | Clay (guesses only) |
| Conflict | Amber outline plus warning icon | New `--conflict` token. Must be distinct from clay; ask me if it looks too close |
| In pack | Small filled dot in the corner | Accent |
| Left out | Dimmed, reason on hover, still 4.5:1 contrast | Neutral |
| Selection | | Lilac |

- Every state also has a shape or text cue, never colour alone.
- Shape means card type: sources are rectangles with a favicon or file icon, claims have a quote-mark corner, decisions have a mini score bar.
- Type: Fraunces for reading and titles, Comfortaa for UI (700 below 14 px), DM Mono for data and credits. Three sizes (title, body, caption); body 15–16 px, line height about 1.5.
- Motion: 150–250 ms, only to explain where things went. Respect `prefers-reduced-motion`.
- Dark mode and compact density from tokens (`npm run tokens`), never hard-coded colours.

### Interaction patterns
- Ctrl+K palette does everything and shows each action's shortcut. Build on `src/app/CommandPalette.tsx`.
- Shortcuts: Ctrl+K palette, Ctrl+N new card, Ctrl+Enter open Handoff, P pin/unpin in pack, Space preview, Ctrl+Z / Ctrl+Shift+Z undo/redo, ? shortcuts. Merge these into `src/app/ShortcutsHelp.tsx` without breaking existing ones. If one clashes (Ctrl+Y is redo today), keep both.
- Same right-click menu on every card: Open, Make claim, Add to pack, Pin, Link to…, Delete.
- Drag and drop: files and links onto the board to import, cards onto the pack tray to include, a card onto a card to link.
- Autosave with a quiet "Saved"; no Save buttons. Undo toast after deletes, no "are you sure?" dialogs.
- No modal dialogs in the five core flows. Optimistic UI under about 400 ms.
- Empty states name the next action ("Paste a link or drop a PDF to start").
- First launch opens a small finished sample project. Respect `withoutSamples()`.

### Rules that must not break
`isCredited()`, `withConsentOnly()`, `withoutSamples()`, `narrowToProject()`, `focusPlan()`, `applyPlan()`,
`weightedTotals()`, `saveBytes()`, `savePack()` and `copyPack()`. Handoff replaces the Build pack and Send to Claude
screens, but both must keep going through `handOff.ts`.

## Build order

Do one step at a time. After each one: run `npm run lint`, `npm test`, `npm run test:e2e` and `cargo test --lib` (in
`src-tauri`). Update the e2e tests for the new navigation. Check the UI in `npm run dev`, and in `npm run tauri dev`
for anything native. Then stop and give me a short summary with screenshots before you go on.

1. **Shell:** 4-item sidebar, project switcher, "Saved" indicator, Ctrl+K palette with the first actions, routes for Board / Library / Decide / Handoff (old routes redirect).
2. **Capture and cards:** paste or drop import anywhere, source cards with a loading shimmer, credits filled in automatically, Library list view with a Claims filter.
3. **Reader panel:** right side panel, text-selection toolbar (Highlight, Make claim, Add to pack), claim cards with source chips that jump back to the passage.
4. **Pack tray and Handoff:** drag to include; Pinned / Included / Left out with a one-line reason each; brief (goal, audience, must-haves, done-when), pre-filled from the last pack; a token meter by group, labelled with its model, that turns amber and names the conflict when over budget; "Preview as AI sees it"; Copy / ZIP / Send. Budget, weights and model sit behind "More options".
   → **Gate 1 slice. Stop here for the first usability round** (5 indie builders, tasks in the concept).
5. **Trust states:** guess vs sourced styling, conflict outline, left-out reasons on cards.
6. **Decide table:** options as rows, criteria as columns, weights; live ranking with a short reorder animation; unsourced scores shown as guesses.
7. **Review view:** AI output beside the brief; each must-have marked met / partly / unmet; one click starts a revision pack.
8. **Polish:** sample project, empty states, shortcuts sheet, dark mode, compact density, accessible outline of board cards for screen readers.

## How to work with me
- Ask before you remove a feature, change the SQLite schema, or add a dependency.
- Write a migration in `src-tauri/migrations` for any data change, and never edit old migrations.
- Prefer existing primitives in `src/design/primitives.tsx` and existing icons in `design/icons/`.
- Use plain copy: short sentences, no jargon.
- If the concept and the code disagree, say so and suggest a fix. Don't pick one silently.
