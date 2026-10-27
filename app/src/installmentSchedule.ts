import { isValidAmountInput } from './components/Keypad';
import { calendarISO, fmt, isCalendarDate, localDate } from './format';
import { installmentAllocations, isDebt } from './ledger';
import { Installment, Tx } from './types';

/** Editing another field must not rewrite a legacy timestamp's unchanged day. */
export function preserveUnchangedDate(original: string, displayed: string): string {
  return calendarISO(localDate(original)) === displayed ? original : displayed;
}

/** Change only the calendar day of open rows; never shift months or allocations. */
export function rescheduleRemainingInstallments(
  debt: Tx, transactions: Tx[], draft: Installment[], day: number, actualDate: string,
): Installment[] {
  const original = debt.installments;
  if (!isDebt(debt) || debt.voidedAt || !original?.length || draft.length !== original.length) {
    throw new Error('لا يوجد جدول أقساط صالح لتغيير مواعيده.');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('أدخل يوماً من 1 إلى 31.');
  }
  if (draft.some((row, index) => row.amount !== original[index].amount)) {
    throw new Error('احفظ تغييرات مبالغ الأقساط أولاً لتحديد المتبقي بدقة.');
  }
  if (!isCalendarDate(actualDate) || draft.some(row => !isCalendarDate(row.dueAt))) {
    throw new Error('تحقق من تاريخ الدين ومواعيد الأقساط قبل تطبيق اليوم.');
  }
  const allocations = installmentAllocations(transactions, debt);
  if (!allocations.some(row => row.remainingAmount > 0)) {
    throw new Error('اكتملت جميع الأقساط؛ لا توجد مواعيد متبقية لتغييرها.');
  }
  const next = draft.map((row, index) => {
    if (allocations[index].remainingAmount === 0) return { ...row };
    const end = localDate(row.dueAt);
    end.setMonth(end.getMonth() + 1, 0);
    const dueAt = `${row.dueAt.slice(0, 8)}${String(Math.min(day, end.getDate())).padStart(2, '0')}`;
    return { ...row, dueAt };
  });
  if (next.some(row => row.dueAt < actualDate)) {
    throw new Error('سيصبح أحد المواعيد قبل تاريخ الدين. اختر يوماً لاحقاً أو عدّل الموعد بشكل منفرد.');
  }
  if (next.some((row, index) => index > 0 && row.dueAt <= next[index - 1].dueAt)) {
    throw new Error('ستتكرر المواعيد أو يتغير ترتيبها. اختر يوماً آخر أو عدّل المواعيد بشكل منفرد.');
  }
  return next;
}

export interface CustomScheduleRow {
  amount: string;
  dueAt: string;
}

/** Explain why a hand-written schedule cannot be saved, or return '' when it can. */
export function customScheduleIssue(rows: CustomScheduleRow[], totalCents: number, actualDate: string): string {
  if (rows.length < 2) return 'أضف دفعتين على الأقل، أو اختر «دفعة واحدة».';
  if (rows.length > 120) return 'الحد الأقصى 120 دفعة.';
  if (rows.some(row => !isValidAmountInput(row.amount))) return 'أدخل مبلغاً صحيحاً أكبر من صفر لكل دفعة.';
  if (rows.some(row => !isCalendarDate(row.dueAt))) return 'أدخل تاريخاً صحيحاً لكل دفعة، مثل ⁦2026-09-25⁩.';
  if (rows.some(row => row.dueAt < actualDate)) return 'لا يمكن أن يسبق موعد أي دفعة تاريخ الدين.';
  const dates = rows.map(row => row.dueAt).sort();
  if (dates.some((dueAt, index) => index > 0 && dueAt === dates[index - 1])) return 'لكل دفعة تاريخ مختلف؛ اجمع الدفعات المتكررة في تاريخ واحد.';
  const left = totalCents - rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  if (left > 0) return `متبقٍ ${fmt(left / 100)} ر.س غير موزع على الدفعات.`;
  if (left < 0) return `مجموع الدفعات يزيد على مبلغ الدين بمقدار ${fmt(-left / 100)} ر.س.`;
  return '';
}

/** Sort a valid hand-written schedule by date; amounts and dates are kept exactly. */
export function buildCustomSchedule(rows: CustomScheduleRow[], totalCents: number, actualDate: string): Installment[] | null {
  if (customScheduleIssue(rows, totalCents, actualDate)) return null;
  return [...rows].sort((a, b) => a.dueAt < b.dueAt ? -1 : 1)
    .map((row, index) => ({ amount: Number(row.amount), label: `دفعة ${index + 1}`, dueAt: row.dueAt }));
}
