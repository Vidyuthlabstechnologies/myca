import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-itrkb-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { rules } from '../src/sprint-load.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { ITR_FORMS, ITR_KNOWLEDGE_DIR, catalog, itrGuidanceSections, itrKnowledgeWords, loadGuides, loadItrForm, searchItrKnowledge } from '../src/itr-knowledge.mjs';
import { checkItrJson, validateAgainstSchema } from '../src/itr-json-check.mjs';
import { askTax, taxPrompt, ungroundedFigures } from '../src/tax-assistant.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/itr/subject-a-itr2.json', import.meta.url), 'utf8'));
const copy = (value) => JSON.parse(JSON.stringify(value));

test('every form has its schema, rules, fields and utility, with the rule counts of the CBDT documents', () => {
  const expected = {
    'ITR-1': { A: 279, B: 8, D: 4 },
    'ITR-2': { A: 724, 'B/D': 23 },
    'ITR-3': { A: 1032, B: 33, D: 18 },
    'ITR-4': { A: 352, B: 7, D: 4 },
    'ITR-5': { A: 865, 'B/D': 52 },
    'ITR-6': { A: 877, B: 16, D: 25 },
  };
  for (const form of ITR_FORMS) {
    const rulesDoc = loadItrForm(form, 'rules');
    const counts = {};
    for (const rule of rulesDoc.rules) {
      counts[rule.category] = (counts[rule.category] || 0) + 1;
      assert.ok(rule.text.length >= 10, `${rule.id} has text`);
      assert.match(rule.id, new RegExp(`^${form}-(A|B|D|BD)-\\d+$`));
    }
    assert.deepEqual(counts, expected[form], form);
    const ids = rulesDoc.rules.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length, `${form} rule ids are unique`);
    const schema = loadItrForm(form, 'schema');
    assert.ok(schema.definitions[`ITR${form.slice(4)}`] || schema.properties.ITR, form);
    const fields = loadItrForm(form, 'fields');
    assert.ok(fields.count > 500 && fields.fields.every((field) => field.path === 'ITR' || field.path.startsWith(`ITR.ITR${form.slice(4)}`)), form);
    const utility = loadItrForm(form, 'utility');
    assert.ok(utility.sheets.length >= 15, form);
  }
  // the only gap is the one in the source: ITR-5 jumps from rule 643 to 665
  assert.deepEqual(loadItrForm('ITR-5', 'rules').numbersNotInSource, { A: Array.from({ length: 21 }, (_, i) => 644 + i) });
  assert.ok(loadItrForm('ITR-3', 'rules').auditCrossChecks.length > 50);
  assert.ok(loadItrForm('ITR-1', 'fields').guide.entries.length >= 70);
  assert.ok(loadItrForm('ITR-2', 'fields').guide.entries.length >= 30);
});

test('every guide and data file cites a source in the catalogue, and nothing secret or personal is kept', () => {
  const ids = new Set(catalog().sources.map((source) => source.id));
  assert.equal(ids.size, catalog().sources.length);
  for (const form of ITR_FORMS) {
    for (const part of ['rules', 'fields', 'utility']) assert.ok(ids.has(loadItrForm(form, part).source), `${form} ${part}`);
  }
  const docs = readdirSync(join(ITR_KNOWLEDGE_DIR, 'docs')).filter((name) => name.endsWith('.md'));
  assert.ok(docs.length >= 10);
  for (const name of docs) {
    const text = readFileSync(join(ITR_KNOWLEDGE_DIR, 'docs', name), 'utf8');
    const source = /^source: (.+)$/m.exec(text)?.[1] || '';
    assert.ok([...ids].some((id) => source.includes(id)), `${name} cites a catalogued source`);
  }
  const everything = ITR_FORMS.map((form) => readFileSync(join(ITR_KNOWLEDGE_DIR, 'forms', form.toLowerCase(), 'utility.json'), 'utf8')).join('\n');
  assert.doesNotMatch(everything, /infyxl|7Z3mxcln|HashIteration/i);
  const fixture = JSON.stringify(FIXTURE);
  assert.doesNotMatch(fixture, /RAHEJA|INDUSIND|Tryon|sD0hEp/i);
  assert.equal(FIXTURE.ITR.ITR2.PartA_GEN1.PersonalInfo.PAN, 'ABCPE1234F');
});

test('search finds a rule by number, a rule by its words, and the guide for a topic', () => {
  const byNumber = searchItrKnowledge('ITR-3 rule 46', { limit: 3 });
  assert.equal(byNumber[0].ref, 'ITR-3-A-46');
  assert.match(byNumber[0].text, /44AB/);
  assert.match(byNumber[0].source, /ITR 3 Validation Rules for AY 2025-26, page \d+/);
  const byWords = searchItrKnowledge('why was my ITR-1 rejected for name mismatch with PAN', { limit: 5 });
  assert.ok(byWords.some((hit) => hit.ref === 'ITR-1-A-19'));
  assert.ok(byWords.every((hit) => !hit.form || hit.form === 'ITR-1'));
  const topic = searchItrKnowledge('form 16 vs ais TDS mismatch', { limit: 3 });
  assert.match(topic[0].ref, /^form16-vs-ais/);
  const codes = searchItrKnowledge('nature of business code software development 44ADA', { limit: 5 });
  assert.ok(codes.some((hit) => /14001 - Software development/.test(hit.text)));
  assert.equal(searchItrKnowledge('zzzz qqqq').length, 0);
});

