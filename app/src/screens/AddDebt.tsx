import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AmountInput, isValidAmountInput, normalizeAmountInput } from '../components/Keypad';
import { DateField } from '../components/DatePicker';
import { TransactionDateField } from '../components/TransactionDateField';
import { Chip, MaterialPressable, OutlineButton, OutlinedField, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { addDays, addMonths, arDate, fmt, isCalendarDate, todayISO } from '../format';
import { buildCustomSchedule, customScheduleIssue, CustomScheduleRow } from '../installmentSchedule';
import { Colors } from '../theme';
import { Person } from '../types';

type Dir = 'me' | 'owe';
type Plan = 'single' | 'install' | 'custom';

export interface AddDebtDraft {
  dir: Dir;
  amount: string;
  note: string;
  personId: string | null;
  plan: Plan;
  dueDays: number | null;
  installN: number;
  customRows: CustomScheduleRow[];
  newPersonMode: boolean;
  newPersonName: string;
  customDate: boolean;
  dateText: string;
  transactionDate: string;
}

export function createAddDebtDraft(dir: Dir = 'me', personId: string | null = null): AddDebtDraft {
  return {
    dir, personId, amount: '', note: '', plan: 'single', dueDays: 7, installN: 3,
    customRows: [{ amount: '', dueAt: addMonths(todayISO(), 1) }, { amount: '', dueAt: addMonths(todayISO(), 2) }],
    newPersonMode: false, newPersonName: '', customDate: false, dateText: '', transactionDate: todayISO(),
  };
}

const DUE_CHIPS: { days: number | null; label: string }[] = [
  { days: 0, label: 'نفس اليوم' },
  { days: 7, label: 'بعد أسبوع' },
  { days: 14, label: 'بعد أسبوعين' },
  { days: 30, label: 'بعد شهر' },
  { days: null, label: 'بدون' },
];

interface Props {
  c: Colors;
  people: Person[];
  draft: AddDebtDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<AddDebtDraft>>;
  onClose: () => void;
  onAddPerson: (name: string) => string;
  onSave: (input: {
    personId: string;
    dir: Dir;
    amount: number;
    note: string;
    dueInDays: number | null;
    dueAt?: string | null;
    installmentCount?: number;
    schedule?: { amount: number; dueAt: string }[];
    transactionDate?: string;
  }) => boolean | Promise<boolean>;
}

export function AddDebt({ c, people, draft, onDraftChange, onClose, onAddPerson, onSave }: Props) {
  const { dir, amount, note, personId, plan, dueDays, installN, customRows, newPersonMode, newPersonName, customDate, dateText, transactionDate } = draft;
  const updateDraft = (patch: Partial<AddDebtDraft>) => onDraftChange(current => ({ ...current, ...patch }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const validAmount = isValidAmountInput(amount);
  const amt = validAmount ? Number(amount) : 0;
  const color = dir === 'me' ? c.green : c.red;
  const dateIsValid = isCalendarDate(dateText);
  const installmentAmountIsValid = plan !== 'install' || Math.round(amt * 100) >= installN;
  const transactionDateValid = isCalendarDate(transactionDate) && transactionDate <= todayISO();
  const baseDate = transactionDateValid ? transactionDate : todayISO();
  const dueDateValid = dateIsValid && dateText >= transactionDate;
  const totalCents = Math.round(amt * 100);
  const scheduleIssue = plan === 'custom' ? customScheduleIssue(customRows, totalCents, transactionDate) : '';
  const allocatedCents = customRows.reduce((sum, row) => sum + (isValidAmountInput(row.amount) ? Math.round(Number(row.amount) * 100) : 0), 0);
  const canSave = validAmount && people.some(person => person.id === personId) && !newPersonMode && transactionDateValid && installmentAmountIsValid &&
    (plan === 'custom' ? !scheduleIssue : !customDate || dueDateValid);
  const selectedDueAt = customDate ? dateText : dueDays === null ? null : dueDays === 30 ? addMonths(baseDate, 1) : addDays(baseDate, dueDays);
  const perInstallment = Math.floor(totalCents / installN) / 100;
  const lastInstallment = (totalCents - Math.floor(totalCents / installN) * (installN - 1)) / 100;

  const updateRow = (index: number, patch: Partial<CustomScheduleRow>) => onDraftChange(current => ({
    ...current, customRows: current.customRows.map((row, i) => i === index ? { ...row, ...patch } : row),
  }));
  const addRow = () => onDraftChange(current => {
    const last = current.customRows[current.customRows.length - 1]?.dueAt;
    const left = totalCents - current.customRows.reduce((sum, row) => sum + (isValidAmountInput(row.amount) ? Math.round(Number(row.amount) * 100) : 0), 0);
    return { ...current, customRows: [...current.customRows, {
      amount: left > 0 ? String(left / 100) : '',
      dueAt: last && isCalendarDate(last) ? addMonths(last, 1) : '',
    }] };
  });
  const removeRow = (index: number) => onDraftChange(current => ({ ...current, customRows: current.customRows.filter((_, i) => i !== index) }));

  const confirmNewPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    const existing = people.find(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id ?? onAddPerson(name);
    if (!id) {
      setError('تعذرت إضافة الشخص. حاول مرة أخرى.');
      return;
    }
    updateDraft({ personId: id, newPersonMode: false, newPersonName: '' });
    setError('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="دين جديد" glyph="✕" onBack={onClose} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24, gap: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Segment
          c={c}
          value={dir}
          onChange={dir => updateDraft({ dir })}
          options={[{ value: 'me', label: 'يدين لي' }, { value: 'owe', label: 'أدين له' }]}
        />

        <AmountInput
          value={amount} onChange={amount => updateDraft({ amount })} label="المبلغ" c={c} color={color}
          error={amount !== '' && !validAmount ? 'أدخل مبلغاً أكبر من صفر، بحد أقصى منزلتين عشريتين و9 أرقام قبل الفاصلة.' : undefined}
        />

        <TransactionDateField c={c} label="تاريخ الدين" value={transactionDate} onChange={transactionDate => updateDraft({ transactionDate })} />

        <View>
          <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>الشخص</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {people.map(p => (
              <Chip
                key={p.id}
                label={p.name}
                selected={personId === p.id}
                onPress={() => updateDraft({ personId: p.id })}
                c={c}
              />
            ))}
            <Chip label="+ شخص جديد" dashed onPress={() => updateDraft({ newPersonMode: true })} c={c} />
          </View>

          {newPersonMode && (
            <View style={{ gap: 12, marginTop: 16 }}>
              <OutlinedField
                c={c}
                label="اسم الشخص"
                value={newPersonName}
                onChangeText={newPersonName => updateDraft({ newPersonName })}
                onSubmitEditing={confirmNewPerson}
                accessibilityLabel="اسم الشخص الجديد"
                maxLength={100}
                returnKeyType="done"
                autoFocus
              />
              <PrimaryButton label="إضافة" c={c} onPress={confirmNewPerson} disabled={!newPersonName.trim()} />
              <OutlineButton label="إلغاء إضافة الشخص" c={c} onPress={() => {
                updateDraft({ newPersonMode: false, newPersonName: '' });
                setError('');
              }} />
            </View>
          )}
        </View>

        <View>
          <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>طريقة السداد</T>
          <Segment
            c={c}
            value={plan}
            onChange={plan => updateDraft({ plan, dueDays: plan === 'install' && dueDays === null ? 30 : dueDays })}
            options={[{ value: 'single', label: 'دفعة واحدة' }, { value: 'install', label: 'أقساط شهرية' }, { value: 'custom', label: 'مخصص' }]}
          />
        </View>

        {plan === 'custom' && (
          <View style={{ gap: 12 }}>
            <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>
              حدد مبلغ وتاريخ كل دفعة. يمكن أن تختلف المبالغ والفترات بين الدفعات، وتُرتب حسب التاريخ عند الحفظ.
            </T>
            {customRows.map((row, index) => (
              <View key={index} style={{ padding: 12, gap: 8, borderRadius: 12, backgroundColor: c.surfaceContainerLow }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T style={{ fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.onSurface }}>دفعة {fmt(index + 1, 0)}</T>
                  {customRows.length > 2 && (
                    <MaterialPressable c={c} onPress={() => removeRow(index)} accessibilityRole="button"
                      accessibilityLabel={`حذف الدفعة ${index + 1}`}
                      style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                      <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.red }}>حذف</T>
                    </MaterialPressable>
                  )}
                </View>
                <OutlinedField
                  c={c} label="المبلغ" value={row.amount} keyboardType="decimal-pad" inputMode="decimal"
                  accessibilityLabel={`مبلغ الدفعة ${index + 1}`}
                  onChangeText={value => updateRow(index, { amount: normalizeAmountInput(value) })}
                  error={!!row.amount && !isValidAmountInput(row.amount)}
                />
                <DateField
                  c={c} label={`تاريخ الدفعة ${index + 1}`} value={row.dueAt} min={transactionDateValid ? transactionDate : undefined}
                  onChange={dueAt => updateRow(index, { dueAt })}
                  error={!!row.dueAt && (!isCalendarDate(row.dueAt) || row.dueAt < transactionDate)}
                />
              </View>
            ))}
            {customRows.length < 120 && <OutlineButton label="+ إضافة دفعة" c={c} onPress={addRow} />}
            <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 12, padding: 16, gap: 4 }}>
              <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>
                الموزع {fmt(allocatedCents / 100)} من {fmt(amt)} ر.س على {fmt(customRows.length, 0)} دفعات.
              </T>
              {!!scheduleIssue && validAmount && <T style={{ color: c.red, fontSize: 14, lineHeight: 20 }}>{scheduleIssue}</T>}
            </View>
          </View>
        )}

        {plan === 'install' && (
          <>
            <View>
              <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>عدد الدفعات (شهرياً)</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Stepper c={c} glyph="−" disabled={installN <= 2} onPress={() => onDraftChange(current => ({ ...current, installN: Math.max(2, current.installN - 1) }))} />
                <T style={{ flex: 1, textAlign: 'center', fontSize: 24, lineHeight: 32, fontWeight: '500', color: c.onSurface }}>
                  {fmt(installN, 0)}
                </T>
                <Stepper c={c} glyph="+" disabled={installN >= 36} onPress={() => onDraftChange(current => ({ ...current, installN: Math.min(36, current.installN + 1) }))} />
              </View>
            </View>
            <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 12, padding: 16 }}>
              <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>
                {fmt(installN, 0)} دفعات شهرية. قيمة الدفعة {fmt(perInstallment)} ر.س
                {lastInstallment !== perInstallment ? `، والأخيرة ${fmt(lastInstallment)} ر.س` : ''}.
              </T>
              {!installmentAmountIsValid && amt > 0 && <T style={{ color: c.red, fontSize: 14, lineHeight: 20 }}>يجب أن تكون كل دفعة هللة واحدة على الأقل.</T>}
            </View>
          </>
        )}

        {plan !== 'custom' && (
          <View>
            <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>{plan === 'install' ? 'تاريخ أول دفعة' : 'تاريخ الاستحقاق'}</T>
            <T style={{ fontSize: 12, lineHeight: 20, color: c.onSurfaceVariant, marginBottom: 8 }}>تُحسب المدة من تاريخ الدين الفعلي.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DUE_CHIPS.filter(ch => plan === 'single' || ch.days !== null).map(ch => (
                <Chip
                  key={String(ch.days)}
                  label={ch.label}
                  selected={!customDate && dueDays === ch.days}
                  onPress={() => updateDraft({ dueDays: ch.days, customDate: false })}
                  c={c}
                />
              ))}
              <Chip label="تاريخ آخر" selected={customDate} onPress={() => updateDraft({ customDate: true, dateText: dateText || selectedDueAt || baseDate })} c={c} />
            </View>
            {customDate ? (
              <View style={{ marginTop: 8 }}>
                <DateField
                  c={c}
                  label={plan === 'install' ? 'تاريخ أول دفعة' : 'تاريخ الاستحقاق'}
                  value={dateText}
                  min={transactionDateValid ? transactionDate : undefined}
                  onChange={dateText => updateDraft({ dateText })}
                  error={!!dateText && !dueDateValid}
                  helperText={dateIsValid && !dueDateValid ? 'لا يمكن أن يسبق الاستحقاق تاريخ الدين.' : undefined}
                />
              </View>
            ) : (
              <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant, marginTop: 8 }}>
                {selectedDueAt === null ? 'يمكنك تسجيل السداد في أي وقت.' : `${plan === 'install' ? 'أول دفعة' : 'الاستحقاق'}: ${arDate(selectedDueAt)}`}
              </T>
            )}
          </View>
        )}

        <OutlinedField
          c={c}
          label="ملاحظة (اختياري)"
          value={note}
          onChangeText={note => updateDraft({ note })}
          accessibilityLabel="ملاحظة عن الدين، اختياري"
          maxLength={500}
          placeholder="مثال: غداء، تذاكر، سلفة"
        />

        {!personId && <T style={{ color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20 }}>اختر شخصاً أو أضف شخصاً جديداً لحفظ الدين.</T>}
        {!!error && <T accessibilityRole="alert" style={{ color: c.red, fontSize: 14, lineHeight: 20 }}>{error}</T>}
        <PrimaryButton
          label="حفظ الدين"
          c={c}
          disabled={!canSave}
          loading={saving}
          onPress={async () => {
            if (!canSave || savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            setError('');
            try {
              const schedule = plan === 'custom' ? buildCustomSchedule(customRows, totalCents, transactionDate)?.map(({ amount, dueAt }) => ({ amount, dueAt })) : undefined;
              if (plan === 'custom' && !schedule) return;
              const saved = await onSave({
                personId: personId!, dir, amount: amt, note: note.trim(),
                dueInDays: plan === 'install' && dueDays === null ? 30 : dueDays,
                dueAt: selectedDueAt,
                installmentCount: plan === 'install' ? installN : schedule?.length,
                schedule,
                transactionDate,
              });
              if (!saved) setError('تعذر حفظ الدين. تحقق من البيانات وحاول مرة أخرى.');
            } catch {
              setError('تعذر حفظ الدين. حاول مرة أخرى.');
            } finally {
              savingRef.current = false;
              setSaving(false);
            }
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stepper({ c, glyph, onPress, disabled }: { c: Colors; glyph: string; onPress: () => void; disabled: boolean }) {
  return (
    <MaterialPressable c={c}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={glyph === '+' ? 'زيادة عدد الدفعات' : 'تقليل عدد الدفعات'}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 48, height: 48, borderRadius: 24, opacity: disabled ? 0.38 : 1,
        backgroundColor: pressed ? c.surfaceContainerHigh : c.secondaryContainer,
        alignItems: 'center', justifyContent: 'center',
      })}
    >
      <T style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', color: c.onSecondaryContainer }}>{glyph}</T>
    </MaterialPressable>
  );
}
