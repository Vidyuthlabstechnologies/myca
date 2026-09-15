import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePurchaseRegister } from '../src/purchaseregister.mjs';
import { match2B } from '../src/match2b.mjs';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readFixture(name) {
  return readFileSync(resolve(fixturesDir, name), 'utf8');
}

function fixtureGstr2bRows() {
  return [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 6000, sgst: 6000, igst: 0, cess: 0, totalValue: 112000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1002', invoiceDate: '2025-04-10', taxableValue: 50000, cgst: 3000, sgst: 3000, igst: 0, cess: 0, totalValue: 56000, itcAvailability: 'N' },
    { section: 'B2B', supplierGstin: '24AAACF7856R1Z0', supplierName: 'DEF ELECTRICALS', invoiceNo: 'E-221', invoiceDate: '2025-04-06', taxableValue: 30000, cgst: 0, sgst: 0, igst: 5400, cess: 0, totalValue: 35400, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '29AABCL1234J1ZN', supplierName: 'GHI PACKAGING', invoiceNo: 'PKG-87', invoiceDate: '2025-04-14', taxableValue: 25000, cgst: 1500, sgst: 1500, igst: 0, cess: 0, totalValue: 28000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '07AACCP9876L1ZO', supplierName: 'JKL FREIGHT', invoiceNo: 'FR-201', invoiceDate: '2025-04-20', taxableValue: 12000, cgst: 0, sgst: 0, igst: 2160, cess: 0, totalValue: 14160, itcAvailability: 'Y' },
    { section: 'CDNR', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-0405', invoiceDate: '2025-04-28', taxableValue: 5000, cgst: 300, sgst: 300, igst: 0, cess: 0, totalValue: 5600, itcAvailability: 'Y' }
  ];
}

test('GATE 1: parsePurchaseRegister parses the shared fixture', () => {
  const { rows, errors } = parsePurchaseRegister(readFixture('purchaseregister.csv'));
  assert.equal(rows.length, 6);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].gstin, '27AABCU9603R1ZP');
  assert.equal(rows[0].invoiceNo, 'INV-1001');
  assert.equal(rows[0].invoiceDate, '2025-04-03');
  assert.equal(rows[0].taxableValue, 100000);
  assert.equal(rows[0].totalValue, 112000);
  assert.equal(rows[0].isCreditNote, false);
  assert.equal(rows[2].supplierName, 'DEF ELECTRICALS');
  assert.equal(rows[2].igst, 5400);
  assert.equal(rows[2].totalValue, 35400);
  assert.equal(rows[4].invoiceNo, 'INV-1003');
  assert.equal(rows[4].taxableValue, 20000);
  assert.equal(rows[4].totalValue, 22400);
  assert.equal(rows[4].isCreditNote, false);
  assert.equal(rows[5].invoiceNo, 'CN-0405');
  assert.equal(rows[5].taxableValue, -5000);
  assert.equal(rows[5].totalValue, -5600);
  assert.equal(rows[5].isCreditNote, true);
});

test('GATE 2: match2B reconciles parsed purchases against the 2B fixture', () => {
  const { rows: purchaseRegister } = parsePurchaseRegister(readFixture('purchaseregister.csv'));
  const result = match2B({ purchaseRegister, gstr2b: fixtureGstr2bRows() });
  assert.equal(result.ok, false);
  assert.equal(result.matched.length, 4);
  assert.deepEqual(
    result.matched.map((m) => m.invoice.invoiceNo),
    ['INV-1001', 'INV-1002', 'E-221', 'PKG-87']
  );
  for (const m of result.matched) {
    assert.ok(m.purchase);
    assert.ok(m.invoice);
  }
  const inv1001 = result.matched.find((m) => m.invoice.invoiceNo === 'INV-1001');
  assert.equal(inv1001.exact, true);
  assert.equal(inv1001.purchase.taxableValue, 100000);
  assert.equal(result.creditNotes.length, 1);
  assert.equal(result.creditNotes[0].purchase.invoiceNo, 'CN-0405');
  assert.equal(result.unmatched.inBooksNotIn2B.length, 1);
  assert.equal(result.unmatched.inBooksNotIn2B[0].invoiceNo, 'INV-1003');
  assert.equal(result.unmatched.in2BNotInBooks.length, 1);
  assert.equal(result.unmatched.in2BNotInBooks[0].invoiceNo, 'FR-201');
  assert.equal(result.unmatched.in2BNotInBooks[0].section, 'B2B');
  assert.equal(result.unmatched.in2BNotInBooks[0].supplierName, 'JKL FREIGHT');
  assert.deepEqual(result.stats, {
    purchaseInvoices: 6,
    b2bInvoices: 5,
    matchedCount: 4,
    amountMismatchCount: 0,
    cnCount: 1
  });
});

