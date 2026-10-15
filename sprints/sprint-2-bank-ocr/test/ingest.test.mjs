// test/ingest.test.mjs — Sprint 2 verification gates.
// Run: npm test  (node --test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ingest, ingestPdf, parseCSV, parseFixedWidth, parseAmount, parseDate,
  classify, extractPdfText
} from '../src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f));
const AS_OF = '2025-04-30';

// ── GATE 1: clean HDFC CSV ingests, ties balances, all rows including opening ─
test('GATE 1: clean HDFC CSV ingests with 0 blocking errors, continuous balances', () => {
  const csv = fixture('hdfc-clean.csv').toString('utf8');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF, clientRef: 'CL-100' });

  assert.equal(res.ok, true, 'clean statement must be OK');
  assert.equal(res.report.ingestedRows, 18);
  assert.equal(res.report.rejectedRows, 0);
  assert.equal(res.report.warnings, 0, 'no warnings on a clean running-balance export');
  assert.ok(res.report.inflow > 0 && res.report.outflow > 0);
  // running balance continuity: last row balance equals opening + net
  const last = res.rows[res.rows.length - 1];
  assert.equal(last.balance, 469420.00);
  assert.equal(last.type, 'debit');
  assert.equal(last.date, '2025-04-18');
});

// ── GATE 2: dirty statement isolates exceptions, still ingests good rows ─────
test('GATE 2: dirty statement surfaces blocking + warning issues, isolates exceptions', () => {
  const csv = fixture('hdfc-dirty.csv').toString('utf8');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF });

  const warnCodes = new Set(res.warnings.map((w) => w.code));
  for (const c of ['MISSING_NARRATION', 'NEGATIVE_AMOUNT', 'FUTURE_DATED', 'BOTH_SIDES', 'BALANCE_BREAK', 'INVALID_DATE', 'MISSING_AMOUNT']) {
    assert.ok(warnCodes.has(c) || (c === 'INVALID_DATE' && res.errors.some((e) => e.code === 'INVALID_DATE')), `expected ${c} surfaced`);
  }
  assert.ok(res.report.ingestedRows <= res.report.totalRows);
  assert.equal(res.report.ingestedRows, res.report.totalRows - res.report.rejectedRows);
  assert.ok(res.report.blockingErrors > 0, 'dirty file must surface at least one blocking error');
});

// ── GATE 3: fixed-width TXT statement parses with correct columns ────────────
test('GATE 3: HDFC text statement parses fixed-width layout', () => {
  const txt = fixture('hdfc-text-statement.txt').toString('utf8');
  const res = ingest({ type: 'text', content: txt }, { asOfDate: AS_OF });

  assert.equal(res.ok, true, 'TXT rows tie their running balances -> OK');
  assert.equal(res.report.ingestedRows, 12);
  assert.equal(res.errors.length, 0);
  assert.equal(res.warnings.filter((w) => w.code === 'BALANCE_BREAK').length, 0, 'all fixed-width rows must tie balances');
  const rent = res.rows.find((r) => /RENT/i.test(r.narration));
  assert.equal(rent.debit, 45000.00);
  assert.equal(rent.amount, -45000.00, 'debit is signed negative');
  assert.equal(rent.classification.category, 'rent_expense');
  const interest = res.rows.find((r) => /INTEREST/i.test(r.narration));
  assert.equal(interest.classification.category, 'interest_income');
  assert.equal(interest.classification.tdsSection, '194A');
  assert.equal(interest.type, 'credit', 'interest CR parsed on deposit column');
  const machinery = res.rows.find((r) => /MACHINERY/i.test(r.narration));
  assert.equal(machinery.classification.category, 'capex');
  assert.equal(machinery.classification.isCapEx, true);
});

// ── GATE 4: matrix input (XLSX bridge) works for bank CSVs ──────────────────
test('GATE 4: matrix input (spreadsheet bridge) ingests bank data', () => {
  const rows = [
    ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'],
    ['01-04-2025', 'OPENING', '', '50000', '50000'],
    ['02-04-2025', 'NEFT CR SALE', '', '100000', '150000']
  ];
  const res = ingest({ type: 'matrix', rows }, { asOfDate: AS_OF });
  assert.equal(res.ok, true);
  assert.equal(res.report.ingestedRows, 2);
  assert.equal(res.rows[1].balance, 150000);
});

