import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { BellIcon } from '../components/icons';
import { normalizeAmountInput } from '../components/Keypad';
import { Chip, MaterialPressable, OutlinedField, PrimaryButton, SectionHeading, T, Toggle } from '../components/ui';
import { arDate, AR_WEEKDAYS, fmt, localDate } from '../format';
import { MAX_DEBT_REMINDERS, planReminders } from '../reminderPlan';
import { clearSnooze, defaultReminderSettings, parseReminderTime, ReminderSettings, reminderTime, snoozeDebt } from '../reminderSettings';
import { DebtView } from '../selectors';
import { Colors, M3 } from '../theme';

interface Props {
  c: Colors;
  debts: DebtView[];
  prefs: Record<string, boolean>;
  weekly: boolean;
  settings?: ReminderSettings;
  onChangeSettings?: (settings: ReminderSettings) => void;
  onToggle: (debtId: string, on: boolean) => void;
  onToggleWeekly: () => void;
  notificationStatus?: 'checking' | 'ready' | 'denied' | 'blocked' | 'unavailable';
  onEnable?: () => void;
  onOpenSettings?: () => void;
}

const leadOptions = [{ value: 0, label: 'بدون' }, { value: 1, label: 'قبل يوم' }, { value: 3, label: 'قبل 3 أيام' }, { value: 7, label: 'قبل 7 أيام' }];
const repeatOptions = [{ value: 0, label: 'بدون' }, { value: 1, label: 'كل يوم' }, { value: 3, label: 'كل 3 أيام' }, { value: 7, label: 'كل أسبوع' }];

function dateAndTime(stamp: string | Date): string {
  const date = typeof stamp === 'string' ? localDate(stamp) : stamp;
  return `${arDate(date.toISOString())} · ${reminderTime({ hour: date.getHours(), minute: date.getMinutes() })}`;
}

function SmallAction({ c, label, accessibilityLabel, onPress }: { c: Colors; label: string; accessibilityLabel: string; onPress: () => void }) {
  return <MaterialPressable c={c} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 24 }}>
    {({ pressed, hovered }) => <T style={{ ...M3.type.labelLarge, color: c.primary, opacity: pressed || hovered ? 0.75 : 1 }}>{label}</T>}
  </MaterialPressable>;
}

