import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending, chat, fmtToolResult } from '../src/router.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { imsReview, planImsDecision } from '../src/ims.mjs';
import * as supplierDues from '../src/supplier-dues.mjs';

const PERIOD = '2026-09';
const AS_OF = '2026-11-06';
const SUPPLIER_GSTIN = '27AAACF1234A1Z5';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';

const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
  'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
].join('\n');

const KEYS = {
  fabric: `${PERIOD}|27AABCT1332L1ZE|F101|B2B`,
  pack: `${PERIOD}|29AABCL1234J1ZL|PH9|B2B`,
  thread: `${PERIOD}|33AAACZ1234F1Z5|T55|B2B`,
  dye: `${PERIOD}|27AAACD1111A1Z5|DW3|B2B`,
  note: `${PERIOD}|27AABCT1332L1ZE|CN7|CDNR`,
};

function purchase(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

async function statementOnly(csv = TWO_B, period = PERIOD) {
  const state = createState();
  const added = await runTool(state, 'import_gstr2b', { period, csv, fileName: 'GSTR2B.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

async function fabricBooked() {
  const state = await statementOnly();
  purchase(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  return state;
}

const bigStatement = (count) => [HEADER, ...Array.from({ length: count }, (_, i) => `B2B,27AABCT1332L1ZE,FABRIC CO,X-${i},05-09-2026,100,2.5,2.5,0,0,105,Y`)].join('\n');
const rowsOf = (state, period = PERIOD) => imsReview(state, { period }).data.rows;

test('routing-3: a yes applies exactly the invoices the preview showed, even if another invoice becomes matched before it', async () => {
  const state = await fabricBooked();
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(held.preview.summary, 'Mark FABRIC CO F-101 as accepted in IMS for September 2026.');
  assert.deepEqual(state.pendingChatAction.args.keys, [KEYS.fabric]);
  assert.equal(state.pendingChatAction.args.select, undefined);
  purchase(state, 'Thread Ltd', '33AAACZ1234F1Z5', 'T-55', '2026-09-11', 8000, 12);
  assert.equal(planImsDecision(state, { period: PERIOD, select: 'matched', decision: 'accept' }).rows.length, 2, 'the new bill does match a second row now');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Marked 1 row accepted in IMS for September 2026.');
  assert.deepEqual(Object.keys(state.imsDecisions), [KEYS.fabric]);
});

test('routing-3: the same holds in chat, where the yes posts the one invoice that was shown', async () => {
  const state = await fabricBooked();
  const held = await chat(state, 'accept all matched invoices in IMS for 2026-09');
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.match(held.reply, /Mark FABRIC CO F-101 as accepted in IMS for September 2026\./);
  purchase(state, 'Thread Ltd', '33AAACZ1234F1Z5', 'T-55', '2026-09-11', 8000, 12);
  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true, JSON.stringify(yes));
  assert.equal(yes.reply, 'Marked 1 row accepted in IMS for September 2026.');
  assert.deepEqual(Object.keys(state.imsDecisions), [KEYS.fabric]);
});

test('routing-3: a previewed invoice that is no longer in the statement refuses the yes with a sentence and changes nothing', async () => {
  const state = await fabricBooked();
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, 'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y'].join('\n') });
  const late = await confirmPending(state, held.preview.token);
  assert.equal(late.posted, false);
  assert.equal(late.reply, 'One of those invoices is not in the GSTR-2B for that month.');
  assert.deepEqual(state.imsDecisions, {});
});

test('routing-3: keys given by the form are kept as they are, and the word is dropped once the keys are resolved', async () => {
  const state = await fabricBooked();
  const held = propose(state, 'ims_decide', { period: PERIOD, keys: [KEYS.thread, KEYS.fabric, KEYS.thread], select: 'all', decision: 'pending', note: 'check' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.deepEqual(state.pendingChatAction.args, { period: PERIOD, keys: [KEYS.thread, KEYS.fabric], decision: 'pending', note: 'check' });
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.deepEqual(Object.keys(state.imsDecisions).sort(), [KEYS.fabric, KEYS.thread].sort());
});

test('routing-3: a statement of exactly 500 invoices can be previewed and confirmed with the word all', async () => {
  const state = await statementOnly(bigStatement(500));
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(held.preview.figures.count, 500);
  assert.equal(state.pendingChatAction.args.keys?.length, 500);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Marked 500 rows accepted in IMS for September 2026.');
  assert.equal(Object.keys(state.imsDecisions).length, 500);
});

test('routing-3: an invoice number so long that its key could not travel in the call is left as the word, and the preview and the yes still work', async () => {
  const csv = [HEADER, `B2B,27AABCT1332L1ZE,FABRIC CO,${'L'.repeat(110)},05-09-2026,100,2.5,2.5,0,0,105,Y`].join('\n');
  const state = await statementOnly(csv);
  assert.ok(rowsOf(state)[0].key.length > 120);
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(state.pendingChatAction.args.select, 'all');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(Object.keys(state.imsDecisions).length, 1);
});

test('routing-14: a word that picks no invoice says which word found nothing; a missing word still asks which invoices', async () => {
  const bare = await statementOnly();
  const blocked = (state, args) => previewOf(state, 'ims_decide', { period: PERIOD, decision: 'accept', ...args }).blockers;
  assert.equal(planImsDecision(bare, { period: PERIOD, decision: 'accept', select: 'matched' }).error, 'NO_MATCH');
  assert.deepEqual(blocked(bare, { select: 'matched' }), ['No invoice in that month is matched to a bill in your books, so nothing was marked.']);
  assert.deepEqual(blocked(bare, { select: 'suggested', decision: 'reject' }), ['No invoice in that month has "reject" as its suggestion, so nothing was marked.']);
  assert.deepEqual(blocked(bare, { select: 'suggested', decision: 'clear' }), ['No invoice in that month has "clear" as its suggestion, so nothing was marked.']);
  const decided = await statementOnly();
  await runTool(decided, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(planImsDecision(decided, { period: PERIOD, decision: 'reject', select: 'undecided' }).error, 'NO_MATCH');
  assert.deepEqual(blocked(decided, { select: 'undecided', decision: 'reject' }), ['No invoice in that month is undecided, so nothing was marked.']);
  const asking = ['Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject all undecided in IMS for 2026-09".'];
  assert.equal(planImsDecision(decided, { period: PERIOD, decision: 'accept' }).error, 'NO_ROWS');
  assert.deepEqual(blocked(decided, {}), asking);
  assert.deepEqual(blocked(decided, { keys: [] }), asking);
  assert.deepEqual(blocked(decided, { select: 'nonsense' }), asking);
  assert.equal(planImsDecision(decided, { period: PERIOD, decision: 'accept', select: 'all' }).ok, true);
});

test('routing-14: in chat the refusal names what was asked, not the instruction to say which invoices', async () => {
  const state = await statementOnly();
  await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  const undecided = await chat(state, 'reject all undecided invoices in IMS for 2026-09');
  assert.equal(undecided.blocked, true, JSON.stringify(undecided));
  assert.match(undecided.reply, /No invoice in that month is undecided, so nothing was marked\./);
  assert.doesNotMatch(undecided.reply, /Say which invoices/);
  const bare = await statementOnly();
  const matched = await chat(bare, 'accept all matched invoices in IMS for 2026-09');
  assert.equal(matched.blocked, true, JSON.stringify(matched));
  assert.match(matched.reply, /No invoice in that month is matched to a bill in your books, so nothing was marked\./);
  assert.doesNotMatch(matched.reply, /Say which invoices/);
});

test('routing-14: the engine answer for a word that found nothing is a sentence, with or without its own wording', () => {
  assert.equal(fmtToolResult('ims_decide', { ok: false, error: 'NO_MATCH', hint: 'No invoice in that month is undecided, so nothing was marked.' }), 'No invoice in that month is undecided, so nothing was marked.');
  assert.equal(fmtToolResult('ims_decide', { ok: false, error: 'NO_MATCH' }), 'No invoice matches what you asked for, so nothing was marked.');
});

test('engine-app-1: a supplier or customer named with more than 80 characters can be given terms', async () => {
  const name = 'Sri Venkata Lakshmi Narasimha Textile Manufacturing And Trading Company Private Limited';
  assert.equal(name.length, 87);
  assert.equal(validateAssistantToolCall('set_supplier_terms', { partyName: name, msme: true, days: 30 }).ok, true);
  assert.equal(validateAssistantToolCall('set_payment_terms', { partyName: name, days: 30 }).ok, true);
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const booked = await runTool(state, 'create_purchase', { partyName: name, partyGstin: SUPPLIER_GSTIN, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-30', supplierInvoiceNo: 'V-1' });
  assert.equal(booked.ok, true, JSON.stringify(booked));
  const held = propose(state, 'set_supplier_terms', { partyName: name, partyGstin: SUPPLIER_GSTIN, msme: true, days: 30 });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.ok(held.preview.summary.startsWith(`Mark ${name} as an MSME supplier`), held.preview.summary);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.deepEqual(dues.data.bills.map((row) => [row.billId, row.supplier, row.msme]), [['BILL-0001', name, true]]);
  const terms = propose(state, 'set_payment_terms', { partyName: name, days: 30 });
  assert.equal(terms.awaitingConfirmation, true, JSON.stringify(terms));
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

async function bookedFrom(category, days, billDate = '2026-08-01') {
  const state = msmeBooks();
  const marked = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, ...(category ? { category } : {}), ...(days == null ? {} : { days }) });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  const bill = await runTool(state, 'create_purchase', BILL(billDate, 'F-1'));
  assert.equal(bill.ok, true, JSON.stringify(bill));
  return { state, bill: bill.invoice };
}

test('engine-app-2: the posted reply and the preview say bills already booked are checked against the new terms, and they are', async () => {
  const state = msmeBooks();
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-10-02', 'F-2'));
  assert.deepEqual((await runTool(state, 'supplier_dues', { asOf: AS_OF })).data.bills, []);
  const held = propose(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'small', days: 30 });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.ok(held.preview.effects.includes('Bills already booked from them are checked against the new terms too.'), JSON.stringify(held.preview.effects));
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Fabric Co is recorded as an MSME (small); agreed terms 30 days. New bills from them carry the pay-by date from the MSMED Act; bills already booked from them are checked against the new terms too.');
  assert.doesNotMatch(done.reply, /old bills keep theirs/);
  const after = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.deepEqual(after.data.bills.map((row) => [row.billId, row.payBy, row.overdue, row.msme]), [['BILL-0001', '2026-10-01', true, true], ['BILL-0002', '2026-11-01', true, true]]);
  assert.equal(after.data.msme.overdue, 2);
});

test('engine-app-2: every other place that speaks about a bill\'s pay-by date takes it from supplier_dues', async () => {
  const state = msmeBooks();
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-10-20', 'F-2'));
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'small', days: 30 });
  await runTool(state, 'create_purchase', BILL('2026-11-02', 'F-3'));
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, days: 45 });
  const dues = (await runTool(state, 'supplier_dues', { asOf: AS_OF })).data.bills;
  assert.deepEqual(dues.map((row) => [row.billId, row.payBy]), [['BILL-0001', '2026-10-16'], ['BILL-0002', '2026-12-04'], ['BILL-0003', '2026-12-17']]);
  const week = await runTool(state, 'week_ahead', { asOf: '2026-12-01' });
  const payables = week.data.items.filter((item) => item.kind === 'payable');
  assert.deepEqual(payables.map((item) => [item.billId, item.when]), [['BILL-0001', '2026-10-16'], ['BILL-0002', '2026-12-04']]);
  const run = await runTool(state, 'payment_run', { asOf: AS_OF });
  const planned = [...run.data.proposed, ...run.data.consider, ...run.data.later, ...run.data.held].map((row) => [row.billId, row.payBy]).sort();
  assert.deepEqual(planned, dues.map((row) => [row.billId, row.payBy]).sort());
});

test('engine-app-3: the coverage helper counts micro, small and no category as covered and medium as not', () => {
  assert.equal(typeof supplierDues.msmeCovered, 'function');
  for (const category of ['micro', 'small', 'Small', ' MICRO ', '', undefined, null]) assert.equal(supplierDues.msmeCovered(category, '2026-08-01'), true, String(category));
  for (const category of ['medium', 'Medium', ' MEDIUM ']) assert.equal(supplierDues.msmeCovered(category, '2026-08-01'), false, category);
});

test('engine-app-3: supplier_dues treats a medium supplier\'s bill as a normal bill with the agreed days, outside the MSME totals', async () => {
  for (const [category, covered] of [['micro', true], ['small', true], ['', true], ['medium', false]]) {
    const { state } = await bookedFrom(category, 30);
    const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
    assert.equal(dues.data.bills.length, 1, category);
    const [row] = dues.data.bills;
    assert.equal(row.payBy, '2026-08-31', category);
    assert.equal(row.overdue, true, category);
    assert.equal(row.msme, covered, `${category || 'no category'}: msme flag`);
    assert.equal(dues.data.msme.count, covered ? 1 : 0, `${category || 'no category'}: msme count`);
    assert.equal(dues.data.msme.outstanding, covered ? 10500 : 0, `${category || 'no category'}: msme outstanding`);
    assert.equal(dues.data.msme.overdue, covered ? 1 : 0, `${category || 'no category'}: msme overdue`);
    assert.equal(dues.data.msme.overdueOutstanding, covered ? 10500 : 0, `${category || 'no category'}: not deductible until paid`);
    const said = fmtToolResult('supplier_dues', dues);
    assert.equal(/not deductible until paid/.test(said), covered, `${category || 'no category'}: ${said}`);
  }
});

test('engine-app-3: a medium supplier with no agreed days has no pay-by date, and one with more than 45 days is allowed while a small one is refused', async () => {
  const { state } = await bookedFrom('medium', null);
  assert.deepEqual((await runTool(state, 'supplier_dues', { asOf: AS_OF })).data.bills, []);
  const long = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, days: 60 });
  assert.equal(long.ok, true, JSON.stringify(long));
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.deepEqual(dues.data.bills.map((row) => [row.payBy, row.msme]), [['2026-09-30', false]]);
  const small = await runTool(state, 'set_supplier_terms', { partyName: 'Steel Mills', msme: true, category: 'small', days: 60 });
  assert.equal(small.error, 'TERMS_EXCEED_MSMED');
});

