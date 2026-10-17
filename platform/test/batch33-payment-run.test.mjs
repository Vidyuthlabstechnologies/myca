import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-payrun-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { paymentRun } from '../src/payment-run.mjs';
import { billOutstanding } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
function shift(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
async function bill(state, party, date, rate, extra = {}) {
  const out = await runTool(state, 'create_purchase', { partyName: party, lines: [{ description: 'Yarn', qty: 1, rate, gstRate: 5 }], date, ...extra });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.purchase || out.bill || out;
}

test('bills are ranked on the MSMED date, the 180-day credit limit and agreed terms; held bills and later bills are set aside; cash after is shown', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Micro Dyes', msme: true, udyam: 'UDYAM-MH-01-0001234', days: 30 });
  await runTool(state, 'set_supplier_terms', { partyName: 'Big Mills', days: 30 });
  await bill(state, 'Micro Dyes', shift(-44), 10000, { supplierInvoiceNo: 'MD/1' });
  await bill(state, 'Micro Dyes', shift(-5), 4000, { supplierInvoiceNo: 'MD/2' });
  await bill(state, 'Old Trader', shift(-172), 6000, { supplierInvoiceNo: 'OT/9' });
  await bill(state, 'Big Mills', shift(-25), 8000, { supplierInvoiceNo: 'BM/3' });
  await bill(state, 'Big Mills', shift(-2), 2000, { supplierInvoiceNo: 'BM/4' });
  await bill(state, 'No Terms Co', shift(-60), 3000, { supplierInvoiceNo: 'NT/5' });
  await bill(state, 'No Terms Co', shift(-10), 1000, { supplierInvoiceNo: 'NT/6' });
  await runTool(state, 'set_cash_balance', { bank: 500000, cash: 10000, on: TODAY });

  const run = paymentRun(state).data;
  assert.deepEqual(run.proposed.map((r) => [r.supplier, r.bucket]), [['Micro Dyes', 'msme-limit'], ['Old Trader', 'credit-at-risk'], ['Big Mills', 'due']]);
  assert.equal(run.proposed[0].supplierInvoiceNo, 'MD/1');
  assert.equal(run.proposed[2].supplierInvoiceNo, 'BM/3');
  assert.deepEqual(run.consider.map((r) => r.supplierInvoiceNo), ['NT/5']);
  assert.deepEqual(run.later.map((r) => r.supplierInvoiceNo).sort(), ['BM/4', 'MD/2', 'NT/6']);
  assert.equal(run.total, 10500 + 6300 + 8400);
  assert.equal(run.balance, 510000);
  assert.equal(run.after, 510000 - 25200);
  assert.equal(run.verdict, 'yes');

  const words = await chat(state, 'who do I need to pay?');
  assert.match(words.reply, /^Pay now, ₹25,200\.00 across 3 bills:/, words.reply);
  assert.match(words.reply, /Micro Dyes ₹10,500\.00 on BILL-0001 \(their MD\/1\): MSMED pay-by date in 1 days|MSMED pay-by date is today|days past the MSMED/, words.reply);
  assert.match(words.reply, /Old Trader ₹6,300\.00 on BILL-0003 \(their OT\/9\): 8 days to the 180-day credit limit/, words.reply);
  assert.match(words.reply, /Consider, ₹3,150\.00:/);
  assert.match(words.reply, /Bank and cash ₹5,10,000\.00, ₹4,84,800\.00 after paying; payroll and GST still clear\./);
  assert.match(words.reply, /3 bills \(₹7,350\.00\) can wait\./);
});

test('"pay the proposed bills" previews one batch, posts a payment per bill, and an exclusion is honoured', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Big Mills', days: 15 });
  await bill(state, 'Big Mills', shift(-20), 8000, { supplierInvoiceNo: 'BM/3' });
  await bill(state, 'Big Mills', shift(-16), 2000, { supplierInvoiceNo: 'BM/4' });
  await bill(state, 'Old Trader', shift(-175), 6000);
  await runTool(state, 'set_cash_balance', { bank: 200000, cash: 0, on: TODAY });
  const held = await chat(state, 'pay the proposed bills except BILL-0002');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Pay ₹14,700\.00 to 2 suppliers across 2 bills from the bank on/, held.reply);
  assert.match(held.reply, /Old Trader ₹6,300\.00 on BILL-0003; Big Mills ₹8,400\.00 on BILL-0001 \(their BM\/3\)/, 'credit at risk comes before agreed terms');
  assert.match(held.reply, /Bank and cash ₹2,00,000\.00 before, ₹1,85,300\.00 after/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /Paid ₹14,700\.00 across 2 bills from the bank/);
  assert.equal(billOutstanding(state.purchases[0]), 0);
  assert.equal(billOutstanding(state.purchases[1]), 2100);
  assert.equal(billOutstanding(state.purchases[2]), 0);
  const left = await chat(state, 'pay the bills');
  assert.match(left.reply, /^Pay now, ₹2,100\.00 across 1 bill:
· Big Mills ₹2,100\.00 on BILL-0002 \(their BM\/4\): 1 days past the agreed date\./, left.reply);
  await chat(state, 'pay the proposed bills');
  await chat(state, 'yes');
  const nothing = await chat(state, 'pay the bills');
  assert.match(nothing.reply, /^Nothing needs paying in the next 14 days\.$/, nothing.reply);
});

test('a run that would take the balance below zero is blocked, and a bill with an open exception is held back', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Big Mills', days: 10 });
  await bill(state, 'Big Mills', shift(-12), 100000);
  await runTool(state, 'set_cash_balance', { bank: 50000, cash: 0, on: TODAY });
  const held = await runTool(state, 'record_payment_run', {});
  assert.equal(held.ok, true, 'the engine itself pays when asked; the preview is where the warning lives');
  const state2 = books();
  await runTool(state2, 'set_supplier_terms', { partyName: 'Big Mills', days: 10 });
  await bill(state2, 'Big Mills', shift(-12), 100000);
  await runTool(state2, 'set_cash_balance', { bank: 50000, cash: 0, on: TODAY });
  const preview = await chat(state2, 'pay the proposed bills');
  assert.match(preview.reply, /balance would go below zero/, preview.reply);
  assert.equal(preview.awaitingConfirmation, undefined);
  const state3 = books();
  await bill(state3, 'Risky Co', shift(-170), 5000, { supplierInvoiceNo: 'RC/1', partyGstin: '27AAACH7409R1Z1' });
  state3.exceptions = [{ id: 'EXC-000001', key: 'test:held', status: 'open', severity: 'high', title: 'Bill RC/1 is in dispute', evidence: { billIds: ['BILL-0001'] }, moneyAtRisk: 0, raisedAt: TODAY, source: 'test', code: 'TEST', why: 'test' }];
  state3.exceptionSeq = 1;
  const run = paymentRun(state3).data;
  assert.equal(run.proposed.length, 0);
  assert.deepEqual(run.held.map((r) => [r.billId, r.reason]), [['BILL-0001', 'EXC-000001: Bill RC/1 is in dispute']]);
  const refused = await runTool(state3, 'record_payment_run', { billIds: ['BILL-0001'] });
  assert.equal(refused.error, 'BILLS_NOT_PAYABLE');
  assert.equal(refused.problems[0].error, 'HELD');
});
