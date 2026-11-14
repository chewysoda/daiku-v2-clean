# Daiku v2: find, plan and fix everything (prompt for Fable 5.2)

Start Claude Code in the project root on Fable 5.2:

```
cd "C:\Users\k1mchi\Downloads\daiku v2 clean"
claude --model claude-fable-5-2
```

(or type `/model` in a running session and pick Fable 5.2), then say:
**"Read FABLE_FIX_PROMPT.md and start with Phase 0."**

---

## Your job

Daiku is a local-first Windows desktop app: Tauri 2 (Rust in `src-tauri/`), React 19, TypeScript, zustand, SQLite,
Vite 8. Find every real bug, plan the fixes, then fix them. After that, make it faster and polish the design. This is
a hardening pass, **not a rewrite**: keep the data model, the store, the routes and the features working the same way
for the user unless a fix needs a change, and then say so.

Work in phases. Finish and verify each one before you start the next. At the end of each phase, stop, give me a
short summary, and wait for my "go".

### Read these first, in this order

1. `README.md`, `FEATURES.md`: what the app does and how the parts connect
2. `graphify-out/GRAPH_REPORT.md`: the code graph. Query it with `/graphify` before reading files by hand
3. `design/docs/v2-audit.md`, `design/docs/brand-rules.md`, `design/design/tokens.json`: design rules and tokens
4. `DAIKU_V2_GLASS_PROMPT.md`, `REDESIGN_PROMPT.md`: what the last redesign was meant to do, so you can spot what it
   left half-done

### Skills to use

These skills are installed in `~/.claude/skills/` and the plugins. Load each one with the Skill tool when its phase
starts, not all at once, and say which ones you loaded.

| Phase | Load these skills | Use them for |
|---|---|---|
| Every phase | `graphify` | Who uses a file or store slice before you change it |
| Every phase | `andrej-karpathy-skills:karpathy-guidelines` | Every code change: small, surgical, a stated check per fix |
| 0, 2, 3 | `run` | Launching the app and driving it to see a change working |
| 1 | `fable-think` | The audit and the ranked plan; any fix that crosses many files |
| 1 | `security-review`, `engineering:tech-debt` | Security gaps; what to clean up vs. leave alone |
| 2 | `deep-debug` | Any bug whose cause is not obvious (crashes, races, flaky tests) |
| 2 | `quick-edit` | One-line, mechanical fixes (like the lint warning) |
| 2 | `build-feature` | A fix that needs a missing control, state or test added |
| 2, 3 | `tauri-v2` | Anything in `src-tauri/`: commands, capabilities, IPC, updater, installer |
| 2, 3 | `engineering:testing-strategy` | Which tests to add so each bug stays fixed |
| 3 | `deep-debug` | Profiling slow screens and re-renders |
| 4 | `impeccable` | Design audit and polish of every screen |
| 4 | `emil-design-eng` | Motion, micro-interactions, the small details |
| 4 | `frontend-design` | Visual hierarchy and type, within the existing brand |
| 4 | `web-design-guidelines`, `design:accessibility-review` | Interface rules and WCAG 2.1 AA |
| 4 | `design:design-critique`, `design:design-system` | Consistency across screens; tokens in `tokens.json` |
| End of each phase | `code-review`, `simplify` | Review your own diff and clean it up |

Don't use `design-taste-frontend`: it's for marketing websites, not a desktop app.

---

## Where things stand today (measured Nov 14, 2026)

- `npx tsc --noEmit`: clean
- `npx eslint src`: 0 errors, 1 warning (unused disable directive, `src/app/Hello.tsx:67`)
- `npx vitest run`: 49 files, 660 tests, all pass (32 s; Vitest says `isolate: false` would save time)
- Last Playwright run: passed
- `dist/assets` is 23 MB. Biggest files:
  - `ort-wasm-simd-threaded*.wasm` 14.8 MB (onnxruntime, handwriting maths; the README says it downloads on first use, so
    check why it is in the bundle)
  - `pdf.worker.min*.mjs` 1.27 MB
  - `roommates*.mp4` 1.05 MB (a backdrop video)
  - `CadViewer*.js` 656 KB (three.js), `Threads*.js` 623 KB (cytoscape), `pdf*.js` 444 KB,
    `index*.js` 408 KB (the entry chunk), `lib*.js` 308 KB, `katex*.js` 259 KB
- Hot spots by size: `src/features/canvas/Canvas.tsx` (1,992 lines), `src/data/store.ts` (872),
  `src/features/lab/Engineering.tsx` (844), `src/features/pack/Pack.tsx` (759), `src/features/explore/Explore.tsx`
  (709), `src/features/threads/graphMotion.ts` (593), `src/components/reactbits/*` (900+ lines each)

Re-run all of these yourself first. These numbers are the baseline every later phase is measured against.

---

## Phase 0: Baseline (no code changes)

1. Run `npm install` only if `node_modules` is out of date. Then `npx tsc --noEmit`, `npm run lint`, `npm test`,
   `npm run build`, `npm run test:e2e`, `npm run contrast`, and `cargo check` + `cargo clippy` in `src-tauri/`.
2. Record results in `design/docs/fix-baseline.md`: pass/fail counts, warnings, build time, every chunk size, and the
   time to first paint of `/board` and `/home` in `npm run dev` (use Playwright with the performance API).
3. Start the app once (`npm run tauri dev`) and click through every screen: Board, Library, Explore, Decide, Threads,
   Handoff, Home, Notes, Drafting, Progress, Export, Share, Settings, Reader. Write down every console error, warning,
   failed request, layout break and slow interaction.

