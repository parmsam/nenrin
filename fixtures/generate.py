"""
Builds the Anki package fixtures in this folder using the real Anki library, so the
importer is tested against files Anki itself writes.

Dev-only. `anki` is AGPL-3.0; it is used here as a tool to produce data files and is never
bundled with or copied into Nenrin. All card content below is written for these fixtures.

    uv venv anki-venv --python 3.12 && uv pip install --python anki-venv/bin/python anki
    anki-venv/bin/python fixtures/generate.py
"""

import base64
import os
import tempfile

from anki.collection import Collection, DeckIdLimit, ExportAnkiPackageOptions
from anki.scheduler.v3 import CardAnswer

OUT = os.path.dirname(os.path.abspath(__file__))

# 1×1 PNG and a tiny (silent) MP3 frame.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
MP3 = bytes.fromhex("fffb9064000000000000000000000000000000000000000000000000")


def build(path: str) -> Collection:
    col = Collection(path)
    col.set_config("fsrs", True)

    jp = col.decks.id("Nenrin Fixture::Japanese")
    geo = col.decks.id("Nenrin Fixture::Geography")

    col.media.write_data("tree.png", PNG)
    col.media.write_data("ki.mp3", MP3)
    col.media.write_data("_fixture-font.woff2", b"wOF2 not a real font")

    basic = col.models.by_name("Basic")
    reversed_ = col.models.by_name("Basic (and reversed card)")
    cloze = col.models.by_name("Cloze")

    # A note type with custom styling, like many shared decks: classes, night mode, a deck font.
    styled = col.models.copy(basic)
    styled["name"] = "Styled"
    styled["css"] = """@font-face { font-family: FixtureFont; src: url("_fixture-font.woff2"); }
.card { font-family: FixtureFont, sans-serif; }
.reading { color: rgb(10, 20, 30); font-size: 30px; }
.nightMode .reading { color: rgb(200, 210, 220); }
"""
    styled["tmpls"][0]["qfmt"] = '<div class="reading">{{Front}}</div>'
    col.models.update_dict(styled)
    styled = col.models.by_name("Styled")

    def add(model, deck, tags, **fields):
        note = col.new_note(model)
        for k, v in fields.items():
            note[k] = v
        note.tags = tags
        col.add_note(note, deck)
        return note

    add(basic, jp, ["n5", "nature"], Front="木", Back='tree<br><img src="tree.png"> [sound:ki.mp3]')
    add(basic, jp, ["n5"], Front="森", Back="<b>forest</b>")
    add(reversed_, jp, ["n5"], Front="山", Back="mountain")
    add(basic, jp, ["furigana"], Front="年輪[ねんりん]", Back="tree rings")
    add(cloze, geo, ["capitals"], Text="{{c1::Paris}} is the capital of {{c2::France}}.")
    add(basic, geo, ["math"], Front="Area of a circle?", Back=r"\(\pi r^2\)")
    add(styled, jp, ["styled"], Front="川", Back="river")
    suspended = add(basic, geo, ["suspended"], Front="Suspended card", Back="hidden")
    col.sched.suspend_cards(suspended.card_ids())

    # Review a few cards so the packages carry scheduling, review history and FSRS memory state:
    # Easy graduates a card to review; Good and Again leave cards in learning.
    col.decks.select(col.decks.id("Nenrin Fixture"))
    for rating in [CardAnswer.EASY, CardAnswer.GOOD, CardAnswer.AGAIN]:
        queued = col.sched.get_queued_cards()
        if not queued.cards:
            break
        top = queued.cards[0]
        card = col.get_card(top.card.id)
        card.start_timer()
        col.sched.answer_card(
            col.sched.build_answer(card=card, states=top.states, rating=rating)
        )
    return col


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        col = build(os.path.join(tmp, "collection.anki2"))
        root = col.decks.id("Nenrin Fixture")
        limit = DeckIdLimit(deck_id=root)

        def apkg(name: str, **opts) -> None:
            options = ExportAnkiPackageOptions(
                with_scheduling=opts.get("scheduling", True),
                with_deck_configs=True,
                with_media=True,
                legacy=opts.get("legacy", False),
            )
            out = os.path.join(OUT, name)
            col.export_anki_package(out_path=out, options=options, limit=limit)
            print("wrote", out)

        apkg("modern.apkg")
        apkg("legacy.apkg", legacy=True)
        apkg("shared.apkg", scheduling=False)
        colpkg = os.path.join(OUT, "collection.colpkg")
        col.export_collection_package(colpkg, include_media=True, legacy=False)
        print("wrote", colpkg)
        col.close()


if __name__ == "__main__":
    main()
