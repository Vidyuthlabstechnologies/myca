import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-bughunt-gst-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { gstr3bPortalJson } from '../src/gstr3b-portal.mjs';
import { paymentFor } from '../src/gst-payment.mjs';
import { gstr9Draft } from '../src/gstr9.mjs';
import { invoiceToNicPayload, nicPartyFor } from '../src/nic-config.mjs';
import { ewayBillPartA } from '../src/eway-bill.mjs';
import { validateAssistantToolCall, validateAppToolCall } from '../src/assistant-tools.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const PRINCIPAL = withCheck('27AABCU9603R1Z');
const BUYER_MH = withCheck('27AAACS5678G1Z');
const BUYER_KA = withCheck('29AAACS5678G1Z');
const PERIOD = '2026-09';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Zaveri Jewellers', gstin: PRINCIPAL, pan: 'AABCU9603R', state: '27', address: '12 Market Road', city: 'Mumbai', pin: '400002' };
  return state;
}

async function sell(state, args) {
  const made = await runTool(state, 'create_invoice', { date: `${PERIOD}-10`, ...args });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made.invoice;
}

test('GSTR-3B and the GST to pay count B2B sales at 3%, 0.25% and 40%, and a B2B sale shipped to another state, not only 5/12/18/28%', async () => {
  const state = books();
  await sell(state, { partyName: 'Gold Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Gold chain', hsn: '7113', qty: 1, rate: 100000, gstRate: 3 }] });
  await sell(state, { partyName: 'Diamond Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Rough diamond', hsn: '7102', qty: 1, rate: 100000, gstRate: 0.25 }] });
  await sell(state, { partyName: 'Pan Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Pan masala', hsn: '2106', qty: 1, rate: 100000, gstRate: 40 }] });
  await sell(state, { partyName: 'Karnataka Buyer', partyGstin: BUYER_KA, partyState: '27', lines: [{ description: 'Silver coin', hsn: '7106', qty: 1, rate: 100000, gstRate: 3 }] });
  const portal = gstr3bPortalJson(state, PERIOD);
  assert.equal(portal.ok, true, JSON.stringify(portal));
  assert.deepEqual(portal.body.sup_details.osup_det, { txval: 400000, iamt: 0, camt: 23125, samt: 23125, csamt: 0 });
  const pay = paymentFor(state, PERIOD);
  assert.equal(pay.ok, true, JSON.stringify(pay));
  assert.equal(pay.data.output.total, 46250);
});

test('the GSTN filing pack GSTR-3B is net of the month\'s credit notes, the same figures the GST to pay is worked from', async () => {
  const state = books();
  const sale = await sell(state, { partyName: 'Ravi', lines: [{ description: 'Shirt', hsn: '6205', qty: 2, rate: 1000, gstRate: 5 }] });
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.id, amount: 1050, reason: 'Goods returned', date: `${PERIOD}-12` });
  assert.equal(note.ok, true, JSON.stringify(note));
  const pack = await runTool(state, 'filing_pack', { period: PERIOD });
  assert.equal(pack.ok, true, JSON.stringify(pack));
  assert.deepEqual(pack.data.gstr3b.outward.totals, { interTaxable: 0, interIgst: 0, intraTaxable: 1000, intraCgst: 25, intraSgst: 25 });
  assert.equal(pack.data.payable, 50);
});

test('the quarterly GSTR-1 reports a credit note issued in the first two months of the quarter, in CDNR, HSN and table 13', async () => {
  const state = books();
  state.company.gstFrequency = 'quarterly';
  const sale = await sell(state, { date: '2026-07-10', partyName: 'Shah Traders', partyGstin: BUYER_MH, lines: [{ description: 'Shirt', hsn: '6205', qty: 2, rate: 1000, gstRate: 5 }] });
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.id, amount: 1050, reason: 'Goods returned', date: '2026-08-12' });
  assert.equal(note.ok, true, JSON.stringify(note));
  const file = await runTool(state, 'export_gstr1_quarter', { quarter: 'Q2 2026-27' });
  assert.equal(file.ok, true, JSON.stringify(file));
  assert.equal(file.data.cdnr?.[0]?.nt?.[0]?.nt_num, note.creditNote.id);
  assert.equal(file.data.hsn.hsn_b2b[0].txval, 1000);
  assert.ok(file.data.doc_issue.doc_det.some((row) => row.doc_num === 5));
});

test('the e-invoice gives the buyer\'s state code from the buyer\'s GSTIN, and the e-way bill the place of supply as the actual destination', async () => {
  const state = books();
  const sale = await sell(state, { partyName: 'Bengaluru Retail', partyGstin: BUYER_KA, partyState: '27', partyAddress: '4 MG Road, Bengaluru 560001', lines: [{ description: 'Steel almirah', hsn: '9403', qty: 5, rate: 20000, gstRate: 18 }] });
  assert.equal(sale.cgst, 9000);
  const nic = invoiceToNicPayload(state.company, sale, nicPartyFor(state, sale));
  assert.equal(nic.BuyerDtls.Stcd, '29');
  assert.equal(nic.BuyerDtls.Pos, '27');
  sale.transport = { mode: 'road', distanceKm: 20, vehicleNo: 'MH01AB1234', setOn: sale.date };
  const ewb = ewayBillPartA(state, sale);
  assert.equal(ewb.ok, true, JSON.stringify(ewb));
  assert.equal(ewb.partA.toStateCode, 29);
  assert.equal(ewb.partA.actToStateCode, 27);
});

