import { RULES, rule } from '../../statutory-rules/src/index.mjs';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXTENSION_PREFIX = 'due-date.extension.';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthEnd(isoDate) {
  const match = ISO_DATE.exec(String(isoDate || ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d !== daysInMonth(y, m)) return null;
  return { year: y, month: m };
}

function shiftMonths({ year, month }, months, day) {
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${pad2(m)}-${pad2(Math.min(day, daysInMonth(y, m)))}`;
}

export function quarterMonthIndex(month) {
  return ((month - 4 + 12) % 3) + 1;
}

function periodMatches(kind, month) {
  if (kind === 'quarter') return month % 3 === 0;
  if (kind === 'year') return month === 3;
  return true;
}

function extensionFor(ruleId, periodEnd, stateCode) {
  for (const record of RULES) {
    if (!record.id.startsWith(EXTENSION_PREFIX)) continue;
    const value = record.value || {};
    if (value.dueRule !== ruleId || value.periodEnd !== periodEnd) continue;
    const hit = (value.dueDates || []).find((d) => d.stateCodes == null || (stateCode && d.stateCodes.includes(stateCode)));
    if (hit) return hit.dueDate;
  }
  return null;
}

export function dueDateFor({ rule: ruleId, periodEnd, stateCode, instalment } = {}) {
  const end = monthEnd(periodEnd);
  if (!end) return { error: 'PERIOD_END_INVALID' };
  const found = rule(ruleId, periodEnd);
  if (!found.ok) return { error: found.error };
  const value = found.value || {};
  if (!periodMatches(value.period, end.month)) return { error: 'PERIOD_END_INVALID' };
  if (Array.isArray(value.onlyQuarterMonths) && !value.onlyQuarterMonths.includes(quarterMonthIndex(end.month))) {
    return { error: 'NOT_DUE_FOR_PERIOD' };
  }
  if (Array.isArray(value.instalments)) {
    const n = Number(instalment);
    if (!Number.isInteger(n) || n < 1 || n > value.instalments.length) return { error: 'INSTALMENT_INVALID' };
    const due = value.instalments[n - 1];
    const fyStartYear = end.year - 1;
    return { dueDate: `${due.month >= 4 ? fyStartYear : fyStartYear + 1}-${pad2(due.month)}-${pad2(due.day)}` };
  }
  let months = value.monthsAfterPeriodEnd;
  let day = value.day;
  const override = (value.overrides || []).find((o) => o.periodEndMonth === end.month);
  if (override) {
    months = override.monthsAfterPeriodEnd;
    day = override.day;
  }
  if (Array.isArray(value.dayByState)) {
    if (!stateCode) return { error: 'STATE_CODE_REQUIRED' };
    const group = value.dayByState.find((g) => g.states.some((s) => s.code === stateCode));
    if (!group) return { error: 'STATE_NOT_LISTED' };
    day = group.day;
  }
  if (!Number.isInteger(months) || !Number.isInteger(day)) return { error: 'RULE_SHAPE_INVALID' };
  return { dueDate: extensionFor(ruleId, periodEnd, stateCode) || shiftMonths(end, months, day) };
}
