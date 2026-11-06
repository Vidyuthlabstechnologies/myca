import { localToday, postingDate } from './dates.mjs';
import { daysBetween } from './reminders.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { isTdsReceipt } from './tds-credits.mjs';
import { periodOf } from './return-period.mjs';
import { paymentFor } from './gst-payment.mjs';
import { billOutstanding } from './invoice.mjs';
import { billPayBy } from './supplier-dues.mjs';
import { salaryPrivate } from './employees.mjs';

const BANK = 1002n;
const CASH = 1001n;
const ASSUMED_DAYS = 30;
const HISTORY_MONTHS = 3;
const HISTORY_RECEIPTS = 12;
const THIN_HISTORY = 3;
const THIN_BAND_PCT = 30;
const MAX_BAND_PCT = 50;
const PAYROLL_DAY = 7;
const STATUTORY_DAY = 15;
const TDS_DAY = 7;
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

export function payingStats(state) {
  const byCustomer = new Map();
  for (const invoice of state.invoices || []) {
    if (invoice.status !== 'paid' || !(invoice.receipts || []).length) continue;
    const last = invoice.receipts.filter((receipt) => !isTdsReceipt(receipt)).map((r) => r.date).filter(Boolean).sort().at(-1);
    if (!last) continue;
    const key = String(invoice.partyName || '').toLowerCase();
    const list = byCustomer.get(key) || [];
    list.push({ on: last, days: Math.max(0, daysBetween(invoice.date, last)) });
    byCustomer.set(key, list);
  }
  const stats = new Map();
  for (const [key, list] of byCustomer) {
    const recent = list.sort((a, b) => a.on.localeCompare(b.on)).slice(-HISTORY_RECEIPTS).map((item) => item.days);
    const sorted = [...recent].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    const mean = recent.reduce((s, d) => s + d, 0) / recent.length;
    const sd = Math.sqrt(recent.reduce((s, d) => s + (d - mean) ** 2, 0) / recent.length);
    const thin = recent.length < THIN_HISTORY;
    const bandPct = thin ? THIN_BAND_PCT : mean <= 1 ? 5 : Math.min(MAX_BAND_PCT, Math.round((sd / Math.max(mean, 1)) * 100));
    stats.set(key, { median, mean: round2(mean), sd: round2(sd), n: recent.length, thin, bandPct, bandDays: Math.max(0, Math.round((median * bandPct) / 100)), tooThin: !thin && sd / Math.max(mean, 1) > MAX_BAND_PCT / 100 });
  }
  return stats;
}

function typicalDaysToPay(state) {
  const typical = new Map();
  for (const [key, stat] of payingStats(state)) typical.set(key, stat.median);
  return typical;
}

function expectedReceipts(state, from, until) {
  const stats = payingStats(state);
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
    let bandDays = Math.round((ASSUMED_DAYS * THIN_BAND_PCT) / 100);
    let thin = true;
    if (typical.has(key)) {
      date = addDays(invoice.date, typical.get(key));
      basis = `${invoice.partyName} usually pays in ${typical.get(key)} days${terms ? `; ${terms}` : ''}`;
      const stat = stats.get(key);
      bandDays = stat.bandDays;
      thin = stat.thin;
    } else if (invoice.dueDate) {
      date = invoice.dueDate;
      basis = `${terms}; no payment history yet`;
    } else {
      date = addDays(invoice.date, ASSUMED_DAYS);
      basis = `no payment history or terms; assumed ${ASSUMED_DAYS} days`;
    }
    const row = { date, label: `${invoice.id} from ${invoice.partyName}`, amount: round2(due), basis, earliest: addDays(date, -bandDays), latest: addDays(date, bandDays), thin };
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
    const terms = bill.status === 'cancelled' ? null : billPayBy(state, bill);
    const date = terms ? terms.payBy : addDays(bill.date, ASSUMED_DAYS);
    const part = owed < Number(bill.total || 0) - 0.005 ? `; ₹${round2(Number(bill.total) - owed).toLocaleString('en-IN')} already paid` : '';
    const why = terms ? (terms.msme ? `MSMED pay-by date, ${terms.days} days from the bill` : `agreed terms, ${terms.days} days`) : `assumed paid in ${ASSUMED_DAYS} days`;
    const row = { date, label: `${bill.supplierInvoiceNo || bill.id} to ${bill.partyName}`, amount: owed, basis: `bill dated ${bill.date}; ${why}${part}` };
    if (date < from) older.push({ ...row, basis: `bill dated ${bill.date}; unpaid past the ${terms ? 'pay-by date' : `${ASSUMED_DAYS} days`}${part}` });
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
    if (row.returnType !== 'GSTR-3B' || row.filed || row.dueDate < from || row.dueDate > until) continue;
    const payment = paymentFor(state, row.period);
    if (!payment.ok) continue;
    const owed = round2(payment.data.toPay);
    if (owed <= 0) continue;
    rows.push({ date: row.dueDate, label: `GST for ${row.period}`, amount: owed, basis: 'cash to pay after input credit is set off head by head; not checked against GSTR-2B' });
  }
  return rows;
}

