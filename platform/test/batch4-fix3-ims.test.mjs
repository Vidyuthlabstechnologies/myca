import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase, invoicesToSalesCsv } from '../src/invoice.mjs';
import { purchaseRegisterCsv } from '../src/post-import.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending } from '../src/router.mjs';
import { IMS_MAX_KEY, imsKey, imsReview, planImsDecision } from '../src/ims.mjs';
import { normNumber } from '../src/gstr2b-check.mjs';
import { planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { gst } from '../src/sprint-load.mjs';

const PERIOD = '2026-09';
const AS_OF = '2026-11-06';
const GSTIN = '27AABCT1332L1ZE';
const PACK_GSTIN = '29AABCL1234J1ZL';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const fixture = (name) => readFileSync(fileURLToPath(new URL(`../../sprints/sprint-3-gst-recon/test/fixtures/${name}`, import.meta.url)), 'utf8');
const GSTR3B = fixture('gstr3b.csv');
const sheet = (...lines) => [HEADER, ...lines].join('\n');

const FIRST_RATE = 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y';
const SECOND_RATE = 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,4000,360,360,0,0,4720,Y';
const SHORT_SECOND_RATE = 'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,3000,270,270,0,0,3540,Y';
const TWO_RATE_2B = sheet(FIRST_RATE, SECOND_RATE);
const SHORT_2B = sheet(FIRST_RATE, SHORT_SECOND_RATE);

function purchase(state, partyName, partyGstin, supplierInvoiceNo, date, lines) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: lines.map(([rate, gstRate]) => ({ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate })) });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

async function statement(state, csv, period = PERIOD) {
  const added = await runTool(state, 'import_gstr2b', { period, csv, fileName: 'GSTR2B.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

async function twoRateBooks(csv) {
  const state = createState();
  const bill = purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5], [4000, 18]]);
  assert.deepEqual([bill.taxable, bill.cgst, bill.sgst, bill.total], [14000, 610, 610, 15220]);
  await statement(state, csv);
  return { state, bill };
}

const atRisk = async (state) => (await runTool(state, 'credit_at_risk', { period: PERIOD })).data;
const reconcileWith = async (state, gstr2b) => (await runTool(state, 'gst_reconcile', { gstr2b, gstr3b: GSTR3B, asOfDate: AS_OF })).data;
const reviewRows = (state, period = PERIOD) => imsReview(state, { period }).data.rows;
const codes = (data) => data.issues.map((issue) => issue.code);
const TWO_B_CODES = new Set(['INVOICE_NOT_IN_2B', 'IN_2B_NOT_BOOKED', 'AMOUNT_MISMATCH', 'TAX_TYPE_MISMATCH', 'ITC_NOT_IN_2B', 'ITC_NOT_AVAILABLE', 'UNCLAIMED_ITC', 'CREDIT_NOTE_NOT_BOOKED', 'CREDIT_NOTE_NOT_IN_2B']);

function sprintReconcile(state, gstr2bText) {
  return gst.reconcile(
    { purchaseRegisterText: purchaseRegisterCsv(state.purchases), gstr2bText, gstr1Text: invoicesToSalesCsv(state.invoices), gstr3bText: GSTR3B },
    { clientGstin: state.company.gstin, asOfDate: AS_OF, supplierFilings: undefined },
  );
}

