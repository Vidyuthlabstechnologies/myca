import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES as GST_RULES } from '../src/rules/gst.mjs';
import { fyEnd, fyStart, rule, runGolden, validateRules } from '../src/index.mjs';

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

const B2CL = 'gst.b2cl.threshold';
const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

test('the B2CL invoice-value threshold is Rs 2,50,000 up to 31-Jul-2024 and Rs 1,00,000 from 1-Aug-2024, in paise', () => {
  assert.equal(rule(B2CL, '2017-07-01').value, 250000 * RUPEE);
  assert.equal(rule(B2CL, '2020-12-31').value, 250000 * RUPEE);
  assert.equal(rule(B2CL, '2021-01-01').value, 250000 * RUPEE);
  assert.equal(rule(B2CL, '2024-07-31').value, 250000 * RUPEE);
  assert.equal(rule(B2CL, '2024-08-01').value, 100000 * RUPEE);
  assert.equal(rule(B2CL, '2026-09-21').value, LAKH);
  assert.equal(rule(B2CL, '2024-08-01').record.basis, 'invoice_value_paise_more_than');
});

test('the B2CL threshold is not claimed before GST began on 1-Jul-2017', () => {
  assert.deepEqual(rule(B2CL, '2017-06-30'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: B2CL, onDate: '2017-06-30' });
});

test('B2CL versions cite rule 59 and Notification 12/2024-Central Tax', () => {
  const ranges = GST_RULES.filter((entry) => entry.id === B2CL).map((record) => [record.effectiveFrom, record.effectiveTo]);
  assert.deepEqual(ranges, [['2017-07-01', '2020-12-31'], ['2021-01-01', '2024-07-31'], ['2024-08-01', null]]);
  assert.match(rule(B2CL, '2024-08-01').record.source, /12\/2024-Central Tax/);
  assert.match(rule(B2CL, '2024-08-01').record.section, /Rule 59\(4\)/);
  assert.match(rule(B2CL, '2021-01-01').record.source, /82\/2020-Central Tax/);
  assert.match(rule(B2CL, '2020-12-31').record.section, /Rule 59\(2\)/);
});

const STATE_CODES = 'gst.gstin.state-codes';

function twoDigits(from, to) {
  return Array.from({ length: to - from + 1 }, (_, offset) => String(from + offset).padStart(2, '0'));
}

test('GSTIN state codes gain 38 Ladakh from 1-Jan-2020', () => {
  const before = rule(STATE_CODES, '2019-12-31').value;
  const after = rule(STATE_CODES, '2020-01-01').value;
  assert.equal(before.includes('38'), false);
  assert.equal(after.includes('38'), true);
  assert.deepEqual(after, [...twoDigits(1, 27), ...twoDigits(29, 38), '97', '99']);
  assert.deepEqual(before, [...twoDigits(1, 27), ...twoDigits(29, 37), '97', '99']);
  assert.deepEqual(rule(STATE_CODES, '2026-09-21').value, after);
});

test('GSTIN state codes include 97 Other Territory and 99 but not 28 or the place-of-supply-only 96', () => {
  for (const onDate of ['2017-07-01', '2026-09-21']) {
    const codes = rule(STATE_CODES, onDate).value;
    assert.ok(codes.includes('97') && codes.includes('99'), onDate);
    assert.equal(codes.includes('28'), false, onDate);
    assert.equal(codes.includes('96'), false, onDate);
    assert.ok(codes.includes('25') && codes.includes('26'), onDate);
  }
});

test('state codes are sorted, unique two-digit strings and are not claimed before 1-Jul-2017', () => {
  for (const record of GST_RULES.filter((entry) => entry.id === STATE_CODES)) {
    assert.equal(record.basis, 'gstin_first_two_characters');
    assert.ok(record.value.every((code) => /^\d{2}$/.test(code)), record.effectiveFrom);
    assert.deepEqual([...record.value].sort(), record.value, record.effectiveFrom);
    assert.equal(new Set(record.value).size, record.value.length, record.effectiveFrom);
  }
  const ranges = GST_RULES.filter((entry) => entry.id === STATE_CODES).map((record) => [record.effectiveFrom, record.effectiveTo]);
  assert.deepEqual(ranges, [['2017-07-01', '2019-12-31'], ['2020-01-01', null]]);
  assert.deepEqual(rule(STATE_CODES, '2017-06-30'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: STATE_CODES, onDate: '2017-06-30' });
});

const GSTR9 = 'gst.gstr9.exemption-threshold';

const GSTR9_NOTIFICATIONS = [
  ['2017-18', /47\/2019-Central Tax/],
  ['2018-19', /47\/2019-Central Tax/],
  ['2019-20', /77\/2020-Central Tax/],
  ['2020-21', /31\/2021-Central Tax/],
  ['2021-22', /10\/2022-Central Tax/],
  ['2022-23', /32\/2023-Central Tax/],
  ['2023-24', /14\/2024-Central Tax/],
  ['2024-25', /15\/2025-Central Tax/],
  ['2025-26', /15\/2025-Central Tax/],
  ['2026-27', /15\/2025-Central Tax/]
];

