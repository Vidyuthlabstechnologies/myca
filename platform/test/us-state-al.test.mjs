import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { alTax, alStandardDeduction } from '../src/countries/united-states/states/al.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';

test('Alabama tax matches the printed 2025 tax table rows, the over $100,000 worksheet and the standard deduction chart', () => {
  const rule = stateRuleReader('AL', '2025').read('income-tax');
  const deductions = stateRuleReader('AL', '2025').read('deductions');
  assert.equal(alTax(25, rule, 'single'), 0);
  assert.equal(alTax(75, rule, 'mfj'), 1);
  assert.equal(alTax(150, rule, 'single'), 3);
  assert.equal(alTax(550, rule, 'single'), 12);
  assert.equal(alTax(550, rule, 'mfj'), 11);
  assert.equal(alTax(3050, rule, 'single'), 113);
  assert.equal(alTax(3050, rule, 'mfj'), 102);
  assert.equal(alTax(4050, rule, 'mfj'), 142);
  assert.equal(alTax(12550, rule, 'hoh'), 588);
  assert.equal(alTax(12550, rule, 'mfj'), 548);
  assert.equal(alTax(99950, rule, 'single'), 4958);
  assert.equal(alTax(99950, rule, 'mfj'), 4918);
  assert.equal(alTax(101000, rule, 'mfs'), 5008);
  assert.equal(alStandardDeduction(25999, 'mfj', deductions), 8500);
  assert.equal(alStandardDeduction(26000, 'mfj', deductions), 8325);
  assert.equal(alStandardDeduction(13000, 'mfs', deductions), 4162);
  assert.equal(alStandardDeduction(26500, 'hoh', deductions), 4930);
  assert.equal(alStandardDeduction(35000, 'single', deductions), 2525);
  assert.equal(alStandardDeduction(90000, 'single', deductions), 2500);
});

