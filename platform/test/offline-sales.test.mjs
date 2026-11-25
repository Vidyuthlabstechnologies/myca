import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { propose, confirmPending, chat } from '../src/router.mjs';
import { openSession } from '../src/session.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { assistantTools, validateAssistantToolCall, validateAppToolCall, APP_ONLY_TOOLS } from '../src/assistant-tools.mjs';
import { CONFIRM_TOOLS, needsConfirmation } from '../src/chat-confirm.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { lockPeriod } from '../src/period-lock.mjs';
import { INVOICE_ID_PATTERN } from '../src/tool-schema-parts.mjs';
import { seriesCodeAt, OFFLINE_TOOLS } from '../src/offline-sales.mjs';
import { gstin } from '../src/sprint-load.mjs';
import { buildVectors, VECTORS_PATH } from '../scripts/offline-invoice-vectors.mjs';

const DEVICE = 'phone-0001-abcdef';
const OTHER_DEVICE = 'phone-0002-abcdef';
const DATE = '2026-11-10';
const REF = (n) => `ref-${String(n).padStart(8, '0')}`;
const SOAP = { description: 'Soap', sku: 'soap', qty: 2, rate: 100, gstRate: 18 };
const SOAP_PRINTED = { taxable: 200, cgst: 18, sgst: 18, igst: 0, total: 236 };

function books() {
  return createState();
}

async function registered(state = books(), deviceId = DEVICE, deviceName = 'Shop counter') {
  const out = await runTool(state, 'register_offline_device', { deviceId, deviceName });
  assert.equal(out.ok, true);
  return state;
}

function sale(n, extra = {}) {
  return { ref: REF(n), id: `INV-MA2627-${String(n).padStart(4, '0')}`, date: DATE, createdAt: `${DATE}T10:00:00+05:30`, partyName: 'Walk-in', lines: [SOAP], printed: SOAP_PRINTED, ...extra };
}

async function post(state, args) {
  const out = await runTool(state, 'post_offline_sales', { deviceId: DEVICE, ...args });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

function findKey(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

test('the committed vectors are what the engine computes today', () => {
  const committed = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));
  const built = buildVectors();
  assert.deepEqual(built, committed);
  assert.equal(committed.vectors.length, 300);
  const rates = new Set(committed.vectors.flatMap((vector) => vector.lines.map((line) => line.gstRate)));
  for (const rate of [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 40]) assert.ok(rates.has(rate), `rate ${rate} is covered`);
  assert.ok(committed.vectors.some((vector) => vector.partyState === vector.supplierState));
  assert.ok(committed.vectors.some((vector) => vector.partyState !== vector.supplierState));
  assert.ok(committed.vectors.some((vector) => vector.partyGstin));
  assert.ok(committed.vectors.some((vector) => !vector.partyGstin));
  assert.ok(committed.vectors.some((vector) => vector.lines.some((line) => !Number.isInteger(line.qty * 100))));
  for (const vector of committed.vectors) {
    if (vector.partyGstin) assert.equal(gstin.validateGstin(vector.partyGstin).ok, true, vector.partyGstin);
    assert.ok(vector.lines.length >= 1 && vector.lines.length <= 6);
    assert.equal(vector.expected.lines.length, vector.lines.length);
  }
});

test('series codes run MA, MB, ... MZ, NA ... skipping I and O, and the same device keeps its series', async () => {
  assert.equal(seriesCodeAt(0), 'MA');
  assert.equal(seriesCodeAt(8), 'MJ');
  assert.equal(seriesCodeAt(13), 'MP');
  assert.equal(seriesCodeAt(23), 'MZ');
  assert.equal(seriesCodeAt(24), 'NA');
  assert.equal(seriesCodeAt(48), 'PA');
  assert.equal(seriesCodeAt(311), 'ZZ');
  assert.equal(seriesCodeAt(312), '');
  const codes = Array.from({ length: 312 }, (_, at) => seriesCodeAt(at));
  assert.equal(new Set(codes).size, 312);
  assert.ok(codes.every((code) => /^[A-HJ-NP-Z]{2}$/.test(code)));

  const state = books();
  const first = await runTool(state, 'register_offline_device', { deviceId: DEVICE, deviceName: 'Shop counter' });
  assert.deepEqual(first, { ok: true, series: { code: 'MA', deviceId: DEVICE, deviceName: 'Shop counter', lastNumberByFy: {} }, created: true });
  const again = await runTool(state, 'register_offline_device', { deviceId: DEVICE, deviceName: 'Renamed' });
  assert.equal(again.created, false);
  assert.equal(again.series.code, 'MA');
  assert.equal(again.series.deviceName, 'Shop counter');
  const second = await runTool(state, 'register_offline_device', { deviceId: OTHER_DEVICE });
  assert.equal(second.series.code, 'MB');
  assert.equal(second.series.deviceName, 'Phone');
  assert.equal(state.offlineSeries.length, 2);
  assert.equal((await runTool(state, 'register_offline_device', { deviceId: 'bad id' })).error, 'BAD_DEVICE_ID');
});

