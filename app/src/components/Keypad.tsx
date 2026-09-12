import React from 'react';
import { Pressable, View } from 'react-native';

import { KEYPAD_ARABIC_DIGITS } from '../config/app';
import { Colors } from '../theme';
import { T } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

const glyph = (k: string) =>
  KEYPAD_ARABIC_DIGITS && /[0-9]/.test(k) ? AR[Number(k)] : k;

/** Appends a keystroke to a raw numeric string, mirroring the design's rules. */
export function applyKey(value: string, key: string): string {
  if (key === '⌫') return value.slice(0, -1);
  if (key === '.') return value.includes('.') ? value : (value || '0') + '.';
  if (value.length >= 7) return value;
  return value === '0' ? key : value + key;
}

export function Keypad({ onKey, c }: { onKey: (key: string) => void; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {KEYS.map(k => (
        <Pressable
          key={k}
          onPress={() => onKey(k)}
          // Three per row with two 8px gaps between them.
          style={({ pressed }) => ({
            width: '31.5%',
            flexGrow: 1,
            height: 52,
            borderRadius: 14,
            backgroundColor: pressed ? c.cardHover : c.card,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <T style={{ fontSize: 22, fontWeight: '500', color: c.text }}>{glyph(k)}</T>
        </Pressable>
      ))}
    </View>
  );
}
