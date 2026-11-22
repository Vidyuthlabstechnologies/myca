import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const SPOUSE = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const KID = { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-02-02', months: 12 };

test('Oklahoma resident single: U.S. interest subtraction, $6,350 standard deduction and the Tax Table midpoint', async () => {
  const state = await household({ state: 'OK', forms: [w2(50000, { state: 'OK', stateWithheld: 1800 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'OK', residency: 'full-year', answers: { useTax: 25 } }]);
  const ok = await stateReturn(state, '2025', 'OK');
  assert.equal(ok.form, '511');
  assert.equal(ok.lines['1'], 50700);
  assert.equal(ok.lines['2'], 200);
  assert.equal(ok.lines['7'], 50500);
  assert.equal(ok.lines['12'], 7350);
  assert.equal(ok.lines['13'], 43150);
  assert.equal(ok.lines['14'], 1862);
  assert.equal(ok.lines['19'], 25);
  assert.equal(ok.lines['20'], 1887);
  assert.equal(ok.owed, 87);
});

test('Oklahoma joint with a child: 5% of the child tax credit, sales tax relief and 5% of the federal EIC', async () => {
  const state = await household({ state: 'OK', filingStatus: 'mfj', spouse: SPOUSE, dependents: [KID], forms: [w2(30000, { state: 'OK', stateWithheld: 600 }), w2(8000, { state: 'OK', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'OK', residency: 'full-year', answers: { useTax: 0 } }]);
  const ok = await stateReturn(state, '2025', 'OK');
  assert.equal(ok.schedules.exemptions.total, 3);
  assert.equal(ok.lines['10'], 12700);
  assert.equal(ok.lines['11'], 3000);
  assert.equal(ok.lines['13'], 22300);
  assert.equal(ok.lines['14'], 683);
  assert.equal(ok.schedules['511-F']['3'], 2200);
  assert.equal(ok.lines['15'], 110);
  assert.equal(ok.lines['18'], 573);
  assert.equal(ok.lines['25'], 120);
  assert.equal(ok.schedules['511-G']['1'], 3121);
  assert.equal(ok.lines['28'], 156);
  assert.equal(ok.refund, 403);
});

test('Oklahoma part-year resident on Form 511-NR: all wages are Oklahoma income so line 17 is 100%', async () => {
  const state = await household({ state: 'TX', forms: [w2(60000, { state: 'OK', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'OK', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }]);
  const ok = await stateReturn(state, '2025', 'OK');
  assert.equal(ok.form, '511-NR');
  assert.equal(ok.lines['13'], 52650);
  assert.equal(ok.lines['14'], 2314);
  assert.equal(ok.lines['17'], 1);
  assert.equal(ok.lines['18'], 2314);
  assert.equal(ok.owed, 1114);
});

test('Oklahoma nonresident: tax on all income times the Oklahoma share of 37.5%', async () => {
  const state = await household({ state: 'TX', forms: [w2(80000, { state: 'OK', stateWages: 30000, stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'OK', residency: 'nonresident' }]);
  const ok = await stateReturn(state, '2025', 'OK');
  assert.equal(ok.lines['6'], 30000);
  assert.equal(ok.lines['7'], 80000);
  assert.equal(ok.lines['14'], 3264);
  assert.equal(ok.lines['17'], 0.375);
  assert.equal(ok.lines['18'], 1224);
  assert.equal(ok.owed, 324);
});

test('Oklahoma 2026 high income: the 4.5% top rate worksheet of $4,060 plus 4.5% over $95,000', async () => {
  const state = await household({ taxYear: '2026', state: 'OK', forms: [w2(250000, { state: 'OK', stateWithheld: 9000 })] });
  await residency(state, '2026', [{ state: 'OK', residency: 'full-year', answers: { useTax: 0 } }]);
  const ok = await stateReturn(state, '2026', 'OK');
  assert.equal(ok.lines['13'], 242650);
  assert.equal(ok.lines['14'], 10704);
  assert.equal(ok.owed, 1704);
  assert.equal(ok.provisional, false);
});

test('Oklahoma resident with Georgia wages: Form 511-TX limits the credit to the wage share of Oklahoma tax', async () => {
  const state = await household({ state: 'OK', forms: [w2(40000, { state: 'OK', stateWithheld: 1000 }), w2(20000, { state: 'GA', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'OK', residency: 'full-year', answers: { useTax: 0 } }, { state: 'GA', residency: 'nonresident' }]);
  const ok = await stateReturn(state, '2025', 'OK');
  const tx = ok.schedules['511-TX'][0];
  assert.equal(tx.lines['1'], 20000);
  assert.equal(tx.lines['3'], 0.3333);
  assert.equal(tx.lines['5'], 771);
  assert.equal(tx.lines['6'], 830);
  assert.equal(ok.lines['16'], 771);
  assert.equal(ok.lines['18'], 1543);
});

const okQuestionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'OK' })).data.states[0].questions.map((item) => item.id);

test('Oklahoma labels every line of a resident Form 511', async () => {
  const state = await household({ state: 'OK', forms: [w2(50000, { state: 'OK', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'OK', residency: 'full-year' }]);
  const ok = await stateReturn(state, '2025', 'OK');
  for (const key of Object.keys(ok.lines)) assert.ok(typeof ok.labels[key] === 'string' && ok.labels[key].length > 0, key);
});

test('Oklahoma asks the retirement exclusion questions only when there is retirement income', async () => {
  const worker = await household({ state: 'OK', forms: [w2(50000, { state: 'OK', stateWithheld: 1500 })] });
  const asked = await okQuestionIds(worker);
  assert.ok(!asked.includes('governmentRetirement'));
  assert.ok(!asked.includes('spouseMilitaryRetirement'));
  assert.ok(asked.includes('disabled'));
  const retiree = await household({ state: 'OK', forms: [{ kind: '1099-R', fields: { grossDistribution: 20000, taxableAmount: 20000, distributionCode: '7' } }] });
  assert.ok((await okQuestionIds(retiree)).includes('governmentRetirement'));
});
