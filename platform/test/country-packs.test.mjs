import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, countryPack, isServedCountry, licencesNeeded, packForFlavor, packProblems, regionServes, toolOwner } from '../src/countries/index.mjs';
import { countryKnowledge, knowledgeProblems, searchCountryKnowledge } from '../src/countries/knowledge.mjs';
import { COUNTRIES, taxYearOf, toolServesCountry, yearOf, yearWords } from '../src/country.mjs';
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

test('each country reads its tax year from its own start day', () => {
  assert.equal(taxYearOf('GB', '2026-04-05'), '2025-26');
  assert.equal(taxYearOf('GB', '2026-04-06'), '2026-27');
  assert.equal(taxYearOf('AU', '2026-06-30'), '2025-26');
  assert.equal(taxYearOf('AU', '2026-07-01'), '2026-27');
  assert.equal(taxYearOf('CA', '2026-07-01'), '2026');
  assert.equal(taxYearOf('IN', '2026-03-31'), '2025-26');
  assert.equal(taxYearOf('ZZ', '2026-03-31'), null);
});

test('a plan says what it sells and who takes the money, and software inside a Play app uses Play billing', () => {
  for (const plan of countryPack('IN').billing.plans) assert.equal(plan.provider, 'play', plan.id);
  assert.equal(countryPack('US').billing.plans.find((plan) => plan.id === 'us-return').provider, 'stripe');
  const us = countryPack('US');
  const wrong = { ...us, code: 'ZZ', app: { ...us.app, flavor: 'zz', androidId: 'x.zz' }, residency: { ...us.residency, regionPrefixes: ['zz-'], defaultRegion: 'zz-1' }, billing: { ...us.billing, plans: [{ id: 'books', kind: 'monthly', price: 9, sells: 'software', provider: 'stripe' }] } };
  assert.ok(packProblems([wrong]).some((line) => /Google requires to use Play billing/.test(line)));
});

test('the licences a country still needs are listed, and a live country needs none', () => {
  assert.ok(licencesNeeded('US').some((licence) => licence.id === 'efin'));
  assert.ok(licencesNeeded('AU').some((licence) => licence.id === 'tax-agent'));
  assert.deepEqual(countryPack('AE').segments, ['business']);
  const india = countryPack('IN');
  assert.ok(packProblems([{ ...india, licences: [{ id: 'x', authority: 'y', what: 'z', status: 'needed' }] }]).some((line) => /live country cannot still need a licence/.test(line)));
});

test('every country has a sourced, dated knowledge file that is not overdue a recheck', () => {
  assert.deepEqual(knowledgeProblems(PACKS, new Date().toISOString().slice(0, 10)), []);
  assert.equal(countryKnowledge('GB').attested, false);
  assert.equal(countryKnowledge('ZZ'), null);
});

test('the knowledge base answers a question with the section and its sources', () => {
  const found = searchCountryKnowledge('AU', 'who may charge a fee to lodge a return');
  assert.equal(found[0].heading, 'Who may charge for tax work');
  assert.ok(found[0].sources.some((url) => url.includes('tpb.gov.au')));
  assert.equal(found[0].attested, false);
  assert.ok(searchCountryKnowledge('AE', 'e-invoicing accredited service provider deadline')[0].heading.startsWith('E-invoicing'));
  assert.deepEqual(searchCountryKnowledge('GB', ''), []);
});

test('the Cloud Run rollout allows exactly the regions the country packs allow, and the stack tells the API its country', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../../.github/workflows/cloud-run-rollout.yml', import.meta.url), 'utf8');
  const tf = await readFile(new URL('../../infra/cloud/country.tf', import.meta.url), 'utf8');
  for (const code of Object.keys(COUNTRIES)) {
    const allowed = [...workflow.matchAll(new RegExp(`${code}:([a-z0-9-]+)`, 'g'))].map((hit) => hit[1]).sort();
    const regions = JSON.parse(tf.match(new RegExp(`${code} = (\\[[^\\]]*\\])`))[1]).sort();
    assert.deepEqual(allowed, regions, code);
  }
  const main = await readFile(new URL('../../infra/cloud/main.tf', import.meta.url), 'utf8');
  assert.match(main, /MYCA_COUNTRIES\s+= var\.country/);
  assert.match(main, /MYCA_REGION\s+= var\.region/);
});
