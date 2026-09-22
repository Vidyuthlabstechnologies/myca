import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseSales, eInvoiceErrors, buildGstr1 } from '../src/gstr1.mjs';

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

// ── GATE 2: e-invoice errors exactly on INV-108 ──────────────────────────────
test('GATE 2: eInvoiceErrors flags exactly INV-108 with TAX_MISMATCH and INVALID_HSN', () => {
  const { rows } = parseSales(fixture('sales.csv'));
  const errors = eInvoiceErrors(rows, '27');
  assert.equal(errors.length, 2);
  for (const e of errors) {
    assert.equal(e.invoiceNo, 'INV-108');
  }
  const codes = errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['INVALID_HSN', 'TAX_MISMATCH']);
});

// ── GATE 3: buildGstr1 produces exact fixture tables for period 2026-08 ─────
test('GATE 3: buildGstr1 period 2026-08 with exact b2b/b2cl/b2cs/nil/hsn/total values', () => {
  const { rows } = parseSales(fixture('sales.csv'));
  const out = buildGstr1({ sales: rows, supplierState: '27' });

  assert.equal(out.period, '2026-08');

  assert.equal(out.tables.b2b.length, 4);
  assert.deepEqual(out.tables.b2b.map((r) => r.invoiceNo), ['INV-101', 'INV-102', 'INV-106', 'INV-107']);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.taxable, 0), 520000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.cgst, 0), 9000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.sgst, 0), 9000);
  assert.equal(out.tables.b2b.reduce((s, r) => s + r.igst, 0), 87600);

  assert.deepEqual(out.tables.b2cl, [{ state: '29', rate: 12, taxable: 300000, cgst: 0, sgst: 0, igst: 36000 }]);

  assert.deepEqual(out.tables.b2cs, [
    { state: '27', rate: 12, taxable: 130000, cgst: 7800, sgst: 7800, igst: 0 },
    { state: '33', rate: 5, taxable: 40000, cgst: 0, sgst: 0, igst: 2000 },
  ]);

  assert.deepEqual(out.tables.nilExempt, [{ rate: 0, taxable: 40000 }]);

  assert.deepEqual(out.tables.hsn, [
    { hsn: '2710', uqc: 'NOS', qty: 1, taxable: 120000, igst: 33600, cgst: 0, sgst: 0 },
    { hsn: '6204', uqc: 'NOS', qty: 6, taxable: 620000, igst: 47000, cgst: 16800, sgst: 16800 },
    { hsn: '7204', uqc: 'NOS', qty: 1, taxable: 250000, igst: 45000, cgst: 0, sgst: 0 },
    { hsn: '8415', uqc: 'NOS', qty: 1, taxable: 40000, igst: 0, cgst: 0, sgst: 0 },
  ]);

  assert.equal(out.totalTaxable, 1030000);
  assert.equal(out.errors.length, 2);

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

// ── GATE 5: B2CL vs B2CS threshold boundary (250000 vs 250001) ──────────────
test('GATE 5: value 250000 goes to B2CS while 250001 goes to B2CL', () => {
  const csv =
    HEADER +
    'B1,2026-08-01,,Cust,27,6204,12,250000,0,0,30000,0,N\n' +
    'B2,2026-08-02,,Cust,27,6204,12,250001,0,0,30000,0,N\n';
  const { rows, errors } = parseSales(csv);
  assert.equal(errors.length, 0);
  const out = buildGstr1({ sales: rows, supplierState: '27' });
  assert.deepEqual(out.tables.b2cs, [{ state: '27', rate: 12, taxable: 250000, cgst: 0, sgst: 0, igst: 30000 }]);
  assert.deepEqual(out.tables.b2cl, [{ state: '27', rate: 12, taxable: 250001, cgst: 0, sgst: 0, igst: 30000 }]);
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
