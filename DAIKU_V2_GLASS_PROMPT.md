# Daiku v2: liquid glass redesign, resource audit, and the ESP32 node programmer example

Prompt for Claude Code. Run it from the project root (`daiku-redesign/`):

> Read `DAIKU_V2_GLASS_PROMPT.md`. Start with Part A, step A0. Stop after each step and show me what changed.

This file builds on `REDESIGN_PROMPT.md` (navigation, flows, build order) and `Daiku Redesign Explainer.docx` (what
changes and what stays). Where they disagree, **this file wins on visual design, resources and the sample project**,
and `REDESIGN_PROMPT.md` wins on flows and build order.

---

## Contents

- Part A: the redesign. Principles, the liquid glass look, and an audit of every existing resource (keep, improve, remove)
- Part B: the new sample project, *ESP32 Node Programmer*, which ships inside Daiku as the first-launch example
- Part C: the build spec for the ESP32 node system itself, which the sample's pack hands to Claude
- Part D: checks, and what to ask me before doing

---

## 0. Read first, in this order

1. `design/docs/ui-ux-concept.txt`: the UI/UX concept (calm, fast, trustworthy; 4 sections; pack tray)
2. `REDESIGN_PROMPT.md`: navigation, layout, flows, 8-step build order
3. `README.md`, `FEATURES.md`: what exists and how it connects
4. `design/README.md`, `design/docs/brand-rules.md`, `design/design/tokens.json`: the current design package
5. `graphify-out/GRAPH_REPORT.md`: use `/graphify` to find every file a change touches before editing
6. `src/data/seed.ts`, `src/data/seedAgents.ts`: the current sample data, which Part B replaces

## 1. Skills to load

Load a skill right before the work it covers, not all at the start.

| Skill | Use it for |
|---|---|
| `graphify` | Before each step: which files import the thing you're changing |
| `andrej-karpathy-skills:karpathy-guidelines` | Every code change: small diffs, stated assumptions, a check for each step |
| `frontend-design` | Setting the liquid glass direction (A2) and any new surface |
| `emil-design-eng` | Glass motion: panel slides, tray, palette, node drag, ranking reorder, press states |
| `tauri-v2` | Window transparency and Mica/Acrylic effects, drag-drop from the OS, the `arduino-cli` sidecar and serial port (Part C) |
| `design:design-system` | Turning the glass layers, evidence states and port types into tokens and primitives |
| `web-design-guidelines` | Reviewing the UI code at the end of each step |
| `design:accessibility-review` | Contrast of text on glass, focus rings, reduced transparency and motion |
| `design:ux-copy` | Empty states, left-out reasons, node errors ("GPIO 34 is input only") |
| `design:design-critique` | A critique pass on screenshots after A3 and after C5 |
| `claude-api` | The token meter (count-tokens API, offline estimate as fallback) |
| `design-taste-frontend` | **Only** for the client share page and exported pages. Not for the app workspace. |
| `code-review`, `security-review` | Before calling any step done. Security matters most for the sidecar, serial access and snippet previews. |

---

# Part A: the redesign

## A1. Design principles

Each principle below says what it means *in Daiku*. When two pull against each other, the earlier one wins.

### For an AI tool (these come first)
1. **Show what the AI will see.** The pack tray, token meter and "Preview as AI sees it" are always one step away. Nothing goes to Claude that the user can't inspect first.
2. **Provenance on everything.** Every claim, score and node default points to its source. Unsourced items look like guesses (dashed, italic, "guess").
3. **The human decides.** AI suggestions (summaries, tags, write-back from Claude) arrive as proposals the user accepts, edits or rejects, never as silent changes.
4. **Show uncertainty.** Estimated token counts say "estimate". Generated code says which nodes it came from. AI summaries say "summary".
5. **Make cost visible.** Tokens per pack and tokens saved are shown in numbers, the way a receipt shows money.
6. **Everything AI does can be undone.** Write-back, auto-tags and generated packs all go through the same Ctrl+Z.
7. **Streaming states, never spinners alone.** Show progress as it happens: extraction shimmer on a card, a compiling log for firmware.

