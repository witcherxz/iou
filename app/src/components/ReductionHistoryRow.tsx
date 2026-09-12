import React from 'react';
import { View } from 'react-native';
import { arDate, fmt } from '../format';
import { Colors, M3 } from '../theme';
import { Reduction } from '../types';
import { MaterialIcon } from './icons';
import { T, Touch } from './ui';

/** Keep the recorded kind visible even when the note contains payment wording. */
export function ReductionHistoryRow({ c, entry, debtDirection, accessibilityLabel, onPress }: {
  c: Colors; entry: Reduction; debtDirection?: 'me' | 'owe';
  accessibilityLabel: string; onPress: () => void;
}) {
  const forgiven = entry.dir === 'forgive';
  const cancelled = !!entry.voidedAt;
  const title = forgiven
    ? debtDirection === 'me' ? 'إعفاء للشخص' : debtDirection === 'owe' ? 'إعفاء من الشخص' : 'إعفاء من الدين'
    : debtDirection === 'me' ? 'دفعة مستلمة' : debtDirection === 'owe' ? 'دفعة مدفوعة' : 'دفعة مالية';
  const color = cancelled ? c.onSurfaceVariant : forgiven ? c.primary : debtDirection === 'me' ? c.green : debtDirection === 'owe' ? c.red : c.onSurface;
  const iconBg = cancelled ? c.surfaceContainerHigh : forgiven ? c.primaryContainer : debtDirection === 'me' ? c.greenBg : debtDirection === 'owe' ? c.errorContainer : c.surfaceContainerHigh;
  const iconFg = cancelled ? c.onSurfaceVariant : forgiven ? c.onPrimaryContainer : debtDirection === 'me' ? c.onGreenContainer : debtDirection === 'owe' ? c.onErrorContainer : c.onSurfaceVariant;
  return <Touch onPress={onPress} accessibilityLabel={accessibilityLabel}
    accessibilityHint={`${title}، ${arDate(entry.createdAt)}${cancelled ? '، ملغاة ولا تُحتسب في الرصيد' : '، اضغط للتعديل'}`}
    pressedBackground={c.surfaceContainerHigh}
    style={{ paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: c.outlineVariant }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcon name={cancelled ? 'close' : forgiven ? 'description' : 'payments'} color={iconFg} size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T style={{ ...M3.type.titleMedium, fontWeight: '700', color }}>{title}</T>
        <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>{arDate(entry.createdAt)}</T>
      </View>
      <MaterialIcon name="edit" color={c.onSurfaceVariant} size={18} />
    </View>
    <View style={{ gap: 4 }}>
      <T style={{ ...M3.type.labelMedium, color: c.onSurfaceVariant }}>{forgiven ? 'مبلغ الإعفاء' : 'مبلغ الدفعة'}</T>
      <T numberOfLines={1} adjustsFontSizeToFit
        style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color, textDecorationLine: cancelled ? 'line-through' : undefined }}>
        {fmt(entry.amount)} ر.س
      </T>
      {!!entry.note && <T numberOfLines={2} style={{ ...M3.type.bodyMedium, color: c.onSurface }}>{forgiven ? 'السبب' : 'ملاحظة'}: {entry.note}</T>}
      {cancelled && <T style={{ ...M3.type.labelMedium, color: c.onSurfaceVariant }}>عملية ملغاة · لا تُحتسب في الرصيد</T>}
    </View>
  </Touch>;
}
