import test from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2015-03-03', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2018-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };

test('Iowa resident single: 3.8% of federal taxable income, exemption credit and school district surtax, due April 30', async () => {
  const state = await household({ state: 'IA', forms: [w2(60000, { state: 'IA', stateWithheld: 2900 })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year', answers: { schoolDistrictNumber: '1863', schoolDistrictSurtaxRate: 5 } }]);
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.form, 'IA 1040');
  assert.equal(ia.lines['2'], 44250);
  assert.equal(ia.lines['4'], 44250);
  assert.equal(ia.lines['5'], 1682);
  assert.equal(ia.lines['8'], 40);
  assert.equal(ia.lines['12'], 1642);
  assert.equal(ia.lines['19'], 82);
  assert.equal(ia.lines['22'], 1724);
  assert.equal(ia.refund, 1176);
  assert.equal(ia.due, '2026-04-30');
});

test('Iowa joint return with dependents: alternate tax, exemption and tuition credits, and the 15% earned income tax credit', async () => {
  const state = await household({ state: 'IA', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(25000, { state: 'IA', stateWithheld: 200 }), w2(10000, { state: 'IA', owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year', answers: { tuitionTextbookExpenses: 1000, tuitionTextbookDependents: 1, schoolDistrictSurtaxRate: 0 } }]);
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.lines['2'], 3500);
  assert.equal(ia.lines['4'], 3500);
  assert.equal(ia.lines['5'], 133);
  assert.equal(ia.schedules['Alternate tax worksheet']['4'], 925);
  assert.equal(ia.lines['Step 3d'], 160);
  assert.equal(ia.lines['9'], 250);
  assert.equal(ia.lines['12'], 0);
  const federalEic = ia.schedules['Line 25'].federalCredit;
  assert.ok(federalEic > 0);
  assert.equal(ia.lines['25'], Math.round(federalEic * 0.15));
  assert.equal(ia.refund, 200 + ia.lines['25']);
});

test('Iowa retiree 65 or older: pension excluded on Schedule 1 line 7 and the low-income exemption applies', async () => {
  const state = await household({ state: 'IA', dateOfBirth: '1959-03-01', forms: [{ kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, stateWithheld: 0 } }] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year', answers: { schoolDistrictSurtaxRate: 3 } }]);
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.schedules['Schedule 1'].B7, 40000);
  assert.equal(ia.lines['3'], -40000);
  assert.equal(ia.lines['5'], 0);
  assert.equal(ia.lines['22'], 0);
  assert.ok(ia.checks.some((item) => item.code === 'IA_LOW_INCOME_EXEMPT'));
});

test('Iowa part-year resident: IA 126 credit removes the non-Iowa share and no surtax after moving out', async () => {
  const state = await household({ state: 'MN', forms: [w2(40000, { state: 'IA', stateWithheld: 1000 }), w2(40000, { state: 'MN', stateWithheld: 1800 })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', answers: { movedOutBeforeYearEnd: true } }, { state: 'MN', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.lines['5'], 2442);
  assert.equal(ia.lines['12'], 2402);
  assert.equal(ia.schedules['IA 126'].B13, 40000);
  assert.equal(ia.schedules['IA 126']['28'], 80000);
  assert.equal(ia.schedules['IA 126']['29'], 0.5);
  assert.equal(ia.schedules['IA 126']['34'], 1201);
  assert.equal(ia.lines['14'], 1201);
  assert.equal(ia.lines['19'], 0);
  assert.equal(ia.owed, 201);
});

test('Iowa nonresident: Iowa wages only through IA 126', async () => {
  const state = await household({ state: 'MN', forms: [w2(30000, { state: 'IA', stateWithheld: 1000 }), w2(30000, { state: 'MN' })] });
  await residency(state, '2025', [{ state: 'MN', residency: 'full-year' }, { state: 'IA', residency: 'nonresident' }]);
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.residency, 'nonresident');
  assert.equal(ia.lines['12'], 1642);
  assert.equal(ia.lines['13'], 821);
  assert.equal(ia.lines['19'], 0);
  assert.equal(ia.totalTax, 821);
  assert.equal(ia.refund, 179);
});

test('Iowa resident with Minnesota wages: IA 130 out-of-state credit limited to the Iowa tax on that income', async () => {
  const state = await household({ state: 'IA', forms: [w2(30000, { state: 'IA', stateWithheld: 500 }), w2(30000, { state: 'MN', stateWithheld: 1300 })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year', answers: { schoolDistrictSurtaxRate: 0 } }, { state: 'MN', residency: 'nonresident' }]);
  const ia = await stateReturn(state, '2025', 'IA');
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.totalTax, 1296);
  const os = ia.schedules['IA 130'][0];
  assert.equal(os['13'], 30000);
  assert.equal(os['17'], 0.5);
  assert.equal(os['19'], 821);
  assert.equal(os['23'], 821);
  assert.equal(ia.lines['15'], 821);
  assert.equal(ia.lines['16'], 821);
});

test('Iowa high income: flat 3.8% with no reduction, and a warning when the surtax rate is missing', async () => {
  const state = await household({ state: 'IA', forms: [w2(300000, { state: 'IA', stateWithheld: 11000 })] });
  const ia = await stateReturn(state, '2025', 'IA');
  assert.equal(ia.lines['4'], 284250);
  assert.equal(ia.lines['5'], 10802);
  assert.equal(ia.lines['12'], 10762);
  assert.equal(ia.lines['19'], 0);
  assert.ok(ia.checks.some((item) => item.code === 'IA_SCHOOL_SURTAX_RATE'));
  assert.equal(ia.refund, 238);
});

test('Iowa 2026 keeps the statutory 3.8% rate and is provisional until the 2026 IA 1040 is published', async () => {
  const state = await household({ taxYear: '2026', state: 'IA', forms: [w2(60000, { state: 'IA', stateWithheld: 2900 })] });
  const ia = await stateReturn(state, '2026', 'IA');
  assert.equal(ia.provisional, true);
  assert.equal(ia.lines['5'], Math.round(ia.lines['4'] * 0.038));
  assert.equal(ia.due, '2027-04-30');
});
