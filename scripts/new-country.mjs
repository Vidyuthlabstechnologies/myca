import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEGMENTS = ['individual', 'business', 'accountant'];
const REQUIRED = ['code', 'name', 'currency', 'symbol', 'locale', 'languages', 'minor-unit', 'tax-id', 'tax-name', 'time-zone'];

export const USAGE = `Add a country to MyCA as a planned pack with an empty engine.

node scripts/new-country.mjs --code SG --name Singapore --currency SGD --symbol 'S$' \\
  --locale en-SG --languages en,zh,ms,ta --minor-unit cents --tax-id UEN --tax-name GST \\
  --time-zone Asia/Singapore [--year-start 01-01] [--year-label 'year of assessment'] \\
  [--flavor sg] [--segments business,individual] [--requires-state] [--dry-run]`;

export function readOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (!word.startsWith('--')) return { ok: false, error: `I did not expect "${word}".` };
    const key = word.slice(2);
    if (key === 'dry-run' || key === 'requires-state') options[key] = true;
    else {
      index += 1;
      if (argv[index] === undefined) return { ok: false, error: `--${key} needs a value.` };
      options[key] = argv[index];
    }
  }
  return { ok: true, options };
}

function words(value) {
  return String(value).split(',').map((word) => word.trim()).filter(Boolean);
}

function quoted(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
}

export function planCountry(options) {
  const missing = REQUIRED.filter((key) => !String(options[key] || '').trim());
  if (missing.length) return { ok: false, error: `Missing: ${missing.map((key) => `--${key}`).join(', ')}.` };
  const code = String(options.code).trim().toUpperCase();
  const name = String(options.name).trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const constant = slug.toUpperCase().replace(/-/g, '_');
  const yearStart = /^(\d{2})-(\d{2})$/.exec(String(options['year-start'] || '01-01'));
  const languages = words(options.languages);
  const segments = words(options.segments || 'business,individual');
  const problems = [];
  if (!/^[A-Z]{2}$/.test(code)) problems.push('--code is the ISO 3166-1 two-letter code.');
  if (!slug) problems.push('--name needs at least one letter.');
  if (!/^[A-Z]{3}$/.test(String(options.currency))) problems.push('--currency is the ISO 4217 code.');
  if (!languages.length || !languages.every((language) => /^[a-z]{2,3}$/.test(language))) problems.push('--languages is a comma-separated list of ISO 639 codes, the default first.');
  if (!yearStart || Number(yearStart[1]) < 1 || Number(yearStart[1]) > 12 || Number(yearStart[2]) < 1 || Number(yearStart[2]) > 28) problems.push('--year-start is MM-DD, with the day 28 or earlier.');
  if (!segments.length || !segments.every((segment) => SEGMENTS.includes(segment))) problems.push(`--segments is drawn from ${SEGMENTS.join(', ')}.`);
  if (problems.length) return { ok: false, error: problems.join(' ') };
  const flavor = String(options.flavor || code.toLowerCase()).trim().toLowerCase();
  const month = Number(yearStart[1]);
  const day = Number(yearStart[2]);
  const calendar = month === 1 && day === 1;
  const yearLabel = String(options['year-label'] || (calendar ? 'tax year' : 'financial year'));
  const lower = code.toLowerCase();

  const pack = `import { planned } from './planned.mjs';

export const ${constant} = planned({
  code: ${quoted(code)}, name: ${quoted(name)}, currency: ${quoted(options.currency)}, symbol: ${quoted(options.symbol)}, locale: ${quoted(options.locale)}, languages: [${languages.map(quoted).join(', ')}], minorUnit: ${quoted(options['minor-unit'])}, yearStartMonth: ${month}, yearStartDay: ${day}, yearLabel: ${quoted(yearLabel)}, taxId: ${quoted(options['tax-id'])}, taxName: ${quoted(options['tax-name'])}, requiresState: ${options['requires-state'] ? 'true' : 'false'}, flavor: ${quoted(flavor)}, timeZone: ${quoted(options['time-zone'])},
  residency: { rule: ${quoted(`${name} data is hosted in ${name}. Name the law and the cloud region here once knowledge/${lower}.md has them.`)}, regionPrefixes: [], defaultRegion: '' },
  filing: [],
  segments: [${segments.map(quoted).join(', ')}],
  licences: [
    { id: 'research', authority: 'MyCA', what: ${quoted(`Research in knowledge/${lower}.md: what the tax authority requires of software, the licences, the data rule and the hosting region`)} },
  ],
});
`;
  const manifest = `export const MANIFEST = Object.freeze({
  country: ${quoted(code)},
  capabilities: Object.freeze({}),
  ruleFamilies: Object.freeze([]),
  tools: Object.freeze([]),
});
`;
  const engine = `export const ENGINE = Object.freeze({
  country: ${quoted(code)},
  run: Object.freeze({}),
  preview: Object.freeze({}),
  words: Object.freeze({}),
});
`;
  const knowledge = `---
country: ${code}
checked: ${options.today}
recheck-by: ${options.recheckBy}
attested: false
---

# ${name}

## Summary

Not researched yet. Say in a few lines who MyCA would serve here, what the opening is and what
stands in the way.

## Tax year and calendar

## Filing routes

## Licences and registrations

## Data

## Payments

## Open questions

- What the tax authority requires of software that prepares or files returns.
- Which licences or registrations the company needs, and how long each takes.
- Where the data must be hosted, and which cloud region serves it.
- Which payment processor suits a local entity.
`;
  return {
    ok: true,
    code,
    slug,
    files: {
      [`platform/src/countries/${slug}.mjs`]: pack,
      [`platform/src/countries/${slug}/manifest.mjs`]: manifest,
      [`platform/src/countries/${slug}/engine.mjs`]: engine,
      [`platform/src/countries/knowledge/${lower}.md`]: knowledge,
    },
    registrations: [
      { path: 'platform/src/countries/index.mjs', importLine: `import { ${constant} } from './${slug}.mjs';`, list: 'export const PACKS = Object.freeze([', entry: constant },
      { path: 'platform/src/countries/manifests.mjs', importLine: `import { MANIFEST as ${constant} } from './${slug}/manifest.mjs';`, list: 'export const MANIFESTS = Object.freeze([', entry: constant },
      { path: 'platform/src/countries/engines.mjs', importLine: `import { ENGINE as ${constant} } from './${slug}/engine.mjs';`, list: '  return [', entry: constant },
    ],
    next: [
      `Research first: fill platform/src/countries/knowledge/${lower}.md, every fact with a "Source:" line. The suite stays red until the file cites a source.`,
      `Put what the research finds into platform/src/countries/${slug}.mjs: filing routes, licences, the residency rule and region.`,
      `Build inside platform/src/countries/${slug}/: tools go in manifest.mjs and engine.mjs. See docs/architecture/COUNTRY-ENGINES.md.`,
      `Dated rules go in sprints/statutory-rules with ids starting "${lower}.".`,
      'When it is ready for testers: move the pack to status beta with prices, add its regions to infra/cloud/country.tf and the rollout workflow, add countries/<code>.tfvars and the Android flavor.',
    ],
  };
}

