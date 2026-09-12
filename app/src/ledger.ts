import { addDays, addMonths, calendarISO, isCalendarDate, localDate, todayISO } from './format';
import { fromCents, isMoneyAmount, toCents } from './money';
import { LedgerChange, PersistedState, Tx } from './types';
import { isLedgerDate, validateState } from './validation';

export interface AddDebtInput {
  personId: string;
  dir: 'me' | 'owe';
  amount: number;
  note: string;
  dueInDays: number | null;
  /** Explicit calendar date overrides dueInDays. First due date for installments. */
  dueAt?: string | null;
  installmentCount?: number;
  transactionDate?: string;
}

export function remainingCents(tx: Tx[], debt: Tx): number {
  if (debt.dir === 'settle' || debt.voidedAt) return 0;
  const paid = tx.filter(t => !t.voidedAt && t.dir === 'settle' && t.debtId === debt.id && t.personId === debt.personId)
    .reduce((sum, t) => sum + toCents(t.amount), 0);
  return Math.max(0, toCents(debt.amount) - paid);
}

export function createDebt(state: PersistedState, input: AddDebtInput, id: string, today = todayISO()): Tx | null {
  const happened = input.transactionDate ?? today;
  if (!isCalendarDate(happened) || happened > today) return null;
  if (!state.people.some(p => p.id === input.personId) || !isMoneyAmount(input.amount) ||
    (input.dir !== 'me' && input.dir !== 'owe')) return null;
  if (input.dueAt !== undefined && input.dueAt !== null && !isLedgerDate(input.dueAt)) return null;
  if (input.dueAt === undefined && input.dueInDays !== null && (!Number.isInteger(input.dueInDays) || Math.abs(input.dueInDays) > 36500)) return null;
  const count = input.installmentCount ?? 1;
  const cents = toCents(input.amount);
  if (!Number.isInteger(count) || count < 1 || count > 120 || count > cents) return null;
  const debt: Tx = {
    id, personId: input.personId, dir: input.dir, amount: fromCents(cents),
    note: input.note.trim() || (input.dir === 'me' ? 'دين' : 'سلفة'), createdAt: happened, recordedAt: new Date().toISOString(),
    dueAt: input.dueAt !== undefined ? input.dueAt : input.dueInDays === null ? null : addDays(happened, input.dueInDays),
  };
  if (count > 1) {
    const base = Math.floor(cents / count);
    const explicitFirst = input.dueAt !== undefined ? input.dueAt : input.dueInDays !== null ? addDays(happened, input.dueInDays) : null;
    const firstDue = explicitFirst ?? addMonths(happened, 1);
    debt.installments = Array.from({ length: count }, (_, i) => ({
      amount: fromCents(base + (i === count - 1 ? cents % count : 0)),
      label: `دفعة ${i + 1}`,
      dueAt: explicitFirst ? addMonths(firstDue, i) : addMonths(happened, i + 1),
    }));
    debt.dueAt = debt.installments[0].dueAt;
    debt.freq = 'month';
  }
  const firstDue = debt.installments?.[0]?.dueAt ?? debt.dueAt;
  if (firstDue && calendarISO(localDate(firstDue)) < happened) return null;
  return debt;
}

/** Person payments require an explicit direction when both sides owe money. */
export function createSettlements(
  tx: Tx[], personId: string, amount: number, newId: () => string,
  debtId?: string | null, dir?: 'me' | 'owe', today = todayISO(), note = '',
): Tx[] {
  if (!isMoneyAmount(amount) || !isCalendarDate(today) || today > todayISO()) return [];
  let targets = tx.filter(t => !t.voidedAt && t.personId === personId && t.dir !== 'settle' && remainingCents(tx, t) > 0 &&
    calendarISO(localDate(t.createdAt)) <= today);
  if (debtId) {
    targets = targets.filter(t => t.id === debtId && (!dir || t.dir === dir));
  } else {
    const directions = new Set(targets.map(t => t.dir));
    if (!dir && directions.size > 1) return [];
    const direction = dir ?? targets[0]?.dir;
    targets = targets.filter(t => t.dir === direction);
  }
  targets.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const requested = toCents(amount);
  const available = targets.reduce((sum, debt) => sum + remainingCents(tx, debt), 0);
  // Reject stale/oversized submissions; never silently drop part of a payment.
  if (requested > available) return [];
  let left = requested;
  const result: Tx[] = [];
  for (const debt of targets) {
    const pay = Math.min(left, remainingCents(tx, debt));
    if (pay <= 0) continue;
    result.push({ id: newId(), personId, dir: 'settle', amount: fromCents(pay), debtId: debt.id,
      createdAt: today, recordedAt: new Date().toISOString(), ...(note.trim() ? { note: note.trim() } : {}) });
    left -= pay;
  }
  return result;
}

export type EntryPatch = Partial<Pick<Tx, 'personId' | 'dir' | 'amount' | 'createdAt' | 'note' | 'dueAt' | 'installments' | 'freq' | 'debtId'>>;

const fail = (message: string): never => { throw new Error(message); };

/** Store each exact before/after snapshot, then validate balances and references together. */
function applyChange(state: PersistedState, before: Tx, after: Tx, kind: LedgerChange['kind'], id: string, at: string): PersistedState {
  return validateState({ ...state,
    tx: state.tx.map(t => t.id === before.id ? after : t),
    changes: [...state.changes, { id, txId: before.id, at, kind, before, after }],
  });
}

