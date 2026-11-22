import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };
const leo = { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 };
const mia = { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2007-05-05', months: 12 };

test('Arizona resident single: U.S. interest is subtracted and 2.5% applies after the standard deduction', async () => {
  const state = await household({ state: 'AZ', forms: [w2(60000, { state: 'AZ', stateWithheld: 1200 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 400 } }] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year' }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.form, '140');
  assert.equal(az.lines['12'], 60900);
  assert.equal(az.lines['28'], 400);
  assert.equal(az.lines['37'], 60500);
  assert.equal(az.lines['42'], 60500);
  assert.equal(az.lines['43'], 15750);
  assert.equal(az.lines['45'], 44750);
  assert.equal(az.lines['46'], 1119);
  assert.equal(az.lines['52'], 1119);
  assert.equal(az.totalTax, 1119);
  assert.equal(az.refund, 81);
});

test('Arizona resident joint with dependents: the dependent credit and the donation credits with their caps reduce the tax', async () => {
  const state = await household({ state: 'AZ', filingStatus: 'mfj', spouse, dependents: [leo, mia], forms: [w2(120000, { state: 'AZ', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year', answers: { qualifyingCharityGifts: 1200, publicSchoolFees: 300 } }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.lines['10a'], 1);
  assert.equal(az.lines['10b'], 1);
  assert.equal(az.lines['43'], 31500);
  assert.equal(az.lines['45'], 88500);
  assert.equal(az.lines['46'], 2213);
  assert.equal(az.schedules.dependentCredit['1b'], 100);
  assert.equal(az.schedules.dependentCredit['2b'], 25);
  assert.equal(az.lines['49'], 125);
  assert.equal(az.lines['51'], 1287);
  assert.equal(az.lines['52'], 801);
  assert.equal(az.totalTax, 801);
  assert.equal(az.owed, 0);
  assert.equal(az.refund, 199);
});

test('Arizona low-income joint filers get the refundable increased excise tax credit but not the family income credit above its limit', async () => {
  const state = await household({ state: 'AZ', filingStatus: 'mfj', spouse, dependents: [leo, mia], forms: [w2(24000, { state: 'AZ', stateWithheld: 200 })] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year' }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.lines['45'], 0);
  assert.equal(az.lines['50'], 0);
  assert.equal(az.lines['56'], 100);
  assert.equal(az.totalTax, 0);
  assert.equal(az.refund, 300);
});

test('Arizona part-year resident on Form 140PY: the Arizona ratio prorates exemptions, and the standard deduction is taken in full', async () => {
  const state = await household({ state: 'AZ', forms: [w2(30000, { state: 'AZ', stateWithheld: 500 }), w2(30000, { state: 'UT', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', answers: { useTax: 0 } }, { state: 'AZ', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.form, '140PY');
  assert.equal(az.lines['15F'], 60000);
  assert.equal(az.lines['15'], 30000);
  assert.equal(az.lines['27'], 0.5);
  assert.equal(az.lines['52'], 30000);
  assert.equal(az.lines['53'], 15750);
  assert.equal(az.lines['55'], 14250);
  assert.equal(az.lines['56'], 356);
  assert.equal(az.totalTax, 356);
  assert.equal(az.refund, 144);
});

test('Arizona nonresident on Form 140NR: the standard deduction is prorated by the ratio to three places', async () => {
  const state = await household({ state: 'UT', forms: [w2(70000, { state: 'UT', stateWithheld: 2000 }), w2(20000, { state: 'AZ', stateWithheld: 400 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }, { state: 'AZ', residency: 'nonresident', income: { wages: 20000 } }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.form, '140NR');
  assert.equal(az.lines['26'], 20000);
  assert.equal(az.lines['27'], 0.222);
  assert.equal(az.lines['53'], 3497);
  assert.equal(az.lines['55'], 16503);
  assert.equal(az.lines['56'], 413);
  assert.equal(az.totalTax, 413);
  assert.equal(az.owed, 13);
});

test('Arizona high income: the dependent credit falls 5% for each $1,000 of federal AGI over $400,000 joint', async () => {
  const state = await household({ state: 'AZ', filingStatus: 'mfj', spouse, dependents: [{ ...leo, dateOfBirth: '2015-02-02' }], forms: [w2(410500, { state: 'AZ', stateWithheld: 9000 })] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year' }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.lines['45'], 379000);
  assert.equal(az.lines['46'], 9475);
  assert.equal(az.schedules.dependentCredit.factor, 0.45);
  assert.equal(az.lines['49'], 45);
  assert.equal(az.totalTax, 9430);
  assert.equal(az.owed, 430);
});

test('Arizona resident with Colorado income: Form 309 limits the credit to the Arizona tax on the double-taxed share', async () => {
  const state = await household({ state: 'AZ', forms: [w2(60000, { state: 'AZ', stateWithheld: 1200 }), w2(20000, { state: 'CO', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year' }, { state: 'CO', residency: 'nonresident', income: { wages: 20000 } }]);
  const az = await stateReturn(state, '2025', 'AZ');
  const [form309] = az.schedules['309'];
  assert.equal(form309.state, 'CO');
  assert.equal(form309['10'], 0.25);
  assert.equal(form309['11'], 402);
  assert.equal(form309['12'], 707);
  assert.equal(az.lines['46'], 1606);
  assert.equal(az.lines['51'], 402);
  assert.equal(az.totalTax, 1204);
});

test('Arizona 2026 carries the 2025 figures and is marked provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'AZ', forms: [w2(60000, { state: 'AZ', stateWithheld: 1200 })] });
  await residency(state, '2026', [{ state: 'AZ', residency: 'full-year' }]);
  const az = await stateReturn(state, '2026', 'AZ');
  assert.equal(az.lines['43'], 15750);
  assert.equal(az.lines['46'], 1106);
  assert.equal(az.provisional, true);
});

test('Arizona high earner: the federal SALT cap phases down to $10,000 at $600,000, so the standard deduction wins', async () => {
  const state = await household({ state: 'AZ', forms: [w2(600000, { state: 'AZ', stateWithheld: 40000 })] });
  await residency(state, '2025', [{ state: 'AZ', residency: 'full-year' }]);
  const az = await stateReturn(state, '2025', 'AZ');
  assert.equal(az.totalTax, 14606);
  assert.equal(az.checks.some((item) => item.code === 'AZ_SALT_PHASE_DOWN'), false);
});
