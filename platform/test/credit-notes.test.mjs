import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { lockPeriod } from '../src/period-lock.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

function books() {
  const state = createState();
  const sale = (id, date, partyName, partyGstin, rate, gstRate) => {
    const out = createInvoice(state, { id, date, partyName, partyGstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate, gstRate }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  };
  sale('INV-0001', '2026-08-05', 'Retail Mart', '27AAACH7409R1Z1', 1000, 5);
  sale('INV-0002', '2026-08-20', 'Gujarat Mills', '24AAACF7856R1ZY', 5000, 18);
  sale('INV-0003', '2026-08-25', 'Walk-in', '', 200, 5);
  return state;
}

test('a partial credit note reverses sales and output tax pro rata, credits the customer, and never edits the invoice', async () => {
  const state = books();
  const before = JSON.stringify(state.invoices[0].lines);
  const out = await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 2100, date: '2026-09-02', reason: 'Two rolls returned' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const note = out.creditNote;
  assert.equal(note.id, 'CN-0001');
  assert.deepEqual([note.taxable, note.cgst, note.sgst, note.igst, note.total], [2000, 50, 50, 0, 2100]);
  assert.equal(note.lines[0].qty, 2);
  assert.equal(note.placeOfSupply, '27');
  assert.equal(JSON.stringify(state.invoices[0].lines), before);
  assert.equal(state.invoices[0].status, 'posted');
  assert.deepEqual(state.invoices[0].creditNoteIds, ['CN-0001']);
  assert.equal(acc(state, '4000').debitsPosted, 2000);
  assert.equal(acc(state, '2100').debitsPosted, 50);
  assert.equal(acc(state, '2101').debitsPosted, 50);
  assert.equal(acc(state, String(state.invoices[0].partyAccountId)).creditsPosted, 2100);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(out.refundDue, 0);
});

test('cancelling an invoice is a full credit note; the invoice is marked cancelled and cannot take money or a second note', async () => {
  const state = books();
  const out = await runTool(state, 'cancel_invoice', { invoiceId: 'INV-0002', date: '2026-08-21' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.creditNote.total, 59000);
  assert.equal(out.creditNote.igst, 9000);
  assert.equal(out.creditNote.cancels, true);
  assert.equal(out.creditNote.reason, 'Invoice cancelled');
  assert.equal(state.invoices[1].status, 'cancelled');
  assert.equal(acc(state, '2102').debitsPosted, 9000);
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0002', amount: 100, date: '2026-08-22' }).error, 'INVOICE_CANCELLED');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0002', amount: 1, date: '2026-08-22', reason: 'x' })).error, 'INVOICE_CANCELLED');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a credit note on a paid invoice says what is due back; receipts respect what has been credited', async () => {
  const state = books();
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 10500, date: '2026-08-10', mode: 'bank' });
  const preview = previewOf(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1050, date: '2026-09-01', reason: 'Price reduced' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Retail Mart has paid ₹10,500\.00, so ₹1,050\.00 becomes due back to them/);
  const out = await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1050, date: '2026-09-01', reason: 'Price reduced' });
  assert.equal(out.refundDue, 1050);
  const fresh = books();
  await runTool(fresh, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1050, date: '2026-09-01', reason: 'Price reduced' });
  assert.equal(recordReceipt(fresh, { invoiceId: 'INV-0001', amount: 10500, date: '2026-09-02' }).error, 'OVERPAYMENT');
  const settled = recordReceipt(fresh, { invoiceId: 'INV-0001', amount: 9450, date: '2026-09-02' });
  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(fresh.invoices[0].status, 'paid');
  const doc = (await runTool(fresh, 'invoice_document', { id: 'INV-0001' })).data;
  assert.equal(doc.credited, 1050);
  assert.equal(doc.balance, 0);
  assert.equal(doc.creditNotes[0].reason, 'Price reduced');
});