test('the kit carries the business, lock, rule 46(e) limit, items, parties, open invoices and the series', async () => {
  const state = books();
  const before = await runTool(state, 'offline_kit', { deviceId: DEVICE });
  assert.equal(before.ok, true);
  assert.equal(before.data.series, null);
  await registered(state);
  await runTool(state, 'set_sku_cost', { sku: 'soap', name: 'Soap 100g', price: 40, gstRate: 18, hsn: '3401', barcode: '8901234567890' });
  await runTool(state, 'record_stock', { sku: 'SOAP', qty: 12, date: '2026-11-01' });
  await runTool(state, 'record_stock', { sku: 'SOAP', qty: -2.5, date: '2026-11-02' });
  const credit = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '29AAACR5055K1Z5', partyAddress: 'MG Road, Bengaluru', date: '2026-11-03', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(credit.ok, true);
  const settled = await runTool(state, 'create_invoice', { partyName: 'Paid Co', date: '2026-11-04', lines: [{ description: 'Cloth', qty: 1, rate: 100, gstRate: 5 }] });
  await runTool(state, 'record_receipt', { invoiceId: settled.invoice.id, amount: 105, date: '2026-11-04' });
  await runTool(state, 'record_receipt', { invoiceId: credit.invoice.id, amount: 50, date: '2026-11-05' });
  lockPeriod(state, '2026-10-31');
  const kit = (await runTool(state, 'offline_kit', { deviceId: DEVICE })).data;
  assert.equal(kit.version, 1);
  assert.match(kit.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(kit.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(kit.company, { name: state.company.name, gstin: state.company.gstin, state: '27', composition: false, address: state.company.address });
  assert.equal(kit.lockThrough, '2026-10-31');
  assert.equal(kit.einvoiceB2b, false);
  assert.deepEqual(kit.buyerDetails, { taxablePaiseAtLeast: 5000000, rule: 'gst.invoice.unregistered-buyer-details', applies: true });
  assert.deepEqual(kit.items, [{ sku: 'SOAP', name: 'Soap 100g', barcode: '8901234567890', hsn: '3401', gstRate: 18, price: 40, unit: '', onHand: 9.5 }]);
  assert.ok(kit.parties.some((party) => party.name === 'Kiran Stores' && party.gstin === '29AAACR5055K1Z5' && party.state === '29' && party.address === 'MG Road, Bengaluru'));
  assert.deepEqual(kit.openInvoices, [{ id: credit.invoice.id, date: '2026-11-03', partyName: 'Kiran Stores', partyGstin: '29AAACR5055K1Z5', total: 1050, due: 1000 }]);
  assert.deepEqual(kit.series, { code: 'MA', deviceId: DEVICE, deviceName: 'Shop counter', lastNumberByFy: {} });
  assert.equal((await runTool(state, 'offline_kit', { deviceId: 'x' })).error, 'BAD_DEVICE_ID');
});

test('a business that e-invoices says so in the kit and refuses B2B offline', async () => {
  const state = await registered();
  const b2b = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '29AAACR5055K1Z5', date: '2026-11-03', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  b2b.invoice.irn = 'a'.repeat(64);
  assert.equal((await runTool(state, 'offline_kit', { deviceId: DEVICE })).data.einvoiceB2b, true);
  const out = await post(state, { sales: [sale(1, { partyName: 'Kiran Stores', partyGstin: '29AAACR5055K1Z5' })] });
  assert.equal(out.results[0].status, 'rejected');
  assert.equal(out.results[0].error, 'NOT_OFFLINE');
  assert.match(out.results[0].hint, /e-invoice/);
  const b2c = await post(state, { sales: [sale(2)] });
  assert.equal(b2c.results[0].status, 'posted');
});

test('a synced bill is posted once, with its offline origin and the series counter moved', async () => {
  const state = await registered();
  const transfersBefore = state.ledger.transfers.length;
  const out = await post(state, { sales: [sale(1), sale(3, { lines: [{ ...SOAP, qty: 1 }], printed: { taxable: 100, cgst: 9, sgst: 9, igst: 0, total: 118 } })] });
  assert.deepEqual(out.counts, { posted: 2, already: 0, conflict: 0, rejected: 0 });
  assert.deepEqual(out.results[0], { ref: REF(1), kind: 'sale', status: 'posted', id: 'INV-MA2627-0001', engine: { ...SOAP_PRINTED, lines: [{ taxable: 200, cgst: 18, sgst: 18, igst: 0, tax: 36, amount: 236 }] } });
  assert.deepEqual(out.series, { code: 'MA', deviceId: DEVICE, deviceName: 'Shop counter', lastNumberByFy: { 2627: 3 } });
  const invoice = state.invoices.find((inv) => inv.id === 'INV-MA2627-0001');
  assert.equal(invoice.source, 'offline');
  assert.equal(invoice.offline.ref, REF(1));
  assert.equal(invoice.offline.deviceId, DEVICE);
  assert.equal(invoice.offline.createdAt, `${DATE}T10:00:00+05:30`);
  assert.match(invoice.offline.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(invoice.lines[0].sku, 'SOAP');
  assert.equal(invoice.total, 236);
  assert.ok(state.ledger.transfers.length > transfersBefore);
  assert.equal(state.invoiceSeq || 0, 0, 'the main series is untouched');
  const next = await runTool(state, 'create_invoice', { partyName: 'Walk-in', date: DATE, lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 5 }] });
  assert.equal(next.invoice.id, 'INV-0001');
});

test('a replay is "already" and applies a payment or a void that the lost reply never confirmed', async () => {
  const state = await registered();
  await post(state, { sales: [sale(1)] });
  const replay = await post(state, { sales: [sale(1)] });
  assert.equal(replay.results[0].status, 'already');
  assert.equal(replay.results[0].id, 'INV-MA2627-0001');
  assert.equal(state.invoices.length, 1);

  const paid = await post(state, { sales: [sale(1, { payment: { amount: 236, mode: 'upi' } })] });
  assert.equal(paid.results[0].status, 'already');
  const invoice = state.invoices[0];
  assert.equal(invoice.receipts.length, 1);
  assert.equal(invoice.receipts[0].mode, 'upi');
  assert.equal(invoice.receipts[0].offlineRef, REF(1));
  assert.equal(invoice.status, 'paid');
  await post(state, { sales: [sale(1, { payment: { amount: 236, mode: 'upi' } })] });
  assert.equal(invoice.receipts.length, 1, 'the payment is not taken twice');

  const voided = await post(state, { sales: [sale(1, { payment: { amount: 236, mode: 'upi' }, voided: { reason: 'Wrong item', at: '2026-11-11T09:00:00+05:30' } })] });
  assert.equal(voided.results[0].status, 'already');
  assert.match(voided.results[0].creditNoteId, /^CN-\d{4}$/);
  assert.equal(invoice.status, 'cancelled');
  assert.equal(state.creditNotes.length, 1);
  assert.equal(state.creditNotes[0].date, '2026-11-11');
  assert.equal(state.creditNotes[0].reason, 'Wrong item');
  const again = await post(state, { sales: [sale(1, { voided: { reason: 'Wrong item', at: '2026-11-11T09:00:00+05:30' } })] });
  assert.equal(again.results[0].status, 'already');
  assert.equal(state.creditNotes.length, 1, 'the void is not applied twice');
});

test('a bill paid and voided at the counter posts with its parts in one go', async () => {
  const state = await registered();
  const out = await post(state, { sales: [sale(1, { payment: { amount: 100, mode: 'cash' } }), sale(2, { voided: { reason: 'Customer left', at: `${DATE}T11:00:00Z` } })] });
  assert.deepEqual(out.results.map((row) => row.status), ['posted', 'posted']);
  const [paidBill, voidBill] = state.invoices;
  assert.equal(paidBill.receipts[0].amount, 100);
  assert.equal(paidBill.status, 'partial');
  assert.equal(voidBill.status, 'cancelled');
  assert.ok(out.results[1].creditNoteId);
});

test('a number another bill already has is a conflict, not a second invoice', async () => {
  const state = await registered();
  await post(state, { sales: [sale(1)] });
  const clash = await post(state, { sales: [{ ...sale(1), ref: REF(99) }] });
  assert.equal(clash.results[0].status, 'conflict');
  assert.equal(clash.results[0].error, 'NUMBER_TAKEN');
  assert.equal(state.invoices.length, 1);
});

test('figures that differ from what was printed post nothing until the owner keeps MyCA\'s', async () => {
  const state = await registered();
  const before = { invoices: state.invoices.length, parties: state.parties.length, transfers: state.ledger.transfers.length, transferSeq: state.transferSeq, accounts: state.ledger.accounts.length };
  const wrong = { ...SOAP_PRINTED, cgst: 18.01, total: 236.01 };
  const out = await post(state, { sales: [sale(1, { partyName: 'New Buyer', partyAddress: 'Somewhere', printed: wrong })] });
  assert.equal(out.results[0].status, 'conflict');
  assert.equal(out.results[0].error, 'FIGURES_DIFFER');
  assert.deepEqual(out.results[0].printed, wrong);
  assert.equal(out.results[0].engine.total, 236);
  assert.equal(out.results[0].engine.cgst, 18);
  assert.deepEqual({ invoices: state.invoices.length, parties: state.parties.length, transfers: state.ledger.transfers.length, transferSeq: state.transferSeq, accounts: state.ledger.accounts.length }, before);
  assert.deepEqual(out.series.lastNumberByFy, {});

  const kept = await post(state, { sales: [sale(1, { partyName: 'New Buyer', partyAddress: 'Somewhere', printed: wrong, acceptEngineFigures: true })] });
  assert.equal(kept.results[0].status, 'posted');
  assert.equal(state.invoices[0].total, 236);
  assert.equal(state.invoices[0].cgst, 18);
});

test('a number outside the phone\'s series or year is rejected', async () => {
  const state = await registered();
  await registered(state, OTHER_DEVICE);
  const out = await post(state, { sales: [{ ...sale(1), id: 'INV-MB2627-0001' }, { ...sale(2), id: 'INV-MA2526-0002' }, { ...sale(3), id: 'INV-MA2627-0000' }] });
  assert.deepEqual(out.results.map((row) => row.error), ['WRONG_SERIES', 'WRONG_SERIES', 'WRONG_SERIES']);
  assert.ok(out.results.every((row) => row.status === 'rejected'));
  assert.match(out.results[0].hint, /INV-MA2627-0001/);
  assert.equal(state.invoices.length, 0);
});

test('a locked date is rejected with the engine\'s reason and can be retried after unlocking', async () => {
  const state = await registered();
  lockPeriod(state, '2026-11-30');
  const out = await post(state, { sales: [sale(1)] });
  assert.equal(out.results[0].status, 'rejected');
  assert.equal(out.results[0].error, 'PERIOD_LOCKED');
  assert.match(out.results[0].hint, /2026-11-30/);
  assert.equal(state.invoices.length, 0);
  state.lockThrough = '';
  assert.equal((await post(state, { sales: [sale(1)] })).results[0].status, 'posted');
});

test('exports, SEZ, foreign buyers and cess are refused offline with a reason', async () => {
  const state = await registered();
  const out = await post(state, {
    sales: [
      sale(1, { exportSale: { currency: 'USD', exchangeRate: 83 } }),
      sale(2, { supplyType: 'SEZWP', partyGstin: '29AAACR5055K1Z5' }),
      sale(3, { partyState: '96' }),
      sale(4, { lines: [{ ...SOAP, cessRate: 12 }] }),
    ],
  });
  assert.deepEqual(out.results.map((row) => [row.status, row.error]), Array(4).fill(['rejected', 'NOT_OFFLINE']));
  assert.ok(out.results.every((row) => /online/.test(row.hint)));
  assert.equal(state.invoices.length, 0);
});

test('an engine refusal comes back with its own code and hint', async () => {
  const state = await registered();
  const out = await post(state, { sales: [sale(1, { partyName: 'Kiran', partyGstin: '29AAACR5055' })] });
  assert.equal(out.results[0].status, 'rejected');
  assert.equal(out.results[0].error, 'INVALID_GSTIN');
  assert.ok(out.results[0].hint);
});

test('receipts post once by ref and an overpayment is a conflict with what is due', async () => {
  const state = await registered();
  await post(state, { sales: [sale(1)] });
  const receipt = { ref: REF(500), invoiceId: 'INV-MA2627-0001', amount: 100, date: '2026-11-12', mode: 'cash' };
  const first = await post(state, { receipts: [receipt] });
  assert.deepEqual(first.results[0], { ref: REF(500), kind: 'receipt', status: 'posted', id: 'INV-MA2627-0001', due: 136 });
  const replay = await post(state, { receipts: [receipt] });
  assert.equal(replay.results[0].status, 'already');
  assert.equal(state.invoices[0].receipts.length, 1);
  const over = await post(state, { receipts: [{ ...receipt, ref: REF(501), amount: 500 }] });
  assert.equal(over.results[0].status, 'conflict');
  assert.equal(over.results[0].error, 'OVERPAYMENT');
  assert.equal(over.results[0].due, 136);
  const missing = await post(state, { receipts: [{ ...receipt, ref: REF(502), invoiceId: 'INV-MA2627-0042' }] });
  assert.equal(missing.results[0].status, 'rejected');
  assert.equal(missing.results[0].error, 'INVOICE_NOT_FOUND');
  const main = await runTool(state, 'create_invoice', { partyName: 'Kiran', date: DATE, lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const onMain = await post(state, { receipts: [{ ...receipt, ref: REF(503), invoiceId: main.invoice.id, amount: 105 }] });
  assert.equal(onMain.results[0].status, 'posted');
  assert.equal(onMain.results[0].due, 0);
});

test('a voided bill keeps its number: table 13 shows the series without a gap and the credit note', async () => {
  const state = await registered();
  await post(state, { sales: [sale(1), sale(2, { voided: { reason: 'Void', at: `${DATE}T12:00:00Z` } }), sale(3)] });
  const out = await runTool(state, 'export_gstr1_json', { fp: '112026' });
  assert.equal(out.ok, true);
  const docs = findKey(out, 'doc_issue').doc_det;
  const invoices = docs.find((row) => row.doc_num === 1).docs;
  assert.deepEqual(invoices.map(({ from, to, totnum }) => ({ from, to, totnum })), [{ from: 'INV-MA2627-0001', to: 'INV-MA2627-0003', totnum: 3 }]);
  assert.ok(docs.some((row) => row.doc_num === 5 && row.docs[0].totnum === 1));
});

test('a new item is saved, an item the server has differently is kept and returned', async () => {
  const state = await registered();
  await runTool(state, 'set_sku_cost', { sku: 'SOAP', name: 'Soap 100g', price: 40, gstRate: 18 });
  const out = await post(state, {
    items: [
      { ref: REF(700), sku: 'soap', name: 'Soap 100g', price: 45, gstRate: 18 },
      { ref: REF(701), sku: 'TEA', name: 'Tea 250g', price: 120, gstRate: 5, hsn: '0902', barcode: '8900000000001' },
      { ref: REF(702), sku: 'GUTKA', name: 'Pan masala', price: 10, gstRate: 41 },
    ],
  });
  assert.equal(out.results[0].status, 'conflict');
  assert.equal(out.results[0].error, 'ITEM_CHANGED');
  assert.deepEqual(out.results[0].item, { sku: 'SOAP', name: 'Soap 100g', barcode: '', hsn: '', gstRate: 18, price: 40, unit: '', onHand: 0 });
  assert.equal(state.skus.SOAP.price, 40);
  assert.deepEqual(out.results[1], { ref: REF(701), kind: 'item', id: 'TEA', status: 'posted' });
  assert.equal(state.skus.TEA.barcode, '8900000000001');
  assert.equal(out.results[2].status, 'rejected');
  assert.equal(out.results[2].error, 'BAD_RATE');
  const replay = await post(state, { items: [{ ref: REF(701), sku: 'TEA', name: 'Tea 250g', price: 120, gstRate: 5 }] });
  assert.equal(replay.results[0].status, 'already');
  const same = await post(state, { items: [{ ref: REF(703), sku: 'SOAP', name: 'Soap 100g', price: 40, gstRate: 18 }] });
  assert.equal(same.results[0].status, 'already');
});

test('an unknown device and an oversized batch are refused as a whole', async () => {
  const state = books();
  const unknown = await runTool(state, 'post_offline_sales', { deviceId: DEVICE, sales: [sale(1)] });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'UNKNOWN_DEVICE');
  await registered(state);
  const many = await runTool(state, 'post_offline_sales', { deviceId: DEVICE, sales: Array.from({ length: 10 }, (_, at) => sale(at + 1)), receipts: Array.from({ length: 11 }, (_, at) => ({ ref: REF(900 + at), invoiceId: 'INV-MA2627-0001', amount: 1, date: DATE, mode: 'cash' })) });
  assert.equal(many.error, 'TOO_MANY_ENTRIES');
  assert.equal(state.invoices.length, 0);
  assert.equal((await runTool(state, 'post_offline_sales', { deviceId: DEVICE })).error, 'NOTHING_TO_SYNC');
  assert.equal(validateAppToolCall('post_offline_sales', { deviceId: DEVICE, sales: Array.from({ length: 21 }, (_, at) => sale(at + 1)) }).ok, false);
});

test('offline invoice numbers are accepted wherever a tool names an invoice', async () => {
  assert.equal(INVOICE_ID_PATTERN, '^INV-(?:[A-Z]{2}[0-9]{4}-)?[0-9]{4,}$');
  const id = 'INV-MA2627-0001';
  const calls = [
    ['print_invoice', { id }],
    ['invoice_document', { id }],
    ['record_receipt', { invoiceId: id, amount: 10 }],
    ['cancel_invoice', { invoiceId: id }],
    ['create_credit_note', { invoiceId: id, amount: 10, reason: 'Returned' }],
    ['eway_bill_status', { invoiceId: id }],
  ];
  for (const [name, args] of calls) assert.equal(validateAssistantToolCall(name, args).ok, true, `${name}: ${validateAssistantToolCall(name, args).error}`);
  for (const old of ['INV-0001', 'INV-26270001', 'BILL-0001']) assert.equal(validateAssistantToolCall('print_invoice', { id: old }).ok, true, old);
  for (const bad of ['INV-MA27-0001', 'INV-ma2627-0001', 'INV-MA2627-01']) assert.equal(validateAssistantToolCall('invoice_document', { id: bad }).ok, false, bad);

  const state = await registered();
  await post(state, { sales: [sale(1)] });
  assert.equal((await runTool(state, 'print_invoice', { id })).ok, true);
  const doc = await runTool(state, 'invoice_document', { id });
  assert.equal(doc.ok, true);
  assert.deepEqual(planLocalToolCall(state, `cancel ${id}`).args.invoiceId, id);
  assert.equal(planLocalToolCall(state, `print ${id.toLowerCase()}`).args.id, id);
  assert.equal(planLocalToolCall(state, `credit note for ${id} 50 - returned`).name, 'create_credit_note');
});

test('the assistant can neither see nor call the offline tools, but the app can propose them', async () => {
  assert.deepEqual([...APP_ONLY_TOOLS].sort(), [...OFFLINE_TOOLS].sort());
  const offered = assistantTools(TOOLS).map((tool) => tool.name);
  for (const name of OFFLINE_TOOLS) {
    assert.equal(validateAssistantToolCall(name, { deviceId: DEVICE }).ok, false, name);
    assert.equal(offered.includes(name), false, name);
    assert.equal(toolServesCountry(name, 'IN'), true, name);
    assert.equal(toolServesCountry(name, 'US'), false, name);
  }
  assert.equal(REMOTE_QUERY_TOOLS.has('offline_kit'), true);
  assert.equal(CONFIRM_TOOLS.has('offline_kit'), false);
  assert.equal(needsConfirmation('register_offline_device'), true);
  assert.equal(needsConfirmation('post_offline_sales'), true);
  const cloud = readFileSync(new URL('../../cloud/src/api.mjs', import.meta.url), 'utf8');
  const proposable = new Set([...cloud.match(/export const PROPOSABLE = new Set\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)].map((hit) => hit[1]));
  assert.equal(proposable.has('register_offline_device'), true);
  assert.equal(proposable.has('post_offline_sales'), true);
  assert.equal(proposable.has('offline_kit'), false);

  const state = books();
  const said = await chat(state, 'register offline device phone-0001-abcdef');
  assert.notEqual(said.awaitingConfirmation, true);
  assert.equal(state.offlineSeries.length, 0);
  const held = propose(state, 'register_offline_device', { deviceId: DEVICE, deviceName: 'Shop counter' });
  assert.equal(held.awaitingConfirmation, true);
  const confirmed = await confirmPending(state, held.preview.token);
  assert.equal(confirmed.posted, true);
  assert.equal(state.offlineSeries[0].code, 'MA');
  const stray = propose(state, 'post_offline_sales', { deviceId: DEVICE, sales: [sale(1)], surprise: true });
  assert.equal(stray.blocked, true);
});

test('a phone registers, reads its kit and syncs through propose and confirm, audited', async () => {
  const s = openSession(join(mkdtempSync(join(tmpdir(), 'myca-offline-')), 'state.json'));
  s.state.company = { ...s.state.company, name: 'Test Co', gstin: '27AABCU9603R1ZN', state: '27', pan: 'AABCU9603R' };
  delete s.state.company.setupNeeded;
  const cashier = { actor: { userId: 'cashier-1', role: 'staff', name: 'Ravi' } };
  const unknown = await s.propose('post_offline_sales', { deviceId: DEVICE, sales: [sale(1)] }, cashier);
  assert.equal(unknown.blocked, true);
  assert.match(unknown.reply, /not registered/);

  const asked = await s.propose('register_offline_device', { deviceId: DEVICE, deviceName: 'Shop counter' }, cashier);
  assert.equal(asked.awaitingConfirmation, true);
  assert.match(asked.preview.summary, /series MA/);
  const done = await s.confirm(asked.preview.token, cashier);
  assert.equal(done.posted, true);
  assert.equal(done.tools[0].result.series.code, 'MA');

  const kit = await s.query('offline_kit', { deviceId: DEVICE }, cashier);
  assert.equal(kit.ok, true);
  assert.equal(kit.data.series.code, 'MA');

  const proposed = await s.propose('post_offline_sales', { deviceId: DEVICE, sales: [sale(1), sale(2, { printed: { ...SOAP_PRINTED, total: 237 } })] }, cashier);
  assert.equal(proposed.awaitingConfirmation, true);
  assert.equal(proposed.preview.summary, 'Sync 2 offline bills from Shop counter totalling ₹473.00.');
  assert.equal(s.state.invoices.length, 0, 'a preview posts nothing');
  const synced = await s.confirm(proposed.preview.token, cashier);
  assert.equal(synced.posted, true);
  const result = synced.tools[0].result;
  assert.deepEqual(result.results.map((row) => row.status), ['posted', 'conflict']);
  assert.match(synced.reply, /1 posted/);
  assert.equal(s.state.invoices.length, 1);
  const audit = s.state.auditEvents.filter((event) => event.action === 'chat.confirm').at(-1);
  assert.equal(audit.actorId, 'cashier-1');
  assert.deepEqual(audit.metadata.tools, ['post_offline_sales']);
  assert.deepEqual(audit.metadata.details[0].entries, [
    { ref: REF(1), kind: 'sale', status: 'posted', id: 'INV-MA2627-0001' },
    { ref: REF(2), kind: 'sale', status: 'conflict', id: 'INV-MA2627-0002', error: 'FIGURES_DIFFER' },
  ]);
  assert.ok(audit.metadata.details[0].ids.includes('INV-MA2627-0001'));
});
