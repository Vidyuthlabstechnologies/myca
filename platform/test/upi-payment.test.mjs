import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

async function invoiced(upi) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  if (upi !== undefined) {
    const set = await runTool(state, 'set_invoice_template', { bank: { upi } });
    assert.equal(set.ok, true, JSON.stringify(set));
  }
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-05-10' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  return state;
}

test('an invoice carries a UPI payment link for the amount still due when the business has a UPI id', async () => {
  const state = await invoiced('asha.traders@okhdfcbank');
  const doc = (await runTool(state, 'invoice_document', { id: 'INV-0001' })).data;
  assert.equal(doc.upiPayment.upi, 'asha.traders@okhdfcbank');
  assert.equal(doc.upiPayment.amount, 11800);
  assert.equal(doc.upiPayment.link, 'upi://pay?pa=asha.traders%40okhdfcbank&pn=Asha%20Traders&am=11800.00&cu=INR&tn=INV-0001%20Asha%20Traders');
  assert.equal((await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 5000, date: '2026-05-20' })).ok, true);
  const partly = (await runTool(state, 'invoice_document', { id: 'INV-0001' })).data;
  assert.equal(partly.upiPayment.amount, 6800);
  assert.match(partly.upiPayment.link, /&am=6800\.00&/);
  assert.equal((await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 6800, date: '2026-05-21' })).ok, true);
  assert.equal((await runTool(state, 'invoice_document', { id: 'INV-0001' })).data.upiPayment, null);
});

test('no UPI link without a valid UPI id, or for a US business', async () => {
  assert.equal((await runTool(await invoiced(), 'invoice_document', { id: 'INV-0001' })).data.upiPayment, null);
  const typo = await invoiced();
  typo.company = { ...typo.company, invoiceTemplate: { bank: { upi: 'asha traders' } } };
  assert.equal((await runTool(typo, 'invoice_document', { id: 'INV-0001' })).data.upiPayment, null);
  assert.equal((await runTool(await invoiced(), 'set_invoice_template', { bank: { upi: 'not a upi id' } })).ok, false);
  const us = await invoiced('asha.traders@okhdfcbank');
  us.company = { ...us.company, country: 'US' };
  assert.equal((await runTool(us, 'invoice_document', { id: 'INV-0001' })).data.upiPayment, null);
});
