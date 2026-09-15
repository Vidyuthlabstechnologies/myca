// validate.mjs — bank statement validation engine.
// Shares the Sprint 1 issue-shape contract: { code, severity, row, field, message }.
// Severity rules for statements:
//   ERROR (blocking): empty file, no recognition, missing required column,
//     unparseable date, unparseable amount in a populated amount cell.
//   WARNING (exceptions queue): missing narration, one-sided amount only,
//     balance breaks continuity, opening-balance drift, future-dated, blank ref.

import { AMOUNT_COLUMNS, REQUIRED_COLUMNS } from './schema.mjs';

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

export function parseAmount(raw) {
  if (raw == null) return { ok: false, value: null };
  let s = String(raw).trim();
  if (s === '') return { ok: false, value: null };
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  s = s.replace(/[₹,\s]/g, '');
  if (!s || !/^[\d.]+$/.test(s)) return { ok: false, value: null };
  const n = parseFloat(s);
  if (Number.isNaN(n)) return { ok: false, value: null };
  return { ok: true, value: negative ? -n : n };
}

export function parseDate(raw, asOfDate) {
  let m;
  if (typeof raw === 'string') raw = raw.trim();
  if (raw == null || raw === '') return { ok: false, value: null };

  if ((m = String(raw).match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})$/))) {
    const d = +m[1]; const mon = MONTHS[m[2].toLowerCase().slice(0, 3)]; const y = +m[3];
    if (!mon) return { ok: false, value: null };
    return validateDMY(d, mon, y, asOfDate);
  }
  if ((m = String(raw).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return validateDMY(+m[3], pad(+m[2]), +m[1], asOfDate);
  }
  if ((m = String(raw).match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) {
    let d = +m[1]; let mon = m[2]; let y = +m[3];
    // Disambiguate dd-mm vs mm-dd: if first token > 12 it must be the day
    // (dd-mm, Indian default); if first token <= 12 but second > 12 then the
    // first is the month (US-style mm-dd) -> swap.
    if (d <= 12 && +mon > 12) { const t = d; d = +mon; mon = String(t); }
    return validateDMY(d, pad(+mon), y, asOfDate);
  }
  return { ok: false, value: null };
}

function pad(n) { return String(n).padStart(2, '0'); }

function validateDMY(day, mon, year, asOfDate) {
  if (mon === '00') return { ok: false, value: null };
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, +mon - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== +mon || date.getUTCDate() !== day) {
    return { ok: false, value: null };
  }
  const iso = `${year}-${pad(mon)}-${pad(day)}`;
  const future = asOfDate ? iso > asOfDate : false;
  return { ok: true, value: iso, future };
}

// ----- file-level validation -------------------------------------------------

export function validateFileStructure(rows, map, issues) {
  if (!rows.length) {
    issues.push({ code: 'EMPTY_FILE', severity: 'error', row: 0, field: null, message: 'File is empty or contains no data rows.' });
    return;
  }
  for (const col of REQUIRED_COLUMNS) {
    if (map[col] === undefined) {
      issues.push({
        code: 'MISSING_REQUIRED_COLUMN', severity: 'error', row: 1, field: col,
        message: `Required column "${col}" was not found in the header row.`
      });
    }
  }
  const hasAmountCol = AMOUNT_COLUMNS.some((c) => map[c] !== undefined);
  if (!hasAmountCol) {
    issues.push({
      code: 'MISSING_AMOUNT_COLUMN', severity: 'error', row: 1, field: 'amount',
      message: 'No amount or balance column found in the header row.'
    });
  }
}

// ----- row validation -------------------------------------------------------
// opts: { asOfDate, prevBalance } — prevBalance is the running closing balance
// from the prior canonical row (used for continuity warnings).

export function validateRow(rows, rowIndex, map, asOfDate, prevBalance) {
  const row = rows[rowIndex];
  const issues = [];
  const get = (key) => {
    const col = map[key];
    return col === undefined ? undefined : row[col];
  };

  const dateRaw = get('date');
  const parsedDate = parseDate(dateRaw, asOfDate);
  if (!parsedDate.ok) {
    issues.push({
      code: 'INVALID_DATE', severity: 'error', row: rowIndex + 1, field: 'date',
      message: `Row ${rowIndex + 1}: statement date "${dateRaw}" is not a valid date.`
    });
  } else if (parsedDate.future) {
    issues.push({
      code: 'FUTURE_DATED', severity: 'warning', row: rowIndex + 1, field: 'date',
      message: `Row ${rowIndex + 1}: transaction date ${parsedDate.value} is after the as-of date ${asOfDate}.`
    });
  }

  const narration = get('narration');
  if (narration == null || String(narration).trim() === '') {
    issues.push({
      code: 'MISSING_NARRATION', severity: 'warning', row: rowIndex + 1, field: 'narration',
      message: `Row ${rowIndex + 1}: narration/description is blank.`
    });
  }

  const debit = parseAmount(get('debit'));
  const credit = parseAmount(get('credit'));
  const amount = parseAmount(get('amount'));
  const balance = parseAmount(get('balance'));

  for (const [name, parsed, col] of [['debit', debit, 'debit'], ['credit', credit, 'credit'], ['amount', amount, 'amount'], ['balance', balance, 'balance']]) {
    if (!parsed.ok && get(col) != null && String(get(col)).trim() !== '') {
      issues.push({
        code: 'INVALID_AMOUNT', severity: 'error', row: rowIndex + 1, field: col,
        message: `Row ${rowIndex + 1}: ${name} "${String(get(col)).trim()}" is not a valid amount.`
      });
    }
    if (parsed.ok && parsed.value < 0) {
      issues.push({
        code: 'NEGATIVE_AMOUNT', severity: 'warning', row: rowIndex + 1, field: col,
        message: `Row ${rowIndex + 1}: ${name} is negative (${parsed.value}).`
      });
    }
  }

  const inflow = credit.ok && credit.value !== 0;
  const outflow = debit.ok && debit.value !== 0;
  if (inflow && outflow) {
    issues.push({
      code: 'BOTH_SIDES', severity: 'warning', row: rowIndex + 1, field: 'debit',
      message: `Row ${rowIndex + 1}: both debit (${debit.value}) and credit (${credit.value}) present — expected one side only.`
    });
  }
  const noMoney = !(inflow || outflow || (amount.ok && amount.value !== 0));
  if (noMoney) {
    issues.push({
      code: 'MISSING_AMOUNT', severity: 'warning', row: rowIndex + 1, field: 'amount',
      message: `Row ${rowIndex + 1}: no debit/credit/amount populated.`
    });
  }

  // Balance continuity check (most statements give a running balance).
  if (balance.ok && prevBalance != null) {
    const expected = round2(prevBalance + (credit.ok ? credit.value : 0) - (debit.ok ? debit.value : 0));
    if (Math.abs(expected - balance.value) > 0.01) {
      issues.push({
        code: 'BALANCE_BREAK', severity: 'warning', row: rowIndex + 1, field: 'balance',
        message: `Row ${rowIndex + 1}: running balance ${balance.value} does not tie to previous balance ${prevBalance} (± transaction). Expected ${expected}.`
      });
    }
  }

  return issues;
}

function round2(n) { return Math.round(n * 100) / 100; }