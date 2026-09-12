// Palette lifted verbatim from the Claude Design prototype (IoU App.dc.html).

export const DEFAULT_ACCENT = '#2f5fb0';
export const ACCENT_OPTIONS = ['#2f5fb0', '#1e7a4c', '#6b4fbb', '#0e7c86'];

export interface Colors {
  bg: string;
  card: string;
  cardHover: string;
  nav: string;
  text: string;
  muted: string;
  border: string;
  divider: string;
  primary: string;
  primaryBg: string;
  green: string;
  greenBg: string;
  red: string;
  redBg: string;
  toastBg: string;
  toastFg: string;
  track: string;
  /** Amber pair used by the "مسدد جزئياً" badge. */
  warnBg: string;
  warnFg: string;
}

export function makeColors(dark: boolean, accent: string = DEFAULT_ACCENT): Colors {
  return dark
    ? {
        bg: '#141318', card: '#1f1e25', cardHover: '#28272f', nav: '#1a191f',
        text: '#f2f0f7', muted: '#9a97a6', border: '#3a3945', divider: '#2c2b34',
        primary: accent, primaryBg: accent + '33',
        green: '#6fd39a', greenBg: '#173324', red: '#ff8a8a', redBg: '#3a1d1d',
        toastBg: '#f2f0f7', toastFg: '#141318', track: '#3a3945',
        warnBg: '#3d2f0f', warnFg: '#f2c66d',
      }
    : {
        bg: '#f6f5fa', card: '#ffffff', cardHover: '#f0eef5', nav: '#ffffff',
        text: '#1b1a22', muted: '#6f6d7a', border: '#dcdae4', divider: '#eeedf3',
        primary: accent, primaryBg: accent + '1f',
        green: '#1e7a4c', greenBg: '#deefe4', red: '#b3261e', redBg: '#f9dedc',
        toastBg: '#1b1a22', toastFg: '#ffffff', track: '#cfcdd8',
        warnBg: '#fff3d6', warnFg: '#8a5a00',
      };
}

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
