import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { newBook, serializeBook, deserializeBook } from '../src/books.mjs';
import { BOOK_KEYS } from '../src/book-view.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf, CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { propose, confirmPending, chat } from '../src/router.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { toolServesCountry, formatMoneyCurrent } from '../src/country.mjs';
import { assistantTools, validateAssistantToolCall, planLocalToolCall } from '../src/assistant-contract.mjs';
import { REPORT_KEYS, REPORT_SHEETS, reportSheet } from '../src/report-sheets.mjs';
import { IMS_DECISIONS, imsKey, imsReview, planImsDecision, decideIms, imsWords, imsDecidedWords } from '../src/ims.mjs';
import { localToday } from '../src/dates.mjs';

const PERIOD = '2026-09';
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

function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, ...(supplierInvoiceNo ? { supplierInvoiceNo } : {}), lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function books() {
  const state = createState();
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  return state;
}

async function booksWith2b() {
  const state = books();
  const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: TWO_B, fileName: 'GSTR2B_092026.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

const review = (state, period = PERIOD) => imsReview(state, { period }).data;
const byKey = (data, key) => data.rows.find((row) => row.key === key);

test('the row key is the month, the supplier GSTIN, the bill number without punctuation and the section', () => {
  assert.deepEqual(IMS_DECISIONS, ['accept', 'reject', 'pending']);
  assert.equal(imsKey('2026-09', { supplierGstin: ' 27aabct1332l1ze ', invoiceNo: 'f-101/A', section: 'b2b' }), '2026-09|27AABCT1332L1ZE|F101A|B2B');
  assert.equal(imsKey('2026-09', { supplierGstin: '', invoiceNo: 'X1' }), '2026-09||X1|');
});

test('each 2B row says whether the books have the bill, what to do with it, and the sums by decision', async () => {
  const data = review(await booksWith2b());
  assert.equal(data.period, PERIOD);
  assert.deepEqual(data.statement, { fileName: 'GSTR2B_092026.csv', importedOn: localToday(), rows: 5 });
  assert.deepEqual(data.rows.map((row) => row.key), [KEYS.dye, KEYS.fabric, KEYS.note, KEYS.pack, KEYS.thread], 'sorted by supplier, date and number');
  const fabric = byKey(data, KEYS.fabric);
  assert.deepEqual(
    { ...fabric, why: undefined },
    {
      key: KEYS.fabric, section: 'B2B', supplierGstin: '27AABCT1332L1ZE', supplierName: 'FABRIC CO', invoiceNo: 'F-101', invoiceDate: '2026-09-05',
      taxableValue: 10000, cgst: 250, sgst: 250, igst: 0, cess: 0, totalValue: 10500, credit: 500, itcAvailability: 'Y', billId: 'BILL-0001',
      match: 'matched', why: undefined, suggested: 'accept', decision: '', note: '', decidedBy: '', decidedOn: '', lines: 1,
    },
  );
  assert.match(fabric.why, /BILL-0001/);
  const pack = byKey(data, KEYS.pack);
  assert.equal(pack.match, 'amount differs');
  assert.equal(pack.suggested, 'pending');
  assert.equal(pack.billId, 'BILL-0002');
  assert.equal(pack.why, 'The amounts differ: taxable value 6000 in your books, 5000 in 2B; IGST 720 in your books, 600 in 2B.');
  const thread = byKey(data, KEYS.thread);
  assert.equal(thread.match, 'not in books');
  assert.equal(thread.suggested, 'pending');
  assert.equal(thread.billId, '');
  assert.equal(thread.why, 'No purchase bill with this number from this supplier.');
  const dye = byKey(data, KEYS.dye);
  assert.equal(dye.match, 'date differs');
  assert.equal(dye.suggested, 'accept');
  assert.equal(dye.why, 'Your books have this bill dated 2026-09-14; 2B has it dated 2026-09-15.');
  const note = byKey(data, KEYS.note);
  assert.equal(note.section, 'CDNR');
  assert.equal(note.match, 'not in books');
  assert.equal(note.suggested, 'pending');
  assert.equal(note.credit, -50, 'a credit note takes credit away');
  assert.deepEqual(data.counts, { total: 5, accept: 0, reject: 0, pending: 0, undecided: 5 });
  assert.deepEqual(data.credit, { accepted: 0, rejected: 0, pending: 0, undecided: 2370 });
  assert.equal(data.orphaned, 0);
  assert.match(data.note, /GST portal/);
  assert.match(data.note, /Excel/);
});

test('a credit note row is matched to the debit note on the bill by supplier and number, and compared as magnitudes', async () => {
  const state = await booksWith2b();
  const made = await runTool(state, 'create_purchase_note', { billId: 'BILL-0001', amount: 1050, date: '2026-09-18', reason: 'Two rolls returned' });
  assert.equal(made.ok, true, JSON.stringify(made));
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, 'CDNR,27AABCT1332L1ZE,FABRIC CO,F-101,20-09-2026,-1000,-25,-25,0,0,-1050,Y', 'CDNR,29AABCL1234J1ZL,PACK HOUSE,F-101,20-09-2026,1000,0,0,120,0,1120,Y'].join('\n') });
  const data = review(state);
  const rows = data.rows.filter((row) => row.section === 'CDNR');
  const matched = rows.find((row) => row.supplierName === 'FABRIC CO' && row.taxableValue === -1000);
  assert.equal(matched.match, 'matched');
  assert.equal(matched.billId, made.purchaseNote.id);
  assert.equal(matched.suggested, 'accept');
  assert.equal(matched.credit, -50);
  const otherSupplier = rows.find((row) => row.supplierName === 'PACK HOUSE');
  assert.equal(otherSupplier.match, 'not in books', 'another supplier\'s note with the same number is not this one');
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, 'CDNR,27AABCT1332L1ZE,FABRIC CO,F-101,21-09-2026,900,0,0,0,0,900,Y'].join('\n') });
  const differs = review(state).rows.find((row) => row.section === 'CDNR');
  assert.equal(differs.match, 'amount differs');
  assert.equal(differs.suggested, 'pending');
  assert.match(differs.why, /taxable value 1000 in your books, 900 in 2B/);
});

