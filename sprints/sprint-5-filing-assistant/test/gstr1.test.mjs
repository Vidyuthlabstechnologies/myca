import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseSales, eInvoiceErrors, buildGstr1, validGstRate } from '../src/gstr1.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const HEADER = 'invoiceNo,date,partyGstin,partyName,partyState,hsn,rate,taxableValue,cgst,sgst,igst,cess,isEcommerce\n';

// ── GATE 1: clean fixture parses with zero errors and exact row shape ────────
test('GATE 1: parseSales parses clean sales.csv with zero errors and exact row shape', () => {
  const res = parseSales(fixture('sales.csv'));
  assert.equal(res.errors.length, 0);
  assert.equal(res.rows.length, 10);
  const r = res.rows[0];
  assert.deepEqual(
    {
      invoiceNo: r.invoiceNo,
      date: r.date,
      partyGstin: r.partyGstin,
      partyName: r.partyName,
      partyState: r.partyState,
      hsn: r.hsn,
      rate: r.rate,
      taxableValue: r.taxableValue,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      cess: r.cess,
      isEcommerce: r.isEcommerce,
    },
    {
      invoiceNo: 'INV-101',
      date: '2026-08-03',
      partyGstin: '27AABCT1332L1ZE',
      partyName: 'Apna Retail',
      partyState: '27',
      hsn: '6204',
      rate: 18,
      taxableValue: 100000,
      cgst: 9000,
      sgst: 9000,
      igst: 0,
      cess: 0,
      isEcommerce: 'N',
    }
  );
  assert.equal(res.rows[9].invoiceNo, 'INV-110');
});

// ── GATE 2: e-invoice errors on INV-107 (28% after 31-Jan-2026) and INV-108 ──
test('GATE 2: eInvoiceErrors flags INV-107 at 28% (omitted from 1-Feb-2026) and INV-108 with TAX_MISMATCH and INVALID_HSN', () => {
  const { rows } = parseSales(fixture('sales.csv'));
  const errors = eInvoiceErrors(rows, '27');
  assert.deepEqual(errors.map((e) => [e.invoiceNo, e.code]).sort(), [
    ['INV-107', 'RATE_UNKNOWN'],
    ['INV-108', 'INVALID_HSN'],
    ['INV-108', 'TAX_MISMATCH'],
  ]);
});

test('H6: the valid GST rate set is taken on the invoice date', () => {
  assert.equal(validGstRate(28, '2026-01-31'), true);
  assert.equal(validGstRate(28, '2026-02-01'), false);
  assert.equal(validGstRate(40, '2025-09-21'), false);
  assert.equal(validGstRate(40, '2025-09-22'), true);
  assert.equal(validGstRate(12, '2026-08-20'), true);
});

// ── GATE 3: buildGstr1 produces exact fixture tables for period 2026-08 ─────
test('GATE 3: buildGstr1 period 2026-08 with exact b2b/b2cl/b2cs/nil/hsn/total values', () => {
  const { rows } = parseSales(fixture('sales.csv'));
  const out = buildGstr1({ sales: rows, supplierState: '27' });

  assert.equal(out.period, '2026-08');

  assert.deepEqual(out.tables.b2b.map((r) => r.invoiceNo), ['INV-101', 'INV-102', 'INV-106']);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.taxable, 0), 400000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.cgst, 0), 9000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.sgst, 0), 9000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.igst, 0), 54000);

  // INV-103: inter-state to Karnataka, unregistered, invoice value Rs 3,36,000 > Rs 1,00,000 (from 1-Aug-2024)
  assert.deepEqual(out.tables.b2cl, [{ state: '29', rate: 12, taxable: 300000, cgst: 0, sgst: 0, igst: 36000 }]);

  assert.deepEqual(out.tables.b2cs, [
    { state: '27', rate: 12, taxable: 130000, cgst: 7800, sgst: 7800, igst: 0 },
    { state: '33', rate: 5, taxable: 40000, cgst: 0, sgst: 0, igst: 2000 },
  ]);

  assert.deepEqual(out.tables.nilExempt, [{ rate: 0, taxable: 40000 }]);

  assert.deepEqual(out.tables.hsn, [
    { hsn: '6204', uqc: 'NOS', qty: 6, taxable: 620000, igst: 47000, cgst: 16800, sgst: 16800 },
    { hsn: '7204', uqc: 'NOS', qty: 1, taxable: 250000, igst: 45000, cgst: 0, sgst: 0 },
    { hsn: '8415', uqc: 'NOS', qty: 1, taxable: 40000, igst: 0, cgst: 0, sgst: 0 },
  ]);

  assert.equal(out.totalTaxable, 910000);
  assert.equal(out.errors.length, 3);
  assert.ok(!out.tables.b2b.some((r) => r.invoiceNo === 'INV-107'), 'an invalid-rate invoice is held back for review');

  const allHsn = new Set();
  for (const h of out.tables.hsn) {
    assert.ok(!allHsn.has(h.hsn), 'hsn rows must be unique');
    allHsn.add(h.hsn);
    assert.ok(h.uqc === 'NOS');
    assert.ok(!out.tables.b2b.some((r) => r.invoiceNo === 'INV-108'), 'INV-108 must be excluded from b2b');
  }
});

