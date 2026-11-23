import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(here, '..', 'public');
export const DIST_DIR = join(here, 'dist');
const NGINX = join(here, '..', 'site', 'default.conf.template');
const TEXT = new Set(['.html', '.xml', '.txt', '.css', '.js', '.json', '.svg']);
const INTERNAL = ['/research', '/research.html', '/status', '/status.html'];

function mapValue(conf, map, key) {
  const block = conf.match(new RegExp(`map \\$uri \\$${map} \\{([\\s\\S]*?)\\n\\}`))[1];
  const line = block.split('\n').find((row) => row.trim().startsWith(key));
  return line.trim().slice(key.length).trim().replace(/^"|";$/g, '');
}

export function serverHeaders(conf = readFileSync(NGINX, 'utf8')) {
  const fixed = Object.fromEntries([...conf.matchAll(/^  add_header ([A-Za-z-]+) "([^"]+)" always;$/gm)].map((match) => [match[1], match[2]]));
  return {
    fixed,
    csp: mapValue(conf, 'myca_csp', 'default'),
    internalCsp: mapValue(conf, 'myca_csp', '~^/(research|status)(\\.html)?$'),
    fontCache: mapValue(conf, 'myca_cache', '~^/assets/fonts/'),
    imageCache: mapValue(conf, 'myca_cache', '~^/assets/.+\\.(png|svg|jpg|webp)$'),
  };
}

export function renderHeaders(headers = serverHeaders()) {
  const all = [
    `  Content-Security-Policy: ${headers.csp}`,
    ...Object.entries(headers.fixed).map(([name, value]) => `  ${name}: ${value}`),
    '  Referrer-Policy: strict-origin-when-cross-origin',
  ];
  const blocks = [['/*', all]];
  for (const path of INTERNAL) blocks.push([path, ['  ! Content-Security-Policy', `  Content-Security-Policy: ${headers.internalCsp}`, '  X-Robots-Tag: noindex, nofollow']]);
  for (const path of ['/r/*', '/r']) blocks.push([path, ['  ! Referrer-Policy', '  Referrer-Policy: no-referrer', '  X-Robots-Tag: noindex']]);
  blocks.push(['/404', ['  X-Robots-Tag: noindex']]);
  blocks.push(['/assets/fonts/*', [`  Cache-Control: ${headers.fontCache}`]]);
  for (const ext of ['png', 'svg']) blocks.push([`/assets/*.${ext}`, [`  Cache-Control: ${headers.imageCache}`]]);
  return `${blocks.map(([path, lines]) => `${path}\n${lines.join('\n')}`).join('\n\n')}\n`;
}

export function renderRedirects() {
  return ['/us/ /us 301', '/index / 301', '/r/* /r/ 200', ''].join('\n');
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

export function buildPages({ origin, earlyAccessUrl = '', out = DIST_DIR } = {}) {
  if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(origin || '')) throw new Error('origin must be like https://myca-site.pages.dev');
  if (earlyAccessUrl && !/^https:\/\/[A-Za-z0-9._~:/?#@%=+,-]+$/.test(earlyAccessUrl)) throw new Error('the early-access address must be a plain https:// address');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(PUBLIC_DIR, out, { recursive: true });
  rmSync(join(out, 'invite.html'));
  mkdirSync(join(out, 'r'), { recursive: true });
  writeFileSync(join(out, 'r', 'index.html'), readFileSync(join(PUBLIC_DIR, 'invite.html'), 'utf8'));
  for (const path of files(out)) {
    if (!TEXT.has(extname(path))) continue;
    const text = readFileSync(path, 'utf8');
    const next = text.replaceAll('https://__SITE_ORIGIN__', origin).replaceAll('__EARLY_ACCESS_URL__', earlyAccessUrl);
    if (next !== text) writeFileSync(path, next);
  }
  writeFileSync(join(out, '_headers'), renderHeaders());
  writeFileSync(join(out, '_redirects'), renderRedirects());
  return files(out).map((path) => relative(out, path)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.argv[2] || process.env.SITE_ORIGIN;
  const list = buildPages({ origin, earlyAccessUrl: process.env.MYCA_EARLY_ACCESS_URL || '' });
  process.stdout.write(`wrote ${list.length} files to ${relative(process.cwd(), DIST_DIR) || '.'} for ${origin}\n`);
}
