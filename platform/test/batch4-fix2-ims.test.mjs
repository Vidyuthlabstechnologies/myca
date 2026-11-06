import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending, chat, fmtToolResult } from '../src/router.mjs';
import { imsKey, imsReview, planImsDecision, pinImsRows } from '../src/ims.mjs';
import { msmeCovered } from '../src/supplier-dues.mjs';
import { detectExceptions } from '../src/exceptions.mjs';

const PERIOD = '2026-09';
const AS_OF = '2026-11-06';
const GSTIN = '27AABCT1332L1ZE';
const SUPPLIER_GSTIN = '27AABCT1332L1ZE';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const KEY = (number, section = 'B2B', gstin = GSTIN) => `${PERIOD}|${gstin}|${number}|${section}`;

const MULTI_RATE_2B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,4000,360,360,0,0,4720,Y',
].join('\n');

const TWINS_2B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,27AABCT1332L1ZE,FABRIC CO,F/101,06-09-2026,3000,90,90,0,0,3180,Y',
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-102,07-09-2026,3000,90,90,0,0,3180,N',
  'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
].join('\n');

const MIXED_2B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
].join('\n');

function purchase(state, partyName, partyGstin, supplierInvoiceNo, date, lines) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: lines.map(([rate, gstRate]) => ({ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate })) });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

async function withStatement(csv, period = PERIOD) {
  const state = createState();
  const added = await runTool(state, 'import_gstr2b', { period, csv, fileName: 'GSTR2B.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

const review = (state, period = PERIOD) => imsReview(state, { period }).data;

test('R2-1: the lines of a multi-rate invoice come back as one row with one key, compared with its bill as one document', async () => {
  const state = await withStatement(MULTI_RATE_2B);
  const bill = purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5], [4000, 18]]);
  assert.deepEqual([bill.taxable, bill.cgst, bill.sgst, bill.total], [14000, 610, 610, 15220]);
  const data = review(state);
  assert.equal(data.rows.length, 1, JSON.stringify(data.rows.map((row) => [row.key, row.match])));
  const [row] = data.rows;
  assert.deepEqual(
    { ...row, why: undefined },
    {
      key: KEY('F101'), section: 'B2B', supplierGstin: GSTIN, supplierName: 'FABRIC CO', invoiceNo: 'F-101', invoiceDate: '2026-09-05',
      taxableValue: 14000, cgst: 610, sgst: 610, igst: 0, cess: 0, totalValue: 15220, credit: 1220, itcAvailability: 'Y', billId: bill.id,
      match: 'matched', why: undefined, suggested: 'accept', decision: '', note: '', decidedBy: '', decidedOn: '', lines: 2,
    },
  );
  assert.equal(row.why, `Matches ${bill.id} in your books.`);
  assert.deepEqual(data.counts, { total: 1, accept: 0, reject: 0, pending: 0, undecided: 1 });
  assert.deepEqual(data.credit, { accepted: 0, rejected: 0, pending: 0, undecided: 1220 });
  assert.equal(data.statement.rows, 2, 'the statement still counts the lines of the file');
});

