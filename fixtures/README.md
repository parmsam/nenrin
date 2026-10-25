# Test fixtures

Real Anki packages, written by Anki 26.09 itself, so the importer is tested against what Anki actually produces.

| File                | What                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `modern.apkg`       | Latest format (`collection.anki21b`, zstd, protobuf media manifest), with scheduling and media |
| `legacy.apkg`       | "Support older Anki versions" (`collection.anki21`, JSON media manifest)                       |
| `shared.apkg`       | Exported without scheduling, like a deck someone shares                                        |
| `collection.colpkg` | Whole-collection package                                                                       |

Contents: a "Nenrin Fixture" deck with Japanese and Geography sub-decks. It has Basic, Reversed and Cloze notes, tags, a PNG, an MP3, a furigana field, MathJax math, three reviews (one card graduated, two in learning, all with FSRS memory), and a suspended card. Everything was written for these fixtures.

Regenerate with `fixtures/generate.py` (instructions inside). It uses the `anki` Python package, which is **AGPL-3.0**. That's fine for a dev tool that produces data files, but it must never be bundled with or copied into Nenrin.
