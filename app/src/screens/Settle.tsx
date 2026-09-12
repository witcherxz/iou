import React, { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { MaterialIcon } from '../components/icons';
import { AmountInput, isValidAmountInput } from '../components/Keypad';
import { OutlinedField, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { TransactionDateField } from '../components/TransactionDateField';
import { calendarISO, fmt, isCalendarDate, localDate, todayISO } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';
import { EntryKind, PaymentDirection, SettleDraft } from '../useSettleSession';

interface Props {
  c: Colors;
  person: PersonView;
  /** When set, the payment is applied to this debt only. */
  targetDebt: DebtView | null;
  debts: DebtView[];
  draft: SettleDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<SettleDraft>>;
  onBack: () => void;
  onConfirm: (amount: number, dir: PaymentDirection, transactionDate: string, note: string, kind: EntryKind) => number | Promise<number>;
  onHome: () => void;
}

export function Settle({
  c, person, targetDebt, debts, draft, onDraftChange, onBack, onConfirm, onHome,
}: Props) {
  const { kind, mode, raw, dir, result, saving, error, transactionDate, note } = draft;
  const savingRef = useRef(false);
  const updateFields = (patch: Partial<SettleDraft>) => onDraftChange(current =>
    current.saving || current.result ? current : { ...current, ...patch, error: '' });

  const validDate = isCalendarDate(transactionDate) && transactionDate <= todayISO();
  const forgiveness = kind === 'forgiveness';
  const entryLabel = forgiveness ? 'الإعفاء' : 'الدفعة';
  const eligible = debts.filter(d => d.personId === person.id && d.dir === dir && !d.closed && calendarISO(localDate(d.createdAt)) <= transactionDate);
  const max = targetDebt ? eligible.some(d => d.id === targetDebt.id) ? targetDebt.rem : 0
    : Math.round(eligible.reduce((sum, d) => sum + Math.round(d.rem * 100), 0)) / 100;
  const totalRemaining = targetDebt ? targetDebt.rem : debts.filter(d => d.personId === person.id && d.dir === dir)
    .reduce((sum, d) => sum + Math.round(d.rem * 100), 0) / 100;
  const amount = mode === 'full' ? max : isValidAmountInput(raw) ? Number(raw) : 0;
  const canConfirm = !saving && !result && validDate && amount > 0 && Math.round(amount * 100) <= Math.round(max * 100);
  const color = forgiveness ? c.primary : dir === 'me' ? c.green : c.red;
  const describe = (value: number, direction: PaymentDirection, type: EntryKind) => type === 'forgiveness'
    ? `${direction === 'me' ? 'أعفيت' : 'أعفاني'} ${person.name} من ${fmt(value)} ر.س`
    : `${direction === 'me' ? 'استلمت من' : 'دفعت إلى'} ${person.name} مبلغ ${fmt(value)} ر.س`;

  if (result) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={`${result.kind === 'forgiveness' ? 'إعفاء' : 'دفعة'} مع ${person.name}`} glyph="→" onBack={onBack} c={c} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.greenBg, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcon name="check" color={c.onGreenContainer} size={40} />
          </View>
          <T accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', color: c.onSurface }}>تم تسجيل {result.kind === 'forgiveness' ? 'الإعفاء' : 'الدفعة'}</T>
          <T accessibilityLiveRegion="polite" style={{ fontSize: 16, color: c.onSurfaceVariant, lineHeight: 24, textAlign: 'center' }}>
            {describe(result.amount, result.dir, result.kind)}.{ '\n' }
            {targetDebt ? 'المتبقي من هذا الدين' : result.dir === 'me' ? 'المتبقي لك لدى هذا الشخص' : 'المتبقي عليك لهذا الشخص'}: {fmt(result.remaining)} ر.س
          </T>
          {result.kind === 'forgiveness' && <T style={{ fontSize: 14, color: c.onSurfaceVariant, lineHeight: 22, textAlign: 'center' }}>الإعفاء محفوظ في السجل بشكل مستقل عن الدفعات. يمكنك تعديله أو إلغاء تسجيله من السجل.</T>}
          <View style={{ marginTop: 12, width: '100%' }}>
            <PrimaryButton label="العودة للرئيسية" height={48} c={c} onPress={onHome} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={`${forgiveness ? 'تسجيل إعفاء' : 'تسجيل دفعة'} مع ${person.name}`} glyph="→" onBack={onBack} c={c} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24, gap: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 8 }}>
          <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>نوع العملية</T>
          <Segment c={c} value={kind} onChange={kind => updateFields({ kind })}
            options={[{ value: 'payment', label: 'دفعة مالية' }, { value: 'forgiveness', label: 'إعفاء من الدين' }]} />
          {forgiveness && <T style={{ fontSize: 14, lineHeight: 22, color: c.onSurfaceVariant }}>سجّل المبلغ الذي تم التنازل عنه، كاملاً أو جزئياً. يُخفض المتبقي ويظهر كإعفاء مستقل في السجل والتقارير.</T>}
        </View>
        {!targetDebt && person.hasIou && person.hasUome && (
          <View style={{ gap: 8 }}>
            <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>لديك ديون في الاتجاهين. اختر اتجاه {entryLabel}.</T>
            <Segment
              c={c} value={dir}
              onChange={dir => updateFields({ dir, raw: '' })}
              options={forgiveness ? [{ value: 'me', label: 'أعفيته' }, { value: 'owe', label: 'أعفاني' }]
                : [{ value: 'me', label: 'استلمت منه' }, { value: 'owe', label: 'دفعت له' }]}
            />
          </View>
        )}

        <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 24, padding: 20, gap: 8 }}>
          <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{max !== totalRemaining ? `المبلغ المتاح في تاريخ ${entryLabel}` : dir === 'me' ? 'المتبقي لي' : 'المتبقي عليّ'}{targetDebt ? ` · ${targetDebt.note || 'هذا الدين'}` : ''}</T>
          <T style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', color }}>{fmt(max)} ر.س</T>
          {max !== totalRemaining && <T style={{ fontSize: 14, lineHeight: 22, color: c.onSurfaceVariant }}>إجمالي المتبقي حالياً: {fmt(totalRemaining)} ر.س</T>}
          {!targetDebt && <T style={{ fontSize: 12, color: c.onSurfaceVariant, lineHeight: 20 }}>يُوزّع مبلغ {entryLabel} على ديون هذا الاتجاه الموجودة في تاريخ العملية، بدءاً بالأقدم.</T>}
        </View>

        <Segment
          c={c} value={mode} onChange={mode => updateFields({ mode })}
          options={[{ value: 'full', label: 'المبلغ كامل' }, { value: 'partial', label: 'جزء من المبلغ' }]}
        />
        <AmountInput
          value={mode === 'full' ? String(max) : raw} onChange={raw => updateFields({ raw })} label={`مبلغ ${entryLabel}`} c={c} color={color} editable={mode === 'partial' && !saving}
          error={mode === 'partial' && raw !== '' && !isValidAmountInput(raw)
            ? 'أدخل مبلغاً أكبر من صفر، بحد أقصى منزلتين عشريتين.'
            : mode === 'partial' && amount > max ? `المبلغ أكبر من المتبقي (${fmt(max)} ر.س).` : undefined}
        />

        <TransactionDateField c={c} label={`تاريخ ${entryLabel}`} value={transactionDate} onChange={transactionDate => updateFields({ transactionDate })} />
        {validDate && max === 0 && <T style={{ color: c.error, fontSize: 14, lineHeight: 22 }}>لا يوجد دين متبقٍ في هذا التاريخ. لا يمكن أن يسبق تاريخ العملية تاريخ الدين.</T>}
        <OutlinedField c={c} label={forgiveness ? 'سبب الإعفاء (اختياري)' : 'ملاحظة الدفعة (اختياري)'} accessibilityLabel={forgiveness ? 'سبب الإعفاء' : 'ملاحظة الدفعة'} value={note} onChangeText={note => updateFields({ note })} editable={!saving}
          maxLength={500} placeholder={forgiveness ? 'اكتب سبب التنازل أو الاتفاق' : 'مثال: تحويل بنكي، نقداً'} />

        <View style={{ marginTop: 'auto', gap: 12 }}>
          {!!error && <T accessibilityRole="alert" style={{ color: c.red, fontSize: 14, lineHeight: 20 }}>{error}</T>}
          {canConfirm && <T style={{ color: c.onSurfaceVariant, fontSize: 14, lineHeight: 24 }}>{describe(amount, dir, kind)}. سيبقى {fmt(Math.max(0, totalRemaining - amount))} ر.س {targetDebt ? 'من هذا الدين' : 'في هذا الاتجاه'}.</T>}
          <PrimaryButton
            label={`تأكيد تسجيل ${entryLabel}`} c={c} disabled={!canConfirm} loading={saving}
            onPress={async () => {
              if (!canConfirm || savingRef.current) return;
              savingRef.current = true;
              onDraftChange(current => ({ ...current, saving: true, error: '' }));
              try {
                const recorded = await onConfirm(amount, dir, transactionDate, note, kind);
                if (recorded > 0) {
                  onDraftChange(current => ({ ...current, saving: false,
                    result: { amount: recorded, remaining: Math.max(0, Math.round((totalRemaining - recorded) * 100) / 100), dir, kind } }));
                } else {
                  onDraftChange(current => ({ ...current, saving: false, error: `لم يتم تسجيل ${entryLabel}. تحقق من المبلغ المتبقي وحاول مرة أخرى.` }));
                }
              } catch {
                onDraftChange(current => ({ ...current, saving: false, error: `تعذر تسجيل ${entryLabel}. حاول مرة أخرى.` }));
              } finally {
                savingRef.current = false;
              }
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