test('R2-1: a row that stands for one line says so, and a row gains only the field lines', async () => {
  const state = await withStatement(MIXED_2B);
  const data = review(state);
  assert.deepEqual(data.rows.map((row) => row.lines), [1, 1, 1, 1]);
  assert.equal(typeof data.rows[0].lines, 'number');
  assert.deepEqual(
    Object.keys(data.rows[0]),
    ['key', 'section', 'supplierGstin', 'supplierName', 'invoiceNo', 'invoiceDate', 'taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'totalValue', 'credit', 'itcAvailability', 'billId', 'match', 'why', 'suggested', 'decision', 'note', 'decidedBy', 'decidedOn', 'lines'],
  );
  assert.deepEqual(Object.keys(data), ['period', 'statement', 'rows', 'counts', 'credit', 'orphaned', 'note']);
});

test('R2-1: deciding the invoice plans, previews and records the credit of the whole invoice, and the review agrees with the preview', async () => {
  const state = await withStatement(MULTI_RATE_2B);
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5], [4000, 18]]);
  const [row] = review(state).rows;
  const plan = planImsDecision(state, { period: PERIOD, keys: [row.key], decision: 'accept' });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.deepEqual(plan.rows, [{ key: KEY('F101'), supplierName: 'FABRIC CO', invoiceNo: 'F-101', credit: 1220 }]);
  assert.equal(plan.credit, 1220);
  const preview = previewOf(state, 'ims_decide', { period: PERIOD, keys: [row.key], decision: 'accept' });
  assert.deepEqual(preview.figures, { count: 1, credit: 1220 });
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(held.preview.summary, 'Mark FABRIC CO F-101 as accepted in IMS for September 2026.');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Marked 1 row accepted in IMS for September 2026.');
  const after = review(state);
  assert.deepEqual(after.counts, { total: 1, accept: 1, reject: 0, pending: 0, undecided: 0 });
  assert.deepEqual(after.credit, { accepted: 1220, rejected: 0, pending: 0, undecided: 0 });
  assert.equal(after.credit.accepted, plan.credit, 'the credit accepted is the credit the preview named');
  assert.deepEqual(Object.keys(state.imsDecisions), [KEY('F101')]);
});

test('R1-8: every key the review returns is unique, and the rows an accept all decides are the rows the review then shows decided', async () => {
  const state = await withStatement(TWINS_2B);
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  const before = review(state);
  const keys = before.rows.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length, keys.join('\n'));
  assert.deepEqual(keys, [KEY('F101'), KEY('F102'), KEY('CN7', 'CDNR')]);
  assert.deepEqual(before.rows.map((row) => row.lines), [2, 1, 1]);
  assert.deepEqual(before.counts, { total: 3, accept: 0, reject: 0, pending: 0, undecided: 3 });
  const done = await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(done.count, 3);
  assert.equal(done.credit, 810);
  const after = review(state);
  assert.deepEqual(after.counts, { total: 3, accept: 3, reject: 0, pending: 0, undecided: 0 });
  assert.equal(after.counts.accept, done.count, 'the decisions counted are the rows shown');
  assert.deepEqual(after.credit, { accepted: 810, rejected: 0, pending: 0, undecided: 0 });
  assert.deepEqual(after.rows.map((row) => row.decision), ['accept', 'accept', 'accept']);
});

test('R1-8: punctuation-only twins F-101 and F/101 of one supplier are accepted as one document, a known limit of the key, and they add up before the books are asked', async () => {
  const twins = [
    HEADER,
    'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
    'B2B,27AABCT1332L1ZE,FABRIC CO,F/101,06-09-2026,3000,75,75,0,0,3150,Y',
  ].join('\n');
  const state = await withStatement(twins);
  const bill = purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[13000, 5]]);
  const [row, ...others] = review(state).rows;
  assert.deepEqual(others, []);
  assert.equal(row.key, KEY('F101'));
  assert.equal(row.lines, 2);
  assert.equal(row.invoiceNo, 'F-101', 'the first line names the document');
  assert.equal(row.invoiceDate, '2026-09-05');
  assert.deepEqual([row.taxableValue, row.cgst, row.sgst, row.credit], [13000, 325, 325, 650]);
  assert.equal(row.match, 'matched');
  assert.equal(row.billId, bill.id);
  const odd = await withStatement(TWINS_2B);
  purchase(odd, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  const [differs] = review(odd).rows;
  assert.equal(differs.match, 'amount differs', 'a twin that does not add up to the bill is not a match');
  assert.match(differs.why, /taxable value 10000 in your books, 13000 in 2B/);
});

