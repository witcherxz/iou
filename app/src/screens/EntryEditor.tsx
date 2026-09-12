import React, { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { AmountInput, isValidAmountInput, normalizeAmountInput } from '../components/Keypad';
import { TransactionDateField } from '../components/TransactionDateField';
import { Chip, OutlinedField, OutlineButton, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { confirmAction } from '../confirm';
import { arDate, calendarISO, fmt, isCalendarDate, localDate, todayISO } from '../format';
import { EntryPatch, installmentAllocations, isDebt, isReduction } from '../ledger';
import { preserveUnchangedDate, rescheduleRemainingInstallments } from '../installmentSchedule';
import { Colors, M3 } from '../theme';
import { LedgerChange, Person, Tx } from '../types';

interface Props {
  c: Colors; entry: Tx; people: Person[]; transactions: Tx[]; changes: LedgerChange[];
  onBack: () => void; onSave: (patch: EntryPatch) => boolean | Promise<boolean>;
  onVoid: () => boolean | Promise<boolean>; onRestore: () => boolean | Promise<boolean>;
  onUndoEdit: () => boolean | Promise<boolean>;
}

const stamp = (value: string) => new Date(value).toLocaleString('ar-SA', { calendar: 'gregory', numberingSystem: 'latn' });

/** Corrections keep original snapshots; cancelled entries remain reviewable. */
export function EntryEditor({ c, entry, people, transactions, changes, onBack, onSave, onVoid, onRestore, onUndoEdit }: Props) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [personId, setPersonId] = useState(entry.personId);
  const [dir, setDir] = useState<'me' | 'owe'>(entry.dir === 'owe' ? 'owe' : 'me');
  const [debtId, setDebtId] = useState(entry.debtId ?? '');
  const [occurred, setOccurred] = useState(calendarISO(localDate(entry.createdAt)));
  const [note, setNote] = useState(entry.note ?? '');
  const [dueAt, setDueAt] = useState(entry.dueAt ? calendarISO(localDate(entry.dueAt)) : '');
  const [installments, setInstallments] = useState(entry.installments?.map(i => ({ ...i, amount: String(i.amount), dueAt: calendarISO(localDate(i.dueAt)) })) ?? []);
  const [monthlyDay, setMonthlyDay] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const payment = isReduction(entry);
  const forgiveness = entry.dir === 'forgive';
  const reductionLabel = forgiveness ? 'الإعفاء' : 'الدفعة';
  const linked = transactions.filter(t => !t.voidedAt && isReduction(t) && t.debtId === entry.id);
  const targets = transactions.filter(t => !t.voidedAt && isDebt(t) && t.personId === personId);
  const relevant = changes.filter(change => change.txId === entry.id).slice().reverse();
  const allocations = installmentAllocations(transactions, entry);
  const remainingInstallments = allocations.filter(row => row.remainingAmount > 0).length;
  const amountsChanged = Number(amount) !== entry.amount || installments.some((row, index) =>
    !isValidAmountInput(row.amount) || Number(row.amount) !== entry.installments?.[index]?.amount);
  const validMonthlyDay = /^\d{1,2}$/.test(monthlyDay) && Number(monthlyDay) >= 1 && Number(monthlyDay) <= 31;
  const validAmount = isValidAmountInput(amount);
  const validSchedule = installments.length === 0 || installments.every((i, index) =>
    isValidAmountInput(i.amount) && isCalendarDate(i.dueAt) && (index === 0 || i.dueAt > installments[index - 1].dueAt)) &&
    installments.reduce((sum, i) => sum + Math.round(Number(i.amount) * 100), 0) === Math.round(Number(amount) * 100);
  const canSave = validAmount && !!personId && isCalendarDate(occurred) && occurred <= todayISO() &&
    (payment ? !!debtId : validSchedule && (!dueAt || isCalendarDate(dueAt)));

  const run = async (action: () => boolean | Promise<boolean>, title?: string, message?: string, confirmLabel?: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      if (title && !(await confirmAction(title, message ?? '', confirmLabel))) return;
      if (await action()) onBack();
      else setError('تعذّر حفظ التغيير. راجع حالة حفظ الدفتر وحاول مرة أخرى.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر حفظ التغيير.'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const splitEvenly = () => {
    if (!validAmount || !installments.length) return;
    const cents = Math.round(Number(amount) * 100), base = Math.floor(cents / installments.length);
    if (base < 1) { setError('المبلغ صغير جداً لعدد الدفعات.'); return; }
    setInstallments(installments.map((i, index) => ({ ...i, amount: String((base + (index === installments.length - 1 ? cents % installments.length : 0)) / 100) })));
  };

  const applyMonthlyDay = () => {
    setScheduleMessage(''); setScheduleError('');
    try {
      const next = rescheduleRemainingInstallments(entry, transactions,
        installments.map(row => ({ ...row, amount: Number(row.amount) })), Number(monthlyDay), occurred);
      const changed = next.filter((row, index) => row.dueAt !== installments[index].dueAt).length;
      setInstallments(next.map(row => ({ ...row, amount: String(row.amount) })));
      setScheduleMessage(changed
        ? `حُدّثت مواعيد ${fmt(changed, 0)} أقساط في المسودة. راجع الجدول أدناه ثم احفظ التعديل.`
        : 'المواعيد المتبقية توافق هذا اليوم بالفعل.');
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'تعذر تغيير المواعيد. تحقق من الجدول.');
    }
  };

  const editedInstallments = installments.map((row, index) => ({ ...row, amount: Number(row.amount),
    dueAt: entry.installments?.[index] ? preserveUnchangedDate(entry.installments[index].dueAt, row.dueAt) : row.dueAt,
  }));

  return <View style={{ flex: 1 }}>
    <ScreenHeader c={c} title={entry.voidedAt ? 'عملية ملغاة' : forgiveness ? 'تعديل إعفاء' : payment ? 'تعديل دفعة' : 'تعديل دين'} glyph="→" onBack={onBack} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }} keyboardShouldPersistTaps="handled">
      <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
        {entry.voidedAt ? 'هذه العملية ملغاة ولا تدخل في الأرصدة. يمكنك إعادتها إذا كانت صحيحة.' : 'يُحفظ كل تعديل في السجل مع القيم السابقة.'}
      </T>
      {forgiveness && <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>هذه العملية إعفاء من الدين، وتظهر مستقلة عن الدفعات المالية في السجل والتقارير.</T>}
      {entry.voidedAt ? <View style={{ backgroundColor: c.surfaceContainerLow, padding: 16, gap: 8, borderRadius: 12 }}>
        <T style={{ ...M3.type.titleLarge, color: c.onSurface }}>{people.find(p => p.id === entry.personId)?.name} · {fmt(entry.amount)} ر.س</T>
        <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{entry.note} · {arDate(occurred)}</T>
        <PrimaryButton c={c} label="إعادة العملية" loading={busy} onPress={() => run(onRestore, 'إعادة العملية', 'ستعود هذه العملية إلى الأرصدة إذا كانت لا تتعارض مع العمليات الحالية.', 'إعادة')} />
      </View> : <>
        <AmountInput c={c} label={payment ? `مبلغ ${reductionLabel}` : 'المبلغ'} value={amount} onChange={setAmount}
          error={!validAmount ? 'أدخل مبلغاً أكبر من صفر وبحد أقصى منزلتين عشريتين.' : undefined} />
        <TransactionDateField c={c} label={payment ? `تاريخ ${reductionLabel}` : 'تاريخ الدين'} value={occurred} onChange={setOccurred} />
        {entry.recordedAt && <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>وقت التسجيل الأصلي: {stamp(entry.recordedAt)}</T>}
        <View style={{ gap: 8 }}>
          <T style={{ ...M3.type.titleSmall, color: c.onSurfaceVariant }}>الشخص</T>
          {linked.length ? <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>{people.find(p => p.id === personId)?.name}</T> :
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{people.map(p => <Chip key={p.id} c={c} label={p.name} selected={personId === p.id}
              onPress={() => { setPersonId(p.id); if (payment) setDebtId(''); }} />)}</View>}
        </View>
        {payment ? <View style={{ gap: 8 }}>
          <T style={{ ...M3.type.titleSmall, color: c.onSurfaceVariant }}>الدين المرتبط ب{reductionLabel}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{targets.map(t => <Chip key={t.id} c={c}
            label={`${t.note || 'دين'} · ${fmt(t.amount)} · ${t.dir === 'me' ? 'يدين لي' : 'أدين له'} · ${arDate(t.createdAt)}`}
            selected={debtId === t.id} onPress={() => setDebtId(t.id)} />)}</View>
          {!targets.length && <T style={{ ...M3.type.bodyMedium, color: c.error }}>لا توجد ديون لهذا الشخص.</T>}
        </View> : linked.length ? <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>للدين دفعات أو إعفاءات مسجلة. ألغِ العمليات المرتبطة أولاً لتغيير الشخص أو الاتجاه.</T> :
          <Segment c={c} value={dir} onChange={setDir} options={[{ value: 'me', label: 'يدين لي' }, { value: 'owe', label: 'أدين له' }]} />}
        {!payment && !installments.length && <View style={{ gap: 8 }}>
          <OutlinedField c={c} label="تاريخ الاستحقاق (اختياري)" accessibilityLabel="تاريخ الاستحقاق" value={dueAt}
            onChangeText={v => setDueAt(normalizeAmountInput(v))} placeholder="YYYY-MM-DD" maxLength={10}
            style={{ writingDirection: 'ltr', textAlign: 'left' }} error={!!dueAt && !isCalendarDate(dueAt)}
            helperText="اتركه فارغاً إذا لم يُحدد موعد للسداد." />
          {!!dueAt && <Chip c={c} label="بدون موعد" onPress={() => setDueAt('')} />}
        </View>}
        {!!installments.length && <View style={{ gap: 12 }}>
          <T accessibilityRole="header" style={{ ...M3.type.titleLarge, color: c.onSurface }}>الأقساط</T>
          {remainingInstallments > 0 ? <View style={{ padding: 16, gap: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLow }}>
            <T accessibilityRole="header" style={{ ...M3.type.titleMedium, color: c.onSurface }}>تغيير يوم الاستحقاق الشهري</T>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>يبقى كل قسط في شهره، ويُستخدم آخر يوم إذا كان الشهر أقصر. الأقساط المكتملة لا تتغير بهذا الخيار.</T>
            <OutlinedField c={c} label="اليوم من الشهر" value={monthlyDay} keyboardType="number-pad" inputMode="numeric"
              maxLength={2} placeholder="1–31" style={{ writingDirection: 'ltr', textAlign: 'left' }}
              onChangeText={value => { setMonthlyDay(normalizeAmountInput(value)); setScheduleError(''); setScheduleMessage(''); }}
              error={!!monthlyDay && !validMonthlyDay} helperText="أدخل يوماً من 1 إلى 31." />
            {amountsChanged && <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>احفظ تغييرات المبالغ أولاً لتحديد الأقساط المتبقية بدقة.</T>}
            <OutlineButton c={c} label="تطبيق على الأقساط المتبقية" disabled={!validMonthlyDay || amountsChanged || busy} onPress={applyMonthlyDay} />
            {!!scheduleError && <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>{scheduleError}</T>}
            {!!scheduleMessage && <T accessibilityLiveRegion="polite" style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{scheduleMessage}</T>}
          </View> : <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>اكتملت جميع الأقساط؛ لا توجد مواعيد متبقية لتغييرها.</T>}
          {installments.map((ins, index) => <View key={index} style={{ padding: 12, gap: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLow }}>
            <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>دفعة {index + 1}{allocations[index]?.remainingAmount === 0 ? ' · مكتمل' : ''}</T>
            <OutlinedField c={c} label={`مبلغ القسط ${index + 1}`} value={ins.amount} keyboardType="decimal-pad" inputMode="decimal"
              onChangeText={value => setInstallments(rows => rows.map((row, i) => i === index ? { ...row, amount: normalizeAmountInput(value) } : row))} />
            <OutlinedField c={c} label={`موعد القسط ${index + 1}`} value={ins.dueAt} placeholder="YYYY-MM-DD" maxLength={10}
              style={{ writingDirection: 'ltr', textAlign: 'left' }}
              helperText={entry.installments?.[index] && ins.dueAt !== calendarISO(localDate(entry.installments[index].dueAt))
                ? `الموعد السابق: ${arDate(entry.installments[index].dueAt)}` : undefined}
              onChangeText={value => { setScheduleMessage(''); setScheduleError(''); setInstallments(rows => rows.map((row, i) => i === index ? { ...row, dueAt: normalizeAmountInput(value) } : row)); }} />
          </View>)}
          <OutlineButton c={c} label="توزيع المبلغ بالتساوي" disabled={!validAmount || busy} onPress={splitEvenly} />
          {!validSchedule && <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>يجب أن يساوي مجموع الأقساط مبلغ الدين، وأن تكون مواعيدها صحيحة ومتتابعة.</T>}
        </View>}
        <OutlinedField c={c} label={forgiveness ? 'سبب الإعفاء' : 'الملاحظة'} value={note} onChangeText={setNote} maxLength={500} />
        <PrimaryButton c={c} label="حفظ التعديل" disabled={!canSave} loading={busy} onPress={() => run(() => onSave({
          amount: Number(amount), personId, createdAt: preserveUnchangedDate(entry.createdAt, occurred), note: note.trim(),
          ...(payment ? { debtId } : { dir, dueAt: installments.length ? editedInstallments[0].dueAt : dueAt || null,
            ...(installments.length ? { installments: editedInstallments, freq: 'month' as const } : {}) }),
        }))} />
        {relevant[0]?.kind === 'edit' && <OutlineButton c={c} label="التراجع عن آخر تعديل" disabled={busy}
          onPress={() => run(onUndoEdit, 'التراجع عن التعديل', 'ستعود القيم السابقة إذا كانت متوافقة مع الدفعات والإعفاءات الحالية. يُسجل التراجع في السجل.', 'تراجع')} />}
        <OutlineButton c={c} label="إلغاء تسجيل العملية" disabled={busy}
          onPress={() => run(onVoid, 'إلغاء تسجيل العملية', 'لن تُحتسب العملية في الأرصدة بعد إلغائها. تبقى في السجل ويمكن إعادتها لاحقاً.', 'إلغاء العملية')} />
      </>}
      {!!error && <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>{error}</T>}
      <View style={{ gap: 12 }}>
        <T accessibilityRole="header" style={{ ...M3.type.titleLarge, color: c.onSurface }}>سجل التعديلات</T>
        {!relevant.length && <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>لم تسجل تعديلات على هذه العملية.</T>}
        {relevant.map(change => <View key={change.id} style={{ padding: 16, gap: 8, backgroundColor: c.surfaceContainerLow, borderRadius: 12 }}>
          <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>{change.kind === 'void' ? 'إلغاء تسجيل' : change.kind === 'restore' ? 'إعادة العملية' : 'تعديل'} · {stamp(change.at)}</T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{describeChange(change, people)}</T>
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

function describeChange(change: LedgerChange, people: Person[]): string {
  if (change.kind === 'void') return 'أُخرجت العملية من الأرصدة مع الاحتفاظ ببياناتها.';
  if (change.kind === 'restore') return 'أُعيدت العملية إلى الأرصدة.';
  const a = change.before, b = change.after, lines: string[] = [];
  if (a.amount !== b.amount) lines.push(`المبلغ: من ${fmt(a.amount)} إلى ${fmt(b.amount)} ر.س`);
  if (a.createdAt !== b.createdAt) lines.push(`تاريخ العملية: من ${arDate(a.createdAt)} إلى ${arDate(b.createdAt)}`);
  if (a.personId !== b.personId) lines.push(`الشخص: من ${people.find(p => p.id === a.personId)?.name} إلى ${people.find(p => p.id === b.personId)?.name}`);
  if (a.dir !== b.dir) lines.push(`الاتجاه: ${b.dir === 'me' ? 'يدين لي' : 'أدين له'}`);
  if (a.debtId !== b.debtId) lines.push('تغيّر الدين المرتبط بالعملية.');
  if (a.note !== b.note) lines.push(`الملاحظة السابقة: ${a.note || 'بدون'}\nالملاحظة الجديدة: ${b.note || 'بدون'}`);
  if (a.dueAt !== b.dueAt) lines.push(`الموعد: من ${a.dueAt ? arDate(a.dueAt) : 'بدون'} إلى ${b.dueAt ? arDate(b.dueAt) : 'بدون'}`);
  if (JSON.stringify(a.installments) !== JSON.stringify(b.installments)) {
    const schedule = (tx: Tx) => tx.installments?.map((row, index) => `${index + 1}: ${fmt(row.amount)} ر.س · ${arDate(row.dueAt)}`).join('\n') || 'بدون أقساط';
    lines.push(`جدول الأقساط السابق:\n${schedule(a)}\nجدول الأقساط الجديد:\n${schedule(b)}`);
  }
  return lines.join('\n') || 'حُدثت بيانات العملية.';
}
