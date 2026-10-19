import { localToday, postingDate } from './dates.mjs';
import { daysBetween } from './reminders.mjs';
import { billOutstanding, planPayment, recordPayment } from './invoice.mjs';
import { billPayBy } from './supplier-dues.mjs';
import { cashStart, canAfford } from './cash-forecast.mjs';
import { listExceptions } from './exceptions.mjs';

const RULE_37_DAYS = 180;
const DEFAULT_WINDOW_DAYS = 14;
const MSME_SOON_DAYS = 3;
const AGING_DAYS = 45;
const MAX_BILLS = 100;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function heldByException(state, bill) {
  const open = listExceptions(state, { status: 'open' });
  const number = String(bill.supplierInvoiceNo || '').toUpperCase();
  return open.find((e) => {
    const ev = e.evidence || {};
    if (Array.isArray(ev.billIds) && ev.billIds.includes(bill.id)) return true;
    if (number && String(ev.invoiceNo || '').toUpperCase() === number && (!ev.gstin || !bill.partyGstin || String(ev.gstin).toUpperCase() === String(bill.partyGstin).toUpperCase())) return true;
    return false;
  }) || null;
}

const BUCKET_ORDER = { 'msme-limit': 0, 'credit-at-risk': 1, due: 2, aging: 3, later: 4 };
const BUCKET_WORDS = {
  'msme-limit': 'at or past the MSMED pay-by date',
  'credit-at-risk': 'within 180 days of the bill, after which the input credit is reversed',
  due: 'due within the window on agreed terms',
  aging: 'older than 45 days with no agreed terms',
  later: 'not due yet',
};

export function paymentRun(state, args = {}) {
  const today = postingDate(args.asOf) || localToday();
  const window = Math.max(1, Math.min(60, Math.round(Number(args.windowDays) || DEFAULT_WINDOW_DAYS)));
  const rows = [];
  const held = [];
  for (const bill of state.purchases || []) {
    if (bill.status === 'cancelled' || bill.country === 'US') continue;
    const outstanding = round2(billOutstanding(bill));
    if (outstanding <= 0.005) continue;
    const terms = billPayBy(state, bill);
    const creditDeadline = addDays(bill.date, RULE_37_DAYS);
    const daysToCredit = daysBetween(today, creditDeadline);
    const age = daysBetween(bill.date, today);
    const row = {
      billId: bill.id,
      supplier: bill.partyName,
      gstin: bill.partyGstin || '',
      supplierInvoiceNo: bill.supplierInvoiceNo || '',
      date: bill.date,
      total: round2(bill.total),
      outstanding,
      tdsDeducted: round2(bill.tds?.amount || 0),
      payBy: terms ? terms.payBy : '',
      daysLeft: terms ? daysBetween(today, terms.payBy) : null,
      msme: Boolean(terms && terms.msme),
      creditDeadline,
      daysToCredit,
      age,
    };
    const exception = heldByException(state, bill);
    if (exception) {
      held.push({ ...row, reason: `${exception.id}: ${exception.title}` });
      continue;
    }
    if (row.msme && row.daysLeft != null && row.daysLeft <= MSME_SOON_DAYS) row.bucket = 'msme-limit';
    else if (daysToCredit <= window) row.bucket = 'credit-at-risk';
    else if (row.daysLeft != null && row.daysLeft <= window) row.bucket = 'due';
    else if (!terms && age >= AGING_DAYS) row.bucket = 'aging';
    else row.bucket = 'later';
    row.why = BUCKET_WORDS[row.bucket];
    rows.push(row);
  }
  rows.sort((a, b) => (BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]) || ((a.daysLeft ?? a.daysToCredit) - (b.daysLeft ?? b.daysToCredit)) || a.date.localeCompare(b.date) || a.billId.localeCompare(b.billId));
  const proposed = rows.filter((r) => r.bucket !== 'later' && r.bucket !== 'aging').slice(0, MAX_BILLS);
  const consider = rows.filter((r) => r.bucket === 'aging');
  const later = rows.filter((r) => r.bucket === 'later');
  const total = round2(proposed.reduce((s, r) => s + r.outstanding, 0));
  const start = cashStart(state, today);
  const afford = total > 0 ? canAfford(state, { amount: total, on: today }) : null;
  return {
    ok: true,
    data: {
      asOf: today,
      windowDays: window,
      proposed,
      consider,
      later,
      held,
      total,
      considerTotal: round2(consider.reduce((s, r) => s + r.outstanding, 0)),
      laterTotal: round2(later.reduce((s, r) => s + r.outstanding, 0)),
      balance: start.amount,
      balanceSource: start.source,
      balanceNote: start.note || '',
      after: round2(start.amount - total),
      verdict: afford && afford.ok ? afford.data?.verdict || afford.verdict || '' : '',
      lowestAfter: afford && afford.ok ? afford.data?.lowestAfter || afford.lowestAfter || null : null,
      monthlyOutgoings: afford && afford.ok ? afford.data?.monthlyOutgoings ?? afford.monthlyOutgoings ?? null : null,
    },
  };
}

