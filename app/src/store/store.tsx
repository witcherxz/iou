import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEED_ON_FIRST_LAUNCH, STORAGE_KEY } from '../config/app';
import { addDays, todayISO } from '../format';
import { emptyState, seedState } from '../seed';
import { round2 } from '../selectors';
import { Installment, PersistedState, Tx } from '../types';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface AddDebtInput {
  personId: string;
  dir: 'me' | 'owe';
  amount: number;
  note: string;
  /** Days from today, or null for "no due date". Ignored for instalment plans. */
  dueInDays: number | null;
  installmentCount?: number;
}

interface Store {
  state: PersistedState;
  ready: boolean;
  toast: string | null;
  showToast: (msg: string) => void;
  addPerson: (name: string) => string;
  addDebt: (input: AddDebtInput) => void;
  /** Pays `amount` against one debt, or oldest-first across a person's debts. */
  settle: (personId: string, amount: number, debtId?: string | null) => void;
  markPaid: (debtId: string) => void;
  toggleReminder: (debtId: string, on: boolean) => void;
  set: (patch: Partial<PersistedState>) => void;
  replaceAll: (next: PersistedState) => void;
}

const StoreContext = createContext<Store | null>(null);

/** Tolerate partial/older payloads (e.g. a restored backup) without crashing. */
function hydrate(raw: unknown): PersistedState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<PersistedState>;
  return {
    ...base,
    ...s,
    version: 1,
    people: Array.isArray(s.people) ? s.people : [],
    tx: Array.isArray(s.tx) ? s.tx : [],
    reminderPrefs: s.reminderPrefs && typeof s.reminderPrefs === 'object' ? s.reminderPrefs : {},
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState(hydrate(JSON.parse(raw)));
        else setState(SEED_ON_FIRST_LAUNCH ? seedState() : emptyState());
      } catch {
        setState(SEED_ON_FIRST_LAUNCH ? seedState() : emptyState());
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Persist every change once the initial read has landed, so a failed read
  // can never overwrite good data with the empty default.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const set = useCallback((patch: Partial<PersistedState>) => {
    setState(s => ({ ...s, ...patch }));
  }, []);

  const replaceAll = useCallback((next: PersistedState) => setState(hydrate(next)), []);

  const addPerson = useCallback((name: string) => {
    const id = newId();
    setState(s => ({
      ...s,
      people: [...s.people, { id, name: name.trim(), hue: Math.floor(Math.random() * 360) }],
    }));
    return id;
  }, []);

  const addDebt = useCallback((input: AddDebtInput) => {
    const { personId, dir, amount, note, dueInDays, installmentCount } = input;
    const today = todayISO();
    setState(s => {
      let installments: Installment[] | undefined;
      let dueAt: string | null;

      if (installmentCount && installmentCount > 1) {
        const n = installmentCount;
        // Split evenly, then push the rounding remainder onto the last payment
        // so the instalments always sum back to the exact debt amount.
        const base = Math.floor((amount / n) * 100) / 100;
        const rest = round2(amount - base * n);
        installments = Array.from({ length: n }, (_, i) => ({
          amount: i === n - 1 ? round2(base + rest) : base,
          label: `دفعة ${i + 1}`,
          dueAt: addDays(today, 30 * (i + 1)),
        }));
        dueAt = installments[0].dueAt;
      } else {
        dueAt = dueInDays === null ? null : addDays(today, dueInDays);
      }

      const tx: Tx = {
        id: newId(),
        personId,
        dir,
        amount,
        note: note.trim() || (dir === 'me' ? 'دين' : 'سلفة'),
        createdAt: today,
        dueAt,
        ...(installments ? { installments, freq: 'month' as const } : {}),
      };
      return { ...s, tx: [...s.tx, tx] };
    });
  }, []);

  const settle = useCallback((personId: string, amount: number, debtId?: string | null) => {
    setState(s => {
      const today = todayISO();
      const open = s.tx.filter(t => t.dir !== 'settle');
      const remOf = (d: Tx) =>
        Math.max(0, round2(d.amount - s.tx.filter(t => t.debtId === d.id).reduce((x, t) => x + t.amount, 0)));

      let targets: Tx[];
      if (debtId) {
        const one = open.find(d => d.id === debtId);
        targets = one ? [one] : [];
      } else {
        const bal = open
          .filter(d => d.personId === personId)
          .reduce((x, d) => x + (d.dir === 'me' ? 1 : -1) * remOf(d), 0);
        const dir = bal >= 0 ? 'me' : 'owe';
        targets = open
          .filter(d => d.personId === personId && d.dir === dir && remOf(d) > 0)
          .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      }

      let left = amount;
      const payments: Tx[] = [];
      for (const d of targets) {
        if (left <= 0) break;
        const pay = Math.min(left, remOf(d));
        if (pay <= 0) continue;
        left = round2(left - pay);
        payments.push({
          id: newId(),
          personId,
          dir: 'settle',
          amount: pay,
          debtId: d.id,
          createdAt: today,
        });
      }
      return payments.length ? { ...s, tx: [...s.tx, ...payments] } : s;
    });
  }, []);

  const markPaid = useCallback((debtId: string) => {
    setState(s => {
      const debt = s.tx.find(t => t.id === debtId);
      if (!debt) return s;
      const rem = Math.max(
        0,
        round2(debt.amount - s.tx.filter(t => t.debtId === debtId).reduce((x, t) => x + t.amount, 0)),
      );
      if (rem <= 0) return s;
      return {
        ...s,
        tx: [
          ...s.tx,
          { id: newId(), personId: debt.personId, dir: 'settle', amount: rem, debtId, createdAt: todayISO() },
        ],
      };
    });
  }, []);

  const toggleReminder = useCallback((debtId: string, on: boolean) => {
    setState(s => ({ ...s, reminderPrefs: { ...s.reminderPrefs, [debtId]: on } }));
  }, []);

  const value = useMemo<Store>(
    () => ({ state, ready, toast, showToast, addPerson, addDebt, settle, markPaid, toggleReminder, set, replaceAll }),
    [state, ready, toast, showToast, addPerson, addDebt, settle, markPaid, toggleReminder, set, replaceAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
