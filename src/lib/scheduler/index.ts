/**
 * Thin wrapper over ts-fsrs. This is the only module allowed to import ts-fsrs,
 * so the rest of the app deals in plain, IndexedDB-friendly numbers (epoch ms).
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';

export { Rating, State };
export type { Grade };

export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

const DAY_MS = 86_400_000;

/** FSRS memory state stored on each card. All timestamps are UTC epoch ms. */
export interface SchedulingState {
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview?: number;
}

/** What gets appended to the review log. `state` is the state *before* this review. */
export interface ReviewOutcome {
  ts: number;
  rating: Grade;
  state: State;
  elapsedDays: number;
  scheduledDays: number;
  stability: number;
  difficulty: number;
}

export interface SchedulerOptions {
  /** Target probability of recall at review time, 0.7–0.99. */
  desiredRetention?: number;
  maximumIntervalDays?: number;
  enableFuzz?: boolean;
  /** Personal FSRS weights from the optimizer; defaults to FSRS-6 defaults. */
  params?: readonly number[];
}

export interface Scheduler {
  review(
    current: SchedulingState,
    grade: Grade,
    now?: number,
  ): { next: SchedulingState; log: ReviewOutcome };
  /** Due timestamp for each possible grade, for showing intervals on the buttons. */
  preview(current: SchedulingState, now?: number): Record<Grade, number>;
}

export function newSchedulingState(now: number = Date.now()): SchedulingState {
  return fromFsrs(createEmptyCard(new Date(now)));
}

export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const f = fsrs(
    generatorParameters({
      request_retention: options.desiredRetention,
      maximum_interval: options.maximumIntervalDays,
      enable_fuzz: options.enableFuzz ?? true,
      w: options.params ? [...options.params] : undefined,
    }),
  );

  return {
    review(current, grade, now = Date.now()) {
      const { card } = f.next(toFsrs(current, now), new Date(now), grade);
      const next = fromFsrs(card);
      return {
        next,
        log: {
          ts: now,
          rating: grade,
          state: current.state,
          elapsedDays: elapsedDays(current, now),
          scheduledDays: next.scheduledDays,
          stability: next.stability,
          difficulty: next.difficulty,
        },
      };
    },
    preview(current, now = Date.now()) {
      const preview = f.repeat(toFsrs(current, now), new Date(now));
      return Object.fromEntries(GRADES.map((g) => [g, preview[g].card.due.getTime()])) as Record<
        Grade,
        number
      >;
    },
  };
}

function elapsedDays(s: SchedulingState, now: number): number {
  return s.lastReview === undefined ? 0 : Math.max(0, Math.floor((now - s.lastReview) / DAY_MS));
}

function toFsrs(s: SchedulingState, now: number): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: elapsedDays(s, now),
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview === undefined ? undefined : new Date(s.lastReview),
  };
}

function fromFsrs(c: FsrsCard): SchedulingState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review?.getTime(),
  };
}

/**
 * Rebuilds FSRS state by replaying ratings in time order. Used for imported cards whose
 * history comes from another scheduler (e.g. Anki's SM-2), so FSRS starts from what you know.
 */
export function replay(
  reviews: readonly { ts: number; rating: Grade }[],
  options: SchedulerOptions = {},
): SchedulingState | undefined {
  if (reviews.length === 0) return undefined;
  const scheduler = createScheduler({ ...options, enableFuzz: false });
  let state = newSchedulingState(reviews[0].ts);
  for (const r of reviews) state = scheduler.review(state, r.rating, r.ts).next;
  return state;
}
