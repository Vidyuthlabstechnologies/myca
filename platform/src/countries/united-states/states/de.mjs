import { whole, positive, ratio, check, lineTable, sum, otherStateCreditLimit } from '../state-kit.mjs';

function unitsOn(cents, bands) {
  let units = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const over = bands[index].overCents;
    const next = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    if (cents > over) units += (Math.min(cents, next) - over) * bands[index].rateBp;
  }
  return units;
}

const unitsToDollars = (units) => Math.floor((units + 500000) / 1000000);

function deTax(amount, rule) {
  const taxable = whole(amount);
  if (taxable <= 0) return 0;
  if (taxable >= rule.tableBelow) return unitsToDollars(unitsOn(taxable * 100, rule.bands));
  if (taxable < rule.tableZeroBelow) return 0;
  const midpointCents = Math.floor(taxable / rule.tableRowWidth) * rule.tableRowWidth * 100 + rule.tableRowWidth * 50;
  return unitsToDollars(unitsOn(midpointCents, rule.bands));
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const taxableOf = (form) => positive(form.fields?.taxableAmount ?? form.fields?.grossDistribution);
const earlyDistribution = (form) => String(form.fields?.distributionCode || '').includes('1');

function pensionExclusion(ctx, answers, rule) {
  const joint = ctx.filers.length > 1;
  const income = ctx.income;
  const sharedInvestment = Math.max(0, income.capitalGain);
  const people = ctx.filers.map((person) => {
    const retirement = formsOf(ctx, '1099-R').filter((form) => ownerOf(form) === person.role && !earlyDistribution(form));
    const employerPension = sum(retirement.filter((form) => !form.fields?.iraSepSimple), taxableOf);
    const allRetirement = sum(retirement, taxableOf);
    const military = Math.min(employerPension, positive(person.role === 'spouse' ? answers.spouseMilitaryPension : answers.militaryPension));
    const interest = sum(formsOf(ctx, '1099-INT').filter((form) => ownerOf(form) === person.role), (form) => positive(form.fields?.interest));
    const dividends = sum(formsOf(ctx, '1099-DIV').filter((form) => ownerOf(form) === person.role), (form) => positive(form.fields?.ordinaryDividends));
    const gains = joint ? Math.round(sharedInvestment / 2) : sharedInvestment;
    const age = person.age ?? 0;
    let exclusion;
    if (age >= rule.pensionAge) exclusion = Math.min(rule.pension60, allRetirement + interest + dividends + gains);
    else exclusion = Math.max(Math.min(employerPension - military, rule.pensionUnder60), Math.min(military, rule.militaryUnder60));
    return { role: person.role, age, employerPension, retirement: allRetirement, military, investment: interest + dividends + gains, exclusion: Math.max(0, exclusion) };
  });
  return { people, total: people.reduce((total, item) => total + item.exclusion, 0) };
}

function seniorExclusion(ctx, rule, line10) {
  const earned = ctx.income.wages + Math.max(0, ctx.income.businessIncome);
  const old = (person) => person.age !== null && person.age >= rule.seniorExclusionAge;
  if (ctx.filingStatus === 'mfj') {
    const terms = rule.seniorExclusion.joint;
    return ctx.filers.length === 2 && ctx.filers.every(old) && earned < terms.earnedBelow && line10 <= terms.incomeUpTo ? terms.amount : 0;
  }
  const terms = rule.seniorExclusion.single;
  return ctx.filers.some(old) && earned < terms.earnedBelow && line10 <= terms.incomeUpTo ? terms.amount : 0;
}

function itemizedDeductions(ctx, terms) {
  const parts = ctx.itemized;
  const agi = ctx.income.agi;
  const scheduleA = parts.federalScheduleA;
  const medical = scheduleA ? whole(scheduleA['4']) : Math.max(0, parts.medicalPaid - Math.round((Math.max(0, agi) * terms.medicalFloorBp) / 10000));
  const taxes = parts.generalSalesTax + parts.realEstateTaxes + parts.personalPropertyTaxes;
  const mortgage = parts.mortgageInterest;
  const charity = scheduleA ? whole(scheduleA['14']) : parts.charityCash + parts.charityNonCash;
  const other = parts.otherItemized;
  return { medical, taxes, mortgage, charity, other, total: medical + taxes + mortgage + charity + other };
}

function saltLimit(ctx, taxes, terms) {
  const status = ctx.filingStatus;
  const cap = status === 'mfs' ? terms.taxCap.mfs : terms.taxCap.other;
  const threshold = status === 'mfs' ? terms.fullCapAgiUpTo.mfs : terms.fullCapAgiUpTo.other;
  const scheduleA = ctx.itemized.federalScheduleA;
  if (ctx.income.agi <= threshold || !scheduleA) return Math.min(taxes, cap);
  const federalCap = whole(scheduleA['5d']) > whole(scheduleA['5e']) ? whole(scheduleA['5e']) : cap;
  return Math.min(taxes, federalCap);
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const exclusions = reader.read('exclusions');
  const credits = reader.read('credits');
  const parts = ctx.itemized;
  const claimsItemized = Boolean(parts.federalScheduleA) || parts.medicalPaid + parts.generalSalesTax + parts.realEstateTaxes + parts.personalPropertyTaxes + parts.mortgageInterest + parts.charityCash + parts.charityNonCash + parts.otherItemized > 0;
  const itemized = claimsItemized ? reader.read('itemized') : null;
  if (!rule || !exclusions || !credits || (claimsItemized && !itemized)) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Delaware figures for ${ctx.taxYear}.` };
  return filing.residency === 'full-year' ? resident(ctx, filing, rule, exclusions, credits, itemized) : partYearOrNonresident(ctx, filing, rule, exclusions, itemized);
}

function deductionsFor(ctx, rule, terms, checks) {
  const status = ctx.filingStatus;
  const standard = status === 'mfj' ? rule.standardDeduction.mfj : rule.standardDeduction.other;
  const boxes = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length + ctx.filers.filter((item) => item.blind).length;
  const additional = boxes * rule.additionalStandard;
  const parts = terms ? itemizedDeductions(ctx, terms) : { medical: 0, taxes: 0, mortgage: 0, charity: 0, other: 0, total: 0 };
  const salt = terms ? saltLimit(ctx, parts.taxes, terms) : 0;
  const itemized = parts.total - parts.taxes + salt;
  const itemize = itemized > standard + additional;
  if (itemize && !ctx.itemized.federalItemized) checks.push(check('info', 'DE_ITEMIZE', 'Delaware itemized deductions (without state income taxes) are larger than the standard deduction, so they are used even though you took the federal standard deduction.'));
  if (itemize && ctx.itemized.stateIncomeTaxes > 0) checks.push(check('info', 'DE_NO_INCOME_TAX_DEDUCTION', 'Delaware itemized deductions leave out Delaware income tax and tax credited on Line 28; income tax paid to another state without a credit can be added on PIT-RSA Line 5a.'));
  return { standard, additional, boxes, parts, salt, itemized, itemize, amount: itemize ? itemized : standard, extra: itemize ? 0 : additional };
}

function resident(ctx, filing, rule, exclusions, credits, terms) {
  const answers = filing.answers;
  const income = ctx.income;
  const checks = [];
  const exempt = income.taxExemptInterest;
  const deBond = answers.delawareBondInterest;
  if (exempt > 0 && (deBond === undefined || deBond === null)) checks.push(check('warning', 'DE_BOND_INTEREST_ASSUMED', 'All of your tax-exempt interest was treated as interest on bonds of other states, which Delaware adds on Line 2. Interest on Delaware bonds is not added.', 'Say how much of your tax-exempt interest is from Delaware bonds.'));
  const line1 = income.agi;
  const line2 = Math.max(0, exempt - Math.min(exempt, positive(deBond)));
  const line3 = 0;
  const line4 = line1 + line2 + line3;
  const line5 = income.usObligationInterest;
  const pension = pensionExclusion(ctx, answers, exclusions);
  const line6 = pension.total;
  const line7 = income.stateRefundTaxable;
  const line8a = income.socialSecurityTaxable;
  const line8b = 0;
  const line9 = line5 + line6 + line7 + line8a + line8b;
  const line10 = line4 - line9;
  const line11 = seniorExclusion(ctx, exclusions, line10);
  const line12 = line10 - line11;
  const deduction = deductionsFor(ctx, rule, terms, checks);
  const line13 = deduction.itemize ? deduction.itemized : 0;
  const line17 = line13;
  const line19 = line17;
  const line20 = deduction.amount;
  const line21 = deduction.extra;
  const line22 = line20 + line21;
  const line23 = Math.max(0, line12 - line22);
  const line24 = deTax(line23, rule);
  const line26 = line24;
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const line27a = dependentFiler ? 0 : rule.personalCredit * (ctx.filers.length + ctx.dependents.length);
  const line27b = rule.seniorCredit * ctx.filers.filter((item) => item.age !== null && item.age >= rule.seniorCreditAge).length;
  const rss = [];
  for (const other of filing.otherStates || []) {
    const credit = otherStateCreditLimit({ residentTax: line26, residentIncome: line12, doubleTaxedIncome: other.income, otherStateTax: other.tax });
    rss.push({ state: other.state, otherAgi: positive(other.income), delawareAgi: line12, delawareTax: line26, otherTax: positive(other.tax), credit });
  }
  const line28 = rss.reduce((total, item) => total + item.credit, 0);
  if (rss.length) checks.push(check('info', 'DE_OTHER_STATE_CREDIT', 'Credit for tax paid to another state is limited to the Delaware tax times the other state\'s income over your Delaware AGI. Attach PIT-RSS and the other state\'s return.'));
  const line29 = credits.volunteerFirefighter * Math.min(ctx.filers.length, positive(answers.volunteerFirefighters));
  const line30 = 0;
  const line31 = Math.round((positive(answers.federalChildCareCredit) * credits.childCareBp) / 10000);
  const line32 = Math.min(line26, line27a + line27b + line28 + line29 + line30 + line31);
  const line33 = line26 - line32;
  const federalEic = whole(ctx.federal.lines['27']);
  const refundableEitc = Math.round((federalEic * credits.eitcRefundableBp) / 10000);
  const nonrefundableEitc = Math.min(line33, Math.round((federalEic * credits.eitcNonrefundableBp) / 10000));
  const useNonrefundable = nonrefundableEitc > refundableEitc;
  const line34 = useNonrefundable ? nonrefundableEitc : refundableEitc;
  const totalTax = useNonrefundable ? line33 - nonrefundableEitc : line33;
  let room = line26;
  const take = (amount) => {
    const used = Math.min(room, amount);
    room -= used;
    return used;
  };
  const used27a = take(line27a);
  const used27b = take(line27b);
  const used28 = take(line28);
  const used29 = take(line29);
  const used31 = take(line31);
  const lines = lineTable({
    1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, '8a': line8a, '8b': line8b, 9: line9, 10: line10, 11: line11, 12: line12,
    13: line13, 14: 0, 15: 0, 16: 0, 17: line17, 18: 0, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: 0, 26: line26,
    '27a': line27a, '27b': line27b, 28: line28, 29: line29, 30: line30, 31: line31, 32: line32, 33: line33, 34: line34,
    35: filing.payments.withheld, 36: filing.payments.estimated + filing.payments.extension,
  });
  const schedules = {
    pensionExclusion: { people: pension.people },
    ...(deduction.itemize ? { 'PIT-RSA': lineTable({ 4: deduction.parts.medical, '5e': deduction.parts.taxes, '5f': deduction.salt, 7: deduction.salt, 10: deduction.parts.mortgage, 14: deduction.parts.charity, 16: deduction.parts.other, '17a': deduction.itemized }) } : {}),
    ...(rss.length || federalEic ? { 'PIT-RSS': { otherStates: rss, eitc: { federalEic, refundable: refundableEitc, nonrefundable: nonrefundableEitc, chosen: useNonrefundable ? 'nonrefundable' : 'refundable' } } } : {}),
  };
  return {
    form: 'PIT-RES',
    lines,
    schedules,
    stateIncome: line12,
    taxableIncome: line23,
    taxBeforeCredits: line26,
    nonrefundableCredits: [
      ...(used27a ? [{ code: 'DE_PERSONAL', label: 'Personal credits', amount: used27a }] : []),
      ...(used27b ? [{ code: 'DE_PERSONAL_60', label: 'Additional personal credits (60 or over)', amount: used27b }] : []),
      ...(used28 ? [{ code: 'DE_OTHER_STATE', label: 'Tax paid to another state', amount: used28 }] : []),
      ...(used29 ? [{ code: 'DE_FIREFIGHTER', label: 'Volunteer firefighter credit', amount: used29 }] : []),
      ...(used31 ? [{ code: 'DE_CHILD_CARE', label: 'Child care credit', amount: used31 }] : []),
      ...(useNonrefundable && nonrefundableEitc ? [{ code: 'DE_EITC_NONREFUNDABLE', label: 'Earned income tax credit (non-refundable 20%)', amount: nonrefundableEitc }] : []),
    ],
    otherStateCredit: used28,
    otherTaxes: [],
    totalTax,
    refundableCredits: !useNonrefundable && refundableEitc ? [{ code: 'DE_EITC_REFUNDABLE', label: 'Earned income tax credit (refundable 4.5%)', amount: refundableEitc }] : [],
    checks,
  };
}

function partYearOrNonresident(ctx, filing, rule, exclusions, terms) {
  const answers = filing.answers;
  const income = ctx.income;
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const columnA = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.stateRefundTaxable, 5: 0, 6: income.businessIncome, '7a': income.capitalGain, '7b': 0, 8: income.iraTaxable, 9: income.pensionTaxable, 10: 0, 11: 0, 12: income.unemployment, 13: income.socialSecurityTaxable };
  columnA[16] = income.adjustments;
  columnA[17] = income.agi;
  columnA[15] = columnA[17] + columnA[16];
  columnA[14] = columnA[15] - [1, 2, 3, 4, 5, 6, '7a', '7b', 8, 9, 10, 11, 12, 13].reduce((total, key) => total + whole(columnA[key]), 0);
  const columnB = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest), 3: whole(sourced.ordinaryDividends), 4: whole(sourced.stateRefundTaxable), 5: 0, 6: whole(sourced.businessIncome), '7a': whole(sourced.capitalGain), '7b': 0, 8: whole(sourced.iraTaxable), 9: whole(sourced.pensionTaxable), 10: 0, 11: 0, 12: whole(sourced.unemployment), 13: whole(sourced.socialSecurityTaxable), 14: whole(sourced.otherIncome) };
  columnB[16] = whole(sourced.adjustments);
  columnB[15] = [1, 2, 3, 4, 5, 6, '7a', '7b', 8, 9, 10, 11, 12, 13, 14].reduce((total, key) => total + whole(columnB[key]), 0);
  columnB[17] = columnB[15] - columnB[16];
  const exempt = income.taxExemptInterest;
  const deBond = answers.delawareBondInterest;
  const otherBonds = Math.max(0, exempt - Math.min(exempt, positive(deBond)));
  if (exempt > 0 && (deBond === undefined || deBond === null)) checks.push(check('warning', 'DE_BOND_INTEREST_ASSUMED', 'All of your tax-exempt interest was treated as interest on bonds of other states, which Delaware adds on Line 18.', 'Say how much of your tax-exempt interest is from Delaware bonds.'));
  columnA[18] = otherBonds;
  columnB[18] = partYear ? Math.round(otherBonds * filing.share) : 0;
  for (const column of [columnA, columnB]) {
    column[19] = 0;
    column[20] = column[18] + column[19];
    column[21] = column[17] + column[20];
  }
  const pension = pensionExclusion(ctx, answers, exclusions);
  columnA[22] = income.usObligationInterest;
  columnB[22] = whole(sourced.usObligationInterest);
  columnA[23] = pension.total;
  const sourcedRetirement = whole(sourced.pensionTaxable) + whole(sourced.iraTaxable) + (ctx.filers.some((item) => (item.age ?? 0) >= exclusions.pensionAge) ? whole(sourced.taxableInterest) + whole(sourced.ordinaryDividends) + Math.max(0, whole(sourced.capitalGain)) : 0);
  columnB[23] = Math.min(pension.total, sourcedRetirement);
  columnA[24] = income.stateRefundTaxable;
  columnB[24] = whole(sourced.stateRefundTaxable);
  columnA[25] = 0;
  columnB[25] = 0;
  columnA['26a'] = income.socialSecurityTaxable;
  columnB['26a'] = whole(sourced.socialSecurityTaxable);
  columnA['26b'] = 0;
  columnB['26b'] = 0;
  for (const column of [columnA, columnB]) {
    column[27] = column[22] + column[23] + column[24] + column[25] + column['26a'] + column['26b'];
    column[28] = column[21] - column[27];
  }
  columnA[29] = seniorExclusion(ctx, exclusions, columnA[28]);
  columnB[29] = Math.min(columnA[29], Math.max(0, columnB[28]));
  const line30a = columnB[28] - columnB[29];
  const line30b = columnA[28] - columnA[29];
  const line38 = line30b;
  const deduction = deductionsFor(ctx, rule, terms, checks);
  const line37 = deduction.itemize ? deduction.itemized : 0;
  const line39 = deduction.amount;
  const line40 = deduction.extra;
  const line41 = line39 + line40;
  const line42 = Math.max(0, line38 - line41);
  const fullTax = deTax(line42, rule);
  const proration = line30a <= 0 ? 0 : ratio(line30a, line30b, { places: 4 });
  const line43 = Math.round(fullTax * proration);
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const line44a = Math.round((dependentFiler ? 0 : rule.personalCredit * (ctx.filers.length + ctx.dependents.length)) * proration);
  const line44b = Math.round(rule.seniorCredit * ctx.filers.filter((item) => item.age !== null && item.age >= rule.seniorCreditAge).length * proration);
  const line45 = 0;
  const line46 = 0;
  const line47 = Math.min(line43, line44a + line44b + line45 + line46);
  const line48 = line43 - line47;
  if (partYear) checks.push(check('info', 'DE_PART_YEAR_SOURCE', 'Column B holds all income received while a Delaware resident plus Delaware-source income for the rest of the year.'));
  const prefixed = (column, label) => Object.fromEntries(Object.entries(column).map(([key, value]) => [`${key}${label}`, value]));
  const lines = lineTable({ ...prefixed(columnA, 'A'), ...prefixed(columnB, 'B'), '30a': line30a, '30b': line30b, 37: line37, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, '43tax': fullTax, '43decimal': proration, 43: line43, '44a': line44a, '44b': line44b, 45: line45, 46: line46, 47: line47, 48: line48, 49: filing.payments.withheld, 50: filing.payments.estimated + filing.payments.extension });
  const used44a = Math.min(line43, line44a);
  const used44b = Math.min(line43 - used44a, line44b);
  return {
    form: 'PIT-NON',
    lines,
    schedules: { pensionExclusion: { people: pension.people }, ...(deduction.itemize ? { 'PIT-NSA': lineTable({ '17a': deduction.itemized }) } : {}) },
    stateIncome: line30a,
    taxableIncome: line42,
    taxBeforeCredits: line43,
    nonrefundableCredits: [
      ...(used44a ? [{ code: 'DE_PERSONAL', label: 'Personal credits (prorated)', amount: used44a }] : []),
      ...(used44b ? [{ code: 'DE_PERSONAL_60', label: 'Additional personal credits (60 or over, prorated)', amount: used44b }] : []),
    ],
    otherStateCredit: 0,
    otherTaxes: [],
    totalTax: line48,
    refundableCredits: [],
    checks,
  };
}

export const STATE = Object.freeze({
  code: 'DE',
  name: 'Delaware',
  built: true,
  due: (taxYear) => `${Number(taxYear) + 1}-04-30`,
  forms: Object.freeze({ resident: 'PIT-RES', partYear: 'PIT-NON', nonresident: 'PIT-NON' }),
  questions: Object.freeze([
    Object.freeze({ id: 'delawareBondInterest', kind: 'amount', text: 'Tax-exempt interest from Delaware state or local bonds', help: 'Interest on other states\' bonds is added to Delaware income; Delaware bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'militaryPension', kind: 'amount', text: 'Your U.S. military retirement pay included in your 1099-R pensions', help: 'Under 60, a military pension gets an exclusion of up to $12,500 instead of $2,000.' }),
    Object.freeze({ id: 'spouseMilitaryPension', kind: 'amount', text: 'Your spouse\'s U.S. military retirement pay included in 1099-R pensions', help: 'Joint returns only.' }),
    Object.freeze({ id: 'federalChildCareCredit', kind: 'amount', text: 'Federal child and dependent care credit (Form 2441 line 11)', help: 'Delaware residents get 50% of it on Line 31.' }),
    Object.freeze({ id: 'volunteerFirefighters', kind: 'count', text: 'How many of you are active Delaware volunteer firefighters, fire company auxiliary or rescue squad members', help: 'A $1,000 credit each on Line 29, verified with the fire company.' }),
  ]),
  notCovered: Object.freeze([
    'Additions and subtractions other than other-state bond interest, U.S. obligation interest, the pension exclusion, Delaware state refunds and Social Security (for example fiduciary adjustments, 529 and ABLE contributions, the work opportunity credit and net operating losses)',
    'The exclusion for disabled persons under 60 and the pension exclusion split for investment accounts owned in ways other than as reported on each 1099',
    'Foreign taxes, charitable mileage and labor union dues added to itemized deductions, and the PIT-CRS credit adjustment',
    'Separate and combined separate returns of married couples (filing statuses 3 and 4)',
    'Credit for tax paid to another state on a part-year PIT-NON, and the business, historic, organ donation and other PIT-CRS credits',
    'Tax on lump-sum distributions (PIT-STC), Wilmington city wage tax (filed separately with the city) and the underpayment penalty',
  ]),
  compute,
});
