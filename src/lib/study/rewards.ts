/**
 * Opt-in rewards built around the tree (see docs/gamification.md). The ground rules:
 * never reward a rating (that would bias answers and FSRS), nothing is ever taken away, and
 * everything that can be is derived from the review log, so restores bring it all back.
 *
 * - Session marks: 木 → 林 → 森 as you answer cards, whatever the rating.
 * - Stamp book (御朱印帳): a red seal on each day you finished everything due.
 * - Milestones (節目): moments in the tree's life, found in the review log.
 * - Seasons (四季): the home tree dresses for the time of year.
 */
import type { NenrinDB } from '../db';
import type { ReviewLog } from '../db/types';
import { getPrefs } from '../db/prefs';
import { dayStart } from './day';
import { studyState } from './queue';
import { BREAK_DAYS, treeLayout } from './rings';

const DAY = 86_400_000;
const MATURE_DAYS = 21;

// ——— Session marks ———

export interface SessionMark {
  /** Cards answered to reach it. */
  at: number;
  kanji: string;
  name: string;
  /** Rings drawn around the kanji, for the marks past 森. */
  rings: number;
}

export const SESSION_MARKS: readonly SessionMark[] = [
  { at: 10, kanji: '木', name: 'Tree', rings: 0 },
  { at: 25, kanji: '林', name: 'Grove', rings: 0 },
  { at: 50, kanji: '森', name: 'Forest', rings: 0 },
  { at: 100, kanji: '森', name: 'Deep forest', rings: 1 },
  { at: 200, kanji: '森', name: 'Old forest', rings: 2 },
];

/** The highest mark reached after answering `answered` cards (any rating), if any. */
export function sessionMark(answered: number): SessionMark | null {
  return SESSION_MARKS.findLast((m) => answered >= m.at) ?? null;
}

// ——— Days ———

