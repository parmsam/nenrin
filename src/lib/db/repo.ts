import { createScheduler, type Grade } from '../scheduler';
import { newId, type NenrinDB } from '.';
import { getDeviceId } from './prefs';
import { DEFAULT_DECK_CONFIG, type Card } from './types';

/** Everything needed to take a review back. */
export interface UndoEntry {
  previous: Card;
  logId: string;
}

/** Cards as they were before a bury or suspend, so it can be undone. */
export interface CardsUndo {
  cards: Card[];
}

/**
 * Buries or suspends cards from the review screen: one card, or all cards of its note.
 * `bury` hides them until the next study day starts (`until`).
 */
export async function hideCards(
  db: NenrinDB,
  card: Card,
  how: { action: 'bury'; until: number } | { action: 'suspend' },
  scope: 'card' | 'note',
): Promise<CardsUndo> {
  return db.transaction('rw', db.cards, async () => {
    const cards =
      scope === 'card'
        ? [(await db.cards.get(card.id))!]
        : await db.cards.where('noteId').equals(card.noteId).toArray();
    const patch = how.action === 'bury' ? { buriedUntil: how.until } : { suspended: true };
    await db.cards.bulkUpdate(cards.map((c) => ({ key: c.id, changes: patch })));
    return { cards };
  });
}

/** Puts cards back as they were (undo for `hideCards`). */
export async function restoreCards(db: NenrinDB, entry: CardsUndo): Promise<void> {
  await db.cards.bulkPut(entry.cards);
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
