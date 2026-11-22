import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

async function returnsFor(home, work) {
  const state = await household({ state: home, forms: [w2(80000, { state: work, stateWithheld: 3000 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  const result = await runTool(state, 'us_state_returns', { taxYear: '2025' });
  assert.equal(result.ok, true);
  return Object.fromEntries(result.data.returns.map((item) => [item.state, item]));
}

test('Schedule S (2025) General Information D: a Virginia resident with California wages takes the credit for Virginia tax on Form 540NR, limited to the California tax', async () => {
  const { VA, CA } = await returnsFor('VA', 'CA');
  assert.equal(VA.otherStateCredit, 0);
  const s = CA.schedules.S.VA;
  assert.equal(s['2'], 3247);
  assert.equal(s['4'], 80000);
  assert.equal(s['7'], VA.totalTax);
  assert.equal(s['9'], 81000);
  assert.equal(s['10'], 0.9877);
  assert.equal(s['11'], Math.round(VA.totalTax * 0.9877));
  assert.equal(s['12'], 3247);
  assert.equal(CA.lines['58'], 3247);
  assert.equal(CA.totalTax, 0);
  assert.equal(CA.refund, 3000);
});

test('Schedule S (2025): an Arizona resident with California wages gets the Arizona tax on the double-taxed income as the 540NR credit', async () => {
  const { AZ, CA } = await returnsFor('AZ', 'CA');
  assert.equal(AZ.otherStateCredit, 0);
  assert.equal(CA.schedules.S.AZ['11'], Math.round(AZ.totalTax * 0.9877));
  assert.equal(CA.otherStateCredit, Math.round(AZ.totalTax * 0.9877));
  assert.equal(CA.totalTax, 3247 - CA.otherStateCredit);
});

test('a New York resident with California wages gets no Schedule S credit on Form 540NR; New York gives it', async () => {
  const { NY, CA } = await returnsFor('NY', 'CA');
  assert.equal(CA.otherStateCredit, 0);
  assert.equal(CA.totalTax, 3247);
  assert.ok(NY.otherStateCredit > 0);
});

test('a California resident with Arizona, Oregon or Virginia wages: the nonresident return that owes the credit is blocked instead of taxing the income twice without saying so', async () => {
  for (const work of ['AZ', 'OR', 'VA']) {
    const returns = await returnsFor('CA', work);
    assert.equal(returns.CA.otherStateCredit, 0);
    const blocker = returns[work].checks.find((item) => item.code === 'HOME_STATE_CREDIT_NOT_COMPUTED');
    assert.ok(blocker, work);
    assert.equal(blocker.level, 'error');
  }
  const ny = await returnsFor('NY', 'AZ');
  assert.equal(ny.AZ.checks.find((item) => item.code === 'HOME_STATE_CREDIT_NOT_COMPUTED'), undefined);
});
