# Changelog

Nenrin follows [semantic versioning](https://semver.org/). Until 1.0, each roadmap phase in [PLAN.md](PLAN.md) bumps the minor version.

## Unreleased

- **Your tree** (年輪): the home screen's progress ring is now a tree cross-section of your studying. Each ring is a day you studied in recent weeks, wider on days with more reviews; today's ring closes around the outside as you finish today's cards. Rings grow out from the center when you open the app (not with reduced motion).
- **Help button** in the header (a ? in a circle) opens the user guide. Hide it in Settings → Appearance if you don't need it. On the smallest phones the version badge makes room for it.

## 0.5.0 (2026-10-25): Custom study, rich cards, CrowdAnki, reminders

### Studying

- **Preview a deck**: flip through every card (<kbd>P</kbd> on a deck, or the Preview button) with <kbd>←</kbd> <kbd>→</kbd>, without scheduling anything.
- **Custom study** (<kbd>C</kbd> on a deck, or after finishing one): add extra new cards or reviews for today only, or start a one-off session: preview new cards, review forgotten cards, review ahead, or study by tag. Choose the order and size, and whether answers count as reviews or are practice only.
- **Bury and suspend while reviewing**, with the same keys as Anki: <kbd>-</kbd> bury card, <kbd>=</kbd> bury note (until tomorrow), <kbd>@</kbd> suspend card, <kbd>!</kbd> suspend note. <kbd>Z</kbd> undoes them, and a ⋯ menu offers the same for mouse and touch.
- **Study reminders** (Settings → _Study reminder_): pick a time and **add a daily event to your calendar**, which works everywhere, iPhone included. Or turn on **notifications**: if cards are due and you haven't studied yet, Nenrin reminds you once that day. They work while Nenrin is open, and in installed Chrome/Edge apps the browser may also check in the background. Nothing leaves your device.

### Cards

- **Make cards with an LLM**: Settings → _Make cards with an LLM_ copies a ready-made prompt for ChatGPT, Claude, Gemini or any other LLM, with rules for good cards and the exact format to paste back into _Add cards → Paste_. Also as a downloadable Agent Skill (`nenrin-cards.zip`) for Claude and Claude Code, from the command palette, and next to the Paste box. Paste now also unwraps replies fenced with four backticks, which LLMs use when a card contains a diagram.
- **Mermaid diagrams** in cards: a ` ```mermaid ` block renders as a diagram that follows your theme and accent, light or dark. The renderer ([Pele](https://github.com/obsidianmd/pele), MIT) downloads only when a card has a diagram. Bad syntax shows the source and the error.
- **Typst in cards** (opt-in): put [Typst](https://typst.app/docs/) in a ` ```typst ` block for math and layouts beyond LaTeX math. Turn it on per device in **Settings → Typst** (a one-time download of about 32 MB); after that it renders offline, follows light and dark mode, and is cached so each block compiles once. Without it, cards show the source with a hint.

### Importing

- **Import CrowdAnki decks**: the JSON format that shared decks on GitHub use, such as [Ultimate Geography](https://github.com/anki-geo/ultimate-geography). Choose the release `.zip` (or a bare `deck.json`) in Import. Media, sub-decks and the deck's styling come along; importing a newer release updates notes and keeps your progress.

### Getting started

- **New first-run screen** with three ways in: _Import from Anki_, _Take the tour_, or _Start from scratch_. The **Nenrin tour** is a short deck that shows you around the app while you study it.
- **User guide**: getting started, studying, making cards, moving from Anki, custom study, keyboard shortcuts, backups and a FAQ. Built into the app (**Help**, in the footer, Settings and the command palette; works offline) and on GitHub in [`docs/guide/`](docs/guide/README.md).
- **Welcome splash** for returning users: the logo, 年輪, and today's due count, for a moment. Tap to skip; off in Settings → Appearance. Not shown over deep links or more than once per session.

### Getting around

- **Command palette** (<kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd>): fuzzy-search every page, action, theme and deck ("Study …", "Open …"), or search notes for whatever you type. Recent commands come first.
- **More keyboard shortcuts**: Anki's main-window keys work everywhere outside a review (<kbd>D</kbd> decks, <kbd>A</kbd> add, <kbd>B</kbd> browse, <kbd>T</kbd> stats, <kbd>I</kbd> import, <kbd>⌘,</kbd> settings); <kbd>S</kbd> studies; and the Browse list moves with <kbd>↓</kbd> <kbd>↑</kbd> or <kbd>J</kbd> <kbd>K</kbd>, with <kbd>X</kbd> to select. Press <kbd>?</kbd> for the full list.
- **Swipe to delete a deck**: swipe a deck left on the home screen to reveal Delete (or swipe all the way), then confirm. The dialog says how many cards and how much review history will go.
- **Consistent breadcrumbs**: Browse, Stats, Import and Settings use the same "Decks / Page" trail as deck pages, instead of an underlined "← Decks" link.
- **Faster start**: math rendering (KaTeX) and less-used screens (Import, Browse, Stats, Settings, the editor) now load on demand, so the app downloads about 60% less JavaScript up front. Lighthouse: 98–100 performance and 100 for accessibility, best practices and SEO on every page.

### Fixes

- **Anki templates with nested sections** (`{{#A}}…{{#B}}…{{/B}}…{{/A}}`) showed raw `{{#B}}` tags.
- **Image-only fields counted as empty**, so cards whose front is just an image (such as a flag) weren't created, and `{{#Field}}` sections around them were hidden.
- The import summary said "1 notes" and "1 cards".
- Updating the address in place (typing a search in Browse) could reload and remount a lazily loaded screen.
- Quickly reopening a dialog (palette, shortcuts, confirmation) could make it close by itself.

## 0.4.0 (2026-10-25): Stats, personal scheduling, audio, deck styling

- **Stats**: review heatmap, 30-day retention, streaks, a 30-day review forecast and cards by stage, per deck or overall, with keyboard readouts and table views.
- **Optimize scheduling** to your own review history with the official FSRS optimizer, on your device. Saved per deck, and you can revert to the defaults.
- **Learn about spaced repetition**: a short explainer for first-time users, with links to Wikipedia.
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
