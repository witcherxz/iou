import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { registerConfirmationHandler } from '../confirm';
import { Colors, M3 } from '../theme';
import { MaterialIcon } from './icons';
import { T, Touch } from './ui';
import { AppDialog } from './AppDialog';

type Request = { title: string; message: string; confirmLabel: string; resolve: (choice: boolean) => void };

/** One accessible Material dialog for the existing awaited confirmation flow. */
export function ConfirmationDialog({ c }: { c: Colors }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const queue = useRef<Request[]>([]);
  const { height, width } = useWindowDimensions();
  const cancelRef = useRef<View>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const lastOutsideFocus = useRef<HTMLElement | null>(null);
  const current = requests[0];

  const answer = useCallback((choice: boolean) => {
    const [first, ...rest] = queue.current;
    queue.current = rest;
    setRequests(rest);
    first?.resolve(choice);
  }, []);

  useEffect(() => {
    // Backup actions temporarily disable their trigger before the dialog opens.
    // Remember focus before that happens, including when a file picker intervenes.
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!queue.current.length && target?.matches('button, input:not([type="file"]), [role="button"], [role="tab"]')) {
        lastOutsideFocus.current = target;
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('focusin', rememberFocus);
    const unregister = registerConfirmationHandler((title, message, confirmLabel) => new Promise(resolve => {
      if (typeof document !== 'undefined' && !queue.current.length) {
        returnFocus.current = lastOutsideFocus.current ?? document.activeElement as HTMLElement | null;
      }
      queue.current = [...queue.current, { title, message, confirmLabel, resolve }];
      setRequests(queue.current);
    }));
    return () => {
      unregister();
      if (typeof document !== 'undefined') document.removeEventListener('focusin', rememberFocus);
      queue.current.forEach(request => request.resolve(false));
      queue.current = [];
    };
  }, []);

  // React Native Web's Modal contains keyboard focus and handles Escape.
  return (
    <AppDialog visible={!!current} transparent animationType="fade" onRequestClose={() => answer(false)}
      onDismiss={() => {
        if (!queue.current.length) requestAnimationFrame(() => returnFocus.current?.focus?.());
      }}
      onShow={() => (cancelRef.current as unknown as { focus?: () => void })?.focus?.()}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: width < 360 ? 16 : 24, backgroundColor: c.scrim }}>
        <View accessible={false} onStartShouldSetResponder={() => true} onResponderRelease={() => answer(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View role="alertdialog" accessibilityLabel={current?.title} accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 560, maxHeight: height - 80, borderRadius: M3.shape.extraLarge,
            backgroundColor: c.surfaceContainerHigh, padding: 24, direction: 'rtl', gap: 16 }}>
          <MaterialIcon name="info" color={c.onSurfaceVariant} />
          <T accessibilityRole="header" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>{current?.title}</T>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{current?.message}</T>
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            <Pressable ref={cancelRef} accessibilityRole="button" accessibilityLabel="إلغاء" onPress={() => answer(false)}
              style={({ pressed }) => ({ minHeight: 48, minWidth: 64, paddingHorizontal: 16, justifyContent: 'center',
                borderRadius: 24, backgroundColor: pressed ? c.stateLayer : 'transparent' })}>
              <T style={{ ...M3.type.labelLarge, color: c.primary }}>إلغاء</T>
            </Pressable>
            <Touch onPress={() => answer(true)} accessibilityLabel={current?.confirmLabel}
              pressedBackground={c.stateLayer}
              style={{ minHeight: 48, minWidth: 64, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 24 }}>
              <T style={{ ...M3.type.labelLarge, color: c.primary }}>{current?.confirmLabel}</T>
            </Touch>
          </View>
        </View>
      </View>
    </AppDialog>
  );
}
