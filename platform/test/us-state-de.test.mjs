import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2016-05-05', months: 12 }];

test('Delaware resident single: tax table midpoint, standard deduction, personal credit and the April 30 due date', async () => {
  const state = await household({ state: 'DE', forms: [w2(50000, { state: 'DE', stateWithheld: 2000 })] });
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.form, 'PIT-RES');
  assert.equal(de.lines['12'], 50000);
  assert.equal(de.lines['20'], 3250);
  assert.equal(de.lines['23'], 46750);
  assert.equal(de.lines['24'], 2210);
  assert.equal(de.lines['27a'], 110);
  assert.equal(de.lines['33'], 2100);
  assert.equal(de.totalTax, 2100);
  assert.equal(de.owed, 100);
  assert.equal(de.due, '2026-04-30');
});

test('Delaware resident joint with two children: personal credits, firefighter and child care credits limited to the tax, refundable EITC', async () => {
  const state = await household({ state: 'DE', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(40000, { state: 'DE', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'DE', residency: 'full-year', answers: { federalChildCareCredit: 600, volunteerFirefighters: 1 } }]);
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.lines['20'], 6500);
  assert.equal(de.lines['23'], 33500);
  assert.equal(de.lines['24'], 1474);
  assert.equal(de.lines['27a'], 440);
  assert.equal(de.lines['29'], 1000);
  assert.equal(de.lines['31'], 300);
  assert.equal(de.lines['32'], 1474);
  assert.equal(de.lines['33'], 0);
  const federalEic = de.schedules['PIT-RSS'].eitc.federalEic;
  assert.equal(de.lines['34'], Math.round(federalEic * 0.045));
  assert.equal(de.refundableCredits[0].code, 'DE_EITC_REFUNDABLE');
  assert.equal(de.refund, 900 + de.lines['34']);
});

test('Delaware non-refundable 20% EITC is chosen when it is worth more than the refundable 4.5%', async () => {
  const state = await household({ state: 'DE', filingStatus: 'hoh', dependents: [kids[0]], forms: [w2(30000, { state: 'DE', stateWithheld: 900 })] });
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.lines['23'], 26750);
  assert.equal(de.lines['24'], 1100);
  assert.equal(de.lines['33'], 1100 - 220);
  const eitc = de.schedules['PIT-RSS'].eitc;
  assert.equal(eitc.chosen, 'nonrefundable');
  assert.equal(de.lines['34'], Math.min(880, Math.round(eitc.federalEic * 0.2)));
  assert.equal(de.totalTax, 880 - de.lines['34']);
  assert.deepEqual(de.refundableCredits, []);
});

test('Delaware seniors: pension exclusion with eligible retirement income, 60-and-over exclusion and additional standard deductions', async () => {
  const state = await household({ state: 'DE', filingStatus: 'mfj', dateOfBirth: '1958-01-01', spouse: { ...spouse, dateOfBirth: '1959-02-02' }, forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000 } }, { kind: '1099-R', owner: 'spouse', fields: { grossDistribution: 8000, taxableAmount: 8000, iraSepSimple: true } }, { kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-INT', owner: 'spouse', fields: { interest: 3000, treasuryInterest: 500 } }] });
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.lines['1'], 58125);
  assert.equal(de.lines['5'], 500);
  assert.equal(de.lines['6'], 12500 + 11000);
  assert.equal(de.lines['8a'], 16625);
  assert.equal(de.lines['10'], 17500);
  assert.equal(de.lines['11'], 4000);
  assert.equal(de.lines['12'], 13500);
  assert.equal(de.lines['21'], 5000);
  assert.equal(de.lines['23'], 2000);
  assert.equal(de.lines['24'], 1);
  assert.equal(de.lines['27b'], 220);
  assert.equal(de.totalTax, 0);
});

