import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES as TDS_RULES } from '../src/rules/tds.mjs';
import { RULES, rule, validateRules, runGolden, isIsoDate } from '../src/index.mjs';

const fetchCalls = [];
globalThis.fetch = (...args) => {
  fetchCalls.push(args);
  throw new Error('network is not allowed in statutory-rules tests');
};

const goldenUrl = new URL('../golden/tds.json', import.meta.url);

const EXPECTED_IDS = [
  'tds.194A.rate',
  'tds.194A.threshold.bank-coop-post-office.other-payee',
  'tds.194A.threshold.bank-coop-post-office.senior-citizen',
  'tds.194A.threshold.other-payer',
  'tds.194C.rate.individual-huf',
  'tds.194C.rate.other-payee',
  'tds.194C.threshold.aggregate',
  'tds.194C.threshold.single-sum',
  'tds.194I.rate.land-building-furniture-fittings',
  'tds.194I.rate.plant-machinery-equipment',
  'tds.194I.threshold',
  'tds.194J.rate.other',
  'tds.194J.rate.technical-film-royalty-call-centre',
  'tds.194J.threshold.director-remuneration',
  'tds.194J.threshold.per-category'
];

const RECORD_KEYS = new Set(['id', 'value', 'basis', 'effectiveFrom', 'effectiveTo', 'act', 'section', 'source', 'attestations']);
const REQUIRED_KEYS = ['id', 'value', 'effectiveFrom', 'effectiveTo', 'act', 'section', 'source', 'attestations'];
const THRESHOLD_BASES = new Set([
  'aggregate_per_payee_per_financial_year',
  'aggregate_per_payee_per_category_per_financial_year',
  'single_sum_credited_or_paid',
  'per_payee_per_month_or_part_of_month',
  'no_threshold'
]);
const COVERED_DATES = ['2024-04-01', '2025-03-31', '2025-04-01', '2026-03-31', '2026-04-01', '2027-03-31'];
const OLD_ACT_LAST_DAY = '2026-03-31';
const NEW_ACT_FIRST_DAY = '2026-04-01';

function label(record) {
  return `${record.id}@${record.effectiveFrom}`;
}

function lookup(input) {
  const result = rule(input.id, input.onDate);
  if (!result.ok) return { error: result.error };
  return {
    value: structuredClone(result.record.value),
    basis: result.record.basis ?? null,
    act: result.record.act,
    section: result.record.section
  };
}

test('the TDS records pass integrity on their own: shape, unique versions, no overlaps, no gaps', () => {
  assert.ok(Array.isArray(TDS_RULES));
  const result = validateRules(TDS_RULES);
  assert.deepEqual(result.problems, [], JSON.stringify(result.problems, null, 2));
});

test('the TDS rule set is exactly the sections 194A, 194C, 194-I and 194J rules this slice owns', () => {
  const ids = [...new Set(TDS_RULES.map((record) => record.id))].sort();
  assert.deepEqual(ids, EXPECTED_IDS);
});

test('every TDS record carries only the record keys, a source, an act and no attestations until the advisor signs', () => {
  for (const record of TDS_RULES) {
    for (const key of Object.keys(record)) assert.ok(RECORD_KEYS.has(key), `${label(record)} has unknown key ${key}`);
    for (const key of REQUIRED_KEYS) assert.ok(Object.hasOwn(record, key), `${label(record)} lacks ${key}`);
    assert.ok(record.act === 'IT-1961' || record.act === 'IT-2025', label(record));
    assert.ok(typeof record.section === 'string' && record.section.trim() !== '', label(record));
    assert.ok(typeof record.source === 'string' && record.source.trim().length >= 40, label(record));
    assert.deepEqual(record.attestations, [], label(record));
  }
});

test('thresholds are non-negative integer paise with a known basis and rates are integer basis points without one', () => {
  for (const record of TDS_RULES) {
    if (record.id.includes('.threshold')) {
      assert.deepEqual(Object.keys(record.value), ['amountPaise'], label(record));
      assert.ok(Number.isSafeInteger(record.value.amountPaise) && record.value.amountPaise >= 0, label(record));
      assert.equal(record.value.amountPaise % 100, 0, `${label(record)} thresholds are whole rupees`);
      assert.ok(THRESHOLD_BASES.has(record.basis), `${label(record)} basis ${record.basis}`);
    } else {
      assert.ok(record.id.includes('.rate'), label(record));
      assert.deepEqual(Object.keys(record.value), ['basisPoints'], label(record));
      assert.ok(Number.isSafeInteger(record.value.basisPoints) && record.value.basisPoints > 0 && record.value.basisPoints <= 10000, label(record));
      assert.equal(Object.hasOwn(record, 'basis'), false, label(record));
    }
  }
});

