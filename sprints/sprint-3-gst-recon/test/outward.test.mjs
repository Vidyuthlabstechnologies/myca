import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGSTR1 } from '../src/gstr1.mjs';
import { parseGSTR3B } from '../src/gstr3b.mjs';
import { matchGSTR13 } from '../src/matchgstr13.mjs';
import { flagRule37A } from '../src/rule37a.mjs';
import { imsSnapshot, sectionLabel } from '../src/ims.mjs';

const fixture = (name) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

test('GATE 1: parseGSTR1 parses shared fixture into 3 rows, 0 errors', () => {
  const { rows, errors } = parseGSTR1(fixture('gstr1.csv'));
  assert.equal(rows.length, 3);
  assert.equal(errors.length, 0);

  const s501 = rows.find((row) => row.invoiceNo === 'S-501');
  assert.equal(s501.buyerGstin, '29AABCL1234J1ZL');
  assert.equal(s501.invoiceDate, '2025-04-02');
  assert.equal(s501.taxableValue, 50000);
  assert.equal(s501.igst, 9000);
  assert.equal(s501.interState, true);
  assert.equal(s501.rate, 18);

  const s503 = rows.find((row) => row.invoiceNo === 'S-503');
  assert.equal(s503.taxableValue, 15000);
  assert.equal(s503.cgst, 1350);
  assert.equal(s503.sgst, 1350);
  assert.equal(s503.totalValue, 17700);
  assert.equal(s503.interState, false);
  assert.equal(s503.rate, 18);

  const interSum = rows.filter((row) => row.interState).reduce((sum, row) => sum + row.taxableValue, 0);
  const intraSum = rows.filter((row) => !row.interState).reduce((sum, row) => sum + row.taxableValue, 0);
  assert.equal(interSum, 70000);
  assert.equal(intraSum, 15000);
});

test('GATE 2: parseGSTR3B parses shared fixture into 2 rows, 0 errors', () => {
  const { rows, errors } = parseGSTR3B(fixture('gstr3b.csv'));
  assert.equal(rows.length, 2);
  assert.equal(errors.length, 0);

  assert.equal(rows[0].supplyType, 'OUTWARD INTER-STATE SUPPLIES');
  assert.equal(rows[0].rate, 18);
  assert.equal(rows[0].taxableValue, 70000);
  assert.equal(rows[0].igst, 12600);
  assert.equal(rows[0].interState, true);

  assert.equal(rows[1].taxableValue, 20000);
  assert.equal(rows[1].cgst, 1800);
  assert.equal(rows[1].sgst, 1800);
  assert.equal(rows[1].interState, false);
});

test('GATE 3: matchGSTR13 finds the 18% intra mismatch', () => {
  const gstr1 = parseGSTR1(fixture('gstr1.csv'));
  const gstr3b = parseGSTR3B(fixture('gstr3b.csv'));
  const result = matchGSTR13({ gstr1: gstr1.rows, gstr3b: gstr3b.rows });

  assert.equal(result.ok, false);
  assert.equal(result.buckets.length, 2);

  const inter = result.buckets.find((bucket) => bucket.key === '18% inter');
  assert.equal(inter.gstr1Taxable, 70000);
  assert.equal(inter.gstr3bTaxable, 70000);
  assert.equal(inter.diff, 0);
  assert.equal(inter.ok, true);

  const intra = result.buckets.find((bucket) => bucket.key === '18% intra');
  assert.equal(intra.gstr1Taxable, 15000);
  assert.equal(intra.gstr3bTaxable, 20000);
  assert.equal(intra.diff, -5000);
  assert.equal(intra.ok, false);

  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].key, '18% intra');
  assert.equal(result.stats.mismatchCount, 1);
});

