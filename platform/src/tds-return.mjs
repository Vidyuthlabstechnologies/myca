import { createHash } from 'node:crypto';
import { rules } from './sprint-load.mjs';
import { deadlineRun } from './deadline-run.mjs';
import { filingFor } from './filings.mjs';

const QUARTER_MONTHS = { 1: ['04', '05', '06'], 2: ['07', '08', '09'], 3: ['10', '11', '12'], 4: ['01', '02', '03'] };
const QUARTER_END = { 1: '06-30', 2: '09-30', 3: '12-31', 4: '03-31' };
const LABEL = /^Q([1-4]) (\d{4}-\d{2})$/;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const paise = (value) => Math.round(Number(value || 0) * 100);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function quarterOf(date) {
  const fy = rules.fyOf(date);
  if (!fy) return null;
  const month = Number(date.slice(5, 7));
  const quarter = month >= 4 ? Math.floor((month - 4) / 3) + 1 : 4;
  return quarterLabelled(quarter, fy);
}

function quarterLabelled(quarter, fy) {
  const startYear = Number(fy.slice(0, 4));
  const year = quarter === 4 ? startYear + 1 : startYear;
  return {
    label: `Q${quarter} ${fy}`,
    quarter,
    fy,
    months: QUARTER_MONTHS[quarter].map((mm) => `${year}-${mm}`),
    endDate: `${year}-${QUARTER_END[quarter]}`,
  };
}

export function parseQuarter(value) {
  const text = String(value || '').trim().toUpperCase();
  const full = text.match(LABEL);
  if (full) return quarterLabelled(Number(full[1]), full[2]);
  const fyFirst = text.match(/^(\d{4}-\d{2})[ -]Q([1-4])$/);
  if (fyFirst) return quarterLabelled(Number(fyFirst[2]), fyFirst[1]);
  return null;
}

function entriesOf(state, { deductedOnly = true } = {}) {
  return (state.tdsEntries || []).filter((entry) => !deductedOnly || entry.tds > 0).slice().sort((a, b) => a.date.localeCompare(b.date));
}

export function quartersWithDeductions(state) {
  const seen = new Map();
  for (const entry of entriesOf(state)) {
    const q = quarterOf(entry.date);
    if (q && !seen.has(q.label)) seen.set(q.label, q);
  }
  return [...seen.values()].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

function allocateDeposits(state) {
  const deductions = entriesOf(state).map((entry) => ({ entry, left: paise(entry.tds) }));
  const deposits = (state.tdsDeposits || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const covered = new Map();
  let cursor = 0;
  for (const deposit of deposits) {
    let left = paise(deposit.amount);
    while (left > 0 && cursor < deductions.length) {
      const slot = deductions[cursor];
      const take = Math.min(left, slot.left);
      slot.left -= take;
      left -= take;
      const key = quarterOf(slot.entry.date)?.label || '';
      const row = covered.get(deposit.id) || { deposit, byQuarter: new Map() };
      row.byQuarter.set(key, (row.byQuarter.get(key) || 0) + take);
      covered.set(deposit.id, row);
      if (slot.left === 0) cursor += 1;
    }
  }
  return covered;
}

function deducteeKey(entry) {
  return `${entry.pan || `NOPAN:${String(entry.payee || '').toUpperCase()}`}|${entry.section}`;
}

function dueRow(state, quarter) {
  const run = deadlineRun(state, { asOfDate: quarter.endDate });
  return (run.deadlines || []).find((row) => row.clientId === 'SELF' && row.returnType === 'TDS_QUARTERLY' && row.period === quarter.label) || null;
}

function formFor(quarter) {
  const found = rules.rule('due-date.tds.statement', quarter.endDate);
  const forms = found.ok && Array.isArray(found.record.value?.forms) ? found.record.value.forms : [];
  return { form: forms[1] || '', ruleUsed: found.ok ? `${found.record.id}@${found.record.effectiveFrom}` : '' };
}

export function tdsReturnDraft(state, requested) {
  if (!state.company?.tdsDeductor) return fail('NOT_A_DEDUCTOR');
  const quarters = quartersWithDeductions(state);
  let quarter = null;
  if (requested != null && requested !== '') {
    quarter = parseQuarter(requested);
    if (!quarter) return fail('INVALID_QUARTER', { hint: 'Say the quarter as Q2 2026-27.', quarters: quarters.map((q) => q.label) });
  } else {
    quarter = quarters.at(-1) || null;
  }
  if (!quarter) return fail('NO_DEDUCTIONS', { quarters: [] });
  const inQuarter = entriesOf(state, { deductedOnly: false }).filter((entry) => quarter.months.includes(entry.date.slice(0, 7)));
  const deductedInQuarter = inQuarter.filter((entry) => entry.tds > 0);
  const byDeductee = new Map();
  for (const entry of inQuarter) {
    const key = deducteeKey(entry);
    const row = byDeductee.get(key) || { pan: entry.pan || '', noPan: !entry.pan, payee: entry.payee || '', section: entry.section, count: 0, basis: 0, tds: 0, rate: 0, firstDate: entry.date, lastDate: entry.date };
    if (entry.tds > 0) row.rate = entry.rate;
    row.count += 1;
    row.basis = round2(row.basis + entry.basis);
    row.tds = round2(row.tds + entry.tds);
    row.lastDate = entry.date;
    byDeductee.set(key, row);
  }
  const deductees = [...byDeductee.values()].sort((a, b) => a.section.localeCompare(b.section) || b.tds - a.tds);
  const sections = [];
  for (const row of deductees) {
    const section = sections.find((item) => item.section === row.section) || sections[sections.push({ section: row.section, deductees: 0, count: 0, basis: 0, tds: 0 }) - 1];
    section.deductees += 1;
    section.count += row.count;
    section.basis = round2(section.basis + row.basis);
    section.tds = round2(section.tds + row.tds);
  }
  const covered = allocateDeposits(state);
  const challans = [];
  for (const { deposit, byQuarter } of covered.values()) {
    const amount = byQuarter.get(quarter.label) || 0;
    if (amount > 0) challans.push({ id: deposit.id, date: deposit.date, challan: deposit.challan, amount: round2(deposit.amount), covers: amount / 100 });
  }
  challans.sort((a, b) => a.date.localeCompare(b.date));
  const deducted = round2(deductedInQuarter.reduce((sum, entry) => sum + entry.tds, 0));
  const deposited = round2(challans.reduce((sum, row) => sum + row.covers, 0));
  const row = dueRow(state, quarter);
  const filed = filingFor(state, 'TDS_QUARTERLY', quarter.label);
  const { form, ruleUsed } = formFor(quarter);
  const unreviewed = inQuarter.some((entry) => entry.unreviewed);
  const basis = { quarter: quarter.label, deductees: deductees.map((d) => [d.pan || d.payee, d.section, d.count, d.basis, d.tds]), challans: challans.map((c) => [c.id, c.covers]) };
  return {
    ok: true,
    data: {
      quarter: quarter.label,
      quarters: quarters.map((q) => q.label),
      months: quarter.months,
      form,
      formRuleUsed: ruleUsed,
      tan: state.company.tan || '',
      deductees,
      sections,
      challans,
      deducted,
      deposited,
      shortfall: round2(deducted - deposited),
      dueDate: row ? row.dueDate : '',
      filed: filed ? { arn: filed.arn, filedOn: filed.filedOn } : null,
      empty: deductedInQuarter.length === 0,
      unreviewed,
      draftHash: createHash('sha256').update(JSON.stringify(basis)).digest('hex'),
    },
  };
}
