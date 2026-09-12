import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Colors, M3 } from '../theme';
import { MaterialIcon } from '../components/icons';
import { OutlineButton, OutlinedField, PrimaryButton, ScreenHeader, T, Toggle } from '../components/ui';
import { errorMessage, useCooldown } from './PrivacyGate';
import { normalizePin, PIN_DIGITS } from './policy';
import { usePrivacy } from './PrivacyProvider';
import { PrivacyAuthorizationError } from './controller';

type Step = 'summary' | 'enroll' | 'verify-change' | 'verify-disable' | 'change';

export function PrivacySettings({ c, onBack, onEnabled }: { c: Colors; onBack: () => void; onEnabled?: () => void }) {
  const privacy = usePrivacy();
  const [step, setStep] = useState<Step>('summary');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [biometric, setBiometric] = useState(privacy.enabled ? privacy.biometricEnabled : privacy.biometricAvailable);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const seconds = useCooldown(privacy.blockedUntil);
  const verifying = step === 'verify-change' || step === 'verify-disable';
  const enrolling = step === 'enroll' || step === 'change';
  const reset = (next: Step) => {
    setPin(''); setConfirmation(''); setError(''); setNotice(''); setStep(next);
    setBiometric(next === 'enroll' ? privacy.biometricAvailable : privacy.biometricEnabled);
  };
  const back = () => { if (privacy.busy) return; if (step === 'summary') onBack(); else reset('summary'); };
  const verify = async (useBiometric: boolean) => {
    setError('');
    try {
      const ok = useBiometric ? await privacy.controller.authenticateBiometric('settings') : await privacy.controller.authenticatePin(pin, 'settings');
      if (!ok) { setError(useBiometric ? 'استخدم رمزك لتأكيد هويتك.' : 'الرمز غير صحيح. حاول مرة أخرى.'); setPin(''); return; }
      if (step === 'verify-change') reset('change');
      else { await privacy.controller.disable(); reset('summary'); setNotice('تم إيقاف قفل التطبيق.'); }
    } catch (e) { setError(errorMessage(e)); setPin(''); }
  };
  const save = async () => {
    if (!PIN_DIGITS.test(pin)) { setError('استخدم رمزاً من 4 إلى 6 أرقام.'); return; }
    if (pin !== confirmation) { setError('الرمزان غير متطابقين. أعد التأكيد.'); return; }
    setError('');
    try {
      if (step === 'enroll') { await privacy.controller.enable(pin, biometric); onEnabled?.(); }
      else await privacy.controller.changePin(pin, biometric);
      reset('summary'); setNotice(step === 'enroll' ? 'تم تفعيل قفل التطبيق.' : 'تم تغيير رمز القفل.');
    } catch (e) {
      if (step === 'change' && e instanceof PrivacyAuthorizationError) reset('verify-change');
      setError(errorMessage(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader c={c} title="قفل التطبيق" glyph="›" onBack={back} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}>
          <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: 16, padding: 20, gap: 16 }}>
            <MaterialIcon name="shield" color={c.primary} size={32} />
            <T accessibilityRole="header" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>
              {verifying ? 'أكد هويتك' : enrolling ? 'اختر رمز القفل' : privacy.enabled ? 'القفل مفعّل' : 'خصوصية بسيطة لدفترك'}
            </T>
            <T style={{ ...M3.type.bodyLarge, color: c.onSurfaceVariant }}>
              {verifying ? 'أدخل رمزك الحالي أو استخدم البصمة قبل تغيير إعدادات القفل.' : enrolling ?
                `اختر رمزاً من 4 إلى 6 أرقام وتذكره.${privacy.biometricAvailable ? ' ستستخدمه إذا تعذرت البصمة أو الوجه.' : ''}` :
                privacy.enabled ? `${privacy.biometricEnabled ? 'البصمة أو الوجه، مع رمز احتياطي.' : 'فتح الدفتر برمزك.'} يُقفل الدفتر عند مغادرة التطبيق.` :
                  'يمكنك طلب رمز أو بصمة عند فتح الدفتر. التفعيل اختياري.'}
            </T>
          </View>
          {notice ? <T accessibilityLiveRegion="polite" style={{ ...M3.type.bodyLarge, color: c.primary }}>{notice}</T> : null}
          {step === 'summary' ? <>
            {!privacy.available && <T accessibilityRole="alert" style={{ ...M3.type.bodyLarge, color: c.error }}>القفل غير متاح على هذا الجهاز لأن التخزين الآمن غير مدعوم.</T>}
            {privacy.enabled ? <>
              <PrimaryButton c={c} label="تغيير الرمز" onPress={() => reset('verify-change')} />
              <View><OutlineButton c={c} label="قفل الآن" onPress={privacy.lock} /></View>
              <View><OutlineButton c={c} label="إيقاف القفل" onPress={() => reset('verify-disable')} /></View>
            </> : <PrimaryButton c={c} label="تفعيل القفل" disabled={!privacy.available} onPress={() => reset('enroll')} />}
          </> : <>
            {verifying && privacy.biometricEnabled && privacy.biometricAvailable &&
              <PrimaryButton c={c} label="تأكيد بالبصمة أو الوجه" loading={privacy.busy} onPress={() => { void verify(true); }} />}
            <OutlinedField c={c} label={verifying ? 'الرمز الحالي' : 'الرمز الجديد'} value={pin}
              onChangeText={v => { setPin(normalizePin(v)); setError(''); }} secureTextEntry keyboardType="number-pad" inputMode="numeric"
              textContentType="none" autoComplete="off" autoCorrect={false} maxLength={6} editable={!privacy.busy && (!verifying || !seconds)}
              helperText={verifying && seconds ? `حاول مرة أخرى بعد ${seconds} ثانية.` : 'من 4 إلى 6 أرقام.'}
              error={verifying && seconds > 0} style={{ writingDirection: 'ltr', textAlign: 'center', fontSize: 24 }} />
            {enrolling && <>
              <OutlinedField c={c} label="تأكيد الرمز" value={confirmation} onChangeText={v => { setConfirmation(normalizePin(v)); setError(''); }}
                secureTextEntry keyboardType="number-pad" inputMode="numeric" textContentType="none" autoComplete="off" autoCorrect={false}
                maxLength={6} editable={!privacy.busy} style={{ writingDirection: 'ltr', textAlign: 'center', fontSize: 24 }} />
              {privacy.biometricAvailable && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64 }}>
                <View style={{ flex: 1, gap: 4 }}><T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>البصمة أو الوجه</T>
                  <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>مع الاحتفاظ بالرمز كطريقة بديلة.</T></View>
                <Toggle c={c} on={biometric} onToggle={() => setBiometric(v => !v)} disabled={privacy.busy} label="البصمة أو الوجه" />
              </View>}
            </>}
            {error ? <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>{error}</T> : null}
            <PrimaryButton c={c} label={verifying ? 'تأكيد الهوية' : step === 'enroll' ? 'حفظ وتفعيل القفل' : 'حفظ الرمز الجديد'}
              loading={privacy.busy} disabled={!PIN_DIGITS.test(pin) || (verifying ? seconds > 0 : !PIN_DIGITS.test(confirmation))}
              onPress={() => { void (verifying ? verify(false) : save()); }} />
            <View><OutlineButton c={c} label="إلغاء" disabled={privacy.busy} onPress={() => reset('summary')} /></View>
          </>}
          <View style={{ backgroundColor: c.surfaceContainerHigh, padding: 16, borderRadius: 12, gap: 8 }}>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
              {Platform.OS === 'web' ? 'في المتصفح، يخفي القفل الدفتر فقط؛ بيانات المتصفح والنسخ الاحتياطية غير مشفرة.' :
                'القفل يحمي فتح التطبيق. النسخ الاحتياطية تبقى قابلة للقراءة، لذلك احفظها في مكان خاص.'}
            </T>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>لا يُنسخ رمزك احتياطياً. عند التفعيل تُخفى تفاصيل الإشعارات؛ يمكنك تغيير ذلك من التذكيرات.</T>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
