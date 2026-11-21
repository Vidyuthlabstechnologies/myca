import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2015-05-05', months: 12 },
];

test('Rhode Island resident single: Schedule M U.S. interest and the $50 tax table row', async () => {
  const state = await household({ state: 'RI', forms: [w2(60000, { state: 'RI', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.form, 'RI-1040');
  assert.equal(ri.schedules.M['1a'], -200);
  assert.equal(ri.lines['1'], 60900);
  assert.equal(ri.lines['2'], -200);
  assert.equal(ri.lines['3'], 60700);
  assert.equal(ri.lines['4'], 10900);
  assert.equal(ri.lines['6'], 5100);
  assert.equal(ri.lines['7'], 44700);
  assert.equal(ri.lines['8'], 1677);
  assert.equal(ri.lines['13a'], 1677);
  assert.equal(ri.refund, 323);
});

test('Rhode Island joint with two children: four exemptions and the refundable 16% earned income credit', async () => {
  const state = await household({ state: 'RI', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'RI', stateWithheld: 400 }), w2(8000, { state: 'RI', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.lines['4'], 21800);
  assert.equal(ri.lines['6'], 20400);
  assert.equal(ri.lines['7'], 0);
  assert.equal(ri.lines['8'], 0);
  assert.equal(ri.lines['39'], 5561);
  assert.equal(ri.lines['41'], 890);
  assert.equal(ri.lines['14d'], 890);
  assert.equal(ri.refund, 1390);
});

test('Rhode Island child care credit (Schedule I) and the 529 subtraction capped at $1,000 joint', async () => {
  const state = await household({ state: 'RI', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(70000, { state: 'RI', stateWithheld: 3000 }), w2(30000, { state: 'RI', stateWithheld: 1000, owner: 'spouse' }), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Pines Daycare', fields: { amountPaid: 6000, qualifyingPerson: 'Leo' } }] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year', answers: { collegeSavingsContributions: 1500 } }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.schedules.M['1g'], -1000);
  assert.equal(ri.lines['3'], 99000);
  assert.equal(ri.lines['7'], 56800);
  assert.equal(ri.lines['8'], 2131);
  assert.equal(ri.schedules.I['20'], 1200);
  assert.equal(ri.schedules.I['22'], 300);
  assert.equal(ri.lines['9a'], 300);
  assert.equal(ri.lines['10a'], 1831);
  assert.ok(ri.checks.some((item) => item.code === 'RI_529_LIMIT'));
});

test('Rhode Island part-year resident: RI-1040NR Schedule III allocation to four decimals', async () => {
  const state = await household({ state: 'RI', forms: [w2(30000, { state: 'NH' }), w2(40000, { state: 'RI', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NH', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'RI', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.form, 'RI-1040NR');
  assert.equal(ri.lines['7'], 55000);
  assert.equal(ri.lines['8'], 2063);
  assert.equal(ri.lines['10'], 2063);
  assert.equal(ri.schedules.III.A['12'], 71000);
  assert.equal(ri.schedules.III.B['12'], 40504);
  assert.equal(ri.schedules.III.lines['14'], 0.5705);
  assert.equal(ri.lines['11'], 1177);
  assert.equal(ri.lines['13a'], 1177);
  assert.equal(ri.refund, 323);
});

test('Rhode Island nonresident: Schedule II share of Rhode Island wages', async () => {
  const state = await household({ state: 'NH', forms: [w2(20000, { state: 'RI', stateWithheld: 700 }), w2(50000, { state: 'NH' })] });
  await residency(state, '2025', [{ state: 'NH', residency: 'full-year' }, { state: 'RI', residency: 'nonresident' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.schedules.II.A['12'], 20000);
  assert.equal(ri.schedules.II.B['12'], 70000);
  assert.equal(ri.schedules.II.lines['13'], 0.2857);
  assert.equal(ri.lines['8'], 2026);
  assert.equal(ri.lines['11'], 579);
  assert.equal(ri.refund, 121);
});

test('Rhode Island high income: standard deduction and exemption phased out to 40% and the top bracket', async () => {
  const state = await household({ state: 'RI', forms: [w2(270000, { state: 'RI', stateWithheld: 14000 })] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  assert.equal(ri.schedules.phaseout.steps, 3);
  assert.equal(ri.schedules.phaseout.factor, 0.4);
  assert.equal(ri.lines['4'], 4360);
  assert.equal(ri.lines['6'], 2040);
  assert.equal(ri.lines['7'], 263600);
  assert.equal(ri.lines['8'], 12738);
  assert.equal(ri.refund, 1262);
});

test('Rhode Island retirees: Social Security share for the spouse at full retirement age and the pension modification', async () => {
  const state = await household({
    state: 'RI', filingStatus: 'mfj', dateOfBirth: '1955-03-01', spouse: { ...spouse, dateOfBirth: '1962-01-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000 } }, { kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: 'SSA-1099', owner: 'spouse', fields: { netBenefits: 6000 } }, w2(20000, { state: 'RI', stateWithheld: 300, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year' }]);
  const ri = await stateReturn(state, '2025', 'RI');
  const ss = ri.schedules['social-security-worksheet'];
  assert.equal(ss['8'], 30000);
  assert.equal(ss['9'], 24000);
  assert.equal(ss['10'], 0.8);
  assert.equal(ss['11'], 23850);
  assert.equal(ss['13'], 19080);
  assert.equal(ri.schedules['pension-modification'].taxpayer['3'], 30000);
  assert.equal(ri.schedules.M['1y'], -49080);
  assert.equal(ri.lines['3'], 24770);
  assert.equal(ri.lines['8'], 0);
});

test('Rhode Island RI-1040H: a renter over 65 gets 20% of rent less 6% of household income, capped at $700', async () => {
  const state = await household({ state: 'RI', dateOfBirth: '1950-03-01', forms: [{ kind: 'SSA-1099', fields: { netBenefits: 18000 } }, { kind: '1099-R', fields: { grossDistribution: 6000, taxableAmount: 6000 } }] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year', answers: { rentPaid: 12000 } }]);
  const ri = await stateReturn(state, '2025', 'RI');
  const h = ri.schedules['1040H'];
  assert.equal(h['1b'], 24000);
  assert.equal(h['8'], 2400);
  assert.equal(h['9'], 6);
  assert.equal(h['10'], 1440);
  assert.equal(h['11'], 960);
  assert.equal(h['13'], 700);
  assert.equal(ri.lines['14c'], 700);
  assert.equal(ri.refund, 700);
});

test('Rhode Island Schedule II credit for tax paid to New York', async () => {
  const state = await household({ state: 'RI', forms: [w2(50000, { state: 'RI', stateWithheld: 2000 }), w2(30000, { state: 'NY', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'RI', residency: 'full-year' }, { state: 'NY', residency: 'nonresident', answers: { salesUseTax: 0 } }]);
  const ri = await stateReturn(state, '2025', 'RI');
  const row = ri.schedules.II[0];
  assert.equal(row.lines['23'], 2401);
  assert.equal(row.lines['26'], 0.375);
  assert.equal(row.lines['27'], 900);
  assert.equal(row.lines['29'], 900);
  assert.equal(ri.lines['9b'], 900);
  assert.equal(ri.lines['10a'], 1501);
});

test('Rhode Island 2026 uses the ADV 2025-22 amounts; the retirement limits are provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'RI', forms: [w2(60000, { state: 'RI', stateWithheld: 2000 })] });
  await residency(state, '2026', [{ state: 'RI', residency: 'full-year' }]);
  const ri = await stateReturn(state, '2026', 'RI');
  assert.equal(ri.lines['4'], 11200);
  assert.equal(ri.lines['6'], 5250);
  assert.equal(ri.lines['7'], 43550);
  assert.equal(ri.lines['8'], 1634);
  assert.equal(ri.provisional, true);
});
