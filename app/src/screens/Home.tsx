import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemeGlyph } from '../components/icons';
import { Avatar, Badge, T, Touch } from '../components/ui';
import { arDateWithWeekday, fmt, todayISO } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';

export type PeopleFilter = 'all' | 'me' | 'owe';

const FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'me', label: 'لي' },
  { id: 'owe', label: 'عليّ' },
];

interface Props {
  c: Colors;
  dark: boolean;
  people: PersonView[];
  debts: DebtView[];
  filter: PeopleFilter;
  onFilter: (f: PeopleFilter) => void;
  onToggleDark: () => void;
  onOpenPerson: (id: string) => void;
  onOpenDebt: (id: string) => void;
  onGoIou: () => void;
  onGoUome: () => void;
}

export function Home({
  c, dark, people, debts, filter, onFilter, onToggleDark, onOpenPerson, onOpenDebt, onGoIou, onGoUome,
}: Props) {
  const owedMe = people.filter(p => p.bal > 0).reduce((x, p) => x + p.bal, 0);
  const iOwe = people.filter(p => p.bal < 0).reduce((x, p) => x - p.bal, 0);
  const iouCount = debts.filter(d => d.dir === 'me' && !d.paid).length;
  const uomeCount = debts.filter(d => d.dir === 'owe' && !d.paid).length;

  const dueSoon = debts.filter(d => !d.paid && d.dueIn <= 7).sort((a, b) => a.dueIn - b.dueIn);
  const shown = people.filter(p => filter === 'all' || (filter === 'me' ? p.bal > 0 : p.bal < 0));

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 100, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 48 }}>
        <View>
          <T style={{ fontSize: 22, fontWeight: '700', color: c.text }}>لوحة الديون</T>
          <T style={{ fontSize: 12, color: c.muted }}>{arDateWithWeekday(todayISO())}</T>
        </View>
        <Pressable
          onPress={onToggleDark}
          accessibilityRole="button"
          accessibilityLabel="تبديل الوضع الداكن"
          style={{
            width: 40, height: 40, borderRadius: 20, backgroundColor: c.card,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border,
          }}
        >
          <ThemeGlyph dark={dark} cardBg={c.card} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TotalCard
          label="يدينون لي" amount={owedMe} count={iouCount}
          bg={c.greenBg} fg={c.green} onPress={onGoIou}
        />
        <TotalCard
          label="أدين لهم" amount={iOwe} count={uomeCount}
          bg={c.redBg} fg={c.red} onPress={onGoUome}
        />
      </View>

      {dueSoon.length > 0 && (
        <View>
          <T style={{ fontSize: 15, fontWeight: '600', marginBottom: 10, color: c.text }}>مستحقات قريبة</T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 4 }}
          >
            {dueSoon.map(d => (
              <Touch
                key={d.id}
                onPress={() => onOpenDebt(d.id)}
                pressedBackground={c.cardHover}
                style={{
                  width: 170, backgroundColor: c.card, borderRadius: 16, padding: 14,
                  borderWidth: 1, borderColor: d.border,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge label={d.badge} bg={d.badgeBg} fg={d.badgeFg} />
                  <T style={{ fontSize: 11, color: c.muted }}>{d.dueDateLabel}</T>
                </View>
                <T style={{ fontSize: 14, fontWeight: '600', marginTop: 10, color: c.text }} numberOfLines={1}>
                  {d.note}
                </T>
                <T style={{ fontSize: 18, fontWeight: '700', color: d.color, marginTop: 6 }}>
                  {d.amountLabel} ر.س
                </T>
              </Touch>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <T style={{ fontSize: 16, fontWeight: '600', color: c.text }}>الأشخاص</T>
        <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 3 }}>
          {FILTERS.map(f => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => onFilter(f.id)}
                style={{
                  height: 30, paddingHorizontal: 12, borderRadius: 11,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? c.primary : 'transparent',
                }}
              >
                <T style={{ fontSize: 12, fontWeight: '600', color: on ? '#fff' : c.muted }}>{f.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {shown.map(p => (
          <Touch
            key={p.id}
            onPress={() => onOpenPerson(p.id)}
            pressedBackground={c.cardHover}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
            }}
          >
            <Avatar initial={p.initial} size={44} radius={22} bg={p.avatarBg} fg={p.avatarFg} fontSize={16} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>{p.name}</T>
              <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{p.sub}</T>
            </View>
            <View style={{ gap: 2, alignItems: 'flex-end' }}>
              {p.hasIou && (
                <T style={{ fontSize: 14, fontWeight: '700', color: c.green }}>لي {p.iouLabel}</T>
              )}
              {p.hasUome && (
                <T style={{ fontSize: 14, fontWeight: '700', color: c.red }}>عليّ {p.uomeLabel}</T>
              )}
            </View>
          </Touch>
        ))}
        {shown.length === 0 && (
          <T style={{ paddingVertical: 40, textAlign: 'center', color: c.muted, fontSize: 14 }}>
            لا يوجد أشخاص هنا
          </T>
        )}
      </View>
    </ScrollView>
  );

  function TotalCard({
    label, amount, count, bg, fg, onPress,
  }: { label: string; amount: number; count: number; bg: string; fg: string; onPress: () => void }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1, backgroundColor: bg, borderRadius: 20,
          paddingVertical: 18, paddingHorizontal: 16, opacity: pressed ? 0.85 : 1,
        })}
      >
        <T style={{ fontSize: 13, color: fg, fontWeight: '600' }}>{label}</T>
        <T style={{ fontSize: 30, fontWeight: '700', color: fg, marginTop: 6 }}>{fmt(amount)}</T>
        <T style={{ fontSize: 12, color: fg, opacity: 0.8 }}>ر.س · {fmt(count, 0)} ديون</T>
      </Pressable>
    );
  }
}
