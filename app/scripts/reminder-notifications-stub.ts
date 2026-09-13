/** Native notification boundary used only by reminder-adapter-checks.ts. */
export const Platform = { OS: 'android', Version: 36 };
export const Linking = { openSettings: async () => { notificationHarness.calls.push('openSettings'); } };
export const AndroidImportance = { DEFAULT: 5, NONE: 2 };
export const IosAuthorizationStatus = { DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 };
export const SchedulableTriggerInputTypes = { DATE: 'date', WEEKLY: 'weekly' };
export const notificationHarness = {
  calls: [] as string[],
  permission: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain: boolean; status?: string; ios?: { status: number } },
  requested: { granted: true, canAskAgain: true },
  scheduled: new Map<string, { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }>(),
  delivered: new Map<string, { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }>(),
  gate: null as null | (() => Promise<void>),
  failOnSchedule: false,
  channelImportance: AndroidImportance.DEFAULT,
  channelMissing: false,
  failOnCancel: false,
};
export function setNotificationHandler() { notificationHarness.calls.push('handler'); }
export async function setNotificationChannelAsync() {
  notificationHarness.calls.push('channel');
  return notificationHarness.channelMissing ? null : { id: 'iou-reminders', importance: notificationHarness.channelImportance };
}
export async function getNotificationChannelAsync() {
  notificationHarness.calls.push('getChannel');
  return notificationHarness.channelMissing ? null : { id: 'iou-reminders', importance: notificationHarness.channelImportance };
}
export async function getAllScheduledNotificationsAsync() {
  notificationHarness.calls.push('getScheduled');
  return [...notificationHarness.scheduled.values()].map(item => ({ ...item, trigger: item.trigger.date instanceof Date ? { type: 'date', value: item.trigger.date.getTime(), channelId: item.trigger.channelId } : item.trigger }));
}
export async function cancelScheduledNotificationAsync(id: string) {
  notificationHarness.calls.push(`cancel:${id}`);
  if (notificationHarness.failOnCancel) throw new Error('cancel failed');
  notificationHarness.scheduled.delete(id);
}
export async function getPermissionsAsync() { notificationHarness.calls.push('permission'); return notificationHarness.permission; }
export async function requestPermissionsAsync() { notificationHarness.calls.push('request'); notificationHarness.permission = notificationHarness.requested; return notificationHarness.requested; }
export async function cancelAllScheduledNotificationsAsync() {
  notificationHarness.calls.push('cancel');
  if (notificationHarness.failOnCancel) throw new Error('cancel failed');
  notificationHarness.scheduled.clear();
}
export async function dismissAllNotificationsAsync() { notificationHarness.calls.push('dismiss'); notificationHarness.delivered.clear(); }
export async function scheduleNotificationAsync(item: { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }) {
  notificationHarness.calls.push('schedule');
  const gate = notificationHarness.gate; notificationHarness.gate = null;
  if (gate) await gate();
  if (notificationHarness.failOnSchedule) throw new Error('schedule failed');
  if (!item.trigger.type && item.trigger.channelId) {
    notificationHarness.delivered.set(item.identifier, item);
    return;
  }
  notificationHarness.scheduled.set(item.identifier, item);
}
