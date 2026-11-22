import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2021-05-05', months: 12 },
];

test('Mississippi resident single: $2,300 standard deduction, $6,000 exemption and 4.4% above the first $10,000', async () => {
  const state = await household({ state: 'MS', forms: [w2(50000, { state: 'MS', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'MS', residency: 'full-year' }]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.form, '80-105');
  assert.equal(ms.lines.filingStatus, 5);
  assert.equal(ms.schedules['page-2']['43A'], 500);
  assert.equal(ms.lines['13A'], 50500);
  assert.equal(ms.lines['14A'], 2300);
  assert.equal(ms.lines['15A'], 6000);
  assert.equal(ms.lines['16A'], 42200);
  assert.equal(ms.schedules['tax-computation']['2A'], 32200);
  assert.equal(ms.lines['17'], 1417);
  assert.equal(ms.lines['24'], 1500);
  assert.equal(ms.refund, 83);
});

test('Mississippi joint return with two children: columns A and B each use the $10,000 taxed at 0% and the dependent care credit is 25% of the federal credit', async () => {
  const state = await household({
    state: 'MS', filingStatus: 'mfj', spouse, dependents: kids,
    forms: [w2(30000, { state: 'MS', stateWithheld: 600 }), w2(15000, { state: 'MS', owner: 'spouse', stateWithheld: 100 }), { kind: '2441-PROVIDER', payer: 'Little Steps', fields: { amountPaid: 4000, qualifyingPerson: 'Leo' } }],
  });
  await residency(state, '2025', [{ state: 'MS', residency: 'full-year' }]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.lines.filingStatus, 1);
  assert.equal(ms.lines['7'], 2);
  assert.equal(ms.lines['9'], 2);
  assert.equal(ms.lines['10'], 3000);
  assert.equal(ms.lines['11'], 12000);
  assert.equal(ms.lines['12'], 15000);
  assert.equal(ms.lines['13A'], 30000);
  assert.equal(ms.lines['13B'], 15000);
  assert.equal(ms.lines['16A'] + ms.lines['16B'], 25400);
  assert.equal(ms.lines['16B'], 15000);
  assert.equal(ms.lines['17'], 238);
  assert.equal(ms.schedules['80-401'].federalCredit, 800);
  assert.equal(ms.lines['19'], 200);
  assert.equal(ms.lines['20'], 38);
  assert.equal(ms.refund, 662);
});

test('Mississippi joint seniors: retirement income and Social Security are exempt and the $1,500 exemption is added for each spouse 65 or older', async () => {
  const state = await household({
    state: 'MS', filingStatus: 'mfj', dateOfBirth: '1956-01-10', spouse: { ...spouse, dateOfBirth: '1955-06-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 9000, taxableAmount: 9000 } }, { kind: 'SSA-1099', fields: { netBenefits: 4000 } }],
  });
  await residency(state, '2025', [{ state: 'MS', residency: 'full-year' }]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.lines['9'], 2);
  assert.equal(ms.lines['12'], 15000);
  assert.equal(ms.lines['13A'], 0);
  assert.equal(ms.lines['16A'], 0);
  assert.equal(ms.totalTax, 0);
  assert.ok(ms.notes.some((note) => note.includes('exempt in Mississippi')));
});

test('Mississippi part-year resident: Form 80-205 prorates the deduction and exemption by the line 13c ratio', async () => {
  const state = await household({ state: 'MS', forms: [w2(30000, { state: 'MS', stateWithheld: 400 }), w2(30000, { state: 'AL' })] });
  await residency(state, '2025', [
    { state: 'AL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', income: { wages: 30000 } },
    { state: 'MS', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 } },
  ]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.form, '80-205');
  assert.equal(ms.schedules['page-2']['67total'], 60000);
  assert.equal(ms.schedules['page-2']['67ms'], 30000);
  assert.equal(ms.lines['13c'], 0.5);
  assert.equal(ms.lines['14b'], 1150);
  assert.equal(ms.lines['15b'], 3000);
  assert.equal(ms.lines['19A'], 25850);
  assert.equal(ms.lines['20'], 697);
  assert.equal(ms.owed, 297);
});

test('Mississippi nonresident: ratio to four decimals on Form 80-205', async () => {
  const state = await household({ state: 'IA', forms: [w2(40000, { state: 'MS', stateWithheld: 1200 }), w2(20000, { state: 'IA' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year' }, { state: 'MS', residency: 'nonresident', income: { wages: 40000 } }]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.form, '80-205');
  assert.equal(ms.lines['13c'], 0.6667);
  assert.equal(ms.lines['14b'], 1533);
  assert.equal(ms.lines['15b'], 4000);
  assert.equal(ms.lines['19A'], 34467);
  assert.equal(ms.lines['20'], 1077);
  assert.equal(ms.refund, 123);
});

test('Mississippi high-income joint resident: U.S. interest is left out and Form 80-160 credits Iowa tax on the spouse\'s Iowa wages', async () => {
  const state = await household({
    state: 'MS', filingStatus: 'mfj', spouse,
    forms: [w2(250000, { state: 'MS', stateWithheld: 10000 }), w2(150000, { state: 'IA', owner: 'spouse', stateWithheld: 5000 }), { kind: '1099-INT', fields: { interest: 3000, treasuryInterest: 1000 } }],
  });
  await residency(state, '2025', [{ state: 'MS', residency: 'full-year' }, { state: 'IA', residency: 'nonresident', income: { wages: 150000 } }]);
  const ms = await stateReturn(state, '2025', 'MS');
  assert.equal(ms.lines['13A'], 253000);
  assert.equal(ms.lines['13B'], 150000);
  assert.equal(ms.lines['16A'], 236400);
  assert.equal(ms.lines['16B'], 150000);
  assert.equal(ms.lines['17'], 16122);
  const total = ms.schedules['80-160'].find((row) => row.state === 'total');
  assert.equal(total.lines['7B'], 6160);
  assert.equal(ms.lines['18'], 5225);
  assert.equal(ms.lines['23'], 10897);
  assert.equal(ms.owed, 897);
  assert.ok(ms.checks.some((item) => item.code === 'MS_OTHER_STATE_TAXABLE_INCOME'));
});

test('Mississippi 2026: the 4.0% rate set by HB 531 is final and only the Schedule A tax limit is carried provisionally', async () => {
  const state = await household({ taxYear: '2026', state: 'MS', forms: [w2(50000, { state: 'MS', stateWithheld: 1500 })] });
  await residency(state, '2026', [{ state: 'MS', residency: 'full-year' }]);
  const ms = await stateReturn(state, '2026', 'MS');
  assert.equal(ms.lines['16A'], 41700);
  assert.equal(ms.lines['17'], 1268);
  assert.equal(ms.refund, 232);
  assert.equal(ms.provisional, true);
  assert.ok(ms.rulesUsed.includes('us.state-return.ms.income-tax@2026-01-01'));
});

test('Mississippi labels every line of a resident Form 80-105', async () => {
  const state = await household({ state: 'MS', forms: [w2(60000, { state: 'MS', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'MS', residency: 'full-year' }]);
  const ms = await stateReturn(state, '2025', 'MS');
  for (const key of Object.keys(ms.lines)) assert.ok(typeof ms.labels[key] === 'string' && ms.labels[key].length > 0, key);
});

test('Mississippi asks the spouse National Guard question only on a joint return and the other state income only of residents', async () => {
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'MS' })).data.states[0].questions.map((item) => item.id);
  const single = await household({ state: 'MS', forms: [w2(60000, { state: 'MS' })] });
  const first = await ids(single);
  assert.equal(first.includes('spouseNationalGuardPay'), false);
  assert.ok(first.includes('otherStateTaxableIncome'));
  await residency(single, '2025', [{ state: 'AL', residency: 'full-year' }, { state: 'MS', residency: 'nonresident' }]);
  assert.equal((await ids(single)).includes('otherStateTaxableIncome'), false);
  const couple = await household({ state: 'MS', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(60000, { state: 'MS' })] });
  assert.ok((await ids(couple)).includes('spouseNationalGuardPay'));
});
