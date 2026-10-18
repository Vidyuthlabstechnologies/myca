import { createHash } from 'node:crypto';
import { localToday } from './dates.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { businessSummary } from './business-summary.mjs';
import { listExceptions, summarise } from './exceptions.mjs';
import { lockPeriod, lockThrough } from './period-lock.mjs';
import { latestReading } from './cash-forecast.mjs';
import { salaryPrivate } from './employees.mjs';

const DEFAULT_RECEIPT_THRESHOLD = 5000;
const DUPLICATE_DAYS = 5;
const DUPLICATE_RUPEES = 1;
const MOVE_PCT = 10;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function monthName(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function lastDayOf(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function previousPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
}

function inPeriod(doc, period) {
  return String(doc?.date || '').slice(0, 7) === period;
}

function key(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function daysApart(a, b) {
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86400000));
}

function duplicatesIn(rows) {
  const pairs = [];
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      if (daysApart(a.date, b.date) > DUPLICATE_DAYS) break;
      if (a.kind !== b.kind || key(a.party) !== key(b.party)) continue;
      if (Math.abs(a.amount - b.amount) > DUPLICATE_RUPEES) continue;
      pairs.push({ kind: a.kind, party: a.party, amount: a.amount, ids: [a.id, b.id], dates: [a.date, b.date] });
    }
  }
  return pairs;
}