test('engine-app-3: the daily run sets no seven-day reminder for a medium supplier\'s bill and still does for a small one', async () => {
  for (const [category, reminders] of [['small', 1], ['medium', 0]]) {
    const { state } = await bookedFrom(category, 30, '2026-10-20');
    const run = await runTool(state, 'run_automation', { asOf: AS_OF });
    assert.equal(run.ok, true, JSON.stringify(run));
    assert.equal(msmeReminders(state).length, reminders, category);
    if (reminders) assert.equal(msmeReminders(state)[0].source, 'msme:BILL-0001:2026-11-19');
  }
});

test('engine-app-3: a medium supplier\'s late bill raises no MSME exception and a small one does', async () => {
  for (const [category, raised] of [['small', true], ['medium', false]]) {
    const { state } = await bookedFrom(category, 30);
    const open = await runTool(state, 'exceptions', { asOfDate: AS_OF });
    assert.equal(open.data.exceptions.some((item) => item.code === 'MSME_PAST_LIMIT'), raised, category);
  }
});

test('engine-app-3: the daily close counts a small supplier\'s late bill against the MSME row and leaves a medium supplier\'s out', async () => {
  const small = await bookedFrom('small', 30);
  assert.deepEqual(closeRow(await runTool(small.state, 'daily_close', { asOf: AS_OF })), { item: ROW, ok: false, detail: '1 open, 1 past the limit' });
  const medium = await bookedFrom('medium', 30);
  const close = await runTool(medium.state, 'daily_close', { asOf: AS_OF });
  assert.deepEqual(closeRow(close), { item: ROW, ok: true, detail: 'none open' });
  assert.equal(close.data.needsYou.includes(ROW), false);
});

