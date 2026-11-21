import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const codes = (item) => (item.checks || []).map((entry) => `${entry.level}:${entry.code}`);
const lines = (item, expected) => assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, item.lines[key]])), expected);
const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2019-03-03', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2015-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };

test('Connecticut resident single: Tax Calculation Schedule and property tax credit', async () => {
  const state = await household({ state: 'CT', forms: [w2(60000, { state: 'CT', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'CT', residency: 'full-year', answers: { useTax: 0, residencePropertyTax: 2000 } }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.equal(ct.form, 'CT-1040');
  assert.deepEqual(ct.schedules['Tax Calculation Schedule'], { 1: 60000, 2: 0, 3: 60000, 4: 2550, 5: 25, 6: 0, 7: 2575, 8: 0.1, 9: 258, 10: 2317 });
  assert.deepEqual(ct.schedules['3'], { 60: 2000, 61: 0, 62: 0, 63: 2000, 64: 300, 65: 300, 66: 0.3, 67: 90, 68: 210 });
  lines(ct, { 1: 60000, 5: 60000, 6: 2317, 10: 2317, 11: 210, 12: 2107, 16: 2107, 17: 2107, 18: 2500, '20a': 0 });
  assert.equal(ct.totalTax, 2107);
  assert.equal(ct.refund, 393);
  assert.deepEqual(codes(ct), ['info:CT_PROPERTY_TAX_RECORDS']);
  assert.equal(ct.provisional, false);
});

test('Connecticut joint return with children: personal credit, property tax credit and CT EITC with the $250 child bonus', async () => {
  const state = await household({ state: 'CT', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'CT', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'CT', residency: 'full-year', answers: { useTax: 0, vehiclePropertyTax: 400 } }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.deepEqual(ct.schedules['Tax Calculation Schedule'], { 1: 30000, 2: 24000, 3: 6000, 4: 120, 5: 0, 6: 0, 7: 120, 8: 0.75, 9: 90, 10: 30 });
  assert.deepEqual(ct.schedules['CT-EITC'], { 9: 2861, '15a': 250, 16: 3111, federalEic: 7152 });
  lines(ct, { 6: 30, 10: 30, 11: 300, 12: 0, 16: 0, 18: 300, '20a': 3111 });
  assert.equal(ct.totalTax, 0);
  assert.equal(ct.refund, 3411);
});

test('Connecticut part-year resident: income percentage method on CT-1040NR/PY', async () => {
  const state = await household({ state: 'CT', forms: [w2(40000, { state: 'CT', stateWithheld: 1500 }), w2(40000, { state: 'RI', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'CT', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', answers: { useTax: 0 } }, { state: 'RI', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.equal(ct.form, 'CT-1040NR/PY');
  lines(ct, { 1: 80000, 5: 80000, 6: 40000, 7: 80000, 8: 3775, 9: 0.5, 10: 1888, 12: 1888, 16: 1888, 18: 1888, 19: 1888, 20: 1500 });
  assert.equal(ct.schedules['Tax Calculation Schedule']['7'], 3775);
  assert.equal(ct.totalTax, 1888);
  assert.equal(ct.owed, 388);
  assert.deepEqual(codes(ct), ['warning:CT_SCHEDULE_CT_SI', 'info:CT_PART_YEAR_SCHEDULE_2']);
});

test('Connecticut nonresident: Connecticut-source wages over federal AGI', async () => {
  const state = await household({ state: 'NY', forms: [w2(50000, { state: 'CT', stateWithheld: 2000 }), w2(50000, { state: 'NY', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year' }, { state: 'CT', residency: 'nonresident' }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.equal(ct.form, 'CT-1040NR/PY');
  assert.deepEqual(ct.schedules['Tax Calculation Schedule'], { 1: 100000, 2: 0, 3: 100000, 4: 4750, 5: 225, 6: 0, 7: 4975, 8: 0, 9: 0, 10: 4975 });
  lines(ct, { 5: 100000, 6: 50000, 7: 100000, 8: 4975, 9: 0.5, 10: 2488, 18: 2488, 20: 2000 });
  assert.equal(ct.totalTax, 2488);
  assert.equal(ct.owed, 488);
  assert.deepEqual(codes(ct), ['warning:CT_USE_TAX', 'warning:CT_SCHEDULE_CT_SI']);
});

for (const year of ['2025', '2026']) {
  test(`Connecticut high income ${year}: top brackets, Table C add-back and Table D recapture at their maximums`, async () => {
    const state = await household({ taxYear: year, state: 'CT', forms: [w2(600000, { state: 'CT', stateWithheld: 40000 })] });
    await residency(state, year, [{ state: 'CT', residency: 'full-year', answers: { useTax: 0 } }]);
    const ct = await stateReturn(state, year, 'CT');
    assert.deepEqual(ct.schedules['Tax Calculation Schedule'], { 1: 600000, 2: 0, 3: 600000, 4: 38240, 5: 250, 6: 3400, 7: 41890, 8: 0, 9: 0, 10: 41890 });
    lines(ct, { 6: 41890, 12: 41890, 16: 41890, 18: 40000 });
    assert.equal(ct.totalTax, 41890);
    assert.equal(ct.owed, 1890);
    assert.equal(ct.provisional, false);
  });
}

test('Connecticut Schedule 2 credit for tax paid to Massachusetts', async () => {
  const state = await household({ state: 'CT', forms: [w2(50000, { state: 'CT', stateWithheld: 2000 }), w2(50000, { state: 'MA', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'CT', residency: 'full-year', answers: { useTax: 0 } }, { state: 'MA', residency: 'nonresident', answers: { useTax: 0 } }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.deepEqual(ct.schedules['2'], { 51: 100000, 55: 4975, 59: 2290, columns: [{ 53: 50000, 54: 0.5, 56: 2488, 57: 2290, 58: 2290, state: 'MA' }] });
  lines(ct, { 6: 4975, 7: 2290, 8: 2685, 10: 2685, 16: 2685, 18: 2000 });
  assert.equal(ct.totalTax, 2685);
  assert.deepEqual(codes(ct), ['info:CT_SCHEDULE_2']);
});

test('Connecticut use tax unanswered is a warning', async () => {
  const state = await household({ state: 'CT', forms: [w2(60000, { state: 'CT', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'CT', residency: 'full-year' }]);
  const ct = await stateReturn(state, '2025', 'CT');
  assert.deepEqual(codes(ct), ['warning:CT_USE_TAX']);
  assert.equal(ct.totalTax, 2317);
});
