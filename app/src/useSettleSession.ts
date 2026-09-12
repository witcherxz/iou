import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { todayISO } from './format';

export type SettlementMode = 'full' | 'partial';
export type PaymentDirection = 'me' | 'owe';
export type EntryKind = 'payment' | 'forgiveness';

/** Private in-memory draft and receipt; never part of persisted ledger data. */
export interface SettleDraft {
  kind: EntryKind;
  mode: SettlementMode;
  raw: string;
  dir: PaymentDirection;
  transactionDate: string;
  note: string;
  saving: boolean;
  error: string;
  result: { amount: number; remaining: number; dir: PaymentDirection; kind: EntryKind } | null;
}

export function createSettleDraft(mode: SettlementMode = 'full', kind: EntryKind = 'payment', raw = '', dir: PaymentDirection = 'me'): SettleDraft {
  return { mode, kind, raw, dir, transactionDate: todayISO(), note: '', saving: false, error: '', result: null };
}

/** Mount above PrivacyGate so hiding the form cannot change what is submitted. */
export function useSettleSession() {
  const [session, setSession] = useState(() => ({ id: 0, draft: createSettleDraft() }));
  const start = useCallback((mode: SettlementMode = 'full', kind: EntryKind = 'payment', raw = '', dir: PaymentDirection = 'me') => {
    setSession(current => ({ id: current.id + 1, draft: createSettleDraft(mode, kind, raw, dir) }));
  }, []);
  const clear = useCallback(() => start(), [start]);
  // A completion from an explicitly closed session cannot alter a new form.
  const updateDraft: Dispatch<SetStateAction<SettleDraft>> = useCallback(update => {
    setSession(current => current.id !== session.id ? current : {
      ...current, draft: typeof update === 'function' ? update(current.draft) : update,
    });
  }, [session.id]);
  return { ...session, start, clear, updateDraft };
}
