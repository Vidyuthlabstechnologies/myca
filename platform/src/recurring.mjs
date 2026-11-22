import { localToday, postingDate } from './dates.mjs';
import { countryOf } from './country.mjs';
import { createInvoice, createPurchase } from './invoice.mjs';
import { createUsInvoice, createUsPurchase } from './us-sales.mjs';
import { planExpense, postExpense } from './expenses.mjs';
import { planQuote } from './quotes.mjs';
import { appendAuditEvent } from './ca-api.mjs';

export const RECURRING_KINDS = ['invoice', 'bill', 'expense'];
export const RECURRING_EVERY = { week: { days: 7 }, month: { months: 1 }, quarter: { months: 3 }, 'half-year': { months: 6 }, year: { months: 12 } };
const MAX_PER_RUN = 24;
const ARG_KEYS = {
  invoice: ['partyName', 'partyGstin', 'partyState', 'lines', 'paymentTermsDays', 'taxJurisdiction', 'taxExempt', 'exemptionReason', 'partyAddress', 'registrationGstin'],
  bill: ['partyName', 'partyGstin', 'partyState', 'lines', 'salesTaxPaid', 'registrationGstin', 'reverseCharge', 'originCountry', 'partyAddress', 'itcEligible'],
  expense: ['narration', 'amount', 'gstRate', 'mode', 'payee', 'supplierGstin', 'head'],
};

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function scheduleList(state) {
  if (!Array.isArray(state.recurring)) state.recurring = [];
  return state.recurring;
}

