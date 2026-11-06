import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';

async function trading() {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-05-10' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const second = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 5000, gstRate: 18 }], date: '2026-06-02' });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal((await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 11800, date: '2026-05-20' })).ok, true);
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0002', amount: 1180, date: '2026-06-05', reason: 'goods returned' })).ok, true);
  const bill = await runTool(state, 'create_purchase', { partyName: 'Rao Mills', lines: [{ description: 'Yarn', qty: 1, rate: 4000, gstRate: 18 }], date: '2026-05-12' });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal((await runTool(state, 'record_payment', { billId: 'BILL-0001', amount: 4720, date: '2026-05-25' })).ok, true);
  assert.equal((await runTool(state, 'post_expense', { narration: 'Rent', amount: 2000, date: '2026-05-31' })).ok, true);
  return state;
}

test('profit and loss for a period counts only entries dated in it and nets income against expenses', async () => {
  const state = await trading();
  const out = await runTool(state, 'profit_and_loss', { from: '2026-04-01', to: '2027-03-31' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.totalIncome, 14000);
  assert.equal(d.totalExpenses, 6000);
  assert.equal(d.netProfit, 8000);
  assert.equal(d.currency, 'INR');
  assert.match(d.csv, /^section,code,account,amount\r?\n/);
  assert.match(d.csv, /Result,,Net profit,8000/);
  assert.match(d.text, /a profit of ₹8,000\.00/);
  const may = (await runTool(state, 'profit_and_loss', { from: '2026-05-01', to: '2026-05-31' })).data;
  assert.equal(may.totalIncome, 10000);
  assert.equal(may.totalExpenses, 6000);
  assert.equal(may.netProfit, 4000);
  const before = (await runTool(state, 'profit_and_loss', { from: '2026-04-01', to: '2026-04-30' })).data;
  assert.equal(before.netProfit, 0);
  assert.deepEqual(before.income, []);
});

test('the balance sheet balances, carries the profit to date into equity, and ignores entries after its date', async () => {
  const state = await trading();
  const out = await runTool(state, 'balance_sheet', { asOf: '2026-12-31' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.balanced, true);
  assert.equal(d.totalAssets, d.totalLiabilities + d.totalEquity);
  assert.equal(d.equity.find((l) => l.account === 'Profit to date').amount, 8000);
  const early = (await runTool(state, 'balance_sheet', { asOf: '2026-05-15' })).data;
  assert.equal(early.balanced, true);
  assert.equal(early.equity.find((l) => l.account === 'Profit to date').amount, 6000);
  assert.match(early.text, /It balances\./);
});

test('the cash flow statement ties opening plus movements to closing and sorts money by kind', async () => {
  const state = await trading();
  const out = await runTool(state, 'cash_flow_statement', { from: '2026-04-01', to: '2027-03-31' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.ties, true);
  assert.equal(d.opening, 0);
  const line = (label) => d.operating.lines.find((l) => l.label === label);
  assert.equal(line('Received from customers').in, 11800);
  assert.equal(line('Paid to suppliers').out, 4720);
  assert.equal(d.closing, d.opening + d.netChange);
  const june = (await runTool(state, 'cash_flow_statement', { from: '2026-06-01', to: '2026-06-30' })).data;
  assert.equal(june.opening, d.closing);
  assert.equal(june.netChange, 0);
  assert.equal(june.ties, true);
});

test('a customer statement lists invoices, payments and notes with a running balance and an opening balance', async () => {
  const state = await trading();
  const out = await runTool(state, 'customer_statement', { party: 'kiran stores', from: '2026-04-01', to: '2027-03-31' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.customer, 'Kiran Stores');
  assert.equal(d.opening, 0);
  assert.deepEqual(d.rows.map((r) => [r.date, r.entry, r.charged, r.paid, r.balance]), [
    ['2026-05-10', 'Invoice', 11800, 0, 11800],
    ['2026-05-20', 'Payment received', 0, 11800, 0],
    ['2026-06-02', 'Invoice', 5900, 0, 5900],
    ['2026-06-05', 'Credit note', 0, 1180, 4720],
  ]);
  assert.equal(d.closing, 4720);
  assert.match(d.text, /Kiran Stores owes you ₹4,720\.00/);
  assert.match(d.csv, /Opening balance/);
  const june = (await runTool(state, 'customer_statement', { party: 'Kiran', from: '2026-06-01', to: '2026-06-30' })).data;
  assert.equal(june.opening, 0);
  assert.equal(june.rows.length, 2);
  assert.equal(june.closing, 4720);
});

test('statements refuse bad dates and unknown customers without changing the books', async () => {
  const state = await trading();
  const before = JSON.stringify(state.invoices);
  assert.equal((await runTool(state, 'profit_and_loss', { from: '2026/04/01' })).error, 'INVALID_DATE');
  assert.equal((await runTool(state, 'profit_and_loss', { from: '2026-05-01', to: '2026-04-01' })).error, 'INVALID_PERIOD');
  assert.equal((await runTool(state, 'balance_sheet', { asOf: 'yesterday' })).error, 'INVALID_DATE');
  const unknown = await runTool(state, 'customer_statement', { party: 'Nobody Ltd' });
  assert.equal(unknown.error, 'PARTY_NOT_FOUND');
  assert.deepEqual(unknown.customers, ['Kiran Stores']);
  assert.equal(JSON.stringify(state.invoices), before);
});

test('statements are reachable from chat, from the phone, for both countries, and have argument schemas', async () => {
  const state = await trading();
  assert.match((await chat(state, 'show my profit and loss')).reply, /income ₹/);
  assert.match((await chat(state, 'balance sheet please')).reply, /As at \d{1,2} \w+ \d{4}: assets/);
  assert.match((await chat(state, 'where did my money go')).reply, /cash and bank went from/);
  for (const name of ['profit_and_loss', 'balance_sheet', 'cash_flow_statement', 'customer_statement']) {
    assert.ok(REMOTE_QUERY_TOOLS.has(name), name);
    assert.equal(toolServesCountry(name, 'IN'), true, name);
    assert.equal(toolServesCountry(name, 'US'), true, name);
    assert.ok(TOOL_ARG_SCHEMAS[name], name);
  }
});
