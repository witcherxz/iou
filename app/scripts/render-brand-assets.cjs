#!/usr/bin/env node
// Development-only renderer. Requires ImageMagick 7 (`magick`) on PATH.
// Release builds consume the committed PNG files and do not run this script.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const assets = path.resolve(__dirname, '../assets');
const source = fs.readFileSync(path.join(assets, 'brand/ledger-mark.svg'), 'utf8');
const background = '#D9E2FF';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'iou-brand-'));

function render(name, size, { opaque = false, scale = 1, monochrome = false, backgroundOnly = false } = {}) {
  let svg = source;
  if (monochrome) svg = svg.replace('fill="#445E91"', 'fill="#000000"');
  if (backgroundOnly) svg = svg.replace(/<g id="ledger-mark">[\s\S]*?<\/g>/, '');
  if (scale !== 1) {
    const translate = 54 * (1 - scale);
    svg = svg.replace('<g id="ledger-mark">', `<g id="ledger-mark" transform="translate(${translate} ${translate}) scale(${scale})">`);
  }
  if (opaque) svg = svg.replace('<g id="ledger-mark"', `<rect width="108" height="108" fill="${background}" /><g id="ledger-mark"`);
  if (backgroundOnly) svg = svg.replace('</svg>', `<rect width="108" height="108" fill="${background}" /></svg>`);
  const input = path.join(scratch, `${name}.svg`);
  fs.writeFileSync(input, svg);
  execFileSync('magick', ['-background', 'none', input, '-resize', `${size}x${size}`, '-strip', `PNG32:${path.join(assets, `${name}.png`)}`]);
  console.log(`${name}.png: ${size} × ${size}`);
}

try {
  render('icon', 1024, { opaque: true, scale: 1.2 });
  render('android-icon-foreground', 1024);
  render('android-icon-background', 1024, { backgroundOnly: true });
  render('android-icon-monochrome', 1024, { monochrome: true });
  render('favicon', 48, { opaque: true, scale: 1.2 });
  render('splash-icon', 1024);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
