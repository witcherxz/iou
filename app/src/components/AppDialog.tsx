import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Modal, ModalProps, Platform, View } from 'react-native';

const DialogContext = createContext<(() => () => void) | null>(null);

/** Keep Android dialogs in the activity window and hide the underlying controls. */
export function AppDialogLayer({ children, dialogs, onOpenChange }: {
  children: React.ReactNode; dialogs: React.ReactNode; onOpenChange?: (open: boolean) => void;
}) {
  const [count, setCount] = useState(0);
  const register = useCallback(() => {
    setCount(value => value + 1);
    return () => setCount(value => value - 1);
  }, []);
  const open = Platform.OS === 'android' && count > 0;
  useLayoutEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useLayoutEffect(() => () => { onOpenChange?.(false); }, [onOpenChange]);
  return <DialogContext.Provider value={register}>
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents={open ? 'none' : 'auto'}
        accessibilityElementsHidden={open} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {dialogs}
    </View>
  </DialogContext.Provider>;
}

type AppDialogProps = Omit<ModalProps, 'visible' | 'onRequestClose' | 'onShow' | 'onDismiss'> & {
  visible: boolean; onRequestClose: () => void; onShow?: () => void; onDismiss?: () => void;
};

/** A native Android Modal steals activity focus and triggers our privacy lock. */
export function AppDialog({ visible, onRequestClose, onShow, onDismiss, children, ...props }: AppDialogProps) {
  const register = useContext(DialogContext);
  const callbacks = useRef({ onRequestClose, onShow, onDismiss });
  callbacks.current = { onRequestClose, onShow, onDismiss };
  const shown = useRef(false);
  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    if (!register) throw new Error('AppDialogLayer is missing');
    const unregister = register();
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      callbacks.current.onRequestClose();
      return true;
    });
    return () => { subscription.remove(); unregister(); };
  }, [visible, register]);
  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || shown.current === visible) return;
    shown.current = visible;
    if (visible) callbacks.current.onShow?.();
    else callbacks.current.onDismiss?.();
  }, [visible]);
  if (Platform.OS !== 'android') {
    return <Modal {...props} visible={visible} onRequestClose={onRequestClose} onShow={onShow} onDismiss={onDismiss}>{children}</Modal>;
  }
  if (!visible) return null;
  return <View style={{ position: 'absolute', inset: 0, zIndex: 1000, elevation: 24 }} accessibilityViewIsModal>
    {children}
  </View>;
}
