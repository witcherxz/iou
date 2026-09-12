import React from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar, Badge, OutlineButton, PrimaryButton, ScreenHeader, T, Touch } from '../components/ui';
import { arDate, fmt } from '../format';
import { DebtView } from '../selectors';
import { Colors } from '../theme';
import { Tx } from '../types';

interface Props {
  c: Colors;
  debt: DebtView;
  payments: Tx[];
  onBack: () => void;
  onPay: () => void;
  onMarkPaid: () => void;
  onPayInstallment: (amount: number) => void;
}

export function DebtDetail({ c, debt, payments, onBack, onPay, onMarkPaid, onPayInstallment }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="تفاصيل الدين" glyph="→" onBack={onBack} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ backgroundColor: debt.heroBg, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ backgroundColor: debt.badgeBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
              <T style={{ fontSize: 12, fontWeight: '600', color: debt.badgeFg }}>{debt.badge}</T>
            </View>
            <T style={{ fontSize: 12, color: debt.color }}>{debt.dirLong}</T>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <Avatar initial={debt.initial} size={48} radius={14} bg={debt.avatarBg} fg={debt.avatarFg} fontSize={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontSize: 17, fontWeight: '600', color: c.text }} numberOfLines={1}>{debt.personName}</T>
              <T style={{ fontSize: 13, color: c.muted }} numberOfLines={1}>{debt.note} · {debt.dateLabel}</T>
            </View>
          </View>

          <T style={{ fontSize: 40, fontWeight: '700', color: debt.color, lineHeight: 44, marginTop: 18 }}>
            {debt.remainingLabel} <T style={{ fontSize: 16, color: debt.color }}>ر.س</T>
          </T>
          <T style={{ fontSize: 12, color: c.muted, marginTop: 6 }}>المتبقي من {debt.amountLabel} ر.س</T>

          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track, marginTop: 14, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: debt.pct, backgroundColor: debt.color, borderRadius: 3 }} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <View>
            <T style={{ fontSize: 13, color: c.muted }}>تاريخ الاستحقاق</T>
            <T style={{ fontSize: 15, fontWeight: '600', color: c.text, marginTop: 2 }}>{debt.dueDateLabel}</T>
          </View>
          <T style={{ fontSize: 13, fontWeight: '600', color: debt.dueColor }}>{debt.dueLabel}</T>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="تسجيل دفعة"
              height={48}
              c={c}
              disabled={debt.paid}
              background={debt.payBg}
              onPress={onPay}
            />
          </View>
          {debt.paid ? (
            <View style={{ flex: 1, opacity: 0.5 }}>
              <OutlineButton label="تحديد كمسدد" height={48} c={c} onPress={() => {}} />
            </View>
          ) : (
            <OutlineButton label="تحديد كمسدد" height={48} c={c} onPress={onMarkPaid} />
          )}
        </View>

        {debt.hasSchedule && debt.schedule && (
          <View>
            <T style={{ fontSize: 15, fontWeight: '600', marginBottom: 10, color: c.text }}>
              جدول السداد{' '}
              <T style={{ fontWeight: '400', color: c.muted, fontSize: 13 }}>· {debt.scheduleFreqLabel}</T>
            </T>
            <View style={{ gap: 8 }}>
              {debt.schedule.map(ins => (
                <Touch
                  key={ins.index}
                  onPress={() => !ins.paid && onPayInstallment(ins.amount)}
                  pressedBackground={c.cardHover}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: c.card, borderRadius: 14,
                    paddingVertical: 12, paddingHorizontal: 14, opacity: ins.opacity,
                  }}
                >
                  <View
                    style={{
                      width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: ins.dotColor,
                      backgroundColor: ins.dotFill, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <T style={{ color: '#fff', fontSize: 13 }}>{ins.check}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                      دفعة {ins.n} من {ins.total}
                    </T>
                    <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{ins.dueLabel}</T>
                  </View>
                  <T style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{ins.amountLabel}</T>
                </Touch>
              ))}
            </View>
          </View>
        )}

        <T style={{ fontSize: 15, fontWeight: '600', color: c.text }}>سجل الدفعات</T>
        <View>
          {payments.map(p => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 12, paddingHorizontal: 4,
                borderBottomWidth: 1, borderBottomColor: c.divider,
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} />
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 14, fontWeight: '500', color: c.text }}>دفعة</T>
                <T style={{ fontSize: 12, color: c.muted }}>{arDate(p.createdAt)}</T>
              </View>
              <T style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{fmt(p.amount)}</T>
            </View>
          ))}
          {payments.length === 0 && (
            <T style={{ paddingVertical: 20, color: c.muted, fontSize: 13 }}>لا توجد دفعات بعد</T>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
