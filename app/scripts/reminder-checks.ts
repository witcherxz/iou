import { calendarISO } from '../src/format';
import { MAX_DEBT_REMINDERS, planReminders } from '../src/reminderPlan';
import { reminderContent } from '../src/reminderContent';
import { clearSnooze, defaultReminderSettings, parseReminderTime, ReminderSettings, reminderTime, snoozeDebt, validateReminderSettings } from '../src/reminderSettings';
import type { DebtView, ScheduleRow } from '../src/selectors';

declare const process: { env: Record<string, string | undefined> };
let checks = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function rejects(label: string, action: () => unknown) {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  eq(label, rejected, true);
}
const debt = (patch: Partial<DebtView> = {}): DebtView => ({
  id: 'd1', personId: 'p1', personName: 'أحمد', dir: 'me', amount: 12.34, rem: 12.34,
  createdAt: '2026-01-01', nextDueAt: '2027-01-10', note: 'تفاصيل خاصة', paid: false, schedule: null,
  ...patch,
} as DebtView);
const defaults = defaultReminderSettings();
eq('legacy defaults preserve old reminders', validateReminderSettings(undefined), defaults);
const isolated = defaultReminderSettings(); isolated.snoozedUntil.d1 = '2027-01-30T12:00:00.000Z';
eq('defaults have independent maps', defaults.snoozedUntil, {});
eq('time format uses 0–9', reminderTime({ hour: 9, minute: 5 }), '09:05');
eq('valid time parses', parseReminderTime('9:05'), { hour: 9, minute: 5 });
for (const time of ['24:00', '09:60', '9:5', '12', '٠٩:٠٥', '-1:00']) eq(`invalid time ${time}`, parseReminderTime(time), null);
for (const patch of [{ hour: 24 }, { hour: -1 }, { minute: 60 }, { leadDays: 31 }, { leadDays: 1.5 }, { overdueRepeatDays: -1 }, { weeklyDay: 0 }, { weeklyDay: 8 }, { privateNotifications: 'yes' }, { snoozedUntil: [] }, { snoozedUntil: { d1: '2027-02-30T12:00:00Z' } }, { snoozedUntil: { d1: '2027-01-01' } }, { snoozedUntil: JSON.parse('{"__proto__":"2027-01-01T12:00:00Z"}') }]) rejects(`reject malformed ${JSON.stringify(patch)}`, () => validateReminderSettings({ ...defaults, ...patch }));
for (const invalid of [null, {}, true, '']) rejects('present malformed settings never default', () => validateReminderSettings(invalid));
const normalized = validateReminderSettings({ ...defaults, extra: 'drop', snoozedUntil: { d1: '2027-01-30T12:00:00Z', stale: '2027-01-30T12:00:00Z' } }, new Set(['d1']));
eq('stale snooze pruned and timestamp normalized', normalized.snoozedUntil, { d1: '2027-01-30T12:00:00.000Z' });
eq('unknown settings whitelisted', 'extra' in normalized, false);
eq('clear snooze leaves input untouched', clearSnooze(normalized, 'd1').snoozedUntil, {});
eq('clear snooze immutable', Object.keys(normalized.snoozedUntil), ['d1']);

