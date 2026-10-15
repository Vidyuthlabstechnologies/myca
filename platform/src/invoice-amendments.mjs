import { createTransfers, TRANSFER_FLAGS, paise } from './ledger.mjs';
import { gstSplit } from './chart.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { filingFor } from './filings.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const SALES = 4000;
const HEADS = { cgst: 2100, sgst: 2101, igst: 2102 };

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function periodOf(date) {
  return String(date || '').slice(0, 7);
}

function snapshot(invoice) {
  return {
    partyGstin: invoice.partyGstin || '',
    lines: (invoice.lines || []).map((line) => ({ ...line })),
    taxable: invoice.taxable,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    total: invoice.total,
  };
}

function revisedLines(state, invoice, rawLines) {
  const specs = rawLines.map((line) => ({ description: String(line.description || 'Supply'), hsn: String(line.hsn ?? '').trim(), qty: Number(line.qty == null || line.qty === '' ? 1 : line.qty), rate: Number(line.rate), gstRate: Number(line.gstRate) }));
  if (specs.some((spec) => !Number.isFinite(spec.qty) || spec.qty <= 0 || !Number.isFinite(spec.rate) || spec.rate < 0 || !Number.isFinite(spec.gstRate))) return { error: 'BAD_LINE' };
  const lines = specs.map((spec) => {
    const taxable = round2(spec.qty * spec.rate);
    const split = gstSplit({ taxable, rate: spec.gstRate, supplierState: invoice.registrationState || state.company.state, partyState: invoice.placeOfSupply || invoice.partyState });
    return { description: spec.description, hsn: spec.hsn, qty: spec.qty, rate: spec.rate, gstRate: spec.gstRate, taxable, ...split, amount: round2(taxable + split.tax) };
  });
  const sum = (key) => round2(lines.reduce((total, line) => total + Number(line[key] || 0), 0));
  const taxable = sum('taxable');
  if (taxable <= 0) return { error: 'ZERO_AMOUNT' };
  return { lines, taxable, cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: round2(taxable + sum('cgst') + sum('sgst') + sum('igst')) };
}

