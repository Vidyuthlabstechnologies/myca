import { whole, positive, sum, rateOf, check, lineTable, byStatus, form1098PropertyTax } from '../state-kit.mjs';

const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const fieldOf = (form, key) => positive(form.fields?.[key]);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const has = (answers, key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? fieldOf(form, 'grossDistribution') : fieldOf(form, 'taxableAmount'));

function scheduleTax(amount, bands) {
  const income = Math.max(0, amount);
  let tenthsOfCents = 0;
  bands.forEach((band, index) => {
    const over = band.overCents / 100;
    const upTo = index + 1 < bands.length ? bands[index + 1].overCents / 100 : Infinity;
    const slice = Math.max(0, Math.min(income, upTo) - over);
    tenthsOfCents += Math.round(slice * 100 * band.rateBp * 10);
  });
  return tenthsOfCents / 10000000;
}

export function njTax(taxable, filingStatus, rule) {
  const bands = byStatus(rule.brackets, filingStatus);
  const income = positive(taxable);
  if (income <= 0) return 0;
  if (income < rule.taxTableBelow) {
    const low = Math.floor(income / rule.taxTableBand) * rule.taxTableBand;
    return Math.round(scheduleTax(low + rule.taxTableBand / 2, bands));
  }
  return Math.round(scheduleTax(income, bands));
}

function residentMonths(filing, taxYear) {
  if (filing.residency === 'full-year') return 12;
  if (filing.residency !== 'part-year') return 0;
  const from = Date.parse(`${filing.from}T00:00:00Z`);
  const to = Date.parse(`${filing.to}T00:00:00Z`);
  let months = 0;
  for (let month = 0; month < 12; month += 1) {
    const start = Date.UTC(Number(taxYear), month, 1);
    const end = Date.UTC(Number(taxYear), month + 1, 0);
    const days = Math.max(0, Math.floor((Math.min(end, to) - Math.max(start, from)) / 86400000) + 1);
    if (days >= 15) months += 1;
  }
  return months;
}

function exemptSplit(ctx, answers) {
  const box8 = sum(formsOf(ctx, '1099-INT'), (form) => fieldOf(form, 'taxExemptInterest'));
  const box12 = sum(formsOf(ctx, '1099-DIV'), (form) => fieldOf(form, 'exemptInterestDividends'));
  const exempt = Math.min(box8 + box12, positive(answers.njExemptInterest));
  const fromInterest = Math.min(box8, exempt);
  return { box8, box12, exempt, taxableInterestPart: box8 - fromInterest, taxableDividendPart: box12 - (exempt - fromInterest) };
}

function wagesOf(ctx, answers) {
  let nj = 0;
  let other = 0;
  for (const form of formsOf(ctx, 'W-2')) {
    const state = String(form.fields?.state || '').trim().toUpperCase();
    const reported = form.fields?.stateWages;
    if (state === 'NJ') nj += reported === undefined || reported === null || reported === '' ? fieldOf(form, 'wages') : fieldOf(form, 'stateWages');
    else other += fieldOf(form, 'wages');
  }
  const given = has(answers, 'njOtherW2Wages');
  return { total: nj + (given ? positive(answers.njOtherW2Wages) : other), estimated: other > 0 && !given };
}

function gainsOf(ctx) {
  let total = 0;
  for (const form of formsOf(ctx, '1099-B')) {
    const list = Array.isArray(form.fields?.transactions) ? form.fields.transactions : [form.fields || {}];
    for (const item of list) total += positive(item.proceeds) - positive(item.costBasis) + positive(item.washSaleLossDisallowed);
  }
  return total + whole(ctx.income.capitalGainDistributions);
}

function incomeLines(ctx, filing, answers, everywhere) {
  const income = ctx.income;
  const split = exemptSplit(ctx, answers);
  const excludable = positive(answers.njPensionExcludable);
  const shared = { 23: positive(answers.njRentsRoyalties), 24: positive(answers.njGamblingWinnings), 25: positive(answers.njAlimonyReceived) };
  if (everywhere || filing.residency === 'full-year') {
    const wages = wagesOf(ctx, answers);
    const pension = Math.max(0, whole(income.iraTaxable) + whole(income.pensionTaxable) - excludable);
    return { wagesEstimated: wages.estimated, split, 15: wages.total, '16a': Math.max(0, whole(income.taxableInterest) - whole(income.usObligationInterest)) + split.taxableInterestPart, '16b': split.exempt, 17: whole(income.ordinaryDividends) + split.taxableDividendPart, 18: Math.max(0, whole(income.businessIncome)), 19: Math.max(0, gainsOf(ctx)), '20a': pension, '20b': Math.min(excludable, whole(income.iraTaxable) + whole(income.pensionTaxable)), ...shared, 26: positive(income.otherIncome) };
  }
  const s = filing.sourced;
  const share = filing.share;
  return { wagesEstimated: false, split, 15: positive(s.wages), '16a': Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest)) + Math.round(split.taxableInterestPart * share), '16b': Math.round(split.exempt * share), 17: whole(s.ordinaryDividends) + Math.round(split.taxableDividendPart * share), 18: Math.max(0, whole(s.businessIncome)), 19: Math.max(0, whole(s.capitalGain)), '20a': Math.max(0, whole(s.iraTaxable) + whole(s.pensionTaxable) - excludable), '20b': excludable, ...shared, 26: positive(s.otherIncome) };
}

