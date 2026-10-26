import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck, updateDeckConfig } from '../db/decks';
import { hideCards, recordReview, restoreCards } from '../db/repo';
import { addNote, ensureBuiltins } from '../notes';
import { Rating, State } from '../scheduler';
import {
  extendToday,
  parseSessionQuery,
  SESSION_DEFAULTS,
  sessionCards,
  sessionQuery,
  type SessionOptions,
} from './custom';
import { nextDayStart } from './day';
import { studyState } from './queue';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 10, 12).getTime();

let db: NenrinDB;
let deckId: string;

beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
  deckId = (await createDeck(db, 'D', undefined, T0)).id;
});

afterEach(async () => {
  await db.delete();
});

const add = (front: string, now = T0, tags: string[] = [], noteTypeId = 'basic') =>
  addNote(db, { noteTypeId, deckId, fields: { Front: front, Back: '' }, tags }, now);

const opts = (o: Partial<SessionOptions>): SessionOptions => ({
  ...SESSION_DEFAULTS,
  deckId,
  ...o,
});

const fronts = async (cards: { noteId: string }[]) =>
  Promise.all(cards.map(async (c) => (await db.notes.get(c.noteId))!.fields.Front));

describe('custom study sessions', () => {
  it('reads through every card, suspended too, in the order added', async () => {
    await add('b', T0 + 2);
    await add('a', T0 + 1);
    const c = await add('c', T0 + 3);
    await db.cards.where('noteId').equals(c.id).modify({ suspended: true });
    const cards = await sessionCards(db, opts({ kind: 'all', limit: 0 }), T0 + 10);
    expect(await fronts(cards)).toEqual(['a', 'b', 'c']);
  });

  it('includes sub-decks and respects the limit', async () => {
    const sub = await createDeck(db, 'Sub', deckId, T0);
    await add('a', T0);
    await addNote(
      db,
      { noteTypeId: 'basic', deckId: sub.id, fields: { Front: 'z', Back: '' } },
      T0 + 1,
    );
    expect(await fronts(await sessionCards(db, opts({ kind: 'all', limit: 0 })))).toEqual([
      'a',
      'z',
    ]);
    expect(await sessionCards(db, opts({ kind: 'all', limit: 1 }))).toHaveLength(1);
  });

  it('picks new cards added recently', async () => {
    await add('old', T0 - 10 * DAY);
    await add('recent', T0 - DAY);
    const reviewed = await add('done', T0 - DAY);
    const card = (await db.cards.where('noteId').equals(reviewed.id).first())!;
    await recordReview(db, card.id, Rating.Good, { now: T0 });
    expect(await fronts(await sessionCards(db, opts({ kind: 'new', days: 3 }), T0))).toEqual([
      'recent',
    ]);
    expect(await fronts(await sessionCards(db, opts({ kind: 'new', days: 0 }), T0))).toEqual([
      'old',
      'recent',
    ]);
  });

  it('finds cards forgotten in the last days', async () => {
    const a = await add('a');
    await add('b');
    const card = (await db.cards.where('noteId').equals(a.id).first())!;
    await recordReview(db, card.id, Rating.Again, { now: T0 });
    expect(
      await fronts(await sessionCards(db, opts({ kind: 'forgotten', days: 1 }), T0 + 60_000)),
    ).toEqual(['a']);
    expect(await sessionCards(db, opts({ kind: 'forgotten', days: 1 }), T0 + 2 * DAY)).toHaveLength(
      0,
    );
  });

  it('reviews ahead: only review cards due after today', async () => {
    const a = await add('soon');
    const b = await add('later');
    const c = await add('today');
    const set = async (noteId: string, due: number) =>
      db.cards.where('noteId').equals(noteId).modify({ state: State.Review, due });
    await set(a.id, T0 + DAY);
    await set(b.id, T0 + 5 * DAY);
    await set(c.id, T0 + 3_600_000);
    expect(
      await fronts(await sessionCards(db, opts({ kind: 'ahead', days: 2, order: 'due' }), T0)),
    ).toEqual(['soon']);
    expect(
      await fronts(await sessionCards(db, opts({ kind: 'ahead', days: 7, order: 'due' }), T0)),
    ).toEqual(['soon', 'later']);
  });

  it('filters by tag, including child tags', async () => {
    await add('verb', T0, ['jp::verb']);
    await add('noun', T0 + 1, ['jp::noun']);
    await add('other', T0 + 2, ['misc']);
    expect(
      await fronts(await sessionCards(db, opts({ kind: 'tags', tags: ['jp'], order: 'added' }))),
    ).toEqual(['verb', 'noun']);
    expect(
      await fronts(await sessionCards(db, opts({ kind: 'tags', tags: ['JP::Noun'] }))),
    ).toEqual(['noun']);
  });

  it('shuffles with the given random source', async () => {
    for (const [i, f] of ['a', 'b', 'c'].entries()) await add(f, T0 + i);
    const cards = await sessionCards(
      db,
      opts({ kind: 'all', order: 'random', limit: 0 }),
      T0,
      () => 0,
    );
    expect(await fronts(cards)).toEqual(['b', 'c', 'a']);
  });

  it('round-trips options through the URL', () => {
    const o = opts({
      kind: 'tags',
      tags: ['a', 'b::c'],
      days: 3,
      limit: 50,
      order: 'due',
      reschedule: true,
    });
    expect(parseSessionQuery(deckId, new URLSearchParams(sessionQuery(o)))).toEqual(o);
    // Missing values fall back to the kind's defaults.
    const ahead = parseSessionQuery(deckId, new URLSearchParams('kind=ahead'));
    expect(ahead).toMatchObject({ kind: 'ahead', reschedule: true, order: 'due' });
    expect(parseSessionQuery(deckId, new URLSearchParams('kind=bogus&limit=-3')).kind).toBe('all');
  });
});

