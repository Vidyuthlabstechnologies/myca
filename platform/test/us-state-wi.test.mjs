import test from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2015-03-03', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2018-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };

test('Wisconsin resident single: sliding standard deduction and tax from the table midpoints', async () => {
  const state = await household({ state: 'WI', forms: [w2(60000, { state: 'WI', stateWithheld: 2900 })] });
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.form, '1');
  assert.equal(wi.lines['7'], 60000);
  assert.equal(wi.lines['8'], 8676);
  assert.equal(wi.lines['10c'], 700);
  assert.equal(wi.lines['11'], 50624);
  assert.equal(wi.lines['12'], 2098);
  assert.equal(wi.lines['27'], 2098);
  assert.equal(wi.refund, 802);
  assert.equal(wi.due, '2026-04-15');
});

test('Wisconsin joint return with dependents: itemized deduction, school property tax and married couple credits', async () => {
  const state = await household({
    state: 'WI', filingStatus: 'mfj', spouse, dependents: kids,
    forms: [w2(70000, { state: 'WI', stateWithheld: 3000 }), w2(30000, { state: 'WI', stateWithheld: 1000, owner: 'spouse' }), { kind: '1098', fields: { mortgageInterest: 12000, propertyTax: 4000 } }],
  });
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.lines['8'], 10862);
  assert.equal(wi.lines['10a'], 2800);
  assert.equal(wi.lines['11'], 86338);
  assert.equal(wi.lines['12'], 3795);
  assert.equal(wi.lines['13'], 57);
  assert.equal(wi.lines['16b'], 300);
  assert.equal(wi.schedules['Schedule 2']['6'], 16000);
  assert.equal(wi.lines['18'], 480);
  assert.equal(wi.lines['21'], 837);
  assert.equal(wi.lines['22'], 2958);
  assert.equal(wi.refund, 4000 - 2958);
  assert.ok(wi.checks.some((item) => item.code === 'WI_SCHOOL_CREDIT_PROPERTY_TAX'));
});

test('Wisconsin renter with heat included and the earned income credit by children', async () => {
  const state = await household({ state: 'WI', filingStatus: 'hoh', dependents: kids, forms: [w2(24000, { state: 'WI', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'WI', residency: 'full-year', answers: { rentHeatIncluded: 9000 } }]);
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.lines['8'], 16462);
  assert.equal(wi.lines['10a'], 2100);
  assert.equal(wi.lines['11'], 5438);
  assert.equal(wi.lines['12'], 191);
  assert.equal(wi.lines['16a'], 217);
  assert.equal(wi.lines['22'], 0);
  const federalEic = wi.schedules['Line 30'].federalCredit;
  assert.ok(federalEic > 0);
  assert.equal(wi.lines['30'], Math.round(federalEic * 0.11));
});

test('Wisconsin age 67 retiree: the retirement income subtraction is claimed when it beats the credits', async () => {
  const state = await household({ state: 'WI', dateOfBirth: '1955-03-01', forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000 } }, { kind: '1099-INT', fields: { interest: 5000 } }] });
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.schedules.SB['16'], 24000);
  assert.equal(wi.lines['6'], 24000);
  assert.equal(wi.lines['7'], 11000);
  assert.equal(wi.lines['8'], 13560);
  assert.equal(wi.lines['10b'], 250);
  assert.equal(wi.lines['12'], 0);
  assert.ok(wi.checks.some((item) => item.code === 'WI_RETIREMENT_SUBTRACTION'));
});

test('Wisconsin part-year resident: Form 1NPR prorates the tax by Wisconsin income over federal income', async () => {
  const state = await household({ state: 'WI', forms: [w2(40000, { state: 'WI', stateWithheld: 1500 }), w2(40000, { state: 'MN', stateWithheld: 1800 })] });
  await residency(state, '2025', [{ state: 'MN', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'WI', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.form, '1NPR');
  assert.equal(wi.lines.B1, 40000);
  assert.equal(wi.lines['30'], 40000);
  assert.equal(wi.lines['31'], 80000);
  assert.equal(wi.lines['32'], 0.5);
  assert.equal(wi.lines['33'], 80000);
  assert.equal(wi.lines['34c'], 6276);
  assert.equal(wi.lines['37'], 73024);
  assert.equal(wi.lines['38'], 3285);
  assert.equal(wi.lines['39'], 1643);
  assert.equal(wi.totalTax, 1643);
  assert.equal(wi.owed, 143);
});

test('Wisconsin nonresident: only Wisconsin wages are in column B', async () => {
  const state = await household({ state: 'IA', forms: [w2(30000, { state: 'WI', stateWithheld: 1000 }), w2(30000, { state: 'IA' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year' }, { state: 'WI', residency: 'nonresident' }]);
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.residency, 'nonresident');
  assert.equal(wi.lines['32'], 0.5);
  assert.equal(wi.lines['34c'], 8676);
  assert.equal(wi.lines['38'], 2098);
  assert.equal(wi.lines['39'], 1049);
  assert.equal(wi.lines['43c'], 0);
  assert.equal(wi.totalTax, 1049);
});

test('Wisconsin high income: top 7.65% bracket from the tax computation worksheet and no standard deduction', async () => {
  const state = await household({ state: 'WI', forms: [w2(400000, { state: 'WI', stateWithheld: 20000 })] });
  const wi = await stateReturn(state, '2025', 'WI');
  assert.equal(wi.lines['8'], 0);
  assert.equal(wi.lines['11'], 399300);
  assert.equal(wi.lines['12'], 22363);
  assert.equal(wi.owed, 2363);
});

test('Wisconsin 2026 uses the 2026 Form 1-ES schedules and is provisional until the 2026 instructions are published', async () => {
  const state = await household({ taxYear: '2026', state: 'WI', forms: [w2(60000, { state: 'WI', stateWithheld: 2900 })] });
  const wi = await stateReturn(state, '2026', 'WI');
  assert.equal(wi.provisional, true);
  assert.equal(wi.lines['8'], 9144);
  assert.equal(wi.lines['11'], 50156);
  assert.equal(wi.lines['23'], wi.lines['12']);
});
