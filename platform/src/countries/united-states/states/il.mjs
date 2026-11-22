import { whole, positive, rateOf, ratio, check, otherStateCreditLimit, lineTable, answered, form1098PropertyTax } from '../state-kit.mjs';

const RETIREMENT_KEYS = ['iraTaxable', 'pensionTaxable', 'socialSecurityTaxable'];

function exemptionAllowance(ctx, rule, baseIncome) {
  const limit = ctx.filingStatus === 'mfj' ? rule.exemptionAgiLimit.joint : rule.exemptionAgiLimit.other;
  if (ctx.income.agi > limit) return { a: 0, b: 0, c: 0, d: 0, total: 0, overLimit: true };
  const per = rule.personalExemption;
  const claimed = ctx.filers.filter((item) => item.canBeClaimedAsDependent).length;
  const people = ctx.filers.length - (claimed && baseIncome > per * claimed ? claimed : 0);
  const a = per * people;
  const b = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length * rule.seniorOrBlindExtra;
  const c = ctx.filers.filter((item) => item.blind).length * rule.seniorOrBlindExtra;
  const d = ctx.dependents.length * per;
  return { a, b, c, d, total: a + b + c + d, overLimit: false };
}

const LABELS = Object.freeze({
  1: 'Federal adjusted gross income',
  2: 'Federally tax-exempt interest and dividend income',
  3: 'Other additions',
  4: 'Total income',
  5: 'Social Security benefits and certain retirement plan income',
  6: 'Illinois Income Tax overpayment included in federal income',
  7: 'Other subtractions',
  8: 'Total subtractions',
  9: 'Illinois base income',
  '10a': 'Exemption amount for yourself and your spouse',
  '10b': 'Exemption for 65 or older',
  '10c': 'Exemption for legally blind',
  '10d': 'Exemption for dependents',
  10: 'Exemption allowance',
  13: 'Recapture of investment tax credits',
  14: 'Income tax',
  15: 'Income tax paid to another state while an Illinois resident',
  16: 'Property tax and K-12 education expense credit',
  17: 'Credit amount from Schedule 1299-C',
  18: 'Total credits',
  19: 'Tax after nonrefundable credits',
  20: 'Household employment tax',
  21: 'Use tax on internet, mail order or out-of-state purchases',
  22: 'Medical cannabis and gaming licensee surcharges',
  23: 'Total tax',
  24: 'Total tax from page 1',
  25: 'Illinois Income Tax withheld',
  26: 'Estimated payments',
  29: 'Earned Income Tax credit',
  30: 'Child Tax credit',
});