describe('extra cards today', () => {
  it('raises today’s new limit, and resets the next day', async () => {
    await updateDeckConfig(db, deckId, { newPerDay: 1 });
    for (const [i, f] of ['a', 'b', 'c', 'd'].entries()) await add(f, T0 + i);
    expect((await studyState(db, deckId, T0 + 10)).counts.new).toBe(1);
    await extendToday(db, deckId, { newCards: 2 }, T0 + 10);
    expect((await studyState(db, deckId, T0 + 10)).counts.new).toBe(3);
    await extendToday(db, deckId, { newCards: 5 }, T0 + 10);
    expect((await db.decks.get(deckId))!.config.extraToday!.newCards).toBe(7);
    expect((await studyState(db, deckId, T0 + DAY)).counts.new).toBe(1);
  });
});

describe('bury and suspend from review', () => {
  it('buries a card until the next day, and undo restores it', async () => {
    await add('a');
    await add('b');
    const first = (await studyState(db, deckId, T0)).next!;
    const until = nextDayStart(T0, 4);
    const undo = await hideCards(db, first, { action: 'bury', until }, 'card');
    const s = await studyState(db, deckId, T0);
    expect(s.counts.new).toBe(1);
    expect(s.next!.id).not.toBe(first.id);
    expect((await studyState(db, deckId, until)).counts.new).toBe(2);
    await restoreCards(db, undo);
    expect((await studyState(db, deckId, T0)).counts.new).toBe(2);
  });

  it('suspends every card of a note', async () => {
    const note = await addNote(
      db,
      { noteTypeId: 'basic-reversed', deckId, fields: { Front: 'x', Back: 'y' } },
      T0,
    );
    const card = (await db.cards.where('noteId').equals(note.id).first())!;
    await hideCards(db, card, { action: 'suspend' }, 'note');
    const cards = await db.cards.where('noteId').equals(note.id).toArray();
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.suspended)).toBe(true);
  });
});