test('refusals: unknown invoice, more than is left, a date before the invoice, no reason, a locked month, and cancelling a partly credited invoice', async () => {
  const state = books();
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0009', reason: 'x', date: '2026-09-01' })).error, 'INVOICE_NOT_FOUND');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 10501, reason: 'x', date: '2026-09-01' })).error, 'EXCEEDS_INVOICE');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 100, reason: 'x', date: '2026-08-01' })).error, 'BEFORE_INVOICE');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 100, date: '2026-09-01' })).error, 'REASON_REQUIRED');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 100, reason: 'x', date: '2026-13-01' })).error, 'INVALID_DATE');
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 100, reason: 'x', date: '2026-09-01' });
  assert.equal((await runTool(state, 'cancel_invoice', { invoiceId: 'INV-0001', date: '2026-09-02' })).error, 'PARTLY_CREDITED');
  assert.match(previewOf(state, 'cancel_invoice', { invoiceId: 'INV-0001', date: '2026-09-02' }).blockers[0], /already has a credit note/);
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', reason: 'rest', date: '2026-09-03' });
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1, reason: 'x', date: '2026-09-04' })).error, 'FULLY_CREDITED');
  lockPeriod(state, '2026-09-30');
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: 'INV-0003', reason: 'x', date: '2026-09-05' })).error, 'PERIOD_LOCKED');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('credit notes land in the GSTR-1 of their own month: CDNR for registered buyers, netted in B2CS for small unregistered sales', async () => {
  const state = books();
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 2100, date: '2026-09-02', reason: 'Returned' });
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0003', amount: 210, date: '2026-08-28', reason: 'Returned' });
  const august = (await runTool(state, 'export_gstr1_json', { fp: '082026' })).data;
  assert.equal(august.cdnr, undefined);
  const b2cs = august.b2cs.find((row) => row.pos === '27' && row.rt === 5);
  assert.equal(b2cs.txval, 1800);
  assert.equal(b2cs.camt, 45);
  const september = (await runTool(state, 'export_gstr1_json', { fp: '092026' })).data;
  assert.equal(september.cdnr.length, 1);
  assert.equal(september.cdnr[0].ctin, '27AAACH7409R1Z1');
  assert.deepEqual(september.cdnr[0].nt[0], { ntty: 'C', nt_num: 'CN-0001', nt_dt: '02-09-2026', pos: '27', rchrg: 'N', inv_typ: 'R', val: 2100, itms: [{ num: 1, itm_det: { rt: 5, txval: 2000, camt: 50, samt: 50, iamt: 0, csamt: 0 } }] });
  assert.deepEqual(september.b2b, []);
  const summary = (await runTool(state, 'gst_period_summary', { period: '2026-09' })).data;
  assert.equal(summary.salesCount, 0);
  assert.equal(summary.creditNoteCount, 1);
  assert.equal(summary.creditNotes.total, 2100);
  assert.equal(summary.gstr1.cdnr, 1);
  assert.deepEqual(summary.periods, ['2026-08', '2026-09']);
});

test('the GSTR-3B outward totals are net of the month credit notes and show them', async () => {
  const state = books();
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0002', amount: 11800, date: '2026-08-30', reason: 'Returned' });
  const draft = (await runTool(state, 'prepare_gstr3b', { period: '2026-08' })).data;
  assert.equal(draft.outward.grossTotals.interTaxable, 50000);
  assert.equal(draft.outward.totals.interTaxable, 40000);
  assert.equal(draft.outward.totals.interIgst, 7200);
  assert.equal(draft.outward.totals.intraTaxable, 12000);
  assert.equal(draft.outward.creditNotes.count, 1);
  const summary = (await runTool(state, 'gst_period_summary', { period: '2026-08' })).data;
  assert.equal(summary.outputTax.igst, 7200);
});

test('credit notes persist, list by month, and the contracts are strict', async () => {
  const state = books();
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 105, date: '2026-09-02', reason: 'x' });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.creditNotes.length, 1);
  assert.equal(back.creditNoteSeq, 1);
  assert.equal(back.invoices[0].creditNoteIds[0], 'CN-0001');
  assert.equal((await runTool(back, 'list_credit_notes', { period: '2026-09' })).data.length, 1);
  assert.equal((await runTool(back, 'list_credit_notes', { period: '2026-08' })).data.length, 0);
  assert.equal(isRemoteQuery('list_credit_notes'), true);
  assert.equal(validateAssistantToolCall('create_credit_note', { invoiceId: 'INV-0001', amount: 10, reason: 'x', date: '2026-09-02' }).ok, true);
  assert.equal(validateAssistantToolCall('create_credit_note', { invoiceId: 'INV-0001' }).ok, false);
  assert.equal(validateAssistantToolCall('cancel_invoice', { invoiceId: 'INV-0001' }).ok, true);
  assert.equal(validateAssistantToolCall('cancel_invoice', { invoiceId: 'BILL-0001' }).ok, false);
});

test('chat: "cancel INV-0002" and "credit note for INV-0001 2100 - goods returned" preview and post on yes', async () => {
  const { chat } = await import('../src/router.mjs');
  const state = books();
  const cancel = await chat(state, 'cancel INV-0002');
  assert.equal(cancel.awaitingConfirmation, true, JSON.stringify(cancel));
  assert.match(cancel.preview.summary, /^Cancel INV-0002 \(Gujarat Mills\) by a credit note for its full ₹59,000\.00/);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.equal(state.invoices[1].status, 'cancelled');
  const note = await chat(state, 'credit note for INV-0001 2100 - goods returned');
  assert.equal(note.awaitingConfirmation, true, JSON.stringify(note));
  assert.match(note.preview.summary, /Credit note of ₹2,100\.00 against INV-0001.*Reason: goods returned/);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.equal(state.creditNotes.length, 2);
  const asked = await chat(state, 'credit note for INV-0001 500');
  assert.notEqual(asked.awaitingConfirmation, true);
  assert.match(asked.reply, /Say why/);
  assert.notEqual((await chat(state, 'did I cancel INV-0003?')).awaitingConfirmation, true);
  assert.equal(state.creditNotes.length, 2);
});
