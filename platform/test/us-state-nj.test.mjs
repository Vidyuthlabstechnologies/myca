import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { STATE, njTax } from '../src/countries/united-states/states/nj.mjs';
import { RULES } from '../../sprints/statutory-rules/src/rules/us-state/nj.mjs';

const spouse = { firstName: 'Sam', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-01-05' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-3458', relationship: 'son', dateOfBirth: '2022-03-01', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-3459', relationship: 'daughter', dateOfBirth: '2017-05-01', months: 12 },
];
const codes = (result) => result.checks.map((item) => item.code);
const taxRule = (year) => RULES.find((item) => item.id === 'us.state-return.nj.income-tax' && item.effectiveFrom === `${year}-01-01`).value;

test('New Jersey module is built and lists its questions and what it leaves out', () => {
  assert.equal(STATE.code, 'NJ');
  assert.equal(STATE.built, true);
  assert.equal(STATE.forms.nonresident, 'NJ-1040NR');
  assert.ok(STATE.questions.some((item) => item.id === 'njHealthCoverage'));
  assert.ok(STATE.notCovered.some((item) => /ANCHOR/.test(item)));
});

test('New Jersey tax table and rate schedules match the published examples', () => {
  const rule = taxRule(2025);
  assert.equal(njTax(39875, 'mfj', rule), 628);
  assert.equal(njTax(39875, 'single', rule), 713);
  assert.equal(njTax(99975, 'single', rule), 4242);
  assert.equal(njTax(100000, 'single', rule), 4244);
  assert.equal(njTax(1604000, 'single', rule), 139504);
  assert.equal(njTax(0, 'single', rule), 0);
});

test('New Jersey resident single: medical expenses over 2%, 18% of rent as a property tax deduction', async () => {
  const state = await household({ state: 'NJ', forms: [w2(60000, { state: 'NJ', stateWithheld: 1500 })], answers: { medicalExpenses: 2000 } });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'everyone-all-year', njRentPaid: 18000 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.form, 'NJ-1040');
  assert.equal(nj.lines['6'], 1000);
  assert.equal(nj.lines['15'], 60000);
  assert.equal(nj.lines['29'], 60000);
  assert.equal(nj.lines['31'], 800);
  assert.equal(nj.schedules.F['2'], 1200);
  assert.equal(nj.lines['38'], 1800);
  assert.equal(nj.lines['39'], 58200);
  assert.equal(nj.lines['40a'], 3240);
  assert.equal(nj.lines['41'], 3240);
  assert.equal(nj.lines['42'], 54960);
  assert.equal(nj.lines['43'], 1545);
  assert.equal(nj.schedules.H['6B'], 1724);
  assert.equal(nj.schedules.H.choice, 'deduction');
  assert.equal(nj.lines['56'], 0);
  assert.equal(nj.lines['54'], 1545);
  assert.equal(nj.lines['67'], 45);
  assert.equal(nj.owed, 45);
  assert.equal(nj.provisional, false);
});