export function planAmendment(state, args = {}) {
  const id = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === id);
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId: id };
  if (invoice.country === 'US') return { ok: false, error: 'NOT_FOR_COUNTRY' };
  if (invoice.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED' };
  const originalPeriod = periodOf(invoice.date);
  if (!filingFor(state, 'GSTR-1', originalPeriod)) return { ok: false, error: 'NOT_FILED', period: originalPeriod, hint: 'GSTR-1 for that month is not recorded as filed; cancel the invoice and raise a fresh one instead of amending.' };
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (date < invoice.date) return { ok: false, error: 'DATE_BEFORE_INVOICE', date, invoiceDate: invoice.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  if (filingFor(state, 'GSTR-1', periodOf(date))) return { ok: false, error: 'AMENDMENT_PERIOD_FILED', period: periodOf(date), hint: 'GSTR-1 for the month of the amendment is already filed; date it in an open month.' };
  const reason = String(args.reason || '').trim().slice(0, 120);
  if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
  const before = snapshot(invoice);
  let partyGstin = before.partyGstin;
  if (args.partyGstin != null) {
    const given = String(args.partyGstin).replace(/\s+/g, '').toUpperCase();
    if (given && !GSTIN.test(given)) return { ok: false, error: 'INVALID_GSTIN', partyGstin: given };
    partyGstin = given;
  }
  const revised = Array.isArray(args.lines) && args.lines.length ? revisedLines(state, invoice, args.lines) : { lines: before.lines, taxable: before.taxable, cgst: before.cgst, sgst: before.sgst, igst: before.igst, total: before.total };
  if (revised.error) return { ok: false, error: revised.error };
  const after = { partyGstin, lines: revised.lines, taxable: revised.taxable, cgst: revised.cgst, sgst: revised.sgst, igst: revised.igst, total: revised.total };
  const delta = { taxable: round2(after.taxable - before.taxable), cgst: round2(after.cgst - before.cgst), sgst: round2(after.sgst - before.sgst), igst: round2(after.igst - before.igst), total: round2(after.total - before.total) };
  if (partyGstin === before.partyGstin && Object.values(delta).every((value) => Math.abs(value) < 0.005)) return { ok: false, error: 'NOTHING_CHANGED' };
  return { ok: true, plan: { invoice, date, period: periodOf(date), originalPeriod, reason, before, after, delta } };
}

export function amendInvoice(state, args = {}) {
  const planned = planAmendment(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { invoice, delta } = plan;
  const party = (state.parties || []).find((item) => (invoice.partyAccountId ? item.accountId === invoice.partyAccountId : item.name === invoice.partyName));
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const seqBefore = state.transferSeq;
  state.amendmentSeq = Number(state.amendmentSeq || 0) + 1;
  const id = `AMD-${String(state.amendmentSeq).padStart(4, '0')}`;
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [];
  const post = (account, amount, code) => {
    if (Math.abs(amount) < 0.005) return;
    const up = amount > 0;
    bundle.push({ id: nextTransferId(state), debitAccountId: up ? party.accountId : account, creditAccountId: up ? account : party.accountId, amount: paise(Math.abs(amount)), flags: linked, invoiceId: id, code, userData: plan.date });
  };
  post(SALES, delta.taxable, 'AMEND');
  for (const head of ['cgst', 'sgst', 'igst']) post(HEADS[head], delta[head], `AMEND-${head.toUpperCase()}`);
  const posted = bundle.length ? createTransfers(state.ledger, bundle) : [];
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.amendmentSeq -= 1;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  const record = { id, date: plan.date, period: plan.period, originalPeriod: plan.originalPeriod, reason: plan.reason, before: plan.before, after: plan.after, delta, transferIds: posted.map((result) => result.id) };
  invoice.amendments = Array.isArray(invoice.amendments) ? invoice.amendments : [];
  invoice.amendments.push(record);
  invoice.partyGstin = plan.after.partyGstin;
  invoice.lines = plan.after.lines;
  invoice.taxable = plan.after.taxable;
  invoice.cgst = plan.after.cgst;
  invoice.sgst = plan.after.sgst;
  invoice.igst = plan.after.igst;
  invoice.total = plan.after.total;
  if (plan.after.partyGstin && party.gstin !== plan.after.partyGstin) party.gstin = plan.after.partyGstin;
  return { ok: true, amendment: record, invoice, posted };
}

export function invoiceAsFiled(invoice, period) {
  const amendments = Array.isArray(invoice.amendments) ? invoice.amendments : [];
  if (!amendments.length) return invoice;
  let view = amendments[0].before;
  for (const amendment of amendments) {
    if (amendment.period <= period) view = amendment.after;
  }
  return { ...invoice, ...view };
}

export function amendmentsInPeriod(invoices, period) {
  const out = [];
  for (const invoice of invoices || []) {
    const amendments = (Array.isArray(invoice.amendments) ? invoice.amendments : []).filter((amendment) => amendment.period === period);
    if (!amendments.length) continue;
    const latest = amendments[amendments.length - 1];
    out.push({ invoice, original: { ...invoice, ...amendments[0].before }, revised: { ...invoice, ...latest.after }, amendment: latest });
  }
  return out;
}

export function listAmendments(state, args = {}) {
  const rows = [];
  for (const invoice of state.invoices || []) {
    for (const amendment of Array.isArray(invoice.amendments) ? invoice.amendments : []) {
      if (args.period && amendment.period !== String(args.period)) continue;
      rows.push({ id: amendment.id, invoiceId: invoice.id, partyName: invoice.partyName, date: amendment.date, period: amendment.period, originalPeriod: amendment.originalPeriod, reason: amendment.reason, before: amendment.before.total, after: amendment.after.total, delta: amendment.delta.total });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { ok: true, data: { amendments: rows, count: rows.length } };
}

export function amendmentWords(result, money) {
  const a = result.amendment;
  const sign = a.delta.total >= 0 ? 'up' : 'down';
  return `${result.invoice.id} amended (${a.id}) for ${a.reason}: total ${money(a.before.total)} → ${money(a.after.total)}, ${sign} by ${money(Math.abs(a.delta.total))}. It goes in GSTR-1 for ${a.period} as an amendment of the ${a.originalPeriod} invoice; the ${a.originalPeriod} return is unchanged.`;
}
