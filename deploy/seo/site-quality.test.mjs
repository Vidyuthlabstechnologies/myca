import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_PAGES_INDIA, PUBLIC_DIR, outputs } from './build.mjs';
import { PLAY_ID, PLAY_LISTED } from './pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTERNAL = new Set(['research.html', 'status.html']);
const conf = readFileSync(join(root, 'deploy', 'site', 'default.conf.template'), 'utf8');

function htmlFiles(dir = PUBLIC_DIR, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(join(dir, entry.name), `${prefix}${entry.name}/`);
    return entry.name.endsWith('.html') ? [`${prefix}${entry.name}`] : [];
  });
}

const read = (name) => readFileSync(join(PUBLIC_DIR, name), 'utf8');
const publicPages = () => htmlFiles().filter((name) => !INTERNAL.has(name));
const noindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

test('every public page has a language, a viewport, a title, a description, one h1 and the shared stylesheet', () => {
  const titles = new Map();
  for (const name of publicPages()) {
    const html = read(name);
    assert.match(html, /^<!DOCTYPE html>/i, name);
    assert.match(html, /<html lang="en(-[A-Z]{2})?">/, name);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1(\.0)?">/, name);
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
    assert.ok(title && title.length <= 70, `${name} title`);
    assert.ok(!titles.has(title), `${name} repeats the title of ${titles.get(title)}`);
    titles.set(title, name);
    const description = (html.match(/<meta name="description" content="([^"]+)">/) || [])[1];
    assert.ok(description && description.length >= 70 && description.length <= 170, `${name} description ${description?.length}`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${name} h1`);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/site\.css">/, name);
    assert.match(html, /<a class="skip" href="#content">/, name);
    assert.match(html, /<main[^>]* id="content"/, name);
    if (name !== '404.html') assert.match(html, /<link rel="canonical" href="https:\/\/__SITE_ORIGIN__\/[^"]*">/, name);
  }
});

test('no public page runs inline script or inline styles, so the strict content security policy holds', () => {
  for (const name of publicPages()) {
    const html = read(name);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((match) => match[1]);
    for (const attrs of scripts) assert.ok(/type="application\/ld\+json"/.test(attrs) || /src="\/assets\/[a-z-]+\.js"/.test(attrs), `${name} has an inline script`);
    assert.doesNotMatch(html, /<style\b/i, `${name} has a style block`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${name} has a style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name} has an inline event handler`);
  }
  for (const name of ['early-access.js', 'invite.js']) readFileSync(join(PUBLIC_DIR, 'assets', name), 'utf8');
  assert.ok(readFileSync(join(PUBLIC_DIR, 'assets', 'invite.js'), 'utf8').includes(`details?id=${PLAY_ID}&referrer=`), 'invite.js names the Play app');
});

test('the server sends the security headers on every answer, and keeps internal pages out of search', () => {
  for (const header of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'X-Robots-Tag']) {
    assert.match(conf, new RegExp(`^  add_header ${header} .+ always;$`, 'm'), header);
  }
  const server = conf.slice(conf.indexOf('server {'));
  const locations = server.split(/\n  location /).slice(1);
  for (const block of locations) assert.doesNotMatch(block, /add_header/, 'a location-level add_header drops every server-level header');
  assert.match(conf, /default "default-src 'none'; script-src 'self'; style-src 'self';/);
  assert.match(conf, /~\^\/\(research\|status\)\(\\\.html\)\?\$ "noindex, nofollow";/);
  assert.match(conf, /error_page 404 \/404\.html;/);
  assert.match(conf, /^  gzip on;$/m);
  for (const name of INTERNAL) assert.ok(noindex(read(name)), name);
});

test('internal planning pages are never linked from a public page or listed in the sitemap', () => {
  for (const name of publicPages()) assert.doesNotMatch(read(name), /href="\/(research|status)(\.html)?["#]/, name);
  assert.doesNotMatch(outputs()['sitemap.xml'], /\/(research|status)</);
});

test('an India legal page with blanks for the owner stays out of search and the sitemap, and a finished one is listed', () => {
  const sitemap = outputs()['sitemap.xml'];
  for (const name of LEGAL_PAGES_INDIA) {
    const html = read(`${name}.html`);
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    if (/\[[^\]]+\]/.test(main)) {
      assert.ok(noindex(html), `${name} has blanks but is indexable`);
      assert.ok(!sitemap.includes(`/${name}<`), `${name} has blanks but is in the sitemap`);
    } else if (!noindex(html)) {
      assert.ok(sitemap.includes(`/${name}<`), `${name} is finished but missing from the sitemap`);
    }
  }
});

test('while the app is not listed on Google Play no page sends people to a Play listing that does not exist', () => {
  if (PLAY_LISTED) return;
  for (const name of publicPages()) assert.ok(!read(name).includes(`play.google.com/store/apps/details?id=${PLAY_ID}`), name);
});

test('India prices on the home page, a year and a month, match what the server charges', async () => {
  const { PLANS } = await import('../../cloud/src/billing.mjs');
  const home = read('index.html');
  const rupees = (amount) => `₹${amount.toLocaleString('en-IN')}`;
  for (const id of ['essentials', 'pro', 'assured', 'firm']) {
    const plan = PLANS[id];
    assert.ok(home.includes(`<h3>${plan.title}</h3>`), plan.title);
    assert.ok(home.includes(`${rupees(plan.monthlyRupees)}</div>`), `${id} monthly`);
    assert.ok(home.includes(`or ${rupees(plan.yearlyRupees)} a year`), `${id} yearly`);
    assert.ok(home.includes(`"price":"${plan.monthlyRupees}"`), `${id} structured data`);
  }
});

test('structured data on every page is valid JSON', () => {
  for (const name of publicPages()) {
    for (const [, json] of read(name).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
  }
});

test('the 404 page is the MyCA page, kept out of search, with a way home', () => {
  const html = read('404.html');
  assert.ok(noindex(html));
  assert.match(html, /<a class="btn primary" href="\/">/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('every page in search shares a real 1200 by 630 preview image, and the home page answers its questions in structured data', () => {
  for (const name of publicPages()) {
    const html = read(name);
    const image = (html.match(/<meta property="og:image" content="https:\/\/__SITE_ORIGIN__\/([^"]+)">/) || [])[1];
    if (noindex(html) && !image) continue;
    assert.ok(image, `${name} has no og:image`);
    const png = readFileSync(join(PUBLIC_DIR, image));
    assert.equal(png.readUInt32BE(16), 1200, `${name} ${image} width`);
    assert.equal(png.readUInt32BE(20), 630, `${name} ${image} height`);
  }
  const home = read('index.html');
  assert.match(home, /"@type":"FAQPage"/);
  assert.match(home, /<button class="bahi-btn" type="button" id="bahi-hero" aria-label="[^"]+">/);
  assert.match(home, /<button class="still-toggle" type="button" id="still-toggle" aria-pressed="false">/);
});
