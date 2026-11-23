import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(here, '..', 'public');
export const INTERNAL_PAGES = Object.freeze(['/research', '/status']);
export const REQUIRED_HEADERS = Object.freeze([
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
]);
const VIEWPORTS = Object.freeze([
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 800 },
]);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACT = new Set(['serious', 'critical']);

export function pagePaths(dir = PUBLIC_DIR, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : pagePaths(join(dir, entry.name), `${prefix}${entry.name}/`);
    if (!entry.name.endsWith('.html') || entry.name === '404.html' || entry.name === 'invite.html') return [];
    const name = `${prefix}${entry.name.slice(0, -5)}`;
    return [name === 'index' ? '/' : `/${name}`];
  }).sort();
}

export function linksIn(html) {
  const out = [];
  for (const [, attr, value] of html.matchAll(/\s(href|src|action)="([^"]*)"/g)) {
    if (!value || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('__')) continue;
    if (attr === 'href' && value.startsWith('#') && html.includes(`<symbol id="${value.slice(1)}"`)) continue;
    out.push(value);
  }
  return out;
}

const idsIn = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

async function get(url, init = {}) {
  const response = await fetch(url, { redirect: 'manual', ...init });
  const body = await response.text();
  return { status: response.status, headers: response.headers, body, location: response.headers.get('location') };
}

async function resolve(base, url) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const result = await get(current);
    if (result.status >= 300 && result.status < 400 && result.location) {
      current = new URL(result.location, current).href;
      if (!current.startsWith(base)) return { ...result, final: current, external: true };
      continue;
    }
    return { ...result, final: current };
  }
  return { status: 0, final: current, body: '', headers: new Headers() };
}

