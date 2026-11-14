import { parseTaxYear, gbRule, ruleSet, toPence, toPounds, share, wholePoundsPence, addMonthsDays, daysBetween, isIsoDate } from './rules.mjs';

export const SE_INCOME_FIELDS = Object.freeze(['turnover', 'other', 'taxTakenOffTradingIncome']);
export const SE_EXPENSE_FIELDS = Object.freeze([
  'costOfGoods', 'paymentsToSubcontractors', 'wagesAndStaffCosts', 'carVanTravelExpenses', 'premisesRunningCosts',
  'maintenanceCosts', 'adminCosts', 'businessEntertainmentCosts', 'advertisingCosts', 'interestOnBankOtherLoans',
  'financeCharges', 'irrecoverableDebts', 'professionalFees', 'depreciation', 'otherExpenses',
]);
export const PROPERTY_INCOME_FIELDS = Object.freeze(['premiumsOfLeaseGrant', 'reversePremiums', 'periodAmount', 'taxDeducted', 'otherIncome']);
export const PROPERTY_EXPENSE_FIELDS = Object.freeze(['premisesRunningCosts', 'repairsAndMaintenance', 'financialCosts', 'professionalFees', 'costOfServices', 'other', 'residentialFinancialCost', 'travelCosts']);
export const BUSINESS_KINDS = Object.freeze(['self-employment', 'uk-property']);