test('with no 2B for the month the review is empty and says so; a bad month is refused', async () => {
  const state = books();
  const empty = review(state);
  assert.equal(empty.statement, null);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.counts, { total: 0, accept: 0, reject: 0, pending: 0, undecided: 0 });
  assert.deepEqual(empty.credit, { accepted: 0, rejected: 0, pending: 0, undecided: 0 });
  assert.equal(imsReview(state, { period: '2026-13' }).error, 'INVALID_PERIOD');
  assert.equal(imsReview(state, { period: 'Sep' }).ok, false);
  const defaulted = await runTool(state, 'ims_review', {});
  assert.equal(defaulted.ok, true);
  assert.equal(defaulted.data.period, localToday().slice(0, 7));
});

test('accepting every matched row is previewed, posts nothing, and records who decided and when', async () => {
  const state = await booksWith2b();
  const ledgerShape = () => JSON.stringify(state.ledger.transfers, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
  const ledgerBefore = ledgerShape();
  state.__actor = { userId: 'owner-1', role: 'admin' };
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(held.preview.summary, 'Mark 2 invoices in IMS for September 2026 as accepted (credit ₹860.00).');
  assert.deepEqual(held.preview.effects, ['Nothing is posted. Take the same decisions on the GST portal\'s IMS; the Excel sheet lists them.']);
  assert.deepEqual(held.preview.figures, { count: 2, credit: 860 });
  assert.deepEqual(state.imsDecisions, {}, 'a preview changes nothing');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(done.reply, 'Marked 2 rows accepted in IMS for September 2026.');
  assert.deepEqual(state.imsDecisions[KEYS.fabric], { decision: 'accept', note: '', by: 'owner-1', on: localToday() });
  assert.deepEqual(Object.keys(state.imsDecisions).sort(), [KEYS.dye, KEYS.fabric].sort());
  assert.equal(ledgerShape(), ledgerBefore, 'the ledger is untouched');
  const data = review(state);
  assert.deepEqual(data.counts, { total: 5, accept: 2, reject: 0, pending: 0, undecided: 3 });
  assert.deepEqual(data.credit, { accepted: 860, rejected: 0, pending: 0, undecided: 1510 });
  const fabric = byKey(data, KEYS.fabric);
  assert.equal(fabric.decision, 'accept');
  assert.equal(fabric.decidedBy, 'owner-1');
  assert.equal(fabric.decidedOn, localToday());
  const anonymous = await booksWith2b();
  await runTool(anonymous, 'ims_decide', { period: PERIOD, keys: [KEYS.thread], decision: 'pending' });
  assert.equal(anonymous.imsDecisions[KEYS.thread].by, 'renderer');
});

test('one row can be rejected with a note, changed, and cleared; the one-row preview names the supplier and bill', async () => {
  const state = await booksWith2b();
  const preview = previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'reject', note: 'Wrong rate, supplier to amend' });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.summary, 'Mark PACK HOUSE PH-9 as rejected in IMS for 2026-09.');
  assert.deepEqual(preview.figures, { count: 1, credit: 600 });
  const out = await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'reject', note: ' Wrong rate, supplier to amend ' });
  assert.deepEqual(out, { ok: true, period: PERIOD, decision: 'reject', count: 1, credit: 600, keys: [KEYS.pack] });
  const row = byKey(review(state), KEYS.pack);
  assert.equal(row.decision, 'reject');
  assert.equal(row.note, 'Wrong rate, supplier to amend');
  assert.deepEqual(review(state).credit, { accepted: 0, rejected: 600, pending: 0, undecided: 1770 });
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'pending' });
  assert.equal(byKey(review(state), KEYS.pack).decision, 'pending');
  assert.equal(byKey(review(state), KEYS.pack).note, '');
  assert.match(previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'clear' }).summary, /as not decided/);
  const cleared = await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'clear' });
  assert.equal(cleared.count, 1);
  assert.deepEqual(state.imsDecisions, {}, 'clearing removes the decision rather than storing a blank one');
  assert.equal(byKey(review(state), KEYS.pack).decision, '');
});

