import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { arkansasRegularTax, arkansasLowIncomeTax } from '../src/countries/united-states/states/ar.mjs';
import { RULES } from '../../sprints/statutory-rules/src/rules/us-state/ar.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };
const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2016-03-05', months: 12 }];
const rule = (name, taxYear) => RULES.find((item) => item.id === `us.state-return.ar.${name}` && item.effectiveFrom.startsWith(taxYear)).value;

test('Arkansas tax tables: midpoint formula, the one-dollar row shift from $75,001, and the low income table rows', () => {
  const regular = rule('income-tax', '2025');
  assert.equal(arkansasRegularTax(5599, regular), 0);
  assert.equal(arkansasRegularTax(5650, regular), 1);
  assert.equal(arkansasRegularTax(9050, regular), 69);
  assert.equal(arkansasRegularTax(64850, regular), 2109);
  assert.equal(arkansasRegularTax(75000, regular), 2503);
  assert.equal(arkansasRegularTax(75001, regular), 2507);
  assert.equal(arkansasRegularTax(94850, regular), 3310);
  assert.equal(arkansasRegularTax(100000, regular), 3809);
  assert.equal(arkansasRegularTax(150000, regular), 5759);
  const single = rule('low-income-tables', '2025').single;
  assert.equal(arkansasLowIncomeTax(14643, single), 0);
  assert.equal(arkansasLowIncomeTax(14644, single), 29);
  assert.equal(arkansasLowIncomeTax(14701, single), 33);
  assert.equal(arkansasLowIncomeTax(17500, single), 222);
  assert.equal(arkansasLowIncomeTax(17501, single), null);
  const regular2026 = rule('income-tax', '2026');
  assert.equal(arkansasRegularTax(47530, regular2026), 1392);
  assert.equal(arkansasRegularTax(94750, regular2026), 3136);
  assert.equal(arkansasRegularTax(100000, regular2026), 3618);
});

