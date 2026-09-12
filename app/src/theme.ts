import { argbFromHex, Hct, hexFromArgb, SchemeTonalSpot } from '@material/material-color-utilities';
import type { TextStyle } from 'react-native';

export const DEFAULT_ACCENT = '#2f5fb0';
export const ACCENT_OPTIONS = ['#2f5fb0', '#1e7a4c', '#6b4fbb', '#0e7c86'];

// Material 3 roles, generated from the existing brand seed. Text always uses
// the corresponding on-role; dark mode has its own tonal palette.
export interface Colors {
  surface: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  disabledContainer: string;
  disabledContent: string;
  stateLayer: string;
  scrim: string;
  // Compatibility names for ledger semantic colors and existing derived views.
  bg: string; card: string; cardHover: string; nav: string;
  text: string; muted: string; border: string; divider: string;
  primaryBg: string; green: string; greenBg: string; onGreenContainer: string; red: string; redBg: string;
  toastBg: string; toastFg: string; track: string; warnBg: string; warnFg: string;
}

export function makeColors(dark: boolean, accent: string = DEFAULT_ACCENT): Colors {
  const seed = /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_ACCENT;
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
  const positive = new SchemeTonalSpot(Hct.fromInt(argbFromHex('#1e7a4c')), dark, 0);
  const warning = new SchemeTonalSpot(Hct.fromInt(argbFromHex('#805900')), dark, 0);
  const roles = {
    surface: hexFromArgb(scheme.surface),
    surfaceContainerLowest: hexFromArgb(scheme.surfaceContainerLowest),
    surfaceContainerLow: hexFromArgb(scheme.surfaceContainerLow),
    surfaceContainer: hexFromArgb(scheme.surfaceContainer),
    surfaceContainerHigh: hexFromArgb(scheme.surfaceContainerHigh),
    surfaceContainerHighest: hexFromArgb(scheme.surfaceContainerHighest),
    onSurface: hexFromArgb(scheme.onSurface),
    onSurfaceVariant: hexFromArgb(scheme.onSurfaceVariant),
    outline: hexFromArgb(scheme.outline),
    outlineVariant: hexFromArgb(scheme.outlineVariant),
    primary: hexFromArgb(scheme.primary),
    onPrimary: hexFromArgb(scheme.onPrimary),
    primaryContainer: hexFromArgb(scheme.primaryContainer),
    onPrimaryContainer: hexFromArgb(scheme.onPrimaryContainer),
    secondaryContainer: hexFromArgb(scheme.secondaryContainer),
    onSecondaryContainer: hexFromArgb(scheme.onSecondaryContainer),
    inverseSurface: hexFromArgb(scheme.inverseSurface),
    inverseOnSurface: hexFromArgb(scheme.inverseOnSurface),
    inversePrimary: hexFromArgb(scheme.inversePrimary),
    error: hexFromArgb(scheme.error),
    onError: hexFromArgb(scheme.onError),
    errorContainer: hexFromArgb(scheme.errorContainer),
    onErrorContainer: hexFromArgb(scheme.onErrorContainer),
    scrim: '#00000052',
  };
  return {
    ...roles,
    disabledContainer: roles.onSurface + '1f',
    disabledContent: roles.onSurface + '61',
    stateLayer: roles.onSurface + '14',
    bg: roles.surface, card: roles.surfaceContainerLow, cardHover: roles.surfaceContainerHigh,
    nav: roles.surfaceContainer, text: roles.onSurface, muted: roles.onSurfaceVariant,
    border: roles.outline, divider: roles.outlineVariant,
    primaryBg: roles.primaryContainer,
    green: hexFromArgb(positive.primary), greenBg: hexFromArgb(positive.primaryContainer),
    onGreenContainer: hexFromArgb(positive.onPrimaryContainer),
    red: roles.error, redBg: roles.errorContainer,
    toastBg: roles.inverseSurface, toastFg: roles.inverseOnSurface,
    track: roles.surfaceContainerHighest,
    warnBg: hexFromArgb(warning.primaryContainer), warnFg: hexFromArgb(warning.onPrimaryContainer),
  };
}

const textRole = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'] = '400'): TextStyle =>
  ({ fontSize, lineHeight, fontWeight, letterSpacing: 0 });

/** M3 scale; Arabic body leading is slightly increased to preserve diacritics. */
export const M3 = {
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  shape: { extraSmall: 4, small: 8, medium: 12, large: 16, extraLarge: 28, full: 999 },
  type: {
    displaySmall: textRole(36, 44),
    headlineLarge: textRole(32, 40), headlineMedium: textRole(28, 36), headlineSmall: textRole(24, 32),
    titleLarge: textRole(22, 28), titleMedium: textRole(16, 24, '500'), titleSmall: textRole(14, 20, '500'),
    bodyLarge: textRole(16, 24), bodyMedium: textRole(14, 22), bodySmall: textRole(12, 18),
    labelLarge: textRole(14, 20, '500'), labelMedium: textRole(12, 16, '500'), labelSmall: textRole(11, 16, '500'),
  },
  layout: { railBreakpoint: 600, expandedBreakpoint: 840, maxContentWidth: 880, touchTarget: 48 },
} as const;

// ── oklch → sRGB ──────────────────────────────────────────────
// The prototype tints avatars with oklch(). React Native has no oklch parser,
// so convert to hex up front. Straight Oklab → linear sRGB → gamma.

const toHex2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export function oklch(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const r = +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return '#' + toHex2(gamma(r)) + toHex2(gamma(g)) + toHex2(gamma(bl));
}

/** Avatar background/foreground for a person's hue, per theme. */
export function avatarColors(hue: number, dark: boolean) {
  return dark
    ? { bg: oklch(0.35, 0.06, hue), fg: oklch(0.9, 0.06, hue) }
    : { bg: oklch(0.9, 0.05, hue), fg: oklch(0.4, 0.1, hue) };
}

export const FONT = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
};

/** The design expresses weight numerically; map that onto the loaded faces. */
export function fontFor(weight: number | string | undefined): string {
  const w = Number(weight ?? 400);
  if (w >= 700) return FONT.bold;
  if (w >= 600) return FONT.semibold;
  if (w >= 500) return FONT.medium;
  return FONT.regular;
}
