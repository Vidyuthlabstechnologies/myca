import { createAccounts, createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { paymentFor } from './gst-payment.mjs';

const OUTPUT = { cgst: 2100, sgst: 2101, igst: 2102 };
const INPUT = { cgst: 1200, sgst: 1201, igst: 1202 };
const CASH = 1001;
const BANK = 1002;
const CPIN = /^[0-9]{14}$/;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export const GST_PAYMENT_ACCOUNTS = [
  { id: 5310, code: '5310', name: 'GST interest and late fee', type: 'expense' },
];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

export function gstPaymentFor(state, period) {
  const all = state.gstPayments && typeof state.gstPayments === 'object' ? state.gstPayments : {};
  return Object.hasOwn(all, period) ? all[period] : null;
}

export function planGstPayment(state, args = {}) {
  const period = String(args.period || '').trim();
  if (period && !isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (date > localToday()) return fail('FUTURE_DATE', { date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  const computed = paymentFor(state, period, { payOn: date });
  if (!computed.ok) return computed;
  const d = computed.data;
  if (gstPaymentFor(state, d.period)) return fail('ALREADY_RECORDED', { period: d.period, paidOn: gstPaymentFor(state, d.period).date });
  const cpin = String(args.cpin || '').replace(/\s+/g, '');
  if (cpin && !CPIN.test(cpin)) return fail('BAD_CPIN');
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  const interest = d.late ? d.late.interest : 0;
  const lateFee = d.late ? d.late.lateFee : 0;
  const cashTotal = round2(d.cash.total + interest + lateFee);
  if (cashTotal <= 0.005 && d.creditUsed <= 0.005) return fail('NOTHING_DUE', { period: d.period });
  const creditApplied = { igst: round2(d.output.igst - d.cash.igst), cgst: round2(d.output.cgst - d.cash.cgst), sgst: round2(d.output.sgst - d.cash.sgst) };
  const creditDrawn = { igst: round2(Object.values(d.used.igst).reduce((s, v) => s + v, 0)), cgst: round2(Object.values(d.used.cgst).reduce((s, v) => s + v, 0)), sgst: round2(Object.values(d.used.sgst).reduce((s, v) => s + v, 0)) };
  return { ok: true, payment: { period: d.period, date, mode, cpin, cash: d.cash, interest, lateFee, cashTotal, creditApplied, creditDrawn, creditUsed: d.creditUsed, carried: d.carried, dueDate: d.dueDate, late: Boolean(d.late), rulesUsed: d.rulesUsed, unreviewed: d.unreviewed }, computed: d };
}

export function recordGstPayment(state, args = {}) {
  const planned = planGstPayment(state, args);
  if (!planned.ok) return planned;
  const { payment } = planned;
  createAccounts(state.ledger, GST_PAYMENT_ACCOUNTS.map((account) => ({ ...account, flags: 0 })));
  const id = `GSTP-${payment.period}`;
  const linked = TRANSFER_FLAGS.LINKED;
  const seqBefore = state.transferSeq;
  const bundle = [];
  const post = (debit, credit, amount, code) => { if (amount > 0.005) bundle.push({ id: nextTransferId(state), debitAccountId: debit, creditAccountId: credit, amount: paise(amount), flags: linked, invoiceId: id, code, userData: payment.date }); };
  for (const head of ['igst', 'cgst', 'sgst']) post(OUTPUT[head], INPUT[head], Math.min(payment.creditApplied[head], payment.creditDrawn[head]), `GST-SETOFF-${head.toUpperCase()}`);
  const applied = round2(payment.creditApplied.igst + payment.creditApplied.cgst + payment.creditApplied.sgst);
  const drawnViaMin = round2(['igst', 'cgst', 'sgst'].reduce((s, h) => s + Math.min(payment.creditApplied[h], payment.creditDrawn[h]), 0));
  if (applied - drawnViaMin > 0.005) {
    const remainingOutput = { igst: round2(payment.creditApplied.igst - Math.min(payment.creditApplied.igst, payment.creditDrawn.igst)), cgst: round2(payment.creditApplied.cgst - Math.min(payment.creditApplied.cgst, payment.creditDrawn.cgst)), sgst: round2(payment.creditApplied.sgst - Math.min(payment.creditApplied.sgst, payment.creditDrawn.sgst)) };
    const remainingCredit = { igst: round2(payment.creditDrawn.igst - Math.min(payment.creditApplied.igst, payment.creditDrawn.igst)), cgst: round2(payment.creditDrawn.cgst - Math.min(payment.creditApplied.cgst, payment.creditDrawn.cgst)), sgst: round2(payment.creditDrawn.sgst - Math.min(payment.creditApplied.sgst, payment.creditDrawn.sgst)) };
    for (const out of ['igst', 'cgst', 'sgst']) {
      for (const cr of ['igst', 'cgst', 'sgst']) {
        const amount = round2(Math.min(remainingOutput[out], remainingCredit[cr]));
        if (amount > 0.005) {
          post(OUTPUT[out], INPUT[cr], amount, `GST-SETOFF-${cr.toUpperCase()}-TO-${out.toUpperCase()}`);
          remainingOutput[out] = round2(remainingOutput[out] - amount);
          remainingCredit[cr] = round2(remainingCredit[cr] - amount);
        }
      }
    }
  }
  const from = payment.mode === 'cash' ? CASH : BANK;
  for (const head of ['igst', 'cgst', 'sgst']) post(OUTPUT[head], from, payment.cash[head], `GST-PAID-${head.toUpperCase()}`);
  post(5310, from, payment.interest, 'GST-INTEREST');
  post(5310, from, payment.lateFee, 'GST-LATE-FEE');
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const record = { id, ...payment, transferIds: posted.map((result) => result.id), recordedOn: localToday() };
  state.gstPayments = state.gstPayments && typeof state.gstPayments === 'object' ? state.gstPayments : {};
  state.gstPayments[payment.period] = record;
  return { ok: true, payment: record, posted };
}

export function listGstPayments(state) {
  const rows = Object.values(state.gstPayments || {}).sort((a, b) => a.period.localeCompare(b.period));
  return { ok: true, data: { payments: rows.map((row) => ({ period: row.period, date: row.date, mode: row.mode, cpin: row.cpin, cash: row.cash, interest: row.interest, lateFee: row.lateFee, cashTotal: row.cashTotal, creditUsed: row.creditUsed, late: row.late })) } };
}
