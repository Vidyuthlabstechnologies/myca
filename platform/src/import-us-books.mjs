import { planUsInvoice, createUsInvoice, normalizeJurisdiction } from './us-sales.mjs';

const JURISDICTION = /^[A-Z]{2}(?:-[A-Z0-9]{2,20})?$/;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const ALIASES = {
  invoiceNo: ['invoicenumber', 'invoice number', 'invoice no', 'invoice no.', 'invoice#', 'num', 'no.', 'number', 'ref', 'reference'],
  date: ['invoicedate', 'invoice date', 'date', 'txn date', 'transaction date'],
  partyName: ['contactname', 'contact name', 'customer', 'customer name', 'name', 'client'],
  partyAddress: ['shipping address', 'ship to', 'billing address', 'postaladdress', 'address'],
  description: ['description', 'product/service', 'product/service description', 'memo/description', 'item', 'item name', 'line description'],
  qty: ['quantity', 'qty'],
  rate: ['unitamount', 'unit amount', 'unit price', 'sales price', 'rate', 'price'],
  amount: ['lineamount', 'line amount', 'amount', 'net amount', 'subtotal'],
  taxAmount: ['taxamount', 'tax amount', 'sales tax', 'tax', 'line tax'],
  taxCode: ['taxtype', 'tax type', 'tax code', 'tax rate name', 'tax name', 'tax jurisdiction', 'jurisdiction', 'sales tax code'],
};

function columns(header) {
  const idx = {};
  const lower = header.map((h) => h.trim().toLowerCase().replace(/^﻿/, ''));
  for (const [canon, names] of Object.entries(ALIASES)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) idx[canon] = i;
  }
  return idx;
}

