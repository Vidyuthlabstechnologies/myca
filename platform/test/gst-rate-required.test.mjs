import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, seedDemo } from '../src/store.mjs';
import { createInvoice, createPurchase, lastGstRateFor } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';

const demo = () => seedDemo(createState());

test('an invoice with no GST rate is refused and posts nothing', () => {
  const state = demo();
  const before = { invoices: state.invoices.length, seq: state.invoiceSeq, transfers: (state.transfers || []).length };
  for (const gstRate of [undefined, null, '']) {
    const result = createInvoice(state, { date: '2026-09-01', partyName: 'Retail Mart', lines: [{ description: 'Rolls', qty: 1, rate: 1000, gstRate }] });
    assert.deepEqual(result, { ok: false, error: 'RATE_REQUIRED', line: 1 });
  }
  assert.equal(state.invoices.length, before.invoices);
  assert.equal(state.invoiceSeq, before.seq);
  assert.equal((state.transfers || []).length, before.transfers);
});

test('the refusal names the line that has no rate', () => {
  const result = createInvoice(demo(), {
    date: '2026-09-01',
    partyName: 'Retail Mart',
    lines: [{ description: 'Rolls', rate: 1000, gstRate: 5 }, { description: 'Freight', rate: 200 }],
  });
  assert.equal(result.error, 'RATE_REQUIRED');
  assert.equal(result.line, 2);
});

test('a purchase bill with no GST rate is refused', () => {
  const state = demo();
  const count = state.purchases.length;
  const result = createPurchase(state, { date: '2026-09-01', partyName: 'Fabric Co', lines: [{ description: 'Grey cloth', rate: 500 }] });
  assert.equal(result.error, 'RATE_REQUIRED');
  assert.equal(state.purchases.length, count);
});

test('GST 0% is a rate, not a missing one', () => {
  const result = createInvoice(demo(), { date: '2026-09-01', partyName: 'Walk-in', lines: [{ description: 'Exempt supply', rate: 1000, gstRate: 0 }] });
  assert.equal(result.ok, true);
  assert.equal(result.invoice.total, 1000);
});

test('the last rate charged to a customer is found by GSTIN, else by name', () => {
  const state = demo();
  assert.deepEqual(lastGstRateFor(state, { name: 'Retail Mart' }), { gstRate: 5, from: 'INV-0001', date: '2026-08-05' });
  assert.deepEqual(lastGstRateFor(state, { name: 'anything', gstin: '24AAACF7856R1ZY' }), { gstRate: 18, from: 'INV-0002', date: '2026-08-18' });
  assert.equal(lastGstRateFor(state, { name: 'New Customer' }), null);
  assert.equal(lastGstRateFor(state, { name: 'Fabric Co' }, 'purchase').gstRate, 5);
});

test('the preview blocks an unrated invoice and offers the rate last charged, without using it', () => {
  const preview = previewOf(demo(), 'create_invoice', { date: '2026-09-01', partyName: 'Retail Mart', lines: [{ description: 'Rolls', qty: 1, rate: 1000 }] });
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /no GST rate, and I will not guess one\. INV-0001 on 2026-08-05 was at 5%\./);
  assert.equal(preview.figures.tax, 0);
});

test('the preview for a new customer asks for the rate without a suggestion', () => {
  const preview = previewOf(demo(), 'create_invoice', { date: '2026-09-01', partyName: 'New Customer', lines: [{ description: 'Work', rate: 1000 }] });
  assert.equal(preview.blockers[0], 'This has no GST rate, and I will not guess one. Say the rate, or 0% if none applies.');
});
