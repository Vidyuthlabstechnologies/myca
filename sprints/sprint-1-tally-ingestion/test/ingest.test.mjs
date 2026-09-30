// test/ingest.test.mjs — Sprint 1 verification gates.
// Run: npm test  (node --test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ingest, parseCSV, parseAmount, isValidDate } from '../src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const AS_OF = '2025-04-30';

// ── GATE 1: clean file ingests with zero blocking errors ────────────────────
test('GATE 1: clean Day Book ingests with ok=true, 0 blocking errors, all rows ingested', () => {
  const csv = fixture('clean-daybook.csv');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF, clientRef: 'CL-001' });

  assert.equal(res.ok, true, 'clean file must be OK');
  assert.equal(res.errors.length, 0);
  assert.equal(res.report.ingestedRows, 20);
  assert.equal(res.report.rejectedRows, 0);
  assert.ok(res.report.durationMs > 0);
});

// ── GATE 2: dirty file rejects bad rows but keeps good ones ─────────────────
test('GATE 2: dirty file surfaces blocking + warning issues, isolates exceptions', () => {
  const csv = fixture('dirty-daybook.csv');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF });

  // Blocking errors expected:
  //  INVALID_AMOUNT (NOT_A_NUMBER) on journal 2007
  //  MISSING_VOUCHER_TYPE on blank voucher-type row 2021
  const errCodes = new Set(res.errors.map((e) => e.code));
  assert.ok(errCodes.has('INVALID_AMOUNT'), 'must flag non-numeric amount');
  assert.ok(errCodes.has('MISSING_VOUCHER_TYPE'), 'must flag blank voucher type');

  // Warnings expected:
  const warnCodes = new Set(res.warnings.map((w) => w.code));
  for (const c of ['NEGATIVE_AMOUNT', 'FUTURE_DATED', 'DUPLICATE_VOUCHER', 'INVALID_GSTIN', 'INVALID_HSN', 'INVALID_TDS_SECTION', 'MISSING_AMOUNT']) {
    assert.ok(warnCodes.has(c), `expected warning ${c}`);
  }

  assert.ok(res.report.blockingErrors >= 2, 'blockingErrors >= 2');
  assert.ok(res.report.rejectedRows >= 2, 'rejected rows counted');
  assert.equal(res.report.ingestedRows, res.report.totalRows - res.report.rejectedRows);
});

// ── GATE 3: structurally broken file is rejected with a specific error ──────
test('GATE 3: missing required column -> specific MISSING_REQUIRED_COLUMN error', () => {
  const csv = fixture('missing-columns.csv');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF });

  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'MISSING_REQUIRED_COLUMN' && e.field === 'voucherType'));
});

// ── GATE 4: empty input is rejected as EMPTY_FILE ───────────────────────────
test('GATE 4: empty input -> EMPTY_FILE error', () => {
  const res = ingest({ type: 'csv', content: '\n\n' }, { asOfDate: AS_OF });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'EMPTY_FILE'));
});

// ── GATE 5: no recognizable header -> NO_HEADER_ROW ─────────────────────────
test('GATE 5: garbage input -> NO_HEADER_ROW error', () => {
  const res = ingest({ type: 'csv', content: 'hello,world\n1,2\n3,4\n' }, { asOfDate: AS_OF });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'NO_HEADER_ROW'));
});

// ── GATE 6: matrix input path (XLSX bridge) works ───────────────────────────
test('GATE 6: matrix input (spreadsheet bridge) ingests clean data', () => {
  const rows = [
    ['Date', 'Voucher Type', 'Voucher No', 'Particulars', 'Debit', 'Credit'],
    ['01-04-2025', 'Receipt', '3001', 'Acme Co', '', '100000'],
    ['02-04-2025', 'Sales', '3002', 'Beta Ltd', '118000', '']
  ];
  const res = ingest({ type: 'matrix', rows }, { asOfDate: AS_OF });
  assert.equal(res.ok, true);
  assert.equal(res.report.ingestedRows, 2);
});

// ── GATE 7: CSV parser handles quotes, commas, escaped quotes ───────────────
test('GATE 7: CSV parser handles embedded commas and escaped quotes', () => {
  const csv = 'a,b,c\n"Phone, Bill","said ""hi""",12\n';
  const rows = parseCSV(csv);
  assert.equal(rows[1][0], 'Phone, Bill');
  assert.equal(rows[1][1], 'said "hi"');
  assert.equal(rows[1][2], '12');
});

// ── GATE 8: amount parser handles currency, parentheses, trailing minus ─────
test('GATE 8: parseAmount handles ₹, commas, parenthetical negatives, trailing minus', () => {
  assert.deepEqual(parseAmount('₹1,23,456.50'), { ok: true, value: 123456.5 });
  assert.deepEqual(parseAmount('(500)'), { ok: true, value: -500 });
  assert.deepEqual(parseAmount('500-'), { ok: true, value: -500 });
  assert.deepEqual(parseAmount(''), { ok: false, value: null });
  assert.deepEqual(parseAmount('abc'), { ok: false, value: null });
});

// ── GATE 9: date parsing covers dmy, ymd, dd-mon-yyyy, future detection ─────
test('GATE 9: isValidDate handles multiple formats and future dates', () => {
  assert.equal(isValidDate('01-04-2025', AS_OF), true);
  assert.equal(isValidDate('2025-04-01', AS_OF), true);
  assert.equal(isValidDate('01-Apr-2025', AS_OF), true);
  assert.equal(isValidDate('31-02-2025', AS_OF), false); // invalid calendar date
  assert.equal(isValidDate('10-05-2025', AS_OF), true);  // parses, but flagged future by caller
  assert.equal(isValidDate('garbage', AS_OF), false);
});

// ── GATE 10: canonical rows are well-shaped ─────────────────────────────────
test('GATE 10: canonical output exposes computedAmount, direction, sourceRow', () => {
  const csv = fixture('clean-daybook.csv');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF });
  const sales4567 = res.rows.find((r) => r.gstin === '27AABMH4567M1ZK');
  assert.deepEqual(sales4567, {
    ...sales4567,
    amount: null,
    computedAmount: 94400,
    direction: 'debit',
    sourceRow: 11
  });
  assert.equal(sales4567.hsn, '8421');
  assert.equal(sales4567.igst, 0);
});

// ── BENCHMARK GATE: bad-file rejection is 100% on our fixtures ──────────────
test('BENCHMARK GATE: every broken fixture input is rejected with a specific error', () => {
  const cases = [
    { name: 'empty', content: '\n\n', expect: 'EMPTY_FILE' },
    { name: 'garbage', content: 'foo,bar\n1,2\n', expect: 'NO_HEADER_ROW' },
    { name: 'missing-col', content: fixture('missing-columns.csv'), expect: 'MISSING_REQUIRED_COLUMN' }
  ];
  for (const c of cases) {
    const res = ingest({ type: 'csv', content: c.content }, { asOfDate: AS_OF });
    assert.equal(res.ok, false, `${c.name} must be rejected`);
    assert.ok(res.errors.some((e) => e.code === c.expect), `${c.name} must carry specific ${c.expect}`);
  }
});