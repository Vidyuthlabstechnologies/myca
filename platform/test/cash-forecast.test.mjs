import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';
import { cashForecast, cashStart, canAfford } from '../src/cash-forecast.mjs';
import { planCashFromChat } from '../src/cash-intent.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const TODAY = localToday();

function shift(days) {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function sale(state, id, date, partyName, rate) {
  const out = createInvoice(state, { id, date, partyName, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate, gstRate: 0 }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
}

function books() {
  const state = createState();
  sale(state, 'INV-0001', shift(-60), 'Retail Mart', 10000);
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 10000, date: shift(-50), mode: 'bank' });
  sale(state, 'INV-0002', shift(-5), 'Retail Mart', 20000);
  sale(state, 'INV-0003', shift(-40), 'Slow Payer', 7000);
  sale(state, 'INV-0004', shift(-2), 'New Customer', 5000);
  createPurchase(state, { date: shift(-10), partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey', hsn: '5208', qty: 1, rate: 4000, gstRate: 0 }] });
  return state;
}

test('the start is what was recorded, clearly labelled, until the owner gives a real balance', async () => {
  const state = books();
  const recorded = cashStart(state, TODAY);
  assert.equal(recorded.source, 'recorded');
  assert.equal(recorded.bank, 10000);
  assert.match(recorded.note, /not your bank statement/);
  const out = await runTool(state, 'set_cash_balance', { bank: 250000, cash: 5000, on: shift(-3) });
  assert.equal(out.ok, true, JSON.stringify(out));
  await runTool(state, 'post_expense', { narration: 'Shop rent', amount: 12000, date: shift(-1) });
  const real = cashStart(state, TODAY);
  assert.equal(real.source, 'reading');
  assert.equal(real.readingOn, shift(-3));
  assert.equal(real.bank, 238000, 'movements after the stated day are added');
  assert.equal(real.cash, 5000);
  assert.equal(state.ledger.transfers.filter((t) => String(t.code) === 'EXPENSE').length, 1, 'stating a balance posts nothing');
});

test('the forecast counts invoices by each customer\'s paying habit, assumes 30 days otherwise, and lists overdue without counting them', () => {
  const state = books();
  state.cashReadings = [{ on: TODAY, bank: 100000, cash: 0, by: '' }];
  const d = cashForecast(state, { days: 30, from: TODAY }).data;
  const coming = Object.fromEntries(d.coming.rows.map((row) => [row.label, row]));
  assert.equal(coming['INV-0002 from Retail Mart'].date, shift(5), 'Retail Mart paid in 10 days before');
  assert.match(coming['INV-0002 from Retail Mart'].basis, /usually pays in 10 days/);
  assert.equal(coming['INV-0004 from New Customer'].date, shift(28));
  assert.match(coming['INV-0004 from New Customer'].basis, /assumed 30 days/);
  assert.deepEqual(d.overdue.rows.map((row) => row.label), ['INV-0003 from Slow Payer']);
  assert.equal(d.overdue.total, 7000);
  const bill = d.going.rows.find((row) => /Fabric Co/.test(row.label));
  assert.equal(bill.date, shift(20));
  assert.equal(d.end, 100000 + 20000 + 5000 - 4000);
  assert.equal(d.lowest.amount, 100000);
  assert.ok(d.notes.some((note) => /Overdue invoices are listed but not counted/.test(note)));
});

test('usual expenses are spread over the days, and GST is taken from the deadline engine, never a fixed date', () => {
  const state = createState();
  state.cashReadings = [{ on: TODAY, bank: 50000, cash: 0, by: '' }];
  const lastMonths = [1, 2, 3].map((back) => {
    const [y, m] = TODAY.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 - back, 10)).toISOString().slice(0, 10);
  });
  for (const date of lastMonths) state.expenses = [...(state.expenses || []), { id: `EXP-${date}`, date, amount: 3000, head: '5110', headName: 'Rent' }];
  sale(state, 'INV-0001', TODAY, 'Walk-in', 10000);
  state.invoices[0].cgst = 0;
  const deadlines = [{ clientId: 'SELF', returnType: 'GSTR-3B', period: TODAY.slice(0, 7), dueDate: shift(15), daysUntil: 15 }];
  const d = cashForecast(state, { days: 30, from: TODAY, deadlines }).data;
  const spending = d.going.rows.find((row) => row.label === 'Usual expenses');
  assert.equal(spending.amount, 3000);
  assert.equal(d.end, 50000 + 10000 - 3000, 'the sale arrives on the last day, assumed paid in 30 days; GST on a 0% sale is nothing');
  assert.equal(d.going.rows.some((row) => /^GST for/.test(row.label)), false);
});

