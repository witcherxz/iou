import React, { useState } from 'react';
import Constants from 'expo-constants';
import { ScrollView, View } from 'react-native';

import { TargetGlyph } from './BackupSetup';
import { MaterialIcon } from '../components/icons';
import { Divider, OutlinedField, OutlineButton, PrimaryButton, Segment, T, Toggle, Touch } from '../components/ui';
import { Colors, M3 } from '../theme';
import { BackupView } from '../useBackup';

interface Props {
  c: Colors;
  profileName: string;
  onRename: (name: string) => void;
  backup: BackupView;
  autoBackup: boolean;
  onToggleAuto: () => void;
  onBackupNow: () => void;
  onRestore: () => void;
  onImportFile: () => void;
  themeMode: 'system' | 'light' | 'dark';
  onThemeMode: (mode: 'system' | 'light' | 'dark') => void;
  onOpenBackupSetup: () => void;
  onOpenBackupTools: () => void;
  onOpenPrivacy: () => void;
  privacyEnabled: boolean;
}

const SectionLabel = ({ c, children }: { c: Colors; children: string }) => (
  <T accessibilityRole="header" style={{ ...M3.type.titleSmall, color: c.primary, marginTop: 8 }}>{children}</T>
);

const Row = ({ c, label, value }: { c: Colors; label: string; value: string }) => (
  <View style={{ minHeight: 56, paddingVertical: 16, paddingHorizontal: 16, gap: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>{label}</T>
    <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant, flexShrink: 1 }}>{value}</T>
  </View>
);

