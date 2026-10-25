import { describe, expect, it } from 'vitest';
import { createScheduler, newSchedulingState, Rating, State } from '.';

const T0 = Date.UTC(2026, 0, 1, 12);
const DAY = 86_400_000;
const scheduler = createScheduler({ enableFuzz: false });

describe('scheduler', () => {
  it('creates a new card that is due immediately', () => {
    const s = newSchedulingState(T0);
    expect(s.state).toBe(State.New);
    expect(s.due).toBe(T0);
    expect(s.reps).toBe(0);
  });

  it('moves a new card forward on Good and logs the prior state', () => {
    const { next, log } = scheduler.review(newSchedulingState(T0), Rating.Good, T0);
    expect(next.state).not.toBe(State.New);
    expect(next.due).toBeGreaterThan(T0);
    expect(next.reps).toBe(1);
    expect(next.lastReview).toBe(T0);
    expect(log).toMatchObject({ ts: T0, rating: Rating.Good, state: State.New, elapsedDays: 0 });
  });

  it('counts a lapse when a review card is forgotten', () => {
    let s = scheduler.review(newSchedulingState(T0), Rating.Easy, T0).next;
    expect(s.state).toBe(State.Review);
    const later = s.due;
    const { next, log } = scheduler.review(s, Rating.Again, later);
    s = next;
    expect(s.lapses).toBe(1);
    expect(s.state).toBe(State.Relearning);
    expect(log.elapsedDays).toBe(Math.floor((later - T0) / DAY));
  });

  it('previews non-decreasing due dates from Again to Easy', () => {
    const reviewed = scheduler.review(newSchedulingState(T0), Rating.Good, T0).next;
    const p = scheduler.preview(reviewed, reviewed.due);
    expect(p[Rating.Again]).toBeLessThanOrEqual(p[Rating.Hard]);
    expect(p[Rating.Hard]).toBeLessThanOrEqual(p[Rating.Good]);
    expect(p[Rating.Good]).toBeLessThanOrEqual(p[Rating.Easy]);
  });

  it('schedules longer intervals at lower desired retention', () => {
    const lax = createScheduler({ enableFuzz: false, desiredRetention: 0.8 });
    const strict = createScheduler({ enableFuzz: false, desiredRetention: 0.95 });
    const start = newSchedulingState(T0);
    expect(lax.review(start, Rating.Easy, T0).next.due).toBeGreaterThan(
      strict.review(start, Rating.Easy, T0).next.due,
    );
  });
});
