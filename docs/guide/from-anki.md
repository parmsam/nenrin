# Moving from Anki

## Import your decks

In Anki, use **File → Export**:

- **One deck:** choose _Anki Deck Package (.apkg)_. Tick _Include scheduling information_ to keep your progress, and _Include media_.
- **Everything:** choose _Anki Collection Package (.colpkg)_. Importing a collection **replaces** all decks and cards in Nenrin (your Nenrin backups and settings are kept), the way Anki does.

Then in Nenrin choose **Import** (<kbd>I</kbd>) and pick the file. Nenrin reads it on your device and shows what's inside before anything is saved.

On a computer you can also drop the file onto the Import page. On iPhone and iPad, first save the file to the Files app: a downloaded deck is already in **Downloads**, or use **Share → Save to Files** and pick **iCloud Drive** (which also puts it on your other devices). Then in Nenrin tap **Choose a file…**, then **Browse**, and open it. iPhone doesn't let web apps appear in the Share menu, so Nenrin can't be a Share target there.

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
- Imported learning cards restart their learning steps (their due time is kept).

## Going back

Choose **Export…** on a deck (or **Settings → Import and export → Export…** for every deck), then:

- **Anki package (.apkg):** notes, cards, sub-decks and media. Open it in Anki with _File → Import_. With **Include my progress** on, due dates, FSRS memory states and your review history come along, so Anki carries on where Nenrin left off. Turn it off to share a deck with someone else: every card starts as new.
- **Notes as text (.txt):** Anki's _Notes in Plain Text_, with note types, decks, tags and IDs.

Markdown becomes HTML and math becomes Anki's `\(…\)` and `\[…\]`. Notes keep their IDs, so exporting again updates the notes in Anki instead of duplicating them. Nenrin's built-in note types may show up in Anki as _Basic+_ or _Cloze+_ next to Anki's own.
