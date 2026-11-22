import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR } from './build.mjs';
import { ORIGIN } from './pages.mjs';

function htmlFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(join(dir, entry.name), `${prefix}${entry.name}/`);
    return entry.name.endsWith('.html') ? [`${prefix}${entry.name}`] : [];
  });
}

test('every page that shares a preview image gives it as an absolute URL, as Open Graph requires', () => {
  for (const name of htmlFiles(PUBLIC_DIR)) {
    const html = readFileSync(join(PUBLIC_DIR, name), 'utf8');
    for (const [, url] of html.matchAll(/<meta property="og:image" content="([^"]*)">/g)) assert.ok(url.startsWith(`${ORIGIN}/`), `${name} og:image ${url}`);
  }
});

test('the home page names its canonical address and its own og:url', () => {
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${ORIGIN}/">`));
});
