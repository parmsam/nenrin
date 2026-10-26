# Moving from Anki

## Import your decks

In Anki, use **File → Export**:

- **One deck:** choose _Anki Deck Package (.apkg)_. Tick _Include scheduling information_ to keep your progress, and _Include media_.
- **Everything:** choose _Anki Collection Package (.colpkg)_. Importing a collection **replaces** all decks and cards in Nenrin (your Nenrin backups and settings are kept), the way Anki does.

Then in Nenrin choose **Import** (<kbd>I</kbd>) and pick the file. Nenrin reads it on your device and shows what's inside before anything is saved.

With scheduling on, cards keep their due dates and FSRS memory, and your review history comes along, so stats, streaks and the optimizer work right away. Without it, every card starts as new, which is usually right for a deck someone shared.

Importing a newer version of the same deck later updates changed notes, adds new cards, and keeps your progress.

Shared decks kept on GitHub in **CrowdAnki** format (for example [Ultimate Geography](https://github.com/anki-geo/ultimate-geography)) import too: choose the release `.zip`. Text files (`.txt`, `.csv`, `.tsv`, including Anki's _Notes in Plain Text_) work as well.

## What carries over

- Note types with their fields, templates and styling (kept inside the card, so it can't restyle the app)
- Sub-decks, tags, images and audio
- Furigana, hints, `{{Tags}}`, `{{Deck}}` and the other template features most decks use

## What's different

- **No add-ons, and no sync yet.** Nenrin keeps your cards on one device; see [Backups and your data](backups.md).
- **Filtered decks** become [custom study](custom-study.md) sessions; their cards return to their home decks on import.
- **Type-in-the-answer** fields show as blank for now.
- Imported learning cards restart their learning steps (their due time is kept).

## Going back

**Export notes (.txt)** on a deck (or **Settings → Export all notes**) writes a file Anki imports with _File → Import_, with note types, decks, tags and IDs. Exporting `.apkg` is planned.
