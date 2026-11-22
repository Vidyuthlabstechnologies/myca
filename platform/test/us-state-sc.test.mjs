import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { scTax } from '../src/countries/united-states/states/sc.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1985-09-09' };

test('South Carolina tax follows the printed SC1040TT table rows and the $100,000 rate schedule for 2025 and 2026', () => {
  const r2025 = stateRuleReader('SC', '2025').read('income-tax');
  const r2026 = stateRuleReader('SC', '2026').read('income-tax');
  assert.equal(scTax(6260, r2025), 81);
  assert.equal(scTax(11550, r2025), 240);
  assert.equal(scTax(17599, r2025), 420);
  assert.equal(scTax(22500, r2025), 711);
  assert.equal(scTax(23450, r2025), 765);
  assert.equal(scTax(99950, r2025), 5355);
  assert.equal(scTax(101000, r2025), 5418);
  assert.equal(scTax(3070, r2026), 61);
  assert.equal(scTax(17000, r2026), 339);
  assert.equal(scTax(99999, r2026), 4241);
  assert.equal(scTax(101000, r2026), 4296);
});

test('South Carolina 2025 resident single: federal taxable income plus the unadopted standard deduction increase, less U.S. interest, on the tax table', async () => {
  const state = await household({ state: 'SC', forms: [w2(50000, { state: 'SC', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 100, treasuryInterest: 400 } }] });
  await residency(state, '2025', [{ state: 'SC', residency: 'full-year', answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(sc.status, 'computed');
  assert.equal(sc.form, 'SC1040');
  assert.equal(sc.lines['1'], 34750);
  assert.equal(sc.lines.e, 750);
  assert.equal(sc.lines['3'], 35500);
  assert.equal(sc.lines.m, 400);
  assert.equal(sc.lines['4'], 400);
  assert.equal(sc.lines['5'], 35100);
  assert.equal(sc.lines['6'], 1467);
  assert.equal(sc.lines['15'], 1467);
  assert.equal(sc.totalTax, 1467);
  assert.equal(sc.refund, 533);
  assert.equal(sc.provisional, false);
  assert.ok(sc.checks.some((item) => item.code === 'SC_FEDERAL_CHANGES_ADDED_BACK'));
});

test('South Carolina 2025 joint return with children: dependent exemptions, under-6 deduction, child care and two wage earner credits', async () => {
  const state = await household({
    state: 'SC', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2022-03-01', months: 12 }, { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2017-05-01', months: 12 }],
    forms: [w2(70000, { state: 'SC', stateWithheld: 2500 }), w2(25000, { state: 'SC', owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'SC', residency: 'full-year', answers: { careExpenses: 4000, useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(sc.lines['1'], 63500);
  assert.equal(sc.lines.e, 1500);
  assert.equal(sc.lines['3'], 65000);
  assert.equal(sc.lines.t, 4930);
  assert.equal(sc.lines.w, 9860);
  assert.equal(sc.lines['4'], 14790);
  assert.equal(sc.lines['5'], 50210);
  assert.equal(sc.lines['6'], 2373);
  assert.equal(sc.lines['11'], 280);
  assert.equal(sc.lines['12'], 175);
  assert.equal(sc.lines['14'], 455);
  assert.equal(sc.lines['15'], 1918);
  assert.equal(sc.refund, 582);
  assert.equal(sc.schedules['Two wage earner worksheet']['6'], 25000);
});

test('South Carolina 2025 part-year resident: Schedule NR prorates the standard deduction less the unadopted increase by line 45', async () => {
  const state = await household({ state: 'SC', forms: [w2(30000, { state: 'SC', stateWithheld: 900 }), w2(30000, { state: 'GA' })] });
  await residency(state, '2025', [{ state: 'GA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'SC', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 }, answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(sc.form, 'SC1040');
  const nr = sc.schedules.NR;
  assert.equal(nr['1A'], 60000);
  assert.equal(nr['1B'], 30000);
  assert.equal(nr['31A'], 60000);
  assert.equal(nr['31B'], 30000);
  assert.equal(nr['44'], 30000);
  assert.equal(nr['45'], 0.5);
  assert.equal(nr['46'], 15000);
  assert.equal(nr['47'], 7500);
  assert.equal(nr['48'], 22500);
  assert.equal(sc.lines['5'], 22500);
  assert.equal(sc.lines['6'], 711);
  assert.equal(sc.totalTax, 711);
  assert.equal(sc.refund, 189);
  assert.ok(sc.checks.some((item) => item.code === 'SC_PART_YEAR_OTHER_STATE_CREDIT'));
});

test('South Carolina 2025 nonresident: South Carolina wages over federal AGI sets the proration on line 45', async () => {
  const state = await household({ state: 'TX', forms: [w2(20000, { state: 'TX' }), w2(40000, { state: 'SC', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'full-year' }, { state: 'SC', residency: 'nonresident', answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  const nr = sc.schedules.NR;
  assert.equal(nr['31B'], 40000);
  assert.equal(nr['45'], 0.6667);
  assert.equal(nr['47'], 10001);
  assert.equal(nr['48'], 29999);
  assert.equal(sc.lines['6'], 1155);
  assert.equal(sc.refund, 345);
});

test('South Carolina 2025 high income: rate schedule above $100,000 and the SC1040TC credit for tax paid to Alabama as a nonresident', async () => {
  const state = await household({ state: 'SC', forms: [w2(250000, { state: 'SC', stateWithheld: 12000 }), w2(50000, { state: 'AL', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'SC', residency: 'full-year', answers: { useTax: 0 } }, { state: 'AL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  const al = await stateReturn(state, '2025', 'AL');
  assert.equal(sc.lines['5'], 285000);
  assert.equal(sc.lines['6'], 16458);
  assert.equal(al.totalTax, 1683);
  const sheet = sc.schedules['SC1040TC worksheet AL'];
  assert.equal(sheet['1'], 300000);
  assert.equal(sheet['2'], 50000);
  assert.equal(sheet['3'], 0.1667);
  assert.equal(sheet['5'], 2744);
  assert.equal(sheet['7'], 1683);
  assert.equal(sc.lines['13'], 1683);
  assert.equal(sc.totalTax, 16458 - 1683);
});

test('South Carolina 2026 resident joint return: starts from federal AGI with the phased-out SCIAD and the two-bracket table (Act 110 of 2026)', async () => {
  const state = await household({
    taxYear: '2026', state: 'SC', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2022-01-15', months: 12 }],
    forms: [w2(90000, { state: 'SC', stateWithheld: 3500 }), w2(30000, { state: 'SC', owner: 'spouse' })],
  });
  await residency(state, '2026', [{ state: 'SC', residency: 'full-year', answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2026', 'SC');
  assert.equal(sc.lines['1'], 120000);
  assert.equal(sc.lines['4'], 19100);
  assert.equal(sc.schedules.ADJ['2b'], 5040);
  assert.equal(sc.schedules.ADJ['2c'], 5040);
  assert.equal(sc.lines['5'], 10080);
  assert.equal(sc.lines['6'], 29180);
  assert.equal(sc.lines['7'], 90820);
  assert.equal(sc.lines['8a'], 3767);
  assert.equal(sc.lines['12'], 210);
  assert.equal(sc.lines['15'], 3557);
  assert.equal(sc.provisional, false);
});

test('South Carolina 2026 head of household: the nonrefundable EITC is capped at $200 and by the tax', async () => {
  const state = await household({
    taxYear: '2026', state: 'SC', filingStatus: 'hoh',
    dependents: [{ firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2022-06-01', months: 12 }],
    forms: [w2(40000, { state: 'SC', stateWithheld: 300 })],
  });
  await residency(state, '2026', [{ state: 'SC', residency: 'full-year', answers: { useTax: 0 } }]);
  const sc = await stateReturn(state, '2026', 'SC');
  assert.equal(sc.lines['4'], 22500);
  assert.equal(sc.lines['5'], 10080);
  assert.equal(sc.lines['7'], 7420);
  assert.equal(sc.lines['8a'], 148);
  assert.equal(sc.lines['10'], 148);
  assert.equal(sc.lines['15'], 0);
  assert.equal(sc.refund, 300);
});

test('South Carolina 2025 retiree over 65: retirement deduction, age 65 deduction and Social Security subtraction, and the out-of-state bond interest question blocks filing until answered', async () => {
  const state = await household({ state: 'SC', dateOfBirth: '1955-03-03', forms: [{ kind: '1099-R', fields: { grossDistribution: 14000, taxableAmount: 14000, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 20000 } }, { kind: '1099-INT', fields: { interest: 1000, taxExemptInterest: 500 } }] });
  const before = await stateReturn(state, '2025', 'SC');
  assert.ok(before.checks.some((item) => item.code === 'SC_MUNICIPAL_INTEREST' && item.level === 'error'));
  await residency(state, '2025', [{ state: 'SC', residency: 'full-year', answers: { scMunicipalInterest: 500, militaryRetirement: 0, useTax: 0 } }]);
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(sc.lines.d, 500);
  assert.equal(sc.lines['p-1'], 10000);
  assert.equal(sc.lines['q-1'], 5000);
  assert.equal(sc.lines.o, sc.sourcedIncome.socialSecurityTaxable);
  assert.ok(!sc.checks.some((item) => item.level === 'error'));
});
