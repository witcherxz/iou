import { calendarISO, localDate } from './format';
import { fromCents, toCents } from './money';
import { defaultReminderSettings, ReminderSettings } from './reminderSettings';
import type { DebtView } from './selectors';

export const MAX_DEBT_REMINDERS = 60;
export interface PlannedReminder {
  id: string;
  debt: DebtView;
  amount: number;
  when: Date;
  kind: 'before' | 'due' | 'overdue' | 'snooze';
}

const dayNumber = (date: Date) => {
  const utc = new Date(0);
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  utc.setUTCHours(0, 0, 0, 0);
  return utc.getTime() / 86400000;
};
function atTime(date: Date, settings: ReminderSettings, days = 0): Date {
  const when = new Date(date);
  when.setDate(when.getDate() + days);
  when.setHours(settings.hour, settings.minute, 0, 0);
  return when;
}

/**
 * Calendar scheduling stays at the selected local time across DST. Each unpaid
 * installment keeps its due reminder; overdue installments share one follow-up.
 * The native adapter installs only the nearest 60 and rebuilds on app foreground.
 */
export function planReminders(
  debts: DebtView[], prefs: Record<string, boolean>, now = Date.now(), settings = defaultReminderSettings(),
): PlannedReminder[] {
  const result: PlannedReminder[] = [];
  for (const debt of debts) {
    if (debt.paid || debt.voidedAt || debt.dir === 'settle' || !(prefs[debt.id] ?? true)) continue;
    const safeId = encodeURIComponent(debt.id);
    const entries = (debt.schedule
      ? debt.schedule.filter(row => !row.paid).map(row => ({ id: `${safeId}:due:${row.index}`, dueAt: row.dueAt, amount: row.remainingAmount }))
      : [{ id: `${safeId}:due`, dueAt: debt.nextDueAt, amount: debt.rem }])
      .filter(entry => entry.dueAt && entry.amount > 0)
      .map(entry => ({ ...entry, due: localDate(entry.dueAt!) }))
      .filter(entry => Number.isFinite(entry.due.getTime()));
    if (!entries.length) continue;
    const snoozed = Date.parse(settings.snoozedUntil[debt.id] ?? '');
    const snoozeActive = Number.isFinite(snoozed) && snoozed > now;
    const earliest = snoozeActive ? snoozed : now;
    const byTime = new Map<number, PlannedReminder>();
    const add = (item: PlannedReminder) => {
      const stamp = item.when.getTime();
      if (!Number.isFinite(stamp) || stamp <= now || stamp < earliest) return;
      const previous = byTime.get(stamp);
      // Avoid duplicate alerts when a follow-up coincides with an installment.
      if (!previous || item.kind === 'snooze' || item.kind === 'overdue') {
        byTime.set(stamp, { ...item, amount: Math.max(item.amount, previous?.amount ?? 0) });
      }
    };
    for (const entry of entries) {
      if (settings.leadDays > 0) add({ id: `${entry.id}:before`, debt, amount: entry.amount, when: atTime(entry.due, settings, -settings.leadDays), kind: 'before' });
      add({ id: entry.id, debt, amount: entry.amount, when: atTime(entry.due, settings), kind: 'due' });
    }
    if (settings.overdueRepeatDays > 0) {
      const first = entries.reduce((a, b) => a.due.getTime() < b.due.getTime() ? a : b).due;
      const daysSince = dayNumber(new Date(earliest)) - dayNumber(first);
      const interval = settings.overdueRepeatDays;
      let step = Math.max(1, Math.floor(daysSince / interval));
      // Generate enough per debt to select the nearest 60 globally, without
      // iterating through years of old dates for a long-overdue entry.
      for (let count = 0; count < MAX_DEBT_REMINDERS + 1; step++) {
        const when = atTime(first, settings, step * interval);
        if (when.getTime() <= now || when.getTime() < earliest) continue;
        const amount = fromCents(entries.filter(entry => dayNumber(entry.due) <= dayNumber(when)).reduce((sum, entry) => sum + toCents(entry.amount), 0));
        add({ id: `${safeId}:overdue:${calendarISO(when)}`, debt, amount, when, kind: 'overdue' });
        count++;
      }
    }
    if (snoozeActive) add({ id: `${safeId}:snooze`, debt, amount: debt.rem, when: new Date(snoozed), kind: 'snooze' });
    result.push(...byTime.values());
  }
  return result.sort((a, b) => a.when.getTime() - b.when.getTime() || a.id.localeCompare(b.id));
}
