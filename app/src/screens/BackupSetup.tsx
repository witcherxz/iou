import React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { MaterialIcon } from '../components/icons';
import { OutlineButton, PrimaryButton, ScreenHeader, T, Touch } from '../components/ui';
import { BackupView } from '../useBackup';
import { Colors, M3 } from '../theme';
import { BackupTarget } from '../types';

interface Props {
  c: Colors;
  backup: BackupView;
  onBack: () => void;
  onSelect: (target: BackupTarget) => void;
  onChooseFolder: () => void;
  onBackupNow: () => void;
  onRestore: () => void;
}

interface Option {
  id: BackupTarget;
  title: string;
  body: string;
  /** Shown instead of `body` when the option cannot be used. */
  blocked?: string;
}

export function BackupSetup({ c, backup, onBack, onSelect, onChooseFolder, onBackupNow, onRestore }: Props) {
  const options: Option[] = [
    {
      id: 'folder',
      title: 'مجلد على الجهاز',
      body: Platform.OS === 'ios'
        ? 'آخر 10 نسخ مع تقرير وجداول للقراءة خارج التطبيق. يلزم اختيار المجلد مجدداً بعد إعادة تشغيل التطبيق على iPhone.'
        : 'آخر 10 نسخ مع تقرير وجداول للقراءة خارج التطبيق. بعد أول حفظ، تُحفظ التغييرات أثناء فتح التطبيق إذا فُعّل النسخ التلقائي.',
      blocked: backup.folderSupported ? undefined : 'متاح في تطبيق الهاتف. استخدم تصدير ملف في المتصفح.',
    },
    {
      id: 'file',
      title: 'ملف (تصدير واستيراد)',
      body: 'تقرير HTML يفتح دون التطبيق، مع جداول CSV ونسخة كاملة للاستعادة. يمكنك مشاركته أو استيراده لاحقاً، بدون إعداد.',
    },
    {
      id: 'drive',
      title: backup.driveConfigured ? 'Google Drive' : 'Google Drive (يدوي)',
      body: backup.driveConfigured ? 'حفظ تلقائي في مجلد خاص بالتطبيق داخل حسابك على Drive.'
        : Platform.OS === 'web'
          ? 'نزّل تقرير دفترك وارفعه إلى Drive. يحتوي على جداول ونسخة كاملة للاستعادة. الحفظ يدوي في كل مرة.'
          : 'شارك تقرير دفترك واختر Drive لحفظه. يحتوي على جداول ونسخة كاملة للاستعادة. الحفظ يدوي في كل مرة.',
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8 }}>
          <T accessibilityRole="header" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>أين تحفظ نسخة دفترك؟</T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
            اختر وجهة تناسبك. يمكنك استعادة ملف النسخة لاحقاً عند تغيير جهازك.
          </T>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="وجهة النسخ الاحتياطي" style={{ gap: 8 }}>
          {options.map(o => {
            const selected = backup.target === o.id;
            const disabled = !!o.blocked || backup.working;
            const foreground = selected ? c.onSecondaryContainer : c.onSurface;
            return (
              <View key={o.id} style={{ backgroundColor: selected ? c.secondaryContainer : c.surfaceContainerLow,
                borderRadius: M3.shape.medium, borderWidth: 1, borderColor: selected ? c.primary : c.outlineVariant, overflow: 'hidden' }}>
                <Touch onPress={() => !selected && onSelect(o.id)} disabled={disabled}
                  accessibilityRole="radio" accessibilityLabel={o.title} accessibilityHint={o.blocked ?? o.body}
                  accessibilityState={{ checked: selected, selected, disabled }} pressedBackground={c.stateLayer}
                  style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 88 }}>
                  <TargetGlyph id={o.id} color={disabled ? c.onSurfaceVariant : foreground} />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <T style={{ ...M3.type.titleMedium, color: foreground }}>{o.title}</T>
                    <T style={{ ...M3.type.bodyMedium, color: selected ? c.onSecondaryContainer : c.onSurfaceVariant }}>{o.blocked ?? o.body}</T>
                  </View>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                    borderColor: selected ? c.primary : c.outline, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
                    {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} />}
                  </View>
                </Touch>
                {o.id === 'folder' && selected && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                    <T style={{ ...M3.type.labelLarge, color: c.onSecondaryContainer }}>المجلد الحالي</T>
                    <T style={{ ...M3.type.bodyMedium, color: c.onSecondaryContainer }} numberOfLines={2}>{backup.folderLabel || 'لم يتم اختيار مجلد'}</T>
                    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 24 }}>
                      <OutlineButton label="تغيير المجلد" height={48} c={c} onPress={onChooseFolder} disabled={backup.working} />
                    </View>
                  </View>
                )}
                {o.id === 'drive' && selected && !backup.driveConfigured && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                    <T style={{ ...M3.type.bodyMedium, color: c.onSecondaryContainer }}>
                      {Platform.OS === 'web'
                        ? 'بعد التنزيل، افتح Google Drive وارفع الملف. للاستعادة، نزّل النسخة من Drive ثم اخترها هنا.'
                        : Platform.OS === 'android'
                          ? 'اختر Drive من قائمة المشاركة. إن لم يظهر، اضغط «المزيد» واسحب قائمة التطبيقات للأعلى. راجع الحساب والمجلد ثم اضغط «تحميل» أو «حفظ».'
                        : 'من قائمة المشاركة اختر Drive، ثم الحساب والمجلد واضغط حفظ. إن لم يظهر Drive، ثبّت تطبيقه وسجّل الدخول، أو احفظ الملف وارفعه من Drive.'}
                    </T>
                    <PrimaryButton label={backup.primaryLabel} c={c} onPress={onBackupNow}
                      disabled={backup.working} loading={backup.working} />
                    <T style={{ ...M3.type.bodyMedium, color: c.onSecondaryContainer }}>
                      للاستعادة، اختر ملف النسخة من Drive في منتقي الملفات، أو نزّله على جهازك أولاً.
                    </T>
                    <View style={{ flexDirection: 'row' }}>
                      <OutlineButton label="استعادة ملف من Drive" c={c} onPress={onRestore} disabled={backup.working} />
                    </View>
                    <T style={{ ...M3.type.bodyMedium, color: c.onSecondaryContainer }}>
                      تأكد من ظهور الملف في Drive بعد الحفظ. فتح قائمة المشاركة وحده لا يعني اكتمال النسخ.
                    </T>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <View style={{ backgroundColor: c.surfaceContainerHigh, borderRadius: M3.shape.medium, padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialIcon name="shield" color={c.onSurfaceVariant} />
            <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>احمِ دفترك خارج الجهاز</T>
          </View>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
            المجلد المحلي وحده لا يحميك من فقدان الهاتف. احتفظ بنسخة على جهاز آخر أو خدمة سحابية.
          </T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
            {backup.supportsAuto
              ? 'استعد نسختك السابقة أو اضغط «نسخ الآن» لإنشاء أول نسخة وتفعيل الحفظ التلقائي.'
              : 'احتفظ بنسخة جديدة بعد التعديلات المهمة، وتأكد من اكتمال حفظ الملف في المكان الذي اخترته.'}
          </T>
        </View>
        <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>
          نسخ المجلد والتقرير العادي غير مشفّرة. للتصدير المحمي، اختر «النسخ والاستعادة» من الإعدادات ثم «إنشاء نسخة محمية». الاستعادة تستبدل الدفتر بعد المعاينة والتأكيد.
        </T>
      </ScrollView>
    </View>
  );
}

export function TargetGlyph({ id, color }: { id: BackupTarget; color: string }) {
  return <MaterialIcon name={id === 'drive' ? 'cloud' : id === 'folder' ? 'folder' : id === 'file' ? 'description' : 'cloud_off'} color={color} />;
}
