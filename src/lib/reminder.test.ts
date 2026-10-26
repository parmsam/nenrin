import { describe, expect, it } from 'vitest';
import { nextReminderAt, parseTime, reminderIcs } from './reminder';

const at = (h: number, m = 0, day = 10) => new Date(2026, 0, day, h, m).getTime();

describe('study reminders', () => {
  it('parses times, falling back to 19:00', () => {
    expect(parseTime('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseTime('7:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseTime('25:00')).toEqual({ hour: 19, minute: 0 });
    expect(parseTime('soon')).toEqual({ hour: 19, minute: 0 });
  });

  it('finds the next reminder, today or tomorrow', () => {
    expect(nextReminderAt('19:00', at(12))).toBe(at(19));
    expect(nextReminderAt('19:00', at(19))).toBe(at(19, 0, 11));
    expect(nextReminderAt('08:15', at(20))).toBe(at(8, 15, 11));
  });

  it('writes a daily calendar event with an alert', () => {
    const ics = reminderIcs('19:00', 'https://example.org/nenrin/', at(12));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTART:20260110T190000');
    expect(lines).toContain('DTEND:20260110T191000');
    expect(lines).toContain('RRULE:FREQ=DAILY');
    expect(lines).toContain('BEGIN:VALARM');
    expect(lines).toContain('URL:https://example.org/nenrin/');
    expect(ics).toContain('DESCRIPTION:A few minutes of reviews keeps your cards fresh.\\nhttps');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines).toContain('SUMMARY:Study with Nenrin');
  });
});
