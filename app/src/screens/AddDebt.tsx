import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AmountInput, applyKey, isValidAmountInput, Keypad, normalizeAmountInput } from '../components/Keypad';
import { TransactionDateField } from '../components/TransactionDateField';
import { Chip, MaterialPressable, OutlinedField, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { addDays, addMonths, arDate, fmt, isCalendarDate, todayISO } from '../format';
import { Colors } from '../theme';
import { Person } from '../types';

type Dir = 'me' | 'owe';
type Plan = 'single' | 'install';

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
  initialDir: Dir;
  initialPersonId: string | null;
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
    transactionDate?: string;
  }) => boolean | Promise<boolean>;
}

export function AddDebt({ c, people, initialDir, initialPersonId, onClose, onAddPerson, onSave }: Props) {
  const [dir, setDir] = useState<Dir>(initialDir);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [personId, setPersonId] = useState<string | null>(initialPersonId);
  const [plan, setPlan] = useState<Plan>('single');
  const [dueDays, setDueDays] = useState<number | null>(7);
  const [installN, setInstallN] = useState(3);
  const [newPersonMode, setNewPersonMode] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [customDate, setCustomDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const validAmount = isValidAmountInput(amount);
  const amt = validAmount ? Number(amount) : 0;
  const color = dir === 'me' ? c.green : c.red;
  const dateIsValid = isCalendarDate(dateText);
  const installmentAmountIsValid = plan === 'single' || Math.round(amt * 100) >= installN;
  const transactionDateValid = isCalendarDate(transactionDate) && transactionDate <= todayISO();
  const baseDate = transactionDateValid ? transactionDate : todayISO();
  const dueDateValid = dateIsValid && dateText >= transactionDate;
  const canSave = validAmount && !!personId && transactionDateValid && installmentAmountIsValid && (!customDate || dueDateValid);
  const selectedDueAt = customDate ? dateText : dueDays === null ? null : dueDays === 30 ? addMonths(baseDate, 1) : addDays(baseDate, dueDays);
  const totalCents = Math.round(amt * 100);
  const perInstallment = Math.floor(totalCents / installN) / 100;
  const lastInstallment = (totalCents - Math.floor(totalCents / installN) * (installN - 1)) / 100;

  const confirmNewPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    const existing = people.find(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id ?? onAddPerson(name);
    if (!id) {
      setError('تعذرت إضافة الشخص. حاول مرة أخرى.');
      return;
    }
    setPersonId(id);
    setError('');
    setNewPersonMode(false);
    setNewPersonName('');
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
          onChange={setDir}
          options={[{ value: 'me', label: 'يدين لي' }, { value: 'owe', label: 'أدين له' }]}
        />

        <AmountInput
          value={amount} onChange={setAmount} label="المبلغ" c={c} color={color}
          error={amount !== '' && !validAmount ? 'أدخل مبلغاً أكبر من صفر، بحد أقصى منزلتين عشريتين و9 أرقام قبل الفاصلة.' : undefined}
        />

        <TransactionDateField c={c} label="تاريخ الدين" value={transactionDate} onChange={setTransactionDate} />

        <View>
          <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>الشخص</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {people.map(p => (
              <Chip
                key={p.id}
                label={p.name}
                selected={personId === p.id}
                onPress={() => setPersonId(p.id)}
                c={c}
              />
            ))}
            <Chip label="+ شخص جديد" dashed onPress={() => setNewPersonMode(true)} c={c} />
          </View>

          {newPersonMode && (
            <View style={{ gap: 12, marginTop: 16 }}>
              <OutlinedField
                c={c}
                label="اسم الشخص"
                value={newPersonName}
                onChangeText={setNewPersonName}
                onSubmitEditing={confirmNewPerson}
                accessibilityLabel="اسم الشخص الجديد"
                maxLength={100}
                returnKeyType="done"
                autoFocus
              />
              <PrimaryButton label="إضافة" c={c} onPress={confirmNewPerson} disabled={!newPersonName.trim()} />
            </View>
          )}
        </View>

        <View>
          <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>طريقة السداد</T>
          <Segment
            c={c}
            value={plan}
            onChange={value => { setPlan(value); if (value === 'install' && dueDays === null) setDueDays(30); }}
            options={[{ value: 'single', label: 'دفعة واحدة' }, { value: 'install', label: 'دفعات مقسّطة' }]}
          />
        </View>

        {plan === 'install' && (
          <>
            <View>
              <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>عدد الدفعات (شهرياً)</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Stepper c={c} glyph="−" disabled={installN <= 2} onPress={() => setInstallN(n => Math.max(2, n - 1))} />
                <T style={{ flex: 1, textAlign: 'center', fontSize: 24, lineHeight: 32, fontWeight: '500', color: c.onSurface }}>
                  {fmt(installN, 0)}
                </T>
                <Stepper c={c} glyph="+" disabled={installN >= 36} onPress={() => setInstallN(n => Math.min(36, n + 1))} />
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

          <View>
            <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.onSurfaceVariant, marginBottom: 8 }}>{plan === 'install' ? 'تاريخ أول دفعة' : 'تاريخ الاستحقاق'}</T>
            <T style={{ fontSize: 12, lineHeight: 20, color: c.onSurfaceVariant, marginBottom: 8 }}>تُحسب المدة من تاريخ الدين الفعلي.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DUE_CHIPS.filter(ch => plan === 'single' || ch.days !== null).map(ch => (
                <Chip
                  key={String(ch.days)}
                  label={ch.label}
                  selected={!customDate && dueDays === ch.days}
                  onPress={() => { setDueDays(ch.days); setCustomDate(false); }}
                  c={c}
                />
              ))}
              <Chip label="تاريخ آخر" selected={customDate} onPress={() => setCustomDate(true)} c={c} />
            </View>
            {customDate ? (
              <OutlinedField
                c={c}
                label={plan === 'install' ? 'تاريخ أول دفعة' : 'تاريخ الاستحقاق'}
                value={dateText}
                onChangeText={text => setDateText(normalizeAmountInput(text))}
                accessibilityLabel={plan === 'install' ? 'تاريخ أول دفعة، سنة ثم شهر ثم يوم' : 'تاريخ الاستحقاق، سنة ثم شهر ثم يوم'}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                maxLength={10}
                containerStyle={{ marginTop: 16 }}
                style={{ textAlign: 'left', writingDirection: 'ltr' }}
                error={!!dateText && !dueDateValid}
                helperText={dateText && !dateIsValid ? 'أدخل تاريخاً ميلادياً صحيحاً، مثل \u20662026-09-25\u2069.' : dateIsValid && !dueDateValid ? 'لا يمكن أن يسبق الاستحقاق تاريخ الدين.' : 'تاريخ ميلادي: السنة-الشهر-اليوم، مثل \u20662026-09-25\u2069.'}
              />
            ) : (
              <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant, marginTop: 8 }}>
                {selectedDueAt === null ? 'يمكنك تسجيل السداد في أي وقت.' : `${plan === 'install' ? 'أول دفعة' : 'الاستحقاق'}: ${arDate(selectedDueAt)}`}
              </T>
            )}
          </View>

        <OutlinedField
          c={c}
          label="ملاحظة (اختياري)"
          value={note}
          onChangeText={setNote}
          accessibilityLabel="ملاحظة عن الدين، اختياري"
          maxLength={500}
          placeholder="مثال: غداء، تذاكر، سلفة"
        />

        <View style={{ marginTop: 'auto' }}>
          <Keypad c={c} onKey={k => setAmount(v => applyKey(v, k))} />
        </View>

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
              const saved = await onSave({
                personId: personId!, dir, amount: amt, note: note.trim(),
                dueInDays: plan === 'install' && dueDays === null ? 30 : dueDays,
                dueAt: selectedDueAt,
                installmentCount: plan === 'install' ? installN : undefined,
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
