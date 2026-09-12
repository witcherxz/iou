import React from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar, Badge, Chip, T, Touch } from '../components/ui';
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
  const color = dir === 'me' ? c.onGreenContainer : c.onErrorContainer;
  const total = all.reduce((x, d) => x + d.rem, 0);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 104, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ minHeight: 64, justifyContent: 'center' }}>
        <T accessibilityRole="header" style={{ fontSize: 28, lineHeight: 36, fontWeight: '400', color: c.onSurface }}>{title}</T>
        <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>
          {fmt(all.filter(d => !d.paid).length, 0)} ديون مفتوحة
        </T>
      </View>

      <View style={{ backgroundColor: dir === 'me' ? c.greenBg : c.redBg, padding: 20, borderRadius: 24, gap: 4 }}>
        <T style={{ fontSize: 14, lineHeight: 20, color }}>إجمالي المتبقي</T>
        <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: fmt(total).length > 10 ? 28 : 32, lineHeight: 40, fontWeight: '500', color }}>
          {fmt(total)} <T style={{ fontSize: 16, lineHeight: 24, color }}>ر.س</T>
        </T>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map(f => (
          <Chip key={f.id} label={f.label} selected={status === f.id} onPress={() => onStatus(f.id)} c={c} />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        {items.map(d => (
          <Touch
            key={d.id}
            onPress={() => onOpenDebt(d.id)}
            pressedBackground={c.cardHover}
            style={{
              backgroundColor: c.surfaceContainerLow, borderRadius: 12, minHeight: 88, paddingVertical: 16, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 16,
            }}
          >
            <Avatar initial={d.initial} size={40} radius={20} bg={d.avatarBg} fg={d.avatarFg} fontSize={16} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.onSurface }} numberOfLines={1}>
                {d.personName}
              </T>
              {!!d.note && <T numberOfLines={1} style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{d.note}</T>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Badge label={d.badge} bg={d.badgeBg} fg={d.badgeFg} />
                <T style={{ fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant }}>{d.dueLabel}</T>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', maxWidth: '52%' }}>
              <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: d.remainingLabel.length > 10 ? 12 : 16, lineHeight: 24, fontWeight: '600', color: d.color }}>{d.remainingLabel} <T style={{ fontSize: 12 }}>ر.س</T></T>
              <T style={{ fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant }}>من {d.amountLabel}</T>
            </View>
          </Touch>
        ))}

        {items.length === 0 && (
          <T style={{ padding: 24, textAlign: 'center', color: c.onSurfaceVariant, fontSize: 16, lineHeight: 24, backgroundColor: c.surfaceContainerLow, borderRadius: 12 }}>
            {status === 'over' ? 'لا توجد ديون متأخرة في هذا الاتجاه.' : status === 'paid' ? 'لم تُسدّد ديون في هذا الاتجاه بعد.' : status === 'open' && all.length ? 'كل الديون في هذا الاتجاه مسددة.' : 'لا توجد ديون في هذا الاتجاه. أضف ديناً من زر +.'}
          </T>
        )}
      </View>
    </ScrollView>
  );
}
