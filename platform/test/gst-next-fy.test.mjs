import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['Date'], now: new Date(2027, 4, 15, 12).getTime() });

const { createState } = await import('../src/store.mjs');
const { runTool } = await import('../src/tools.mjs');

test('GST tools keep working once the company year is one with no income-tax rules yet', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27', fy: '2027-28' };
  const sale = await runTool(state, 'create_invoice', { partyName: 'Fresh Mart', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }], date: '2027-04-10' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const payable = await runTool(state, 'gst_payable', { period: '2027-04' });
  assert.equal(payable.ok, true, JSON.stringify(payable));
  const draft = await runTool(state, 'prepare_gstr3b', { period: '2027-04' });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const itr = await runTool(state, 'prepare_itr', {});
  assert.ok(itr.ok === true || itr.error === 'NO_RULES_FOR_FY', JSON.stringify(itr));
});
