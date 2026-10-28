import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface ReminderHealth {
  /** Reminders use exact alarms rather than ones the system may postpone. */
  exactAlarms: boolean;
  /** Exempt from battery optimisation, so Doze and app standby cannot hold reminders back. */
  batteryUnrestricted: boolean;
  /** Android app standby bucket: 10 active … 40 rare, 45 restricted. */
  standbyBucket: number;
}

interface NativeHealth {
  status(): Promise<ReminderHealth>;
  requestBatteryUnrestricted(): Promise<void>;
}

const native = () => Platform.OS === 'android' ? requireOptionalNativeModule<NativeHealth>('IouReminderHealth') : null;

/** Null where the platform has no such controls (iOS, web) or the module is absent. */
export async function readReminderHealth(): Promise<ReminderHealth | null> {
  try { return await native()?.status() ?? null; } catch { return null; }
}

export async function requestBatteryUnrestricted(): Promise<void> {
  const module = native();
  if (!module) throw new Error('Battery settings unavailable');
  await module.requestBatteryUnrestricted();
}
