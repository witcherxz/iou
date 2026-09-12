/** Native notification boundary used only by reminder-adapter-checks.ts. */
export const Platform = { OS: 'android' };
export const AndroidImportance = { DEFAULT: 3 };
export const IosAuthorizationStatus = { PROVISIONAL: 3, EPHEMERAL: 4 };
export const SchedulableTriggerInputTypes = { DATE: 'date', WEEKLY: 'weekly' };
export const notificationHarness = {
  calls: [] as string[],
  permission: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain: boolean; ios?: { status: number } },
  requested: { granted: true, canAskAgain: true },
  scheduled: new Map<string, { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }>(),
  gate: null as null | (() => Promise<void>),
  failOnSchedule: false,
  failOnCancel: false,
};
export function setNotificationHandler() { notificationHarness.calls.push('handler'); }
export async function setNotificationChannelAsync() { notificationHarness.calls.push('channel'); }
export async function getPermissionsAsync() { notificationHarness.calls.push('permission'); return notificationHarness.permission; }
export async function requestPermissionsAsync() { notificationHarness.calls.push('request'); notificationHarness.permission = notificationHarness.requested; return notificationHarness.requested; }
export async function cancelAllScheduledNotificationsAsync() {
  notificationHarness.calls.push('cancel');
  if (notificationHarness.failOnCancel) throw new Error('cancel failed');
  notificationHarness.scheduled.clear();
}
export async function dismissAllNotificationsAsync() { notificationHarness.calls.push('dismiss'); }
export async function scheduleNotificationAsync(item: { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }) {
  notificationHarness.calls.push('schedule');
  const gate = notificationHarness.gate; notificationHarness.gate = null;
  if (gate) await gate();
  if (notificationHarness.failOnSchedule) throw new Error('schedule failed');
  notificationHarness.scheduled.set(item.identifier, item);
}
