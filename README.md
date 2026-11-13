# Daiku

A place where ideas take form: a local-first visual research and engineering workspace for evidence-backed concept
selection. Windows-first desktop app, built with Tauri 2, React and TypeScript.

- **Home:** continue a board, search everything, see what needs attention.
- **Canvas:** infinite board with images, stickies, sections, connectors, palettes and undo. Every image shows its credit.
- **Library:** your files as normal files, with full-text and colour search. Add code too: paste a snippet, or pick files from a public GitHub repository. Code keeps its credit and licence, and is shown, never run.
- **Explore:** a Chromium browser and free scholarly search. Save images and papers with their source attached.
- **Threads:** a graph of how everything links, with unsupported items flagged.
- **Lab:** weighted decision matrix, where unsourced scores stay marked as guesses and the app shows what would flip the result.
- **Share:** present a board, comment on it, or export one self-contained page.
- **Send to Claude:** any board or decision, with its sources and claims, as text to paste or a zip for a Claude project.

How the features connect: [FEATURES.md](FEATURES.md).

See [design/README.md](design/README.md) for the design package.

## Install it

**Got `Daiku-Setup-<version>.exe`?** Double-click it. Daiku installs in under a minute for your user only, with nothing
else to download. It isn't code-signed, so Windows asks you to confirm: "More info", then "Run anyway".

### Give it to someone

Don't send them this folder: building it on a new PC downloads several GB of tools and takes half an hour or more.
Run `npm run share` instead. It builds the installer and puts `Daiku-Setup-<version>.exe` (about 120 MB) in `share\`,
then opens that folder. Send them that one file. Pushing a version tag to GitHub builds the same installer as a draft
release, so you can send a download link instead.

### Build it from source

Double-click **`Install Daiku.cmd`**. If a ready-made setup file is next to it, or in `share\`, it just runs that.
Otherwise it checks for Node.js, Rust, the Microsoft C++ build tools and WebView2, offers to install anything missing
with winget (it asks first), builds the app and runs the Daiku setup. On a new PC the tools are several GB and the
first build compiles Rust for 10 to 20 minutes.

From PowerShell: `powershell -ExecutionPolicy Bypass -File .\install.ps1` with `-BuildOnly` to only build the
installer, `-Share` to build it into `share\`, `-Rebuild` to build even when a setup file is there, `-Yes` to skip
the questions, or `-SkipChecks` on a machine that's already set up.

### Updates

Off until there's somewhere to update from. With a GitHub repo for releases, run once:

```
npm run updates:setup -- owner/repo
```

It makes a signing key in `~/.tauri` (never in the project), points the app at that repo's latest release, and says
which two secrets to add on GitHub. Copies built after that can update themselves from Settings.

## Run it

```
npm install
npm run tauri dev     # run the app (the first Rust build is slow)
npm run dev           # UI only, in a browser, with localStorage instead of SQLite
npm test              # unit tests
npm run test:e2e      # click-through tests in Edge
npm run lint
npm run tauri build   # installer: src-tauri/target/release/bundle/nsis/
cd src-tauri && cargo test --lib
```

## Layout

| Path | What |
|---|---|
| `src/app` | Shell, routing, title bar, command palette |
| `src/design` | Generated tokens (`npm run tokens`), `Icon`, primitives, global CSS |
| `src/features/*` | The app's screens |
| `src/data` | Types, store (zustand), repo (SQLite, or localStorage in a plain browser), sample data |
| `src/lib` | Pure logic: scoring, readiness, colour, search, web and capture parsing, scholarly APIs |
| `src-tauri/src/explore` | The Chromium browser pane and its capture script |
| `src-tauri/src/library.rs` | Library files, image download, scholarly proxy |
| `src-tauri/migrations` | SQLite schema |
| `e2e` | Playwright click-through tests; `e2e/native` checks the real app |