test('Alabama 2025 resident single: FICA itemized deduction beats the standard deduction, and the federal income tax is deducted', async () => {
  const state = await household({ state: 'AL', forms: [w2(40000, { state: 'AL', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'AL', residency: 'full-year', answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2025', 'AL');
  assert.equal(al.form, 'Form 40');
  assert.equal(al.lines['1'], 1500);
  assert.equal(al.lines['5b'], 40000);
  assert.equal(al.lines['10'], 40000);
  assert.equal(al.schedules.A['6'], 3060);
  assert.equal(al.lines['11'], 3060);
  assert.equal(al.lines['12'], 2675);
  assert.equal(al.lines['13'], 1500);
  assert.equal(al.lines['15'], 7235);
  assert.equal(al.lines['16'], 32765);
  assert.equal(al.lines['17'], 1598);
  assert.equal(al.totalTax, 1598);
  assert.equal(al.owed, 398);
  assert.equal(al.provisional, false);
});

test('Alabama 2025 joint retirees with a dependent: exempt pension, $6,000 retirement exclusion, dependent exemption and Schedule CR for South Carolina tax', async () => {
  const state = await household({
    state: 'AL', filingStatus: 'mfj', dateOfBirth: '1955-02-01',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1958-04-04' },
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2010-05-05', months: 12 }],
    forms: [w2(20000, { state: 'AL', stateWithheld: 1800 }), w2(40000, { state: 'SC', stateWithheld: 300 }), { kind: '1099-R', owner: 'spouse', fields: { grossDistribution: 20000, taxableAmount: 20000, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 12000 } }],
  });
  await residency(state, '2025', [{ state: 'AL', residency: 'full-year', answers: { exemptRetirement: 0, spouseExemptRetirement: 5000, useTax: 0 } }, { state: 'SC', residency: 'nonresident', answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2025', 'AL');
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(al.lines['2'], 3000);
  assert.equal(al.lines['5b'], 60000);
  assert.equal(al.schedules.RS.spouseTaxable, 15000);
  assert.equal(al.schedules.RS.spouseExclusion, 6000);
  assert.equal(al.lines['7'], 9000);
  assert.equal(al.lines['10'], 69000);
  assert.equal(al.lines['11'], 5000);
  assert.equal(al.lines['12'], 2546);
  assert.equal(al.lines['14'], 500);
  assert.equal(al.lines['16'], 57954);
  assert.equal(al.lines['17'], 2818);
  assert.equal(sc.schedules.NR['45'], 0.4435);
  assert.equal(sc.schedules.NR['47'], 14724);
  assert.equal(sc.totalTax, 579);
  assert.equal(al.schedules['CR SC'].limit, 1634);
  assert.equal(al.otherStateCredit, 579);
  assert.equal(al.lines['18'], 2239);
  assert.equal(al.owed, 439);
});

test('Alabama 2025 part-year resident: income while a resident, full standard deduction and exemptions, federal tax deduction by the AGI ratio', async () => {
  const state = await household({ state: 'AL', forms: [w2(30000, { state: 'AL', stateWithheld: 700 }), w2(30000, { state: 'GA' })] });
  await residency(state, '2025', [{ state: 'GA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'AL', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 }, answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2025', 'AL');
  assert.equal(al.form, 'Form 40');
  assert.equal(al.lines['10'], 30000);
  assert.equal(al.lines['11'], 2775);
  assert.equal(al.lines['12'], 2538);
  assert.equal(al.lines['16'], 23187);
  assert.equal(al.lines['17'], 1118);
  assert.equal(al.owed, 418);
});

test('Alabama 2025 nonresident: Form 40NR prorates deductions, federal tax and exemption by the Alabama percentage', async () => {
  const state = await household({ state: 'TX', forms: [w2(60000, { state: 'TX' }), w2(40000, { state: 'AL', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'full-year' }, { state: 'AL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2025', 'AL');
  assert.equal(al.form, 'Form 40NR');
  assert.equal(al.lines['9B'], 100000);
  assert.equal(al.lines['9C'], 40000);
  assert.equal(al.lines['10'], 0.4);
  assert.equal(al.lines['13'], 3060);
  assert.equal(al.lines['14'], 5382);
  assert.equal(al.lines['15'], 600);
  assert.equal(al.lines['17'], 9042);
  assert.equal(al.lines['18'], 30958);
  assert.equal(al.lines['19'], 1508);
  assert.equal(al.owed, 508);
});

test('Alabama 2025 high income joint: itemized deductions with mortgage, property tax and FICA, and the over $100,000 worksheet', async () => {
  const state = await household({ state: 'AL', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1985-09-09' }, forms: [w2(250000, { state: 'AL', stateWithheld: 10000 }), { kind: '1098', fields: { mortgageInterest: 18000, propertyTax: 4000 } }] });
  await residency(state, '2025', [{ state: 'AL', residency: 'full-year', answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2025', 'AL');
  assert.equal(al.schedules.A['5'], 4000);
  assert.equal(al.schedules.A['6'], 19125);
  assert.equal(al.schedules.A['10a'], 18000);
  assert.equal(al.lines['11'], 41125);
  assert.equal(al.lines['12'], 38014);
  assert.equal(al.lines['14'], 0);
  assert.equal(al.lines['16'], 167861);
  assert.equal(al.lines['17'], 8311);
});

test('Alabama 2026: statutory amounts are unchanged and qualified overtime up to $1,000 is deducted (Act 2026, HB527)', async () => {
  const state = await household({ taxYear: '2026', state: 'AL', forms: [w2(50000, { state: 'AL', stateWithheld: 1500 })], answers: { qualifiedOvertime: 3000 } });
  await residency(state, '2026', [{ state: 'AL', residency: 'full-year', answers: { useTax: 0 } }]);
  const al = await stateReturn(state, '2026', 'AL');
  assert.equal(al.lines.overtimeDeduction, 1000);
  assert.equal(al.lines['15'], al.lines['11'] + al.lines['12'] + al.lines['13'] + al.lines['14'] + 1000);
  assert.equal(al.lines['16'], 50000 - al.lines['15']);
  assert.equal(al.provisional, false);
  assert.ok(al.checks.some((item) => item.code === 'AL_2026_FORM_PENDING'));
});

test('Alabama pensions block filing until the exempt part is answered', async () => {
  const state = await household({ state: 'AL', forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000, distributionCode: '7' } }] });
  const al = await stateReturn(state, '2025', 'AL');
  assert.ok(al.checks.some((item) => item.code === 'AL_EXEMPT_RETIREMENT' && item.level === 'error'));
  await residency(state, '2025', [{ state: 'AL', residency: 'full-year', answers: { exemptRetirement: 30000, useTax: 0 } }]);
  const after = await stateReturn(state, '2025', 'AL');
  assert.equal(after.lines['7'], 0);
  assert.ok(!after.checks.some((item) => item.level === 'error'));
});