test('the preview says when a decision already held on a picked row would be replaced', async () => {
  const state = await booksWith2b();
  const base = 'Nothing is posted. Take the same decisions on the GST portal\'s IMS; the Excel sheet lists them.';
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.fabric], decision: 'reject', note: 'Returned' });
  const bulk = previewOf(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.deepEqual(bulk.effects, [base, '1 of them already has a different decision, which this replaces.']);
  const alone = previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.fabric], decision: 'accept' });
  assert.deepEqual(alone.effects, [base, 'It already has a different decision, which this replaces.']);
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.fabric], decision: 'reject' }).effects, [base], 'the same decision again replaces nothing');
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.fabric], decision: 'clear' }).effects, [base], 'clearing says so in the summary');
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'accept' }).effects, [base], 'a row with no decision replaces nothing');
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.dye], decision: 'pending' });
  const two = previewOf(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.deepEqual(two.effects, [base, '2 of them already have a different decision, which this replaces.']);
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  assert.deepEqual(held.preview.effects, two.effects, 'the held preview carries the same warning');
});

test('rows are picked by key or by a word: matched, suggested, undecided, all; keys win over a word; nothing picked is refused', async () => {
  const state = await booksWith2b();
  const pick = (args) => planImsDecision(state, { period: PERIOD, decision: 'accept', ...args });
  assert.deepEqual(pick({ select: 'matched' }).rows.map((row) => row.key), [KEYS.dye, KEYS.fabric]);
  assert.deepEqual(pick({ select: 'suggested' }).rows.map((row) => row.key), [KEYS.dye, KEYS.fabric], 'suggested means the suggestion is the decision being made');
  assert.deepEqual(planImsDecision(state, { period: PERIOD, decision: 'pending', select: 'suggested' }).rows.map((row) => row.key), [KEYS.note, KEYS.pack, KEYS.thread]);
  assert.equal(planImsDecision(state, { period: PERIOD, decision: 'reject', select: 'suggested' }).error, 'NO_MATCH');
  assert.equal(pick({ select: 'all' }).rows.length, 5);
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.thread, KEYS.pack], decision: 'pending' });
  assert.deepEqual(pick({ select: 'undecided' }).rows.map((row) => row.key), [KEYS.dye, KEYS.fabric, KEYS.note]);
  const both = pick({ keys: [KEYS.thread], select: 'all' });
  assert.deepEqual(both.rows, [{ key: KEYS.thread, supplierName: 'THREAD LTD', invoiceNo: 'T-55', credit: 960 }]);
  assert.equal(both.credit, 960);
  assert.equal(both.decision, 'accept');
  assert.equal(both.note, '');
  assert.equal(both.ok, true);
  assert.deepEqual(pick({ keys: [KEYS.thread, KEYS.thread] }).rows.length, 1, 'a key named twice counts once');
  assert.equal(pick({}).error, 'NO_ROWS');
  assert.equal(pick({ keys: [] }).error, 'NO_ROWS');
  assert.equal(pick({ select: 'nonsense' }).error, 'NO_ROWS');
});

