import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputs, playUrl, renderPage, stale } from './build.mjs';
import { INDIA_PRICES, PAGES, US_FORMS, US_PRICES } from './pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the committed pages match what the generator writes', () => {
  assert.deepEqual(stale(), [], 'run: node deploy/seo/build.mjs');
});

test('every page has its own title, a search-sized description, one h1 and valid structured data', () => {
  const titles = new Set();
  for (const page of PAGES) {
    assert.ok(!titles.has(page.title), page.slug);
    titles.add(page.title);
    assert.ok(page.title.length <= 70, `${page.slug} title ${page.title.length}`);
    assert.ok(page.description.length >= 110 && page.description.length <= 170, `${page.slug} description ${page.description.length}`);
    const html = renderPage(page);
    assert.equal(html.match(/<h1\b/g).length, 1, page.slug);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://__SITE_ORIGIN__/${page.slug}">`));
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
    for (const slug of page.related) assert.ok(PAGES.some((other) => other.slug === slug), `${page.slug} links to missing ${slug}`);
  }
});

test('the sitemap lists every page, and robots points at it and keeps invite links out', () => {
  const files = outputs();
  for (const page of PAGES) assert.ok(files['sitemap.xml'].includes(`<loc>https://__SITE_ORIGIN__/${page.slug}</loc>`), page.slug);
  assert.match(files['robots.txt'], /Disallow: \/r\//);
  assert.match(files['robots.txt'], /Sitemap: https:\/\/__SITE_ORIGIN__\/sitemap\.xml/);
  assert.match(files['invite.html'], /<meta name="robots" content="noindex">/);
});

test('Play links carry a campaign so installs can be traced to the page', () => {
  const url = new URL(playUrl('gst_billing_software'));
  assert.equal(url.searchParams.get('id'), 'com.mldynamic.myca');
  assert.equal(url.searchParams.get('referrer'), 'utm_source=web&utm_medium=site&utm_campaign=gst_billing_software');
});

test('prices and forms on the pages match the home page and the server', () => {
  const home = readFileSync(join(root, 'deploy', 'public', 'index.html'), 'utf8');
  for (const price of Object.values(INDIA_PRICES)) assert.ok(home.includes(price), price);
  const billing = readFileSync(join(root, 'cloud', 'src', 'billing.mjs'), 'utf8');
  assert.ok(billing.includes(US_PRICES.returnList.slice(1)), 'US return price');
  assert.ok(billing.includes(US_PRICES.plus.slice(1)), 'US Plus price');
  const api = readFileSync(join(root, 'cloud', 'src', 'api.mjs'), 'utf8');
  const supported = api.match(/supported: \[([^\]]*)\]/)[1];
  for (const form of US_FORMS) assert.ok(supported.includes(`'${form}'`), form);
});

test('the nginx config fills in the real host and serves invite links', () => {
  const conf = readFileSync(join(root, 'deploy', 'site', 'default.conf.template'), 'utf8');
  assert.match(conf, /sub_filter 'https:\/\/__SITE_ORIGIN__' 'https:\/\/\$host';/);
  assert.match(conf, /sub_filter_types text\/xml application\/xml text\/plain;/);
  assert.match(conf, /location \^~ \/r\/ \{[\s\S]*?try_files \/invite\.html =404;/);
});

test('US pages carry an early-access form that stays hidden until its address is set', () => {
  for (const page of PAGES) {
    const html = renderPage(page);
    if (page.edition !== 'us') {
      assert.doesNotMatch(html, /__EARLY_ACCESS_URL__/, page.slug);
      continue;
    }
    assert.match(html, /<form class="early-access" id="early-access-[a-z0-9-]+" method="post" action="__EARLY_ACCESS_URL__" hidden>/, page.slug);
    assert.match(html, /name="email_address"/, page.slug);
  }
  const conf = readFileSync(join(root, 'deploy', 'site', 'default.conf.template'), 'utf8');
  assert.match(conf, /sub_filter '__EARLY_ACCESS_URL__' '\$\{MYCA_EARLY_ACCESS_URL\}';/);
  const docker = readFileSync(join(root, 'deploy', 'site', 'Dockerfile'), 'utf8');
  assert.match(docker, /ENV MYCA_EARLY_ACCESS_URL=""/);
  assert.match(docker, /ENV NGINX_ENVSUBST_FILTER="\^MYCA_"/);
  assert.match(docker, /COPY deploy\/site\/default\.conf\.template \/etc\/nginx\/templates\/default\.conf\.template/);
  assert.match(readFileSync(join(root, 'deploy', 'public', 'privacy.html'), 'utf8'), /early-access list/);
});
