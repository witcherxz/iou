import React from 'react';
import { Pressable, View } from 'react-native';

import { Colors } from '../theme';
import { T } from './ui';

/** "إضافة دين" floating action button, pinned above the nav bar. */
export function Fab({ c, onPress }: { c: Colors; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        position: 'absolute', bottom: 96, left: 20,
        height: 56, paddingHorizontal: 20, borderRadius: 16, backgroundColor: c.primary,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
        elevation: 6, opacity: pressed ? 0.9 : 1,
      })}
    >
      <T style={{ fontSize: 22, color: '#fff', lineHeight: 24 }}>+</T>
      <T style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>إضافة دين</T>
    </Pressable>
  );
}

export function Snackbar({ c, message }: { c: Colors; message: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: 96, right: 20, left: 20,
        backgroundColor: c.toastBg, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <T style={{ color: c.toastFg, fontSize: 14 }}>{message}</T>
    </View>
  );
}
