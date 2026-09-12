import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { OutlinedField, OutlineButton, PrimaryButton, ScreenHeader, T } from '../components/ui';
import { personNameError } from '../people';
import { Colors, M3 } from '../theme';
import { Person } from '../types';

interface Props {
  c: Colors;
  people: Person[];
  personId: string;
  name: string;
  onChangeName: (name: string) => void;
  onBack: () => void;
  onSave: () => boolean;
}

/** The parent owns the draft so a privacy lock cannot discard a name correction. */
export function PersonNameEditor({ c, people, personId, name, onChangeName, onBack, onSave }: Props) {
  const [saveError, setSaveError] = useState('');
  const submitting = useRef(false);
  const person = people.find(row => row.id === personId);
  const error = personNameError(people, personId, name);
  const changed = !!person && name.trim() !== person.name;
  const canSave = changed && !error;
  const save = () => {
    if (!canSave || submitting.current) return;
    submitting.current = true;
    if (!onSave()) {
      submitting.current = false;
      setSaveError('تعذّر حفظ الاسم. حاول مرة أخرى.');
    }
  };

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenHeader c={c} title="تعديل اسم الشخص" glyph="→" onBack={onBack} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }}>
      <T style={{ ...M3.type.bodyLarge, color: c.onSurfaceVariant }}>
        سيظهر الاسم الجديد في السجلات والتقارير. تبقى الديون والدفعات مرتبطة بالشخص نفسه.
      </T>
      <OutlinedField c={c} label="اسم الشخص" value={name} autoFocus maxLength={100}
        returnKeyType="done" onSubmitEditing={save} autoCorrect={false}
        onChangeText={value => { setSaveError(''); onChangeName(value); }}
        error={!!error} helperText={error ?? 'اكتب اسماً واضحاً يميّز هذا الشخص.'} />
      {!!saveError && <T accessibilityRole="alert" style={{ ...M3.type.bodyMedium, color: c.error }}>{saveError}</T>}
      <PrimaryButton c={c} label="حفظ الاسم" disabled={!canSave} onPress={save} />
      <View><OutlineButton c={c} label="إلغاء" onPress={onBack} /></View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
