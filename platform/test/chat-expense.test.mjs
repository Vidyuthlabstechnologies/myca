import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';
import { parseExpense, isExpenseIntent } from '../src/expense-intent.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';

test('parseExpense reads amount, words, payee, mode, date, rate and GSTIN; a rate is never assumed', () => {
  const today = '2026-10-06';
  assert.deepEqual(parseExpense('paid 12000 rent', today).args, { narration: 'rent', amount: 12000, gstRate: 0, date: today, mode: 'bank' });
  assert.deepEqual(parseExpense('spent 450 on petrol by cash', today).args, { narration: 'petrol', amount: 450, gstRate: 0, date: today, mode: 'cash' });
  assert.deepEqual(parseExpense('paid 2000 to Mahesh Transport for freight', today).args, { narration: 'freight', amount: 2000, gstRate: 0, date: today, mode: 'bank', payee: 'Mahesh Transport' });
  const rated = parseExpense('paid electricity bill 3,540 with 18% gst', today);
  assert.equal(rated.args.gstRate, 18);
  assert.equal(rated.args.amount, 3540);
  assert.equal(rated.ratedSaid, true);
  assert.equal(parseExpense('Paid Rs 1.2 lakh salary for September', today).args.amount, 120000);
  assert.equal(parseExpense('paid 5000 from bank for rent on 2026-10-01', today).args.date, '2026-10-01');
  const gstin = parseExpense('expense 1180 printer repair GSTIN 27AABCT1332L1ZE gst 18%', today).args;
  assert.equal(gstin.supplierGstin, '27AABCT1332L1ZE');
  assert.equal(gstin.narration, 'printer repair');
  assert.equal(parseExpense('paid 100 and 200', today).error, 'MANY_AMOUNTS');
  assert.equal(parseExpense('paid the rent', today).error, 'NO_AMOUNT');
  assert.equal(isExpenseIntent('received 5000 from Rajesh'), false);
  assert.equal(isExpenseIntent('paid 5000 rent'), true);
});

test('"paid 12000 rent" previews under Rent and posts only on yes', async () => {
  const state = createState();
  const out = await chat(state, 'paid 12000 rent');
  assert.equal(out.posted, false);
  assert.equal(out.awaitingConfirmation, true, JSON.stringify(out));
  assert.match(out.preview.summary, /^Rent: rent ₹12,000\.00 paid from bank on \d{1,2} [A-Z][a-z]+ \d{4}\. No GST separated\./);
  assert.equal(out.preview.figures.head, '5110');
  assert.equal((state.expenses || []).length, 0);
  const posted = await chat(state, 'yes');
  assert.equal(posted.posted, true, JSON.stringify(posted));
  assert.equal(state.expenses.length, 1);
  assert.equal(state.expenses[0].headName, 'Rent');
  assert.equal(state.expenses[0].date, localToday());
  assert.equal(listAccounts(state.ledger).find((a) => a.code === '5110').debitsPosted, 12000);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a question, a negation, a customer name or a muddled amount records nothing', async () => {
  const state = createState();
  createInvoice(state, { date: '2026-08-01', partyName: 'Rajesh Stores', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  for (const text of ['did I pay rent?', "don't record rent 12000", 'paid 100 and 200', 'paid 5000 to Rajesh Stores']) {
    const out = await chat(state, text);
    assert.notEqual(out.posted, true, text);
    assert.notEqual(out.awaitingConfirmation, true, text);
    assert.equal((state.expenses || []).length, 0, text);
  }
  assert.match((await chat(state, 'paid 5000 to Rajesh Stores')).reply, /is a customer/);
  assert.match((await chat(state, 'paid 100 and 200')).reply, /more than one amount/);
  assert.equal(state.ledger.transfers.length, 1 + 2);
});

test('a GST rate said in chat is carried, and without the supplier GSTIN the preview says no credit is taken', async () => {
  const state = createState();
  const out = await chat(state, 'paid electricity bill 3540 with 18% gst');
  assert.equal(out.awaitingConfirmation, true, JSON.stringify(out));
  assert.match(out.preview.summary, /^Electricity and water: electricity bill ₹3,540\.00/);
  assert.match(out.preview.summary, /without the supplier's GSTIN no input credit is taken/);
  await chat(state, 'yes');
  assert.equal(state.expenses[0].taxable, 3540);
  assert.equal(state.expenses[0].inputCredit, false);
});