const totalOf = (lines) => lines[15] + lines['16a'] + lines[17] + lines[18] + lines[19] + lines['20a'] + lines[23] + lines[24] + lines[25] + lines[26];

function eligibleFilers(ctx, answers, rule) {
  return ctx.filers.map((item) => ({ ...item, disabled: item.role === 'spouse' ? answers.njSpouseDisabled === true : answers.njDisabled === true })).map((item) => ({ ...item, pensionEligible: (item.age !== null && item.age >= rule.ageMinimum) || item.blind || item.disabled, otherEligible: item.age !== null && item.age >= rule.ageMinimum }));
}

function maximumExclusion(rule, status, income, months, percentBase) {
  if (income > rule.incomeLimit) return 0;
  if (income <= rule.fullAmountUpTo) return Math.round(byStatus(rule.maximum, status) * months / 12);
  const tier = rule.tiers.find((item) => income <= item.upTo);
  return tier ? rateOf(percentBase, byStatus(tier.basisPoints, status)) : 0;
}

function retirementExclusion(ctx, filing, answers, rule, lines, wholeYear) {
  const filers = eligibleFilers(ctx, answers, rule);
  const status = ctx.filingStatus;
  const months = residentMonths(filing, ctx.taxYear) || 12;
  const prorate = filing.residency === 'part-year' ? months : 12;
  const line27 = totalOf(lines);
  const yearIncome = filing.residency === 'part-year' ? totalOf(wholeYear) : line27;
  const pensionFilers = filers.filter((item) => item.pensionEligible);
  let lineA = 0;
  if (pensionFilers.length === filers.length) lineA = lines['20a'];
  else if (pensionFilers.length) {
    const roles = new Set(pensionFilers.map((item) => item.role));
    lineA = Math.min(lines['20a'], sum(formsOf(ctx, '1099-R').filter((form) => roles.has(ownerOf(form))), taxableOf));
  }
  const line28a = pensionFilers.length ? Math.min(lineA, maximumExclusion(rule, status, yearIncome, prorate, lines['20a'])) : 0;
  let line28b = 0;
  const otherFilers = filers.filter((item) => item.otherEligible);
  const special = answers.njSpecialRetirementExclusion === true && otherFilers.length ? (status === 'single' || status === 'mfs' ? 3000 : 6000) : 0;
  if (otherFilers.length && yearIncome <= rule.incomeLimit) {
    const maximum = maximumExclusion(rule, status, yearIncome, prorate, yearIncome);
    const unused = Math.max(0, maximum - line28a);
    const earned = filing.residency === 'part-year' ? wholeYear[15] + wholeYear[18] : lines[15] + lines[18];
    if (unused > 0 && earned <= rule.earnedIncomeLimit) line28b = unused;
  }
  line28b = Math.min(line28b + special, Math.max(0, line27 - line28a));
  return { line27, line28a, line28b, special, partial: filers.length > 1 && (pensionFilers.length === 1 || otherFilers.length === 1) };
}

function exemptionLines(ctx, answers, rule) {
  const filerCount = ctx.filers.length;
  const seniors = ctx.filers.filter((item) => item.age !== null && item.age >= rule.seniorAge).length;
  const blind = ctx.filers.filter((item) => item.blind || (item.role === 'spouse' ? answers.njSpouseDisabled === true : answers.njDisabled === true)).length;
  const veterans = (answers.njVeteran === true ? 1 : 0) + (ctx.filingStatus === 'mfj' && answers.njSpouseVeteran === true ? 1 : 0);
  const children = ctx.dependents.filter((item) => item.qualifyingChild).length;
  const others = ctx.dependents.length - children;
  const students = Math.min(Math.max(0, Number(answers.njCollegeStudents || 0)), ctx.dependents.filter((item) => item.age !== null && item.age < rule.collegeStudentUnderAge).length);
  const lines = { 6: filerCount * rule.regular, 7: seniors * rule.senior, 8: blind * rule.blindOrDisabled, 9: veterans * rule.veteran, 10: children * rule.dependent, 11: others * rule.dependent, 12: students * rule.collegeStudent };
  return { lines, total: Object.values(lines).reduce((total, value) => total + value, 0), counts: { thousand: filerCount + seniors + blind + students, dependents: ctx.dependents.length, veterans } };
}

