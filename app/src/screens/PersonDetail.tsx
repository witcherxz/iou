import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Avatar, Badge, MaterialPressable, OutlineButton, PrimaryButton, ScreenHeader, T, Touch } from '../components/ui';
import { ReductionHistoryRow } from '../components/ReductionHistoryRow';
import { MaterialIcon } from '../components/icons';
import { arDate, fmt } from '../format';
import { isDebt, isReduction } from '../ledger';
import { DebtView, PersonView } from '../selectors';
import { Colors } from '../theme';
import { Tx } from '../types';

interface Props {
  c: Colors;
  person: PersonView;
  tx: Tx[];
  debts: DebtView[];
  onBack: () => void;
  onEditName: () => void;
  onSettle: () => void;
  onAdd: () => void;
  onOpenDebt: (id: string) => void;
  onOpenEntry: (id: string) => void;
}

export function PersonDetail({ c, person, tx, debts, onBack, onEditName, onSettle, onAdd, onOpenDebt, onOpenEntry }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const heroColor = person.bal > 0 ? c.onGreenContainer : person.bal < 0 ? c.onErrorContainer : c.onSurface;
  const longBalance = Math.max(person.iouLabel.length, person.uomeLabel.length) > 10;
  // Newest first, payments included.
  const history = tx
    .filter(t => t.personId === person.id)
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface }}>
        <View style={{ flex: 1, minWidth: 0 }}><ScreenHeader title={person.name} glyph="→" onBack={onBack} c={c} /></View>
        <MaterialPressable c={c} onPress={onEditName} accessibilityRole="button" accessibilityLabel="تعديل اسم الشخص"
          style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, marginEnd: 4,
            alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surfaceContainerHigh : 'transparent' })}>
          <MaterialIcon name="edit" color={c.primary} />
        </MaterialPressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: person.heroBg, borderRadius: 24,
            paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', gap: 8,
          }}
        >
          <Avatar initial={person.initial} size={64} radius={32} bg={person.avatarBg} fg={person.avatarFg} fontSize={24} />
          <T style={{ fontSize: 14, lineHeight: 20, color: heroColor, fontWeight: '600', marginTop: 8 }}>الصافي · {person.bal === 0 && person.hasIou && person.hasUome ? 'المبالغ متساوية' : person.dirLong}</T>
          <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: person.amountLabel.length > 10 ? 28 : 36, fontWeight: '400', color: heroColor, lineHeight: 44 }}>
            {person.amountLabel} <T style={{ fontSize: 16, lineHeight: 24, color: heroColor }}>ر.س</T>
          </T>
          {(person.hasIou || person.hasUome) && (
            <View style={{ alignSelf: 'stretch', flexDirection: longBalance && width < 480 ? 'column' : 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: longBalance && width < 480 ? undefined : 1, padding: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLowest }}>
                <T style={{ fontSize: 12, lineHeight: 16, color: c.green }}>لي</T>
                <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, lineHeight: 28, fontWeight: '700', color: c.green }}>{person.iouLabel} ر.س</T>
              </View>
              <View style={{ flex: longBalance && width < 480 ? undefined : 1, padding: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLowest }}>
                <T style={{ fontSize: 12, lineHeight: 16, color: c.red }}>عليّ</T>
                <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, lineHeight: 28, fontWeight: '700', color: c.red }}>{person.uomeLabel} ر.س</T>
              </View>
            </View>
          )}
          {person.hasIou && person.hasUome && <T style={{ fontSize: 12, color: heroColor, lineHeight: 20 }}>الصافي للمقارنة فقط؛ كل دين يبقى مفتوحاً حتى إغلاقه بالسداد أو الإعفاء.</T>}
        </View>

        <View style={{ flexDirection: compact ? 'column' : 'row', gap: 12 }}>
          <View style={{ flex: compact ? undefined : 1 }}>
            <PrimaryButton label="تسجيل دفعة أو إعفاء" height={48} c={c} onPress={onSettle} disabled={!person.hasIou && !person.hasUome} />
          </View>
          <OutlineButton label="+ إضافة" height={48} c={c} onPress={onAdd} />
        </View>

        <T accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', color: c.onSurface }}>السجل</T>

        <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 12, paddingHorizontal: 16 }}>
          {history.map(t => {
            const debt = debts.find(d => d.id === (isReduction(t) ? t.debtId : t.id));
            if (isReduction(t)) {
              const originalDebt = tx.find(row => row.id === t.debtId && isDebt(row));
              const debtDirection = originalDebt?.dir === 'me' || originalDebt?.dir === 'owe' ? originalDebt.dir : undefined;
              return <ReductionHistoryRow key={t.id} c={c} entry={t} debtDirection={debtDirection}
                accessibilityLabel={`${t.voidedAt ? `عملية ملغاة · ${t.dir === 'forgive' ? 'إعفاء' : 'دفعة'}` : t.dir === 'forgive' ? 'تعديل إعفاء' : 'تعديل دفعة'}: ${t.note || ''}، ${fmt(t.amount)} ريال سعودي`}
                onPress={() => onOpenEntry(t.id)} />;
            }
            const status: [string, string, string] = t.voidedAt ? ['ملغاة', c.surfaceContainerHigh, c.onSurfaceVariant] : debt && isDebt(t)
              ? [debt.badge, debt.badgeBg, debt.badgeFg]
              : ['دين', c.surfaceContainerHigh, c.onSurfaceVariant];
            const color = t.dir === 'me' ? c.green : t.dir === 'owe' ? c.red : c.muted;
            const sign = t.dir === 'me' ? '+' : t.dir === 'owe' ? '−' : '';
            const amount = <T numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: compact ? '100%' : '52%',
              fontSize: fmt(t.amount).length > 10 ? 12 : 16, lineHeight: 24, fontWeight: '600', color,
              textDecorationLine: t.voidedAt ? 'line-through' : undefined }}>
              {sign}{fmt(t.amount)} <T style={{ fontSize: 12, lineHeight: 16 }}>ر.س</T>
            </T>;
            return (
              <Touch
                key={t.id}
                accessibilityLabel={`${t.voidedAt ? 'عملية ملغاة' : 'تفاصيل الدين'}: ${t.note || ''}، ${fmt(t.amount)} ريال سعودي`}
                onPress={() => t.voidedAt ? onOpenEntry(t.id) : debt && onOpenDebt(debt.id)}
                pressedBackground={c.surfaceContainerHigh}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  minHeight: 72, paddingVertical: 16,
                  borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
                }}
              >
                <MaterialIcon name={t.voidedAt ? 'close' : 'account_balance_wallet'} color={t.voidedAt ? c.onSurfaceVariant : color} size={22} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: c.onSurface }}>
                    {t.dir === 'me' ? 'يدين لي' : 'أدين له'}
                  </T>
                  {!!t.note && <T numberOfLines={2} style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant, marginTop: 4 }}>{t.note}</T>}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <T style={{ fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant }}>{arDate(t.createdAt)}</T>
                    <Badge label={status[0]} bg={status[1]} fg={status[2]} />
                  </View>
                  {!t.voidedAt && !!debt?.forgivenAmount && <T style={{ fontSize: 12, lineHeight: 18, color: c.onSurfaceVariant, marginTop: 8 }}>
                    مسدد {fmt(debt.paidAmount)} · معفى منه {fmt(debt.forgivenAmount)} ر.س
                  </T>}
                  {compact && <View style={{ marginTop: 8 }}>{amount}</View>}
                </View>
                {!compact && amount}
              </Touch>
            );
          })}

          {history.length === 0 && (
            <T style={{ paddingVertical: 24, color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20 }}>لا توجد عمليات بعد</T>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
