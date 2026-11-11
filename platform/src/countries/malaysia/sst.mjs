import { rules } from '../../sprint-load.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])\/(\d{4})-(0[1-9]|1[0-2])$/;
const toSen = (ringgit) => Math.round(Number(ringgit || 0) * 100);
const toRinggit = (sen) => Math.round(sen) / 100;

export const SERVICE_CATEGORIES = Object.freeze([
  'general',
  'food-and-beverage',
  'telecommunication',
  'parking',
  'logistics',
  'construction',
  'rental-or-leasing',
  'financial',
  'insurance',
  'beauty-and-wellness',
  'healthcare',
  'healthcare-non-citizen',
  'education',
  'education-non-citizen',
  'credit-card',
]);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function ruleOn(id, date) {
  const found = rules.rule(id, date);
  return found.ok ? found.record : null;
}

export function serviceTaxRate(category, date) {
  const name = String(category || 'general');
  if (!SERVICE_CATEGORIES.includes(name)) return fail('UNKNOWN_SERVICE_CATEGORY', { category: name, known: SERVICE_CATEGORIES });
  if (!ISO_DATE.test(String(date || ''))) return fail('BAD_DATE', { date });
  const record = ruleOn('my.sst.service-tax', date);
  if (!record) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.sst.service-tax', date });
  const value = record.value;
  if (name === 'credit-card') return { ok: true, kind: 'flat', amountSen: value.creditCardChargeSen, record };
  if ((value.exemptForCitizens || []).includes(name)) return { ok: true, kind: 'exempt', basisPoints: 0, why: 'Exempt when supplied to Malaysian citizens.', record };
  const basisPoints = value.reducedCategories.includes(name) ? value.reducedBasisPoints : value.standardBasisPoints;
  return { ok: true, kind: 'rate', basisPoints, record };
}

export function salesTaxRate(basisPoints, date) {
  if (!ISO_DATE.test(String(date || ''))) return fail('BAD_DATE', { date });
  const record = ruleOn('my.sst.sales-tax', date);
  if (!record) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.sst.sales-tax', date });
  const wanted = basisPoints === undefined || basisPoints === null ? record.value.defaultBasisPoints : Number(basisPoints);
  if (wanted === 0) return { ok: true, kind: 'exempt', basisPoints: 0, record };
  if (!record.value.rateBasisPoints.includes(wanted)) return fail('SALES_TAX_RATE_NOT_IN_FORCE', { basisPoints: wanted, allowed: record.value.rateBasisPoints, date });
  return { ok: true, kind: 'rate', basisPoints: wanted, record };
}

