import { createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { gstSplit, partyStateOf } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const SALES = 4000;
const PURCHASES = 5000;
const OUTPUT = { cgst: 2100, sgst: 2101, igst: 2102 };
const INPUT = { cgst: 1200, sgst: 1201, igst: 1202 };

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function nextId(state, listKey, seqKey, prefix) {
  state[seqKey] = Number(state[seqKey] || 0);
  const taken = new Set((state[listKey] || []).map((note) => note.id));
  let id;
  do {
    state[seqKey] += 1;
    id = `${prefix}-${String(state[seqKey]).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function debitedAgainst(state, invoiceId) {
  return round2((state.debitNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + Number(note.total || 0), 0));
}

export function notedAgainstBill(state, billId) {
  return round2((state.purchaseNotes || []).filter((note) => note.billId === billId).reduce((sum, note) => sum + Number(note.total || 0), 0));
}

export function scaledLines(document, fraction, { supplierState, partyState }) {
  return (document.lines || []).map((line) => {
    const taxable = round2(Number(line.taxable || 0) * fraction);
    const split = document.zeroRated ? { cgst: 0, sgst: 0, igst: 0, tax: 0 } : gstSplit({ taxable, rate: Number(line.gstRate || 0), supplierState, partyState });
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

export function settle(lines, requested, key = 'amount') {
  if (!lines.length) return lines;
  const scaled = round2(lines.reduce((sum, line) => sum + line[key], 0));
  const last = lines[lines.length - 1];
  last.taxable = round2(last.taxable + requested - scaled);
  last.amount = round2(last.taxable + last.cgst + last.sgst + last.igst);
  return lines;
}

export function totalsOf(lines, { reverseCharge = false } = {}) {
  const sum = (key) => round2(lines.reduce((total, line) => total + line[key], 0));
  const taxable = sum('taxable');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  return { taxable, cgst, sgst, igst, total: reverseCharge ? taxable : round2(taxable + cgst + sgst + igst) };
}

function commonChecks(state, document, args, { notFound }) {
  if (!document) return { ok: false, error: notFound, id: args.id };
  if (document.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED', invoiceId: document.id };
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (date < document.date) return { ok: false, error: 'BEFORE_INVOICE', date, invoiceDate: document.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const reason = String(args.reason || '').trim();
  if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
  const requested = round2(args.amount);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  return { ok: true, date, reason, requested };
}

export function planDebitNote(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  const checked = commonChecks(state, invoice, { ...args, id: invoiceId }, { notFound: 'INVOICE_NOT_FOUND' });
  if (!checked.ok) return { ...checked, invoiceId };
  const company = state.company || {};
  const lines = settle(scaledLines(invoice, checked.requested / Number(invoice.total), { supplierState: invoice.registrationState || company.state, partyState: invoice.placeOfSupply || invoice.partyState }), checked.requested);
  const totals = totalsOf(lines);
  const alreadyDebited = debitedAgainst(state, invoiceId);
  return { ok: true, plan: { invoice, date: checked.date, reason: checked.reason, lines, ...totals, alreadyDebited } };
}

export function createDebitNote(state, args = {}) {
  const planned = planDebitNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { invoice } = plan;
  const party = (state.parties || []).find((p) => (invoice.partyAccountId ? p.accountId === invoice.partyAccountId : p.name === invoice.partyName));
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const seqBefore = state.transferSeq;
  const id = nextId(state, 'debitNotes', 'debitNoteSeq', 'DN');
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [{ id: nextTransferId(state), debitAccountId: party.accountId, creditAccountId: SALES, amount: paise(plan.taxable), flags: linked, invoiceId: id, code: 'DEBIT_NOTE', userData: plan.date }];
  for (const head of ['cgst', 'sgst', 'igst']) {
    if (plan[head] > 0) bundle.push({ id: nextTransferId(state), debitAccountId: party.accountId, creditAccountId: OUTPUT[head], amount: paise(plan[head]), flags: linked, invoiceId: id, code: `DN-${head.toUpperCase()}`, userData: plan.date });
  }
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.debitNoteSeq -= 1;
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
    lines: plan.lines,
    taxable: plan.taxable,
    cgst: plan.cgst,
    sgst: plan.sgst,
    igst: plan.igst,
    total: plan.total,
    transferIds: posted.map((result) => result.id),
  };
  state.debitNotes = state.debitNotes || [];
  state.debitNotes.push(note);
  invoice.debitNoteIds = [...(invoice.debitNoteIds || []), id];
  if (invoice.status === 'settled' || invoice.status === 'paid') invoice.status = 'posted';
  const received = round2((invoice.receipts || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0));
  const credited = round2((state.creditNotes || []).filter((item) => item.invoiceId === invoice.id).reduce((sum, item) => sum + Number(item.total || 0), 0));
  const outstanding = round2(Number(invoice.total) + debitedAgainst(state, invoice.id) - received - credited);
  return { ok: true, debitNote: note, invoice, posted, outstanding };
}

export function planPurchaseNote(state, args = {}) {
  const billId = String(args.billId || '').trim().toUpperCase();
  const bill = (state.purchases || []).find((item) => item.id === billId);
  const checked = commonChecks(state, bill, { ...args, id: billId }, { notFound: 'BILL_NOT_FOUND' });
  if (!checked.ok) return { ...checked, billId };
  const alreadyNoted = notedAgainstBill(state, billId);
  const room = round2(Number(bill.total) - alreadyNoted);
  if (room <= 0) return { ok: false, error: 'FULLY_NOTED', billId, noted: alreadyNoted };
  if (checked.requested > room + 0.005) return { ok: false, error: 'EXCEEDS_BILL', billId, room, noted: alreadyNoted };
  const company = state.company || {};
  const full = Math.abs(checked.requested - room) < 0.005 && alreadyNoted === 0;
  const supplierState = partyStateOf(bill.partyGstin) || bill.partyState || company.state;
  const reverseCharge = Boolean(bill.reverseCharge);
  const supplierSide = bill.reverseCharge?.kind === 'import' ? '96' : supplierState;
  const lines = full ? scaledLines(bill, 1, { supplierState: supplierSide, partyState: bill.registrationState || company.state }) : settle(scaledLines(bill, checked.requested / Number(bill.total), { supplierState: supplierSide, partyState: bill.registrationState || company.state }), checked.requested, reverseCharge ? 'taxable' : 'amount');
  const totals = totalsOf(lines, { reverseCharge });
  const paid = round2((bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const refundDue = round2(Math.max(0, paid + Number(bill.tds?.amount || 0) + alreadyNoted + totals.total - Number(bill.total)));
  return { ok: true, plan: { bill, date: checked.date, reason: checked.reason, full, lines, ...totals, alreadyNoted, paid, refundDue, itcEligible: bill.itcEligible !== false, reverseCharge } };
}

export function createPurchaseNote(state, args = {}) {
  const planned = planPurchaseNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { bill } = plan;
  const vendor = (state.vendors || []).find((v) => (bill.partyAccountId ? v.accountId === bill.partyAccountId : v.name === bill.partyName));
  if (!vendor) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const seqBefore = state.transferSeq;
  const id = nextId(state, 'purchaseNotes', 'purchaseNoteSeq', 'PDN');
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [{ id: nextTransferId(state), debitAccountId: vendor.accountId, creditAccountId: PURCHASES, amount: paise(plan.taxable), flags: linked, invoiceId: id, code: 'PURCHASE_NOTE', userData: plan.date }];
  const tax = round2(plan.cgst + plan.sgst + plan.igst);
  if (plan.reverseCharge) {
    for (const head of ['cgst', 'sgst', 'igst']) {
      if (plan[head] > 0) bundle.push({ id: nextTransferId(state), debitAccountId: OUTPUT[head], creditAccountId: plan.itcEligible ? INPUT[head] : PURCHASES, amount: paise(plan[head]), flags: linked, invoiceId: id, code: `PDN-RCM-${head.toUpperCase()}`, userData: plan.date });
    }
  } else if (plan.itcEligible) {
    for (const head of ['cgst', 'sgst', 'igst']) {
      if (plan[head] > 0) bundle.push({ id: nextTransferId(state), debitAccountId: vendor.accountId, creditAccountId: INPUT[head], amount: paise(plan[head]), flags: linked, invoiceId: id, code: `PDN-${head.toUpperCase()}`, userData: plan.date });
    }
  } else if (tax > 0) {
    bundle.push({ id: nextTransferId(state), debitAccountId: vendor.accountId, creditAccountId: PURCHASES, amount: paise(tax), flags: linked, invoiceId: id, code: 'PDN-GST-BLOCKED', userData: plan.date });
  }
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.purchaseNoteSeq -= 1;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  const note = {
    id,
    date: plan.date,
    billId: bill.id,
    billDate: bill.date,
    supplierInvoiceNo: bill.supplierInvoiceNo || '',
    partyName: bill.partyName,
    partyGstin: bill.partyGstin,
    partyState: bill.partyState,
    partyAccountId: vendor.accountId,
    reason: plan.reason,
    full: plan.full,
    itcEligible: plan.itcEligible,
    ...(plan.reverseCharge ? { reverseCharge: bill.reverseCharge } : {}),
    lines: plan.lines,
    taxable: plan.taxable,
    cgst: plan.cgst,
    sgst: plan.sgst,
    igst: plan.igst,
    total: plan.total,
    transferIds: posted.map((result) => result.id),
  };
  state.purchaseNotes = state.purchaseNotes || [];
  state.purchaseNotes.push(note);
  bill.purchaseNoteIds = [...(bill.purchaseNoteIds || []), id];
  bill.notedTotal = round2((bill.notedTotal || 0) + note.total);
  const paid = round2((bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const outstanding = round2(Math.max(0, Number(bill.total) - bill.notedTotal - Number(bill.tds?.amount || 0) - paid));
  return { ok: true, purchaseNote: note, bill, posted, refundDue: plan.refundDue, outstanding };
}

export function debitNotesForPeriod(state, period) {
  return (state.debitNotes || []).filter((note) => String(note.date || '').startsWith(period));
}

export function purchaseNotesForPeriod(state, period) {
  return (state.purchaseNotes || []).filter((note) => String(note.date || '').startsWith(period));
}

export function noteTotals(notes = []) {
  const sum = (key) => round2(notes.reduce((total, note) => total + Number(note[key] || 0), 0));
  const igstTaxable = round2(notes.filter((note) => Number(note.igst || 0) > 0).reduce((total, note) => total + Number(note.taxable || 0), 0));
  return { count: notes.length, taxable: sum('taxable'), igstTaxable, intraTaxable: round2(sum('taxable') - igstTaxable), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('total') };
}