test('refusals: unknown row, no 2B, bad decision, too many rows, long note, bad month', async () => {
  const state = await booksWith2b();
  const bogus = planImsDecision(state, { period: PERIOD, keys: [KEYS.thread, `${PERIOD}|NOPE|X|B2B`], decision: 'accept' });
  assert.equal(bogus.ok, false);
  assert.equal(bogus.error, 'ROW_NOT_FOUND');
  assert.equal(bogus.key, `${PERIOD}|NOPE|X|B2B`);
  assert.equal((await runTool(state, 'ims_decide', { period: '2026-08', select: 'all', decision: 'accept' })).error, 'NO_STATEMENT');
  assert.equal((await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'maybe' })).error, 'BAD_DECISION');
  assert.equal((await runTool(state, 'ims_decide', { period: PERIOD, select: 'all' })).error, 'BAD_DECISION');
  assert.equal((await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.thread], decision: 'accept', note: 'x'.repeat(201) })).error, 'NOTE_TOO_LONG');
  assert.equal((await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.thread], decision: 'accept', note: 'x'.repeat(200) })).ok, true);
  assert.equal((await runTool(state, 'ims_decide', { period: '2026-13', select: 'all', decision: 'accept' })).error, 'INVALID_PERIOD');
  assert.equal((await runTool(state, 'ims_decide', { select: 'all', decision: 'accept' })).error, 'INVALID_PERIOD');
  const manyKeys = Array.from({ length: 501 }, (_, i) => `${PERIOD}|27AABCT1332L1ZE|K${i}|B2B`);
  assert.equal((await runTool(state, 'ims_decide', { period: PERIOD, keys: manyKeys, decision: 'accept' })).error, 'TOO_MANY_ROWS');
  const big = [HEADER, ...Array.from({ length: 501 }, (_, i) => `B2B,27AABCT1332L1ZE,FABRIC CO,X-${i},05-09-2026,100,2.5,2.5,0,0,105,Y`)].join('\n');
  await runTool(state, 'import_gstr2b', { period: '2026-08', csv: big });
  assert.equal((await runTool(state, 'ims_decide', { period: '2026-08', select: 'all', decision: 'accept' })).error, 'TOO_MANY_ROWS');
  assert.equal((await runTool(state, 'ims_decide', { period: '2026-08', select: 'undecided', decision: 'accept' })).error, 'TOO_MANY_ROWS');
  assert.deepEqual(Object.keys(state.imsDecisions), [KEYS.thread], 'a refused decision changes nothing');
});

test('every refusal reaches the user as a sentence in the preview, never as a code', async () => {
  const state = await booksWith2b();
  const blocked = (args) => previewOf(state, 'ims_decide', args).blockers;
  assert.deepEqual(blocked({ period: '2026-08', select: 'all', decision: 'accept' }), ['Add the GSTR-2B for that month first.']);
  assert.deepEqual(blocked({ period: PERIOD, select: 'all', decision: 'maybe' }), ['Say accept, reject or pending.']);
  assert.deepEqual(blocked({ period: PERIOD, decision: 'accept' }), ['Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject DYE WORKS in IMS for 2026-09".']);
  assert.deepEqual(blocked({ period: PERIOD, keys: [`${PERIOD}|NOPE|X|B2B`], decision: 'accept' }), ['One of those invoices is not in the GSTR-2B for that month.']);
  assert.deepEqual(blocked({ period: PERIOD, keys: [KEYS.pack], decision: 'accept', note: 'x'.repeat(201) }), ['Keep the note to 200 characters or fewer.']);
  assert.deepEqual(blocked({ period: 'soon', select: 'all', decision: 'accept' }), ['Say the month as YYYY-MM, for example 2026-10.']);
  assert.deepEqual(blocked({ period: PERIOD, keys: Array.from({ length: 501 }, (_, i) => `k${i}`), decision: 'accept' }), ['IMS takes up to 500 invoices in one go; pick fewer, or decide in parts.']);
  const router = readFileSync(fileURLToPath(new URL('../src/router.mjs', import.meta.url)), 'utf8');
  for (const code of ['NO_STATEMENT', 'BAD_DECISION', 'ROW_NOT_FOUND', 'TOO_MANY_ROWS', 'NOTE_TOO_LONG']) {
    assert.match(router, new RegExp(`\\n  ${code}: \\(`), `${code} has a sentence in FAILURES`);
  }
  const held = propose(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true);
  delete state.gstr2b[PERIOD];
  const late = await confirmPending(state, held.preview.token);
  assert.equal(late.posted, false);
  assert.equal(late.reply, 'Add the GSTR-2B for that month first.');
});

test('importing the same month again keeps the decisions; a decision whose row went away is counted as orphaned and comes back with the row', async () => {
  const state = await booksWith2b();
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.fabric, KEYS.thread], decision: 'accept', note: 'checked' });
  const again = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: TWO_B, fileName: 'again.csv' });
  assert.equal(again.replaced, true);
  let data = review(state);
  assert.equal(byKey(data, KEYS.fabric).decision, 'accept');
  assert.equal(byKey(data, KEYS.fabric).note, 'checked');
  assert.equal(data.statement.fileName, 'again.csv');
  assert.equal(data.orphaned, 0);
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: TWO_B.split('\n').filter((line) => !line.includes('T-55')).join('\n') });
  data = review(state);
  assert.equal(data.rows.length, 4);
  assert.equal(data.orphaned, 1);
  assert.equal(data.counts.accept, 1);
  assert.equal(state.imsDecisions[KEYS.thread].decision, 'accept', 'the decision itself is kept');
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: TWO_B });
  data = review(state);
  assert.equal(data.orphaned, 0);
  assert.equal(byKey(data, KEYS.thread).decision, 'accept');
  assert.equal(imsReview(state, { period: '2026-08' }).data.orphaned, 0, 'decisions of another month are not this month\'s');
  await runTool(state, 'import_gstr2b', { period: '2026-08', csv: [HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-08-2026,10000,250,250,0,0,10500,Y'].join('\n') });
  assert.equal(byKey(review(state, '2026-08'), `2026-08|27AABCT1332L1ZE|F101|B2B`).decision, '', 'the same bill in another month is its own row');
});

test('decisions survive saving and loading, for the whole state and for one book; an old save without them loads empty', async () => {
  const state = await booksWith2b();
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'reject', note: 'rate' });
  assert.deepEqual(createState().imsDecisions, {});
  assert.deepEqual(newBook().imsDecisions, {});
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(back.imsDecisions, state.imsDecisions);
  assert.equal(byKey(review(back), KEYS.pack).decision, 'reject');
  const book = deserializeBook(JSON.parse(JSON.stringify(serializeBook({ ...newBook(), imsDecisions: state.imsDecisions }))));
  assert.deepEqual(book.imsDecisions, state.imsDecisions);
  const raw = JSON.parse(JSON.stringify(serialize(state)));
  delete raw.imsDecisions;
  assert.deepEqual(deserialize(raw).imsDecisions, {});
  raw.imsDecisions = 'broken';
  assert.deepEqual(deserialize(raw).imsDecisions, {});
  assert.equal(BOOK_KEYS.has('imsDecisions'), true);
});