export async function checkSite({ base = 'http://localhost:8080', browser: wantBrowser = true, external = false } = {}) {
  base = base.replace(/\/$/, '');
  const failures = [];
  const warnings = [];
  const fail = (where, what) => failures.push(`${where}: ${what}`);
  const pages = pagePaths();
  const html = new Map();
  const inbound = new Map(pages.map((path) => [path, 0]));
  const externalLinks = new Set();

  for (const path of pages) {
    const result = await get(`${base}${path}`, { headers: { 'accept-encoding': 'gzip' } });
    if (result.status !== 200) {
      fail(path, `answers ${result.status}`);
      continue;
    }
    html.set(path, result.body);
    for (const name of REQUIRED_HEADERS) if (!result.headers.get(name)) fail(path, `missing header ${name}`);
    if (!/text\/html/.test(result.headers.get('content-type') || '')) fail(path, 'is not served as text/html');
    if (result.headers.get('content-encoding') !== 'gzip') fail(path, 'is not gzip-compressed');
    const robots = result.headers.get('x-robots-tag') || '';
    const metaNoindex = /<meta name="robots" content="[^"]*noindex/.test(result.body);
    if (INTERNAL_PAGES.includes(path) && !(robots.includes('noindex') && metaNoindex)) fail(path, 'internal page must carry noindex in a header and a meta tag');
    if (result.body.includes('__SITE_ORIGIN__')) fail(path, 'still contains the __SITE_ORIGIN__ placeholder');
  }

  const checked = new Map();
  for (const [path, body] of html) {
    for (const link of linksIn(body)) {
      const absolute = new URL(link, `${base}${path}`);
      if (absolute.origin !== new URL(base).origin) {
        if (absolute.hostname !== new URL(base).hostname) externalLinks.add(absolute.href);
        continue;
      }
      const target = absolute.pathname;
      if (INTERNAL_PAGES.includes(target) && !INTERNAL_PAGES.includes(path)) fail(path, `links to internal page ${target}`);
      if (inbound.has(target) && target !== path) inbound.set(target, inbound.get(target) + 1);
      const key = `${absolute.origin}${absolute.pathname}${absolute.search}`;
      if (!checked.has(key)) checked.set(key, await resolve(base, key));
      const result = checked.get(key);
      if (result.status !== 200 && !result.external) {
        if (INTERNAL_PAGES.includes(path)) warnings.push(`${path}: link ${link} answers ${result.status}`);
        else fail(path, `link ${link} answers ${result.status}`);
        continue;
      }
      if (absolute.hash && absolute.hash.length > 1 && /text\/html/.test(result.headers.get('content-type') || '')) {
        const id = decodeURIComponent(absolute.hash.slice(1));
        if (!idsIn(result.body).has(id)) fail(path, `link ${link} points at a missing #${id}`);
      }
    }
  }
  for (const [path, count] of inbound) if (count === 0 && path !== '/' && !INTERNAL_PAGES.includes(path)) warnings.push(`${path}: no other page links here`);

  const missing = await get(`${base}/this-page-does-not-exist`);
  if (missing.status !== 404) fail('/this-page-does-not-exist', `answers ${missing.status}, not 404`);
  if (!/MyCA/.test(missing.body) || !/href="\/"/.test(missing.body)) fail('/this-page-does-not-exist', 'the 404 page is not the MyCA page with a way home');
  for (const name of REQUIRED_HEADERS) if (!missing.headers.get(name)) fail('404 page', `missing header ${name}`);

  const robots = await get(`${base}/robots.txt`);
  if (robots.status !== 200 || !/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/.test(robots.body)) fail('/robots.txt', 'missing or has no Sitemap line');
  const sitemap = await get(`${base}/sitemap.xml`);
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname.replace(/\/$/, '') || '/');
  if (sitemap.status !== 200 || locs.length === 0) fail('/sitemap.xml', 'missing or empty');
  for (const loc of locs) {
    if (!html.has(loc)) fail('/sitemap.xml', `lists ${loc}, which is not a page`);
    else if (/<meta name="robots" content="[^"]*noindex/.test(html.get(loc))) fail('/sitemap.xml', `lists ${loc}, which is noindex`);
  }
  for (const [path, body] of html) {
    if (/<meta name="robots" content="[^"]*noindex/.test(body)) continue;
    if (!locs.includes(path)) fail('/sitemap.xml', `does not list indexable page ${path}`);
  }

  for (const asset of ['/assets/site.css', '/assets/fonts/Inter-Regular.woff2', '/assets/logo.svg']) {
    const result = await get(`${base}${asset}`);
    if (result.status !== 200) fail(asset, `answers ${result.status}`);
    const cache = result.headers.get('cache-control') || '';
    const age = Number((cache.match(/max-age=(\d+)/) || [])[1] || 0);
    if (asset.endsWith('.woff2') && age < 2592000) fail(asset, `fonts should be cached for at least 30 days, got "${cache}"`);
  }

  if (external) {
    for (const url of externalLinks) {
      try {
        const response = await fetch(url, { method: 'GET', redirect: 'follow' });
        if (response.status >= 400) warnings.push(`external ${url} answers ${response.status}`);
      } catch (error) {
        warnings.push(`external ${url} failed: ${error.message}`);
      }
    }
  }

  const accessibility = [];
  if (wantBrowser) {
    const browser = await chromium.launch();
    try {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        for (const path of html.keys()) {
          if (INTERNAL_PAGES.includes(path)) continue;
          const page = await context.newPage();
          const problems = [];
          page.on('console', (message) => { if (message.type() === 'error') problems.push(`console error: ${message.text()}`); });
          page.on('pageerror', (error) => problems.push(`script error: ${error.message}`));
          page.on('requestfailed', (request) => { if (request.url().startsWith(base)) problems.push(`request failed: ${request.url()}`); });
          page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) problems.push(`${response.status()} for ${response.url()}`); });
          await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 1) problems.push(`scrolls sideways by ${overflow}px`);
          const fonts = await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((font) => font.status === 'error').length));
          if (fonts) problems.push(`${fonts} web font(s) failed to load`);
          if (viewport.name === 'phone') {
            const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
            for (const violation of results.violations) {
              const entry = `${violation.id} (${violation.impact}) on ${violation.nodes.length} element(s): ${violation.help}; first: ${violation.nodes[0]?.target?.join(' ')}`;
              accessibility.push({ path, id: violation.id, impact: violation.impact, nodes: violation.nodes.length });
              if (BLOCKING_IMPACT.has(violation.impact)) problems.push(`accessibility ${entry}`);
              else warnings.push(`${path}: accessibility ${entry}`);
            }
          }
          for (const problem of problems) fail(`${path} [${viewport.name}]`, problem);
          await page.close();
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }

  return { base, pages: [...html.keys()], links: checked.size, external: [...externalLinks].sort(), failures, warnings, accessibility };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const base = args.find((arg) => /^https?:\/\//.test(arg)) || process.env.SITE_URL || 'http://localhost:8080';
  const report = await checkSite({ base, browser: !args.includes('--no-browser'), external: args.includes('--external') });
  mkdirSync(join(here, 'reports'), { recursive: true });
  writeFileSync(join(here, 'reports', 'site-check.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Checked ${report.pages.length} pages and ${report.links} internal links on ${report.base}\n`);
  for (const warning of report.warnings) process.stdout.write(`warning  ${warning}\n`);
  for (const failure of report.failures) process.stdout.write(`FAIL     ${failure}\n`);
  process.stdout.write(report.failures.length ? `${report.failures.length} problem(s)\n` : 'All site checks passed\n');
  process.exitCode = report.failures.length ? 1 : 0;
}
