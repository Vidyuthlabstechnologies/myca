import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPages, renderHeaders, renderRedirects, serverHeaders } from './build.mjs';

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

test('the Pages headers carry the same policy as the Cloud Run server', () => {
  const headers = serverHeaders();
  const text = renderHeaders(headers);
  assert.match(headers.csp, /^default-src 'none'; script-src 'self'; style-src 'self';/);
  assert.ok(text.startsWith(`/*\n  Content-Security-Policy: ${headers.csp}\n`));
  for (const name of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'Referrer-Policy']) {
    assert.match(text.split('\n\n')[0], new RegExp(`^  ${name}: \\S`, 'm'), name);
  }
  for (const path of ['/research', '/status']) {
    const block = text.split('\n\n').find((part) => part.startsWith(`${path}\n`));
    assert.match(block, /! Content-Security-Policy/);
    assert.match(block, /X-Robots-Tag: noindex, nofollow/);
  }
  assert.match(text, /\/r\/\*\n  ! Referrer-Policy\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex/);
  assert.match(text, /\/assets\/fonts\/\*\n  Cache-Control: public, max-age=2592000/);
});

test('the redirects keep the Cloud Run addresses: each folder without its slash, /index to /, and invite links on /r/', () => {
  const rules = renderRedirects().trim().split('\n');
  assert.ok(rules.includes('/us/ /us 301'));
  assert.ok(rules.includes('/my /my/privacy 302'));
  assert.deepEqual(rules.slice(-2), ['/index / 301', '/r/* /r/ 200']);
  for (const [, folder] of readFileSync(new URL('../site/default.conf.template', import.meta.url), 'utf8').matchAll(/location = \/([a-z0-9-]+)\/ \{/g)) assert.ok(rules.includes(`/${folder}/ /${folder} 301`), folder);
});

test('the build fills in the address, moves the invite page under /r/ and leaves no placeholder behind', () => {
  const out = mkdtempSync(join(tmpdir(), 'myca-pages-'));
  try {
    const files = buildPages({ origin: 'https://myca-site.pages.dev', out });
    assert.ok(files.includes('_headers') && files.includes('_redirects') && files.includes('404.html') && files.includes('r/index.html'));
    assert.ok(!existsSync(join(out, 'invite.html')));
    for (const path of walk(out)) {
      if (!/\.(html|xml|txt|css|js)$/.test(path)) continue;
      const text = readFileSync(path, 'utf8');
      assert.ok(!text.includes('__SITE_ORIGIN__'), path);
      assert.ok(!text.includes('__EARLY_ACCESS_URL__'), path);
    }
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /<link rel="canonical" href="https:\/\/myca-site\.pages\.dev\/">/);
    assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/myca-site\.pages\.dev\/sitemap\.xml/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the build refuses an address or early-access form that is not plain https', () => {
  const out = mkdtempSync(join(tmpdir(), 'myca-pages-'));
  try {
    assert.throws(() => buildPages({ origin: 'https://evil.example/"><script>', out }));
    assert.throws(() => buildPages({ origin: '', out }));
    assert.throws(() => buildPages({ origin: 'https://myca-site.pages.dev', earlyAccessUrl: 'javascript:alert(1)', out }));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
