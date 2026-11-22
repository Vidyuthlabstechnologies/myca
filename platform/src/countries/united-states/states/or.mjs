import { whole, positive, rateOf, ratio, check, lineTable, byStatus, sum } from '../state-kit.mjs';

const JOINT_RATES = new Set(['mfj', 'hoh', 'qss']);

const applyRatio = (amount, share, places) => Math.round((whole(amount) * Math.round(share * 10 ** places)) / 10 ** places);

function bandTax(amount, brackets) {
  let total = 0;
  brackets.forEach((band, index) => {
    const low = band.overCents / 100;
    const high = index + 1 < brackets.length ? brackets[index + 1].overCents / 100 : Infinity;
    if (amount > low) total += Math.floor(((Math.min(amount, high) - low) * band.rateBp + 5000) / 10000);
  });
  return total;
}

export function orTax(amount, rule, filingStatus) {
  const income = positive(amount);
  const brackets = JOINT_RATES.has(filingStatus) ? rule.brackets.J : rule.brackets.S;
  if (income < rule.tableBelow) {
    const band = [...rule.tableBands].reverse().find((item) => income >= item.from);
    const low = band.from + Math.floor((income - band.from) / band.width) * band.width;
    return bandTax(low + band.width / 2, brackets);
  }
  const index = brackets.findLastIndex((band) => income >= band.overCents / 100);
  const anchor = Math.max(rule.tableBelow, brackets[index].overCents / 100);
  return bandTax(anchor, brackets) + Math.floor(((income - anchor) * brackets[index].rateBp + 5000) / 10000);
}

function federalTaxSubtraction(ctx, rule) {
  const lines = ctx.federal.lines;
  const schedule2 = ctx.federal.schedules?.[2] || {};
  const w1 = whole(lines['22']);
  const w2 = whole(schedule2['1a']);
  const w3 = Math.max(0, w1 - w2);
  const w4 = whole(schedule2['8']) + whole(schedule2['16']) + whole(schedule2['17']);
  const w5 = w3 + w4;
  const w6 = whole(lines['29']);
  const w7 = whole(lines['30']);
  const w8 = 0;
  const w9 = w6 + w7 + w8;
  const w10 = Math.max(0, w5 - w9);
  const agi = ctx.income.agi;
  const status = ctx.filingStatus;
  const rows = status === 'mfs' ? rule.phaseOut.mfs : status === 'single' ? rule.phaseOut.single : rule.phaseOut.joint;
  const found = [...rows].reverse().find((row) => agi >= row.atLeast);
  const w11 = found ? found.amount : status === 'mfs' ? rule.maximum.mfs : rule.maximum.other;
  const w12 = Math.min(w10, w11);
  return { amount: w12, worksheet: lineTable({ 1: w1, 2: w2, 3: w3, 4: w4, 5: w5, 6: w6, 7: w7, 8: w8, 9: w9, 10: w10, 11: w11, 12: w12 }) };
}

function earnedIncome(ctx) {
  return ctx.income.wages + ctx.income.businessIncome;
}

function standardDeduction(ctx, deductions, answers) {
  const status = ctx.filingStatus;
  let base = byStatus(deductions.standard, status);
  if (status === 'mfs' && answers.spouseItemizes === true) base = 0;
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) base = Math.min(base, Math.max(deductions.dependentFiler.minimum, earnedIncome(ctx) + deductions.dependentFiler.earnedPlus));
  const boxes = ctx.filers.reduce((count, item) => count + (item.age !== null && item.age >= 65 ? 1 : 0) + (item.blind ? 1 : 0), 0);
  const extra = status === 'single' || status === 'hoh' ? deductions.ageOrBlind.single : deductions.ageOrBlind.other;
  return { amount: base + boxes * extra, boxes };
}

function scheduleORA(ctx, deductions, agi, creditedOtherTax) {
  const items = ctx.itemized;
  const line1 = items.medicalPaid;
  const line2 = agi;
  const line3 = rateOf(Math.max(0, agi), deductions.medicalFloorBasisPoints);
  const line4 = Math.max(0, line1 - line3);
  const otherStateWithheld = sum(ctx.w2.filter((row) => row.state && row.state !== 'OR'), (row) => row.stateWithheld);
  const localWithheld = sum(ctx.w2, (row) => row.localWithheld);
  const line5 = items.generalSalesTax > 0 ? 0 : Math.max(0, otherStateWithheld - creditedOtherTax) + localWithheld;
  const line6 = items.realEstateTaxes;
  const line7 = items.personalPropertyTaxes;
  const line9 = Math.min(line5 + line6 + line7, ctx.filingStatus === 'mfs' ? deductions.saltLimit.mfs : deductions.saltLimit.other);
  const line11 = line9;
  const line12 = items.mortgageInterest;
  const line17 = line12;
  const line18 = items.charityCash;
  const line19 = items.charityNonCash;
  const line21 = line18 + line19;
  const line22 = items.otherItemized;
  const line23 = line4 + line11 + line17 + line21 + line22;
  return { total: line23, lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 9: line9, 11: line11, 12: line12, 17: line17, 18: line18, 19: line19, 21: line21, 22: line22, 23: line23 }) };
}

