import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, M3 } from '../theme';
import { MaterialIcon } from '../components/icons';
import { OutlinedField, PrimaryButton, T, Touch } from '../components/ui';
import { PrivacyError } from './controller';
import { normalizePin, PIN_DIGITS } from './policy';
import { usePrivacy } from './PrivacyProvider';

export function useCooldown(blockedUntil: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (blockedUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [blockedUntil]);
  return Math.max(0, Math.ceil((blockedUntil - now) / 1_000));
}

export function errorMessage(error: unknown) {
  return error instanceof PrivacyError ? error.message : 'تعذر إكمال العملية. أعد المحاولة.';
}

/** Ledger children are not mounted until the persisted lock has been checked. */
export function PrivacyGate({ c, children }: { c: Colors; children: React.ReactNode }) {
  const privacy = usePrivacy();
  if (privacy.ready && privacy.unlocked && !privacy.fatalError) {
    // A biometric prompt briefly makes iOS inactive. Preserve the settings form
    // beneath an opaque cover; a real background transition revokes access and
    // unmounts these children through the locked branch below.
    const covered = privacy.enabled && privacy.obscured;
    return <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ flex: 1, opacity: covered ? 0 : 1 }} pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {covered && <View style={{ position: 'absolute', inset: 0, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcon name="shield" color={c.primary} size={40} />
      </View>}
    </View>;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface, direction: 'rtl' }}>
      {!privacy.ready || (privacy.enabled && privacy.obscured) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <MaterialIcon name="shield" color={c.primary} size={40} />
          {!privacy.ready && <ActivityIndicator accessibilityLabel="جارٍ التحقق من القفل" color={c.primary} />}
        </View>
      ) : privacy.fatalError ? (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
          <T accessibilityRole="header" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>تعذر فتح الدفتر</T>
          <T accessibilityRole="alert" style={{ ...M3.type.bodyLarge, color: c.onSurface }}>{privacy.fatalError}</T>
          <PrimaryButton c={c} label="إعادة المحاولة" loading={privacy.busy} onPress={() => { void privacy.controller.initialize().catch(() => {}); }} />
        </View>
      ) : <UnlockForm c={c} />}
    </SafeAreaView>
  );
}

function UnlockForm({ c }: { c: Colors }) {
  const privacy = usePrivacy();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const seconds = useCooldown(privacy.blockedUntil);
  const authenticate = async (biometric: boolean) => {
    setError('');
    try {
      const ok = biometric ? await privacy.controller.authenticateBiometric() : await privacy.controller.authenticatePin(pin);
      if (!ok) setError(biometric ? 'لم يتم فتح القفل. يمكنك استخدام رمزك.' : 'الرمز غير صحيح. حاول مرة أخرى.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setPin(''); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: c.primaryContainer }}>
            <MaterialIcon name="shield" color={c.onPrimaryContainer} size={36} />
          </View>
          <T accessibilityRole="header" style={{ ...M3.type.headlineMedium, textAlign: 'center', color: c.onSurface }}>دفترك مقفل</T>
          {privacy.biometricEnabled && privacy.biometricAvailable && (
            <PrimaryButton c={c} label="فتح بالبصمة أو الوجه" loading={privacy.busy} onPress={() => { void authenticate(true); }} />
          )}
          <OutlinedField c={c} label="رمز القفل" secureTextEntry keyboardType="number-pad" inputMode="numeric"
            textContentType="none" autoComplete="off" autoCorrect={false} maxLength={6} value={pin}
            editable={!privacy.busy && seconds === 0} onFocus={privacy.controller.preferPin}
            onChangeText={v => { privacy.controller.preferPin(); setPin(normalizePin(v)); setError(''); }}
            onSubmitEditing={() => { if (PIN_DIGITS.test(pin) && !privacy.busy && !seconds) void authenticate(false); }}
            style={{ writingDirection: 'ltr', textAlign: 'center', fontSize: 24 }}
            helperText={seconds ? `حاول مرة أخرى بعد ${seconds} ثانية.` : error || 'أدخل رمزك من 4 إلى 6 أرقام.'} error={!!error || seconds > 0} />
          <PrimaryButton c={c} label="فتح بالرمز" loading={privacy.busy}
            disabled={!PIN_DIGITS.test(pin) || seconds > 0} onPress={() => { void authenticate(false); }} />
          <Touch onPress={() => setHelp(!help)} accessibilityLabel="نسيت الرمز؟"
            style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
            <T style={{ ...M3.type.labelLarge, color: c.primary }}>نسيت الرمز؟</T>
          </Touch>
          {help && <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>استخدم البصمة إن كانت مفعلة، ثم غيّر الرمز من إعدادات الخصوصية. إذا تعذر ذلك، يمكنك استعادة نسختك الاحتياطية على جهاز آخر. لا يمكن استرجاع الرمز من التطبيق.</T>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
