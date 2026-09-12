import React, { useId, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { Colors, fontFor, M3 } from '../theme';
import { MaterialIcon } from './icons';

// React Native Web does not translate the native accessibilityState object.
// Keep switch, tab and selection state available to browser assistive tools.
function webState(props: PressableProps) {
  if (Platform.OS !== 'web' || !props.accessibilityState) return {};
  const state = props.accessibilityState, role = props.role ?? props.accessibilityRole;
  return {
    'aria-busy': state.busy,
    'aria-checked': state.checked,
    'aria-disabled': props.disabled || state.disabled,
    'aria-expanded': state.expanded,
    ...(role === 'button' ? { 'aria-pressed': state.selected }
      : role && ['tab', 'option', 'row', 'gridcell', 'treeitem'].includes(role) ? { 'aria-selected': state.selected } : {}),
  };
}

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
        // Native text alignment follows paragraph direction; explicit "right"
        // is mirrored to the left inside RTL. Keep Arabic paragraphs at start.
        { fontFamily: fontFor(fontWeight as number), direction: 'rtl',
          textAlign: Platform.OS === 'web' ? 'right' : 'auto', writingDirection: 'rtl' },
        others as TextStyle,
      ]}
    />
  );
}

/** Keyboard focus and pointer hover stay visible alongside touch feedback. */
export function MaterialPressable({
  c, children, style, onFocus, onBlur, onHoverIn, onHoverOut, disabled, ...props
}: Omit<PressableProps, 'children'> & {
  c: Colors; children: React.ReactNode | ((state: { pressed: boolean; hovered: boolean }) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      {...props}
      {...webState({ ...props, disabled })}
      disabled={disabled}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      onHoverIn={event => { setHovered(true); onHoverIn?.(event); }}
      onHoverOut={event => { setHovered(false); onHoverOut?.(event); }}
      style={state => [
        typeof style === 'function' ? style(state) : style,
        focused && !disabled ? { outlineColor: c.primary, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' } : null,
      ]}
    >
      {state => typeof children === 'function' ? children({ ...state, hovered: hovered && !disabled }) : children}
    </Pressable>
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
      accessibilityRole="button"
      {...rest}
      {...webState({ accessibilityRole: 'button', ...rest })}
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

export function Toggle({ on, onToggle, c, label, disabled }: {
  on: boolean; onToggle: () => void; c: Colors; label?: string; disabled?: boolean;
}) {
  return (
    <MaterialPressable
      c={c}
      onPress={onToggle}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      style={{ width: 52, height: 48, justifyContent: 'center', flexShrink: 0 }}
    >
      {({ pressed, hovered }) => {
        const size = pressed ? 28 : on ? 24 : 16;
        return (
          <View style={{
            width: 52, height: 32, borderRadius: 16, borderWidth: 2,
            borderColor: disabled ? c.disabledContainer : on ? c.primary : c.outline,
            backgroundColor: disabled ? c.disabledContainer : on ? c.primary : c.surfaceContainerHighest,
          }}>
            <View style={{
              position: 'absolute', top: (28 - size) / 2,
              right: on ? (28 - size) / 2 : 34 - size / 2,
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: disabled ? (on ? c.surface : c.disabledContent) : on ? (pressed || hovered ? c.primaryContainer : c.onPrimary) : (pressed || hovered ? c.onSurfaceVariant : c.outline),
            }} />
          </View>
        );
      }}
    </MaterialPressable>
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
    <View style={{ direction: 'ltr', flexDirection: 'row-reverse', minHeight: 48 }}>
      {options.map((o, index) => {
        const on = o.value === value;
        const fg = on ? c.onSecondaryContainer : c.onSurface;
        const shape = {
          borderTopRightRadius: index === 0 ? 24 : 0,
          borderBottomRightRadius: index === 0 ? 24 : 0,
          borderTopLeftRadius: index === options.length - 1 ? 24 : 0,
          borderBottomLeftRadius: index === options.length - 1 ? 24 : 0,
        };
        return (
          <MaterialPressable
            c={c}
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minWidth: 48, minHeight: 48, paddingVertical: 4, marginRight: index ? -1 : 0 }}
          >
            {({ pressed, hovered }) => (
              <View style={{
                ...shape, flex: 1, minHeight: 40, paddingHorizontal: 8, paddingVertical: 8,
                borderWidth: 1, borderColor: c.outline, overflow: 'hidden',
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: on ? c.secondaryContainer : 'transparent',
              }}>
                {(pressed || hovered) && <StateLayer color={fg} opacity={pressed ? 0.12 : 0.08} />}
                {on && <SelectionCheck color={fg} />}
                <T style={{ ...M3.type.labelLarge, color: fg, textAlign: 'center', flexShrink: 1 }}>{o.label}</T>
              </View>
            )}
          </MaterialPressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label, selected, onPress, c, dashed,
}: { label: string; selected?: boolean; onPress: () => void; c: Colors; dashed?: boolean }) {
  const fg = selected ? c.onSecondaryContainer : dashed ? c.primary : c.onSurfaceVariant;
  return (
    <MaterialPressable
      c={c}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingVertical: 8 }}
    >
      {({ pressed, hovered }) => (
        <View style={{
          minHeight: 32, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderWidth: 1, borderColor: selected ? 'transparent' : c.outline,
          backgroundColor: selected ? c.secondaryContainer : 'transparent', overflow: 'hidden',
        }}>
          {(pressed || hovered) && <StateLayer color={fg} opacity={pressed ? 0.12 : 0.08} />}
          {selected && <SelectionCheck color={fg} />}
          <T style={{ ...M3.type.labelLarge, color: fg }}>{label}</T>
        </View>
      )}
    </MaterialPressable>
  );
}

export function PrimaryButton({
  label, onPress, c, disabled, height = 48, background, loading,
}: {
  label: string; onPress: () => void; c: Colors; disabled?: boolean;
  height?: number; background?: string; loading?: boolean;
}) {
  const bg = disabled ? c.disabledContainer : background ?? c.primary;
  const fg = disabled ? c.disabledContent : c.onPrimary;
  return (
    <MaterialPressable
      c={c}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={{
        minHeight: Math.max(48, height), paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      {({ pressed, hovered }) => (
        <>
          {(pressed || hovered) && <StateLayer color={fg} opacity={pressed ? 0.12 : 0.08} />}
          {loading ? <ActivityIndicator color={fg} /> : (
            <T style={{ ...M3.type.labelLarge, color: fg, textAlign: 'center' }}>{label}</T>
          )}
        </>
      )}
    </MaterialPressable>
  );
}

export function OutlineButton({
  label, onPress, c, height = 48, disabled,
}: { label: string; onPress: () => void; c: Colors; height?: number; disabled?: boolean }) {
  return (
    <MaterialPressable
      c={c}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1, minHeight: Math.max(48, height), paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999,
        borderWidth: 1, borderColor: disabled ? c.disabledContainer : c.outline,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      {({ pressed, hovered }) => (
        <>
          {(pressed || hovered) && <StateLayer color={c.primary} opacity={pressed ? 0.12 : 0.08} />}
          <T style={{ ...M3.type.labelLarge, color: disabled ? c.disabledContent : c.primary, textAlign: 'center' }}>{label}</T>
        </>
      )}
    </MaterialPressable>
  );
}

export function Divider({ c, inset = 16 }: { c: Colors; inset?: number }) {
  return <View style={{ height: 1, backgroundColor: c.outlineVariant, marginHorizontal: inset }} />;
}

/** Back chevron / close button used in every detail header. */
export function HeaderButton({ glyph, onPress, c }: { glyph: string; onPress: () => void; c: Colors }) {
  return (
    <MaterialPressable
      c={c}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={glyph === '✕' ? 'إغلاق' : 'رجوع'}
      style={{
        width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
      }}
    >
      {({ pressed, hovered }) => (
        <>
          {(pressed || hovered) && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.onSurface, opacity: pressed ? 0.12 : 0.08, borderRadius: 24 }]} />}
          <MaterialIcon name={glyph === '✕' ? 'close' : 'arrow_forward'} color={c.onSurface} />
        </>
      )}
    </MaterialPressable>
  );
}

export function ScreenHeader({
  title, glyph, onBack, c,
}: { title: string; glyph: string; onBack: () => void; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, minHeight: 64, backgroundColor: c.surface }}>
      <HeaderButton glyph={glyph} onPress={onBack} c={c} />
      <T accessibilityRole="header" style={{ ...M3.type.titleLarge, flex: 1, color: c.onSurface, paddingEnd: 12 }} numberOfLines={1}>
        {title}
      </T>
    </View>
  );
}

/** A visible check keeps selections distinguishable without relying on color. */
function SelectionCheck({ color }: { color: string }) {
  return <MaterialIcon name="check" color={color} size={18} />;
}

function StateLayer({ color, opacity = 0.12 }: { color: string; opacity?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity }]} />;
}