function exemptions(ctx, answers) {
  const regular = (role) => (ctx.filers.some((item) => item.role === role && !item.canBeClaimedAsDependent) ? 1 : 0);
  const severe = Math.min(ctx.filers.length, positive(answers.severeDisability));
  const disabledChildren = Math.min(ctx.dependents.length, positive(answers.disabledChildren));
  const a = regular('taxpayer');
  const b = ctx.filingStatus === 'mfj' ? regular('spouse') : 0;
  const c = ctx.dependents.length;
  return { a, b, c, severe, d: disabledChildren, e: a + b + c + severe + disabledChildren };
}

function exemptionCredit(ctx, credits, count) {
  const agi = ctx.income.agi;
  const limit = ctx.filingStatus === 'single' || ctx.filingStatus === 'mfs' ? credits.exemptionAgiLimit.single : credits.exemptionAgiLimit.other;
  const regular = agi > limit ? 0 : count.a + count.b + count.c;
  const special = agi > credits.specialExemptionAgiLimit ? 0 : count.severe + count.d;
  return (regular + special) * credits.exemptionCredit;
}

function retirementCredit(ctx, credits, oregonPension, checks) {
  const rule = credits.retirement;
  const joint = ctx.filingStatus === 'mfj';
  if (!ctx.filers.some((item) => item.age !== null && item.age >= rule.age) || oregonPension <= 0) return 0;
  const household = ctx.income.agi - ctx.income.socialSecurityTaxable + ctx.income.taxExemptInterest;
  const benefits = ctx.income.socialSecurityBenefits;
  const householdLimit = joint ? rule.householdLimit.mfj : rule.householdLimit.other;
  const benefitLimit = joint ? rule.socialSecurityLimit.mfj : rule.socialSecurityLimit.other;
  if (household >= householdLimit || benefits >= benefitLimit || household + benefits >= householdLimit) return 0;
  const line6 = Math.max(0, (joint ? rule.base.mfj : rule.base.other) - benefits);
  const line9 = Math.max(0, household - (joint ? rule.householdBase.mfj : rule.householdBase.other));
  const line10 = Math.max(0, line6 - line9);
  const credit = rateOf(Math.min(oregonPension, line10), rule.basisPoints);
  if (credit) checks.push(check('warning', 'OR_RETIREMENT_CREDIT_HOUSEHOLD_INCOME', 'The retirement income credit uses household income, which also counts nontaxable income such as nontaxable pensions and some public assistance; MyCA used federal AGI less taxable Social Security plus tax-exempt interest.', 'Check household income with Publication OR-17.'));
  return credit;
}

function kidsCredit(ctx, credits, qualifyingIncome) {
  const rule = credits.kids;
  if (ctx.filingStatus === 'mfs') return { amount: 0, income: qualifyingIncome };
  const children = Math.min(rule.maxChildren, ctx.dependents.filter((item) => item.age !== null && item.age < rule.underAge).length);
  if (!children) return { amount: 0, income: qualifyingIncome };
  if (qualifyingIncome >= rule.phaseStart + rule.phaseRange) return { amount: 0, income: qualifyingIncome };
  const line8 = children * rule.perChild;
  const line6 = Math.max(0, qualifyingIncome - rule.phaseStart);
  const line7 = Math.round((line6 / rule.phaseRange) * 100) / 100;
  const line9 = Math.round((Math.round(line7 * 100) * line8) / 100);
  return { amount: Math.max(0, line8 - line9), income: qualifyingIncome, children, line7 };
}

function lossAddBack(ctx, credits) {
  const losses = Math.max(0, -ctx.income.capitalGain) + Math.max(0, -ctx.income.businessIncome);
  return Math.max(0, losses - credits.kids.lossAllowance);
}

function eitc(ctx, credits) {
  const federal = whole(ctx.federal.lines['27']);
  if (!federal) return 0;
  const young = ctx.dependents.some((item) => item.age !== null && item.age < credits.eitcYoungChildUnderAge);
  return rateOf(federal, young ? credits.eitcYoungChildBasisPoints : credits.eitcBasisPoints);
}

function kicker(answers, credits, checks) {
  if (!credits.kickerPerHundredThousand) return 0;
  if (answers.filedPriorYearReturn === undefined) {
    checks.push(check('warning', 'OR_KICKER', 'Oregon is returning a 9.863% surplus credit (the kicker) on 2025 returns to people who filed a 2024 Oregon return with tax due.', 'Answer the kicker questions: whether you filed a 2024 Oregon return and your 2024 tax liability.'));
    return 0;
  }
  if (!answers.filedPriorYearReturn || answers.donateKicker === true) return 0;
  return Math.round((positive(answers.priorYearOregonTax) * credits.kickerPerHundredThousand) / 100000);
}

