import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2017-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-05-05', months: 12 }];
const spouse = (dateOfBirth = '1990-03-03') => ({ firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth });

test('Kentucky resident single: Form 740 with U.S. interest subtracted on Schedule M and the 4 percent rate', async () => {
  const state = await household({ state: 'KY', forms: [w2(52000, { state: 'KY', stateWithheld: 1800 }), { kind: '1099-INT', fields: { interest: 400, treasuryInterest: 250 } }] });
  await residency(state, '2025', [{ state: 'KY', residency: 'full-year', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.form, '740');
  assert.equal(r.lines['5'], 52650);
  assert.equal(r.schedules.M['8'], 250);
  assert.equal(r.lines['9'], 52400);
  assert.equal(r.lines['10'], 3270);
  assert.equal(r.lines['11'], 49130);
  assert.equal(r.lines['12'], 1965);
  assert.equal(r.totalTax, 1965);
  assert.equal(r.owed, 165);
  assert.ok(r.checks.some((item) => item.code === 'KY_LOCAL_OCCUPATIONAL_TAX'));
});

test('Kentucky joint return with two children: status 2 columns, family size tax credit and 20 percent child care credit', async () => {
  const state = await household({ state: 'KY', filingStatus: 'mfj', spouse: spouse(), dependents: kids, forms: [w2(28000, { state: 'KY', stateWithheld: 600 }), w2(6000, { state: 'KY', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'KY', residency: 'full-year', answers: { useTax: 0, federalChildCareCredit: 500 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.lines.filingStatus, 2);
  assert.equal(r.lines['11A'], 2730);
  assert.equal(r.lines['12A'], 109);
  assert.equal(r.lines['11B'], 24730);
  assert.equal(r.lines['12B'], 989);
  assert.equal(r.lines['19'], 1098);
  assert.equal(r.lines['20'], 4);
  assert.equal(r.schedules.ITC.familyPercent, 80);
  assert.equal(r.lines['21'], 878);
  assert.equal(r.lines['24'], 100);
  assert.equal(r.totalTax, 120);
  assert.equal(r.refund, 580);
});

test('Kentucky part-year resident: Form 740-NP with the Kentucky percentage and a full standard deduction', async () => {
  const state = await household({ state: 'KY', forms: [w2(30000, { state: 'IL', stateWithheld: 900 }), w2(30000, { state: 'KY', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'KY', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.form, '740-NP');
  assert.equal(r.lines['7'], 0.5);
  assert.equal(r.lines['9'], 30000);
  assert.equal(r.lines['10'], 3270);
  assert.equal(r.lines['13'], 26730);
  assert.equal(r.lines['14'], 1069);
  assert.equal(r.owed, 69);
});

test('Kentucky nonresident from Tennessee: Form 740-NP on Kentucky wages only', async () => {
  const state = await household({ state: 'TN', forms: [w2(40000, { state: 'KY', stateWithheld: 1500 }), w2(20000, { state: 'TN' })] });
  await residency(state, '2025', [{ state: 'TN', residency: 'full-year' }, { state: 'KY', residency: 'nonresident', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.form, '740-NP');
  assert.equal(r.lines['7'], 0.6667);
  assert.equal(r.lines['9'], 40000);
  assert.equal(r.lines['13'], 36730);
  assert.equal(r.lines['14'], 1469);
  assert.equal(r.refund, 31);
});

test('Kentucky high income itemizer: Schedule A keeps mortgage interest and contributions only', async () => {
  const state = await household({ state: 'KY', forms: [w2(300000, { state: 'KY', stateWithheld: 12000 }), { kind: '1098', fields: { mortgageInterest: 18000, propertyTax: 6000 } }], answers: { charityCash: 5000 } });
  await residency(state, '2025', [{ state: 'KY', residency: 'full-year', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.schedules.A['15'], 23000);
  assert.equal(r.lines['10'], 23000);
  assert.equal(r.lines['11'], 277000);
  assert.equal(r.lines['12'], 11080);
  assert.equal(r.refund, 920);
});

test('Kentucky retirees: pension income exclusion up to $31,110, Social Security subtracted and age 65 personal credits', async () => {
  const state = await household({ state: 'KY', filingStatus: 'mfj', dateOfBirth: '1958-01-15', spouse: spouse('1959-06-01'), forms: [{ kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, federalWithheld: 4000 } }, { kind: '1099-INT', fields: { interest: 2000 } }] });
  await residency(state, '2025', [{ state: 'KY', residency: 'full-year', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'KY');
  assert.equal(r.lines.filingStatus, 3);
  assert.equal(r.schedules.M['9'], 31110);
  assert.equal(r.schedules.M['10'], 17050);
  assert.equal(r.lines['9'], 10890);
  assert.equal(r.lines['12'], 305);
  assert.equal(r.lines['17'], 80);
  assert.equal(r.totalTax, 225);
});

test('Kentucky 2026: 3.5 percent rate under 2025 HB 1 and the $3,360 standard deduction', async () => {
  const state = await household({ taxYear: '2026', state: 'KY', forms: [w2(52000, { state: 'KY', stateWithheld: 1800 })] });
  await residency(state, '2026', [{ state: 'KY', residency: 'full-year', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2026', 'KY');
  assert.equal(r.lines['10'], 3360);
  assert.equal(r.lines['11'], 48640);
  assert.equal(r.lines['12'], 1702);
  assert.equal(r.refund, 98);
  assert.equal(r.provisional, true);
});

test('Kentucky labels every line of a resident Form 740, including both columns of a combined return', async () => {
  const single = await household({ state: 'KY', forms: [w2(60000, { state: 'KY', stateWithheld: 2000 })] });
  await residency(single, '2025', [{ state: 'KY', residency: 'full-year' }]);
  const couple = await household({ state: 'KY', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(50000, { state: 'KY' }), w2(40000, { state: 'KY', owner: 'spouse' })] });
  await residency(couple, '2025', [{ state: 'KY', residency: 'full-year' }]);
  for (const ky of [await stateReturn(single, '2025', 'KY'), await stateReturn(couple, '2025', 'KY')]) {
    for (const key of Object.keys(ky.lines)) assert.ok(typeof ky.labels[key] === 'string' && ky.labels[key].length > 0, key);
  }
});

test('Kentucky asks the spouse and joint return questions only of a married couple, and the other state income only after the other state tax', async () => {
  const single = await household({ state: 'KY', forms: [w2(60000, { state: 'KY' })] });
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'KY' })).data.states[0].questions.map((item) => item.id);
  const first = await ids(single);
  assert.equal(first.includes('spouseNationalGuard'), false);
  assert.equal(first.includes('jointReturn'), false);
  assert.equal(first.includes('otherStateIncome'), false);
  await runTool(single, 'set_us_state_answers', { taxYear: '2025', state: 'KY', answers: { otherStateTax: 300 } });
  assert.ok((await ids(single)).includes('otherStateIncome'));
  const couple = await household({ state: 'KY', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(60000, { state: 'KY' })] });
  const married = await ids(couple);
  assert.ok(married.includes('spouseNationalGuard'));
  assert.ok(married.includes('jointReturn'));
});