test('R1-8: accept all matched no longer accepts the twin the engine labels amount differs', async () => {
  const state = await withStatement(TWINS_2B);
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  const plan = planImsDecision(state, { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(plan.ok, false, JSON.stringify(plan));
  assert.equal(plan.error, 'NO_MATCH');
  const said = await chat(state, 'accept all matched invoices in ims for 2026-09');
  assert.equal(said.blocked, true, JSON.stringify(said));
  assert.deepEqual(state.imsDecisions, {});
  assert.deepEqual(review(state).rows.map((row) => row.decision), ['', '', '']);
});

test('R1-8: rows of different suppliers with no GSTIN do not share a key, and a decision on one is not shown on the other', async () => {
  assert.equal(imsKey(PERIOD, { supplierGstin: '', supplierName: 'Alpha Traders Pvt. Ltd.', invoiceNo: 'INV-1', section: 'b2b' }), `${PERIOD}|ALPHATRADERSPVTLTD|INV1|B2B`);
  assert.equal(imsKey(PERIOD, { supplierGstin: ' 27aabct1332l1ze ', supplierName: 'Alpha Traders', invoiceNo: 'INV-1', section: 'b2b' }), KEY('INV1'), 'a GSTIN still names the supplier');
  assert.equal(imsKey(PERIOD, { supplierGstin: '', invoiceNo: 'X1' }), `${PERIOD}||X1|`, 'no GSTIN and no name stays as it was');
  const csv = [
    HEADER,
    'B2B,,ALPHA TRADERS,INV-1,05-09-2026,1000,25,25,0,0,1050,Y',
    'B2B,,BETA TRADERS,INV-1,06-09-2026,2000,50,50,0,0,2100,Y',
  ].join('\n');
  const state = await withStatement(csv);
  const rows = review(state).rows;
  assert.deepEqual(rows.map((row) => row.key), [`${PERIOD}|ALPHATRADERS|INV1|B2B`, `${PERIOD}|BETATRADERS|INV1|B2B`]);
  assert.deepEqual(rows.map((row) => row.lines), [1, 1]);
  const done = await runTool(state, 'ims_decide', { period: PERIOD, keys: [rows[0].key], decision: 'reject', note: 'not ours' });
  assert.equal(done.count, 1);
  const after = review(state);
  assert.deepEqual(after.rows.map((row) => row.decision), ['reject', '']);
  assert.deepEqual(after.counts, { total: 2, accept: 0, reject: 1, pending: 0, undecided: 1 });
  assert.deepEqual(after.credit, { accepted: 0, rejected: 50, pending: 0, undecided: 100 });
  assert.deepEqual(Object.keys(state.imsDecisions), [rows[0].key]);
});

test('R2-1: a decision on an invoice stays on its key when a re-import brings another line for it, and the credit follows the lines', async () => {
  const state = await withStatement(MULTI_RATE_2B.split('\n').slice(0, 2).join('\n'));
  const [first] = review(state).rows;
  assert.equal(first.lines, 1);
  assert.equal(first.credit, 500);
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [first.key], decision: 'accept', note: 'seen' });
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: MULTI_RATE_2B, fileName: 'again.csv' });
  const data = review(state);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].key, first.key);
  assert.equal(data.rows[0].lines, 2);
  assert.equal(data.rows[0].decision, 'accept');
  assert.equal(data.rows[0].note, 'seen');
  assert.deepEqual(data.credit, { accepted: 1220, rejected: 0, pending: 0, undecided: 0 });
  assert.equal(data.orphaned, 0);
});

test('R2-1: when the lines of one invoice disagree about the credit, the row shows the least favourable word', async () => {
  const lines = (...flags) => [HEADER, ...flags.map((flag, i) => `B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,${1000 + i},25,25,0,0,1050,${flag}`)].join('\n');
  const cases = [[['Y', 'Y'], 'Y'], [['Y', 'N'], 'N'], [['N', 'Y'], 'N'], [['Y', 'A'], 'A'], [['A', 'N'], 'N'], [['N', 'N', 'Y'], 'N']];
  for (const [flags, shown] of cases) {
    const state = await withStatement(lines(...flags));
    const [row] = review(state).rows;
    assert.equal(row.lines, flags.length, flags.join());
    assert.equal(row.itcAvailability, shown, flags.join());
  }
});

