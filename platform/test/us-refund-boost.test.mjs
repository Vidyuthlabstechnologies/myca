import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { usRefundBoost, usRefundBoostWords } from '../src/us-refund-boost.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const w2 = (wages, withheld) => ({ wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 });

async function household(filingStatus = 'single', dependents) {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus, taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' }, ...(dependents ? { dependents } : {}) });
  assert.equal(set.ok, true, JSON.stringify(set));
  const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'St. Mary Hospital', payerTin: '12-3456789', fields: w2(60000, 7000) });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

test('the refund booster finds unused deductions and prices each by running the return again', async () => {
  const state = await household();
  const result = usRefundBoost(state, { taxYear: '2025' });
  assert.equal(result.ok, true, JSON.stringify(result));
  const ids = result.data.opportunities.map((item) => item.id);
  for (const id of ['ira', 'hsa', 'student-loan']) assert.ok(ids.includes(id), id);
  const ira = result.data.opportunities.find((item) => item.id === 'ira');
  assert.equal(ira.per1000, 120);
  assert.ok(!ids.includes('se-health'));
  assert.ok(result.data.opportunities.every((item, index, list) => index === 0 || (list[index - 1].gain ?? list[index - 1].per1000) >= (item.gain ?? item.per1000)));
  assert.match(usRefundBoostWords(result.data), /every \$1,000 adds about \$120/);
});

test('an answered deduction is not suggested again', async () => {
  const state = await household();
  const answered = await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'iraDeduction', answer: 2000 });
  assert.equal(answered.ok, true, JSON.stringify(answered));
  const result = usRefundBoost(state, { taxYear: '2025' });
  assert.ok(!result.data.opportunities.some((item) => item.id === 'ira'));
});

test('a single parent is shown what head of household is worth', async () => {
  const state = await household('single', [{ firstName: 'Lia', lastName: 'Diaz', ssn: '400-22-3456', dateOfBirth: '2016-05-01', relationship: 'daughter', months: 12 }]);
  const result = usRefundBoost(state, { taxYear: '2025' });
  const hoh = result.data.opportunities.find((item) => item.id === 'head-of-household');
  assert.ok(hoh && hoh.gain > 0, JSON.stringify(result.data.opportunities));
});

test('the booster needs a started return and is a read-only remote query', () => {
  assert.equal(usRefundBoost(createState(), { taxYear: '2025' }).error, 'US_RETURN_NOT_STARTED');
  assert.equal(usRefundBoost(createState(), { taxYear: '1999' }).error, 'TAX_YEAR_NOT_SUPPORTED');
  assert.equal(isRemoteQuery('us_refund_boost'), true);
  assert.equal(validateAssistantToolCall('us_refund_boost', { taxYear: '2025' }).ok, true);
});