test('G1: a two-rate invoice booked as one bill reads as matched in credit_at_risk, gst_reconcile, the exceptions queue and ims_review alike', async () => {
  const { state, bill } = await twoRateBooks(TWO_RATE_2B);
  const risk = await atRisk(state);
  assert.deepEqual(risk.risks, [], JSON.stringify(risk.risks));
  assert.deepEqual([risk.creditInBooks, risk.creditMatched, risk.creditAtRisk], [1220, 1220, 0]);
  assert.deepEqual(risk.notBooked, []);
  const [row] = reviewRows(state);
  assert.equal(row.match, 'matched');
  assert.equal(row.billId, bill.id);
  assert.equal(row.lines, 2);
  const recon = await reconcileWith(state, TWO_RATE_2B);
  assert.deepEqual(
    [recon.summary.purchaseInvoices, recon.summary.b2bInvoices, recon.summary.matchedInvoices, recon.summary.amountMismatches, recon.summary.invoicesInBooksNotIn2B, recon.summary.invoicesIn2BNotInBooks],
    [1, 1, 1, 0, 0, 0],
  );
  assert.deepEqual(codes(recon).filter((code) => TWO_B_CODES.has(code)), [], JSON.stringify(recon.issues));
  assert.equal(recon.summary.itcAvailable, 1220);
  assert.equal(recon.summary.itcEligible, 1220);
  assert.equal(recon.match.matched.length, 1);
  assert.deepEqual(
    ['taxableValue', 'cgst', 'sgst', 'totalValue'].map((head) => recon.match.matched[0].invoice[head]),
    [14000, 610, 610, 15220],
    'the document the books are compared with carries the added-up lines',
  );
  state.files.gstr2b = TWO_RATE_2B;
  state.files.gstr3b = GSTR3B;
  const queue = await runTool(state, 'exceptions', { asOfDate: AS_OF });
  assert.equal(queue.data.reconciled, true);
  assert.deepEqual(queue.data.exceptions.filter((item) => item.source === 'gstr2b').map((item) => item.key), [], JSON.stringify(queue.data.exceptions));
});

test('G1: an amount that really differs is still flagged, with the same figures and words in credit_at_risk, gst_reconcile and ims_review', async () => {
  const { state } = await twoRateBooks(SHORT_2B);
  const why = 'The amounts differ: taxable value 14000 in your books, 13000 in 2B; CGST 610 in your books, 520 in 2B; SGST 610 in your books, 520 in 2B.';
  const risk = await atRisk(state);
  assert.equal(risk.risks.length, 1, JSON.stringify(risk.risks));
  assert.equal(risk.risks[0].reason, 'AMOUNT_DIFFERS');
  assert.equal(risk.risks[0].why, why);
  assert.equal(risk.risks[0].credit, 1220);
  assert.equal(risk.risks[0].credit2b, 1040);
  assert.deepEqual([risk.creditMatched, risk.creditAtRisk], [0, 1220]);
  const [row] = reviewRows(state);
  assert.equal(row.match, 'amount differs');
  assert.equal(row.why, why);
  assert.equal(row.credit, 1040);
  const recon = await reconcileWith(state, SHORT_2B);
  assert.equal(recon.summary.amountMismatches, 1);
  assert.equal(recon.summary.invoicesIn2BNotInBooks, 0, 'no left-over line of the same invoice');
  const issue = recon.issues.find((item) => item.code === 'AMOUNT_MISMATCH');
  assert.equal(issue.message, 'F-101 books differ from GSTR-2B: taxable value 14000 vs 13000; CGST 610 vs 520; SGST 610 vs 520.');
  assert.deepEqual(codes(recon).filter((code) => code === 'IN_2B_NOT_BOOKED'), []);
});

test('G1: a single-line invoice and a file with no repeated invoice are answered exactly as before', async () => {
  const state = createState();
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  purchase(state, 'Pack House', PACK_GSTIN, 'PH-9', '2026-09-10', [[6000, 12]]);
  await statement(state, sheet(FIRST_RATE, `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y`, 'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y'));
  const risk = await atRisk(state);
  assert.deepEqual(risk.risks.map((item) => [item.billId, item.reason, item.credit, item.credit2b]), [['BILL-0002', 'AMOUNT_DIFFERS', 720, 600]]);
  assert.equal(risk.risks[0].why, 'The amounts differ: taxable value 6000 in your books, 5000 in 2B; IGST 720 in your books, 600 in 2B.');
  assert.deepEqual(risk.notBooked, [{ supplier: 'THREAD LTD', gstin: '33AAACZ1234F1Z5', invoiceNo: 'T-55', date: '2026-09-11', credit: 960 }]);
  assert.deepEqual([risk.creditMatched, risk.creditAtRisk], [500, 720]);
  const fixtures = { purchaseRegister: fixture('purchaseregister.csv'), gstr2b: fixture('gstr2b-b2b.csv'), gstr1: fixture('gstr1.csv'), gstr3b: GSTR3B };
  const out = await runTool(createState(), 'gst_reconcile', { ...fixtures, asOfDate: AS_OF });
  const direct = gst.reconcile(
    { purchaseRegisterText: fixtures.purchaseRegister, gstr2bText: fixtures.gstr2b, gstr1Text: fixtures.gstr1, gstr3bText: fixtures.gstr3b },
    { clientGstin: createState().company.gstin, asOfDate: AS_OF, supplierFilings: undefined },
  );
  assert.deepEqual(out.data, direct);
  const own = await reconcileWith(state, sheet(FIRST_RATE));
  assert.deepEqual(own, sprintReconcile(state, sheet(FIRST_RATE)));
  const unreadable = sheet('B2B,27AABCT1332L1ZE,FABRIC CO,F-103,05-09-2026,,,,,,,Y', FIRST_RATE, `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y`);
  const flawed = await reconcileWith(state, unreadable);
  assert.ok(flawed.parserErrors.length > 0, 'the file really has a row that cannot be read');
  assert.deepEqual(flawed, sprintReconcile(state, unreadable));
});

