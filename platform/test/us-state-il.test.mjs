import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

test('Illinois: property tax on Form 1098 feeds the Schedule ICR credit when no amount is given, with a warning to confirm it', async () => {
  const state = await household({ state: 'IL', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(120000, { state: 'IL', stateWithheld: 5000 }), { kind: '1098', payer: 'Prairie Bank', fields: { mortgageInterest: 9000, propertyTax: 5000 } }] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0 } }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.schedules.ICR.propertyTaxCredit, 250);
  assert.ok(il.checks.some((item) => item.code === 'IL_PROPERTY_TAX_FROM_1098'));
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0, propertyTaxPaid: 0 } }]);
  assert.equal((await stateReturn(state, '2025', 'IL')).lines['16'], 0);
});

test('Illinois: every line of a resident return has a label in the words of the IL-1040', async () => {
  const state = await household({ state: 'IL', forms: [w2(50000, { state: 'IL', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'IL');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Illinois asks the Schedule ICR credit questions of residents and part-year residents, not nonresidents', async () => {
  const resident = await household({ state: 'IL', forms: [w2(50000, { state: 'IL' })] });
  assert.ok((await questionIds(resident, 'IL')).includes('k12Expenses'));
  const nonresident = await household({ state: 'TX', forms: [w2(50000, { state: 'IL' })] });
  await residency(nonresident, '2025', [{ state: 'TX', residency: 'full-year' }, { state: 'IL', residency: 'nonresident', income: { wages: 50000 } }]);
  const asked = await questionIds(nonresident, 'IL');
  assert.ok(asked.includes('useTax'));
  assert.equal(asked.includes('k12Expenses'), false);
  assert.equal(asked.includes('propertyTaxPaid'), false);
});