test('engine-app-3: the week ahead, the payment run and the booked bill carry no MSME claim for a medium supplier', async () => {
  const { state, bill } = await bookedFrom('medium', 30);
  assert.equal(bill.dueDate, '2026-08-31');
  assert.equal(bill.msme, undefined);
  const week = await runTool(state, 'week_ahead', { asOf: AS_OF });
  const [payable] = week.data.items.filter((item) => item.kind === 'payable');
  assert.equal(payable.msme, false);
  assert.doesNotMatch(payable.title, /MSME/);
  assert.equal(payable.detail, 'Overdue since 2026-08-31');
  const run = await runTool(state, 'payment_run', { asOf: AS_OF });
  const [row] = run.data.proposed;
  assert.equal(row.msme, false);
  assert.notEqual(row.bucket, 'msme-limit');
  const small = await bookedFrom('small', 30);
  assert.equal(small.bill.msme, true);
  assert.equal((await runTool(small.state, 'payment_run', { asOf: AS_OF })).data.proposed[0].bucket, 'msme-limit');
});

test('engine-app-3: the preview says in one sentence that the 45-day rule covers micro and small suppliers only, and promises no reminder for a medium one', () => {
  const state = msmeBooks();
  const sentence = 'The 45-day rule covers micro and small suppliers only, so a medium supplier gets no MSME limit or reminder.';
  const medium = previewOf(state, 'set_supplier_terms', { partyName: 'Mid Size Mills', msme: true, category: 'medium', days: 30 });
  assert.deepEqual(medium.blockers, []);
  assert.equal(medium.summary, 'Mark Mid Size Mills as an MSME supplier (medium, Udyam not given) to be paid within 30 days');
  assert.deepEqual(medium.effects, [
    'New bills from them get a pay-by date 30 days from the bill date. Nothing is posted.',
    sentence,
    'Bills already booked from them are checked against the new terms too.',
  ]);
  assert.deepEqual(medium.figures, { days: 30 });
  const undated = previewOf(state, 'set_supplier_terms', { partyName: 'Mid Size Mills', msme: true, category: 'medium' });
  assert.equal(undated.summary, 'Mark Mid Size Mills as an MSME supplier (medium, Udyam not given)');
  assert.deepEqual(undated.effects, [
    'No pay-by date is set until you give the agreed days. Nothing is posted.',
    sentence,
    'Bills already booked from them are checked against the new terms too.',
  ]);
  assert.deepEqual(undated.figures, { days: null });
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Mid Size Mills', msme: true, category: 'medium', days: 60 }).blockers, []);
  for (const category of ['micro', 'small']) {
    const covered = previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, category, days: 30 });
    assert.deepEqual(covered.effects, [
      'New bills from them get a pay-by date 30 days from the bill date; MyCA reminds you a week before it. Nothing is posted.',
      'Bills already booked from them are checked against the new terms too.',
    ], category);
  }
});