function oneA(ctx, key) {
  return whole(ctx.federal.schedules?.['1-A']?.[key]);
}

function commonChecks(ctx, filing, checks) {
  const answers = filing.answers;
  if (ctx.income.taxExemptInterest > 0 && answers.oregonMunicipalInterest === undefined && filing.residency !== 'nonresident') checks.push(check('error', 'OR_MUNICIPAL_INTEREST', 'Oregon taxes interest on bonds of other states and their localities.', 'Answer how much of your tax-exempt interest came from bonds issued outside Oregon (0 if none).'));
  if (filing.residency !== 'nonresident') checks.push(check('info', 'OR_LOCAL_INCOME_TAXES', 'The Portland Metro Supportive Housing Services tax and the Multnomah County Preschool for All tax are filed on a separate combined return with the City of Portland Revenue Division, not on the Oregon return. Check whether you owe them if you live or work in the Metro area or Multnomah County.'));
  checks.push(check('info', 'OR_TRANSIT_TAX', 'The Oregon statewide transit tax is withheld by employers; if an out-of-state employer did not withhold it from Oregon wages, file Form OR-STI. TriMet and Lane Transit self-employment taxes are separate returns.'));
  if (positive(ctx.answers.childCareExpenses) > 0) checks.push(check('warning', 'OR_WFHDC', 'You paid child or dependent care: the Oregon working family household and dependent care credit (Schedule OR-WFHDC) may apply; MyCA does not work it out.', 'Prepare Schedule OR-WFHDC and claim it on Schedule OR-ASC.'));
  if (ctx.answers.marketplaceCoverage === true || ctx.answers.marketplaceCoverage === 'yes') checks.push(check('warning', 'OR_PREMIUM_TAX_CREDIT', 'The federal tax subtraction is reduced by the premium tax credit on Form 8962, which MyCA does not prepare.', 'Enter the Form 8962 amounts once prepared.'));
}

