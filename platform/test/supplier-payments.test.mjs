import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { createPurchase, createInvoice, recordReceipt, recordPayment, billOutstanding } from '../src/invoice.mjs';
import { listAccounts } from '../src/ledger.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { chat } from '../src/router.mjs';
import { businessSummary } from '../src/business-summary.mjs';
import { cashForecast } from '../src/cash-forecast.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function bill(state, id, partyName, rate, date = '2026-09-01', extra = {}) {
  const out = createPurchase(state, { id, date, partyName, partyGstin: '', lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], ...extra });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function books() {
  const state = createState();
  bill(state, 'BILL-0001', 'Fabric Co', 10000, '2026-09-01', { supplierInvoiceNo: 'FC-881' });
  bill(state, 'BILL-0002', 'Thread House', 20000, '2026-09-05');
  bill(state, 'BILL-0003', 'Thread House', 4000, '2026-09-09');
  return state;
}

function balanceOf(state, code) {
  const account = listAccounts(state.ledger).find((item) => item.code === String(code));
  return Math.round(((account?.debitsPosted || 0) - (account?.creditsPosted || 0)) * 100) / 100;
}

function vendorCode(state, name) {
  return state.vendors.find((vendor) => vendor.name === name).accountId;
}

test('paying a bill in full clears the supplier and takes the money from the bank', () => {
  const state = books();
  const before = balanceOf(state, 1002);
  const out = recordPayment(state, { billId: 'BILL-0001', date: '2026-09-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.payment, { amount: 10500, date: '2026-09-10', mode: 'bank' });
  assert.equal(out.remaining, 0);
  assert.equal(state.purchases[0].status, 'paid');
  assert.equal(balanceOf(state, vendorCode(state, 'Fabric Co')), 0);
  assert.equal(balanceOf(state, 1002), before - 10500);
});

test('part payments add up, and the bill is paid only when nothing is owed', () => {
  const state = books();
  assert.equal(recordPayment(state, { billId: 'BILL-0002', amount: 6000, date: '2026-09-10' }).remaining, 15000);
  assert.equal(state.purchases[1].status, 'partial');
  assert.deepEqual(recordPayment(state, { billId: 'BILL-0002', amount: 15000.01, date: '2026-09-11' }), { ok: false, error: 'OVERPAYMENT', billId: 'BILL-0002', due: 15000 });
  assert.equal(recordPayment(state, { billId: 'BILL-0002', date: '2026-09-12' }).payment.amount, 15000);
  assert.equal(state.purchases[1].status, 'paid');
  assert.equal(billOutstanding(state.purchases[1]), 0);
  assert.equal(recordPayment(state, { billId: 'BILL-0002', amount: 1, date: '2026-09-12' }).error, 'BILL_PAID');
});

test('refusals post nothing: unknown bill, a date before the bill, a bad amount, more cash than is in hand', () => {
  const state = books();
  const transfers = state.ledger.transfers.size;
  assert.equal(recordPayment(state, { billId: 'BILL-9999' }).error, 'BILL_NOT_FOUND');
  assert.equal(recordPayment(state, { billId: 'BILL-0001', date: '2026-08-31' }).error, 'BEFORE_BILL');
  assert.equal(recordPayment(state, { billId: 'BILL-0001', date: 'someday' }).error, 'INVALID_DATE');
  assert.equal(recordPayment(state, { billId: 'BILL-0001', amount: -5 }).error, 'BAD_AMOUNT');
  assert.deepEqual(recordPayment(state, { billId: 'BILL-0001', mode: 'cash' }), { ok: false, error: 'INSUFFICIENT_CASH', inHand: 0, amount: 10500 });
  assert.equal(state.ledger.transfers.size, transfers);
  assert.equal(state.purchases[0].payments, undefined);
});

test('cash can pay a bill once there is cash in hand', () => {
  const state = books();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-02', partyName: 'Retail Mart', lines: [{ description: 'Sale', rate: 20000, gstRate: 5 }] });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 21000, date: '2026-09-03', mode: 'cash' });
  assert.equal(recordPayment(state, { billId: 'BILL-0001', mode: 'cash', date: '2026-09-04' }).ok, true);
  assert.equal(balanceOf(state, 1001), 10500);
});

test('payments survive saving and loading the books', () => {
  const state = books();
  recordPayment(state, { billId: 'BILL-0002', amount: 6000, date: '2026-09-10' });
  const loaded = deserialize(serialize(state));
  assert.deepEqual(loaded.purchases[1].payments, [{ amount: 6000, date: '2026-09-10', mode: 'bank' }]);
  assert.equal(loaded.purchases[1].status, 'partial');
  assert.equal(recordPayment(loaded, { billId: 'BILL-0002', date: '2026-09-11' }).payment.amount, 15000);
});

test('the preview shows what is owed and what will remain, naming the supplier\'s own bill number', () => {
  const state = books();
  const preview = previewOf(state, 'record_payment', { billId: 'BILL-0001', amount: 500, date: '2026-09-10' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /^Pay Fabric Co ₹500(\.00)? against BILL-0001 \(their bill FC-881\) from the bank on 2026-09-10\./);
  assert.match(preview.effects[1], /stays partly paid, with ₹10,000(\.00)? still owed/);
  const blocked = previewOf(state, 'record_payment', { billId: 'BILL-0001', amount: 20000 });
  assert.match(blocked.blockers[0], /more than is still owed.*₹10,500(\.00)? is owed on BILL-0001/);
});

test('chat: "paid BILL-0001" previews, and pays only on yes', async () => {
  const state = books();
  const out = await chat(state, 'paid BILL-0001');
  assert.equal(out.awaitingConfirmation, true, out.reply);
  assert.equal(out.preview.tool, 'record_payment');
  assert.equal(state.purchases[0].payments, undefined);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /Paid Fabric Co ₹10,500(\.00)? against BILL-0001 by bank/);
  assert.equal(state.purchases[0].status, 'paid');
});

test('chat: a supplier with one unpaid bill is paid against it; several bills are listed unless the amount fits one', async () => {
  const one = books();
  const out = await chat(one, 'paid Fabric Co 4000 in cash');
  assert.equal(out.blocked, true, out.reply);
  assert.match(out.reply, /I did not post anything[\s\S]*Cash in hand is ₹0\.00/);
  assert.equal(one.purchases[0].payments, undefined);

  const many = books();
  const listed = await chat(many, 'paid Thread House 5000');
  assert.equal(listed.awaitingConfirmation, undefined);
  assert.match(listed.reply, /Thread House has 2 unpaid bills: BILL-0002 .*BILL-0003 .*I have recorded nothing/);
  const exact = await chat(many, 'paid Thread House 4200');
  assert.equal(exact.preview.tool, 'record_payment');
  assert.match(exact.preview.summary, /against BILL-0003/);
});

test('chat: questions answer and record nothing; money in and new bills keep their own paths', async () => {
  const state = books();
  const owed = await chat(state, 'how much have I paid Thread House?');
  assert.match(owed.reply, /You owe Thread House ₹25,200\.00: .*I have recorded nothing/);
  const bought = await chat(state, 'bought cloth from Fabric Co 1000 GST 5% paid cash');
  assert.notEqual(bought.preview?.tool, 'record_payment');
  const incoming = await chat(state, 'Fabric Co paid 500');
  assert.notEqual(incoming.preview?.tool, 'record_payment');
  assert.equal(state.purchases.every((item) => !item.payments), true);
});

test('the dashboard shows what is owed to suppliers, net of payments', () => {
  const state = books();
  recordPayment(state, { billId: 'BILL-0002', amount: 6000, date: '2026-09-10' });
  const owed = businessSummary(state, { period: '2026-09' }).data.owedBySuppliers;
  assert.equal(owed.total, 29700);
  assert.equal(owed.bills, 3);
  assert.deepEqual(owed.suppliers[0], { name: 'Thread House', due: 19200, bills: 2 });
});

test('the forecast counts only what is still owed, and lists bills unpaid past 30 days without counting them', () => {
  const state = books();
  recordPayment(state, { billId: 'BILL-0002', amount: 6000, date: '2026-09-10' });
  recordPayment(state, { billId: 'BILL-0003', date: '2026-09-10' });
  const early = cashForecast(state, { from: '2026-09-20', days: 30 }).data;
  assert.deepEqual(early.going.rows.map((row) => [row.label, row.amount]), [['FC-881 to Fabric Co', 10500], ['BILL-0002 to Thread House', 15000]]);
  const late = cashForecast(state, { from: '2026-10-20', days: 30 }).data;
  assert.equal(late.going.rows.length, 0);
  assert.equal(late.unpaidBills.total, 25500);
  assert.match(late.notes.join(' '), /listed but not counted/);
});

test('record_payment has a strict schema', () => {
  assert.equal(validateAssistantToolCall('record_payment', { billId: 'BILL-0001', amount: 10, mode: 'bank' }).ok, true);
  assert.equal(validateAssistantToolCall('record_payment', { billId: 'BILL-0001', mode: 'upi' }).ok, false);
  assert.equal(validateAssistantToolCall('record_payment', { billId: 'BILL-0001', extra: 1 }).ok, false);
  assert.equal(validateAssistantToolCall('record_payment', {}).ok, false);
});
