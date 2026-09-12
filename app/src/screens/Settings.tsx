import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { DriveIcon } from '../components/icons';
import { Divider, OutlineButton, PrimaryButton, T, Toggle, Touch } from '../components/ui';
import { Colors } from '../theme';
import { BackupView } from '../useBackup';

interface Props {
  c: Colors;
  dark: boolean;
  profileName: string;
  onRename: (name: string) => void;
  backup: BackupView;
  autoBackup: boolean;
  onToggleAuto: () => void;
  onToggleDark: () => void;
  onBackupNow: () => void;
  onRestore: () => void;
  onOpenBackupSetup: () => void;
}

const SectionLabel = ({ c, children }: { c: Colors; children: string }) => (
  <T style={{ fontSize: 12, fontWeight: '600', color: c.muted, letterSpacing: 0.5 }}>{children}</T>
);

const Row = ({ c, label, value }: { c: Colors; label: string; value: string }) => (
  <View
    style={{
      paddingVertical: 14, paddingHorizontal: 16,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    }}
  >
    <T style={{ fontSize: 14, color: c.text }}>{label}</T>
    <T style={{ fontSize: 14, color: c.muted }}>{value}</T>
  </View>
);

export function Settings({
  c, dark, profileName, onRename, backup, autoBackup,
  onToggleAuto, onToggleDark, onBackupNow, onRestore, onOpenBackupSetup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profileName);

  const working = backup.working;
  const notSetUp = backup.target === 'none';
  const statusDot =
    backup.dot === 'busy' ? '#e0a400'
    : backup.dot === 'ok' ? c.green
    : backup.dot === 'warn' ? c.red
    : c.muted;

  const commitRename = () => {
    const next = draft.trim();
    if (next) onRename(next);
    else setDraft(profileName);
    setEditing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ height: 48, justifyContent: 'center' }}>
        <T style={{ fontSize: 22, fontWeight: '700', color: c.text }}>الإعدادات</T>
      </View>

      <Pressable
        onPress={() => { setDraft(profileName); setEditing(true); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 8 }}
      >
        <View
          style={{
            width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{profileName.trim()[0] ?? '؟'}</T>
        </View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              autoFocus
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: c.border,
                backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontSize: 15,
                textAlign: 'right',
              }}
            />
          ) : (
            <>
              <T style={{ fontSize: 17, fontWeight: '600', color: c.text }}>{profileName}</T>
              <T style={{ fontSize: 13, color: c.muted }}>دفتر خاص · ر.س</T>
            </>
          )}
        </View>
      </Pressable>

      <SectionLabel c={c}>النسخ الاحتياطي</SectionLabel>
      <View style={{ backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' }}>
        <Touch
          onPress={onOpenBackupSetup}
          pressedBackground={c.cardHover}
          style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View
            style={{
              width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryBg,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <DriveIcon color={c.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{backup.title}</T>
            <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }} numberOfLines={1}>
              {backup.status}
            </T>
          </View>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusDot }} />
          <T style={{ fontSize: 18, color: c.muted }}>‹</T>
        </Touch>

        <Divider c={c} />
        <View
          style={{
            paddingVertical: 14, paddingHorizontal: 16,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 14, color: c.text, opacity: backup.supportsAuto ? 1 : 0.5 }}>
              نسخ احتياطي تلقائي
            </T>
            {!backup.supportsAuto && (
              <T style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
                {notSetUp ? 'اختر وجهة أولاً' : 'غير متاح مع التصدير اليدوي'}
              </T>
            )}
          </View>
          <View style={{ opacity: backup.supportsAuto ? 1 : 0.4 }}>
            <Toggle
              on={autoBackup && backup.supportsAuto}
              onToggle={() => backup.supportsAuto && onToggleAuto()}
              c={c}
            />
          </View>
        </View>

        <Divider c={c} />
        <View style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={backup.primaryLabel}
              height={44}
              c={c}
              loading={working}
              disabled={notSetUp}
              background={notSetUp ? c.track : undefined}
              onPress={onBackupNow}
            />
          </View>
          {notSetUp ? (
            <View style={{ flex: 1, opacity: 0.5 }}>
              <OutlineButton label={backup.secondaryLabel} height={44} c={c} onPress={() => {}} />
            </View>
          ) : (
            <OutlineButton label={backup.secondaryLabel} height={44} c={c} onPress={onRestore} />
          )}
        </View>
      </View>

      <SectionLabel c={c}>عام</SectionLabel>
      <View style={{ backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' }}>
        <Row c={c} label="العملة" value="ريال سعودي (ر.س)" />
        <Divider c={c} />
        <Row c={c} label="اللغة" value="العربية" />
        <Divider c={c} />
        <View
          style={{
            paddingVertical: 14, paddingHorizontal: 16,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <T style={{ fontSize: 14, color: c.text }}>الوضع الداكن</T>
          <Toggle on={dark} onToggle={onToggleDark} c={c} />
        </View>
      </View>
    </ScrollView>
  );
}
