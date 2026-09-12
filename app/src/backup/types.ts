import { BackupTarget, PersistedState } from '../types';

export type { BackupTarget };

export const TARGET_LABELS: Record<BackupTarget, string> = {
  none: 'لم يتم الإعداد',
  folder: 'مجلد على الجهاز',
  file: 'ملف (تصدير يدوي)',
  drive: 'Google Drive',
};

/** Targets that can be written to without user interaction. */
export const AUTOMATIC_TARGETS: BackupTarget[] = ['folder', 'drive'];

export interface BackupPayload extends PersistedState {
  backedUpAt: string;
}

export function serialize(state: PersistedState): string {
  const payload: BackupPayload = { ...state, backedUpAt: new Date().toISOString() };
  return JSON.stringify(payload);
}

export class InvalidBackupError extends Error {
  constructor() {
    super('Not an IoU backup file');
    this.name = 'InvalidBackupError';
  }
}

/** Parses and sanity-checks a backup file before it is allowed to replace the ledger. */
export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidBackupError();
  }
  if (!raw || typeof raw !== 'object') throw new InvalidBackupError();
  const candidate = raw as Partial<BackupPayload>;
  if (!Array.isArray(candidate.people) || !Array.isArray(candidate.tx)) throw new InvalidBackupError();
  return candidate as BackupPayload;
}