test('G1: a repeated invoice does not hide a row of the file that could not be read', async () => {
  const state = createState();
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5], [4000, 18]]);
  const flawed = [TWO_RATE_2B, `B2B,${GSTIN},FABRIC CO,F-102,31-02-2026,1000,25,25,0,0,1050,Y`, `B2B,${GSTIN},FABRIC CO,F-103,05-09-2026,,,,,,,Y`].join('\n');
  const reference = sprintReconcile(state, flawed);
  assert.deepEqual(reference.parserErrors.map((item) => [item.code, item.row]), [['INVALID_DATE', 3], ['MISSING_AMOUNT', 4], ['INVALID_HEADER', 1]]);
  const recon = await reconcileWith(state, flawed);
  assert.deepEqual(recon.parserErrors, reference.parserErrors);
  assert.equal(recon.ok, false);
  assert.equal(recon.summary.ok, false);
  assert.equal(recon.summary.amountMismatches, 0, JSON.stringify(recon.issues));
  assert.equal(recon.summary.matchedInvoices, 1);
});

test('G1: the lines of one invoice in different months\' statements are not added together', async () => {
  const state = createState();
  const bill = purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5]]);
  await statement(state, sheet(FIRST_RATE));
  await statement(state, sheet(FIRST_RATE), '2026-10');
  const risk = await atRisk(state);
  assert.deepEqual(risk.risks, [], JSON.stringify(risk.risks));
  assert.equal(risk.creditMatched, 500);
  assert.equal(reviewRows(state)[0].billId, bill.id);
  assert.equal(reviewRows(state, '2026-10')[0].lines, 1);
});

test('G1: two lines with one invoice number and different dates are two invoices in credit_at_risk and gst_reconcile, as they always were', async () => {
  const state = createState();
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-04-02', [[10000, 5]]);
  const csv = sheet(
    'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,28-03-2026,10000,250,250,0,0,10500,Y',
    'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,02-04-2026,10000,250,250,0,0,10500,Y',
  );
  await statement(state, csv, '2026-04');
  const risk = (await runTool(state, 'credit_at_risk', { period: '2026-04' })).data;
  assert.deepEqual(risk.risks, [], JSON.stringify(risk.risks));
  assert.deepEqual([risk.creditMatched, risk.creditAtRisk], [500, 0]);
  const recon = await reconcileWith(state, csv);
  assert.deepEqual(
    [recon.summary.b2bInvoices, recon.summary.matchedInvoices, recon.summary.amountMismatches, recon.summary.invoicesIn2BNotInBooks],
    [2, 1, 0, 1],
  );
  assert.equal(recon.match.matched[0].purchase.invoiceNo, 'F-101');
  assert.equal(recon.match.matched[0].invoice.invoiceDate, '2026-04-02');
});

test('G1: an invoice that is in 2B but not booked is listed once, with the credit of all its lines', async () => {
  const state = createState();
  await statement(state, TWO_RATE_2B);
  const risk = await atRisk(state);
  assert.deepEqual(risk.notBooked, [{ supplier: 'FABRIC CO', gstin: GSTIN, invoiceNo: 'F-101', date: '2026-09-05', credit: 1220 }]);
  const rows = reviewRows(state);
  assert.deepEqual(rows.map((row) => [row.match, row.credit, row.lines]), [['not in books', 1220, 2]]);
  const recon = await reconcileWith(state, TWO_RATE_2B);
  assert.equal(recon.summary.invoicesIn2BNotInBooks, 1);
  assert.equal(recon.summary.b2bInvoices, 1);
});

