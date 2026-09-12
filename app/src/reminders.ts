import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { MAX_DEBT_REMINDERS, planReminders } from './reminderPlan';
import { defaultReminderSettings, ReminderSettings } from './reminderSettings';
import { reminderContent } from './reminderContent';
import { isCurrentDelayedReminder, pendingReminderTime } from './pendingReminders';
import type { DebtView } from './selectors';

export type ReminderStatus = 'ready' | 'denied' | 'blocked' | 'unavailable';
const CHANNEL_ID = 'iou-reminders';
let configured = false;

function configure() {
  if (configured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  configured = true;
}

async function ensureChannel(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const channel = await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'التذكيرات',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  // Channel APIs are absent before Android 8. Expo returns the actual saved
  // channel, including the user's block; recreating it cannot override them.
  if (Number(Platform.Version) < 26) return true;
  if (!channel) throw new Error('Notification channel unavailable');
  return channel.importance !== Notifications.AndroidImportance.NONE;
}

function hasPermission(status: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === 'ios' && status.ios) {
    return status.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      status.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      status.ios.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
  }
  // Expo Android can report granted POST_NOTIFICATIONS together with a denied
  // overall status when the system has disabled this app's notifications.
  return status.status !== 'denied' && status.granted;
}

/** Only called after the owner explicitly enables device notifications. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    configure();
    // Android 13+ needs a channel before the permission prompt can appear.
    const channelEnabled = await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (hasPermission(current)) return channelEnabled;
    if (!current.canAskAgain) return false;
    return channelEnabled && hasPermission(await Notifications.requestPermissionsAsync());
  } catch {
    return false;
  }
}

export async function openReminderSettings(): Promise<void> {
  if (Platform.OS !== 'web') await Linking.openSettings();
}

let tail: Promise<ReminderStatus> = Promise.resolve('unavailable');
let revision = 0;
let lastStatus: ReminderStatus = 'unavailable';

/** Serialize rebuilds so a slower older edit cannot resurrect cancelled reminders. */
export function syncReminders(
  debts: DebtView[], prefs: Record<string, boolean>, weekly: boolean, settings: ReminderSettings = defaultReminderSettings(),
): Promise<ReminderStatus> {
  const requestedRevision = ++revision;
  const task = tail.then(async (): Promise<ReminderStatus> => {
    if (requestedRevision !== revision) return lastStatus;
    if (Platform.OS === 'web') return 'unavailable';
    try {
      configure();
      const permission = await Notifications.getPermissionsAsync();
      // Enabling private previews also removes previously delivered details.
      if (settings.privateNotifications) await Notifications.dismissAllNotificationsAsync();
      if (!hasPermission(permission)) {
        await Notifications.cancelAllScheduledNotificationsAsync();
        return permission.canAskAgain ? 'denied' : 'blocked';
      }
      if (!await ensureChannel()) {
        await Notifications.cancelAllScheduledNotificationsAsync();
        return 'blocked';
      }
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      const now = Date.now();
      const delayed = pending.filter(request => isCurrentDelayedReminder(request, debts, prefs, settings, now))
        .sort((a, b) => pendingReminderTime(a)! - pendingReminderTime(b)!).slice(0, MAX_DEBT_REMINDERS);
      // Past requests may survive in Expo's store after Android force-stop even
      // though AlarmManager lost their PendingIntents. Do not retain dead rows.
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const request of delayed) {
        if (requestedRevision !== revision) return lastStatus;
        await Notifications.scheduleNotificationAsync({
          identifier: request.identifier,
          content: {
            title: request.content.title ?? undefined,
            body: request.content.body ?? undefined,
            data: { debtId: request.content.data?.debtId, plannedAt: new Date(pendingReminderTime(request)!).toISOString() },
          },
          // Channel-only triggers present once immediately and are not persisted
          // in the scheduled queue. The same ID cannot create two tray entries.
          trigger: { channelId: CHANNEL_ID },
        });
      }
      // Reinstall future alarms even if unchanged: Android force-stop can clear
      // AlarmManager while Expo's stored requests still exist at the next launch.
      // Leave room beneath iOS's pending-notification limit for the weekly reminder.
      for (const item of planReminders(debts, prefs, now, settings).slice(0, MAX_DEBT_REMINDERS)) {
        if (requestedRevision !== revision) return lastStatus;
        await Notifications.scheduleNotificationAsync({
          identifier: `iou-${item.id}`,
          content: {
            ...reminderContent(item, settings.privateNotifications),
            data: { debtId: item.debt.id, plannedAt: item.when.toISOString() },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.when, channelId: CHANNEL_ID },
        });
      }
      if (weekly && requestedRevision === revision) {
        await Notifications.scheduleNotificationAsync({
          identifier: 'iou-weekly',
          content: { title: 'تذكير أسبوعي', body: 'راجع دفتر الديون' },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: settings.weeklyDay, hour: settings.hour, minute: settings.minute, channelId: CHANNEL_ID,
          },
        });
      }
      return 'ready';
    } catch {
      // A partially installed batch must not keep stale amounts or schedules.
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
      return 'unavailable';
    }
  }).then(status => { lastStatus = status; return status; });
  tail = task;
  return task;
}
