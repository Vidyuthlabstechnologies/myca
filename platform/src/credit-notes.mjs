import { createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { gstSplit } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

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

export function outstandingOf(state, invoice) {
  return round2(Number(invoice.total || 0) - receivedAgainst(invoice) - creditedAgainst(state, invoice.id));
}

function scaledLines(invoice, fraction, company) {
  return (invoice.lines || []).map((line) => {
    const taxable = round2(Number(line.taxable || 0) * fraction);
    const split = gstSplit({ taxable, rate: Number(line.gstRate || 0), supplierState: company.state, partyState: invoice.placeOfSupply || invoice.partyState });
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
  const full = args.amount == null || args.amount === '';
  const requested = full ? room : round2(args.amount);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  if (requested > room + 0.005) return { ok: false, error: 'EXCEEDS_INVOICE', invoiceId, room, credited: alreadyCredited };
  const fraction = full && alreadyCredited === 0 ? 1 : requested / Number(invoice.total);
  const lines = scaledLines(invoice, fraction, state.company || {});
  const taxable = round2(lines.reduce((sum, line) => sum + line.taxable, 0));
  const cgst = round2(lines.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = round2(lines.reduce((sum, line) => sum + line.sgst, 0));
  const igst = round2(lines.reduce((sum, line) => sum + line.igst, 0));
  const total = round2(taxable + cgst + sgst + igst);
  const received = receivedAgainst(invoice);
  const refundDue = round2(Math.max(0, received + alreadyCredited + total - Number(invoice.total)));
  return {
    ok: true,
    plan: { invoice, date, reason, full: fraction === 1, lines, taxable, cgst, sgst, igst, total, alreadyCredited, received, refundDue },
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
