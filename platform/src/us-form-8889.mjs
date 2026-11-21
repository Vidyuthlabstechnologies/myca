export const HSA_COVERAGES = Object.freeze(['none', 'self-only', 'family']);
const EXEMPT_CODES = new Set(['3', '4', '6']);

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};
const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);
const check = (level, code, message, fix = '') => ({ level, code, message, fix });

export function hsaMonthsOf(value) {
  if (value === undefined || value === null || value === '') return 12;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 12 ? number : 12;
}

export function hsaContributionLimit({ coverage, months = 12, eligibleDecember = false, age = null, married = false, limits }) {
  if (coverage !== 'self-only' && coverage !== 'family') return { line3: 0, line7: 0, fullYear: false, lastMonthRule: false };
  const family = coverage === 'family';
  const base = fromCents(family ? limits.familyCents : limits.selfOnlyCents);
  const catchUp = age !== null && age >= limits.catchUpAge ? fromCents(limits.catchUpCents) : 0;
  const catchUpOnLine7 = married && family;
  const lastMonthRule = months < 12 && Boolean(eligibleDecember);
  const fullYear = months >= 12 || lastMonthRule;
  const share = (amount) => (fullYear ? amount : Math.round((amount * months) / 12));
  return { line3: share(base + (catchUpOnLine7 ? 0 : catchUp)), line7: catchUpOnLine7 ? share(catchUp) : 0, fullYear, lastMonthRule };
}

export function computeForm8889(input = {}) {
  const { limits, taxes } = input;
  const checks = [];
  const coverage = HSA_COVERAGES.includes(input.coverage) ? input.coverage : 'none';
  const months = coverage === 'none' ? 0 : hsaMonthsOf(input.months);
  const age = Number.isFinite(input.age) ? input.age : null;
  const limit = hsaContributionLimit({ coverage, months, eligibleDecember: input.eligibleDecember, age, married: input.married, limits });

  const line2 = whole(input.ownContributions);
  const line3 = limit.line3;
  const line4 = 0;
  const line5 = Math.max(0, line3 - line4);
  const line6 = input.allocation === undefined || input.allocation === null ? line5 : Math.min(line5, whole(input.allocation));
  const line7 = limit.line7;
  const line8 = line6 + line7;
  const line9 = whole(input.employerContributions);
  const line10 = 0;
  const line11 = line9 + line10;
  const line12 = Math.max(0, line8 - line11);
  const line13 = Math.min(line2, line12);
  const excessOwn = line2 - line13;
  const excessEmployer = Math.max(0, line11 - line8);

  if (limit.lastMonthRule) checks.push(check('warning', 'HSA_TESTING_PERIOD', `The last-month rule gives the full-year limit because you were eligible on December 1. You must stay an eligible individual until December 31, ${Number(input.taxYear) + 1}; if not (other than by death or disability), the extra contribution is taxed then with a 10% additional tax (Form 8889 Part III).`, ''));

  const distributions = (input.distributions || []).map((item) => ({ gross: whole(item.gross), earnings: whole(item.earnings), code: String(item.code || '1').trim() }));
  const line14a = distributions.reduce((total, item) => total + item.gross, 0);
  const excessWithdrawn = distributions.filter((item) => item.code === '2').reduce((total, item) => total + item.gross, 0);
  const earningsOnExcess = distributions.filter((item) => item.code === '2').reduce((total, item) => total + item.earnings, 0);
  const rolledOver = Math.min(whole(input.rolledOver), Math.max(0, line14a - excessWithdrawn));
  const line14b = excessWithdrawn + rolledOver;
  const line14c = Math.max(0, line14a - line14b);
  const expensesGiven = input.qualifiedExpenses !== undefined && input.qualifiedExpenses !== null && input.qualifiedExpenses !== '';
  if (line14c > 0 && !expensesGiven) checks.push(check('error', 'HSA_QUALIFIED_EXPENSES_NEEDED', 'HSA distributions are tax-free only up to the qualified medical expenses they paid; until you answer, they are treated as fully used for medical expenses.', 'Answer the HSA medical expenses question in the interview.'));
  const line15 = expensesGiven ? Math.min(whole(input.qualifiedExpenses), line14c) : line14c;
  const line16 = Math.max(0, line14c - line15);
  const exceptionAge = taxes.exceptionAge;
  const byAge = age !== null && age >= exceptionAge;
  if (line16 > 0 && age === exceptionAge) checks.push(check('warning', 'HSA_TURNED_65_IN_YEAR', `You reached ${exceptionAge} this year: the 20% additional tax does not apply to distributions after your birthday, and MyCA treats all of this year's taxable HSA distributions as made after it.`, 'If a taxable distribution was paid before your birthday, have your CPA add the 20% tax on that part.'));
  const exemptByCode = distributions.filter((item) => EXEMPT_CODES.has(item.code)).reduce((total, item) => total + item.gross, 0);
  const subjectToTax = byAge || input.disabled ? 0 : Math.max(0, line16 - exemptByCode);
  const line17a = line16 > 0 && subjectToTax < line16;
  const line17b = ofBasis(subjectToTax, taxes.nonQualifiedDistributionBasisPoints);

  const line18 = whole(input.testingPeriodIncome);
  const line19 = 0;
  const line20 = line18 + line19;
  const line21 = ofBasis(line20, taxes.testingPeriodBasisPoints);

  return {
    lines: { 1: coverage, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, '14a': line14a, '14b': line14b, '14c': line14c, 15: line15, 16: line16, '17a': line17a, '17b': line17b, 18: line18, 19: line19, 20: line20, 21: line21 },
    months,
    lastMonthRule: limit.lastMonthRule,
    deduction: line13,
    income: line16 + line20,
    otherIncome: earningsOnExcess + excessEmployer,
    distributionTax: line17b,
    testingPeriodTax: line21,
    excessContributions: excessOwn,
    excessEmployerContributions: excessEmployer,
    checks,
  };
}
