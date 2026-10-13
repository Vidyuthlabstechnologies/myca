import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase, recordReceipt, recordPayment, billOutstanding } from '../src/invoice.mjs';
import { outstandingOf } from '../src/credit-notes.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = (id, date, partyName, partyGstin, rate, gstRate) => {
    const out = createInvoice(state, { id, date, partyName, partyGstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate, gstRate }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  };
  sale('INV-0001', '2026-08-05', 'Retail Mart', '27AAACH7409R1Z1', 1000, 5);
  sale('INV-0002', '2026-08-20', 'Gujarat Mills', '24AAACF7856R1ZY', 5000, 18);
  sale('INV-0003', '2026-08-25', 'Walk-in', '', 200, 5);
  const bill = createPurchase(state, { date: '2026-08-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 10, rate: 400, gstRate: 5 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  return state;
}

test('a sales debit note adds to sales and output tax pro rata, the customer owes more, and the invoice is untouched', async () => {
  const state = books();
  const before = JSON.stringify(state.invoices[0].lines);
  const out = await runTool(state, 'create_debit_note', { invoiceId: 'INV-0001', amount: 1050, date: '2026-09-02', reason: 'Price revised' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const note = out.debitNote;
  assert.equal(note.id, 'DN-0001');
  assert.deepEqual([note.taxable, note.cgst, note.sgst, note.igst, note.total], [1000, 25, 25, 0, 1050]);
  assert.equal(JSON.stringify(state.invoices[0].lines), before);
  assert.equal(acc(state, '4000').creditsPosted, 10000 + 50000 + 2000 + 1000);
  assert.equal(acc(state, '2100').creditsPosted, 250 + 50 + 25);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(outstandingOf(state, state.invoices[0]), 11550);
  const receipt = recordReceipt(state, { invoiceId: 'INV-0001', amount: 11550, date: '2026-09-03' });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(state.invoices[0].status, 'paid');
  const more = await runTool(state, 'create_debit_note', { invoiceId: 'INV-0001', amount: 100, date: '2026-09-04', reason: 'Freight' });
  assert.equal(more.ok, true);
  assert.equal(state.invoices[0].status, 'posted', 'a paid invoice with a new debit note is open again');
  assert.equal(outstandingOf(state, state.invoices[0]), 100);
  const doc = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(doc.data.debited, 1150);
  assert.equal(doc.data.debitNotes.length, 2);
  assert.equal((await runTool(state, 'create_debit_note', { invoiceId: 'INV-0001', date: '2026-09-02', reason: 'x' })).error, 'BAD_AMOUNT');
  assert.equal((await runTool(state, 'create_debit_note', { invoiceId: 'INV-0001', amount: 10, date: '2026-08-01', reason: 'x' })).error, 'BEFORE_INVOICE');
  assert.equal((await runTool(state, 'create_debit_note', { invoiceId: 'INV-0009', amount: 10, reason: 'x' })).error, 'INVOICE_NOT_FOUND');
  assert.equal(validateAssistantToolCall('create_debit_note', { invoiceId: 'INV-0001', amount: 10, reason: 'x' }).ok, true);
  assert.equal(validateAssistantToolCall('create_debit_note', { invoiceId: 'INV-0001', reason: 'x' }).ok, false);
});

test('a debit note to a supplier reverses the purchase and its input credit pro rata and reduces what is owed', async () => {
  const state = books();
  const bill = state.purchases[0];
  assert.equal(billOutstanding(bill), 4200);
  const out = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 1050, date: '2026-09-02', reason: 'Two rolls returned' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const note = out.purchaseNote;
  assert.equal(note.id, 'PDN-0001');
  assert.deepEqual([note.taxable, note.cgst, note.sgst, note.igst, note.total], [1000, 25, 25, 0, 1050]);
  assert.equal(note.lines[0].qty, 2.5);
  assert.equal(acc(state, '5000').creditsPosted, 1000);
  assert.equal(acc(state, '1200').creditsPosted, 25);
  assert.equal(acc(state, '1201').creditsPosted, 25);
  assert.equal(acc(state, String(bill.partyAccountId)).debitsPosted, 1050);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(billOutstanding(bill), 3150);
  assert.equal(bill.notedTotal, 1050);
  assert.deepEqual(bill.purchaseNoteIds, ['PDN-0001']);
  assert.equal(out.refundDue, 0);
  const paid = recordPayment(state, { billId: bill.id, amount: 3150, date: '2026-09-03' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(billOutstanding(bill), 0);
  const tooMuch = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 4000, date: '2026-09-04', reason: 'x' });
  assert.equal(tooMuch.error, 'EXCEEDS_BILL');
  assert.equal(tooMuch.room, 3150);
  const rest = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 3150, date: '2026-09-04', reason: 'Rest returned' });
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.equal(rest.refundDue, 3150, 'what was paid on the returned part is due back');
  assert.equal((await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 1, reason: 'x' })).error, 'FULLY_NOTED');
  assert.equal((await runTool(state, 'create_purchase_note', { billId: 'BILL-0099', amount: 1, reason: 'x' })).error, 'BILL_NOT_FOUND');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.purchaseNotes.length, 2);
  assert.equal(copy.purchaseNoteSeq, 2);
});