test('Arkansas resident single: U.S. interest exempt, $2,470 standard deduction, regular table and $29 personal credit', async () => {
  const state = await household({ state: 'AR', forms: [w2(50000, { state: 'AR', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 600, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.form, 'AR1000F');
  assert.equal(ar.lines['10'], 600);
  assert.equal(ar.lines['25'], 50600);
  assert.equal(ar.lines['27'], 2470);
  assert.equal(ar.lines['28'], 48130);
  assert.equal(ar.lines['29'], 1458);
  assert.equal(ar.lines['7C'], 29);
  assert.equal(ar.lines['38'], 1429);
  assert.equal(ar.totalTax, 1429);
  assert.equal(ar.refund, 71);
  assert.equal(ar.provisional, false);
});

test('Arkansas resident joint with two children: low income table beats the regular table, with personal and AR2441 child care credits', async () => {
  const state = await household({ state: 'AR', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(26000, { state: 'AR', stateWithheld: 400 }), w2(8000, { state: 'AR', stateWithheld: 100, owner: 'spouse' }), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Steps', fields: { amountPaid: 4000, qualifyingPerson: 'Leo' } }] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.lines['26'], 'low income table');
  assert.equal(ar.schedules.taxTable.table, 'mfjTwoOrMoreDependents');
  assert.equal(ar.lines['27'], 0);
  assert.equal(ar.lines['29'], 561);
  assert.equal(ar.lines['7A'], 58);
  assert.equal(ar.lines['7B'], 58);
  assert.equal(ar.schedules.AR2441['6'], 4000);
  assert.equal(ar.schedules.AR2441['8'], 0.25);
  assert.equal(ar.lines['35'], 200);
  assert.equal(ar.lines['37'], 316);
  assert.equal(ar.lines['38'], 245);
  assert.equal(ar.schedules.taxTable.regularLine38, 397);
  assert.equal(ar.refund, 255);
});

test('Arkansas resident single near the credit limit: additional tax credit for qualified individuals', async () => {
  const state = await household({ state: 'AR', forms: [w2(29470, { state: 'AR', stateWithheld: 600 })] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.lines['28'], 27000);
  assert.equal(ar.lines['29'], 635);
  assert.equal(ar.schedules.AR1000TC['6'], 35);
  assert.equal(ar.lines['38'], 571);
});

test('Arkansas retiree: $6,000 exemption on employer pension and IRA distributions, Social Security exempt, no 65 special credit', async () => {
  const state = await household({ state: 'AR', dateOfBirth: '1955-01-10', forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000, distributionCode: '7' } }, { kind: '1099-R', fields: { grossDistribution: 10000, taxableAmount: 10000, iraSepSimple: true, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 20000 } }] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.schedules.retirement.taxpayerExemption, 6000);
  assert.equal(ar.lines['18A'], 34000);
  assert.equal(ar.lines['25'], 34000);
  assert.equal(ar.lines['28'], 31530);
  assert.equal(ar.lines['29'], 810);
  assert.equal(ar.lines['7A'], 58);
  assert.equal(ar.lines['38'], 752);
  assert.equal(ar.owed, 752);
});

test('Arkansas worker over 65 without a retirement exemption: the 65 Special personal credit', async () => {
  const state = await household({ state: 'AR', dateOfBirth: '1959-05-05', forms: [w2(30000, { state: 'AR', stateWithheld: 700 })] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.schedules['Personal tax credits'].boxes, 3);
  assert.equal(ar.lines['7C'], 87);
});

test('Arkansas high-income itemizer: half of long-term gains, early IRA withdrawal with 10% of the federal additional tax, AR3 and the over-$100,000 formula', async () => {
  const state = await household({ state: 'AR', forms: [w2(200000, { state: 'AR', stateWithheld: 8000 }), { kind: '1099-B', fields: { transactions: [{ term: 'long', proceeds: 50000, costBasis: 30000 }, { term: 'short', proceeds: 15000, costBasis: 10000 }] } }, { kind: '1099-R', fields: { grossDistribution: 10000, taxableAmount: 10000, iraSepSimple: true, distributionCode: '1' } }, { kind: '1098', fields: { mortgageInterest: 15000, propertyTax: 5000 } }], answers: { charityCash: 3000 } });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.schedules.AR1000D['8'], 10000);
  assert.equal(ar.schedules.AR1000D['11'], 5000);
  assert.equal(ar.lines['14'], 15000);
  assert.equal(ar.lines['16'], 10000);
  assert.equal(ar.lines['25'], 225000);
  assert.equal(ar.schedules.AR3['30'], 23000);
  assert.equal(ar.lines['27'], 23000);
  assert.equal(ar.lines['28'], 202000);
  assert.equal(ar.lines['29'], 7787);
  assert.equal(ar.lines['32'], 100);
  assert.equal(ar.lines['33'], 7887);
  assert.equal(ar.lines['38'], 7858);
  assert.equal(ar.refund, 142);
});

test('Arkansas part-year resident: tax on all income prorated by Arkansas adjusted gross income to six decimals', async () => {
  const state = await household({ state: 'AR', forms: [w2(30000, { state: 'MO', stateWithheld: 1000 }), w2(30000, { state: 'AR', stateWithheld: 900 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'MO', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'AR', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { taxableInterest: 400 } }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.form, 'AR1000NR');
  assert.equal(ar.lines['25'], 61000);
  assert.equal(ar.lines['38'], 1834);
  assert.equal(ar.lines['38A'], 30400);
  assert.equal(ar.lines['38B'], 61000);
  assert.equal(ar.lines['38C'], 0.498361);
  assert.equal(ar.lines['38D'], 914);
  assert.equal(ar.totalTax, 914);
  assert.equal(ar.owed, 14);
});

test('Arkansas nonresident from Missouri: Arkansas wages share of the full-year tax', async () => {
  const state = await household({ state: 'MO', forms: [w2(40000, { state: 'AR', stateWithheld: 1100 }), w2(20000, { state: 'MO' })] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }, { state: 'AR', residency: 'nonresident' }]);
  const ar = await stateReturn(state, '2025', 'AR');
  assert.equal(ar.lines['38'], 1795);
  assert.equal(ar.lines['38C'], 0.666667);
  assert.equal(ar.lines['38D'], 1197);
  assert.equal(ar.stateIncome, 40000);
  assert.equal(ar.owed, 97);
});

test('Arkansas resident with Missouri wages: other state tax credit is the lesser of Missouri tax and the Arkansas tax on that income', async () => {
  const state = await household({ state: 'AR', forms: [w2(50000, { state: 'AR', stateWithheld: 1500 }), w2(20000, { state: 'MO', stateWithheld: 600 })] });
  await residency(state, '2025', [{ state: 'AR', residency: 'full-year' }, { state: 'MO', residency: 'nonresident' }]);
  const mo = await stateReturn(state, '2025', 'MO');
  const ar = await stateReturn(state, '2025', 'AR');
  const sheet = ar.schedules['Other state tax credit worksheet'];
  assert.equal(sheet.step1, 2214);
  assert.equal(sheet.step2, 1434);
  assert.equal(sheet.step3, 780);
  assert.equal(ar.schedules.AR1000TC['2'], Math.min(780, mo.totalTax));
  assert.equal(ar.lines['38'], 2214 - 29 - Math.min(780, mo.totalTax));
});

test('Arkansas 2026: 3.7% top rate from Act 1 of 2026, indexed amounts carried and provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'AR', forms: [w2(50000, { state: 'AR', stateWithheld: 1500 })] });
  await residency(state, '2026', [{ state: 'AR', residency: 'full-year' }]);
  const ar = await stateReturn(state, '2026', 'AR');
  assert.equal(ar.lines['28'], 47530);
  assert.equal(ar.lines['29'], 1392);
  assert.equal(ar.lines['38'], 1363);
  assert.equal(ar.provisional, true);
  assert.deepEqual(ar.missingRules, []);
});
