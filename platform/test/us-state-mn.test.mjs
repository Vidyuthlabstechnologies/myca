import test from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2015-03-03', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2018-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };

test('Minnesota resident single: standard deduction and tax from the table midpoint', async () => {
  const state = await household({ state: 'MN', forms: [w2(60000, { state: 'MN', stateWithheld: 2900 })] });
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.form, 'M1');
  assert.equal(mn.lines['1'], 60000);
  assert.equal(mn.lines['4'], 14950);
  assert.equal(mn.lines['9'], 45050);
  assert.equal(mn.lines['10'], 2591);
  assert.equal(mn.lines['19'], 2591);
  assert.equal(mn.refund, 309);
});

test('Minnesota joint return with children: dependent exemptions, Child and Working Family Credits and K-12 credit', async () => {
  const state = await household({ state: 'MN', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'MN', stateWithheld: 700 }), w2(15000, { state: 'MN', stateWithheld: 300, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'MN', residency: 'full-year', answers: { k12CreditChildren: 2, k12CreditExpenses: 1000 } }]);
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.lines['4'], 29900);
  assert.equal(mn.lines['5'], 10400);
  assert.equal(mn.lines['9'], 4700);
  assert.equal(mn.lines['10'], 254);
  assert.equal(mn.schedules.M1CWFC['4'], 379);
  assert.equal(mn.schedules.M1CWFC['8'], 3500);
  assert.equal(mn.schedules.M1CWFC['14'], 851);
  assert.equal(mn.schedules.M1CWFC['15'], 3028);
  assert.equal(mn.schedules.M1ED['13'], 750);
  assert.equal(mn.lines['22'], 3778);
  assert.equal(mn.refund, 1000 + 3778 - 254);
});

test('Minnesota part-year resident: Schedule M1NR prorates the tax by Minnesota income', async () => {
  const state = await household({ state: 'MN', forms: [w2(40000, { state: 'IA', stateWithheld: 1500 }), w2(40000, { state: 'MN', stateWithheld: 1800 })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'MN', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.schedules.M1NR.B1, 40000);
  assert.equal(mn.schedules.M1NR['28'], 40000);
  assert.equal(mn.schedules.M1NR['29'], 80000);
  assert.equal(mn.schedules.M1NR['30'], 0.5);
  assert.equal(mn.lines['9'], 65050);
  assert.equal(mn.lines['12'], 3951);
  assert.equal(mn.lines['13'], 1976);
  assert.equal(mn.totalTax, 1976);
  assert.equal(mn.owed, 176);
});

test('Minnesota nonresident: only Minnesota wages are taxed through Schedule M1NR', async () => {
  const state = await household({ state: 'IA', forms: [w2(30000, { state: 'MN', stateWithheld: 1000 }), w2(30000, { state: 'IA' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year' }, { state: 'MN', residency: 'nonresident' }]);
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.residency, 'nonresident');
  assert.equal(mn.schedules.M1NR['30'], 0.5);
  assert.equal(mn.lines['12'], 2591);
  assert.equal(mn.lines['13'], 1296);
  assert.equal(mn.refundableCredits.length, 0);
  assert.equal(mn.owed, 296);
});

test('Minnesota high income: the standard deduction is phased out to 20% and the top 9.85% bracket applies', async () => {
  const state = await household({ state: 'MN', forms: [w2(500000, { state: 'MN', stateWithheld: 40000 })] });
  const mn = await stateReturn(state, '2025', 'MN');
  assert.equal(mn.schedules['Line 4'].standardLimitation, 11960);
  assert.equal(mn.lines['4'], 2990);
  assert.equal(mn.lines['9'], 497010);
  assert.equal(mn.lines['10'], 43387);
  assert.equal(mn.owed, 3387);
});

test('Minnesota 2026 uses the published 2026 figures and is not provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'MN', forms: [w2(60000, { state: 'MN', stateWithheld: 2900 })] });
  const mn = await stateReturn(state, '2026', 'MN');
  assert.equal(mn.provisional, false);
  assert.equal(mn.lines['4'], 15300);
  assert.equal(mn.lines['9'], 44700);
  assert.equal(mn.lines['10'], 2560);
});

test('Minnesota labels every line of a resident Form M1', async () => {
  const state = await household({ state: 'MN', forms: [w2(60000, { state: 'MN', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'MN', residency: 'full-year' }]);
  const mn = await stateReturn(state, '2025', 'MN');
  for (const key of Object.keys(mn.lines)) assert.ok(typeof mn.labels[key] === 'string' && mn.labels[key].length > 0, key);
});

test('Minnesota asks the K-12 and spouse questions only when they can apply, and disability income only after a yes to disabled', async () => {
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'MN' })).data.states[0].questions.map((item) => item.id);
  const single = await household({ state: 'MN', forms: [w2(60000, { state: 'MN' })] });
  const first = await ids(single);
  assert.equal(first.includes('k12CreditChildren'), false);
  assert.equal(first.includes('spouseRetirementIncome'), false);
  assert.equal(first.includes('disabilityIncome'), false);
  await runTool(single, 'set_us_state_answers', { taxYear: '2025', state: 'MN', answers: { disabled: true } });
  assert.ok((await ids(single)).includes('disabilityIncome'));
  const family = await household({ state: 'MN', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 }], forms: [w2(60000, { state: 'MN' })] });
  const asked = await ids(family);
  assert.ok(asked.includes('k12CreditChildren'));
  assert.ok(asked.includes('spouseRetirementIncome'));
});
