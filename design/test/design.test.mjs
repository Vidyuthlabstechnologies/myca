import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAll, factsFromPacks, loadTokens } from '../build.mjs';
import { COUNTRIES, TOKENS, formatMoney, formatDate, direction, localeFor, taxYearLabel, look } from '../web/index.mjs';

function luminance(hex) {
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('generated files match the tokens (run npm run build after editing tokens)', async () => {
  const { files } = await renderAll();
  for (const [path, body] of Object.entries(files)) {
    assert.equal(await readFile(path, 'utf8'), body, `${path} is stale`);
  }
});

test('every country in the facts has a look, and every look has a country', async () => {
  const tokens = await loadTokens();
  const looks = new Set(tokens.filter((t) => t.path[0] === 'country').map((t) => t.path[1].toUpperCase()));
  assert.deepEqual([...looks].sort(), Object.keys(COUNTRIES).sort());
});

test('country accents pass WCAG AA on every surface they sit on', () => {
  const light = TOKENS.theme.light;
  const dark = TOKENS.theme.dark;
  for (const code of Object.keys(COUNTRIES)) {
    const l = look(code);
    for (const [fg, bg, where] of [
      [l.accent, light.surface, 'light surface'], [l.accent, light.canvas, 'light canvas'], [l.accent, l.accentSoft, 'light tint'],
      [l.accentDark, dark.surface, 'dark surface'], [l.accentDark, dark.canvas, 'dark canvas'], [l.accentDark, l.accentSoftDark, 'dark tint'],
      ['#FFFFFF', l.accent, 'white text on accent'],
    ]) assert.ok(contrast(fg, bg) >= 4.5, `${code} ${where}: ${contrast(fg, bg).toFixed(2)}`);
  }
});

test('core text colours pass AA in both themes', () => {
  for (const scheme of ['light', 'dark']) {
    const t = TOKENS.theme[scheme];
    assert.ok(contrast(t.ink, t.canvas) >= 7, `${scheme} ink`);
    assert.ok(contrast(t.muted, t.surface) >= 4.5, `${scheme} muted`);
    assert.ok(contrast(t.warn, t.warnSoft) >= 4.5, `${scheme} warn`);
    assert.ok(contrast(t.danger, t.dangerSoft) >= 4.5, `${scheme} danger`);
  }
});

test('the facts follow the country packs when they are present', () => {
  const pack = {
    code: 'MY', name: 'Malaysia', status: 'beta', currency: 'MYR', symbol: 'RM', locale: 'en-MY', minorUnit: 'sen',
    yearStartMonth: 1, yearStartDay: 1, yearLabel: 'year of assessment', taxId: 'TIN', languages: ['en', 'ms'],
    app: { flavor: 'my', label: 'MyCA MY', edition: 'MY', androidId: 'x' }, billing: {},
  };
  const out = factsFromPacks([pack], { countries: { MY: { taxName: 'SST' }, GB: { code: 'GB', name: 'UK' } } });
  assert.equal(out.MY.status, 'beta');
  assert.equal(out.MY.taxName, 'SST');
  assert.deepEqual(out.MY.languages, ['en', 'ms']);
  assert.deepEqual(out.MY.app, { flavor: 'my', label: 'MyCA MY', edition: 'MY' });
  assert.equal(out.MY.billing, undefined);
  assert.equal(out.GB.name, 'UK');
});

test('money, dates and direction follow each country', () => {
  assert.equal(formatMoney(1234567.5, 'IN'), '₹12,34,567.50');
  assert.equal(formatMoney(123456750, 'IN', { minor: true }), '₹12,34,567.50');
  assert.equal(formatMoney(1234567.5, 'US'), '$1,234,567.50');
  assert.match(formatMoney(1234.5, 'MY'), /^RM\s1,234\.50$/);
  assert.equal(formatMoney(1234.5, 'GB'), '£1,234.50');
  assert.equal(formatDate('2026-11-11', 'IN'), '11 Nov 2026');
  assert.equal(formatDate('2026-11-11', 'US'), 'Nov 11, 2026');
  assert.equal(formatDate('2026-02-03', 'US', { style: 'short' }), '02/03/2026');
  assert.equal(formatDate('2026-02-03', 'IN', { style: 'short' }), '03/02/2026');
  assert.equal(formatDate('2026-02-30', 'IN'), '2026-02-30');
  assert.equal(localeFor('MY', 'ms'), 'ms-MY');
  assert.equal(localeFor('MY', 'fr'), 'en-MY');
  assert.equal(direction('ar-AE'), 'rtl');
  assert.equal(direction('en-AE'), 'ltr');
  assert.equal(taxYearLabel('IN', 2026), 'Financial year 2026-27');
  assert.equal(taxYearLabel('US', 2026), 'Calendar year 2026');
  assert.equal(look('nowhere').accent, look('IN').accent);
});
