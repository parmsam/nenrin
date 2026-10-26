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
- [x] Keyboard shortcuts dialog: press <kbd>?</kbd> anywhere, or use the keyboard button in the header and review screen
- [x] Paste Markdown mode in the editor: one block (e.g. from an LLM) is split into front/back by `---`, `Q:`/`A:` labels, a heading or the first paragraph; clozes switch to the Cloze type; fences are stripped; a final `Tags:` line becomes tags
- [x] Home screen for returning users: today's progress ring (tree-ring style), cards left, reviews today, streak, one-tap "Study now" for the deck with the most due, per-deck Study buttons, and quick actions (Add, Import, Browse)
- [x] Version shown in the app (header badge, footer, Settings → About) from `package.json`, with a README badge and `CHANGELOG.md`. Each phase bumps the minor version until 1.0
- [x] Update prompt: new deploys wait for "A new version of Nenrin is ready → Reload" instead of swapping in mid-review; checks hourly and when the app comes back to the foreground
- [x] Theme options: System / Light / Dark, plus accent palettes Wood 木, Matcha 抹茶, Sakura 桜 and Indigo 藍 (Settings → Appearance; per device, applied before first paint)
- [ ] Exit criteria: a week of real daily use on a phone (needs a human!)

Known gaps from Phase 1, now closed: browse/search and suspend shipped in Phase 3.

**Exit criteria:** you can study a hand-made deck daily on a phone, offline, for a week without data loss.

### Phase 2: Anki migration (weeks 4–5)

