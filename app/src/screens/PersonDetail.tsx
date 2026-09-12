import React from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar, Badge, OutlineButton, PrimaryButton, ScreenHeader, T, Touch } from '../components/ui';
import { arDate, fmt } from '../format';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';
import { Tx } from '../types';

interface Props {
  c: Colors;
  person: PersonView;
  tx: Tx[];
  debts: DebtView[];
  onBack: () => void;
  onSettle: () => void;
  onAdd: () => void;
  onOpenDebt: (id: string) => void;
}

export function PersonDetail({ c, person, tx, debts, onBack, onSettle, onAdd, onOpenDebt }: Props) {
  // Newest first, payments included.
  const history = tx
    .filter(t => t.personId === person.id)
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={person.name} glyph="→" onBack={onBack} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 120, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: person.heroBg, borderRadius: 24,
            paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 8,
          }}
        >
          <Avatar initial={person.initial} size={64} radius={32} bg={person.avatarBg} fg={person.avatarFg} fontSize={24} />
          <T style={{ fontSize: 13, color: person.color, fontWeight: '600', marginTop: 6 }}>{person.dirLong}</T>
          <T style={{ fontSize: 40, fontWeight: '700', color: person.color, lineHeight: 44 }}>
            {person.amountLabel} <T style={{ fontSize: 16, color: person.color }}>ر.س</T>
          </T>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="تسوية" height={48} c={c} onPress={onSettle} disabled={person.bal === 0} />
          </View>
          <OutlineButton label="+ إضافة" height={48} c={c} onPress={onAdd} />
        </View>

        <T style={{ fontSize: 15, fontWeight: '600', color: c.text }}>السجل</T>

        <View style={{ gap: 2 }}>
          {history.map(t => {
            const debt = t.dir === 'settle' ? null : debts.find(d => d.id === t.id);
            const status: [string, string, string] = debt
              ? [debt.badge, debt.badgeBg, debt.badgeFg]
              : ['دفعة', c.primaryBg, c.primary];
            const color = t.dir === 'me' ? c.green : t.dir === 'owe' ? c.red : c.muted;
            const sign = t.dir === 'me' ? '+' : t.dir === 'owe' ? '−' : '';
            return (
              <Touch
                key={t.id}
                onPress={() => debt && onOpenDebt(debt.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 12, paddingHorizontal: 4,
                  borderBottomWidth: 1, borderBottomColor: c.divider,
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, flexShrink: 0 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontSize: 14, fontWeight: '500', color: c.text }} numberOfLines={1}>
                    {t.note ?? 'دفعة'}
                  </T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <T style={{ fontSize: 12, color: c.muted }}>{arDate(t.createdAt)}</T>
                    <Badge label={status[0]} bg={status[1]} fg={status[2]} />
                  </View>
                </View>
                <T style={{ fontSize: 15, fontWeight: '600', color }}>
                  {sign}{fmt(t.amount)}
                </T>
              </Touch>
            );
          })}

          {history.length === 0 && (
            <T style={{ paddingVertical: 24, color: c.muted, fontSize: 13 }}>لا توجد عمليات بعد</T>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
