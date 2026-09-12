import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { PrivacyController, PrivacySnapshot } from './controller';
import { privacyAdapter } from './platform';

type PrivacyContextValue = PrivacySnapshot & { controller: PrivacyController; obscured: boolean; lock: () => void };
const Context = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(() => new PrivacyController(privacyAdapter));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [obscured, setObscured] = useState(AppState.currentState !== 'active' && Platform.OS !== 'web');
  const androidFocused = useRef(true);
  useEffect(() => {
    controller.setForeground(Platform.OS === 'web' ? document.visibilityState === 'visible' : AppState.currentState === 'active');
    void controller.initialize().catch(() => {});
    return () => controller.setForeground(false);
  }, [controller]);
  useEffect(() => {
    const onState = AppState.addEventListener('change', state => {
      const visible = state === 'active' && (Platform.OS !== 'android' || androidFocused.current);
      controller.setForeground(visible);
      setObscured(!visible);
      if (state === 'background') controller.background();
      else if (state !== 'active' && !controller.getSnapshot().biometricPrompt) controller.lock();
    });
    // Android's notification shade can hide the activity without changing state.
    const onBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => {
      androidFocused.current = false;
      controller.setForeground(false);
      setObscured(true);
      if (!controller.getSnapshot().biometricPrompt) controller.lock();
    }) : null;
    const onFocus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => {
      androidFocused.current = true;
      if (AppState.currentState === 'active') { controller.setForeground(true); setObscured(false); }
    }) : null;
    const onVisibility = () => {
      const hidden = document.visibilityState !== 'visible';
      controller.setForeground(!hidden);
      setObscured(hidden);
      if (hidden) controller.background();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      onState.remove(); onBlur?.remove(); onFocus?.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [controller]);
  useEffect(() => { void controller.autoUnlockWithBiometrics(); }, [controller, snapshot, obscured]);
  return <Context.Provider value={{ ...snapshot, controller, obscured, lock: controller.lockManually }}>{children}</Context.Provider>;
}

export function usePrivacy() {
  const value = useContext(Context);
  if (!value) throw new Error('PrivacyProvider is missing');
  return value;
}
