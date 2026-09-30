function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeader(cell) {
  return String(cell)
    .trim()
    .replace(/^\uFEFF/, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function parseMoney(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  if (t === '') return null;
  let str = t;
  let negative = false;
  const parenthesized = /^\(.*\)$/.test(str);
  if (parenthesized) {
    negative = true;
    str = str.slice(1, -1);
  }
  if (!parenthesized && str.endsWith('-')) {
    negative = true;
    str = str.slice(0, -1);
  }
  if (str.startsWith('-')) {
    negative = true;
    str = str.slice(1);
  }
  str = str.replace(/[₹\s,]/g, '');
  if (str === '' || !/^[+-]?\d+(\.\d+)?$/.test(str)) return NaN;
  const n = Number(str);
  return Number.isFinite(n) ? (negative ? -n : n) : NaN;
}

function parseDate(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const year = Number(m[3]);
  const month = Number(m[2]);
  const day = Number(m[1]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid =
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  if (!valid) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const CREDIT_NOTE_TYPES = new Set(['CN', 'C', 'CREDIT NOTE', 'CREDIT-NOTE']);

function round2(v) {
  return Math.round(v * 100) / 100;
}

export function parsePurchaseRegister(text) {
  const rows = [];
  const errors = [];
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let colMap = null;
  let dataRowNumber = 0;
  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (cells.every((c) => c === '')) continue;
    if (colMap === null) {
      colMap = {};
      for (let i = 0; i < cells.length; i++) {
        const key = normalizeHeader(cells[i]);
        if (key !== '' && !(key in colMap)) colMap[key] = i;
      }
      continue;
    }
    dataRowNumber += 1;
    const field = (name) => {
      const idx = colMap[name];
      return idx === undefined ? '' : cells[idx] ?? '';
    };
    const invoiceNo = field('INVOICE NO');
    const dateCell = field('INVOICE DATE');
    const moneyInputs = [
      field('TAXABLE VALUE'),
      field('CGST'),
      field('SGST'),
      field('IGST'),
      field('TOTAL VALUE')
    ];
    const parsedMoney = moneyInputs.map(parseMoney);
    if (parsedMoney.every((v) => v === null)) {
      errors.push({
        code: 'MISSING_AMOUNT',
        row: dataRowNumber,
        field: '*',
        message: 'Every monetary column is blank; row dropped'
      });
      continue;
    }
    const resolve = (v) =>
      v === null || !Number.isFinite(v) ? 0 : round2(v);
    const taxableValue = resolve(parsedMoney[0]);
    let invoiceDate = null;
    if (dateCell !== '') {
      invoiceDate = parseDate(dateCell);
      if (invoiceDate === null) {
        errors.push({
          code: 'INVALID_DATE',
          row: dataRowNumber,
          field: 'INVOICE DATE',
          message: `Invalid date: ${dateCell}`
        });
      }
    }
    // A credit note is known from a negative value or the document type column,
    // never from an invoice number that happens to start with "CN".
    const docType = field('DOCUMENT TYPE').toUpperCase();
    const totalValue = resolve(parsedMoney[4]);
    const isCreditNote = CREDIT_NOTE_TYPES.has(docType) || taxableValue < 0 || totalValue < 0;
    const paidCell = field('AMOUNT PAID');
    const paidParsed = parseMoney(paidCell);
    const paymentCell = field('PAYMENT DATE');
    const paymentDate = paymentCell === '' ? null : parseDate(paymentCell);
    if (paymentCell !== '' && paymentDate === null) {
      errors.push({ code: 'INVALID_DATE', row: dataRowNumber, field: 'PAYMENT DATE', message: `Invalid date: ${paymentCell}` });
    }
    rows.push({
      gstin: field('GSTIN'),
      supplierName: field('SUPPLIER NAME'),
      invoiceNo,
      invoiceDate,
      taxableValue,
      cgst: resolve(parsedMoney[1]),
      sgst: resolve(parsedMoney[2]),
      igst: resolve(parsedMoney[3]),
      totalValue,
      // null means the register has no payment data, which Rule 37 reports as unknown.
      paidValue: 'AMOUNT PAID' in colMap && paidParsed !== null && Number.isFinite(paidParsed) ? round2(paidParsed) : null,
      paymentDate,
      sourceRow: dataRowNumber,
      isCreditNote
    });
  }
  return { rows, errors };
}