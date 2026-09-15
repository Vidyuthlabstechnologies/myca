import { parseAmount } from './core.mjs';

let parseSalesRef = null;
try {
  const mod = await import('./gstr1.mjs');
  parseSalesRef = mod.parseSales;
} catch {}

export { parseSalesRef as parseSales };

const REQUIRED_HEADERS = [
  'invoiceNo', 'date', 'supplierGstin', 'supplierName', 'hsn', 'rate',
  'taxableValue', 'cgst', 'sgst', 'igst', 'isInputService', 'itcEligible', 'itcAvailability'
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const HSN_RE = /^[0-9]{4,8}$/;
const KNOWN_RATES = [0, 5, 12, 18, 28];

function hasViolation(row) {
  if (row.partyGstin) {
    if (!GSTIN_RE.test(row.partyGstin)) return true;
    if (String(row.partyGstin).slice(0, 2) !== String(row.partyState)) return true;
    if (!HSN_RE.test(row.hsn)) return true;
    if (row.rate < 0 || row.taxableValue < 0 || row.cgst < 0 || row.sgst < 0 || row.igst < 0) return true;
    const expectedTax = Math.round(row.taxableValue * row.rate / 100);
    if (Math.abs((row.cgst + row.sgst + row.igst) - expectedTax) > 1) return true;
    if (!KNOWN_RATES.includes(row.rate)) return true;
  }
  return false;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: '', message: 'Empty input' }] };
  const headers = lines[0].split(',').map(h => h.trim());
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    return { rows: [], errors: [{ code: 'MISSING_HEADER', row: 0, field: missing.join(','), message: `Missing headers: ${missing.join(', ')}` }] };
  }
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    if (vals.length < headers.length) {
      errors.push({ code: 'BAD_ROW', row: i, field: '', message: `Row ${i + 1} has fewer columns than headers` });
      continue;
    }
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = vals[j];
    }
    const rate = parseAmount(obj.rate);
    const taxableValue = parseAmount(obj.taxableValue);
    const cgst = parseAmount(obj.cgst);
    const sgst = parseAmount(obj.sgst);
    const igst = parseAmount(obj.igst);
    if (Number.isNaN(rate)) errors.push({ code: 'BAD_AMOUNT', row: i + 1, field: 'rate', message: `Invalid rate: ${obj.rate}` });
    if (Number.isNaN(taxableValue)) errors.push({ code: 'BAD_AMOUNT', row: i + 1, field: 'taxableValue', message: `Invalid taxableValue: ${obj.taxableValue}` });
    if (Number.isNaN(cgst)) errors.push({ code: 'BAD_AMOUNT', row: i + 1, field: 'cgst', message: `Invalid cgst: ${obj.cgst}` });
    if (Number.isNaN(sgst)) errors.push({ code: 'BAD_AMOUNT', row: i + 1, field: 'sgst', message: `Invalid sgst: ${obj.sgst}` });
    if (Number.isNaN(igst)) errors.push({ code: 'BAD_AMOUNT', row: i + 1, field: 'igst', message: `Invalid igst: ${obj.igst}` });
    rows.push({
      invoiceNo: obj.invoiceNo,
      date: obj.date,
      supplierGstin: obj.supplierGstin,
      supplierName: obj.supplierName,
      hsn: obj.hsn,
      rate,
      taxableValue,
      cgst,
      sgst,
      igst,
      isInputService: obj.isInputService,
      itcEligible: obj.itcEligible,
      itcAvailability: obj.itcAvailability,
    });
  }
  return { rows, errors };
}

export function parseInward(text) {
  try {
    return parseCSV(text);
  } catch {
    return { rows: [], errors: [{ code: 'PARSE_ERROR', row: 0, field: '', message: 'Failed to parse inward CSV' }] };
  }
}

export function buildGstr3b({ sales = [], inward = [], supplierState = '27' }) {
  let period = '2026-08';
  if (sales.length > 0 && sales[0].date) {
    period = sales[0].date.slice(0, 7);
  }

  const outboundRows = [];
  let nilExemptTaxable = 0;

  for (const row of sales) {
    if (hasViolation(row)) continue;
    const taxable = row.taxableValue;
    if (row.rate === 0 || taxable === 0) {
      nilExemptTaxable += taxable;
      continue;
    }
    const interState = String(row.partyState) !== String(supplierState);
    outboundRows.push({
      rate: row.rate,
      interState,
      taxable,
      cgst: row.cgst,
      sgst: row.sgst,
      igst: row.igst,
    });
  }

  const aggMap = new Map();
  for (const r of outboundRows) {
    const key = `${r.rate}_${r.interState ? 'I' : 'N'}`;
    if (aggMap.has(key)) {
      const a = aggMap.get(key);
      a.taxable += r.taxable;
      a.cgst += r.cgst;
      a.sgst += r.sgst;
      a.igst += r.igst;
    } else {
      aggMap.set(key, { rate: r.rate, interState: r.interState, taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst });
    }
  }

  const rows3a = [...aggMap.values()].sort((a, b) => {
    if (a.rate !== b.rate) return a.rate - b.rate;
    if (a.interState !== b.interState) return a.interState ? 1 : -1;
    return 0;
  });

  let interTaxable = 0;
  let interIgst = 0;
  let intraTaxable = 0;
  let intraCgst = 0;
  let intraSgst = 0;
  for (const r of rows3a) {
    if (r.interState) {
      interTaxable += r.taxable;
      interIgst += r.igst;
    } else {
      intraTaxable += r.taxable;
      intraCgst += r.cgst;
      intraSgst += r.sgst;
    }
  }

  let availableIgst = 0;
  let availableCgst = 0;
  let availableSgst = 0;
  let importServicesIgst = 0;
  let ineligibleIgst = 0;
  let ineligibleCgst = 0;
  let ineligibleSgst = 0;

  for (const row of inward) {
    const eligible = row.itcEligible === 'Y' && row.itcAvailability === 'Y' && row.taxableValue > 0;
    if (eligible) {
      availableIgst += row.igst;
      availableCgst += row.cgst;
      availableSgst += row.sgst;
      if (!row.supplierGstin || row.supplierGstin.trim() === '') {
        importServicesIgst += row.igst;
      }
    } else {
      ineligibleIgst += row.igst;
      ineligibleCgst += row.cgst;
      ineligibleSgst += row.sgst;
    }
  }

  return {
    period,
    outward: {
      rows3a,
      nilExemptTaxable,
      totals: { interTaxable, interIgst, intraTaxable, intraCgst, intraSgst },
    },
    itc: {
      available: { igst: availableIgst, cgst: availableCgst, sgst: availableSgst },
      importServicesIgst,
      ineligible: { igst: ineligibleIgst, cgst: ineligibleCgst, sgst: ineligibleSgst },
      netItc: availableIgst + availableCgst + availableSgst,
    },
  };
}
