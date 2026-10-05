import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';

function invoice(state, id, partyName, rate, date = '2026-08-01') {
  const out = createInvoice(state, { id, date, partyName, partyGstin: '', lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
}

function books() {
  const state = createState();
  invoice(state, 'INV-0001', 'Retail Mart', 10000);
  invoice(state, 'INV-0002', 'Gujarat Weaves', 20000, '2026-08-05');
  invoice(state, 'INV-0003', 'Gujarat Weaves', 4000, '2026-08-09');
  invoice(state, 'INV-0004', 'Kiran Stores', 1000);
  recordReceipt(state, { invoiceId: 'INV-0004', amount: 1050, mode: 'bank', date: '2026-08-10' });
  return state;
}

function receiptsOf(state, id) {
  return (state.invoices.find((i) => i.id === id).receipts || []).map((r) => [r.amount, r.mode]);
}

test('a customer with one unpaid invoice: the receipt goes against it, after a preview', async () => {
  for (const text of ['received 5000 from Retail Mart', 'Retail Mart paid 5000', 'got 5,000 from retail mart by bank', 'payment from Retail Mart 5000']) {
    const state = books();
    const out = await chat(state, text);
    assert.equal(out.awaitingConfirmation, true, `${text}: ${out.reply}`);
    assert.equal(out.preview.tool, 'record_receipt', text);
    assert.match(out.preview.summary, /Receipt of ₹5,000\.00 against INV-0001 \(Retail Mart\)/, text);
    assert.deepEqual(receiptsOf(state, 'INV-0001'), [], `${text}: nothing before confirming`);
    assert.equal((await chat(state, 'yes')).posted, true, text);
    assert.deepEqual(receiptsOf(state, 'INV-0001'), [[5000, 'bank']], text);
  }
});

test('cash is recorded as cash, and no amount means the whole balance, shown first', async () => {
  const state = books();
  const out = await chat(state, 'received cash from Retail Mart');
  assert.equal(out.preview.figures.amount, 10500);
  assert.match(out.preview.summary, /by cash/);
});

test('a customer with several unpaid invoices is asked which one, and nothing is recorded', async () => {
  const state = books();
  const out = await chat(state, 'received 5000 from Gujarat Weaves');
  assert.equal(out.awaitingConfirmation, undefined);
  assert.match(out.reply, /Gujarat Weaves has 2 unpaid invoices/);
  assert.match(out.reply, /INV-0002 of 2026-08-05, ₹21,000\.00 outstanding/);
  assert.match(out.reply, /INV-0003 of 2026-08-09, ₹4,200\.00 outstanding/);
  assert.match(out.reply, /received 5000 against INV-0002/);
  assert.equal(state.pendingChatAction, null);
  assert.deepEqual(receiptsOf(state, 'INV-0002'), []);
  assert.deepEqual(receiptsOf(state, 'INV-0003'), []);
});

test('an amount that settles exactly one of several invoices picks that invoice', async () => {
  const state = books();
  const out = await chat(state, 'Gujarat Weaves paid 4200');
  assert.equal(out.awaitingConfirmation, true, out.reply);
  assert.match(out.preview.summary, /against INV-0003/);
  await chat(state, 'yes');
  assert.deepEqual(receiptsOf(state, 'INV-0003'), [[4200, 'bank']]);

  const same = createState();
  invoice(same, 'INV-0001', 'Twin Traders', 1000);
  invoice(same, 'INV-0002', 'Twin Traders', 1000);
  const unclear = await chat(same, 'Twin Traders paid 1050');
  assert.equal(unclear.awaitingConfirmation, undefined, 'two invoices of the same amount are not guessed between');
  assert.match(unclear.reply, /has 2 unpaid invoices/);
});

test('a paid-up customer, an unknown one, and an ambiguous one record nothing', async () => {
  const state = books();
  const paidUp = await chat(state, 'received 500 from Kiran Stores');
  assert.match(paidUp.reply, /Kiran Stores has no unpaid invoice/);

  const unknown = await chat(state, 'received 500 from Zebra Mills');
  assert.match(unknown.reply, /no customer called Zebra Mills/);

  invoice(state, 'INV-0005', 'Retail Mart Pune', 3000);
  const longer = await chat(state, 'received 500 from Retail Mart Pune');
  assert.match(longer.preview.summary, /against INV-0005/, 'the longer name wins over the name it contains');
  await chat(state, 'no');

  invoice(state, 'INV-0006', 'Asha Mills', 100);
  const two = await chat(state, 'received 500 from Asha Mills and Retail Mart');
  assert.match(two.reply, /That could be/);
  assert.equal(state.pendingChatAction, null);
});

test('a receipt is dated today unless the sentence gives a date, never the invoice date', async () => {
  const state = books();
  const today = await chat(state, 'received 5000 from Retail Mart');
  assert.equal(today.preview.figures.date, localToday());
  assert.notEqual(today.preview.figures.date, '2026-08-01');
  await chat(state, 'no');

  const said = await chat(state, 'received 5000 from Retail Mart on 12-08-2026');
  assert.equal(said.preview.figures.date, '2026-08-12');
  assert.equal(said.preview.figures.amount, 5000, 'the date is not mistaken for the amount');
  await chat(state, 'no');

  const byNumber = await chat(state, 'payment received INV-0001 5000');
  assert.equal(byNumber.preview.figures.date, localToday());
});

test('a question about what a customer owes answers and records nothing', async () => {
  const state = books();
  const out = await chat(state, 'has Gujarat Weaves paid?');
  assert.match(out.reply, /Gujarat Weaves owes ₹25,200\.00/);
  assert.match(out.reply, /recorded nothing/);
  assert.equal(state.pendingChatAction, null);
  const none = await chat(state, 'did Kiran Stores pay? has the payment been received');
  assert.match(none.reply, /Kiran Stores owes nothing/);
});

test('money paid out, and sentences with an invoice number, are left to their own paths', async () => {
  const state = books();
  const out = await chat(state, 'paid 5000 to Retail Mart');
  assert.equal(out.awaitingConfirmation, undefined);
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
  assert.equal(state.pendingChatAction, null);

  const byNumber = await chat(state, 'received 2000 against INV-0002 from Retail Mart');
  assert.match(byNumber.preview.summary, /against INV-0002 \(Gujarat Weaves\)/, 'the invoice number decides');
});

test('more than is owed is stopped by the preview', async () => {
  const state = books();
  const out = await chat(state, 'received 99999 from Retail Mart');
  assert.equal(out.blocked, true);
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});