const HEAD_TO_SE = Object.freeze({
  sales: 'turnover', revenue: 'turnover', 'other-income': 'other', stock: 'costOfGoods', purchases: 'costOfGoods', materials: 'costOfGoods',
  subcontractors: 'paymentsToSubcontractors', wages: 'wagesAndStaffCosts', salaries: 'wagesAndStaffCosts', travel: 'carVanTravelExpenses', fuel: 'carVanTravelExpenses', vehicle: 'carVanTravelExpenses',
  rent: 'premisesRunningCosts', utilities: 'premisesRunningCosts', 'rates': 'premisesRunningCosts', repairs: 'maintenanceCosts', phone: 'adminCosts', internet: 'adminCosts', stationery: 'adminCosts', software: 'adminCosts', postage: 'adminCosts',
  entertainment: 'businessEntertainmentCosts', advertising: 'advertisingCosts', marketing: 'advertisingCosts', 'loan-interest': 'interestOnBankOtherLoans', 'bank-charges': 'financeCharges', 'bad-debts': 'irrecoverableDebts',
  accountancy: 'professionalFees', legal: 'professionalFees', insurance: 'otherExpenses', depreciation: 'depreciation', training: 'otherExpenses', subscriptions: 'otherExpenses',
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function at(quarterIndex, monthDay, startYear) {
  const month = Number(monthDay.slice(0, 2));
  const inStartYear = quarterIndex < 2 || (quarterIndex === 2 && month >= 10);
  return `${inStartYear ? startYear : startYear + 1}-${monthDay}`;
}

export function quarterlyPeriods(taxYear, { calendar = false } = {}) {
  const year = parseTaxYear(taxYear);
  if (!year) return fail('BAD_TAX_YEAR', { hint: 'Give the tax year as 2026-27.' });
  const rule = gbRule('gb.mtd-it.periods', year.to);
  if (!rule) return fail('RULES_MISSING', { missing: ['gb.mtd-it.periods'] });
  const table = calendar ? rule.value.calendar : rule.value.standard;
  const startsOn = calendar ? `${year.start}-04-01` : year.from;
  const periods = table.map(([from, to, due], index) => ({
    quarter: index + 1,
    from: index === 0 ? startsOn : at(index, from, year.start),
    to: at(index, to, year.start),
    cumulativeFrom: startsOn,
    dueBy: at(index, due, year.start),
  }));
  return { ok: true, data: { taxYear: year.label, calendarQuarters: calendar, periods, finalDeclarationBy: `${year.start + 2}-${rule.value.finalDeclarationBy}`, cumulative: rule.value.cumulative, ruleId: rule.id } };
}

export function mtdItMandate(args = {}) {
  const qualifying = wholePoundsPence(args.selfEmploymentTurnover) + wholePoundsPence(args.propertyIncome);
  const rule = gbRule('gb.mtd-it.mandate', '2026-04-06');
  if (!rule) return fail('RULES_MISSING', { missing: ['gb.mtd-it.mandate'] });
  const year = String(args.returnYear || '');
  const phase = rule.value.phases.find((entry) => entry.readFromYear === year);
  const phases = rule.value.phases.map((entry) => ({ from: entry.from, threshold: toPounds(entry.qualifyingIncomeAbovePence), basedOnYear: entry.readFromYear, inScope: qualifying > entry.qualifyingIncomeAbovePence }));
  const first = phases.find((entry) => entry.inScope && (!phase || entry.basedOnYear === year));
  return {
    ok: true,
    data: {
      qualifyingIncome: toPounds(qualifying),
      mustJoinFrom: first ? first.from : null,
      phases,
      why: first ? `Qualifying income (self-employment turnover plus property income, before expenses) of ${toPounds(qualifying).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })} is over the £${first.threshold.toLocaleString('en-GB')} threshold, so Making Tax Digital for Income Tax applies from ${first.from}.` : 'Qualifying income is under every announced threshold; joining voluntarily is allowed.',
      exemptions: ['digitally excluded (age, disability, location or religion)', 'no National Insurance number by 31 January before the tax year', 'some trustees, non-resident companies and people with Lloyd\'s underwriting income'],
      ruleId: rule.id,
      unreviewed: !(rule.attestations || []).length,
    },
  };
}

export function categoriseForSelfEmployment(transactions = []) {
  const income = Object.fromEntries(SE_INCOME_FIELDS.map((field) => [field, 0]));
  const expenses = Object.fromEntries(SE_EXPENSE_FIELDS.map((field) => [field, 0]));
  const disallowable = Object.fromEntries(SE_EXPENSE_FIELDS.map((field) => [field, 0]));
  const unmapped = [];
  for (const [index, item] of (Array.isArray(transactions) ? transactions : []).entries()) {
    const head = String(item?.category || item?.head || '').toLowerCase();
    const field = SE_INCOME_FIELDS.includes(item?.field) || SE_EXPENSE_FIELDS.includes(item?.field) ? item.field : HEAD_TO_SE[head];
    const amount = toPence(item?.amount);
    if (!field) { unmapped.push({ index, category: head }); continue; }
    if (SE_INCOME_FIELDS.includes(field)) income[field] += amount;
    else if (item?.disallowable) { expenses[field] += amount; disallowable[field] += amount; }
    else expenses[field] += amount;
  }
  return { income, expenses, disallowable, unmapped };
}

function pounds(map) {
  return Object.fromEntries(Object.entries(map).filter(([, value]) => value !== 0).map(([key, value]) => [key, toPounds(value)]));
}

export function selfEmploymentCumulative(args = {}) {
  const year = parseTaxYear(args.taxYear);
  if (!year) return fail('BAD_TAX_YEAR', { hint: 'Give the tax year as 2026-27.' });
  if (!isIsoDate(args.periodStartDate) || !isIsoDate(args.periodEndDate) || args.periodEndDate < args.periodStartDate) return fail('BAD_PERIOD', { hint: 'Give periodStartDate and periodEndDate as YYYY-MM-DD; a cumulative update runs from the first day of the tax year.' });
  if (args.periodStartDate < year.from && args.periodStartDate !== `${year.start}-04-01`) return fail('PERIOD_OUTSIDE_TAX_YEAR', { taxYear: year.label });
  if (args.periodEndDate > year.to) return fail('PERIOD_OUTSIDE_TAX_YEAR', { taxYear: year.label });
  const sorted = categoriseForSelfEmployment(args.transactions);
  const vatRule = gbRule('gb.vat.registration', args.periodEndDate);
  const turnover = sorted.income.turnover;
  const consolidate = args.consolidatedExpenses === true || (args.consolidatedExpenses !== false && vatRule && turnover * (12 / Math.max(1, monthsOf(args.periodStartDate, args.periodEndDate))) < vatRule.value.registerAbovePence && args.preferBreakdown !== true);
  const expenseTotal = Object.values(sorted.expenses).reduce((sum, value) => sum + value, 0);
  const disallowableTotal = Object.values(sorted.disallowable).reduce((sum, value) => sum + value, 0);
  const body = {
    periodDates: { periodStartDate: args.periodStartDate, periodEndDate: args.periodEndDate },
    periodIncome: pounds(sorted.income),
  };
  if (consolidate) body.periodExpenses = { consolidatedExpenses: toPounds(expenseTotal - disallowableTotal) };
  else {
    body.periodExpenses = pounds(sorted.expenses);
    const dis = pounds(sorted.disallowable);
    if (Object.keys(dis).length) body.periodDisallowableExpenses = Object.fromEntries(Object.entries(dis).map(([key, value]) => [`${key}Disallowable`, value]));
  }
  const problems = [];
  if (consolidate && vatRule && turnover * (12 / Math.max(1, monthsOf(args.periodStartDate, args.periodEndDate))) >= vatRule.value.registerAbovePence) problems.push({ field: 'periodExpenses', why: 'Consolidated expenses are only allowed while turnover is under the VAT registration threshold.' });
  if (sorted.unmapped.length) problems.push({ field: 'transactions', why: `${sorted.unmapped.length} transactions have a category MyCA cannot map to an HMRC box; pick a box for each.`, unmapped: sorted.unmapped.slice(0, 20) });
  return {
    ok: true,
    data: {
      taxYear: year.label,
      body,
      consolidated: Boolean(consolidate),
      totals: { income: toPounds(Object.values(sorted.income).reduce((sum, value) => sum + value, 0) - sorted.income.taxTakenOffTradingIncome), expenses: toPounds(expenseTotal), disallowable: toPounds(disallowableTotal), profit: toPounds(sorted.income.turnover + sorted.income.other - (expenseTotal - disallowableTotal)) },
      problems,
      ready: problems.length === 0,
    },
  };
}

function monthsOf(from, to) {
  return Math.max(1, Math.round(daysBetween(from, to) / 30.4));
}

export function ukPropertyCumulative(args = {}) {
  const year = parseTaxYear(args.taxYear);
  if (!year) return fail('BAD_TAX_YEAR', { hint: 'Give the tax year as 2026-27.' });
  if (!isIsoDate(args.fromDate) || !isIsoDate(args.toDate) || args.toDate < args.fromDate) return fail('BAD_PERIOD', { hint: 'Give fromDate and toDate as YYYY-MM-DD.' });
  const income = {};
  const expenses = {};
  const given = args.income && typeof args.income === 'object' ? args.income : {};
  const spent = args.expenses && typeof args.expenses === 'object' ? args.expenses : {};
  const unknown = [...Object.keys(given).filter((key) => !PROPERTY_INCOME_FIELDS.includes(key)), ...Object.keys(spent).filter((key) => !PROPERTY_EXPENSE_FIELDS.includes(key) && key !== 'consolidatedExpenses')];
  if (unknown.length) return fail('UNKNOWN_PROPERTY_FIELDS', { unknown, income: PROPERTY_INCOME_FIELDS, expenses: PROPERTY_EXPENSE_FIELDS });
  for (const key of PROPERTY_INCOME_FIELDS) if (given[key]) income[key] = toPounds(toPence(given[key]));
  for (const key of [...PROPERTY_EXPENSE_FIELDS, 'consolidatedExpenses']) if (spent[key]) expenses[key] = toPounds(toPence(spent[key]));
  if (expenses.consolidatedExpenses && Object.keys(expenses).some((key) => key !== 'consolidatedExpenses' && key !== 'residentialFinancialCost')) return fail('CONSOLIDATED_AND_ITEMISED', { hint: 'Send either consolidatedExpenses (with residentialFinancialCost if any) or the itemised expenses, not both.' });
  const body = { fromDate: args.fromDate, toDate: args.toDate, ukProperty: { income, expenses } };
  return { ok: true, data: { taxYear: year.label, body } };
}

export function penaltyPoints(args = {}) {
  const frequency = String(args.frequency || 'quarterly');
  const rule = gbRule('gb.penalty-points', '2026-04-06');
  if (!rule) return fail('RULES_MISSING', { missing: ['gb.penalty-points'] });
  const threshold = { quarterly: rule.value.quarterlyThreshold, monthly: rule.value.monthlyThreshold, annual: rule.value.annualThreshold }[frequency];
  if (!threshold) return fail('BAD_FREQUENCY', { frequencies: ['quarterly', 'monthly', 'annual'] });
  const today = isIsoDate(args.today) ? args.today : new Date().toISOString().slice(0, 10);
  const submissions = (Array.isArray(args.submissions) ? args.submissions : []).filter((entry) => isIsoDate(entry?.dueBy)).sort((a, b) => a.dueBy.localeCompare(b.dueBy));
  let points = 0;
  let penalties = 0;
  const events = [];
  const expiryMonths = rule.value.expiryMonths[frequency];
  const awarded = [];
  for (const entry of submissions) {
    const sent = isIsoDate(entry.submittedOn) ? entry.submittedOn : null;
    const late = sent ? sent > entry.dueBy : today > entry.dueBy;
    const itsaFirstYear = args.regime === 'itsa' && entry.dueBy >= '2026-04-06' && entry.dueBy <= '2027-05-07' && entry.kind !== 'final-declaration';
    if (!late || entry.easement === true || itsaFirstYear) continue;
    awarded.push({ dueBy: entry.dueBy, expires: addMonthsDays(entry.dueBy, expiryMonths, 0) });
  }
  for (const point of awarded) {
    points = Math.min(threshold, points + 1);
    if (points === threshold) { penalties += 1; events.push({ dueBy: point.dueBy, penalty: toPounds(rule.value.penaltyPence) }); }
  }
  const atThreshold = points >= threshold;
  return {
    ok: true,
    data: {
      frequency,
      threshold,
      points,
      penalties: events,
      totalPenalties: toPounds(penalties * rule.value.penaltyPence),
      why: atThreshold ? `At ${threshold} points every further late submission costs £200. Points reset after ${expiryMonths} months of on-time submissions with all returns for the previous 24 months sent.` : `${threshold - points} more late submissions before a £200 penalty.`,
      ruleId: rule.id,
      unreviewed: !(rule.attestations || []).length,
    },
  };
}

export function latePayment(args = {}) {
  const due = String(args.dueBy || '');
  if (!isIsoDate(due)) return fail('BAD_DUE_DATE');
  const paidOn = isIsoDate(args.paidOn) ? args.paidOn : new Date().toISOString().slice(0, 10);
  const { values, used, missing } = ruleSet({ late: 'gb.late-payment' }, due);
  if (missing.length) return fail('RULES_MISSING', { missing });
  const amount = toPence(args.amount);
  const days = Math.max(0, daysBetween(due, paidOn));
  const rule = values.late;
  let penalty = 0;
  const steps = [];
  for (const step of rule.penalties) {
    if (days > step.day) { const part = share(amount, step.basisPoints); penalty += part; steps.push({ afterDay: step.day, percent: step.basisPoints / 100, amount: toPounds(part) }); }
  }
  const dailyDays = Math.max(0, days - rule.dailyFromDay + 1);
  const daily = dailyDays > 0 ? Math.floor(amount * rule.yearlyBasisPoints / 10000 * dailyDays / 365) : 0;
  const baseRateBp = Number.isInteger(args.bankRateBasisPoints) ? args.bankRateBasisPoints : null;
  const interest = baseRateBp === null ? null : Math.floor(amount * (baseRateBp + rule.interestOverBaseBasisPoints) / 10000 * days / 365);
  return {
    ok: true,
    data: {
      daysLate: days,
      penalties: steps,
      dailyPenalty: toPounds(daily),
      totalPenalty: toPounds(penalty + daily),
      interest: interest === null ? null : toPounds(interest),
      interestRatePercent: baseRateBp === null ? null : (baseRateBp + rule.interestOverBaseBasisPoints) / 100,
      why: baseRateBp === null ? 'Late payment interest is the Bank of England base rate plus 4%; give the base rate to see it.' : '',
      note: 'The first penalty is lower if the tax is paid, or a payment plan agreed, by day 15; HMRC works the exact figure out.',
      rulesUsed: used,
    },
  };
}