function residentReturn(ctx, filing, rule, fedRule, deductions, credits, checks) {
  const answers = filing.answers;
  const income = ctx.income;
  const count = exemptions(ctx, answers);
  const line7 = income.agi;
  const line8 = positive(answers.oregonMunicipalInterest);
  const line9 = line7 + line8;
  const fed = federalTaxSubtraction(ctx, fedRule);
  const line10 = fed.amount;
  const line11 = income.socialSecurityTaxable;
  const line12 = income.stateRefundTaxable;
  if (line12) checks.push(check('info', 'OR_STATE_REFUND', 'MyCA treated the state refund on your federal return as an Oregon refund, which Oregon subtracts; a refund from another state is not subtracted.'));
  const asc = { 315: income.usObligationInterest, 390: oneA(ctx, '13'), 391: oneA(ctx, '21'), 392: oneA(ctx, '30') };
  const line13 = sum(Object.values(asc));
  const line14 = line10 + line11 + line12 + line13;
  const line15 = line9 - line14;
  const otherStates = (filing.otherStates || []).filter((item) => !credits.otherStateExcluded.includes(item.state));
  const ora = scheduleORA(ctx, deductions, line7, sum(otherStates, (item) => item.tax));
  const std = standardDeduction(ctx, deductions, answers);
  const line16 = ora.total;
  const line17 = std.amount;
  const itemize = line16 > line17;
  const line18 = Math.max(line16, line17);
  const line19 = Math.max(0, line15 - line18);
  const line20 = orTax(line19, rule, ctx.filingStatus);
  const line24 = line20;
  const line25 = exemptionCredit(ctx, credits, count);
  const politicalLimit = ctx.filingStatus === 'mfj' ? credits.politicalAgiLimit.mfj : credits.politicalAgiLimit.other;
  const line26 = line7 <= politicalLimit ? Math.min(positive(answers.politicalContributions), ctx.filingStatus === 'mfj' ? credits.politicalMaximum.mfj : credits.politicalMaximum.other) : 0;
  let room = Math.max(0, line24 - line25 - line26);
  const pension = income.iraTaxable + income.pensionTaxable;
  const c811 = Math.min(room, retirementCredit(ctx, credits, pension, checks));
  room -= c811;
  const modifiedIncome = line9 - line11 - line12 - line13;
  const sheets = otherStates.map((other) => {
    const mutual = Math.min(Math.max(0, modifiedIncome), positive(other.income));
    const limit = modifiedIncome > 0 ? Math.round((line24 * mutual) / modifiedIncome) : 0;
    return { state: other.state, mutual, limit, tax: positive(other.tax), credit: Math.min(limit, positive(other.tax)) };
  });
  for (const other of (filing.otherStates || []).filter((item) => credits.otherStateExcluded.includes(item.state))) checks.push(check('info', 'OR_CREDIT_FROM_OTHER_STATE', `${other.state} gives Oregon residents the credit for tax on income taxed by both states, so claim it on the ${other.state} nonresident return, not on the Oregon return.`));
  const c802 = Math.min(room, sum(sheets, (item) => item.credit));
  const line27 = c811 + c802;
  const line28 = line25 + line26 + line27;
  const line29 = Math.max(0, line24 - line28);
  const line31 = line29;
  const line32 = kicker(answers, credits, checks);
  const line37 = eitc(ctx, credits);
  const kids = kidsCredit(ctx, credits, line15 + asc[390] + asc[391] + asc[392] + lossAddBack(ctx, credits));
  const line38 = kids.amount;
  const lines = lineTable({ '6a': count.a + (count.severe > 0 ? 1 : 0), '6b': count.b + (count.severe > 1 ? 1 : 0), '6c': count.c, '6d': count.d, '6e': count.e, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: 0, 22: 0, 23: 0, 24: line24, 25: line25, 26: line26, 27: line27, 28: line28, 29: line29, 30: 0, 31: line31, 32: line32, 33: filing.payments.withheld, 34: 0, 35: filing.payments.estimated + filing.payments.extension, 37: line37, 38: line38, 39: 0, 40: line32 + filing.payments.withheld + filing.payments.estimated + filing.payments.extension + line37 + line38 });
  const schedules = { 'Federal tax liability subtraction worksheet': fed.worksheet };
  if (line8 || line13 || line27) schedules['OR-ASC'] = lineTable({ A5: line8, ...(asc[315] ? { 'B315': asc[315] } : {}), ...(asc[390] ? { 'B390': asc[390] } : {}), ...(asc[391] ? { 'B391': asc[391] } : {}), ...(asc[392] ? { 'B392': asc[392] } : {}), B7: line13, ...(c811 ? { 'D811': c811 } : {}), ...(c802 ? { 'D802': c802 } : {}), D16: line27 });
  if (itemize) schedules['OR-A'] = ora.lines;
  for (const sheet of sheets) schedules[`Credit 802 ${sheet.state}`] = lineTable({ mutuallyTaxedIncome: sheet.mutual, oregonIncome: modifiedIncome, oregonTax: line24, limit: sheet.limit, otherStateTax: sheet.tax, credit: sheet.credit });
  if (line38) schedules['Kids Credit worksheet'] = lineTable({ 4: kids.income, 7: kids.line7, '8a': kids.children, 8: kids.children * credits.kids.perChild, 10: line38 });
  const items = [];
  if (line25) items.push({ code: 'OR_EXEMPTION', label: 'Exemption credit', amount: Math.min(line25, line24) });
  if (line26) items.push({ code: 'OR_POLITICAL', label: 'Political contribution credit', amount: Math.min(line26, Math.max(0, line24 - line25)) });
  if (c811) items.push({ code: 'OR_811', label: 'Retirement income credit', amount: c811 });
  if (c802) items.push({ code: 'OR_802', label: 'Credit for income taxes paid to another state', amount: c802 });
  const refundable = [...(line32 ? [{ code: 'OR_KICKER', label: 'Oregon surplus credit (kicker)', amount: line32 }] : []), ...(line37 ? [{ code: 'OR_EITC', label: 'Oregon earned income credit', amount: line37 }] : []), ...(line38 ? [{ code: 'OR_KIDS', label: 'Oregon Kids Credit', amount: line38 }] : [])];
  return { form: 'OR-40', lines, schedules, stateIncome: line15, taxableIncome: line19, taxBeforeCredits: line24, nonrefundableCredits: items, otherStateCredit: c802, otherTaxes: [], totalTax: line31, refundableCredits: refundable, checks };
}

