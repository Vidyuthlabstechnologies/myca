import { createTransfers, listAccounts, TRANSFER_FLAGS } from './ledger.mjs';
import { localToday } from './dates.mjs';
import { lockPeriod } from './period-lock.mjs';
import { countryOf } from './country.mjs';

const CAPITAL = 3000;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

export function yearRange(state, year) {
  const text = String(year || '').trim();
  if (countryOf(state) === 'US') {
    if (!/^\d{4}$/.test(text)) return null;
    return { label: text, from: `${text}-01-01`, to: `${text}-12-31` };
  }
  const found = text.match(/^(\d{4})-(\d{2})$/);
  if (!found) return null;
  const start = Number(found[1]);
  return { label: text, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function defaultYear(state) {
  const today = localToday();
  if (countryOf(state) === 'US') return String(Number(today.slice(0, 4)) - 1);
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  const lastEndedStart = m >= 4 ? y - 1 : y - 2;
  return `${lastEndedStart}-${String((lastEndedStart + 1) % 100).padStart(2, '0')}`;
}

function closingOf(state, label) {
  const all = state.yearClosings && typeof state.yearClosings === 'object' ? state.yearClosings : {};
  return Object.hasOwn(all, label) ? all[label] : null;
}

const DATED_COLLECTIONS = ['invoices', 'purchases', 'creditNotes', 'debitNotes', 'expenses', 'bills'];

function documentDateIndex(state) {
  const index = new Map();
  for (const key of DATED_COLLECTIONS) {
    for (const document of Array.isArray(state[key]) ? state[key] : []) {
      if (document && typeof document.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(document.date || ''))) index.set(document.id, document.date);
    }
  }
  return index;
}

function transferDate(transfer, documentDates) {
  if (typeof transfer.userData === 'string' && /^\d{4}-\d{2}-\d{2}/.test(transfer.userData)) return transfer.userData.slice(0, 10);
  return documentDates.get(String(transfer.invoiceId || '')) || '';
}

export function planYearClose(state, args = {}) {
  const range = yearRange(state, args.year || defaultYear(state));
  if (!range) return fail('BAD_YEAR', { hint: countryOf(state) === 'US' ? 'Use the calendar year, for example 2025.' : 'Use the financial year, for example 2025-26.' });
  const today = localToday();
  if (range.to >= today) return fail('YEAR_NOT_ENDED', { year: range.label, to: range.to });
  if (closingOf(state, range.label)) return fail('ALREADY_CLOSED', { year: range.label, closedOn: closingOf(state, range.label).closedOn });
  const accounts = new Map(listAccounts(state.ledger).map((account) => [account.id, account]));
  const documentDates = documentDateIndex(state);
  const net = new Map();
  for (const t of state.ledger.transfers) {
    if (t.voided || (t.pending && !t.posted)) continue;
    const date = transferDate(t, documentDates);
    if (!date || date < range.from || date > range.to) continue;
    if (t.code === 'YEAR-CLOSE') continue;
    const amount = Number(t.amount) / 100;
    for (const [id, sign] of [[t.debitAccountId.toString(), 1], [t.creditAccountId.toString(), -1]]) {
      const account = accounts.get(id);
      if (!account || !['income', 'expense'].includes(account.type)) continue;
      net.set(id, round2((net.get(id) || 0) + sign * amount));
    }
  }
  const rows = [...net.entries()].map(([id, debitNet]) => ({ id, code: accounts.get(id).code, name: accounts.get(id).name, type: accounts.get(id).type, debitNet })).filter((row) => Math.abs(row.debitNet) > 0.005).sort((a, b) => a.code.localeCompare(b.code));
  const income = round2(rows.filter((row) => row.type === 'income').reduce((sum, row) => sum - row.debitNet, 0));
  const expenses = round2(rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.debitNet, 0));
  const profit = round2(income - expenses);
  if (!rows.length) return fail('NOTHING_TO_CLOSE', { year: range.label });
  return { ok: true, plan: { year: range.label, from: range.from, to: range.to, rows, income, expenses, profit, lockThrough: range.to } };
}

export function closeYear(state, args = {}) {
  const planned = planYearClose(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const linked = TRANSFER_FLAGS.LINKED;
  const seqBefore = state.transferSeq;
  const id = `CLOSE-${plan.year}`;
  const bundle = [];
  for (const row of plan.rows) {
    const amount = BigInt(Math.round(Math.abs(row.debitNet) * 100));
    if (row.debitNet < 0) bundle.push({ id: nextTransferId(state), debitAccountId: Number(row.id), creditAccountId: CAPITAL, amount, flags: linked, invoiceId: id, code: 'YEAR-CLOSE', userData: plan.to });
    else bundle.push({ id: nextTransferId(state), debitAccountId: CAPITAL, creditAccountId: Number(row.id), amount, flags: linked, invoiceId: id, code: 'YEAR-CLOSE', userData: plan.to });
  }
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const locked = lockPeriod(state, plan.to, `Year ${plan.year} closed`);
  const record = { year: plan.year, from: plan.from, to: plan.to, income: plan.income, expenses: plan.expenses, profit: plan.profit, accounts: plan.rows.length, closedOn: localToday(), by: String(state.__actor?.userId || args.actorId || ''), transferIds: posted.map((result) => result.id), locked: locked.ok !== false };
  state.yearClosings = state.yearClosings && typeof state.yearClosings === 'object' ? state.yearClosings : {};
  state.yearClosings[plan.year] = record;
  return { ok: true, closing: record, posted };
}

export function listYearClosings(state) {
  return { ok: true, data: { closings: Object.values(state.yearClosings || {}).sort((a, b) => a.year.localeCompare(b.year)), nextYear: defaultYear(state) } };
}
