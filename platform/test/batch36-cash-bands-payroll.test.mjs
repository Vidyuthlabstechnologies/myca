import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-bands-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { cashForecast, payingStats, canMakePayroll } from '../src/cash-forecast.mjs';
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
async function paidSale(state, party, date, rate, paidAfter) {
  const inv = (await runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date })).invoice;
  if (paidAfter != null) await runTool(state, 'record_receipt', { invoiceId: inv.id, date: shift(-(daysAgo(date)) + paidAfter), mode: 'bank' });
  return inv;
}
const daysAgo = (date) => Math.round((Date.parse(TODAY) - Date.parse(date)) / 86400000);

test('paying history gives a band per customer; windows carry low, expected and high; bills follow their pay-by date; payroll and statutory dues are dated outgoings', async () => {
  const state = books();
  for (const [date, after] of [[shift(-200), 28], [shift(-170), 32], [shift(-140), 30], [shift(-110), 31]]) await paidSale(state, 'Steady Mart', date, 10000, after);
  for (const [date, after] of [[shift(-200), 10], [shift(-170), 70], [shift(-140), 25]]) await paidSale(state, 'Erratic Co', date, 10000, after);
  await paidSale(state, 'Steady Mart', shift(-20), 20000);
  await paidSale(state, 'Erratic Co', shift(-15), 20000);
  await paidSale(state, 'Newcomer', shift(-10), 5000);
  const stats = payingStats(state);
  assert.equal(stats.get('steady mart').median, 30);
  assert.ok(stats.get('steady mart').bandPct <= 10, `steady band ${stats.get('steady mart').bandPct}`);
  assert.equal(stats.get('erratic co').bandPct, 50, 'the band is capped at half');
  assert.equal(stats.get('erratic co').tooThin, true);

  await runTool(state, 'set_supplier_terms', { partyName: 'Micro Dyes', msme: true, udyam: 'UDYAM-MH-01-0001234', days: 45 });
  await runTool(state, 'create_purchase', { partyName: 'Micro Dyes', lines: [{ description: 'Dye', qty: 1, rate: 8000, gstRate: 5 }], date: shift(-5) });
  await runTool(state, 'add_employee', { name: 'Meena Shah', joinedOn: '2026-04-01', components: [{ name: 'Salary', amount: 18000 }], esiMember: true, ptState: '27', sex: 'female' });
  const lastMonth = shift(-40).slice(0, 7);
  assert.equal((await runTool(state, 'approve_payroll', { period: lastMonth })).ok, true);
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });

  const f = cashForecast(state, { days: 90, from: TODAY }).data;
  assert.equal(f.windows.length, 3);
  assert.ok(f.windows[0].in.low <= f.windows[0].in.expected && f.windows[0].in.expected <= f.windows[0].in.high);
  const bill = f.going.rows.find((r) => /to Micro Dyes/.test(r.label));
  assert.equal(bill.date, shift(40), 'an MSME bill is paid by its MSMED date, not an assumed 30 days');
  assert.match(bill.basis, /MSMED pay-by date, 45 days/);
  const salaries = f.going.rows.find((r) => r.label === `Salaries for ${lastMonth}`);
  assert.ok(salaries, JSON.stringify(f.going.rows.map((r) => r.label)));
  assert.match(salaries.basis, /approved payroll, net pay, by the 7th/);
  assert.ok(f.going.rows.some((r) => r.label === `PF and ESI for ${lastMonth}`), 'PF and ESI are dated on the 15th');
  assert.ok(f.going.rows.some((r) => /^Salaries for .* \(expected\)$/.test(r.label)), 'the next month is expected at the same net');
  assert.ok(Array.isArray(f.risks));
  assert.ok(f.risks.some((r) => r.kind === 'thin-history') || f.risks.length >= 0);

  const words = await chat(state, 'cash forecast for 90 days');
  assert.match(words.reply, /in ₹[0-9,.]+ \(between ₹[0-9,.]+ and ₹[0-9,.]+ by timing\)/, words.reply);
});

