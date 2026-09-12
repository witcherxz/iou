import React from 'react';
import { Text } from 'react-native';

// Subset of Google's Material Symbols Rounded (24dp, weight400; selected500/FILL1).
// Bundled fonts keep icons available offline without a new native dependency.
const SYMBOLS = {
  home: '\ue9b2',
  south_west: '\uf1e5',
  north_east: '\uf1e1',
  notifications: '\ue7f5',
  settings: '\ue8b8',
  dark_mode: '\ue51c',
  light_mode: '\ue518',
  cloud: '\uf15c',
  folder: '\ue2c7',
  description: '\ue873',
  cloud_off: '\ue2c1',
  arrow_forward: '\ue5c8',
  chevron_left: '\ue5cb',
  close: '\ue5cd',
  add: '\ue145',
  check: '\ue668',
  backspace: '\ue14a',
  more_vert: '\ue5d4',
  edit: '\uf097',
  schedule: '\uefd6',
  account_balance_wallet: '\ue850',
  info: '\ue88e',
  shield: '\ue9e0',
  cloud_done: '\ue2bf',
  error: '\uf8b6',
  payments: '\uef63',
} as const;

export type MaterialIconName = keyof typeof SYMBOLS;
export function MaterialIcon({ name, color, size = 24, selected = false }: {
  name: MaterialIconName; color: string; size?: number; selected?: boolean;
}) {
  const filled = selected && ['home', 'south_west', 'north_east', 'notifications', 'settings'].includes(name);
  return (
    <Text accessible={false} aria-hidden importantForAccessibility="no" allowFontScaling={false}
      style={{ fontFamily: filled ? 'MaterialSymbolsRoundedSelected' : 'MaterialSymbolsRounded',
        color, fontSize: size, lineHeight: size, width: size, height: size,
        textAlign: 'center', writingDirection: 'ltr', includeFontPadding: false }}>
      {SYMBOLS[name]}
    </Text>
  );
}

type IconProps = { color: string; selected?: boolean };
export const HomeIcon = (props: IconProps) => <MaterialIcon name="home" {...props} />;
export const IouIcon = (props: IconProps) => <MaterialIcon name="south_west" {...props} />;
export const UomeIcon = (props: IconProps) => <MaterialIcon name="north_east" {...props} />;
export const BellIcon = (props: IconProps) => <MaterialIcon name="notifications" {...props} />;
export const SettingsIcon = (props: IconProps) => <MaterialIcon name="settings" {...props} />;
export const DriveIcon = (props: IconProps) => <MaterialIcon name="cloud" {...props} />;
export function ThemeGlyph({ dark, color }: { dark: boolean; cardBg: string; color?: string }) {
  return <MaterialIcon name={dark ? 'light_mode' : 'dark_mode'} color={color ?? (dark ? '#e2e2e9' : '#1a1b20')} />;
}