test('can I afford it: yes, tight or no, with the amount that keeps a month in hand', () => {
  const state = createState();
  state.cashReadings = [{ on: TODAY, bank: 500000, cash: 0, by: '' }];
  const [y, m] = TODAY.split('-').map(Number);
  for (const back of [1, 2, 3]) {
    const date = new Date(Date.UTC(y, m - 1 - back, 5)).toISOString().slice(0, 10);
    state.expenses = [...(state.expenses || []), { id: `E${back}`, date, amount: 60000 }];
  }
  const yes = canAfford(state, { amount: 100000, on: TODAY }).data;
  assert.equal(yes.verdict, 'yes');
  assert.equal(yes.monthlyOutgoings, 60000);
  const tight = canAfford(state, { amount: 400000, on: TODAY }).data;
  assert.equal(tight.verdict, 'tight');
  assert.ok(tight.safeToSpend > 0 && tight.safeToSpend < 400000);
  assert.equal(canAfford(state, { amount: 900000, on: TODAY }).data.verdict, 'no');
  assert.equal(canAfford(state, { amount: 0 }).error, 'BAD_AMOUNT');
  assert.equal(canAfford(state, { amount: 10, on: shift(-1) }).error, 'DATE_PASSED');
});

test('chat: amounts and months are read; "can I afford" answers, a balance is previewed and noted', async () => {
  assert.deepEqual(planCashFromChat('can I afford 40 lakh of stock in September', '2026-08-10').args, { amount: 4000000, on: '2026-09-01' });
  assert.deepEqual(planCashFromChat('Can I afford ₹40,000 next month?', '2026-08-10').args, { amount: 40000, on: '2026-09-01' });
  assert.deepEqual(planCashFromChat('can i afford 2.5 cr in march', '2026-08-10').args, { amount: 25000000, on: '2027-03-01' });
  assert.equal(planCashFromChat('can I afford it', '2026-08-10').kind, 'reply');
  assert.equal(planCashFromChat('cash forecast').name, 'cash_forecast');
  assert.deepEqual(planCashFromChat('my bank balance is 3.2 lakh').args, { bank: 320000 });
  assert.deepEqual(planCashFromChat('cash in hand is 12000').args, { cash: 12000 });
  const state = books();
  const held = await chat(state, 'my bank balance is 3 lakh');
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.match(held.preview.summary, /bank ₹3,00,000\.00, cash in hand ₹0\.00\. MyCA had recorded bank ₹10,000\.00/);
  assert.match((await chat(state, 'yes')).reply, /^Noted\./);
  const answer = await chat(state, 'can I afford 50000 today');
  assert.notEqual(answer.awaitingConfirmation, true);
  assert.match(answer.reply, /^(Yes\.|Yes, but it is tight\.|Not on these figures\.) You would have about ₹3,00,000\.00 on /);
  assert.match((await chat(state, 'cash forecast')).reply, /^Bank and cash now: ₹3,00,000\.00\. In 30 days: about/);
});

test('contracts, refusals and persistence', async () => {
  const state = books();
  assert.deepEqual(previewOf(state, 'set_cash_balance', {}).blockers, ['Give the bank balance, the cash in hand, or both.']);
  assert.deepEqual(previewOf(state, 'set_cash_balance', { bank: 1, on: shift(3) }).blockers, ['A balance can only be given for today or a day that has passed.']);
  await runTool(state, 'set_cash_balance', { bank: 1000 });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.cashReadings.length, 1);
  assert.equal(isRemoteQuery('cash_forecast'), true);
  assert.equal(isRemoteQuery('can_afford'), true);
  assert.equal(isRemoteQuery('set_cash_balance'), false);
  assert.equal(validateAssistantToolCall('can_afford', { amount: 100, on: '2026-10-01' }).ok, true);
  assert.equal(validateAssistantToolCall('can_afford', { amount: -1 }).ok, false);
  assert.equal(validateAssistantToolCall('set_cash_balance', { cash: -5 }).ok, false);
  assert.equal(validateAssistantToolCall('cash_forecast', { days: 400 }).ok, false);
  assert.equal(validateAssistantToolCall('cash_forecast', { days: 60 }).ok, true, 'an in-range whole number of days is accepted');
  assert.equal(validateAssistantToolCall('cash_forecast', { days: 2.5 }).ok, false);
});

test('GST for the month goes out on the 3B due date the deadline engine gives, as the cash to pay after set-off', () => {
  const state = createState();
  state.cashReadings = [{ on: TODAY, bank: 50000, cash: 0, by: '' }];
  createInvoice(state, { id: 'INV-0001', date: TODAY, partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 5 }] });
  createPurchase(state, { date: TODAY, partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey', hsn: '5208', qty: 1, rate: 2000, gstRate: 5 }] });
  const deadlines = [{ clientId: 'SELF', returnType: 'GSTR-3B', period: TODAY.slice(0, 7), dueDate: shift(15), daysUntil: 15 }];
  const gst = cashForecast(state, { days: 20, from: TODAY, deadlines }).data.going.rows.find((row) => /^GST for/.test(row.label));
  assert.equal(gst.date, shift(15));
  assert.equal(gst.amount, 500 - 100);
  assert.match(gst.basis, /set off head by head/);
  assert.equal(cashForecast(state, { days: 10, from: TODAY, deadlines }).data.going.rows.some((row) => /^GST for/.test(row.label)), false, 'outside the window it is not counted');
});
