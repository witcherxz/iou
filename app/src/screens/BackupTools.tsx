import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FolderBackupVersion } from '../backup/folder';
import { Chip, OutlineButton, OutlinedField, PrimaryButton, ScreenHeader, SectionHeading, T, Touch } from '../components/ui';
import { Colors, M3 } from '../theme';
import { BackupView, PortableExport } from '../useBackup';

interface Props {
  c: Colors;
  backup: BackupView;
  versions: FolderBackupVersion[];
  historyError: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onRestoreVersion: (id: string) => void;
  onRestoreFile: () => void;
  onExport: (format: PortableExport, password?: string) => Promise<boolean>;
  onOpenLocalHistory?: () => void;
}
const sheetOptions = [
  { value: 'balances', label: 'الأرصدة' }, { value: 'transactions', label: 'العمليات' },
  { value: 'installments', label: 'الأقساط' }, { value: 'history', label: 'التصحيحات' },
] as const;

export function BackupTools({ c, backup, versions, historyError, onBack, onRefresh, onRestoreVersion,
  onRestoreFile, onExport, onOpenLocalHistory }: Props) {
  const [sheet, setSheet] = useState<PortableExport>('transactions');
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  useEffect(() => { if (backup.target === 'folder') onRefresh(); }, [backup.target, onRefresh]);
  const section = { backgroundColor: c.surfaceContainerLow, borderRadius: M3.shape.medium, padding: 16, gap: 12 };
  const body = { ...M3.type.bodyMedium, color: c.onSurfaceVariant };
  const secureExport = async () => {
    if (await onExport('encrypted', password)) { setPassword(''); setRepeat(''); setProtect(false); }
  };
  return <View style={{ flex: 1 }}>
    <ScreenHeader title="النسخ والاستعادة" glyph="→" onBack={onBack} c={c} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      <View style={section}>
        <SectionHeading c={c}>دفترك قابل للقراءة خارج التطبيق</SectionHeading>
        <T style={body}>صدّر تقريراً يفتح في المتصفح دون إنترنت، ويشمل الأرصدة والعمليات والأقساط وسجل التصحيحات. يحتوي على جداول CSV ونسخة كاملة للاستعادة.</T>
        <PrimaryButton c={c} label="تصدير التقرير الكامل" disabled={backup.working} onPress={() => void onExport('report')} />
        <T style={body}>للاستخدام في Excel أو أي برنامج جداول، اختر الجدول ثم صدّره.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sheetOptions.map(option => <Chip key={option.value} c={c} label={option.label} selected={sheet === option.value} onPress={() => setSheet(option.value)} />)}
        </View>
        <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="تصدير جدول CSV" disabled={backup.working} onPress={() => void onExport(sheet)} /></View>
        <T style={body}>التقرير والجداول العادية غير مشفّرة. ملفات CSV للقراءة والتحليل، ولا تُستورد كدفتر.</T>
      </View>
      <View style={section}>
        <SectionHeading c={c}>نسخة خاصة بكلمة مرور</SectionHeading>
        <T style={body}>تفتح النسخة المحمية في متصفح حديث أو داخل التطبيق باستخدام كلمة المرور. لا يتم حفظ كلمة المرور؛ احتفظ بها في مكان آمن، فلا يمكن استرجاعها.</T>
        {!protect ? <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="إنشاء نسخة محمية" onPress={() => setProtect(true)} disabled={backup.working} /></View> : <>
          <OutlinedField c={c} label="كلمة مرور جديدة" secureTextEntry value={password} onChangeText={setPassword}
            editable={!backup.working} autoCapitalize="none" autoCorrect={false} maxLength={1024}
            helperText="10 أحرف على الأقل؛ استخدم عبارة يسهل تذكّرها" />
          <OutlinedField c={c} label="تأكيد كلمة المرور" secureTextEntry value={repeat} onChangeText={setRepeat}
            editable={!backup.working} autoCapitalize="none" autoCorrect={false} maxLength={1024}
            error={!!repeat && repeat !== password} helperText={repeat && repeat !== password ? 'كلمتا المرور غير متطابقتين' : undefined} />
          <PrimaryButton c={c} label="تصدير النسخة المحمية" disabled={password.length < 10 || repeat !== password || backup.working}
            onPress={() => void secureExport()} loading={backup.working} />
          <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="إلغاء كلمة المرور" disabled={backup.working} onPress={() => { setProtect(false); setPassword(''); setRepeat(''); }} /></View>
        </>}
      </View>
      <View style={section}>
        <SectionHeading c={c}>استعادة ملف</SectionHeading>
        <T style={body}>اختر تقرير HTML أو نسخة JSON قديمة أو نسخة محمية. ستُعرض تفاصيل النسخة قبل استبدال الدفتر، وتبقى نسخة محلية من الدفتر السابق.</T>
        <PrimaryButton c={c} label="اختيار ملف للاستعادة" onPress={onRestoreFile} disabled={backup.working} />
      </View>
      {backup.target === 'folder' && <View style={section}>
        <SectionHeading c={c}>النسخ السابقة في المجلد</SectionHeading>
        <T style={body}>يحتفظ المجلد بآخر 10 نسخ سليمة، مع تقرير وجداول قابلة للقراءة. اختر التاريخ لمعاينة النسخة واستعادتها.</T>
        <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="تحديث قائمة النسخ" onPress={onRefresh} disabled={backup.working} /></View>
        {historyError ? <T accessibilityRole="alert" style={{ ...body, color: c.error }}>{historyError}</T> : versions.length === 0 ? <T style={body}>{backup.working ? 'جارٍ قراءة النسخ…' : 'لا توجد نسخ سليمة في المجلد بعد.'}</T> : versions.map(version => {
          const date = new Date(version.backedUpAt).toLocaleString('ar-SA', { calendar: 'gregory', numberingSystem: 'latn' });
          return <Touch key={version.id} onPress={() => onRestoreVersion(version.id)} disabled={backup.working}
            accessibilityLabel={`استعادة نسخة ${date}`} style={{ minHeight: 64, paddingVertical: 12, gap: 4, borderTopWidth: 1, borderTopColor: c.outlineVariant }}>
            <T style={{ ...M3.type.titleMedium, color: c.primary }}>{date}</T>
            <T style={body}>{version.peopleCount} أشخاص · {version.transactionCount} عمليات</T>
          </Touch>;
        })}
      </View>}
      {onOpenLocalHistory && <View style={section}>
        <SectionHeading c={c}>نقاط الاستعادة على هذا الجهاز</SectionHeading>
        <T style={body}>راجع نسخ الدفتر المحلية للعودة إلى حالة سابقة. النسخ المحلية لا تحمي من فقدان الجهاز.</T>
        <View style={{ flexDirection: 'row' }}><OutlineButton c={c} label="سجل الاستعادة المحلي" onPress={onOpenLocalHistory} disabled={backup.working} /></View>
      </View>}
    </ScrollView>
  </View>;
}
