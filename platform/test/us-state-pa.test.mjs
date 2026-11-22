import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { STATE } from '../src/countries/united-states/states/pa.mjs';

const spouse = { firstName: 'Sam', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-01-05' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-3458', relationship: 'son', dateOfBirth: '2022-03-01', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-3459', relationship: 'daughter', dateOfBirth: '2017-05-01', months: 12 },
];
const codes = (result) => result.checks.map((item) => item.code);
const errors = (result) => result.checks.filter((item) => item.level === 'error').map((item) => item.code);

test('Pennsylvania module is built and lists its questions and what it leaves out', () => {
  assert.equal(STATE.code, 'PA');
  assert.equal(STATE.built, true);
  assert.equal(STATE.forms.resident, 'PA-40');
  assert.ok(STATE.questions.some((item) => item.id === 'paUseTax'));
  assert.ok(STATE.notCovered.some((item) => /local earned income tax/i.test(item)));
});

test('Pennsylvania resident single: W-2 box 16 compensation, U.S. Treasury interest exempt, 3.07% flat tax', async () => {
  const state = await household({ state: 'PA', forms: [w2(50000, { state: 'PA', stateWages: 51000, stateWithheld: 1535 }), { kind: '1099-INT', fields: { interest: 400, treasuryInterest: 100 } }] });
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0 } }]);
  const pa = await stateReturn(state, '2025', 'PA');
  assert.equal(pa.form, 'PA-40');
  assert.equal(pa.lines['1a'], 51000);
  assert.equal(pa.lines['1c'], 51000);
  assert.equal(pa.lines['2'], 400);
  assert.equal(pa.lines['9'], 51400);
  assert.equal(pa.lines['11'], 51400);
  assert.equal(pa.lines['12'], 1578);
  assert.equal(pa.lines['13'], 1535);
  assert.equal(pa.lines['21'], 0);
  assert.equal(pa.lines['26'], 43);
  assert.equal(pa.owed, 43);
  assert.equal(pa.schedules.SP['2'], 100);
  assert.equal(pa.schedules.SP['15'], 0);
  assert.ok(codes(pa).includes('PA_LOCAL_EIT'));
  assert.deepEqual(errors(pa), []);
  assert.equal(pa.provisional, false);
});

test('Pennsylvania joint with two children: Schedule O 529 deduction, Schedule SP at 10%, Working Pennsylvanians Tax Credit', async () => {
  const state = await household({ state: 'PA', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'PA', stateWithheld: 921 }), w2(4000, { state: 'PA', stateWithheld: 123, owner: 'spouse' }), { kind: '1099-INT', fields: { interest: 150 } }] });
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0, paOtherEligibilityIncome: 0, paTuitionContributions: 2000 } }]);
  const pa = await stateReturn(state, '2025', 'PA');
  assert.equal(pa.lines['1c'], 34000);
  assert.equal(pa.lines['2'], 150);
  assert.equal(pa.lines['9'], 34150);
  assert.equal(pa.lines['10'], 2000);
  assert.equal(pa.schedules.O['2'], 2000);
  assert.equal(pa.lines['11'], 32150);
  assert.equal(pa.lines['12'], 987);
  assert.equal(pa.lines['13'], 1044);
  assert.equal(pa.lines['19b'], 2);
  assert.equal(pa.schedules.SP.status, 'married');
  assert.equal(pa.schedules.SP['11'], 34150);
  assert.equal(pa.schedules.SP['15'], 0.1);
  assert.equal(pa.lines['20'], 34150);
  assert.equal(pa.lines['21'], 99);
  assert.equal(pa.lines['24'], 1143);
  assert.equal(pa.lines['29'], 156);
  assert.ok(pa.schedules.WPTC.federalEitc > 0);
  assert.equal(pa.schedules.WPTC.credit, Math.round(pa.schedules.WPTC.federalEitc / 10));
  assert.equal(pa.refundableCredits[0].code, 'PA_WPTC');
  assert.equal(pa.totalTax, 987 - 99);
});