test('engine-app-3: the posted reply for a medium supplier does not claim the MSMED date', async () => {
  const state = msmeBooks();
  const held = propose(state, 'set_supplier_terms', { partyName: 'Mid Size Mills', msme: true, category: 'medium', days: 30 });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Mid Size Mills is recorded as an MSME (medium); agreed terms 30 days. New bills from them carry the pay-by date from the agreed days, as the 45-day rule covers micro and small suppliers only; bills already booked from them are checked against the new terms too.');
});

test('engine-app-2: the preview of plain and unmarked terms says it too', async () => {
  const state = msmeBooks();
  const booked = 'Bills already booked from them are checked against the new terms too.';
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Steel Co', days: 60 }).effects, ['New bills from them get a pay-by date 60 days from the bill date. Nothing is posted.', booked]);
  const marked = await runTool(state, 'set_supplier_terms', { partyName: 'Steel Co', msme: true, category: 'small', days: 30 });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  const unmarked = previewOf(state, 'set_supplier_terms', { partyName: 'Steel Co', msme: false });
  assert.equal(unmarked.summary, 'Steel Co is no longer marked MSME');
  assert.deepEqual(unmarked.effects, ['New bills from them get a pay-by date 30 days from the bill date, without the MSME limit or its reminder. Nothing is posted.', booked]);
});

