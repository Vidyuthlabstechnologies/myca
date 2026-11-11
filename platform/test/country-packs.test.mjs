import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, countryPack, isServedCountry, packForFlavor, packProblems, regionServes, toolOwner } from '../src/countries/index.mjs';
import { COUNTRIES, toolServesCountry, yearOf, yearWords } from '../src/country.mjs';
import { TOOLS } from '../src/tools.mjs';

test('every country pack passes the registry checks', () => {
  assert.deepEqual(packProblems(), []);
});

test('the checks catch a pack that would break residency, pricing or merging', () => {
  const india = countryPack('IN');
  const broken = { ...india, code: 'ZZ', app: { ...india.app, flavor: 'zz', androidId: 'x.zz' }, residency: { ...india.residency, regionPrefixes: ['asia-south'], defaultRegion: 'us-central1' }, billing: { ...india.billing, plans: [] }, toolPolicy: 'shared-and-own', tools: ['b', 'a'] };
  const problems = packProblems([india, broken]);
  assert.ok(problems.some((line) => /default region us-central1 is outside/.test(line)));
  assert.ok(problems.some((line) => /at least one price/.test(line)));
  assert.ok(problems.some((line) => /keep tools sorted/.test(line)));
  assert.ok(problems.some((line) => /overlaps IN/.test(line)));
});

test('only live and beta packs are countries a business can pick', () => {
  assert.deepEqual(Object.keys(COUNTRIES), ['IN', 'US']);
  assert.equal(isServedCountry('GB'), false);
  assert.equal(countryPack('gb').status, 'planned');
  assert.ok(PACKS.length >= 6);
});

test('the app flavor picks the country pack', () => {
  assert.equal(packForFlavor('india').code, 'IN');
  assert.equal(packForFlavor('us').app.androidId, 'com.mldynamic.myca.us');
  assert.equal(packForFlavor('nope'), null);
});

test('data regions belong to one country each', () => {
  assert.equal(regionServes(countryPack('IN'), 'asia-south1'), true);
  assert.equal(regionServes(countryPack('IN'), 'us-central1'), false);
  assert.equal(regionServes(countryPack('US'), 'us-east4'), true);
  assert.equal(regionServes(countryPack('AE'), 'me-central1'), false, 'the UAE has no Google Cloud region yet');
});

test('a tool a pack claims serves only that country; India keeps every unclaimed tool', () => {
  assert.equal(toolOwner('sales_tax_return'), 'US');
  assert.equal(toolServesCountry('sales_tax_return', 'US'), true);
  assert.equal(toolServesCountry('sales_tax_return', 'IN'), false);
  assert.equal(toolServesCountry('gstr3b', 'IN'), true);
  assert.equal(toolServesCountry('gstr3b', 'US'), false);
  assert.equal(toolServesCountry('trial_balance', 'US'), true);
  for (const tool of TOOLS) assert.ok(toolServesCountry(tool.name, 'IN') !== (toolOwner(tool.name) && toolOwner(tool.name) !== 'IN'), tool.name);
});

test('India keeps its April year and the US the calendar year', () => {
  assert.equal(yearOf({ country: 'IN' }, '2026-03-31'), '2025-26');
  assert.equal(yearOf({ country: 'US' }, '2026-03-31'), '2026');
  assert.equal(yearWords({ country: 'US' }, '2026-03-31'), '2026');
});

test('the Terraform country list matches the served packs and keeps each region inside its country', async () => {
  const { readFile } = await import('node:fs/promises');
  const tf = await readFile(new URL('../../infra/cloud/country.tf', import.meta.url), 'utf8');
  const allowed = JSON.parse(tf.match(/contains\((\[[^\]]*\]), var\.country\)/)[1]);
  assert.deepEqual(allowed, Object.keys(COUNTRIES));
  for (const code of allowed) {
    const regions = JSON.parse(tf.match(new RegExp(`${code} = (\\[[^\\]]*\\])`))[1]);
    for (const region of regions) assert.equal(regionServes(countryPack(code), region), true, `${code} ${region}`);
    const vars = await readFile(new URL(`../../infra/cloud/countries/${code.toLowerCase()}.tfvars`, import.meta.url), 'utf8');
    assert.equal(vars.match(/region\s*=\s*"([^"]+)"/)[1], countryPack(code).residency.defaultRegion);
  }
});
