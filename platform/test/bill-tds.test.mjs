import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createPurchase, billOutstanding, recordPayment } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { lockPeriod } from '../src/period-lock.mjs';

async function books({ deductor = true } = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  if (deductor) assert.equal((await runTool(state, 'set_tds_deductor', { tan: 'MUMA12345B' })).ok, true);
  const big = createPurchase(state, { partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', date: '2026-10-05', lines: [{ description: 'Job work', qty: 1, rate: 200000, gstRate: 5 }] });
  assert.equal(big.ok, true, JSON.stringify(big));
  const small = createPurchase(state, { partyName: 'Dye Works', partyGstin: '27AAACD1111A1Z5', date: '2026-10-06', lines: [{ description: 'Dyeing', qty: 1, rate: 2000, gstRate: 18 }] });
  assert.equal(small.ok, true, JSON.stringify(small));
  return state;
}

function tdsPayable(state) {
  return (state.tdsEntries || []).reduce((sum, entry) => sum + entry.tds, 0);
}

test('chat adds TDS to a posted supplier bill after a preview: the bill owes that much less and the TDS sits in TDS payable', async () => {
  const state = await books();
  const before = billOutstanding(state.purchases[0]);
  const asked = await chat(state, 'add tds 194C to BILL-0001 PAN AABCT1332L');
  assert.equal(asked.awaitingConfirmation, true, asked.reply);
  assert.equal(asked.preview.tool, 'add_bill_tds');
  assert.match(asked.reply, /BILL-0001 from Fabric Co/);
  assert.match(asked.reply, /Deduct ₹4,000\.00 TDS under 194C at 2% on ₹2,00,000\.00 before GST/);
  assert.equal(state.purchases[0].tds, undefined, 'nothing changes before yes');
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /Added TDS of ₹4,000\.00 under 194C to BILL-0001; ₹2,06,000\.00 is still owed to Fabric Co\./);
  assert.equal(state.purchases[0].tds.amount, 4000);
  assert.equal(state.purchases[0].tds.pan, 'AABCT1332L');
  assert.equal(billOutstanding(state.purchases[0]), before - 4000);
  assert.equal(tdsPayable(state), 4000);
  assert.equal(state.tdsEntries[0].source, 'BILL-0001');
  const summary = await runTool(state, 'tds_summary', {});
  assert.equal(summary.data.deducted, 4000);
  const again = await runTool(state, 'add_bill_tds', { billId: 'BILL-0001', tdsSection: '194C' });
  assert.equal(again.error, 'BILL_HAS_TDS');
  const blocked = await chat(state, 'add tds 194C to BILL-0001');
  assert.match(blocked.reply, /BILL-0001 already carries TDS of ₹4,000\.00 under 194C/);
});

test('a bill within the yearly limit gets no TDS yet but is counted, and a later bill to the same supplier that crosses it takes the earlier TDS too', async () => {
  const state = await books();
  const small = await runTool(state, 'add_bill_tds', { billId: 'BILL-0002', tdsSection: '194C', payeePan: 'AAACD1111A' });
  assert.equal(small.ok, true, JSON.stringify(small));
  assert.equal(small.tds.tds, 0);
  assert.equal(small.posted.length, 0);
  assert.equal(state.tdsEntries.length, 1);
  assert.equal(billOutstanding(state.purchases[1]), 2360);
});

test('a paid, cancelled, missing or locked bill, or books that do not deduct TDS, are refused in words and nothing is posted', async () => {
  const plain = await books({ deductor: false });
  const notDeductor = await chat(plain, 'add tds 194C to BILL-0001');
  assert.match(notDeductor.reply, /not set up to deduct TDS/);
  const state = await books();
  const missing = await chat(state, 'add tds 194C to BILL-0099');
  assert.match(missing.reply, /BILL-0099 is not in these books/);
  const paid = recordPayment(state, { billId: 'BILL-0001', amount: billOutstanding(state.purchases[0]), date: '2026-10-20' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  const after = await chat(state, 'add tds 194C to BILL-0001');
  assert.match(after.reply, /already paid in full/);
  assert.equal(state.purchases[0].tds, undefined);
  const locked = await books();
  assert.equal(lockPeriod(locked, '2026-10-31').ok, true);
  const lockedSay = await chat(locked, 'add tds 194C to BILL-0001');
  assert.match(lockedSay.reply, /inside the locked period/);
  assert.equal(tdsPayable(locked), 0);
});

test('chat reads the section, category and PAN, asks for a missing section, and never treats a payment with "less TDS" as paid in full', async () => {
  const state = await books();
  assert.deepEqual(planLocalToolCall(state, 'deduct TDS under 194J professional on BILL-0001').args, { billId: 'BILL-0001', tdsSection: '194J', tdsCategory: 'professional' });
  assert.deepEqual(planLocalToolCall(state, 'BILL-0001 tds 194C').args, { billId: 'BILL-0001', tdsSection: '194C' });
  assert.match(planLocalToolCall(state, 'add tds to BILL-0001').reply, /Say which TDS section applies to BILL-0001/);
  const payment = planLocalToolCall(state, 'paid Fabric Co 50000 against BILL-0001 less tds 194C');
  assert.equal(payment.kind, 'reply');
  assert.match(payment.reply, /first say "add TDS 194C to BILL-0001"/);
  assert.match(planLocalToolCall(state, 'add tds 194C to BILL-0001 and BILL-0002').reply, /one bill at a time/);
  const withAmount = planLocalToolCall(state, 'tds withheld by us 5000 on BILL-0001 under 194C');
  assert.equal(withAmount.name, 'add_bill_tds');
  assert.match(withAmount.note, /amount you said is not used/);
  assert.notEqual(planLocalToolCall(state, 'what is the tds on BILL-0001').name, 'add_bill_tds');
  assert.equal(validateAssistantToolCall('add_bill_tds', { billId: 'BILL-0001', tdsSection: '194C' }).ok, true);
  assert.equal(validateAssistantToolCall('add_bill_tds', { billId: 'INV-0001', tdsSection: '194C' }).ok, false);
  assert.equal(validateAssistantToolCall('add_bill_tds', { billId: 'BILL-0001', tdsSection: '194C', amount: 5000 }).ok, false);
});
