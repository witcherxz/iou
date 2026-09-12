import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { Colors, fontFor } from '../theme';

/**
 * Text with the IBM Plex Sans Arabic family picked from `fontWeight`.
 * Custom fonts don't synthesise weights, so the weight has to be resolved to a
 * concrete face and then dropped from the style.
 */
export function T({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const { fontWeight, ...others } = flat ?? {};
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fontFor(fontWeight as number), textAlign: 'right', writingDirection: 'rtl' },
        others as TextStyle,
      ]}
    />
  );
}

/** Pressable that swaps to `pressedBackground` while held (the design's :hover). */
export function Touch({
  style,
  pressedBackground,
  children,
  ...rest
}: PressableProps & { style?: ViewStyle; pressedBackground?: string; children?: React.ReactNode }) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && pressedBackground ? { backgroundColor: pressedBackground } : null,
        pressed && !pressedBackground ? { opacity: 0.85 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Avatar({
  initial, size, radius, bg, fg, fontSize,
}: { initial: string; size: number; radius: number; bg: string; fg: string; fontSize: number }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: radius, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <T style={{ color: fg, fontWeight: '600', fontSize }}>{initial}</T>
    </View>
  );
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T style={{ fontSize: 11, fontWeight: '600', color: fg }}>{label}</T>
    </View>
  );
}

export function Toggle({ on, onToggle, c }: { on: boolean; onToggle: () => void; c: Colors }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0,
        backgroundColor: on ? c.primary : c.track,
      }}
    >
      <View
        style={{
          position: 'absolute', top: 3, right: on ? 3 : 21,
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

export function Segment<V extends string>({
  options, value, onChange, c,
}: { options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, padding: 4 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? c.primary : 'transparent',
            }}
          >
            <T style={{ fontSize: 14, fontWeight: '600', color: on ? '#fff' : c.muted }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label, selected, onPress, c, dashed,
}: { label: string; selected?: boolean; onPress: () => void; c: Colors; dashed?: boolean }) {
  const border = dashed ? c.primary : selected ? c.primary : c.border;
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 36, paddingHorizontal: 14, borderRadius: 18,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: border,
        backgroundColor: dashed ? 'transparent' : selected ? c.primary : c.card,
      }}
    >
      <T
        style={{
          fontSize: 13, fontWeight: '500',
          color: dashed ? c.primary : selected ? '#fff' : c.text,
        }}
      >
        {label}
      </T>
    </Pressable>
  );
}

export function PrimaryButton({
  label, onPress, c, disabled, height = 56, background, loading,
}: {
  label: string; onPress: () => void; c: Colors; disabled?: boolean;
  height?: number; background?: string; loading?: boolean;
}) {
  const bg = background ?? (disabled ? c.track : c.primary);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        height, borderRadius: height / 2, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1,
      })}
    >
      {loading ? <ActivityIndicator color="#fff" /> : (
        <T style={{ color: '#fff', fontSize: height >= 56 ? 16 : 14, fontWeight: '600' }}>{label}</T>
      )}
    </Pressable>
  );
}

export function OutlineButton({
  label, onPress, c, height = 48,
}: { label: string; onPress: () => void; c: Colors; height?: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, height, borderRadius: height / 2, borderWidth: 1, borderColor: c.border,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
      })}
    >
      <T style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}

export function Divider({ c, inset = 16 }: { c: Colors; inset?: number }) {
  return <View style={{ height: 1, backgroundColor: c.divider, marginHorizontal: inset }} />;
}

/** Back chevron / close button used in every detail header. */
export function HeaderButton({ glyph, onPress, c }: { glyph: string; onPress: () => void; c: Colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
      })}
    >
      <T style={{ fontSize: 22, color: c.text }}>{glyph}</T>
    </Pressable>
  );
}

export function ScreenHeader({
  title, glyph, onBack, c,
}: { title: string; glyph: string; onBack: () => void; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 4, height: 56 }}>
      <HeaderButton glyph={glyph} onPress={onBack} c={c} />
      <T style={{ fontSize: 18, fontWeight: '600', flex: 1, color: c.text }} numberOfLines={1}>
        {title}
      </T>
    </View>
  );
}