test('the GSTR-9 exemption covers aggregate turnover up to Rs 2 crore in every financial year from 2017-18, looked up by FY start', () => {
  for (const [fy, notification] of GSTR9_NOTIFICATIONS) {
    const result = rule(GSTR9, fyStart(fy));
    assert.equal(result.ok, true, fy);
    assert.equal(result.value, 2 * CRORE, fy);
    assert.equal(result.record.basis, 'aggregate_turnover_paise_up_to', fy);
    assert.match(result.record.source, notification, fy);
    assert.equal(rule(GSTR9, fyEnd(fy)).record.effectiveFrom, result.record.effectiveFrom, fy);
  }
});

test('the GSTR-9 exemption is open-ended from FY 2024-25 and not claimed before FY 2017-18', () => {
  assert.equal(rule(GSTR9, '2024-04-01').record.effectiveTo, null);
  assert.deepEqual(rule(GSTR9, '2017-03-31'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: GSTR9, onDate: '2017-03-31' });
});

const RULE_37 = 'gst.rule37.payment-days';
const RULE_37A = 'gst.rule37a.deadlines';

test('Rule 37 gives 180 days from the invoice date to pay the supplier, before and after the 1-Oct-2022 substitution', () => {
  for (const onDate of ['2017-07-01', '2022-09-30', '2022-10-01', '2026-09-21']) {
    const result = rule(RULE_37, onDate);
    assert.equal(result.value, 180, onDate);
    assert.equal(result.record.basis, 'days_from_invoice_date', onDate);
  }
  assert.match(rule(RULE_37, '2022-10-01').record.source, /19\/2022-Central Tax/);
  assert.equal(rule(RULE_37, '2022-09-30').record.effectiveTo, '2022-09-30');
  assert.deepEqual(rule(RULE_37, '2017-06-30'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: RULE_37, onDate: '2017-06-30' });
});

test('Rule 37A: supplier GSTR-3B by 30 September and recipient reversal by 30 November after the FY end, from 26-Dec-2022', () => {
  const result = rule(RULE_37A, '2022-12-26');
  assert.deepEqual(result.value, { supplierGstr3bBy: { month: 9, day: 30 }, reverseBy: { month: 11, day: 30 } });
  assert.equal(result.record.basis, 'month_day_following_end_of_financial_year_itc_availed');
  assert.equal(result.record.effectiveTo, null);
  assert.match(result.record.source, /26\/2022-Central Tax/);
  assert.equal(rule(RULE_37A, fyEnd('2022-23')).ok, true);
  assert.deepEqual(rule(RULE_37A, '2022-12-25'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: RULE_37A, onDate: '2022-12-25' });
});

const GOLDEN = new URL('../golden/gst.json', import.meta.url);

function b2cTable({ invoiceDate, interState, invoiceValuePaise }) {
  const threshold = rule(B2CL, invoiceDate);
  if (!threshold.ok) return { error: threshold.error };
  const table = interState === true && invoiceValuePaise > threshold.value ? 'B2CL' : 'B2CS';
  return { table, ruleUsed: `${threshold.record.id}@${threshold.record.effectiveFrom}` };
}

function rateValidity({ invoiceDate, ratePercent }) {
  const rates = rule(RATES, invoiceDate);
  if (!rates.ok) return { error: rates.error };
  return { valid: rates.value.includes(ratePercent), ruleUsed: `${rates.record.id}@${rates.record.effectiveFrom}` };
}

function computeGstCase(input) {
  if (input.check === 'b2c-table') return b2cTable(input);
  if (input.check === 'rate-valid') return rateValidity(input);
  throw new Error(`unknown golden check ${input.check}`);
}

test('golden GST cases pass: B2CL/B2CS split and rate validity', async () => {
  const result = await runGolden(GOLDEN, computeGstCase);
  assert.deepEqual(result.failures, [], JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
  assert.ok(result.total >= 20);
});

test('golden cases straddle 1-Aug-2024 for B2CL and 22-Sep-2025 and 1-Feb-2026 for rates, on both sides of each threshold', () => {
  const cases = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const b2c = cases.filter((entry) => entry.input.check === 'b2c-table');
  const rates = cases.filter((entry) => entry.input.check === 'rate-valid');
  for (const [side, keep] of [['before', (date) => date < '2024-08-01'], ['after', (date) => date >= '2024-08-01']]) {
    const sideCases = b2c.filter((entry) => keep(entry.input.invoiceDate) && entry.input.interState === true);
    const threshold = side === 'before' ? 250000 * RUPEE : LAKH;
    assert.ok(sideCases.some((entry) => entry.input.invoiceValuePaise === threshold && entry.expected.table === 'B2CS'), side);
    assert.ok(sideCases.some((entry) => entry.input.invoiceValuePaise === threshold + 1 && entry.expected.table === 'B2CL'), side);
  }
  assert.ok(b2c.some((entry) => entry.input.interState === false && entry.expected.table === 'B2CS'));
  for (const [date, rate, valid] of [['2025-09-21', 40, false], ['2025-09-22', 40, true], ['2026-01-31', 28, true], ['2026-02-01', 28, false]]) {
    assert.ok(rates.some((entry) => entry.input.invoiceDate === date && entry.input.ratePercent === rate && entry.expected.valid === valid), `${date} ${rate}`);
  }
  for (const entry of cases) assert.ok(typeof entry.citation === 'string' && entry.citation.trim() !== '', entry.name);
});
