import React from 'react';
import { View } from 'react-native';

// The design draws its nav icons out of plain boxes and CSS triangles rather
// than an icon font; these reproduce the same shapes with RN views.

const Triangle = ({ color, up, w = 10, h = 6 }: { color: string; up: boolean; w?: number; h?: number }) => (
  <View
    style={{
      width: 0,
      height: 0,
      borderLeftWidth: w / 2,
      borderRightWidth: w / 2,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      ...(up
        ? { borderBottomWidth: h, borderBottomColor: color, borderTopWidth: 0 }
        : { borderTopWidth: h, borderTopColor: color, borderBottomWidth: 0 }),
    }}
  />
);

const Bar = ({ color, w = 16 }: { color: string; w?: number }) => (
  <View style={{ width: w, height: 2, borderRadius: 1, backgroundColor: color }} />
);

export function HomeIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 16, height: 14 }}>
      <View style={{ position: 'absolute', top: 0, left: 1 }}>
        <Triangle color={color} up w={14} h={7} />
      </View>
      <View
        style={{
          position: 'absolute', bottom: 0, width: 16, height: 8,
          borderWidth: 2, borderTopWidth: 0, borderColor: color,
        }}
      />
    </View>
  );
}

export function IouIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Triangle color={color} up={false} />
      <Bar color={color} />
    </View>
  );
}

export function UomeIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Bar color={color} />
      <Triangle color={color} up />
    </View>
  );
}

export function BellIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 14, height: 16 }}>
      <View
        style={{
          width: 14, height: 11, borderWidth: 2, borderBottomWidth: 0, borderColor: color,
          borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
        }}
      />
      <View
        style={{ position: 'absolute', left: 5, bottom: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: color }}
      />
    </View>
  );
}

export function SettingsIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      <Bar color={color} />
      <Bar color={color} w={11} />
      <Bar color={color} />
    </View>
  );
}

/** Sun / moon glyph on the home screen's theme toggle. */
export function ThemeGlyph({ dark, cardBg }: { dark: boolean; cardBg: string }) {
  if (dark) {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#f2c66d', overflow: 'hidden' }}>
        <View
          style={{ position: 'absolute', top: -4, left: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: cardBg }}
        />
      </View>
    );
  }
  const ray = (top: number, left: number) => (
    <View key={`${top}-${left}`} style={{ position: 'absolute', top, left, width: 2, height: 2, backgroundColor: '#1b1a22' }} />
  );
  return (
    <View style={{ width: 14, height: 14 }}>
      <View style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#1b1a22' }} />
      {ray(6, 6)}
      {ray(0, 6)}
      {ray(12, 6)}
      {ray(6, 0)}
      {ray(6, 12)}
    </View>
  );
}

/** Small "drive" rectangle in the settings backup row. */
export function DriveIcon({ color }: { color: string }) {
  return <View style={{ width: 18, height: 14, borderRadius: 3, borderWidth: 2, borderColor: color }} />;
}
