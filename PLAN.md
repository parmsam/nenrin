# Nenrin Plan

Last updated: 2026-10-25

## Goals

1. Give Anki users a modern, free, open alternative they can move to in five minutes, with decks and history imported.
2. Give new learners a calm, beautiful app that works offline on any device without an account.
3. Stay small and maintainable: a static site, no servers, MIT licensed.

### Non-goals (for v1)

- A hosted sync service or accounts
- A shared-deck marketplace
- Built-in AI card generation (maybe later as opt-in BYO-API-key; see Phase 5)
- Anki add-on compatibility

## Key decisions

| Decision  | Choice                                                       | Why                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform  | **PWA first**, macOS via Tauri later                         | One codebase reaches iPhone, iPad, Android, Mac, Windows, and Linux. iOS 16.4+ supports installed PWAs with notifications. macOS Safari "Add to Dock" already gives an app-like window. Tauri adds a native `.app` without Electron's size. |
| Hosting   | **GitHub Pages**                                             | It's free and static, deploys via Actions, and fits a no-backend design. A custom domain is optional.                                                                                                                                       |
| Framework | Svelte 5 + Vite + TypeScript                                 | Small bundles and quick startup on phones. Easy to contribute to.                                                                                                                                                                           |
| Scheduler | `ts-fsrs` (FSRS-6)                                           | Actively maintained, MIT, and widely used (see awesome-fsrs).                                                                                                                                                                               |
| Optimizer | `fsrs-browser` (fsrs-rs → WASM), in a worker                 | Trains personal FSRS parameters on-device from review logs.                                                                                                                                                                                 |
| Storage   | IndexedDB (Dexie) + `navigator.storage.persist()`            | Offline, handles large media, no server.                                                                                                                                                                                                    |
| Sync      | **Not in v1.** File backup/restore first, then optional sync | Sync is the hardest and riskiest part, so ship the core first.                                                                                                                                                                              |

### Open questions

- [x] Name: Nenrin (年輪). Still check trademarks, domains, and app stores before launch
- [ ] Storage/sync: see the draft in [docs/storage-strategy.md](docs/storage-strategy.md) (per-device append-only logs over a pluggable file store; Dropbox/Google Drive on the web, iCloud via the native app)
- [ ] Do we want an iOS App Store presence (Tauri mobile or Capacitor), or is a PWA enough?

## Roadmap

### Phase 0: Foundation (week 1)

- [x] Scaffold Vite + Svelte + TS, ESLint/Prettier, Vitest, Playwright
- [x] `vite-plugin-pwa`: manifest, icons, offline caching
- [x] GitHub Actions: lint + test on PR; deploy `main` to GitHub Pages
- [x] Dexie schema v1 (see AGENTS.md data model)
- [x] Add CONTRIBUTING, CODE_OF_CONDUCT, and issue templates
- [x] Logo and brand guide (`docs/brand/`), screenshots script, branded empty state
- [x] Scheduler wrapper (`src/lib/scheduler`) and `recordReview` transaction, with unit tests
- [x] E2E tests: sample deck persists; app loads offline after first visit

- [x] Create, rename, and delete decks and sub-decks
- [x] Note types: Basic, Basic + Reverse, Cloze
- [x] Card editor with Markdown, KaTeX, and image paste
- [x] Review screen: flip, rate 1–4, undo, keyboard shortcuts, interval preview on buttons
- [x] FSRS scheduling via `ts-fsrs`; per-deck desired retention and daily new/review limits
- [x] Learning steps, day rollover hour, bury siblings
- [x] JSON backup export/import
- [x] Dark mode and responsive layout
- [x] "Last backup" reminder; device id on review logs (groundwork for sync, see docs/storage-strategy.md)
- [ ] Exit criteria: a week of real daily use on a phone (needs a human!)

Known gaps, picked up in Phase 3: no browser/search yet (edit a note from the review screen with <kbd>E</kbd>), and no suspend/bury buttons in the UI.

**Exit criteria:** you can study a hand-made deck daily on a phone, offline, for a week without data loss.

### Phase 2: Anki migration (weeks 4–5)

- [ ] `.apkg` / `.colpkg` import in a worker: legacy `collection.anki2`, `collection.anki21`, and zstd-compressed `collection.anki21b`
- [ ] Map Anki note types, fields, templates (`{{Field}}`, `{{cloze:Text}}`, `{{FrontSide}}`), CSS, tags, and sub-decks
- [ ] Import media, with sanitized HTML rendering
- [ ] Import review history (`revlog`) and convert card state to FSRS memory state
- [ ] CSV/TSV import with field mapping
- [ ] Re-import with GUID-based dedupe and updates
- [ ] Fixture tests built from small, self-made decks

**Exit criteria:** popular shared decks (e.g., large language decks with audio) import and render correctly.

### Phase 3: Polish and insights (weeks 6–7)

