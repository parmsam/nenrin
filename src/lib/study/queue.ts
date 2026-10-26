import Dexie from 'dexie';
import { State } from '../scheduler';
import type { NenrinDB } from '../db';
import { deckSubtreeIds } from '../db/decks';
import { getPrefs } from '../db/prefs';
import { DEFAULT_DECK_CONFIG, type Card } from '../db/types';
import { dayStart, nextDayStart } from './day';

/** Learning cards due within this window are shown early instead of making you wait. */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface StudyCounts {
  new: number;
  learning: number;
  review: number;
}

export interface StudyState {
  counts: StudyCounts;
  /** The card to show now, if any. */
  next?: Card;
  /** Nothing to show now, but a learning card comes due at this time today. */
  waitUntil?: number;
}

/**
 * Today's queue for a deck (including sub-decks), using that deck's limits.
 * Order: learning cards that are due, then reviews, then new cards. Only one card per
 * note is shown per day (siblings are buried), except for learning steps.
 */
export async function studyState(
  db: NenrinDB,
  deckId: string,
  now = Date.now(),
): Promise<StudyState> {
  const [{ rolloverHour }, deck] = await Promise.all([getPrefs(db), db.decks.get(deckId)]);
  const config = deck?.config ?? DEFAULT_DECK_CONFIG;
  const start = dayStart(now, rolloverHour);
  const end = nextDayStart(now, rolloverHour);
  const deckIds = new Set(await deckSubtreeIds(db, deckId));

  // What was already studied today in this deck tree.
  const todayLogs = await db.reviewLogs.where('ts').aboveOrEqual(start).toArray();
  const reviewedCards = (
    await db.cards.bulkGet([...new Set(todayLogs.map((l) => l.cardId))])
  ).filter((c): c is Card => !!c && deckIds.has(c.deckId));
  const inTree = new Set(reviewedCards.map((c) => c.id));
  const logs = todayLogs.filter((l) => inTree.has(l.cardId));
  const newDone = logs.filter((l) => l.state === State.New).length;
  const reviewsDone = logs.filter((l) => l.state === State.Review).length;
  const shownNotes = new Set(reviewedCards.map((c) => c.noteId));

  const due: Card[] = [];
  const fresh: Card[] = [];
  for (const id of deckIds) {
    due.push(
      ...(await db.cards
        .where('[deckId+due]')
        .between([id, Dexie.minKey], [id, end], true, false)
        .toArray()),
    );
    fresh.push(...(await db.cards.where('[deckId+state]').equals([id, State.New]).toArray()));
  }
  const active = (c: Card) => !c.suspended && !c.buried && !(c.buriedUntil && c.buriedUntil > now);
  const extra = config.extraToday?.day === start ? config.extraToday : undefined;
  const byDue = (a: Card, b: Card) => a.due - b.due || a.id.localeCompare(b.id);

  const learning = due
    .filter((c) => active(c) && (c.state === State.Learning || c.state === State.Relearning))
    .sort(byDue);

  const takeUnburied = (cards: Card[], limit: number) => {
    const out: Card[] = [];
    for (const c of cards.sort(byDue)) {
      if (out.length >= limit) break;
      if (!active(c) || shownNotes.has(c.noteId)) continue;
      shownNotes.add(c.noteId);
      out.push(c);
    }
    return out;
  };
  const review = takeUnburied(
    due.filter((c) => c.state === State.Review),
    Math.max(0, config.reviewsPerDay + (extra?.reviews ?? 0) - reviewsDone),
  );
  const newCards = takeUnburied(
    fresh,
    Math.max(0, config.newPerDay + (extra?.newCards ?? 0) - newDone),
  );

  const counts = { new: newCards.length, learning: learning.length, review: review.length };
  const next =
    (learning[0] && learning[0].due <= now + LEARN_AHEAD_MS ? learning[0] : undefined) ??
    review[0] ??
    newCards[0];
  return { counts, next, waitUntil: !next && learning[0] ? learning[0].due : undefined };
}