test('G1: when one line of a two-line invoice is marked not available, the whole invoice reads as not available in all three tools, whichever line comes first', async () => {
  for (const [first, second] of [['Y', 'N'], ['N', 'Y']]) {
    const csv = sheet(FIRST_RATE.replace(/,Y$/, `,${first}`), SECOND_RATE.replace(/,Y$/, `,${second}`));
    const { state } = await twoRateBooks(csv);
    const risk = await atRisk(state);
    assert.deepEqual(risk.risks.map((item) => [item.reason, item.credit]), [['ITC_NOT_AVAILABLE', 1220]], `${first}${second}`);
    assert.equal(reviewRows(state)[0].itcAvailability, 'N', `${first}${second}`);
    const recon = await reconcileWith(state, csv);
    assert.deepEqual(recon.itcAvailability.blocked.map((item) => [item.code, item.blockedCredit]), [['ITC_NOT_AVAILABLE_IN_2B', 1220]], `${first}${second}`);
    assert.equal(recon.summary.itcEligible, 0, `${first}${second}`);
  }
});

test('G1: a supplier name with a comma in it survives the lines being added up, and the columns stay where they were', async () => {
  const csv = sheet(
    FIRST_RATE.replace('FABRIC CO', '"FABRIC CO, UNIT 2"'),
    SECOND_RATE.replace('FABRIC CO', '"FABRIC CO, UNIT 2"'),
  );
  const state = createState();
  purchase(state, 'Fabric Co', GSTIN, 'F-101', '2026-09-05', [[10000, 5], [4000, 18]]);
  const recon = await reconcileWith(state, csv);
  assert.equal(recon.match.matched.length, 1, JSON.stringify(recon.issues));
  assert.equal(recon.match.matched[0].invoice.supplierName, 'FABRIC CO, UNIT 2');
  assert.deepEqual([recon.match.matched[0].invoice.taxableValue, recon.match.matched[0].amountMismatch], [14000, false]);
  assert.deepEqual([recon.summary.matchedInvoices, recon.summary.amountMismatches], [1, 0]);
});

test('G1: the lines of one credit note in 2B are added up, so the credit it takes away is named once', async () => {
  const csv = sheet(
    `CDNR,${GSTIN},FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y`,
    `CDNR,${GSTIN},FABRIC CO,CN-7,20-09-2026,500,12.5,12.5,0,0,525,Y`,
  );
  const state = await statement(createState(), csv);
  const recon = await reconcileWith(state, csv);
  assert.deepEqual(
    recon.issues.filter((item) => item.code === 'CREDIT_NOTE_NOT_BOOKED').map((item) => item.message),
    ['Credit note CN-7 in GSTR-2B reduces input credit by 75 but was never booked.'],
  );
  assert.equal(recon.summary.creditNotesIn2BNotInBooks, 1);
  assert.deepEqual(reviewRows(state).map((row) => [row.match, row.credit, row.lines]), [['not in books', -75, 2]]);
});

test('G2: the inter-state lines of one invoice add up IGST and cess, and the credit is the sum of both', async () => {
  const state = createState();
  await statement(state, sheet(
    `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,100,5700,Y`,
    `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,1000,0,0,120,20,1140,Y`,
  ));
  const [row, ...others] = reviewRows(state);
  assert.deepEqual(others, []);
  assert.deepEqual(
    { taxableValue: row.taxableValue, cgst: row.cgst, sgst: row.sgst, igst: row.igst, cess: row.cess, totalValue: row.totalValue, credit: row.credit, lines: row.lines },
    { taxableValue: 6000, cgst: 0, sgst: 0, igst: 720, cess: 120, totalValue: 6840, credit: 840, lines: 2 },
  );
  const data = imsReview(state, { period: PERIOD }).data;
  assert.deepEqual(data.credit, { accepted: 0, rejected: 0, pending: 0, undecided: 840 });
  assert.equal(data.statement.rows, 2);
});

