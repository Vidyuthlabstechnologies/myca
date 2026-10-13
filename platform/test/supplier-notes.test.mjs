import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

async function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const bill = await runTool(state, 'create_purchase', { partyName: 'Fabric Co', partyGstin: '27AAACF7856R1ZY', lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date: '2026-10-02', supplierInvoiceNo: 'FC/101' });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  return { state, bill: bill.invoice };
}

test('a supplier\'s debit note adds purchase and input credit at the bill\'s rates as its own document, and the bill is untouched', async () => {
  const { state, bill } = await books();
  assert.equal(bill.total, 10500);
  const out = await runTool(state, 'record_supplier_debit_note', { billId: bill.id, amount: 1050, date: '2026-10-10', reason: 'Freight not billed', supplierNoteNo: 'FC/DN-7' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const note = out.supplierNote;
  assert.equal(note.kind, 'supplier-debit-note');
  assert.equal(note.noteOf, bill.id);
  assert.equal(note.supplierInvoiceNo, 'FC/DN-7');
  assert.equal(note.taxable, 1000);
  assert.equal(note.cgst, 25);
  assert.equal(note.sgst, 25);
  assert.equal(note.total, 1050);
  assert.equal(note.reason, 'Freight not billed');
  assert.equal(state.purchases.find((b) => b.id === bill.id).total, 10500, 'the bill is not edited');
  assert.deepEqual(state.purchases.find((b) => b.id === bill.id).supplierNoteIds, [note.id]);
  assert.equal(acc(state, '5000').debitsPosted, 11000);
  assert.equal(acc(state, '1200').debitsPosted, 275);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const owed = await runTool(state, 'business_summary', { period: '2026-10' });
  assert.equal(owed.ok, true);
  const summary = await runTool(state, 'gst_period_summary', { period: '2026-10' });
  assert.equal(summary.data.inputCredit.cgst, 275, 'the note\'s credit counts in the month like a bill');
  assert.equal((await runTool(state, 'record_supplier_debit_note', { billId: note.id, amount: 100, reason: 'x', date: '2026-10-11' })).error, 'NOTE_ON_NOTE');
  assert.equal((await runTool(state, 'record_supplier_debit_note', { billId: bill.id, amount: 100, reason: 'x', date: '2026-09-30' })).error, 'BEFORE_INVOICE');
  assert.equal((await runTool(state, 'record_supplier_debit_note', { billId: bill.id, amount: 100, date: '2026-10-11' })).error, 'REASON_REQUIRED');
  assert.equal((await runTool(state, 'record_supplier_debit_note', { billId: bill.id, amount: 100, reason: 'again', date: '2026-10-12', supplierNoteNo: 'FC/DN-7' })).error, 'DUPLICATE_SUPPLIER_BILL');
});

test('chat tells a supplier\'s own debit note from ours, previews it and posts on yes', async () => {
  const { state, bill } = await books();
  const held = await chat(state, `supplier's debit note on ${bill.id} 1050 - extra freight, note no. FC/DN-8`);
  assert.equal(held.preview?.tool, 'record_supplier_debit_note', held.reply);
  assert.match(held.preview.summary, /Fabric Co's debit note FC\/DN-8 of ₹1,050\.00 on BILL-0001/);
  assert.match(held.preview.summary, /Reason: extra freight\./);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Recorded Fabric Co's debit note FC\/DN-8 as BILL-0002 against BILL-0001: ₹1,050\.00 more owed/);
  const ours = await chat(state, `debit note for ${bill.id} 500 - goods returned`);
  assert.equal(ours.preview?.tool, 'create_purchase_note', ours.reply);
});
