import { createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { gstSplit } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const NO_TAX = { cgst: 0, sgst: 0, igst: 0, tax: 0 };

function splitFor(invoice, taxable, gstRate, company) {
  if (invoice.zeroRated) return NO_TAX;
  return gstSplit({ taxable, rate: gstRate, supplierState: invoice.registrationState || company.state, partyState: invoice.placeOfSupply || invoice.partyState });
}

export function gstCorrectionDeadline(invoiceDate) {
  const [y, m] = String(invoiceDate || '').split('-').map(Number);
  const fyStart = m >= 4 ? y : y - 1;
  return `${fyStart + 1}-11-30`;
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function nextNoteId(state) {
  state.creditNoteSeq = Number(state.creditNoteSeq || 0);
  const taken = new Set((state.creditNotes || []).map((note) => note.id));
  let id;
  do {
    state.creditNoteSeq += 1;
    id = `CN-${String(state.creditNoteSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function creditedAgainst(state, invoiceId) {
  return round2((state.creditNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + Number(note.total || 0), 0));
}

export function receivedAgainst(invoice) {
  return round2((invoice.receipts || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0));
}

export function debitedAgainst(state, invoiceId) {
  return round2((state.debitNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + Number(note.total || 0), 0));
}

export function outstandingOf(state, invoice) {
  return round2(Number(invoice.total || 0) + debitedAgainst(state, invoice.id) - receivedAgainst(invoice) - creditedAgainst(state, invoice.id));
}

function itemisedLines(invoice, raw, company) {
  if (invoice.country === 'US') return { ok: false, error: 'LINES_NOT_FOR_COUNTRY' };
  const rates = new Set((invoice.lines || []).map((line) => Number(line.gstRate || 0)));
  const lines = [];
  for (const [i, item] of raw.entries()) {
    const qty = Number(item.qty == null || item.qty === '' ? 1 : item.qty);
    const rate = Number(item.rate);
    const gstRate = Number(item.gstRate == null || item.gstRate === '' ? NaN : item.gstRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(gstRate)) return { ok: false, error: 'BAD_LINE', line: i + 1 };
    if (!rates.has(gstRate)) return { ok: false, error: 'RATE_NOT_ON_INVOICE', line: i + 1, gstRate, rates: [...rates] };
    const taxable = round2(qty * rate);
    const split = splitFor(invoice, taxable, gstRate, company);
    lines.push({ description: String(item.description || '').trim() || 'Credit', hsn: String(item.hsn || '').trim(), qty, rate, gstRate, taxable, cgst: split.cgst, sgst: split.sgst, igst: split.igst, amount: round2(taxable + split.tax) });
  }
  return { ok: true, lines, total: round2(lines.reduce((sum, line) => sum + line.amount, 0)) };
}

function scaledLines(invoice, fraction, company) {
  if (invoice.country === 'US') {
    return (invoice.lines || []).map((line) => {
      const subtotal = round2(Number(line.subtotal ?? line.taxable ?? 0) * fraction);
      const salesTax = round2(Number(line.salesTax || 0) * fraction);
      return { description: line.description, hsn: '', qty: round2(Number(line.qty || 0) * fraction), rate: line.rate, gstRate: 0, taxable: subtotal, subtotal, taxRate: line.taxRate || 0, salesTax, cgst: 0, sgst: 0, igst: 0, amount: round2(subtotal + salesTax) };
    });
  }
  return (invoice.lines || []).map((line) => {
    const taxable = round2(Number(line.taxable || 0) * fraction);
    const split = splitFor(invoice, taxable, Number(line.gstRate || 0), company);
    return {
      description: line.description,
      hsn: line.hsn,
      qty: round2(Number(line.qty || 0) * fraction),
      rate: line.rate,
      gstRate: line.gstRate,
      taxable,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      amount: round2(taxable + split.tax),
    };
  });
}

export function planCreditNote(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  if (invoice.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED', invoiceId };
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (date < invoice.date) return { ok: false, error: 'BEFORE_INVOICE', date, invoiceDate: invoice.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const reason = String(args.reason || '').trim();
  if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
  const alreadyCredited = creditedAgainst(state, invoiceId);
  const room = round2(Number(invoice.total) - alreadyCredited);
  if (room <= 0) return { ok: false, error: 'FULLY_CREDITED', invoiceId, credited: alreadyCredited };
  const itemised = Array.isArray(args.lines) && args.lines.length ? itemisedLines(invoice, args.lines, state.company || {}) : null;
  if (itemised && !itemised.ok) return itemised;
  const full = !itemised && (args.amount == null || args.amount === '');
  const requested = itemised ? itemised.total : full ? room : round2(args.amount);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  if (requested > room + 0.005) return { ok: false, error: 'EXCEEDS_INVOICE', invoiceId, room, credited: alreadyCredited };
  const fraction = itemised ? requested / Number(invoice.total) : full && alreadyCredited === 0 ? 1 : requested / Number(invoice.total);
  const lines = itemised ? itemised.lines : scaledLines(invoice, fraction, state.company || {});
  if (!itemised && fraction !== 1 && lines.length) {
    const scaled = round2(lines.reduce((sum, line) => sum + line.amount, 0));
    const last = lines[lines.length - 1];
    last.taxable = round2(last.taxable + requested - scaled);
    if (last.subtotal != null) last.subtotal = last.taxable;
    last.amount = round2(last.taxable + last.cgst + last.sgst + last.igst + Number(last.salesTax || 0));
  }
  const salesTax = round2(lines.reduce((sum, line) => sum + Number(line.salesTax || 0), 0));
  const taxable = round2(lines.reduce((sum, line) => sum + line.taxable, 0));
  const cgst = round2(lines.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = round2(lines.reduce((sum, line) => sum + line.sgst, 0));
  const igst = round2(lines.reduce((sum, line) => sum + line.igst, 0));
  const total = round2(taxable + cgst + sgst + igst + salesTax);
  const lastDate = gstCorrectionDeadline(invoice.date);
  if (invoice.country !== 'US' && cgst + sgst + igst > 0 && date > lastDate) return { ok: false, error: 'CREDIT_NOTE_TIME_BARRED', invoiceId, date, lastDate, hint: `GST on ${invoiceId} can be reduced by a credit note only up to ${lastDate} (section 34(2)); after that issue a financial credit note without GST.` };
  const cashReceived = round2((invoice.receipts || []).filter((receipt) => receipt.mode !== 'tds').reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0));
  const refundDue = round2(Math.min(cashReceived, Math.max(0, receivedAgainst(invoice) + alreadyCredited + total - Number(invoice.total))));
  return {
    ok: true,
    plan: { invoice, date, reason, full: fraction === 1, lines, taxable, cgst, sgst, igst, salesTax, country: invoice.country || 'IN', total, alreadyCredited, received: cashReceived, refundDue },
  };
}

export function createCreditNote(state, args = {}) {
  const planned = planCreditNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { invoice } = plan;
  const party = (state.parties || []).find((p) => (invoice.partyAccountId ? p.accountId === invoice.partyAccountId : p.name === invoice.partyName));
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const seqBefore = state.transferSeq;
  const id = nextNoteId(state);
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [
    { id: nextTransferId(state), debitAccountId: 4000, creditAccountId: party.accountId, amount: paise(plan.taxable), flags: linked, invoiceId: id, code: 'CREDIT_NOTE', userData: plan.date },
  ];
  if (plan.cgst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 2100, creditAccountId: party.accountId, amount: paise(plan.cgst), flags: linked, invoiceId: id, code: 'CN-CGST', userData: plan.date });
  if (plan.sgst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 2101, creditAccountId: party.accountId, amount: paise(plan.sgst), flags: linked, invoiceId: id, code: 'CN-SGST', userData: plan.date });
  if (plan.igst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 2102, creditAccountId: party.accountId, amount: paise(plan.igst), flags: linked, invoiceId: id, code: 'CN-IGST', userData: plan.date });
  if (plan.salesTax > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 2110, creditAccountId: party.accountId, amount: paise(plan.salesTax), flags: linked, invoiceId: id, code: 'CN-SALES-TAX', userData: plan.date });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.creditNoteSeq -= 1;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  const note = {
    id,
    date: plan.date,
    invoiceId: invoice.id,
    invoiceDate: invoice.date,
    partyName: invoice.partyName,
    country: plan.country,
    salesTax: plan.salesTax,
    partyGstin: invoice.partyGstin,
    partyState: invoice.partyState,
    placeOfSupply: invoice.placeOfSupply || invoice.partyState,
    partyAccountId: party.accountId,
    reason: plan.reason,
    cancels: Boolean(args.cancel) && plan.full,
    lines: plan.lines,
    taxable: plan.taxable,
    cgst: plan.cgst,
    sgst: plan.sgst,
    igst: plan.igst,
    total: plan.total,
    transferIds: posted.map((result) => result.id),
  };
  state.creditNotes = state.creditNotes || [];
  state.creditNotes.push(note);
  invoice.creditNoteIds = [...(invoice.creditNoteIds || []), id];
  if (note.cancels) invoice.status = 'cancelled';
  else if (outstandingOf(state, invoice) <= 0.005 && invoice.status !== 'paid') invoice.status = 'settled';
  return { ok: true, creditNote: note, invoice, posted, refundDue: plan.refundDue };
}

export function cancelInvoice(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  if (creditedAgainst(state, invoiceId) > 0) return { ok: false, error: 'PARTLY_CREDITED', invoiceId, hint: 'Issue a credit note for the rest instead.' };
  return createCreditNote(state, { invoiceId, date: args.date, reason: args.reason || 'Invoice cancelled', cancel: true });
}

export function creditNotesForPeriod(state, period) {
  return (state.creditNotes || []).filter((note) => String(note.date || '').startsWith(period));
}

export function creditNoteTotals(notes = []) {
  const sum = (key) => round2(notes.reduce((total, note) => total + Number(note[key] || 0), 0));
  const inter = notes.filter((note) => Number(note.igst || 0) > 0 || (Number(note.cgst || 0) === 0 && Number(note.sgst || 0) === 0 && note.partyState && note.partyState !== note.supplierState && false));
  const igstTaxable = round2(notes.filter((note) => Number(note.igst || 0) > 0).reduce((total, note) => total + Number(note.taxable || 0), 0));
  return { count: notes.length, taxable: sum('taxable'), igstTaxable, intraTaxable: round2(sum('taxable') - igstTaxable), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total'), inter: inter.length };
}
