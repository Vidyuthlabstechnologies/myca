import { createPurchase } from './invoice.mjs';
import { partyStateOf } from './chart.mjs';
import { scaledLines, settle, totalsOf } from './debit-notes.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export function supplierNotesAgainst(state, billId) {
  return (state.purchases || []).filter((bill) => bill.kind === 'supplier-debit-note' && bill.noteOf === billId);
}

export function planSupplierNote(state, args = {}) {
  const billId = String(args.billId || '').trim().toUpperCase();
  const bill = (state.purchases || []).find((item) => item.id === billId);
  if (!bill) return { ok: false, error: 'BILL_NOT_FOUND', billId };
  if (bill.kind === 'supplier-debit-note') return { ok: false, error: 'NOTE_ON_NOTE', billId, noteOf: bill.noteOf };
  if (bill.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED', invoiceId: billId };
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (date < bill.date) return { ok: false, error: 'BEFORE_INVOICE', date, invoiceDate: bill.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const reason = String(args.reason || '').trim();
  if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
  const requested = round2(args.amount);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  const supplierNoteNo = String(args.supplierNoteNo || '').trim();
  if (supplierNoteNo.length > 16) return { ok: false, error: 'SUPPLIER_NUMBER_TOO_LONG', supplierNoteNo };
  const company = state.company || {};
  const supplierState = partyStateOf(bill.partyGstin) || bill.partyState || company.state;
  const lines = settle(scaledLines(bill, requested / Number(bill.total), { supplierState, partyState: bill.registrationState || company.state }), requested);
  const totals = totalsOf(lines);
  const itcEligible = bill.itcEligible !== false;
  return { ok: true, plan: { bill, date, reason, supplierNoteNo, lines, ...totals, itcEligible, alreadyAdded: round2(supplierNotesAgainst(state, billId).reduce((sum, note) => sum + Number(note.total || 0), 0)) } };
}

export function recordSupplierNote(state, args = {}) {
  const planned = planSupplierNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const created = createPurchase(state, {
    partyName: plan.bill.partyName,
    partyGstin: plan.bill.partyGstin,
    partyState: plan.bill.partyState,
    date: plan.date,
    supplierInvoiceNo: plan.supplierNoteNo,
    itcEligible: plan.itcEligible,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: line.hsn, qty: 1, rate: line.taxable, gstRate: line.gstRate })),
  });
  if (!created.ok) return created;
  const note = created.invoice;
  note.kind = 'supplier-debit-note';
  note.noteOf = plan.bill.id;
  note.reason = plan.reason;
  plan.bill.supplierNoteIds = [...(plan.bill.supplierNoteIds || []), note.id];
  return { ok: true, supplierNote: note, bill: plan.bill, posted: created.posted };
}
