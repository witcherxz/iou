import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { clampDate, fullArDate, monthCells, monthInRange, shiftMonth } from '../calendar';
import { AR_MONTHS, isCalendarDate, localDate, todayISO } from '../format';
import { Colors, M3 } from '../theme';
import { AppDialog } from './AppDialog';
import { MaterialIcon } from './icons';
import { T, Touch } from './ui';

const WEEKDAY_INITIALS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

type PickRequest = { title: string; value: string; min?: string; max?: string; resolve: (value: string | null) => void };
let openPicker: ((request: PickRequest) => void) | null = null;

/** Ask the root host for a date; resolves null when cancelled or when no host is mounted. */
function pickDate(request: Omit<PickRequest, 'resolve'>): Promise<string | null> {
  return new Promise(resolve => openPicker ? openPicker({ ...request, resolve }) : resolve(null));
}

/** Mounted once with the app's dialogs: Android dialogs render in place, so they must live at the root. */
export function DatePickerHost({ c }: { c: Colors }) {
  const [request, setRequest] = useState<PickRequest | null>(null);
  useEffect(() => {
    let pending: PickRequest | null = null;
    const open = (next: PickRequest) => { pending?.resolve(null); pending = next; setRequest(next); };
    openPicker = open;
    return () => { if (openPicker === open) openPicker = null; pending?.resolve(null); };
  }, []);
  if (!request) return null;
  const finish = (value: string | null) => { setRequest(null); request.resolve(value); };
  return <DatePickerDialog key={`${request.title}${request.value}`} c={c} title={request.title} value={request.value} min={request.min} max={request.max}
    onCancel={() => finish(null)} onConfirm={finish} />;
}

/** Outlined field that opens an in-app calendar; native pickers would trigger the privacy lock. */
export function DateField({ c, label, value, onChange, min, max, helperText, error, placeholder = 'اختر تاريخاً' }: {
  c: Colors; label: string; value: string; onChange: (value: string) => void;
  /** Inclusive ISO calendar bounds. */
  min?: string; max?: string; helperText?: string; error?: boolean; placeholder?: string;
}) {
  const shown = isCalendarDate(value) ? fullArDate(value) : '';
  return (
    <View style={{ paddingTop: 8 }}>
      <Touch onPress={() => { pickDate({ title: label, value, min, max }).then(picked => { if (picked) onChange(picked); }); }} accessibilityLabel={`${label}: ${shown || placeholder}`} accessibilityHint="يفتح التقويم لاختيار التاريخ"
        pressedBackground={c.surfaceContainerHigh}
        style={{ minHeight: 56, borderRadius: 4, borderWidth: 1, borderColor: error ? c.error : c.outline, backgroundColor: c.surface,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -10, right: 12, paddingHorizontal: 4, backgroundColor: c.surface }}>
          <T accessible={false} style={{ ...M3.type.bodySmall, color: error ? c.error : c.onSurfaceVariant }}>{label}</T>
        </View>
        <T style={{ ...M3.type.bodyLarge, flex: 1, color: shown ? c.onSurface : c.onSurfaceVariant }}>{shown || placeholder}</T>
        <T accessible={false} style={{ ...M3.type.bodyLarge, color: c.onSurfaceVariant }}>▾</T>
      </Touch>
      {helperText ? (
        <T accessibilityRole={error ? 'alert' : undefined}
          style={{ ...M3.type.bodySmall, color: error ? c.error : c.onSurfaceVariant, paddingHorizontal: 16, paddingTop: 4 }}>{helperText}</T>
      ) : null}
    </View>
  );
}

