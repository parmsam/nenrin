import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import type { ReviewLog } from '../db/types';
import { State } from '../scheduler';
import {
  dayKey,
  findMilestones,
  getStamps,
  seasonOf,
  sessionMark,
  stampMonth,
  stampToday,
} from './rewards';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

let n = 0;
const log = (ts: number, cardId = 'c', scheduledDays = 1): ReviewLog => ({
  id: `l${n++}`,
  cardId,
  ts,
  rating: 3,
  state: State.Review,
  elapsedDays: 1,
  scheduledDays,
  stability: 1,
  difficulty: 5,
  durationMs: 1000,
});

/** One review on each of `count` consecutive days from a start date. */
const daily = (start: [number, number, number], count: number) =>
  Array.from({ length: count }, (_, i) => log(at(start[0], start[1], start[2] + i)));

describe('rewards', () => {
  it('marks a session by cards answered, whatever the rating', () => {
    expect(sessionMark(9)).toBeNull();
    expect(sessionMark(10)?.kanji).toBe('木');
    expect(sessionMark(30)?.kanji).toBe('林');
    expect(sessionMark(50)).toMatchObject({ kanji: '森', rings: 0 });
    expect(sessionMark(250)).toMatchObject({ kanji: '森', rings: 2 });
  });

  it('finds milestones in the review log', () => {
    const logs = [...daily([2026, 1, 1], 20), ...daily([2026, 2, 1], 2)];
    const found = findMilestones(logs, 4);
    const by = Object.fromEntries(found.map((m) => [m.id, m.day]));
    expect(by.sprout).toBe('2026-01-01');
    expect(by.sapling).toBe('2026-01-07');
    // 11 days off (Jan 21 – Jan 31) is a scar; coming back is a milestone.
    expect(by.comeback).toBe('2026-02-01');
    expect(by.heartwood).toBeDefined();
    expect(by.year).toBeUndefined();
    expect(found.map((m) => m.day)).toEqual([...found.map((m) => m.day)].sort());
  });

  it('counts a card as mature once, when first scheduled three weeks out', () => {
    const logs = Array.from({ length: 100 }, (_, i) => log(at(2026, 3, 1) + i, `card${i}`, 25));
    logs.push(log(at(2026, 3, 2), 'card0', 40));
    expect(findMilestones(logs, 4).find((m) => m.id === 'ripe-100')?.day).toBe('2026-03-01');
    expect(findMilestones(logs.slice(0, 99), 4).find((m) => m.id === 'ripe-100')).toBeUndefined();
  });

  it('uses the rollover hour to decide the day', () => {
    // 2 AM belongs to the previous study day with a 4 AM rollover.
    expect(findMilestones([log(at(2026, 5, 2, 2))], 4)[0].day).toBe('2026-05-01');
    expect(findMilestones([log(at(2026, 5, 2, 2))], 0)[0].day).toBe('2026-05-02');
  });

  it('stamps a finished day once, and lays out the month Monday first', async () => {
    const db = new NenrinDB(`test-${crypto.randomUUID()}`);
    try {
      expect(await stampToday(db, at(2026, 10, 26))).toBe(true);
      expect(await stampToday(db, at(2026, 10, 26, 20))).toBe(false);
      const stamps = await getStamps(db);
      expect([...stamps]).toEqual(['2026-10-26']);
      const weeks = stampMonth(2026, 9, stamps, new Set(['2026-10-25']), []);
      // October 2026 starts on a Thursday.
      expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
      expect(weeks[0][3]).toMatchObject({ key: '2026-10-01', date: 1 });
      const cell = (k: string) => weeks.flat().find((c) => c?.key === k);
      expect(cell('2026-10-26')?.kind).toBe('stamp');
      expect(cell('2026-10-25')?.kind).toBe('studied');
      expect(cell('2026-10-24')?.kind).toBeNull();
      expect(weeks.every((w) => w.length === 7)).toBe(true);
    } finally {
      await db.delete();
    }
  });

  it('knows the season', () => {
    expect(seasonOf(new Date(2026, 3, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 6, 1))).toBe('summer');
    expect(seasonOf(new Date(2026, 9, 26))).toBe('autumn');
    expect(seasonOf(new Date(2026, 0, 1))).toBe('winter');
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });
});
