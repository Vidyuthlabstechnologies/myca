import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

test('Illinois: property tax on Form 1098 feeds the Schedule ICR credit when no amount is given, with a warning to confirm it', async () => {
  const state = await household({ state: 'IL', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(120000, { state: 'IL', stateWithheld: 5000 }), { kind: '1098', payer: 'Prairie Bank', fields: { mortgageInterest: 9000, propertyTax: 5000 } }] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0 } }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.schedules.ICR.propertyTaxCredit, 250);
  assert.ok(il.checks.some((item) => item.code === 'IL_PROPERTY_TAX_FROM_1098'));
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0, propertyTaxPaid: 0 } }]);
  assert.equal((await stateReturn(state, '2025', 'IL')).lines['16'], 0);
});
