import React, { useId, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Colors, FONT } from '../theme';
import { MaterialPressable, T } from './ui';
import { MaterialIcon } from './icons';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Keep Arabic and Persian keyboard entry equivalent to the on-screen keypad. */
export function normalizeAmountInput(value: string): string {
  return value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/٫/g, '.');
}

export function isValidAmountInput(value: string): boolean {
  return /^\d{1,9}(\.\d{0,2})?$/.test(value) && Number(value) > 0;
}

export function AmountInput({ value, onChange, label, c, color, editable = true, error }: {
  value: string; onChange: (value: string) => void; label: string; c: Colors; color?: string; editable?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  return (
    <View style={{ gap: 4 }}>
      <View style={{
        paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8,
        borderTopLeftRadius: 4, borderTopRightRadius: 4,
        backgroundColor: c.surfaceContainerHighest,
        borderBottomWidth: 2,
        borderBottomColor: error ? c.red : focused ? c.primary : c.outline,
      }}>
        <T style={{ fontSize: 12, lineHeight: 16, color: error ? c.red : focused ? c.primary : c.onSurfaceVariant }}>{label}</T>
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TextInput
            value={value}
            onChangeText={text => onChange(normalizeAmountInput(text))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={`${label} بالريال السعودي`}
            accessibilityHint={error}
            aria-describedby={error ? errorId : undefined}
            editable={editable}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={32}
            placeholder="0"
            placeholderTextColor={c.onSurfaceVariant}
            selectionColor={c.primary}
            style={{
              flex: 1, minWidth: 0, minHeight: 60, paddingHorizontal: 0, paddingVertical: 4,
              fontSize: value.length > 9 ? 28 : 36, fontFamily: FONT.medium,
              color: error ? c.red : color ?? c.onSurface, textAlign: 'center', writingDirection: 'ltr',
            }}
          />
          <T style={{ fontSize: 16, lineHeight: 24, color: c.onSurfaceVariant }}>ر.س</T>
        </View>
      </View>
      {!!error && <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignItems: 'flex-start' }}><MaterialIcon name="error" color={c.red} size={16} /><T nativeID={errorId} accessibilityRole="alert" style={{ flex: 1, color: c.red, fontSize: 12, lineHeight: 16 }}>{error}</T></View>}
    </View>
  );
}

/** Never allow a keypad entry to acquire fractions of a halala. */
export function applyKey(value: string, key: string): string {
  if (key === '⌫') return value.slice(0, -1);
  if (key === '.') return value.includes('.') || !/^\d{0,9}$/.test(value) ? value : (value || '0') + '.';
  if (!/^\d$/.test(key)) return value;
  const next = value === '0' ? key : value + key;
  return /^\d{1,9}(\.\d{0,2})?$/.test(next) ? next : value;
}

export function Keypad({ onKey, c }: { onKey: (key: string) => void; c: Colors }) {
  return (
    <View style={{ direction: 'ltr', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {KEYS.map(k => (
        <MaterialPressable c={c}
          key={k}
          onPress={() => onKey(k)}
          accessibilityRole="button"
          accessibilityLabel={k === '⌫' ? 'حذف آخر رقم' : k === '.' ? 'فاصلة عشرية' : k}
          // Leave enough room for two 8dp gaps even at 320dp screen widths.
          style={({ pressed }) => ({
            width: '30%',
            flexGrow: 1,
            height: 56,
            borderRadius: 28,
            backgroundColor: pressed ? c.surfaceContainerHigh : k === '⌫' ? c.secondaryContainer : c.surfaceContainerLow,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          {k === '⌫' ? <MaterialIcon name="backspace" color={c.onSecondaryContainer} /> : <T style={{ fontSize: 24, lineHeight: 32, fontWeight: '400', color: c.onSurface }}>{k}</T>}
        </MaterialPressable>
      ))}
    </View>
  );
}
