import Dexie from 'dexie';
import { createScheduler, type Grade } from '../scheduler';
import { newId, type NenrinDB } from '.';
import { DEFAULT_DECK_CONFIG, type Deck } from './types';

export interface DeckSummary extends Deck {
  total: number;
  due: number;
}

export async function deckSummaries(db: NenrinDB, now = Date.now()): Promise<DeckSummary[]> {
  const decks = await db.decks.orderBy('name').toArray();
  return Promise.all(
    decks.map(async (deck) => ({
      ...deck,
      total: await db.cards.where('deckId').equals(deck.id).count(),
      due: await db.cards
        .where('[deckId+due]')
        .between([deck.id, Dexie.minKey], [deck.id, now], true, true)
        .count(),
    })),
  );
}

/** Applies a rating to a card and appends the review log in one transaction. */
export async function recordReview(
  db: NenrinDB,
  cardId: string,
  grade: Grade,
  { now = Date.now(), durationMs = 0 } = {},
): Promise<void> {
  await db.transaction('rw', db.cards, db.decks, db.reviewLogs, async () => {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    const config = (await db.decks.get(card.deckId))?.config ?? DEFAULT_DECK_CONFIG;
    const scheduler = createScheduler({
      desiredRetention: config.desiredRetention,
      params: config.fsrsParams,
    });
    const { next, log } = scheduler.review(card, grade, now);
    await db.cards.update(cardId, next);
    await db.reviewLogs.add({ ...log, id: newId(), cardId, durationMs });
  });
}
