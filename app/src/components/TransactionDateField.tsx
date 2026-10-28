import React from 'react';
import { View } from 'react-native';
import { addDays, isCalendarDate, todayISO } from '../format';
import { Colors } from '../theme';
import { DateField } from './DatePicker';
import { Chip } from './ui';

/** The date money changed hands, independent of a due date or save timestamp. */
export function TransactionDateField({ c, value, onChange, label }: {
  c: Colors; value: string; onChange: (value: string) => void; label: string;
}) {
  const today = todayISO();
  const valid = isCalendarDate(value) && value <= today;
  return (
    <View style={{ gap: 4 }}>
      <DateField c={c} label={label} value={value} onChange={onChange} max={today} error={!valid}
        helperText={valid ? 'التاريخ الفعلي للعملية.' : 'اختر تاريخاً صحيحاً لا يتجاوز اليوم.'} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip c={c} label="تاريخ اليوم" selected={value === today} onPress={() => onChange(today)} />
        <Chip c={c} label="تاريخ أمس" selected={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
      </View>
    </View>
  );
}
