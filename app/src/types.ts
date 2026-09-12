export type BackupTarget = 'none' | 'folder' | 'file' | 'drive';

export type Dir = 'me' | 'owe' | 'settle' | 'forgive';

export interface Person {
  id: string;
  name: string;
  /** Hue (0-360) used to derive the avatar colours. */
  hue: number;
}

export interface Installment {
  amount: number;
  label: string;
  /** ISO date. */
  dueAt: string;
}

export interface Tx {
  id: string;
  personId: string;
  dir: Dir;
  amount: number;
  /** Actual calendar date of the debt, payment or forgiveness. */
  createdAt: string;
  /** When this entry was first saved; separate from the transaction date. */
  recordedAt?: string;
  /** Undone entries stay in the ledger for review but never affect balances. */
  voidedAt?: string;
  note?: string;
  /** ISO date, or null for "no due date". Absent on payments and forgiveness. */
  dueAt?: string | null;
  installments?: Installment[];
  freq?: 'month';
  /** Set on payments/forgiveness: the debt whose outstanding amount is reduced. */
  debtId?: string;
}

export interface LedgerChange {
  id: string;
  txId: string;
  at: string;
  kind: 'edit' | 'void' | 'restore';
  before: Tx;
  after: Tx;
}

export interface ReminderPrefs {
  /** Debt id → enabled. Reminders are derived from open debts. */
  [debtId: string]: boolean;
}

export interface PersistedState {
  version: 3;
  onboarded: boolean;
  profileName: string;
  people: Person[];
  tx: Tx[];
  changes: LedgerChange[];
  reminderPrefs: ReminderPrefs;
  reminderSettings: ReminderSettings;
  weekly: boolean;
  autoBackup: boolean;
  /** Local backup/recovery pause; cleared by a successful manual save or destination change. */
  backupWritePaused: boolean;
  backupTarget: BackupTarget;
  /** Folder URI when backupTarget is 'folder'. */
  backupFolderUri: string | null;
  dark: boolean | null;
  accent: string;
  lastBackup: string | null;
}
import type { ReminderSettings } from './reminderSettings';

export type Debt = Tx & { dir: 'me' | 'owe' };
export type Reduction = Tx & { dir: 'settle' | 'forgive'; debtId: string };

export function isDebt(tx: Tx): tx is Debt {
  return tx.dir === 'me' || tx.dir === 'owe';
}

export function isReduction(tx: Tx): tx is Reduction {
  return tx.dir === 'settle' || tx.dir === 'forgive';
}
