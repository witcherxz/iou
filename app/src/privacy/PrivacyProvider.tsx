import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { PrivacyController, PrivacySnapshot } from './controller';
import { privacyAdapter } from './platform';

type PrivacyContextValue = PrivacySnapshot & { controller: PrivacyController; obscured: boolean; lock: () => void };
const Context = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(() => new PrivacyController(privacyAdapter));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [obscured, setObscured] = useState(AppState.currentState !== 'active' && Platform.OS !== 'web');
  useEffect(() => { void controller.initialize().catch(() => {}); }, [controller]);
  useEffect(() => {
    const onState = AppState.addEventListener('change', state => {
      setObscured(state !== 'active');
      if (state !== 'active' && (state === 'background' || !controller.getSnapshot().biometricPrompt)) controller.lock();
    });
    // Android's notification shade can hide the activity without changing state.
    const onBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => {
      setObscured(true);
      if (!controller.getSnapshot().biometricPrompt) controller.lock();
    }) : null;
    const onFocus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { if (AppState.currentState === 'active') setObscured(false); }) : null;
    const onVisibility = () => {
      const hidden = document.visibilityState !== 'visible';
      setObscured(hidden);
      if (hidden) controller.lock();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      onState.remove(); onBlur?.remove(); onFocus?.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [controller]);
  return <Context.Provider value={{ ...snapshot, controller, obscured, lock: controller.lock }}>{children}</Context.Provider>;
}

export function usePrivacy() {
  const value = useContext(Context);
  if (!value) throw new Error('PrivacyProvider is missing');
  return value;
}
