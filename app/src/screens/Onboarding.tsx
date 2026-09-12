import React, { useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton, T } from '../components/ui';
import { Colors } from '../theme';

const STEPS = [
  {
    title: 'دفتر ديون خاص بك',
    body: 'سجّل من يدين لك ومن تدين له بالريال السعودي. كل شيء يبقى على جهازك.',
    cta: 'التالي',
  },
  {
    title: 'كل شخص، كل عملية',
    body: 'رصيد لكل شخص مع سجل كامل، وتسوية كاملة أو جزئية بضغطة.',
    cta: 'التالي',
  },
  {
    title: 'نسخ احتياطي إلى Google Drive',
    body: 'فعّل النسخ التلقائي حتى لا تفقد بياناتك عند تغيير الجهاز.',
    cta: 'ابدأ',
  },
];

export function Onboarding({ c, onDone }: { c: Colors; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  return (
    <View style={{ flex: 1, paddingTop: 48, paddingHorizontal: 28, paddingBottom: 28 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 28 }}>
        <View
          style={{
            width: 72, height: 72, borderRadius: 20, backgroundColor: c.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T style={{ color: '#fff', fontWeight: '700', fontSize: 26 }}>ر.س</T>
        </View>

        <View>
          <T style={{ fontSize: 32, fontWeight: '700', lineHeight: 40, color: c.text }}>{s.title}</T>
          <T style={{ fontSize: 16, color: c.muted, marginTop: 12, lineHeight: 27 }}>{s.body}</T>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                height: 6, borderRadius: 3,
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
    </View>
  );
}