test('GATE 4: flagRule37A flags INV-1002 and INV-1003, leaves CN-0405 alone', () => {
  const purchaseRegister = [
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 6000, sgst: 6000, igst: 0, totalValue: 112000, sourceRow: 2, isCreditNote: false },
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1002', invoiceDate: '2025-04-10', taxableValue: 50000, cgst: 3000, sgst: 3000, igst: 0, totalValue: 56000, sourceRow: 3, isCreditNote: false },
    { gstin: '24AAACF7856R1ZY', supplierName: 'DEF ELECTRICALS', invoiceNo: 'E-221', invoiceDate: '2025-04-06', taxableValue: 30000, cgst: 0, sgst: 0, igst: 5400, totalValue: 35400, sourceRow: 4, isCreditNote: false },
    { gstin: '29AABCL1234J1ZL', supplierName: 'GHI PACKAGING', invoiceNo: 'PKG-87', invoiceDate: '2025-04-14', taxableValue: 25000, cgst: 1500, sgst: 1500, igst: 0, totalValue: 28000, sourceRow: 5, isCreditNote: false },
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1003', invoiceDate: '2025-04-18', taxableValue: 20000, cgst: 1200, sgst: 1200, igst: 0, totalValue: 22400, sourceRow: 6, isCreditNote: false },
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-0405', invoiceDate: '2025-04-28', taxableValue: -5000, cgst: -300, sgst: -300, igst: 0, totalValue: -5600, sourceRow: 7, isCreditNote: true },
  ];
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 6000, sgst: 6000, igst: 0, cess: 0, totalValue: 112000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1002', invoiceDate: '2025-04-10', taxableValue: 50000, cgst: 3000, sgst: 3000, igst: 0, cess: 0, totalValue: 56000, itcAvailability: 'N' },
    { section: 'B2B', supplierGstin: '24AAACF7856R1ZY', supplierName: 'DEF ELECTRICALS', invoiceNo: 'E-221', invoiceDate: '2025-04-06', taxableValue: 30000, cgst: 0, sgst: 0, igst: 5400, cess: 0, totalValue: 35400, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '29AABCL1234J1ZL', supplierName: 'GHI PACKAGING', invoiceNo: 'PKG-87', invoiceDate: '2025-04-14', taxableValue: 25000, cgst: 1500, sgst: 1500, igst: 0, cess: 0, totalValue: 28000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '07AACCP9876L1ZM', supplierName: 'JKL FREIGHT', invoiceNo: 'FR-201', invoiceDate: '2025-04-20', taxableValue: 12000, cgst: 0, sgst: 0, igst: 2160, cess: 0, totalValue: 14160, itcAvailability: 'Y' },
    { section: 'CDNR', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-0405', invoiceDate: '2025-04-28', taxableValue: 5000, cgst: 300, sgst: 300, igst: 0, cess: 0, totalValue: 5600, itcAvailability: 'Y' },
  ];

  const { blocked, unclaimed, summary } = flagRule37A({ purchaseRegister, gstr2b });

  assert.equal(blocked.length, 2);
  const inv1002 = blocked.find((entry) => entry.purchase.invoiceNo === 'INV-1002');
  assert.match(inv1002.reason, /supplier default/);
  assert.equal(inv1002.blockedCredit, 56000);
  const inv1003 = blocked.find((entry) => entry.purchase.invoiceNo === 'INV-1003');
  assert.match(inv1003.reason, /absent from GSTR-2B/);
  assert.equal(inv1003.blockedCredit, 22400);

  assert.equal(unclaimed.length, 1);
  assert.equal(unclaimed[0].invoiceNo, 'FR-201');
  assert.equal(unclaimed[0].totalValue, 14160);

  assert.equal(summary.totalBlockedCredit, 78400);
  assert.equal(summary.totalUnclaimedCredit, 14160);

  assert.ok(!blocked.some((entry) => entry.purchase.invoiceNo === 'CN-0405'));
  assert.ok(!unclaimed.some((entry) => entry.invoiceNo === 'CN-0405'));
});

test('GATE 5: flatten rule37A honours itcAvailability Y and blocks A', () => {
  const purchaseRegister = [
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC', invoiceNo: 'INV-Y1', invoiceDate: '2025-04-03', taxableValue: 1000, cgst: 60, sgst: 60, igst: 0, totalValue: 1120, sourceRow: 1, isCreditNote: false },
    { gstin: '27AABCU9603R1ZN', supplierName: 'ABC', invoiceNo: 'INV-A1', invoiceDate: '2025-04-04', taxableValue: 2000, cgst: 120, sgst: 120, igst: 0, totalValue: 2240, sourceRow: 2, isCreditNote: false },
  ];
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC', invoiceNo: 'INV-Y1', invoiceDate: '2025-04-03', taxableValue: 1000, cgst: 60, sgst: 60, igst: 0, cess: 0, totalValue: 1120, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC', invoiceNo: 'INV-A1', invoiceDate: '2025-04-04', taxableValue: 2000, cgst: 120, sgst: 120, igst: 0, cess: 0, totalValue: 2240, itcAvailability: 'A' },
  ];

  const { blocked } = flagRule37A({ purchaseRegister, gstr2b });
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].purchase.invoiceNo, 'INV-A1');
  assert.match(blocked[0].reason, /supplier default/);
  assert.equal(blocked[0].blockedCredit, 2240);
});

