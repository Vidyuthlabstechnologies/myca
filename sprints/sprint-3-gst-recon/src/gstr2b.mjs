const HEADER_MAP = {
  'SECTION': 'section',
  'SUPPLIERGSTIN': 'supplierGstin',
  'SUPPLIERNAME': 'supplierName',
  'INVOICENO': 'invoiceNo',
  'INVOICEDATE': 'invoiceDate',
  'TAXABLEVALUE': 'taxableValue',
  'CGST': 'cgst',
  'SGST': 'sgst',
  'IGST': 'igst',
  'CESS': 'cess',
  'TOTALVALUE': 'totalValue',
  'ITCAVAILABILITY': 'itcAvailability',
};

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseMoney(s) {
  if (s == null) return 0;
  let v = String(s).trim();
  if (!v) return 0;

  let negative = false;
  if (v.startsWith('(') && v.endsWith(')')) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.startsWith('-')) {
    negative = true;
    v = v.slice(1);
  }
  if (v.endsWith('-')) {
    negative = true;
    v = v.slice(0, -1);
  }

  v = v.replace(/[₹\s,]/g, '');
  const n = parseFloat(v);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

function parseDate(s) {
  const trimmed = String(s).trim();
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = parseInt(dd, 10);
  const m = parseInt(mm, 10);
  const y = parseInt(yyyy, 10);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeItc(val) {
  const v = String(val).trim().toUpperCase();
  if (v === 'Y' || v === 'N' || v === 'A') return v;
  return 'A';
}

export function parseGstr2B(text) {
  const errors = [];
  const rows = [];

  const cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { rows, errors };
  }

  const headers = splitCsvLine(lines[0]).map(h => h.trim().toUpperCase().replace(/\s+/g, ''));

  const colMap = {};
  headers.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped) colMap[mapped] = i;
  });

  if (Object.keys(colMap).length === 0) {
    errors.push({ code: 'NO_VALID_HEADERS', row: 0, field: 'header', message: 'No recognized headers found in CSV' });
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const dataRowNum = i;
    const cells = splitCsvLine(lines[i]).map(c => c.trim());

    const get = (field) => {
      const idx = colMap[field];
      return idx != null && idx < cells.length ? cells[idx] : '';
    };

    const rawTaxable = get('taxableValue');
    const rawCgst = get('cgst');
    const rawSgst = get('sgst');
    const rawIgst = get('igst');
    const rawCess = get('cess');
    const rawTotal = get('totalValue');

    const allEmpty = [rawTaxable, rawCgst, rawSgst, rawIgst, rawCess, rawTotal].every(v => !v.trim());

    if (allEmpty) {
      errors.push({ code: 'MISSING_AMOUNT', row: dataRowNum, field: 'amounts', message: `Row ${dataRowNum}: all money columns are empty` });
      continue;
    }

    const taxableValue = parseMoney(rawTaxable);
    const cgst = parseMoney(rawCgst);
    const sgst = parseMoney(rawSgst);
    const igst = parseMoney(rawIgst);
    const cess = parseMoney(rawCess);
    const totalValue = parseMoney(rawTotal);

    const invoiceDateRaw = get('invoiceDate');
    const invoiceDate = parseDate(invoiceDateRaw);
    if (!invoiceDate && invoiceDateRaw.trim()) {
      errors.push({ code: 'INVALID_DATE', row: dataRowNum, field: 'invoiceDate', message: `Row ${dataRowNum}: invalid date '${invoiceDateRaw}'` });
    }

    rows.push({
      section: get('section'),
      supplierGstin: get('supplierGstin').toUpperCase(),
      supplierName: get('supplierName'),
      invoiceNo: get('invoiceNo'),
      invoiceDate: invoiceDate || '',
      taxableValue,
      cgst,
      sgst,
      igst,
      cess,
      totalValue,
      itcAvailability: normalizeItc(get('itcAvailability')),
      sourceRow: dataRowNum,
    });
  }

  return { rows, errors };
}
