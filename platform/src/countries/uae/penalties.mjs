import { fail, toFils, toDirhams, isIsoDate, addMonthsClamped, ruleOn, ruleNote, todayIso } from './common.mjs';

export const PENALTY_KINDS = Object.freeze(['vat-late-return', 'vat-late-payment', 'ct-late-return', 'ct-late-payment']);

function startedMonthsLate(due, done) {
  if (done <= due) return 0;
  let months = 0;
  let mark = due;
  while (mark < done) {
    months += 1;
    mark = addMonthsClamped(due, months);
  }
  return months;
}

function latePayment(taxFils, months, annualBasisPoints) {
  const numerator = BigInt(taxFils) * BigInt(annualBasisPoints) * BigInt(months);
  const denominator = 10000n * 12n;
  return Number((numerator + denominator / 2n) / denominator);
}

export function penaltyEstimate(args = {}) {
  const kind = String(args.kind || '');
  if (!PENALTY_KINDS.includes(kind)) return fail('UNKNOWN_PENALTY', { known: PENALTY_KINDS });
  const due = args.dueDate;
  const done = args.doneOn || todayIso();
  if (!isIsoDate(due) || !isIsoDate(done)) return fail('BAD_DATE', { hint: 'Give dueDate and doneOn (the day it was or will be filed or paid) as YYYY-MM-DD.' });
  const ruleId = kind.startsWith('vat') ? 'ae.vat.penalties' : 'ae.ct.penalties';
  const rule = ruleOn(ruleId, done);
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId, date: done, hint: 'These penalty amounts apply from 14 April 2026; earlier penalties follow the old schedule.' });
  const months = startedMonthsLate(due, done);
  const base = { kind, dueDate: due, doneOn: done, monthsLate: months, ...ruleNote(rule) };
  if (months === 0) return { ok: true, data: { ...base, penalty: 0, why: 'Not late, so no penalty.' } };
  if (kind === 'vat-late-return') {
    const fils = args.repeatWithin24Months === true ? rule.value.lateReturnRepeatFils : rule.value.lateReturnFirstFils;
    return { ok: true, data: { ...base, penalty: toDirhams(fils), why: args.repeatWithin24Months === true ? 'A repeat late VAT return within 24 months is AED 2,000.' : 'A first late VAT return is AED 1,000.' } };
  }
  if (kind === 'ct-late-return') {
    const first = Math.min(months, 12);
    const later = Math.max(months - 12, 0);
    const fils = first * rule.value.lateReturnPerMonthFirstYearFils + later * rule.value.lateReturnPerMonthLaterFils;
    return { ok: true, data: { ...base, penalty: toDirhams(fils), why: `AED 500 for each of the first ${first} month${first === 1 ? '' : 's'}${later ? ` and AED 1,000 for each of the ${later} after` : ''}.` } };
  }
  const tax = toFils(args.taxUnpaid);
  if (tax === null || tax < 0) return fail('BAD_AMOUNT', { field: 'taxUnpaid', hint: 'Give the unpaid tax in AED.' });
  const fils = latePayment(tax, months, rule.value.latePaymentAnnualBasisPoints);
  return { ok: true, data: { ...base, taxUnpaid: toDirhams(tax), penalty: toDirhams(fils), why: `14% a year on the unpaid tax, charged monthly and not compounded, for ${months} month${months === 1 ? '' : 's'}.` } };
}