- [x] `.apkg` / `.colpkg` import in a Web Worker: legacy `collection.anki2` / `collection.anki21` (schema 11, JSON models) and zstd-compressed `collection.anki21b` (schema 18, protobuf configs)
- [x] Map Anki note types, fields, templates, tags and sub-decks; template filters (`cloze`, `text`, `hint`, `furigana`, `kana`, `kanji`, `tts`) and special fields (`Tags`, `Type`, `Deck`, `Subdeck`, `Card`)
- [x] Import media (zstd and legacy), with sanitized HTML rendering; `[sound:…]` becomes an audio player
- [x] Import review history (`revlog`); keep Anki's due dates and FSRS memory (`card.data`), or rebuild memory by replaying history through FSRS
- [x] Text import (`.txt` / `.csv` / `.tsv`) with column mapping (see the format table below)
- [x] Re-import `.apkg` with GUID-based dedupe: newer notes update, missing cards are added, scheduling is kept
- [x] Fixture tests against real packages written by Anki 26.09 (`fixtures/generate.py`)
- [x] Real-world decks pass `npm run check:decks` (real Chromium: worker parse, IndexedDB import, render every card). Results on 2026-10-25, all with zero errors, leftover tags, missing media or empty fronts:

  | Deck                                                                                          | Size   | Notes / cards / media | Parse · import · render |
  | --------------------------------------------------------------------------------------------- | ------ | --------------------- | ----------------------- |
  | [CCC Chinese](https://github.com/jiru/ccc) v2.0 (recorded audio)                              | 101 MB | 4,039 / 8,078 / 4,039 | 0.2 s · 1.1 s · 2.5 s   |
  | [Open Anki JLPT](https://github.com/jamsinclair/open-anki-jlpt-decks) N1                      | 0.8 MB | 2,699 / 5,398 / 0     | 0.1 s · 0.5 s · 0.7 s   |
  | Open Anki JLPT N5                                                                             | 0.3 MB | 718 / 1,436 / 0       | <0.1 s · 0.1 s · 0.2 s  |
  | [Tatoeba](https://github.com/Vuizur/tatoeba-to-anki) Catalan–English (audio, dictionary HTML) | 62 MB  | 1,850 / 1,850 / 1,850 | 0.2 s · 0.5 s · 2.8 s   |
  | Tatoeba Hindi–English (Devanagari)                                                            | 23 MB  | 1,083 / 1,083 / 1,083 | 0.1 s · 0.3 s · 0.4 s   |

  The decks live in gitignored `ref/decks/`, because their media licenses vary. All five are the oldest package format (genanki-style `collection.anki2`); the committed fixtures cover the two newer formats.

- [ ] Test a modern-format shared deck from AnkiWeb (needs a manual download)
- [x] Apply each note type's CSS, contained: native CSS `@scope` plus `contain: layout paint` (no iframe, so shortcuts and audio keep working); `@import`, remote `url()` and `image-set()` stripped; `@font-face` fonts load from deck media; Anki's stock CSS skipped so the theme applies; `.nightMode` class in dark mode, and automatic inversion for light-only deck styles. Toggle in Settings

Known limits for now:

- **Big files are loaded into memory.** The whole package is unzipped in memory, so very large media decks (1 GB+) may fail on phones. Streaming unzip is a later improvement.
- **Imported learning cards restart their learning steps.** Their due time is kept.
- **Filtered decks aren't recreated.** Their cards go back to their home decks.
- **Type-in-the-answer fields render blank.** That's Phase 5.

**Exit criteria:** popular shared decks (e.g., large language decks with audio) import and render correctly.

#### File formats: parity with Anki

From the Anki manual ([importing](https://docs.ankiweb.net/manual/importing/intro), [text files](https://docs.ankiweb.net/manual/importing/text-files), [exporting](https://docs.ankiweb.net/manual/exporting)):

| Format                                                                                                                                                  | Anki | Nenrin | When                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ------------------------------------------------------------------------------------------------- |
| Text import: `.txt` / `.csv` / `.tsv`. Separator sniffing, quoted fields with `""` escapes and newlines, `#` comment lines, UTF-8 (BOM ok)              | ✅   | ✅     | **Done**                                                                                          |
| Text file headers: `#separator`, `#html`, `#tags`, `#columns`, `#notetype`, `#deck`, `#notetype column`, `#deck column`, `#tags column`, `#guid column` | ✅   | ✅     | **Done**                                                                                          |
| Duplicate handling: match on first field (per note type) or GUID; update / skip / import as new                                                         | ✅   | ✅     | **Done** (match scope "note type + deck" not yet)                                                 |
| Text export: "Notes in Plain Text" (tab-separated, HTML, with GUID / note type / deck / tags columns)                                                   | ✅   | ✅     | **Done**. Markdown becomes HTML, and math becomes `\(…\)` / `\[…\]` for Anki's MathJax            |
| `[sound:…]` and `<img>` media references                                                                                                                | ✅   | ✅     | **Done** (audio plays with built-in controls; for text files, the media must already be imported) |
| `.apkg` deck package import (merge; optional scheduling; update newer notes)                                                                            | ✅   | ✅     | **Done** (modern and legacy formats)                                                              |
| `.colpkg` collection package import (replace everything)                                                                                                | ✅   | ✅     | **Done** (media and settings are kept, as in Anki)                                                |
| `.apkg` / `.colpkg` export                                                                                                                              | ✅   | ☐      | Phase 4                                                                                           |
| "Cards in Plain Text" export (rendered question/answer)                                                                                                 | ✅   | ☐      | Phase 3                                                                                           |
| Mnemosyne 2.0 `.db` import                                                                                                                              | ✅   | ☐      | Phase 5 (rare)                                                                                    |
| Nenrin JSON backup (everything incl. review history and media)                                                                                          | n/a  | ✅     | **Done**                                                                                          |

### Phase 3: Polish and insights (weeks 6–7)

- [x] Browser: Anki-style search (words, `"phrases"`, `-exclude`, `deck:` incl. sub-decks, `tag:`, `note:`, `is:new/learn/review/due/suspended`, `added:N`, `*` wildcards), sort, and bulk suspend / move / tag / delete; query kept in the URL; <kbd>/</kbd> focuses search
- [x] Paste several cards at once: repeated Q/A pairs (numbered, bulleted, or split by `---` / headings), a Markdown table, or cloze paragraphs
- [x] **Command palette** (<kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd>): fuzzy search across actions (study a deck, add cards, open settings, export backup, enable Typst), decks, and later notes.
  - Built on the same registry as the shortcuts dialog (`src/lib/shortcuts.svelte.ts`), so each command shows its shortcut, and the shortcuts list and palette can never disagree.
  - Recent commands first; fully keyboard-driven (arrows, <kbd>Enter</kbd>, <kbd>Esc</kbd>); a native `<dialog>` like the shortcuts modal.
  - On touch devices, a search button in the header opens it.
- [x] Stats (`#/stats`, per deck or overall): review heatmap, true retention (30 days), streaks, 30-day forecast, cards by stage; hand-built SVG charts with keyboard readouts and table views; colors validated for color-blind separation in light and dark
- [x] FSRS parameter optimization (`fsrs-browser`: fsrs-rs in WASM) on a separate cross-origin isolated page (`optimize.html`); the service worker adds COOP/COEP to that page and its worker only, so the app keeps remote images and sign-in popups working. Results saved per deck (and sub-decks), with a revert
- [x] **Deck preview and custom study** (like Anki's): preview every card without scheduling; raise today's new/review limits; one-off sessions for new cards, forgotten cards, review ahead, or tags, in added/due/random order, either scheduled through FSRS or practice-only. Sessions live in the URL (`#/session/:deck?kind=…&seed=…&at=…`), so a reload or a trip to the editor keeps your place; no filtered decks are created
- [x] **Keyboard coverage**: Anki's keys for navigation (D/A/B/T, S study, C custom study), bury/suspend in review (`-` `=` `@` `!`, undoable), preview arrows, and arrow/J/K/X in the Browse list. All listed in the shortcuts dialog from one registry
- [ ] Study reminders (Web Push / notifications where supported)
- [x] Audio: autoplay the question's audio, then only the answer's new audio on reveal (like Anki), clips in sequence; <kbd>R</kbd> replays; toggle in Settings. (iOS may block autoplay after async loading; R and the player always work.) TTS for `{{tts}}` fields is still to do
- [ ] Import CrowdAnki JSON decks (`deck.json` + `media/`). Popular open decks such as [Ultimate Geography](https://github.com/anki-geo/ultimate-geography) ship this way
- [ ] Onboarding with sample decks; first-run "Import from Anki" flow
- [x] **Welcome splash** on launch: logo, 年輪 with furigana, the tagline, and today's due count, then straight into the app. Toggle it off in Settings → Appearance ("Show welcome screen"). Respect `prefers-reduced-motion`, and never show it on top of a deep link (e.g. `#/study/…`).
- [x] Lazy-load KaTeX: math is a placeholder until a card needs it (main page JS 570 KB → 375 KB)
- [x] Lighthouse (mobile, 2026-10-25), all pages: Performance 98–100, Accessibility 100, Best Practices 100, SEO 100. Secondary screens are code-split (main JS 225 → 138 KB), the footer no longer causes layout shift, and robots.txt was added

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

- **2026-10-25:** Custom study runs as an in-memory session over a list of card ids, not as an Anki-style filtered deck that moves cards. Nothing to clean up or un-move, and it can't strand cards if the tab closes. Practice-only sessions write nothing; scheduled ones go through the normal `recordReview`. Manual bury uses a new optional `Card.buriedUntil` (next day start) so it expires on its own; no index, so no Dexie migration.

- **2026-10-25:** Optimizer isolation is scoped to one page. `fsrs-browser` needs SharedArrayBuffer (WASM threads), so it needs COOP/COEP, which GitHub Pages can't send. Isolating the whole app would block hot-linked images in imported decks and popup-based OAuth for future sync. Instead the service worker (`public/sw-custom.js`) adds the headers only to `optimize.html` and its worker; a Vite plugin does the same in dev and preview. Safari without COEP support shows an explanation instead.
- **2026-10-25:** Real-deck checks run in real Chromium (`scripts/check-decks.mjs`), not jsdom or happy-dom. Both fake DOMs leak ~4 MB per DOMPurify call on large card HTML and ran out of memory on a 1,850-card Tatoeba deck, while Chromium stayed flat. Unit tests still use jsdom for small inputs.
- **2026-10-25:** Phase 2 core shipped: `.apkg`/`.colpkg` import. Parsing (fflate + fzstd + sql.js, all MIT) runs in a Web Worker and stays out of the main bundle. Anki's custom `unicase` SQLite collation can't load in sql.js, so the importer strips it from the in-memory schema (it only does full-table reads). A small protobuf reader covers the few config fields needed. Fixtures are generated by the real Anki library (AGPL, dev-only, never bundled). Imported cards keep Anki's due dates; FSRS memory comes from `card.data` when Anki used FSRS, otherwise from replaying the review log.
- **2026-10-25:** Rich content plan: Mermaid via Pele (MIT, lazy-loaded, themed with CSS variables); Typst via typst.ts (Apache-2.0), opt-in because of its ~25 MB WASM, compiled in a worker with SVG cached by source hash. typst-wasm (MIT) to be benchmarked; typst.js rejected (Node-only CLI wrapper). KaTeX stays the math renderer.
- **2026-10-25:** Phase 1 shipped. Hash routing (works on GitHub Pages without rewrites). Notes are Markdown; imported Anki notes will be HTML (`Note.format`). Undo deletes the review log it just wrote; every other log write is append-only. Siblings are buried by leaving them out of today's queue, not by writing state, so nothing needs un-burying. Svelte deep `$state` proxies can't be stored in IndexedDB, so data headed back to the database uses `$state.raw`.
- **2026-10-25:** Phase 0 shipped. The offline e2e test caught a real bug: globbing `manifest.webmanifest` duplicated a precache entry, and Workbox silently cached nothing. Playwright's `setOffline` bypasses service workers in Chromium, so the test stops a real server instead.
- **2026-10-25:** Named the project Nenrin (年輪, "tree rings"). "Memora" was taken by the-memora.com and similar sites. Alternatives that had no flashcard-app hits: Hanpuku (反復), Fukushū (復習), Kurikaeshi (繰り返し).
- **2026-10-25:** Chose PWA-first on GitHub Pages, Svelte + ts-fsrs + Dexie, MIT. Deferred macOS (Tauri) and sync until after v1.
