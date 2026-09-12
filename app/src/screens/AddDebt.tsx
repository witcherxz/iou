import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { applyKey, Keypad } from '../components/Keypad';
import { Chip, PrimaryButton, ScreenHeader, Segment, T } from '../components/ui';
import { fmt } from '../format';
import { Colors } from '../theme';
import { Person } from '../types';

type Dir = 'me' | 'owe';
type Plan = 'single' | 'install';

const DUE_CHIPS: { days: number | null; label: string }[] = [
  { days: 7, label: 'أسبوع' },
  { days: 14, label: 'أسبوعان' },
  { days: 30, label: 'شهر' },
  { days: null, label: 'بدون' },
];

interface Props {
  c: Colors;
  people: Person[];
  initialDir: Dir;
  initialPersonId: string | null;
  onClose: () => void;
  onAddPerson: (name: string) => string;
  onSave: (input: {
    personId: string;
    dir: Dir;
    amount: number;
    note: string;
    dueInDays: number | null;
    installmentCount?: number;
  }) => void;
}

export function AddDebt({ c, people, initialDir, initialPersonId, onClose, onAddPerson, onSave }: Props) {
  const [dir, setDir] = useState<Dir>(initialDir);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [personId, setPersonId] = useState<string | null>(initialPersonId);
  const [plan, setPlan] = useState<Plan>('single');
  const [dueDays, setDueDays] = useState<number | null>(7);
  const [installN, setInstallN] = useState(3);
  const [newPersonMode, setNewPersonMode] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  const amt = parseFloat(amount) || 0;
  const color = dir === 'me' ? c.green : c.red;
  const canSave = amt > 0 && !!personId;

  const amountLabel = amount
    ? fmt(parseFloat(amount) || 0) + (amount.endsWith('.') ? '٫' : '')
    : '٠';

  const perInstallment = amt > 0 ? Math.round((amt / installN) * 100) / 100 : 0;

  const confirmNewPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    setPersonId(onAddPerson(name));
    setNewPersonMode(false);
    setNewPersonName('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="دين جديد" glyph="✕" onBack={onClose} c={c} />

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24, gap: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Segment
          c={c}
          value={dir}
          onChange={setDir}
          options={[{ value: 'me', label: 'يدين لي' }, { value: 'owe', label: 'أدين له' }]}
        />

        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <T style={{ fontSize: 13, color: c.muted }}>المبلغ</T>
          <T style={{ fontSize: 52, fontWeight: '700', color, lineHeight: 58, marginTop: 6 }}>
            {amountLabel} <T style={{ fontSize: 18, color: c.muted }}>ر.س</T>
          </T>
        </View>

        <View>
          <T style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>الشخص</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {people.map(p => (
              <Chip
                key={p.id}
                label={p.name}
                selected={personId === p.id}
                onPress={() => setPersonId(p.id)}
                c={c}
              />
            ))}
            <Chip label="+ شخص جديد" dashed onPress={() => setNewPersonMode(true)} c={c} />
          </View>

          {newPersonMode && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput
                value={newPersonName}
                onChangeText={setNewPersonName}
                onSubmitEditing={confirmNewPerson}
                placeholder="اسم الشخص"
                placeholderTextColor={c.muted}
                autoFocus
                style={{
                  flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: c.border,
                  backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontSize: 14, textAlign: 'right',
                }}
              />
              <Pressable
                onPress={confirmNewPerson}
                disabled={!newPersonName.trim()}
                style={{
                  height: 44, paddingHorizontal: 18, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: newPersonName.trim() ? c.primary : c.track,
                }}
              >
                <T style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>إضافة</T>
              </Pressable>
            </View>
          )}
        </View>

        <View>
          <T style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>طريقة السداد</T>
          <Segment
            c={c}
            value={plan}
            onChange={setPlan}
            options={[{ value: 'single', label: 'دفعة واحدة' }, { value: 'install', label: 'دفعات مقسّطة' }]}
          />
        </View>

        {plan === 'install' ? (
          <>
            <View>
              <T style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>عدد الدفعات (شهرياً)</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Stepper c={c} glyph="−" onPress={() => setInstallN(n => Math.max(2, n - 1))} />
                <T style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700', color: c.text }}>
                  {fmt(installN, 0)}
                </T>
                <Stepper c={c} glyph="+" onPress={() => setInstallN(n => Math.min(36, n + 1))} />
              </View>
            </View>
            <View style={{ backgroundColor: c.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
              <T style={{ fontSize: 13, color: c.muted }}>
                {fmt(installN, 0)} دفعات × {fmt(perInstallment)} ر.س، كل شهر، تبدأ بعد شهر واحد
              </T>
            </View>
          </>
        ) : (
          <View>
            <T style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>تاريخ الاستحقاق</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DUE_CHIPS.map(ch => (
                <Chip
                  key={String(ch.days)}
                  label={ch.label}
                  selected={dueDays === ch.days}
                  onPress={() => setDueDays(ch.days)}
                  c={c}
                />
              ))}
            </View>
          </View>
        )}

        <View>
          <T style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>ملاحظة (اختياري)</T>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="مثال: غداء، تذاكر، سلفة"
            placeholderTextColor={c.muted}
            style={{
              width: '100%', height: 48, borderRadius: 14, borderWidth: 1, borderColor: c.border,
              backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontSize: 14, textAlign: 'right',
            }}
          />
        </View>

        <View style={{ marginTop: 'auto' }}>
          <Keypad c={c} onKey={k => setAmount(v => applyKey(v, k))} />
        </View>

        <PrimaryButton
          label="حفظ"
          c={c}
          disabled={!canSave}
          onPress={() =>
            canSave &&
            onSave({
              personId: personId!,
              dir,
              amount: amt,
              note,
              dueInDays: dueDays,
              installmentCount: plan === 'install' ? installN : undefined,
            })
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stepper({ c, glyph, onPress }: { c: Colors; glyph: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: pressed ? c.cardHover : c.card,
        alignItems: 'center', justifyContent: 'center',
      })}
    >
      <T style={{ fontSize: 20, fontWeight: '600', color: c.text }}>{glyph}</T>
    </Pressable>
  );
}