// ── GATE 5: classification transparency — category + cap/rev + TDS section ──
test('GATE 5: narration classification is rule-cited and TDS-aware', () => {
  const cases = [
    ['NEFT CR - SALE OF GOODS', 'sales', false, null],
    ['IMPS DR - RENT PAID', 'rent_expense', false, '194I'],
    ['SALARY - EMPLOYEE', 'salary', false, '192'],
    ['GST PAYMENT - CGST', 'tax_payment', null, null],
    ['DR - MACHINERY PURCHASE', 'capex', true, null],
    ['FREIGHT AND COURIER', 'logistics', false, '194C'],
    ['PROFESSIONAL FEES - LEGAL', 'professional_fees', false, '194J'],
    ['CR - PROPRIETOR CAPITAL INTRO', 'loan_capital_in', null, null],
    ['DR - LOAN REPAYMENT PRINCIPAL', 'loan_capital_out', null, null]
  ];
  for (const [narration, category, isCapEx, tds] of cases) {
    const c = classify(narration);
    assert.equal(c.category, category, `category for "${narration}"`);
    assert.equal(c.isCapEx, isCapEx, `capEx for "${narration}"`);
    assert.equal(c.tdsSection, tds, `TDS for "${narration}"`);
    assert.ok(Array.isArray(c.ruleIds));
  }
  // Explicit section reference in narration overrides
  const c = classify('TDS DEPOSIT - CHALLAN - SECTION 194J');
  assert.equal(c.tdsSection, '194J');
  // RENT RECEIVED by the firm is NOT its own 194I
  const r = classify('CR - RENT RECEIVED', { kind: 'credit' });
  assert.equal(r.tdsSection, null, 'rent received must not tag 194I on firm');
});

// ── GATE 6: PDF text-layer extraction (digital statement, no OCR needed) ─────
test('GATE 6: digital PDF statement extracts rows without OCR engine', async () => {
  const pdf = fixture('digital-statement.pdf');
  const res = await ingestPdf(pdf, { asOfDate: AS_OF });
  assert.equal(res.ok, true, 'digital PDF should ingest with 0 errors');
  assert.ok(res.report.ingestedRows >= 2);
  assert.ok(res.report.totalRows > 0);
});

// ── GATE 7: scanned (no-text-layer) PDF requires an OCR adapter — specific err ─
test('GATE 7: scanned PDF returns SCANNED_PDF_NEEDS_OCR instead of guessing', async () => {
  // A minimal PDF with no text stream (image-only page)
  const noText = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << >> >>\nendobj\n' +
    '4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\n' +
    'trailer\n<< /Root 1 0 R >>\nendobj\n%%EOF'
  );
  const res = await ingestPdf(noText, { asOfDate: AS_OF });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'SCANNED_PDF_NEEDS_OCR'));
});

// ── GATE 8: OCR adapter contract — supplied engine turns scans into rows ─────
test('GATE 8: plugged-in ocrEngine satisfies adapter contract', async () => {
  const noText = Buffer.from('%PDF-1.4\n%%EOF'); // synthetic "scan"
  const fakeOcr = async () => ({
    text: 'DATE       NARRATION            WITHDRAWAL  DEPOSIT  BALANCE\n' +
          '01/04/2025 OPENING BALANCE                 0       50000   50000\n' +
          '02/04/2025 NEFT CR SALE OF GOODS           0      100000  150000\n'
  });
  const res = await ingestPdf(noText, { asOfDate: AS_OF, ocrEngine: fakeOcr });
  assert.equal(res.ok, true);
  assert.equal(res.report.ingestedRows, 2);
  assert.equal(res.rows[1].classification.category, 'sales');
  // Guarantee no silent fallback: OCR that yields empty text errors out
  const emptyOcr = async () => ({ text: '' });
  const bad = await ingestPdf(noText, { asOfDate: AS_OF, ocrEngine: emptyOcr });
  assert.ok(bad.errors.some((e) => e.code === 'OCR_NO_TEXT'));
});

