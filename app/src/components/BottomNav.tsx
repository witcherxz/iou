import React from 'react';
import { Pressable, View } from 'react-native';

import { BellIcon, HomeIcon, IouIcon, SettingsIcon, UomeIcon } from './icons';
import { Colors } from '../theme';
import { T } from './ui';

export type Tab = 'home' | 'iou' | 'uome' | 'reminders' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'iou', label: 'لي' },
  { id: 'uome', label: 'عليّ' },
  { id: 'reminders', label: 'التذكيرات' },
  { id: 'settings', label: 'الإعدادات' },
];

function Icon({ id, color }: { id: Tab; color: string }) {
  switch (id) {
    case 'home': return <HomeIcon color={color} />;
    case 'iou': return <IouIcon color={color} />;
    case 'uome': return <UomeIcon color={color} />;
    case 'reminders': return <BellIcon color={color} />;
    case 'settings': return <SettingsIcon color={color} />;
  }
}

export function BottomNav({ c, tab, onTab }: { c: Colors; tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View
      style={{
        height: 80, backgroundColor: c.nav, flexDirection: 'row', alignItems: 'stretch',
        paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, flexShrink: 0,
      }}
    >
      {TABS.map(t => {
        const on = tab === t.id;
        // Active list tabs take on the colour of the money they represent.
        const fg = on ? (t.id === 'iou' ? c.green : t.id === 'uome' ? c.red : c.primary) : c.muted;
        return (
          <Pressable
            key={t.id}
            onPress={() => onTab(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
          >
            <View
              style={{
                width: 56, height: 30, borderRadius: 15,
                backgroundColor: on ? c.primaryBg : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon id={t.id} color={fg} />
            </View>
            <T style={{ fontSize: 11.5, fontWeight: on ? '600' : '500', color: fg }}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