### For software in general
8. **Content first, chrome second.** Glass is for controls; research, text and code sit on solid surfaces.
9. **Fewer choices per screen** (Hick's law): 4 sections, the palette for the rest.
10. **Recognition over recall:** Ctrl+K lists every action with its shortcut.
11. **Direct manipulation:** drag cards to the tray, drag wires between nodes, see the result at once.
12. **Visible system status:** "Saved", compile progress, board connection state, token meter.
13. **Forgiveness:** undo instead of confirm dialogs; toasts with Undo after deletes.
14. **Consistency (Jakob's law):** standard shortcuts, the same right-click verbs everywhere.
15. **Response under ~400 ms:** optimistic updates; heavy work (extraction, compile) in the background.
16. **Accessible by default:** 4.5:1 text contrast on every surface including glass, a visible focus ring, never colour alone.
17. **As little design as possible:** if a border, shadow or blur doesn't explain hierarchy or state, remove it.

## A2. The look: liquid glass, sleek

**Idea:** a dark, quiet workspace where controls float on layers of frosted glass above solid content. It should feel
precise and light, like a pro tool, with no ornament. Liquid glass here means three things: real translucency (the
layer behind shows through, blurred), a thin specular edge that catches light, and motion that feels fluid and springy.

### Two layers, never mixed
| Layer | What lives there | Material |
|---|---|---|
| **Content** | Board canvas, cards, Reader text, Decide table cells, code, node bodies | Solid surfaces. No blur. Full contrast. |
| **Control** | Sidebar, pack tray, Ctrl+K palette, Reader panel frame, toolbars, menus, inspector, toasts | Glass |

**Rule:** glass never sits behind long text a person reads. The Reader *panel frame* is glass, but the page inside it
is a solid surface.

### Glass levels (new tokens)
Add these to `tokens.json`, generate them with `npm run tokens`, and use only the tokens, never raw values.

| Token | Use | Starting values (tune by eye and by contrast check) |
|---|---|---|
| `glass-base` | Window background | Windows Mica through Tauri `windowEffects`; fallback solid `bg` |
| `glass-1` | Sidebar, pack tray | `backdrop-filter: blur(20px) saturate(160%)`; tint `rgba(bg, 0.62)` |
| `glass-2` | Palette, Reader frame, inspector | `blur(28px) saturate(170%)`; tint `rgba(surface, 0.72)` |
| `glass-3` | Menus, tooltips, toasts | `blur(16px) saturate(150%)`; tint `rgba(surface, 0.82)` |
| `glass-edge` | 1 px inner highlight on every glass layer | top edge `rgba(255,255,255,0.18)` dark / `0.6` light, bottom fades to 0 |
| `glass-shadow` | Lift | soft and wide: `0 8px 32px rgba(0,0,0,0.28)` dark, lighter in light mode |
| `glass-solid-*` | Reduced-transparency fallback | opaque versions of each level |

- **Radii are concentric:** an inner element's radius equals the outer radius minus the padding. Start at 14 px for panels, 10 px for controls, 6 px for chips.
- **Tint has a floor:** if text on glass drops below 4.5:1 over the busiest backdrop, raise the tint opacity. Don't lower the blur.
- **Light and dark** both ship. Dark is the default for this look; light must still pass every check.

### Windows implementation
- Tauri 2 window: `"transparent": true` and `"windowEffects": { "effects": ["mica"] }` in `tauri.conf.json` (decorations are already `false`). Prefer Mica over Acrylic: Acrylic can lag while resizing. Load `tauri-v2` and check the current API before writing this.
- Mica is Windows 11 only. On Windows 10, or when the user turns off *Transparency effects* in Windows settings, fall back to solid `bg`. Detect it in Rust and pass a flag to the UI.
- CSS `backdrop-filter` works in WebView2. Respect `prefers-reduced-transparency` where the WebView supports it, **and** add a "Reduce transparency" switch in Settings → Appearance that swaps every glass token for `glass-solid-*`.

### Performance rules
- At most **3 blurred layers** on screen at once.
- During canvas pan, zoom or node drag, glass over the canvas may drop to `glass-solid` and restore on idle, if the frame rate falls under 60 fps.
- Test on an integrated GPU laptop. Target 60 fps panning a 300-card board with the tray and sidebar visible.
- No blur on anything that scrolls inside a list. Blur the container, not each row.

### Type
Comfortaa is rounded and friendly, which works against "sleek". The proposal:

| Role | Today | Proposed | Why |
|---|---|---|---|
| Interface | Comfortaa 600/700 | **Geist Sans** or **Inter** (both OFL, on `@fontsource`) | Neutral, tight, made for UI |
| Data, credits, code, node ports | DM Mono | **Geist Mono** (or keep DM Mono) | Matches the UI sans |
| Display (wordmark, board titles, big scores) | Fraunces italic | **Keep Fraunces, used rarely** | It's the brand; it gives the cold glass some warmth |
| Long reading in Reader | Fraunces | **Source Serif 4** or Fraunces at text optical size | Reading comfort at 15–16 px |

Three sizes: title, body (15 px UI, 16 px reading, line height 1.5), caption. **Show me both type options side by
side before switching.**

### Colour on glass
- The base is neutral greys with a slight cool tint for glass. Colour means **state only**:

| State | Look |
|---|---|
| Sourced | Solid border plus source chip (sage chip) |
| Guess | Dashed border, italic, "guess" label (clay) |
| Conflict | Amber outline plus warning icon (new `conflict` token, distinct from clay) |
| In pack | Small filled dot (accent) |
| Left out | Dimmed, reason on hover, still 4.5:1 |
| Selection | One selection colour (fix the lilac vs blue mismatch first) |

- **Resolve the sage clash:** sage is both the brand accent and "sourced". Proposal: make the interactive accent a neutral bright (white-ish in dark, ink in light) with a faint sage glow on focus, and keep sage for brand and sourced only. Ask before applying.
- **Node port types (Part C)** get their own small hue set, always paired with a port shape.

### Motion
- Springs, not linear easing: panels and the tray use a gentle spring (no visible overshoot over 2 %), 180–260 ms.
- Glass layers fade their blur in as they appear; they don't pop.
- Press states: 0.98 scale plus a glass-edge brighten for 120 ms.
- `prefers-reduced-motion` turns all of this into 120 ms opacity fades.

## A3. Resource audit: keep, improve, remove

**Remove** means take it out of the product and sample data. **Before deleting any file, list it and ask me.**
Moving a file to `design/archive/` doesn't need asking.

### Brand (`design/brand/`)
| Resource | Verdict | What to do |
|---|---|---|
| Monogram (sage, ink, white, small no-slit) | **Keep** | Works on glass as is. Use white on dark glass. |
| Wordmark (outlined Fraunces) | **Keep** | Use rarely: title bar and About only. |
| Horizontal lockup | **Keep** | For the installer and share pages. |
| App icons (light, dark, 1024 px) | **Improve** | Add a glass-style variant: monogram on a frosted tile with a specular edge. Keep the shape the same. |
| `_brand-sheet.png` | **Keep** | Regenerate after any icon change. |

### Tokens and design code
| Resource | Verdict | What to do |
|---|---|---|
| `design/design/tokens.json` | **Improve** | Add glass levels, `conflict`, port types, solid fallbacks; fix selection (lilac vs blue); split accent from sourced; finalise dark (it's marked provisional). |
| `src/design/tokens.css`, `tokens.ts` | **Improve** | Regenerated from tokens.json only. Never hand-edit. |
| `src/design/global.css` | **Improve** | Remove hard-coded colours; add the glass utilities. |
| `src/design/motion.css` | **Improve** | Retune durations to 120–260 ms and add springs. Keep the reduced-motion handling. |
| `src/design/primitives.tsx` | **Improve** | Add `GlassPanel`, `GlassBar`, `Chip`, `StateBadge`, `Port`. Reuse existing primitives first. |
| `src/design/Icon.tsx` | **Keep** | |
| `MarkdownText`, `MathText` | **Keep** | Render on solid surfaces only. |

### Icons (`design/icons/`, 33 SVGs, 24 px grid, 1.5 px stroke)
| Verdict | What to do |
|---|---|
| **Keep** the set and the grid | The thin 1.5 px stroke already suits a sleek look. |
| **Improve** | Check optical size at 16 px on glass; add 1.25 px variants if they blur. |
| **Add** | `handoff`, `decide` (if `lab` doesn't fit), `pack-tray`, `pin`, `review`, `link-cards`, `source-chip`, `node`, `port`, `wire`, `chip-esp32`, `upload`, `serial`, `wifi`, `gpio`. Same grid and stroke. |
| **Remove** | Icons only used by screens that go away. Find them with graphify first, then ask. |

### Pictures and backdrops
| Resource | Verdict | What to do |
|---|---|---|
| `design/images/` (13 furniture placeholders: oak, walnut, bouclé, chair…) | **Remove from the sample** → archive | They belong to the old chair sample. Part B replaces it. |
| `src/design/backdrops/` (8: aurora, blueprint, graphite, nocturne, paper, rosewood, terracotta, workshop) | **Improve and trim** | Behind glass, backdrops decide whether text is readable. Keep the quiet ones that pass contrast under every glass level (likely graphite, nocturne, paper, maybe blueprint). Move loud ones to archive. Mica itself becomes the default. |
| `public/samples/chair.stl`, `study.pdf` | **Remove from the sample** → archive | Replaced by Part B's sources. CAD viewer stays as a feature. |
| `design/screens/v2/` | **Keep as reference** | Still the layout reference; restyled to glass. |
| `design/screens/v1-light/`, `dark-charcoal/`, `dark-forest/` | **Archive** | Superseded. Keep only for function and flow of screens v2 never redrew. |
| `design/wireframes/*.dc.html` | **Keep as reference** | For copy and flows. |

**Images rule:** sample and product pictures must be real, existing images from the web (official product photos,
datasheet figures, screenshots of docs) with their credit and licence stored, never generated or drawn for the
sample. If a picture's licence doesn't allow bundling, store the link and credit and fetch it on first open.

### Sample data
| Resource | Verdict | What to do |
|---|---|---|
| `src/data/seed.ts` (chair: "Which chair base?") | **Replace** | Becomes the ESP32 sample (Part B). Keep its structure as the pattern. |
| `src/data/seedAgents.ts` (AI agent look board) | **Remove from first launch** | Offer as "More examples" in the palette, or archive. Ask me. |
| `withoutSamples()`, `is_sample` flags | **Keep** | The new sample must set `is_sample` on every row. |

### Features and screens (from `REDESIGN_PROMPT.md`)
| Feature | Verdict |
|---|---|
| Canvas → Board | **Keep and improve:** cards on solid surfaces, glass toolbars |
| Library, Lab → Decide, Pack + Send → Handoff | **Keep and improve** |
| Reader | **Improve:** glass side panel, solid page |
| Explore, Threads | **Improve:** become an action and board links; code stays |
| Notes, Drafting, Progress, Export, Share | **Keep**, reached from Ctrl+K |
| Engineering (Requirements, BOM, Simulate, Calcs, CAD) | **Keep**, reached from a decision |
| Home | **Remove as a section**; its "Start here" becomes the sample project and empty states |
| Themes gallery | **Improve and trim** to the backdrops that pass contrast, plus Mica |
| Shared rules (`isCredited()`, `applyPlan()`, `focusPlan()`, `weightedTotals()`, `handOff.ts`…) | **Keep, unchanged** |

## A4. Build order for Part A

Follow `REDESIGN_PROMPT.md` steps 1–8, with glass done first so every later step is built in the new look:

| Step | What | Done when |
|---|---|---|
| **A0** | Audit report: list every resource from A3 with the verdict, the files that use it (graphify), and what you'd archive or delete. **No changes yet.** | I've approved the list |
| **A1** | Tokens: glass levels, solid fallbacks, `conflict`, port types, selection fix, accent split. Type proposal shown side by side. | `npm run tokens` works; contrast report passes in light and dark |
| **A2** | Window: transparent window plus Mica, Windows 10 and transparency-off fallback, Reduce transparency setting | Works on Win 11 and falls back cleanly |
| **A3** | Glass primitives and shell: sidebar, title bar, palette, toasts | Screenshot critique pass (`design:design-critique`) |
| 1–8 | `REDESIGN_PROMPT.md` build order, built in glass | Each step's checks |
| **A9** | Archive or remove the approved resources; replace the sample (Part B) | No dead imports; `withoutSamples()` still works |

---

# Part B: sample project, *ESP32 Node Programmer*

This replaces the chair sample. It opens on first launch and shows every core flow: capture → claim → decide →
handoff → review. It's also a real project: its pack is the brief for Part C.

### B1. Project shape (the concept's numbers: 5 sources, 3 claims, 1 decision, 1 pack)

**Board regions:** "Hardware", "Editor", "Code generation", "Decisions", "Brief".

**Sources (real, credited, `is_sample: true`).** Fetch the real pages, store title, site, date, URL and licence, and
take real passages for the claims. Don't paraphrase a quote, and don't invent one.
1. Espressif *ESP32 Series Datasheet* (PDF): pins, strapping pins, ADC
2. Espressif *ESP-IDF Programming Guide*, GPIO and LEDC (PWM) pages
3. *Arduino core for the ESP32* docs (espressif/arduino-esp32)
4. *React Flow* (xyflow) docs: custom nodes, handles, validation (MIT)
5. *arduino-cli* docs: compile and upload from the command line

If a source's licence doesn't allow bundling the file, store the link and credit and fetch on open. Pictures: the
official ESP32 DevKitC photo or pinout figure from Espressif's docs, credited. No generated images.

**Claims (each linked to an exact passage):**
1. "GPIO 34–39 are input only": from the datasheet. *Sourced.*
2. "ADC2 pins can't be used while Wi-Fi is on": from ESP-IDF docs. *Sourced.*
3. "Beginners will prefer Arduino-style code over ESP-IDF": no source yet. *Guess*, so it shows the dashed look on purpose.

**Decision: "Which code target first?"**
| Option | Criteria (weight) |
|---|---|
| Arduino C++ (arduino-esp32) | Beginner-friendly (0.35), library coverage (0.25), build tooling on Windows (0.2), runtime performance (0.1), path to advanced use (0.1) |
| ESP-IDF C | (same criteria) |
| MicroPython | (same criteria) |

Scores are sample data. Mark unsourced ones as guesses, and back at least two scores with the sources above so both
looks appear. The note on the card says the scores are illustrative.

**Pack: "Build the node editor MVP".** Brief:
- Goal: a desktop node editor that turns a graph into an Arduino sketch for an ESP32 DevKitC and uploads it
- Audience: makers who know what a pin is but not C++
- Must-haves: typed ports, pin validation, code preview, one-click upload, serial monitor
- Done when: the "blink plus button" and "sensor to MQTT" example graphs compile and run on a real board

Pinned: claims 1–2, the decision. Included: sources 1, 3, 4, 5. Left out: source 2's full PDF ("over budget,
summary included instead"). This shows all three groups and a left-out reason.

**Review (pre-filled example):** a sample AI answer beside the brief with must-haves marked met / partly / unmet, so
the Review view isn't empty on first launch.

### B2. Implementation
- New `src/data/seedEsp32.ts` following `seed.ts`'s structure; every row `is_sample: true`.
- First launch opens this project. Its board is the home view.
- Update e2e tests that rely on the chair sample (for example, the expected Lab totals A 3.75, B 3.70, C 3.35) to the new sample's numbers.

---

# Part C: build spec, ESP32 node system

This is what the sample pack asks Claude to build, written out in full so it also works on its own. **Build it as a
separate project** (`esp32-node-programmer/`, next to `daiku-redesign/`), not inside Daiku. It uses the same glass
design language from Part A so the two feel like one family. Ask me before starting Part C.

### C1. What it is
A desktop visual programmer for the ESP32. You drag nodes (pins, timers, logic, sensors, Wi-Fi, MQTT), wire them,
and the app generates a readable Arduino sketch, compiles it, uploads it to the board, and shows the serial output.
Every generated line can be traced back to the node that made it.

### C2. Stack
| Part | Choice | Why |
|---|---|---|
| Shell | Tauri 2 + React + TypeScript + Vite | Same as Daiku; serial and CLI access through Rust |
| Node editor | `@xyflow/react` (React Flow, MIT) | Custom nodes, handles, connection validation, minimap, mature |
| State | zustand plus an undo history (patches) | Same pattern as Daiku |
| Build and upload | `arduino-cli` as a Tauri sidecar, with the `esp32:esp32` core | Official, scriptable, handles toolchains |
| Serial | Rust `serialport` crate, streamed to the UI by Tauri channels | Reliable on Windows COM ports |
| Code view | CodeMirror 6, read-only, C++ highlighting | Light, accessible |
| Tests | Vitest (codegen, validation), Playwright (editor), `cargo test` (serial, sidecar) | |

Load `tauri-v2` for the sidecar, permissions/capabilities, channels and the serial plugin choices.

### C3. Data model
```ts
type PortType = "digital" | "analog" | "pwm" | "number" | "bool" | "string" | "event" | "json";

interface PortDef { id: string; label: string; type: PortType; dir: "in" | "out"; required?: boolean }

interface NodeDef {
  kind: string;                 // "gpio.digitalOut"
  category: "board" | "timing" | "logic" | "math" | "sensor" | "actuator" | "comms" | "debug";
  title: string;
  ports: PortDef[];
  params: ParamDef[];           // pin, interval, topic... with type, default, validation
  pins?: (p: Params) => PinUse[];        // which GPIOs it claims, and how
  libraries?: string[];                  // arduino libs it needs
  emit: (ctx: EmitCtx) => EmitResult;    // codegen: globals, setup, loop, functions
  doc: { summary: string; source?: string }; // source = docs URL backing the defaults
}

interface Graph { version: 1; board: BoardId; nodes: NodeInst[]; wires: Wire[]; meta: { name: string; created: string } }
```
Saved as `.espflow.json`. The schema is versioned, with a migration function per version from day one.

### C4. Execution model (keep it simple and predictable)
- **Event wires** (`event`) decide *when* something runs: `On start`, `Every N ms`, `On pin change`, `On MQTT message`.
- **Data wires** (all other types) carry *values*; they're pulled when an event fires.
- The generated code is **non-blocking**: one `millis()` scheduler in `loop()`, no `delay()` (the Delay node schedules instead).
- **Cycles:** event cycles are allowed only through a scheduler node; data cycles are rejected at connect time.

### C5. Node library, MVP (about 24 nodes)
| Category | Nodes |
|---|---|
| Board | Digital In (pull-up/down), Digital Out, Analog In (ADC), PWM Out (LEDC), Touch In |
| Timing | On Start, Every N ms, Delay, Debounce |
| Logic and math | Compare, AND/OR/NOT, Toggle, Map Range, Threshold, Counter |
| Sensors | Button, DHT22, BME280 (I²C) |
| Actuators | LED, Servo, Relay |
| Comms | Wi-Fi Connect, MQTT Publish, MQTT Subscribe |
| Debug | Serial Print |

Each node's `doc.source` links the doc page its defaults came from (for example, the LEDC page for PWM frequency).

### C6. Validation (shown as badges on nodes, never as blocking dialogs)
**Connection-time:** port types must match, or use an explicit converter node (for example, analog → number is
allowed, event → number isn't). Show a reason on hover while dragging.

**Board rules for ESP32-WROOM-32 / DevKitC.** These are well known, but check each one against the datasheet (Part B
source 1) and cite it in `boards/esp32-devkitc.ts`:
- GPIO 6–11: connected to flash, never usable → error
- GPIO 34–39: input only, no internal pull-ups → error if used as output; warning if a pull-up is set
- Strapping pins 0, 2, 5, 12, 15: warn ("can affect boot")
- ADC2 pins: warn when a Wi-Fi node is in the graph
- One pin claimed by two nodes → error on both, with the conflict named
- PWM: LEDC channel count limit; a warning when it runs out

**Graph-level:** a required input not wired, a missing Wi-Fi node before MQTT, missing credentials (a secrets
reference, never inline in the graph file).

Board definitions are data (`boards/*.ts`), so ESP32-S3 and C3 can be added later without code changes.

### C7. Code generation
- **Deterministic:** the same graph always gives the same sketch (stable node order by topological sort, then id). Snapshot-tested.
- **Readable:** one function per node instance, named after the node (`led_status_update()`), and a comment header on each block: `// node: LED "status" (n7)`.
- **Traceable:** a source map from each line range to a node id. Clicking code selects the node and clicking a node highlights its code.
- **Sections:** includes and globals, `setup()`, `loop()` with the scheduler, node functions.
- **Libraries:** collected from nodes and installed with `arduino-cli lib install` on first build.
- **Secrets:** Wi-Fi and MQTT credentials go into a generated `secrets.h` from the OS keychain or a local file outside the project. Never into the graph, the sketch or a Daiku pack.
- **Later:** a MicroPython target behind the same `emit` interface (the decision in Part B decides the order).

### C8. Build, upload and monitor
- The **Build** button runs `arduino-cli compile --fqbn esp32:esp32:esp32` in a temp sketch folder and streams the log into a glass bottom panel, with errors mapped back to nodes through the source map.
- **Upload** lists COM ports (`arduino-cli board list`) and remembers the last one.
- **Serial monitor:** baud picker; lines stream through a Tauri channel; Serial Print node output is highlighted by node.
- **First run:** check for `arduino-cli` and the ESP32 core, and offer to install them (ask first, show size). Load `security-review`: only run the bundled sidecar with fixed argument shapes, and never pass graph text to a shell.

### C9. Editor UX (same glass language as Daiku)
- **Layout:** left node library (glass, searchable), centre canvas (solid, dot grid), right inspector (glass) for the selected node's params, bottom panel (glass) with tabs for Code, Build log and Serial.
- **Ctrl+K:** add a node by name, jump to a node, run Build / Upload.
- **Ports:** colour plus shape per type (event = triangle, digital = square, analog = circle, number = diamond…). Wires take the port colour. Invalid targets dim while dragging.
- **Nodes:** title, pin chip (`GPIO 4`), status badge (ok / warning / error with text), and a live value when connected over serial (later).
- **Keyboard:** Delete, Ctrl+D duplicate, Ctrl+G group, Ctrl+Z / Ctrl+Shift+Z, F to frame the selection, Space-drag to pan.
- **Empty state:** "Start from an example": Blink, Button → LED, Sensor → MQTT, PWM fade.
- **Daiku link (later):** "Send graph to Daiku" adds the graph and generated sketch to a Daiku board as a source with credit, so packs can include it. No secrets.

### C10. Milestones
| # | Build | Done when |
|---|---|---|
| C1 | Tauri app shell in glass, React Flow canvas, node library panel, save/open `.espflow.json` | A graph saves and reopens identically |
| C2 | Typed ports, connection validation, 10 core nodes | Wrong-type wires are refused with a reason |
| C3 | Board rules for DevKitC, badges | Every rule in C6 has a unit test |
| C4 | Codegen with source map and code panel | Snapshot tests for the 4 examples |
| C5 | arduino-cli sidecar: compile, upload, serial | "Blink" runs on a real ESP32 |
| C6 | All 24 nodes, Wi-Fi/MQTT with secrets | "Sensor → MQTT" publishes to a test broker |
| C7 | Polish: examples, empty states, shortcuts, light/dark, reduced transparency | Accessibility and critique passes |

---

# Part D: checks and asking

### Checks after every step
- `npm run lint`, `npm test`, `npm run test:e2e`, and `cargo test --lib` in `src-tauri`
- Contrast: every text style on every glass level, over every kept backdrop, in light and dark, at 4.5:1 or more (write a small script that reads the tokens and reports)
- Reduced transparency and reduced motion both turned on: everything still readable and usable
- Frame rate: a 300-card board pans at 60 fps on an integrated GPU with glass visible
- Windows 10 or transparency-off: solid fallback, no broken layering
- `web-design-guidelines` review of changed UI, then `code-review`
- Screenshots of changed screens in light and dark in the step summary

### Ask me before
- Deleting any file (archiving to `design/archive/` is fine)
- Switching fonts (show both options side by side first)
- Changing the accent / sourced colour split
- Changing the SQLite schema (new migration `004_…`; never edit old ones)
- Adding a dependency (React Flow, CodeMirror, serialport and arduino-cli are pre-approved for Part C only)
- Removing `seedAgents.ts` or any feature
- Starting Part C

### Don't
- Put glass behind reading text, code or table cells
- Use generated or drawn images in the sample; use real, credited ones
- Quote a source without the real passage
- Put Wi-Fi or MQTT secrets in graphs, sketches, packs or logs
- Use colour as the only signal for any state or port type