test('GSTR-1 reports nil-rated, exempt and non-GST lines only in table 8, never in B2B or B2CS, and nets their credit notes there', async () => {
  const state = books();
  await sell(state, { partyName: 'Walk-in', lines: [{ description: 'Rice', hsn: '1006', qty: 10, rate: 50, gstRate: 0, supply: 'nil' }, { description: 'Oil', hsn: '1508', qty: 2, rate: 200, gstRate: 5 }] });
  await sell(state, { partyName: 'Clinic', partyGstin: BUYER_MH, lines: [{ description: 'Hearing aid', hsn: '9021', qty: 1, rate: 8000, gstRate: 0, supply: 'exempt' }] });
  const mixed = state.invoices[0];
  const note = await runTool(state, 'create_credit_note', { invoiceId: mixed.id, reason: 'Returned', date: `${PERIOD}-20` });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.creditNote.lines[0].supply, 'nil');
  const file = await runTool(state, 'export_gstr1_json', { fp: '092026' });
  assert.equal(file.ok, true, JSON.stringify(file));
  assert.deepEqual(file.data.b2b, []);
  assert.ok(file.data.b2cs.every((row) => row.rt !== 0), JSON.stringify(file.data.b2cs));
  const nil = Object.fromEntries(file.data.nil.inv.map((row) => [row.sply_ty, row]));
  assert.equal(nil.INTRAB2C.nil_amt, 0);
  assert.equal(nil.INTRAB2B.expt_amt, 8000);
});

test('GSTR-3B 3.1(e) non-GST supplies are net of a credit note on the non-GST line', async () => {
  const state = books();
  const sale = await sell(state, { partyName: 'Pump Customer', lines: [{ description: 'Petrol', hsn: '2710', qty: 10, rate: 100, gstRate: 0, supply: 'non-gst' }, { description: 'Engine oil', hsn: '2710', qty: 1, rate: 1000, gstRate: 18 }] });
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.id, reason: 'Wrong bill', date: `${PERIOD}-12` });
  assert.equal(note.ok, true, JSON.stringify(note));
  const portal = gstr3bPortalJson(state, PERIOD);
  assert.equal(portal.ok, true, JSON.stringify(portal));
  assert.equal(portal.body.sup_details.osup_nongst.txval, 0);
  assert.equal(portal.body.sup_details.osup_det.txval, 0);
});

test('a 40% GST sale, bill, expense and item are accepted from chat and the phone, as the rate has been in force since 22 September 2025', async () => {
  const line = { description: 'Aerated drink', hsn: '2202', qty: 10, rate: 100, gstRate: 40 };
  assert.equal(validateAppToolCall('create_invoice', { partyName: 'Walk-in', date: `${PERIOD}-10`, lines: [line] }).ok, true);
  assert.equal(validateAssistantToolCall('create_purchase', { partyName: 'Bottler', supplierInvoiceNo: 'B-9', date: `${PERIOD}-10`, lines: [line] }).ok, true);
  assert.equal(validateAssistantToolCall('set_sku_cost', { sku: 'COLA', gstRate: 40, price: 100 }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'Walk-in', lines: [{ ...line, gstRate: 41 }] }).ok, false);
  const state = books();
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'COLA', gstRate: 40, price: 100 })).ok, true);
  const spent = await runTool(state, 'post_expense', { amount: 1400, gstRate: 40, narration: 'Staff drinks', date: `${PERIOD}-10` });
  assert.equal(spent.ok, true, JSON.stringify(spent));
});

test('GSTR-3B table 3.2 inter-state sales to unregistered buyers is net of credit notes and leaves out nil-rated lines', async () => {
  const state = books();
  const sale = await sell(state, { partyName: 'Traveller', partyState: '29', lines: [{ description: 'Saree', hsn: '5407', qty: 2, rate: 5000, gstRate: 5 }, { description: 'Book', hsn: '4901', qty: 1, rate: 500, gstRate: 0, supply: 'nil' }] });
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.id, reason: 'One saree returned', lines: [{ description: 'Saree', hsn: '5407', qty: 1, rate: 5000, gstRate: 5 }], date: `${PERIOD}-15` });
  assert.equal(note.ok, true, JSON.stringify(note));
  const portal = gstr3bPortalJson(state, PERIOD);
  assert.equal(portal.ok, true, JSON.stringify(portal));
  assert.deepEqual(portal.body.inter_sup.unreg_details, [{ pos: '29', txval: 5000, iamt: 250 }]);
  assert.deepEqual(portal.body.sup_details.osup_det, { txval: 5000, iamt: 250, camt: 0, samt: 0, csamt: 0 });
});

test('GSTR-9 table 5 keeps a cancelled exempt sale and a cancelled export with their credit notes, not the credit note alone', async () => {
  const state = books();
  const exempt = await sell(state, { date: '2026-05-10', partyName: 'Clinic', lines: [{ description: 'Hearing aid', hsn: '9021', qty: 1, rate: 500, gstRate: 0, supply: 'exempt' }, { description: 'Battery', hsn: '8506', qty: 2, rate: 200, gstRate: 18 }] });
  const exported = await sell(state, { date: '2026-05-10', partyName: 'Dubai Buyer', exportSale: { currency: 'INR', lutNumber: 'AD270326000001', countryCode: 'AE' }, lines: [{ description: 'Saree', hsn: '5407', qty: 1, rate: 3000, gstRate: 5 }] });
  for (const sale of [exempt, exported]) {
    const cancelled = await runTool(state, 'cancel_invoice', { invoiceId: sale.id, date: '2026-05-11' });
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  }
  const draft = gstr9Draft(state, { fy: '2026-27' });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const t5 = draft.data.table5;
  assert.equal(t5.creditNotes, 3500);
  assert.equal(t5.exempt, 500);
  assert.equal(t5.exportsWithoutTax.taxable, 3000);
  assert.equal(t5.exempt + t5.exportsWithoutTax.taxable - t5.creditNotes, 0);
});