test('engine-app-4: a staff user cannot mark a supplier as an MSME or set its terms, in the preview, in chat or in the tool, and the owner still can', async () => {
  const sentence = 'Only the owner can mark a supplier as an MSME.';
  const args = { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'small', days: 30 };
  const state = msmeBooks();
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  state.__actor = { userId: 'USR-STAFF', role: 'staff' };
  assert.deepEqual(previewOf(state, 'set_supplier_terms', args).blockers, [sentence]);
  const held = propose(state, 'set_supplier_terms', args);
  assert.equal(held.blocked, true, JSON.stringify(held));
  assert.equal(held.awaitingConfirmation, undefined);
  assert.equal(held.reply, `I did not post anything, because:\n· ${sentence}`);
  const said = await chat(state, 'Fabric Co is MSME, 30 days');
  assert.equal(said.blocked, true, JSON.stringify(said));
  assert.match(said.reply, /Only the owner can mark a supplier as an MSME\./);
  const ran = await runTool(state, 'set_supplier_terms', args);
  assert.equal(ran.ok, false);
  assert.equal(ran.error, 'OWNER_ONLY');
  assert.equal(fmtToolResult('set_supplier_terms', ran), sentence);
  assert.deepEqual(state.supplierTerms, {});
  assert.deepEqual((await runTool(state, 'supplier_dues', { asOf: AS_OF })).data.bills, []);
  assert.deepEqual(previewOf(state, 'set_supplier_bank', { partyName: 'Fabric Co', account: '123456789012', ifsc: 'HDFC0001234' }).blockers, ['Only the owner can record where a supplier is paid.']);
  state.__actor = { userId: 'USR-OWNER', role: 'admin' };
  assert.deepEqual(previewOf(state, 'set_supplier_terms', args).blockers, []);
  const owner = await runTool(state, 'set_supplier_terms', args);
  assert.equal(owner.ok, true, JSON.stringify(owner));
  delete state.__actor;
  assert.equal((await runTool(state, 'set_supplier_terms', { ...args, days: 20 })).ok, true);
});

