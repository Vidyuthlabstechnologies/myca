// parse.mjs
// Tabular + text parsing for bank statements.
//   parseCSV(text)            - CSV with quotes/BOM/escapes (reuses Sprint 1 engine)
//   fromMatrix(matrix)        - XLSX bridge (same as Sprint 1)
//   parseFixedWidth(text)     - HDFC/ICICI/SBI text-statement style fixed-width blocks
//   buildColumnMap(headerRow) - header -> canonical column indices

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
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
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
      // ignore CR; following LF breaks the row
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field); rows.push(row);
  }

  while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === '')) rows.pop();
  let start = 0;
  while (start < rows.length && rows[start].every((c) => String(c).trim() === '')) start++;
  return rows.slice(start);
}

export function fromMatrix(matrix) {
  if (!Array.isArray(matrix)) throw new Error('fromMatrix: expected an array of rows');
  const width = matrix.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  return matrix.map((r) => {
    const cells = Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [];
    while (cells.length < width) cells.push('');
    return cells;
  });
}

// Keywords used to locate the fixed-width header block in text statements.
const FW_HEADER = [
  'date', 'narration', 'particulars', 'description', 'withdrawal', 'deposit',
  'credit', 'debit', 'balance', 'value dt', 'chq', 'ref', 'cheque'
];

// Column field detection (in order of header occurrence). The header line
// itself tells us positions, so we split the column definition once per bank
// statement style by scanning for these markers in the header line.
export function detectFixedWidthHeaderOffset(lines, index) {
  // A header line must contain at least 'date' AND (an amount marker or narration).
  const line = lines[index];
  if (!line) return null;
  const low = line.toLowerCase();
  const hits = FW_HEADER.filter((k) => low.includes(k));
  if (hits.length >= 3 && (low.includes('withdrawal') || low.includes('deposit') || low.includes('balance') || low.includes('debit') || low.includes('credit'))) {
    return index;
  }
  return null;
}

// Match a set of column markers inside a header line. Columns are laid out by
// the marker's own position on the header line: the *start* of column N is the
// first non-space char of its marker, and the *end* is the start of the next
// marker column (or end of line). This guarantees a date in "DATE" never gets
// truncated to the length of the word "date".
export function columnSpans(headerLine, markers) {
  const found = [];
  for (const m of markers) {
    const idx = headerLine.toLowerCase().indexOf(m.toLowerCase());
    if (idx === -1) continue;
    const start = idx;
    found.push({ key: m, start });
  }
  found.sort((a, b) => a.start - b.start);
  const spans = {};
  for (let k = 0; k < found.length; k++) {
    const end = k + 1 < found.length ? found[k + 1].start : headerLine.length;
    spans[found[k].key] = { start: found[k].start, end };
  }
  return spans;
}

const IBM = /^[ \t]*$/;

export function parseFixedWidth(text) {
  if (typeof text !== 'string') throw new Error('parseFixedWidth: expected a string');
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => !IBM.test(x.l));
  if (!nonEmpty.length) return [];

  // Find header line: must mention date + narration/particulars/description + amount markers.
  let header = null;
  for (const { l, i } of nonEmpty) {
    const low = l.toLowerCase();
    const hasDate = /\bdate\b/.test(low);
    const hasDesc = /\b(narration|particulars|description|details)\b/.test(low);
    const hasMoney = /\b(withdrawal|deposit|debit|credit|balance)\b/.test(low);
    if (hasDate && hasDesc && hasMoney) { header = { line: l, index: i }; break; }
  }
  if (!header) return [];

  // Map header words we care about onto their column. 'closing balance' and
  // plain 'balance' both map — but only one column exists per layout.
  const spans = {};
  const spanCols = columnSpans(header.line, ['date', 'narration', 'description', 'particulars', 'withdrawal', 'deposit', 'balance', 'chq/ref', 'ref']);

  spans.date = spanCols.date || null;
  // narration/description/particulars are the same physical column
  spans.narration = spanCols.narration || spanCols.description || spanCols.particulars || null;
  spans.withdrawal = spanCols.withdrawal || null;
  spans.deposit = spanCols.deposit || null;
  // If a statement shows only "Debit/Credit" instead of Withdrawal/Deposit,
  // read those columns as debit→withdrawal, credit→deposit.
  if (!spans.withdrawal || !spans.deposit) {
    const dc = columnSpans(header.line, ['debit', 'credit']);
    if (dc.debit) spans.withdrawal = dc.debit;
    if (dc.credit) spans.deposit = dc.credit;
  }
  spans.balance = null;
  for (const key of ['balance', 'closing']) {
    if (spans.balance) break;
    const b = columnSpans(header.line, [key]);
    if (b[key]) spans.balance = b[key];
  }
  spans.ref = spanCols['chq/ref'] || spanCols.ref || null;

  const rows = [];
  for (let i = header.index + 1; i < lines.length; i++) {
    const line = lines[i];
    if (IBM.test(line)) continue;
    const cell = (sp) => (sp ? line.slice(sp.start, sp.end).trim() : '');
    const row = {
      date: cell(spans.date),
      narration: cell(spans.narration),
      withdrawal: cell(spans.withdrawal),
      deposit: cell(spans.deposit),
      balance: cell(spans.balance),
      ref: cell(spans.ref)
    };
    // Skip continuation lines that have no date (amount spillover already merged)
    if (!row.date && !row.withdrawal && !row.deposit && !row.balance) continue;
    if (!row.date && /^[0-9.,-]+$/.test(line.trim())) continue; // pure numeric fragment
    rows.push(row);
  }
  return rows;
}

function spanIsEmpty(sp) { return sp == null || sp.end <= sp.start; }

export function buildColumnMap(headerRow, aliases) {
  const map = {};
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