test('R1-19: when no invoice is named, the blocker offers the month and two things to say, not the words the user used', async () => {
  const state = await withStatement(MIXED_2B);
  purchase(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-15', [[2000, 18]]);
  const sentence = 'Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject DYE WORKS in IMS for 2026-09".';
  const blocked = (args) => previewOf(state, 'ims_decide', { period: PERIOD, decision: 'accept', ...args }).blockers;
  assert.deepEqual(blocked({}), [sentence]);
  assert.deepEqual(blocked({ keys: [] }), [sentence]);
  assert.deepEqual(blocked({ select: 'nonsense' }), [sentence]);
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, decision: 'reject' }).blockers, [sentence]);
  const held = propose(state, 'ims_decide', { period: PERIOD, decision: 'accept' });
  assert.equal(held.blocked, true, JSON.stringify(held));
  assert.equal(held.reply, 'I did not post anything, because:\n· Say which invoices, for example "accept all matched in IMS for September 2026" or "reject DYE WORKS in IMS for September 2026".');
  assert.doesNotMatch(held.reply, /all suggested|all not decided/);
  const offered = await chat(state, 'accept all matched in IMS for September 2026');
  assert.equal(offered.awaitingConfirmation, true, JSON.stringify(offered));
  assert.match(offered.reply, /^Mark DYE WORKS DW-3 as accepted in IMS for September 2026\./);
});