/** A study day as a local date, "2026-10-26". Stable even if the rollover hour changes later. */
export function dayKey(start: number): string {
  const d = new Date(start);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days from one day key to another. */
function daysBetween(a: string, b: string): number {
  const at = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((at(b) - at(a)) / DAY);
}

const STAMPS_KEY = 'stamps';

/** Days you finished everything due, as day keys. */
export async function getStamps(db: NenrinDB): Promise<Set<string>> {
  const row = await db.settings.get(STAMPS_KEY);
  return new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
}

/**
 * Stamps today in the stamp book. Call when nothing is left due after studying today. This is
 * the one reward that's stored: whether a past day was finished can't be read back from the
 * review log. It's a setting, so backups carry it.
 */
export async function stampToday(db: NenrinDB, now = Date.now()): Promise<boolean> {
  const { rolloverHour } = await getPrefs(db);
  const key = dayKey(dayStart(now, rolloverHour));
  const stamps = await getStamps(db);
  if (stamps.has(key)) return false;
  await db.settings.put({ key: STAMPS_KEY, value: [...stamps, key].sort() });
  return true;
}

/**
 * Stamps today if you studied and nothing is left due in any deck. Returns true when this
 * call added the stamp. Recorded whether or not rewards are shown, so the stamp book is
 * complete if they're turned on later.
 */
export async function stampIfFinished(db: NenrinDB, now = Date.now()): Promise<boolean> {
  const { rolloverHour } = await getPrefs(db);
  const start = dayStart(now, rolloverHour);
  if (!(await db.reviewLogs.where('ts').aboveOrEqual(start).count())) return false;
  const roots = await db.decks.filter((d) => !d.parentId).toArray();
  for (const deck of roots) {
    const { counts } = await studyState(db, deck.id, now);
    if (counts.new + counts.learning + counts.review > 0) return false;
  }
  return stampToday(db, now);
}

// ——— Milestones ———

export interface Milestone {
  id: string;
  kanji: string;
  name: string;
  description: string;
  /** Day key it was reached on. */
  day: string;
}

/**
 * Milestones reached, oldest first, from the review log alone. `logs` in any order;
 * `rolloverHour` decides which study day a review belongs to.
 */
export function findMilestones(logs: readonly ReviewLog[], rolloverHour: number): Milestone[] {
  const sorted = [...logs].sort((a, b) => a.ts - b.ts);
  if (!sorted.length) return [];
  const perDay = new Map<string, number>();
  for (const l of sorted) {
    const k = dayKey(dayStart(l.ts, rolloverHour));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const days = [...perDay.keys()];
  const out: Milestone[] = [];
  const add = (m: Omit<Milestone, 'day'>, day: string | undefined) =>
    day && out.push({ ...m, day });

  add({ id: 'sprout', kanji: '芽', name: 'Sprout', description: 'Your first review.' }, days[0]);
  add(
    { id: 'sapling', kanji: '若木', name: 'Sapling', description: 'Seven days of study.' },
    days[6],
  );
  // The first day the home screen's tree showed heartwood (it looks back a year).
  let heartwood: string | undefined;
  for (let i = 1; i < days.length && !heartwood; i++) {
    const span = Math.min(daysBetween(days[0], days[i]), 365);
    const counts: number[] = [];
    for (let back = span; back >= 1; back--) {
      const d = new Date(+days[i].slice(0, 4), +days[i].slice(5, 7) - 1, +days[i].slice(8, 10));
      d.setDate(d.getDate() - back);
      counts.push(perDay.get(dayKey(d.getTime())) ?? 0);
    }
    if (treeLayout(counts).heartwood > 0) heartwood = days[i];
  }
  add(
    {
      id: 'heartwood',
      kanji: '心材',
      name: 'Heartwood',
      description: 'Your tree’s first heartwood: older days darkening at the core.',
    },
    heartwood,
  );
  add(
    {
      id: 'year',
      kanji: '一年',
      name: 'One year',
      description: '365 days of study. The tree is full grown.',
    },
    days[364],
  );
  const comeback = days.find((d, i) => i > 0 && daysBetween(days[i - 1], d) - 1 >= BREAK_DAYS);
  add(
    {
      id: 'comeback',
      kanji: '復活',
      name: 'Comeback',
      description: 'Back after a long break. The scar makes the tree stronger.',
    },
    comeback,
  );
  // Mature: a card first scheduled three weeks or more ahead.
  const mature = new Set<string>();
  const goals = [100, 1000, 10_000];
  for (const l of sorted) {
    if (l.scheduledDays < MATURE_DAYS || mature.has(l.cardId)) continue;
    mature.add(l.cardId);
    if (goals.includes(mature.size)) {
      add(
        {
          id: `ripe-${mature.size}`,
          kanji: '熟',
          name: `${mature.size.toLocaleString()} mature cards`,
          description: `${mature.size.toLocaleString()} cards you know well enough to see three weeks or more apart.`,
        },
        dayKey(dayStart(l.ts, rolloverHour)),
      );
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

// ——— Stamp book ———

export type StampKind = 'stamp' | 'studied' | null;

export interface StampDay {
  key: string;
  date: number;
  kind: StampKind;
  /** Milestones reached that day. */
  seals: Milestone[];
}

/**
 * One month of the stamp book as weeks (Monday first), padded with nulls. A stamp means you
 * finished everything due that day; a light mark means you studied.
 */
export function stampMonth(
  year: number,
  month: number,
  stamps: Set<string>,
  studied: Set<string>,
  milestones: readonly Milestone[],
): (StampDay | null)[][] {
  const first = new Date(year, month, 1);
  const cells: (StampDay | null)[] = Array((first.getDay() + 6) % 7).fill(null);
  for (const d = new Date(first); d.getMonth() === month; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d.getTime());
    cells.push({
      key,
      date: d.getDate(),
      kind: stamps.has(key) ? 'stamp' : studied.has(key) ? 'studied' : null,
      seals: milestones.filter((m) => m.day === key),
    });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export interface RewardsData {
  studied: Set<string>;
  stamps: Set<string>;
  milestones: Milestone[];
  today: string;
}

export async function loadRewards(db: NenrinDB, now = Date.now()): Promise<RewardsData> {
  const { rolloverHour } = await getPrefs(db);
  const logs = await db.reviewLogs.toArray();
  return {
    studied: new Set(logs.map((l) => dayKey(dayStart(l.ts, rolloverHour)))),
    stamps: await getStamps(db),
    milestones: findMilestones(logs, rolloverHour),
    today: dayKey(dayStart(now, rolloverHour)),
  };
}

// ——— Seasons ———

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** The season by month, as in Japan (and the rest of the northern hemisphere). */
export function seasonOf(date: Date): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}