test('the chat words for a review list the counts, the credit and up to eight rows still to decide', async () => {
  const state = await booksWith2b();
  const money = (n) => formatMoneyCurrent(n);
  const words = imsWords(review(state), money);
  const lines = words.split('\n');
  assert.equal(lines[0], 'IMS for 2026-09: 5 rows, 0 accepted, 0 rejected, 0 pending, 5 not decided; credit accepted ₹0.00, undecided ₹2,370.00.');
  assert.equal(lines[1], '· DYE WORKS DW-3 ₹360.00: date differs, suggest accept');
  assert.equal(lines[3], '· FABRIC CO CN-7 -₹50.00: not in books, suggest pending');
  assert.equal(lines.length, 6);
  await runTool(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  const after = imsWords(review(state), money).split('\n');
  assert.equal(after[0], 'IMS for 2026-09: 5 rows, 2 accepted, 0 rejected, 0 pending, 3 not decided; credit accepted ₹860.00, undecided ₹1,510.00.');
  assert.equal(after.length, 4, 'decided rows are not listed again');
  const big = [HEADER, ...Array.from({ length: 11 }, (_, i) => `B2B,27AABCT1332L1ZE,FABRIC CO,Y-${i},05-09-2026,100,2.5,2.5,0,0,105,Y`)].join('\n');
  await runTool(state, 'import_gstr2b', { period: '2026-08', csv: big });
  const many = imsWords(review(state, '2026-08'), money).split('\n');
  assert.equal(many.filter((line) => line.startsWith('· ')).length, 8);
  assert.equal(many.at(-1), '… and 3 more.');
  assert.match(imsWords(review(books()), money), /^Add the GSTR-2B for 2026-09 first/);
  const answer = await chat(state, 'ims for 2026-09');
  assert.match(answer.reply, /^IMS for September 2026: 5 rows, 2 accepted/);
  const none = await chat(books(), 'ims for 2026-09');
  assert.match(none.reply, /Add the GSTR-2B for September 2026 first/);
});

test('the tools are registered in the places that gate them', () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(names.indexOf('ims_review'), names.indexOf('credit_at_risk') + 1);
  assert.equal(names.indexOf('ims_decide'), names.indexOf('credit_at_risk') + 2);
  assert.equal(names.indexOf('export_xlsx'), names.indexOf('export_tally') + 1);
  assert.deepEqual(TOOLS.find((tool) => tool.name === 'ims_review').args, ['period']);
  assert.deepEqual(TOOLS.find((tool) => tool.name === 'ims_decide').args, ['period', 'keys', 'select', 'decision', 'note']);
  assert.match(TOOLS.find((tool) => tool.name === 'ims_review').description, /Read-only\.$/);
  const catalog = Object.fromEntries(assistantTools(TOOLS).map((tool) => [tool.name, tool]));
  assert.equal(catalog.ims_review.risk, 'read_only');
  assert.equal(catalog.ims_decide.risk, 'writes_books');
  assert.equal(catalog.credit_at_risk.risk, 'read_only');
  assert.deepEqual(catalog.ims_decide.parameters.properties.decision.enum, ['accept', 'reject', 'pending', 'clear']);
  assert.deepEqual(catalog.ims_decide.parameters.properties.select.enum, ['matched', 'suggested', 'undecided', 'all']);
  assert.equal(catalog.ims_decide.parameters.properties.keys.maxItems, 500);
  assert.equal(catalog.ims_decide.parameters.properties.keys.items.maxLength, 120);
  assert.equal(catalog.ims_decide.parameters.properties.note.maxLength, 200);

  assert.equal(validateAssistantToolCall('ims_review', {}).ok, true);
  assert.equal(validateAssistantToolCall('ims_review', { period: '2026-10' }).ok, true);
  assert.equal(validateAssistantToolCall('ims_review', { period: '2026-13' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_review', { period: '2026-10', extra: 1 }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', select: 'matched', decision: 'accept' }).ok, true);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', keys: ['k'], decision: 'clear', note: 'ok' }).ok, true);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', select: 'matched', decision: 'maybe' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', select: 'some', decision: 'accept' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { select: 'all', decision: 'accept' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', select: 'all' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', keys: Array.from({ length: 501 }, () => 'k'), decision: 'accept' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', keys: Array.from({ length: 500 }, () => 'k'), decision: 'accept' }).ok, true);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', keys: ['k'.repeat(121)], decision: 'accept' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', keys: [1], decision: 'accept' }).ok, false);
  assert.equal(validateAssistantToolCall('ims_decide', { period: '2026-10', select: 'all', decision: 'accept', note: 'x'.repeat(201) }).ok, false);

  assert.equal(isRemoteQuery('ims_review'), true);
  assert.equal(isRemoteQuery('ims_decide'), false);
  assert.equal(CONFIRM_TOOLS.has('ims_decide'), true);
  assert.equal(CONFIRM_TOOLS.has('ims_review'), false);
  const cloud = readFileSync(fileURLToPath(new URL('../../cloud/src/api.mjs', import.meta.url)), 'utf8');
  const listed = cloud.match(/export const PROPOSABLE = new Set\(\[([^\]]*)\]\)/);
  const proposable = new Set([...listed[1].matchAll(/'([^']+)'/g)].map((hit) => hit[1]));
  assert.equal(proposable.has('ims_decide'), true, 'the hosted app may propose it');
  assert.equal(proposable.has('ims_review'), false, 'a read is a query, not a proposal');
  assert.equal(toolServesCountry('ims_review', 'IN'), true);
  assert.equal(toolServesCountry('ims_decide', 'IN'), true);
  assert.equal(toolServesCountry('ims_review', 'US'), false);
  assert.equal(toolServesCountry('ims_decide', 'US'), false);
  assert.equal(REPORT_KEYS.indexOf('ims_review'), REPORT_KEYS.indexOf('credit_at_risk') + 1);
});

