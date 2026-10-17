import { localToday, postingDate } from './dates.mjs';
import { daysBetween } from './reminders.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { overdueBy } from './payment-terms.mjs';
import { businessSummary } from './business-summary.mjs';
import { weekAhead } from './week-ahead.mjs';
import { cashStart, cashForecast, latestReading } from './cash-forecast.mjs';
import { listExceptions, summarise } from './exceptions.mjs';
import { supplierDues } from './supplier-dues.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function longDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function salesBetween(state, from, to) {
  const inRange = (doc) => doc.date && doc.date >= from && doc.date <= to;
  const sales = (state.invoices || []).filter((inv) => inv.status !== 'cancelled' && inRange(inv)).reduce((s, inv) => s + Number(inv.total || 0), 0);
  const credits = (state.creditNotes || []).filter(inRange).reduce((s, cn) => s + Number(cn.total || 0), 0);
  return round2(sales - credits);
}

function pct(now, before) {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

function agingBuckets(state, today) {
  const buckets = { current: 0, d31: 0, d61: 0, total: 0 };
  const late = [];
  for (const inv of state.invoices || []) {
    if (inv.status === 'cancelled') continue;
    const due = round2(outstandingOf(state, inv));
    if (due <= 0.005) continue;
    buckets.total = round2(buckets.total + due);
    const days = overdueBy(inv, today) ?? Math.max(0, daysBetween(addDays(inv.date, 30), today));
    if (days > 60) buckets.d61 = round2(buckets.d61 + due);
    else if (days > 30) buckets.d31 = round2(buckets.d31 + due);
    else buckets.current = round2(buckets.current + due);
    if (days > 30) late.push({ customer: inv.partyName, invoiceId: inv.id, due, daysLate: days });
  }
  late.sort((a, b) => b.due - a.due);
  return { ...buckets, late: late.slice(0, 3), status: buckets.d61 > 0 && (buckets.d61 >= buckets.total * 0.1 || buckets.d61 >= 50000) ? 'red' : buckets.d31 + buckets.d61 > 0 ? 'amber' : 'green' };
}

function runwayStatus(months) {
  if (months == null) return 'unknown';
  return months >= 6 ? 'green' : months >= 3 ? 'amber' : 'red';
}

function theOneThing(parts) {
  const { exceptions, dues, ahead, aging, cash } = parts;
  if (exceptions.bySeverity.critical) return `Fix the ${exceptions.bySeverity.critical === 1 ? 'critical item' : `${exceptions.bySeverity.critical} critical items`} in Needs you before recording more.`;
  const msmeLate = dues.find((b) => b.msme && b.overdue);
  if (msmeLate) return `Pay ${msmeLate.supplier} ${msmeLate.outstanding} on ${msmeLate.billId}: it is past the MSMED date, so the expense is disallowed until it is paid.`;
  const filing = ahead.find((i) => i.kind === 'filing');
  if (filing) return `${filing.title}: ${filing.overdue ? 'overdue' : `due ${longDate(filing.when)}`}.`;
  if (aging.late.length) return `Chase ${aging.late[0].customer}: ${aging.late[0].daysLate} days late on ${aging.late[0].invoiceId}. Say "send reminder to ${aging.late[0].customer}".`;
  if (cash.runwayStatus === 'red') return 'Cash covers less than three months of usual outgoings. Look at who owes you and what can wait.';
  const payroll = ahead.find((i) => i.kind === 'payroll');
  if (payroll) return `${payroll.title}.`;
  if (!cash.fromReading) return 'Give MyCA your bank balance today so the cash picture is real.';
  return 'Nothing is on fire. Keep the entries coming in daily.';
}

export function weeklyBrief(state, args = {}) {
  const today = postingDate(args.asOf) || localToday();
  const weekStart = addDays(today, -6);
  const lastWeekStart = addDays(today, -13);
  const lastWeekEnd = addDays(today, -7);
  const summary = businessSummary(state, {}).data;
  const start = cashStart(state, today);
  const forecast = cashForecast(state, { days: 30, from: today }).data;
  const monthlyOutgoings = round2(forecast.monthlyOutgoings || 0);
  const runwayMonths = monthlyOutgoings > 0 ? round2(start.amount / monthlyOutgoings) : null;
  const reading = latestReading(state);
  const weekAgo = addDays(today, -7);
  const cashWeekAgo = cashStart(state, weekAgo).amount;
  const aging = agingBuckets(state, today);
  const ahead = weekAhead(state, { asOf: today }).data.items;
  const dues = supplierDues(state, { asOf: today }).data.bills;
  const exceptions = summarise(listExceptions(state, { status: 'open' }));
  const salesThisWeek = salesBetween(state, weekStart, today);
  const salesLastWeek = salesBetween(state, lastWeekStart, lastWeekEnd);
  const cash = {
    amount: start.amount,
    bank: start.bank,
    cash: start.cash,
    fromReading: start.source === 'reading',
    readingOn: reading ? reading.on : '',
    changeOnWeek: round2(start.amount - cashWeekAgo),
    monthlyOutgoings,
    runwayMonths,
    runwayStatus: runwayStatus(runwayMonths),
    lowestIn30: forecast.lowest,
  };
  const data = {
    asOf: today,
    weekOf: weekStart,
    cash,
    sales: {
      thisWeek: salesThisWeek,
      lastWeek: salesLastWeek,
      weekChangePct: pct(salesThisWeek, salesLastWeek),
      thisMonth: summary.current.sales.net,
      lastMonth: summary.previous.sales.net,
      monthChangePct: pct(summary.current.sales.net, summary.previous.sales.net),
      month: summary.period,
    },
    receivables: aging,
    payables: {
      total: summary.owedBySuppliers.total,
      bills: summary.owedBySuppliers.bills,
      dueThisWeek: dues.filter((b) => b.daysLeft <= 7),
      msmeOverdue: dues.filter((b) => b.msme && b.overdue),
    },
    dueThisWeek: ahead,
    exceptions,
    oneThing: '',
  };
  data.oneThing = theOneThing({ exceptions, dues, ahead, aging, cash });
  return { ok: true, data };
}

export function weeklyBriefWords(d, money) {
  const flag = (status) => (status === 'red' ? ' [red]' : status === 'amber' ? ' [amber]' : '');
  const lines = [`Week of ${longDate(d.weekOf)} to ${longDate(d.asOf)}.`];
  const cashLine = d.cash.fromReading
    ? `Cash ${money(d.cash.amount)} (${d.cash.changeOnWeek >= 0 ? 'up' : 'down'} ${money(Math.abs(d.cash.changeOnWeek))} on last week)${d.cash.runwayMonths != null ? `, runway ${d.cash.runwayMonths} months${flag(d.cash.runwayStatus)}` : ''}.`
    : `Cash: only recorded figures (${money(d.cash.amount)}); give your bank balance for a true picture.`;
  lines.push(cashLine);
  lines.push(`Sales this week ${money(d.sales.thisWeek)}${d.sales.weekChangePct != null ? ` (${d.sales.weekChangePct >= 0 ? 'up' : 'down'} ${Math.abs(d.sales.weekChangePct)}% on last week)` : ''}; this month ${money(d.sales.thisMonth)}${d.sales.monthChangePct != null ? ` (${d.sales.monthChangePct >= 0 ? 'up' : 'down'} ${Math.abs(d.sales.monthChangePct)}% on last month)` : ''}.`);
  const r = d.receivables;
  if (r.total > 0) {
    const lateWords = r.late.length ? ` ${r.late.map((l) => `${l.customer} ${money(l.due)}, ${l.daysLate} days`).join('; ')}.` : '';
    lines.push(`Customers owe ${money(r.total)}: ${money(r.current)} current, ${money(r.d31)} 31 to 60 days, ${money(r.d61)} over 60 days${flag(r.status)}.${lateWords}`);
  } else lines.push('Nobody owes you anything right now.');
  if (d.payables.total > 0) lines.push(`You owe suppliers ${money(d.payables.total)} on ${d.payables.bills === 1 ? '1 bill' : `${d.payables.bills} bills`}${d.payables.msmeOverdue.length ? `; ${d.payables.msmeOverdue.length === 1 ? '1 MSME bill is' : `${d.payables.msmeOverdue.length} MSME bills are`} past the MSMED date [red]` : ''}.`);
  const due = d.dueThisWeek.filter((i) => i.kind !== 'receivable').slice(0, 5);
  if (due.length) lines.push(`Due this week: ${due.map((i) => `${i.title} (${i.overdue ? 'overdue' : longDate(i.when)})`).join('; ')}.`);
  if (d.exceptions.count) lines.push(`Needs you: ${d.exceptions.count} open, ${money(d.exceptions.moneyAtRisk)} at risk${d.exceptions.bySeverity.critical ? `, ${d.exceptions.bySeverity.critical} critical` : ''}.`);
  lines.push(`The one thing: ${d.oneThing}`);
  return lines.join('\n');
}