function npReturn(ctx, filing, rule, fedRule, deductions, credits, checks) {
  const answers = filing.answers;
  const income = ctx.income;
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const nonresident = !partYear;
  const count = exemptions(ctx, answers);
  const F = { 7: income.wages, 8: income.taxableInterest, 9: income.ordinaryDividends, 10: income.stateRefundTaxable, 11: 0, 12: income.businessIncome, 13: income.capitalGain, 14: 0, 15: income.iraTaxable, 16: income.pensionTaxable, 17: 0, 18: 0, 19: income.socialSecurityTaxable + income.unemployment + income.otherIncome };
  const S = { 7: whole(sourced.wages), 8: whole(sourced.taxableInterest), 9: whole(sourced.ordinaryDividends), 10: whole(sourced.stateRefundTaxable), 11: 0, 12: whole(sourced.businessIncome), 13: whole(sourced.capitalGain), 14: 0, 15: whole(sourced.iraTaxable), 16: whole(sourced.pensionTaxable), 17: 0, 18: 0, 19: whole(sourced.socialSecurityTaxable) + whole(sourced.unemployment) + whole(sourced.otherIncome) };
  F[20] = sum([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((key) => F[key]));
  S[20] = sum([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((key) => S[key]));
  const adj = income.adjustmentItems;
  const compShare = F[7] + F[12] > 0 ? Math.max(0, Math.min(1, (S[7] + S[12]) / (F[7] + F[12]))) : 0;
  const incomeShare = F[20] > 0 ? Math.max(0, Math.min(1, S[20] / F[20])) : 0;
  const seShare = F[12] > 0 ? Math.max(0, Math.min(1, S[12] / F[12])) : 0;
  F[21] = adj.ira + adj.seRetirement; S[21] = Math.round(adj.ira * compShare + adj.seRetirement * seShare);
  F[22] = adj.educator + adj.studentLoan; S[22] = Math.round(F[22] * incomeShare);
  F[23] = 0; S[23] = 0;
  F[24] = adj.seTaxDeduction; S[24] = Math.round(F[24] * seShare);
  F[25] = adj.seHealth; S[25] = Math.round(F[25] * seShare);
  F[26] = 0; S[26] = 0;
  F[27] = Math.max(0, income.adjustments - F[21] - F[22] - F[24] - F[25]); S[27] = Math.round(F[27] * incomeShare);
  F[28] = sum([21, 22, 23, 24, 25, 26, 27].map((key) => F[key]));
  S[28] = sum([21, 22, 23, 24, 25, 26, 27].map((key) => S[key]));
  if (S[28]) checks.push(check('warning', 'OR_NP_ADJUSTMENTS', 'Oregon allows the part of each federal adjustment that belongs to the Oregon column; MyCA split IRA, self-employment, education and other adjustments by your share of Oregon income.', 'Check lines 21S through 27S.'));
  F[29] = F[20] - F[28];
  S[29] = S[20] - S[28];
  F[30] = positive(answers.oregonMunicipalInterest);
  S[30] = partYear ? Math.round(F[30] * filing.share) : 0;
  F[31] = F[29] + F[30];
  S[31] = S[29] + S[30];
  F[32] = income.socialSecurityTaxable;
  S[32] = whole(sourced.socialSecurityTaxable);
  F[33] = income.usObligationInterest + income.stateRefundTaxable;
  S[33] = whole(sourced.usObligationInterest) + whole(sourced.stateRefundTaxable);
  F[34] = F[31] - F[32] - F[33];
  S[34] = S[31] - S[32] - S[33];
  let line35;
  if (F[34] <= 0 && S[34] > 0) line35 = 1;
  else if (F[34] < 0 && S[34] < 0) line35 = -S[34] <= -F[34] ? 1 : Math.round((-F[34] / -S[34]) * 1000) / 1000;
  else line35 = S[34] <= 0 ? 0 : ratio(S[34], F[34], { places: 3 });
  const line36 = partYear ? F[34] : S[34];
  const ora = scheduleORA(ctx, deductions, income.agi, 0);
  const std = standardDeduction(ctx, deductions, answers);
  const line37 = ora.total;
  const line38 = std.amount;
  const itemize = line37 > line38;
  const line39 = Math.max(line37, line38);
  const fed = federalTaxSubtraction(ctx, fedRule);
  const line40 = fed.amount;
  const modifications = partYear ? { 656: oneA(ctx, '13'), 657: oneA(ctx, '21'), 658: oneA(ctx, '30') } : { 658: oneA(ctx, '30') };
  const line41 = sum(Object.values(modifications));
  const tipsOvertime = oneA(ctx, '13') + oneA(ctx, '21');
  if (nonresident && tipsOvertime && answers.oregonTipsOvertime === undefined) checks.push(check('error', 'OR_NONRESIDENT_TIPS_OVERTIME', 'As a nonresident you may deduct only the tips and overtime earned while working in Oregon (Schedule OR-ASC-NP, Section E).', 'Answer how much of your federal tips and overtime deduction is from work in Oregon (0 if none).'));
  const sectionE = nonresident ? Math.min(tipsOvertime, positive(answers.oregonTipsOvertime)) : 0;
  let lines;
  let taxableIncome;
  let taxBefore;
  let afterCredits;
  const exemptionFull = exemptionCredit(ctx, credits, count);
  const exemption = applyRatio(exemptionFull, line35, 3);
  const fedEitc = eitc(ctx, credits);
  const eitcAmount = applyRatio(fedEitc, line35, 3);
  const kids = kidsCredit(ctx, credits, F[34] - line40 + lossAddBack(ctx, credits));
  const kidsAmount = applyRatio(kids.amount, line35, 3);
  const kick = kicker(answers, credits, checks);
  const payments = filing.payments;
  const pension = whole(sourced.iraTaxable) + whole(sourced.pensionTaxable);
  let c811 = 0;
  if (partYear) {
    const line42 = line39 + line40 + line41;
    const line43 = Math.max(0, line36 - line42);
    const line44 = orTax(line43, rule, ctx.filingStatus);
    const line45 = applyRatio(line44, line35, 3);
    const line49 = line45;
    c811 = Math.min(Math.max(0, line49 - exemption), retirementCredit(ctx, credits, pension, checks));
    const line51 = c811;
    const line52 = exemption + line51;
    const line53 = Math.max(0, line49 - line52);
    const line55 = line53;
    lines = lineTable({ '6a': count.a + (count.severe > 0 ? 1 : 0), '6b': count.b + (count.severe > 1 ? 1 : 0), '6c': count.c, '6d': count.d, '6e': count.e, ...columns(F, S), 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: 0, 47: 0, 48: 0, 49: line49, 50: exemption, 51: line51, 52: line52, 53: line53, 54: 0, 55: line55, 56: kick, 57: payments.withheld, 58: 0, 59: payments.estimated + payments.extension, 61: eitcAmount, 62: kidsAmount, 63: 0, 64: kick + payments.withheld + payments.estimated + payments.extension + eitcAmount + kidsAmount });
    taxableIncome = line43;
    taxBefore = line49;
    afterCredits = line55;
  } else {
    const line42 = applyRatio(line39 + line40 + line41, line35, 3);
    const line43 = sectionE;
    const line44 = line42 + line43;
    const line45 = Math.max(0, line36 - line44);
    const line46 = orTax(line45, rule, ctx.filingStatus);
    const line50 = line46;
    c811 = Math.min(Math.max(0, line50 - exemption), retirementCredit(ctx, credits, pension, checks));
    const line52 = c811;
    const line53 = exemption + line52;
    const line54 = Math.max(0, line50 - line53);
    const line56 = line54;
    lines = lineTable({ '6a': count.a + (count.severe > 0 ? 1 : 0), '6b': count.b + (count.severe > 1 ? 1 : 0), '6c': count.c, '6d': count.d, '6e': count.e, ...columns(F, S), 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46, 47: 0, 48: 0, 49: 0, 50: line50, 51: exemption, 52: line52, 53: line53, 54: line54, 55: 0, 56: line56, 57: kick, 58: payments.withheld, 59: 0, 60: payments.estimated + payments.extension, 62: eitcAmount, 63: kidsAmount, 64: 0, 65: kick + payments.withheld + payments.estimated + payments.extension + eitcAmount + kidsAmount });
    taxableIncome = line45;
    taxBefore = line50;
    afterCredits = line56;
  }
  if (partYear) checks.push(check('warning', 'OR_PART_YEAR_OTHER_STATE_CREDIT', 'A part-year resident may claim the credit for income taxes paid to another state (code 802) on Schedule OR-ASC-NP for income taxed by both while an Oregon resident; MyCA does not work it out for part-year residents.', 'Work out credit 802 with the other state\'s return.'));
  const schedules = { 'Federal tax liability subtraction worksheet': fed.worksheet };
  if (line41 || sectionE || c811) schedules['OR-ASC-NP'] = lineTable({ ...Object.fromEntries(Object.entries(modifications).filter(([, value]) => value).map(([code, value]) => [`D${code}`, value])), D7: line41, ...(sectionE ? { E7: sectionE } : {}), ...(c811 ? { G811: c811 } : {}) });
  if (itemize) schedules['OR-A'] = ora.lines;
  const items = [];
  if (exemption) items.push({ code: 'OR_EXEMPTION', label: 'Exemption credit', amount: Math.min(exemption, taxBefore) });
  if (c811) items.push({ code: 'OR_811', label: 'Retirement income credit', amount: c811 });
  const refundable = [...(kick ? [{ code: 'OR_KICKER', label: 'Oregon surplus credit (kicker)', amount: kick }] : []), ...(eitcAmount ? [{ code: 'OR_EITC', label: 'Oregon earned income credit', amount: eitcAmount }] : []), ...(kidsAmount ? [{ code: 'OR_KIDS', label: 'Oregon Kids Credit', amount: kidsAmount }] : [])];
  return { form: partYear ? 'OR-40-P' : 'OR-40-N', lines, schedules, stateIncome: S[34], taxableIncome, taxBeforeCredits: taxBefore, nonrefundableCredits: items, otherStateCredit: 0, otherTaxes: [], totalTax: afterCredits, refundableCredits: refundable, checks };
}

function columns(F, S) {
  const out = {};
  for (let key = 7; key <= 34; key += 1) {
    out[`${key}F`] = F[key];
    out[`${key}S`] = S[key];
  }
  return out;
}

const EXEMPTION_LABELS = Object.freeze({
  '6a': 'Exemption credits for yourself',
  '6b': 'Exemption credits for your spouse',
  '6c': 'Total number of dependents',
  '6d': 'Dependent children with a qualifying disability',
  '6e': 'Total exemptions',
});

const OR40_LABELS = Object.freeze({
  ...EXEMPTION_LABELS,
  7: 'Federal adjusted gross income',
  8: 'Total additions (Schedule OR-ASC)',
  9: 'Income after additions',
  10: 'Federal tax liability',
  11: 'Social Security amount from federal return',
  12: 'Oregon income tax refund included in federal income',
  13: 'Total subtractions (Schedule OR-ASC)',
  14: 'Total subtractions',
  15: 'Income after subtractions',
  16: 'Oregon itemized deductions',
  17: 'Standard deduction',
  18: 'Larger of line 16 or 17',
  19: 'Oregon taxable income',
  20: 'Tax',
  21: 'Interest on certain installment sales',
  22: 'Total tax recaptures (Schedule OR-ASC)',
  23: 'Total additions to tax',
  24: 'Total tax before credits',
  25: 'Exemption credit',
  26: 'Political contribution credit',
  27: 'Total standard credits (Schedule OR-ASC)',
  28: 'Total standard credits',
  29: 'Tax minus standard credits',
  30: 'Total carryforward credits used this year',
  31: 'Tax after standard and carryforward credits',
  32: 'Kicker amount',
  33: 'Oregon income tax withheld',
  34: 'Prior-year refund applied as estimated payment',
  35: 'Estimated tax payments',
  37: 'Earned income credit',
  38: 'Oregon Kids Credit',
  39: 'Total refundable credits (Schedule OR-ASC)',
  40: 'Total payments and refundable credits',
});

const NP_COLUMN_LABELS = Object.freeze({
  7: 'Wages, salaries and other pay for work',
  8: 'Interest income',
  9: 'Dividend income',
  10: 'State and local income tax refunds',
  11: 'Alimony received',
  12: 'Business income or loss',
  13: 'Capital gain or loss',
  14: 'Other gains or losses',
  15: 'IRA distributions',
  16: 'Pensions and annuities',
  17: 'Schedule E income or loss',
  18: 'Farm income or loss',
  19: 'Social Security, unemployment and other income',
  20: 'Total income',
  21: 'IRA or SEP and SIMPLE contributions',
  22: 'Education deductions',
  23: 'Moving expenses',
  24: 'Deduction for self-employment tax',
  25: 'Self-employed health insurance deduction',
  26: 'Alimony paid',
  27: 'Other adjustments (Schedule OR-ASC-NP)',
  28: 'Total adjustments',
  29: 'Income after adjustments',
  30: 'Total additions (Schedule OR-ASC-NP)',
  31: 'Income after additions',
  32: 'Social Security and tier 1 railroad benefits',
  33: 'Total subtractions (Schedule OR-ASC-NP)',
  34: 'Income after subtractions',
});

const NP_SHARED_LABELS = Object.freeze({
  ...EXEMPTION_LABELS,
  ...Object.fromEntries(Object.entries(NP_COLUMN_LABELS).flatMap(([key, text]) => [[`${key}F`, `${text} (federal)`], [`${key}S`, `${text} (Oregon)`]])),
  35: 'Oregon percentage',
  37: 'Oregon itemized deductions',
  38: 'Standard deduction',
  39: 'Larger of line 37 or 38',
  40: 'Federal tax liability',
  41: 'Total modifications (Schedule OR-ASC-NP)',
});

const OR40P_LABELS = Object.freeze({
  ...NP_SHARED_LABELS,
  36: 'Amount from line 34F',
  42: 'Add lines 39, 40 and 41',
  43: 'Taxable income',
  44: 'Tax',
  45: 'Oregon income tax (line 44 times Oregon percentage)',
  46: 'Interest on certain installment sales',
  47: 'Total tax recaptures (Schedule OR-ASC-NP)',
  48: 'Total additions to tax',
  49: 'Total tax before credits',
  50: 'Exemption credit',
  51: 'Total standard credits (Schedule OR-ASC-NP)',
  52: 'Total standard credits',
  53: 'Tax minus standard credits',
  54: 'Total carryforward credits used this year',
  55: 'Tax after standard and carryforward credits',
  56: 'Kicker amount',
  57: 'Oregon income tax withheld',
  58: 'Prior-year refund applied as estimated payment',
  59: 'Estimated tax payments',
  61: 'Earned income credit',
  62: 'Oregon Kids Credit',
  63: 'Total refundable credits (Schedule OR-ASC-NP)',
  64: 'Total payments and refundable credits',
});

const OR40N_LABELS = Object.freeze({
  ...NP_SHARED_LABELS,
  36: 'Amount from line 34S',
  42: 'Deductions and modifications times Oregon percentage',
  43: 'Modifications not multiplied by the Oregon percentage',
  44: 'Total deductions and modifications',
  45: 'Oregon taxable income',
  46: 'Tax',
  47: 'Interest on certain installment sales',
  48: 'Total tax recaptures (Schedule OR-ASC-NP)',
  49: 'Total additions to tax',
  50: 'Total tax before credits',
  51: 'Exemption credit',
  52: 'Total standard credits (Schedule OR-ASC-NP)',
  53: 'Total standard credits',
  54: 'Tax minus standard credits',
  55: 'Total carryforward credits used this year',
  56: 'Tax after standard and carryforward credits',
  57: 'Kicker amount',
  58: 'Oregon income tax withheld',
  59: 'Prior-year refund applied as estimated payment',
  60: 'Estimated tax payments',
  62: 'Earned income credit',
  63: 'Oregon Kids Credit',
  64: 'Total refundable credits (Schedule OR-ASC-NP)',
  65: 'Total payments and refundable credits',
});

const LABELS = Object.freeze({ 'full-year': OR40_LABELS, 'part-year': OR40P_LABELS, nonresident: OR40N_LABELS });

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const fedRule = reader.read('federal-tax-subtraction');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  if (!rule || !fedRule || !deductions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Oregon figures for ${ctx.taxYear}.` };
  const checks = [];
  commonChecks(ctx, filing, checks);
  if (filing.residency === 'full-year') return residentReturn(ctx, filing, rule, fedRule, deductions, credits, checks);
  return npReturn(ctx, filing, rule, fedRule, deductions, credits, checks);
}

export const STATE = Object.freeze({
  code: 'OR',
  name: 'Oregon',
  built: true,
  forms: Object.freeze({ resident: 'OR-40', partYear: 'OR-40-P', nonresident: 'OR-40-N' }),
  labels: (taxYear, residency) => LABELS[residency] || OR40_LABELS,
  questions: Object.freeze([
    Object.freeze({ id: 'oregonMunicipalInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from bonds of states and localities other than Oregon', help: 'Part of the tax-exempt interest on your federal return; Oregon adds it back. Enter 0 if none.' }),
    Object.freeze({ id: 'filedPriorYearReturn', kind: 'yesno', text: 'Did you file a 2024 Oregon income tax return?', help: 'The 2025 kicker goes to people who filed a 2024 Oregon return with tax due.' }),
    Object.freeze({ id: 'priorYearOregonTax', when: { answer: { id: 'filedPriorYearReturn', in: [true] } }, kind: 'amount', text: 'Your 2024 Oregon tax liability for the kicker', help: 'From the kicker worksheet in the 2025 instructions: 2024 tax before credits less credits other than credits for tax paid to another state (Revenue Online shows the amount).' }),
    Object.freeze({ id: 'donateKicker', when: { answer: { id: 'filedPriorYearReturn', in: [true] } }, kind: 'yesno', text: 'Donate your kicker to the Oregon State School Fund?', help: 'If yes, the kicker is not credited to you.' }),
    Object.freeze({ id: 'politicalContributions', when: { residency: ['full-year'] }, kind: 'amount', text: 'Cash contributions to Oregon political parties, candidates or political action committees', help: 'Credit up to $50 ($100 on a joint return) if federal AGI is not more than $75,000 ($150,000 joint).' }),
    Object.freeze({ id: 'severeDisability', kind: 'count', text: 'Number of you and your spouse with a severe disability', help: 'Each gives an extra exemption credit if federal AGI is $100,000 or less.' }),
    Object.freeze({ id: 'disabledChildren', when: { has: ['dependents'] }, kind: 'count', text: 'Number of dependent children with a qualifying disability', help: 'Each gives an extra exemption credit if federal AGI is $100,000 or less.' }),
    Object.freeze({ id: 'spouseItemizes', when: { filingStatus: ['mfs'] }, kind: 'yesno', text: 'Married filing separately: does your spouse itemize on their Oregon return?', help: 'If so, your Oregon standard deduction is $0.' }),
    Object.freeze({ id: 'oregonTipsOvertime', when: { residency: ['nonresident'] }, kind: 'amount', text: 'Nonresidents: part of your federal tips and overtime deduction from work in Oregon', help: 'Only tips and overtime earned while working in Oregon are deducted (Schedule OR-ASC-NP, Section E).' }),
  ]),
  notCovered: Object.freeze([
    'Oregon additions and subtractions other than out-of-state bond interest, U.S. government interest, Social Security, the Oregon refund and the federal tips, overtime and car loan deductions (for example the federal pension subtraction, 529 and ABLE contributions, depreciation and health savings account items)',
    'Schedule OR-WFHDC working family household and dependent care credit and other refundable credits on Schedule OR-ASC',
    'Carryforward credits (Section E) and other standard credits, including the political contribution credit for part-year residents and nonresidents',
    'Credit for income taxes paid to another state for part-year residents and pass-through entity tax credits (code 815)',
    'Oregon qualified business income reduced tax rate (OR-PTE), farm income averaging (OR-FIA) and farm capital gain rates',
    'Portland Metro Supportive Housing Services and Multnomah County Preschool for All personal income taxes (separate City of Portland return)',
    'Statewide transit tax not withheld (Form OR-STI) and TriMet and Lane Transit self-employment taxes',
    'Interest on underpayment of estimated tax (Form OR-10), charitable checkoffs and Oregon 529 deposits from the refund',
  ]),
  compute,
});