test('New Jersey resident joint with two children: dependent exemptions, property tax deduction, NJEITC at 40% and the child tax credit', async () => {
  const state = await household({ state: 'NJ', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'NJ', stateWithheld: 200 }), w2(15000, { state: 'NJ', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'everyone-all-year', njPropertyTaxPaid: 6000 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.lines['6'], 2000);
  assert.equal(nj.lines['10'], 3000);
  assert.equal(nj.lines['13'], 5000);
  assert.equal(nj.lines['29'], 45000);
  assert.equal(nj.lines['39'], 40000);
  assert.equal(nj.lines['41'], 6000);
  assert.equal(nj.lines['42'], 34000);
  assert.equal(nj.lines['43'], 525);
  assert.equal(nj.schedules.H['6B'], 630);
  assert.equal(nj.schedules.H['7'], 105);
  assert.ok(nj.schedules.EITC.federalEitc > 0);
  assert.equal(nj.lines['58'], Math.round(nj.schedules.EITC.federalEitc * 0.4));
  assert.equal(nj.schedules.CTC.children, 1);
  assert.equal(nj.schedules.CTC.perChild, 800);
  assert.equal(nj.lines['65'], 800);
  assert.equal(nj.lines['55'], 300);
  assert.equal(nj.lines['66'], 300 + nj.lines['58'] + 800);
  assert.equal(nj.lines['68'], nj.lines['66'] - 525);
});

test('New Jersey 2026: the larger child tax credit, and the shared responsibility payment is provisional', async () => {
  const forms = [w2(30000, { state: 'NJ', stateWithheld: 200 }), w2(15000, { state: 'NJ', stateWithheld: 100, owner: 'spouse' })];
  const covered = await household({ taxYear: '2026', state: 'NJ', filingStatus: 'mfj', spouse, dependents: kids, forms });
  await residency(covered, '2026', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'everyone-all-year', njPropertyTaxPaid: 6000 } }]);
  const full = await stateReturn(covered, '2026', 'NJ');
  assert.equal(full.lines['43'], 525);
  assert.equal(full.lines['65'], 1000);
  assert.equal(full.lines['53c'], 0);
  assert.equal(full.provisional, false);
  const uncovered = await household({ taxYear: '2026', state: 'NJ', filingStatus: 'mfj', spouse, dependents: kids, forms });
  await residency(uncovered, '2026', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'not-everyone', njUncoveredAdultMonths: 6, njPropertyTaxPaid: 6000 } }]);
  const nj = await stateReturn(uncovered, '2026', 'NJ');
  assert.equal(nj.schedules.L.adults, 2);
  assert.equal(nj.schedules.L.children, 2);
  assert.equal(nj.lines['53c'], 348);
  assert.equal(nj.lines['54'], 525 + 348);
  assert.equal(nj.provisional, true);
  assert.ok(nj.rulesUsed.includes('us.state-return.nj.shared-responsibility@2026-01-01'));
});

