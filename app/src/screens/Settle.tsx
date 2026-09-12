import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { applyKey, Keypad } from '../components/Keypad';
import { PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { fmt } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';

type Mode = 'full' | 'partial';

interface Props {
  c: Colors;
  person: PersonView;
  /** When set, the settlement is applied to this debt only. */
  targetDebt: DebtView | null;
  initialMode: Mode;
  initialAmount: string;
  onBack: () => void;
  onConfirm: (amount: number) => void;
  onHome: () => void;
}

export function Settle({
  c, person, targetDebt, initialMode, initialAmount, onBack, onConfirm, onHome,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [raw, setRaw] = useState(initialAmount);
  const [done, setDone] = useState(false);
  const [settled, setSettled] = useState(0);

  const max = targetDebt ? targetDebt.rem : Math.abs(person.bal);
  const amount = mode === 'full' ? max : parseFloat(raw) || 0;
  const canConfirm = amount > 0 && amount <= max;

  if (done) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={`تسوية مع ${person.name}`} glyph="→" onBack={onBack} c={c} />
        <View
          style={{
            flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16,
            paddingHorizontal: 20, paddingBottom: 24,
          }}
        >
          <View
            style={{
              width: 88, height: 88, borderRadius: 44, backgroundColor: c.greenBg,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <T style={{ color: c.green, fontSize: 40 }}>✓</T>
          </View>
          <T style={{ fontSize: 24, fontWeight: '700', color: c.text }}>تمت التسوية</T>
          <T style={{ fontSize: 14, color: c.muted, lineHeight: 24, textAlign: 'center' }}>
            تم تسجيل {fmt(settled)} ر.س مع {person.name}.{'\n'}
            الرصيد المتبقي: {person.amountLabel} ر.س
          </T>
          <View style={{ marginTop: 12 }}>
            <View style={{ paddingHorizontal: 32 }}>
              <PrimaryButton label="العودة للرئيسية" height={48} c={c} onPress={onHome} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={`تسوية مع ${person.name}`} glyph="→" onBack={onBack} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24, gap: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: c.card, borderRadius: 20, padding: 18,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <T style={{ fontSize: 14, color: c.muted }}>
            {targetDebt ? targetDebt.dirLong : person.dirLong}
          </T>
          <T style={{ fontSize: 20, fontWeight: '700', color: targetDebt ? targetDebt.color : person.color }}>
            {fmt(max)} ر.س
          </T>
        </View>

        <Segment
          c={c}
          value={mode}
          onChange={setMode}
          options={[{ value: 'full', label: 'المبلغ كامل' }, { value: 'partial', label: 'جزء من المبلغ' }]}
        />

        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <T style={{ fontSize: 13, color: c.muted }}>مبلغ التسوية</T>
          <T style={{ fontSize: 52, fontWeight: '700', color: c.text, lineHeight: 58, marginTop: 6 }}>
            {fmt(amount)} <T style={{ fontSize: 18, color: c.muted }}>ر.س</T>
          </T>
        </View>

        {mode === 'partial' && <Keypad c={c} onKey={k => setRaw(v => applyKey(v, k))} />}

        <View style={{ marginTop: 'auto' }}>
          <PrimaryButton
            label="تأكيد التسوية"
            c={c}
            disabled={!canConfirm}
            onPress={() => {
              if (!canConfirm) return;
              onConfirm(amount);
              setSettled(amount);
              setDone(true);
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}