function nextMonthDay(period, day) {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(Date.UTC(y, m, day));
  return date.toISOString().slice(0, 10);
}

function payrollOutgoings(state, from, until) {
  const rows = [];
  if (salaryPrivate(state)) return rows;
  const runs = state.payrollRuns && typeof state.payrollRuns === 'object' ? Object.values(state.payrollRuns).filter((run) => run && run.status === 'approved') : [];
  const toRupees = (paise) => round2(Number(paise || 0) / 100);
  let latest = null;
  for (const run of runs) {
    if (!latest || run.period > latest.period) latest = run;
    const payday = nextMonthDay(run.period, PAYROLL_DAY) < from ? from : nextMonthDay(run.period, PAYROLL_DAY);
    if (!run.paidOn && payday <= until) rows.push({ date: payday, label: `Salaries for ${run.period}`, amount: toRupees(run.totals.netPaise), basis: 'approved payroll, net pay, by the 7th' });
    const statutory = round2(toRupees(run.totals.pfPayablePaise) + toRupees(run.totals.esiPayablePaise));
    const statutoryDue = nextMonthDay(run.period, STATUTORY_DAY);
    const statutoryDay = statutoryDue < from ? from : statutoryDue;
    if (statutory > 0 && !run.statutoryPaidOn && statutoryDay <= until) rows.push({ date: statutoryDay, label: `PF and ESI for ${run.period}`, amount: statutory, basis: statutoryDue < from ? `employee and employer shares, was due by ${statutoryDue}` : 'employee and employer shares, due by the 15th' });
    const tds = toRupees(run.totals.tdsPaise);
    const tdsDue = nextMonthDay(run.period, TDS_DAY);
    const tdsDay = tdsDue < from ? from : tdsDue;
    if (tds > 0 && !run.tdsDepositedOn && tdsDay <= until) rows.push({ date: tdsDay, label: `Salary TDS for ${run.period}`, amount: tds, basis: tdsDue < from ? `deducted from salaries, was due by ${tdsDue}` : 'deducted from salaries, deposit by the 7th' });
  }
  const employees = (state.employees || []).filter((e) => !e.leftOn).length;
  if (latest && employees > 0) {
    let period = latest.period;
    for (let i = 0; i < 6; i += 1) {
      const [y, m] = period.split('-').map(Number);
      period = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
      if (state.payrollRuns && Object.hasOwn(state.payrollRuns, period)) continue;
      const payday = nextMonthDay(period, PAYROLL_DAY);
      if (payday < from) continue;
      if (payday > until) break;
      rows.push({ date: payday, label: `Salaries for ${period} (expected)`, amount: toRupees(latest.totals.netPaise), basis: `same as the last approved month, ${latest.period}; not yet run` });
    }
  }
  return rows;
}

