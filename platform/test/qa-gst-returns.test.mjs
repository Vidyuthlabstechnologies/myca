import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-gst-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { paymentFor } from '../src/gst-payment.mjs';
import { gstr3bPortalJson } from '../src/gstr3b-portal.mjs';
import { gstr9Draft } from '../src/gstr9.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';

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
const KARNATAKA = withCheck('29AABCU9603R1Z');
const SUPPLIER = withCheck('27AAACS5678G1Z');
const PERIOD = '2026-09';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: PRINCIPAL, pan: 'AABCU9603R', state: '27', address: '12 Market Road', city: 'Pune', pin: '411001' };
  return state;
}

test('the late fee and filed status of a second registration follow its own GSTR-3B filing, not the principal one', async () => {
  const state = books();
  const added = await runTool(state, 'set_registration', { gstin: KARNATAKA, kind: 'apob', label: 'Amazon BLR' });
  assert.equal(added.ok, true, JSON.stringify(added));
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '29', lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 18 }], date: `${PERIOD}-10`, registrationGstin: KARNATAKA });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  state.filings = [{ returnType: 'GSTR-3B', period: PERIOD, label: 'GSTR-3B', arn: 'AA270926000001A', filedOn: '2026-10-15', dueDate: '2026-10-20', late: false, filedBy: '', source: 'recorded' }];
  const pay = paymentFor(state, PERIOD, { payOn: '2026-11-10', gstin: KARNATAKA });
  assert.equal(pay.ok, true, JSON.stringify(pay));
  assert.equal(pay.data.filed, null, 'the principal filing is not the Karnataka filing');
  assert.ok(pay.data.late, 'the Karnataka return is late and owes interest and the late fee');
  assert.ok(pay.data.late.lateFee > 0);
});

test('GSTR-3B with only reverse charge tax cannot be filed before the reverse charge cash is set off', async () => {
  const state = books();
  const bill = await runTool(state, 'create_purchase', { partyName: 'Ravi Security', partyState: '27', partyAddress: 'Shop 3, Hadapsar, Pune 411028', reverseCharge: true, lines: [{ description: 'Guards', hsn: '998525', qty: 1, rate: 10000, gstRate: 18 }], date: `${PERIOD}-12` });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  const built = gstr3bPortalJson(state, PERIOD);
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.ok(built.payment.reverseCharge.total > 0, JSON.stringify(built.payment.reverseCharge));
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'save_gstr3b_portal', { period: PERIOD }));
  const review = await runTool(state, 'gst_review', { period: PERIOD });
  for (const step of review.data.steps) await runTool(state, 'gst_review_answer', { period: PERIOD, step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
  const filed = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'file_gstr3b_portal', { period: PERIOD, otp: '123456' }));
  assert.equal(filed.error, 'NOT_SET_OFF', JSON.stringify(filed));
});

test('a credit note on an export without payment of tax carries no IGST', async () => {
  const state = books();
  const sale = await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Cotton yarn', hsn: '5205', qty: 100, rate: 10, gstRate: 5 }], date: `${PERIOD}-05`, exportSale: { currency: 'USD', exchangeRate: 80 } });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(sale.invoice.igst, 0);
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.invoice.id, amount: 8000, reason: 'Short shipment', date: `${PERIOD}-20` });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.creditNote.igst, 0, 'no tax was charged, so none is reversed');
  assert.equal(note.creditNote.taxable, 8000);
  const pay = paymentFor(state, PERIOD, { payOn: '2026-10-01' });
  assert.equal(pay.data.output.igst, 0, 'output IGST cannot go negative from a zero-rated export');
});

test('a debit note on an export without payment of tax carries no IGST', async () => {
  const state = books();
  const sale = await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Cotton yarn', hsn: '5205', qty: 100, rate: 10, gstRate: 5 }], date: `${PERIOD}-05`, exportSale: { currency: 'USD', exchangeRate: 80 } });
  const note = await runTool(state, 'create_debit_note', { invoiceId: sale.invoice.id, amount: 800, reason: 'Price revised', date: `${PERIOD}-20` });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.debitNote.igst, 0);
  assert.equal(note.debitNote.taxable, 800);
});

