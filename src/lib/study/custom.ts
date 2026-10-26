/**
 * Custom study, like Anki's: extra cards today, or a one-off session over a chosen set of
 * cards. Sessions live only in memory (and the URL); they don't create filtered decks.
 */
import type { NenrinDB } from '../db';
import { deckSubtreeIds, updateDeckConfig } from '../db/decks';
import { getPrefs } from '../db/prefs';
import type { Card } from '../db/types';
import { Rating, State } from '../scheduler';
import { dayStart } from './day';

const DAY = 86_400_000;

export type SessionKind =
  /** Every card in the deck, in the order notes were added: a read-through. */
  | 'all'
  /** New cards, optionally only those added in the last `days`. */
  | 'new'
  /** Cards rated Again in the last `days`. */
  | 'forgotten'
  /** Review cards that come due in the next `days` (not today's). */
  | 'ahead'
  /** Cards whose note has any of `tags` (or a child tag). */
  | 'tags';

export type SessionOrder = 'added' | 'due' | 'random';

export interface SessionOptions {
  deckId: string;
  kind: SessionKind;
  days: number;
  tags: string[];
  limit: number;
  order: SessionOrder;
  /** True: ratings go through FSRS like a normal review. False: practice only, nothing saved. */
  reschedule: boolean;
}

export const SESSION_DEFAULTS: Omit<SessionOptions, 'deckId'> = {
  kind: 'all',
  days: 7,
  tags: [],
  limit: 100,
  order: 'added',
  reschedule: false,
};

/** Defaults that make sense for each kind (e.g. reviewing ahead counts as a review). */
export function defaultsFor(kind: SessionKind): Partial<SessionOptions> {
  switch (kind) {
    case 'all':
      return { order: 'added', reschedule: false, limit: 0 };
    case 'new':
      return { order: 'added', reschedule: false, days: 0 };
    case 'forgotten':
      return { order: 'random', reschedule: true, days: 1 };
    case 'ahead':
      return { order: 'due', reschedule: true, days: 1 };
    case 'tags':
      return { order: 'random', reschedule: false };
  }
}

const KINDS: SessionKind[] = ['all', 'new', 'forgotten', 'ahead', 'tags'];
const ORDERS: SessionOrder[] = ['added', 'due', 'random'];

/** Session options as a hash-route query string, so a session survives a reload. */
export function sessionQuery(o: SessionOptions): string {
  const q = new URLSearchParams({
    kind: o.kind,
    days: String(o.days),
    limit: String(o.limit),
    order: o.order,
    reschedule: o.reschedule ? '1' : '0',
  });
  if (o.tags.length) q.set('tags', o.tags.join(' '));
  return q.toString();
}

export function parseSessionQuery(deckId: string, q: URLSearchParams): SessionOptions {
  const kind = KINDS.find((k) => k === q.get('kind')) ?? SESSION_DEFAULTS.kind;
  const base = { ...SESSION_DEFAULTS, ...defaultsFor(kind) };
  const num = (key: string, fallback: number) => {
    const n = Number(q.get(key));
    return q.has(key) && Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };
  return {
    deckId,
    kind,
    days: num('days', base.days),
    limit: num('limit', base.limit),
    tags: (q.get('tags') ?? '').split(/\s+/).filter(Boolean),
    order: ORDERS.find((o) => o === q.get('order')) ?? base.order,
    reschedule: q.has('reschedule') ? q.get('reschedule') === '1' : base.reschedule,
  };
}

/** True if a tag is `want` or one of its children (`want::child`), ignoring case. */
function tagMatches(tag: string, want: string): boolean {
  const t = tag.toLowerCase();
  const w = want.toLowerCase();
  return t === w || t.startsWith(`${w}::`);
}

/**
 * Picks the cards for a custom session. Suspended cards are left out, except in a
 * read-through of the whole deck. `random` is a seedable shuffle for tests.
 */
export async function sessionCards(
  db: NenrinDB,
  o: SessionOptions,
  now = Date.now(),
  random = Math.random,
): Promise<Card[]> {
  const deckIds = await deckSubtreeIds(db, o.deckId);
  let cards = await db.cards.where('deckId').anyOf(deckIds).toArray();
  if (o.kind !== 'all') cards = cards.filter((c) => !c.suspended);

  const notes = new Map(
    (await db.notes.bulkGet([...new Set(cards.map((c) => c.noteId))]))
      .filter((n) => !!n)
      .map((n) => [n.id, n]),
  );

  if (o.kind === 'new') {
    const since = o.days > 0 ? now - o.days * DAY : -Infinity;
    cards = cards.filter(
      (c) => c.state === State.New && (notes.get(c.noteId)?.createdAt ?? 0) >= since,
    );
  } else if (o.kind === 'forgotten') {
    const ids = new Set(cards.map((c) => c.id));
    const forgotten = new Set(
      (
        await db.reviewLogs
          .where('ts')
          .aboveOrEqual(now - Math.max(1, o.days) * DAY)
          .toArray()
      )
        .filter((l) => l.rating === Rating.Again && ids.has(l.cardId))
        .map((l) => l.cardId),
    );
    cards = cards.filter((c) => forgotten.has(c.id));
  } else if (o.kind === 'ahead') {
    const { rolloverHour } = await getPrefs(db);
    // Due after today ends, up to `days` study days ahead.
    const from = dayStart(now, rolloverHour) + DAY;
    const until = from + Math.max(1, o.days) * DAY;
    cards = cards.filter((c) => c.state === State.Review && c.due >= from && c.due < until);
  } else if (o.kind === 'tags') {
    cards = cards.filter((c) => {
      const tags = notes.get(c.noteId)?.tags ?? [];
      return o.tags.some((want) => tags.some((t) => tagMatches(t, want)));
    });
  }

  const added = (c: Card) => notes.get(c.noteId)?.createdAt ?? 0;
  // Order added first, so a shuffle with the same random source is repeatable.
  cards.sort(
    (a, b) => added(a) - added(b) || a.noteId.localeCompare(b.noteId) || a.ordinal - b.ordinal,
  );
  if (o.order === 'random') {
    // Fisher–Yates.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  } else if (o.order === 'due') {
    cards.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
  }
  return o.limit > 0 ? cards.slice(0, o.limit) : cards;
}

/** Raises today's limits for a deck (Anki's "increase today's new/review card limit"). */
export async function extendToday(
  db: NenrinDB,
  deckId: string,
  add: { newCards?: number; reviews?: number },
  now = Date.now(),
): Promise<void> {
  const deck = await db.decks.get(deckId);
  if (!deck) return;
  const { rolloverHour } = await getPrefs(db);
  const day = dayStart(now, rolloverHour);
  const cur = deck.config.extraToday?.day === day ? deck.config.extraToday : undefined;
  await updateDeckConfig(db, deckId, {
    extraToday: {
      day,
      newCards: (cur?.newCards ?? 0) + Math.max(0, Math.round(add.newCards ?? 0)),
      reviews: (cur?.reviews ?? 0) + Math.max(0, Math.round(add.reviews ?? 0)),
    },
  });
}
