import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';
import { planGstPayFromChat } from '../src/gst-pay-intent.mjs';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 50000, gstRate: 18 }] });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 20000, mode: 'bank', date: '2026-09-10' });
  createPurchase(state, { id: 'BILL-0001', date: '2026-09-02', partyName: 'Fabric Co', lines: [{ description: 'Cloth', rate: 10000, gstRate: 5 }] });
  return state;
}

test('a Hinglish question about this month\'s GST reads the GST payable, the way the English one does', () => {
  for (const text of ['is mahine GST kitna banega', 'GST kitna dena hai?', 'is month ka gst kitna bharna hai', 'kitna GST banta hai']) {
    assert.deepEqual(planGstPayFromChat(text), { kind: 'tool', name: 'gst_payable', args: {} }, text);
  }
  assert.deepEqual(planGstPayFromChat('september ka GST kitna banega'), planGstPayFromChat('how much GST for September'));
});

test('Hinglish questions about who owes whom are answered from the books, and nothing is recorded', async () => {
  const state = books();
  const customers = 'Customers owe you ₹39,000.00 in all: Kiran Stores ₹39,000.00. Nothing was recorded.';
  for (const text of ['kaun paisa dena baaki hai', 'kisne paisa dena hai?', 'mujhe kitna paisa lena hai', 'kitna udhaar baaki hai']) {
    const out = await chat(state, text);
    assert.equal(out.reply, customers, text);
    assert.notEqual(out.awaitingConfirmation, true, text);
  }
  const suppliers = 'You owe suppliers ₹10,500.00 in all: Fabric Co ₹10,500.00. Nothing was recorded.';
  for (const text of ['mujhe kisko paisa dena hai', 'supplier ko kitna dena baaki hai']) {
    assert.equal((await chat(state, text)).reply, suppliers, text);
  }
  assert.equal(state.invoices[0].receipts.length, 1);
});

test('asking for the e-way bill status of an invoice reads the status instead of asking for the distance', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  createInvoice(state, { id: 'INV-0001', date: '2026-09-05', partyName: 'Bengaluru Mart', partyGstin: '29AAACG1234F1Z0', lines: [{ description: 'Silk', hsn: '5007', qty: 2, rate: 30000, gstRate: 5 }] });
  for (const text of ['e-way bill status INV-0001', 'is an e-way bill needed for INV-0001?', 'eway bill status of inv-0001']) {
    const out = await chat(state, text);
    assert.doesNotMatch(out.reply, /Say the distance/, text);
    assert.match(out.reply, /₹63,000\.00|50,000/, `${text}: ${out.reply}`);
    assert.notEqual(out.awaitingConfirmation, true, text);
  }
  const set = await chat(state, 'transport for INV-0001: vehicle MH12AB1234, 840 km');
  assert.equal(set.preview?.tool, 'set_transport', set.reply);
});

test('the GST to pay in chat says that reverse charge tax is part of the cash, so the figures add up for the owner', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  createInvoice(state, { id: 'INV-0001', date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100000, gstRate: 5 }] });
  createPurchase(state, { date: '2026-09-06', partyName: 'Advocate Mehta', reverseCharge: true, lines: [{ description: 'Legal fees', hsn: '9982', qty: 1, rate: 10000, gstRate: 18 }] });
  const asked = await chat(state, 'how much GST do I pay for September 2026?');
  assert.match(asked.reply, /To pay in cash: ₹5,000\.00/, asked.reply);
  assert.match(asked.reply, /Reverse charge tax of 1800 on this month's purchases is paid in cash/, asked.reply);
  assert.doesNotMatch(asked.reply, /Credit is set off head by head/, 'the long set-off note stays out of the chat answer, as it does without reverse charge');
});
