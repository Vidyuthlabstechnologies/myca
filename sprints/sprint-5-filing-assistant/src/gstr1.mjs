import { parseAmount, r2, prevMonth } from './core.mjs';
import { rule } from '../../statutory-rules/src/index.mjs';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;
const HSN_RE = /^[0-9]{4,8}$/;

export function validGstRate(rate, onDate) {
  const found = rule('gst.rates.valid', onDate);
  return found.ok && found.value.includes(Number(rate));
}

export function isB2cl(row, supplierState) {
  if (row.partyGstin) return false;
  if (String(row.partyState).padStart(2, '0') === String(supplierState).padStart(2, '0')) return false;
  const found = rule('gst.b2cl.threshold', row.date);
  if (!found.ok) return false;
  const invoiceValuePaise = Math.round((row.taxableValue + row.cgst + row.sgst + row.igst + (row.cess || 0)) * 100);
  return invoiceValuePaise > found.value;
}

function splitCSV(text) {
  return String(text).split(/\r?\n/).filter((line) => line.trim() !== '').map((line) => line.split(','));
}

export function parseSales(text) {
  const lines = splitCSV(text);
  if (lines.length === 0 || !lines[0].includes('invoiceNo')) {
    return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'Missing header row' }] };
  }
  const header = lines[0].map((h) => h.trim());
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].map((c) => c.trim());
    const get = (name) => {
      const idx = header.indexOf(name);
      return idx >= 0 && idx < cells.length ? cells[idx] : '';
    };
    const rowNo = i;
    const row = {
      invoiceNo: get('invoiceNo'),
      date: get('date'),
      partyGstin: get('partyGstin'),
      partyName: get('partyName'),
      partyState: get('partyState'),
      hsn: get('hsn'),
      rate: parseAmount(get('rate')),
      taxableValue: parseAmount(get('taxableValue')),
      cgst: parseAmount(get('cgst')),
      sgst: parseAmount(get('sgst')),
      igst: parseAmount(get('igst')),
      cess: parseAmount(get('cess')),
      isEcommerce: get('isEcommerce'),
    };
    if (!row.invoiceNo) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'invoiceNo', message: 'Missing invoiceNo' });
    }
    if (!row.date) {
      errors.push({ code: 'BAD_DATE', row: rowNo, field: 'date', message: 'Missing date' });
    }
    if (Number.isNaN(row.rate)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'rate', message: 'Non-numeric rate' });
    }
    if (Number.isNaN(row.taxableValue)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'taxableValue', message: 'Non-numeric taxableValue' });
    }
    if (Number.isNaN(row.cgst)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'cgst', message: 'Non-numeric cgst' });
    }
    if (Number.isNaN(row.sgst)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'sgst', message: 'Non-numeric sgst' });
    }
    if (Number.isNaN(row.igst)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'igst', message: 'Non-numeric igst' });
    }
    if (Number.isNaN(row.cess)) {
      errors.push({ code: 'BAD_AMOUNT', row: rowNo, field: 'cess', message: 'Non-numeric cess' });
    }
    rows.push(row);
  }
  return { rows, errors };
}