test('engine-app-5: the payable in the week ahead reads like its reminder, with the amount in rupees', async () => {
  const state = msmeBooks();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: SUPPLIER_GSTIN, msme: true, category: 'small', days: 30 });
  await runTool(state, 'create_purchase', BILL('2026-10-15', 'F-1', 'Fabric Co', 10000));
  await runTool(state, 'set_supplier_terms', { partyName: 'Steel Co', days: 20 });
  await runTool(state, 'create_purchase', { ...BILL('2026-10-25', 'S-1', 'Steel Co', 200), partyGstin: '27AAACS9999A1Z5' });
  const run = await runTool(state, 'run_automation', { asOf: '2026-11-09' });
  assert.equal(run.ok, true, JSON.stringify(run));
  const reminder = msmeReminders(state)[0];
  assert.equal(reminder.text, 'Pay Fabric Co ₹1,05,000.00 on BILL-0001 by 2026-11-14 (MSME limit)');
  const week = await runTool(state, 'week_ahead', { asOf: '2026-11-09' });
  const payables = week.data.items.filter((item) => item.kind === 'payable');
  assert.deepEqual(payables.map((item) => item.title), ['Pay Fabric Co ₹1,05,000.00 on BILL-0001 (MSME)', 'Pay Steel Co ₹2,100.00 on BILL-0002']);
  assert.deepEqual(payables.map((item) => item.amount), [105000, 2100]);
  const said = fmtToolResult('week_ahead', week);
  assert.ok(said.includes('Pay Fabric Co ₹1,05,000.00 on BILL-0001 (MSME)'), said);
  assert.ok(said.includes('Pay Steel Co ₹2,100.00 on BILL-0002'), said);
  assert.doesNotMatch(said, /105000/);
});

