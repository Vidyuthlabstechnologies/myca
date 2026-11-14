import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const fonts = join(root, 'deploy', 'public', 'assets', 'fonts');
const mascot = join(root, 'design', 'flutter', 'myca_design', 'assets', 'mascot');

const C = {
  navy: '#1E3A6E',
  navyTint: '#E8EDF6',
  sky: '#9DB8E8',
  ink: '#15181B',
  muted: '#6C7075',
  canvas: '#FAFAF7',
  white: '#FFFFFF',
  line: '#E6E4DE',
  green: '#1B5E3F',
  greenTint: '#EAF2ED',
  gold: '#E2A93B',
  paper: '#FFF8EC',
};

const bahi = (mood) => `data:image/png;base64,${readFileSync(join(mascot, `${mood}.png`)).toString('base64')}`;

const ledger = ({ page = C.white, tick = C.green, lines = C.white, linesOpacity = 0.6 } = {}) => `
  <path d="M48 28c-8-6-18-7-28-5v44c10-2 20-1 28 5" fill="none" stroke="${page}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M48 28c8-6 18-7 28-5v44c-10-2-20-1-28 5z" fill="${page}" stroke="${page}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M48 28v44" stroke="${page}" stroke-width="5" stroke-linecap="round"/>
  <path d="M55 49l7 7 12-15" fill="none" stroke="${tick}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M27 37h13M27 46h13M27 55h9" stroke="${lines}" stroke-width="3" stroke-linecap="round" opacity="${linesOpacity}"/>`;

const mark = ({ x = 0, y = 0, size = 96, tile = C.navy, radius = 22, ...rest } = {}) =>
  `<g transform="translate(${x} ${y}) scale(${size / 96})"><rect width="96" height="96" rx="${radius}" fill="${tile}"/>${ledger(rest)}</g>`;

const monochrome = (fill) => `<mask id="tick-cut"><rect width="96" height="96" fill="#FFFFFF"/><path d="M55 49l7 7 12-15" fill="none" stroke="#000000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></mask>
  <g mask="url(#tick-cut)">${ledger({ page: fill, tick: 'none', lines: fill, linesOpacity: 1 })}</g>`;

const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
<style>text{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}</style>
${body}
</svg>
`;

const text = (x, y, size, weight, fill, content, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${(-size * 0.02).toFixed(2)}" ${extra}>${content}</text>`;

const wordmark = (x, y, size, { ink = C.ink, accent = C.navy, tile = C.navy, page = C.white, tick = C.green } = {}) => {
  const m = size * 1.3;
  const tx = x + m + size * 0.45;
  return `${mark({ x, y: y - m * 0.78, size: m, tile, page, tick, lines: page })}
  <text x="${tx}" y="${y}" font-size="${size}" font-weight="600" fill="${ink}" letter-spacing="${(-size * 0.02).toFixed(2)}">MyCA<tspan dx="${size * 0.28}" font-weight="500" fill="${accent}">US</tspan></text>`;
};

const tickRow = (x, y, label, size = 30) => `
  <g transform="translate(${x} ${y})">
    <circle cx="${size * 0.6}" cy="${-size * 0.35}" r="${size * 0.6}" fill="${C.greenTint}"/>
    <path d="M${size * 0.32} ${-size * 0.36}l${size * 0.2} ${size * 0.2} ${size * 0.36} ${-size * 0.42}" fill="none" stroke="${C.green}" stroke-width="${size * 0.13}" stroke-linecap="round" stroke-linejoin="round"/>
    ${text(size * 1.6, 0, size, 500, C.ink, label)}
  </g>`;

