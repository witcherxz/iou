import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { MAX_DEBT_REMINDERS, planReminders } from './reminderPlan';
import { defaultReminderSettings, ReminderSettings } from './reminderSettings';
import { reminderContent } from './reminderContent';
import type { DebtView } from './selectors';

export type ReminderStatus = 'ready' | 'denied' | 'unavailable';
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

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'التذكيرات',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function hasPermission(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

/** Only called after the owner explicitly enables device notifications. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    configure();
    // Android 13+ needs a channel before the permission prompt can appear.
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (hasPermission(current)) return true;
    if (!current.canAskAgain) return false;
    return hasPermission(await Notifications.requestPermissionsAsync());
  } catch {
    return false;
  }
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
      // Cancellation also applies when permission was revoked in system settings.
      await Notifications.cancelAllScheduledNotificationsAsync();
      // Enabling private previews also removes previously delivered details.
      if (settings.privateNotifications) await Notifications.dismissAllNotificationsAsync();
      if (!hasPermission(permission)) return 'denied';
      await ensureChannel();
      // Leave room beneath iOS's pending-notification limit for the weekly reminder.
      for (const item of planReminders(debts, prefs, Date.now(), settings).slice(0, MAX_DEBT_REMINDERS)) {
        if (requestedRevision !== revision) return lastStatus;
        await Notifications.scheduleNotificationAsync({
          identifier: `iou-${item.id}`,
          content: {
            ...reminderContent(item, settings.privateNotifications),
            data: { debtId: item.debt.id },
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