test('G2: two inter-state lines booked as one bill with IGST read as matched in credit_at_risk and ims_review', async () => {
  const state = createState();
  const bill = purchase(state, 'Pack House', PACK_GSTIN, 'PH-9', '2026-09-10', [[5000, 12], [1000, 18]]);
  assert.deepEqual([bill.taxable, bill.cgst, bill.sgst, bill.igst], [6000, 0, 0, 780]);
  await statement(state, sheet(
    `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y`,
    `B2B,${PACK_GSTIN},PACK HOUSE,PH-9,10-09-2026,1000,0,0,180,0,1180,Y`,
  ));
  const [row] = reviewRows(state);
  assert.deepEqual([row.match, row.igst, row.credit, row.lines], ['matched', 780, 780, 2]);
  const risk = await atRisk(state);
  assert.deepEqual(risk.risks, [], JSON.stringify(risk.risks));
  assert.equal(risk.creditMatched, 780);
});

const SHARED_NAME = 'SRI VENKATA LAKSHMI NARASIMHA TEXTILE MANUFACTURING AND TRADING COMPANY PRIVATE LIMITED UNIT';
const EAST = `${SHARED_NAME} EAST GODOWN WITH COLD STORAGE`;
const WEST = `${SHARED_NAME} WEST GODOWN WITH COLD STORAGE`;
const LONG_NUMBER = 'BILL-2026-27-0000001';

test('G3: when no invoice is named, the blocker offers two sentences that each plan a real IMS decision', async () => {
  const state = await statement(createState(), sheet(
    FIRST_RATE,
    'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
  ));
  const sentence = 'Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject all undecided in IMS for 2026-09".';
  const blocked = (args) => previewOf(state, 'ims_decide', { period: PERIOD, decision: 'accept', ...args }).blockers;
  assert.deepEqual(blocked({}), [sentence]);
  assert.deepEqual(blocked({ keys: [] }), [sentence]);
  assert.deepEqual(blocked({ select: 'nonsense' }), [sentence]);
  assert.deepEqual(planImsDecision(state, { period: PERIOD, decision: 'accept' }), { ok: false, error: 'NO_ROWS', period: PERIOD });
  const examples = [...sentence.matchAll(/"([^"]+)"/g)].map((hit) => hit[1]);
  assert.equal(examples.length, 2);
  assert.deepEqual(planLocalToolCall(state, examples[0]), { kind: 'tool', name: 'ims_decide', args: { period: PERIOD, select: 'matched', decision: 'accept' } });
  assert.deepEqual(planLocalToolCall(state, examples[1]), { kind: 'tool', name: 'ims_decide', args: { period: PERIOD, select: 'undecided', decision: 'reject' } });
  const held = propose(state, 'ims_decide', { period: PERIOD, decision: 'reject' });
  assert.equal(held.blocked, true, JSON.stringify(held));
  assert.equal(held.reply, 'I did not post anything, because:\n· Say which invoices, for example "accept all matched in IMS for September 2026" or "reject all undecided in IMS for September 2026".');
  assert.doesNotMatch(held.reply, /DYE WORKS|FABRIC CO/);
  const said = [...held.reply.matchAll(/"([^"]+)"/g)].map((hit) => planLocalToolCall(state, hit[1]));
  assert.deepEqual(said.map((plan) => [plan.kind, plan.name]), [['tool', 'ims_decide'], ['tool', 'ims_decide']]);
  assert.deepEqual(said.map((plan) => plan.args.select), ['matched', 'undecided']);
});

test('G3: the blocker names no supplier, whatever the statement holds', async () => {
  const none = await statement(createState(), sheet(`B2B,${GSTIN},${EAST},F-1,05-09-2026,1000,25,25,0,0,1050,Y`));
  const some = await statement(createState(), sheet(FIRST_RATE));
  const words = (state) => previewOf(state, 'ims_decide', { period: PERIOD, decision: 'pending' }).blockers;
  assert.deepEqual(words(none), words(some));
  assert.deepEqual(words(none), ['Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject all undecided in IMS for 2026-09".']);
});