export function Reminders({ c, debts, prefs, weekly, settings: providedSettings, onChangeSettings, onToggle, onToggleWeekly, notificationStatus, onEnable, onOpenSettings }: Props) {
  const settings = providedSettings ?? defaultReminderSettings();
  const [timeDraft, setTimeDraft] = useState(() => reminderTime(settings));
  useEffect(() => setTimeDraft(reminderTime(settings)), [settings.hour, settings.minute]);
  const parsedTime = parseReminderTime(timeDraft);
  const timeChanged = timeDraft !== reminderTime(settings);
  const change = (patch: Partial<ReminderSettings>) => onChangeSettings?.({ ...settings, ...patch });
  const saveTime = () => {
    if (!parsedTime) return;
    setTimeDraft(reminderTime(parsedTime));
    change(parsedTime);
  };
  const now = Date.now();
  const planned = planReminders(debts, prefs, now, settings).slice(0, MAX_DEBT_REMINDERS);
  const nextByDebt = new Map(planned.map(item => [item.debt.id, item] as const).reverse());
  const items = debts.filter(d => !d.closed && !d.voidedAt && d.nextDueAt).sort((a, b) => a.dueIn - b.dueIn);
  const card = { padding: 16, gap: 12, borderRadius: 12, backgroundColor: c.surfaceContainerLow } as const;

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 104, gap: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ minHeight: 64, justifyContent: 'center' }}>
        <T accessibilityRole="header" style={{ ...M3.type.headlineMedium, color: c.onSurface }}>التذكيرات</T>
      </View>
      <T style={{ ...M3.type.bodyLarge, color: c.onSurfaceVariant }}>تذكيرات خاصة لك فقط. اختر وقتها وأجّل المتابعة عند الحاجة. لا يُرسل شيء للطرف الآخر.</T>

      {notificationStatus && notificationStatus !== 'ready' && (
        <View style={{ ...card, backgroundColor: c.warnBg }}>
          <T accessibilityLiveRegion="polite" style={{ ...M3.type.bodyMedium, color: c.warnFg }}>
            {notificationStatus === 'unavailable'
              ? Platform.OS === 'web'
                ? 'الإشعارات غير متاحة هنا. يمكنك حفظ تفضيلاتك، وتعمل التنبيهات في تطبيق الهاتف بعد السماح بها.'
                : 'تعذر إعداد التذكيرات على هذا الجهاز. تفضيلاتك محفوظة؛ أعد المحاولة.'
              : notificationStatus === 'blocked'
                ? 'الإشعارات أو قناة التذكيرات متوقفة في إعدادات الجهاز. افتح الإعدادات للسماح بها؛ تفضيلاتك هنا محفوظة.'
              : notificationStatus === 'denied'
                ? 'الإشعارات غير مفعّلة. اسمح بها هنا أو من إعدادات الجهاز لتصلك التذكيرات.'
                : 'جارٍ التحقق من الإشعارات وجدولة التذكيرات…'}
          </T>
          {notificationStatus === 'denied' && onEnable && <PrimaryButton label="تفعيل الإشعارات" onPress={onEnable} c={c} />}
          {notificationStatus === 'unavailable' && Platform.OS !== 'web' && onEnable && <PrimaryButton label="إعادة المحاولة" onPress={onEnable} c={c} />}
          {notificationStatus === 'blocked' && onOpenSettings && <PrimaryButton label="إعدادات الجهاز" onPress={onOpenSettings} c={c} />}
        </View>
      )}

      <View style={card}>
        <SectionHeading c={c}>وقت التذكيرات</SectionHeading>
        <OutlinedField c={c} label="الوقت بنظام 24 ساعة" value={timeDraft} onChangeText={value => setTimeDraft(normalizeAmountInput(value))}
          placeholder="20:00" keyboardType="numbers-and-punctuation" maxLength={5} autoCorrect={false}
          style={{ writingDirection: 'ltr', textAlign: 'left' }} error={timeChanged && !parsedTime}
          helperText={timeChanged && !parsedTime ? 'اكتب وقتاً من 00:00 إلى 23:59.' : 'حسب التوقيت المحلي لجهازك، ويشمل التذكير الأسبوعي.'}
          onSubmitEditing={saveTime} />
        {timeChanged && <PrimaryButton c={c} label="حفظ الوقت" disabled={!parsedTime} onPress={saveTime} />}
        <SectionHeading c={c}>تذكير إضافي قبل الاستحقاق</SectionHeading>
        <View accessibilityLabel="التذكير قبل الاستحقاق" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {leadOptions.map(option => <Chip key={option.value} c={c} label={option.label} selected={settings.leadDays === option.value} onPress={() => change({ leadDays: option.value })} />)}
          {!leadOptions.some(option => option.value === settings.leadDays) && <Chip c={c} label={`قبل ${settings.leadDays} يوم`} selected onPress={() => {}} />}
        </View>
        <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>يبقى تذكير يوم الاستحقاق مفعّلاً لكل قسط غير مسدد.</T>
        <SectionHeading c={c}>تكرار متابعة المتأخر</SectionHeading>
        <View accessibilityLabel="تكرار متابعة المتأخر" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {repeatOptions.map(option => <Chip key={option.value} c={c} label={option.label} selected={settings.overdueRepeatDays === option.value} onPress={() => change({ overdueRepeatDays: option.value })} />)}
          {!repeatOptions.some(option => option.value === settings.overdueRepeatDays) && <Chip c={c} label={`كل ${settings.overdueRepeatDays} يوم`} selected onPress={() => {}} />}
        </View>
        <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>تبدأ المتابعة بعد الاستحقاق، وتتوقف عند اكتمال السداد.</T>
      </View>

      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>تذكير أسبوعي عام</T>
            <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{`كل ${AR_WEEKDAYS[settings.weeklyDay - 1]} · ${reminderTime(settings)}`}</T>
          </View>
          <Toggle label="تذكير أسبوعي عام" on={weekly} onToggle={onToggleWeekly} c={c} />
        </View>
        {weekly && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AR_WEEKDAYS.map((day, index) => <Chip key={day} c={c} label={day} selected={settings.weeklyDay === index + 1} onPress={() => change({ weeklyDay: index + 1 })} />)}
        </View>}
      </View>

      <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>إخفاء تفاصيل الإشعارات</T>
          <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>يظهر تنبيه عام بدون أسماء أو مبالغ أو ملاحظات.</T>
        </View>
        <Toggle label="إخفاء تفاصيل الإشعارات" c={c} on={settings.privateNotifications} onToggle={() => change({ privateNotifications: !settings.privateNotifications })} />
      </View>

      <SectionHeading c={c}>الديون والأقساط</SectionHeading>
      <View style={{ gap: 8 }}>
        {items.map(d => {
          const enabled = prefs[d.id] ?? true;
          const stamp = settings.snoozedUntil[d.id];
          const snoozed = stamp && Date.parse(stamp) > now;
          const next = nextByDebt.get(d.id);
          return <View key={d.id} style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}><BellIcon color={c.onSecondaryContainer} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <T style={{ ...M3.type.titleMedium, color: c.onSurface }}>{d.dir === 'me' ? `متابعة ${d.personName}` : `سداد ${d.personName}`}</T>
                <T style={{ ...M3.type.bodyMedium, color: c.onSurfaceVariant }}>{`${fmt(d.rem)} ر.س${d.note ? ` · ${d.note}` : ''}`}</T>
                <T style={{ ...M3.type.bodyMedium, color: d.dueIn < 0 ? c.error : c.onSurfaceVariant }}>{`${d.dueIn < 0 ? 'متأخر منذ' : 'الاستحقاق'} ${arDate(d.nextDueAt)}`}</T>
              </View>
              <Toggle label={`تذكير ${d.personName}: ${d.note || 'دين'}`} on={enabled} onToggle={() => onToggle(d.id, !enabled)} c={c} />
            </View>
            {enabled && <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>
              {snoozed ? `مؤجل إلى ${dateAndTime(stamp)}` : next ? `التنبيه القادم: ${dateAndTime(next.when)}` : d.dueIn < 0 && settings.overdueRepeatDays === 0 ? 'المتابعة المتكررة متوقفة. يمكنك تأجيل تذكير واحد أدناه.' : 'تُجدول أقرب المواعيد أولاً وتُحدّث عند فتح الدفتر.'}
            </T>}
            {enabled && (d.dueIn <= 0 || snoozed) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              <SmallAction c={c} label="إلى الغد" accessibilityLabel={`تأجيل تذكير ${d.personName} إلى الغد`} onPress={() => onChangeSettings?.(snoozeDebt(settings, d.id, 1))} />
              <SmallAction c={c} label="بعد 7 أيام" accessibilityLabel={`تأجيل تذكير ${d.personName} لمدة 7 أيام`} onPress={() => onChangeSettings?.(snoozeDebt(settings, d.id, 7))} />
              {snoozed && <SmallAction c={c} label="إلغاء التأجيل" accessibilityLabel={`إلغاء تأجيل تذكير ${d.personName}`} onPress={() => onChangeSettings?.(clearSnooze(settings, d.id))} />}
            </View>}
          </View>;
        })}
        {items.length === 0 && <T style={{ ...card, padding: 24, textAlign: 'center', color: c.onSurfaceVariant, ...M3.type.bodyLarge }}>لا توجد ديون مفتوحة لها تاريخ استحقاق. حدّد تاريخاً عند إضافة دين ليظهر هنا.</T>}
      </View>
      <T style={{ ...M3.type.bodySmall, color: c.onSurfaceVariant }}>نحتفظ بأقرب 60 تنبيهاً إضافة إلى التذكير الأسبوعي. تتجدد المواعيد عند فتح الدفتر، وقد يؤخرها وضع توفير الطاقة في الجهاز.</T>
    </ScrollView>
  );
}