test('New Jersey 2025 shared responsibility payment for six uncovered adult months', async () => {
  const state = await household({ state: 'NJ', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'NJ', stateWithheld: 200 }), w2(15000, { state: 'NJ', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'not-everyone', njUncoveredAdultMonths: 6, njPropertyTaxPaid: 6000 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.lines['53c'], 348);
  assert.equal(nj.provisional, false);
});

test('New Jersey senior: pension exclusion, other retirement income exclusion and the $50 property tax credit', async () => {
  const state = await household({ state: 'NJ', dateOfBirth: '1958-02-01', forms: [{ kind: '1099-R', fields: { grossDistribution: 60000, taxableAmount: 60000, distributionCode: '7' } }, { kind: '1099-INT', fields: { interest: 5000 } }] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 0, njHealthCoverage: 'everyone-all-year', njPropertyTaxPaid: 8000 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.lines['7'], 1000);
  assert.equal(nj.lines['13'], 2000);
  assert.equal(nj.lines['16a'], 5000);
  assert.equal(nj.lines['20a'], 60000);
  assert.equal(nj.lines['27'], 65000);
  assert.equal(nj.lines['28a'], 60000);
  assert.equal(nj.lines['28b'], 5000);
  assert.equal(nj.lines['29'], 0);
  assert.equal(nj.lines['43'], 0);
  assert.equal(nj.lines['56'], 50);
  assert.equal(nj.schedules.H.choice, 'credit');
  assert.equal(nj.refund, 50);
  assert.ok(!codes(nj).includes('NJ_EITC_AGE'));
});

test('New Jersey part-year resident: New Jersey wages, exemption and property tax credit test over six resident months', async () => {
  const state = await household({ state: 'NJ', forms: [w2(40000, { state: 'NJ', stateWithheld: 900 }), w2(40000, { state: 'IL', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'NJ', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { njUseTax: 0, njHealthCoverage: 'everyone-all-year', njRentPaid: 12000 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.residency, 'part-year');
  assert.equal(nj.schedules.partYear.months, 6);
  assert.equal(nj.schedules.partYear.wholeYearIncome, 80000);
  assert.equal(nj.lines['15'], 40000);
  assert.equal(nj.lines['29'], 40000);
  assert.equal(nj.lines['30'], 500);
  assert.equal(nj.lines['39'], 39500);
  assert.equal(nj.lines['41'], 2160);
  assert.equal(nj.lines['42'], 37340);
  assert.equal(nj.lines['43'], 624);
  assert.equal(nj.schedules.H['6B'], 701);
  assert.equal(nj.lines['68'], 276);
  assert.ok(codes(nj).includes('NJ_PART_YEAR'));
});

test('New Jersey nonresident: tax on income from everywhere times the New Jersey income percentage', async () => {
  const state = await household({ state: 'IL', forms: [w2(70000, { state: 'NJ', stateWithheld: 2000 }), w2(30000, { state: 'IL', stateWithheld: 1000 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year' }, { state: 'NJ', residency: 'nonresident', answers: { njUseTax: 0 } }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.form, 'NJ-1040NR');
  assert.equal(nj.lines['15A'], 100000);
  assert.equal(nj.lines['16A'], 1000);
  assert.equal(nj.lines['15B'], 70000);
  assert.equal(nj.lines['16B'], 0);
  assert.equal(nj.lines['29A'], 101000);
  assert.equal(nj.lines['29B'], 70000);
  assert.equal(nj.lines['39'], 100000);
  assert.equal(nj.lines['40'], 4244);
  assert.equal(nj.lines['41'], 0.6931);
  assert.equal(nj.lines['42'], 2942);
  assert.equal(nj.lines['58'], 942);
  assert.equal(nj.owed, 942);
});

test('New Jersey high income: top bracket, property tax deduction capped at $15,000 and Schedule NJ-COJ', async () => {
  const state = await household({ state: 'NJ', forms: [w2(1500000, { state: 'NJ', stateWithheld: 120000 }), w2(100000, { state: 'IL', stateWithheld: 4950 }), { kind: '1099-INT', fields: { interest: 20000 } }] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year', answers: { njUseTax: 25, njHealthCoverage: 'everyone-all-year', njPropertyTaxPaid: 22000, njOtherW2Wages: 100000 } }, { state: 'IL', residency: 'nonresident' }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.lines['15'], 1600000);
  assert.equal(nj.lines['29'], 1620000);
  assert.equal(nj.lines['40a'], 22000);
  assert.equal(nj.lines['41'], 15000);
  assert.equal(nj.lines['42'], 1604000);
  assert.equal(nj.lines['43'], 139504);
  const coj = nj.schedules['NJ-COJ'][0];
  assert.equal(coj.state, 'IL');
  assert.equal(coj['1'], 100000);
  assert.equal(coj['3'], 0.0617284);
  assert.equal(coj['8'], 8611);
  assert.equal(coj['9'], 4950);
  assert.equal(nj.lines['44'], 4950);
  assert.equal(nj.lines['45'], 134554);
  assert.equal(nj.lines['51'], 25);
  assert.equal(nj.lines['54'], 134579);
  assert.equal(nj.lines['67'], 14579);
  assert.equal(nj.lines['65'], 0);
});

test('New Jersey flags missing use tax and health coverage answers', async () => {
  const state = await household({ state: 'NJ', forms: [w2(60000, { state: 'NJ', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year' }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.ok(codes(nj).includes('NJ_USE_TAX'));
  assert.ok(codes(nj).includes('NJ_HEALTH_COVERAGE'));
  assert.ok(codes(nj).includes('NJ_PROPERTY_TAX'));
});

test('New Jersey rounds the tax once: the 2025 table rows that a cent rounding pushed up are exact', () => {
  const rule = taxRule('2025');
  assert.equal(njTax(78160, 'single', rule), 2853);
  assert.equal(njTax(88160, 'single', rule), 3490);
  assert.equal(njTax(98160, 'single', rule), 4127);
});

test('New Jersey: property tax on Form 1098 feeds the property tax deduction when no amount is given, with a warning to confirm it', async () => {
  const state = await household({ state: 'NJ', filingStatus: 'mfj', spouse, forms: [w2(120000, { state: 'NJ', stateWithheld: 4000 }), { kind: '1098', payer: 'Shore Bank', fields: { mortgageInterest: 9000, propertyTax: 5000 } }] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year' }]);
  const nj = await stateReturn(state, '2025', 'NJ');
  assert.equal(nj.lines['40a'], 5000);
  assert.ok(codes(nj).includes('NJ_PROPERTY_TAX_FROM_1098'));
});
