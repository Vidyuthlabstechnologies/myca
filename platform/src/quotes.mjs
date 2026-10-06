import { gstSplit, partyStateOf } from './chart.mjs';
import { localToday, postingDate } from './dates.mjs';
import { rules } from './sprint-load.mjs';
import { createInvoice } from './invoice.mjs';
import { daysBetween } from './reminders.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const DEFAULT_VALID_DAYS = 30;

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function rateInForce(rate, onDate) {
  const found = rules.rule('gst.rates.valid', onDate);
  return found.ok && found.value.includes(Number(rate));
}

function nextQuoteId(state) {
  state.quoteSeq = Number(state.quoteSeq || 0);
  const taken = new Set((state.quotes || []).map((quote) => quote.id));
  let id;
  do {
    state.quoteSeq += 1;
    id = `QT-${String(state.quoteSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function planQuote(state, args = {}) {
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  const partyName = String(args.partyName || '').trim();
  if (!partyName) return { ok: false, error: 'CUSTOMER_REQUIRED' };
  const partyGstin = String(args.partyGstin || '').trim().toUpperCase();
  const validDays = args.validDays == null || args.validDays === '' ? DEFAULT_VALID_DAYS : Number(args.validDays);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) return { ok: false, error: 'BAD_VALIDITY' };
  const raw = Array.isArray(args.lines) ? args.lines : [];
  if (!raw.length) return { ok: false, error: 'NO_LINES' };
  const company = state.company || {};
  const pos = partyStateOf(partyGstin) || company.state;
  const lines = [];
  for (const line of raw) {
    const qty = Number(line.qty == null || line.qty === '' ? 1 : line.qty);
    const rate = Number(line.rate);
    if (line.gstRate == null || line.gstRate === '') return { ok: false, error: 'RATE_REQUIRED' };
    const gstRate = Number(line.gstRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return { ok: false, error: 'BAD_LINE' };
    if (!rateInForce(gstRate, date)) return { ok: false, error: 'RATE_NOT_IN_FORCE', gstRate, date };
    const taxable = round2(qty * rate);
    const split = gstSplit({ taxable, rate: gstRate, supplierState: company.state, partyState: pos });
    lines.push({
      description: String(line.description || 'Supply'),
      hsn: String(line.hsn ?? '').trim(),
      qty,
      rate,
      gstRate,
      taxable,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      amount: round2(taxable + split.tax),
    });
  }
  const sum = (key) => round2(lines.reduce((total, line) => total + line[key], 0));
  if (sum('taxable') <= 0) return { ok: false, error: 'ZERO_AMOUNT' };
  return {
    ok: true,
    plan: {
      date,
      validUntil: addDays(date, validDays),
      partyName,
      partyGstin,
      placeOfSupply: pos,
      lines,
      taxable: sum('taxable'),
      cgst: sum('cgst'),
      sgst: sum('sgst'),
      igst: sum('igst'),
      total: round2(sum('taxable') + sum('cgst') + sum('sgst') + sum('igst')),
    },
  };
}

export function createQuote(state, args = {}) {
  const planned = planQuote(state, args);
  if (!planned.ok) return planned;
  const quote = { id: nextQuoteId(state), ...planned.plan, status: 'open', invoiceId: '' };
  state.quotes = state.quotes || [];
  state.quotes.push(quote);
  return { ok: true, quote };
}

export function findQuote(state, id) {
  return (state.quotes || []).find((quote) => quote.id === String(id || '').trim().toUpperCase()) || null;
}

export function quoteState(quote, today = localToday()) {
  if (quote.status !== 'open') return quote.status;
  return quote.validUntil < today ? 'expired' : 'open';
}

export function markQuote(state, args = {}) {
  const quote = findQuote(state, args.id);
  if (!quote) return { ok: false, error: 'QUOTE_NOT_FOUND', id: args.id };
  const outcome = String(args.outcome || '');
  if (!['accepted', 'declined'].includes(outcome)) return { ok: false, error: 'BAD_OUTCOME' };
  if (quote.status === 'invoiced') return { ok: false, error: 'ALREADY_INVOICED', invoiceId: quote.invoiceId };
  quote.status = outcome;
  quote.decidedOn = localToday();
  return { ok: true, quote };
}

export function invoiceArgsFromQuote(quote, args = {}) {
  return {
    partyName: quote.partyName,
    ...(quote.partyGstin ? { partyGstin: quote.partyGstin } : {}),
    date: args.date == null || args.date === '' ? localToday() : args.date,
    lines: quote.lines.map((line) => ({ description: line.description, hsn: line.hsn, qty: line.qty, rate: line.rate, gstRate: line.gstRate })),
  };
}

export function checkConvert(state, args = {}) {
  const quote = findQuote(state, args.id);
  if (!quote) return { ok: false, error: 'QUOTE_NOT_FOUND', id: args.id };
  if (quote.status === 'invoiced') return { ok: false, error: 'ALREADY_INVOICED', invoiceId: quote.invoiceId };
  if (quote.status === 'declined') return { ok: false, error: 'QUOTE_DECLINED' };
  return { ok: true, quote, expired: quoteState(quote) === 'expired' };
}

export function convertQuote(state, args = {}) {
  const checked = checkConvert(state, args);
  if (!checked.ok) return checked;
  const { quote } = checked;
  const made = createInvoice(state, invoiceArgsFromQuote(quote, args));
  if (made.ok === false) return made;
  made.invoice.quoteId = quote.id;
  quote.status = 'invoiced';
  quote.invoiceId = made.invoice.id;
  return { ...made, quote };
}

export function listQuotes(state, { status = 'all' } = {}) {
  const today = localToday();
  const rows = (state.quotes || [])
    .map((quote) => ({ ...quote, state: quoteState(quote, today), expiresIn: daysBetween(today, quote.validUntil) }))
    .filter((quote) => status === 'all' || quote.state === status)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { ok: true, data: { quotes: rows } };
}
