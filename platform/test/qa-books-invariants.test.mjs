import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, recordReceipt, createPurchase, recordPayment, billOutstanding } from '../src/invoice.mjs';
import { createCreditNote, cancelInvoice, outstandingOf } from '../src/credit-notes.mjs';
import { createDebitNote, createPurchaseNote } from '../src/debit-notes.mjs';
import { postExpense } from '../src/expenses.mjs';
import { trialBalance, verifyChain, listAccounts } from '../src/ledger.mjs';
import { tallyVouchers } from '../src/tally-export.mjs';
import { balanceSheet } from '../src/statements.mjs';

const RUNS = 40;
const STEPS = 30;
const GSTINS = ['27AAACH7409R1Z1', '29AAACH7409R1Z8', '27AABCT1332L1ZE'];

function generator(seed) {
  let value = seed;
  const next = () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
  const pick = (list) => list[Math.floor(next() * list.length)];
  const money = () => Math.round(next() * 100000) / pick([1, 100, 1000]);
  return { next, pick, money };
}

function step(state, { next, pick, money }) {
  const day = `2026-08-${String(1 + Math.floor(next() * 27)).padStart(2, '0')}`;
  const op = pick(['invoice', 'invoice', 'receipt', 'receipt', 'creditNote', 'cancel', 'debitNote', 'bill', 'tdsBill', 'payment', 'supplierNote', 'expense', 'reverseCharge']);
  const invoices = state.invoices || [];
  const bills = state.purchases || [];
  if (op === 'invoice') {
    const lines = Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({ description: 'x', hsn: '5208', qty: pick([1, 3, 7, 0.5, 2.333]), rate: money(), gstRate: pick([0, 5, 12, 18, 28]) }));
    return createInvoice(state, { date: day, partyName: pick(['A', 'B', 'Sharma']), partyGstin: pick(GSTINS), lines });
  }
  if (op === 'receipt' && invoices.length) {
    const invoice = pick(invoices);
    return recordReceipt(state, { invoiceId: invoice.id, amount: pick([null, money(), Math.round((outstandingOf(state, invoice) / 3) * 1000) / 1000]), date: day < invoice.date ? invoice.date : day, mode: pick(['bank', 'bank', 'cash']) });
  }
  if (op === 'creditNote' && invoices.length) return createCreditNote(state, { invoiceId: pick(invoices).id, amount: pick([null, money() / 10]), reason: 'r', date: '2026-08-28' });
  if (op === 'cancel' && invoices.length) return cancelInvoice(state, { invoiceId: pick(invoices).id, date: '2026-08-28' });
  if (op === 'debitNote' && invoices.length) return createDebitNote(state, { invoiceId: pick(invoices).id, amount: money() / 10, reason: 'r', date: '2026-08-28' });
  if (op === 'bill') return createPurchase(state, { date: day, partyName: pick(['V1', 'V2']), partyGstin: pick(GSTINS), itcEligible: next() > 0.2, lines: [{ description: 'y', hsn: '5208', qty: pick([1, 3]), rate: money(), gstRate: pick([5, 18]) }] });
  if (op === 'tdsBill') return createPurchase(state, { date: day, partyName: 'Job Worker', partyGstin: '27AABCT1332L1ZE', tdsSection: '194C', payeePan: 'AABCT1332L', lines: [{ description: 'job', hsn: '9988', qty: 1, rate: 40000 + money(), gstRate: 5 }] });
  if (op === 'reverseCharge') return createPurchase(state, { date: day, partyName: 'Guard', partyState: '27', partyAddress: 'Pune', reverseCharge: true, itcEligible: next() > 0.3, lines: [{ description: 'g', hsn: '998525', qty: 1, rate: money(), gstRate: 18 }] });
  if (op === 'payment' && bills.length) return recordPayment(state, { billId: pick(bills).id, amount: pick([null, money() / 5]), date: '2026-08-28' });
  if (op === 'supplierNote' && bills.length) {
    const bill = pick(bills);
    return createPurchaseNote(state, { billId: bill.id, amount: pick([money() / 10, bill.total]), reason: 'r', date: '2026-08-28' });
  }
  if (op === 'expense') return postExpense(state, { date: day, amount: money(), gstRate: pick([0, 18]), supplierGstin: pick(['', '27AABCT1332L1ZE']), head: '5100', description: 'e' });
  return null;
}

function problemsIn(state, run) {
  const problems = [];
  if (!trialBalance(state.ledger).balanced) problems.push(`run ${run}: trial balance does not balance`);
  const chain = verifyChain(state.ledger);
  if (!chain.ok) problems.push(`run ${run}: chain ${chain.error}`);
  const balances = new Map(listAccounts(state.ledger).map((account) => [account.id, account.posted]));
  const balance = (id) => balances.get(String(id)) || 0;
  for (const party of state.parties || []) {
    const owed = (state.invoices || []).filter((inv) => inv.partyAccountId === party.accountId).reduce((sum, inv) => sum + outstandingOf(state, inv), 0);
    if (Math.abs(owed - balance(party.accountId)) > 0.001) problems.push(`run ${run}: customer ${party.name} owes ${owed} by invoices, ${balance(party.accountId)} by ledger`);
  }
  for (const vendor of state.vendors || []) {
    const owing = (state.purchases || []).filter((bill) => bill.partyAccountId === vendor.accountId).reduce((sum, bill) => sum + billOutstanding(bill), 0);
    if (Math.abs(owing + balance(vendor.accountId)) > 0.001) problems.push(`run ${run}: supplier ${vendor.name} owed ${owing} by bills, ${-balance(vendor.accountId)} by ledger`);
  }
  const held = (state.tdsEntries || []).reduce((sum, entry) => sum + Number(entry.tds || 0), 0);
  if (Math.abs(held + balance(2200)) > 0.001) problems.push(`run ${run}: TDS entries ${held}, TDS payable ${-balance(2200)}`);
  for (const voucher of tallyVouchers(state, '2026-08').vouchers) {
    const net = [...voucher.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].reduce((sum, m) => sum + Math.round(Number(m[1]) * 100), 0);
    if (net !== 0) problems.push(`run ${run}: Tally voucher ${voucher.match(/VOUCHERNUMBER>([^<]+)/)[1]} is out by ${net} paise`);
  }
  if (!balanceSheet(state, { asOf: '2026-08-31' }).data.balanced) problems.push(`run ${run}: balance sheet does not balance`);
  return problems;
}

test('random sequences of sales, receipts, notes, cancellations, bills, TDS, payments and expenses keep the books, sub-ledgers and Tally vouchers in agreement', () => {
  const random = generator(20261114);
  const problems = [];
  const outcomes = new Map();
  for (let run = 0; run < RUNS; run += 1) {
    const state = createState();
    state.company = { ...state.company, address: '', tdsDeductor: true, tan: 'MUMA12345B' };
    for (let n = 0; n < STEPS; n += 1) {
      const result = step(state, random);
      if (result) outcomes.set(result.ok ? 'ok' : result.error, (outcomes.get(result.ok ? 'ok' : result.error) || 0) + 1);
    }
    problems.push(...problemsIn(state, run));
  }
  assert.deepEqual(problems.slice(0, 10), []);
  assert.ok(outcomes.get('ok') > RUNS * STEPS * 0.4, JSON.stringify([...outcomes]));
});
