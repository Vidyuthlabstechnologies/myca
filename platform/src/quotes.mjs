import { gstSplit, partyStateOf } from './chart.mjs';
import { localToday, postingDate } from './dates.mjs';
import { rules } from './sprint-load.mjs';
import { createInvoice } from './invoice.mjs';
import { daysBetween } from './reminders.mjs';
import { countryOf } from './country.mjs';
import { rateFor, normalizeJurisdiction, createUsInvoice } from './us-sales.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const DEFAULT_VALID_DAYS = 30;
export const SALES_DOCUMENT_KINDS = {
  quote: { prefix: 'QT', title: 'Quote', outcomes: ['accepted', 'declined'], expires: true },
  proforma: { prefix: 'PI', title: 'Proforma invoice', outcomes: ['accepted', 'declined'], expires: true },
  order: { prefix: 'SO', title: 'Sales order', outcomes: ['cancelled'], expires: false },
  challan: { prefix: 'DC', title: 'Delivery challan', outcomes: ['returned', 'cancelled'], expires: false },
};
export const CHALLAN_REASONS = ['job-work', 'approval', 'line-sale', 'exhibition', 'own-use', 'other'];

export function kindOf(document) {
  return Object.hasOwn(SALES_DOCUMENT_KINDS, String(document?.kind || '')) ? document.kind : 'quote';
}

