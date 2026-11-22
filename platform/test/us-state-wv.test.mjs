import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const SPOUSE = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const KID = { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-02-02', months: 12 };

test('West Virginia resident single: Schedule M subtracts U.S. interest and line 8 comes from the Tax Table midpoint', async () => {
  const state = await household({ state: 'WV', forms: [w2(50000, { state: 'WV', stateWithheld: 1900 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 300 } }] });
  await residency(state, '2025', [{ state: 'WV', residency: 'full-year', answers: { useTax: 12 } }]);
  const wv = await stateReturn(state, '2025', 'WV');
  assert.equal(wv.form, 'IT-140');
  assert.equal(wv.lines['1'], 50800);
  assert.equal(wv.lines['3'], 300);
  assert.equal(wv.lines['4'], 50500);
  assert.equal(wv.lines['6'], 2000);
  assert.equal(wv.lines['7'], 48500);
  assert.equal(wv.lines['8'], 1544);
  assert.equal(wv.lines['13'], 12);
  assert.equal(wv.lines['14'], 1556);
  assert.equal(wv.refund, 344);
});

test('West Virginia joint with a child: three exemptions, the 60-dollar table rows, and no Family Tax Credit above the table', async () => {
  const state = await household({ state: 'WV', filingStatus: 'mfj', spouse: SPOUSE, dependents: [KID], forms: [w2(30000, { state: 'WV', stateWithheld: 700 }), w2(6000, { state: 'WV', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'full-year', answers: { useTax: 0 } }]);
  const wv = await stateReturn(state, '2025', 'WV');
  assert.equal(wv.lines['6e'], 3);
  assert.equal(wv.lines['6'], 6000);
  assert.equal(wv.lines['7'], 30000);
  assert.equal(wv.lines['8'], 833);
  assert.equal(wv.schedules['FTC-1']['5'], 3);
  assert.equal(wv.schedules['FTC-1']['6'], 0);
  assert.equal(wv.lines['14'], 833);
  assert.equal(wv.owed, 33);
});

test('West Virginia low-income family: the Family Tax Credit percentage falls 10 points for each $300 above the full-credit level', async () => {
  const state = await household({ state: 'WV', filingStatus: 'mfj', spouse: SPOUSE, dependents: [KID], forms: [w2(27500, { state: 'WV', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'full-year', answers: { useTax: 0 } }]);
  const wv = await stateReturn(state, '2025', 'WV');
  assert.equal(wv.lines['7'], 21500);
  assert.equal(wv.schedules['FTC-1']['4'], 27500);
  assert.equal(wv.schedules['FTC-1']['6'], 70);
  assert.equal(wv.lines['8'], 564);
  assert.equal(wv.schedules.RECAP['2'], 395);
  assert.equal(wv.lines['10'], 169);
});

test('West Virginia part-year resident: Schedule A ratio of 1 applies the rate schedule to line 7', async () => {
  const state = await household({ state: 'NC', forms: [w2(60000, { state: 'WV', stateWithheld: 1300 })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }]);
  const wv = await stateReturn(state, '2025', 'WV');
  assert.equal(wv.form, 'IT-140 with Schedule A');
  assert.equal(wv.schedules.A.lines['26'], 60000);
  assert.equal(wv.schedules.A.partI['1'], 1965);
  assert.equal(wv.schedules.A.partI['4'], 1);
  assert.equal(wv.lines['8'], 1965);
  assert.equal(wv.owed, 665);
});

test('West Virginia nonresident: rate schedule tax times the Schedule A ratio of 0.3333', async () => {
  const state = await household({ state: 'NC', forms: [w2(90000, { state: 'WV', stateWages: 30000, stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'nonresident' }]);
  const wv = await stateReturn(state, '2025', 'WV');
  assert.equal(wv.schedules.A.C['23'], 30000);
  assert.equal(wv.schedules.A.partI['1'], 3403);
  assert.equal(wv.schedules.A.partI['4'], 0.3333);
  assert.equal(wv.lines['8'], 1134);
  assert.equal(wv.owed, 234);
});

test('West Virginia 2026 high income: the S.B. 392 rates on the rate schedule, with the provisional 2026 table and credit records', async () => {
  const state = await household({ taxYear: '2026', state: 'WV', forms: [w2(150000, { state: 'WV', stateWithheld: 6000 })] });
  await residency(state, '2026', [{ state: 'WV', residency: 'full-year', answers: { useTax: 0 } }]);
  const wv = await stateReturn(state, '2026', 'WV');
  assert.equal(wv.lines['7'], 148000);
  assert.equal(wv.lines['8'], 5981);
  assert.equal(wv.refund, 19);
  assert.equal(wv.provisional, true);
});

test('West Virginia resident with North Carolina wages: Schedule E credit is the smallest of the limits', async () => {
  const state = await household({ state: 'WV', forms: [w2(40000, { state: 'WV', stateWithheld: 1000 }), w2(20000, { state: 'NC', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'full-year', answers: { useTax: 0 } }, { state: 'NC', residency: 'nonresident' }]);
  const wv = await stateReturn(state, '2025', 'WV');
  const e = wv.schedules.E[0];
  assert.equal(e.state, 'NC');
  assert.equal(e.lines['1'], 669);
  assert.equal(e.lines['5'], 655);
  assert.equal(e.lines['7'], 1099);
  assert.equal(e.lines['8'], 867);
  assert.equal(e.lines['10'], 655);
  assert.equal(wv.lines['8'], 1966);
  assert.equal(wv.lines['9'], 655);
  assert.equal(wv.lines['14'], 1311);
});

const wvQuestionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'WV' })).data.states[0].questions.map((item) => item.id);

test('West Virginia labels every line of a resident IT-140', async () => {
  const state = await household({ state: 'WV', forms: [w2(50000, { state: 'WV', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'WV', residency: 'full-year', answers: { useTax: 0 } }]);
  const wv = await stateReturn(state, '2025', 'WV');
  for (const key of Object.keys(wv.lines)) assert.ok(typeof wv.labels[key] === 'string' && wv.labels[key].length > 0, key);
});

test('West Virginia asks the Schedule HEPTC-1 household questions only after property tax is given', async () => {
  const state = await household({ state: 'WV', forms: [w2(50000, { state: 'WV', stateWithheld: 2000 })] });
  const asked = await wvQuestionIds(state);
  assert.ok(!asked.includes('householdSize'));
  assert.ok(!asked.includes('spouseJointIncomePercent'));
  assert.ok(!asked.includes('publicRetirement'));
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'WV', answers: { homesteadPropertyTax: 1800 } });
  assert.ok((await wvQuestionIds(state)).includes('householdSize'));
});