function windowsOf(from, span, receipts, outgoings, start) {
  if (span < 60) return [];
  const out = [];
  let runningLow = start;
  let runningExpected = start;
  let runningHigh = start;
  for (let w = 0; w * 30 < span; w += 1) {
    const a = addDays(from, w * 30 + (w ? 1 : 0));
    const b = addDays(from, Math.min(span, (w + 1) * 30));
    const inside = (date) => date >= a && date <= b;
    const expected = round2(receipts.filter((r) => inside(r.date)).reduce((s, r) => s + r.amount, 0));
    const low = round2(receipts.filter((r) => inside(r.latest) && r.date >= a).reduce((s, r) => s + r.amount, 0));
    const high = round2(receipts.filter((r) => inside(r.earliest) || inside(r.date)).reduce((s, r) => s + r.amount, 0));
    const going = round2(outgoings.filter((r) => inside(r.date)).reduce((s, r) => s + r.amount, 0));
    runningLow = round2(runningLow + low - going);
    runningExpected = round2(runningExpected + expected - going);
    runningHigh = round2(runningHigh + high - going);
    out.push({ from: a, to: b, in: { low, expected, high }, out: going, end: { low: runningLow, expected: runningExpected, high: runningHigh } });
  }
  return out;
}

function risksOf({ start, receipts, overdue, gst, payroll, balanceOn, stats, monthlyOutgoings }) {
  const risks = [];
  for (const [key, stat] of stats) {
    if (stat.median > 45) {
      const owed = receipts.filter((r) => r.label.toLowerCase().endsWith(`from ${key}`)).reduce((s, r) => s + r.amount, 0);
      if (owed > 0) risks.push({ kind: 'late-payer', severity: 'high', text: `${receipts.find((r) => r.label.toLowerCase().endsWith(`from ${key}`)).label.split(' from ')[1]} usually pays in ${stat.median} days, so ${inr(owed)} may land after the dates above.` });
    }
  }
  for (const row of payroll) {
    const day = balanceOn.find((b) => b.date === row.date);
    if (day && day.amount < 0) risks.push({ kind: 'payroll', severity: 'critical', text: `Cash goes to ${inr(day.amount)} on ${row.date}, the day ${row.label.toLowerCase()} is due.` });
  }
  for (const row of gst) {
    const day = balanceOn.find((b) => b.date === row.date);
    if (day && day.amount < 0) risks.push({ kind: 'gst', severity: 'critical', text: `Cash goes to ${inr(day.amount)} on ${row.date}, when ${row.label} of ${inr(row.amount)} is due.` });
  }
  const thinShare = receipts.length ? receipts.filter((r) => r.thin).reduce((s, r) => s + r.amount, 0) / Math.max(1, receipts.reduce((s, r) => s + r.amount, 0)) : 0;
  if (receipts.length && thinShare > 0.5) risks.push({ kind: 'thin-history', severity: 'medium', text: 'More than half of the money expected in is from customers with fewer than three paid invoices, so the dates are guesses.' });
  if (overdue.total > 0 && overdue.total > monthlyOutgoings) risks.push({ kind: 'overdue', severity: 'high', text: `${inr(overdue.total)} is overdue and not counted; that is more than a month of your usual outgoings.` });
  if (start.source !== 'reading') risks.push({ kind: 'no-reading', severity: 'high', text: 'There is no bank balance from you, so the starting figure is only what MyCA has recorded.' });
  return risks.slice(0, 5);
}

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const payroll = payrollOutgoings(state, from, until);
  const stats = payingStats(state);
  const spending = averages.expenses > 0
    ? [{ date: until, label: 'Usual expenses', amount: round2((averages.expenses * span) / 30), basis: `average of ${averages.months[0]} to ${averages.months.at(-1)}, spread over the days`, spread: true }]
    : [];
  const dailySpend = averages.expenses / 30;
  const events = [
    ...receipts.inWindow.map((row) => ({ ...row, sign: 1 })),
    ...bills.map((row) => ({ ...row, sign: -1 })),
    ...gst.map((row) => ({ ...row, sign: -1 })),
    ...payroll.map((row) => ({ ...row, sign: -1 })),
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
      going: { total: round2(sum(bills) + sum(gst) + sum(payroll) + sum(spending)), rows: [...bills, ...gst, ...payroll, ...spending] },
      overdue: { total: sum(receipts.overdue), rows: receipts.overdue },
      unpaidBills: { total: sum(billRows.older), rows: billRows.older },
      end: round2(balance),
      lowest,
      monthlyOutgoings: averages.outgoings,
      balanceOn,
      windows: windowsOf(from, span, receipts.inWindow, [...bills, ...gst, ...payroll, ...spending.map((row) => ({ ...row, date: until }))], start.amount),
      risks: risksOf({ start, receipts: receipts.inWindow, overdue: { total: sum(receipts.overdue) }, gst, payroll, balanceOn, stats, monthlyOutgoings: averages.outgoings }),
      notes: [
        start.note,
        'Overdue invoices are listed but not counted: MyCA cannot tell when they will be paid.',
        averages.expenses > 0 ? '' : 'No expenses in the last three months, so none are projected.',
        billRows.older.length ? 'Bills unpaid for more than 30 days are listed but not counted: MyCA cannot tell when you will pay them, or whether you paid them outside MyCA.' : '',
        salaryPrivate(state) && (state.employees || []).length ? 'Salaries are not shown here: only the owner sees payroll, so the forecast leaves it out.' : '',
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

export function canMakePayroll(state, { deadlines = [] } = {}) {
  if (salaryPrivate(state)) return { ok: false, error: 'SALARIES_PRIVATE' };
  const today = localToday();
  const employees = (state.employees || []).filter((e) => !e.leftOn).length;
  if (!employees) return { ok: false, error: 'NO_EMPLOYEES' };
  const forecast = cashForecast(state, { days: 60, from: today, deadlines }).data;
  const next = forecast.going.rows.filter((row) => /^Salaries for/.test(row.label)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return { ok: false, error: 'NO_PAYROLL_IN_VIEW' };
  const onDay = forecast.balanceOn.find((row) => row.date === next.date) || forecast.balanceOn.at(-1);
  const before = round2(onDay.amount + next.amount);
  const statutory = forecast.going.rows.filter((row) => /^(PF and ESI|Salary TDS) for/.test(row.label) && row.date <= addDays(next.date, 10));
  const need = round2(next.amount + statutory.reduce((s, r) => s + r.amount, 0));
  const left = round2(before - need);
  const verdict = left < 0 ? 'short' : forecast.monthlyOutgoings > 0 && left < forecast.monthlyOutgoings / 2 ? 'tight' : 'covered';
  const gap = left < 0 ? round2(-left) : 0;
  const stats = payingStats(state);
  const helpers = [];
  if (gap > 0) {
    for (const row of [...forecast.coming.rows, ...forecast.overdue.rows]) {
      const key = row.label.split(' from ')[1]?.toLowerCase() || '';
      const stat = stats.get(key);
      const landsBy = stat ? addDays(today, stat.median) : row.date;
      if (landsBy <= (next.date > addDays(today, 7) ? next.date : addDays(today, 7))) helpers.push({ customer: row.label.split(' from ')[1], invoice: row.label.split(' from ')[0], amount: row.amount, usuallyPaysIn: stat ? stat.median : null });
    }
    helpers.sort((a, b) => b.amount - a.amount);
  }
  return {
    ok: true,
    data: { payday: next.date, label: next.label, net: next.amount, statutory: round2(need - next.amount), need, balanceBefore: before, left, verdict, gap, helpers: helpers.slice(0, 5), start: forecast.start, estimated: /\(expected\)$/.test(next.label) },
  };
}
