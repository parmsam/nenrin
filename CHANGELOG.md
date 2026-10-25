# Changelog

Nenrin follows [semantic versioning](https://semver.org/). Until 1.0, each roadmap phase in [PLAN.md](PLAN.md) bumps the minor version.

## Unreleased

- **Fixed: stuck on an old version.** Devices that installed Nenrin before the update prompt kept running that version: the update waited behind it, and the old version had no prompt to show. New versions now take over immediately on those devices. From then on, updates wait for you to choose "Reload".
- **Audio autoplay**, like Anki: the question's audio plays when a card appears and the answer's new audio on reveal; <kbd>R</kbd> replays. Can be turned off in Settings.
- **Deck styling**: imported decks keep their look, contained to the card with CSS `@scope`, with remote resources blocked, deck fonts loaded from media, and automatic dark mode for light-only styles. Can be turned off in Settings.

## 0.3.0 (2026-10-25): Anki import, browse, LLM paste

- **Import Anki packages**: `.apkg` decks and `.colpkg` collections (modern and legacy formats) with media, sub-decks and, optionally, review history and FSRS memory. Parsed in a background worker. Tested against real public decks.
- **Anki template features**: furigana, hint, text, type and tts filters; `{{Tags}}`, `{{Deck}}`, `{{Subdeck}}` and other special fields; `[sound:…]` audio.
- **Anki-compatible text import/export** (`.txt` / `.csv` / `.tsv`) with Anki's file headers and duplicate handling.
- **Paste Markdown**: turn one block from an LLM into a card, or a whole set (Q/A pairs, tables, cloze paragraphs).
- **Browse and search** with Anki-style queries, plus bulk suspend, move, tag and delete.
- **New home screen**: today's progress ring, streak, one-tap "Study now", and quick actions.
- **Themes**: System / Light / Dark with Wood, Matcha, Sakura and Indigo accents.
- **Keyboard shortcuts dialog** (press <kbd>?</kbd>).
- The gear toggles Settings, and the version shows in the app.

## 0.2.0: Study loop

- Decks and sub-decks with per-deck limits and desired retention.
- Basic, Basic (and reversed card) and Cloze notes with Markdown, KaTeX math and pasted images.
- FSRS-6 review with interval previews, learning steps, day rollover, sibling burying and undo.
- JSON backup and restore.

## 0.1.0: Foundation

- Offline PWA on GitHub Pages, IndexedDB storage, FSRS scheduler wrapper, CI, brand and docs.
