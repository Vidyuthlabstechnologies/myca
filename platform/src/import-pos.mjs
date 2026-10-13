import { createInvoice } from './invoice.mjs';
import { gstSplit } from './chart.mjs';
import { isoDate } from './dates.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const ALIASES = {
  date: ['date', 'bill date', 'sale date', 'day', 'invoice date'],
  gstRate: ['gst rate', 'gst %', 'gst%', 'rate', 'tax rate', 'tax %', 'gst'],
  taxable: ['taxable', 'taxable value', 'taxable amount', 'amount before tax', 'net sales', 'basic', 'sales before tax'],
  cgst: ['cgst'],
  sgst: ['sgst'],
  igst: ['igst'],
  total: ['total', 'gross', 'gross sales', 'invoice value', 'amount'],
  count: ['bills', 'bill count', 'invoices', 'count', 'no of bills', 'transactions'],
  description: ['description', 'category', 'item', 'counter', 'register'],
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
  return String(text).replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim()).map((line) => {
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

function money(cell) {
  const raw = String(cell == null ? '' : cell).replace(/[₹,\s]/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function rateOf(cell) {
  const raw = String(cell == null ? '' : cell).replace('%', '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parsePosSalesCsv(text) {
  const rows = split(text);
  if (!rows.length) return { days: [], meta: { error: 'EMPTY' } };
  const idx = columns(rows[0]);
  if (idx.date == null || idx.taxable == null || idx.gstRate == null) return { days: [], meta: { error: 'NO_HEADER', header: rows[0], need: 'date, gst rate and taxable value columns' } };
  const byDay = new Map();
  const held = [];
  for (const [n, cells] of rows.slice(1).entries()) {
    const date = isoDate(cells[idx.date]) || '';
    const gstRate = rateOf(cells[idx.gstRate]);
    const taxable = money(cells[idx.taxable]);
    if (!date) { held.push({ row: n + 2, reason: 'INVALID_DATE', value: cells[idx.date] }); continue; }
    if (gstRate == null) { held.push({ row: n + 2, reason: 'RATE_REQUIRED', date }); continue; }
    if (taxable == null || taxable < 0) { held.push({ row: n + 2, reason: 'BAD_AMOUNT', date }); continue; }
    if (taxable === 0) continue;
    const fileTax = round2((idx.cgst == null ? 0 : money(cells[idx.cgst]) || 0) + (idx.sgst == null ? 0 : money(cells[idx.sgst]) || 0) + (idx.igst == null ? 0 : money(cells[idx.igst]) || 0));
    const day = byDay.get(date) || { date, lines: new Map(), fileTax: 0, bills: 0, hasFileTax: idx.cgst != null || idx.sgst != null || idx.igst != null };
    const line = day.lines.get(gstRate) || { description: idx.description != null && String(cells[idx.description] || '').trim() ? `Counter sales: ${String(cells[idx.description]).trim()}` : 'Counter sales', gstRate, taxable: 0 };
    line.taxable = round2(line.taxable + taxable);
    day.lines.set(gstRate, line);
    day.fileTax = round2(day.fileTax + fileTax);
    day.bills += idx.count == null ? 0 : Number(cells[idx.count]) || 0;
    byDay.set(date, day);
  }
  const days = [...byDay.values()].map((day) => ({ ...day, lines: [...day.lines.values()].sort((a, b) => a.gstRate - b.gstRate) })).sort((a, b) => a.date.localeCompare(b.date));
  return { days, held, meta: { count: days.length, rows: rows.length - 1 } };
}

export function planPosImport(state, args = {}) {
  const parsed = parsePosSalesCsv(args.csv || '');
  if (parsed.meta.error) return { ok: false, error: parsed.meta.error, parsed: parsed.meta };
  const company = state.company || {};
  const existing = new Set((state.invoices || []).filter((inv) => inv.source === 'pos').map((inv) => inv.date));
  const ready = [];
  const skipped = parsed.held.map((row) => ({ id: `row ${row.row}`, reason: row.reason, date: row.date || row.value }));
  for (const day of parsed.days) {
    if (existing.has(day.date)) { skipped.push({ id: day.date, reason: 'exists' }); continue; }
    const computedTax = round2(day.lines.reduce((sum, line) => sum + gstSplit({ taxable: line.taxable, rate: line.gstRate, supplierState: company.state, partyState: company.state }).tax, 0));
    if (day.hasFileTax && Math.abs(computedTax - day.fileTax) > 0.01 * Math.max(1, day.lines.length)) { skipped.push({ id: day.date, reason: 'tax_differs', fileTax: day.fileTax, computedTax }); continue; }
    const input = { partyName: 'Walk-in', partyGstin: '', partyState: company.state, date: day.date, lines: day.lines.map((line) => ({ description: line.description, hsn: '', qty: 1, rate: line.taxable, gstRate: line.gstRate })) };
    ready.push({ date: day.date, input, taxable: round2(day.lines.reduce((sum, line) => sum + line.taxable, 0)), tax: computedTax, bills: day.bills });
  }
  return { ok: true, parsed: parsed.meta, ready, skipped };
}

export function importPosSales(state, args = {}) {
  const planned = planPosImport(state, args);
  if (!planned.ok) return planned;
  const created = [];
  const skipped = [...planned.skipped];
  for (const item of planned.ready) {
    const result = createInvoice(state, item.input);
    if (result.ok) {
      result.invoice.source = 'pos';
      result.invoice.posBills = item.bills;
      created.push(result);
    } else skipped.push({ id: item.date, reason: result.error });
  }
  return { ok: true, parsed: planned.parsed, created, skipped };
}

export function posImportWords(result, money) {
  const made = result.created.length;
  const total = result.created.reduce((sum, item) => sum + item.invoice.total, 0);
  const reasons = {};
  for (const row of result.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already imported for that day', tax_differs: 'whose GST in the file differs from the rate', RATE_REQUIRED: 'with no GST rate', INVALID_DATE: 'with a date I cannot read', BAD_AMOUNT: 'with an amount I cannot read', PERIOD_LOCKED: 'in a locked period' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  return `Imported counter sales for ${made === 1 ? '1 day' : `${made} days`}${made ? ` totalling ${money(total)}` : ''}; each day is one walk-in invoice by GST rate, so it lands in B2CS of GSTR-1.${held.length ? ` Held back: ${held.join('; ')}.` : ''}`;
}