test('a nil threshold is used only where the law sets none', () => {
  const nil = TDS_RULES.filter((record) => record.id.includes('.threshold') && (record.value.amountPaise === 0 || record.basis === 'no_threshold'));
  for (const record of nil) {
    assert.equal(record.id, 'tds.194J.threshold.director-remuneration', label(record));
    assert.equal(record.value.amountPaise, 0, label(record));
    assert.equal(record.basis, 'no_threshold', label(record));
  }
  assert.ok(nil.length > 0);
});

test('Income-tax Act 1961 records end by 31 March 2026 and Income-tax Act 2025 records start on 1 April 2026 under section 393', () => {
  for (const record of TDS_RULES) {
    assert.ok(isIsoDate(record.effectiveFrom), label(record));
    if (record.act === 'IT-1961') {
      assert.ok(record.effectiveTo !== null && record.effectiveTo <= OLD_ACT_LAST_DAY, label(record));
      assert.ok(record.section.startsWith('194'), label(record));
    } else {
      assert.ok(record.effectiveFrom >= NEW_ACT_FIRST_DAY, label(record));
      assert.match(record.section, /^393\(1\) Table Sl\. No\. \d\((i|ii|iii)\)/, label(record));
    }
  }
});

test('every TDS rule is in force from FY 2024-25 through FY 2026-27 and not before 1 April 2024', () => {
  for (const id of EXPECTED_IDS) {
    for (const onDate of COVERED_DATES) assert.equal(rule(id, onDate).ok, true, `${id} on ${onDate}`);
    assert.deepEqual(rule(id, '2024-03-31'), { ok: false, error: 'RULE_NOT_IN_FORCE', id, onDate: '2024-03-31' });
    assert.equal(rule(id, NEW_ACT_FIRST_DAY).record.act, 'IT-2025', id);
    assert.equal(rule(id, OLD_ACT_LAST_DAY).record.act, 'IT-1961', id);
  }
});

test('the section 194A rates in force come from the Finance Act of each year and are not carried past FY 2026-27', () => {
  assert.deepEqual(rule('tds.194A.rate', '2027-04-01'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: 'tds.194A.rate', onDate: '2027-04-01' });
  const versions = TDS_RULES.filter((record) => record.id === 'tds.194A.rate').map((record) => [record.effectiveFrom, record.effectiveTo]).sort();
  assert.deepEqual(versions, [['2024-04-01', '2025-03-31'], ['2025-04-01', '2026-03-31'], ['2026-04-01', '2027-03-31']]);
});

test('the registry serves every TDS record unchanged', () => {
  const registered = new Map(RULES.map((record) => [label(record), record]));
  for (const record of TDS_RULES) {
    assert.ok(registered.has(label(record)), label(record));
    assert.deepEqual(registered.get(label(record)), record);
  }
});

test('golden TDS cases pass against the registry', async () => {
  const result = await runGolden(goldenUrl, lookup);
  assert.deepEqual(result.failures, [], JSON.stringify(result.failures, null, 2));
  assert.equal(result.ok, true);
  assert.ok(result.total >= EXPECTED_IDS.length * 3);
});

test('the golden cases exercise every TDS rule in FY 2024-25, FY 2025-26 and FY 2026-27', () => {
  const cases = JSON.parse(readFileSync(goldenUrl, 'utf8'));
  assert.ok(Array.isArray(cases));
  const covered = new Set(cases.filter((goldenCase) => !Object.hasOwn(goldenCase.expected, 'error')).map((goldenCase) => {
    const { id, onDate } = goldenCase.input;
    const fy = onDate < '2025-04-01' ? '2024-25' : onDate < '2026-04-01' ? '2025-26' : '2026-27';
    return `${id}|${fy}`;
  }));
  for (const id of EXPECTED_IDS) {
    for (const fy of ['2024-25', '2025-26', '2026-27']) assert.ok(covered.has(`${id}|${fy}`), `${id} in FY ${fy}`);
  }
  for (const goldenCase of cases) assert.ok(typeof goldenCase.citation === 'string' && goldenCase.citation.trim() !== '', goldenCase.name);
});

test('no TDS test or lookup touches the network', () => {
  assert.deepEqual(fetchCalls, []);
});
