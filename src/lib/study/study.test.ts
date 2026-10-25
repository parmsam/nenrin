import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck, updateDeckConfig } from '../db/decks';
import { setPrefs } from '../db/prefs';
import { recordReview } from '../db/repo';
import { addNote, ensureBuiltins } from '../notes';
import { Rating, State } from '../scheduler';
import { dayStart, formatInterval, nextDayStart } from './day';
import { LEARN_AHEAD_MS, studyState } from './queue';

const MIN = 60_000;
const DAY = 86_400_000;
// Local noon, so day boundaries are unambiguous in any test timezone.
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

const add = (front: string, noteTypeId = 'basic', now = T0) =>
  addNote(db, { noteTypeId, deckId, fields: { Front: front, Back: `${front}-back` } }, now);

describe('day boundaries', () => {
  it('rolls over at the configured hour', () => {
    const at = (h: number) => new Date(2026, 0, 10, h).getTime();
    expect(dayStart(at(12), 4)).toBe(at(4));
    expect(dayStart(at(2), 4)).toBe(new Date(2026, 0, 9, 4).getTime());
    expect(nextDayStart(at(12), 4)).toBe(new Date(2026, 0, 11, 4).getTime());
  });

  it('formats intervals', () => {
    expect(formatInterval(30_000)).toBe('1m');
    expect(formatInterval(10 * MIN)).toBe('10m');
    expect(formatInterval(5 * 3_600_000)).toBe('5h');
    expect(formatInterval(3 * DAY)).toBe('3d');
    expect(formatInterval(75 * DAY)).toBe('2.5mo');
    expect(formatInterval(730 * DAY)).toBe('2y');
  });
});

describe('study queue', () => {
  it('shows new cards in creation order, up to the daily limit', async () => {
    await updateDeckConfig(db, deckId, { newPerDay: 2 });
    for (const [i, f] of ['a', 'b', 'c'].entries()) await add(f, 'basic', T0 + i);
    const s = await studyState(db, deckId, T0 + 10);
    expect(s.counts).toEqual({ new: 2, learning: 0, review: 0 });
    const note = await db.notes.get(s.next!.noteId);
    expect(note!.fields.Front).toBe('a');
  });

  it('counts today’s new cards against the limit', async () => {
    await updateDeckConfig(db, deckId, { newPerDay: 2 });
    for (const f of ['a', 'b', 'c']) await add(f);
    const first = (await studyState(db, deckId, T0)).next!;
    await recordReview(db, first.id, Rating.Good, { now: T0 });
    const s = await studyState(db, deckId, T0 + MIN);
    expect(s.counts.new).toBe(1);
    expect(s.counts.learning).toBe(1);
  });

  it('shows due learning cards first and waits for future ones', async () => {
    await add('a');
    await add('b');
    const first = (await studyState(db, deckId, T0)).next!;
    await recordReview(db, first.id, Rating.Again, { now: T0 });
    const learningCard = (await db.cards.get(first.id))!;
    expect(learningCard.state).toBe(State.Learning);

    // Learning card due in ~1 minute is within learn-ahead, so it comes before new cards.
    const s = await studyState(db, deckId, T0 + 1000);
    expect(s.next!.id).toBe(first.id);

    // Graduate it to a review due on a later day, then only waits remain once 'b' is done.
    await recordReview(db, first.id, Rating.Easy, { now: learningCard.due });
    const b = (await studyState(db, deckId, T0 + 2 * MIN)).next!;
    await recordReview(db, b.id, Rating.Hard, { now: T0 + 2 * MIN });
    const hard = (await db.cards.get(b.id))!;
    const later = await studyState(db, deckId, hard.due - LEARN_AHEAD_MS - MIN);
    expect(later.next).toBeUndefined();
    expect(later.waitUntil).toBe(hard.due);
  });

  it('buries siblings: one card per note per day', async () => {
    await add('a', 'basic-reversed');
    let s = await studyState(db, deckId, T0);
    expect(s.counts.new).toBe(1);
    await recordReview(db, s.next!.id, Rating.Easy, { now: T0 });
    s = await studyState(db, deckId, T0 + MIN);
    expect(s.counts.new).toBe(0);

    // Tomorrow the sibling is available.
    s = await studyState(db, deckId, T0 + DAY);
    expect(s.counts.new).toBe(1);
  });

  it('includes sub-decks', async () => {
    const child = await createDeck(db, 'child', deckId, T0);
    await addNote(
      db,
      { noteTypeId: 'basic', deckId: child.id, fields: { Front: 'x', Back: 'y' } },
      T0,
    );
    expect((await studyState(db, deckId, T0)).counts.new).toBe(1);
  });

  it('uses the rollover hour to decide what counts as today', async () => {
    await setPrefs(db, { rolloverHour: 4 });
    await updateDeckConfig(db, deckId, { newPerDay: 1 });
    await add('a');
    await add('b');
    const late = new Date(2026, 0, 10, 23).getTime();
    const first = (await studyState(db, deckId, late)).next!;
    await recordReview(db, first.id, Rating.Easy, { now: late });
    // 2 AM is still the same study day; 5 AM is a new one.
    expect((await studyState(db, deckId, new Date(2026, 0, 11, 2).getTime())).counts.new).toBe(0);
    expect((await studyState(db, deckId, new Date(2026, 0, 11, 5).getTime())).counts.new).toBe(1);
  });

  it('skips suspended cards', async () => {
    const n = await add('a');
    await db.cards.where('noteId').equals(n.id).modify({ suspended: true });
    expect((await studyState(db, deckId, T0)).next).toBeUndefined();
  });
});
