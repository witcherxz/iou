import React from 'react';
import { ScrollView, View } from 'react-native';

import { DriveIcon } from '../components/icons';
import { OutlineButton, ScreenHeader, T, Touch } from '../components/ui';
import { BackupView } from '../useBackup';
import { Colors } from '../theme';
import { BackupTarget } from '../types';

interface Props {
  c: Colors;
  backup: BackupView;
  onBack: () => void;
  onSelect: (target: BackupTarget) => void;
  onChooseFolder: () => void;
}

interface Option {
  id: BackupTarget;
  title: string;
  body: string;
  /** Shown instead of `body` when the option cannot be used. */
  blocked?: string;
}

export function BackupSetup({ c, backup, onBack, onSelect, onChooseFolder }: Props) {
  const options: Option[] = [
    {
      id: 'folder',
      title: 'مجلد على الجهاز',
      body: 'اختر مجلداً مرة واحدة، ويحفظ التطبيق نسخة فيه تلقائياً. يمكن اختيار مجلد يزامنه Google Drive أو أي تطبيق آخر.',
    },
    {
      id: 'file',
      title: 'ملف (تصدير واستيراد)',
      body: 'تصدير نسخة عند الطلب ومشاركتها إلى أي تطبيق، واستيرادها لاحقاً. بدون أي إعداد.',
    },
    {
      id: 'drive',
      title: 'Google Drive',
      body: 'حفظ تلقائي في مجلد خاص بالتطبيق داخل حسابك على Drive.',
      blocked: backup.driveConfigured ? undefined : 'يحتاج إعداد OAuth من المطور',
    },
    {
      id: 'none',
      title: 'بدون نسخ احتياطي',
      body: 'تبقى البيانات على هذا الجهاز فقط. إذا فقدت الجهاز، تفقد الدفتر.',
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="النسخ الاحتياطي" glyph="→" onBack={onBack} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <T style={{ fontSize: 13, color: c.muted, lineHeight: 21, marginBottom: 4 }}>
          اختر أين تُحفظ نسخة دفترك. كل الخيارات تحفظ نفس الملف، فيمكنك التبديل بينها في أي وقت.
        </T>

        {options.map(o => {
          const selected = backup.target === o.id;
          const disabled = !!o.blocked;
          return (
            <Touch
              key={o.id}
              onPress={() => !disabled && onSelect(o.id)}
              pressedBackground={c.cardHover}
              style={{
                backgroundColor: c.card, borderRadius: 20, padding: 16, gap: 12,
                borderWidth: 1, borderColor: selected ? c.primary : 'transparent',
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View
                  style={{
                    width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryBg,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <TargetGlyph id={o.id} color={c.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{o.title}</T>
                  <T style={{ fontSize: 12, color: c.muted, marginTop: 4, lineHeight: 19 }}>
                    {o.blocked ?? o.body}
                  </T>
                </View>
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                    borderWidth: 2, borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {selected && <T style={{ color: '#fff', fontSize: 12 }}>✓</T>}
                </View>
              </View>

              {o.id === 'folder' && selected && (
                <View style={{ gap: 10 }}>
                  <View style={{ backgroundColor: c.cardHover, borderRadius: 12, padding: 12 }}>
                    <T style={{ fontSize: 12, color: c.muted }}>المجلد الحالي</T>
                    <T style={{ fontSize: 13, color: c.text, marginTop: 2 }} numberOfLines={2}>
                      {backup.folderLabel || 'لم يتم اختيار مجلد'}
                    </T>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <OutlineButton label="تغيير المجلد" height={44} c={c} onPress={onChooseFolder} />
                  </View>
                </View>
              )}
            </Touch>
          );
        })}

        <T style={{ fontSize: 12, color: c.muted, lineHeight: 19, marginTop: 4 }}>
          النسخة ملف JSON واحد باسم iou-backup.json. استيراده يستبدل كل البيانات الحالية.
        </T>
      </ScrollView>
    </View>
  );
}

function TargetGlyph({ id, color }: { id: BackupTarget; color: string }) {
  if (id === 'drive') return <DriveIcon color={color} />;
  if (id === 'folder') {
    // Folder: a tab sitting on a body.
    return (
      <View style={{ width: 18, height: 15 }}>
        <View style={{ width: 9, height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color }} />
        <View style={{ width: 18, height: 11, borderRadius: 3, backgroundColor: color }} />
      </View>
    );
  }
  if (id === 'file') {
    return (
      <View
        style={{ width: 14, height: 17, borderRadius: 3, borderWidth: 2, borderColor: color, justifyContent: 'center', gap: 2, paddingHorizontal: 2 }}
      >
        <View style={{ height: 2, backgroundColor: color }} />
        <View style={{ height: 2, backgroundColor: color }} />
      </View>
    );
  }
  // 'none' — a struck-through circle.
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}
