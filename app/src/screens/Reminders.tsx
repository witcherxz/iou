import React from 'react';
import { ScrollView, View } from 'react-native';

import { T, Toggle } from '../components/ui';
import { arDate, AR_WEEKDAYS, fmt } from '../format';
import { DebtView } from '../selectors';
import { Colors } from '../theme';

interface Props {
  c: Colors;
  debts: DebtView[];
  prefs: Record<string, boolean>;
  weekly: boolean;
  onToggle: (debtId: string, on: boolean) => void;
  onToggleWeekly: () => void;
}

/** Weekday name inside the coming week, otherwise a plain date. */
function dayLabel(dueAt: string | null | undefined, dueIn: number): string {
  if (!dueAt) return 'بدون';
  if (dueIn >= 0 && dueIn < 7) return AR_WEEKDAYS[new Date(dueAt).getDay()];
  return arDate(dueAt);
}

export function Reminders({ c, debts, prefs, weekly, onToggle, onToggleWeekly }: Props) {
  // One reminder per open debt with a due date, soonest first.
  const items = debts
    .filter(d => !d.paid && d.dueAt)
    .sort((a, b) => a.dueIn - b.dueIn);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: 48, justifyContent: 'center' }}>
        <T style={{ fontSize: 22, fontWeight: '700', color: c.text }}>التذكيرات</T>
      </View>

      <T style={{ fontSize: 13, color: c.muted, lineHeight: 21 }}>
        تذكيرات خاصة لك فقط. لا يتم إرسال أي شيء للطرف الآخر.
      </T>

      <View style={{ gap: 8 }}>
        {items.map(d => (
          <View
            key={d.id}
            style={{
              backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
            }}
          >
            <View
              style={{
                width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryBg,
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <T style={{ fontSize: 12, fontWeight: '700', color: c.primary, textAlign: 'center', lineHeight: 14 }}>
                {dayLabel(d.dueAt, d.dueIn)}
              </T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>
                {d.dir === 'me' ? `متابعة ${d.personName}` : `سداد ${d.personName}`}
              </T>
              <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }} numberOfLines={1}>
                {fmt(d.rem)} ر.س · {d.note}
              </T>
            </View>
            <Toggle on={prefs[d.id] ?? true} onToggle={() => onToggle(d.id, !(prefs[d.id] ?? true))} c={c} />
          </View>
        ))}

        {items.length === 0 && (
          <T style={{ paddingVertical: 40, textAlign: 'center', color: c.muted, fontSize: 14 }}>
            لا توجد ديون تحتاج تذكيراً
          </T>
        )}
      </View>

      <View
        style={{
          backgroundColor: c.card, borderRadius: 16, padding: 16,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <View>
          <T style={{ fontSize: 14, fontWeight: '600', color: c.text }}>تذكير أسبوعي عام</T>
          <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>كل خميس، ٨:٠٠ م</T>
        </View>
        <Toggle on={weekly} onToggle={onToggleWeekly} c={c} />
      </View>
    </ScrollView>
  );
}
