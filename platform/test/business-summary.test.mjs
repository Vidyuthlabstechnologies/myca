import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

function books() {
  const state = createState();
  const sale = (id, date, partyName, rate) => createInvoice(state, { id, date, partyName, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate, gstRate: 5 }] });
  sale('INV-0001', '2026-09-05', 'Retail Mart', 10000);
  sale('INV-0002', '2026-10-02', 'Retail Mart', 20000);
  sale('INV-0003', '2026-10-04', 'Gujarat Mills', 4000);
  sale('INV-0004', '2026-10-05', 'Kiran Stores', 1000);
  recordReceipt(state, { invoiceId: 'INV-0002', amount: 6000, date: '2026-10-03' });
  createPurchase(state, { date: '2026-10-03', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 8000, gstRate: 5 }] });
  return state;
}

test('the summary gives this month and last month from documents, net of credit notes, and who still owes', async () => {
  const state = books();
  await runTool(state, 'post_expense', { narration: 'Rent', amount: 3000, date: '2026-10-01' });
  await runTool(state, 'post_expense', { narration: 'Rent', amount: 3000, date: '2026-09-01' });
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0003', amount: 1050, date: '2026-10-06', reason: 'Returned' });
  await runTool(state, 'cancel_invoice', { invoiceId: 'INV-0004', date: '2026-10-06' });
  const out = await runTool(state, 'business_summary', { period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.previousPeriod, '2026-09');
  assert.deepEqual(d.current.sales, { count: 3, total: 26250, net: 24150 });
  assert.deepEqual(d.current.creditNotes, { count: 2, total: 2100 });
  assert.deepEqual(d.current.purchases, { count: 1, total: 8400 });
  assert.deepEqual(d.current.expenses, { count: 1, total: 3000 });
  assert.deepEqual(d.previous.sales, { count: 1, total: 10500, net: 10500 });
  assert.equal(d.previous.expenses.total, 3000);
  assert.equal(d.owedToYou.total, 10500 + 15000 + 3150);
  assert.equal(d.owedToYou.invoices, 3);
  assert.deepEqual(d.owedToYou.customers[0], { name: 'Retail Mart', due: 25500, invoices: 2 });
  assert.match(d.caveat, /not tracked yet/);
});

test('January looks back to December; a bad period is refused; empty books give zeros', async () => {
  const state = createState();
  const january = (await runTool(state, 'business_summary', { period: '2027-01' })).data;
  assert.equal(january.previousPeriod, '2026-12');
  assert.deepEqual(january.current.sales, { count: 0, total: 0, net: 0 });
  assert.equal(january.owedToYou.total, 0);
  assert.equal((await runTool(state, 'business_summary', { period: 'Oct' })).error, 'INVALID_PERIOD');
  assert.equal(isRemoteQuery('business_summary'), true);
});