function deductionLines(ctx, filing, answers, rule, line29, share) {
  const medicalPaid = Math.round(positive(ctx.itemized.medicalPaid) * share);
  const worksheetF3 = Math.max(0, medicalPaid - rateOf(line29, rule.medicalFloorBasisPoints));
  const line31 = worksheetF3 + Math.round(positive(ctx.income.adjustmentItems?.seHealth) * share);
  const line32 = positive(answers.njAlimonyPaid);
  const affordable = line29 <= rule.collegeAffordabilityIncomeLimit;
  const line37a = affordable ? Math.min(positive(answers.njNjbestContributions), rule.njbestMaximum) : 0;
  const line37b = affordable ? Math.min(positive(answers.njNjclassPayments), rule.njclassMaximum) : 0;
  const line37c = affordable ? Math.min(positive(answers.njTuitionPaid), rule.tuitionMaximum) : 0;
  return { 31: line31, 32: line32, 33: 0, 34: 0, 35: 0, 36: 0, '37a': Math.round(line37a * share), '37b': Math.round(line37b * share), '37c': Math.round(line37c * share), medicalPaid, affordable };
}

function cojCredits(otherStates, lines, line29, tax) {
  return otherStates.map((other) => {
    const s = other.sourced || {};
    const line1 = Math.min(line29, Math.min(lines[15], positive(s.wages)) + Math.min(lines[18], positive(s.businessIncome)) + Math.min(lines[26], positive(s.otherIncome)));
    const line3 = line29 > 0 ? Math.round(Math.min(1, line1 / line29) * 1e7) / 1e7 : 0;
    const line8 = Math.round(tax * line3);
    return { state: other.state, 1: line1, 2: line29, 3: line3, 7: tax, 8: line8, '9a': positive(other.tax), 9: Math.min(line8, positive(other.tax)) };
  });
}

function sharedResponsibility(ctx, filing, answers, reader, householdIncome, months) {
  const coverage = answers.njHealthCoverage;
  if (coverage !== 'not-everyone') return { amount: 0, coverage };
  const rule = reader.read('shared-responsibility');
  if (!rule) return { amount: 0, coverage };
  const threshold = byStatus(rule.threshold, ctx.filingStatus);
  const members = [...ctx.filers.filter((item) => !item.canBeClaimedAsDependent), ...ctx.dependents];
  const adults = members.filter((item) => item.age === null || item.age >= 19).length;
  const kids = members.length - adults;
  const span = filing.residency === 'part-year' ? months : 12;
  const adultMonths = Math.min(adults * span, Number(answers.njUncoveredAdultMonths || 0));
  const childMonths = Math.min(kids * span, Number(answers.njUncoveredChildMonths || 0));
  const incomeCents = Math.round(Math.max(0, householdIncome - threshold) * rule.incomeBasisPoints / 100);
  const capCents = rule.perPersonCapCents * Math.min(rule.maxPersons, Math.max(1, members.length));
  let cents;
  const everyoneAllYear = adultMonths === adults * span && childMonths === kids * span && adultMonths + childMonths > 0;
  if (everyoneAllYear) {
    const flat = Math.min(Math.round((adults * rule.adultCents + kids * rule.childCents) * span / 12), rule.flatCapCents);
    cents = Math.min(Math.max(flat, Math.round(incomeCents * span / 12)), capCents);
  } else {
    const flat = Math.min(adultMonths * rule.monthlyAdultCents + childMonths * rule.monthlyChildCents, rule.flatCapCents);
    const allMonths = members.length * span;
    const incomePart = allMonths ? Math.round(Math.round(incomeCents * span / 12) * (adultMonths + childMonths) / allMonths) : 0;
    cents = Math.min(Math.max(flat, incomePart), capCents);
  }
  return { amount: Math.round(cents / 100), coverage, adults, kids, adultMonths, childMonths, householdIncome };
}

function childTaxCredit(ctx, credits, taxableIncome, months) {
  if (ctx.filingStatus === 'mfs') return { count: 0, amount: 0 };
  const count = ctx.dependents.filter((item) => item.age !== null && item.age >= 0 && item.age <= credits.childTaxCreditMaxAge).length;
  const tier = credits.childTaxCredit.find((item) => taxableIncome <= item.upTo);
  const per = tier ? tier.amount : 0;
  return { count, per, amount: Math.round(count * per * months / 12) };
}

