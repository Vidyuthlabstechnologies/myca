import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { propose, confirmPending } from '../src/router.mjs';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 8000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-02', partyName: 'Retail Mart', lines: [{ description: 'Supply', rate: 1000, gstRate: 18 }] });
  return state;
}

async function confirmed(state, name, args) {
  const held = propose(state, name, args);
  assert.ok(held.preview?.token, `${name} did not preview: ${held.reply}`);
  const out = await confirmPending(state, held.preview.token);
  assert.equal(out.posted, true, out.reply);
  assert.doesNotMatch(out.reply, /^\s*[{[]/, `${name} replied with raw data`);
  return out.reply;
}

test('a receipt is confirmed in words, with what is still to come', async () => {
  const state = books();
  assert.equal(await confirmed(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 4000, mode: 'bank', date: '2026-09-10' }),
    'Recorded ₹4,000.00 received from Kiran Stores by bank on 10 September 2026 against INV-0001. ₹4,000.00 of ₹9,440.00 received so far.');
  assert.match(await confirmed(state, 'record_receipt', { invoiceId: 'INV-0001', mode: 'cash', date: '2026-09-11' }), /₹5,440\.00 received from Kiran Stores by cash .* INV-0001 is paid in full\.$/);
});

test('an expense, and moving it to another head, are confirmed in words', async () => {
  const state = books();
  recordReceipt(state, { invoiceId: 'INV-0002', amount: 1180, mode: 'cash', date: '2026-09-03' });
  assert.equal(await confirmed(state, 'post_expense', { narration: 'Office rent', amount: 12000, gstRate: 0, mode: 'bank', date: '2026-09-10', payee: 'Landlord' }),
    'Posted EXP-0001: ₹12,000.00 for Office rent from the bank on 10 September 2026, under Rent.');
  assert.match(await confirmed(state, 'post_expense', { narration: 'Printer paper', amount: 1180, gstRate: 18, mode: 'cash', date: '2026-09-10', supplierGstin: '27AABCT1332L1ZE' }), /^Posted EXP-0002: ₹1,180\.00 for Printer paper from cash .* Input credit ₹180\.00\.$/);
  assert.equal(await confirmed(state, 'set_expense_head', { id: 'EXP-0001', head: '5200' }), 'Moved EXP-0001 to Advertising and marketing.');
});

test('a credit note and a cancellation are confirmed in words, with any refund due', async () => {
  const state = books();
  assert.match(await confirmed(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1000, reason: 'Damaged goods', date: '2026-09-12' }), /^Credit note CN-\d+ for ₹1,000\.00 against INV-0001 \(Kiran Stores, 12 September 2026\)\.$/);
  recordReceipt(state, { invoiceId: 'INV-0002', amount: 1180, mode: 'bank', date: '2026-09-03' });
  assert.match(await confirmed(state, 'cancel_invoice', { invoiceId: 'INV-0002', reason: 'Order cancelled', date: '2026-09-12' }), /^Cancelled INV-0002 with credit note CN-\d+ \(Retail Mart, 12 September 2026\)\. ₹1,180\.00 was already received and is now due back to Retail Mart\.$/);
});

test('after a credit note, the receipt preview offers only what is still owed, and that amount posts', async () => {
  const state = books();
  await confirmed(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1000, reason: 'Damaged goods', date: '2026-09-12' });
  const held = propose(state, 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: '2026-09-13' });
  assert.equal(held.preview.figures.amount, 8440);
  assert.match(await confirmed(state, 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: '2026-09-13' }), /₹8,440\.00 received/);
  const cancelled = books();
  await confirmed(cancelled, 'cancel_invoice', { invoiceId: 'INV-0002', reason: 'Order cancelled', date: '2026-09-12' });
  assert.match(propose(cancelled, 'record_receipt', { invoiceId: 'INV-0002', amount: 10 }).reply, /cancelled/);
});
