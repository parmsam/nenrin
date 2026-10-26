import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB, type Card } from '../db';
import { createDeck, updateDeckConfig } from '../db/decks';
import { setPrefs } from '../db/prefs';
import { recordReview } from '../db/repo';
import { addNote, ensureBuiltins } from '../notes';
import { newSchedulingState, Rating, State, type Grade } from '../scheduler';
import { dayStart, formatInterval, nextDayStart } from './day';
import { LEARN_AHEAD_MS, sessionProgress, studyState } from './queue';
import { computeStats, longestStreak, streakFrom, todaySummary } from './stats';

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

describe('today summary', () => {
  it('counts today’s reviews and the streak', async () => {
    const at = (d: number, h = 12) => new Date(2026, 0, d, h).getTime();
    for (const [i, day] of [7, 8, 9, 10].entries()) {
      const n = await add(`s${i}`, 'basic', at(day));
      const card = (await db.cards.where('noteId').equals(n.id).first())!;
      await recordReview(db, card.id, Rating.Good, { now: at(day) });
    }
    // One review on each of four consecutive days.
    const summary = await todaySummary(db, at(10, 18));
    expect(summary).toMatchObject({ reviewedToday: 1, streak: 4, studiedToday: true });
    // The growth rings: one review on each of the three days before today, oldest first.
    expect(summary.growth).toHaveLength(365);
    expect(summary.growth.slice(-4)).toEqual([0, 1, 1, 1]);
    // Next day, before studying: the streak is still alive.
    expect(await todaySummary(db, at(11, 9))).toMatchObject({ streak: 4, studiedToday: false });
    // Two days later it's broken.
    expect(await todaySummary(db, at(12, 9))).toMatchObject({ streak: 0, reviewedToday: 0 });
  });

  it('computes streaks across a DST change', () => {
    const days = new Set(
      [new Date(2026, 2, 28, 4), new Date(2026, 2, 29, 4), new Date(2026, 2, 30, 4)].map((d) =>
        d.getTime(),
      ),
    );
    expect(streakFrom(days, new Date(2026, 2, 30, 4).getTime())).toBe(3);
  });
});

describe('stats', () => {
  const at = (d: number, h = 12) => new Date(2026, 0, d, h).getTime();
  const log = (cardId: string, ts: number, rating: number, state: State, durationMs = 6000) => ({
    id: `${cardId}-${ts}`,
    cardId,
    ts,
    rating: rating as Grade,
    state,
    elapsedDays: 0,
    scheduledDays: 0,
    stability: 0,
    difficulty: 0,
    durationMs,
  });
  const card = (id: string, state: State, due: number, extra: Partial<Card> = {}): Card => ({
    ...newSchedulingState(at(1)),
    id,
    noteId: id,
    deckId,
    ordinal: 0,
    suspended: false,
    buried: false,
    state,
    due,
    ...extra,
  });

  it('computes streaks, retention, heatmap, forecast and card counts', () => {
    const now = at(20, 15);
    const cards = [
      card('n', State.New, at(1)),
      card('l', State.Learning, at(20, 16)),
      card('y', State.Review, at(19), { scheduledDays: 5 }), // overdue → today
      card('m', State.Review, at(25), { scheduledDays: 40 }),
      card('s', State.Review, at(21), { suspended: true }),
      card('far', State.Review, at(20) + 60 * 86_400_000, { scheduledDays: 60 }),
    ];
    const logs = [
      ...[10, 11, 12].map((d) => log('y', at(d), 3, State.Review)),
      log('y', at(15), 1, State.Review),
      log('m', at(19), 3, State.Review),
      log('l', at(20, 9), 3, State.New, 60_000),
      log('l', at(20, 10), 4, State.Learning, 60_000),
    ];
    const s = computeStats(cards, logs, now, 4);
    expect(s.reviewsToday).toBe(2);
    expect(s.minutesToday).toBe(2);
    expect(s.streak).toBe(2); // days 19 and 20
    expect(s.longestStreak).toBe(3); // days 10–12
    expect(s.retention30).toEqual({ passed: 4, total: 5 });
    expect(s.cards).toEqual({ new: 1, learning: 1, young: 1, mature: 2, suspended: 1 });
    // Today holds the learning card and the overdue one; day 5 holds the mature card.
    expect(s.forecast[0].count).toBe(2);
    expect(s.forecast[5].count).toBe(1);
    expect(s.forecast.reduce((n, f) => n + f.count, 0)).toBe(3);
    // Heatmap starts on a Monday and ends today.
    expect(new Date(s.heatmap[0].day).getDay()).toBe(1);
    expect(s.heatmap.at(-1)!.day).toBe(new Date(2026, 0, 20, 4).getTime());
    expect(s.heatmap.find((d) => d.day === new Date(2026, 0, 10, 4).getTime())!.count).toBe(1);
  });

  it('finds the longest streak', () => {
    const days = new Set([1, 2, 3, 7, 8].map((d) => new Date(2026, 0, d, 4).getTime()));
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak(new Set())).toBe(0);
  });
});

describe('session progress', () => {
  it('counts answered cards against those answered plus those still due', () => {
    expect(sessionProgress(0, { new: 0, learning: 0, review: 0 })).toBe(0);
    expect(sessionProgress(0, { new: 5, learning: 0, review: 5 })).toBe(0);
    expect(sessionProgress(3, { new: 2, learning: 1, review: 4 })).toBeCloseTo(0.3);
    expect(sessionProgress(4, { new: 0, learning: 0, review: 0 })).toBe(1);
  });
});