## Phase 1: Audit and plan (no code changes)

Use `fable-think`. Go through the code area by area and look for real problems, not style nits:

- **Correctness:** wrong logic, off-by-ones, stale closures, missing `useEffect` cleanup, listeners and timers that
  never get removed, unhandled promise rejections, race conditions between the store, SQLite and the file system,
  undo/redo that loses or duplicates state, broken redirects (`/canvas`, `/lab`, `/pack`)
- **Data safety:** anything that can lose or corrupt a user's files or database rows: partial writes, missing
  transactions, migrations, import/export round trips (`dataExport.ts`, `claudePack.ts`, `packPlan.ts`, `docModel.ts`)
- **Rust side:** `unwrap()`/`expect()` that can crash the app, blocking work on the main thread, path handling
  (spaces, Unicode, long Windows paths), `library.rs`, `explore/` (built-in browser and adblock)
- **Security:** Tauri capabilities wider than needed, CSP in `tauri.conf.json`, unsanitised HTML (check every
  `dangerouslySetInnerHTML` and Markdown/DOMPurify path), code files that must be "shown, never run"
- **Edge cases:** empty project, huge board (1,000+ items), very large PDF, offline, first launch with no samples,
  dark and light themes, 125 % and 150 % Windows scaling, small window sizes

Write the plan to `design/docs/fix-plan.md` as one table:

| ID | Area | File:line | What is wrong | How a user hits it | Severity (P0 crash/data loss · P1 broken feature · P2 rough edge · P3 cleanup) | Fix | How I'll verify it |

Rank by severity. Group the work into batches of related fixes. Mark anything you're not sure is a bug as
"Needs repro". **Stop here and wait for my go.**

## Phase 2: Fix the bugs

Work through `fix-plan.md` from P0 down, one batch at a time.

- For each bug: reproduce it first (a failing Vitest or Playwright test whenever possible), fix it with the smallest
  change that's right, then show the test now passes.
- Keep fixes surgical. Don't refactor nearby code you weren't asked to touch, unless the bug lives in that tangle; then
  say why.
- After each batch run `tsc`, `lint`, `test` and the related e2e specs. Nothing that passed before may fail now.
- Update the table: status, commit-ready summary, and the test that covers it.

## Phase 3: Performance

Measure before and after every change, and keep only changes that help.

- **Bundle:** keep the 14.8 MB onnxruntime wasm out of the installer and load it only when a formula is read (as the
  README promises). Lazy-load three.js (CadViewer), cytoscape (Threads), pdf.js, katex, tiptap, pixi, docx, pptxgenjs
  and mammoth behind the screens that need them. Get the entry chunk well under its current 408 KB. Compress or lazy-load
  `roommates.mp4` and the backdrop images, and pause backdrop video and WebGL (ogl, `reactbits/*`) when the window is
  hidden or the user prefers reduced motion.
- **Runtime:** profile the Board with 1,000+ items. Cut re-renders in `Canvas.tsx` (narrow zustand selectors,
  `useShallow`, memo where it measurably helps), keep pan/zoom/draw at 60 fps, move heavy work (PDF text, search
  indexing, `localExtract.ts`) off the main thread, and virtualise long lists in Library and Threads.
- **Startup:** time to first interactive screen, SQLite open and migrations, model fetch in `predev`.
- **Rust:** async commands for file and network work, no blocking on the UI thread.
- **Tests:** try `isolate: false` in Vitest if the suite stays green.

Add the before/after table to `fix-baseline.md`.

## Phase 4: Design polish

Follow `brand-rules.md` and `tokens.json`. Don't invent a new look; finish the one that exists.

- Replace hard-coded colours, spacing and radii in `global.css` and components with tokens (`npm run tokens`).
- Make every screen consistent: spacing, type scale, empty states, loading states, error states, focus rings,
  hover and pressed states.
- Check light and dark themes on every screen, plus `npm run contrast`. Fix every WCAG 2.1 AA failure
  (`e2e/a11y.spec.ts` with axe must pass), keyboard navigation and screen-reader labels.
- Motion: purposeful and short, springs from `motion.css`, and fully respect `prefers-reduced-motion`.
- Check 1280×720, 1920×1080 and a narrow window, at 100 % and 150 % scaling.
- **Images:** never generate images (no AI, no hand-drawn). If a screen needs a picture, use an existing asset in the
  repo or pull a real, credited one from online.
- Take before/after screenshots of every screen (`e2e/screens.mjs`) and refresh `.github/media/` if the README shots
  change.

## Phase 5: Final check

1. Run everything from Phase 0 again and compare with the baseline. All green, no new warnings.
2. Build the installer (`npm run installer`) and confirm it installs, launches and updates.
3. Run `code-review` on the full diff and fix anything it finds.
4. Give me: what was fixed (by ID), what got faster (with numbers), what changed in the design (with screenshots),
   and anything you left open and why.

---

## Rules

- Never delete files, data, samples or assets without asking. Move retired files to `design/archive/` only after a yes.
- Don't change the database schema or file formats without a migration and a round-trip test.
- Don't commit or push unless I ask. When I do, one commit per batch, written in plain words like the existing log.
- Don't add new dependencies unless one clearly replaces more code than it adds; ask first.
- If something is my call (a behaviour change, a removed feature, a visual direction), ask. Otherwise decide and say
  what you chose.
- Report honestly: if a test fails or you skipped something, say so.
