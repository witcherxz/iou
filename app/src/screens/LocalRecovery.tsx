import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { OutlineButton, PrimaryButton, ScreenHeader, T } from '../components/ui';
import { confirmAction } from '../confirm';
import { fmt } from '../format';
import { LocalSnapshot } from '../store/history';
import { Colors, M3 } from '../theme';
import { PersistedState } from '../types';

export function LocalRecovery({ c, onBack, onList, onRestore }: {
  c: Colors; onBack: () => void; onList: () => Promise<LocalSnapshot[]>;
  onRestore: (state: PersistedState) => Promise<void>;
}) {
  const [rows, setRows] = useState<LocalSnapshot[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setRows(await onList()); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّرت قراءة النسخ.'); }
    finally { setBusy(false); }
  }, [onList]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <View style={{ flex: 1 }}>
    <ScreenHeader c={c} title="نسخ سابقة على الجهاز" glyph="→" onBack={onBack} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>تُحفظ آخر 10 نسخ قبل تغييرات السجل على هذا الجهاز. استعادة نسخة تستبدل الدفتر الحالي؛ احتفظ أيضاً بنسخة خارج الجهاز.</T>
      <OutlineButton c={c} label="تحديث النسخ" onPress={refresh} disabled={busy} />
      {error ? <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>{error}</T> : null}
      {!busy && !rows.length && <T style={{ ...M3.type.bodyLarge, color: c.onSurface }}>لا توجد نسخ سابقة بعد.</T>}
      {rows.map(row => <View key={row.id} style={{ padding: 16, gap: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLow }}>
        <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>{row.createdAt ? new Date(row.createdAt).toLocaleString('ar-SA', { numberingSystem: 'latn', calendar: 'gregory' }) : 'النسخة السابقة'}</T>
        <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{row.state.profileName} · {fmt(row.state.people.length, 0)} أشخاص · {fmt(row.state.tx.filter(t => !t.voidedAt).length, 0)} عمليات</T>
        <PrimaryButton c={c} label="استعادة هذه النسخة" height={48} disabled={busy} onPress={async () => {
          if (busy) return;
          setBusy(true); setError('');
          try {
            if (!(await confirmAction('استعادة نسخة محلية', 'سيتم استبدال الدفتر الحالي بهذه النسخة. تبقى إعدادات النسخ وقفل هذا الجهاز كما هي.', 'استعادة'))) return;
            await onRestore(row.state);
          } catch (e) { setError(e instanceof Error ? e.message : 'تعذّرت الاستعادة.'); }
          finally { setBusy(false); }
        }} />
      </View>)}
    </ScrollView>
  </View>;
}