export function Settings({
  c, profileName, onRename, backup, autoBackup,
  onToggleAuto, onBackupNow, onRestore, onImportFile, onOpenBackupSetup, themeMode, onThemeMode,
  onOpenBackupTools, onOpenPrivacy, privacyEnabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profileName);
  const working = backup.working;
  const notSetUp = backup.target === 'none';
  const statusColor = backup.dot === 'ok' ? c.green : backup.dot === 'warn' ? c.error : c.onSurfaceVariant;
  const saveName = () => {
    if (!draft.trim()) return;
    onRename(draft.trim());
    setEditing(false);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}
      showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <T accessibilityRole="header" style={{ ...M3.type.headlineMedium, color: c.onSurface, marginBottom: 8 }}>الإعدادات</T>

      {editing ? (
        <View style={{ paddingVertical: 8, gap: 12 }}>
          <OutlinedField c={c} label="اسم الدفتر" accessibilityLabel="اسم الدفتر" value={draft}
            onChangeText={setDraft} onSubmitEditing={saveName} autoFocus maxLength={80} returnKeyType="done"
            error={!draft.trim()} helperText={!draft.trim() ? 'أدخل اسماً للدفتر.' : 'يظهر هذا الاسم في إعدادات دفترك.'} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><PrimaryButton c={c} label="حفظ الاسم" height={48} disabled={!draft.trim()} onPress={saveName} /></View>
            <OutlineButton c={c} label="إلغاء" onPress={() => { setDraft(profileName); setEditing(false); }} />
          </View>
        </View>
      ) : (
        <Touch onPress={() => { setDraft(profileName); setEditing(true); }} accessibilityLabel="تعديل اسم الدفتر"
          pressedBackground={c.surfaceContainerHigh}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 88,
            padding: 16, borderRadius: M3.shape.medium, backgroundColor: c.surfaceContainerLow }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ ...M3.type.titleLarge, color: c.onPrimaryContainer }}>{profileName.trim()[0] ?? '؟'}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={{ ...M3.type.titleMedium, color: c.onSurface }} numberOfLines={2}>{profileName}</T>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>دفتر خاص · ريال سعودي</T>
          </View>
          <MaterialIcon name="edit" color={c.onSurfaceVariant} />
        </Touch>
      )}

      <SectionLabel c={c}>النسخ الاحتياطي</SectionLabel>
      <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: M3.shape.medium, overflow: 'hidden' }}>
        <Touch onPress={onOpenBackupSetup} disabled={working} accessibilityLabel="اختيار وجهة النسخ الاحتياطي"
          pressedBackground={c.surfaceContainerHigh}
          style={{ padding: 16, minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TargetGlyph id={backup.target} color={c.onSurfaceVariant} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>{backup.title}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
              <T style={{ ...M3.type.bodyMedium, color: statusColor, flex: 1 }}>{backup.status}</T>
            </View>
          </View>
          <MaterialIcon name="chevron_left" color={c.onSurfaceVariant} />
        </Touch>
        <Divider c={c} />
        <View style={{ paddingVertical: 12, paddingHorizontal: 16, minHeight: 88,
          flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>نسخ احتياطي تلقائي</T>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
              {backup.supportsAuto
                ? backup.requiresFirstBackup ? 'احفظ أول نسخة باستخدام «نسخ الآن»' : 'بعد التعديلات أثناء فتح التطبيق'
                : notSetUp ? 'اختر وجهة أولاً' : 'غير متاح مع التصدير اليدوي'}
            </T>
          </View>
          <Toggle on={autoBackup && backup.supportsAuto} label="نسخ احتياطي تلقائي"
            disabled={!backup.supportsAuto || working} onToggle={onToggleAuto} c={c} />
        </View>
        <View style={{ padding: 16, paddingTop: 8, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label={notSetUp ? 'إعداد النسخ' : backup.primaryLabel} height={48} c={c} loading={working}
              onPress={notSetUp ? onOpenBackupSetup : onBackupNow} />
          </View>
          <OutlineButton label={notSetUp ? 'استيراد ملف' : backup.secondaryLabel} height={48} c={c} disabled={working}
            onPress={notSetUp ? onImportFile : onRestore} />
        </View>
      </View>
      {backup.target !== 'none' && backup.target !== 'file' && (
        <Touch onPress={onImportFile} disabled={working} pressedBackground={c.stateLayer}
          style={{ minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
          <T style={{ ...M3.type.labelLarge, color: c.primary }}>استيراد نسخة من ملف</T>
        </Touch>
      )}

      <OutlineButton c={c} label="النسخ السابقة والتصدير للجداول" onPress={onOpenBackupTools} disabled={working} />

      <SectionLabel c={c}>الخصوصية</SectionLabel>
      <Touch onPress={onOpenPrivacy} accessibilityLabel="قفل التطبيق" pressedBackground={c.surfaceContainerHigh}
        style={{ padding: 16, minHeight: 80, borderRadius: M3.shape.medium, backgroundColor: c.surfaceContainerLow,
          flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <MaterialIcon name="shield" color={c.primary} />
        <View style={{ flex: 1, gap: 4 }}>
          <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>قفل التطبيق</T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{privacyEnabled ? 'مفعّل · البصمة أو رمز القفل' : 'اختياري · بصمة أو رمز بسيط'}</T>
        </View>
        <MaterialIcon name="chevron_left" color={c.onSurfaceVariant} />
      </Touch>

      <SectionLabel c={c}>المظهر</SectionLabel>
      <Segment c={c} value={themeMode} onChange={onThemeMode} options={[
        { value: 'system', label: 'حسب الجهاز' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'داكن' },
      ]} />

      <SectionLabel c={c}>عام</SectionLabel>
      <View style={{ backgroundColor: c.surfaceContainerLow, borderRadius: M3.shape.medium, overflow: 'hidden' }}>
        <Row c={c} label="العملة" value="ريال سعودي (ر.س)" />
        <Divider c={c} />
        <Row c={c} label="اللغة" value="العربية" />
        <Divider c={c} />
        <Row c={c} label="الإصدار" value={`\u2066${Constants.expoConfig?.version ?? '—'}\u2069`} />
      </View>
    </ScrollView>
  );
}
