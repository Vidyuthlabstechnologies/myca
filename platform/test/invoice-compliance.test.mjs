import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, printInvoice } from '../src/invoice.mjs';

function books(company = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AAACH7409R1Z1', state: '27', address: '12 Market Road', city: 'Pune', pin: '411001', ...company };
  return state;
}

const doc = async (state, id) => (await runTool(state, 'invoice_document', { id })).data;

test('a registered seller\'s taxable sale is a tax invoice and says reverse charge does not apply', async () => {
  const state = books();
  createInvoice(state, { date: '2026-10-03', partyName: 'Rajesh Stores', partyGstin: '27AABCT1332L1ZE', partyAddress: 'Pune', lines: [{ description: 'Cotton', hsn: '5208', qty: 1, rate: 500, gstRate: 5 }] });
  const d = await doc(state, 'INV-0001');
  assert.equal(d.documentTitle, 'Tax invoice');
  assert.equal(d.reverseChargeLine, 'Tax payable on reverse charge: No');
  assert.equal(d.exportEndorsement, '');
  const html = printInvoice(state, 'INV-0001').html;
  assert.match(html, /<h1>Tax Invoice INV-0001<\/h1>/);
  assert.match(html, /Tax payable on reverse charge: No/);
});

test('a sale of only exempt or nil-rated goods is a bill of supply (CGST rule 46A)', async () => {
  const state = books();
  createInvoice(state, { date: '2026-10-03', partyName: 'Walk-in', lines: [{ description: 'Fresh vegetables', hsn: '0702', qty: 1, rate: 200, gstRate: 0, supply: 'exempt' }, { description: 'Milk', hsn: '0401', qty: 1, rate: 60, gstRate: 0, supply: 'nil' }] });
  assert.equal((await doc(state, 'INV-0001')).documentTitle, 'Bill of supply');
  assert.match(printInvoice(state, 'INV-0001').html, /<h1>Bill of Supply INV-0001<\/h1>/);
  createInvoice(state, { date: '2026-10-04', partyName: 'Walk-in', lines: [{ description: 'Vegetables', hsn: '0702', qty: 1, rate: 200, gstRate: 0, supply: 'exempt' }, { description: 'Bag', hsn: '3923', qty: 1, rate: 10, gstRate: 18 }] });
  assert.equal((await doc(state, 'INV-0002')).documentTitle, 'Tax invoice', 'a mixed invoice stays a tax invoice');
});

test('a composition dealer issues a bill of supply with the declaration', async () => {
  const state = books({ composition: true });
  createInvoice(state, { date: '2026-10-03', partyName: 'Walk-in', lines: [{ description: 'Snacks', hsn: '2106', qty: 1, rate: 100, gstRate: 0 }] });
  const d = await doc(state, 'INV-0001');
  assert.equal(d.documentTitle, 'Bill of supply');
  assert.match(d.compositionDeclaration, /not eligible to collect tax/);
  assert.match(printInvoice(state, 'INV-0001').html, /not eligible to collect tax/);
});

test('an export invoice carries the export endorsement with the LUT number', async () => {
  const state = books({ lutNumber: 'AD270326000123X' });
  const made = createInvoice(state, { date: '2026-10-03', partyName: 'Acme Inc', lines: [{ description: 'Software services', hsn: '998314', qty: 1, rate: 1000, gstRate: 18 }], exportSale: { currency: 'USD', exchangeRate: 84, withTax: false } });
  assert.notEqual(made.ok, false, JSON.stringify(made));
  const d = await doc(state, made.invoice.id);
  assert.equal(d.documentTitle, 'Tax invoice');
  assert.equal(d.exportEndorsement, 'Supply meant for export under bond or letter of undertaking without payment of IGST (LUT AD270326000123X)');
  const own = createInvoice(state, { date: '2026-10-05', partyName: 'Acme Inc', lines: [{ description: 'Software services', hsn: '998314', qty: 1, rate: 1000, gstRate: 18 }], exportSale: { currency: 'USD', exchangeRate: 84, withTax: false, lutNumber: 'ad2703 26999' } });
  assert.match((await doc(state, own.invoice.id)).exportEndorsement, /\(LUT AD270326999\)$/);
  const paid = createInvoice(state, { date: '2026-10-04', partyName: 'Acme Inc', lines: [{ description: 'Software services', hsn: '998314', qty: 1, rate: 1000, gstRate: 18 }], exportSale: { currency: 'USD', exchangeRate: 84, withTax: true } });
  assert.equal((await doc(state, paid.invoice.id)).exportEndorsement, 'Supply meant for export on payment of IGST');
});

test('the HSN column cannot be hidden on a B2B tax invoice, only on B2C', async () => {
  const state = books();
  await runTool(state, 'set_invoice_template', { showHsn: false });
  createInvoice(state, { date: '2026-10-03', partyName: 'Rajesh Stores', partyGstin: '27AABCT1332L1ZE', partyAddress: 'Pune', lines: [{ description: 'Cotton', hsn: '5208', qty: 1, rate: 500, gstRate: 5 }] });
  createInvoice(state, { date: '2026-10-03', partyName: 'Walk-in', lines: [{ description: 'Cotton', hsn: '5208', qty: 1, rate: 500, gstRate: 5 }] });
  assert.equal((await doc(state, 'INV-0001')).template.showHsn, true);
  assert.match(printInvoice(state, 'INV-0001').html, /<td>5208<\/td>/);
  assert.equal((await doc(state, 'INV-0002')).template.showHsn, false);
});

test('an issued e-invoice carries the ack date and the signed QR for the PDF', async () => {
  const state = books();
  createInvoice(state, { date: '2026-10-03', partyName: 'Rajesh Stores', partyGstin: '27AABCT1332L1ZE', partyAddress: 'Pune', lines: [{ description: 'Cotton', hsn: '5208', qty: 1, rate: 500, gstRate: 5 }] });
  Object.assign(state.invoices[0], { irn: 'a'.repeat(64), ackNo: '112010036563310', ackDate: '2026-10-03 11:05:00', signedQrCode: 'eyJhbGciOiJSUzI1NiJ9.signed.qr' });
  const e = (await doc(state, 'INV-0001')).einvoice;
  assert.equal(e.status, 'issued');
  assert.equal(e.ackDate, '2026-10-03 11:05:00');
  assert.equal(e.signedQrCode, 'eyJhbGciOiJSUzI1NiJ9.signed.qr');
  assert.match(printInvoice(state, 'INV-0001').html, /IRN a{64}, Ack No 112010036563310, Ack Date 2026-10-03 11:05:00/);
  delete state.invoices[0].irn;
  Object.assign(state.invoices[0], { sandboxIrn: 'b'.repeat(64), sandboxAckNo: '1', sandboxSignedQrCode: 'sandbox.qr' });
  const s = (await doc(state, 'INV-0001')).einvoice;
  assert.equal(s.status, 'sandbox');
  assert.equal(s.signedQrCode, 'sandbox.qr');
});
