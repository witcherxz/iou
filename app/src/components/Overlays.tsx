import React from 'react';
import { View } from 'react-native';

import { Colors, M3 } from '../theme';
import { MaterialPressable, T } from './ui';
import { MaterialIcon } from './icons';

/** "إضافة دين" floating action button, pinned above the nav bar. */
export function Fab({ c, onPress, bottom = 96 }: { c: Colors; onPress: () => void; bottom?: number }) {
  return (
    <MaterialPressable
      c={c}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="إضافة دين"
      style={{
        position: 'absolute', bottom, left: 16,
        minHeight: 56, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 16, backgroundColor: c.primaryContainer,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
        elevation: 3, overflow: 'hidden',
      }}
    >
      {({ pressed, hovered }) => (
        <>
          {(pressed || hovered) && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.onPrimaryContainer, opacity: pressed ? 0.12 : 0.08 }} />}
          <MaterialIcon name="add" color={c.onPrimaryContainer} />
          <T style={{ ...M3.type.labelLarge, color: c.onPrimaryContainer }}>إضافة دين</T>
        </>
      )}
    </MaterialPressable>
  );
}

export function Snackbar({ c, message, bottom = 96 }: { c: Colors; message: string; bottom?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute', bottom, right: 16, left: 16,
        minHeight: 48, backgroundColor: c.inverseSurface, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 16,
        elevation: 2,
      }}
    >
      <T style={{ ...M3.type.bodyMedium, color: c.inverseOnSurface }}>{message}</T>
    </View>
  );
}
