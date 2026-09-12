import { addDays, todayISO } from '../src/format';
import { syncReminders, ensurePermission } from '../src/reminders';
import { defaultReminderSettings } from '../src/reminderSettings';
import type { DebtView } from '../src/selectors';
import { notificationHarness as h, Platform } from './reminder-notifications-stub';

let checks = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const debt = { id: 'd1', personId: 'p1', personName: 'PRIVATE NAME', dir: 'me', amount: 15, rem: 15, createdAt: todayISO(), nextDueAt: addDays(todayISO(), 5), note: 'PRIVATE NOTE', paid: false, schedule: null } as DebtView;
const settings = { ...defaultReminderSettings(), hour: 9, minute: 15, leadDays: 3, weeklyDay: 2, overdueRepeatDays: 1 };
async function run() {
  eq('native schedule ready', await syncReminders([debt], {}, true, settings), 'ready');
  eq('native schedules bounded to 60 plus weekly', h.scheduled.size, 61);
  const week = h.scheduled.get('iou-weekly')!;
  eq('native weekly selected day and time', [week.trigger.weekday, week.trigger.hour, week.trigger.minute], [2, 9, 15]);
  eq('one-off triggers use Expo DATE type', [...h.scheduled.values()].filter(item => item.identifier !== 'iou-weekly').every(item => item.trigger.type === 'date' && item.trigger.date instanceof Date), true);

  h.calls = [];
  await syncReminders([debt], {}, false, { ...settings, privateNotifications: true });
  eq('private rebuild removes previously delivered details', h.calls.includes('dismiss'), true);
  eq('private rebuild contains no names or notes', [...h.scheduled.values()].some(item => JSON.stringify(item.content).includes('PRIVATE')), false);
  eq('disabling weekly removes stale weekly schedule', h.scheduled.has('iou-weekly'), false);
  await syncReminders([debt], { d1: false }, false, settings);
  eq('disabling debt cancels its schedules', h.scheduled.size, 0);
  await syncReminders([{ ...debt, paid: true, rem: 0 }], {}, false, settings);
  eq('closed debt cancels its schedules', h.scheduled.size, 0);

  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  h.gate = async () => { entered(); await held; };
  const old = syncReminders([debt], {}, true, settings);
  await enteredPromise;
  const latest = syncReminders([debt], { d1: false }, true, { ...settings, hour: 22, minute: 45, weeklyDay: 6 });
  release();
  await Promise.all([old, latest]);
  eq('newest rebuild wins after interrupted older scheduling', h.scheduled.size, 1);
  eq('newest rebuild keeps latest settings', [h.scheduled.get('iou-weekly')?.trigger.weekday, h.scheduled.get('iou-weekly')?.trigger.hour, h.scheduled.get('iou-weekly')?.trigger.minute], [6, 22, 45]);

  h.permission = { granted: false, canAskAgain: false };
  eq('revoked permission returns denied', await syncReminders([debt], {}, true, settings), 'denied');
  eq('revoked permission cancels stale schedules', h.scheduled.size, 0);
  h.calls = [];
  eq('permission not reprompted if system disallows', await ensurePermission(), false);
  eq('permission request skipped when unavailable', h.calls.includes('request'), false);
  h.permission = { granted: false, canAskAgain: true };
  h.calls = [];
  eq('explicit enable requests notification permission', await ensurePermission(), true);
  eq('Android channel precedes permission request', h.calls.indexOf('channel') < h.calls.indexOf('request'), true);
  h.failOnSchedule = true;
  eq('native scheduling errors surfaced', await syncReminders([debt], {}, true, settings), 'unavailable');
  eq('failed native batch leaves no partial schedules', h.scheduled.size, 0);
  h.failOnSchedule = false;
  h.failOnCancel = true;
  eq('cancellation errors surfaced', await syncReminders([], {}, false, settings), 'unavailable');
  h.failOnCancel = false;
  eq('queue recovers after native failures', await syncReminders([debt], {}, false, defaultReminderSettings()), 'ready');
  Platform.OS = 'ios';
  h.permission = { granted: false, canAskAgain: false, ios: { status: 3 } };
  eq('iOS provisional permission is usable', await syncReminders([debt], {}, false, defaultReminderSettings()), 'ready');
  Platform.OS = 'web'; h.calls = [];
  eq('web explicitly unavailable', await syncReminders([debt], {}, true, settings), 'unavailable');
  eq('web never touches native scheduling', h.calls.length, 0);
  eq('web never prompts native permission', await ensurePermission(), false);
  console.log(`${checks} native reminder adapter checks passed.`);
}
run().catch(error => { console.error(error); throw error; });
