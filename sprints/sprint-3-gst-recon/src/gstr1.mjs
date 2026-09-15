const MONEY_NAMES = {
  'TAXABLE VALUE': 'taxableValue',
  'CGST': 'cgst',
  'SGST': 'sgst',
  'IGST': 'igst',
  'TOTAL VALUE': 'totalValue',
};

function normalizeHeader(cell) {
  return String(cell).trim().replace(/\s+/g, ' ').toUpperCase();
}

function splitLine(line) {
  const cells = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function resolveCells(cells, columnCount, moneyCols) {
  if (cells.length <= columnCount) return cells;
  const out = [];
  let idx = 0;
  let need = columnCount;
  while (idx < cells.length && out.length < columnCount) {
    const cur = cells[idx];
    let cell = cur;
    if (moneyCols.includes(out.length) && /^₹?\d{1,3}$/.test(cur) && cells.length - idx - need + 1 > 0) {
      let extra = 0;
      while (
        idx + extra + 1 < cells.length &&
        /^\d{2,3}$/.test(cells[idx + extra + 1]) &&
        extra + 1 <= cells.length - idx - need + 1
      ) {
        cell = `${cell},${cells[idx + extra + 1]}`;
        extra++;
      }
      idx += extra + 1;
    } else {
      idx++;
    }
    out.push(cell);
    need--;
  }
  return out.length === columnCount ? out : cells.slice(0, columnCount);
}

function parseMoney(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  let value = trimmed.replace(/[₹,\s]/g, '');
  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1);
  } else if (value.endsWith('-')) {
    negative = true;
    value = value.slice(0, -1);
  }
  const number = parseFloat(value);
  if (Number.isNaN(number)) return 0;
  return negative ? -number : number;
}

function parseIsoDate(raw) {
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(raw).trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseGSTR1(text) {
  const rows = [];
  const errors = [];
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  let headerSeen = false;
  let headerColumns = {};
  let dataRow = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const cells = splitLine(line);
    if (!headerSeen) {
      headerSeen = true;
      const seen = new Set();
      headerColumns = {};
      cells.forEach((cell, index) => {
        const key = normalizeHeader(cell);
        if (key !== '' && !seen.has(key)) {
          seen.add(key);
          headerColumns[key] = index;
        }
      });
      if (headerColumns['TAXABLE VALUE'] === undefined || headerColumns['INVOICE NO'] === undefined) {
        errors.push({
          code: 'INVALID_HEADER',
          row: 1,
          field: null,
          message: 'Required columns TAXABLE VALUE and INVOICE NO not found',
        });
        return { rows, errors };
      }
      continue;
    }
    dataRow += 1;
    const columnCount = Object.keys(headerColumns).length;
    const moneyCols = Object.keys(MONEY_NAMES)
      .map((header) => headerColumns[header])
      .filter((index) => index !== undefined);
    const resolvedCells = resolveCells(cells, columnCount, moneyCols);
    const cell = (name) => {
      const index = headerColumns[name];
      return index === undefined || index >= resolvedCells.length ? '' : resolvedCells[index];
    };
    const money = {};
    for (const header of Object.keys(MONEY_NAMES)) {
      money[header] = parseMoney(cell(header));
    }
    if (Object.keys(MONEY_NAMES).every((header) => money[header] === null)) {
      errors.push({
        code: 'MISSING_AMOUNT',
        row: dataRow,
        field: null,
        message: 'No monetary values present in row',
      });
      continue;
    }
    const iso = parseIsoDate(cell('INVOICE DATE'));
    const taxableValue = money['TAXABLE VALUE'] ?? 0;
    const cgst = money['CGST'] ?? 0;
    const sgst = money['SGST'] ?? 0;
    const igst = money['IGST'] ?? 0;
    const totalValue = money['TOTAL VALUE'] ?? 0;
    rows.push({
      buyerGstin: cell('BUYER GSTIN'),
      invoiceNo: cell('INVOICE NO'),
      invoiceDate: iso ?? cell('INVOICE DATE'),
      taxableValue,
      cgst,
      sgst,
      igst,
      totalValue,
      sourceRow: dataRow,
      interState: igst > 0,
      rate: taxableValue === 0 ? 0 : Math.round(((cgst + sgst + igst) / taxableValue) * 100),
    });
    if (iso === null) {
      errors.push({
        code: 'INVALID_DATE',
        row: dataRow,
        field: 'INVOICE DATE',
        message: 'Date must be in DD-MM-YYYY format',
      });
    }
  }

  if (!headerSeen) {
    errors.push({ code: 'INVALID_HEADER', row: 1, field: null, message: 'No header row found' });
  }
  return { rows, errors };
}