function DatePickerDialog({ c, title, value, min, max, onCancel, onConfirm }: {
  c: Colors; title: string; value: string; min?: string; max?: string;
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const today = todayISO();
  const [draft, setDraft] = useState(() => clampDate(isCalendarDate(value) ? value : today, min, max));
  const [view, setView] = useState(() => { const d = localDate(draft); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [choosingYear, setChoosingYear] = useState(false);
  const previous = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  const canPrevious = monthInRange(previous.year, previous.month, min, max);
  const canNext = monthInRange(next.year, next.month, min, max);
  const cells = monthCells(view.year, view.month);
  const firstYear = min ? Number(min.slice(0, 4)) : Number(today.slice(0, 4)) - 30;
  const lastYear = max ? Number(max.slice(0, 4)) : Number(today.slice(0, 4)) + 30;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  const pickYear = (year: number) => {
    // Keep the month when possible; otherwise move to the nearest month that has selectable days.
    const lowest = min && year === firstYear ? Number(min.slice(5, 7)) - 1 : 0;
    const highest = max && year === lastYear ? Number(max.slice(5, 7)) - 1 : 11;
    setView({ year, month: Math.min(Math.max(view.month, lowest), highest) });
    setChoosingYear(false);
  };

  return (
    <AppDialog visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: width < 360 ? 12 : 24, backgroundColor: c.scrim }}>
        <View accessible={false} onStartShouldSetResponder={() => true} onResponderRelease={onCancel}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 400, maxHeight: height - 48, borderRadius: M3.shape.extraLarge,
            backgroundColor: c.surfaceContainerHigh, paddingVertical: 20, paddingHorizontal: width < 360 ? 8 : 12, direction: 'rtl', gap: 12 }}>
          <View style={{ paddingHorizontal: 12, gap: 4 }}>
            <T style={{ ...M3.type.labelLarge, color: c.onSurfaceVariant }}>{title}</T>
            <T accessibilityLiveRegion="polite" style={{ ...M3.type.headlineSmall, color: c.onSurface }}>{fullArDate(draft)}</T>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
            <Touch onPress={() => setChoosingYear(value => !value)} pressedBackground={c.stateLayer}
              accessibilityLabel={`${AR_MONTHS[view.month]} ${view.year}، ${choosingYear ? 'العودة إلى الأيام' : 'اختيار السنة'}`}
              style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T style={{ ...M3.type.titleSmall, color: c.onSurface }}>{AR_MONTHS[view.month]} {view.year}</T>
              <T style={{ ...M3.type.titleSmall, color: c.onSurfaceVariant }}>{choosingYear ? '▴' : '▾'}</T>
            </Touch>
            <View style={{ flex: 1 }} />
            {!choosingYear && <>
              <NavButton c={c} label="الشهر السابق" flip disabled={!canPrevious} onPress={() => setView(previous)} />
              <NavButton c={c} label="الشهر التالي" disabled={!canNext} onPress={() => setView(next)} />
            </>}
          </View>

          {choosingYear ? (
            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 }}>
              {years.map(year => {
                const on = year === view.year;
                return <Touch key={year} onPress={() => pickYear(year)} accessibilityLabel={`سنة ${year}`} accessibilityState={{ selected: on }}
                  pressedBackground={c.stateLayer}
                  style={{ width: '25%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: on ? c.primary : 'transparent' }}>
                  <T style={{ ...M3.type.bodyLarge, color: on ? c.onPrimary : c.onSurface }}>{year}</T>
                </Touch>;
              })}
            </ScrollView>
          ) : (
            <View>
              <View style={{ flexDirection: 'row' }}>
                {WEEKDAY_INITIALS.map(day => <T key={day} accessible={false}
                  style={{ ...M3.type.bodySmall, flex: 1, textAlign: 'center', color: c.onSurfaceVariant, paddingVertical: 8 }}>{day}</T>)}
              </View>
              {Array.from({ length: cells.length / 7 }, (_, week) => (
                <View key={week} style={{ flexDirection: 'row' }}>
                  {cells.slice(week * 7, week * 7 + 7).map((iso, index) => {
                    if (!iso) return <View key={index} style={{ flex: 1, height: 44 }} />;
                    const disabled = (!!min && iso < min) || (!!max && iso > max);
                    const selected = iso === draft;
                    return (
                      <Pressable key={iso} disabled={disabled} onPress={() => setDraft(iso)}
                        accessibilityRole="button" accessibilityLabel={fullArDate(iso)} accessibilityState={{ selected, disabled }}
                        style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.38 : 1 }}>
                        {({ pressed }) => (
                          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                            borderWidth: iso === today && !selected ? 1 : 0, borderColor: c.primary,
                            backgroundColor: selected ? c.primary : pressed ? c.stateLayer : 'transparent' }}>
                            <T style={{ ...M3.type.bodyLarge, color: selected ? c.onPrimary : iso === today ? c.primary : c.onSurface }}>
                              {Number(iso.slice(8))}
                            </T>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 4 }}>
            <DialogAction c={c} label="إلغاء" onPress={onCancel} />
            <DialogAction c={c} label="تم" onPress={() => onConfirm(draft)} />
          </View>
        </View>
      </View>
    </AppDialog>
  );
}

function NavButton({ c, label, onPress, disabled, flip = false }: {
  c: Colors; label: string; onPress: () => void; disabled: boolean; flip?: boolean;
}) {
  return (
    <Touch onPress={onPress} disabled={disabled} accessibilityLabel={label} accessibilityState={{ disabled }} pressedBackground={c.stateLayer}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.38 : 1 }}>
      {/* The bundled icon subset has only chevron_left; mirror it for the RTL "previous" arrow. */}
      <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
        <MaterialIcon name="chevron_left" color={c.onSurfaceVariant} />
      </View>
    </Touch>
  );
}

function DialogAction({ c, label, onPress }: { c: Colors; label: string; onPress: () => void }) {
  return (
    <Touch onPress={onPress} accessibilityLabel={label} pressedBackground={c.stateLayer}
      style={{ minHeight: 48, minWidth: 64, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 24 }}>
      <T style={{ ...M3.type.labelLarge, color: c.primary }}>{label}</T>
    </Touch>
  );
}
