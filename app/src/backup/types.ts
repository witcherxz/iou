import { BackupTarget, PersistedState } from '../types';
import { isLedgerDate, validateState } from '../validation';

export type { BackupTarget };

export const TARGET_LABELS: Record<BackupTarget, string> = {
  none: 'لم يتم الإعداد',
  folder: 'مجلد على الجهاز',
  file: 'ملف (تصدير يدوي)',
  drive: 'Google Drive',
};

export const AUTOMATIC_TARGETS: BackupTarget[] = ['folder', 'drive'];
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** Only portable ledger data and preferences belong in a shared backup. */
export type BackupData = Pick<PersistedState,
  'version' | 'profileName' | 'people' | 'tx' | 'changes' | 'reminderPrefs' | 'reminderSettings' | 'weekly' | 'dark' | 'accent'>;

export interface BackupPayload extends BackupData {
  backedUpAt: string;
}

export function portableData(state: BackupData): BackupData {
  return {
    version: state.version,
    profileName: state.profileName,
    people: state.people,
    tx: state.tx,
    changes: state.changes,
    reminderPrefs: state.reminderPrefs,
    reminderSettings: state.reminderSettings,
    weekly: state.weekly,
    dark: state.dark,
    accent: state.accent,
  };
}

/** Stable across backup status/destination changes, without the export timestamp. */
export const backupFingerprint = (state: BackupData): string => JSON.stringify(portableData(state));

export function serialize(state: PersistedState): string {
  const payload: BackupPayload = {
    ...portableData(validateState(portableData(state))),
    backedUpAt: new Date().toISOString(),
  };
  const text = JSON.stringify(payload);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new InvalidBackupError();
  return text;
}

export class InvalidBackupError extends Error {
  constructor() {
    super('Not a valid IoU backup file');
    this.name = 'InvalidBackupError';
  }
}

export function isBackupTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.includes('T') && isLedgerDate(value);
}

/** Validate the entire ledger before any replacement, including legacy v1 exports. */
export function parseBackup(text: string): BackupPayload {
  try {
    if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new InvalidBackupError();
    const raw: unknown = JSON.parse(text.trimStart());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidBackupError();
    const candidate = raw as BackupPayload;
    if (!isBackupTimestamp(candidate.backedUpAt)) throw new InvalidBackupError();
    // Whitelist before validation: old exports may contain another device's URI/settings.
    const validated = validateState(portableData(candidate));
    return { ...portableData(validated), backedUpAt: candidate.backedUpAt };
  } catch {
    throw new InvalidBackupError();
  }
}

export function restoredState(
  current: PersistedState, payload: BackupPayload, source: BackupTarget = current.backupTarget,
): PersistedState {
  return validateState({
    ...current,
    ...portableData(payload),
    onboarded: true,
    // Restore establishes the existing remote copy without triggering an upload.
    lastBackup: source === current.backupTarget && AUTOMATIC_TARGETS.includes(source) ? payload.backedUpAt : null,
  });
}
