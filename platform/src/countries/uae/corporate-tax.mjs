import { progressiveTax } from '../kit/index.mjs';
import { fail, toFils, toDirhams, isIsoDate, addDays, addMonthsClamped, monthsBetween, ruleOn, ruleNote, percentOf } from './common.mjs';

const CT_START = '2023-06-01';
const MAX_PERIOD_MONTHS = 18;

function amount(args, name, problems, { allowNegative = false } = {}) {
  const value = args[name];
  if (value === undefined || value === null || value === '') return 0;
  const fils = toFils(value);
  if (fils === null) {
    problems.push({ field: name, why: 'Not a number.' });
    return 0;
  }
  if (!allowNegative && fils < 0) {
    problems.push({ field: name, why: 'Cannot be negative.' });
    return 0;
  }
  return fils;
}

export function ctDueDate(periodEnd) {
  const rule = ruleOn('ae.ct.return', periodEnd);
  if (!rule) return null;
  return addMonthsClamped(periodEnd, rule.value.dueMonthsAfterPeriodEnd);
}

function bandTax(taxableFils, bands) {
  const out = progressiveTax(taxableFils, bands.map((band) => ({ over: band.fromFils, rateBp: band.basisPoints })));
  return out.ok ? out.tax : null;
}

function smallBusinessReliefTest(args, revenue, periodEnd, periodStart) {
  const rule = ruleOn('ae.ct.small-business-relief', periodEnd);
  if (!rule) return { eligible: false, reasons: ['Small Business Relief is not in force for this period.'], rule: null };
  const reasons = [];
  if (args.resident === false) reasons.push('Only a UAE resident person can elect Small Business Relief.');
  if (args.qualifyingFreeZonePerson === true) reasons.push('A Qualifying Free Zone Person cannot elect Small Business Relief.');
  if (revenue > rule.value.revenueCapFils) reasons.push(`Revenue of AED ${toDirhams(revenue).toLocaleString('en-AE')} is above the AED ${toDirhams(rule.value.revenueCapFils).toLocaleString('en-AE')} cap.`);
  if (args.revenueExceededInEarlierPeriod === true) reasons.push('Revenue passed AED 3 million in an earlier tax period, so the relief is no longer open.');
  if (periodEnd > rule.value.lastPeriodEnd) reasons.push(`The relief covers tax periods ending on or before ${rule.value.lastPeriodEnd}.`);
  if (periodStart < rule.value.firstPeriodStart) reasons.push(`The relief covers tax periods starting on or after ${rule.value.firstPeriodStart}.`);
  const group = toFils(args.mneGroupRevenue);
  if (group !== null && group >= rule.value.mneGroupRevenueFils) reasons.push('A member of a multinational group with consolidated revenue of AED 3.15 billion or more cannot elect the relief.');
  if (args.artificialSeparation === true) reasons.push('A business split artificially to stay under the cap cannot elect the relief.');
  return { eligible: reasons.length === 0, reasons, rule };
}

