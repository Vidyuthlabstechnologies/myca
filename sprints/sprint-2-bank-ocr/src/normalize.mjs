// normalize.mjs — canonical bank transaction builder.
// Each row becomes: {
//   date, type (debit/credit/balance-only), narration, refNo,
//   debit, credit, amount (signed), balance, openingBalance,
//   bank, ifsc, accountNo,
//   classification: { category, isCapEx, isRevenue, tdsSection, ruleIds, note, confidence },
//   sourceRow, _blocking }
// Two-step: a "balance roll" pass gives every row a previous balance so the
// validator can check continuity, then rows are built with classification.

import { parseAmount, parseDate } from './validate.mjs';
import { classify } from './classify.mjs';

function round2(n) { return n == null ? null : Math.round(n * 100) / 100; }

export function buildCanonicalRow(row, map, rowIndex, issuesByRow, prevBalance, asOfDate, opts = {}) {
  const get = (key) => {
    const col = map[key];
    return col === undefined ? undefined : row[col];
  };

  const debit = parseAmount(get('debit')).ok ? parseAmount(get('debit')).value : null;
  const credit = parseAmount(get('credit')).ok ? parseAmount(get('credit')).value : null;
  const amount = parseAmount(get('amount')).ok ? parseAmount(get('amount')).value : null;
  const balance = parseAmount(get('balance')).ok ? parseAmount(get('balance')).value : null;
  const openingBalance = parseAmount(get('openingBalance')).ok ? parseAmount(get('openingBalance')).value : null;

  let type = 'unclassified';
  if (debit != null && debit !== 0) type = 'debit';
  else if (credit != null && credit !== 0) type = 'credit';
  else if (amount != null && amount !== 0) type = amount < 0 ? 'debit' : 'credit';
  else if (balance != null) type = 'balance-only';

  // signed amount for downstream math (debit = negative in account flow)
  const signed = type === 'debit' ? -Math.abs(debit ?? amount ?? 0) : Math.abs(credit ?? amount ?? 0);

  const parsedDate = parseDate(get('date'), asOfDate);
  const iso = parsedDate.ok ? parsedDate.value : null;

  const classification = classify(narrationOf(get('narration')), {
    kind: type === 'credit' ? 'credit' : type === 'debit' ? 'debit' : undefined
  });

  return {
    date: iso,
    type,
    narration: narrationOf(get('narration')),
    refNo: String(get('refNo') || '').trim() || null,
    debit: round2(debit),
    credit: round2(credit),
    amount: round2(signed),
    balance: round2(balance),
    openingBalance: round2(openingBalance),
    bank: String(get('bank') || '').trim() || null,
    ifsc: String(get('ifsc') || '').trim().toUpperCase() || null,
    accountNo: String(get('accountNo') || '').trim() || null,
    classification,
    sourceRow: rowIndex + 1,
    _blocking: issuesByRow.some((i) => i.severity === 'error')
  };
}

function narrationOf(raw) {
  return String(raw == null ? '' : raw).trim();
}

// Roll previous balance across rows (uses last known balance for continuity).
export function rollBalances(rows, map) {
  const get = (key, row) => {
    const col = map[key];
    return col === undefined ? undefined : row[col];
  };
  let prev = null;
  const rolled = [];
  for (const row of rows) {
    const bal = parseAmount(get('balance', row));
    rolled.push({ row, prevBalance: prev });
    if (bal.ok && bal.value != null) prev = bal.value;
  }
  return rolled;
}

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

  let inflow = 0, outflow = 0;
  for (const r of rows) {
    if (r._blocking) continue;
    if (r.type === 'credit') inflow += r.credit || 0;
    else if (r.type === 'debit') outflow += (r.debit || 0);
  }

  return {
    fileLabel, clientRef, asOfDate, sourceRowCount: sourceRows, totalRows,
    ingestedRows: ingested, rejectedRows: rejected,
    blockingErrors: errors.length, warnings: warnings.length,
    issueBreakdown: kinds, warningBreakdown, warningsByType: warningBreakdown,
    inflow: round2(inflow), outflow: round2(outflow),
    categorized: rows.filter((r) => r.classification && r.classification.category !== 'unclassified' && !r._blocking).length,
    ok: errors.length === 0
  };
}