/**
 * Turns review history into training data for the FSRS optimizer (fsrs-browser / fsrs-rs).
 *
 * Each card's reviews, in time order, become several training items: for every review after the
 * first, the item is all reviews up to and including it (the optimizer learns to predict the last
 * rating from the ones before). Gaps are counted in study days, honouring the rollover hour.
 * fsrs-rs rejects items without at least one gap of a day or more, so those are left out.
 */
import type { ReviewLog } from '../db/types';
import { dayStart } from './day';

const DAY = 86_400_000;

export interface TrainingSet {
  /** Flattened ratings (1–4) of every item, item after item. */
  ratings: Uint32Array;
  /** Days since the previous review, aligned with `ratings` (0 for each item's first review). */
  deltaTs: Uint32Array;
  /** Number of reviews in each item. */
  lengths: Uint32Array;
  items: number;
  /** Cards that contributed at least one item. */
  cards: number;
  /** Reviews considered (ratings 1–4). */
  reviews: number;
}

/** Below this many items the optimizer's output isn't trustworthy (Anki asks for ~400 reviews). */
export const MIN_ITEMS = 64;
export const RECOMMENDED_REVIEWS = 400;

export function buildTrainingSet(logs: ReviewLog[], rolloverHour: number): TrainingSet {
  const byCard = new Map<string, ReviewLog[]>();
  let reviews = 0;
  for (const l of logs) {
    if (l.rating < 1 || l.rating > 4) continue;
    reviews++;
    const list = byCard.get(l.cardId);
    if (list) list.push(l);
    else byCard.set(l.cardId, [l]);
  }

  const ratings: number[] = [];
  const deltas: number[] = [];
  const lengths: number[] = [];
  let cards = 0;
  for (const list of byCard.values()) {
    list.sort((a, b) => a.ts - b.ts);
    const days = list.map((l) => dayStart(l.ts, rolloverHour));
    const gaps = days.map((d, i) =>
      i === 0 ? 0 : Math.max(0, Math.round((d - days[i - 1]) / DAY)),
    );
    let used = false;
    for (let k = 2; k <= list.length; k++) {
      if (!gaps.slice(1, k).some((g) => g > 0)) continue;
      for (let i = 0; i < k; i++) {
        ratings.push(list[i].rating);
        deltas.push(gaps[i]);
      }
      lengths.push(k);
      used = true;
    }
    if (used) cards++;
  }
  return {
    ratings: Uint32Array.from(ratings),
    deltaTs: Uint32Array.from(deltas),
    lengths: Uint32Array.from(lengths),
    items: lengths.length,
    cards,
    reviews,
  };
}

/** Initial stability (days until recall drops to 90%) for a new card rated Again/Hard/Good/Easy. */
export function initialStabilities(params: readonly number[]): number[] {
  return params.slice(0, 4);
}
