import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };
const olderSpouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1952-06-01' };
const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2016-03-05', months: 12 }];
const provider = (amountPaid, qualifyingPerson) => ({ kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Steps', fields: { amountPaid, qualifyingPerson } });

test('Louisiana resident single: 3% of income after the $12,500 standard deduction, U.S. interest exempt and use tax added', async () => {
  const state = await household({ state: 'LA', forms: [w2(50000, { state: 'LA', stateWithheld: 1200 }), { kind: '1099-INT', fields: { interest: 300, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 20 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  assert.equal(la.form, 'IT-540');
  assert.equal(la.schedules['Schedule E']['1'], 50500);
  assert.equal(la.schedules['Schedule E']['01E'], 200);
  assert.equal(la.schedules['Schedule E']['5'], 50300);
  assert.equal(la.lines['7'], 50300);
  assert.equal(la.lines['8'], 12500);
  assert.equal(la.lines['10'], 37800);
  assert.equal(la.lines['11'], 1134);
  assert.equal(la.lines['22'], 1134);
  assert.equal(la.lines['23A'], 20);
  assert.equal(la.lines['24'], 1154);
  assert.equal(la.totalTax, 1154);
  assert.equal(la.refund, 46);
  assert.equal(la.due, '2026-05-15');
  assert.equal(la.provisional, false);
});

test('Louisiana resident joint with low income: refundable child care credit from the federal Form 2441 lines and 5% earned income credit', async () => {
  const state = await household({ state: 'LA', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(18000, { state: 'LA', stateWithheld: 200 }), w2(4000, { state: 'LA', stateWithheld: 100, owner: 'spouse' }), provider(3000, 'Leo')] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  const care = la.schedules['Refundable child care worksheet'];
  assert.equal(care['6'], 3000);
  assert.equal(care['8'], 0.31);
  assert.equal(care['9'], 930);
  assert.equal(la.lines['14'], 465);
  assert.equal(la.lines['14A'], 3000);
  assert.equal(la.lines['16'], 358);
  assert.equal(la.lines['18'], 823);
  assert.equal(la.lines['20'], 823);
  assert.equal(la.lines['24'], 0);
  assert.equal(la.totalTax, 0);
  assert.equal(la.refund, 1123);
});

test('Louisiana resident joint with children above $25,000: START exemption, Schedule J child care credit at 10% and earned income credit', async () => {
  const state = await household({ state: 'LA', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(40000, { state: 'LA', stateWithheld: 900 }), w2(12000, { state: 'LA', stateWithheld: 200, owner: 'spouse' }), provider(6000, 'Leo')] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0, startContributions: 3000, startBeneficiaries: 1 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  assert.equal(la.schedules['Schedule E']['09E'], 3000);
  assert.equal(la.lines['7'], 49000);
  assert.equal(la.lines['8'], 25000);
  assert.equal(la.lines['11'], 720);
  assert.equal(la.lines['16'], 131);
  assert.equal(la.lines['19'], 589);
  assert.equal(la.schedules['Schedule J']['1'], 1200);
  assert.equal(la.lines['21'], 120);
  assert.equal(la.lines['22'], 469);
  assert.equal(la.lines['24'], 469);
  assert.equal(la.refund, 631);
});

test('Louisiana retirees 65 or older: federal retirement exempt, $12,000 annual retirement exemption for each spouse and Social Security exempt', async () => {
  const state = await household({ state: 'LA', filingStatus: 'mfj', dateOfBirth: '1955-01-10', spouse: olderSpouse, forms: [{ kind: '1099-R', owner: 'taxpayer', fields: { grossDistribution: 50000, taxableAmount: 50000, distributionCode: '7' } }, { kind: '1099-R', owner: 'spouse', fields: { grossDistribution: 8000, taxableAmount: 8000, iraSepSimple: true, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 30000 } }] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0, federalRetirement: 5000 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  const [taxpayer, spouseRow] = la.schedules['Code 06E worksheet'];
  assert.equal(taxpayer['3'], 45000);
  assert.equal(taxpayer['5'], 12000);
  assert.equal(spouseRow['5'], 8000);
  assert.equal(la.schedules['Schedule E']['04E'], 5000);
  assert.equal(la.schedules['Schedule E']['06E'], 20000);
  assert.equal(la.schedules['Schedule E']['07E'], 25500);
  assert.equal(la.schedules['Schedule E']['5'], 33000);
  assert.equal(la.lines['10'], 8000);
  assert.equal(la.lines['11'], 240);
  assert.equal(la.totalTax, 240);
});

test('Louisiana part-year resident: IT-540B ratio truncated to two decimals and the full standard deduction', async () => {
  const state = await household({ state: 'LA', forms: [w2(30000, { state: 'TX' }), w2(30000, { state: 'LA', stateWithheld: 500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'TX', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'LA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { taxableInterest: 400 }, answers: { useTax: 0 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  assert.equal(la.form, 'IT-540B');
  assert.equal(la.schedules['NPR worksheet']['12.federal'], 61000);
  assert.equal(la.schedules['NPR worksheet']['21'], 30400);
  assert.equal(la.lines['7'], 61000);
  assert.equal(la.lines['8'], 30400);
  assert.equal(la.lines['9'], 49.83);
  assert.equal(la.lines['10'], 12500);
  assert.equal(la.lines['12'], 17900);
  assert.equal(la.lines['13'], 537);
  assert.equal(la.lines['25'], 537);
  assert.equal(la.owed, 37);
  assert.ok(la.checks.some((item) => item.code === 'LA_PART_YEAR_CHOICE'));
});

test('Louisiana nonresident from Alabama: Louisiana wages only, ratio 66.66%', async () => {
  const state = await household({ state: 'AL', forms: [w2(40000, { state: 'LA', stateWithheld: 900 }), w2(20000, { state: 'AL' })] });
  await residency(state, '2025', [{ state: 'AL', residency: 'full-year' }, { state: 'LA', residency: 'nonresident', answers: { useTax: 0 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  assert.equal(la.lines['8'], 40000);
  assert.equal(la.lines['9'], 66.66);
  assert.equal(la.lines['12'], 27500);
  assert.equal(la.lines['13'], 825);
  assert.equal(la.totalTax, 825);
  assert.equal(la.refund, 75);
});

test('Louisiana resident with Alabama wages: Form R-10606 credit for taxes paid to other states', async () => {
  const state = await household({ state: 'LA', forms: [w2(50000, { state: 'LA', stateWithheld: 1200 }), w2(25000, { state: 'AL', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0 } }, { state: 'AL', residency: 'nonresident' }]);
  const al = await stateReturn(state, '2025', 'AL');
  const la = await stateReturn(state, '2025', 'LA');
  const row = la.schedules['R-10606'][0];
  assert.equal(row['2'], 25000);
  assert.equal(row['3'], 33.33);
  assert.equal(row['4'], 4166);
  assert.equal(row['5'], 20834);
  assert.equal(row['6'], 33.33);
  assert.equal(row['7'], 625);
  assert.equal(row['8'], al.totalTax);
  assert.equal(la.lines['11'], 1875);
  assert.equal(la.lines['12'], Math.min(625, al.totalTax));
  assert.equal(la.lines['13'], 1875 - la.lines['12']);
});

test('Louisiana high-income itemizer: only federal medical deductions above the federal standard deduction reduce income', async () => {
  const state = await household({ state: 'LA', forms: [w2(300000, { state: 'LA', stateWithheld: 9000 })], answers: { medicalExpenses: 40000 } });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0 } }]);
  const la = await stateReturn(state, '2025', 'LA');
  assert.equal(la.lines['9B'], 17500);
  assert.equal(la.lines['9C'], 15750);
  assert.equal(la.lines['9D'], 1750);
  assert.equal(la.lines['10'], 285750);
  assert.equal(la.lines['11'], 8573);
  assert.equal(la.totalTax, 8573);
  assert.equal(la.refund, 427);
});

test('Louisiana 2026: inflation-adjusted standard deduction of $12,875 published by LDR', async () => {
  const state = await household({ taxYear: '2026', state: 'LA', forms: [w2(50000, { state: 'LA', stateWithheld: 1200 })] });
  await residency(state, '2026', [{ state: 'LA', residency: 'full-year', answers: { useTax: 0 } }]);
  const la = await stateReturn(state, '2026', 'LA');
  assert.equal(la.lines['8'], 12875);
  assert.equal(la.lines['10'], 37125);
  assert.equal(la.lines['11'], 1114);
  assert.equal(la.due, '2027-05-15');
  assert.equal(la.provisional, false);
  assert.deepEqual(la.missingRules, []);
});

test('Louisiana labels every line of a resident Form IT-540', async () => {
  const state = await household({ state: 'LA', forms: [w2(60000, { state: 'LA', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'LA', residency: 'full-year' }]);
  const la = await stateReturn(state, '2025', 'LA');
  for (const key of Object.keys(la.lines)) assert.ok(typeof la.labels[key] === 'string' && la.labels[key].length > 0, key);
});

test('Louisiana asks the exempt retirement questions only when there is retirement income, and the START count only after START contributions', async () => {
  const plain = await household({ state: 'LA', forms: [w2(60000, { state: 'LA' })] });
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'LA' })).data.states[0].questions.map((item) => item.id);
  const first = await ids(plain);
  assert.equal(first.includes('teacherRetirement'), false);
  assert.equal(first.includes('spouseExemptRetirement'), false);
  assert.equal(first.includes('startBeneficiaries'), false);
  assert.equal(first.includes('louisianaRentalIncome'), false);
  await runTool(plain, 'set_us_state_answers', { taxYear: '2025', state: 'LA', answers: { startContributions: 1000 } });
  assert.ok((await ids(plain)).includes('startBeneficiaries'));
  const retired = await household({ state: 'LA', forms: [w2(20000, { state: 'LA' }), { kind: '1099-R', fields: { grossDistribution: 20000, taxableAmount: 20000 } }] });
  assert.ok((await ids(retired)).includes('teacherRetirement'));
});