test('itr_knowledge looks up a rule, a field or a topic, and says what it needs', async () => {
  const state = createState();
  const rule = await runTool(state, 'itr_knowledge', { form: 'itr 1', rule: 'A-1' });
  assert.equal(rule.ok, true);
  assert.equal(rule.data.hits[0].id, 'ITR-1-A-1');
  assert.match(rule.data.hits[0].text, /80C, 80CCC & 80CCD \(1\)/);
  assert.match(rule.data.hits[0].action, /cannot be uploaded/);
  const field = await runTool(state, 'itr_knowledge', { form: 'ITR-1', field: 'GrossSalary' });
  assert.equal(field.ok, true);
  assert.ok(field.data.hits.some((hit) => hit.path === 'ITR.ITR1.ITR1_IncomeDeductions.GrossSalary'));
  assert.ok(field.data.hits.some((hit) => /Primary source/.test(hit.text)));
  const enumField = await runTool(state, 'itr_knowledge', { form: 'ITR-1', field: 'ReturnFileSec' });
  assert.ok(enumField.data.hits.some((hit) => (hit.field?.enum || []).includes(11)));
  assert.equal((await runTool(state, 'itr_knowledge', { rule: '46' })).error, 'ITR_FORM_REQUIRED');
  assert.equal((await runTool(state, 'itr_knowledge', { form: 'ITR-9', query: 'x' })).error, 'ITR_FORM_UNKNOWN');
  assert.equal((await runTool(state, 'itr_knowledge', { form: 'ITR-4', rule: '999' })).error, 'ITR_RULE_NOT_FOUND');
  const summary = await runTool(state, 'itr_knowledge', {});
  assert.equal(summary.data.summary.forms.length, 6);
  assert.match(itrKnowledgeWords(summary.data), /ITR-3: 1083 validation rules, 59 tax audit cross-checks/);
  const topic = await runTool(state, 'itr_knowledge', { query: 'job change two form 16' });
  assert.match(itrKnowledgeWords(topic.data), /Source: /);
});

test('check_itr_json passes the sample return and names each schema error', async () => {
  const state = createState();
  const clean = await runTool(state, 'check_itr_json', { json: JSON.stringify(FIXTURE) });
  assert.equal(clean.ok, true);
  assert.equal(clean.data.form, 'ITR-2');
  assert.deepEqual(clean.data.errors, []);
  assert.equal(clean.data.valid, true);
  assert.equal(clean.data.remindersBAndD.length, 23);

  const broken = copy(FIXTURE);
  broken.ITR.ITR2.PartA_GEN1.PersonalInfo.PAN = 'ABC123';
  delete broken.ITR.ITR2.PartA_GEN1.PersonalInfo.DOB;
  broken.ITR.ITR2.ScheduleS.Salaries[0].Salarys.GrossSalary = '7513837';
  broken.ITR.ITR2.PartA_GEN1.FilingStatus.ResidentialStatus = 'XYZ';
  broken.ITR.ITR2.Unknown = 1;
  const result = checkItrJson(state, { json: broken });
  assert.equal(result.data.valid, false);
  const byPath = Object.fromEntries(result.data.errors.map((error) => [error.path, error.code]));
  assert.equal(byPath['ITR.ITR2.PartA_GEN1.PersonalInfo.PAN'], 'PATTERN');
  assert.equal(byPath['ITR.ITR2.PartA_GEN1.PersonalInfo.DOB'], 'REQUIRED');
  assert.equal(byPath['ITR.ITR2.ScheduleS.Salaries[0].Salarys.GrossSalary'], 'TYPE');
  assert.equal(byPath['ITR.ITR2.PartA_GEN1.FilingStatus.ResidentialStatus'], 'ENUM');
  assert.equal(byPath['ITR.ITR2.Unknown'], 'NOT_ALLOWED');
  const words = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'check_itr_json', { json: JSON.stringify(broken) }));
  assert.equal(words.data.errors.length, 5);

  assert.equal(checkItrJson(state, { json: '{not json' }).error, 'ITR_JSON_UNREADABLE');
  assert.equal(checkItrJson(state, { json: '{"hello": 1}' }).error, 'ITR_FORM_NOT_FOUND');
  assert.equal(checkItrJson(state, { json: FIXTURE, form: 'ITR-1' }).error, 'ITR_FORM_MISMATCH');
  assert.equal(checkItrJson(state, {}).error, 'ITR_JSON_REQUIRED');
});

