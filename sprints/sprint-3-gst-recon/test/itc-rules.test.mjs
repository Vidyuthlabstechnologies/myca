import { test } from 'node:test';
import assert from 'node:assert/strict';
import { match2B } from '../src/match2b.mjs';
import { parsePurchaseRegister } from '../src/purchaseregister.mjs';
import { checkItcAvailability, flagRule37, flagRule37A } from '../src/itc-checks.mjs';

const GSTIN = '27AABCU9603R1ZN';
const book = (over = {}) => ({ gstin: GSTIN, supplierName: 'ABC', invoiceNo: 'INV-1', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, totalValue: 118000, isCreditNote: false, ...over });
const twob = (over = {}) => ({ section: 'B2B', supplierGstin: GSTIN, supplierName: 'ABC', invoiceNo: 'INV-1', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, cess: 0, totalValue: 118000, itcAvailability: 'Y', ...over });

test('H5: same taxable value but ITC Rs 18,000 in books against Rs 5,000 in 2B is not an exact match', () => {
  const result = match2B({ purchaseRegister: [book()], gstr2b: [twob({ cgst: 2500, sgst: 2500 })] });
  const m = result.matched[0];
  assert.equal(m.exact, false);
  assert.deepEqual(m.mismatches.map((d) => [d.head, d.books, d.gstr2b]), [['cgst', 9000, 2500], ['sgst', 9000, 2500]]);
  assert.equal(result.ok, false);
});

test('H5: CGST+SGST in books against IGST in 2B is a tax-type mismatch', () => {
  const m = match2B({ purchaseRegister: [book()], gstr2b: [twob({ cgst: 0, sgst: 0, igst: 18000 })] }).matched[0];
  assert.equal(m.exact, false);
  assert.equal(m.placeOfSupplyMismatch, true);
});

test('H5: a credit note in the books but not in 2B is reported, not dropped', () => {
  const cn = book({ invoiceNo: 'CN-9', taxableValue: -1000, cgst: -90, sgst: -90, totalValue: -1180, isCreditNote: true });
  const result = match2B({ purchaseRegister: [book(), cn], gstr2b: [twob()] });
  assert.deepEqual(result.unmatched.creditNotesInBooksNotIn2B.map((p) => p.invoiceNo), ['CN-9']);
  assert.equal(result.ok, false);
});

test('H5: a 2B credit note never booked is reported and reduces eligible credit', () => {
  const cdnr = twob({ section: 'CDNR', invoiceNo: 'CN-7', taxableValue: 1000, cgst: 90, sgst: 90, totalValue: 1180 });
  const result = match2B({ purchaseRegister: [book()], gstr2b: [twob(), cdnr] });
  assert.deepEqual(result.unmatched.creditNotesIn2BNotInBooks.map((r) => r.invoiceNo), ['CN-7']);
  const itc = checkItcAvailability({ purchaseRegister: [book()], gstr2b: [twob(), cdnr] });
  assert.equal(itc.summary.totalCreditNoteReduction, -180);
  assert.equal(itc.summary.eligibleItc, 18000 - 180);
});

test('H5: CNTR-77 is an invoice; a credit note is known from its sign or document type', () => {
  const csv = [
    'GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,TOTAL VALUE,DOCUMENT TYPE',
    `${GSTIN},ABC,CNTR-77,03-04-2025,1000,90,90,0,1180,INV`,
    `${GSTIN},ABC,CR-12,04-04-2025,1000,90,90,0,1180,CN`,
    `${GSTIN},ABC,X-1,05-04-2025,-500,-45,-45,0,-590,`,
  ].join('\n');
  const { rows } = parsePurchaseRegister(csv);
  assert.deepEqual(rows.map((r) => [r.invoiceNo, r.isCreditNote]), [['CNTR-77', false], ['CR-12', true], ['X-1', true]]);
});

test('H4: credit that 2B shows as unavailable is blocked at its tax, capped at what the supplier reported', () => {
  const itc = checkItcAvailability({ purchaseRegister: [book(), book({ invoiceNo: 'INV-2' })], gstr2b: [twob({ cgst: 8000, sgst: 8000 }), twob({ invoiceNo: 'INV-2', itcAvailability: 'N' })] });
  assert.deepEqual(itc.blocked.map((b) => [b.purchase.invoiceNo, b.blockedCredit]), [['INV-2', 18000]]);
  assert.equal(itc.summary.eligibleItc, 16000, 'books claim 18,000 but 2B reports 16,000');
});