test('Delaware pension exclusion under 60: $2,000 for an employer pension, up to $12,500 for a military pension', async () => {
  const state = await household({ state: 'DE', dateOfBirth: '1970-01-01', forms: [w2(20000, { state: 'DE', stateWithheld: 500 }), { kind: '1099-R', fields: { grossDistribution: 20000, taxableAmount: 20000 } }] });
  const civil = await stateReturn(state, '2025', 'DE');
  assert.equal(civil.lines['6'], 2000);
  await residency(state, '2025', [{ state: 'DE', residency: 'full-year', answers: { militaryPension: 20000 } }]);
  const military = await stateReturn(state, '2025', 'DE');
  assert.equal(military.lines['6'], 12500);
  assert.equal(military.lines['12'], 27500);
});

test('Delaware part-year resident: PIT-NON prorates the tax and personal credit by Delaware income over total income', async () => {
  const state = await household({ state: 'DE', forms: [w2(40000, { state: 'IL', stateWithheld: 1500 }), w2(40000, { state: 'DE', stateWithheld: 1800 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'DE', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.form, 'PIT-NON');
  assert.equal(de.lines['30a'], 40000);
  assert.equal(de.lines['30b'], 80000);
  assert.equal(de.lines['39'], 3250);
  assert.equal(de.lines['42'], 76750);
  assert.equal(de.lines['43tax'], 4049);
  assert.equal(de.lines['43decimal'], 0.5);
  assert.equal(de.lines['43'], 2025);
  assert.equal(de.lines['44a'], 55);
  assert.equal(de.lines['48'], 1970);
  assert.equal(de.owed, 170);
});

test('Delaware nonresident: Delaware-source wages set the proration decimal', async () => {
  const state = await household({ state: 'IL', forms: [w2(60000, { state: 'IL', stateWithheld: 2900 }), w2(20000, { state: 'DE', stateWithheld: 700 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0 } }, { state: 'DE', residency: 'nonresident' }]);
  const de = await stateReturn(state, '2025', 'DE');
  assert.equal(de.lines['43decimal'], 0.25);
  assert.equal(de.lines['43'], 1012);
  assert.equal(de.lines['44a'], 28);
  assert.equal(de.totalTax, 984);
  assert.equal(de.owed, 284);
});

test('Delaware high income: top rate, itemized deductions without income taxes and credit for tax paid to another state', async () => {
  const state = await household({ state: 'DE', forms: [w2(500000, { state: 'DE', stateWithheld: 30000 }), w2(50000, { state: 'IL', stateWithheld: 2400 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 9000 } }] });
  await residency(state, '2025', [{ state: 'DE', residency: 'full-year' }, { state: 'IL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const de = await stateReturn(state, '2025', 'DE');
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(de.lines['13'], 39000);
  assert.equal(de.lines['20'], 39000);
  assert.equal(de.lines['23'], 511000);
  assert.equal(de.lines['24'], 32710);
  assert.equal(il.totalTax, 2475);
  assert.equal(de.lines['28'], 2475);
  assert.equal(de.totalTax, 32710 - 110 - 2475);
});

test('Delaware 2026 figures are statutory, so the return is not provisional apart from the itemized cap', async () => {
  const state = await household({ taxYear: '2026', state: 'DE', forms: [w2(50000, { state: 'DE', stateWithheld: 2000 })] });
  const de = await stateReturn(state, '2026', 'DE');
  assert.equal(de.lines['24'], 2210);
  assert.equal(de.due, '2027-04-30');
  assert.equal(de.provisional, false);
  const owner = await household({ taxYear: '2026', state: 'DE', forms: [w2(50000, { state: 'DE', stateWithheld: 2000 }), { kind: '1098', fields: { mortgageInterest: 9000, propertyTax: 3000 } }] });
  const itemizer = await stateReturn(owner, '2026', 'DE');
  assert.equal(itemizer.lines['20'], 12000);
  assert.equal(itemizer.provisional, true);
});