function split(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

export function usDate(value) {
  const text = String(value == null ? '' : value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/) || text.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const first = /^\d/.test(named[1]);
    const month = months.indexOf((first ? named[2] : named[1]).toLowerCase()) + 1;
    const day = Number(first ? named[1] : named[2]);
    if (month > 0) return `${named[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return text;
}

function money(cell) {
  const raw = String(cell == null ? '' : cell).replace(/[$,\s]/g, '');
  if (raw === '') return null;
  const n = Number(raw.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}

const EXEMPT_CODES = /exempt|no tax|non[- ]?taxable|tax free|zero|none|n\/a/i;

export function parseUsInvoicesCsv(text) {
  const rows = split(text);
  if (!rows.length) return { invoices: [], meta: { error: 'EMPTY' } };
  const idx = columns(rows[0]);
  if (idx.invoiceNo == null || idx.partyName == null) return { invoices: [], meta: { error: 'NO_HEADER', header: rows[0] } };
  const source = rows[0].some((h) => /^(invoicenumber|contactname|unitamount|taxtype)$/i.test(h.trim())) ? 'xero' : rows[0].some((h) => /product\/service|sales price|memo\/description/i.test(h)) ? 'quickbooks' : 'csv';
  const grouped = new Map();
  for (const cells of rows.slice(1)) {
    const id = String(cells[idx.invoiceNo] || '').trim();
    if (!id) continue;
    if (!grouped.has(id)) {
      const code = idx.taxCode == null ? '' : String(cells[idx.taxCode] || '').trim();
      const normalized = normalizeJurisdiction(code.replace(/\s+/g, '-'));
      grouped.set(id, {
        id,
        date: usDate(cells[idx.date] || ''),
        partyName: String(cells[idx.partyName] || '').trim(),
        partyAddress: idx.partyAddress == null ? '' : String(cells[idx.partyAddress] || '').trim(),
        taxCode: code,
        taxJurisdiction: JURISDICTION.test(normalized) ? normalized : '',
        fileTax: 0,
        lines: [],
      });
    }
    const invoice = grouped.get(id);
    const qty = idx.qty == null ? 1 : Number(String(cells[idx.qty] || '1').replace(/,/g, '')) || 1;
    let rate = idx.rate == null ? null : money(cells[idx.rate]);
    const amount = idx.amount == null ? null : money(cells[idx.amount]);
    if (rate == null && amount != null) rate = round2(amount / qty);
    const taxAmount = idx.taxAmount == null ? 0 : money(cells[idx.taxAmount]) || 0;
    const code = idx.taxCode == null ? '' : String(cells[idx.taxCode] || '').trim();
    const taxable = taxAmount > 0 || (code !== '' && !EXEMPT_CODES.test(code) && idx.taxAmount == null);
    invoice.fileTax = round2(invoice.fileTax + taxAmount);
    invoice.lines.push({ description: String(cells[idx.description] || 'Item').trim() || 'Item', qty, rate: rate == null ? 0 : rate, taxable });
  }
  const invoices = [...grouped.values()];
  return { invoices, meta: { count: invoices.length, source } };
}

export function planUsImport(state, args = {}) {
  const parsed = parseUsInvoicesCsv(args.csv || '');
  if (parsed.meta.error) return { ok: false, error: parsed.meta.error, parsed: parsed.meta };
  const fallback = normalizeJurisdiction(args.taxJurisdiction || '');
  const existing = new Set((state.invoices || []).map((inv) => inv.id));
  const ready = [];
  const skipped = [];
  for (const inv of parsed.invoices) {
    if (existing.has(inv.id)) { skipped.push({ id: inv.id, reason: 'exists' }); continue; }
    const needsTax = inv.lines.some((line) => line.taxable);
    const jurisdiction = inv.taxJurisdiction || fallback;
    if (needsTax && !jurisdiction) { skipped.push({ id: inv.id, reason: 'jurisdiction_missing', taxCode: inv.taxCode }); continue; }
    const input = { id: inv.id, date: inv.date, partyName: inv.partyName, partyAddress: inv.partyAddress, lines: inv.lines, ...(needsTax ? { taxJurisdiction: jurisdiction } : {}) };
    const planned = planUsInvoice(state, input);
    if (!planned.ok) { skipped.push({ id: inv.id, reason: planned.error, ...(planned.code ? { code: planned.code } : {}), ...(planned.date ? { date: planned.date } : {}) }); continue; }
    if (Math.abs(planned.plan.tax - inv.fileTax) > 0.01) { skipped.push({ id: inv.id, reason: 'tax_differs', fileTax: inv.fileTax, computedTax: planned.plan.tax, jurisdiction }); continue; }
    ready.push({ input, total: planned.plan.total, tax: planned.plan.tax });
  }
  return { ok: true, parsed: parsed.meta, ready, skipped };
}

export function importUsInvoices(state, args = {}) {
  const planned = planUsImport(state, args);
  if (!planned.ok) return planned;
  const created = [];
  const skipped = [...planned.skipped];
  for (const item of planned.ready) {
    const result = createUsInvoice(state, item.input);
    if (result.ok) created.push(result);
    else skipped.push({ id: item.input.id, reason: result.error });
  }
  return { ok: true, parsed: planned.parsed, created, skipped };
}

export function usImportWords(result, money) {
  const made = result.created.length;
  const reasons = {};
  for (const row of result.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already in the books', jurisdiction_missing: 'with no sales tax jurisdiction', tax_differs: 'whose sales tax differs from the recorded rate', RATE_UNKNOWN: 'with no rate recorded for their jurisdiction', INVALID_DATE: 'with a date I cannot read', PERIOD_LOCKED: 'dated in a locked period', ZERO_AMOUNT: 'that come to nothing', NO_LINES: 'with no lines' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const total = result.created.reduce((sum, item) => sum + item.invoice.total, 0);
  return `Imported ${made === 1 ? '1 invoice' : `${made} invoices`} from ${result.parsed.source === 'xero' ? 'Xero' : result.parsed.source === 'quickbooks' ? 'QuickBooks' : 'the file'}${made ? ` totalling ${money(total)}` : ''}.${held.length ? ` Held back: ${held.join('; ')}.` : ''}`;
}
