import type { NenrinDB } from '../db';
import type { Card } from '../db/types';
import { renderCard, type RenderedCard } from '../render';

/** A card's rendered sides and its note type's CSS, ready for CardView. */
export interface CardContent extends RenderedCard {
  css: string;
}

/** Renders a card for study. Null if its note or note type is gone. */
export async function cardContent(
  db: NenrinDB,
  card: Card,
  { deckStyling = true } = {},
): Promise<CardContent | null> {
  const note = await db.notes.get(card.noteId);
  const noteType = note && (await db.noteTypes.get(note.noteTypeId));
  if (!note || !noteType) return null;
  // Full deck path for Anki's {{Deck}} / {{Subdeck}} template fields.
  const deckPath: string[] = [];
  for (
    let d = await db.decks.get(card.deckId);
    d;
    d = d.parentId ? await db.decks.get(d.parentId) : undefined
  ) {
    deckPath.unshift(d.name);
  }
  return {
    ...renderCard(noteType, note, card.ordinal, { deckPath }),
    css: deckStyling ? noteType.css : '',
  };
}
