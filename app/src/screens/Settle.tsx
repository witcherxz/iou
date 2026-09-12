import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { MaterialIcon } from '../components/icons';
import { AmountInput, applyKey, isValidAmountInput, Keypad } from '../components/Keypad';
import { OutlinedField, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { TransactionDateField } from '../components/TransactionDateField';
import { calendarISO, fmt, isCalendarDate, localDate, todayISO } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';

type Mode = 'full' | 'partial';
type PaymentDirection = 'me' | 'owe';

interface Props {
  c: Colors;
  person: PersonView;
  /** When set, the payment is applied to this debt only. */
  targetDebt: DebtView | null;
  debts: DebtView[];
  initialMode: Mode;
  initialAmount: string;
  onBack: () => void;
  onConfirm: (amount: number, dir: PaymentDirection, transactionDate: string, note: string) => number | Promise<number>;
  onHome: () => void;
}

export function Settle({
  c, person, targetDebt, debts, initialMode, initialAmount, onBack, onConfirm, onHome,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [raw, setRaw] = useState(initialAmount);
  const [dir, setDir] = useState<PaymentDirection>(targetDebt?.dir === 'owe' || (!targetDebt && !person.hasIou) ? 'owe' : 'me');
  const [result, setResult] = useState<{ amount: number; remaining: number; dir: PaymentDirection } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISO);
  const [note, setNote] = useState('');
  const savingRef = useRef(false);

  const validDate = isCalendarDate(transactionDate) && transactionDate <= todayISO();
  const eligible = debts.filter(d => d.personId === person.id && d.dir === dir && !d.paid && calendarISO(localDate(d.createdAt)) <= transactionDate);
  const max = targetDebt ? eligible.some(d => d.id === targetDebt.id) ? targetDebt.rem : 0
    : Math.round(eligible.reduce((sum, d) => sum + Math.round(d.rem * 100), 0)) / 100;
  const totalRemaining = targetDebt ? targetDebt.rem : debts.filter(d => d.personId === person.id && d.dir === dir)
    .reduce((sum, d) => sum + Math.round(d.rem * 100), 0) / 100;
  const amount = mode === 'full' ? max : isValidAmountInput(raw) ? Number(raw) : 0;
  const canConfirm = validDate && amount > 0 && Math.round(amount * 100) <= Math.round(max * 100);
  const color = dir === 'me' ? c.green : c.red;
  const actionLabel = dir === 'me' ? 'استلمت من' : 'دفعت إلى';

  if (result) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={`دفعة مع ${person.name}`} glyph="→" onBack={onBack} c={c} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.greenBg, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcon name="check" color={c.onGreenContainer} size={40} />
          </View>
          <T accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', color: c.onSurface }}>تم تسجيل الدفعة</T>
          <T accessibilityLiveRegion="polite" style={{ fontSize: 16, color: c.onSurfaceVariant, lineHeight: 24, textAlign: 'center' }}>
            {result.dir === 'me' ? 'استلمت من' : 'دفعت إلى'} {person.name}: {fmt(result.amount)} ر.س.{ '\n' }
            {targetDebt ? 'المتبقي من هذا الدين' : result.dir === 'me' ? 'المتبقي لك لدى هذا الشخص' : 'المتبقي عليك لهذا الشخص'}: {fmt(result.remaining)} ر.س
          </T>
          <View style={{ marginTop: 12, width: '100%' }}>
            <PrimaryButton label="العودة للرئيسية" height={48} c={c} onPress={onHome} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={`تسجيل دفعة مع ${person.name}`} glyph="→" onBack={onBack} c={c} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24, gap: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!targetDebt && person.hasIou && person.hasUome && (
          <View style={{ gap: 8 }}>
            <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>لديك ديون في الاتجاهين. اختر الدفعة التي حدثت فعلاً.</T>
            <Segment
              c={c} value={dir}
              onChange={value => { setDir(value); setRaw(''); setError(''); }}
              options={[{ value: 'me', label: 'استلمت منه' }, { value: 'owe', label: 'دفعت له' }]}
            />
          </View>
        )}

        <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 24, padding: 20, gap: 8 }}>
          <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{max !== totalRemaining ? 'القابل للسداد في تاريخ الدفعة' : dir === 'me' ? 'المتبقي لي' : 'المتبقي عليّ'}{targetDebt ? ` · ${targetDebt.note || 'هذا الدين'}` : ''}</T>
          <T style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', color }}>{fmt(max)} ر.س</T>
          {max !== totalRemaining && <T style={{ fontSize: 14, lineHeight: 22, color: c.onSurfaceVariant }}>إجمالي المتبقي حالياً: {fmt(totalRemaining)} ر.س</T>}
          {!targetDebt && <T style={{ fontSize: 12, color: c.onSurfaceVariant, lineHeight: 20 }}>تُوزّع الدفعة على ديون هذا الاتجاه الموجودة في تاريخ الدفعة، بدءاً بالأقدم.</T>}
        </View>

        <Segment
          c={c} value={mode} onChange={value => { setMode(value); setError(''); }}
          options={[{ value: 'full', label: 'المبلغ كامل' }, { value: 'partial', label: 'جزء من المبلغ' }]}
        />
        <AmountInput
          value={mode === 'full' ? String(max) : raw} onChange={setRaw} label="مبلغ الدفعة" c={c} color={color} editable={mode === 'partial'}
          error={mode === 'partial' && raw !== '' && !isValidAmountInput(raw)
            ? 'أدخل مبلغاً أكبر من صفر، بحد أقصى منزلتين عشريتين.'
            : mode === 'partial' && amount > max ? `المبلغ أكبر من المتبقي (${fmt(max)} ر.س).` : undefined}
        />

        {mode === 'partial' && <Keypad c={c} onKey={key => setRaw(value => applyKey(value, key))} />}

        <TransactionDateField c={c} label="تاريخ الدفعة" value={transactionDate} onChange={setTransactionDate} />
        {validDate && max === 0 && <T style={{ color: c.error, fontSize: 14, lineHeight: 22 }}>لا يوجد دين قابل للسداد في هذا التاريخ. لا يمكن أن تسبق الدفعة تاريخ الدين.</T>}
        <OutlinedField c={c} label="ملاحظة الدفعة (اختياري)" accessibilityLabel="ملاحظة الدفعة" value={note} onChangeText={setNote}
          maxLength={500} placeholder="مثال: تحويل بنكي، نقداً" />

        <View style={{ marginTop: 'auto', gap: 12 }}>
          {!!error && <T accessibilityRole="alert" style={{ color: c.red, fontSize: 14, lineHeight: 20 }}>{error}</T>}
          {canConfirm && <T style={{ color: c.onSurfaceVariant, fontSize: 14, lineHeight: 24 }}>{actionLabel} {person.name} مبلغ {fmt(amount)} ر.س. سيبقى {fmt(Math.max(0, totalRemaining - amount))} ر.س {targetDebt ? 'من هذا الدين' : 'في هذا الاتجاه'}.</T>}
          <PrimaryButton
            label="تأكيد تسجيل الدفعة" c={c} disabled={!canConfirm} loading={saving}
            onPress={async () => {
              if (!canConfirm || savingRef.current) return;
              savingRef.current = true;
              setSaving(true);
              setError('');
              try {
                const recorded = await onConfirm(amount, dir, transactionDate, note);
                if (recorded > 0) {
                  setResult({ amount: recorded, remaining: Math.max(0, Math.round((totalRemaining - recorded) * 100) / 100), dir });
                } else {
                  setError('لم تُسجّل الدفعة. تحقق من المبلغ المتبقي وحاول مرة أخرى.');
                }
              } catch {
                setError('تعذر تسجيل الدفعة. حاول مرة أخرى.');
              } finally {
                savingRef.current = false;
                setSaving(false);
              }
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