const previousTZ = process.env.TZ;
for (const timezone of ['UTC', 'Asia/Riyadh', 'America/New_York', 'Pacific/Auckland']) {
  process.env.TZ = timezone;
  const settings: ReminderSettings = { ...defaults, hour: 9, minute: 30, leadDays: 3 };
  const now = new Date(2027, 0, 1, 8).getTime();
  const planned = planReminders([debt()], {}, now, settings);
  eq(`${timezone}: before plus due dates`, planned.map(p => [calendarISO(p.when), p.kind]), [['2027-01-07', 'before'], ['2027-01-10', 'due']]);
  eq(`${timezone}: local time honored`, planned.map(p => [p.when.getHours(), p.when.getMinutes()]), [[9, 30], [9, 30]]);
  eq(`${timezone}: passed lead never fires immediately`, planReminders([debt()], {}, new Date(2027, 0, 8).getTime(), settings).map(p => p.kind), ['due']);
  eq(`${timezone}: disabled debt omitted`, planReminders([debt()], { d1: false }, now, settings).length, 0);
  eq(`${timezone}: paid debt omitted`, planReminders([debt({ paid: true, rem: 0 })], {}, now, settings).length, 0);
  eq(`${timezone}: voided debt omitted`, planReminders([debt({ voidedAt: '2026-12-01T00:00:00.000Z' })], {}, now, settings).length, 0);
  eq(`${timezone}: no date omitted`, planReminders([debt({ nextDueAt: null })], {}, now, settings).length, 0);
  eq(`${timezone}: invalid date omitted`, planReminders([debt({ nextDueAt: '2027-02-30' })], {}, now, settings).length, 0);
  eq(`${timezone}: no unwanted overdue defaults`, planReminders([debt()], {}, new Date(2027, 0, 20).getTime(), defaults).length, 0);

  const follow: ReminderSettings = { ...settings, overdueRepeatDays: 3 };
  const lateNow = new Date(2027, 0, 20, 8).getTime();
  const repeating = planReminders([debt()], {}, lateNow, follow);
  eq(`${timezone}: overdue cadence starts at next anchored date`, repeating.slice(0, 3).map(p => calendarISO(p.when)), ['2027-01-22', '2027-01-25', '2027-01-28']);
  eq(`${timezone}: generation bounded per debt`, repeating.length, MAX_DEBT_REMINDERS + 1);
  eq(`${timezone}: same-day future cadence retained`, calendarISO(planReminders([debt()], {}, new Date(2027, 0, 19, 8).getTime(), follow)[0].when), '2027-01-19');
  eq(`${timezone}: elapsed same-day cadence omitted`, calendarISO(planReminders([debt()], {}, new Date(2027, 0, 19, 10).getTime(), follow)[0].when), '2027-01-22');

  const snoozed = snoozeDebt(follow, 'd1', 7, lateNow);
  const until = new Date(snoozed.snoozedUntil.d1);
  eq(`${timezone}: snooze local date/time`, [calendarISO(until), until.getHours(), until.getMinutes()], ['2027-01-27', 9, 30]);
  const postponed = planReminders([debt()], {}, lateNow, snoozed);
  eq(`${timezone}: suppress schedules before snooze`, postponed.every(item => item.when.getTime() >= until.getTime()), true);
  eq(`${timezone}: snooze triggers a single follow-up`, [postponed[0].kind, calendarISO(postponed[0].when)], ['snooze', '2027-01-27']);
  eq(`${timezone}: cadence resumes after snooze`, calendarISO(postponed[1].when), '2027-01-28');
  const noRepeatSnooze = { ...snoozed, overdueRepeatDays: 0 };
  eq(`${timezone}: one-off snooze works without repeat`, planReminders([debt()], {}, lateNow, noRepeatSnooze).length, 1);
  eq(`${timezone}: expired one-off snooze does not repeat`, planReminders([debt()], {}, new Date(2027, 0, 28).getTime(), noRepeatSnooze).length, 0);

  const schedule = [
    { index: 0, dueAt: '2027-01-10', remainingAmount: 0.01, paid: false },
    { index: 1, dueAt: '2027-01-13', remainingAmount: 2, paid: false },
    { index: 2, dueAt: '2027-02-10', remainingAmount: 1, paid: true },
  ] as ScheduleRow[];
  const installments = planReminders([debt({ rem: 2.01, schedule })], {}, new Date(2027, 0, 11).getTime(), follow);
  eq(`${timezone}: concurrent installment/overdue alerts consolidated`, installments.filter(item => calendarISO(item.when) === '2027-01-13').length, 1);
  eq(`${timezone}: partial installment amounts use exact cents`, installments.find(item => calendarISO(item.when) === '2027-01-13')?.amount, 2.01);
  eq(`${timezone}: paid installment creates no due notification`, installments.some(item => item.id === 'd1:due:2'), false);
}
process.env.TZ = 'America/New_York';
for (const [due, dayBefore, elapsed] of [['2026-03-08', '2026-03-07', 23], ['2026-11-01', '2026-10-31', 25]] as const) {
  const plan = planReminders([debt({ nextDueAt: due })], {}, new Date(2026, 0, 1).getTime(), { ...defaults, hour: 9, minute: 30, leadDays: 1 });
  eq(`DST ${due}: calendar subtraction`, calendarISO(plan[0].when), dayBefore);
  eq(`DST ${due}: same local hour`, plan.map(item => item.when.getHours()), [9, 9]);
  eq(`DST ${due}: actual duration follows timezone`, (plan[1].when.getTime() - plan[0].when.getTime()) / 3600000, elapsed);
}
const earliest = new Date(2027, 0, 1).getTime();
const nearest = planReminders([debt({ id: 'z', nextDueAt: '2027-02-01' }), debt({ id: 'a', nextDueAt: '2027-01-10' })], {}, earliest, { ...defaults, overdueRepeatDays: 1 }).slice(0, MAX_DEBT_REMINDERS);
eq('global pending limit across debts', nearest.length, 60);
eq('global pending entries sorted soonest first', nearest.every((item, i) => i === 0 || nearest[i - 1].when.getTime() <= item.when.getTime()), true);
const collisionPlan = planReminders([debt({ id: 'd1', schedule: [{ index: 0, dueAt: '2027-01-10', remainingAmount: 2, paid: false }] as ScheduleRow[] }), debt({ id: 'd1-0' }), debt({ id: 'd1:due:0' })], {}, earliest);
eq('arbitrary imported IDs never collide with installment keys', new Set(collisionPlan.map(item => item.id)).size, 3);
const preview = reminderContent(nearest[0], false);
eq('visible preview contains owner-requested detail', preview.title.includes('أحمد') && preview.body.includes('12.34') && preview.body.includes('تفاصيل خاصة'), true);
eq('private preview contains no names amounts or notes', JSON.stringify(reminderContent(nearest[0], true)).includes('أحمد') || JSON.stringify(reminderContent(nearest[0], true)).includes('12.34') || JSON.stringify(reminderContent(nearest[0], true)).includes('تفاصيل خاصة'), false);
if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
console.log(`${checks} reminder planning and preferences checks passed.`);
