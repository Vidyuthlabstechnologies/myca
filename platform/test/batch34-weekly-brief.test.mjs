import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-brief-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { weeklyBrief } from '../src/weekly-brief.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
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
const sale = (state, party, date, rate) => runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date });

test('the brief leads with cash and runway, sales with deltas, receivable buckets, dues, and names the one thing', async () => {
  const state = books();
  await runTool(state, 'set_payment_terms', { partyName: 'Sharma Traders', days: 30 });
  await sale(state, 'Sharma Traders', shift(-100), 100000);
  await sale(state, 'Fresh Mart', shift(-40), 10000);
  await sale(state, 'Today Co', shift(-2), 20000);
  await sale(state, 'Last Week Co', shift(-9), 10000);
  await runTool(state, 'post_expense', { narration: 'rent', amount: 30000, payee: 'Mehta', date: shift(-20) });
  await runTool(state, 'set_cash_balance', { bank: 300000, cash: 5000, on: TODAY });

  const d = weeklyBrief(state).data;
  assert.equal(d.cash.amount, 305000);
  assert.equal(d.cash.fromReading, true);
  assert.equal(d.sales.thisWeek, 21000);
  assert.equal(d.sales.lastWeek, 10500);
  assert.equal(d.sales.weekChangePct, 100);
  assert.equal(d.receivables.total, 105000 + 10500 + 21000 + 10500);
  assert.equal(d.receivables.d61, 105000, 'Sharma is 70 days past a 30-day due date');
  assert.equal(d.receivables.d31, 0, 'Fresh Mart has no terms, so 40 days old is 10 days past the default 30');
  assert.equal(d.receivables.status, 'red');
  assert.deepEqual(d.receivables.late.map((l) => l.customer), ['Sharma Traders']);
  assert.match(d.oneThing, /^GSTR-1 \(monthly\) for 2026-0[89]: overdue\.$/, 'an overdue return outranks a late customer');
  state.filings = [];
  const noReturns = createState();
  noReturns.company = { ...noReturns.company, name: 'Unregistered', gstin: '', state: '27' };
  await runTool(noReturns, 'set_payment_terms', { partyName: 'Sharma Traders', days: 30 });
  await sale(noReturns, 'Sharma Traders', shift(-100), 100000);
  assert.match(weeklyBrief(noReturns).data.oneThing, /^Chase Sharma Traders: 70 days late on INV-0001\. Say "send reminder to Sharma Traders"\./);
  assert.ok(REMOTE_QUERY_TOOLS.has('weekly_brief'));

  const words = await chat(state, 'how is business?');
  assert.match(words.reply, /^Week of .* to .*\.\nCash ₹3,05,000\.00 \((?:up|down) ₹[0-9,.]+ on last week\)/, words.reply);
  assert.match(words.reply, /Sales this week ₹21,000\.00 \(up 100% on last week\); this month ₹/);
  assert.match(words.reply, /Customers owe ₹1,47,000\.00: ₹42,000\.00 current, ₹0\.00 31 to 60 days, ₹1,05,000\.00 over 60 days \[red\]\. Sharma Traders ₹1,05,000\.00, 70 days\./);
  assert.match(words.reply, /The one thing: GSTR-1 \(monthly\) for (?:August|September) 2026: overdue\./);
  const hindi = await chat(state, 'dhanda kaisa chal raha hai');
  assert.match(hindi.reply, /^Week of/, hindi.reply);
});

test('with empty books the brief is honest about what it does not know', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Fresh Co', gstin: '', state: '27' };
  const words = await chat(state, 'weekly brief');
  assert.match(words.reply, /Cash: only recorded figures \(₹0\.00\); give your bank balance for a true picture\./, words.reply);
  assert.match(words.reply, /Nobody owes you anything right now\./);
  assert.match(words.reply, /The one thing: Give MyCA your bank balance today/);
});