function residentReturn(ctx, filing, reader, rules) {
  const { tax, exemptions, exclusion, deductions, property, credits } = rules;
  const answers = filing.answers;
  const checks = [];
  const months = residentMonths(filing, ctx.taxYear);
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : 1;
  const lines = incomeLines(ctx, filing, answers, false);
  const wholeYear = partYear ? incomeLines(ctx, filing, answers, true) : lines;
  const retirement = retirementExclusion(ctx, filing, answers, exclusion, lines, wholeYear);
  const line27 = retirement.line27;
  const line28c = retirement.line28a + retirement.line28b;
  const line29 = Math.max(0, line27 - line28c);
  const exemption = exemptionLines(ctx, answers, exemptions);
  const line30 = partYear ? Math.round(exemption.total * months / 12) : exemption.total;
  const ded = deductionLines(ctx, filing, answers, deductions, line29, share);
  const line38 = line30 + ded[31] + ded[32] + ded[33] + ded[34] + ded[35] + ded[36] + ded['37a'] + ded['37b'] + ded['37c'];
  const line39 = Math.max(0, line29 - line38);
  const status = ctx.filingStatus;
  const sameHome = status === 'mfs' && answers.njSharedHomeWithSpouse === true;
  const threshold = byStatus(property.filingThreshold, status);
  const fromForm1098 = !has(answers, 'njPropertyTaxPaid') && !has(answers, 'njRentPaid') && filing.residency === 'full-year' ? form1098PropertyTax(ctx) : 0;
  if (fromForm1098) checks.push(check('warning', 'NJ_PROPERTY_TAX_FROM_1098', 'The property tax deduction uses the property tax on your Form 1098.', 'Confirm it is tax on your New Jersey main home, or give the amount paid on it.'));
  const propertyTaxes = (has(answers, 'njPropertyTaxPaid') ? positive(answers.njPropertyTaxPaid) : fromForm1098) + rateOf(positive(answers.njRentPaid), property.rentBasisPoints);
  const line40a = sameHome ? Math.round(propertyTaxes / 2) : propertyTaxes;
  const seniorOrDisabled = ctx.filers.some((item) => (item.age !== null && item.age >= 65) || item.blind) || answers.njDisabled === true || answers.njSpouseDisabled === true;
  const aboveThreshold = line29 > threshold;
  const propertyEligible = line40a > 0 && (aboveThreshold || seniorOrDisabled);
  const deductionCap = sameHome ? property.deductionMaximumSeparateSameHome : property.deductionMaximum;
  const fullCredit = sameHome ? property.creditSeparateSameHome : property.credit;
  const credit = partYear ? Math.round(fullCredit * months / 12) : fullCredit;
  const resident = filing.residency === 'full-year';
  const otherStates = resident ? filing.otherStates : [];
  const columnFor = (deduction) => {
    const taxable = Math.max(0, line39 - deduction);
    const amount = njTax(taxable, status, tax);
    const coj = otherStates.length ? cojCredits(otherStates, lines, line29, amount) : [];
    const cojTotal = Math.min(amount, sum(coj, (row) => row[9]));
    return { deduction, taxable, tax: amount, coj, cojTotal, balance: amount - cojTotal };
  };
  const noDeduction = columnFor(0);
  let chosen = noDeduction;
  let line56 = 0;
  let worksheet = null;
  if (propertyEligible) {
    const withDeduction = aboveThreshold ? columnFor(Math.min(line40a, deductionCap)) : null;
    const saving = withDeduction ? noDeduction.balance - withDeduction.balance : 0;
    if (withDeduction && saving >= credit) chosen = withDeduction;
    else line56 = credit;
    worksheet = lineTable({ 1: line40a, 2: Math.min(line40a, deductionCap), '3A': line39, '4A': withDeduction ? withDeduction.deduction : 0, '5A': withDeduction ? withDeduction.taxable : line39, '6A': withDeduction ? withDeduction.balance : noDeduction.balance, '5B': line39, '6B': noDeduction.balance, 7: saving, choice: chosen === noDeduction ? 'credit' : 'deduction' });
  }
  const line41 = chosen.deduction;
  const line42 = chosen.taxable;
  const line43 = chosen.tax;
  const line44 = chosen.cojTotal;
  const line45 = line43 - line44;
  const line49 = 0;
  const line50 = Math.max(0, line45 - line49);
  const line51 = positive(answers.njUseTax);
  const householdIncome = line27 + lines['16b'] + positive(answers.njDependentIncome);
  const wholeYearIncome = partYear ? totalOf(wholeYear) : line29;
  const srp = wholeYearIncome > threshold && !ctx.filers.some((item) => item.role === 'taxpayer' && item.canBeClaimedAsDependent) ? sharedResponsibility(ctx, filing, answers, reader, partYear ? totalOf(wholeYear) + wholeYear['16b'] + positive(answers.njDependentIncome) : householdIncome, months) : { amount: 0, coverage: answers.njHealthCoverage };
  const line53c = srp.amount;
  const line54 = line50 + line51 + line53c;
  const federalEic = whole(ctx.federal.lines['27']);
  const line58 = Math.round(rateOf(federalEic, credits.eitcBasisPoints) * months / 12);
  const wholeYearTaxable = partYear ? Math.max(0, totalOf(wholeYear) - exemption.total) : line42;
  const ctc = childTaxCredit(ctx, credits, wholeYearTaxable, months);
  const line65 = ctc.amount;
  const line55 = filing.payments.withheld;
  const line57 = filing.payments.estimated + filing.payments.extension;
  const line66 = line55 + line56 + line57 + line58 + line65;

  if (lines.wagesEstimated) checks.push(check('warning', 'NJ_OTHER_STATE_WAGES', 'Wages on W-2s from other states are taken from box 1. New Jersey wages also include contributions to 403(b), 457 and other plans except 401(k) plans.', 'Give the New Jersey wages for those W-2s if they differ.'));
  if (lines.split.box8 + lines.split.box12 > 0 && !has(answers, 'njExemptInterest')) checks.push(check('warning', 'NJ_OUT_OF_STATE_BONDS', 'New Jersey taxes interest on other states\' bonds. All federally tax-exempt interest and exempt-interest dividends are counted as taxable until you say how much came from New Jersey obligations or a New Jersey qualified investment fund.', 'Answer the New Jersey tax-exempt interest question.'));
  if (lines['20a'] > 0 && !has(answers, 'njPensionExcludable')) checks.push(check('info', 'NJ_PENSION_CONTRIBUTIONS', 'Pensions and IRA withdrawals are taxed in New Jersey as on the federal return. Contributions New Jersey already taxed (non-401(k) plans, nondeductible IRA contributions) are excludable on line 20b.', 'Give the excludable part if you made such contributions.'));
  if (retirement.partial) checks.push(check('warning', 'NJ_EXCLUSION_ONE_SPOUSE', 'Only one spouse is 62 or older (or disabled), so only that spouse\'s retirement income can be excluded. MyCA limited the pension exclusion to that spouse\'s 1099-R income; check the other retirement income exclusion on Worksheet D.'));
  if (whole(ctx.income.businessIncome)) checks.push(check('warning', 'NJ_BUSINESS_DEPRECIATION', 'Line 18 uses the federal Schedule C profit. New Jersey does not allow federal bonus depreciation or section 179 above its limits (Worksheet GIT-DEP).', 'Have the depreciation adjusted for New Jersey if you claimed either.'));
  if (!has(answers, 'njUseTax')) checks.push(check('warning', 'NJ_USE_TAX', 'Line 51 cannot be left blank: New Jersey asks for use tax on online or out-of-state purchases with no New Jersey sales tax.', 'Answer the use tax question (0 if none).'));
  if (!has(answers, 'njHealthCoverage') && wholeYearIncome > threshold) checks.push(check('warning', 'NJ_HEALTH_COVERAGE', 'New Jersey requires health coverage for everyone in the household all year, or a shared responsibility payment on line 53c (Schedule NJ-HCC).', 'Answer whether everyone had coverage all year.'));
  if (line40a === 0 && !has(answers, 'njPropertyTaxPaid') && !has(answers, 'njRentPaid')) checks.push(check('info', 'NJ_PROPERTY_TAX', 'Homeowners and tenants of a New Jersey main home can take a property tax deduction (up to $15,000) or a $50 credit; tenants count 18% of rent.', 'Give the property tax or rent paid on your main home.'));
  if (!federalEic && lines[15] + lines[18] > 0 && ctx.dependents.every((item) => !item.qualifyingChild) && ctx.filers.some((item) => item.age !== null && (item.age < 25 || item.age >= 65) && item.age >= 18)) checks.push(check('info', 'NJ_EITC_AGE', 'New Jersey gives $260 to filers 18 or older with no qualifying child who meet every federal EIC rule except the age limit; MyCA does not work that case out.'));
  if (positive(ctx.answers.childCareExpenses) > 0) checks.push(check('warning', 'NJ_CHILD_CARE_CREDIT', 'The New Jersey child and dependent care credit (line 64) is a share of the federal credit on Form 2441, which MyCA does not prepare; it is not included.', 'Have your CPA work out the federal and New Jersey credits.'));
  if (partYear) checks.push(check('info', 'NJ_PART_YEAR', `Exemptions, the retirement exclusions and credits are prorated over ${months} resident months (15 days or more count as a month). Income from New Jersey sources while you were a nonresident goes on a separate NJ-1040NR, which MyCA does not prepare.`));
  if (otherStates.length) checks.push(check('info', 'NJ_SCHEDULE_COJ', 'The credit for tax paid to another state (Schedule NJ-COJ) counts wages, business and other income taxed there, not interest, dividends or gains on investments. Keep each other state\'s return.'));

  const formLines = lineTable({ 6: exemption.lines[6], 7: exemption.lines[7], 8: exemption.lines[8], 9: exemption.lines[9], 10: exemption.lines[10], 11: exemption.lines[11], 12: exemption.lines[12], 13: exemption.total, 15: lines[15], '16a': lines['16a'], '16b': lines['16b'], 17: lines[17], 18: lines[18], 19: lines[19], '20a': lines['20a'], '20b': lines['20b'], 21: 0, 22: 0, 23: lines[23], 24: lines[24], 25: lines[25], 26: lines[26], 27: line27, '28a': retirement.line28a, '28b': retirement.line28b, '28c': line28c, 29: line29, 30: line30, 31: ded[31], 32: ded[32], 33: 0, 34: 0, 35: 0, 36: 0, '37a': ded['37a'], '37b': ded['37b'], '37c': ded['37c'], 38: line38, 39: line39, '40a': line40a, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 49: line49, 50: line50, 51: line51, 52: 0, '53c': line53c, 54: line54, 55: line55, 56: line56, 57: line57, 58: line58, 64: 0, 65: line65, 66: line66, 67: Math.max(0, line54 - line66), 68: Math.max(0, line66 - line54) });
  const schedules = {
    ...(worksheet ? { H: worksheet } : {}),
    ...(chosen.coj.length ? { 'NJ-COJ': chosen.coj } : {}),
    ...(ded[31] ? { F: lineTable({ 1: ded.medicalPaid, 2: rateOf(line29, deductions.medicalFloorBasisPoints), 5: ded[31] - Math.max(0, ded.medicalPaid - rateOf(line29, deductions.medicalFloorBasisPoints)), 6: ded[31] }) } : {}),
    ...(line53c ? { L: lineTable({ householdIncome: srp.householdIncome, adults: srp.adults, children: srp.kids, uncoveredAdultMonths: srp.adultMonths, uncoveredChildMonths: srp.childMonths, payment: line53c }) } : {}),
    ...(line58 ? { EITC: lineTable({ federalEitc: federalEic, months, credit: line58 }) } : {}),
    ...(line65 ? { CTC: lineTable({ children: ctc.count, perChild: ctc.per, credit: line65 }) } : {}),
    ...(partYear ? { partYear: lineTable({ months, wholeYearIncome: totalOf(wholeYear) }) } : {}),
  };
  return {
    form: 'NJ-1040',
    lines: formLines,
    schedules,
    stateIncome: line29,
    taxableIncome: line42,
    taxBeforeCredits: line43,
    nonrefundableCredits: line44 ? [{ code: 'NJ_COJ', label: 'Credit for income taxes paid to other jurisdictions (Schedule NJ-COJ)', amount: line44 }] : [],
    otherStateCredit: line44,
    otherTaxes: [...(line51 ? [{ code: 'NJ_USE_TAX', label: 'Use tax', amount: line51 }] : []), ...(line53c ? [{ code: 'NJ_SHARED_RESPONSIBILITY', label: 'Shared responsibility payment', amount: line53c }] : [])],
    totalTax: line54,
    refundableCredits: [...(line56 ? [{ code: 'NJ_PROPERTY_TAX_CREDIT', label: 'Property tax credit', amount: line56 }] : []), ...(line58 ? [{ code: 'NJ_EITC', label: 'New Jersey earned income tax credit', amount: line58 }] : []), ...(line65 ? [{ code: 'NJ_CTC', label: 'New Jersey child tax credit', amount: line65 }] : [])],
    checks,
  };
}

