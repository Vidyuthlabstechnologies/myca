import { localToday, postingDate } from './dates.mjs';
import { daysBetween } from './reminders.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { periodOf } from './return-period.mjs';
import { periodSummary } from './period-summary.mjs';
import { billOutstanding } from './invoice.mjs';

const BANK = 1002n;
const CASH = 1001n;
const ASSUMED_DAYS = 30;
const HISTORY_MONTHS = 3;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function monthsBefore(period, count) {
  const [y, m] = period.split('-').map(Number);
  const out = [];
  for (let i = count; i >= 1; i -= 1) {
    const date = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function counts(transfer) {
  return !transfer.voided && (!transfer.pending || transfer.posted);
}

function movementOn(transfer, account) {
  const amount = Number(transfer.amount) / 100;
  if (transfer.debitAccountId === account) return amount;
  if (transfer.creditAccountId === account) return -amount;
  return 0;
}

function recorded(state, account, { after = '', upTo = '9999-12-31' } = {}) {
  let total = 0;
  let undated = 0;
  for (const transfer of state.ledger.transfers || []) {
    if (!counts(transfer)) continue;
    const move = movementOn(transfer, account);
    if (!move) continue;
    const date = typeof transfer.userData === 'string' ? transfer.userData : '';
    if (!date) {
      undated += 1;
      if (!after) total += move;
      continue;
    }
    if (date > after && date <= upTo) total += move;
  }
  return { total: round2(total), undated };
}

export function latestReading(state) {
  const readings = Array.isArray(state.cashReadings) ? state.cashReadings : [];
  return readings.length ? readings[readings.length - 1] : null;
}

export function cashStart(state, from) {
  const reading = latestReading(state);
  if (reading && reading.on <= from) {
    const bank = round2(reading.bank + recorded(state, BANK, { after: reading.on, upTo: from }).total);
    const cash = round2(reading.cash + recorded(state, CASH, { after: reading.on, upTo: from }).total);
    return { bank, cash, amount: round2(bank + cash), source: 'reading', readingOn: reading.on, note: `From the balance you gave on ${reading.on}, with what MyCA recorded since.` };
  }
  const bank = recorded(state, BANK, { upTo: from }).total;
  const cash = recorded(state, CASH, { upTo: from }).total;
  return {
    bank,
    cash,
    amount: round2(bank + cash),
    source: 'recorded',
    readingOn: '',
    note: 'This is only what has been recorded in MyCA, not your bank statement. Tell MyCA your bank and cash balance today for a real forecast.',
  };
}

export function planCashReading(state, args = {}) {
  const on = args.on == null || args.on === '' ? localToday() : postingDate(args.on);
  if (!on) return { ok: false, error: 'INVALID_DATE', on: args.on };
  if (on > localToday()) return { ok: false, error: 'FUTURE_DATE', on };
  const bank = args.bank == null || args.bank === '' ? null : Number(args.bank);
  const cash = args.cash == null || args.cash === '' ? null : Number(args.cash);
  if (bank == null && cash == null) return { ok: false, error: 'BALANCE_REQUIRED' };
  if ((bank != null && !Number.isFinite(bank)) || (cash != null && (!Number.isFinite(cash) || cash < 0))) return { ok: false, error: 'BAD_AMOUNT' };
  const before = cashStart(state, on);
  return {
    ok: true,
    plan: {
      on,
      bank: round2(bank ?? before.bank),
      cash: round2(cash ?? before.cash),
      recordedBank: before.bank,
      recordedCash: before.cash,
    },
  };
}

export function setCashBalance(state, args = {}) {
  const planned = planCashReading(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.cashReadings = Array.isArray(state.cashReadings) ? state.cashReadings : [];
  state.cashReadings.push({ on: plan.on, bank: plan.bank, cash: plan.cash, by: String(state?.__actor?.userId || args.actorId || '') });
  state.cashReadings.sort((a, b) => a.on.localeCompare(b.on));
  return { ok: true, reading: state.cashReadings.at(-1), recordedBank: plan.recordedBank, recordedCash: plan.recordedCash };
}

function typicalDaysToPay(state) {
  const byCustomer = new Map();
  for (const invoice of state.invoices || []) {
    if (invoice.status !== 'paid' || !(invoice.receipts || []).length) continue;
    const last = invoice.receipts.map((r) => r.date).filter(Boolean).sort().at(-1);
    if (!last) continue;
    const key = String(invoice.partyName || '').toLowerCase();
    const list = byCustomer.get(key) || [];
    list.push(Math.max(0, daysBetween(invoice.date, last)));
    byCustomer.set(key, list);
  }
  const typical = new Map();
  for (const [key, list] of byCustomer) {
    const sorted = [...list].sort((a, b) => a - b);
    typical.set(key, sorted[Math.floor((sorted.length - 1) / 2)]);
  }
  return typical;
}

function expectedReceipts(state, from, until) {
  const typical = typicalDaysToPay(state);
  const inWindow = [];
  const overdue = [];
  for (const invoice of state.invoices || []) {
    if (invoice.status === 'cancelled') continue;
    const due = outstandingOf(state, invoice);
    if (due <= 0.005) continue;
    const key = String(invoice.partyName || '').toLowerCase();
    const terms = invoice.paymentTermsDays == null ? '' : invoice.paymentTermsDays === 0 ? 'due on receipt' : `terms Net ${invoice.paymentTermsDays}`;
    let date;
    let basis;
    if (typical.has(key)) {
      date = addDays(invoice.date, typical.get(key));
      basis = `${invoice.partyName} usually pays in ${typical.get(key)} days${terms ? `; ${terms}` : ''}`;
    } else if (invoice.dueDate) {
      date = invoice.dueDate;
      basis = `${terms}; no payment history yet`;
    } else {
      date = addDays(invoice.date, ASSUMED_DAYS);
      basis = `no payment history or terms; assumed ${ASSUMED_DAYS} days`;
    }
    const row = { date, label: `${invoice.id} from ${invoice.partyName}`, amount: round2(due), basis };
    if (date < from) overdue.push(row);
    else if (date <= until) inWindow.push(row);
  }
  return { inWindow, overdue };
}

function expectedBillPayments(state, from, until) {
  const inWindow = [];
  const older = [];
  for (const bill of state.purchases || []) {
    const owed = billOutstanding(bill);
    if (owed <= 0.005) continue;
    const date = addDays(bill.date, ASSUMED_DAYS);
    const part = owed < Number(bill.total || 0) - 0.005 ? `; ₹${round2(Number(bill.total) - owed).toLocaleString('en-IN')} already paid` : '';
    const row = { date, label: `${bill.supplierInvoiceNo || bill.id} to ${bill.partyName}`, amount: owed, basis: `bill dated ${bill.date}; assumed paid in ${ASSUMED_DAYS} days${part}` };
    if (date < from) older.push({ ...row, basis: `bill dated ${bill.date}; unpaid past ${ASSUMED_DAYS} days${part}` });
    else if (date <= until) inWindow.push(row);
  }
  return { inWindow, older };
}

function monthlyAverages(state, from) {
  const months = monthsBefore(from.slice(0, 7), HISTORY_MONTHS);
  const inMonths = (doc) => months.includes(periodOf(doc.date));
  const expenses = round2((state.expenses || []).filter(inMonths).reduce((sum, item) => sum + Number(item.amount || 0), 0) / HISTORY_MONTHS);
  const purchases = round2((state.purchases || []).filter(inMonths).reduce((sum, item) => sum + Number(item.total || 0), 0) / HISTORY_MONTHS);
  const sales = round2((state.invoices || []).filter((inv) => inMonths(inv) && inv.status !== 'cancelled').reduce((sum, item) => sum + Number(item.total || 0), 0) / HISTORY_MONTHS);
  return { months, expenses, purchases, sales, outgoings: round2(expenses + purchases) };
}

function gstPayments(state, deadlines, from, until) {
  const rows = [];
  for (const row of deadlines) {
    if (row.returnType !== 'GSTR-3B' || row.dueDate < from || row.dueDate > until) continue;
    const summary = periodSummary(state, row.period);
    if (!summary.ok) continue;
    const owed = round2(Math.max(0, summary.data.outputTax.total - summary.data.inputCredit.total));
    if (owed <= 0) continue;
    rows.push({ date: row.dueDate, label: `GST for ${row.period}`, amount: owed, basis: 'tax on sales less input credit, before head-by-head set-off; the return may differ' });
  }
  return rows;
}

export function cashForecast(state, { days = 30, from = localToday(), deadlines = [] } = {}) {
  const span = Math.max(1, Math.min(180, Math.round(Number(days) || 30)));
  const until = addDays(from, span);
  const start = cashStart(state, from);
  const averages = monthlyAverages(state, from);
  const receipts = expectedReceipts(state, from, until);
  const billRows = expectedBillPayments(state, from, until);
  const bills = billRows.inWindow;
  const gst = gstPayments(state, deadlines, from, until);
  const spending = averages.expenses > 0
    ? [{ date: until, label: 'Usual expenses', amount: round2((averages.expenses * span) / 30), basis: `average of ${averages.months[0]} to ${averages.months.at(-1)}, spread over the days`, spread: true }]
    : [];
  const dailySpend = averages.expenses / 30;
  const events = [
    ...receipts.inWindow.map((row) => ({ ...row, sign: 1 })),
    ...bills.map((row) => ({ ...row, sign: -1 })),
    ...gst.map((row) => ({ ...row, sign: -1 })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let balance = start.amount;
  let lowest = { date: from, amount: balance };
  let cursor = from;
  const balanceOn = [];
  for (let day = 0; day <= span; day += 1) {
    const date = addDays(from, day);
    if (day > 0) balance -= dailySpend;
    for (const event of events.filter((item) => item.date === date)) balance += event.sign * event.amount;
    balanceOn.push({ date, amount: round2(balance) });
    if (balance < lowest.amount) lowest = { date, amount: round2(balance) };
    cursor = date;
  }
  const sum = (rows) => round2(rows.reduce((total, row) => total + row.amount, 0));
  return {
    ok: true,
    data: {
      from,
      until: cursor,
      days: span,
      start,
      coming: { total: sum(receipts.inWindow), rows: receipts.inWindow },
      going: { total: round2(sum(bills) + sum(gst) + sum(spending)), rows: [...bills, ...gst, ...spending] },
      overdue: { total: sum(receipts.overdue), rows: receipts.overdue },
      unpaidBills: { total: sum(billRows.older), rows: billRows.older },
      end: round2(balance),
      lowest,
      monthlyOutgoings: averages.outgoings,
      balanceOn,
      notes: [
        start.note,
        'Overdue invoices are listed but not counted: MyCA cannot tell when they will be paid.',
        averages.expenses > 0 ? '' : 'No expenses in the last three months, so none are projected.',
        billRows.older.length ? 'Bills unpaid for more than 30 days are listed but not counted: MyCA cannot tell when you will pay them, or whether you paid them outside MyCA.' : '',
      ].filter(Boolean),
    },
  };
}

export function canAfford(state, { amount, on, deadlines = [] } = {}) {
  const spend = round2(amount);
  if (!Number.isFinite(spend) || spend <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  const today = localToday();
  const when = on == null || on === '' ? today : postingDate(on);
  if (!when) return { ok: false, error: 'INVALID_DATE', on };
  if (when < today) return { ok: false, error: 'DATE_PASSED', on: when };
  const ahead = daysBetween(today, when);
  const forecast = cashForecast(state, { days: Math.min(180, ahead + 30), from: today, deadlines }).data;
  const onDay = forecast.balanceOn.find((row) => row.date === when) || forecast.balanceOn.at(-1);
  const after = forecast.balanceOn.filter((row) => row.date >= when);
  const lowestAfter = after.reduce((low, row) => (row.amount < low.amount ? row : low), after[0]);
  const left = round2(lowestAfter.amount - spend);
  const cushion = forecast.monthlyOutgoings;
  const verdict = left < 0 ? 'no' : cushion > 0 && left < cushion ? 'tight' : 'yes';
  const safe = round2(Math.max(0, lowestAfter.amount - cushion));
  return {
    ok: true,
    data: {
      amount: spend,
      on: when,
      balanceThen: onDay.amount,
      lowestAfter,
      left,
      monthlyOutgoings: cushion,
      monthsCovered: cushion > 0 ? round2(left / cushion) : null,
      verdict,
      safeToSpend: safe,
      start: forecast.start,
      notes: forecast.notes,
    },
  };
}
