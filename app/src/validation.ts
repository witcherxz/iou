import { isCalendarDate } from './format';
import { fromCents, isMoneyAmount, toCents } from './money';
import { emptyState } from './initialState';
import { Installment, LedgerChange, PersistedState, Person, Tx } from './types';
import { validateReminderSettings } from './reminderSettings';

const invalid = (detail: string): never => { throw new Error(`بيانات الدفتر غير صالحة: ${detail}`); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('صيغة غير معروفة');
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, nonempty = false): string => {
  if (typeof value !== 'string' || (nonempty && !value.trim())) return invalid(label);
  return value;
};
const id = (value: unknown): string => {
  const result = text(value, 'معرّف مفقود', true);
  if (['__proto__', 'constructor', 'prototype'].includes(result)) return invalid('معرّف غير صالح');
  return result;
};
export function isLedgerDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (isCalendarDate(value)) return true;
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
const date = (value: unknown): string => isLedgerDate(value) ? value : invalid('تاريخ غير صالح');
const amount = (value: unknown): number => isMoneyAmount(value) ? fromCents(toCents(value)) : invalid('مبلغ غير صالح');
const bool = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return typeof value === 'boolean' ? value : invalid('إعداد غير صالح');
};

function parseTx(value: unknown, personIds: Set<string>): Tx {
  const t = record(value);
  const txId = id(t.id);
  const personId = id(t.personId);
  if (!personIds.has(personId)) return invalid('عملية بدون شخص');
  if (t.dir !== 'me' && t.dir !== 'owe' && t.dir !== 'settle') return invalid('اتجاه غير صالح');
  const result: Tx = { id: txId, personId, dir: t.dir, amount: amount(t.amount), createdAt: date(t.createdAt) };
  if (t.recordedAt !== undefined) result.recordedAt = date(t.recordedAt);
  if (t.voidedAt !== undefined) result.voidedAt = date(t.voidedAt);
  if (t.note !== undefined) result.note = text(t.note, 'ملاحظة غير صالحة');
  if (t.dir === 'settle') {
    result.debtId = id(t.debtId);
    if (t.installments !== undefined || t.freq !== undefined) return invalid('أقساط لعملية سداد');
  } else {
    if (t.debtId !== undefined) return invalid('مرجع سداد غير صالح');
    result.dueAt = t.dueAt === undefined || t.dueAt === null ? null : date(t.dueAt);
    if (t.installments !== undefined) {
      if (!Array.isArray(t.installments) || t.installments.length < 2 || t.installments.length > 120) return invalid('عدد أقساط غير صالح');
      let previous = -Infinity;
      const installments: Installment[] = t.installments.map(value => {
        const ins = record(value);
        const dueAt = date(ins.dueAt);
        const timestamp = Date.parse(dueAt);
        if (timestamp <= previous) return invalid('ترتيب أقساط غير صالح');
        previous = timestamp;
        return { amount: amount(ins.amount), label: text(ins.label, 'اسم قسط غير صالح', true), dueAt };
      });
      if (installments.reduce((sum, item) => sum + toCents(item.amount), 0) !== toCents(result.amount)) return invalid('مجموع الأقساط لا يطابق الدين');
      if (t.freq !== undefined && t.freq !== 'month') return invalid('تكرار غير صالح');
      result.installments = installments;
      result.freq = 'month';
    } else if (t.freq !== undefined) return invalid('جدول أقساط مفقود');
  }
  return result;
}

