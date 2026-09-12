import { planReminders } from './reminderPlan';
import { reminderContent } from './reminderContent';
import type { ReminderSettings } from './reminderSettings';
import type { DebtView } from './selectors';

export const MAX_REMINDER_CATCH_UP_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingRequest {
  identifier: string;
  content: { title?: string | null; body?: string | null; data?: Record<string, unknown> | null };
  trigger: unknown;
}

/** Expo Android returns DATE triggers as { type: 'date', value: epochMillis }. */
export function pendingReminderTime(request: PendingRequest): number | null {
  const trigger = request.trigger;
  if (trigger && typeof trigger === 'object' && 'type' in trigger && trigger.type === 'date') {
    const t = trigger as { value?: unknown; date?: unknown };
    const value = t.value ?? t.date;
    const stamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : NaN;
    if (Number.isFinite(stamp)) return stamp;
  }
  // iOS returns its native interval/calendar trigger. Keep the original instant
  // in our own payload so rebuilding does not depend on platform serialization.
  const plannedAt = request.content.data?.plannedAt;
  if (typeof plannedAt !== 'string') return null;
  const stamp = Date.parse(plannedAt);
  return Number.isFinite(stamp) ? stamp : null;
}

/**
 * A pending inexact alarm may be due but not delivered yet. A bounded catch-up
 * is allowed only when the current ledger, preferences, time and visible content
 * still match. It never invents a reminder absent from native pending storage.
 */
export function isCurrentDelayedReminder(
  request: PendingRequest, debts: DebtView[], prefs: Record<string, boolean>, settings: ReminderSettings, now: number,
): boolean {
  if (!request.identifier.startsWith('iou-')) return false;
  const stamp = pendingReminderTime(request);
  if (stamp === null || stamp > now || now - stamp > MAX_REMINDER_CATCH_UP_AGE_MS) return false;
  const debtId = request.content.data?.debtId;
  const debt = debts.find(item => item.id === debtId);
  if (!debt) return false;
  const expected = planReminders([debt], prefs, stamp - 1, settings)
    .find(item => `iou-${item.id}` === request.identifier && item.when.getTime() === stamp);
  if (!expected) return false;
  const content = reminderContent(expected, settings.privateNotifications);
  return request.content.title === content.title && request.content.body === content.body;
}