test('engine-app-5: the payable uses the books\' own currency', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'TX', gstin: '' };
  state.purchases.push({ id: 'BILL-0001', date: '2026-09-01', partyName: 'Micro Dyes', partyGstin: '', partyState: '', lines: [], taxable: 1000, cgst: 0, sgst: 0, igst: 0, total: 1000, status: 'posted', kind: 'purchase', transferIds: [] });
  await runTool(state, 'set_supplier_terms', { partyName: 'Micro Dyes', days: 30 });
  const week = await runTool(state, 'week_ahead', { asOf: '2026-10-05' });
  assert.deepEqual(week.data.items.filter((item) => item.kind === 'payable').map((item) => item.title), ['Pay Micro Dyes $1,000.00 on BILL-0001']);
});

test('extra: every refusal set_supplier_terms can return reads as a sentence in the preview and in the tool reply, never as a code', async () => {
  const state = msmeBooks();
  const cases = [
    ['SUPPLIER_REQUIRED', {}, 'Say which supplier.'],
    ['BAD_UDYAM', { partyName: 'Fabric Co', udyam: 'UDYAM-12' }, 'A Udyam number looks like UDYAM-XX-00-0000000.'],
    ['BAD_TERMS', { partyName: 'Fabric Co', days: 400 }, 'Agreed days must be a whole number from 0 to 365.'],
    ['BAD_CATEGORY', { partyName: 'Fabric Co', category: 'large' }, 'The category is micro, small or medium.'],
    ['TERMS_EXCEED_MSMED', { partyName: 'Fabric Co', msme: true, days: 60 }, 'An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45.'],
  ];
  for (const [code, args, sentence] of cases) {
    const ran = await runTool(state, 'set_supplier_terms', args);
    assert.equal(ran.ok, false, code);
    assert.equal(ran.error, code);
    assert.equal(fmtToolResult('set_supplier_terms', ran), sentence, code);
    assert.deepEqual(previewOf(state, 'set_supplier_terms', args).blockers, [sentence], code);
  }
  state.__actor = { userId: 'USR-STAFF', role: 'staff' };
  const ran = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 30 });
  assert.equal(ran.error, 'OWNER_ONLY');
  assert.equal(fmtToolResult('set_supplier_terms', ran), 'Only the owner can mark a supplier as an MSME.');
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 30 }).blockers, ['Only the owner can mark a supplier as an MSME.']);
  assert.equal(fmtToolResult('set_supplier_terms', { ok: false, error: 'OWNER_ONLY' }), 'Only the owner can do that.');
});

test('extra: credit notes take credit away in every total, in the rows and in the words', async () => {
  const csv = [
    HEADER,
    'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
    'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
    'CDNRA,27AABCT1332L1ZE,FABRIC CO,CN-8,21-09-2026,-400,0,0,-72,0,-472,Y',
  ].join('\n');
  const state = await statementOnly(csv);
  const data = imsReview(state, { period: PERIOD }).data;
  assert.deepEqual(data.rows.map((row) => [row.section, row.credit]).sort(), [['B2B', 500], ['CDNR', -50], ['CDNRA', -72]]);
  assert.deepEqual(data.credit, { accepted: 0, rejected: 0, pending: 0, undecided: 378 });
  await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.deepEqual(imsReview(state, { period: PERIOD }).data.credit, { accepted: 378, rejected: 0, pending: 0, undecided: 0 });
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [`${PERIOD}|27AABCT1332L1ZE|CN7|CDNR`, `${PERIOD}|27AABCT1332L1ZE|CN8|CDNRA`], decision: 'reject' });
  assert.deepEqual(imsReview(state, { period: PERIOD }).data.credit, { accepted: 500, rejected: -122, pending: 0, undecided: 0 });
  assert.equal(planImsDecision(state, { period: PERIOD, select: 'all', decision: 'pending' }).credit, 378);
});

test('extra: a 2B row matches its bill when every amount is within 1.00 and shows amount differs beyond that', async () => {
  const state = createState();
  purchase(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  const cases = [
    ['10000', '250', 'matched'],
    ['10001', '250', 'matched'],
    ['10001.01', '250', 'amount differs'],
    ['9999', '250', 'matched'],
    ['9998.99', '250', 'amount differs'],
    ['10000', '251', 'matched'],
    ['10000', '251.01', 'amount differs'],
    ['10000', '248.99', 'amount differs'],
  ];
  for (const [taxable, cgst, match] of cases) {
    const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, `B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,${taxable},${cgst},250,0,0,10500,Y`].join('\n') });
    assert.equal(added.ok, true, JSON.stringify(added));
    const [row] = rowsOf(state);
    assert.equal(row.match, match, `${taxable} / ${cgst}`);
    assert.equal(row.suggested, match === 'matched' ? 'accept' : 'pending', `${taxable} / ${cgst}`);
  }
});