function nextId(state) {
  const used = scheduleList(state).map((item) => Number(String(item.id).slice(3)) || 0);
  return `RP-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function occurrenceDate(startDate, every, n) {
  const step = RECURRING_EVERY[every];
  const [y, m, d] = startDate.split('-').map(Number);
  if (step.days) return new Date(Date.UTC(y, m - 1, d + step.days * n)).toISOString().slice(0, 10);
  const monthIndex = m - 1 + step.months * n;
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pick(args, kind) {
  const out = {};
  for (const key of ARG_KEYS[kind]) if (args[key] != null && args[key] !== '') out[key] = args[key];
  return out;
}

function checkTemplate(state, kind, template, date) {
  if (kind === 'invoice') {
    const planned = planQuote(state, { ...template, date });
    return planned.ok ? { ok: true, amount: planned.plan.total, party: planned.plan.partyName } : planned;
  }
  if (kind === 'bill') {
    if (!String(template.partyName || '').trim()) return fail('SUPPLIER_REQUIRED');
    const lines = Array.isArray(template.lines) ? template.lines : [];
    if (!lines.length) return fail('NO_LINES');
    const us = countryOf(state) === 'US';
    let total = 0;
    for (const line of lines) {
      const qty = Number(line.qty == null || line.qty === '' ? 1 : line.qty);
      const rate = Number(line.rate);
      if (!us && (line.gstRate == null || line.gstRate === '')) return fail('RATE_REQUIRED');
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return fail('BAD_LINE');
      total += qty * rate * (1 + (us ? 0 : Number(line.gstRate) / 100));
    }
    if (total <= 0) return fail('ZERO_AMOUNT');
    return { ok: true, amount: Math.round(total * 100) / 100, party: String(template.partyName).trim() };
  }
  const planned = planExpense(state, { ...template, date, mode: 'bank' });
  if (!planned.ok && planned.error !== 'PERIOD_LOCKED') return planned;
  return { ok: true, amount: Math.round(Number(template.amount) * 100) / 100, party: String(template.payee || template.narration || '').trim() };
}

export function planRecurring(state, args = {}) {
  const kind = String(args.kind || 'invoice');
  if (!RECURRING_KINDS.includes(kind)) return fail('BAD_KIND');
  const every = String(args.every || 'month');
  if (!Object.hasOwn(RECURRING_EVERY, every)) return fail('BAD_EVERY');
  const startDate = postingDate(args.startDate);
  if (!startDate) return fail('INVALID_DATE', { date: args.startDate });
  const endDate = args.endDate == null || args.endDate === '' ? '' : postingDate(args.endDate);
  if (endDate === null) return fail('INVALID_DATE', { date: args.endDate });
  if (endDate && endDate < startDate) return fail('END_BEFORE_START');
  const template = pick(args, kind);
  const checked = checkTemplate(state, kind, template, startDate);
  if (!checked.ok) return checked;
  const next = [0, 1, 2].map((n) => occurrenceDate(startDate, every, n)).filter((date) => !endDate || date <= endDate);
  return { ok: true, plan: { kind, every, startDate, endDate, template, amount: checked.amount, party: checked.party, next } };
}

export function addRecurring(state, args = {}) {
  const planned = planRecurring(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const schedule = {
    id: nextId(state),
    kind: plan.kind,
    every: plan.every,
    startDate: plan.startDate,
    endDate: plan.endDate,
    template: plan.template,
    amount: plan.amount,
    party: plan.party,
    count: 0,
    nextDate: plan.startDate,
    status: 'active',
    made: [],
    lastError: '',
    createdOn: localToday(),
    by: String(state.__actor?.userId || args.actorId || ''),
  };
  scheduleList(state).push(schedule);
  return { ok: true, schedule, next: plan.next };
}

export function findRecurring(state, id) {
  return scheduleList(state).find((item) => item.id === String(id || '').trim().toUpperCase()) || null;
}

export function stopRecurring(state, args = {}) {
  const schedule = findRecurring(state, args.id);
  if (!schedule) return fail('RECURRING_NOT_FOUND', { id: args.id });
  if (schedule.status !== 'active') return fail('ALREADY_STOPPED', { id: schedule.id });
  schedule.status = 'stopped';
  schedule.stoppedOn = localToday();
  return { ok: true, schedule };
}

function createFor(state, schedule, date) {
  const args = { ...schedule.template, date };
  const us = countryOf(state) === 'US';
  if (schedule.kind === 'invoice') return us ? createUsInvoice(state, args) : createInvoice(state, args);
  if (schedule.kind === 'bill') return us ? createUsPurchase(state, args) : createPurchase(state, args);
  return postExpense(state, args);
}

function madeId(result) {
  return result.invoice?.id || result.purchase?.id || result.bill?.id || result.expense?.id || result.id || '';
}

export function runRecurring(state, args = {}) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOf || '')) ? args.asOf : localToday();
  const made = [];
  const failed = [];
  for (const schedule of scheduleList(state)) {
    if (schedule.status !== 'active') continue;
    let runs = 0;
    while (schedule.nextDate <= asOf && runs < MAX_PER_RUN) {
      if (schedule.endDate && schedule.nextDate > schedule.endDate) break;
      const result = createFor(state, schedule, schedule.nextDate);
      if (!result || result.ok === false) {
        schedule.lastError = String(result?.error || 'FAILED');
        failed.push({ id: schedule.id, date: schedule.nextDate, error: schedule.lastError });
        break;
      }
      const id = madeId(result);
      schedule.made.push({ date: schedule.nextDate, id });
      if (schedule.made.length > 60) schedule.made.splice(0, schedule.made.length - 60);
      appendAuditEvent(state, { actorId: 'automation', action: 'recurring_posted', metadata: { scheduleId: schedule.id, kind: schedule.kind, date: schedule.nextDate, documentId: id } });
      made.push({ id: schedule.id, kind: schedule.kind, date: schedule.nextDate, documentId: id, party: schedule.party });
      schedule.lastError = '';
      schedule.count += 1;
      schedule.nextDate = occurrenceDate(schedule.startDate, schedule.every, schedule.count);
      runs += 1;
    }
    if (schedule.endDate && schedule.nextDate > schedule.endDate) schedule.status = 'ended';
  }
  return { ok: true, data: { asOf, made, failed } };
}

export function listRecurring(state, { status = 'all' } = {}) {
  const rows = scheduleList(state)
    .filter((item) => status === 'all' || item.status === status)
    .map((item) => ({ id: item.id, kind: item.kind, every: item.every, party: item.party, amount: item.amount, startDate: item.startDate, endDate: item.endDate, nextDate: item.status === 'active' ? item.nextDate : '', status: item.status, count: item.count, lastError: item.lastError, last: item.made[item.made.length - 1] || null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, data: { schedules: rows } };
}

const EVERY_WORDS = { week: 'every week', month: 'every month', quarter: 'every quarter', 'half-year': 'every six months', year: 'every year' };
const KIND_WORDS = { invoice: 'invoice to', bill: 'bill from', expense: 'expense' };

export function everyWords(every) {
  return EVERY_WORDS[every] || every;
}

export function recurringWords(data, money) {
  if (!data.schedules.length) return 'Nothing repeats yet. Say, for example, "repeat invoice to ABC Ltd 25000 for rent GST 18% every month from 1 December".';
  return `Repeating:\n${data.schedules.map((row) => `· ${row.id}: ${KIND_WORDS[row.kind]} ${row.party || 'no name'} ${money(row.amount)} ${everyWords(row.every)}, ${row.status === 'active' ? `next ${row.nextDate}` : row.status}${row.lastError ? ` (last try failed: ${row.lastError})` : ''}`).join('\n')}`;
}

export function runRecurringWords(data, money) {
  if (!data.made.length && !data.failed.length) return `Nothing was due to repeat on or before ${data.asOf}.`;
  const lines = data.made.map((row) => `· ${row.date}: ${row.documentId} (${KIND_WORDS[row.kind]} ${row.party}) from ${row.id}`);
  for (const row of data.failed) lines.push(`! ${row.id} on ${row.date} was not made: ${row.error}`);
  return `${data.made.length} repeating ${data.made.length === 1 ? 'entry' : 'entries'} made.\n${lines.join('\n')}`;
}