test('H4 Rule 37: value unpaid 180 days after the invoice reverses the proportionate credit', () => {
  const inv = book({ invoiceDate: '2025-01-10', paidValue: 59000, paymentDate: '2025-03-01' });
  const out = flagRule37({ purchaseRegister: [inv], asOfDate: '2025-08-01' });
  assert.equal(out.reverse.length, 1);
  const r = out.reverse[0];
  assert.equal(r.deadline, '2025-07-09');
  assert.equal(r.unpaidValue, 59000);
  assert.equal(r.reversalItc, 9000, 'half the value unpaid, so half the 18,000 credit');
  assert.equal(r.reverseInReturnFor, '2025-08');
});

test('H4 Rule 37: paid in full in time, still inside 180 days, or payment after the deadline', () => {
  assert.equal(flagRule37({ purchaseRegister: [book({ invoiceDate: '2025-01-10', paidValue: 118000, paymentDate: '2025-07-09' })], asOfDate: '2025-08-01' }).reverse.length, 0);
  assert.equal(flagRule37({ purchaseRegister: [book({ invoiceDate: '2025-01-10', paidValue: 0, paymentDate: null })], asOfDate: '2025-07-09' }).reverse.length, 0);
  const late = flagRule37({ purchaseRegister: [book({ invoiceDate: '2025-01-10', paidValue: 118000, paymentDate: '2025-07-10' })], asOfDate: '2025-08-01' });
  assert.equal(late.reverse[0].reversalItc, 18000, 'paid a day late: reverse now, re-avail on payment');
});

test('H4 Rule 37: with no payment data the invoice is reported as unknown, not assumed paid', () => {
  const out = flagRule37({ purchaseRegister: [book({ invoiceDate: '2025-01-10', paidValue: null })], asOfDate: '2025-08-01' });
  assert.equal(out.reverse.length, 0);
  assert.equal(out.unknown[0].code, 'PAYMENT_STATUS_UNKNOWN');
});

test('H4 Rule 37A: supplier GSTR-3B not filed by 30 September after the FY means reversal by 30 November', () => {
  const inv = book({ invoiceDate: '2024-06-10' });
  const notFiled = [{ gstin: GSTIN, period: '2024-06', filedOn: null }];
  const after = flagRule37A({ purchaseRegister: [inv], supplierFilings: notFiled, asOfDate: '2025-10-01' });
  assert.deepEqual(after.reverse.map((r) => [r.code, r.supplierBy, r.reverseBy, r.reversalItc]), [['SUPPLIER_GSTR3B_NOT_FILED', '2025-09-30', '2025-11-30', 18000]]);
  const before = flagRule37A({ purchaseRegister: [inv], supplierFilings: notFiled, asOfDate: '2025-09-15' });
  assert.equal(before.reverse.length, 0);
  assert.equal(before.atRisk[0].code, 'SUPPLIER_GSTR3B_PENDING');
  const filed = flagRule37A({ purchaseRegister: [inv], supplierFilings: [{ gstin: GSTIN, period: '2024-06', filedOn: '2025-09-20' }], asOfDate: '2025-10-01' });
  assert.equal(filed.reverse.length + filed.atRisk.length + filed.unknown.length, 0);
  const lateFiled = flagRule37A({ purchaseRegister: [inv], supplierFilings: [{ gstin: GSTIN, period: '2024-06', filedOn: '2025-10-05' }], asOfDate: '2025-10-10' });
  assert.equal(lateFiled.reverse.length, 1);
});

test('H4 Rule 37A: without supplier filing status the check says it was not run', () => {
  const out = flagRule37A({ purchaseRegister: [book()], asOfDate: '2025-10-01' });
  assert.equal(out.checked, false);
  assert.equal(out.reason, 'SUPPLIER_GSTR3B_STATUS_NOT_PROVIDED');
  const unknown = flagRule37A({ purchaseRegister: [book()], supplierFilings: [], asOfDate: '2026-10-01' });
  assert.equal(unknown.unknown[0].code, 'SUPPLIER_FILING_UNKNOWN');
});