export function eInvoiceErrors(rows, supplierState = '27') {
  const errors = [];
  for (const r of rows) {
    if (!r.partyGstin) continue;
    let stateMismatch = false;
    if (!GSTIN_RE.test(r.partyGstin)) {
      errors.push({ invoiceNo: r.invoiceNo, code: 'INVALID_GSTIN', message: 'Invalid GSTIN format' });
    } else if (r.partyGstin.slice(0, 2) !== r.partyState) {
      errors.push({ invoiceNo: r.invoiceNo, code: 'STATE_MISMATCH', message: 'GSTIN prefix does not match party state' });
      stateMismatch = true;
    }
    if (!stateMismatch) {
      if (!HSN_RE.test(r.hsn)) {
        errors.push({ invoiceNo: r.invoiceNo, code: 'INVALID_HSN', message: 'Invalid HSN code' });
      }
      if (!validGstRate(r.rate, r.date)) {
        errors.push({ invoiceNo: r.invoiceNo, code: 'RATE_UNKNOWN', message: 'Unknown rate' });
      }
      const tax = Math.round(r.taxableValue * r.rate / 100);
      if (Math.abs((r.cgst + r.sgst + r.igst) - tax) > 1) {
        errors.push({ invoiceNo: r.invoiceNo, code: 'TAX_MISMATCH', message: 'Tax does not match rate times taxable value' });
      }
      if (r.taxableValue < 0 || r.cgst < 0 || r.sgst < 0 || r.igst < 0) {
        errors.push({ invoiceNo: r.invoiceNo, code: 'NEGATIVE_VALUE', message: 'Negative value present' });
      }
    }
  }
  return errors;
}

function compareStateRate(a, b) {
  if (a.state !== b.state) return a.state.localeCompare(b.state);
  return a.rate - b.rate;
}

export function buildGstr1({ sales, supplierState = '27' }) {
  if (!sales || sales.length === 0) return false;
  const errors = eInvoiceErrors(sales, supplierState);
  const bad = new Set(errors.map((e) => e.invoiceNo));
  const valid = sales.filter((r) => !bad.has(r.invoiceNo));
  const period = sales[0].date.slice(0, 7);

  const b2b = [];
  const b2clAgg = {};
  const b2csAgg = {};
  const nilAgg = {};
  const hsnAgg = {};

  for (const r of valid) {
    if (!hsnAgg[r.hsn]) {
      hsnAgg[r.hsn] = { hsn: r.hsn, uqc: 'NOS', qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    }
    hsnAgg[r.hsn].qty += 1;
    hsnAgg[r.hsn].taxable += r.taxableValue;
    hsnAgg[r.hsn].igst += r.igst;
    hsnAgg[r.hsn].cgst += r.cgst;
    hsnAgg[r.hsn].sgst += r.sgst;

    if (r.rate === 0) {
      if (!nilAgg[String(r.rate)]) nilAgg[String(r.rate)] = { rate: r.rate, taxable: 0 };
      nilAgg[String(r.rate)].taxable += r.taxableValue;
      continue;
    }
    if (r.partyGstin) {
      b2b.push({
        invoiceNo: r.invoiceNo,
        gstin: r.partyGstin,
        partyName: r.partyName,
        state: r.partyState,
        hsn: r.hsn,
        rate: r.rate,
        taxable: r.taxableValue,
        cgst: r.cgst,
        sgst: r.sgst,
        igst: r.igst,
      });
    } else {
      const key = r.partyState + '|' + r.rate;
      const target = isB2cl(r, supplierState) ? b2clAgg : b2csAgg;
      if (!target[key]) {
        target[key] = { state: r.partyState, rate: r.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      target[key].taxable += r.taxableValue;
      target[key].cgst += r.cgst;
      target[key].sgst += r.sgst;
      target[key].igst += r.igst;
    }
  }

  b2b.sort((a, b) => a.invoiceNo.localeCompare(b.invoiceNo));
  const b2cl = Object.values(b2clAgg).sort(compareStateRate);
  const b2cs = Object.values(b2csAgg).sort(compareStateRate);
  const nilExempt = Object.values(nilAgg).sort((a, b) => b.taxable - a.taxable || a.rate - b.rate);
  const hsn = Object.values(hsnAgg).sort((a, b) => a.hsn.localeCompare(b.hsn));

  const totalTaxable =
    b2b.reduce((s, r) => s + r.taxable, 0) +
    b2cl.reduce((s, r) => s + r.taxable, 0) +
    b2cs.reduce((s, r) => s + r.taxable, 0) +
    nilExempt.reduce((s, r) => s + r.taxable, 0);

  return {
    period,
    tables: { b2b, b2cl, b2cs, nilExempt, hsn },
    totalTaxable,
    errors,
  };
}
