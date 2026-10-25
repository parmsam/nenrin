/** Start of the study day containing `now`, in local time. Days roll over at `rolloverHour`. */
export function dayStart(now: number, rolloverHour: number): number {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rolloverHour);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/** Start of the next study day. Uses calendar math so DST days still roll over on the hour. */
export function nextDayStart(now: number, rolloverHour: number): number {
  const start = new Date(dayStart(now, rolloverHour));
  start.setDate(start.getDate() + 1);
  return start.getTime();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const trim = (n: number) => String(Number(n.toFixed(1)));

/** Short interval label for the rating buttons: "1m", "10m", "3h", "4d", "2.5mo", "1.2y". */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d`;
  if (ms < 365 * DAY) return `${trim(ms / (30 * DAY))}mo`;
  return `${trim(ms / (365 * DAY))}y`;
}
