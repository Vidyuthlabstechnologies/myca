import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInward, buildGstr3b } from '../src/gstr3b.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readFixture(f) {
  return readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');
}

async function getParseSales() {
  try {
    const { parseSales } = await import('../src/gstr1.mjs');
    return parseSales;
  } catch {
    const { parseAmount } = await import('../src/core.mjs');
    return function (text) {
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const obj = {};
        for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j];
        rows.push({
          invoiceNo: obj.invoiceNo,
          date: obj.date,
          partyGstin: obj.partyGstin,
          partyName: obj.partyName,
          partyState: obj.partyState,
          hsn: obj.hsn,
          rate: parseAmount(obj.rate),
          taxableValue: parseAmount(obj.taxableValue),
          cgst: parseAmount(obj.cgst),
          sgst: parseAmount(obj.sgst),
          igst: parseAmount(obj.igst),
          cess: parseAmount(obj.cess),
          isEcommerce: obj.isEcommerce,
        });
      }
      return { rows, errors: [] };
    };
  }
}

const parseSales = await getParseSales();
const salesText = readFixture('sales.csv');
const inwardText = readFixture('inward.csv');
const { rows: salesRows } = parseSales(salesText);
const { rows: inwardRows } = parseInward(inwardText);
const result = buildGstr3b({ sales: salesRows, inward: inwardRows, supplierState: '27' });

test('GATE 1: 3.1a rows order and values', () => {
  const expected = [
    { rate: 5, interState: true, taxable: 40000, cgst: 0, sgst: 0, igst: 2000 },
    { rate: 12, interState: false, taxable: 130000, cgst: 7800, sgst: 7800, igst: 0 },
    { rate: 12, interState: true, taxable: 300000, cgst: 0, sgst: 0, igst: 36000 },
    { rate: 18, interState: false, taxable: 100000, cgst: 9000, sgst: 9000, igst: 0 },
    { rate: 18, interState: true, taxable: 300000, cgst: 0, sgst: 0, igst: 54000 },
    { rate: 28, interState: true, taxable: 120000, cgst: 0, sgst: 0, igst: 33600 },
  ];
  assert.equal(result.outward.rows3a.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(result.outward.rows3a[i].rate, expected[i].rate, `row ${i} rate`);
    assert.equal(result.outward.rows3a[i].interState, expected[i].interState, `row ${i} interState`);
    assert.equal(result.outward.rows3a[i].taxable, expected[i].taxable, `row ${i} taxable`);
    assert.equal(result.outward.rows3a[i].igst, expected[i].igst, `row ${i} igst`);
    assert.equal(result.outward.rows3a[i].cgst, expected[i].cgst, `row ${i} cgst`);
    assert.equal(result.outward.rows3a[i].sgst, expected[i].sgst, `row ${i} sgst`);
  }
});

test('GATE 2: outward totals', () => {
  assert.equal(result.outward.totals.interTaxable, 760000);
  assert.equal(result.outward.totals.interIgst, 125600);
  assert.equal(result.outward.totals.intraTaxable, 230000);
  assert.equal(result.outward.totals.intraCgst, 16800);
  assert.equal(result.outward.totals.intraSgst, 16800);
});

test('GATE 3: nilExemptTaxable', () => {
  assert.equal(result.outward.nilExemptTaxable, 40000);
});

test('GATE 4: ITC available', () => {
  assert.equal(result.itc.available.igst, 94400);
  assert.equal(result.itc.available.cgst, 18000);
  assert.equal(result.itc.available.sgst, 18000);
});

test('GATE 5: importServicesIgst', () => {
  assert.equal(result.itc.importServicesIgst, 45000);
});

test('GATE 6: ITC ineligible', () => {
  assert.equal(result.itc.ineligible.igst, 0);
  assert.equal(result.itc.ineligible.cgst, 6300);
  assert.equal(result.itc.ineligible.sgst, 6300);
});

test('GATE 7: netItc', () => {
  assert.equal(result.itc.netItc, 130400);
});

test('GATE 8: parseInward returns correct row keys and types', () => {
  const { rows, errors } = parseInward(inwardText);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 6);
  const r0 = rows[0];
  assert.equal(r0.invoiceNo, 'INV-201');
  assert.equal(typeof r0.rate, 'number');
  assert.equal(r0.rate, 18);
  assert.equal(typeof r0.taxableValue, 'number');
  assert.equal(r0.itcEligible, 'Y');
  assert.equal(r0.itcAvailability, 'Y');
  assert.equal(r0.supplierGstin, '27AABCT1332L1ZE');
  const r4 = rows[4];
  assert.equal(r4.supplierGstin, '');
  assert.equal(r4.itcEligible, 'Y');
  assert.equal(r4.itcAvailability, 'Y');
});

test('GATE 9: boundary - ineligible rows go to 4(D)', () => {
  const csv = [
    'invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,isInputService,itcEligible,itcAvailability',
    'B-001,2026-08-01,27AABCT1332L1ZE,Test,6204,18,100000,9000,9000,0,N,Y,N',
    'B-002,2026-08-02,29AABCT1332L1ZA,Test2,7204,18,50000,0,0,9000,N,N,Y',
  ].join('\n');
  const { rows } = parseInward(csv);
  const r = buildGstr3b({ sales: [], inward: rows, supplierState: '27' });
  assert.equal(r.itc.ineligible.cgst, 9000);
  assert.equal(r.itc.ineligible.sgst, 9000);
  assert.equal(r.itc.ineligible.igst, 9000);
  assert.equal(r.itc.available.igst, 0);
  assert.equal(r.itc.available.cgst, 0);
  assert.equal(r.itc.available.sgst, 0);
});

test('GATE 10: boundary - import of services tracks importServicesIgst', () => {
  const csv = [
    'invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,isInputService,itcEligible,itcAvailability',
    'B-010,2026-08-01,,Import Co,9985,18,100000,0,0,18000,Y,Y,Y',
    'B-011,2026-08-02,27AABCT1332L1ZE,Domestic,6204,18,80000,7200,7200,0,N,Y,Y',
  ].join('\n');
  const { rows } = parseInward(csv);
  const r = buildGstr3b({ sales: [], inward: rows, supplierState: '27' });
  assert.equal(r.itc.available.igst, 18000);
  assert.equal(r.itc.importServicesIgst, 18000);
  assert.equal(r.itc.available.cgst, 7200);
  assert.equal(r.itc.netItc, 32400);
});

test('GATE 11: boundary - 0-taxable inward row is ineligible', () => {
  const csv = [
    'invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,isInputService,itcEligible,itcAvailability',
    'B-020,2026-08-01,27AABCT1332L1ZE,Zero,6204,18,0,0,0,0,N,Y,Y',
  ].join('\n');
  const { rows } = parseInward(csv);
  const r = buildGstr3b({ sales: [], inward: rows, supplierState: '27' });
  assert.equal(r.itc.available.igst, 0);
  assert.equal(r.itc.available.cgst, 0);
  assert.equal(r.itc.available.sgst, 0);
  assert.equal(r.itc.ineligible.igst, 0);
  assert.equal(r.itc.ineligible.cgst, 0);
  assert.equal(r.itc.ineligible.sgst, 0);
});

test('GATE 12: period derived from sales dates', () => {
  assert.equal(result.period, '2026-08');
});
