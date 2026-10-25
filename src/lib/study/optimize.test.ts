import { describe, expect, it } from 'vitest';
import type { ReviewLog } from '../db/types';
import { State, type Grade } from '../scheduler';
import { buildTrainingSet } from './optimize';

const at = (d: number, h = 12) => new Date(2026, 0, d, h).getTime();
const log = (cardId: string, ts: number, rating: number): ReviewLog => ({
  id: `${cardId}-${ts}`,
  cardId,
  ts,
  rating: rating as Grade,
  state: State.Review,
  elapsedDays: 0,
  scheduledDays: 0,
  stability: 0,
  difficulty: 0,
  durationMs: 0,
});

describe('buildTrainingSet', () => {
  it('makes one item per review after the first, with gaps in study days', () => {
    const set = buildTrainingSet(
      [log('a', at(5), 3), log('a', at(1), 3), log('a', at(2), 1), log('a', at(2, 13), 3)],
      4,
    );
    // Sorted: day1 Good, day2 Again, day2 Good (same day), day5 Good.
    expect([...set.lengths]).toEqual([2, 3, 4]);
    expect([...set.ratings]).toEqual([3, 1, 3, 1, 3, 3, 1, 3, 3]);
    expect([...set.deltaTs]).toEqual([0, 1, 0, 1, 0, 0, 1, 0, 3]);
    expect(set).toMatchObject({ items: 3, cards: 1, reviews: 4 });
  });

  it('skips items with no gap of a day or more (fsrs-rs rejects them)', () => {
    const set = buildTrainingSet([log('b', at(1, 9), 1), log('b', at(1, 10), 3)], 4);
    expect(set.items).toBe(0);
    expect(set.cards).toBe(0);
  });

  it('uses the rollover hour: 1 AM belongs to the previous study day', () => {
    const set = buildTrainingSet(
      [log('c', at(1, 22), 3), log('c', at(2, 1), 3), log('c', at(3, 9), 3)],
      4,
    );
    // 22:00 and 01:00 are the same study day, so only the third review has a gap.
    expect([...set.lengths]).toEqual([3]);
    expect([...set.deltaTs]).toEqual([0, 0, 2]);
  });

  it('ignores manual entries without a rating', () => {
    expect(buildTrainingSet([log('d', at(1), 0), log('d', at(3), 3)], 4).reviews).toBe(1);
  });
});
