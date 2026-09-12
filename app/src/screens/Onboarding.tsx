import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PrimaryButton, T } from '../components/ui';
import { Colors } from '../theme';

const STEPS = [
  {
    title: 'دفتر ديون خاص بك',
    body: 'سجّل من يدين لك ومن تدين له بالريال السعودي. تُحفظ بياناتك على جهازك، وأنت تختار مكان نسخها احتياطياً.',
    cta: 'التالي',
  },
  {
    title: 'كل شخص، كل عملية',
    body: 'اعرف ما لك وما عليك لكل شخص، وسجّل الدفعات الكاملة أو الجزئية مع مواعيد الأقساط.',
    cta: 'التالي',
  },
  {
    title: 'احتفظ بنسخة من سجلك',
    body: 'من الإعدادات، احفظ نسخة احتياطية يمكنك استعادتها عند تغيير الجهاز. راجع تاريخ آخر نسخة ناجحة بانتظام.',
    cta: 'ابدأ',
  },
];

export function Onboarding({ c, onDone }: { c: Colors; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 48, paddingHorizontal: 24, paddingBottom: 24, gap: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
        <View
          style={{
            width: 72, height: 72, borderRadius: 24, backgroundColor: c.primaryContainer,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T style={{ color: c.onPrimaryContainer, fontWeight: '500', fontSize: 28, lineHeight: 36 }}>ر.س</T>
        </View>

        <View>
          <T accessibilityRole="header" style={{ fontSize: 28, fontWeight: '400', lineHeight: 36, color: c.onSurface }}>{s.title}</T>
          <T style={{ fontSize: 16, color: c.onSurfaceVariant, marginTop: 12, lineHeight: 24 }}>{s.body}</T>
        </View>

        <View accessibilityLabel={`الخطوة ${step + 1} من ${STEPS.length}`} style={{ flexDirection: 'row', gap: 8 }}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                height: 8, borderRadius: 4,
                width: i === step ? 24 : 8,
                backgroundColor: i === step ? c.primary : c.track,
              }}
            />
          ))}
        </View>
      </View>

      <PrimaryButton
        label={s.cta}
        c={c}
        onPress={() => (step < STEPS.length - 1 ? setStep(step + 1) : onDone())}
      />
    </ScrollView>
  );
}
