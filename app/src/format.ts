// Arabic text with Western Arabic (0–9) number and date formatting.
// Implemented by hand rather than via Intl so output is identical on every
// Hermes build, regardless of the ICU data shipped with the OS.

const GROUP_SEP = ',';
const DECIMAL_SEP = '.';

const group = (intPart: string) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP);

/** Display 0–9 consistently, with grouping and at most two decimal places. */
export function fmt(n: number, maxFractionDigits = 2): string {
  if (!isFinite(n)) return '—';
  const negative = n < 0;
  const abs = Math.abs(n);
  const rounded = Math.round(abs * 10 ** maxFractionDigits) / 10 ** maxFractionDigits;
  const [int, frac] = String(rounded).split('.');
  let out = group(int);
  if (frac) out += DECIMAL_SEP + frac;
  return (negative ? '−' : '') + out;
}

export const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export const AR_WEEKDAYS = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

/** Calendar dates are stored without a timezone, so travel cannot move a due date. */
export function calendarISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Retains compatibility with older ISO timestamp entries. */
export function localDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    if (!isCalendarDate(iso)) return new Date(NaN);
    const [year, month, day] = iso.split('-').map(Number);
    const d = new Date(0);
    d.setFullYear(year, month - 1, day);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  return new Date(iso);
}

export const todayISO = () => calendarISO(new Date());

/** Whole days from today until `iso`. Negative = overdue. */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const target = localDate(iso);
  if (!Number.isFinite(target.getTime())) return Infinity;
  const now = new Date();
  // Compare calendar days in UTC so daylight-saving transitions stay whole days.
  return Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = localDate(iso);
  d.setDate(d.getDate() + days);
  return calendarISO(d);
}

/** Anchors each month to the original day, clamping only shorter months. */
export function addMonths(iso: string, months: number): string {
  const d = localDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return calendarISO(d);
}

/** "2 سبتمبر" */
export function arDate(iso: string | null | undefined): string {
  if (!iso) return 'بدون';
  const d = localDate(iso);
  if (!Number.isFinite(d.getTime())) return 'بدون';
  return `${fmt(d.getDate(), 0)} ${AR_MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

/** "الجمعة 4 سبتمبر" */
export function arDateWithWeekday(iso: string): string {
  const d = localDate(iso);
  return `${AR_WEEKDAYS[d.getDay()]} ${arDate(iso)}`;
}

/** Relative label used on debt rows: "متأخر 3 يوم" / "يستحق اليوم" / "خلال 5 يوم". */
export function dueLabelFor(dueIn: number, paid: boolean): string {
  if (paid) return 'مكتمل';
  if (!isFinite(dueIn)) return 'بدون تاريخ';
  if (dueIn < 0) return 'متأخر ' + fmt(-dueIn, 0) + ' يوم';
  if (dueIn === 0) return 'يستحق اليوم';
  return 'خلال ' + fmt(dueIn, 0) + ' يوم';
}
