import { fail, toFils, toDirhams, isIsoDate, addMonthsClamped, ruleOn, ruleNote, todayIso } from './common.mjs';

export const PENALTY_KINDS = Object.freeze(['vat-late-return', 'vat-late-payment', 'ct-late-return', 'ct-late-payment', 'einvoice-not-implemented', 'einvoice-not-issued', 'einvoice-credit-note-not-issued', 'einvoice-data-not-updated']);
const EINVOICE_KINDS = new Set(['einvoice-not-implemented', 'einvoice-not-issued', 'einvoice-credit-note-not-issued', 'einvoice-data-not-updated']);

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

function wholeCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 1000000 ? n : null;
}

function daysAfter(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function einvoicePenalty(kind, args) {
  if (args.voluntary === true) return { ok: true, data: { kind, penalty: 0, why: 'Voluntary e-invoicing before the mandatory date carries no penalty.' } };
  const on = args.doneOn || args.date || todayIso();
  if (!isIsoDate(on)) return fail('BAD_DATE', { hint: 'Give the date as YYYY-MM-DD.' });
  const rule = ruleOn('ae.einvoice.penalties', on);
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.einvoice.penalties', date: on, hint: 'The e-invoicing penalties of Cabinet Decision 173 of 2026 apply from 31 October 2026.' });
  const v = rule.value;
  const base = { kind, date: on, ...ruleNote(rule) };
  if (kind === 'einvoice-not-issued' || kind === 'einvoice-credit-note-not-issued') {
    const count = wholeCount(args.count);
    if (count === null) return fail('BAD_AMOUNT', { field: 'count', hint: 'Give the number of documents not issued in that calendar month.' });
    const each = kind === 'einvoice-not-issued' ? v.perMissingInvoiceFils : v.perMissingCreditNoteFils;
    const cap = kind === 'einvoice-not-issued' ? v.missingInvoiceMonthlyCapFils : v.missingCreditNoteMonthlyCapFils;
    const fils = Math.min(count * each, cap);
    return { ok: true, data: { ...base, count, penalty: toDirhams(fils), capped: count * each > cap, why: kind === 'einvoice-not-issued' ? 'AED 100 for each e-invoice not issued and sent, at most AED 5,000 in a calendar month.' : 'AED 100 for each e-credit note not issued and sent, at most AED 5,000 in a calendar month.' } };
  }
  const due = args.dueDate;
  if (!isIsoDate(due)) return fail('BAD_DATE', { hint: 'Give dueDate (the date it was due) and doneOn as YYYY-MM-DD.' });
  if (kind === 'einvoice-data-not-updated') {
    const days = Math.max(daysAfter(due, on), 0);
    if (days > 3660) return fail('BAD_DATE', { hint: 'The due date is more than ten years before the date given.' });
    if (days === 0) return { ok: true, data: { ...base, dueDate: due, daysLate: 0, penalty: 0, why: 'Not late, so no penalty.' } };
    const byMonth = new Map();
    for (let day = 1; day <= days; day += 1) {
      const month = new Date(Date.parse(`${due}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
    const fils = [...byMonth.values()].reduce((sum, count) => sum + Math.min(count * v.dataChangePerDayFils, v.dataChangeMonthlyCapFils), 0);
    return { ok: true, data: { ...base, dueDate: due, daysLate: days, penalty: toDirhams(fils), why: 'AED 250 for each day the Accredited Service Provider was not told of a change to the FTA-registered details, at most AED 5,000 in a month.' } };
  }
  const months = startedMonthsLate(due, on);
  if (months === 0) return { ok: true, data: { ...base, dueDate: due, monthsLate: 0, penalty: 0, why: 'Not late, so no penalty.' } };
  const fils = Math.min(v.notImplementedFirstFils + (months - 1) * v.notImplementedPerMonthFils, v.notImplementedCapFils);
  return { ok: true, data: { ...base, dueDate: due, monthsLate: months, penalty: toDirhams(fils), capped: v.notImplementedFirstFils + (months - 1) * v.notImplementedPerMonthFils > v.notImplementedCapFils, why: 'AED 5,000 for the first month and AED 5,000 for each further month or part month without e-invoicing or an appointed Accredited Service Provider, at most AED 50,000 in any 12 months.' } };
}

export function penaltyEstimate(args = {}) {
  const kind = String(args.kind || '');
  if (!PENALTY_KINDS.includes(kind)) return fail('UNKNOWN_PENALTY', { known: PENALTY_KINDS });
  if (EINVOICE_KINDS.has(kind)) return einvoicePenalty(kind, args);
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
