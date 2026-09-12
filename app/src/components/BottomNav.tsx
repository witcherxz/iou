import React from 'react';
import { ScrollView, View } from 'react-native';

import { BellIcon, HomeIcon, IouIcon, SettingsIcon, UomeIcon } from './icons';
import { Colors, M3 } from '../theme';
import { MaterialPressable, T } from './ui';

export type Tab = 'home' | 'iou' | 'uome' | 'reminders' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'iou', label: 'لي' },
  { id: 'uome', label: 'عليّ' },
  { id: 'reminders', label: 'التذكيرات' },
  { id: 'settings', label: 'الإعدادات' },
];

function Icon({ id, color, selected }: { id: Tab; color: string; selected: boolean }) {
  switch (id) {
    case 'home': return <HomeIcon color={color} selected={selected} />;
    case 'iou': return <IouIcon color={color} selected={selected} />;
    case 'uome': return <UomeIcon color={color} selected={selected} />;
    case 'reminders': return <BellIcon color={color} selected={selected} />;
    case 'settings': return <SettingsIcon color={color} selected={selected} />;
  }
}

export function BottomNav({ c, tab, onTab, rail = false }: { c: Colors; tab: Tab; onTab: (t: Tab) => void; rail?: boolean }) {
  const items = TABS.map(t => {
        const on = tab === t.id;
        const fg = on ? c.onSecondaryContainer : c.onSurfaceVariant;
        return (
          <MaterialPressable
            c={c}
            key={t.id}
            onPress={() => onTab(t.id)}
            accessibilityRole="tab"
            accessibilityLabel={t.id === 'iou' ? 'ديون لي' : t.id === 'uome' ? 'ديون عليّ' : t.label}
            accessibilityState={{ selected: on }}
            style={{ flex: rail ? undefined : 1, minWidth: 48, minHeight: 52, alignItems: 'center', justifyContent: 'flex-start', gap: 4, borderRadius: 16 }}
          >
            {({ pressed, hovered }) => (
              <>
                <View style={{
                  width: rail ? 56 : 64, height: 32, borderRadius: 16,
                  backgroundColor: on ? c.secondaryContainer : 'transparent',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {(pressed || hovered) && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: fg, opacity: pressed ? 0.12 : 0.08 }} />}
                  <Icon id={t.id} color={fg} selected={on} />
                </View>
                <T style={{ ...M3.type.labelMedium, fontWeight: on ? '600' : '500', color: on ? c.onSurface : c.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 2, alignSelf: 'stretch' }}>{t.label}</T>
              </>
            )}
          </MaterialPressable>
        );
      });
  if (rail) {
    return (
      <ScrollView
        style={{ width: 80, flexGrow: 0, flexShrink: 0, backgroundColor: c.surfaceContainer }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {items}
      </ScrollView>
    );
  }
  return (
    <View style={{
      minHeight: 80, backgroundColor: c.surfaceContainer, flexDirection: 'row', alignItems: 'stretch',
      paddingTop: 12, paddingBottom: 16, flexShrink: 0,
    }}>
      {items}
    </View>
  );
}