test('Pennsylvania Schedule SP: full forgiveness for a single filer at the $6,500 eligibility income limit, none above $8,750', async () => {
  const low = await household({ state: 'PA', forms: [w2(6500, { state: 'PA', stateWithheld: 200 })] });
  await residency(low, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0, paOtherEligibilityIncome: 0 } }]);
  const full = await stateReturn(low, '2025', 'PA');
  assert.equal(full.lines['12'], 200);
  assert.equal(full.schedules.SP['15'], 1);
  assert.equal(full.lines['21'], 200);
  assert.equal(full.lines['29'], 200);
  const edge = await household({ state: 'PA', forms: [w2(8750, { state: 'PA' })] });
  await residency(edge, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0, paOtherEligibilityIncome: 0 } }]);
  const tenth = await stateReturn(edge, '2025', 'PA');
  assert.equal(tenth.lines['12'], 269);
  assert.equal(tenth.schedules.SP['15'], 0.1);
  assert.equal(tenth.lines['21'], 27);
  const over = await household({ state: 'PA', forms: [w2(8751, { state: 'PA' })] });
  await residency(over, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0, paOtherEligibilityIncome: 0 } }]);
  assert.equal((await stateReturn(over, '2025', 'PA')).lines['21'], 0);
});

test('Pennsylvania part-year resident: Pennsylvania W-2 wages and interest for the resident days only', async () => {
  const state = await household({ state: 'PA', forms: [w2(40000, { state: 'PA', stateWithheld: 1228 }), w2(30000, { state: 'IL', stateWithheld: 1200 }), { kind: '1099-INT', fields: { interest: 730 } }] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'PA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { paUseTax: 0 } }]);
  const pa = await stateReturn(state, '2025', 'PA');
  assert.equal(pa.residency, 'part-year');
  assert.equal(pa.lines['1c'], 40000);
  assert.equal(pa.lines['2'], 368);
  assert.equal(pa.lines['9'], 40368);
  assert.equal(pa.lines['12'], 1239);
  assert.equal(pa.schedules.SP['6'], 30362);
  assert.equal(pa.schedules.SP['11'], 70730);
  assert.equal(pa.lines['26'], 11);
  assert.ok(codes(pa).includes('PA_NONRESIDENT_SOURCES'));
});

test('Pennsylvania nonresident: only Pennsylvania compensation is taxed, dividends are not', async () => {
  const state = await household({ state: 'IL', forms: [w2(60000, { state: 'PA', stateWithheld: 1842 }), w2(20000, { state: 'IL', stateWithheld: 990 }), { kind: '1099-DIV', fields: { ordinaryDividends: 900 } }] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year' }, { state: 'PA', residency: 'nonresident', answers: { paUseTax: 0 } }]);
  const pa = await stateReturn(state, '2025', 'PA');
  assert.equal(pa.residency, 'nonresident');
  assert.equal(pa.lines['1c'], 60000);
  assert.equal(pa.lines['3'], 0);
  assert.equal(pa.lines['9'], 60000);
  assert.equal(pa.lines['12'], 1842);
  assert.equal(pa.schedules.SP['6'], 20900);
  assert.equal(pa.owed, 0);
  assert.equal(pa.refund, 0);
});

test('Pennsylvania high income joint: other-state wages, out-of-state bond interest, early distribution and the Schedule G-L credit', async () => {
  const state = await household({ state: 'PA', filingStatus: 'mfj', spouse, forms: [w2(400000, { state: 'PA', stateWithheld: 12280 }), w2(100000, { state: 'IL', stateWithheld: 4950, owner: 'spouse' }), { kind: '1099-INT', fields: { interest: 3000, treasuryInterest: 1000, taxExemptInterest: 2000 } }, { kind: '1099-R', fields: { grossDistribution: 10000, taxableAmount: 10000, distributionCode: '1' } }] });
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 40, paExemptInterest: 500, paTaxableRetirement: 8000 } }, { state: 'IL', residency: 'nonresident' }]);
  const pa = await stateReturn(state, '2025', 'PA');
  assert.equal(pa.lines['1a'], 508000);
  assert.equal(pa.lines['2'], 4500);
  assert.equal(pa.lines['9'], 512500);
  assert.equal(pa.lines['12'], 15734);
  const gl = pa.schedules['G-L'][0];
  assert.equal(gl.state, 'IL');
  assert.equal(gl['3'], 100000);
  assert.equal(gl['4e'], 4950);
  assert.equal(gl['5'], 3070);
  assert.equal(gl['6'], 3070);
  assert.equal(pa.lines['22'], 3070);
  assert.equal(pa.schedules.SP['2'], 1500);
  assert.equal(pa.lines['21'], 0);
  assert.equal(pa.lines['25'], 40);
  assert.equal(pa.lines['24'], 15350);
  assert.equal(pa.lines['28'], 424);
  assert.equal(pa.totalTax, 15734 - 3070 + 40);
  assert.ok(codes(pa).includes('PA_W2_RW'));
  assert.deepEqual(errors(pa), []);
});

