// validate.mjs
// Validation engine. Every issue carries:
//   code      - stable machine-readable code
//   severity  - 'error' (blocks ingestion of the row/file) | 'warning' (goes to exceptions queue)
//   row       - source row number (1-based, header = 1)
//   field     - canonical field name
//   message   - human-readable, specific
//
// Severity rules:
//   ERROR (blocking): missing required column, empty file, unparseable required value
//   WARNING (exceptions queue): negative amount, future-dated, duplicates, invalid
//   GSTIN/HSN/TDS, missing amount, blank voucher no, unknown columns.

import {
  GSTIN_PATTERN,
  HSN_PATTERN,
  KNOWN_TDS_SECTIONS,
  REQUIRED_COLUMNS,
  AMOUNT_COLUMNS
} from './schema.mjs';

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

  // dd-mon-yyyy
  if ((m = String(raw).match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})$/))) {
    const d = +m[1]; const mon = MONTHS[m[2].toLowerCase().slice(0, 3)]; const y = +m[3];
    if (!mon) return { ok: false, value: null };
    return validateDMY(d, mon, y, asOfDate);
  }
  // yyyy-mm-dd
  if ((m = String(raw).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return validateDMY(+m[3], pad(+m[2]), +m[1], asOfDate);
  }
  // dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy (Indian default: DATE first)
  if ((m = String(raw).match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) {
    let d = +m[1]; let mon = m[2]; let y = +m[3];
    // Disambiguate dd-mm vs mm-dd: if first token > 12 it must be the day
    // (dd-mm, Indian default); if first token <= 12 but second > 12 then the
    // first is the month (US-style mm-dd) -> swap.
    if (d <= 12 && +mon > 12) { const t = d; d = +mon; mon = String(t); }
    return validateDMY(d, pad(+mon), y, asOfDate);
  }
  // Excel serial-ish or other -> fail explicitly
  return { ok: false, value: null };
}

function pad(n) { return String(n).padStart(2, '0'); }

function validateDMY(day, mon, year, asOfDate) {
  if (mon === '00') return { ok: false, value: null };
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, +mon - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== +mon || date.getUTCDate() !== day) {
    return { ok: false, value: null }; // normalized away (e.g. 31-02)
  }
  const iso = `${year}-${pad(mon)}-${pad(day)}`;
  const future = asOfDate ? iso > asOfDate : false;
  return { ok: true, value: iso, future };
}

export function normalizeGstin(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  return s === '' ? null : s;
}

export function normalizeHsn(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s+/g, '');
  if (s.includes('.')) s = s.replace(/\./g, ''); // some exports write 8454.20 as SAC
  return s === '' ? null : s;
}

export function normalizeTdsSection(raw) {
  if (raw == null) return null;
  return String(raw).trim().toUpperCase().replace(/\s+/g, '');
}

// ----- file-level validation ------------------------------------------------

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
      message: 'No amount column (Debit/Credit/Amount) found in the header row.'
    });
  }
}

// ----- row validation -------------------------------------------------------

export function validateRow(rows, rowIndex, map, asOfDate, seen = new Set()) {
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
      message: `Row ${rowIndex + 1}: date "${dateRaw}" is not a valid date (expected DD-MM-YYYY or YYYY-MM-DD).`
    });
  } else if (parsedDate.future) {
    issues.push({
      code: 'FUTURE_DATED', severity: 'warning', row: rowIndex + 1, field: 'date',
      message: `Row ${rowIndex + 1}: date ${parsedDate.value} is after the as-of date ${asOfDate}.`
    });
  }

  const typeRaw = get('voucherType');
  if (typeRaw == null || String(typeRaw).trim() === '') {
    issues.push({
      code: 'MISSING_VOUCHER_TYPE', severity: 'error', row: rowIndex + 1, field: 'voucherType',
      message: `Row ${rowIndex + 1}: voucher type is blank.`
    });
  }

  const voucherNo = get('voucherNo') == null ? '' : String(get('voucherNo')).trim();
  if (voucherNo === '') {
    issues.push({
      code: 'MISSING_VOUCHER_NO', severity: 'warning', row: rowIndex + 1, field: 'voucherNo',
      message: `Row ${rowIndex + 1}: voucher number is blank (allowed for some voucher types, but verify).`
    });
  }

  const debit = parseAmount(get('debit'));
  const credit = parseAmount(get('credit'));
  const amount = parseAmount(get('amount'));

  for (const [name, parsed, col] of [['debit', debit, 'debit'], ['credit', credit, 'credit'], ['amount', amount, 'amount']]) {
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

  const anyAmount = (debit.ok && debit.value) || (credit.ok && credit.value) || (amount.ok && amount.value);
  if (!anyAmount) {
    issues.push({
      code: 'MISSING_AMOUNT', severity: 'warning', row: rowIndex + 1, field: 'amount',
      message: `Row ${rowIndex + 1}: no amount populated in Debit/Credit/Amount columns.`
    });
  }

  const gstin = normalizeGstin(get('gstin'));
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    issues.push({
      code: 'INVALID_GSTIN', severity: 'warning', row: rowIndex + 1, field: 'gstin',
      message: `Row ${rowIndex + 1}: GSTIN "${gstin}" does not match the 15-character format.`
    });
  }

  const hsn = normalizeHsn(get('hsn'));
  if (hsn && !HSN_PATTERN.test(hsn)) {
    issues.push({
      code: 'INVALID_HSN', severity: 'warning', row: rowIndex + 1, field: 'hsn',
      message: `Row ${rowIndex + 1}: HSN/SAC "${hsn}" must be 4-8 digits.`
    });
  }

  const tdsSection = normalizeTdsSection(get('tdsSection'));
  if (tdsSection && !KNOWN_TDS_SECTIONS.has(tdsSection)) {
    issues.push({
      code: 'INVALID_TDS_SECTION', severity: 'warning', row: rowIndex + 1, field: 'tdsSection',
      message: `Row ${rowIndex + 1}: TDS section "${tdsSection}" is not a recognized section.`
    });
  }

  // Duplicate detection: date | voucherType | voucherNo | amount
  if (parsedDate.ok && typeRaw != null) {
    const key = `${parsedDate.value}|${String(typeRaw).trim()}|${voucherNo}|${amount.ok ? amount.value : ''}`;
    if (seen.has(key)) {
      issues.push({
        code: 'DUPLICATE_VOUCHER', severity: 'warning', row: rowIndex + 1, field: 'voucherNo',
        message: `Row ${rowIndex + 1}: voucher (${parsedDate.value}, ${String(typeRaw).trim()}, ${voucherNo || 'no-no'}) appears more than once.`
      });
    } else {
      seen.add(key);
    }
  }

  return issues;
}

export function classifyIssue(issues) {
  return {
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning')
  };
}