# Changelog

Nenrin follows [semantic versioning](https://semver.org/). Until 1.0, each roadmap phase in [PLAN.md](PLAN.md) bumps the minor version.

## Unreleased

- **Game controllers, page turners and clickers**: study from the couch. With a controller, Ⓐ shows the answer and then rates Good, Ⓑ is Again (with a short rumble), Ⓧ Hard, Ⓨ Easy, LB undoes. Change the buttons in Settings → _Game controllers and remotes_. Bluetooth page turners and presentation clickers work without setup: Page Down shows the answer and then rates Good, Page Up is Again. Listed in the shortcuts dialog.

## 0.8.1 (2026-10-26): Math from older Anki decks

- **Math from older Anki decks**: `[$]…[/$]`, `[$$]…[/$$]` and `[latex]…[/latex]` now render as math instead of showing as text. Math in imported cards that contains `<`, `&` or line breaks now renders correctly too.
- **Fixed:** a formula could show garbled, with its digits repeated around it (√108a⁶ as "108a6 √108a⁶ 108a6"), when a card or the editor preview redrew while math was still loading.

## 0.8.0 (2026-10-26): Note types, rewards

- **Fixed:** two settings changed at the same moment could overwrite each other, so one change was lost.

- **Rewards, built around the tree** (optional, Settings → Appearance → _Rewards_): a mark that grows as a session does (<span lang="ja">木 → 林 → 森</span>), with an optional wood-block sound; a **stamp book** (<span lang="ja">御朱印帳</span>) in Stats with a red seal for each day you finished everything due; **milestones** such as your first heartwood or a year of study; and a home-screen tree that follows the **seasons**. None of it depends on which button you press, and nothing is ever taken away.

- **Note types you can edit**: Settings → _Manage note types_. Clone a built-in type (or edit an imported one) to rename, reorder, add and remove fields, change the card templates and styling with a live preview, and add or remove card types. Nenrin warns before anything would delete cards or text.

- **Basic (optional reversed card)**: a new note type whose back → front card is made only when you put something in _Add Reverse_, as in Anki.

## 0.7.0 (2026-10-26): Back to Anki, image occlusion, AI cards

- **Your tree keeps growing**: the trunk now gets bigger with every day you study, quickly at first and then more slowly, so a year of study looks like a year. A huge day no longer makes the rest of your rings look thin. Older days darken into heartwood at the center, and a break of more than a week leaves a dark scar line, as a hard year does in a real tree.

- **Image occlusion**: hide parts of a picture and study them one by one. Choose the _Image Occlusion_ type, pick an image and drag over each part to hide; each mask becomes a card. _Hide all, guess one_ or _hide one, guess one_. Anki's image occlusion notes now import and show their masks, and Nenrin's export back to Anki as Anki's own image occlusion type.

- **Make cards with AI, using your own key** (optional): set up Claude, OpenAI or a local model in Settings → _AI card generation_, then in _Add cards → Paste_ choose _Generate from text with AI_, paste your notes, and review the cards before adding them. The text goes straight from your device to the provider you chose; your key stays on this device and out of backups.

- **Type in the answer**: a new **Basic (type in the answer)** note type, and Anki cards with `{{type:…}}` now work too. Type your answer and press Enter; the back shows what you got right, wrong and missed.

- **Export to Anki (.apkg)**: **Export…** on a deck, or in Settings, now makes an Anki package with notes, sub-decks and media, and, if you choose, your progress (due dates, FSRS memory and review history), so Anki picks up where you left off. Exporting again updates the notes in Anki instead of duplicating them. Text export moved into the same dialog.

- **Screenshots in the user guide**, in light or dark to match your theme, in the app (offline too) and on GitHub.

- **Progress while reviewing** (optional): Settings → Studying → _Progress while reviewing_ shows how far through today's cards you are, as a bar on its own or with a percentage (40%) or fraction (4 / 10). Off by default; the header's counts still show what's left.

## 0.6.0 (2026-10-25): Your tree, Help button

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
