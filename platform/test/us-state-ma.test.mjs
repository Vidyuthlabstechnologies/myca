import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { fivePercentTableTax } from '../src/countries/united-states/states/ma.mjs';

const codes = (item) => (item.checks || []).map((entry) => `${entry.level}:${entry.code}`);
const lines = (item, expected) => assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, item.lines[key]])), expected);
const pick = (table, expected) => assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, table[key]])), expected);
const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2019-03-03', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2015-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const covered = { useTax: 0, healthCoverage: 'all-year' };

test('Massachusetts 5% tax table follows the printed $50 bands', () => {
  const table = { upTo: 24000, band: 50, minimumIncome: 10, firstBandTax: 1 };
  assert.equal(fivePercentTableTax(9, table, 500), 0);
  assert.equal(fivePercentTableTax(50, table, 500), 1);
  assert.equal(fivePercentTableTax(100, table, 500), 4);
  assert.equal(fivePercentTableTax(13450, table, 500), 671);
  assert.equal(fivePercentTableTax(13451, table, 500), 674);
  assert.equal(fivePercentTableTax(24000, table, 500), 1199);
  assert.equal(fivePercentTableTax(24001, table, 500), 1200);
});

test('Massachusetts resident single: FICA deduction, Limited Income Credit and earned income credit', async () => {
  const state = await household({ state: 'MA', forms: [w2(9000, { state: 'MA', stateWithheld: 0 })] });
  await residency(state, '2025', [{ state: 'MA', residency: 'full-year', answers: covered }]);
  const ma = await stateReturn(state, '2025', 'MA');
  assert.equal(ma.form, 'Form 1');
  lines(ma, { 3: 9000, 10: 9000, '11a': 689, 16: 689, 17: 8311, 18: 4400, 19: 3911, 22: 196, 28: 196, 29: 96, 32: 100, 37: 100, '43b': 649, 43: 260, 48: 260 });
  pick(ma.schedules['Limited Income Credit Worksheet'], { 1: 9000, 2: 8000, 3: 1000, 4: 196, 5: 100, 6: 96 });
  assert.equal(ma.totalTax, 100);
  assert.equal(ma.refund, 160);
  assert.deepEqual(codes(ma), ['info:MA_SCHEDULE_HC_DETAILS']);
  assert.equal(ma.provisional, false);
});

test('Massachusetts joint return with children: rent, commuter, EITC and Child and Family Tax Credit', async () => {
  const state = await household({ state: 'MA', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'MA', stateWithheld: 600 })] });
  await residency(state, '2025', [{ state: 'MA', residency: 'full-year', answers: { ...covered, commuterCosts: 1200, rentPaid: 6000 } }]);
  const ma = await stateReturn(state, '2025', 'MA');
  lines(ma, { '2a': 8800, '2b': 2000, '2g': 10800, '11a': 2000, '14a': 6000, 14: 3000, 15: 750, 16: 5750, 17: 24250, 19: 13450, 22: 671, 29: 0, 32: 671, 38: 600, '43b': 7152, 43: 2861, '46a': 2, 46: 880, 48: 3741 });
  pick(ma.schedules.Y, { 15: 750, 19: 750 });
  pick(ma.schedules['Limited Income Credit Worksheet'], { 2: 18400, 3: 11600, 4: 671, 5: 1160, 6: 0 });
  assert.equal(ma.totalTax, 671);
  assert.equal(ma.refund, 3670);
});

