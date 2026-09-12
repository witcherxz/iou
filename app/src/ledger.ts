import { addDays, addMonths, calendarISO, isCalendarDate, localDate, todayISO } from './format';
import { fromCents, isMoneyAmount, toCents } from './money';
import { isDebt, isReduction, LedgerChange, PersistedState, Reduction, Tx } from './types';
export { isDebt, isReduction } from './types';
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

/** Linked active reductions only; forgiveness never becomes cash received/paid. */
function reductions(tx: Tx[], debt: Tx): Reduction[] {
  if (!isDebt(debt) || debt.voidedAt) return [];
  return tx.filter((t): t is Reduction => isReduction(t) && !t.voidedAt &&
    t.debtId === debt.id && t.personId === debt.personId);
}

export interface ReductionAmounts {
  paidAmount: number;
  forgivenAmount: number;
  remainingAmount: number;
}

export function reductionAmounts(tx: Tx[], debt: Tx): ReductionAmounts {
  const entries = reductions(tx, debt);
  const paid = entries.filter(t => t.dir === 'settle').reduce((sum, t) => sum + toCents(t.amount), 0);
  const forgiven = entries.filter(t => t.dir === 'forgive').reduce((sum, t) => sum + toCents(t.amount), 0);
  return { paidAmount: fromCents(paid), forgivenAmount: fromCents(forgiven),
    remainingAmount: !isDebt(debt) || debt.voidedAt ? 0 : fromCents(Math.max(0, toCents(debt.amount) - paid - forgiven)) };
}

export function remainingCents(tx: Tx[], debt: Tx): number {
  return toCents(reductionAmounts(tx, debt).remainingAmount);
}

/** Apply reductions in actual-date order to the oldest outstanding installment.
 * Ties retain recording order, so showing an imported ledger never invents a
 * different cash/forgiveness allocation. Later edits recalculate this view.
 */
export function installmentAllocations(tx: Tx[], debt: Tx): ReductionAmounts[] {
  const rows = (debt.installments ?? []).map(ins => ({ paid: 0, forgiven: 0, remaining: toCents(ins.amount) }));
  const ordered = reductions(tx, debt).sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    ((a.recordedAt ? Date.parse(a.recordedAt) : -Infinity) -
      (b.recordedAt ? Date.parse(b.recordedAt) : -Infinity) || 0));
  for (const entry of ordered) {
    let left = toCents(entry.amount);
    for (const row of rows) {
      const used = Math.min(left, row.remaining);
      row.remaining -= used;
      if (entry.dir === 'settle') row.paid += used; else row.forgiven += used;
      left -= used;
      if (!left) break;
    }
  }
  return rows.map(row => ({ paidAmount: fromCents(row.paid), forgivenAmount: fromCents(row.forgiven), remainingAmount: fromCents(row.remaining) }));
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

