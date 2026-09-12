import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { OutlineButton, OutlinedField, PrimaryButton, T } from '../components/ui';
import { Colors, M3 } from '../theme';
import { BackupPasswordRequest } from '../useBackup';

export function BackupPasswordDialog({ c, request, onSubmit, onCancel }: {
  c: Colors; request: BackupPasswordRequest | null; onSubmit: (password: string) => void; onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  useEffect(() => { if (!request || request.error || request.verifying) setPassword(''); }, [request]);
  if (!request) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.scrim }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View role="dialog" accessibilityLabel="نسخة محمية بكلمة مرور" accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, gap: 16, borderRadius: 28, backgroundColor: c.surfaceContainerHigh, direction: 'rtl' }}>
          <T accessibilityRole="header" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>نسخة محمية بكلمة مرور</T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>أدخل كلمة المرور التي اخترتها عند تصدير هذه النسخة.</T>
          <OutlinedField c={c} label="كلمة مرور النسخة" value={password} onChangeText={setPassword}
            secureTextEntry autoFocus autoCorrect={false} autoCapitalize="none" maxLength={1024}
            editable={!request?.verifying} error={!!request?.error} helperText={request?.error ?? undefined}
            onSubmitEditing={() => password && onSubmit(password)} />
          <PrimaryButton c={c} label="فتح النسخة" onPress={() => onSubmit(password)} disabled={!password} loading={request?.verifying} />
          <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="إلغاء" onPress={onCancel} disabled={request?.verifying} /></View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
