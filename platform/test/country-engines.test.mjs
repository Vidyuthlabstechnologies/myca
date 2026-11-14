import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS, packProblems, countryPack, regionServes } from '../src/countries/index.mjs';
import { MANIFESTS, CAPABILITIES, EVERY_COUNTRY, manifestProblems, engineTables, countryCapabilities, capabilityTool, engineToolOwner, manifestFor } from '../src/countries/manifests.mjs';
import { engineProblems, engineRun, enginePreview, engineWords, runEngineTool } from '../src/countries/engines.mjs';
import { TOOLS, TOOL_MAP, runTool } from '../src/tools.mjs';
import { assistantTools, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { needsConfirmation, previewOf } from '../src/chat-confirm.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { newBook, serializeBook, deserializeBook } from '../src/books.mjs';
import { bookView } from '../src/book-view.mjs';
import { rulesStatus } from '../src/rules-status.mjs';
import { READY_MADE, readyMadeFor, readyMadeProblems } from '../src/countries/ready-made.mjs';
import { ACTION_CLASSES, ENGINE_ACTION_CLASSES, ENGINE_ACTION_FAMILY, externalActionClass, performExternalAction } from '../src/action-gate.mjs';
import { ChannelClient, getChannelClient, setChannelClient } from '../src/channel-client.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { countrySlice, openCountrySlice, progressiveTax, flatTax, bandProblems, taxYearBounds, periodsBetween, periodOf, luhnValid, weightedSum, weightedRemainder, moveReturn, nextStatuses, returnLocked, providePort, hasPort, port, portOr } from '../src/countries/kit/index.mjs';

const COUNTRIES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'countries');
const ENGINE_FOLDERS = readdirSync(COUNTRIES_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(COUNTRIES_DIR, entry.name, 'manifest.mjs'))).map((entry) => entry.name);

