import { rule } from '../../statutory-rules/src/index.mjs';
import { daysUntil, escalationLevel, fyOf } from './calendar.mjs';
import { dueDateFor } from './due-dates.mjs';

const PAISE = 100;
const QUARTER_OF_END_MONTH = { 6: 1, 9: 2, 12: 3, 3: 4 };
const QRMP_3B_EARLIEST_DAY_STATE = '27';

function truthy(v) {
  return v === true || ['true', 'yes', '1', 'y'].includes(String(v ?? '').trim().toLowerCase());
}

function percent(v) {
  const n = Number(String(v ?? '').replace('%', '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthEndOf(year, month) {
  return `${year}-${pad2(month)}-${pad2(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

function shiftYm(ym, months) {
  const [y, m] = ym.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

function fyStartOfYearEnd(periodEnd) {
  return `${Number(periodEnd.slice(0, 4)) - 1}-04-01`;
}

function stateOf(raw) {
  const explicit = String(raw.state ?? '').trim();
  if (/^\d{2}$/.test(explicit)) return explicit;
  const gstin = String(raw.gstin ?? '').trim();
  return /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : '';
}

export function auditRequired(profile, fyStart) {
  if (profile.entity === 'company') return { required: true, basis: 'company' };
  const found = rule('audit-threshold.tax-audit', fyStart);
  if (!found.ok) return { required: null, basis: found.error };
  const turnoverPaise = profile.turnover * PAISE;
  const limits = found.value;
  if (profile.profession) return { required: turnoverPaise > limits.profession.auditAbovePaise, basis: 'profession' };
  const lowCash = limits.business.lowCash;
  const cashKnown = profile.cashReceiptsPercent !== null && profile.cashPaymentsPercent !== null;
  const qualifiesLowCash = cashKnown
    && profile.cashReceiptsPercent <= lowCash.cashReceiptsMaxPercent
    && profile.cashPaymentsPercent <= lowCash.cashPaymentsMaxPercent;
  const limit = qualifiesLowCash ? lowCash.auditAbovePaise : limits.business.auditAbovePaise;
  return { required: turnoverPaise > limit, basis: qualifiesLowCash ? 'business-low-cash' : 'business' };
}

function gstr9Required(profile, fyStart) {
  if (!profile.hasGst) return false;
  const found = rule('gst.gstr9.exemption-threshold', fyStart);
  if (!found.ok) return true;
  return profile.turnover * PAISE > found.value;
}

export function profileOf(raw) {
  const turnover = Number(raw.turnover) || 0;
  const entity = String(raw.entity || '').trim().toLowerCase();
  const hasGst = truthy(raw.gst);
  const gstQuarterly = hasGst && truthy(raw.qrmp);
  const profile = {
    clientId: String(raw.clientId).trim(),
    name: String(raw.name || '').trim(),
    tier: String(raw.tier || '').trim(),
    entity,
    turnover,
    state: stateOf(raw),
    profession: truthy(raw.profession),
    cashReceiptsPercent: percent(raw.cashReceiptsPercent),
    cashPaymentsPercent: percent(raw.cashPaymentsPercent),
    hasGst,
    gstMonthly: hasGst && !gstQuarterly,
    gstQuarterly,
    gstTdsDeductor: truthy(raw.gstTds),
    tdsDeductor: truthy(raw.tdsDeductor),
    pf: truthy(raw.pf),
    esi: truthy(raw.esi),
    advanceTax: truthy(raw.advanceTax),
    presumptive: truthy(raw.presumptive),
    tp: truthy(raw.tp),
  };
  profile.audit = auditRequired(profile, '2026-04-01').required === true;
  return profile;
}

function itrCategory(profile, fyStart) {
  if (profile.tp) return { rule: 'due-date.income-tax.return.transfer-pricing', label: 'ITR (TP)' };
  const audit = auditRequired(profile, fyStart);
  if (audit.required) return { rule: 'due-date.income-tax.return.audit', label: 'ITR (audit)' };
  if (profile.turnover > 0) return { rule: 'due-date.income-tax.return.non-audit-business', label: 'ITR (no audit, business/profession)' };
  return { rule: 'due-date.income-tax.return.other', label: 'ITR (other)' };
}

function monthlySpecs(profile) {
  const specs = [];
  if (profile.gstMonthly) {
    specs.push({ returnType: 'GSTR-1', label: 'GSTR-1 (monthly)', rule: 'due-date.gst.gstr-1.monthly' });
    specs.push({ returnType: 'GSTR-3B', label: 'GSTR-3B (monthly)', rule: 'due-date.gst.gstr-3b.monthly' });
  }
  if (profile.gstQuarterly) specs.push({ returnType: 'PMT-06', label: 'PMT-06 (QRMP monthly tax)', rule: 'due-date.gst.pmt-06' });
  if (profile.gstTdsDeductor) specs.push({ returnType: 'GSTR-7', label: 'GSTR-7', rule: 'due-date.gst.gstr-7' });
  if (profile.tdsDeductor) specs.push({ returnType: 'TDS_DEPOSIT', label: 'TDS deposit', rule: 'due-date.tds.deposit' });
  if (profile.pf) specs.push({ returnType: 'PF', label: 'PF', rule: 'due-date.pf.contribution' });
  if (profile.esi) specs.push({ returnType: 'ESI', label: 'ESI', rule: 'due-date.esi.contribution' });
  return specs;
}

function quarterlySpecs(profile) {
  const specs = [];
  if (profile.gstQuarterly) {
    specs.push({ returnType: 'GSTR-1', label: 'GSTR-1 QRMP', rule: 'due-date.gst.gstr-1.quarterly' });
    specs.push({ returnType: 'GSTR-3B', label: 'GSTR-3B QRMP', rule: 'due-date.gst.gstr-3b.quarterly', byState: true });
  }
  if (profile.tdsDeductor) specs.push({ returnType: 'TDS_QUARTERLY', label: 'TDS statement', rule: 'due-date.tds.statement' });
  return specs;
}

function row(profile, spec, period, due, extra = {}) {
  return { clientId: profile.clientId, returnType: spec.returnType, returnLabel: spec.label, period, dueDate: due, ...extra };
}

function resolve(spec, periodEnd, profile) {
  if (!spec.byState) return { ...dueDateFor({ rule: spec.rule, periodEnd }), stateAssumed: false };
  if (profile.state) return { ...dueDateFor({ rule: spec.rule, periodEnd, stateCode: profile.state }), stateAssumed: false };
  return { ...dueDateFor({ rule: spec.rule, periodEnd, stateCode: QRMP_3B_EARLIEST_DAY_STATE }), stateAssumed: true };
}

export function listDeadlines({ clients, months }) {
  const profiles = (Array.isArray(clients) ? clients : []).map(profileOf);
  const window = new Set((Array.isArray(months) ? months : []).map(String));
  if (!window.size) return [];
  const sorted = [...window].sort();
  const earliest = shiftYm(sorted[0], -24);
  const periodEnds = [];
  const latest = shiftYm(sorted.at(-1), 12);
  for (let ym = earliest; ym <= latest; ym = shiftYm(ym, 1)) {
    const [y, m] = ym.split('-').map(Number);
    periodEnds.push({ ym, month: m, end: monthEndOf(y, m) });
  }
  const inWindow = (date) => window.has(date.slice(0, 7));
  const out = [];

  for (const profile of profiles) {
    for (const { ym, month, end } of periodEnds) {
      for (const spec of monthlySpecs(profile)) {
        const due = resolve(spec, end, profile);
        if (due.dueDate && inWindow(due.dueDate)) out.push(row(profile, spec, ym, due.dueDate));
      }
      if (QUARTER_OF_END_MONTH[month]) {
        const period = `Q${QUARTER_OF_END_MONTH[month]} ${fyOf(ym)}`;
        for (const spec of quarterlySpecs(profile)) {
          const due = resolve(spec, end, profile);
          if (due.dueDate && inWindow(due.dueDate)) out.push(row(profile, spec, period, due.dueDate, due.stateAssumed ? { stateAssumed: true } : {}));
        }
      }
      if (month !== 3) continue;
      const fyStart = fyStartOfYearEnd(end);
      const fy = `FY ${fyOf(ym)}`;
      const itr = itrCategory(profile, fyStart);
      const itrDue = dueDateFor({ rule: itr.rule, periodEnd: end });
      if (itrDue.dueDate && inWindow(itrDue.dueDate)) out.push(row(profile, { returnType: 'ITR', label: itr.label }, fy, itrDue.dueDate));
      if (gstr9Required(profile, fyStart)) {
        const gstr9 = dueDateFor({ rule: 'due-date.gst.gstr-9', periodEnd: end });
        if (gstr9.dueDate && inWindow(gstr9.dueDate)) out.push(row(profile, { returnType: 'GSTR-9', label: 'GSTR-9' }, fy, gstr9.dueDate));
      }
      if (profile.advanceTax) {
        const advanceRule = profile.presumptive ? 'due-date.income-tax.advance-tax.presumptive' : 'due-date.income-tax.advance-tax';
        for (let n = 1; n <= 4; n++) {
          const due = dueDateFor({ rule: advanceRule, periodEnd: end, instalment: n });
          if (due.error) break;
          if (inWindow(due.dueDate)) out.push(row(profile, { returnType: 'ADVANCE_TAX', label: `Advance tax (instalment ${n})` }, `${fy} #${n}`, due.dueDate));
        }
      }
    }
  }

  return out.sort((a, b) => (a.dueDate === b.dueDate
    ? (a.clientId === b.clientId ? a.returnType.localeCompare(b.returnType) : a.clientId.localeCompare(b.clientId))
    : a.dueDate.localeCompare(b.dueDate)));
}

export function returnsFor(profile) {
  const seen = new Map();
  for (const spec of [...monthlySpecs(profile), ...quarterlySpecs(profile)]) seen.set(`${spec.returnType}|${spec.label}`, { code: spec.returnType, label: spec.label });
  seen.set('ITR', { code: 'ITR', label: itrCategory(profile, '2026-04-01').label });
  if (gstr9Required(profile, '2026-04-01')) seen.set('GSTR-9', { code: 'GSTR-9', label: 'GSTR-9' });
  if (profile.advanceTax) seen.set('ADVANCE_TAX', { code: 'ADVANCE_TAX', label: 'Advance tax' });
  return [...seen.values()];
}

export function monthsAround(asOfDate, before = 1, after = 4) {
  const ym = String(asOfDate).slice(0, 7);
  return Array.from({ length: before + after + 1 }, (_, i) => shiftYm(ym, i - before));
}

export function deadlineStatus({ deadlines, asOfDate }) {
  return deadlines.map((d) => {
    const dU = daysUntil(d.dueDate, asOfDate);
    return { ...d, daysUntil: dU, level: escalationLevel(dU) };
  });
}