test('G4: a blank-GSTIN row with a long supplier name gets a key short enough to decide it by key, and long names with one start stay apart', async () => {
  const normal = (name) => normNumber(name);
  assert.equal(normal(EAST).slice(0, 50), normal(WEST).slice(0, 50), 'the two names share a 50-character start');
  assert.ok(`${PERIOD}|${normal(EAST)}|${normNumber(LONG_NUMBER)}|B2B`.length > 120, 'the key from the whole name would be longer than the 120 characters a key could once be');
  const state = await statement(createState(), sheet(
    `B2B,,${EAST},${LONG_NUMBER},05-09-2026,1000,25,25,0,0,1050,Y`,
    `B2B,,${WEST},${LONG_NUMBER},05-09-2026,2000,50,50,0,0,2100,Y`,
    `B2B,,ALPHA TRADERS PVT LTD,${LONG_NUMBER},05-09-2026,3000,75,75,0,0,3150,Y`,
  ));
  const rows = reviewRows(state);
  assert.equal(rows.length, 3);
  const keys = rows.map((row) => row.key);
  assert.equal(new Set(keys).size, 3, keys.join('\n'));
  for (const key of keys) assert.ok(key.length <= IMS_MAX_KEY, `${key.length}: ${key}`);
  const [east, west] = ['EAST', 'WEST'].map((word) => rows.find((row) => row.supplierName.includes(word)));
  const cut = (row) => row.key.split('|')[1];
  assert.equal(cut(east).slice(0, 40), normal(EAST).slice(0, 40));
  assert.equal(cut(west).slice(0, 40), normal(WEST).slice(0, 40));
  assert.notEqual(cut(east), cut(west));
  assert.ok(cut(east).length > 40 && cut(east).length <= 48, cut(east));
  assert.equal(rows.find((row) => row.supplierName === 'ALPHA TRADERS PVT LTD').key, `${PERIOD}|ALPHATRADERSPVTLTD|${normNumber(LONG_NUMBER)}|B2B`, 'a name of 40 characters or fewer is left as it was');
  assert.equal(imsKey(PERIOD, { supplierGstin: '', supplierName: EAST, invoiceNo: LONG_NUMBER, section: 'B2B' }), east.key);
  assert.equal(imsKey(PERIOD, { supplierGstin: '', supplierName: normal(EAST).toLowerCase(), invoiceNo: LONG_NUMBER, section: 'b2b' }), east.key, 'the key does not depend on spacing or case');
  const forty = 'A'.repeat(40);
  assert.equal(imsKey(PERIOD, { supplierName: forty, invoiceNo: 'X1', section: 'B2B' }), `${PERIOD}|${forty}|X1|B2B`);
  assert.notEqual(imsKey(PERIOD, { supplierName: `${forty}B`, invoiceNo: 'X1', section: 'B2B' }), imsKey(PERIOD, { supplierName: `${forty}C`, invoiceNo: 'X1', section: 'B2B' }));
});

test('G4: a long-name row is decided by its key through the app path, the held call carries the key, and a re-import keeps the decision', async () => {
  const csv = sheet(
    `B2B,,${EAST},${LONG_NUMBER},05-09-2026,1000,25,25,0,0,1050,Y`,
    `B2B,,${WEST},${LONG_NUMBER},05-09-2026,2000,50,50,0,0,2100,Y`,
  );
  const state = await statement(createState(), csv);
  const [first, second] = reviewRows(state);
  const args = { period: PERIOD, keys: [first.key], decision: 'reject', note: 'not ours' };
  assert.equal(validateAssistantToolCall('ims_decide', args).ok, true, JSON.stringify(validateAssistantToolCall('ims_decide', args)));
  const held = propose(state, 'ims_decide', args);
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.deepEqual(Object.keys(state.imsDecisions), [first.key]);
  await statement(state, csv);
  const after = reviewRows(state);
  assert.deepEqual(after.map((row) => row.decision), ['reject', '']);
  assert.equal(imsReview(state, { period: PERIOD }).data.orphaned, 0);
  const bulk = propose(state, 'ims_decide', { period: PERIOD, select: 'undecided', decision: 'accept' });
  assert.equal(bulk.awaitingConfirmation, true, JSON.stringify(bulk));
  assert.deepEqual(state.pendingChatAction.args, { period: PERIOD, keys: [second.key], decision: 'accept' }, 'the held call names the invoice that was shown');
});