/** Person reductions require an explicit direction when both sides owe money. */
function createReductions(
  kind: 'settle' | 'forgive',
  tx: Tx[], personId: string, amount: number, newId: () => string,
  debtId?: string | null, dir?: 'me' | 'owe', today = todayISO(), note = '',
): Tx[] {
  if (!isMoneyAmount(amount) || !isCalendarDate(today) || today > todayISO()) return [];
  let targets = tx.filter(t => !t.voidedAt && t.personId === personId && isDebt(t) && remainingCents(tx, t) > 0 &&
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
  // Reject stale/oversized submissions; never silently drop any of the requested amount.
  if (requested > available) return [];
  let left = requested;
  const result: Tx[] = [];
  for (const debt of targets) {
    const pay = Math.min(left, remainingCents(tx, debt));
    if (pay <= 0) continue;
    result.push({ id: newId(), personId, dir: kind, amount: fromCents(pay), debtId: debt.id,
      createdAt: today, recordedAt: new Date().toISOString(), ...(note.trim() ? { note: note.trim() } : {}) });
    left -= pay;
  }
  return result;
}

export function createSettlements(
  tx: Tx[], personId: string, amount: number, newId: () => string,
  debtId?: string | null, dir?: 'me' | 'owe', today = todayISO(), note = '',
): Tx[] {
  return createReductions('settle', tx, personId, amount, newId, debtId, dir, today, note);
}

/** Record a creditor's full/partial waiver without reporting money exchanged. */
export function createForgiveness(
  tx: Tx[], personId: string, amount: number, newId: () => string,
  debtId?: string | null, dir?: 'me' | 'owe', today = todayISO(), note = '',
): Tx[] {
  return createReductions('forgive', tx, personId, amount, newId, debtId, dir, today, note);
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
  if ((isDebt(before) !== isDebt(after)) || (isReduction(before) && before.dir !== after.dir)) return fail('لا يمكن تغيير نوع العملية بين دين وسداد وإعفاء.');
  const dateChanged = before.createdAt !== after.createdAt;
  // Existing timestamp dates remain readable/editable after migration. A new
  // date is a calendar date; undo may restore the exact historical timestamp.
  if (dateChanged && (!isLedgerDate(after.createdAt) || (!historicalSnapshot &&
    (!isCalendarDate(after.createdAt) || after.createdAt > todayISO())))) return fail('اختر تاريخاً صحيحاً لا يتجاوز اليوم.');
  const actualDay = calendarISO(localDate(after.createdAt));
  const linkedReductions = state.tx.filter(t => !t.voidedAt && isReduction(t) && t.debtId === txId);
  const firstDue = after.installments?.[0]?.dueAt ?? after.dueAt;
  const oldFirstDue = before.installments?.[0]?.dueAt ?? before.dueAt;
  if (isDebt(after) && !historicalSnapshot && firstDue &&
    (dateChanged || firstDue !== oldFirstDue || before.dueAt !== after.dueAt) &&
    isLedgerDate(firstDue) && calendarISO(localDate(firstDue)) < actualDay) {
    return fail('تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الدين.');
  }
  if (linkedReductions.length && (before.personId !== after.personId || before.dir !== after.dir)) {
    return fail('ألغِ عمليات السداد والإعفاء المرتبطة أولاً لتغيير الشخص أو اتجاه الدين.');
  }
  if (isReduction(after)) {
    const debt = state.tx.find(t => t.id === after.debtId && !t.voidedAt && isDebt(t));
    if (!debt || debt.personId !== after.personId) return fail('اختر ديناً مفتوحاً لهذا الشخص.');
    if (isMoneyAmount(after.amount) && toCents(after.amount) > remainingCents(state.tx.filter(t => t.id !== txId), debt)) {
      return fail('مبلغ السداد أو الإعفاء أكبر من المبلغ المتبقي لهذا الدين.');
    }
    if ((dateChanged || before.debtId !== after.debtId) && actualDay < calendarISO(localDate(debt.createdAt))) return fail('تاريخ السداد أو الإعفاء لا يمكن أن يسبق تاريخ الدين.');
  } else {
    if (isMoneyAmount(after.amount) && toCents(after.amount) < linkedReductions.reduce((sum, entry) => sum + toCents(entry.amount), 0)) {
      return fail('لا يمكن أن يقل مبلغ الدين عن مجموع السداد والإعفاء المسجل.');
    }
    if (dateChanged && linkedReductions.some(t => calendarISO(localDate(t.createdAt)) < actualDay)) {
      return fail('تاريخ الدين لا يمكن أن يكون بعد إحدى عمليات السداد أو الإعفاء المسجلة.');
    }
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return state;
  return applyChange(state, before, after, 'edit', id, at);
}

export function voidEntry(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const before = state.tx.find(t => t.id === txId);
  if (!before || before.voidedAt) return fail('هذه العملية غير موجودة أو ملغاة بالفعل.');
  if (isDebt(before) && state.tx.some(t => !t.voidedAt && isReduction(t) && t.debtId === txId)) {
    return fail('ألغِ عمليات السداد والإعفاء المرتبطة بهذا الدين أولاً؛ ستبقى جميع العمليات في السجل.');
  }
  return applyChange(state, before, { ...before, voidedAt: at }, 'void', id, at);
}

export function restoreEntry(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const before = state.tx.find(t => t.id === txId);
  if (!before?.voidedAt) return fail('هذه العملية ليست ملغاة.');
  const { voidedAt, ...after } = before;
  if (isReduction(after)) {
    const debt = state.tx.find(t => t.id === after.debtId && isDebt(t) && !t.voidedAt);
    if (!debt || debt.personId !== after.personId) return fail('أعد الدين إلى الشخص الأصلي قبل إعادة هذه العملية.');
    if (calendarISO(localDate(after.createdAt)) < calendarISO(localDate(debt.createdAt))) return fail('تاريخ السداد أو الإعفاء لا يمكن أن يسبق تاريخ الدين. راجع تاريخ الدين أولاً.');
  }
  return applyChange(state, before, after, 'restore', id, at);
}

/** Revert only the latest edit; subsequent cash payments and forgiveness still constrain the result. */
export function undoEntryEdit(state: PersistedState, txId: string, id: string, at = new Date().toISOString()): PersistedState {
  const latest = state.changes.filter(change => change.txId === txId).at(-1);
  if (!latest || latest.kind !== 'edit') return fail('لا يوجد تعديل أخير يمكن التراجع عنه.');
  const patch: EntryPatch = {};
  // Explicit undefined values remove fields introduced by the edit (for
  // example a note or installment schedule absent from the original entry).
  for (const key of editableKeys) Object.assign(patch, { [key]: latest.before[key] });
  return applyEntryPatch(state, txId, patch, id, at, true);
}