/** Validate the entire graph before replacing any live data; whitelist fields. */
export function validateState(raw: unknown): PersistedState {
  const s = record(raw);
  const base = emptyState();
  if (s.version !== 1 && s.version !== 2) return invalid('إصدار غير مدعوم');
  if (!Array.isArray(s.people) || !Array.isArray(s.tx)) return invalid('السجلات مفقودة');
  const personIds = new Set<string>();
  const people: Person[] = s.people.map(value => {
    const p = record(value);
    const personId = id(p.id);
    if (personIds.has(personId)) return invalid('شخص مكرر');
    personIds.add(personId);
    if (typeof p.hue !== 'number' || !Number.isFinite(p.hue) || p.hue < 0 || p.hue > 360) return invalid('لون غير صالح');
    return { id: personId, name: text(p.name, 'اسم فارغ', true).trim(), hue: p.hue };
  });
  const txIds = new Set<string>();
  const tx = s.tx.map(value => {
    const result = parseTx(value, personIds);
    if (txIds.has(result.id)) return invalid('عملية مكررة');
    txIds.add(result.id);
    return result;
  });
  const byId = new Map(tx.map(t => [t.id, t]));
  const paid = new Map<string, number>();
  let exposure = 0;
  for (const t of tx) {
    if (t.dir !== 'settle') {
      if (t.voidedAt) continue;
      exposure += toCents(t.amount);
      if (!Number.isSafeInteger(exposure)) return invalid('المجموع أكبر من الحد المدعوم');
      continue;
    }
    const debt = byId.get(t.debtId!);
    if (!debt || debt.dir === 'settle') return invalid('سداد مرتبط بدين غير صالح');
    // Voided payments retain their original person for history if the debt is
    // subsequently corrected. Restoring one must pass the active graph checks.
    if (t.voidedAt) continue;
    if (debt.personId !== t.personId) return invalid('سداد مرتبط بدين غير صالح');
    if (debt.voidedAt) return invalid('سداد نشط لدين ملغى');
    const total = (paid.get(debt.id) ?? 0) + toCents(t.amount);
    if (total > toCents(debt.amount)) return invalid('سداد أكبر من الدين');
    paid.set(debt.id, total);
  }
  if (s.version === 2 && !Array.isArray(s.changes)) return invalid('سجل التعديلات مفقود');
  const changes: LedgerChange[] = [];
  const changeIds = new Set<string>();
  const lastChange = new Map<string, Tx>();
  for (const value of (s.changes === undefined ? [] : Array.isArray(s.changes) ? s.changes : invalid('سجل تعديلات غير صالح'))) {
    const change = record(value);
    const changeId = id(change.id);
    const txId = id(change.txId);
    if (changeIds.has(changeId) || !byId.has(txId)) return invalid('تعديل مكرر أو بدون عملية');
    changeIds.add(changeId);
    const before = parseTx(change.before, personIds);
    const after = parseTx(change.after, personIds);
    const at = date(change.at);
    if (before.id !== txId || after.id !== txId || (before.dir === 'settle') !== (after.dir === 'settle')) return invalid('مرجع تعديل غير صالح');
    if (before.recordedAt !== after.recordedAt) return invalid('تغيير وقت التسجيل الأصلي');
    if (change.kind !== 'edit' && change.kind !== 'void' && change.kind !== 'restore') return invalid('نوع تعديل غير صالح');
    if (change.kind === 'edit' && (before.voidedAt || after.voidedAt)) return invalid('تعديل عملية ملغاة');
    if (change.kind === 'void' && (before.voidedAt || after.voidedAt !== at)) return invalid('إلغاء غير صالح');
    if (change.kind === 'restore' && (!before.voidedAt || after.voidedAt)) return invalid('إعادة غير صالحة');
    if (change.kind !== 'edit') {
      const { voidedAt: ignoredBefore, ...a } = before;
      const { voidedAt: ignoredAfter, ...b } = after;
      if (JSON.stringify(a) !== JSON.stringify(b)) return invalid('تغيير بيانات أثناء الإلغاء أو الإعادة');
    }
    const previous = lastChange.get(txId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(before)) return invalid('سلسلة تعديلات غير متصلة');
    lastChange.set(txId, after);
    changes.push({ id: changeId, txId, at, kind: change.kind, before, after });
  }
  for (const [txId, after] of lastChange) {
    if (JSON.stringify(after) !== JSON.stringify(byId.get(txId))) return invalid('السجل لا يطابق آخر تعديل');
  }
  const debtIds = new Set(tx.filter(t => t.dir !== 'settle').map(t => t.id));
  const activeDebtIds = new Set(tx.filter(t => t.dir !== 'settle' && !t.voidedAt).map(t => t.id));
  if (s.version === 2 && s.reminderSettings === undefined) return invalid('إعدادات التذكير مفقودة');
  const reminderSettings = validateReminderSettings(s.reminderSettings, activeDebtIds);
  const reminderPrefs: Record<string, boolean> = {};
  if (s.reminderPrefs !== undefined) {
    for (const [key, value] of Object.entries(record(s.reminderPrefs))) {
      if (typeof value !== 'boolean') return invalid('تذكير غير صالح');
      // Keep the owner's opt-out when a voided debt is later restored.
      if (debtIds.has(key)) reminderPrefs[key] = value;
    }
  }
  const dark = s.dark === undefined ? base.dark : s.dark;
  if (dark !== null && typeof dark !== 'boolean') return invalid('مظهر غير صالح');
  const accent = s.accent === undefined ? base.accent : text(s.accent, 'لون غير صالح');
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return invalid('لون غير صالح');
  const backupTarget = s.backupTarget ?? base.backupTarget;
  if (backupTarget !== 'none' && backupTarget !== 'file' && backupTarget !== 'folder' && backupTarget !== 'drive') return invalid('وجهة نسخ غير صالحة');
  return {
    version: 2, people, tx, changes, reminderPrefs, reminderSettings,
    onboarded: bool(s.onboarded, base.onboarded),
    profileName: s.profileName === undefined ? base.profileName : text(s.profileName, 'اسم دفتر غير صالح', true),
    weekly: bool(s.weekly, base.weekly), autoBackup: bool(s.autoBackup, base.autoBackup),
    dark, accent, backupTarget,
    backupFolderUri: s.backupFolderUri == null ? null : text(s.backupFolderUri, 'مجلد غير صالح', true),
    // Older builds stored an Arabic display label here rather than a timestamp.
    // Discard that status only; the financial ledger is still valid.
    lastBackup: s.lastBackup == null ? null : typeof s.lastBackup !== 'string' ? invalid('وقت نسخ غير صالح') : isLedgerDate(s.lastBackup) ? s.lastBackup : null,
  };
}