export function SectionHeading({ children, c, style }: { children: React.ReactNode; c: Colors; style?: StyleProp<TextStyle> }) {
  return <T accessibilityRole="header" style={[{ ...M3.type.titleSmall, color: c.onSurfaceVariant }, style]}>{children}</T>;
}

/** M3 outlined input with a persistent label, focus outline, and supporting text. */
export function OutlinedField({
  c, label, helperText, error, containerStyle, style, onFocus, onBlur, editable = true, ...inputProps
}: TextInputProps & {
  c: Colors; label: string; helperText?: string; error?: boolean; containerStyle?: StyleProp<ViewStyle>;
  'aria-describedby'?: string; 'aria-invalid'?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const helperId = useId();
  const outline = !editable ? c.disabledContainer : error ? c.error : focused ? c.primary : c.outline;
  const labelColor = !editable ? c.disabledContent : error ? c.error : focused ? c.primary : c.onSurfaceVariant;
  return (
    <View style={[{ paddingTop: 8 }, containerStyle]}>
      <View style={{
        minHeight: 56, borderRadius: 4, borderWidth: focused ? 2 : 1, borderColor: outline,
        backgroundColor: c.surface, justifyContent: 'center',
      }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -10, right: 12, paddingHorizontal: 4, backgroundColor: c.surface, zIndex: 1 }}>
          <T accessible={false} style={{ ...M3.type.bodySmall, color: labelColor }}>{label}</T>
        </View>
        <TextInput
          {...inputProps}
          editable={editable}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          accessibilityHint={inputProps.accessibilityHint ?? helperText}
          aria-describedby={[inputProps['aria-describedby'], helperText ? helperId : undefined].filter(Boolean).join(' ') || undefined}
          aria-invalid={error || inputProps['aria-invalid']}
          accessibilityState={{ ...inputProps.accessibilityState, disabled: !editable }}
          placeholderTextColor={inputProps.placeholderTextColor ?? c.onSurfaceVariant}
          selectionColor={c.primary}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }}
          style={[{
            ...M3.type.bodyLarge,
            minHeight: focused ? 52 : 54, paddingHorizontal: focused ? 14 : 15, paddingVertical: focused ? 13 : 14,
            fontFamily: fontFor(400), outlineWidth: 0,
            color: editable ? c.onSurface : c.disabledContent, textAlign: 'right',
            writingDirection: 'rtl', textAlignVertical: inputProps.multiline ? 'top' : 'center',
          }, style]}
        />
      </View>
      {helperText ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: 4 }}>
          {error && <MaterialIcon name="error" color={c.error} size={16} />}
          <T nativeID={helperId} accessibilityRole={error ? 'alert' : undefined}
            style={{ ...M3.type.bodySmall, flex: 1, color: error ? c.error : c.onSurfaceVariant }}>{helperText}</T>
        </View>
      ) : null}
    </View>
  );
}