test('Massachusetts part-year resident files Form 1-NR/PY with exemptions prorated by days', async () => {
  const state = await household({ state: 'MA', forms: [w2(30000, { state: 'MA', stateWithheld: 1200 }), w2(30000, { state: 'NY', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'MA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: covered }]);
  const ma = await stateReturn(state, '2025', 'MA');
  assert.equal(ma.form, 'Form 1-NR/PY');
  lines(ma, { 3: 0.5041, 5: 30000, 12: 30000, '15a': 2000, 20: 2000, 21: 28000, '4g': 4400, 22: 2218, 23: 25782, 25: 25782, 26: 1289, 32: 1289, 41: 1289, 42: 1200 });
  assert.equal(ma.totalTax, 1289);
  assert.equal(ma.owed, 89);
  assert.deepEqual(codes(ma), ['info:MA_SCHEDULE_HC_DETAILS', 'info:MA_PART_YEAR_DEDUCTIONS']);
});

test('Massachusetts nonresident: exemptions prorated by the line 14g income ratio', async () => {
  const state = await household({ state: 'NH', forms: [w2(80000, { state: 'MA', stateWithheld: 3500 }), { kind: '1099-INT', fields: { interest: 10000 } }] });
  await residency(state, '2025', [{ state: 'NH', residency: 'full-year' }, { state: 'MA', residency: 'nonresident', answers: { useTax: 0 } }]);
  const ma = await stateReturn(state, '2025', 'MA');
  assert.equal(ma.form, 'Form 1-NR/PY');
  lines(ma, { 3: 0, 5: 80000, '14d': 80000, '14e': 10000, '14f': 90000, '14g': 0.8889, 20: 2000, 21: 78000, 22: 3911, 23: 74089, 26: 3704, 32: 3704, 42: 3500 });
  assert.equal(ma.totalTax, 3704);
  assert.equal(ma.owed, 204);
  assert.deepEqual(codes(ma), []);
});

for (const [year, threshold, surtax, total] of [['2025', 1083150, 8818, 74348], ['2026', 1107750, 7834, 73364]]) {
  test(`Massachusetts high income ${year}: short-term and long-term gains and the 4% surtax`, async () => {
    const state = await household({ taxYear: year, state: 'MA', forms: [w2(1200000, { state: 'MA', stateWithheld: 70000 }), { kind: '1099-B', fields: { proceeds: 150000, costBasis: 50000, term: 'long' } }, { kind: '1099-B', fields: { proceeds: 20000, costBasis: 10000, term: 'short' } }] });
    await residency(state, year, [{ state: 'MA', residency: 'full-year', answers: covered }]);
    const ma = await stateReturn(state, year, 'MA');
    lines(ma, { 3: 1200000, '11a': 2000, 17: 1198000, 19: 1193600, 21: 1193600, 22: 59680, '23a': 850, 23: 850, 24: 5000, '28a': 65530, '28b': surtax, 28: total, 32: total, 38: 70000 });
    pick(ma.schedules.B, { 10: 10000, 37: 10000 });
    pick(ma.schedules.D, { 1: 100000, 21: 100000, 22: 5000 });
    pick(ma.schedules['4% Surtax'], { 4: 1303600, 5: threshold, 6: 1303600 - threshold, 7: surtax });
    assert.equal(ma.totalTax, total);
    assert.equal(ma.provisional, false);
  });
}

test('Massachusetts collectibles gain: 50% deduction then 12%', async () => {
  const state = await household({ state: 'MA', forms: [w2(70000, { state: 'MA', stateWithheld: 3000 }), { kind: '1099-B', fields: { proceeds: 30000, costBasis: 10000, term: 'long' } }] });
  await residency(state, '2025', [{ state: 'MA', residency: 'full-year', answers: { ...covered, collectiblesGain: 8000 } }]);
  const ma = await stateReturn(state, '2025', 'MA');
  pick(ma.schedules.B, { 11: 8000, 26: 8000, 27: 4000, 28: 4000, 39: 4000 });
  pick(ma.schedules.D, { 9: 20000, 12: 8000, 13: 12000, 21: 12000, 22: 600 });
  lines(ma, { 19: 63600, 22: 3180, '23b': 480, 23: 480, 24: 600, 28: 4260 });
  assert.equal(ma.totalTax, 4260);
});

test('Massachusetts Schedule HC unanswered is an error check', async () => {
  const state = await household({ state: 'MA', forms: [w2(60000, { state: 'MA', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'MA', residency: 'full-year', answers: { useTax: 0 } }]);
  const ma = await stateReturn(state, '2025', 'MA');
  assert.deepEqual(codes(ma), ['error:MA_SCHEDULE_HC']);
  assert.equal(ma.totalTax, 2680);
});

for (const [year, provisional] of [['2025', false], ['2026', true]]) {
  test(`Massachusetts Senior Circuit Breaker ${year} (2026 amounts not yet published)`, async () => {
    const state = await household({ taxYear: year, state: 'MA', dateOfBirth: '1950-02-02', forms: [w2(20000, { state: 'MA', stateWithheld: 200 })] });
    await residency(state, year, [{ state: 'MA', residency: 'full-year', answers: { ...covered, circuitBreakerHousing: 'owner', circuitBreakerAssessedValue: 500000, circuitBreakerRealEstateTax: 6000, circuitBreakerTaxAdjustments: 0, circuitBreakerWaterSewer: 800 } }]);
    const ma = await stateReturn(state, year, 'MA');
    lines(ma, { '2c': 700, 18: 5100, 19: 13370, 22: 669, 32: 669, 44: 2820, 48: 2820 });
    pick(ma.schedules.CB, { 2: 500000, 7: 20000, 8: 700, 9: 19300, 12: 6000, 13: 400, 14: 6400, 15: 1930, 16: 4470, 17: 2820 });
    assert.equal(ma.refund, 2351);
    assert.equal(ma.provisional, provisional);
  });
}

test('Massachusetts Schedule OJC credit for tax paid to Connecticut', async () => {
  const state = await household({ state: 'MA', forms: [w2(50000, { state: 'MA', stateWithheld: 2000 }), w2(50000, { state: 'CT', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'MA', residency: 'full-year', answers: covered }, { state: 'CT', residency: 'nonresident' }]);
  const ma = await stateReturn(state, '2025', 'MA');
  lines(ma, { 17: 98000, 19: 93600, 22: 4680, 28: 4680, 30: 2340, 32: 2340 });
  assert.deepEqual(ma.schedules.OJC, { columns: [{ 1: 50000, 2: 100000, 3: 0.5, 4: 4680, 5: 0, 6: 4680, 7: 2340, 8: 2488, 9: 2340, state: 'CT' }], total: 2340 });
  assert.deepEqual(codes(ma), ['info:MA_SCHEDULE_OJC', 'info:MA_SCHEDULE_HC_DETAILS']);
});
