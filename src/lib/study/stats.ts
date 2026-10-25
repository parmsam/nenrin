import type { NenrinDB } from '../db';
import { getPrefs } from '../db/prefs';
import { dayStart } from './day';

const DAY = 86_400_000;

export interface TodaySummary {
  /** Reviews answered since today's rollover. */
  reviewedToday: number;
  /** Consecutive study days ending today (or yesterday, if today isn't studied yet). */
  streak: number;
  studiedToday: boolean;
}

/** Counts consecutive days with reviews, given each review's day start. */
export function streakFrom(days: Set<number>, today: number): number {
  // The previous study day starts at the same local time one calendar day earlier (DST-safe).
  const step = (d: number) => {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return prev.getTime();
  };
  let cursor = days.has(today) ? today : step(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = step(cursor);
  }
  return streak;
}

export async function todaySummary(db: NenrinDB, now = Date.now()): Promise<TodaySummary> {
  const { rolloverHour } = await getPrefs(db);
  const today = dayStart(now, rolloverHour);
  // A year is plenty for a streak and keeps the scan bounded on big imported histories.
  const logs = await db.reviewLogs
    .where('ts')
    .aboveOrEqual(now - 400 * DAY)
    .toArray();
  const days = new Set(logs.map((l) => dayStart(l.ts, rolloverHour)));
  return {
    reviewedToday: logs.filter((l) => l.ts >= today).length,
    streak: streakFrom(days, today),
    studiedToday: days.has(today),
  };
}
