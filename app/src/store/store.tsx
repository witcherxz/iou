import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEY, STORAGE_RECOVERY_KEY } from '../config/app';
import { AddDebtInput, createDebt, createForgiveness, createSettlements, editEntry, EntryPatch, isDebt, remainingCents, restoreEntry, undoEntryEdit, voidEntry } from '../ledger';
import { fromCents, toCents } from '../money';
import { emptyState } from '../initialState';
import { personNameError, renamePerson as renamePersonInState } from '../people';
import { PersistedState } from '../types';
import { validateState } from '../validation';
import { createWriteQueue, readInitialLedger } from './persistence';
import { availableLocalHistory, keepLocalSnapshot, LocalSnapshot } from './history';

let idSequence = 0;
const newId = () => `${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

interface Store {
  state: PersistedState;
  ready: boolean;
  storageError: string | null;
  recoveryNotice: string | null;
  retryLoad: () => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
  addPerson: (name: string) => string;
  renamePerson: (personId: string, name: string) => boolean;
  addDebt: (input: AddDebtInput) => boolean;
  /** Pays one debt, or oldest-first in an explicitly selected direction. */
  settle: (personId: string, amount: number, debtId?: string | null, dir?: 'me' | 'owe', transactionDate?: string, note?: string) => number;
  /** Records debt forgiveness separately from money received or paid. */
  forgive: (personId: string, amount: number, debtId?: string | null, dir?: 'me' | 'owe', transactionDate?: string, note?: string) => number;
  updateEntry: (txId: string, patch: EntryPatch) => boolean;
  cancelEntry: (txId: string) => boolean;
  reinstateEntry: (txId: string) => boolean;
  revertEntryEdit: (txId: string) => boolean;
  listRecoverySnapshots: () => Promise<LocalSnapshot[]>;
  markPaid: (debtId: string) => boolean;
  toggleReminder: (debtId: string, on: boolean) => void;
  set: (patch: Partial<PersistedState>) => void;
  replaceAll: (next: PersistedState) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(emptyState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  const mounted = useRef(true);
  const loadingGeneration = useRef(0);
  const savedJSON = useRef<string | null>(null);
  const restoring = useRef(false);
  const writeFailed = useRef(false);
  const enqueue = useRef(createWriteQueue());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const publish = useCallback((next: PersistedState) => {
    current.current = next;
    if (mounted.current) setState(next);
  }, []);

  const persist = useCallback((next: PersistedState): Promise<void> => {
    const json = JSON.stringify(next);
    return enqueue.current(async () => {
      if (savedJSON.current !== json) {
        // Keep the preceding valid ledger for recovery. Never rotate unread or malformed data.
        if (savedJSON.current) {
          await keepLocalSnapshot(AsyncStorage, savedJSON.current, json);
          await AsyncStorage.setItem(STORAGE_RECOVERY_KEY, savedJSON.current);
        }
        await AsyncStorage.setItem(STORAGE_KEY, json);
        savedJSON.current = json;
      }
      writeFailed.current = false;
      if (mounted.current) setStorageError(null);
    }).catch(error => {
      writeFailed.current = true;
      if (mounted.current) setStorageError('تعذّر حفظ التغييرات على الجهاز. أبقِ التطبيق مفتوحاً وأعد المحاولة أو صدّر نسخة احتياطية.');
      throw error;
    });
  }, []);

  const retryLoad = useCallback(async () => {
    if (loaded.current) {
      // A failed write must retry the live ledger, never reload older disk data.
      try { await persist(current.current); } catch { /* status stays visible */ }
      return;
    }
    const generation = ++loadingGeneration.current;
    setReady(false);
    setStorageError(null);
    try {
      const result = await readInitialLedger(AsyncStorage);
      if (!mounted.current || generation !== loadingGeneration.current) return;
      // Review an older fallback before allowing it to overwrite an external
      // backup. Hydration remains read-only; the next normal save persists this
      // pause so restarting after an edit cannot silently resume automatic writes.
      const next = result.recovered ? { ...result.state, backupWritePaused: true } : result.state;
      // Recovery does not imply the primary has this content. Force the next save,
      // even if an imported snapshot is identical, while keeping recovery untouched.
      savedJSON.current = !result.isNew && !result.recovered ? JSON.stringify(result.state) : null;
      setRecoveryNotice(result.recovered ? 'تم استرجاع نسخة محلية سابقة لتعذّر قراءة النسخة الأحدث. قد تكون أحدث العمليات مفقودة؛ راجع الدفتر أو استعد نسخة احتياطية أحدث.' : null);
      loaded.current = true;
      publish(next);
    } catch {
      if (mounted.current && generation === loadingGeneration.current) {
        setStorageError('تعذّرت قراءة الدفتر المحفوظ. بياناتك الأصلية لم تُستبدل. أعد المحاولة أو استعد نسخة احتياطية.');
      }
    } finally {
      if (mounted.current && generation === loadingGeneration.current) setReady(true);
    }
  }, [persist, publish]);

  useEffect(() => {
    mounted.current = true;
    void retryLoad();
    return () => {
      mounted.current = false;
      loadingGeneration.current++;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [retryLoad]);

  const commit = useCallback((next: PersistedState): boolean => {
    if (!loaded.current || restoring.current || writeFailed.current) return false;
    try {
      const valid = validateState(next);
      publish(valid);
      void persist(valid).catch(() => {});
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تسجيل العملية');
      return false;
    }
  }, [persist, publish, showToast]);

  const set = useCallback((patch: Partial<PersistedState>) => {
    commit({ ...current.current, ...patch });
  }, [commit]);

  const replaceAll = useCallback(async (next: PersistedState) => {
    const valid = validateState(next);
    if (restoring.current) throw new Error('جارٍ استعادة الدفتر');
    restoring.current = true;
    loadingGeneration.current++;
    try {
      await persist(valid);
      loaded.current = true;
      publish(valid);
      setRecoveryNotice(null);
      setReady(true);
    } finally {
      restoring.current = false;
    }
  }, [persist, publish]);

  const addPerson = useCallback((name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const id = newId();
    return commit({ ...current.current, people: [...current.current.people, { id, name: trimmed, hue: Math.floor(Math.random() * 360) }] }) ? id : '';
  }, [commit]);

  const renamePerson = useCallback((personId: string, name: string): boolean => {
    const before = current.current;
    const error = personNameError(before.people, personId, name);
    if (error) { showToast(error); return false; }
    const next = renamePersonInState(before, personId, name);
    return next !== null && (next === before || commit(next));
  }, [commit, showToast]);

  const addDebt = useCallback((input: AddDebtInput): boolean => {
    const debt = createDebt(current.current, input, newId());
    if (!debt) { showToast('تحقق من الشخص والمبلغ وتواريخ الأقساط'); return false; }
    return commit({ ...current.current, tx: [...current.current.tx, debt] });
  }, [commit, showToast]);

  const settle = useCallback((personId: string, amount: number, debtId?: string | null, dir?: 'me' | 'owe', transactionDate?: string, note?: string): number => {
    const payments = createSettlements(current.current.tx, personId, amount, newId, debtId, dir, transactionDate, note);
    if (!payments.length) { showToast('تحقق من اتجاه السداد والمبلغ المتبقي'); return 0; }
    return commit({ ...current.current, tx: [...current.current.tx, ...payments] })
      ? fromCents(payments.reduce((sum, payment) => sum + toCents(payment.amount), 0)) : 0;
  }, [commit, showToast]);

  const forgive = useCallback((personId: string, amount: number, debtId?: string | null, dir?: 'me' | 'owe', transactionDate?: string, note?: string): number => {
    const entries = createForgiveness(current.current.tx, personId, amount, newId, debtId, dir, transactionDate, note);
    if (!entries.length) { showToast('تحقق من اتجاه الإعفاء والمبلغ المتبقي وتاريخ الإعفاء'); return 0; }
    return commit({ ...current.current, tx: [...current.current.tx, ...entries] })
      ? fromCents(entries.reduce((sum, entry) => sum + toCents(entry.amount), 0)) : 0;
  }, [commit, showToast]);

  const updateEntry = useCallback((id: string, patch: EntryPatch) => commit(editEntry(current.current, id, patch, newId())), [commit]);
  const cancelEntry = useCallback((id: string) => commit(voidEntry(current.current, id, newId())), [commit]);
  const reinstateEntry = useCallback((id: string) => commit(restoreEntry(current.current, id, newId())), [commit]);
  const revertEntryEdit = useCallback((id: string) => commit(undoEntryEdit(current.current, id, newId())), [commit]);
  const listRecoverySnapshots = useCallback(() => availableLocalHistory(AsyncStorage), []);

  const markPaid = useCallback((debtId: string): boolean => {
    const debt = current.current.tx.find(t => t.id === debtId && isDebt(t));
    if (!debt) return false;
    const rem = fromCents(remainingCents(current.current.tx, debt));
    return rem > 0 && settle(debt.personId, rem, debtId) > 0;
  }, [settle]);

  const toggleReminder = useCallback((debtId: string, on: boolean) => {
    if (!current.current.tx.some(t => t.id === debtId && isDebt(t))) return;
    commit({ ...current.current, reminderPrefs: { ...current.current.reminderPrefs, [debtId]: on } });
  }, [commit]);

  const value = useMemo<Store>(() => ({
    state, ready, storageError, recoveryNotice, retryLoad, toast, showToast, addPerson, renamePerson, addDebt, settle, forgive, markPaid, toggleReminder, set, replaceAll,
    updateEntry, cancelEntry, reinstateEntry, revertEntryEdit, listRecoverySnapshots,
  }), [state, ready, storageError, recoveryNotice, retryLoad, toast, showToast, addPerson, renamePerson, addDebt, settle, forgive, markPaid, toggleReminder, set, replaceAll,
    updateEntry, cancelEntry, reinstateEntry, revertEntryEdit, listRecoverySnapshots]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