export function planPaymentRun(state, args = {}) {
  const run = paymentRun(state, args).data;
  const wanted = Array.isArray(args.billIds) && args.billIds.length ? args.billIds.map((id) => String(id).toUpperCase()) : run.proposed.map((r) => r.billId);
  if (!wanted.length) return { ok: false, error: 'NOTHING_TO_PAY' };
  if (wanted.length > MAX_BILLS) return { ok: false, error: 'TOO_MANY_BILLS', max: MAX_BILLS };
  const date = args.date == null || args.date === '' ? run.asOf : postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  const byId = new Map([...run.proposed, ...run.consider, ...run.later].map((r) => [r.billId, r]));
  const heldIds = new Set(run.held.map((r) => r.billId));
  const payments = [];
  const problems = [];
  let cashNeeded = 0;
  for (const billId of wanted) {
    if (heldIds.has(billId)) { problems.push({ billId, error: 'HELD', reason: run.held.find((r) => r.billId === billId).reason }); continue; }
    const plan = planPayment(state, { billId, date, mode });
    if (!plan.ok) { problems.push({ billId, error: plan.error }); continue; }
    if (mode === 'cash') {
      cashNeeded = round2(cashNeeded + plan.amount);
      if (plan.inHand != null && cashNeeded > plan.inHand) problems.push({ billId, error: 'INSUFFICIENT_CASH' });
    }
    const row = byId.get(billId);
    payments.push({ billId, supplier: plan.bill.partyName, supplierInvoiceNo: plan.bill.supplierInvoiceNo || '', amount: plan.amount, bucket: row ? row.bucket : 'chosen', why: row ? row.why : '' });
  }
  if (problems.length) return { ok: false, error: 'BILLS_NOT_PAYABLE', problems };
  const total = round2(payments.reduce((s, p) => s + p.amount, 0));
  return { ok: true, payments, total, date, mode, balance: run.balance, after: round2(run.balance - total), verdict: run.verdict, lowestAfter: run.lowestAfter };
}

export function recordPaymentRun(state, args = {}) {
  const plan = planPaymentRun(state, args);
  if (!plan.ok) return plan;
  const posted = [];
  for (const payment of plan.payments) {
    const out = recordPayment(state, { billId: payment.billId, amount: payment.amount, date: plan.date, mode: plan.mode });
    if (out.ok === false) return { ok: false, error: 'PAYMENT_FAILED', billId: payment.billId, cause: out.error, posted };
    posted.push({ billId: payment.billId, supplier: payment.supplier, amount: payment.amount });
  }
  return { ok: true, posted, total: plan.total, date: plan.date, mode: plan.mode, after: plan.after };
}

export function paymentRunInWords(d, money) {
  const bucketLine = (r) => `· ${r.supplier} ${money(r.outstanding)} on ${r.billId}${r.supplierInvoiceNo ? ` (their ${r.supplierInvoiceNo})` : ''}: ${r.bucket === 'msme-limit' ? (r.daysLeft < 0 ? `${-r.daysLeft} days past the MSMED pay-by date` : r.daysLeft === 0 ? 'MSMED pay-by date is today' : `MSMED pay-by date in ${r.daysLeft} days`) : r.bucket === 'credit-at-risk' ? (r.daysToCredit < 0 ? 'past 180 days, credit already reversible' : `${r.daysToCredit} days to the 180-day credit limit`) : r.bucket === 'due' ? (r.daysLeft < 0 ? `${-r.daysLeft} days past the agreed date` : r.daysLeft === 0 ? 'due today' : `due in ${r.daysLeft} days`) : `${r.age} days old, no agreed terms`}.`;
  if (!d.proposed.length && !d.consider.length) {
    const later = d.later.length ? ` ${d.later.length === 1 ? '1 bill' : `${d.later.length} bills`} (${money(d.laterTotal)}) ${d.later.length === 1 ? 'is' : 'are'} not due yet.` : '';
    const held = d.held.length ? ` ${d.held.length === 1 ? '1 bill is' : `${d.held.length} bills are`} held back for an open exception.` : '';
    return `Nothing needs paying in the next ${d.windowDays} days.${later}${held}`;
  }
  const lines = [];
  if (d.proposed.length) {
    lines.push(`Pay now, ${money(d.total)} across ${d.proposed.length === 1 ? '1 bill' : `${d.proposed.length} bills`}:`);
    lines.push(...d.proposed.map(bucketLine));
  }
  if (d.consider.length) {
    lines.push(`Consider, ${money(d.considerTotal)}:`);
    lines.push(...d.consider.map(bucketLine));
  }
  if (d.held.length) lines.push(`Held back: ${d.held.map((r) => `${r.billId} (${r.reason})`).join('; ')}.`);
  const cash = d.balanceSource === 'reading'
    ? `Bank and cash ${money(d.balance)}, ${money(d.after)} after paying${d.verdict === 'no' ? '; that goes below zero before the month is out' : d.verdict === 'tight' ? '; tight against the month\'s usual outgoings' : d.verdict === 'yes' ? '; payroll and GST still clear' : ''}.`
    : `MyCA has only the recorded figures for bank and cash (${money(d.balance)}); say "bank balance is ..." for a true picture.`;
  lines.push(cash);
  if (d.later.length) lines.push(`${d.later.length === 1 ? '1 bill' : `${d.later.length} bills`} (${money(d.laterTotal)}) can wait.`);
  lines.push('Say "pay the proposed bills" to record them from the bank, or "pay the proposed bills except BILL-0003".');
  return lines.join('\n');
}