test('R1-19: the month in the blocker is the month asked for, the supplier is one in that statement, and a supplier with a very long name is left out', async () => {
  const state = await withStatement(MIXED_2B);
  await runTool(state, 'import_gstr2b', { period: '2026-08', csv: [HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-1,05-08-2026,1000,25,25,0,0,1050,Y'].join('\n') });
  assert.deepEqual(previewOf(state, 'ims_decide', { period: '2026-08', decision: 'pending' }).blockers, ['Say which invoices, for example "accept all matched in IMS for 2026-08" or "reject FABRIC CO in IMS for 2026-08".']);
  const long = 'SRI VENKATA LAKSHMI NARASIMHA TEXTILE MANUFACTURING AND TRADING COMPANY PRIVATE LIMITED';
  await runTool(state, 'import_gstr2b', { period: '2026-07', csv: [HEADER, `B2B,27AABCT1332L1ZE,${long},F-1,05-07-2026,1000,25,25,0,0,1050,Y`].join('\n') });
  assert.deepEqual(previewOf(state, 'ims_decide', { period: '2026-07', decision: 'accept' }).blockers, ['Say which invoices, for example "accept all matched in IMS for 2026-07".']);
  assert.equal(planImsDecision(state, { period: '2026-07', decision: 'accept' }).error, 'NO_ROWS');
});

test('R1-19: a word that finds nothing keeps its own sentence, in the preview, in chat and from the Accept all matched chip', async () => {
  const state = await withStatement([HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y'].join('\n'));
  const nothing = 'No invoice in that month is matched to a bill in your books, so nothing was marked.';
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' }).blockers, [nothing]);
  const chip = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(chip.reply, `I did not post anything, because:\n· ${nothing}`);
  const said = await chat(state, 'accept all matched invoices in ims for 2026-09');
  assert.equal(said.reply, `I did not post anything, because:\n· ${nothing}`);
  const suggested = await chat(state, 'reject all suggested invoices in ims for 2026-09');
  assert.equal(suggested.reply, 'I did not post anything, because:\n· No invoice in that month has "reject" as its suggestion, so nothing was marked.');
  for (const reply of [chip.reply, said.reply, suggested.reply]) assert.doesNotMatch(reply, /Say which invoices/);
});

test('skeptic gap: previewing an IMS decision leaves the caller\'s arguments as they were, so the same object can be previewed again', async () => {
  const state = await withStatement(MIXED_2B);
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  const args = { period: PERIOD, select: 'matched', decision: 'accept' };
  const first = propose(state, 'ims_decide', args);
  assert.equal(first.awaitingConfirmation, true, JSON.stringify(first));
  assert.equal(first.preview.summary, 'Mark FABRIC CO F-101 as accepted in IMS for September 2026.');
  assert.deepEqual(args, { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.deepEqual(Object.keys(args), ['period', 'select', 'decision']);
  assert.deepEqual(state.pendingChatAction.args, { period: PERIOD, keys: [KEY('F101')], decision: 'accept' }, 'the held call still carries exactly the invoices that were shown');
  purchase(state, 'Thread Ltd', '33AAACZ1234F1Z5', 'T-55', '2026-09-11', [[8000, 12]]);
  const second = propose(state, 'ims_decide', args);
  assert.equal(second.awaitingConfirmation, true, JSON.stringify(second));
  assert.equal(second.preview.summary, 'Mark 2 invoices in IMS for September 2026 as accepted (credit ₹1,460.00).');
  assert.deepEqual(state.pendingChatAction.args.keys, [KEY('F101'), KEY('T55', 'B2B', '33AAACZ1234F1Z5')]);
  assert.deepEqual(Object.keys(args), ['period', 'select', 'decision']);
  const done = await confirmPending(state, second.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Marked 2 rows accepted in IMS for September 2026.');
});

test('skeptic gap: an argument object that cannot be changed can be previewed and confirmed', async () => {
  const state = await withStatement(MIXED_2B);
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  const frozen = Object.freeze({ period: PERIOD, select: 'matched', decision: 'accept' });
  const held = propose(state, 'ims_decide', frozen);
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.deepEqual(state.pendingChatAction.args.keys, [KEY('F101')]);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.deepEqual(Object.keys(state.imsDecisions), [KEY('F101')]);
});

test('skeptic gap: pinImsRows returns the call to hold and leaves the call it was given alone', async () => {
  const state = await withStatement(MIXED_2B);
  const args = Object.freeze({ period: PERIOD, select: 'all', decision: 'pending', note: 'later' });
  const plan = planImsDecision(state, args);
  const pinned = pinImsRows(args, plan);
  assert.notEqual(pinned, args);
  assert.deepEqual(args, { period: PERIOD, select: 'all', decision: 'pending', note: 'later' });
  assert.deepEqual(pinned, { period: PERIOD, decision: 'pending', note: 'later', keys: plan.rows.map((row) => row.key) });
  assert.equal(pinned.keys.length, 4);
  const longCsv = [HEADER, `B2B,27AABCT1332L1ZE,FABRIC CO,${'L'.repeat(110)},05-09-2026,100,2.5,2.5,0,0,105,Y`].join('\n');
  const longState = await withStatement(longCsv);
  const longArgs = { period: PERIOD, select: 'all', decision: 'accept' };
  const kept = pinImsRows(longArgs, planImsDecision(longState, longArgs));
  assert.deepEqual(kept, { period: PERIOD, select: 'all', decision: 'accept' }, 'a key too long to travel leaves the word in place');
});

function msmeBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const BILL = (date, no, name = 'Fabric Co', rate = 1000) => ({ partyName: name, partyGstin: SUPPLIER_GSTIN, lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate, gstRate: 5 }], date, supplierInvoiceNo: no });
const ROW = 'MSME bills inside their limit';
const closeRow = (close) => close.data.checklist.find((item) => item.item === ROW);
const msmeReminders = (state) => (state.reminders || []).filter((item) => String(item.source || '').startsWith('msme:'));
const pastLimit = (state, asOfDate) => detectExceptions(state, { asOfDate }).filter((item) => item.code === 'MSME_PAST_LIMIT');

async function booked(category, days, billDate) {
  const state = msmeBooks();
  const marked = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, udyam: 'UDYAM-MH-01-0000001', category, ...(days == null ? {} : { days }) });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  const bill = await runTool(state, 'create_purchase', BILL(billDate, 'F-1'));
  assert.equal(bill.ok, true, JSON.stringify(bill));
  return state;
}

test('R1-9: a medium supplier\'s late bill raises no MSME exception, no seven-day reminder and no daily-close count, with or without agreed days', async () => {
  for (const days of [null, 30]) {
    const small = await booked('small', days, '2026-08-01');
    assert.equal(pastLimit(small, AS_OF).length, 1, `small ${days}`);
    assert.deepEqual(closeRow(await runTool(small, 'daily_close', { asOf: AS_OF })), { item: ROW, ok: false, detail: '1 open, 1 past the limit' });
    const medium = await booked('medium', days, '2026-08-01');
    assert.deepEqual(pastLimit(medium, AS_OF), [], `medium ${days}`);
    const close = await runTool(medium, 'daily_close', { asOf: AS_OF });
    assert.deepEqual(closeRow(close), { item: ROW, ok: true, detail: 'none open' }, `medium ${days}`);
    assert.equal(close.data.needsYou.includes(ROW), false);
    const dues = await runTool(medium, 'supplier_dues', { asOf: AS_OF });
    assert.deepEqual([dues.data.msme.count, dues.data.msme.outstanding, dues.data.msme.overdue, dues.data.msme.overdueOutstanding], [0, 0, 0, 0], `medium ${days}`);
    assert.doesNotMatch(fmtToolResult('supplier_dues', dues), /not deductible until paid/);
  }
  for (const [category, reminders] of [['small', 1], ['medium', 0]]) {
    const state = await booked(category, 30, '2026-10-20');
    const run = await runTool(state, 'run_automation', { asOf: AS_OF });
    assert.equal(run.ok, true, JSON.stringify(run));
    assert.equal(msmeReminders(state).length, reminders, category);
  }
});

test('skeptic gap: the coverage of a category follows the rule records on any date, so a medium supplier is never covered', () => {
  const dates = ['2005-01-01', '2006-10-02', '2022-12-01', '2023-03-31', '2023-04-01', '2026-03-31', '2026-04-01', '2026-11-06', '2035-01-01'];
  for (const date of dates) {
    for (const category of ['micro', 'small', 'Small', ' MICRO ', '', undefined, null]) assert.equal(msmeCovered(category, date), true, `${String(category)} on ${date}`);
    for (const category of ['medium', 'Medium', ' MEDIUM ']) assert.equal(msmeCovered(category, date), false, `${category} on ${date}`);
  }
});

test('skeptic gap: a medium supplier\'s bill dated before the deduction rule starts is a normal bill too, in the dues, the exceptions, the reminders and the daily close', async () => {
  const small = await booked('small', 30, '2023-03-15');
  const medium = await booked('medium', 30, '2023-03-15');
  const dueSmall = (await runTool(small, 'supplier_dues', { asOf: '2023-05-01' })).data;
  assert.deepEqual([dueSmall.bills[0].msme, dueSmall.msme.count, dueSmall.msme.overdue, dueSmall.msme.overdueOutstanding], [true, 1, 1, 10500]);
  const dueMedium = (await runTool(medium, 'supplier_dues', { asOf: '2023-05-01' })).data;
  assert.deepEqual(dueMedium.bills.map((row) => [row.payBy, row.overdue, row.msme]), [['2023-04-14', true, false]]);
  assert.deepEqual([dueMedium.msme.count, dueMedium.msme.outstanding, dueMedium.msme.overdue, dueMedium.msme.overdueOutstanding], [0, 0, 0, 0]);
  assert.equal(pastLimit(small, '2023-05-01').length, 1);
  assert.deepEqual(pastLimit(medium, '2023-05-01'), []);
  assert.deepEqual(closeRow(await runTool(small, 'daily_close', { asOf: '2023-05-01' })), { item: ROW, ok: false, detail: '1 open, 1 past the limit' });
  assert.deepEqual(closeRow(await runTool(medium, 'daily_close', { asOf: '2023-05-01' })), { item: ROW, ok: true, detail: 'none open' });
  await runTool(small, 'run_automation', { asOf: '2023-04-10' });
  await runTool(medium, 'run_automation', { asOf: '2023-04-10' });
  assert.deepEqual(msmeReminders(small).map((item) => item.source), ['msme:BILL-0001:2023-04-14']);
  assert.deepEqual(msmeReminders(medium), []);
  const week = (await runTool(medium, 'week_ahead', { asOf: '2023-04-10' })).data.items.filter((item) => item.kind === 'payable');
  assert.deepEqual(week.map((item) => item.msme), [false]);
  assert.doesNotMatch(week[0].title, /MSME/);
});

test('skeptic gap: the reply for a medium supplier with no agreed days promises no pay-by date', async () => {
  const state = msmeBooks();
  const held = propose(state, 'set_supplier_terms', { partyName: 'Mid Mills', msme: true, category: 'medium' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Mid Mills is recorded as an MSME (medium). No pay-by date is set until you give the agreed days, as the 45-day rule covers micro and small suppliers only; bills already booked from them are checked against the new terms too.');
  assert.doesNotMatch(done.reply, /carry the pay-by date/);
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.deepEqual(dues.data.bills, []);
});

test('skeptic gap: the reply says a pay-by date is set only where one is, for every kind of supplier', async () => {
  const say = async (args) => fmtToolResult('set_supplier_terms', await runTool(msmeBooks(), 'set_supplier_terms', args));
  assert.equal(await say({ partyName: 'Fabric Co', msme: true, category: 'small', days: 30 }), 'Fabric Co is recorded as an MSME (small); agreed terms 30 days. New bills from them carry the pay-by date from the MSMED Act; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Fabric Co', msme: true, category: 'small' }), 'Fabric Co is recorded as an MSME (small). New bills from them carry the pay-by date from the MSMED Act; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Fabric Co', msme: true }), 'Fabric Co is recorded as an MSME. New bills from them carry the pay-by date from the MSMED Act; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Mid Mills', msme: true, category: 'medium', days: 30 }), 'Mid Mills is recorded as an MSME (medium); agreed terms 30 days. New bills from them carry the pay-by date from the agreed days, as the 45-day rule covers micro and small suppliers only; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Mid Mills', msme: true, category: 'medium', days: 0 }), 'Mid Mills is recorded as an MSME (medium); agreed terms on receipt. New bills from them carry the pay-by date from the agreed days, as the 45-day rule covers micro and small suppliers only; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Steel Co', days: 60 }), 'Steel Co is not an MSME; agreed terms 60 days. New bills from them carry the pay-by date; bills already booked from them are checked against the new terms too.');
  assert.equal(await say({ partyName: 'Steel Co' }), 'Steel Co is not an MSME. No pay-by date is set until you give the agreed days; bills already booked from them are checked against the new terms too.');
  const unmarked = msmeBooks();
  await runTool(unmarked, 'set_supplier_terms', { partyName: 'Steel Co', msme: true, category: 'small' });
  assert.equal(fmtToolResult('set_supplier_terms', await runTool(unmarked, 'set_supplier_terms', { partyName: 'Steel Co', msme: false })), 'Steel Co is not an MSME. No pay-by date is set until you give the agreed days; bills already booked from them are checked against the new terms too.');
});

