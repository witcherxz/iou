import { isCalendarDate } from './format';

/** Portable reminder preferences; times use the device's current local timezone. */
export interface ReminderSettings {
  hour: number;
  minute: number;
  /** An extra reminder this many calendar days before each due date. 0 disables it. */
  leadDays: number;
  /** Expo weekdays: 1 = Sunday, 7 = Saturday. */
  weeklyDay: number;
  /** Calendar days between overdue follow-ups. 0 disables them. */
  overdueRepeatDays: number;
  privateNotifications: boolean;
  /** Debt id → absolute timestamp when its snooze ends. */
  snoozedUntil: Record<string, string>;
}

export const defaultReminderSettings = (): ReminderSettings => ({
  hour: 20, minute: 0, leadDays: 0, weeklyDay: 5, overdueRepeatDays: 0,
  privateNotifications: false, snoozedUntil: {},
});

const invalid = (): never => { throw new Error('بيانات الدفتر غير صالحة: إعدادات التذكير'); };
const integer = (value: unknown, min: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : invalid();

/** Missing legacy settings get defaults; malformed present settings are rejected. */
export function validateReminderSettings(value: unknown, debtIds?: Set<string>): ReminderSettings {
  if (value === undefined) return defaultReminderSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const s = value as Record<string, unknown>;
  if (typeof s.privateNotifications !== 'boolean' || !s.snoozedUntil || typeof s.snoozedUntil !== 'object' || Array.isArray(s.snoozedUntil)) return invalid();
  const snoozedUntil: Record<string, string> = {};
  for (const [id, stamp] of Object.entries(s.snoozedUntil)) {
    if (!id.trim() || ['__proto__', 'constructor', 'prototype'].includes(id) ||
      typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(stamp) ||
      !isCalendarDate(stamp.slice(0, 10)) || !Number.isFinite(Date.parse(stamp))) return invalid();
    if (!debtIds || debtIds.has(id)) snoozedUntil[id] = new Date(stamp).toISOString();
  }
  return {
    hour: integer(s.hour, 0, 23), minute: integer(s.minute, 0, 59),
    leadDays: integer(s.leadDays, 0, 30), weeklyDay: integer(s.weeklyDay, 1, 7),
    overdueRepeatDays: integer(s.overdueRepeatDays, 0, 30),
    privateNotifications: s.privateNotifications, snoozedUntil,
  };
}

export function reminderTime(settings: Pick<ReminderSettings, 'hour' | 'minute'>): string {
  return `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`;
}

export function parseReminderTime(value: string): { hour: number; minute: number } | null {
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value.trim())) return null;
  const [hour, minute] = value.trim().split(':').map(Number);
  return { hour, minute };
}

/** Snooze until the chosen reminder time on a later local calendar day. */
export function snoozeDebt(settings: ReminderSettings, debtId: string, days: number, now = Date.now()): ReminderSettings {
  const when = new Date(now);
  when.setDate(when.getDate() + days);
  when.setHours(settings.hour, settings.minute, 0, 0);
  return { ...settings, snoozedUntil: { ...settings.snoozedUntil, [debtId]: when.toISOString() } };
}

export function clearSnooze(settings: ReminderSettings, debtId: string): ReminderSettings {
  const snoozedUntil = { ...settings.snoozedUntil };
  delete snoozedUntil[debtId];
  return { ...settings, snoozedUntil };
}