function lastDayOf(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function taxablePeriodOf(date, { firstMonthOdd = true } = {}) {
  if (!ISO_DATE.test(String(date || ''))) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const odd = month % 2 === 1;
  const startMonth = odd === firstMonthOdd ? month : month - 1;
  const startYear = startMonth < 1 ? year - 1 : year;
  const start = startMonth < 1 ? 12 : startMonth;
  const endMonth = start === 12 ? 1 : start + 1;
  const endYear = start === 12 ? startYear + 1 : startYear;
  return describePeriod(startYear, start, endYear, endMonth);
}

function describePeriod(startYear, startMonth, endYear, endMonth) {
  const record = ruleOn('my.sst.taxable-period', iso(startYear, startMonth, 1));
  const dueMonthsAfter = record ? record.value.dueMonthsAfterPeriodEnd : 1;
  const dueMonthRaw = endMonth + dueMonthsAfter;
  const dueYear = endYear + Math.floor((dueMonthRaw - 1) / 12);
  const dueMonth = ((dueMonthRaw - 1) % 12) + 1;
  return {
    period: `${iso(startYear, startMonth, 1).slice(0, 7)}/${iso(endYear, endMonth, 1).slice(0, 7)}`,
    from: iso(startYear, startMonth, 1),
    to: iso(endYear, endMonth, lastDayOf(endYear, endMonth)),
    due: iso(dueYear, dueMonth, lastDayOf(dueYear, dueMonth)),
    form: record ? record.value.form : 'SST-02',
  };
}

export function parsePeriod(text) {
  const found = String(text || '').trim().match(PERIOD);
  if (!found) return null;
  const [startYear, startMonth, endYear, endMonth] = [Number(found[1]), Number(found[2]), Number(found[3]), Number(found[4])];
  const months = (endYear - startYear) * 12 + endMonth - startMonth + 1;
  if (months !== 2) return null;
  return describePeriod(startYear, startMonth, endYear, endMonth);
}

export function sstReturn(lines = [], periodText) {
  const period = parsePeriod(periodText);
  if (!period) return fail('BAD_PERIOD', { period: periodText, hint: 'A taxable period is two months written as 2026-01/2026-02.' });
  const groups = new Map();
  const problems = [];
  for (const [index, line] of lines.entries()) {
    const date = String(line.date || '');
    if (!ISO_DATE.test(date) || date < period.from || date > period.to) continue;
    const valueSen = toSen(line.value);
    if (line.kind === 'sales') {
      const rate = salesTaxRate(line.rateBasisPoints, date);
      if (!rate.ok) { problems.push({ index, ...rate }); continue; }
      add(groups, `sales:${rate.basisPoints}`, { part: 'sales tax', basisPoints: rate.basisPoints }, valueSen, Math.round(valueSen * rate.basisPoints / 10000));
    } else if (line.kind === 'service') {
      const rate = serviceTaxRate(line.category, date);
      if (!rate.ok) { problems.push({ index, ...rate }); continue; }
      if (rate.kind === 'flat') {
        const count = Math.max(0, Math.floor(Number(line.cards || 1)));
        add(groups, 'service:credit-card', { part: 'service tax', category: 'credit-card', flatSen: rate.amountSen }, 0, count * rate.amountSen);
      } else {
        add(groups, `service:${line.category || 'general'}:${rate.basisPoints}`, { part: 'service tax', category: line.category || 'general', basisPoints: rate.basisPoints }, valueSen, Math.round(valueSen * rate.basisPoints / 10000));
      }
    } else {
      problems.push({ index, ok: false, error: 'LINE_KIND_UNKNOWN', hint: 'Each line is kind "sales" or "service".' });
    }
  }
  const rows = [...groups.values()].map((row) => ({ ...row, value: toRinggit(row.valueSen), tax: toRinggit(row.taxSen) }));
  const salesTaxSen = rows.filter((row) => row.part === 'sales tax').reduce((sum, row) => sum + row.taxSen, 0);
  const serviceTaxSen = rows.filter((row) => row.part === 'service tax').reduce((sum, row) => sum + row.taxSen, 0);
  return {
    ok: problems.length === 0,
    ...(problems.length ? { error: 'LINES_NEED_FIXING', problems } : {}),
    data: {
      ...period,
      rows,
      salesTax: toRinggit(salesTaxSen),
      serviceTax: toRinggit(serviceTaxSen),
      totalTax: toRinggit(salesTaxSen + serviceTaxSen),
      filing: 'File SST-02 in MySST (mysst.customs.gov.my) and pay by the due date. Royal Malaysian Customs has no public filing API, so MyCA prepares the return and the business submits it.',
      unreviewed: true,
    },
  };
}

function add(groups, key, base, valueSen, taxSen) {
  const row = groups.get(key) || { ...base, valueSen: 0, taxSen: 0 };
  row.valueSen += valueSen;
  row.taxSen += taxSen;
  groups.set(key, row);
}

export function sstRegistrationCheck({ kind = 'service', category = 'general', last12Months, date }) {
  if (!ISO_DATE.test(String(date || ''))) return fail('BAD_DATE', { date });
  const valueSen = toSen(last12Months);
  if (kind === 'sales') {
    const record = ruleOn('my.sst.sales-tax.registration', date);
    if (!record) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.sst.sales-tax.registration', date });
    return registration(valueSen, record.value.thresholdSen, record);
  }
  const record = ruleOn('my.sst.service-tax.registration', date);
  if (!record) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.sst.service-tax.registration', date });
  const base = String(category).replace(/-non-citizen$/, '');
  const thresholdSen = record.value.byCategory[base] ?? record.value.defaultThresholdSen;
  return registration(valueSen, thresholdSen, record);
}

function registration(valueSen, thresholdSen, record) {
  const mustRegister = valueSen >= thresholdSen;
  return {
    ok: true,
    data: {
      mustRegister,
      threshold: toRinggit(thresholdSen),
      last12Months: toRinggit(valueSen),
      why: mustRegister ? 'Taxable value in the last twelve months has reached the registration threshold; register with Royal Malaysian Customs in MySST.' : 'Below the registration threshold; keep watching the twelve-month total.',
      source: record.source,
      unreviewed: !(record.attestations || []).length,
    },
  };
}

export function sstLatePenalty({ unpaidTax, dueDate, paidOn }) {
  if (!ISO_DATE.test(String(dueDate || '')) || !ISO_DATE.test(String(paidOn || ''))) return fail('BAD_DATE');
  const record = ruleOn('my.sst.late-payment', dueDate);
  if (!record) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.sst.late-payment', date: dueDate });
  const daysLate = Math.max(0, Math.round((Date.parse(paidOn) - Date.parse(dueDate)) / 86400000));
  const steps = Math.min(record.value.stepsBasisPoints.length, Math.ceil(daysLate / record.value.stepDays));
  const basisPoints = record.value.stepsBasisPoints.slice(0, steps).reduce((sum, value) => sum + value, 0);
  const taxSen = toSen(unpaidTax);
  return { ok: true, data: { daysLate, penaltyPercent: basisPoints / 100, penalty: toRinggit(Math.round(taxSen * basisPoints / 10000)), unreviewed: true } };
}
