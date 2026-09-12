import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { MaterialIcon } from '../components/icons';
import { ReductionHistoryRow } from '../components/ReductionHistoryRow';
import { Avatar, Badge, OutlineButton, PrimaryButton, ScreenHeader, T, Touch } from '../components/ui';
import { fmt } from '../format';
import { DebtView } from '../selectors';
import { Colors } from '../theme';
import { isReduction, Tx } from '../types';

interface Props {
  c: Colors;
  debt: DebtView;
  payments: Tx[];
  onBack: () => void;
  onPay: () => void;
  onForgive: () => void;
  onMarkPaid: () => void;
  onPayInstallment: (amount: number) => void;
  onEdit: () => void;
  onOpenEntry: (id: string) => void;
}

export function DebtDetail({ c, debt, payments, onBack, onPay, onForgive, onMarkPaid, onPayInstallment, onEdit, onOpenEntry }: Props) {
  const compact = useWindowDimensions().width < 360;
  const heroColor = debt.dir === 'me' ? c.onGreenContainer : c.onErrorContainer;
  const nextInstallment = debt.schedule?.find(installment => !installment.closed)?.index;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="تفاصيل الدين" glyph="→" onBack={onBack} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 32, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ backgroundColor: debt.heroBg, borderRadius: 24, paddingVertical: 24, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Badge label={debt.badge} bg={debt.badgeBg} fg={debt.badgeFg} />
            <T style={{ fontSize: 12, lineHeight: 16, color: heroColor }}>{debt.dirLong}</T>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <Avatar initial={debt.initial} size={48} radius={24} bg={debt.avatarBg} fg={debt.avatarFg} fontSize={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: heroColor }} numberOfLines={1}>{debt.personName}</T>
              <T style={{ fontSize: 14, lineHeight: 20, color: heroColor }} numberOfLines={1}>{debt.note} · {debt.dateLabel}</T>
            </View>
          </View>

          <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: debt.remainingLabel.length > 10 ? 28 : 36, fontWeight: '400', color: heroColor, lineHeight: 44, marginTop: 20 }}>
            {debt.remainingLabel} <T style={{ fontSize: 16, lineHeight: 24, color: heroColor }}>ر.س</T>
          </T>
          <T style={{ fontSize: 12, lineHeight: 16, color: heroColor, marginTop: 8 }}>المتبقي من {debt.amountLabel} ر.س</T>
          {debt.forgivenAmount > 0 && <View style={{ marginTop: 16, gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcon name="payments" color={c.onSurfaceVariant} size={18} />
              <T style={{ flex: 1, fontSize: 14, lineHeight: 22, color: c.onSurface }}>المسدد: {fmt(debt.paidAmount)} ر.س</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcon name="description" color={c.primary} size={18} />
              <T style={{ flex: 1, fontSize: 14, lineHeight: 22, fontWeight: '600', color: c.primary }}>المعفى منه: {fmt(debt.forgivenAmount)} ر.س</T>
            </View>
          </View>}

          <View accessibilityRole="progressbar" accessibilityLabel="نسبة إغلاق الدين بالسداد والإعفاء" accessibilityValue={{ min: 0, max: 100, now: Math.round(parseFloat(debt.pct)) }} style={{ height: 4, borderRadius: 2, backgroundColor: c.track, marginTop: 16, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: debt.pct, backgroundColor: debt.color, borderRadius: 2 }} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: c.surfaceContainerLow, borderRadius: 12, minHeight: 72, paddingVertical: 16, paddingHorizontal: 16,
            flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <T style={{ fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant }}>{debt.hasSchedule && !debt.closed ? 'استحقاق الدفعة التالية' : 'تاريخ الاستحقاق'}</T>
            <T style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: c.onSurface, marginTop: 4 }}>{debt.dueDateLabel}</T>
          </View>
          <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: debt.dueColor, flexShrink: 1 }}>{debt.dueLabel}</T>
        </View>

        <View style={{ flexDirection: compact ? 'column' : 'row', gap: 12 }}>
          <View style={{ flex: compact ? undefined : 1 }}>
            <PrimaryButton
              label="تسجيل دفعة"
              height={48}
              c={c}
              disabled={debt.closed}
              onPress={onPay}
            />
          </View>
          <OutlineButton label={debt.closed ? 'الدين مغلق' : 'سداد المتبقي'} disabled={debt.closed} height={48} c={c} onPress={onMarkPaid} />
        </View>

        {!debt.closed && <OutlineButton c={c} label="إعفاء من الدين" onPress={onForgive} />}
        <View><OutlineButton c={c} label="تعديل الدين أو إلغاؤه" onPress={onEdit} /></View>

        {debt.hasSchedule && debt.schedule && (
          <View>
            <T style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', marginBottom: 12, color: c.onSurface }}>
              جدول السداد{' '}
              <T style={{ fontWeight: '400', color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20 }}>· {debt.scheduleFreqLabel}</T>
            </T>
            <View style={{ gap: 8 }}>
              {debt.schedule.map(ins => (
                <Touch
                  key={ins.index}
                  disabled={ins.index !== nextInstallment}
                  accessibilityState={{ disabled: ins.index !== nextInstallment }}
                  accessibilityLabel={`قسط ${ins.n}، ${ins.closed ? ins.dueLabel : `المتبقي ${ins.remainingLabel} ريال سعودي`}${ins.forgivenAmount ? `، معفى منه ${fmt(ins.forgivenAmount)} ريال سعودي` : ''}${ins.index === nextInstallment ? '، تسجيل دفعة' : ''}`}
                  onPress={() => ins.index === nextInstallment && onPayInstallment(ins.remainingAmount)}
                  pressedBackground={c.cardHover}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: c.surfaceContainerLow, borderRadius: 12,
                    minHeight: 88, paddingVertical: 16, paddingHorizontal: 16, opacity: ins.opacity,
                  }}
                >
                  <View
                    style={{
                      width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: ins.dotColor,
                      backgroundColor: ins.dotFill, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    {ins.paid ? <MaterialIcon name="check" color={c.greenBg} size={16} />
                      : ins.closed && <T style={{ color: c.onPrimary, fontSize: 16, lineHeight: 20 }}>−</T>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: c.onSurface }}>
                      دفعة {ins.n} من {ins.total}
                    </T>
                    <T style={{ fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant, marginTop: 4 }}>{ins.dueLabel}</T>
                    {ins.forgivenAmount > 0 && <T style={{ fontSize: 12, lineHeight: 18, color: c.onSurfaceVariant, marginTop: 4 }}>مسدد {fmt(ins.paidAmount)} · معفى منه {fmt(ins.forgivenAmount)} ر.س</T>}
                    {ins.index === nextInstallment && <T style={{ fontSize: 12, lineHeight: 16, color: c.primary, marginTop: 4 }}>اضغط لتسجيل المتبقي</T>}
                  </View>
                  <View style={{ maxWidth: '48%' }}>
                    <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: (ins.closed ? ins.amountLabel : ins.remainingLabel).length > 10 ? 12 : 16, lineHeight: 24, fontWeight: '700', color: c.onSurface }}>{ins.closed ? ins.amountLabel : ins.remainingLabel} ر.س</T>
                    {!ins.closed && ins.remainingAmount < ins.amount && <T style={{ fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant }}>متبقٍ من {ins.amountLabel}</T>}
                  </View>
                </Touch>
              ))}
            </View>
          </View>
        )}

        <T accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', color: c.onSurface }}>سجل الدفعات والإعفاءات</T>
        <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 12, paddingHorizontal: 16 }}>
          {payments.filter(isReduction).map(p => (
            <ReductionHistoryRow key={p.id} c={c} entry={p} debtDirection={debt.dir === 'me' ? 'me' : 'owe'}
              accessibilityLabel={`${p.dir === 'forgive' ? 'إعفاء' : 'دفعة'} ${p.voidedAt ? p.dir === 'forgive' ? 'ملغى' : 'ملغاة' : '· تعديل'}: ${fmt(p.amount)} ريال سعودي`}
              onPress={() => onOpenEntry(p.id)} />
          ))}
          {payments.length === 0 && (
            <T style={{ paddingVertical: 20, color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20 }}>لا توجد دفعات أو إعفاءات بعد</T>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
