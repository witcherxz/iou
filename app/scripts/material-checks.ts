import { ACCENT_OPTIONS, Colors, makeColors } from '../src/theme';

// WCAG 2.2 SC 1.4.3: small text needs >= 4.5:1, without rounding the result.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
// The luminance calculation is independent of the library generating our theme.
type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected an opaque sRGB color, received ${hex}`);
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255) as Rgb;
};
const luminance = (color: Rgb) => {
  const linear = color.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (foreground: Rgb, background: Rgb) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const overlay = (background: Rgb, layer: Rgb, opacity: number): Rgb =>
  background.map((channel, index) => channel * (1 - opacity) + layer[index] * opacity) as Rgb;

type Pair = {
  label: string; foreground: keyof Colors; background: keyof Colors;
  interactive?: boolean; pressedLayer?: keyof Colors;
};
const surfaces: (keyof Colors)[] = [
  'surface', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
];
const pairs: Pair[] = [
  ...surfaces.flatMap(background => (['onSurface', 'onSurfaceVariant'] as const).map(foreground => ({
    label: `${foreground} on ${background}`, foreground, background,
  }))),
  ...(['surface', 'surfaceContainerLow', 'surfaceContainerHigh', 'surfaceContainerHighest'] as const)
    .flatMap(background => (['primary', 'green', 'red'] as const).map(foreground => ({
      label: `Action or ledger text: ${foreground} on ${background}`, foreground, background,
    }))),
  { label: 'Filled button', foreground: 'onPrimary', background: 'primary', interactive: true },
  { label: 'Extended FAB', foreground: 'onPrimaryContainer', background: 'primaryContainer', interactive: true },
  { label: 'Selected segment/chip/navigation icon', foreground: 'onSecondaryContainer', background: 'secondaryContainer', interactive: true },
  { label: 'Outlined button on screen', foreground: 'primary', background: 'surface', interactive: true },
  { label: 'Outlined button on card', foreground: 'primary', background: 'surfaceContainerLow', interactive: true },
  { label: 'Dialog action', foreground: 'primary', background: 'surfaceContainerHigh', pressedLayer: 'stateLayer' },
  { label: 'Folder button surface inside selected destination', foreground: 'primary', background: 'surface', interactive: true },
  { label: 'Selected destination text', foreground: 'onSecondaryContainer', background: 'secondaryContainer', pressedLayer: 'stateLayer' },
  { label: 'Payment badge', foreground: 'primary', background: 'primaryBg' },
  { label: 'Receivable total and badge', foreground: 'green', background: 'greenBg' },
  { label: 'Payable total and overdue badge', foreground: 'red', background: 'redBg' },
  { label: 'Receivable summary card', foreground: 'onGreenContainer', background: 'greenBg', interactive: true },
  { label: 'Payable summary card', foreground: 'onErrorContainer', background: 'redBg', interactive: true },
  { label: 'Positive card title', foreground: 'onSurface', background: 'greenBg' },
  { label: 'Positive card supporting text', foreground: 'onSurfaceVariant', background: 'greenBg' },
  { label: 'Negative card title', foreground: 'onSurface', background: 'redBg' },
  { label: 'Negative card supporting text', foreground: 'onSurfaceVariant', background: 'redBg' },
  { label: 'Partial-payment badge and warning banner', foreground: 'warnFg', background: 'warnBg' },
  { label: 'Reminder warning on card', foreground: 'warnFg', background: 'surfaceContainerLow' },
  { label: 'Inverse snackbar', foreground: 'inverseOnSurface', background: 'inverseSurface' },
];

const failures: string[] = [];
let assertions = 0;
let lowest = { ratio: Infinity, label: '' };

// Known endpoints protect the contrast calculation from a false-positive suite.
if (contrast(rgb('#ffffff'), rgb('#000000')) !== 21 || contrast(rgb('#334455'), rgb('#334455')) !== 1) {
  throw new Error('Contrast calculation failed its reference values');
}

for (const accent of ACCENT_OPTIONS) {
  for (const dark of [false, true]) {
    const c = makeColors(dark, accent);
    const theme = `${dark ? 'dark' : 'light'} ${accent}`;
    for (const pair of pairs) {
      const foreground = rgb(c[pair.foreground]);
      const background = rgb(c[pair.background]);
      const stateColor = pair.pressedLayer ? c[pair.pressedLayer] : undefined;
      if (stateColor && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(stateColor)) throw new Error(`Invalid state layer: ${stateColor}`);
      const layer = stateColor ? rgb(stateColor.slice(0, 7)) : foreground;
      const layerOpacity = stateColor ? stateColor.length === 9 ? parseInt(stateColor.slice(7, 9), 16) / 255 : 1 : 0;
      const states = pair.interactive ? [['rest', 0], ['hover', 0.08], ['pressed', 0.12]] as const
        : stateColor ? [['rest', 0], ['pressed', layerOpacity]] as const : [['rest', 0]] as const;
      for (const [state, opacity] of states) {
        // Use the same foreground or neutral state layer as the rendered control.
        const ratio = contrast(foreground, overlay(background, layer, opacity));
        const label = `${theme} / ${pair.label} / ${state}`;
        assertions++;
        if (ratio < lowest.ratio) lowest = { ratio, label };
        if (!Number.isFinite(ratio) || ratio < 4.5) failures.push(`${label}: ${ratio.toFixed(3)}:1 (${c[pair.foreground]} on ${c[pair.background]})`);
      }
    }
  }
}

// Inactive controls and decorative dividers are exempt from SC 1.4.3.
// This suite validates palette use; layout and assistive-technology behavior
// still need browser/native checks.
if (failures.length) {
  console.error(failures.map(failure => `FAIL ${failure}`).join('\n'));
  throw new Error(`${failures.length} of ${assertions} Material text contrast checks failed`);
}
console.log(`PASS ${assertions} Material text contrast checks across ${ACCENT_OPTIONS.length} accents and light/dark modes`);
console.log(`Lowest contrast: ${lowest.ratio.toFixed(3)}:1 (${lowest.label})`);