function pct(now, before) {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

export function monthCloseOf(state, args = {}) {
  const today = localToday();
  const period = String(args.period || '').trim() || previousPeriod(today.slice(0, 7));
  if (!isReturnPeriod(period)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const lastDay = lastDayOf(period);
  if (lastDay >= today) return { ok: false, error: 'MONTH_NOT_OVER', period, lastDay };
  const threshold = Number.isFinite(Number(args.receiptThreshold)) && Number(args.receiptThreshold) >= 0 ? Number(args.receiptThreshold) : DEFAULT_RECEIPT_THRESHOLD;
  const invoices = (state.invoices || []).filter((d) => inPeriod(d, period) && d.status !== 'cancelled');
  const bills = (state.purchases || []).filter((d) => inPeriod(d, period) && d.status !== 'cancelled');
  const expenses = (state.expenses || []).filter((d) => inPeriod(d, period));
  const rows = [
    ...invoices.map((d) => ({ kind: 'invoice', id: d.id, party: d.partyName, amount: round2(d.total), date: d.date })),
    ...bills.map((d) => ({ kind: 'bill', id: d.id, party: d.partyName, amount: round2(d.total), date: d.date })),
    ...expenses.map((d) => ({ kind: 'expense', id: d.id, party: d.payee || d.narration || '', amount: round2(d.amount), date: d.date })),
  ];
  const duplicates = duplicatesIn(rows);
  const withoutDocument = [
    ...bills.filter((d) => round2(d.total) > threshold && !d.documentSha256).map((d) => ({ kind: 'bill', id: d.id, party: d.partyName, amount: round2(d.total), date: d.date })),
    ...expenses.filter((d) => round2(d.amount) > threshold && !d.documentSha256).map((d) => ({ kind: 'expense', id: d.id, party: d.payee || d.narration || '', amount: round2(d.amount), date: d.date })),
  ];
  const settlements = (state.settlements || []).filter((s) => String(s.to || s.from || '').slice(0, 7) === period);
  const settlementGaps = settlements.filter((s) => s.status === 'unmatched' || s.status === 'short');
  const open = listExceptions(state, { status: 'open' });
  const exceptions = summarise(open);
  const twoB = Boolean(state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, period));
  const employees = (state.employees || []).filter((e) => !e.leftOn || e.leftOn >= `${period}-01`).length;
  const run = state.payrollRuns && typeof state.payrollRuns === 'object' && Object.hasOwn(state.payrollRuns, period) ? state.payrollRuns[period] : null;
  const reading = latestReading(state);
  const readingInMonth = (state.cashReadings || []).some((r) => String(r.on || '').slice(0, 7) === period);
  const summary = businessSummary(state, { period }).data;
  const moves = [];
  const compare = (label, now, before) => {
    const change = pct(now, before);
    if (change != null && Math.abs(change) > MOVE_PCT) moves.push({ label, now: round2(now), before: round2(before), pct: change });
  };
  compare('Sales', summary.current.sales.net, summary.previous.sales.net);
  compare('Purchases', summary.current.purchases.total, summary.previous.purchases.total);
  compare('Expenses', summary.current.expenses.total, summary.previous.expenses.total);
  if (!salaryPrivate(state) && summary.current.payroll && summary.previous.payroll) compare('Payroll', summary.current.payroll.gross || 0, summary.previous.payroll.gross || 0);
  const checks = [
    { id: 'entries', item: 'Entries posted', ok: invoices.length + bills.length + expenses.length > 0, detail: `${invoices.length} sales, ${bills.length} bills, ${expenses.length} expenses` },
    { id: 'duplicates', item: 'No possible duplicates', ok: duplicates.length === 0, detail: duplicates.length ? duplicates.map((p) => `${p.ids.join(' and ')} (${p.party}, ₹${p.amount.toLocaleString('en-IN')}, ${daysApart(p.dates[0], p.dates[1])} days apart)`).join('; ') : 'same party, amount and date within five days checked' },
    { id: 'documents', item: `Documents for bills and expenses above ₹${threshold.toLocaleString('en-IN')}`, ok: withoutDocument.length === 0, detail: withoutDocument.length ? `${withoutDocument.length} without a document: ${withoutDocument.slice(0, 6).map((d) => `${d.id} (${d.party}, ₹${d.amount.toLocaleString('en-IN')})`).join(', ')}${withoutDocument.length > 6 ? ', and more' : ''}` : 'every one has a document attached' },
    { id: 'settlements', item: 'Marketplace settlements matched', ok: settlementGaps.length === 0, detail: settlements.length ? `${settlements.length} in the month, ${settlementGaps.length} unmatched or short` : 'none in the month' },
    { id: 'gstr2b', item: 'GSTR-2B loaded', ok: twoB || bills.length === 0, detail: twoB ? 'loaded for the month' : bills.length ? 'not loaded: the input credit is unchecked' : 'no bills, so none needed' },
    { id: 'payroll', item: 'Payroll approved and paid', ok: employees === 0 || Boolean(run && run.paidOn), detail: employees === 0 ? 'no employees' : !run ? `${employees} ${employees === 1 ? 'employee' : 'employees'}, payroll not approved` : run.paidOn ? `approved ${run.approvedOn}, paid ${run.paidOn}` : `approved ${run.approvedOn}, not yet recorded as paid` },
    { id: 'bank', item: 'Bank balance given in the month', ok: readingInMonth, detail: readingInMonth ? 'a reading in the month' : reading ? `last reading ${reading.on}` : 'no reading ever' },
    { id: 'exceptions', item: 'Nothing high or critical open', ok: (exceptions.bySeverity.high || 0) + (exceptions.bySeverity.critical || 0) === 0, detail: `${exceptions.count} open, ₹${Number(exceptions.moneyAtRisk).toLocaleString('en-IN')} at risk` },
    { id: 'moves', item: 'Month-on-month moves explained', ok: moves.length === 0, detail: moves.length ? moves.map((m) => `${m.label} ${m.pct > 0 ? 'up' : 'down'} ${Math.abs(m.pct)}% (₹${m.now.toLocaleString('en-IN')} against ₹${m.before.toLocaleString('en-IN')})`).join('; ') : 'nothing moved more than a tenth' },
  ];
  const needsYou = checks.filter((c) => !c.ok);
  const narrative = [
    `${monthName(period)}: sales ₹${round2(summary.current.sales.net).toLocaleString('en-IN')}${summary.previous.sales.net > 0 ? ` (${pct(summary.current.sales.net, summary.previous.sales.net) >= 0 ? 'up' : 'down'} ${Math.abs(pct(summary.current.sales.net, summary.previous.sales.net))}% on ${monthName(previousPeriod(period))})` : ''}, purchases ₹${round2(summary.current.purchases.total).toLocaleString('en-IN')}, expenses ₹${round2(summary.current.expenses.total).toLocaleString('en-IN')}.`,
    `Customers owe ₹${round2(summary.owedToYou.total).toLocaleString('en-IN')}${summary.owedToYou.overdue.total > 0 ? `, of which ₹${round2(summary.owedToYou.overdue.total).toLocaleString('en-IN')} is overdue` : ''}; you owe suppliers ₹${round2(summary.owedBySuppliers.total).toLocaleString('en-IN')}.`,
    needsYou.length ? `${needsYou.length} of ${checks.length} checks need you: ${needsYou.map((c) => c.item.toLowerCase()).join(', ')}.` : 'Every check passed.',
  ].join(' ');
  const draftHash = createHash('sha256').update(JSON.stringify({ period, checks: checks.map((c) => [c.id, c.ok, c.detail]), sales: summary.current.sales.net, purchases: summary.current.purchases.total, expenses: summary.current.expenses.total })).digest('hex');
  const record = state.monthCloses && typeof state.monthCloses === 'object' && Object.hasOwn(state.monthCloses, period) ? state.monthCloses[period] : null;
  const closed = record && record.draftHash === draftHash ? record : null;
  const locked = lockThrough(state) >= lastDay;
  return {
    ok: true,
    data: {
      period,
      month: monthName(period),
      lastDay,
      checks,
      needsYou: needsYou.map((c) => c.id),
      duplicates,
      withoutDocument,
      moves,
      narrative,
      draftHash,
      closed: Boolean(closed),
      closedOn: closed ? closed.on : '',
      closedBy: closed ? closed.by : '',
      changedSinceClose: Boolean(record && !closed),
      locked,
      receiptThreshold: threshold,
    },
  };
}

export function planMonthClose(state, args = {}) {
  const current = monthCloseOf(state, args);
  if (!current.ok) return current;
  const d = current.data;
  if (String(args.draftHash || '') !== d.draftHash) return { ok: false, error: 'DRAFT_CHANGED', period: d.period };
  if (d.closed) return { ok: false, error: 'ALREADY_CLOSED', period: d.period, closedOn: d.closedOn };
  const note = String(args.note || '').trim().slice(0, 500);
  if (d.needsYou.length && !note) return { ok: false, error: 'NOTE_REQUIRED', period: d.period, needsYou: d.needsYou };
  return { ok: true, close: d, note };
}

export function approveMonthClose(state, args = {}) {
  const planned = planMonthClose(state, args);
  if (!planned.ok) return planned;
  const { close, note } = planned;
  const by = String(state?.__actor?.userId || args.actorId || 'owner').slice(0, 80);
  const on = localToday();
  state.monthCloses = state.monthCloses && typeof state.monthCloses === 'object' ? state.monthCloses : {};
  state.monthCloses[close.period] = { draftHash: close.draftHash, on, by, openItems: close.needsYou, note, narrative: close.narrative };
  const lockedBefore = lockThrough(state);
  if (!lockedBefore || lockedBefore < close.lastDay) lockPeriod(state, close.lastDay, `Month close for ${close.month}`);
  return { ok: true, period: close.period, month: close.month, on, by, lockThrough: lockThrough(state), openItems: close.needsYou, note };
}

export function monthCloseWords(d, money) {
  const lines = [`Close ${d.month}: ${d.checks.length} checks, ${d.needsYou.length ? `${d.needsYou.length} need you` : 'all passed'}.`];
  for (const c of d.checks) lines.push(`${c.ok ? '✓' : '!'} ${c.item}: ${c.detail}.`);
  lines.push(d.narrative);
  if (d.closed) lines.push(`Closed on ${d.closedOn} by ${d.closedBy}; the books are locked through ${d.lastDay}.`);
  else if (d.changedSinceClose) lines.push('The books changed after this month was closed; close it again to lock the new figures.');
  else lines.push(`Say "approve the close${d.needsYou.length ? ' with a note' : ''}" to sign it off; the books lock through ${d.lastDay}.${d.needsYou.length ? ' The open items are kept with the close.' : ''}`);
  void money;
  return lines.join('\n');
}
