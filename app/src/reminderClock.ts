import { calendarISO } from './format';

export interface ReminderClock {
  day: string;
  offset: number;
  wall: number;
  elapsed: number;
}

export function readReminderClock(date = new Date(), elapsed = globalThis.performance?.now() ?? Date.now()): ReminderClock {
  return { day: calendarISO(date), offset: date.getTimezoneOffset(), wall: date.getTime(), elapsed };
}

/** Normal timer delays do not rebuild alarms; wall-clock adjustments over a minute do. */
export function reminderClockChanged(previous: ReminderClock, next: ReminderClock): boolean {
  return previous.day !== next.day || previous.offset !== next.offset ||
    Math.abs((next.wall - previous.wall) - (next.elapsed - previous.elapsed)) > 60_000;
}
