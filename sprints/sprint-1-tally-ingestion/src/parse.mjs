// parse.mjs
// Tabular parsing. CSV is handled natively (zero deps, handles quotes/escapes/BOM).
// XLSX is supported through the same fromMatrix() path — a reader bridge
// (exceljs/xlsx) will feed matrices into ingest. Unknown binary formats
// return a clear, specific error (matching the "reject with a specific error"
// behaviour FireAI documents).

import { normalizeHeader } from './schema.mjs';

export function parseCSV(text) {
  if (typeof text !== 'string') {
    throw new Error('parseCSV: expected a string; got ' + typeof text);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore CR; the following LF handles the row break
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty trailing rows.
  while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === '')) {
    rows.pop();
  }

  // Drop fully-empty leading rows too (some files start with a blank header line).
  let start = 0;
  while (start < rows.length && rows[start].every((c) => String(c).trim() === '')) start++;
  return rows.slice(start);
}

// Convert a 2-D matrix (array of rows, each an array of cells) into rows.
// Used by CSV now and by the future XLSX bridge. Ensures uniform row length
// by padding missing trailing cells with ''.
export function fromMatrix(matrix) {
  if (!Array.isArray(matrix)) throw new Error('fromMatrix: expected an array of rows');
  const width = matrix.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  return matrix.map((r) => {
    const cells = Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [];
    while (cells.length < width) cells.push('');
    return cells;
  });
}

// Detect the header row: it is the first non-empty row whose cells contain
// at least one recognized canonical header.
export function detectHeaderRow(rows) {
  const canonical = new Set([
    'date', 'vouchertype', 'voucher', 'vch', 'particulars', 'ledger', 'debit',
    'credit', 'amount', 'narration', 'gstin', 'hsn', 'tds', 'customer', 'supplier',
    'party', 'name', 'description', 'remarks'
  ]);
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i].map(normalizeHeader);
    const hit = normalized.filter((h) => canonical.has(h));
    if (hit.length >= 2) return i;
  }
  return null;
}

// Map a header row to { columnIndex, aliases }.
export function buildColumnMap(headerRow, aliases) {
  const map = {}; // canonical key -> column index (number) or null
  const aliasToCanonical = {};
  for (const [canonical, names] of Object.entries(aliases)) {
    for (const name of names) aliasToCanonical[normalizeHeader(name)] = canonical;
  }
  const unknownColumns = [];
  headerRow.forEach((raw, colIndex) => {
    const norm = normalizeHeader(raw);
    if (!norm) return;
    const canonical = aliasToCanonical[norm];
    if (canonical) {
      if (map[canonical] === undefined) map[canonical] = colIndex;
    } else {
      unknownColumns.push({ colIndex, header: raw });
    }
  });
  return { map, unknownColumns };
}