test('skeptic gap: the one thing in the weekly brief writes the MSME amount like the week ahead does', async () => {
  const state = msmeBooks();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'small', days: 30 });
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1', 'Fabric Co', 10000));
  const brief = await runTool(state, 'weekly_brief', { asOf: AS_OF });
  assert.equal(brief.ok, true, JSON.stringify(brief));
  assert.equal(brief.data.oneThing, 'Pay Fabric Co ₹1,05,000.00 on BILL-0001: it is past the MSMED date, so the expense is disallowed until it is paid.');
  const said = fmtToolResult('weekly_brief', brief);
  assert.ok(said.includes('The one thing: Pay Fabric Co ₹1,05,000.00 on BILL-0001: it is past the MSMED date'), said);
  assert.doesNotMatch(said, /105000/);
  const week = await runTool(state, 'week_ahead', { asOf: AS_OF });
  const [payable] = week.data.items.filter((item) => item.kind === 'payable');
  assert.ok(payable.title.startsWith('Pay Fabric Co ₹1,05,000.00 on BILL-0001'), payable.title);
  assert.ok(brief.data.oneThing.startsWith('Pay Fabric Co ₹1,05,000.00 on BILL-0001'), 'the same amount in the same words');
  const medium = msmeBooks();
  await runTool(medium, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'medium', days: 30 });
  await runTool(medium, 'create_purchase', BILL('2026-09-01', 'F-1', 'Fabric Co', 10000));
  const other = await runTool(medium, 'weekly_brief', { asOf: AS_OF });
  assert.doesNotMatch(other.data.oneThing, /MSMED/);
});