- [ ] Browser: search (`tag:`, `deck:`, `is:due`, free text), bulk edit, suspend, move
- [ ] Stats: heatmap, true retention, review forecast, card counts
- [ ] FSRS parameter optimization from your own review log (`fsrs-browser`)
- [ ] Study reminders (Web Push / notifications where supported)
- [ ] Audio playback, TTS fallback via the Web Speech API
- [ ] Onboarding with sample decks; first-run "Import from Anki" flow
- [ ] Lighthouse PWA/a11y score ≥ 95 (lazy-load KaTeX: it is most of the 540 KB bundle)

#### Rich content: diagrams and Typst

Math is already covered by KaTeX (`$…$`, `$$…$$`, and Anki's `\(…\)` / `\[…\]`).

- [ ] **Mermaid diagrams** via [Pele](https://github.com/obsidianmd/pele) (MIT, from the Obsidian team). Fenced ` ```mermaid ` blocks in Markdown fields render to SVG.
  - Load it on demand with `pele/lazy` so cards without diagrams pay nothing.
  - Map Pele's CSS variables (`--pele-bg`, `--pele-fg`, `--pele-accent` …) to our tokens, so diagrams follow light/dark mode without re-rendering.
  - Pass the SVG through DOMPurify (SVG profile) like everything else.
- [ ] **Typst** for fenced ` ```typst ` blocks (math and layouts that KaTeX can't do).
  - There's no official Typst JS/WASM package. Use [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) (Apache-2.0, the most mature), and benchmark [typst-wasm](https://github.com/typst-wasm/typst-wasm) (MIT, worker/JSPI backends) as a lighter option. ([typst.js](https://github.com/typst-community/typst.js) wraps the CLI and is Node-only, so it's out.)
  - The compiler is ~25 MB of WASM plus fonts, so make it **opt-in**: Settings → "Enable Typst (one-time download)". The service worker caches it at runtime, not in the precache.
  - Compile in a Web Worker. Cache rendered SVG in IndexedDB by hash of the source, so each block compiles once per device; the cache can be part of backups.
  - Without Typst enabled, show the source in a code block with an "Enable Typst to render" hint, never an error.
- [ ] Editor: preview diagrams and Typst live (debounced), with error messages from Pele/Typst shown inline.

**🚀 v1.0 release:** public on GitHub Pages and announced.

### Phase 4: Desktop and sync (post-v1)

- [ ] Tauri 2 macOS app: native menus, file associations for `.apkg`, signed and notarized DMG
- [ ] Optional sync (design doc first): candidates are a file-based sync folder (iCloud Drive/Dropbox) via Tauri, WebDAV, or a CRDT log
- [ ] `.apkg` export for round-tripping back to Anki

### Phase 5: Maybe later

- [ ] Opt-in AI card generation from text/PDF using the user's own API key (no Nenrin servers)
- [ ] Image occlusion
- [ ] Type-in-the-answer cards
- [ ] Localization
- [ ] iOS/Android store builds (Tauri mobile or Capacitor)

## Risks

| Risk                           | Mitigation                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS evicts PWA storage         | Request persistent storage, nag for regular backups, and suggest installing to the Home Screen (installed PWAs aren't subject to the 7-day eviction) |
| Anki format variations         | Build a fixture corpus; fail gracefully with a per-note error report                                                                                 |
| XSS from imported decks        | Use DOMPurify, isolate card rendering in a sandboxed iframe, and set a strict CSP                                                                    |
| Copyleft contamination         | Keep the license rules in AGENTS.md; implement independently from format docs                                                                        |
| Scope creep (AI, sync, social) | Hold to the non-goals list; Phase 4+ only after v1                                                                                                   |

## Decision log

- **2026-10-25:** Rich content plan: Mermaid via Pele (MIT, lazy-loaded, themed with CSS variables); Typst via typst.ts (Apache-2.0), opt-in because of its ~25 MB WASM, compiled in a worker with SVG cached by source hash. typst-wasm (MIT) to be benchmarked; typst.js rejected (Node-only CLI wrapper). KaTeX stays the math renderer.
- **2026-10-25:** Phase 1 shipped. Hash routing (works on GitHub Pages without rewrites). Notes are Markdown; imported Anki notes will be HTML (`Note.format`). Undo deletes the review log it just wrote; every other log write is append-only. Siblings are buried by leaving them out of today's queue, not by writing state, so nothing needs un-burying. Svelte deep `$state` proxies can't be stored in IndexedDB, so data headed back to the database uses `$state.raw`.
- **2026-10-25:** Phase 0 shipped. The offline e2e test caught a real bug: globbing `manifest.webmanifest` duplicated a precache entry, and Workbox silently cached nothing. Playwright's `setOffline` bypasses service workers in Chromium, so the test stops a real server instead.
- **2026-10-25:** Named the project Nenrin (年輪, "tree rings"). "Memora" was taken by the-memora.com and similar sites. Alternatives that had no flashcard-app hits: Hanpuku (反復), Fukushū (復習), Kurikaeshi (繰り返し).
- **2026-10-25:** Chose PWA-first on GitHub Pages, Svelte + ts-fsrs + Dexie, MIT. Deferred macOS (Tauri) and sync until after v1.