// ── GATE 9: empty / garbage inputs fail with specific structural errors ──────
test('GATE 9: empty and garbage inputs reject with specific errors', () => {
  const empty = ingest({ type: 'csv', content: '\n\n' }, { asOfDate: AS_OF });
  assert.ok(empty.errors.some((e) => e.code === 'EMPTY_FILE'));
  const garbage = ingest({ type: 'csv', content: 'foo,bar\n1,2\n' }, { asOfDate: AS_OF });
  assert.ok(garbage.errors.some((e) => e.code === 'NO_HEADER_ROW'));
  const unknown = ingest({ type: 'csv', content: 'hello,world\n3,4\n' }, { asOfDate: AS_OF });
  assert.ok(unknown.errors.some((e) => e.code === 'NO_HEADER_ROW'));
});

// ── GATE 10: canonical transaction shape is complete and auditable ───────────
test('GATE 10: canonical row exposes classification, sourceRow, signed amount', () => {
  const csv = fixture('hdfc-clean.csv').toString('utf8');
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF });
  const tx = res.rows.find((r) => /SALE OF GOODS/i.test(r.narration));
  assert.deepEqual(tx, {
    ...tx,
    type: 'credit',
    amount: 118000.00,
    narration: 'NEFT CR - SALE OF GOODS - ZOMATO PVT LTD',
    sourceRow: 2,
    _blocking: false,
    classification: { category: 'sales', isCapEx: false, isRevenue: true, tdsSection: null, ruleIds: ['r.sales'], note: 'sales realisation', confidence: 'rule' }
  });
});

// ── GATE 11: outliers a CA actually sees — UPI, EMI, refunds, merchant names ─
test('GATE 11: real-world casual narrations classify sensibly', () => {
  const cases = [
    ['UPI/PHONEPE-9188 SALE OF GOODS', 'sales'],
    ['NEFT CR-TRANSFER FROM OWN ACCOUNT', 'transfer'],
    ['DR MATURITY PROCEEDS', 'interest_income'],
    ['BILLPAY-ELECTRICITY-221', 'utilities'],
    ['SIP-MUTUAL FUND-HDFC', 'investments']
  ];
  for (const [n, expected] of cases) {
    assert.equal(classify(n).category, expected, `${n} -> ${expected}`);
  }
});
test('GATE 12: amounts with Rs., INR, ₹, Dr/Cr markers, parentheses and trailing minus parse to one signed figure', () => {
  assert.deepEqual(parseAmount('Rs. 1,000.50'), { ok: true, value: 1000.5, side: null });
  assert.deepEqual(parseAmount('Rs.1000'), { ok: true, value: 1000, side: null });
  assert.deepEqual(parseAmount('INR 2,50,000'), { ok: true, value: 250000, side: null });
  assert.deepEqual(parseAmount('₹ 75.25'), { ok: true, value: 75.25, side: null });
  assert.deepEqual(parseAmount('1,500.00 Dr'), { ok: true, value: -1500, side: 'debit' });
  assert.deepEqual(parseAmount('1,500.00 Cr'), { ok: true, value: 1500, side: 'credit' });
  assert.deepEqual(parseAmount('Dr 320'), { ok: true, value: -320, side: 'debit' });
  assert.deepEqual(parseAmount('Rs. 4,69,420.00 Cr'), { ok: true, value: 469420, side: 'credit' });
  assert.deepEqual(parseAmount('(2,000)'), { ok: true, value: -2000, side: null });
  assert.deepEqual(parseAmount('2,000-'), { ok: true, value: -2000, side: null });
  assert.deepEqual(parseAmount('-2,000'), { ok: true, value: -2000, side: null });
  assert.equal(parseAmount('abc').ok, false);
  assert.equal(parseAmount('1.2.3').ok, false);
  assert.equal(parseAmount('').ok, false);
  const csv = 'Date,Narration,Amount,Balance\n01/04/2025,Opening,,"Rs. 10,000.00 Cr"\n02/04/2025,UPI to Raj,"1,000.00 Dr","9,000.00 Cr"\n03/04/2025,NEFT from Kiran,"Rs. 5,000 Cr","14,000.00 Cr"\n';
  const res = ingest({ type: 'csv', content: csv }, { asOfDate: AS_OF, clientRef: 'CL-101' });
  const rows = res.rows.filter((r) => r.type === 'debit' || r.type === 'credit');
  assert.deepEqual(rows.map((r) => [r.type, r.amount]), [['debit', -1000], ['credit', 5000]]);
});