test('GATE 3: exact match normalizes GSTIN case and invoice-number case/spaces', () => {
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, totalValue: 112000 }
  ];
  const purchaseRegister = [
    { gstin: '27aabcU9603r1zp ', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'inv-1001 ', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 6000, sgst: 6000, igst: 0, totalValue: 112000, sourceRow: 1, isCreditNote: false }
  ];
  const result = match2B({ purchaseRegister, gstr2b });
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].exact, true);
  assert.equal(result.matched[0].amountMismatch, false);
  assert.equal(result.matched[0].purchase.invoiceNo, 'inv-1001 ');
  assert.equal(result.matched[0].invoice.invoiceNo, 'INV-1001');
  assert.equal(result.stats.matchedCount, 1);
});

test('GATE 4: amount mismatch is flagged as not exact with a lower score', () => {
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, totalValue: 112000 }
  ];
  const base = { gstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', totalValue: 112000, sourceRow: 1, isCreditNote: false };
  const exact = match2B({
    purchaseRegister: [{ ...base, taxableValue: 100000 }],
    gstr2b
  }).matched[0];
  const mismatch = match2B({
    purchaseRegister: [{ ...base, taxableValue: 99800 }],
    gstr2b
  }).matched[0];
  assert.equal(mismatch.amountMismatch, true);
  assert.equal(mismatch.exact, false);
  assert.equal(exact.amountMismatch, false);
  assert.equal(exact.exact, true);
  assert.ok(mismatch.score < exact.score);
});

test('GATE 5: invoice-number normalization matches INV-1001 vs INV 1001 and rejects INV-1002', () => {
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, totalValue: 112000 }
  ];
  const makePr = (invoiceNo) => [
    { gstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo, invoiceDate: '2025-04-03', taxableValue: 100000, totalValue: 112000, sourceRow: 1, isCreditNote: false }
  ];
  const spaced = match2B({ purchaseRegister: makePr('INV 1001'), gstr2b });
  assert.equal(spaced.matched.length, 1);
  assert.equal(spaced.matched[0].exact, true);
  const different = match2B({ purchaseRegister: makePr('INV-1002'), gstr2b });
  assert.equal(different.matched.length, 0);
  assert.equal(different.unmatched.inBooksNotIn2B.length, 1);
  assert.equal(different.unmatched.inBooksNotIn2B[0].invoiceNo, 'INV-1002');
});

test('GATE 6: CN purchase rows match CDNR rows and never positive B2B rows', () => {
  const cnPr = [
    { gstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-99', invoiceDate: '2025-05-10', taxableValue: -5000, cgst: -300, sgst: -300, igst: 0, totalValue: -5600, sourceRow: 1, isCreditNote: true }
  ];
  const cdnrRow = { section: 'CDNR', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-99', invoiceDate: '2025-05-10', taxableValue: -5000, totalValue: -5600 };
  const cdnrResult = match2B({ purchaseRegister: cnPr, gstr2b: [cdnrRow] });
  assert.equal(cdnrResult.creditNotes.length, 1);
  assert.equal(cdnrResult.creditNotes[0].purchase.invoiceNo, 'CN-99');
  assert.equal(cdnrResult.creditNotes[0].invoice.section, 'CDNR');
  assert.equal(cdnrResult.matched.length, 0);
  assert.equal(cdnrResult.stats.cnCount, 1);

  const b2bRow = { section: 'B2B', supplierGstin: '27AABCU9603R1ZP', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-99', invoiceDate: '2025-05-10', taxableValue: 5000, totalValue: 5600 };
  const b2bResult = match2B({ purchaseRegister: cnPr, gstr2b: [b2bRow] });
  assert.equal(b2bResult.matched.length, 0);
  assert.equal(b2bResult.matched.filter((m) => m.invoice.section === 'B2B' && m.purchase.invoiceNo === 'CN-99').length, 0);
  assert.equal(b2bResult.creditNotes.length, 0);
  assert.equal(b2bResult.unmatched.in2BNotInBooks.length, 1);
  assert.equal(b2bResult.unmatched.in2BNotInBooks[0].invoiceNo, 'CN-99');
});