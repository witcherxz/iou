import { fmt } from './format';
import type { PlannedReminder } from './reminderPlan';

/** Keep private notification payloads free of names, notes and amounts. */
export function reminderContent(item: PlannedReminder, privateNotifications: boolean): { title: string; body: string } {
  if (privateNotifications) return { title: 'تذكير من الدفتر', body: 'افتح الدفتر لمراجعة التذكير.' };
  const timing = item.kind === 'before' ? 'استحقاق قريب' : item.kind === 'overdue' ? 'متابعة متأخر' : item.kind === 'snooze' ? 'تذكير مؤجل' : 'موعد الاستحقاق';
  return {
    title: item.debt.dir === 'me' ? `متابعة ${item.debt.personName}` : `سداد ${item.debt.personName}`,
    body: `${timing} · ${fmt(item.amount)} ر.س${item.debt.note ? ` · ${item.debt.note}` : ''}`,
  };
}
