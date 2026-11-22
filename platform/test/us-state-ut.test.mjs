import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };

test('Utah resident single: 4.5% of Utah taxable income less the taxpayer tax credit phased out above the base', async () => {
  const state = await household({ state: 'UT', forms: [w2(60000, { state: 'UT', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 400 } }] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 15 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.form, 'TC-40');
  assert.equal(ut.lines['4'], 60900);
  assert.equal(ut.lines['8'], 400);
  assert.equal(ut.lines['9'], 60500);
  assert.equal(ut.lines['10'], 2723);
  assert.equal(ut.lines['12'], 15750);
  assert.equal(ut.lines['16'], 945);
  assert.equal(ut.lines['17'], 18213);
  assert.equal(ut.lines['18'], 42287);
  assert.equal(ut.lines['19'], 550);
  assert.equal(ut.lines['20'], 395);
  assert.equal(ut.lines['22'], 2328);
  assert.equal(ut.lines['31'], 15);
  assert.equal(ut.totalTax, 2343);
  assert.equal(ut.owed, 343);
  assert.equal(ut.provisional, false);
});

test('Utah resident joint with children: dependent exemptions feed the taxpayer credit, and the earned income and child tax credits follow', async () => {
  const state = await household({
    state: 'UT', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2008-05-05', months: 12 }],
    forms: [w2(38000, { state: 'UT', stateWithheld: 900 })],
  });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.lines['2a'], 1);
  assert.equal(ut.lines['2b'], 1);
  assert.equal(ut.lines['2d'], 2);
  assert.equal(ut.lines['10'], 1710);
  assert.equal(ut.lines['11'], 4222);
  assert.equal(ut.lines['13'], 35722);
  assert.equal(ut.lines['16'], 2143);
  assert.equal(ut.lines['18'], 1574);
  assert.equal(ut.lines['19'], 20);
  assert.equal(ut.lines['20'], 2123);
  assert.equal(ut.lines['22'], 0);
  assert.equal(ut.schedules['TC-40A']['part3.AM'], 1112);
  assert.equal(ut.schedules['TC-40A']['part3.AT'], 1000);
  assert.equal(ut.totalTax, 0);
  assert.equal(ut.refund, 900);
});

test('Utah resident retiree: the Social Security benefits credit is 4.5% of taxable benefits below the income base', async () => {
  const state = await household({ state: 'UT', dateOfBirth: '1955-03-01', forms: [{ kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000, federalWithheld: 3000 } }] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.lines['4'], 41300);
  assert.equal(ut.lines['10'], 1859);
  assert.equal(ut.lines['12'], 17750);
  assert.equal(ut.lines['19'], 300);
  assert.equal(ut.lines['20'], 765);
  assert.equal(ut.lines['21'], '');
  assert.equal(ut.lines['22'], 1094);
  assert.equal(ut.schedules['TC-40A']['part3.AH'], 509);
  assert.equal(ut.lines['24'], 509);
  assert.equal(ut.totalTax, 585);
});

test('Utah part-year resident: TC-40B multiplies the tax after credits by the Utah income ratio', async () => {
  const state = await household({ state: 'UT', forms: [w2(30000, { state: 'UT', stateWithheld: 1000 }), w2(30000, { state: 'CO', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'CO', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'UT', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.lines['22'], 2298);
  assert.equal(ut.schedules['TC-40B']['38A'], 30000);
  assert.equal(ut.schedules['TC-40B']['38B'], 60000);
  assert.equal(ut.schedules['TC-40B']['39'], 0.5);
  assert.equal(ut.schedules['TC-40B']['41'], 1149);
  assert.equal(ut.totalTax, 1149);
  assert.equal(ut.owed, 149);
});

test('Utah nonresident and the resident credit for tax paid to Colorado on TC-40S', async () => {
  const state = await household({ state: 'ID', forms: [w2(70000, { state: 'ID', stateWithheld: 2000 }), w2(20000, { state: 'UT', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'ID', residency: 'full-year' }, { state: 'UT', residency: 'nonresident', income: { wages: 20000 }, answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.lines['20'], 12);
  assert.equal(ut.lines['22'], 4038);
  assert.equal(ut.schedules['TC-40B']['39'], 0.2222);
  assert.equal(ut.schedules['TC-40B']['41'], 897);
  assert.equal(ut.totalTax, 897);
  assert.equal(ut.owed, 97);

  const resident = await household({ state: 'UT', forms: [w2(70000, { state: 'UT', stateWithheld: 2000 }), w2(20000, { state: 'CO', stateWithheld: 800 })] });
  await residency(resident, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }, { state: 'CO', residency: 'nonresident', income: { wages: 20000 } }]);
  const home = await stateReturn(resident, '2025', 'UT');
  const [schedule] = home.schedules['TC-40S'];
  assert.equal(schedule.state, 'CO');
  assert.equal(schedule['3'], 0.2222);
  assert.equal(schedule['5'], 897);
  assert.equal(schedule['6'], 726);
  assert.equal(home.lines['26'], 726);
  assert.equal(home.totalTax, 3312);
});

test('Utah 2026 high income: the 4.45% rate enacted for 2026 applies and the taxpayer credit phases out to nothing', async () => {
  const state = await household({ taxYear: '2026', state: 'UT', filingStatus: 'mfj', spouse, forms: [w2(250000, { state: 'UT', stateWithheld: 10000 })] });
  await residency(state, '2026', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2026', 'UT');
  assert.equal(ut.lines['10'], 11125);
  assert.equal(ut.lines['16'], 1932);
  assert.equal(ut.lines['19'], 2776);
  assert.equal(ut.lines['20'], 0);
  assert.equal(ut.totalTax, 11125);
  assert.equal(ut.provisional, true);
});

test('Utah qualified exempt taxpayer owes no Utah tax when federal AGI is within the federal standard deduction', async () => {
  const state = await household({ state: 'UT', forms: [w2(15000, { state: 'UT', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  assert.equal(ut.lines['21'], 'X');
  assert.equal(ut.lines['22'], 0);
  assert.equal(ut.refund, 300);
  assert.ok(ut.checks.some((item) => item.code === 'UT_QUALIFIED_EXEMPT'));
});

const utQuestionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'UT' })).data.states[0].questions.map((item) => item.id);

test('Utah labels every line of a resident TC-40', async () => {
  const state = await household({ state: 'UT', forms: [w2(50000, { state: 'UT', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }]);
  const ut = await stateReturn(state, '2025', 'UT');
  for (const key of Object.keys(ut.lines)) assert.ok(typeof ut.labels[key] === 'string' && ut.labels[key].length > 0, key);
});

test('Utah asks the non-Utah municipal bond question only when there is tax-exempt interest', async () => {
  const state = await household({ state: 'UT', forms: [w2(50000, { state: 'UT', stateWithheld: 1500 })] });
  assert.ok(!(await utQuestionIds(state)).includes('nonUtahMunicipalInterest'));
  const saver = await household({ state: 'UT', forms: [w2(50000, { state: 'UT', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 0, taxExemptInterest: 400 } }] });
  assert.ok((await utQuestionIds(saver)).includes('nonUtahMunicipalInterest'));
});
