import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

async function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 100000, gstRate: 18 }], date: '2026-08-05' });
  await runTool(state, 'create_purchase', { partyName: 'Fabric Co', partyGstin: '27AAACF7856R1ZY', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 40000, gstRate: 5 }], date: '2026-08-10', supplierInvoiceNo: 'FC/1' });
  return state;
}

test('recording the GST payment sets off input credit head by head, pays the rest in cash, and books interest and late fee when late', async () => {
  const state = await books();
  const payable = await runTool(state, 'gst_payable', { period: '2026-08', payOn: '2026-09-15' });
  assert.equal(payable.ok, true, JSON.stringify(payable));
  assert.equal(payable.data.toPay, 16000);
  assert.equal(payable.data.paid, null);
  const blocked = await runTool(state, 'record_gst_payment', { period: '2026-08', date: '2026-09-15', cpin: '123' });
  assert.equal(blocked.error, 'BAD_CPIN');
  const out = await runTool(state, 'record_gst_payment', { period: '2026-08', date: '2026-09-15', cpin: '26080012345678' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const p = out.payment;
  assert.equal(p.cash.total, 16000);
  assert.equal(p.creditUsed, 2000);
  assert.equal(p.interest, 0);
  assert.equal(p.lateFee, 0);
  assert.equal(acc(state, '2100').creditsPosted, 9000);
  assert.equal(acc(state, '2100').debitsPosted, 9000, 'CGST output cleared by credit and cash');
  assert.equal(acc(state, '1200').creditsPosted, 1000, 'CGST input credit used');
  assert.equal(acc(state, '1002').creditsPosted, 16000);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'record_gst_payment', { period: '2026-08', date: '2026-09-16' })).error, 'ALREADY_RECORDED');
  assert.equal((await runTool(state, 'gst_payable', { period: '2026-08' })).data.paid.cpin, '26080012345678');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.gstPayments['2026-08'].cashTotal, 16000);
  assert.equal((await runTool(state, 'list_gst_payments', {})).data.payments[0].period, '2026-08');

  const late = await books();
  await runTool(late, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 100000, gstRate: 18 }], date: '2026-07-05' });
  const lateOut = await runTool(late, 'record_gst_payment', { period: '2026-07', date: '2026-09-20' });
  assert.equal(lateOut.ok, true, JSON.stringify(lateOut));
  assert.ok(lateOut.payment.interest > 0, 'interest after the due date');
  assert.ok(lateOut.payment.lateFee > 0, 'late fee after the due date');
  assert.equal(acc(late, '5310').debitsPosted, lateOut.payment.interest + lateOut.payment.lateFee);
  assert.equal(lateOut.payment.late, true);
});

test('chat: "paid GST for August, CPIN ..." previews and records; the owner can enter a sales tax due day for a state with no rule', async () => {
  const state = await books();
  const held = await chat(state, 'paid GST for August, CPIN 26080012345678');
  assert.equal(held.preview?.tool, 'record_gst_payment', held.reply);
  assert.match(held.preview.summary, /CPIN 26080012345678: ₹16,000\.00 in cash \(CGST ₹8,000\.00 \+ SGST ₹8,000\.00\).*; ₹2,000\.00 of input credit set off\./);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Recorded the GST payment for (?:2026-08|August 2026): ₹16,000\.00 in cash.*with ₹2,000\.00 of input credit set off \(CPIN 26080012345678\)/);

  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '' };
  await runTool(us, 'set_sales_tax_rate', { code: 'NV', ratePercent: 6.85, from: '2026-01-01' });
  const nexus = await runTool(us, 'set_sales_tax_nexus', { state: 'NV', frequency: 'monthly', from: '2026-09-01', dueDay: 'last' });
  assert.equal(nexus.ok, true, JSON.stringify(nexus));
  await runTool(us, 'create_invoice', { partyName: 'Reno Cafe', lines: [{ description: 'Cake', qty: 1, rate: 100 }], date: '2026-09-10', taxJurisdiction: 'NV' });
  const ret = await runTool(us, 'sales_tax_return', { state: 'NV', period: '2026-09' });
  assert.equal(ret.data.dueDate, '2026-10-31');
  assert.match(ret.data.notes.join(' '), /the day you entered for NV/);
  assert.equal((await runTool(us, 'set_sales_tax_nexus', { state: 'NV', frequency: 'monthly', dueDay: '31' })).error, 'BAD_DUE_DAY');
  const tx = await runTool(us, 'set_sales_tax_nexus', { state: 'TX', frequency: 'monthly', from: '2026-09-01', dueDay: '25' });
  assert.equal(tx.ok, true);
  await runTool(us, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  const txReturn = await runTool(us, 'sales_tax_return', { state: 'TX', period: '2026-09' });
  assert.equal(txReturn.data.dueDate, '2026-10-20', 'a rule MyCA holds wins over the owner\'s day');
});