export function corporateTaxEstimate(args = {}) {
  const { periodStart, periodEnd } = args;
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) return fail('BAD_PERIOD', { hint: 'Give the tax period as periodStart and periodEnd dates (YYYY-MM-DD), usually the financial year.' });
  if (periodEnd < periodStart) return fail('BAD_PERIOD', { hint: 'The period ends before it starts.' });
  const months = monthsBetween(periodStart, addDays(periodEnd, 1));
  if (months > MAX_PERIOD_MONTHS) return fail('BAD_PERIOD', { hint: 'A tax period is twelve months; only a first or changed period may run to eighteen.' });
  if (periodStart < CT_START) return fail('NOT_IN_SCOPE', { hint: 'UAE Corporate Tax applies to tax periods starting on or after 1 June 2023.' });
  const rateRule = ruleOn('ae.ct.rate', periodEnd);
  const lossRule = ruleOn('ae.ct.losses', periodEnd);
  if (!rateRule || !lossRule) return fail('RULE_NOT_IN_FORCE', { ruleId: !rateRule ? 'ae.ct.rate' : 'ae.ct.losses', date: periodEnd });

  const problems = [];
  const revenue = amount(args, 'revenue', problems);
  const accountingProfit = amount(args, 'accountingProfit', problems, { allowNegative: true });
  const exemptIncome = amount(args, 'exemptIncome', problems);
  const nonDeductible = amount(args, 'nonDeductibleExpenses', problems);
  const otherAdjustments = amount(args, 'otherAdjustments', problems, { allowNegative: true });
  const lossesBroughtForward = amount(args, 'lossesBroughtForward', problems);
  const qualifyingIncome = amount(args, 'qualifyingIncome', problems);
  const nonQualifyingRevenue = amount(args, 'nonQualifyingRevenue', problems);
  const foreignTaxCredit = amount(args, 'foreignTaxCredit', problems);
  if (problems.length) return fail('BAD_AMOUNTS', { problems });

  const warnings = [];
  const due = ctDueDate(periodEnd);
  const adjusted = accountingProfit - exemptIncome + nonDeductible + otherAdjustments;
  const base = { periodStart, periodEnd, due, revenue: toDirhams(revenue), accountingProfit: toDirhams(accountingProfit), adjustedProfit: toDirhams(adjusted) };
  const sbr = smallBusinessReliefTest(args, revenue, periodEnd, periodStart);

  if (args.electSmallBusinessRelief === true) {
    if (sbr.eligible) {
      if (adjusted < 0) warnings.push('A loss made in a Small Business Relief period cannot be carried forward. Not electing keeps the loss for later years.');
      return {
        ok: true,
        data: {
          ...base, relief: 'small-business-relief', taxableIncome: 0, tax: 0, foreignTaxCreditUsed: 0, payable: 0,
          lossUsed: 0, lossCarriedForward: toDirhams(lossesBroughtForward), lossForfeited: toDirhams(adjusted < 0 ? -adjusted : 0),
          eligibleForSmallBusinessRelief: true, warnings: [...warnings, 'A Corporate Tax return is still filed on EmaraTax by the due date, with the relief elected.'],
          ...ruleNote(sbr.rule),
        },
      };
    }
    warnings.push(`Small Business Relief cannot be elected: ${sbr.reasons.join(' ')}`);
  } else if (sbr.eligible && adjusted > 0 && revenue > 0) {
    warnings.push('This business qualifies for Small Business Relief, which would make the tax AED 0. Elect it on the return if it suits (losses of relief years are not carried forward).');
  }

  let qualifying = args.qualifyingFreeZonePerson === true;
  if (qualifying) {
    const minimis = ruleOn('ae.ct.free-zone-de-minimis', periodEnd);
    if (minimis) {
      const cap = Math.min(percentOf(revenue, minimis.value.shareBasisPoints), minimis.value.amountFils);
      if (nonQualifyingRevenue > cap) {
        qualifying = false;
        warnings.push(`Non-qualifying revenue of AED ${toDirhams(nonQualifyingRevenue).toLocaleString('en-AE')} passes the de minimis limit of AED ${toDirhams(cap).toLocaleString('en-AE')} (5% of revenue or AED 5 million, whichever is lower). The business stops being a Qualifying Free Zone Person for this period and the next four, and all income is taxed at the normal rates.`);
      }
    }
    if (qualifying && qualifyingIncome > Math.max(adjusted, 0)) warnings.push('Qualifying income is larger than the adjusted profit; it was capped at the adjusted profit.');
  }

  let lossUsed = 0;
  let lossCarriedForward = lossesBroughtForward;
  let taxable = adjusted;
  if (taxable <= 0) {
    lossCarriedForward = lossesBroughtForward + (taxable < 0 ? -taxable : 0);
    taxable = 0;
  } else if (lossesBroughtForward > 0) {
    lossUsed = Math.min(lossesBroughtForward, percentOf(taxable, lossRule.value.offsetCapBasisPoints));
    taxable -= lossUsed;
    lossCarriedForward = lossesBroughtForward - lossUsed;
    if (lossCarriedForward > 0) warnings.push('Brought-forward losses offset at most 75% of taxable income; the rest is carried forward.');
  }

  let tax;
  let zeroRated = 0;
  let relief = 'none';
  if (qualifying) {
    zeroRated = Math.min(qualifyingIncome, taxable);
    const rest = taxable - zeroRated;
    tax = percentOf(rest, rateRule.value.nonQualifyingFreeZoneBasisPoints);
    relief = 'qualifying-free-zone-person';
    warnings.push('A Qualifying Free Zone Person pays 0% on qualifying income and 9% on the rest, without the AED 375,000 nil band. Keep the substance and audited accounts the regime requires.');
  } else {
    tax = bandTax(taxable, rateRule.value.bands);
    if (tax === null) return fail('BAD_BANDS', { ruleId: rateRule.id });
  }
  const creditUsed = Math.min(foreignTaxCredit, tax);
  if (foreignTaxCredit > tax) warnings.push('Foreign tax credit is capped at the UAE tax due; the excess cannot be carried forward or refunded.');
  const payable = tax - creditUsed;
  return {
    ok: true,
    data: {
      ...base, relief, taxableIncome: toDirhams(taxable), zeroRatedQualifyingIncome: toDirhams(zeroRated), tax: toDirhams(tax),
      foreignTaxCreditUsed: toDirhams(creditUsed), payable: toDirhams(payable), lossUsed: toDirhams(lossUsed), lossCarriedForward: toDirhams(lossCarriedForward),
      eligibleForSmallBusinessRelief: sbr.eligible, smallBusinessReliefReasons: sbr.reasons, nilBand: qualifying ? 0 : 375000,
      warnings, ...ruleNote(rateRule),
    },
  };
}
