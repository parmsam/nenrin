/**
 * Study reminders without a server. Two ways, both local:
 * - a calendar event (.ics) that repeats daily with an alert: works on every device;
 * - notifications from the service worker (public/sw-custom.js), checked when the page's
 *   timer fires and, in installed Chromium apps, by Periodic Background Sync.
 * Web Push would need a push server, which Nenrin doesn't have by design.
 */

/** Parses "HH:MM" (24-hour). Falls back to 19:00 for anything else. */
export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60
    ? { hour, minute }
    : { hour: 19, minute: 0 };
}

/** The next time (local) the reminder is due, strictly after `now`. */
export function nextReminderAt(time: string, now = Date.now()): number {
  const { hour, minute } = parseTime(time);
  const d = new Date(now);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date-time in iCalendar's floating form, e.g. 20260110T190000 (no time zone). */
function icsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function icsUtc(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escapes text for an iCalendar property value. */
const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/**
 * A daily repeating calendar event at `time`, with an alert, linking to the app. Floating
 * local time, so it stays at that hour wherever the device is.
 */
export function reminderIcs(time: string, appUrl: string, now = Date.now()): string {
  const start = new Date(nextReminderAt(time, now));
  const end = new Date(start.getTime() + 10 * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nenrin//Study reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:nenrin-study-reminder-${icsUtc(now)}@nenrin`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsLocal(start)}`,
    `DTEND:${icsLocal(end)}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsText('Study with Nenrin')}`,
    `DESCRIPTION:${icsText(`A few minutes of reviews keeps your cards fresh.\n${appUrl}`)}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText('Time to study with Nenrin')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// Browser side. These touch browser globals only when called, so the helpers above stay testable.

/** True if this browser can show notifications from the service worker at all. */
export function canNotify(): boolean {
  return 'Notification' in globalThis && 'serviceWorker' in navigator;
}

/** Notification permission, preferring the Permissions API (Notification.permission can lag). */
export async function notifyPermission(): Promise<PermissionState> {
  try {
    return (await navigator.permissions.query({ name: 'notifications' })).state;
  } catch {
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }
}

/** True when an installed app can be woken in the background (Chromium only). */
export async function hasBackgroundCheck(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration();
  return !!reg && 'periodicSync' in reg;
}

/** Asks for notification permission and registers the background check where possible. */
export async function enableNotifications(): Promise<boolean> {
  if (!canNotify()) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;
  // Not awaited: the browser may take its time (or never answer) deciding, and the toggle
  // shouldn't wait on it. The browser picks the timing; the worker checks the hour itself.
  navigator.serviceWorker.ready
    .then((reg) =>
      (
        reg as ServiceWorkerRegistration & {
          periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> };
        }
      ).periodicSync?.register('nenrin-reminder', { minInterval: 3 * 3_600_000 }),
    )
    // Not installed, or not allowed: the in-page timer still works while Nenrin is open.
    .catch(() => {});
  return true;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let onHidden: (() => void) | undefined;

async function askWorker() {
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.active?.postMessage({ type: 'nenrin-reminder-check' });
}

/**
 * Keeps the in-page reminder timer in step with the prefs. The worker decides whether to
 * notify (time passed, nothing studied today, cards due), once a day. It's skipped while
 * Nenrin is on screen, where a notification would only interrupt.
 */
export async function scheduleReminder(time: string, notify: boolean): Promise<void> {
  clearTimeout(timer);
  if (onHidden) document.removeEventListener('visibilitychange', onHidden);
  onHidden = undefined;
  if (!notify || !canNotify() || (await notifyPermission()) !== 'granted') return;
  const check = () => {
    if (document.visibilityState === 'hidden') askWorker();
  };
  onHidden = check;
  document.addEventListener('visibilitychange', check);
  const arm = () => {
    // setTimeout can't wait longer than ~24.8 days; a day is plenty, then re-arm.
    timer = setTimeout(
      () => {
        check();
        arm();
      },
      Math.max(1000, nextReminderAt(time) - Date.now()),
    );
  };
  arm();
}
