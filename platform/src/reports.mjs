import { localToday } from './dates.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { billOutstanding } from './invoice.mjs';

export const REPORT_METRICS = ['sales', 'purchases', 'expenses', 'owed', 'owing'];
export const REPORT_GROUPS = ['customer', 'supplier', 'head', 'month', 'none'];
export const REPORT_PERIODS = ['this-month', 'last-month', 'this-quarter', 'this-year', 'last-year'];
const MAX_REPORTS = 50;
const MAX_ROWS = 20;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function fyStart(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

function monthShift(period, delta) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthEnd(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function rangeOf(period, today = localToday()) {
  const month = today.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(period)) return { label: period, from: `${period}-01`, to: monthEnd(period) };
  if (period === 'last-month') { const p = monthShift(month, -1); return { label: p, from: `${p}-01`, to: monthEnd(p) }; }
  if (period === 'this-quarter') {
    const [y, m] = month.split('-').map(Number);
    const qStart = m - ((m - 1) % 3);
    const start = `${y}-${String(qStart).padStart(2, '0')}`;
    return { label: `${start} to ${monthShift(start, 2)}`, from: `${start}-01`, to: monthEnd(monthShift(start, 2)) };
  }
  if (period === 'this-year') { const from = fyStart(today); return { label: `FY ${from.slice(0, 4)}-${String((Number(from.slice(0, 4)) + 1) % 100).padStart(2, '0')}`, from, to: `${Number(from.slice(0, 4)) + 1}-03-31` }; }
  if (period === 'last-year') { const from = fyStart(today); const y = Number(from.slice(0, 4)) - 1; return { label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
  return { label: month, from: `${month}-01`, to: monthEnd(month) };
}

function previousRange(period, range, today) {
  if (period === 'this-year' || period === 'last-year') { const y = Number(range.from.slice(0, 4)) - 1; return { label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
  if (period === 'this-quarter') { const start = monthShift(range.from.slice(0, 7), -3); return { label: `${start} to ${monthShift(start, 2)}`, from: `${start}-01`, to: monthEnd(monthShift(start, 2)) }; }
  const p = monthShift(range.from.slice(0, 7), -1);
  return { label: p, from: `${p}-01`, to: monthEnd(p) };
}

function rowsFor(state, metric, range) {
  const inRange = (d) => d.date && d.date >= range.from && d.date <= range.to;
  if (metric === 'sales') return (state.invoices || []).filter((d) => d.status !== 'cancelled' && inRange(d)).map((d) => ({ key: d.partyName, head: '', month: d.date.slice(0, 7), amount: round2(d.taxable ?? d.total) }));
  if (metric === 'purchases') return (state.purchases || []).filter((d) => d.status !== 'cancelled' && inRange(d)).map((d) => ({ key: d.partyName, head: '', month: d.date.slice(0, 7), amount: round2(d.taxable ?? d.total) }));
  if (metric === 'expenses') return (state.expenses || []).filter(inRange).map((d) => ({ key: d.payee || d.narration || '', head: d.headName || d.head || '', month: d.date.slice(0, 7), amount: round2(d.taxable ?? d.amount) }));
  if (metric === 'owed') return (state.invoices || []).filter((d) => d.status !== 'cancelled').map((d) => ({ key: d.partyName, head: '', month: d.date.slice(0, 7), amount: round2(outstandingOf(state, d)) })).filter((r) => r.amount > 0.005);
  if (metric === 'owing') return (state.purchases || []).filter((d) => d.status !== 'cancelled').map((d) => ({ key: d.partyName, head: '', month: d.date.slice(0, 7), amount: round2(billOutstanding(d)) })).filter((r) => r.amount > 0.005);
  return [];
}

function grouped(rows, groupBy) {
  const by = new Map();
  for (const row of rows) {
    const key = groupBy === 'none' ? 'Total' : groupBy === 'head' ? (row.head || 'Untagged') : groupBy === 'month' ? row.month : (row.key || 'Unnamed');
    by.set(key, round2((by.get(key) || 0) + row.amount));
  }
  return [...by.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => (groupBy === 'month' ? a.label.localeCompare(b.label) : b.amount - a.amount));
}

export function runReportSpec(state, spec, today = localToday(), { maxRows = MAX_ROWS } = {}) {
  const metric = REPORT_METRICS.includes(spec.metric) ? spec.metric : 'sales';
  const groupBy = REPORT_GROUPS.includes(spec.groupBy) ? spec.groupBy : 'none';
  const period = /^\d{4}-\d{2}$/.test(String(spec.period || '')) || REPORT_PERIODS.includes(spec.period) ? spec.period : 'this-month';
  const balance = metric === 'owed' || metric === 'owing';
  const range = rangeOf(period, today);
  const rows = grouped(rowsFor(state, metric, range), groupBy);
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  let compare = null;
  if (spec.compare && !balance) {
    const before = previousRange(period, range, today);
    const beforeRows = grouped(rowsFor(state, metric, before), groupBy);
    const beforeTotal = round2(beforeRows.reduce((s, r) => s + r.amount, 0));
    const byLabel = new Map(beforeRows.map((r) => [r.label, r.amount]));
    compare = { label: before.label, total: beforeTotal, changePct: beforeTotal > 0 ? Math.round(((total - beforeTotal) / beforeTotal) * 100) : null, rows: rows.map((r) => ({ label: r.label, before: byLabel.get(r.label) || 0 })) };
  }
  return { metric, groupBy, period, range: balance ? { label: `as of ${today}`, from: '', to: today } : range, rows: rows.slice(0, maxRows), more: Math.max(0, rows.length - maxRows), total, compare };
}

function nameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
}

export function planSaveReport(state, args = {}) {
  const name = String(args.name || '').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };
  if (!REPORT_METRICS.includes(args.metric)) return { ok: false, error: 'BAD_METRIC', hint: REPORT_METRICS.join(', ') };
  const groupBy = args.groupBy == null ? 'none' : args.groupBy;
  if (!REPORT_GROUPS.includes(groupBy)) return { ok: false, error: 'BAD_GROUP', hint: REPORT_GROUPS.join(', ') };
  const period = args.period == null ? 'this-month' : String(args.period);
  if (!(/^\d{4}-\d{2}$/.test(period) || REPORT_PERIODS.includes(period))) return { ok: false, error: 'BAD_PERIOD', hint: REPORT_PERIODS.join(', ') };
  const reports = state.reports && typeof state.reports === 'object' ? state.reports : {};
  const key = nameKey(name);
  if (!Object.hasOwn(reports, key) && Object.keys(reports).length >= MAX_REPORTS) return { ok: false, error: 'TOO_MANY_REPORTS', max: MAX_REPORTS };
  return { ok: true, plan: { key, name, spec: { metric: args.metric, groupBy, period, compare: args.compare === true }, replaces: Object.hasOwn(reports, key) } };
}

export function saveReport(state, args = {}) {
  const planned = planSaveReport(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.reports = state.reports && typeof state.reports === 'object' ? state.reports : {};
  state.reports[plan.key] = { name: plan.name, ...plan.spec, savedOn: localToday() };
  return { ok: true, report: state.reports[plan.key], replaced: plan.replaces, result: runReportSpec(state, plan.spec) };
}

export function savedReportSpec(state, name) {
  const reports = state.reports && typeof state.reports === 'object' ? state.reports : {};
  const key = nameKey(name);
  if (!key || !Object.hasOwn(reports, key)) return { ok: false, error: 'REPORT_NOT_FOUND', name, known: Object.values(reports).map((r) => r.name) };
  return { ok: true, name: reports[key].name, spec: reports[key] };
}

export function runReport(state, args = {}) {
  const saved = savedReportSpec(state, args.name);
  if (!saved.ok) return saved;
  return { ok: true, name: saved.name, result: runReportSpec(state, saved.spec) };
}

export function listReports(state) {
  const reports = state.reports && typeof state.reports === 'object' ? state.reports : {};
  return { ok: true, reports: Object.values(reports).map((r) => ({ name: r.name, metric: r.metric, groupBy: r.groupBy, period: r.period, compare: Boolean(r.compare), savedOn: r.savedOn })) };
}

export function deleteReport(state, args = {}) {
  const reports = state.reports && typeof state.reports === 'object' ? state.reports : {};
  const key = nameKey(args.name);
  if (!key || !Object.hasOwn(reports, key)) return { ok: false, error: 'REPORT_NOT_FOUND', name: args.name };
  const name = reports[key].name;
  delete reports[key];
  return { ok: true, name };
}

const METRIC_WORDS = { sales: 'Sales', purchases: 'Purchases', expenses: 'Expenses', owed: 'Owed by customers', owing: 'Owed to suppliers' };
const GROUP_WORDS = { customer: 'by customer', supplier: 'by supplier', head: 'by head', month: 'by month', none: '' };

export function reportWords(name, r, money) {
  const head = `${name ? `${name}: ` : ''}${METRIC_WORDS[r.metric]} ${GROUP_WORDS[r.groupBy]} ${r.range.label}`.replace(/\s+/g, ' ').trim();
  const lines = [`${head}: ${money(r.total)}${r.compare ? ` (${r.compare.changePct == null ? `last ${r.compare.label} ${money(r.compare.total)}` : `${r.compare.changePct >= 0 ? 'up' : 'down'} ${Math.abs(r.compare.changePct)}% on ${r.compare.label}, ${money(r.compare.total)}`})` : ''}.`];
  if (r.groupBy !== 'none') {
    const before = new Map((r.compare?.rows || []).map((x) => [x.label, x.before]));
    for (const row of r.rows) lines.push(`· ${row.label}: ${money(row.amount)}${r.compare ? ` (was ${money(before.get(row.label) || 0)})` : ''}`);
    if (r.more) lines.push(`· and ${r.more} more`);
  }
  if (!r.rows.length) lines.push('Nothing in that period.');
  return lines.join('\n');
}
