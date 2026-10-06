import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { booksCheck } from '../src/books-check.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, address: '' };
  createInvoice(state, { id: 'INV-0001', date: '2026-09-03', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 5 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-04', partyName: 'Bad GSTIN Co', partyGstin: '27ZZZZZ0000Z9ZZ', lines: [{ description: 'Cloth', qty: 1, rate: 2000, gstRate: 5 }] });
  createPurchase(state, { date: '2026-09-05', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 4000, gstRate: 5 }] });
  return state;
}

const byId = (data) => Object.fromEntries(data.findings.map((item) => [item.id, item]));

test('the check reports what came across and every gap, needs-you first', () => {
  const state = books();
  const deadlines = [
    { clientId: 'SELF', returnType: 'GSTR-1', returnLabel: 'GSTR-1 (monthly)', period: '2026-08', dueDate: '2026-09-11', daysUntil: -25 },
    { clientId: 'SELF', returnType: 'GSTR-3B', returnLabel: 'GSTR-3B (monthly)', period: '2026-09', dueDate: '2026-10-20', daysUntil: 14 },
  ];
  const out = booksCheck(state, { deadlines, exceptions: [], asOfDate: '2026-10-06' });
  assert.equal(out.ok, true);
  const data = out.data;
  const f = byId(data);
  assert.equal(f.books.severity, 'ok');
  assert.equal(f.books.title, '2 sales, 1 purchase bill and 0 expenses');
  assert.match(f.books.detail, /From 2026-09-03 to 2026-09-05, with 2 customers and 1 supplier/);
  assert.equal(f.ledger.severity, 'ok');
  assert.equal(f.held.severity, 'act');
  assert.match(f.held.title, /^1 sale cannot go in the GST return as it stands$/);
  assert.equal(f.held.amount, 100);
  assert.equal(f.credit.severity, 'check');
  assert.equal(f.credit.amount, 200);
  assert.match(f.credit.detail, /Add the GSTR-2B/);
  assert.equal(f.due.severity, 'check');
  assert.match(f.due.detail, /GSTR-1 2026-08\. MyCA cannot see whether these were filed/);
  assert.match(f.due.detail, /Next: GSTR-3B \(monthly\) for 2026-09, due 2026-10-20\./);
  assert.equal(f.owed.severity, 'check');
  assert.equal(f.owed.amount, 12600);
  assert.match(f.setup.detail, /^Add your business address, HSN or SAC codes on 1 invoice and the supplier's bill number on 1 bill\.$/);
  assert.equal(data.findings[0].severity, 'act');
  assert.equal(data.headline, '1 thing needs you now');
  assert.deepEqual(data.counts, { act: 1, check: 4, ok: 2 });
});

test('with 2B added, credit at risk becomes a needs-you finding with the supplier count', async () => {
  const state = books();
  await runTool(state, 'import_gstr2b', { period: '2026-09', csv: 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY\nB2B,27AAACH7409R1Z1,SOMEONE,X-1,01-09-2026,100,2.5,2.5,0,0,105,Y' });
  const f = byId(booksCheck(state, { deadlines: [], exceptions: [], asOfDate: '2026-10-06' }).data);
  assert.equal(f.credit.severity, 'act');
  assert.equal(f.credit.title, '₹200.00 of input credit is at risk');
  assert.match(f.credit.detail, /^1 supplier has not reported/);
});

test('empty books are told what to do; healthy books say so; a broken ledger needs you', () => {
  const empty = byId(booksCheck(createState(), { deadlines: [], exceptions: [], asOfDate: '2026-10-06' }).data);
  assert.equal(empty.books.severity, 'check');
  assert.equal(empty.books.action, 'migrate');
  const clean = createState();
  createInvoice(clean, { id: 'INV-0001', date: '2026-09-03', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  const healthy = booksCheck(clean, { deadlines: [], exceptions: [], asOfDate: '2026-10-06' }).data;
  assert.equal(byId(healthy).held.severity, 'ok');
  assert.equal(byId(healthy).setup.severity, 'ok');
  clean.ledger.transfers[0].amount = 1n;
  assert.equal(byId(booksCheck(clean, { deadlines: [], exceptions: [], asOfDate: '2026-10-06' }).data).ledger.severity, 'act');
});

test('other open exceptions are counted without repeating return or due-date items', () => {
  const state = books();
  const exceptions = [
    { status: 'open', source: 'gstr1', title: 'held' },
    { status: 'open', source: 'deadlines', title: 'due' },
    { status: 'open', source: 'import', title: 'A Tally row was held back', moneyAtRisk: 500 },
    { status: 'waived', source: 'import', title: 'old' },
  ];
  const f = byId(booksCheck(state, { deadlines: [], exceptions, asOfDate: '2026-10-06' }).data);
  assert.equal(f.exceptions.title, '1 other item needs you');
  assert.equal(f.exceptions.amount, 500);
});

test('the tool runs against the books, is a remote read, and "check my books" answers in chat without posting', async () => {
  const state = books();
  const out = await runTool(state, 'books_check', {});
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(out.data.findings.length >= 7);
  assert.equal(isRemoteQuery('books_check'), true);
  const before = state.ledger.transfers.length;
  const reply = await chat(state, 'check my books');
  assert.notEqual(reply.awaitingConfirmation, true);
  assert.match(reply.reply, /needs you now\.\n· Needs you: 1 sale cannot go in the GST return/);
  assert.equal(state.ledger.transfers.length, before);
});
