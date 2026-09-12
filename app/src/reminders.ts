import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { fmt } from './format';
import { DebtView } from './selectors';

// Reminders are private to the owner of the book — nothing is ever sent to the
// other party, which is what the reminders screen promises.

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

export async function ensurePermission(): Promise<boolean> {
  try {
    configure();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

const CHANNEL_ID = 'iou-reminders';

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'التذكيرات',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** 8pm on the debt's due date, or null when that moment has already passed. */
function triggerFor(dueAt: string | null | undefined): Date | null {
  if (!dueAt) return null;
  const when = new Date(dueAt);
  when.setHours(20, 0, 0, 0);
  return when.getTime() > Date.now() ? when : null;
}

/**
 * Rebuilds the whole schedule from the enabled debts. Cheaper and far less
 * error-prone than tracking individual notification ids across edits.
 */
export async function syncReminders(
  debts: DebtView[],
  prefs: Record<string, boolean>,
  weekly: boolean,
): Promise<void> {
  try {
    configure();
    const granted = await ensurePermission();
    if (!granted) return;
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const d of debts) {
      if (d.paid || !(prefs[d.id] ?? true)) continue;
      const when = triggerFor(d.dueAt);
      if (!when) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: d.dir === 'me' ? `متابعة ${d.personName}` : `سداد ${d.personName}`,
          body: `${fmt(d.rem)} ر.س · ${d.note ?? ''}`.trim(),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: CHANNEL_ID,
        },
      });
    }

    if (weekly) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'تذكير أسبوعي', body: 'راجع دفتر الديون' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 5, // Thursday (1 = Sunday)
          hour: 20,
          minute: 0,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch {
    /* notifications unavailable (e.g. Expo Go limitations) — reminders stay UI-only */
  }
}
