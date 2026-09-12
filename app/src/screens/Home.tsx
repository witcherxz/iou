import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemeGlyph } from '../components/icons';
import { Avatar, Badge, MaterialPressable, OutlineButton, T, Touch } from '../components/ui';
import { arDateWithWeekday, fmt, todayISO } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';

interface Props {
  c: Colors;
  dark: boolean;
  people: PersonView[];
  debts: DebtView[];
  onToggleDark: () => void;
  onOpenPerson: (id: string) => void;
  onOpenDebt: (id: string) => void;
  onGoIou: () => void;
  onGoUome: () => void;
}

export function Home({
  c, dark, people, debts, onToggleDark, onOpenPerson, onOpenDebt, onGoIou, onGoUome,
}: Props) {
  const { width } = useWindowDimensions();
  const [showAllDue, setShowAllDue] = useState(false);
  const owedMe = people.reduce((total, person) => total + person.iouAmt, 0);
  const iOwe = people.reduce((total, person) => total + person.uomeAmt, 0);
  const iouCount = debts.filter(d => d.dir === 'me' && !d.closed).length;
  const uomeCount = debts.filter(d => d.dir === 'owe' && !d.closed).length;

  const dueSoon = debts.filter(d => !d.closed && d.dueIn <= 7).sort((a, b) => a.dueIn - b.dueIn);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 104, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, gap: 16 }}>
        <View style={{ flex: 1 }}>
          <T accessibilityRole="header" style={{ fontSize: 28, lineHeight: 36, fontWeight: '400', color: c.onSurface }}>لوحة الديون</T>
          <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{arDateWithWeekday(todayISO())}</T>
        </View>
        <MaterialPressable c={c}
          onPress={onToggleDark}
          accessibilityRole="button"
          accessibilityLabel={dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
          style={{
            width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceContainerHigh,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ThemeGlyph dark={dark} cardBg={c.surfaceContainerHigh} color={c.onSurfaceVariant} />
        </MaterialPressable>
      </View>

      <View style={{ flexDirection: width < 480 && Math.max(fmt(owedMe).length, fmt(iOwe).length) > 10 ? 'column' : 'row', gap: 12 }}>
        <TotalCard
          label="يدينون لي" amount={owedMe} count={iouCount}
          bg={c.greenBg} fg={c.onGreenContainer} onPress={onGoIou}
        />
        <TotalCard
          label="أدين لهم" amount={iOwe} count={uomeCount}
          bg={c.redBg} fg={c.onErrorContainer} onPress={onGoUome}
        />
      </View>

      {dueSoon.length > 0 && (
        <View style={{ gap: 12 }}>
          <T accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', color: c.onSurface }}>المستحق قريباً والمتأخر</T>
          <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 12, overflow: 'hidden' }}>
            {(showAllDue ? dueSoon : dueSoon.slice(0, 3)).map((d, index) => (
              <Touch
                key={d.id}
                onPress={() => onOpenDebt(d.id)}
                accessibilityLabel={`${d.personName}، ${d.dirLong}، ${d.remainingLabel} ريال سعودي، ${d.dueLabel}`}
                pressedBackground={c.surfaceContainerHigh}
                style={{
                  minHeight: 88, padding: 16, gap: 8,
                  borderTopWidth: index ? 1 : 0, borderTopColor: c.outlineVariant,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <T style={{ flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.onSurface }}>
                    {d.personName}
                  </T>
                  <T style={{ maxWidth: '60%', fontSize: d.remainingLabel.length > 10 ? 14 : 16, lineHeight: 24, fontWeight: '600', color: d.color }} numberOfLines={1} adjustsFontSizeToFit>
                    {d.remainingLabel} ر.س
                  </T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Badge label={d.badge} bg={d.badgeBg} fg={d.badgeFg} />
                  <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{d.dirLong} · {d.dueDateLabel}</T>
                </View>
              </Touch>
            ))}
          </View>
          {dueSoon.length > 3 && (
            <OutlineButton
              c={c}
              label={showAllDue ? 'عرض أقل' : `عرض كل المستحقات (${fmt(dueSoon.length, 0)})`}
              onPress={() => setShowAllDue(value => !value)}
            />
          )}
        </View>
      )}

      <View style={{ gap: 12 }}>
        <T accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', color: c.onSurface }}>الأشخاص</T>
        <View style={{ gap: 8 }}>
          {people.map(p => (
            <Touch
              key={p.id}
              onPress={() => onOpenPerson(p.id)}
              pressedBackground={c.cardHover}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 16,
                backgroundColor: c.surfaceContainerLow, borderRadius: 12, minHeight: 88, paddingVertical: 16, paddingHorizontal: 16,
              }}
            >
              <Avatar initial={p.initial} size={40} radius={20} bg={p.avatarBg} fg={p.avatarFg} fontSize={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={{ fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.onSurface }}>{p.name}</T>
                <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant, marginTop: 4 }}>{p.sub}</T>
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end', maxWidth: '52%' }}>
                {p.hasIou && (
                  <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: p.iouLabel.length > 10 ? 12 : 14, lineHeight: 20, fontWeight: '600', color: c.green }}>لي {p.iouLabel}</T>
                )}
                {p.hasUome && (
                  <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: p.uomeLabel.length > 10 ? 12 : 14, lineHeight: 20, fontWeight: '600', color: c.red }}>عليّ {p.uomeLabel}</T>
                )}
              </View>
            </Touch>
          ))}
          {people.length === 0 && (
            <T style={{ padding: 24, textAlign: 'center', color: c.onSurfaceVariant, fontSize: 16, lineHeight: 24, backgroundColor: c.surfaceContainerLow, borderRadius: 12 }}>
              ابدأ بإضافة أول دين من زر +. سيظهر هنا كل شخص ورصيده.
            </T>
          )}
        </View>
      </View>
    </ScrollView>
  );

  function TotalCard({
    label, amount, count, bg, fg, onPress,
  }: { label: string; amount: number; count: number; bg: string; fg: string; onPress: () => void }) {
    return (
      <MaterialPressable c={c}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${fmt(amount)} ريال سعودي، ${fmt(count, 0)} ديون`}
        style={{
          flex: 1, backgroundColor: bg, borderRadius: 24, overflow: 'hidden',
          paddingVertical: 20, paddingHorizontal: 16,
        }}
      >
        {({ pressed, hovered }) => (
          <>
            {(pressed || hovered) && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fg, opacity: pressed ? 0.12 : 0.08 }]} />}
            <T style={{ fontSize: 14, lineHeight: 20, color: fg, fontWeight: '500' }}>{label}</T>
            <T adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: fmt(amount).length > 10 ? 24 : 28, lineHeight: 36, fontWeight: '500', color: fg, marginTop: 8 }}>{fmt(amount)}</T>
            <T style={{ fontSize: 12, lineHeight: 16, color: fg, marginTop: 4 }}>ر.س · {fmt(count, 0)} ديون</T>
          </>
        )}
      </MaterialPressable>
    );
  }
}