export function registerIn(text, { importLine, list, entry }) {
  if (text.includes(importLine)) return { ok: false, error: 'ALREADY_REGISTERED' };
  const lines = text.split('\n');
  let lastImport = -1;
  lines.forEach((line, index) => {
    if (line.startsWith('import ')) lastImport = index;
  });
  const listAt = lines.findIndex((line) => line.startsWith(list));
  if (lastImport < 0 || listAt < 0) return { ok: false, error: 'REGISTRY_SHAPE_CHANGED' };
  const closeAt = lines.findIndex((line, index) => index > listAt && /^\s*\]/.test(line));
  if (closeAt < 0) return { ok: false, error: 'REGISTRY_SHAPE_CHANGED' };
  const indent = /^(\s*)/.exec(lines[closeAt - 1])[1] || '  ';
  lines.splice(closeAt, 0, `${indent}${entry},`);
  lines.splice(lastImport + 1, 0, importLine);
  return { ok: true, text: lines.join('\n') };
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function scaffoldCountry(options, { root = REPO, now = new Date() } = {}) {
  const recheck = new Date(now);
  recheck.setUTCDate(recheck.getUTCDate() + 90);
  const plan = planCountry({ ...options, today: isoDay(now), recheckBy: isoDay(recheck) });
  if (!plan.ok) return plan;
  const clash = Object.keys(plan.files).filter((path) => existsSync(join(root, path)));
  if (clash.length) return { ok: false, error: `Already there: ${clash.join(', ')}. Edit the files instead.` };
  const edits = [];
  for (const registration of plan.registrations) {
    const path = join(root, registration.path);
    const edited = registerIn(readFileSync(path, 'utf8'), registration);
    if (!edited.ok) return { ok: false, error: `${registration.path}: ${edited.error}` };
    edits.push([path, edited.text]);
  }
  if (!options['dry-run']) {
    for (const [path, text] of Object.entries(plan.files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    for (const [path, text] of edits) writeFileSync(path, text);
  }
  return { ok: true, code: plan.code, written: options['dry-run'] ? [] : [...Object.keys(plan.files), ...plan.registrations.map((registration) => registration.path)], planned: Object.keys(plan.files), next: plan.next };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = readOptions(process.argv.slice(2));
  const result = read.ok ? scaffoldCountry(read.options) : read;
  if (!result.ok) {
    console.error(result.error);
    console.error(`\n${USAGE}`);
    process.exit(1);
  }
  console.log(result.written.length ? `Added ${result.code}:` : `Would add ${result.code} (dry run):`);
  for (const path of result.written.length ? result.written : result.planned) console.log(`  ${path}`);
  console.log('\nNext:');
  result.next.forEach((line, index) => console.log(`  ${index + 1}. ${line}`));
}
