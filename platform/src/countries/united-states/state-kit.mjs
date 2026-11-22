import { rules } from '../../sprint-load.mjs';
import { progressiveTax } from '../kit/index.mjs';

export const whole = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
export const positive = (value) => Math.max(0, whole(value));
export const dollarsOf = (cents) => Math.round(Number(cents || 0) / 100);
export const sum = (list, pick = (item) => item) => (list || []).reduce((total, item) => total + whole(pick(item)), 0);

export const RULE_PREFIX = 'us.state-return.';

export function stateRuleId(code, name) {
  return `${RULE_PREFIX}${String(code).toLowerCase()}.${name}`;
}

export function stateRuleReader(code, taxYear) {
  const used = new Map();
  const missing = [];
  const onDate = `${taxYear}-12-31`;
  const read = (name) => {
    const id = name.startsWith(RULE_PREFIX) ? name : stateRuleId(code, name);
    const found = rules.rule(id, onDate);
    if (!found.ok) {
      if (!missing.includes(id)) missing.push(id);
      return null;
    }
    used.set(id, found.record);
    return found.value;
  };
  const report = () => {
    const records = [...used.values()];
    return {
      rulesUsed: records.map((record) => `${record.id}@${record.effectiveFrom}`),
      unreviewed: records.some((record) => !(record.attestations || []).some((item) => item.verdict === 'verified')),
      provisional: records.some((record) => record.value && record.value.provisional === true),
      missingRules: [...missing],
    };
  };
  return { read, report, missing };
}

export function bracketTax(amount, bands) {
  const taxable = positive(amount);
  if (!taxable) return 0;
  const result = progressiveTax(taxable * 100, bands.map((band) => ({ over: band.overCents, rateBp: band.rateBp })));
  if (!result.ok) throw new Error(`BAD_STATE_BANDS:${result.error}`);
  return Math.round(result.tax / 100);
}

export function rateOf(amount, basisPoints) {
  return Math.round((positive(amount) * basisPoints) / 10000);
}

export function check(level, code, message, fix = '') {
  return { level, code, message, fix };
}

export function ratio(part, total, { places = 4, floor = 0, cap = 1 } = {}) {
  const top = whole(part);
  const bottom = whole(total);
  if (bottom <= 0) return top > 0 ? cap : floor;
  const raw = top / bottom;
  const scale = 10 ** places;
  return Math.min(cap, Math.max(floor, Math.round(raw * scale) / scale));
}

export function byStatus(table, filingStatus) {
  if (!table) return 0;
  if (Object.hasOwn(table, filingStatus)) return table[filingStatus];
  if (filingStatus === 'qss' && Object.hasOwn(table, 'mfj')) return table.mfj;
  return table.other ?? 0;
}

export function otherStateCreditLimit({ residentTax, residentIncome, doubleTaxedIncome, otherStateTax }) {
  const limit = whole(residentIncome) > 0 ? Math.round(positive(residentTax) * Math.min(1, positive(doubleTaxedIncome) / whole(residentIncome))) : 0;
  return Math.max(0, Math.min(positive(otherStateTax), limit));
}

export function lineTable(entries) {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [String(key), value]));
}

export function yesNo(value) {
  return value === true || value === 'yes' || value === 'true';
}

export const INCOME_KEYS = Object.freeze(['wages', 'taxableInterest', 'usObligationInterest', 'ordinaryDividends', 'qualifiedDividends', 'capitalGain', 'iraTaxable', 'pensionTaxable', 'socialSecurityTaxable', 'unemployment', 'stateRefundTaxable', 'businessIncome', 'otherIncome', 'adjustments']);

export function sourcedAgi(sourced) {
  return INCOME_KEYS.filter((key) => key !== 'adjustments' && key !== 'qualifiedDividends' && key !== 'usObligationInterest').reduce((total, key) => total + whole(sourced[key]), 0) - whole(sourced.adjustments);
}

export function form1098PropertyTax(ctx) {
  return (ctx.forms || []).filter((form) => form.kind === '1098').reduce((total, form) => total + whole(form.fields?.propertyTax), 0);
}

export function answered(answers, id) {
  return answers?.[id] !== undefined && answers?.[id] !== null && answers?.[id] !== '';
}
