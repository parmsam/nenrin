import type { NenrinDB } from '../db';
import { deckSubtreeIds } from '../db/decks';
import { getPrefs } from '../db/prefs';
import type { Card, ReviewLog } from '../db/types';
import { State } from '../scheduler';
import { dayStart, nextDayStart } from './day';

const DAY = 86_400_000;

export interface TodaySummary {
  /** Reviews answered since today's rollover. */
  reviewedToday: number;
  /** Consecutive study days ending today (or yesterday, if today isn't studied yet). */
  streak: number;
  studiedToday: boolean;
  /** Reviews per study day before today, oldest first, for the last GROWTH_DAYS days (the rings). */
  growth: number[];
}

/** How far back the home screen's growth rings look. */
export const GROWTH_DAYS = 60;

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
  const perDay = new Map<number, number>();
  for (const l of logs) {
    const d = dayStart(l.ts, rolloverHour);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const days = new Set(perDay.keys());
  // Day starts going back from yesterday, by calendar (DST-safe), then oldest first.
  const growth: number[] = [];
  const d = new Date(today);
  for (let i = 0; i < GROWTH_DAYS; i++) {
    d.setDate(d.getDate() - 1);
    growth.unshift(perDay.get(d.getTime()) ?? 0);
  }
  return {
    reviewedToday: perDay.get(today) ?? 0,
    streak: streakFrom(days, today),
    studiedToday: days.has(today),
    growth,
  };
}

// ——— Stats page ———

/** Days of review history shown in the heatmap: 26 full weeks plus this week so far. */
export const HEATMAP_WEEKS = 26;
const MATURE_DAYS = 21;

export interface DayCount {
  /** Start of the study day (rollover-aware). */
  day: number;
  count: number;
}

export interface CardBreakdown {
  new: number;
  learning: number;
  /** Review cards with interval < 21 days. */
  young: number;
  /** Review cards with interval ≥ 21 days (Anki's definition of mature). */
  mature: number;
  suspended: number;
}

export interface StatsData {
  reviewsToday: number;
  minutesToday: number;
  streak: number;
  longestStreak: number;
  /** Share of reviews of already-learned cards answered Hard/Good/Easy (not Again). */
  retention30: { passed: number; total: number };
  reviews30: number;
  /** One entry per day for the heatmap, oldest first; weeks start on Monday. */
  heatmap: DayCount[];
  /** Reviews coming due per day for the next 30 days; day 0 includes overdue cards. */
  forecast: DayCount[];
  cards: CardBreakdown;
}

const previousDay = (d: number) => {
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  return prev.getTime();
};

/** Longest run of consecutive study days. */
export function longestStreak(days: Set<number>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(previousDay(d))) continue; // not the start of a run
    let len = 0;
    for (
      let cursor = d;
      days.has(cursor);
      cursor = new Date(cursor).setDate(new Date(cursor).getDate() + 1)
    ) {
      len++;
    }
    best = Math.max(best, len);
  }
  return best;
}

export function cardBreakdown(cards: Card[]): CardBreakdown {
  const out: CardBreakdown = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const c of cards) {
    if (c.suspended) out.suspended++;
    else if (c.state === State.New) out.new++;
    else if (c.state === State.Review) out[c.scheduledDays >= MATURE_DAYS ? 'mature' : 'young']++;
    else out.learning++;
  }
  return out;
}

/** Pure computation, so it can be tested without a database. */
export function computeStats(
  cards: Card[],
  logs: ReviewLog[],
  now: number,
  rolloverHour: number,
): StatsData {
  const today = dayStart(now, rolloverHour);
  const byDay = new Map<number, number>();
  for (const l of logs) {
    const d = dayStart(l.ts, rolloverHour);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const days = new Set(byDay.keys());

  // Heatmap: from the Monday HEATMAP_WEEKS weeks back, through today.
  let start = today;
  for (let i = 0; i < HEATMAP_WEEKS * 7; i++) start = previousDay(start);
  while (new Date(start).getDay() !== 1) start = previousDay(start);
  const heatmap: DayCount[] = [];
  for (let d = start; d <= today; d = new Date(d).setDate(new Date(d).getDate() + 1)) {
    heatmap.push({ day: d, count: byDay.get(d) ?? 0 });
  }

  // Forecast: cards with a due date (not new, not suspended), by study day.
  const forecast: DayCount[] = [];
  let dayCursor = today;
  for (let i = 0; i < 30; i++) {
    forecast.push({ day: dayCursor, count: 0 });
    dayCursor = nextDayStart(dayCursor, rolloverHour);
  }
  const horizon = nextDayStart(forecast[29].day, rolloverHour);
  for (const c of cards) {
    if (c.suspended || c.state === State.New || c.due >= horizon) continue;
    // Overdue cards count as due today.
    let i = 0;
    while (i < 29 && c.due >= forecast[i + 1].day) i++;
    forecast[i].count++;
  }

  const since30 = now - 30 * DAY;
  const recent = logs.filter((l) => l.ts >= since30);
  const learned = recent.filter((l) => l.state === State.Review);
  const todays = logs.filter((l) => l.ts >= today);

  return {
    reviewsToday: todays.length,
    minutesToday: Math.round(todays.reduce((ms, l) => ms + l.durationMs, 0) / 60_000),
    streak: streakFrom(days, today),
    longestStreak: longestStreak(days),
    retention30: { passed: learned.filter((l) => l.rating > 1).length, total: learned.length },
    reviews30: recent.length,
    heatmap,
    forecast,
    cards: cardBreakdown(cards),
  };
}

/** Stats for one deck (with sub-decks), or every deck when `deckId` is omitted. */
export async function loadStats(
  db: NenrinDB,
  deckId?: string,
  now = Date.now(),
): Promise<StatsData> {
  const { rolloverHour } = await getPrefs(db);
  const deckIds = deckId ? new Set(await deckSubtreeIds(db, deckId)) : undefined;
  const cards = (await db.cards.toArray()).filter((c) => !deckIds || deckIds.has(c.deckId));
  const cardIds = new Set(cards.map((c) => c.id));
  const since = now - (HEATMAP_WEEKS * 7 + 400) * DAY;
  const logs = (await db.reviewLogs.where('ts').aboveOrEqual(since).toArray()).filter(
    (l) => !deckIds || cardIds.has(l.cardId),
  );
  return computeStats(cards, logs, now, rolloverHour);
}