test('GATE 6: imsSnapshot aggregates section-wise input credit', () => {
  const gstr2b = [
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1001', invoiceDate: '2025-04-03', taxableValue: 100000, cgst: 6000, sgst: 6000, igst: 0, cess: 0, totalValue: 112000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'INV-1002', invoiceDate: '2025-04-10', taxableValue: 50000, cgst: 3000, sgst: 3000, igst: 0, cess: 0, totalValue: 56000, itcAvailability: 'N' },
    { section: 'B2B', supplierGstin: '24AAACF7856R1ZY', supplierName: 'DEF ELECTRICALS', invoiceNo: 'E-221', invoiceDate: '2025-04-06', taxableValue: 30000, cgst: 0, sgst: 0, igst: 5400, cess: 0, totalValue: 35400, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '29AABCL1234J1ZL', supplierName: 'GHI PACKAGING', invoiceNo: 'PKG-87', invoiceDate: '2025-04-14', taxableValue: 25000, cgst: 1500, sgst: 1500, igst: 0, cess: 0, totalValue: 28000, itcAvailability: 'Y' },
    { section: 'B2B', supplierGstin: '07AACCP9876L1ZM', supplierName: 'JKL FREIGHT', invoiceNo: 'FR-201', invoiceDate: '2025-04-20', taxableValue: 12000, cgst: 0, sgst: 0, igst: 2160, cess: 0, totalValue: 14160, itcAvailability: 'Y' },
    { section: 'CDNR', supplierGstin: '27AABCU9603R1ZN', supplierName: 'ABC TEXTILES PVT LTD', invoiceNo: 'CN-0405', invoiceDate: '2025-04-28', taxableValue: 5000, cgst: 300, sgst: 300, igst: 0, cess: 0, totalValue: 5600, itcAvailability: 'Y' },
  ];

  const { sections, total } = imsSnapshot(gstr2b);
  assert.deepEqual(sections.B2B, { count: 5, taxable: 217000, inputCredit: 28560 });
  assert.deepEqual(sections.CDNR, { count: 1, taxable: 5000, inputCredit: 600 });
  assert.deepEqual(total, { count: 6, taxable: 222000, inputCredit: 29160 });
});

test('GATE 7: sectionLabel maps known sections and passes through unknown', () => {
  assert.equal(sectionLabel('B2B'), 'Business-to-business (table 4A)');
  assert.equal(sectionLabel('B2B-URD'), 'B2B supplies by unregistered suppliers');
  assert.equal(sectionLabel('CDNR'), 'Credit and debit notes');
  assert.equal(sectionLabel('B2BA'), 'Amended B2B documents');
  assert.equal(sectionLabel('ISD'), 'Input service distributor');
  assert.equal(sectionLabel('IMPS'), 'Import of services');
  assert.equal(sectionLabel('REV'), 'Reverse charge');
  assert.equal(sectionLabel('HSN'), 'HSN summary');
  assert.equal(sectionLabel('NOPE'), 'NOPE');
});

test('GATE 8: parseGSTR1 copes with BOM, CRLF, rupee amounts and DD-MM-YYYY dates', () => {
  const text =
    '\uFEFFBUYER GSTIN,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,TOTAL VALUE\r\n' +
    '29AABCL1234J1ZL,H-1,02-04-2025,₹1,00,000,0,0,18000,118000\r\n';
  const { rows, errors } = parseGSTR1(text);
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].taxableValue, 100000);
  assert.equal(rows[0].invoiceDate, '2025-04-02');
});

test('GATE 9: parsers never throw on garbage or missing headers', () => {
  for (const garbage of ['this is not a csv', 'GARBAGE,NO,HEADER\r\n1,2,3', '']) {
    assert.doesNotThrow(() => {
      const gstr1 = parseGSTR1(garbage);
      assert.ok(Array.isArray(gstr1.rows));
      assert.ok(gstr1.errors.length > 0);
      const gstr3b = parseGSTR3B(garbage);
      assert.ok(Array.isArray(gstr3b.rows));
      assert.ok(gstr3b.errors.length > 0);
    });
  }
});