test('extra: an amended B2BA row is matched to its bill like a B2B row', async () => {
  const csv = [HEADER, 'B2BA,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y'].join('\n');
  const state = await statementOnly(csv);
  purchase(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  const [row] = rowsOf(state);
  assert.equal(row.section, 'B2BA');
  assert.equal(row.key, `${PERIOD}|27AABCT1332L1ZE|F101|B2BA`);
  assert.equal(row.match, 'matched');
  assert.equal(row.billId, 'BILL-0001');
  assert.equal(row.suggested, 'accept');
});

test('extra: a GSTIN in lower case or with spaces still matches the bill, whichever side holds it', async () => {
  const state = await fabricBooked();
  assert.equal(rowsOf(state).find((row) => row.invoiceNo === 'F-101').match, 'matched');
  state.purchases[0].partyGstin = ' 27aabct1332l1ze ';
  assert.equal(rowsOf(state).find((row) => row.invoiceNo === 'F-101').match, 'matched', 'a lower case GSTIN on the bill');
  state.gstr2b[PERIOD].rows.find((row) => row.invoiceNo === 'F-101').supplierGstin = '  27aabct1332l1ze';
  const fabric = rowsOf(state).find((row) => row.invoiceNo === 'F-101');
  assert.equal(fabric.match, 'matched', 'a padded lower case GSTIN in the statement');
  assert.equal(fabric.key, KEYS.fabric);
  assert.equal(fabric.billId, 'BILL-0001');
});

test('extra: two bills with the same number from one supplier are told apart by their amounts, and the closest is the match', async () => {
  for (const exactFirst of [false, true]) {
    const state = await statementOnly([HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y'].join('\n'));
    purchase(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 9000, 5);
    const other = structuredClone(state.purchases[0]);
    Object.assign(other, { id: 'BILL-0099', taxable: 10000, cgst: 250, sgst: 250, total: 10500 });
    if (exactFirst) state.purchases.unshift(other);
    else state.purchases.push(other);
    const [row] = rowsOf(state);
    assert.equal(row.match, 'matched', `exact bill ${exactFirst ? 'first' : 'last'}`);
    assert.equal(row.billId, 'BILL-0099');
  }
  const state = await statementOnly([HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y'].join('\n'));
  purchase(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 9000, 5);
  const [differs] = rowsOf(state);
  assert.equal(differs.match, 'amount differs');
  assert.equal(differs.billId, 'BILL-0001');
});

test('extra: a statement of exactly 500 invoices is decided in one go with the word all, and 501 is refused', async () => {
  const state = await statementOnly(bigStatement(500));
  const plan = planImsDecision(state, { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 200));
  assert.equal(plan.rows.length, 500);
  const keys = rowsOf(state).map((row) => row.key);
  assert.equal(planImsDecision(state, { period: PERIOD, keys, decision: 'accept' }).rows.length, 500);
  assert.equal(planImsDecision(state, { period: PERIOD, keys: [...keys, `${PERIOD}|27AABCT1332L1ZE|X500|B2B`], decision: 'accept' }).error, 'TOO_MANY_ROWS');
  const done = await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 200));
  assert.equal(done.count, 500);
  assert.equal(Object.keys(state.imsDecisions).length, 500);
  const over = await statementOnly(bigStatement(501));
  assert.equal(planImsDecision(over, { period: PERIOD, select: 'all', decision: 'accept' }).error, 'TOO_MANY_ROWS');
  assert.equal(propose(over, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' }).reply, 'I did not post anything, because:\n· IMS takes up to 500 invoices in one go; pick fewer, or decide in parts.');
  assert.deepEqual(over.imsDecisions, {});
});