function labels(taxYear, residency) {
  const resident = residency === 'full-year';
  return { ...LABELS, 11: resident ? 'Net income' : 'Illinois net income from Schedule NR', 12: resident ? 'Tax on net income' : 'Tax from Schedule NR' };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Illinois figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const line1 = income.agi;
  const line2 = income.taxExemptInterest;
  const line3 = 0;
  const line4 = line1 + line2 + line3;
  const line5 = RETIREMENT_KEYS.reduce((total, key) => total + whole(income[key]), 0);
  const line6 = filing.residency === 'nonresident' ? 0 : income.stateRefundTaxable;
  const line7 = income.usObligationInterest;
  const line8 = line5 + line6 + line7;
  const line9 = line4 - line8;
  const exemption = exemptionAllowance(ctx, rule, line9);
  const line10 = exemption.total;
  const checks = [];
  if (exemption.overLimit) checks.push(check('info', 'IL_NO_EXEMPTION_ABOVE_LIMIT', 'Federal AGI is above the Illinois limit, so no exemption allowance is allowed.'));
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) checks.push(check('info', 'IL_DEPENDENT_FILER', 'Someone can claim you as a dependent, so your Illinois exemption is $0 when your base income is above the exemption amount (IL-1040 Line 10a chart).'));
  let line11;
  let line12;
  let scheduleNR = null;
  if (resident) {
    line11 = Math.max(0, line9 - line10);
    line12 = rateOf(line11, rule.rateBasisPoints);
  } else {
    const sourced = filing.sourced;
    const ilAdditions = filing.residency === 'part-year' ? Math.round(line2 * filing.share) : 0;
    const ilSubtractions = RETIREMENT_KEYS.reduce((total, key) => total + whole(sourced[key]), 0) + (filing.residency === 'part-year' ? line6 : 0) + whole(sourced.usObligationInterest);
    const line46 = Math.max(0, filing.sourcedAgi + ilAdditions - ilSubtractions);
    const line48 = ratio(line46, line9, { places: 4 });
    const line50 = Math.round(line10 * line48);
    const line51 = Math.max(0, line46 - line50);
    line11 = line51;
    line12 = rateOf(line51, rule.rateBasisPoints);
    scheduleNR = lineTable({ 46: line46, 47: line9, 48: line48, 49: line10, 50: line50, 51: line51, 52: line12 });
  }
  const line13 = 0;
  const line14 = Math.max(0, line12 + line13);
  let line15 = 0;
  if (filing.residency !== 'nonresident' && filing.otherStates.length) {
    line15 = filing.otherStates.reduce((total, other) => total + otherStateCreditLimit({ residentTax: line14, residentIncome: line9, doubleTaxedIncome: other.income, otherStateTax: other.tax }), 0);
    line15 = Math.min(line15, line14);
    checks.push(check('info', 'IL_SCHEDULE_CR', 'Credit for tax paid to another state is limited to the Illinois tax on the income taxed there (Schedule CR). Keep the other state\'s return.'));
  }
  const creditLimitAgi = ctx.filingStatus === 'mfj' ? credits.creditAgiLimit.joint : credits.creditAgiLimit.other;
  const creditsAllowed = income.agi <= creditLimitAgi && filing.residency !== 'nonresident';
  const fromForm1098 = !answered(answers, 'propertyTaxPaid') && resident ? form1098PropertyTax(ctx) : 0;
  const propertyTaxPaid = answered(answers, 'propertyTaxPaid') ? positive(answers.propertyTaxPaid) : fromForm1098;
  if (fromForm1098 && creditsAllowed) checks.push(check('warning', 'IL_PROPERTY_TAX_FROM_1098', `The Schedule ICR property tax credit uses the $${fromForm1098.toLocaleString('en-US')} of property tax on your Form 1098.`, 'Confirm it is tax on your Illinois main home, or give the amount paid on it.'));
  const propertyTax = creditsAllowed ? rateOf(propertyTaxPaid, credits.propertyTaxBasisPoints) : 0;
  const k12Paid = positive(answers.k12Expenses);
  const k12 = creditsAllowed ? Math.min(credits.k12Maximum, rateOf(Math.max(0, k12Paid - credits.k12Floor), credits.k12BasisPoints)) : 0;
  const line16 = propertyTax + k12;
  const line17 = 0;
  const line18 = Math.min(line14, line15 + line16 + line17);
  const line19 = line14 - line18;
  const line20 = 0;
  const line21 = positive(answers.useTax);
  const line22 = 0;
  const line23 = line19 + line20 + line21 + line22;
  const federalEic = whole(ctx.federal.lines['27']);
  const eitcShare = filing.residency === 'full-year' ? 1 : ratio(filing.sourcedAgi, line1, { places: 4 });
  const line29 = Math.round(rateOf(federalEic, credits.eitcBasisPoints) * eitcShare);
  const youngChild = ctx.dependents.some((item) => item.age !== null && item.age < credits.childTaxCreditUnderAge);
  const line30 = youngChild ? rateOf(line29, credits.childTaxCreditBasisPoints) : 0;
  if (!federalEic) checks.push(check('info', 'IL_EITC_WITHOUT_FEDERAL', 'Illinois also gives its earned income credit to some filers aged 18 to 24 or 65 and over who get no federal EIC; MyCA does not work that case out yet.'));
  if (!answers.useTax && answers.useTax !== 0) checks.push(check('warning', 'IL_USE_TAX', 'Illinois asks for use tax on online or out-of-state purchases with no Illinois sales tax; the line cannot be left blank.', 'Answer the use tax question (0 if none).'));
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, '10a': exemption.a, '10b': exemption.b, '10c': exemption.c, '10d': exemption.d, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line23, 25: filing.payments.withheld, 26: filing.payments.estimated + filing.payments.extension, 29: line29, 30: line30 });
  return {
    form: 'IL-1040',
    lines,
    schedules: { ...(scheduleNR ? { NR: scheduleNR } : {}), ...(line16 ? { ICR: lineTable({ propertyTaxPaid, propertyTaxCredit: propertyTax, k12Expenses: k12Paid, k12Credit: k12 }) } : {}), ...(line29 ? { 'IL-E/EITC': lineTable({ 1: exemption.d, federalEic, 9: line29, 12: line30 }) } : {}) },
    stateIncome: resident ? line9 : scheduleNR[46],
    taxableIncome: line11,
    taxBeforeCredits: line14,
    nonrefundableCredits: [...(line15 ? [{ code: 'IL_SCHEDULE_CR', label: 'Tax paid to another state', amount: line15 }] : []), ...(propertyTax ? [{ code: 'IL_PROPERTY_TAX', label: 'Property tax credit', amount: Math.min(propertyTax, line14 - Math.min(line14, line15)) }] : []), ...(k12 ? [{ code: 'IL_K12', label: 'K-12 education expense credit', amount: k12 }] : [])],
    otherStateCredit: line15,
    otherTaxes: line21 ? [{ code: 'IL_USE_TAX', label: 'Use tax', amount: line21 }] : [],
    totalTax: line23,
    refundableCredits: [...(line29 ? [{ code: 'IL_EITC', label: 'Illinois earned income credit', amount: line29 }] : []), ...(line30 ? [{ code: 'IL_CTC', label: 'Illinois child tax credit', amount: line30 }] : [])],
    checks,
  };
}

export const STATE = Object.freeze({
  code: 'IL',
  name: 'Illinois',
  built: true,
  forms: Object.freeze({ resident: 'IL-1040', partYear: 'IL-1040 with Schedule NR', nonresident: 'IL-1040 with Schedule NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'propertyTaxPaid', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Property tax you paid in the year on your Illinois home (your main residence)', help: 'Gives a credit of 5% of the tax paid on Schedule ICR. Leave empty if you rent.' }),
    Object.freeze({ id: 'k12Expenses', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Tuition, book fees and lab fees paid for a child in an Illinois K-12 school', help: 'Gives a credit of 25% of the amount above $250, up to $750, on Schedule ICR.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Illinois use tax owed on online or out-of-state purchases', help: 'Purchases with no Illinois sales tax; use the UT Table in the instructions if you are unsure. Enter 0 if none.' }),
  ]),
  labels,
  notCovered: Object.freeze(['Schedule M additions and subtractions other than federally tax-exempt interest and U.S. Treasury interest', 'The Illinois EITC for filers with no federal EIC', 'Schedule 1299-C business credits and the volunteer emergency worker credit', 'Household employment tax and the cannabis and gaming surcharges', 'Underpayment penalty (Form IL-2210)']),
  compute,
});
