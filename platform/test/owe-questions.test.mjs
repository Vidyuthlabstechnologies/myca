import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, recordReceipt, recordPayment } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 50000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-05', partyName: 'Retail Mart', lines: [{ description: 'Supply', rate: 1000, gstRate: 18 }] });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 20000, mode: 'bank', date: '2026-09-10' });
  createPurchase(state, { id: 'BILL-0001', date: '2026-09-02', partyName: 'Fabric Co', supplierInvoiceNo: 'FC-881', lines: [{ description: 'Cloth', rate: 10000, gstRate: 5 }] });
  recordPayment(state, { billId: 'BILL-0001', amount: 4000, mode: 'bank', date: '2026-09-11' });
  return state;
}

test('what a customer owes is answered from the books, and nothing is recorded', async () => {
  const state = books();
  for (const text of ['how much does Kiran Stores owe?', 'what does Kiran Stores owe me', 'Kiran Stores outstanding?']) {
    const out = await chat(state, text);
    assert.equal(out.reply, 'Kiran Stores owes you ₹39,000.00: INV-0001 of 2026-09-01, ₹39,000.00. Nothing was recorded.', text);
    assert.equal(out.awaitingConfirmation, undefined, text);
  }
  assert.equal((await chat(state, 'who owes me?')).reply, 'Customers owe you ₹40,180.00 in all: Kiran Stores ₹39,000.00, Retail Mart ₹1,180.00. Nothing was recorded.');
});

test('what you owe a supplier is answered from the bills, net of payments', async () => {
  const state = books();
  assert.equal((await chat(state, 'how much do I owe Fabric Co?')).reply, 'You owe Fabric Co ₹6,500.00: BILL-0001 (their FC-881) of 2026-09-02, ₹6,500.00. Nothing was recorded.');
  assert.equal((await chat(state, 'who do I owe?')).reply, 'You owe suppliers ₹6,500.00 in all: Fabric Co ₹6,500.00. Nothing was recorded.');
  assert.equal(state.purchases[0].payments.length, 1);
});

test('statements that mention owing are not mistaken for questions', async () => {
  const state = books();
  const out = await chat(state, 'received 1180 from Retail Mart');
  assert.equal(out.preview?.tool, 'record_receipt');
});

test('a credit note takes its reason from the words after the amount', async () => {
  const state = books();
  const out = await chat(state, 'credit note INV-0001 5000 damaged goods');
  assert.equal(out.preview?.tool, 'create_credit_note', out.reply);
  assert.match(out.preview.summary, /damaged goods/i);
  assert.match((await chat(state, 'credit note for INV-0001 2000')).reply, /^Say why/);
});

test('an unmatched message gets plain words, not internals', async () => {
  const out = await chat(books(), 'please dance');
  assert.match(out.reply, /^I did not match that to anything I can do, so nothing was recorded\./);
  assert.doesNotMatch(out.reply, /probe govt|checksum|GSTIN/);
});

test('a credit note for a round amount totals exactly that amount', async () => {
  const state = books();
  for (const amount of [5000, 333.33, 1, 39000]) {
    const out = await chat(state, `credit note INV-0001 ${amount} goods returned`);
    assert.equal(out.preview?.figures?.total ?? out.preview?.figures?.amount, amount, out.reply);
    await chat(state, 'no');
  }
});
