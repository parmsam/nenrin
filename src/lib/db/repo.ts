import { createScheduler, type Grade } from '../scheduler';
import { newId, type NenrinDB } from '.';
import { getDeviceId } from './prefs';
import { DEFAULT_DECK_CONFIG, type Card } from './types';

/** Everything needed to take a review back. */
export interface UndoEntry {
  previous: Card;
  logId: string;
}

/** Applies a rating to a card and appends the review log in one transaction. */
export async function recordReview(
  db: NenrinDB,
  cardId: string,
  grade: Grade,
  { now = Date.now(), durationMs = 0 } = {},
): Promise<UndoEntry> {
  return db.transaction('rw', db.cards, db.decks, db.reviewLogs, db.settings, async () => {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    const config = (await db.decks.get(card.deckId))?.config ?? DEFAULT_DECK_CONFIG;
    const scheduler = createScheduler({
      desiredRetention: config.desiredRetention,
      params: config.fsrsParams,
    });
    const { next, log } = scheduler.review(card, grade, now);
    const logId = newId();
    await db.cards.update(cardId, next);
    await db.reviewLogs.add({
      ...log,
      id: logId,
      cardId,
      durationMs,
      deviceId: await getDeviceId(db),
    });
    return { previous: card, logId };
  });
}

/**
 * Restores a card to its state before a review and removes that review's log entry.
 * The one exception to append-only logs: an undone review never happened.
 */
export async function undoReview(db: NenrinDB, entry: UndoEntry): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(entry.previous);
    await db.reviewLogs.delete(entry.logId);
  });
}
