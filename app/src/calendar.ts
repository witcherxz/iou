import { AR_MONTHS, AR_WEEKDAYS, calendarISO, isCalendarDate, localDate } from './format';

/** Sunday-first six-week grid; a constant height keeps navigation buttons in place. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= days; day++) cells.push(calendarISO(new Date(year, month, day)));
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** Whether any day of the month falls inside the optional inclusive bounds. */
export function monthInRange(year: number, month: number, min?: string, max?: string): boolean {
  const first = calendarISO(new Date(year, month, 1));
  const last = calendarISO(new Date(year, month + 1, 0));
  return (!min || last >= min) && (!max || first <= max);
}

export function clampDate(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** "الجمعة 27 نوفمبر 2026": always includes the year so a picked date is never ambiguous. */
export function fullArDate(iso: string): string {
  if (!isCalendarDate(iso)) return '';
  const d = localDate(iso);
  return `${AR_WEEKDAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