const schema = (properties = {}, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const FIXTURE = {
  country: 'MY',
  capabilities: { 'income-tax': { status: 'building', roles: { estimate: 'my_tax_estimate', profile: 'set_my_taxpayer' } } },
  ruleFamilies: [{ key: 'my-income-tax', title: 'Malaysia individual income tax', prefix: 'my.income-tax.', watch: ['The Budget each October'] }],
  tools: [
    { name: 'my_tax_estimate', title: 'Estimate', description: 'Estimate income tax for a year of assessment. Read-only.', access: 'read', schema: schema({ year: { type: 'string' } }) },
    { name: 'set_my_taxpayer', title: 'Taxpayer', description: 'Set who the return is for, for one year of assessment.', access: 'write', schema: schema({ name: { type: 'string' } }, ['name']) },
  ],
};

test('the country manifests and engines in the repository pass every check', async () => {
  assert.deepEqual(manifestProblems(MANIFESTS, PACKS.map((pack) => pack.code)), []);
  assert.deepEqual(engineProblems(), []);
  assert.deepEqual(packProblems(), []);
  const inFolders = await Promise.all(ENGINE_FOLDERS.map(async (folder) => (await import(`../src/countries/${folder}/manifest.mjs`)).MANIFEST.country));
  assert.deepEqual(inFolders.slice().sort(), MANIFESTS.map((manifest) => manifest.country).sort(), 'every folder with a manifest is registered');
});

test('a manifest is pure data, and no engine reaches into the central files', () => {
  const central = /from\s+'(?:\.\.\/)+(?:tools|router|assistant-contract|assistant-tools|tool-schemas(?:-[a-z-]+)?|chat-confirm|confirm-[a-z-]+|remote-contract|session|server)\.mjs'/;
  for (const folder of ENGINE_FOLDERS) {
    assert.doesNotMatch(readFileSync(join(COUNTRIES_DIR, folder, 'manifest.mjs'), 'utf8'), /^\s*import\s/m, `${folder}/manifest.mjs must not import anything`);
    for (const file of readdirSync(join(COUNTRIES_DIR, folder)).filter((name) => name.endsWith('.mjs'))) {
      assert.doesNotMatch(readFileSync(join(COUNTRIES_DIR, folder, file), 'utf8'), central, `${folder}/${file} imports a central file`);
    }
  }
});

test('every engine module loads on its own, whichever file is imported first', () => {
  for (const folder of ENGINE_FOLDERS) {
    const file = join(COUNTRIES_DIR, folder, 'engine.mjs');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(`file://${file}`)}); process.stdout.write(typeof m.ENGINE.run);`], { encoding: 'utf8' });
    assert.equal(out, 'object', folder);
  }
});

test('manifest checks name what is wrong', () => {
  assert.deepEqual(manifestProblems([FIXTURE], ['MY']), []);
  const broken = (patch) => manifestProblems([{ ...FIXTURE, ...patch }], ['MY']).join('\n');
  assert.match(manifestProblems([FIXTURE], ['IN']).join('\n'), /no country pack/);
  assert.match(manifestProblems([FIXTURE, FIXTURE], ['MY']).join('\n'), /only one manifest per country/);
  assert.match(broken({ tools: [{ ...FIXTURE.tools[0], name: 'tax_estimate' }] }), /carries its code as one word/);
  assert.match(broken({ tools: [{ ...FIXTURE.tools[0], name: 'myTaxEstimate' }] }), /lower case words joined by underscores/);
  assert.match(broken({ tools: [FIXTURE.tools[1], FIXTURE.tools[0]] }), /keep tools sorted/);
  assert.match(broken({ tools: [{ ...FIXTURE.tools[0], access: 'admin' }, FIXTURE.tools[1]] }), /access is read or write/);
  assert.match(broken({ tools: [{ ...FIXTURE.tools[0], schema: { type: 'object', properties: {} } }, FIXTURE.tools[1]] }), /additionalProperties false/);
  assert.match(broken({ tools: [FIXTURE.tools[0], { ...FIXTURE.tools[1], schema: schema({}, ['name']) }] }), /required argument name/);
  assert.match(broken({ tools: [{ ...FIXTURE.tools[0], description: 'short' }, FIXTURE.tools[1]] }), /description the assistant can choose by/);
  assert.match(broken({ capabilities: { 'crypto-tax': { status: 'beta', roles: {} } } }), /not a capability/);
  assert.match(broken({ capabilities: { 'income-tax': { status: 'done', roles: {} } } }), /status is one of/);
  assert.match(broken({ capabilities: { 'income-tax': { status: 'beta', roles: { lodge: 'my_tax_estimate' } } } }), /not a role of this capability/);
  assert.match(broken({ capabilities: { 'income-tax': { status: 'beta', roles: { estimate: 'my_missing' } } } }), /not one of this manifest's tools/);
  assert.match(broken({ ruleFamilies: [{ ...FIXTURE.ruleFamilies[0], prefix: 'income-tax.' }] }), /rule ids start with its code/);
  assert.match(broken({ ruleFamilies: [{ ...FIXTURE.ruleFamilies[0], watch: [] }] }), /what to watch/);
});

test('engine checks demand a run for every tool and a preview for every write', () => {
  const run = { my_tax_estimate: () => ({ ok: true }), set_my_taxpayer: () => ({ ok: true }) };
  const preview = { set_my_taxpayer: () => ({ blockers: [], summary: '', effects: [], figures: {} }) };
  assert.deepEqual(engineProblems([FIXTURE], [{ country: 'MY', run, preview, words: {} }]), []);
  assert.match(engineProblems([FIXTURE], []).join('\n'), /no engine/);
  assert.match(engineProblems([], [{ country: 'MY', run, preview }]).join('\n'), /no manifest/);
  assert.match(engineProblems([FIXTURE], [{ country: 'MY', run: { my_tax_estimate: run.my_tax_estimate }, preview }]).join('\n'), /set_my_taxpayer: the engine has no run function/);
  assert.match(engineProblems([FIXTURE], [{ country: 'MY', run, preview: {} }]).join('\n'), /needs a preview/);
  assert.match(engineProblems([FIXTURE], [{ country: 'MY', run, preview: { ...preview, my_tax_estimate: preview.set_my_taxpayer } }]).join('\n'), /read-only tool has no preview/);
  assert.match(engineProblems([FIXTURE], [{ country: 'MY', run: { ...run, my_extra: run.my_tax_estimate }, preview }]).join('\n'), /manifest does not list/);
});

test('one manifest feeds every table the central files read', () => {
  const tables = engineTables([FIXTURE]);
  assert.deepEqual(tables.toolDefs.map((tool) => [tool.name, tool.args, tool.country]), [['my_tax_estimate', ['year'], 'MY'], ['set_my_taxpayer', ['name'], 'MY']]);
  assert.deepEqual(tables.readTools, ['my_tax_estimate']);
  assert.deepEqual(tables.writeTools, ['set_my_taxpayer']);
  assert.deepEqual(tables.risk, { my_tax_estimate: 'read_only', set_my_taxpayer: 'writes_books' });
  assert.equal(tables.argSchemas.set_my_taxpayer.required[0], 'name');
  assert.deepEqual(tables.ruleFamilies.map((family) => [family.key, family.country]), [['my-income-tax', 'MY']]);
  assert.equal(tables.owners.get('set_my_taxpayer'), 'MY');
});

test('the shared country_profile tool runs for every country through every central table', async () => {
  assert.ok(TOOL_MAP.country_profile, 'registered as a tool');
  assert.equal(TOOLS.filter((tool) => tool.name === 'country_profile').length, 1);
  assert.equal(engineToolOwner('country_profile'), EVERY_COUNTRY);
  assert.equal(toolServesCountry('country_profile', 'IN'), true);
  assert.equal(toolServesCountry('country_profile', 'US'), true);
  assert.equal(isRemoteQuery('country_profile'), true);
  assert.equal(needsConfirmation('country_profile'), false);
  const offered = assistantTools(TOOLS).find((tool) => tool.name === 'country_profile');
  assert.equal(offered.risk, 'read_only');
  assert.equal(offered.parameters.additionalProperties, false);
  assert.equal(validateAssistantToolCall('country_profile', { date: '2026-11-11' }).ok, true);
  assert.equal(validateAssistantToolCall('country_profile', { date: 'tomorrow' }).ok, false);
  assert.equal(validateAssistantToolCall('country_profile', { country: 'US' }).ok, false);

  const india = createState();
  const inResult = await runTool(india, 'country_profile', { date: '2026-03-31' });
  assert.equal(inResult.ok, true);
  assert.equal(inResult.data.country, 'IN');
  assert.equal(inResult.data.taxYear, '2025-26');
  assert.equal(inResult.data.taxName, 'GST');
  assert.deepEqual(inResult.data.capabilities.profile, { status: 'live', roles: { country: 'country_profile' } });

  const us = createState();
  us.company.country = 'US';
  const usResult = await runTool(us, 'country_profile', { date: '2026-03-31' });
  assert.equal(usResult.data.country, 'US');
  assert.equal(usResult.data.taxYear, '2026');
  assert.match(engineWords('country_profile')(usResult), /United States: USD, the calendar year starts on 1 January; 2026-03-31 falls in 2026\./);
  assert.equal(capabilityTool('US', 'profile', 'country'), 'country_profile');
  assert.equal(capabilityTool('US', 'income-tax', 'estimate'), '');
  assert.equal(Object.keys(countryCapabilities('MY'))[0], 'profile');
  assert.equal(manifestFor('my').country, 'MY');
  assert.equal(engineRun('nothing_here'), null);
  assert.equal(enginePreview('country_profile'), null);
  assert.deepEqual(runEngineTool('nothing_here', india), { ok: false, error: 'ENGINE_TOOL_NOT_BUILT', tool: 'nothing_here' });
  assert.match(previewOf(india, 'country_profile').summary, /Run country_profile/);
  for (const [name, roles] of Object.entries(CAPABILITIES)) assert.ok(roles.length > 0, name);
});

test('a country engine keeps its own data in one slice of the book, saved and restored with it', () => {
  const state = createState();
  assert.deepEqual(countrySlice(state, 'myReturns'), {});
  assert.deepEqual(state.countryData, {}, 'reading never writes');
  openCountrySlice(state, 'myReturns')['2026'] = { status: 'draft' };
  openCountrySlice(state, 'myInvoices', () => []).push('EINV-1');
  assert.deepEqual(countrySlice(state, 'myReturns'), { 2026: { status: 'draft' } });
  const restored = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(restored.countryData, { myReturns: { 2026: { status: 'draft' } }, myInvoices: ['EINV-1'] });
  assert.deepEqual(deserialize({ ...JSON.parse(JSON.stringify(serialize(state))), countryData: ['bad'] }).countryData, {});

  const book = newBook({ name: 'Client', country: 'US' });
  openCountrySlice(book, 'usThing').value = 1;
  assert.deepEqual(deserializeBook(JSON.parse(JSON.stringify(serializeBook(book)))).countryData, { usThing: { value: 1 } });

  const view = bookView(state, book);
  openCountrySlice(view, 'viaView').seen = true;
  assert.equal(book.countryData.viaView.seen, true, 'the view writes to the client book, not the firm');
  assert.equal(Object.hasOwn(state.countryData, 'viaView'), false);
  assert.throws(() => countrySlice(state, 'Bad-Name'), /BAD_SLICE_NAME/);
});

test('rule families from a manifest are reported by rules_status for that country only', () => {
  const families = rulesStatus({ company: { country: 'IN' } }, { asOf: '2026-11-11' }).data.families.map((family) => family.key);
  assert.ok(families.includes('gst'));
  assert.equal(rulesStatus({ company: { country: 'US' } }, { asOf: '2026-11-11' }).data.families.some((family) => family.key === 'gst'), false);
});

test('progressive tax is exact in minor units and rounds once', () => {
  const bands = [{ over: 0, rateBp: 0 }, { over: 500000, rateBp: 100 }, { over: 2000000, rateBp: 300 }];
  assert.deepEqual(bandProblems(bands), []);
  const none = progressiveTax(400000, bands);
  assert.equal(none.tax, 0);
  assert.equal(none.marginalRateBp, 0);
  const mid = progressiveTax(1234567, bands);
  assert.equal(mid.tax, 7346, '1% of 734,567 is 7,345.67');
  assert.equal(progressiveTax(1234567, bands, { rounding: 'down' }).tax, 7345);
  assert.equal(progressiveTax(1234567, bands, { rounding: 'up' }).tax, 7346);
  const top = progressiveTax(3000001, bands);
  assert.equal(top.tax, 45000, '15,000 on the middle band and 30,000.03 on the top, rounded once');
  assert.equal(top.marginalRateBp, 300);
  assert.deepEqual(top.bands.map((band) => band.taxable), [500000, 1500000, 1000001]);
  assert.equal(top.bands[2].upTo, null);
  assert.equal(progressiveTax(Number.MAX_SAFE_INTEGER, [{ over: 0, rateBp: 10000 }]).tax, Number.MAX_SAFE_INTEGER);
  assert.equal(flatTax(1005, 600).tax, 60);
  assert.equal(flatTax(1008, 600, { rounding: 'half-up' }).tax, 60);
  assert.equal(flatTax(1009, 600).tax, 61);
  assert.equal(progressiveTax(-1, bands).error, 'AMOUNT_NOT_WHOLE_MINOR_UNITS');
  assert.equal(progressiveTax(10.5, bands).error, 'AMOUNT_NOT_WHOLE_MINOR_UNITS');
  assert.equal(progressiveTax(10, bands, { rounding: 'bankers' }).error, 'BAD_ROUNDING');
  assert.deepEqual(progressiveTax(10, [{ over: 5, rateBp: 100 }]).problems, ['FIRST_BAND_STARTS_AT_ZERO']);
  assert.deepEqual(progressiveTax(10, [{ over: 0, rateBp: 100 }, { over: 0, rateBp: 200 }]).problems, ['BAND_1_NOT_ASCENDING']);
  assert.deepEqual(progressiveTax(10, [{ over: 0, rateBp: 10001 }]).problems, ['BAND_0_RATE_NOT_BASIS_POINTS']);
  assert.deepEqual(progressiveTax(10, []).problems, ['BANDS_REQUIRED']);
});

test('tax years and filing periods come from the pack, not from a hard-coded calendar', () => {
  assert.deepEqual(taxYearBounds(countryPack('GB'), '2026-27'), { label: '2026-27', from: '2026-04-06', to: '2027-04-05' });
  assert.deepEqual(taxYearBounds(countryPack('IN'), '2025-26'), { label: '2025-26', from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(taxYearBounds(countryPack('AU'), '2099-00'), { label: '2099-00', from: '2099-07-01', to: '2100-06-30' });
  assert.deepEqual(taxYearBounds(countryPack('MY'), '2026'), { label: '2026', from: '2026-01-01', to: '2026-12-31' });
  assert.equal(taxYearBounds(countryPack('MY'), '2026-27'), null);
  assert.equal(taxYearBounds(countryPack('GB'), '2026-28'), null);
  assert.equal(taxYearBounds(countryPack('GB'), '2026'), null);
  const year = taxYearBounds(countryPack('MY'), '2028');
  const twoMonthly = periodsBetween(year.from, year.to, 2);
  assert.equal(twoMonthly.length, 6);
  assert.deepEqual(twoMonthly[0], { index: 1, from: '2028-01-01', to: '2028-02-29' });
  assert.deepEqual(twoMonthly[5], { index: 6, from: '2028-11-01', to: '2028-12-31' });
  const quarters = periodsBetween('2026-04-06', '2027-04-05', 3);
  assert.deepEqual(quarters.map((period) => period.to), ['2026-07-05', '2026-10-05', '2027-01-05', '2027-04-05']);
  assert.equal(periodOf(quarters, '2026-10-05').index, 2);
  assert.equal(periodOf(quarters, '2026-10-06').index, 3);
  assert.equal(periodOf(quarters, '2027-04-06'), null);
  assert.equal(periodOf(quarters, 'soon'), null);
  assert.deepEqual(periodsBetween('2026-01-01', '2026-02-15', 1).map((period) => period.to), ['2026-01-31', '2026-02-15']);
  assert.deepEqual(periodsBetween('2026-01-31', '2026-12-31', 1), [], 'a period cannot start after the 28th');
  assert.deepEqual(periodsBetween('2026-02-30', '2026-12-31', 1), []);
  assert.deepEqual(periodsBetween('2026-06-01', '2026-01-01', 1), []);
  assert.deepEqual(periodsBetween('2026-01-01', '2026-12-31', 0), []);
});

test('check digit helpers', () => {
  assert.equal(luhnValid('79927398713'), true);
  assert.equal(luhnValid('79927398710'), false);
  assert.equal(luhnValid('7992739871a'), false);
  assert.equal(luhnValid('0'), false);
  assert.equal(weightedSum('123', [3, 2, 1]), 10);
  assert.equal(weightedSum('123', [3, 2]), null);
  assert.equal(weightedSum('12x', [3, 2, 1]), null);
  assert.equal(weightedRemainder('123', [3, 2, 1], 7), 3);
  assert.equal(weightedRemainder('123', [-3, -2, -1], 7), 4);
  assert.equal(weightedRemainder('123', [3, 2, 1], 1), null);
});

test('a return moves only along the allowed path and keeps its history', () => {
  const at = '2026-11-11T10:00:00Z';
  const draft = { id: 'r1', status: 'draft' };
  const ready = moveReturn(draft, 'ready', { at, by: 'owner-1' });
  assert.equal(ready.ok, true);
  assert.equal(draft.status, 'draft', 'the record passed in is not changed');
  assert.deepEqual(ready.record.history, [{ from: 'draft', to: 'ready', at, by: 'owner-1', note: '' }]);
  assert.deepEqual(moveReturn(draft, 'submitted', { at, by: 'owner-1' }), { ok: false, error: 'RETURN_MOVE_NOT_ALLOWED', from: 'draft', to: 'submitted', allowed: ['ready'] });
  const signed = moveReturn(ready.record, 'signed', { at, by: 'owner-1' }).record;
  const submitted = moveReturn(signed, 'submitted', { at, by: 'owner-1', note: 'filed in the portal' }).record;
  assert.equal(submitted.history.length, 3);
  assert.equal(returnLocked('submitted'), true);
  assert.equal(returnLocked('rejected'), false);
  const rejected = moveReturn(submitted, 'rejected', { at, by: 'authority' }).record;
  assert.deepEqual(nextStatuses(rejected.status), ['draft']);
  const accepted = moveReturn(submitted, 'accepted', { at, by: 'authority' }).record;
  assert.deepEqual(nextStatuses(accepted.status), []);
  assert.equal(moveReturn(accepted, 'draft', { at, by: 'owner-1' }).error, 'RETURN_MOVE_NOT_ALLOWED');
  assert.equal(moveReturn(draft, 'ready', { by: 'owner-1' }).error, 'MOVE_NEEDS_TIME');
  assert.equal(moveReturn(draft, 'ready', { at }).error, 'MOVE_NEEDS_ACTOR');
  assert.equal(moveReturn(draft, 'lodged', { at, by: 'owner-1' }).error, 'UNKNOWN_RETURN_STATUS');
  assert.equal(moveReturn({ id: 'r2' }, 'ready', { at, by: 'owner-1' }).record.status, 'ready', 'a record with no status starts as a draft');
});

test('a ready-made package reaches an engine through a named port', () => {
  assert.equal(hasPort('tax-id-check'), false);
  assert.throws(() => port('tax-id-check'), /PORT_NOT_PROVIDED:tax-id-check/);
  assert.equal(portOr('tax-id-check', null), null);
  const checker = { validate: (value) => value === 'ok' };
  providePort('tax-id-check', checker);
  assert.equal(port('tax-id-check').validate('ok'), true);
  assert.equal(portOr('tax-id-check', null), checker);
  providePort('tax-id-check', null);
  assert.equal(hasPort('tax-id-check'), false);
  assert.throws(() => providePort('Tax Id', checker), /BAD_PORT_NAME/);
});

test('India is not served from Singapore, and every pack names its languages and its tax', () => {
  assert.equal(regionServes(countryPack('IN'), 'asia-southeast1'), false);
  assert.equal(regionServes(countryPack('IN'), 'asia-south2'), true);
  for (const pack of PACKS) {
    assert.ok(pack.languages.length >= 1, pack.code);
    assert.ok(pack.taxName, pack.code);
  }
  assert.deepEqual(countryPack('MY').languages, ['en', 'ms']);
  assert.equal(countryPack('MY').status, 'planned');
  assert.match(packProblems([{ ...countryPack('MY'), languages: [] }]).join('\n'), /languages must list at least one/);
  assert.match(packProblems([{ ...countryPack('MY'), taxName: '' }]).join('\n'), /taxName must name/);
});

test('one command adds a country: a planned pack, an empty engine, a research file, and the three registrations', async () => {
  const { mkdtempSync, cpSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { scaffoldCountry, planCountry, readOptions, registerIn } = await import('../../scripts/new-country.mjs');
  const root = mkdtempSync(join(tmpdir(), 'myca-new-country-'));
  try {
    cpSync(COUNTRIES_DIR, join(root, 'platform', 'src', 'countries'), { recursive: true });
    const options = readOptions(['--code', 'sg', '--name', 'Singapore', '--currency', 'SGD', '--symbol', 'S$', '--locale', 'en-SG', '--languages', 'en,zh,ms,ta', '--minor-unit', 'cents', '--tax-id', 'UEN', '--tax-name', 'GST', '--time-zone', 'Asia/Singapore']).options;
    const dry = scaffoldCountry({ ...options, 'dry-run': true }, { root, now: new Date('2026-11-11T00:00:00Z') });
    assert.deepEqual(dry.written, []);
    assert.equal(existsSync(join(root, 'platform/src/countries/singapore.mjs')), false);

    const done = scaffoldCountry(options, { root, now: new Date('2026-11-11T00:00:00Z') });
    assert.equal(done.ok, true);
    assert.equal(done.written.length, 7);
    const registry = await import(`file://${join(root, 'platform/src/countries/index.mjs')}`);
    const manifests = await import(`file://${join(root, 'platform/src/countries/manifests.mjs')}`);
    const pack = registry.countryPack('SG');
    assert.equal(pack.status, 'planned');
    assert.equal(pack.app.androidId, 'com.mldynamic.myca.sg');
    assert.deepEqual(pack.languages, ['en', 'zh', 'ms', 'ta']);
    assert.equal(pack.yearStartMonth, 1);
    assert.deepEqual(registry.packProblems(), []);
    assert.deepEqual(manifests.manifestProblems(manifests.MANIFESTS, registry.PACKS.map((each) => each.code)), []);
    assert.equal(manifests.manifestFor('SG').tools.length, 0);
    const engines = readFileSync(join(root, 'platform/src/countries/engines.mjs'), 'utf8');
    assert.match(engines, /import \{ ENGINE as SINGAPORE \} from '\.\/singapore\/engine\.mjs';/);
    assert.match(engines, /[A-Z_]+,\n {4}SINGAPORE,\n {2}\];/);
    const knowledge = readFileSync(join(root, 'platform/src/countries/knowledge/sg.md'), 'utf8');
    assert.match(knowledge, /checked: 2026-11-11\nrecheck-by: 2027-02-09/);
    assert.doesNotMatch(knowledge, /Source:/, 'the research file starts without a source, so the suite stays red until someone researches');

    assert.match(scaffoldCountry(options, { root }).error, /Already there/);
    assert.equal(registerIn(engines, { importLine: 'import { ENGINE as SINGAPORE } from \'./singapore/engine.mjs\';', list: '  return [', entry: 'SINGAPORE' }).error, 'ALREADY_REGISTERED');
    assert.equal(registerIn('const nothing = 1;\n', { importLine: 'import x from \'./x.mjs\';', list: '  return [', entry: 'X' }).error, 'REGISTRY_SHAPE_CHANGED');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.match(planCountry({ code: 'SGP', name: 'Singapore', currency: 'SGD', symbol: 'S$', locale: 'en-SG', languages: 'en', 'minor-unit': 'cents', 'tax-id': 'UEN', 'tax-name': 'GST', 'time-zone': 'Asia/Singapore' }).error, /two-letter code/);
  assert.match(planCountry({ code: 'SG', name: 'Singapore', currency: 'SGD', symbol: 'S$', locale: 'en-SG', languages: 'en', 'minor-unit': 'cents', 'tax-id': 'UEN', 'tax-name': 'GST', 'time-zone': 'Asia/Singapore', 'year-start': '02-30' }).error, /MM-DD/);
  assert.match(planCountry({ code: 'SG' }).error, /Missing: --name/);
  assert.match(readOptions(['SG']).error, /did not expect/);
  assert.match(readOptions(['--code']).error, /needs a value/);
  const fiscal = planCountry({ code: 'NZ', name: 'New Zealand', currency: 'NZD', symbol: '$', locale: 'en-NZ', languages: 'en,mi', 'minor-unit': 'cents', 'tax-id': 'IRD', 'tax-name': 'GST', 'time-zone': 'Pacific/Auckland', 'year-start': '04-01', today: '2026-11-11', recheckBy: '2027-02-09' });
  assert.equal(fiscal.slug, 'new-zealand');
  assert.match(fiscal.files['platform/src/countries/new-zealand.mjs'], /export const NEW_ZEALAND = planned\(\{[\s\S]*yearStartMonth: 4, yearStartDay: 1, yearLabel: 'financial year'/);
});

test('the ready-made catalogue is complete, and copyleft code is never embedded', () => {
  assert.deepEqual(readyMadeProblems(), []);
  assert.ok(readyMadeFor('e-invoice', 'MY').some((item) => item.id === 'myinvois-sdk'));
  assert.ok(readyMadeFor('formatting', 'MY').some((item) => item.id === 'intl'), 'an entry for every country serves each one');
  assert.equal(readyMadeFor('formatting').some((item) => item.decision === 'reject'), false);
  assert.equal(readyMadeFor('filing', 'US').some((item) => item.id === 'quicko-sandbox'), false);
  const policy = READY_MADE.find((item) => item.id === 'policyengine');
  assert.match(readyMadeProblems([{ ...policy, decision: 'candidate', port: 'tax' }]).join('\n'), /never embedded/);
  const stdnum = READY_MADE.find((item) => item.id === 'stdnum');
  assert.match(readyMadeProblems([{ ...stdnum, port: undefined }]).join('\n'), /through a port/);
  assert.match(readyMadeProblems([{ ...stdnum, decision: 'in-use' }]).join('\n'), /platform\/ takes no packages/);
  assert.match(readyMadeProblems([stdnum, stdnum]).join('\n'), /listed twice/);
  assert.match(readyMadeProblems([{ ...stdnum, url: 'http://example.com', why: 'short', need: 'magic' }]).join('\n'), /https link[\s\S]*say why|need is one of/);
});

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('a manifest declares the government calls a country makes, each with the hosts it may reach', () => {
  const action = { id: 'my_portal_send', access: 'write', irreversible: true, hosts: { live: ['api.example.gov.my'], test: ['test.example.gov.my'] } };
  const withAction = (patch) => manifestProblems([{ ...FIXTURE, externalActions: [{ ...action, ...patch }] }], ['MY']).join('\n');
  assert.equal(withAction({}), '');
  assert.match(withAction({ id: 'Portal-Send' }), /external action id is lower case/);
  assert.match(withAction({ access: 'send' }), /access is read or write/);
  assert.match(withAction({ access: 'read' }), /only a write can be irreversible/);
  assert.match(withAction({ hosts: { live: [], test: [] } }), /name the live host/);
  assert.match(withAction({ hosts: { live: ['https://api.example.gov.my/v1'] } }), /not a bare host name/);
  assert.match(withAction({ hosts: { live: ['api.example.gov.my'], test: ['api.example.gov.my'] } }), /test host cannot also be the live host/);
  assert.match(withAction({ timeoutSeconds: 0 }), /timeoutSeconds is a whole number/);
  assert.match(manifestProblems([{ ...FIXTURE, externalActions: [action, action] }], ['MY']).join('\n'), /already has this external action/);
  const tables = engineTables([{ ...FIXTURE, externalActions: [action] }]);
  assert.deepEqual(tables.externalActions, [{ id: 'my_portal_send', access: 'write', irreversible: true, timeoutSeconds: 60, hosts: { live: ['api.example.gov.my'], test: ['test.example.gov.my'] }, country: 'MY' }]);
  for (const id of Object.keys(ENGINE_ACTION_CLASSES)) assert.equal(Object.hasOwn(ACTION_CLASSES, id), false, `${id} is already a core action`);
  assert.equal(externalActionClass('myinvois_submit').family, ENGINE_ACTION_FAMILY);
  assert.equal(externalActionClass('myinvois_submit').irreversible, true);
  assert.equal(externalActionClass('myinvois_status').actionClass, 'read');
  assert.equal(externalActionClass('nic_irn_generate').family, 'nic');
  assert.equal(externalActionClass('toString'), null);
});

test('a country engine reaches its government host only through the gate, and only the host for the current mode', async () => {
  const realClient = getChannelClient();
  const calls = [];
  setChannelClient(new ChannelClient({
    fetchFn: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect, hasSignal: Boolean(init.signal) });
      return { ok: true, status: 200, json: async () => ({ status: 'Valid' }) };
    },
  }));
  const actor = { userId: 'owner-1', role: 'owner' };
  const TEST_URL = 'https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documents/ABC/details';
  const send = async (transports, path) => {
    const response = await transports.https.request(typeof path === 'string' ? path : TEST_URL, { method: 'GET' });
    return { ok: response.ok, data: await response.json() };
  };
  try {
    const off = createState();
    const held = await withEnv({ MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0' }, () => performExternalAction(off, { actionId: 'myinvois_status', actor, params: { uuid: 'ABC' } }, send));
    assert.equal(held.error, 'LIVE_CALLS_DISABLED');
    assert.equal(off.dryRuns.length, 1);
    assert.equal(calls.length, 0, 'nothing leaves while calls are switched off');

    const state = createState();
    const read = await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_status', actor, params: { uuid: 'ABC' } }, send));
    assert.deepEqual(read, { ok: true, data: { status: 'Valid' } });
    assert.deepEqual(calls, [{ url: 'https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documents/ABC/details', method: 'GET', redirect: 'error', hasSignal: true }]);
    assert.equal(state.auditEvents.at(-1).action, 'external.myinvois_status');

    const wrongHost = await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_status', actor, params: {} }, (transports) => send(transports, 'https://api.myinvois.hasil.gov.my/api/v1.0/documents/ABC/details')));
    assert.match(wrongHost.error, /ENGINE_HOST_NOT_ALLOWED:api\.myinvois\.hasil\.gov\.my/, 'test mode never reaches the live host');
    const elsewhere = await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_status', actor, params: {} }, (transports) => send(transports, 'https://preprod-api.myinvois.hasil.gov.my.example.com/x')));
    assert.match(elsewhere.error, /ENGINE_HOST_NOT_ALLOWED/);
    for (const bad of ['http://preprod-api.myinvois.hasil.gov.my/x', 'https://preprod-api.myinvois.hasil.gov.my:8443/x', 'https://user:pw@preprod-api.myinvois.hasil.gov.my/x']) {
      const refused = await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_status', actor, params: {} }, (transports) => send(transports, bad)));
      assert.equal(refused.error, 'ENGINE_URL_NOT_PLAIN_HTTPS', bad);
    }
    assert.equal(calls.length, 1);
    assert.equal(Object.keys((await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_status', actor, params: {} }, async (transports) => ({ ok: true, groups: Object.keys(transports) })))).groups).length, 1, 'the engine gets the https transport and nothing else');

    const assistant = await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, { actionId: 'myinvois_submit', actor: { userId: 'assistant' }, params: {} }, send));
    assert.equal(assistant.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');

    const live = createState();
    const params = { documents: 1 };
    const liveSend = (transports) => send(transports, 'https://api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions');
    const unapproved = await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, () => performExternalAction(live, { actionId: 'myinvois_submit', actor, params }, liveSend));
    assert.equal(unapproved.error, 'APPROVAL_REQUIRED', 'a live write waits for a second person');
    assert.equal(calls.length, 1);
    const asked = requestApproval(live, { operationId: 'myinvois_submit', clientId: 'SELF', params, actor: { userId: 'owner-1', role: 'staff' } });
    decideApproval(live, { approvalId: asked.approval.approvalId, decision: 'approve', actor: { userId: 'partner-1', role: 'partner' } });
    const sent = await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, () => performExternalAction(live, { actionId: 'myinvois_submit', actor, params }, liveSend));
    assert.equal(sent.ok, true);
    assert.equal(calls.at(-1).url, 'https://api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions');
    const liveToTest = await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, () => performExternalAction(live, { actionId: 'myinvois_status', actor, params: {} }, send));
    assert.match(liveToTest.error, /ENGINE_HOST_NOT_ALLOWED:preprod-api/, 'live mode never reaches the test host');
  } finally {
    setChannelClient(realClient);
  }
});