test('the schema checker follows refs, allOf, exclusive limits and array bounds', () => {
  const schema = {
    properties: { ITR: { $ref: '#/definitions/Root' } },
    definitions: {
      Root: { type: 'object', additionalProperties: false, required: ['amount', 'list'], properties: { amount: { allOf: [{ $ref: '#/definitions/Money' }] }, list: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 3 } } } },
      Money: { type: 'integer', minimum: 0, exclusiveMinimum: true, maximum: 100 },
    },
  };
  assert.deepEqual(validateAgainstSchema(schema, { ITR: { amount: 5, list: ['a'] } }).errors, []);
  const codes = validateAgainstSchema(schema, { ITR: { amount: 0, list: ['abcd', 'b', 'c'] } }).errors.map((error) => error.code).sort();
  assert.deepEqual(codes, ['MAX_ITEMS', 'MAX_LENGTH', 'MINIMUM']);
});

test('the FY 2026-27 regime guide agrees with MyCA\'s dated rules for that year', () => {
  const text = readFileSync(join(ITR_KNOWLEDGE_DIR, 'docs', 'regime-fy-2026-27.md'), 'utf8');
  const onDate = '2026-04-01';
  const inr = (paise) => `₹${new Intl.NumberFormat('en-IN').format(paise / 100)}`;
  const slabs = rules.rule('income-tax.new-regime.slabs', onDate).value;
  for (const slab of slabs) {
    if (slab.toPaise !== null) assert.ok(text.includes(inr(slab.toPaise)), `new regime slab edge ${inr(slab.toPaise)}`);
    assert.ok(text.includes(slab.ratePercent === 0 ? 'Nil' : `${slab.ratePercent}%`));
  }
  const oldSlabs = rules.rule('income-tax.old-regime.slabs.below-60', onDate).value;
  for (const slab of oldSlabs) if (slab.toPaise !== null) assert.ok(text.includes(inr(slab.toPaise)), `old regime slab edge ${inr(slab.toPaise)}`);
  assert.ok(text.includes(`| Standard deduction for salary or pension | ${inr(rules.rule('income-tax.old-regime.standard-deduction', onDate).value.maxPaise)} | ${inr(rules.rule('income-tax.new-regime.standard-deduction', onDate).value.maxPaise)} |`));
  assert.ok(text.includes(`Up to ${inr(rules.rule('income-tax.deduction.80c.cap', onDate).value.maxPaise)}`));
  const newRebate = rules.rule('income-tax.new-regime.rebate', onDate).value;
  const oldRebate = rules.rule('income-tax.old-regime.rebate', onDate).value;
  assert.ok(text.includes(`| Total income up to | ${inr(oldRebate.maxTotalIncomePaise)} | ${inr(newRebate.maxTotalIncomePaise)} |`));
  assert.ok(text.includes(`| Maximum rebate | ${inr(oldRebate.maxRebatePaise)} | ${inr(newRebate.maxRebatePaise)} |`));
});

test('ask_tax answers ITR questions from the knowledge base and keeps the figure check', async () => {
  const sections = itrGuidanceSections('Why would my ITR-1 be rejected for a name mismatch with PAN?');
  assert.ok(sections.some((section) => section.ref === 'itr-knowledge/ITR-1-A-19'));
  assert.deepEqual(itrGuidanceSections('what is the weather today'), []);
  const result = await withEnv({ MYCA_MOCK_MODE: '1' }, () => askTax(createState(), { question: 'Why would my ITR-1 be rejected for a name mismatch with PAN?', asOf: '2026-11-09' }));
  assert.equal(result.ok, true);
  assert.ok(result.sections.some((section) => section.module === 'itr-knowledge'));
  const prompt = taxPrompt('job change two form 16 tds', itrGuidanceSections('job change two form 16 tds'), '2026-11-09');
  assert.match(prompt.systemPrompt, /itr_knowledge/);
  assert.match(prompt.prompt, /\[itr-knowledge\/form16-vs-ais/);
  assert.deepEqual(ungroundedFigures('Add both Form 16s [itr-knowledge/form16-vs-ais#scenario-4-job-change-during-the-year-two-form-16s].', prompt.context), []);
  const reply = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(createState(), 'tax question: what happens if AIS shows less TDS than my Form 16?'));
  assert.match(reply.reply, /form16-vs-ais/);
});

test('the ITR tools are read-only, declared for chat, and open to the Android app', () => {
  for (const name of ['itr_knowledge', 'check_itr_json']) {
    assert.ok(TOOLS.some((tool) => tool.name === name), name);
    assert.ok(REMOTE_QUERY_TOOLS.has(name), name);
  }
  assert.equal(validateAssistantToolCall('itr_knowledge', { form: 'ITR-3', rule: 'A-46' }).ok, true);
  assert.equal(validateAssistantToolCall('itr_knowledge', { kind: 'nope' }).ok, false);
  assert.equal(validateAssistantToolCall('check_itr_json', { json: '{"ITR":{}}' }).ok, true);
  assert.equal(validateAssistantToolCall('check_itr_json', {}).ok, false);
  assert.ok(loadGuides().length >= 40);
});
