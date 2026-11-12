# Daiku build pipeline (recommendation)

These are recommendations with trade-offs, not settled decisions. Check licences and current docs before committing to any library.

## 1. Design → spec
- `design/tokens.json` becomes CSS variables with light and dark modes. No more hand-duplicating screens per theme.
- v2 is the source of truth. Component inventory: rail, pill button, image card, provenance card, matrix row, sticky note, floating toolbar.

## 2. Stack
- **Shell: Tauri 2.** Web frontend in a small native app, Windows first, with Mac and Linux possible later. Electron is the easier JavaScript-only alternative but ships much larger and uses more RAM, which matters for image-heavy boards.
- **Frontend:** React, TypeScript and Vite.
- **Canvas:**
  - Evaluate the tldraw SDK first, but check its current licence.
  - Otherwise build on PixiJS or Konva.
  - Threads graph: Cytoscape.js or Sigma.js.
- **Storage ("files over app"):**
  - Assets and notes are normal files in a folder the user can see.
  - Metadata lives in SQLite.
  - Notes are Markdown, so Obsidian export is nearly free.
  - Make the data model CRDT-ready (Yjs or Automerge) now, so paid sync slots in later.
- **Search, all local and free:**
  - SQLite FTS5 for text.
  - Palettes extracted at import and stored in LAB colour space.
  - Optionally, an ONNX image-embedding model for "soft curves"-style search.
- **Research:** OpenAlex, Semantic Scholar, arXiv and Crossref APIs. Free, with rate limits.
- **Engineering:** pdf.js for the Reader; three.js plus an OpenCascade WebAssembly loader for STEP (STL is built in).

## 3. Build → release
- GitHub repo, with GitHub Actions building the Windows installer on tagged releases, plus Tauri's updater.
- Tests:
  - Vitest for logic, especially the Lab scoring maths.
  - Playwright for click-through flows.
- Crash reports and analytics opt-in only.
- **Code signing:** unsigned builds trigger SmartScreen warnings. A certificate costs money; unsigned with clear instructions is fine for a small pilot.

## 4. Build order
1. Capture, Library and Canvas, with automatic credits (daily habit)
2. Lab and evidence links (the differentiator); **pilot after this slice**
3. Threads and Obsidian export
4. Explore and Reader
5. Sync and Class Workspaces (revenue)
6. CAD and simulation import

## Warnings
- **"Human-made only" can't be delivered as a promise.** AI-image detectors aren't reliable enough. Build it as provenance instead: source URL, embedded Content Credentials (C2PA) when present, and user flags.
- **Scope is large for one person.** Slices 1–2 are a solid first release; let pilot feedback decide the rest.
