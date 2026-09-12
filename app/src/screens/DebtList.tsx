import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar, Badge, T, Touch } from '../components/ui';
import { fmt } from '../format';
import { DebtView } from '../selectors';
import { Colors } from '../theme';

export type StatusFilter = 'open' | 'over' | 'paid' | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'مفتوح' },
  { id: 'over', label: 'متأخر' },
  { id: 'paid', label: 'مسدد' },
  { id: 'all', label: 'الكل' },
];

interface Props {
  c: Colors;
  debts: DebtView[];
  dir: 'me' | 'owe';
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  onOpenDebt: (id: string) => void;
}

export function DebtList({ c, debts, dir, status, onStatus, onOpenDebt }: Props) {
  const all = debts.filter(d => d.dir === dir);
  const items = all
    .filter(d => (status === 'all' ? true : status === 'open' ? !d.paid : status === 'over' ? d.over : d.paid))
    .sort((a, b) => a.dueIn - b.dueIn);

  const title = dir === 'me' ? 'يدينون لي' : 'أدين لهم';
  const color = dir === 'me' ? c.green : c.red;
  const total = all.reduce((x, d) => x + d.rem, 0);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <T style={{ fontSize: 22, fontWeight: '700', color: c.text }}>{title}</T>
          <T style={{ fontSize: 12, color: c.muted }}>
            {fmt(all.filter(d => !d.paid).length, 0)} ديون مفتوحة
          </T>
        </View>
        <T style={{ fontSize: 20, fontWeight: '700', color }}>
          {fmt(total)} <T style={{ fontSize: 12, color }}>ر.س</T>
        </T>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTERS.map(f => {
          const on = status === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onStatus(f.id)}
              style={{
                height: 34, paddingHorizontal: 14, borderRadius: 17,
                alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                borderColor: on ? c.primary : c.border,
                backgroundColor: on ? c.primary : c.card,
              }}
            >
              <T style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : c.text }}>{f.label}</T>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        {items.map(d => (
          <Touch
            key={d.id}
            onPress={() => onOpenDebt(d.id)}
            pressedBackground={c.cardHover}
            style={{
              backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
              borderWidth: 1, borderColor: d.border,
            }}
          >
            <Avatar initial={d.initial} size={44} radius={14} bg={d.avatarBg} fg={d.avatarFg} fontSize={16} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>
                {d.personName} <T style={{ fontWeight: '400', color: c.muted, fontSize: 15 }}>· {d.note}</T>
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Badge label={d.badge} bg={d.badgeBg} fg={d.badgeFg} />
                <T style={{ fontSize: 12, color: c.muted }}>{d.dueLabel}</T>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontSize: 17, fontWeight: '700', color: d.color }}>{d.remainingLabel}</T>
              <T style={{ fontSize: 11, color: c.muted }}>من {d.amountLabel}</T>
            </View>
          </Touch>
        ))}

        {items.length === 0 && (
          <T style={{ paddingVertical: 40, textAlign: 'center', color: c.muted, fontSize: 14 }}>
            لا توجد ديون هنا
          </T>
        )}
      </View>
    </ScrollView>
  );
}