export function kindTitle(document) {
  return SALES_DOCUMENT_KINDS[kindOf(document)].title;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function rateInForce(rate, onDate) {
  const found = rules.rule('gst.rates.valid', onDate);
  return found.ok && found.value.includes(Number(rate));
}

function nextQuoteId(state, kind = 'quote') {
  if (kind !== 'quote') {
    const prefix = SALES_DOCUMENT_KINDS[kind].prefix;
    const used = (state.quotes || []).map((quote) => String(quote.id)).filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.slice(prefix.length + 1)) || 0);
    return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
  }
  state.quoteSeq = Number(state.quoteSeq || 0);
  const taken = new Set((state.quotes || []).map((quote) => quote.id));
  let id;
  do {
    state.quoteSeq += 1;
    id = `QT-${String(state.quoteSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

function kindArgs(args) {
  const kind = args.kind == null || args.kind === '' ? 'quote' : String(args.kind);
  if (!Object.hasOwn(SALES_DOCUMENT_KINDS, kind)) return { error: 'BAD_KIND' };
  if (kind !== 'challan') return { kind, extra: {} };
  const reason = args.reason == null || args.reason === '' ? 'other' : String(args.reason);
  if (!CHALLAN_REASONS.includes(reason)) return { error: 'BAD_CHALLAN_REASON' };
  return { kind, extra: { reason } };
}

export function planQuote(state, args = {}) {
  const kinded = kindArgs(args);
  if (kinded.error) return { ok: false, error: kinded.error };
  const planned = planQuoteLines(state, args);
  if (!planned.ok) return planned;
  return { ok: true, plan: { kind: kinded.kind, ...kinded.extra, ...planned.plan } };
}

function planQuoteLines(state, args = {}) {
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
  if (countryOf(state) === 'US') return planUsQuote(state, { date, validDays, partyName, raw, args });
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

function planUsQuote(state, { date, validDays, partyName, raw, args }) {
  const taxExempt = args.taxExempt === true;
  const exemptionReason = String(args.exemptionReason || '').trim().slice(0, 120);
  if (taxExempt && !exemptionReason) return { ok: false, error: 'EXEMPTION_REASON_REQUIRED' };
  const parsed = raw.map((line) => ({ description: String(line.description || 'Supply'), qty: Number(line.qty == null || line.qty === '' ? 1 : line.qty), rate: Number(line.rate), taxable: taxExempt ? false : line.taxable !== false }));
  if (parsed.some((line) => !Number.isFinite(line.qty) || line.qty <= 0 || !Number.isFinite(line.rate) || line.rate < 0)) return { ok: false, error: 'BAD_LINE' };
  let jurisdiction = '';
  let rate = null;
  if (!taxExempt && parsed.some((line) => line.taxable)) {
    jurisdiction = normalizeJurisdiction(args.taxJurisdiction);
    if (!jurisdiction) return { ok: false, error: 'JURISDICTION_REQUIRED' };
    rate = rateFor(state, jurisdiction, date);
    if (!rate) return { ok: false, error: 'RATE_UNKNOWN', code: jurisdiction, date };
  }
  const lines = parsed.map((line) => {
    const subtotal = round2(line.qty * line.rate);
    const tax = rate && line.taxable ? round2((subtotal * rate.ratePercent) / 100) : 0;
    return { description: line.description, hsn: '', qty: line.qty, rate: line.rate, gstRate: 0, taxable: line.taxable ? subtotal : 0, subtotal, taxRate: rate && line.taxable ? rate.ratePercent : 0, salesTax: tax, cgst: 0, sgst: 0, igst: 0, amount: round2(subtotal + tax) };
  });
  const subtotal = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
  if (subtotal <= 0) return { ok: false, error: 'ZERO_AMOUNT' };
  const salesTax = round2(lines.reduce((sum, line) => sum + line.salesTax, 0));
  return {
    ok: true,
    plan: { country: 'US', date, validUntil: addDays(date, validDays), partyName, partyGstin: '', placeOfSupply: '', lines, taxable: subtotal, subtotal, salesTax, taxJurisdiction: jurisdiction, taxRate: rate ? rate.ratePercent : 0, taxExempt, exemptionReason, cgst: 0, sgst: 0, igst: 0, total: round2(subtotal + salesTax) },
  };
}

export function createQuote(state, args = {}) {
  const planned = planQuote(state, args);
  if (!planned.ok) return planned;
  const quote = { id: nextQuoteId(state, planned.plan.kind), ...planned.plan, status: 'open', invoiceId: '' };
  state.quotes = state.quotes || [];
  state.quotes.push(quote);
  return { ok: true, quote };
}

export function findQuote(state, id) {
  return (state.quotes || []).find((quote) => quote.id === String(id || '').trim().toUpperCase()) || null;
}

export function quoteState(quote, today = localToday()) {
  if (quote.status !== 'open') return quote.status;
  return SALES_DOCUMENT_KINDS[kindOf(quote)].expires && quote.validUntil < today ? 'expired' : 'open';
}

export function markQuote(state, args = {}) {
  const quote = findQuote(state, args.id);
  if (!quote) return { ok: false, error: 'QUOTE_NOT_FOUND', id: args.id };
  const outcome = String(args.outcome || '');
  if (!SALES_DOCUMENT_KINDS[kindOf(quote)].outcomes.includes(outcome)) return { ok: false, error: 'BAD_OUTCOME', allowed: SALES_DOCUMENT_KINDS[kindOf(quote)].outcomes };
  if (quote.status === 'invoiced') return { ok: false, error: 'ALREADY_INVOICED', invoiceId: quote.invoiceId };
  if (['cancelled', 'returned'].includes(quote.status)) return { ok: false, error: 'ALREADY_CLOSED', status: quote.status };
  quote.status = outcome;
  quote.decidedOn = localToday();
  return { ok: true, quote };
}

export function invoiceArgsFromQuote(quote, args = {}) {
  return {
    partyName: quote.partyName,
    ...(quote.partyGstin ? { partyGstin: quote.partyGstin } : {}),
    date: args.date == null || args.date === '' ? localToday() : args.date,
    lines: quote.lines.map((line) => (quote.country === 'US' ? { description: line.description, qty: line.qty, rate: line.rate, taxable: line.taxable > 0 } : { description: line.description, hsn: line.hsn, qty: line.qty, rate: line.rate, gstRate: line.gstRate })),
    ...(quote.country === 'US' ? (quote.taxExempt ? { taxExempt: true, exemptionReason: quote.exemptionReason } : { taxJurisdiction: quote.taxJurisdiction }) : {}),
  };
}

export function checkConvert(state, args = {}) {
  const quote = findQuote(state, args.id);
  if (!quote) return { ok: false, error: 'QUOTE_NOT_FOUND', id: args.id };
  if (quote.status === 'invoiced') return { ok: false, error: 'ALREADY_INVOICED', invoiceId: quote.invoiceId };
  if (quote.status === 'declined') return { ok: false, error: 'QUOTE_DECLINED' };
  if (['cancelled', 'returned'].includes(quote.status)) return { ok: false, error: 'ALREADY_CLOSED', status: quote.status };
  if (kindOf(quote) === 'challan' && quote.reason === 'job-work') return { ok: false, error: 'CHALLAN_NOT_A_SALE' };
  return { ok: true, quote, expired: quoteState(quote) === 'expired' };
}

export function convertQuote(state, args = {}) {
  const checked = checkConvert(state, args);
  if (!checked.ok) return checked;
  const { quote } = checked;
  const made = quote.country === 'US' ? createUsInvoice(state, invoiceArgsFromQuote(quote, args)) : createInvoice(state, invoiceArgsFromQuote(quote, args));
  if (made.ok === false) return made;
  made.invoice.quoteId = quote.id;
  quote.status = 'invoiced';
  quote.invoiceId = made.invoice.id;
  return { ...made, quote };
}

export function listQuotes(state, { status = 'all', kind = 'all' } = {}) {
  const today = localToday();
  const rows = (state.quotes || [])
    .map((quote) => ({ ...quote, kind: kindOf(quote), title: kindTitle(quote), state: quoteState(quote, today), expiresIn: daysBetween(today, quote.validUntil) }))
    .filter((quote) => (status === 'all' || quote.state === status) && (kind === 'all' || quote.kind === kind))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { ok: true, data: { quotes: rows } };
}
