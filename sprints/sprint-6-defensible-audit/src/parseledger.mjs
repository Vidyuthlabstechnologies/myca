import { csvCells, parseAmount } from './core.mjs';

const REQUIRED = ['clientId', 'date', 'narration', 'debit', 'credit', 'party', 'category', 'tdsSection'];

function numSide(v) {
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  return parseAmount(s);
}

export function parseLedger(text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'No header row.' }] };
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) {
    return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'No header row.' }] };
  }
  const header = csvCells(lines[0]).map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const idx = {};
  for (const col of REQUIRED) {
    const i = lower.indexOf(col.toLowerCase());
    if (i < 0) {
      errors.push({ code: 'MISSING_HEADER', row: 0, field: col, message: `Missing column ${col}.` });
    } else {
      idx[col] = i;
    }
  }
  if (errors.some((e) => e.code === 'MISSING_HEADER')) {
    return { rows: [], errors };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = csvCells(lines[i]);
    const dataRowNumber = i;
    const debit = numSide(cells[idx.debit]);
    const credit = numSide(cells[idx.credit]);
    const debitBlank = String(cells[idx.debit] ?? '').trim() === '';
    const creditBlank = String(cells[idx.credit] ?? '').trim() === '';
    if (!debitBlank && Number.isNaN(debit)) {
      errors.push({ code: 'BAD_AMOUNT', row: dataRowNumber, field: 'debit', message: 'Non-numeric debit.' });
    }
    if (!creditBlank && Number.isNaN(credit)) {
      errors.push({ code: 'BAD_AMOUNT', row: dataRowNumber, field: 'credit', message: 'Non-numeric credit.' });
    }
    if (!debitBlank && !creditBlank && Number.isFinite(debit) && Number.isFinite(credit) && debit !== 0 && credit !== 0) {
      errors.push({ code: 'BOTH_SIDES', row: dataRowNumber, field: 'debit', message: 'Both debit and credit populated.' });
    }
    const d = Number.isFinite(debit) ? debit : 0;
    const c = Number.isFinite(credit) ? credit : 0;
    let party = String(cells[idx.party] ?? '').trim();
    let category = String(cells[idx.category] ?? '').trim();
    let tdsSection = String(cells[idx.tdsSection] ?? '').trim();
    const cats = new Set(['rent', 'contract', 'sales', 'purchase', 'repairs', 'travel', 'salary', 'bank_charges', 'fees', 'transfer', 'unclassified', 'loan', 'interest', 'capex', 'misc']);
    if (!category && cats.has(tdsSection)) {
      category = tdsSection;
      tdsSection = '';
    }
    rows.push({
      clientId: String(cells[idx.clientId] ?? '').trim(),
      date: String(cells[idx.date] ?? '').trim(),
      narration: String(cells[idx.narration] ?? '').trim(),
      debit,
      credit,
      party,
      category,
      tdsSection,
      amount: d + c,
      dataRowNumber,
    });
  }
  return { rows, errors };
}