test('cancelling an invoice with an exempt line nets the exempt part out of 3.1(c), not out of the taxable 3.1(a)', async () => {
  const state = books();
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '27', lines: [{ description: 'Shirts', hsn: '6205', qty: 1, rate: 1000, gstRate: 18 }, { description: 'Milk', hsn: '0401', qty: 1, rate: 1000, gstRate: 0, supply: 'exempt' }], date: `${PERIOD}-05` });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const before = gstr3bPortalJson(state, PERIOD);
  assert.equal(before.body.sup_details.osup_det.txval, 1000);
  assert.equal(before.body.sup_details.osup_nil_exmp.txval, 1000);
  const cancelled = await runTool(state, 'cancel_invoice', { invoiceId: sale.invoice.id, date: `${PERIOD}-25` });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  const after = gstr3bPortalJson(state, PERIOD);
  assert.deepEqual(after.body.sup_details.osup_det, { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
  assert.equal(after.body.sup_details.osup_nil_exmp.txval, 0);
});

test('a credit note against an export nets in 3.1(b) zero-rated supplies, not in 3.1(a)', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '27', lines: [{ description: 'Shirts', hsn: '6205', qty: 1, rate: 5000, gstRate: 18 }], date: `${PERIOD}-04` });
  const sale = await runTool(state, 'create_invoice', { partyName: 'Globex LLC', lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 100, gstRate: 5 }], date: `${PERIOD}-05`, exportSale: { currency: 'USD', exchangeRate: 80, withTax: true } });
  assert.equal(sale.invoice.igst, 400);
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.invoice.id, amount: 4200, reason: 'Short shipment', date: `${PERIOD}-20` });
  assert.equal(note.ok, true, JSON.stringify(note));
  const built = gstr3bPortalJson(state, PERIOD);
  assert.deepEqual(built.body.sup_details.osup_det, { txval: 5000, iamt: 0, camt: 450, samt: 450, csamt: 0 });
  assert.deepEqual(built.body.sup_details.osup_zero, { txval: 4000, iamt: 200, camt: 0, samt: 0, csamt: 0 });
});

test('GSTR-9 table 4 leaves out exports without payment of tax, which belong in table 5', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '27', lines: [{ description: 'Shirts', hsn: '6205', qty: 1, rate: 5000, gstRate: 18 }], date: `${PERIOD}-04` });
  await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Yarn', hsn: '5205', qty: 100, rate: 10, gstRate: 5 }], date: `${PERIOD}-05`, exportSale: { currency: 'USD', exchangeRate: 80 } });
  await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Books', hsn: '4901', qty: 10, rate: 50, gstRate: 0 }], date: `${PERIOD}-06`, exportSale: { currency: 'USD', exchangeRate: 80 } });
  const draft = gstr9Draft(state, { fy: '2026-27' });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  assert.equal(draft.data.table5.exportsWithoutTax.taxable, 120000);
  assert.equal(draft.data.table4.outwardTaxable, 5000, 'the export is reported once, in table 5');
  assert.equal(draft.data.table5.nilRatedOrExempt, 0, 'an export of a nil-rated good is a zero-rated export, not a nil-rated supply');
});

test('GSTR-9 refuses a financial year whose two years do not follow on', () => {
  const state = books();
  assert.equal(gstr9Draft(state, { fy: '2026-28' }).error, 'BAD_FY');
  assert.equal(gstr9Draft(state, { fy: '2026-27' }).ok, true);
});

test('GSTR-1 reports a credit note against an export in CDNUR as EXPWOP or EXPWP, never in B2CS with place of supply 96', async () => {
  const state = books();
  const without = await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Yarn', hsn: '5205', qty: 10, rate: 10, gstRate: 5 }], date: `${PERIOD}-05`, exportSale: { currency: 'USD', exchangeRate: 80 } });
  const paid = await runTool(state, 'create_invoice', { partyName: 'Globex LLC', lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 100, gstRate: 5 }], date: `${PERIOD}-06`, exportSale: { currency: 'USD', exchangeRate: 80, withTax: true } });
  await runTool(state, 'create_credit_note', { invoiceId: without.invoice.id, amount: 800, reason: 'Short shipment', date: `${PERIOD}-20` });
  await runTool(state, 'create_credit_note', { invoiceId: paid.invoice.id, amount: 840, reason: 'Short shipment', date: `${PERIOD}-21` });
  const json = invoicesToGstr1Json(state.company, state.invoices, '092026', { creditNotes: state.creditNotes });
  assert.equal(json.b2cs.some((row) => row.pos === '96'), false, JSON.stringify(json.b2cs));
  assert.deepEqual(json.cdnur.map((row) => [row.typ, row.val, row.pos]), [['EXPWOP', 800, undefined], ['EXPWP', 840, undefined]]);
  assert.equal(json.cdnur[0].itms[0].itm_det.iamt, 0);
  assert.equal(json.cdnur[1].itms[0].itm_det.iamt, 40);
});
