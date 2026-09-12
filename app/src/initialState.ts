import { PersistedState } from './types';
import { DEFAULT_ACCENT } from './theme';
import { defaultReminderSettings } from './reminderSettings';

/** Defaults for a new installation. Saved ledgers are loaded before these are used. */
export function emptyState(): PersistedState {
  return {
    version: 3,
    onboarded: false,
    profileName: 'دفتري',
    people: [],
    tx: [],
    changes: [],
    reminderSettings: defaultReminderSettings(),
    reminderPrefs: {},
    weekly: true,
    autoBackup: true,
    backupWritePaused: false,
    backupTarget: 'none',
    backupFolderUri: null,
    dark: null,
    accent: DEFAULT_ACCENT,
    lastBackup: null,
  };
}