test('a US business is refused both tools', async () => {
  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  const read = await runTool(us, 'ims_review', { period: PERIOD });
  assert.equal(read.error, 'NOT_FOR_COUNTRY');
  assert.equal(read.country, 'US');
  assert.equal((await runTool(us, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' })).error, 'NOT_FOR_COUNTRY');
  assert.equal(reportSheet(us, 'ims_review', {}).error, 'NOT_FOR_COUNTRY');
});

test('chat: a review, a bulk decision and an Excel request each reach their own tool before the 2B reconciliation route', async () => {
  const state = createState();
  const plan = (sentence) => planLocalToolCall(state, sentence);
  assert.deepEqual(plan('ims for 2026-10'), { kind: 'tool', name: 'ims_review', args: { period: '2026-10' } });
  assert.deepEqual(plan('show the invoice management system for 2026-10'), { kind: 'tool', name: 'ims_review', args: { period: '2026-10' } });
  assert.deepEqual(plan('accept all matched invoices in ims for 2026-10'), { kind: 'tool', name: 'ims_decide', args: { period: '2026-10', select: 'matched', decision: 'accept' } });
  assert.deepEqual(plan('reject every undecided invoice in IMS for 2026-10'), { kind: 'tool', name: 'ims_decide', args: { period: '2026-10', select: 'undecided', decision: 'reject' } });
  assert.deepEqual(plan('keep all suggested ims rows pending for 2026-10'), { kind: 'tool', name: 'ims_decide', args: { period: '2026-10', select: 'suggested', decision: 'pending' } });
  const filed = createState();
  await runTool(filed, 'import_gstr2b', { period: '2026-10', csv: TWO_B });
  assert.deepEqual(planLocalToolCall(filed, 'ims in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period: '2026-10' } });
  assert.deepEqual(planLocalToolCall(filed, 'save ims for 2026-10 as an excel sheet'), { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period: '2026-10' } });
  assert.equal(plan('2b in excel').args.report, 'credit_at_risk', 'the older 2B sheet keeps its words');
  const noPeriod = plan('accept all matched 2B rows in IMS');
  assert.equal(noPeriod.name, 'ims_decide', 'not the 2B reconciliation');
  assert.deepEqual(noPeriod.args, { period: localToday().slice(0, 7), select: 'matched', decision: 'accept' });
  assert.deepEqual(plan('ims'), { kind: 'tool', name: 'ims_review', args: {} });
  assert.equal(plan('how many invoices are pending in ims?').name, 'ims_review', 'a question never decides');
  assert.equal(plan('should I accept all matched invoices in ims for 2026-10?').name, 'ims_review');
  assert.equal(plan('which ims rows are rejected').name, 'ims_review');
  assert.notEqual(plan('do not accept all matched invoices in ims').name, 'ims_decide');
  assert.notEqual(plan('do not accept all matched invoices in ims').name, 'ims_review');
  const both = plan('accept all matched and reject all undecided in ims');
  assert.equal(both.kind, 'reply');
  assert.match(both.reply, /one decision at a time/);
  assert.equal(plan('reconcile 2B').name, 'gst_reconcile', 'the old route is untouched');
  assert.notEqual(plan('credit at risk for 2026-09').name, 'ims_review');

  await runTool(state, 'import_gstr2b', { period: '2026-07', csv: TWO_B });
  await runTool(state, 'import_gstr2b', { period: '2026-08', csv: TWO_B });
  assert.deepEqual(plan('ims'), { kind: 'tool', name: 'ims_review', args: { period: '2026-08' } }, 'the latest month with a 2B');
  assert.deepEqual(plan('accept all matched invoices in ims').args, { period: '2026-08', select: 'matched', decision: 'accept' });
  assert.deepEqual(plan('ims for july').args, { period: `${localToday().slice(0, 4) - (localToday().slice(5, 7) > '07' ? 0 : 1)}-07` });
});

test('chat: the IMS words do not take over a posting sentence, a US business, or a sentence about rows that are not matched', async () => {
  const state = createState();
  const plan = (sentence) => planLocalToolCall(state, sentence);
  const ims = (sentence) => ['ims_review', 'ims_decide'].includes(plan(sentence).name);
  assert.equal(ims('invoice IMS Traders 5000 GST 18%'), false, 'an amount means a posting');
  assert.equal(ims('paid 3000 to IMS Traders'), false);
  assert.equal(ims('bill from IMS Traders 5000 GST 18%'), false);
  state.parties.push({ name: 'IMS Traders' });
  assert.equal(ims('paid IMS Traders in full'), false, 'a customer or supplier called IMS is theirs');
  assert.equal(ims('ims in full'), true);
  assert.deepEqual(plan('reject all not matched invoices in ims for 2026-10'), { kind: 'tool', name: 'ims_review', args: { period: '2026-10' } }, 'never the opposite rows');
  assert.equal(plan('accept all unmatched invoices in ims').name, 'ims_review');
  assert.deepEqual(plan('accept all not decided invoices in ims for 2026-10').args, { period: '2026-10', select: 'undecided', decision: 'accept' });
  assert.deepEqual(plan('mark all matched invoices in ims as accepted for 2026-10').args, { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.equal(plan('accept the invoices in ims').name, 'ims_review', 'a decision with no rows named only looks');
  const today = localToday();
  const [year, month] = today.split('-').map(Number);
  assert.deepEqual(plan('ims for this month').args, { period: today.slice(0, 7) });
  assert.deepEqual(plan('ims for last month').args, { period: month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}` });
  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  assert.equal(['ims_review', 'ims_decide'].includes(planLocalToolCall(us, 'ims for 2026-10').name), false);
  assert.deepEqual(previewOf(us, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' }).blockers, ['IMS is part of the GST portal, so it is for businesses in India.']);
});

test('the words after a decision count one row in the singular and say what clearing means', async () => {
  const state = await booksWith2b();
  const done = await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'reject' });
  assert.equal(imsDecidedWords(done), 'Marked 1 row rejected in IMS for 2026-09.');
  const cleared = await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'clear' });
  assert.equal(imsDecidedWords(cleared), 'Cleared the decision on 1 row in IMS for 2026-09; it is not decided again.');
  const many = await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'pending' });
  assert.equal(imsDecidedWords(many), 'Marked 5 rows pending in IMS for 2026-09.');
  assert.equal(imsDecidedWords(await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'clear' })), 'Cleared the decision on 5 rows in IMS for 2026-09; they are not decided again.');
  assert.deepEqual(state.imsDecisions, {});
});

test('two rows with the same month, supplier, number and section share one decision, and a row with no supplier GSTIN is never matched to a bill', async () => {
  const state = books();
  const csv = [HEADER, 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y', 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,06-09-2026,10000,250,250,0,0,10500,Y', 'B2B,,UNKNOWN SELLER,F-101,05-09-2026,10000,250,250,0,0,10500,Y'].join('\n');
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv });
  const data = review(state);
  assert.equal(data.rows.length, 2, 'the twin rows come back as one row');
  const twins = data.rows.filter((row) => row.supplierName === 'FABRIC CO');
  assert.equal(twins.length, 1);
  assert.equal(twins[0].lines, 2);
  const plan = planImsDecision(state, { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(plan.rows.length, 2, 'the twin rows are one decision');
  const done = await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(done.count, 2);
  const after = review(state);
  assert.deepEqual(after.rows.map((row) => row.decision), ['accept', 'accept']);
  const blank = after.rows.find((row) => row.supplierName === 'UNKNOWN SELLER');
  assert.equal(blank.match, 'not in books');
  assert.equal(blank.billId, '');
});

test('chat: the bulk decision is previewed and confirmed with yes, and "no" leaves everything as it was', async () => {
  const state = await booksWith2b();
  const asked = await chat(state, 'accept all matched invoices in ims for 2026-09');
  assert.equal(asked.awaitingConfirmation, true, asked.reply);
  assert.match(asked.reply, /Mark 2 invoices in IMS for September 2026 as accepted \(credit ₹860\.00\)/);
  assert.deepEqual(state.imsDecisions, {});
  const no = await chat(state, 'no');
  assert.equal(no.posted, false);
  assert.deepEqual(state.imsDecisions, {});
  await chat(state, 'accept all matched invoices in ims for 2026-09');
  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true, yes.reply);
  assert.equal(yes.reply, 'Marked 2 rows accepted in IMS for September 2026.');
  assert.equal(Object.keys(state.imsDecisions).length, 2);
  const lone = await chat(state, 'accept all matched invoices in ims for 2025-01');
  assert.equal(lone.posted, false);
  assert.equal(lone.blocked, true);
  assert.match(lone.reply, /Add the GSTR-2B for that month first/);
});

test('Excel: the IMS sheet builds on fresh books and carries every row with its match, suggestion and decision', async () => {
  const fresh = createState();
  const empty = reportSheet(fresh, 'ims_review', {});
  assert.equal(empty.ok, true, JSON.stringify(empty));
  assert.equal(empty.data.fileName, `myca-ims-review-${localToday().slice(0, 7)}.xlsx`);
  assert.deepEqual(empty.data.sheets, [{ name: 'IMS', rows: 0 }]);
  assert.equal(empty.data.title, 'IMS decisions');
  assert.equal(REPORT_SHEETS.ims_review.country, 'IN');

  const state = await booksWith2b();
  state.__actor = { userId: 'owner-1', role: 'admin' };
  await runTool(state, 'ims_decide', { period: PERIOD, keys: [KEYS.pack], decision: 'reject', note: 'Wrong rate' });
  await runTool(state, 'ims_decide', { period: PERIOD, select: 'matched', decision: 'accept' });
  const out = reportSheet(state, 'ims_review', { period: PERIOD });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.fileName, 'myca-ims-review-2026-09.xlsx');
  assert.equal(out.data.period, '2026-09');
  assert.deepEqual(out.data.sheets, [{ name: 'IMS', rows: 5 }]);
  assert.equal(out.data.rows, 5);
  const built = REPORT_SHEETS.ims_review.build(state, { period: PERIOD }, '2026-11-06');
  const [sheet] = built.sheets;
  assert.equal(sheet.name, 'IMS');
  assert.deepEqual(sheet.header, ['Section', 'Supplier GSTIN', 'Supplier', 'Invoice no', 'Invoice date', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total', 'ITC', 'In books', 'Match', 'Suggested', 'Decision', 'Note', 'Decided by', 'Decided on']);
  assert.equal(built.tag, PERIOD);
  const today = localToday();
  assert.deepEqual(sheet.rows[0], ['B2B', '27AAACD1111A1Z5', 'DYE WORKS', 'DW-3', '2026-09-15', 2000, 180, 180, 0, 0, 2360, 360, 'BILL-0003', 'Date differs', 'Accept', 'Accept', '', 'owner-1', today]);
  assert.deepEqual(sheet.rows[3], ['B2B', '29AABCL1234J1ZL', 'PACK HOUSE', 'PH-9', '2026-09-10', 5000, 0, 0, 600, 0, 5600, 600, 'BILL-0002', 'Amount differs', 'Pending', 'Reject', 'Wrong rate', 'owner-1', today]);
  assert.deepEqual(sheet.rows[4], ['B2B', '33AAACZ1234F1Z5', 'THREAD LTD', 'T-55', '2026-09-11', 8000, 0, 0, 960, 0, 8960, 960, '', 'Not in books', 'Pending', '', '', '', '']);
  assert.deepEqual(sheet.rows[2].slice(0, 4), ['CDNR', '27AABCT1332L1ZE', 'FABRIC CO', 'CN-7']);
  assert.equal(reportSheet(state, 'ims_review', { period: 'this-quarter' }).error, 'MONTH_REQUIRED');
  assert.equal(reportSheet(state, 'ims_review', { period: '2026-05' }).data.rows, 0, 'a month with no 2B is a header-only sheet');
});

test('ims_review and the Excel sheet agree through the export_xlsx tool and its schema', async () => {
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'ims_review', period: '2026-09' }).ok, true);
  const state = await booksWith2b();
  const out = await runTool(state, 'export_xlsx', { report: 'ims_review', period: PERIOD });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.report, 'ims_review');
  assert.equal(out.data.rows, review(state).rows.length);
});
