import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(here, 'rules-sources.json');
const SEEN = join(here, 'rules-sources.seen.json');
const TIMEOUT_MS = 20000;
const accept = process.argv.includes('--accept');

function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(text) {
  const stable = text
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/\b(?:visitors?|hits?|count)\s*:?\s*\d[\d,]*/gi, '')
    .replace(/\b(?:last updated|updated on)\s*:?\s*[0-9/.-]+/gi, '');
  return createHash('sha256').update(stable).digest('hex');
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MyCA rules watcher; +https://github.com/Vidyuthlabstechnologies/myca)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-IN,en' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { text: textOf(await res.text()) };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

const { sources } = JSON.parse(readFileSync(SOURCES, 'utf8'));
const seen = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const changed = [];
const unreachable = [];
const lines = [`Official sources checked on ${today}`, ''];

for (const source of sources) {
  const got = await fetchText(source.url);
  if (got.error) {
    unreachable.push(source);
    lines.push(`?? ${source.id}: could not read (${got.error}); ${source.what}`);
    continue;
  }
  const hash = fingerprint(got.text);
  const before = seen[source.id];
  if (!before) {
    seen[source.id] = { hash, checkedOn: today, acceptedOn: today, chars: got.text.length };
    lines.push(`new ${source.id}: first reading recorded (${got.text.length} characters)`);
    continue;
  }
  if (before.hash !== hash) {
    changed.push(source);
    lines.push(`!! ${source.id}: changed since ${before.acceptedOn}; read ${source.url} and add any new dated rule for ${source.family}`);
    seen[source.id] = accept ? { hash, checkedOn: today, acceptedOn: today, chars: got.text.length } : { ...before, checkedOn: today, pendingHash: hash };
  } else {
    seen[source.id] = { ...before, checkedOn: today };
    delete seen[source.id].pendingHash;
    lines.push(`ok ${source.id}: unchanged since ${before.acceptedOn}`);
  }
}

writeFileSync(SEEN, `${JSON.stringify(seen, null, 2)}\n`);
lines.push('');
if (changed.length) lines.push(`${changed.length} source${changed.length === 1 ? '' : 's'} changed. A person reads each page, adds any new dated rule record, runs the suites, then runs this script with --accept to record the new reading.`);
else lines.push('No source changed since it was last accepted.');
if (unreachable.length) lines.push(`${unreachable.length} source${unreachable.length === 1 ? '' : 's'} could not be read; try again later and check the URL still exists.`);
process.stdout.write(`${lines.join('\n')}\n`);
process.exit(changed.length && !accept ? 1 : 0);