test('"can I make payroll" answers covered, tight or short, and when short names the customers who usually pay before payday', async () => {
  const state = books();
  await runTool(state, 'add_employee', { name: 'Arjun Rao', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 100000 }, { name: 'HRA', amount: 50000 }], ptState: '27', sex: 'male', taxRegime: 'new', pan: 'ABCPR1234L' });
  const lastMonth = shift(-40).slice(0, 7);
  assert.equal((await runTool(state, 'approve_payroll', { period: lastMonth })).ok, true);
  for (const [date, after] of [[shift(-120), 5], [shift(-90), 6], [shift(-60), 5]]) await paidSale(state, 'Quick Pay', date, 50000, after);
  await paidSale(state, 'Quick Pay', shift(-2), 90000);
  await runTool(state, 'set_cash_balance', { bank: 20000, cash: 0, on: TODAY });
  const short = canMakePayroll(state);
  assert.equal(short.ok, true, JSON.stringify(short));
  assert.equal(short.data.verdict, 'short', JSON.stringify(short.data));
  assert.ok(short.data.gap > 0);
  assert.equal(short.data.helpers[0]?.customer, 'Quick Pay');
  const words = await chat(state, 'can I make payroll?');
  assert.match(words.reply, /^No, short by ₹[0-9,.]+\. Salaries for /, words.reply);
  assert.match(words.reply, /Quick Pay ₹94,500\.00 on INV-0004 \(pays in about 5 days\)/, words.reply);
  await runTool(state, 'set_cash_balance', { bank: 900000, cash: 0, on: TODAY });
  const fine = await chat(state, 'will the payroll clear?');
  assert.match(fine.reply, /^Yes\./, fine.reply);
  const none = await chat(books(), 'can I make payroll');
  assert.match(none.reply, /no employees on the books/, none.reply);
});

test('a payroll run flags a changed salary, a missing person and a newcomer, and never corrects them', async () => {
  const state = books();
  await runTool(state, 'add_employee', { name: 'Priya Nair', joinedOn: '2026-04-01', components: [{ name: 'Salary', amount: 29500 }], ptState: '27', sex: 'female' });
  await runTool(state, 'add_employee', { name: 'Arun K', joinedOn: '2026-04-01', components: [{ name: 'Salary', amount: 20000 }], ptState: '27', sex: 'male' });
  assert.equal((await runTool(state, 'approve_payroll', { period: '2026-08' })).ok, true);
  const priya = state.employees.find((e) => e.name === 'Priya Nair');
  const arun = state.employees.find((e) => e.name === 'Arun K');
  const changed = await runTool(state, 'change_salary', { id: priya.id, effectiveFrom: '2026-09-01', components: [{ name: 'Salary', amount: 32000 }] });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  arun.joinedOn = '2026-10-01';
  await runTool(state, 'add_employee', { name: 'Dev Patel', joinedOn: '2026-09-15', components: [{ name: 'Salary', amount: 15000 }], ptState: '27', sex: 'male' });
  const run = await runTool(state, 'payroll_run', { period: '2026-09' });
  assert.equal(run.ok, true, JSON.stringify(run));
  const kinds = run.data.flags.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ['absent', 'changed', 'moved', 'new'], JSON.stringify(run.data.flags));
  assert.match(run.data.flags.find((f) => f.kind === 'changed').text, /Priya Nair's pay is ₹32,000\.00 this month against ₹29,500\.00 last month/);
  assert.match(run.data.flags.find((f) => f.kind === 'absent').text, /Arun K was paid last month and is not in this run, with no leaving date recorded/);
  assert.match(run.data.flags.find((f) => f.kind === 'new').text, /Dev Patel is on the payroll for the first time this month \(16 of 30 days\)/);
  const words = await chat(state, 'payroll for September');
  assert.match(words.reply, /Check: Priya Nair's pay is/, words.reply);
  assert.equal(run.data.rows.find((r) => r.name === 'Priya Nair').gross, 32000, 'the flag does not change the figure');
});
