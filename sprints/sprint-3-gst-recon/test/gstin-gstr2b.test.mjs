import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGstin } from '../src/gstin.mjs';
import { parseGstr2B } from '../src/gstr2b.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gstr2bCsv = readFileSync(resolve(__dirname, 'fixtures', 'gstr2b-b2b.csv'), 'utf8');

test('GATE 1: valid GSTIN 27AAACH7409R1Z1 fully passes', () => {
  const r = validateGstin('27AAACH7409R1Z1');
  assert.equal(r.ok, true);
  assert.equal(r.gstin, '27AAACH7409R1Z1');
  assert.equal(r.stateCode, '27');
  assert.equal(r.stateName, 'Maharashtra');
  assert.equal(r.pan, 'AAACH7409R');
  assert.equal(r.panOk, true);
  assert.equal(r.checkDigitOk, true);
  assert.equal(r.errors.length, 0);
});

test('GATE 2: fixture supplier GSTIN 27AABCU9603R1ZN passes', () => {
  const r = validateGstin('27AABCU9603R1ZN');
  assert.equal(r.ok, true);
  assert.equal(r.stateCode, '27');
  assert.equal(r.stateName, 'Maharashtra');
  assert.equal(r.panOk, true);
  assert.equal(r.checkDigitOk, true);
});

test('GATE 3: bad check digit on same PAN combination is rejected (official check character is N, not P)', () => {
  const r = validateGstin('27AABCU9603R1ZP');
  assert.equal(r.ok, false);
  assert.equal(r.checkDigitOk, false);
  assert.equal(r.panOk, true);
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some(e => e.code === 'CHECK_DIGIT_MISMATCH'));
});

test('GATE 4: non-Maharashtra fixture supplier 24AAACF7856R1ZY is Gujarat', () => {
  const r = validateGstin('24AAACF7856R1ZY');
  assert.equal(r.ok, true);
  assert.equal(r.stateCode, '24');
  assert.equal(r.stateName, 'Gujarat');
  assert.equal(r.panOk, true);
  assert.equal(r.checkDigitOk, true);
});

test('GATE 5: wrong length GSTIN is rejected', () => {
  const r = validateGstin('27AAACH7409R1Z');
  assert.equal(r.ok, false);
  assert.equal(r.gstin, '27AAACH7409R1Z');
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some(e => e.code === 'INVALID_LENGTH'));
});

test('GATE 6: bad PAN structure (digits inside 5-letter group) is rejected', () => {
  const r = validateGstin('27AAB1237409R13');
  assert.equal(r.ok, false);
  assert.equal(r.panOk, false);
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some(e => e.code === 'INVALID_PAN'));
});

test('GATE 7: state code 28 (never a GSTIN prefix) is rejected with a state error; 99 is Centre Jurisdiction', () => {
  assert.equal(validateGstin('99AABCU9603R1ZC').ok, true);
  const r = validateGstin('28AABCU9603R1Z?');
  assert.equal(r.ok, false);
  assert.equal(r.gstin, '28AABCU9603R1Z?');
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some(e => e.code === 'INVALID_STATE'));
  assert.ok(r.errors.some(e => e.message.toLowerCase().includes('state')));
});

test('GATE 8: parseGstr2B fixture yields 6 rows and 0 errors', () => {
  const result = parseGstr2B(gstr2bCsv);
  assert.equal(result.rows.length, 6);
  assert.equal(result.errors.length, 0);
  const row1 = result.rows[0];
  assert.equal(row1.section, 'B2B');
  assert.equal(row1.supplierGstin, '27AABCU9603R1ZN');
  assert.equal(row1.supplierName, 'ABC TEXTILES PVT LTD');
  assert.equal(row1.invoiceNo, 'INV-1001');
  assert.equal(row1.invoiceDate, '2025-04-03');
  assert.equal(row1.taxableValue, 100000);
  assert.equal(row1.cgst, 6000);
  assert.equal(row1.sgst, 6000);
  assert.equal(row1.igst, 0);
  assert.equal(row1.cess, 0);
  assert.equal(row1.totalValue, 112000);
  assert.equal(row1.itcAvailability, 'Y');
});

test('GATE 9: fixture row 2 itcAvailability is N', () => {
  const result = parseGstr2B(gstr2bCsv);
  assert.equal(result.rows[1].invoiceNo, 'INV-1002');
  assert.equal(result.rows[1].itcAvailability, 'N');
});

test('GATE 10: fixture row 6 (CDNR credit note) stays positive', () => {
  const result = parseGstr2B(gstr2bCsv);
  const row6 = result.rows[5];
  assert.equal(row6.section, 'CDNR');
  assert.equal(row6.totalValue, 5600);
  assert.equal(row6.sourceRow, 6);
});

test('GATE 11: BOM + CRLF + rupee-thousand amounts are normalized', () => {
  const csv = '\uFEFFSECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY\r\n' +
    'B2B,27AABCU9603R1ZN,TEST SUPPLIER,INV-TEST,01-04-2025,"₹1,00,000","₹6,000","₹6,000",0,0,"₹1,12,000",Y\r\n';
  const result = parseGstr2B(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].taxableValue, 100000);
  assert.equal(result.rows[0].invoiceDate, '2025-04-01');
});

test('GATE 12: garbage input yields an errors entry, never a throw', () => {
  const result = parseGstr2B('this is not a csv at all');
  assert.ok(result.errors.length > 0);
  assert.equal(result.rows.length, 0);
});

test('GATE 13: row with all money columns empty yields a MISSING_AMOUNT error', () => {
  const csv = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY\n' +
    'B2B,27AABCU9603R1ZN,TEST SUPPLIER,INV-1,01-04-2025,,,,,,,Y\n';
  const result = parseGstr2B(csv);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'MISSING_AMOUNT');
  assert.equal(result.errors[0].row, 1);
});