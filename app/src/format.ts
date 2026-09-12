// Arabic (ar-SA) number + date formatting.
// Implemented by hand rather than via Intl so output is identical on every
// Hermes build, regardless of the ICU data shipped with the OS.

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const GROUP_SEP = '٬'; // U+066C arabic thousands separator
const DECIMAL_SEP = '٫'; // U+066B arabic decimal separator

const toArabicDigits = (s: string) => s.replace(/[0-9]/g, d => AR_DIGITS[Number(d)]);

const group = (intPart: string) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP);

/** Format a number the way the design does: Arabic-Indic digits, max 2 decimals. */
export function fmt(n: number, maxFractionDigits = 2): string {
  if (!isFinite(n)) return '—';
  const negative = n < 0;
  const abs = Math.abs(n);
  const rounded = Math.round(abs * 10 ** maxFractionDigits) / 10 ** maxFractionDigits;
  const [int, frac] = String(rounded).split('.');
  let out = group(int);
  if (frac) out += DECIMAL_SEP + frac;
  return (negative ? '−' : '') + toArabicDigits(out);
}

export const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export const AR_WEEKDAYS = [
  'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

/** Midnight of the given date, so day maths never drifts with the clock. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const todayISO = () => startOfDay(new Date()).toISOString();

/** Whole days from today until `iso`. Negative = overdue. */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const target = startOfDay(new Date(iso)).getTime();
  const now = startOfDay(new Date()).getTime();
  return Math.round((target - now) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = startOfDay(new Date(iso));
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** "٢ سبتمبر" */
export function arDate(iso: string | null | undefined): string {
  if (!iso) return 'بدون';
  const d = new Date(iso);
  return `${fmt(d.getDate(), 0)} ${AR_MONTHS[d.getMonth()]}`;
}

/** "الجمعة ٤ سبتمبر" */
export function arDateWithWeekday(iso: string): string {
  const d = new Date(iso);
  return `${AR_WEEKDAYS[d.getDay()]} ${arDate(iso)}`;
}

/** Relative label used on debt rows: "متأخر ٣ يوم" / "يستحق اليوم" / "خلال ٥ يوم". */
export function dueLabelFor(dueIn: number, paid: boolean): string {
  if (paid) return 'مكتمل';
  if (!isFinite(dueIn)) return 'بدون تاريخ';
  if (dueIn < 0) return 'متأخر ' + fmt(-dueIn, 0) + ' يوم';
  if (dueIn === 0) return 'يستحق اليوم';
  return 'خلال ' + fmt(dueIn, 0) + ' يوم';
}
