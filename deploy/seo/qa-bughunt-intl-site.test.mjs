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

test('a folder of pages answers its trailing-slash address with a redirect, not a forbidden directory listing', () => {
  const conf = readFileSync(join(PUBLIC_DIR, '..', 'site', 'default.conf.template'), 'utf8');
  const folders = readdirSync(PUBLIC_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'assets').map((entry) => entry.name);
  assert.ok(folders.length > 0);
  for (const folder of folders) {
    assert.ok(readdirSync(join(PUBLIC_DIR, folder)).every((name) => name !== 'index.html'), `${folder} has its own index`);
    assert.match(conf, new RegExp(`location = /${folder}/ \\{\\s*return 301 /${folder};\\s*\\}`), folder);
  }
});

test('a folder address without its slash lands on a page, never back on the slash address in a loop', () => {
  const conf = readFileSync(join(PUBLIC_DIR, '..', 'site', 'default.conf.template'), 'utf8');
  const folders = readdirSync(PUBLIC_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'assets').map((entry) => entry.name);
  for (const folder of folders) {
    const page = readdirSync(PUBLIC_DIR).includes(`${folder}.html`);
    const target = conf.match(new RegExp(`location = /${folder} \\{\\s*return 30[127] (/[a-z0-9/-]+);\\s*\\}`))?.[1];
    assert.ok(page || target, `/${folder} has no page and no redirect, so nginx sends it back to /${folder}/`);
    if (target) assert.ok(readdirSync(PUBLIC_DIR, { recursive: true }).includes(`${target.slice(1)}.html`), `/${folder} redirects to ${target}, which has no page`);
  }
});