test('a debit note on a blocked-credit bill reverses cost, not input credit', async () => {
  const state = books();
  const blocked = createPurchase(state, { date: '2026-08-10', partyName: 'Car Hire', partyGstin: '27AABCT1332L1ZE', itcEligible: false, lines: [{ description: 'Cab', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(blocked.ok, true);
  const inputBefore = acc(state, '1200').creditsPosted;
  const out = await runTool(state, 'create_purchase_note', { billId: blocked.invoice.id, amount: 525, date: '2026-08-12', reason: 'Half the trip cancelled' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(acc(state, '1200').creditsPosted, inputBefore, 'no input credit was reversed');
  assert.equal(acc(state, '5000').creditsPosted, 525);
  assert.equal(out.purchaseNote.itcEligible, false);
});

test('the month\'s return carries debit notes: sales up, input credit down, GSTR-1 D rows, and the review and pack follow', async () => {
  const state = books();
  await runTool(state, 'create_debit_note', { invoiceId: 'INV-0002', amount: 11800, date: '2026-08-28', reason: 'Price revised' });
  await runTool(state, 'create_debit_note', { invoiceId: 'INV-0003', amount: 105, date: '2026-08-28', reason: 'Extra piece' });
  await runTool(state, 'create_purchase_note', { billId: state.purchases[0].id, amount: 1050, date: '2026-08-29', reason: 'Returned' });
  const summary = (await runTool(state, 'gst_period_summary', { period: '2026-08' })).data;
  assert.equal(summary.debitNoteCount, 2);
  assert.equal(summary.outputTax.igst, 9000 + 1800);
  assert.equal(summary.outputTax.cgst, 250 + 50 + 2.5);
  assert.equal(summary.inputCredit.cgst, 100 - 25);
  assert.equal(summary.purchaseNoteCount, 1);
  const file = await runTool(state, 'export_gstr1_json', { fp: '082026' });
  const cdnr = file.data.cdnr.find((row) => row.ctin === '24AAACF7856R1ZY');
  assert.equal(cdnr.nt[0].ntty, 'D');
  assert.equal(cdnr.nt[0].val, 11800);
  const b2cs = file.data.b2cs.find((row) => row.rt === 5 && row.pos === '27');
  assert.equal(b2cs.txval, 2000 + 100, 'the walk-in debit note adds to the B2CS row');
  const review = (await runTool(state, 'gst_review', { period: '2026-08' })).data;
  assert.ok(review.steps[0].lines.some((line) => line.label === '2 debit notes, including tax' && line.amount === 11905), JSON.stringify(review.steps[0].lines));
  assert.ok(review.steps[1].lines.some((line) => /debit note to a supplier/.test(line.label) && line.amount === -50), JSON.stringify(review.steps[1].lines));
  const pay = (await runTool(state, 'gst_payable', { period: '2026-08' })).data;
  assert.equal(pay.output.total, summary.outputTax.total);
  assert.equal(pay.credit.cgst, 75);
  const entries = await runTool(state, 'export_entries', { period: '2026-08' });
  assert.match(entries.data.csv, /Debit note,DN-0001,Gujarat Mills/);
  assert.match(entries.data.csv, /Debit note to supplier,PDN-0001,Fabric Co/);
  const glance = (await runTool(state, 'business_summary', { period: '2026-08' })).data;
  assert.equal(glance.current.sales.net, 10500 + 59000 + 2100 + 11800 + 105);
});

test('chat: a debit note is previewed and posted on yes, for a customer and for a supplier', async () => {
  const state = books();
  const held = await chat(state, 'debit note for INV-0001 1050 - price revised');
  assert.equal(held.preview?.tool, 'create_debit_note', held.reply);
  assert.match(held.preview.summary, /^Debit note of ₹1,050\.00 against INV-0001 \(Retail Mart\)/);
  assert.equal((state.debitNotes || []).length, 0);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Debit note DN-0001 for ₹1,050\.00 against INV-0001 \(Retail Mart, .*\)\. Retail Mart now owes ₹11,550\.00\./);
  const noAmount = await chat(state, 'debit note for INV-0001 price revised');
  assert.match(noAmount.reply, /Say the amount/);
  const supplier = await chat(state, 'debit note for BILL-0001 1050 - two rolls returned');
  assert.equal(supplier.preview?.tool, 'create_purchase_note', supplier.reply);
  assert.match(supplier.preview.summary, /^Debit note to Fabric Co of ₹1,050\.00 against BILL-0001/);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /^Debit note PDN-0001 to Fabric Co for ₹1,050\.00 against BILL-0001 \(.*\)\. You owe ₹3,150\.00 on it now\./);
  const blocked = previewOf(state, 'create_purchase_note', { billId: 'BILL-0001', amount: 5000, reason: 'x' });
  assert.match(blocked.blockers[0], /Only ₹3,150\.00 of BILL-0001 is left to reduce/);
});