function nonresidentReturn(ctx, filing, reader, rules) {
  const { tax, exemptions, exclusion, deductions } = rules;
  const nr = reader.read('nonresident');
  if (!nr) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no New Jersey nonresident figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const checks = [];
  const a = incomeLines(ctx, filing, answers, true);
  const s = filing.sourced;
  const b = { 15: positive(s.wages), 16: Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest)), 17: positive(s.ordinaryDividends), 18: Math.max(0, whole(s.businessIncome)), 19: Math.max(0, whole(s.capitalGain)), 20: positive(answers.njSourceRentsRoyalties), 21: positive(answers.njSourceGamblingWinnings), 22: 0, 25: 0, 26: positive(s.otherIncome) };
  const columnA = { 15: a[15], 16: a['16a'], 17: a[17], 18: a[18], 19: a[19], 20: a[23], 21: a[24], 22: a['20a'], 25: a[25], 26: a[26] };
  const line27A = Object.values(columnA).reduce((total, value) => total + value, 0);
  const line27B = Object.values(b).reduce((total, value) => total + value, 0);
  const wholeFiling = { ...filing, residency: 'full-year' };
  const retirement = retirementExclusion(ctx, wholeFiling, answers, exclusion, a, a);
  const line28cA = retirement.line28a + retirement.line28b;
  const line29A = Math.max(0, line27A - line28cA);
  const line29B = line27B;
  const exemption = exemptionLines(ctx, answers, exemptions);
  const ded = deductionLines(ctx, wholeFiling, answers, deductions, line29A, 1);
  const line38 = exemption.total + ded[31] + ded[32] + ded['37a'] + ded['37b'] + ded['37c'];
  const line39 = Math.max(0, line29A - line38);
  const line40 = njTax(line39, ctx.filingStatus, tax);
  const scale = 10 ** nr.incomePercentagePlaces;
  const line41 = line29A > 0 ? Math.round((line29B / line29A) * scale) / scale : 0;
  const line42 = Math.round(line40 * line41);
  const line47 = line42;
  const line49 = line47;
  const line50 = filing.payments.withheld;
  const line51 = filing.payments.estimated + filing.payments.extension;
  const line57 = line50 + line51;
  if (line29B > 0) checks.push(check('info', 'NJ_NONRESIDENT_METHOD', 'A nonresident\'s New Jersey tax is the tax on income from everywhere times the share of that income from New Jersey sources (line 41). Interest, dividends, pensions and gains on investments are not New Jersey income for a nonresident.'));
  if (positive(ctx.income.businessIncome) && !positive(s.businessIncome)) checks.push(check('warning', 'NJ_NONRESIDENT_BUSINESS', 'Business income earned partly in New Jersey is allocated on Schedule NJ-NR-A; none is counted as New Jersey income until you give the New Jersey part.', 'Give the New Jersey part of your business income in the residency answers.'));
  const formLines = lineTable({ '13a': exemption.counts.thousand, '13b': exemption.counts.dependents, '13c': exemption.counts.veterans, ...Object.fromEntries(Object.entries(columnA).map(([key, value]) => [`${key}A`, value])), ...Object.fromEntries(Object.entries(b).map(([key, value]) => [`${key}B`, value])), '27A': line27A, '27B': line27B, '28aA': retirement.line28a, '28bA': retirement.line28b, '28cA': line28cA, '29A': line29A, '29B': line29B, 30: exemption.total, 31: ded[31], 32: ded[32], '37a': ded['37a'], '37b': ded['37b'], '37c': ded['37c'], 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 46: 0, 47: line47, 49: line49, 50: line50, 51: line51, 57: line57, 58: Math.max(0, line49 - line57), 59: Math.max(0, line57 - line49) });
  return { form: 'NJ-1040NR', lines: formLines, schedules: {}, stateIncome: line29B, taxableIncome: line39, taxBeforeCredits: line42, nonrefundableCredits: [], otherStateCredit: 0, otherTaxes: [], totalTax: line49, refundableCredits: [], checks };
}