// ── GATE 4: empty sales returns false ────────────────────────────────────────
test('GATE 4: buildGstr1 returns false for empty sales', () => {
  assert.equal(buildGstr1({ sales: [] }), false);
  assert.equal(buildGstr1({ sales: null }), false);
});

// ── GATE 5: B2CL is inter-state B2C with invoice value above the dated threshold ──
test('GATE 5: inter-state B2C invoice value Rs 1,00,000 goes to B2CS, Rs 1,00,001 goes to B2CL (from 1-Aug-2024)', () => {
  const csv =
    HEADER +
    'B1,2026-08-01,,Cust,29,6204,5,95238,0,0,4762,0,N\n' +
    'B2,2026-08-02,,Cust,29,6204,5,95239,0,0,4762,0,N\n';
  const { rows, errors } = parseSales(csv);
  assert.equal(errors.length, 0);
  const out = buildGstr1({ sales: rows, supplierState: '27' });
  assert.deepEqual(out.tables.b2cs, [{ state: '29', rate: 5, taxable: 95238, cgst: 0, sgst: 0, igst: 4762 }]);
  assert.deepEqual(out.tables.b2cl, [{ state: '29', rate: 5, taxable: 95239, cgst: 0, sgst: 0, igst: 4762 }]);
});

test('H6: before 1-Aug-2024 the B2CL threshold was Rs 2,50,000', () => {
  const csv = HEADER + 'B3,2024-07-10,,Cust,29,6204,12,200000,0,0,24000,0,N\n';
  const out = buildGstr1({ sales: parseSales(csv).rows, supplierState: '27' });
  assert.equal(out.tables.b2cl.length, 0);
  assert.equal(out.tables.b2cs.length, 1);
});

test('H6: an intra-state B2C sale is never B2CL, whatever its value', () => {
  const csv = HEADER + 'B4,2026-08-03,,Cust,27,6204,12,900000,54000,54000,0,0,N\n';
  const out = buildGstr1({ sales: parseSales(csv).rows, supplierState: '27' });
  assert.equal(out.tables.b2cl.length, 0);
  assert.deepEqual(out.tables.b2cs, [{ state: '27', rate: 12, taxable: 900000, cgst: 54000, sgst: 54000, igst: 0 }]);
});

// ── GATE 6: invalid GSTIN format is rejected ─────────────────────────────────
test('GATE 6: malformed GSTIN yields INVALID_GSTIN', () => {
  const csv = HEADER + 'G1,2026-08-01,INVALID1234,BadCo,27,6204,18,100,18,0,0,0,N\n';
  const { rows } = parseSales(csv);
  const errors = eInvoiceErrors(rows, '27');
  assert.ok(errors.some((e) => e.invoiceNo === 'G1' && e.code === 'INVALID_GSTIN'));
  const excluded = buildGstr1({ sales: rows, supplierState: '27' });
  assert.equal(excluded.tables.b2b.some((r) => r.invoiceNo === 'G1'), false);
});

// ── GATE 7: STATE_MISMATCH skips further tax checks ─────────────────────────
test('GATE 7: STATE_MISMATCH is flagged and tax checks are skipped', () => {
  const csv = HEADER + 'S1,2026-08-01,29AABCT1332L1ZA,BadCo,27,6204,18,1000,0,0,500,0,N\n';
  const { rows } = parseSales(csv);
  assert.equal(rows[0].partyGstin, '29AABCT1332L1ZA');
  const errors = eInvoiceErrors(rows, '27');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].invoiceNo, 'S1');
  assert.equal(errors[0].code, 'STATE_MISMATCH');
});
