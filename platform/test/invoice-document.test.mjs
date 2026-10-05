import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AAACH7409R1Z1', state: '27', address: '12 Market Road', city: 'Pune', pin: '411001' };
  const local = createInvoice(state, { date: '2026-10-03', partyName: 'Rajesh Stores', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Cotton rolls', hsn: '5208', qty: 10, rate: 500, gstRate: 5 }] });
  assert.notEqual(local.ok, false, JSON.stringify(local));
  const away = createInvoice(state, { date: '2026-10-04', partyName: 'Gujarat Mills', partyGstin: '24AAACF7856R1ZY', lines: [{ description: 'Consulting', qty: 1, rate: 50000, gstRate: 18 }] });
  assert.notEqual(away.ok, false, JSON.stringify(away));
  return state;
}

test('an invoice document carries the posted figures, the parties and the place of supply by name', async () => {
  const state = books();
  const out = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const doc = out.data;
  assert.deepEqual(doc.seller, { name: 'Asha Traders', gstin: '27AAACH7409R1Z1', address: '12 Market Road', city: 'Pune', pin: '411001', state: { code: '27', name: 'Maharashtra' } });
  assert.deepEqual(doc.buyer, { name: 'Rajesh Stores', gstin: '27AABCT1332L1ZE' });
  assert.deepEqual(doc.placeOfSupply, { code: '27', name: 'Maharashtra' });
  assert.equal(doc.taxable, 5000);
  assert.equal(doc.cgst, 125);
  assert.equal(doc.sgst, 125);
  assert.equal(doc.igst, 0);
  assert.equal(doc.total, 5250);
  assert.deepEqual(doc.lines[0], { description: 'Cotton rolls', hsn: '5208', qty: 10, rate: 500, gstRate: 5, taxable: 5000, cgst: 125, sgst: 125, igst: 0, amount: 5250 });
  assert.deepEqual(doc.missing, []);
  const posted = state.invoices[0];
  assert.equal(doc.total, posted.total);
});

test('a sale to another state shows IGST and that state as the place of supply', async () => {
  const doc = (await runTool(books(), 'invoice_document', { id: 'INV-0002' })).data;
  assert.deepEqual(doc.placeOfSupply, { code: '24', name: 'Gujarat' });
  assert.equal(doc.igst, 9000);
  assert.equal(doc.cgst, 0);
  assert.equal(doc.total, 59000);
});

test('no HSN code is invented: a line entered without one stays blank and is reported as missing', async () => {
  const state = books();
  assert.equal(state.invoices[1].lines[0].hsn, '');
  const doc = (await runTool(state, 'invoice_document', { id: 'INV-0002' })).data;
  assert.equal(doc.lines[0].hsn, '');
  assert.deepEqual(doc.missing, ['HSN']);
  const bill = createPurchase(state, { date: '2026-10-05', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(bill.invoice.lines[0].hsn, '');
});

test('a business without a GSTIN or address is told what the invoice lacks', async () => {
  const state = createState();
  state.company = { ...state.company, gstin: '', address: '' };
  createInvoice(state, { date: '2026-10-03', partyName: 'Walk-in', lines: [{ description: 'Tea', hsn: '0902', qty: 1, rate: 100, gstRate: 5 }] });
  const doc = (await runTool(state, 'invoice_document', { id: 'INV-0001' })).data;
  assert.deepEqual(doc.missing, ['SELLER_GSTIN', 'SELLER_ADDRESS']);
});

test('receipts and the balance come from the engine', async () => {
  const state = books();
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 2000, date: '2026-10-05', mode: 'cash' });
  const doc = (await runTool(state, 'invoice_document', { id: 'INV-0001' })).data;
  assert.deepEqual(doc.receipts, [{ date: '2026-10-05', mode: 'cash', amount: 2000 }]);
  assert.equal(doc.received, 2000);
  assert.equal(doc.balance, 3250);
});

test('it is read-only, reachable remotely, strict about its argument, and never returns a purchase bill', async () => {
  const state = books();
  createPurchase(state, { date: '2026-10-05', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  const before = JSON.stringify({ invoices: state.invoices, purchases: state.purchases, transfers: state.ledger.transfers.length });
  assert.equal((await runTool(state, 'invoice_document', { id: 'BILL-0001' })).error, 'INVOICE_NOT_FOUND');
  assert.equal((await runTool(state, 'invoice_document', { id: 'INV-9999' })).error, 'INVOICE_NOT_FOUND');
  await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(JSON.stringify({ invoices: state.invoices, purchases: state.purchases, transfers: state.ledger.transfers.length }), before);
  assert.equal(isRemoteQuery('invoice_document'), true);
  assert.equal(validateAssistantToolCall('invoice_document', { id: 'INV-0001' }).ok, true);
  assert.equal(validateAssistantToolCall('invoice_document', { id: 'BILL-0001' }).ok, false);
  assert.equal(validateAssistantToolCall('invoice_document', { id: 'INV-0001', extra: 1 }).ok, false);
});