function compute(ctx, filing, reader) {
  const rules = { tax: reader.read('income-tax'), exemptions: reader.read('exemptions'), exclusion: reader.read('retirement-exclusion'), deductions: reader.read('deductions'), property: reader.read('property-tax'), credits: reader.read('credits') };
  if (Object.values(rules).some((value) => !value)) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no New Jersey figures for ${ctx.taxYear}.` };
  return filing.residency === 'nonresident' ? nonresidentReturn(ctx, filing, reader, rules) : residentReturn(ctx, filing, reader, rules);
}

const q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'NJ',
  name: 'New Jersey',
  built: true,
  forms: Object.freeze({ resident: 'NJ-1040', partYear: 'NJ-1040 (part-year resident)', nonresident: 'NJ-1040NR' }),
  questions: Object.freeze([
    q('njPropertyTaxPaid', 'amount', 'Property tax paid on your New Jersey main home (your share)', 'For the property tax deduction or credit. Only the main home you owned and lived in.'),
    q('njRentPaid', 'amount', 'Rent paid for your New Jersey main home (your share)', '18% of the rent counts as property tax. Not for tax-exempt or subsidized housing.'),
    q('njSharedHomeWithSpouse', 'yesno', 'Married filing separately: did you and your spouse keep the same main home?', 'The property tax amounts are then halved.'),
    q('njExemptInterest', 'amount', 'Tax-exempt interest from New Jersey bonds or a New Jersey qualified investment fund', 'Part of 1099-INT box 8 and 1099-DIV box 12. Interest on other states\' bonds is taxable in New Jersey.'),
    q('njOtherW2Wages', 'amount', 'New Jersey wages on W-2s from other states', 'Leave empty to use box 1 wages. New Jersey adds back contributions to retirement plans other than 401(k) plans.'),
    q('njPensionExcludable', 'amount', 'Excludable part of pensions and IRA withdrawals (line 20b)', 'Contributions New Jersey already taxed, such as to 403(b) or 457 plans or nondeductible IRA contributions, recovered this year.'),
    q('njDisabled', 'yesno', 'Are you totally and permanently disabled?', 'Gives a $1,000 exemption and the pension exclusion before 62.'),
    q('njSpouseDisabled', 'yesno', 'Is your spouse totally and permanently disabled?', 'Gives a $1,000 exemption.'),
    q('njVeteran', 'yesno', 'Are you an honorably discharged veteran?', 'Gives a $6,000 exemption; send the discharge documentation the first time.'),
    q('njSpouseVeteran', 'yesno', 'Is your spouse an honorably discharged veteran?', 'Gives a $6,000 exemption.'),
    q('njCollegeStudents', 'count', 'Dependents under 22 at college full time for whom you paid at least half of tuition and upkeep', 'Each gives an extra $1,000 exemption.'),
    q('njSpecialRetirementExclusion', 'yesno', 'Will you (and your spouse) never be able to get Social Security or Railroad Retirement because your employer did not take part?', 'Gives the special exclusion of $3,000 or $6,000 at 62 or older.'),
    q('njRentsRoyalties', 'amount', 'Net rents, royalties, patents and copyrights (Schedule NJ-BUS-1 Part IV)', 'Net income; a net loss is not entered.'),
    q('njSourceRentsRoyalties', 'amount', 'Nonresidents: net rents from property in New Jersey', 'Only for the NJ-1040NR column B.'),
    q('njGamblingWinnings', 'amount', 'Net gambling winnings (New Jersey Lottery prizes over $10,000, casino and out-of-state lottery)', 'Winnings less losses in the same year.'),
    q('njSourceGamblingWinnings', 'amount', 'Nonresidents: net gambling winnings from New Jersey sources', 'Only for the NJ-1040NR column B.'),
    q('njAlimonyReceived', 'amount', 'Alimony and separate maintenance received', 'Not child support.'),
    q('njAlimonyPaid', 'amount', 'Alimony and separate maintenance paid', 'Court-ordered payments; not child support.'),
    q('njNjbestContributions', 'amount', 'Contributions to an NJBEST account', 'Up to $10,000 when gross income is $200,000 or less.'),
    q('njNjclassPayments', 'amount', 'Principal and interest paid on an NJCLASS loan', 'Up to $2,500 when gross income is $200,000 or less.'),
    q('njTuitionPaid', 'amount', 'Tuition paid to a New Jersey college for you, your spouse or a dependent', 'Up to $10,000 when gross income is $200,000 or less.'),
    q('njHealthCoverage', 'choice', 'Did everyone in your household have health coverage (or an exemption) all year?', 'New Jersey charges a shared responsibility payment for months without coverage.', { options: ['everyone-all-year', 'not-everyone'] }),
    q('njUncoveredAdultMonths', 'count', 'Months without coverage or exemption, added up for household members 18 or older', 'For example two adults uncovered for 3 months each is 6.'),
    q('njUncoveredChildMonths', 'count', 'Months without coverage or exemption, added up for household members under 18', 'Counted on Schedule NJ-HCC.'),
    q('njDependentIncome', 'amount', 'Income of your dependents (for the shared responsibility payment)', 'Their total income and tax-exempt interest.'),
    q('njUseTax', 'amount', 'New Jersey use tax on online or out-of-state purchases', 'Purchases with no New Jersey sales tax. Enter 0 if none.'),
  ]),
  notCovered: Object.freeze([
    'Partnership and S corporation income (lines 21 and 22, Schedule NJ-BUS-1 Parts II and III), the alternative business calculation (NJ-BUS-2) and the pass-through business alternative income tax credit',
    'The New Jersey depreciation adjustment (GIT-DEP) and the qualified small business stock exemption',
    'The child and dependent care credit (line 64), which needs federal Form 2441',
    'The $260 NJEITC for filers outside the federal EIC age limits, Wounded Warrior Caregivers, sheltered workshop, Gold Star and organ donor credits',
    'Excess UI/WF/SWF, disability and family leave insurance withheld (Form NJ-2450)',
    'The NJ-1040NR for the nonresident part of a part-year resident\'s year',
    'Senior Freeze base-year property taxes and the separate ANCHOR and Stay NJ property tax relief applications',
    'Interest on underpayment of estimated tax (Form NJ-2210) and charitable fund contributions',
    'The part of mutual fund dividends from U.S. obligations, which is exempt',
  ]),
  compute,
});
