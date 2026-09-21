import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as GST_RULES } from '../src/rules/gst.mjs';
import { rule, validateRules } from '../src/index.mjs';

globalThis.fetch = () => {
  throw new Error('network is not allowed in statutory-rules');
};

const RATES = 'gst.rates.valid';

function ratesOn(onDate) {
  const result = rule(RATES, onDate);
  assert.equal(result.ok, true, `${RATES} on ${onDate}: ${JSON.stringify(result)}`);
  return result.value;
}

test('gst records are clean, gst-prefixed and still awaiting advisor attestation', () => {
  assert.ok(GST_RULES.length > 0);
  assert.deepEqual(validateRules(GST_RULES).problems, []);
  for (const record of GST_RULES) {
    assert.match(record.id, /^gst\./, record.id);
    assert.deepEqual(record.attestations, [], record.id);
    assert.equal(record.act, 'CGST', record.id);
  }
});

test('the valid rate set up to 21-Sep-2025 has 28 and 12 but no 40', () => {
  assert.deepEqual(ratesOn('2025-09-21'), [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28]);
  assert.deepEqual(ratesOn('2019-04-01'), [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28]);
});

test('from 22-Sep-2025 the rate set adds 40 and keeps 28 for Schedule VII tobacco goods until 31-Jan-2026', () => {
  assert.deepEqual(ratesOn('2025-09-22'), [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28, 40]);
  assert.deepEqual(ratesOn('2026-01-31'), [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28, 40]);
});

test('from 1-Feb-2026 Schedule VII is omitted, so 28 is no longer a valid rate', () => {
  const rates = ratesOn('2026-02-01');
  assert.deepEqual(rates, [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 40]);
  assert.equal(rates.includes(28), false);
  assert.deepEqual(ratesOn('2026-09-21'), rates);
});

test('12 stays valid after 22-Sep-2025 because bricks and ongoing housing projects keep a 6 per cent central rate', () => {
  for (const onDate of ['2025-09-22', '2026-02-01', '2026-09-21']) assert.ok(ratesOn(onDate).includes(12), onDate);
});

test('rate sets are ascending, unique, finite and non-negative combined percentages', () => {
  const records = GST_RULES.filter((entry) => entry.id === RATES);
  assert.ok(records.length > 0);
  for (const record of records) {
    assert.equal(record.basis, 'combined_rate_percent');
    const rates = record.value;
    assert.ok(rates.every((rate) => Number.isFinite(rate) && rate >= 0), record.effectiveFrom);
    assert.deepEqual([...rates].sort((left, right) => left - right), rates, record.effectiveFrom);
    assert.equal(new Set(rates).size, rates.length, record.effectiveFrom);
  }
});

test('no rate set is claimed before 1-Apr-2019, when the 7.5 and 1.5 construction rates began', () => {
  assert.deepEqual(rule(RATES, '2019-03-31'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: RATES, onDate: '2019-03-31' });
});

test('rate set versions and sources follow the notifications that changed the set', () => {
  const ranges = GST_RULES.filter((entry) => entry.id === RATES).map((record) => [record.effectiveFrom, record.effectiveTo]);
  assert.deepEqual(ranges, [['2019-04-01', '2025-09-21'], ['2025-09-22', '2026-01-31'], ['2026-02-01', null]]);
  assert.match(rule(RATES, '2025-09-21').record.source, /1\/2017-Central Tax \(Rate\)/);
  assert.match(rule(RATES, '2025-09-22').record.source, /9\/2025-Central Tax \(Rate\)/);
  assert.match(rule(RATES, '2025-09-22').record.source, /14\/2025-Central Tax \(Rate\)/);
  assert.match(rule(RATES, '2026-02-01').record.source, /19\/2025-Central Tax \(Rate\)/);
});