const card = (x, y, w, h, rows, size) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${size * 0.9}" fill="${C.white}" stroke="${C.line}" stroke-width="2"/>
  ${rows.map((r, i) => tickRow(x + size * 1.1, y + size * 2.3 + i * size * 2.1, r, size)).join('')}`;

const rows = ['Reads your W-2s and 1099s', 'Explains every line', 'Checks it before you sign'];

const ASSETS = {
  'icon/app-icon-us.svg': [96, 96, mark({}), 'MyCA US app icon'],
  'icon/app-icon-us-ink.svg': [96, 96, mark({ tile: C.ink }), 'MyCA US app icon, ink'],
  'icon/app-icon-us-reversed.svg': [96, 96, mark({ tile: C.white, page: C.navy, tick: C.white, lines: C.navy, linesOpacity: 0.45 }), 'MyCA US app icon, reversed'],
  'icon/app-icon-us-mono.svg': [96, 96, monochrome(C.ink), 'MyCA US monochrome mark'],
  'icon/store-icon-us.svg': [96, 96, mark({ radius: 0 }), 'MyCA US store icon, full bleed'],
  'icon/adaptive-foreground.svg': [108, 108, `<g transform="translate(17 17) scale(0.77)">${ledger()}</g>`, 'MyCA US adaptive icon foreground'],
  'icon/adaptive-background.svg': [108, 108, `<rect width="108" height="108" fill="${C.navy}"/>`, 'MyCA US adaptive icon background'],
  'icon/adaptive-monochrome.svg': [108, 108, `<g transform="translate(17 17) scale(0.77)">${monochrome('#000000')}</g>`, 'MyCA US themed icon'],
  'wordmark/wordmark-us-light.svg': [520, 140, `<rect width="520" height="140" fill="${C.canvas}"/>${wordmark(48, 90, 52)}`, 'MyCA US'],
  'wordmark/wordmark-us-dark.svg': [520, 140, `<rect width="520" height="140" fill="#0E1012"/>${wordmark(48, 90, 52, { ink: '#F2F1EC', accent: C.sky })}`, 'MyCA US'],
  'store/feature-graphic-1024x500.svg': [1024, 500, `
    <rect width="1024" height="500" fill="${C.canvas}"/>
    <rect x="0" y="0" width="1024" height="10" fill="${C.navy}"/>
    ${wordmark(64, 108, 34)}
    ${text(64, 210, 48, 600, C.ink, 'Your federal return,')}
    ${text(64, 266, 48, 600, C.ink, 'every line explained.')}
    ${text(64, 326, 23, 400, C.muted, 'Free to prepare. See your refund first.')}
    ${text(64, 360, 23, 400, C.muted, 'Pay only when you file.')}
    ${text(64, 448, 16, 400, C.muted, 'Federal Form 1040 for tax year 2026. Not affiliated with the IRS.')}
    <image href="${bahi('wave')}" x="700" y="70" width="260" height="260"/>
    ${card(612, 330, 380, 128, ['Every line explained', 'Checked before you sign'], 22)}
  `, 'MyCA US: your federal return, every line explained'],
  'social/social-1200x630.svg': [1200, 630, `
    <rect width="1200" height="630" fill="${C.canvas}"/>
    <rect x="0" y="0" width="1200" height="12" fill="${C.navy}"/>
    ${wordmark(72, 120, 38)}
    ${text(72, 248, 62, 600, C.ink, 'Taxes, explained')}
    ${text(72, 320, 62, 600, C.ink, 'line by line.')}
    ${text(72, 390, 27, 400, C.muted, 'Prepare your federal return free on your phone.')}
    ${text(72, 428, 27, 400, C.muted, 'See your refund first. Pay only when you file.')}
    <rect x="72" y="478" width="496" height="64" rx="14" fill="${C.navyTint}"/>
    ${text(98, 520, 24, 600, C.navy, '$99 launch price through Apr 15, 2027')}
    ${text(72, 596, 17, 400, C.muted, 'Federal returns only. $129 after the launch period. Not affiliated with the IRS.')}
    <image href="${bahi('wave')}" x="790" y="96" width="330" height="330"/>
  `, 'MyCA US: taxes, explained line by line'],
  'social/social-1080x1080.svg': [1080, 1080, `
    <rect width="1080" height="1080" fill="${C.canvas}"/>
    <rect x="0" y="0" width="1080" height="14" fill="${C.navy}"/>
    ${wordmark(80, 160, 40)}
    ${text(80, 330, 70, 600, C.ink, 'See your refund')}
    ${text(80, 410, 70, 600, C.ink, 'before you pay.')}
    ${text(80, 486, 30, 400, C.muted, 'Free to prepare. Pay only when you file.')}
    ${card(80, 580, 560, 230, rows, 30)}
    <image href="${bahi('happy')}" x="680" y="540" width="310" height="310"/>
    ${text(80, 970, 21, 400, C.muted, 'MyCA US prepares federal Form 1040. State returns are not offered yet.')}
    ${text(80, 1004, 21, 400, C.muted, 'Not affiliated with the IRS.')}
  `, 'MyCA US: see your refund before you pay'],
  'social/social-1080x1920.svg': [1080, 1920, `
    <rect width="1080" height="1920" fill="${C.canvas}"/>
    <rect x="0" y="0" width="1080" height="16" fill="${C.navy}"/>
    ${wordmark(90, 300, 46)}
    ${text(90, 480, 84, 600, C.ink, 'Your federal')}
    ${text(90, 576, 84, 600, C.ink, 'return, every')}
    ${text(90, 672, 84, 600, C.ink, 'line explained.')}
    ${text(90, 770, 34, 400, C.muted, 'Free to prepare on your phone.')}
    ${text(90, 818, 34, 400, C.muted, 'See your refund first. Pay only to file.')}
    <image href="${bahi('wave')}" x="330" y="880" width="420" height="420"/>
    ${card(90, 1340, 900, 262, rows, 34)}
    ${text(90, 1680, 24, 400, C.muted, 'Federal Form 1040 only. Not affiliated with the IRS.')}
  `, 'MyCA US: your federal return, every line explained'],
};

const PNG = {
  'icon/app-icon-us.svg': [['icon/app-icon-us-512.png', 512], ['icon/app-icon-us-192.png', 192], ['icon/app-icon-us-48.png', 48]],
  'icon/store-icon-us.svg': [['icon/play-store-icon-512.png', 512], ['icon/app-store-icon-1024.png', 1024]],
  'icon/app-icon-us-reversed.svg': [['icon/app-icon-us-reversed-512.png', 512]],
  'icon/app-icon-us-mono.svg': [['icon/app-icon-us-mono-512.png', 512]],
  'icon/app-icon-us-ink.svg': [['icon/app-icon-us-ink-512.png', 512]],
  'icon/adaptive-foreground.svg': [['icon/adaptive-foreground-432.png', 432]],
  'icon/adaptive-monochrome.svg': [['icon/adaptive-monochrome-432.png', 432]],
  'wordmark/wordmark-us-light.svg': [['wordmark/wordmark-us-light.png', 1040]],
  'wordmark/wordmark-us-dark.svg': [['wordmark/wordmark-us-dark.png', 1040]],
  'store/feature-graphic-1024x500.svg': [['store/feature-graphic-1024x500.png', 1024]],
  'social/social-1200x630.svg': [['social/social-1200x630.png', 1200]],
  'social/social-1080x1080.svg': [['social/social-1080x1080.png', 1080]],
  'social/social-1080x1920.svg': [['social/social-1080x1920.png', 1080]],
};

const fontFace = ['Regular:400', 'Medium:500', 'SemiBold:600']
  .map((s) => s.split(':'))
  .map(([n, w]) => `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(join(fonts, `Inter-${n}.woff2`)).toString('base64')}) format('woff2')}`)
  .join('');

for (const [path, [w, h, body, label]] of Object.entries(ASSETS)) {
  mkdirSync(dirname(join(here, path)), { recursive: true });
  writeFileSync(join(here, path), svg(w, h, body, label));
}

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'));
}
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
for (const [source, outputs] of Object.entries(PNG)) {
  const [w, h] = ASSETS[source];
  for (const [out, width] of outputs) {
    const scale = width / w;
    await page.setViewportSize({ width: Math.round(w * scale), height: Math.round(h * scale) });
    const inline = readFileSync(join(here, source), 'utf8').replace(`width="${w}" height="${h}"`, `width="${w * scale}" height="${h * scale}"`);
    await page.setContent(`<!doctype html><html><head><style>${fontFace}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${inline}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(here, out), omitBackground: !source.includes('store-icon'), clip: { x: 0, y: 0, width: Math.round(w * scale), height: Math.round(h * scale) } });
    process.stdout.write(`${out} ${Math.round(w * scale)}x${Math.round(h * scale)}\n`);
  }
}
await browser.close();