const editableKeys = ['personId', 'dir', 'amount', 'createdAt', 'note', 'dueAt', 'installments', 'freq', 'debtId'] as const;

export function editEntry(state: PersistedState, txId: string, patch: EntryPatch, id: string, at = new Date().toISOString()): PersistedState {
  return applyEntryPatch(state, txId, patch, id, at);
}

function applyEntryPatch(state: PersistedState, txId: string, patch: EntryPatch, id: string, at: string, historicalSnapshot = false): PersistedState {
  const before = state.tx.find(t => t.id === txId);
  if (!before || before.voidedAt) return fail('لا يمكن تعديل عملية ملغاة أو غير موجودة.');
  const after: Tx = { ...before };
  for (const key of editableKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) Object.assign(after, { [key]: patch[key] });
  }
  if ((before.dir === 'settle') !== (after.dir === 'settle')) return fail('لا يمكن تحويل الدين إلى دفعة أو العكس.');
  const dateChanged = before.createdAt !== after.createdAt;
  // Existing timestamp dates remain readable/editable after migration. A new
  // date is a calendar date; undo may restore the exact historical timestamp.
  if (dateChanged && (!isLedgerDate(after.createdAt) || (!historicalSnapshot &&
    (!isCalendarDate(after.createdAt) || after.createdAt > todayISO())))) return fail('اختر تاريخاً صحيحاً لا يتجاوز اليوم.');
  const actualDay = calendarISO(localDate(after.createdAt));
  const payments = state.tx.filter(t => !t.voidedAt && t.dir === 'settle' && t.debtId === txId);
  const firstDue = after.installments?.[0]?.dueAt ?? after.dueAt;
  const oldFirstDue = before.installments?.[0]?.dueAt ?? before.dueAt;
  if (after.dir !== 'settle' && !historicalSnapshot && firstDue &&
    (dateChanged || firstDue !== oldFirstDue || before.dueAt !== after.dueAt) &&
    isLedgerDate(firstDue) && calendarISO(localDate(firstDue)) < actualDay) {
    return fail('تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الدين.');
  }
  if (payments.length && (before.personId !== after.personId || before.dir !== after.dir)) {
    return fail('ألغِ الدفعات المرتبطة أولاً لتغيير الشخص أو اتجاه الدين.');
  }
  if (after.dir === 'settle') {
    const debt = state.tx.find(t => t.id === after.debtId && !t.voidedAt && t.dir !== 'settle');
    if (!debt || debt.personId !== after.personId) return fail('اختر ديناً مفتوحاً لهذا الشخص.');
    if (isMoneyAmount(after.amount) && toCents(after.amount) > remainingCents(state.tx.filter(t => t.id !== txId), debt)) {
      return fail('مبلغ الدفعة أكبر من المبلغ المتبقي لهذا الدين.');
    }
    if ((dateChanged || before.debtId !== after.debtId) && actualDay < calendarISO(localDate(debt.createdAt))) return fail('تاريخ الدفعة لا يمكن أن يسبق تاريخ الدين.');
  } else {
    if (isMoneyAmount(after.amount) && toCents(after.amount) < payments.reduce((sum, payment) => sum + toCents(payment.amount), 0)) {
      return fail('لا يمكن أن يقل مبلغ الدين عن مجموع الدفعات المسجلة.');
    }
    if (dateChanged && payments.some(t => calendarISO(localDate(t.createdAt)) < actualDay)) {
      return fail('تاريخ الدين لا يمكن أن يكون بعد إحدى دفعاته المسجلة.');
    }
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return state;
  return applyChange(state, before, after, 'edit', id, at);
}

export function voidEntry(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const before = state.tx.find(t => t.id === txId);
  if (!before || before.voidedAt) return fail('هذه العملية غير موجودة أو ملغاة بالفعل.');
  if (before.dir !== 'settle' && state.tx.some(t => !t.voidedAt && t.dir === 'settle' && t.debtId === txId)) {
    return fail('ألغِ الدفعات المرتبطة بهذا الدين أولاً؛ ستبقى جميع العمليات في السجل.');
  }
  return applyChange(state, before, { ...before, voidedAt: at }, 'void', id, at);
}

export function restoreEntry(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const before = state.tx.find(t => t.id === txId);
  if (!before?.voidedAt) return fail('هذه العملية ليست ملغاة.');
  const { voidedAt, ...after } = before;
  if (after.dir === 'settle') {
    const debt = state.tx.find(t => t.id === after.debtId && t.dir !== 'settle' && !t.voidedAt);
    if (!debt || debt.personId !== after.personId) return fail('أعد الدين إلى الشخص الأصلي قبل إعادة هذه الدفعة.');
    if (calendarISO(localDate(after.createdAt)) < calendarISO(localDate(debt.createdAt))) return fail('تاريخ الدفعة لا يمكن أن يسبق تاريخ الدين. راجع تاريخ الدين أولاً.');
  }
  return applyChange(state, before, after, 'restore', id, at);
}

/** Revert only the latest edit for this entry; subsequent payments still constrain the result. */
export function undoEntryEdit(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const latest = state.changes.filter(change => change.txId === txId).at(-1);
  if (!latest || latest.kind !== 'edit') return fail('لا يوجد تعديل أخير يمكن التراجع عنه.');
  const patch: EntryPatch = {};
  // Explicit undefined values remove fields introduced by the edit (for
  // example a note or installment schedule absent from the original entry).
  for (const key of editableKeys) Object.assign(patch, { [key]: latest.before[key] });
  return applyEntryPatch(state, txId, patch, id, at, true);
}
