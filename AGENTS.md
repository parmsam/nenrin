# AGENTS.md

Instructions for AI coding agents and human contributors working on Nenrin. Read this file before making changes.

## Project in one paragraph

Nenrin is an MIT-licensed, local-first flashcard PWA that uses the FSRS spaced-repetition algorithm. It runs fully offline in the browser, stores everything in IndexedDB, imports Anki decks, and deploys as a static site to GitHub Pages. A Tauri wrapper for macOS comes later. There is **no backend server** in v1.

## Commands

```bash
npm install
npm run dev          # Vite dev server
npm run build        # type-check + production build
npm test             # Vitest unit tests
npm run test:e2e     # Playwright (review flow, import, offline)
npm run lint         # ESLint + Prettier check
npm run check        # svelte-check (types)
npm run check:decks -- ref/decks   # import + render real Anki decks in Chromium (decks not committed)
npm run brand        # regenerate logo SVGs from scripts/generate-brand.mjs
npm run screenshots  # regenerate public/screenshots/ (do this after UI changes)
```

Run `npm run lint && npm test` before you call a task done. If you can't run them, say so explicitly.

## Layout (target)

```
src/
  lib/
    scheduler/   # thin wrapper over ts-fsrs, the only place that imports it
    study/       # day rollover, interval labels, today's queue (limits, learning, burying)
    notes/       # built-in note types; add/update/delete notes and sync their cards
    db/          # Dexie schema, migrations, repositories
    anki/        # .apkg/.colpkg: package.ts (pure reader, runs in the worker), import.ts (writes to Dexie)
    import/      # text (.txt/.csv/.tsv) parser and importer
    export/      # json backup, csv, apkg (later)
    render/      # card templates, cloze, markdown, KaTeX, sanitization
  routes/        # screens: Home, DeckView, Review, Editor, Settings (hash router in lib/router.svelte.ts)
  components/    # shared UI: CardView (renders sanitized card HTML + media), Counts
  workers/       # anki.worker.ts: package parsing; typst.worker.ts: opt-in Typst compiles
public/          # favicon.svg, logo.svg, screenshots/, sw-custom.js (imported into the service worker), typst/fonts/ (vendored, licenses in NOTICE.txt)
optimize.html    # separate cross-origin isolated page for the FSRS optimizer (see PLAN decision log)
scripts/         # generate-brand.mjs (logo), screenshots.mjs
docs/brand/      # logo files + palette; see docs/brand/README.md
docs/guide/      # user guide (Markdown); also bundled as the in-app Help screen (src/lib/help.ts)
tests/e2e/       # Playwright specs; unit tests sit next to the code as *.test.ts
fixtures/        # real Anki packages made by fixtures/generate.py (self-written content only)
ref/             # GITIGNORED local research: competitor notes + page snapshots
```

## Rules

1. **License hygiene.** Every dependency must be MIT, Apache-2.0, BSD, ISC, or similarly permissive. **Never copy code from Anki (AGPL-3.0), AnkiDroid (GPL-3.0), or other copyleft projects.** You may read their file-format docs and behavior, but write the implementation independently.
2. **Local-first.** Don't add network calls, telemetry, analytics, or third-party fonts/CDNs at runtime. The app must work with the network disabled after the first load.
3. **Never lose user data.** All schema changes go through versioned Dexie migrations, with a test. Write review logs append-only. Any destructive action needs confirmation or undo.
4. **Scheduler isolation.** Only `src/lib/scheduler/` touches `ts-fsrs`. Store the full review log (card id, timestamp, rating, elapsed time, state before and after) so FSRS parameters can be re-optimized later.
5. **Sanitize card HTML.** Imported Anki cards contain arbitrary HTML and JS. Render through DOMPurify and strip scripts. Never `eval` template code.
6. **Heavy work off the main thread.** Imports, optimization, and search indexing run in Web Workers.
7. **Times.** Store UTC epoch milliseconds. Compute the "day" boundary from the user's configurable rollover hour (default 4 AM local, matching Anki).
8. **Accessibility.** Every review action has a keyboard shortcut (Space/Enter to flip, 1–4 to rate, Z to undo). Use semantic HTML, visible focus, and work with `prefers-reduced-motion` and dark mode.
   - Testing gotcha: jsdom/happy-dom leak memory on large card HTML. Judge performance and memory with `npm run check:decks` (real Chromium), not unit tests.
   - Isolation gotcha: only `optimize.html` (and `optimize.worker`) get COOP/COEP, from `public/sw-custom.js` in production and a Vite plugin in dev/preview. Don't isolate the main app: it would break remote images and OAuth popups.
   - Svelte gotcha: never hand deep `$state` objects to IndexedDB (Proxies can't be cloned). Use `$state.raw` or `$state.snapshot()`.
9. **Small diffs.** One concern per PR. Don't reformat unrelated code. Add or adjust tests for any behavior change.
10. **Keep docs in sync.** When you finish a milestone item, tick it in `PLAN.md`. If you change a feature's status, update the Nenrin row in `COMPARISON.md`. If you change something users see or do, update `docs/guide/` (it is also the in-app Help). New shortcuts go in `src/lib/shortcuts.svelte.ts` and `docs/guide/keyboard.md` (a test checks they match).

## Code style

- TypeScript `strict`. No `any` without a comment explaining why.
- Use plain functions and modules. Keep business logic in `src/lib/` and out of components, so it stays unit-testable.
- Name things after the domain: `Note`, `Card`, `Deck`, `NoteType`, `ReviewLog` (Anki's vocabulary, so importers map cleanly).
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Data model (v1 sketch)

| Table        | Key fields                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `decks`      | id, name, parentId, config (limits, desiredRetention, fsrsParams)                                                        |
| `noteTypes`  | id, name, fields[], templates[] (front/back), css, kind (basic/cloze)                                                    |
| `notes`      | id, noteTypeId, fields{}, tags[], createdAt, updatedAt, ankiGuid?                                                        |
| `cards`      | id, noteId, deckId, ordinal, fsrs state (due, stability, difficulty, reps, lapses, state, lastReview), suspended, buried |
| `reviewLogs` | id, cardId, ts, rating, state, elapsedDays, scheduledDays, durationMs                                                    |
| `media`      | filename (pk), blob, mime, sha1                                                                                          |

## Research notes (`ref/`)

`ref/knowledge.md` summarizes what we learned about competitors and the FSRS ecosystem; `ref/sources/` holds page snapshots. It is gitignored and may be missing on a fresh clone. Read it for context, never copy from it, and add new findings there rather than in committed docs.

## Brand

Follow `docs/brand/README.md` (name, tagline, palette). Use the CSS tokens in `src/app.css`; don't hard-code colors in components. Never hand-edit the logo SVGs.

## When unsure

Choose the simpler, offline-capable option, then note the decision and its reasoning under "Decision log" in `PLAN.md`.