test('Pennsylvania early retirement distribution blocks e-filing until its taxable part is given; a normal distribution is exempt', async () => {
  const state = await household({ state: 'PA', forms: [w2(50000, { state: 'PA' }), { kind: '1099-R', fields: { grossDistribution: 10000, taxableAmount: 10000, distributionCode: '1' } }, { kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 20000, taxableAmount: 20000, distributionCode: '7' } }] });
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0 } }]);
  const blocked = await stateReturn(state, '2025', 'PA');
  assert.deepEqual(errors(blocked), ['PA_RETIREMENT_TAXABLE_PART']);
  assert.equal(blocked.lines['1a'], 50000);
  assert.ok(codes(blocked).includes('PA_RETIREMENT_NOT_TAXED'));
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0, paTaxableRetirement: 6000 } }]);
  const answered = await stateReturn(state, '2025', 'PA');
  assert.deepEqual(errors(answered), []);
  assert.equal(answered.lines['1a'], 56000);
  assert.equal(answered.lines['12'], 1719);
});

test('Pennsylvania 2026 uses the same 3.07% rate and is not provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'PA', forms: [w2(50000, { state: 'PA', stateWithheld: 1535 })] });
  await residency(state, '2026', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0 } }]);
  const pa = await stateReturn(state, '2026', 'PA');
  assert.equal(pa.lines['12'], 1535);
  assert.equal(pa.provisional, false);
  assert.ok(pa.rulesUsed.includes('us.state-return.pa.income-tax@2026-01-01'));
});

const paQuestionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'PA' })).data.states[0].questions.map((item) => item.id);

test('Pennsylvania labels every line of a resident PA-40', async () => {
  const state = await household({ state: 'PA', forms: [w2(50000, { state: 'PA', stateWithheld: 1535 })] });
  await residency(state, '2025', [{ state: 'PA', residency: 'full-year', answers: { paUseTax: 0 } }]);
  const pa = await stateReturn(state, '2025', 'PA');
  for (const key of Object.keys(pa.lines)) assert.ok(typeof pa.labels[key] === 'string' && pa.labels[key].length > 0, key);
});

test('Pennsylvania asks the married and spouse questions only of married filers', async () => {
  const single = await household({ state: 'PA', forms: [w2(50000, { state: 'PA', stateWithheld: 1535 })] });
  const asked = await paQuestionIds(single);
  assert.ok(!asked.includes('paSeparatedForSp'));
  assert.ok(!asked.includes('paSpouseTuitionContributions'));
  assert.ok(!asked.includes('paSpouseEligibilityIncome'));
  const joint = await household({ state: 'PA', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1985-09-09' }, forms: [w2(50000, { state: 'PA', stateWithheld: 1535 })] });
  const jointAsked = await paQuestionIds(joint);
  assert.ok(jointAsked.includes('paSeparatedForSp'));
  assert.ok(jointAsked.includes('paSpouseTuitionContributions'));
});
