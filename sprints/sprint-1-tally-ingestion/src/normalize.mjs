// normalize.mjs
// Turns validated rows into a clean canonical record set + an ingestion report.
// Rows with blocking errors are routed to rejectedRows (never silently dropped).

import { parseDate, parseAmount } from './validate.mjs';

const VOUCHER_TYPE_DIRECTIONS = new Set(['payment', 'receipt', 'contra', 'journal']);

export function buildCanonicalRow(row, map, rowIndex, issuesByRow, asOfDate) {
  const get = (key) => {
    const col = map[key];
    return col === undefined ? undefined : row[col];
  };

  const debit = parseAmount(get('debit')).ok ? parseAmount(get('debit')).value : null;
  const credit = parseAmount(get('credit')).ok ? parseAmount(get('credit')).value : null;
  const amount = parseAmount(get('amount')).ok ? parseAmount(get('amount')).value : null;

  let direction = 'unclassified';
  const type = String(get('voucherType') || '').trim().toLowerCase();
  if (VOUCHER_TYPE_DIRECTIONS.has(type)) direction = type;
  else if (debit != null && debit !== 0) direction = 'debit';
  else if (credit != null && credit !== 0) direction = 'credit';
  else if (amount != null && amount !== 0) direction = 'amount';

  const parsedDate = parseDate(get('date'), asOfDate);
  const iso = parsedDate.ok ? parsedDate.value : null;

  return {
    date: iso,
    voucherType: String(get('voucherType') || '').trim(),
    voucherNo: String(get('voucherNo') || '').trim(),
    ledger: String(get('ledger') || '').trim(),
    narration: String(get('narration') || '').trim(),
    debit: debit == null ? null : round2(debit),
    credit: credit == null ? null : round2(credit),
    amount: amount == null ? null : round2(amount),
    computedAmount: round2(netAmount(debit, credit, amount)),
    direction,
    gstin: String(get('gstin') || '').trim().toUpperCase() || null,
    gstRate: parseNum(get('gstRate')),
    hsn: String(get('hsn') || '').trim() || null,
    taxableValue: parseNum(get('taxableValue')),
    cgst: parseNum(get('cgst')),
    sgst: parseNum(get('sgst')),
    igst: parseNum(get('igst')),
    tdsSection: String(get('tdsSection') || '').trim().toUpperCase() || null,
    tdsRate: parseNum(get('tdsRate')),
    tcsSection: String(get('tcsSection') || '').trim().toUpperCase() || null,
    sourceRow: rowIndex + 1,
    _blocking: issuesByRow.some((i) => i.severity === 'error')
  };
}

function parseNum(raw) {
  const p = parseAmount(raw);
  return p.ok ? p.value : null;
}

function netAmount(d, c, a) {
  if (a != null && a !== 0) return a;
  if (d != null && d !== 0) return d;
  if (c != null && c !== 0) return c;
  return 0;
}

function round2(n) { return n == null ? null : Math.round(n * 100) / 100; }

export function buildReport({ fileLabel, clientRef, asOfDate, sourceRows, issues, rows }) {
  const totalRows = rows.length;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const rejected = rows.filter((r) => r._blocking).length;
  const ingested = totalRows - rejected;

  const kinds = {};
  for (const i of issues) kinds[i.code] = (kinds[i.code] || 0) + 1;
  const warningBreakdown = {};
  for (const i of warnings) warningBreakdown[i.code] = (warningBreakdown[i.code] || 0) + 1;

  return {
    fileLabel,
    clientRef,
    asOfDate,
    sourceRowCount: sourceRows,
    totalRows,
    ingestedRows: ingested,
    rejectedRows: rejected,
    blockingErrors: errors.length,
    warnings: warnings.length,
    issueBreakdown: kinds,
    warningBreakdown,
    warningsByType: warningBreakdown,
    ok: errors.length === 0
  };
}