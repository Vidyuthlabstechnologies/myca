import { whole, positive, sum, bracketTax, rateOf, ratio, check, byStatus, lineTable, yesNo } from '../state-kit.mjs';

const MONTH_DAYS = (year, month) => new Date(Date.UTC(Number(year), month + 1, 0)).getUTCDate();

export function residentMonths(taxYear, from, to) {
  const start = from || `${taxYear}-01-01`;
  const end = to || `${taxYear}-12-31`;
  let months = 0;
  for (let month = 0; month < 12; month += 1) {
    const first = `${taxYear}-${String(month + 1).padStart(2, '0')}-01`;
    const last = `${taxYear}-${String(month + 1).padStart(2, '0')}-${String(MONTH_DAYS(taxYear, month)).padStart(2, '0')}`;
    const lo = start > first ? start : first;
    const hi = end < last ? end : last;
    if (lo > hi) continue;
    const days = (Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / 86400000 + 1;
    if (days > 15) months += 1;
  }
  return months;
}

function standardDeduction(ctx, rule) {
  const status = ctx.filingStatus;
  const base = byStatus(rule.standard, status);
  const married = status === 'mfj' || status === 'mfs' || status === 'qss';
  const perBox = married ? rule.additional.married : rule.additional.unmarried;
  const filers = status === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer');
  const age65 = filers.filter((item) => item.age >= 65).length;
  const blind = filers.filter((item) => item.blind).length;
  const dependentFiler = filers.some((item) => item.canBeClaimedAsDependent);
  const spouseItemizes = status === 'mfs' && yesNo(ctx.answers.spouseItemizes);
  const boxes = age65 + blind;
  let amount;
  if (spouseItemizes) amount = 0;
  else if (dependentFiler) {
    const earned = Math.max(0, ctx.income.wages + Math.max(0, ctx.income.businessIncome));
    amount = Math.min(base, Math.max(rule.dependentFiler.minimum, earned + rule.dependentFiler.earnedPlus)) + boxes * perBox;
  } else amount = base + boxes * perBox;
  return { amount, age65, blind, dependentFiler, base, perBox };
}

function itemizedLines(ctx, rule) {
  const scheduleA = ctx.federal.schedules?.A;
  if (!scheduleA) return { 13: 0, 14: 0, 15: 0 };
  const line13 = whole(scheduleA['17']);
  const limit = byStatus(rule.saltLine5dLimit, ctx.filingStatus);
  const line14 = whole(scheduleA['5d']) <= limit ? whole(scheduleA['5a']) : Math.max(0, whole(scheduleA['5e']) - whole(scheduleA['5b']) - whole(scheduleA['5c']));
  return { 13: line13, 14: line14, 15: Math.max(0, line13 - line14) };
}

function earnedByOwner(ctx, owner) {
  const wages = sum(ctx.w2.filter((row) => row.owner === owner), (row) => row.wages);
  return wages + (owner === 'taxpayer' ? Math.max(0, ctx.income.businessIncome) : 0);
}

function form39r(ctx, answers, sub) {
  const income = ctx.income;
  const a3 = Math.max(0, income.taxExemptInterest - positive(answers.idahoBondInterest));
  const a7 = a3;
  const b2 = income.stateRefundTaxable;
  const b3 = income.usObligationInterest;
  const careChild = ctx.dependents.some((item) => item.age < 13 || item.disabled);
  const careEarned = ctx.filingStatus === 'mfj' ? Math.min(earnedByOwner(ctx, 'taxpayer'), earnedByOwner(ctx, 'spouse')) : earnedByOwner(ctx, 'taxpayer');
  const b6 = careChild ? Math.min(positive(answers.childCareExpenses), sub.childCareMaximum, Math.max(0, careEarned)) : 0;
  const b7 = income.socialSecurityTaxable;
  const retireEligible = ctx.filingStatus !== 'mfs' && ctx.filers.some((item) => item.age >= sub.retirementAge || (yesNo(answers.retirementDisabled) && item.age >= sub.disabledRetirementAge));
  const claimed = positive(answers.qualifiedRetirementBenefits) > 0;
  const l8a = retireEligible && claimed ? byStatus(sub.retirementMaximum, ctx.filingStatus) : 0;
  const l8b = retireEligible && claimed ? positive(answers.railroadRetirementReceived) : 0;
  const l8c = retireEligible && claimed ? income.socialSecurityBenefits : 0;
  const l8d = Math.max(0, l8a - l8b - l8c);
  const l8e = retireEligible && claimed ? Math.min(positive(answers.qualifiedRetirementBenefits), income.pensionTaxable) : 0;
  const l8f = Math.min(l8d, l8e);
  const b14 = Math.min(positive(answers.idahoCollegeSavings), byStatus(sub.collegeSavingsMaximum, ctx.filingStatus));
  const b18 = positive(answers.healthInsurancePremiums);
  const b24 = b2 + b3 + b6 + b7 + l8f + b14 + b18;
  return {
    A: lineTable({ 3: a3, 7: a7 }),
    B: lineTable({ 2: b2, 3: b3, 6: b6, 7: b7, '8a': l8a, '8b': l8b, '8c': l8c, '8d': l8d, '8e': l8e, '8f': l8f, 14: b14, 18: b18, 24: b24 }),
    additions: a7,
    subtractions: b24,
    retireEligible,
    claimed,
    parts: { a3, b2, b3, b6, b7, l8f, b14, b18 },
  };
}

function grossIncome(income) {
  return ['wages', 'taxableInterest', 'ordinaryDividends', 'iraTaxable', 'pensionTaxable', 'socialSecurityTaxable', 'unemployment', 'stateRefundTaxable', 'otherIncome'].reduce((total, key) => total + Math.max(0, whole(income[key])), 0) + Math.max(0, whole(income.capitalGain)) + Math.max(0, whole(income.businessIncome));
}

function incomeColumn(source) {
  const value = (key) => whole(source[key]);
  const column = { 7: value('wages'), 8: value('taxableInterest'), 9: value('ordinaryDividends'), 10: 0, 11: value('businessIncome'), 12: value('capitalGain'), 13: 0, 14: value('iraTaxable'), 15: value('pensionTaxable'), 16: 0, 17: 0, 18: value('unemployment'), 19: value('socialSecurityTaxable') + value('stateRefundTaxable') + value('otherIncome') };
  column[20] = Object.values(column).reduce((total, amount) => total + amount, 0);
  return column;
}

function adjustmentColumn(items, total) {
  const value = (key) => whole(items?.[key]);
  const column = { 21: value('ira') + value('hsa'), 22: value('studentLoan'), 23: value('seTaxDeduction') + value('seHealth') + value('seRetirement'), 24: value('earlyWithdrawal') };
  column[25] = Math.max(0, whole(total) - column[21] - column[22] - column[23] - column[24]);
  column[26] = whole(total);
  return column;
}

function prorate(amount, share) {
  return Math.round(whole(amount) * share);
}

function compute(ctx, filing, reader) {
  const taxRule = reader.read('income-tax');
  const dedRule = reader.read('deductions');
  const sub = reader.read('subtractions');
  const credits = reader.read('credits');
  if (!taxRule || !dedRule || !sub || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Idaho figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const bands = byStatus(taxRule.brackets, status);

  const r = form39r(ctx, answers, sub);
  const std = standardDeduction(ctx, dedRule);
  const item = itemizedLines(ctx, dedRule);
  const useItemized = item[15] > std.amount;
  const deduction = Math.max(item[15], std.amount);
  const schedule1A = ctx.federal.schedules?.['1-A'] || {};
  const qbi = whole(ctx.federal.lines['13a']);
  const tipsOvertime = whole(schedule1A['13']) + whole(schedule1A['21']);
  const carSenior = whole(schedule1A['30']) + whole(schedule1A['37']);
  const filersCount = status === 'mfj' ? ctx.filers.length : 1;
  const dependentFiler = std.dependentFiler;
  const ctcChildren = ctx.dependents.filter((d) => d.ctcEligible && d.age <= credits.childTaxCreditMaxAge).length;
  const publicAssistance = yesNo(answers.idahoPublicAssistance);
  const anyBlind = (status === 'mfj' ? ctx.filers : ctx.filers.filter((f) => f.role === 'taxpayer')).some((f) => f.blind);

  if (income.taxExemptInterest > 0 && answers.idahoBondInterest === undefined) checks.push(check('info', 'ID_BOND_INTEREST', 'Tax-exempt interest from bonds of other states is added on Form 39R Part A line 3; Idaho bond interest is not. All of it is added until you say how much is from Idaho bonds.', 'Answer the Idaho bond interest question.'));
  if (positive(answers.qualifiedRetirementBenefits) > 0 && !r.retireEligible) checks.push(check('warning', 'ID_RETIREMENT_NOT_ELIGIBLE', status === 'mfs' ? 'Married people filing separately cannot claim the Idaho retirement benefits deduction.' : 'The Idaho retirement benefits deduction needs a recipient aged 65 or older, or disabled and aged 62 or older; none is on this return, so it is not claimed.'));
  if (income.pensionTaxable > 0 && answers.qualifiedRetirementBenefits === undefined && ctx.filers.some((f) => f.age >= sub.disabledRetirementAge)) checks.push(check('info', 'ID_RETIREMENT_BENEFITS', 'Civil Service (CSRS), military, and Idaho firefighter and police retirement benefits can be deducted on Form 39R line 8. FERS, IRA and private pensions do not qualify.', 'Answer the qualified retirement benefits question if you receive them.'));
  if (status === 'mfs' && ctx.answers.spouseItemizes === undefined) checks.push(check('warning', 'ID_MFS_SPOUSE_ITEMIZES', 'If your spouse itemizes, your Idaho standard deduction is zero.', 'Answer whether your spouse itemizes.'));
  if (answers.useTaxPurchases === undefined) checks.push(check('info', 'ID_USE_TAX', 'Idaho asks for the use tax on online and out-of-state purchases with no Idaho sales tax (6% of the purchases).', 'Answer the untaxed purchases question; enter 0 if none.'));

  if (resident) {
    const line7 = income.agi;
    const line8 = r.additions;
    const line9 = line7 + line8;
    const line10 = r.subtractions;
    const line11 = line9 - line10;
    const line16 = std.amount;
    const line17 = Math.max(0, line11 - deduction);
    const line18 = Math.max(0, qbi + whole(ctx.federal.lines['13b']));
    const line19 = Math.max(0, line17 - line18);
    const line20 = bracketTax(line19, bands);
    const otherRows = [];
    let line21 = 0;
    for (const other of filing.otherStates) {
      const c1 = line20;
      const c3 = line11;
      const c2 = Math.min(positive(other.income), Math.max(0, c3));
      const c4 = ratio(c2, c3, { places: 4 });
      const c5 = Math.round(c1 * c4);
      const c6 = positive(other.tax);
      const c7 = Math.min(c5, c6);
      otherRows.push({ state: other.state, lines: lineTable({ 1: c1, 2: c2, 3: c3, 4: c4, 5: c5, 6: c6, 7: c7 }) });
      line21 += c7;
    }
    line21 = Math.min(line21, line20);
    if (otherRows.length) checks.push(check('info', 'ID_OTHER_STATE_RETURN', 'Include a copy of the other state\'s return with Form 39R Part C.'));
    const line22 = 0;
    const line23 = 0;
    const ctcWorksheet = credits.childTaxCredit * ctcChildren;
    const line24 = Math.min(ctcWorksheet, Math.max(0, line20 - line21 - line22 - line23));
    const line25 = line21 + line22 + line23 + line24;
    const line26 = Math.max(0, line20 - line25);
    const line28 = rateOf(positive(answers.useTaxPurchases), taxRule.useTaxRateBp);
    const threshold = status === 'mfs' ? taxRule.filingThreshold.mfs : byStatus(dedRule.standard, status) + std.age65 * std.perBox;
    const gross = grossIncome(income);
    const requiredToFile = dependentFiler ? gross > std.amount : gross >= threshold;
    const line31 = requiredToFile && !publicAssistance && !anyBlind ? taxRule.permanentBuildingFund : 0;
    const line32 = line26 + line28 + line31;
    const line41 = line32;
    const household = dependentFiler ? 0 : filersCount + ctx.dependents.length;
    const line43 = credits.foodTaxCredit * household;
    const line44 = Math.min(credits.familyMemberCreditMaximum, credits.familyMemberCredit * positive(answers.familyMembers65));
    const line46 = filing.payments.withheld;
    const line47 = filing.payments.estimated + filing.payments.extension;
    const line50 = line43 + line44 + line46 + line47;
    const line51 = Math.max(0, line41 - line50);
    const line55 = Math.max(0, line50 - line41);
    if (dependentFiler) notes.push('You can be claimed as a dependent, so the food tax credit is not allowed.');
    if (line43) checks.push(check('info', 'ID_FOOD_CREDIT_MONTHS', 'The food tax credit is not allowed for any month a person received federal food stamps (SNAP) or was incarcerated.', 'Tell MyCA if that applies so the credit can be reduced.'));
    if (!line31 && requiredToFile) notes.push('No permanent building fund tax: you received Idaho public assistance or are blind.');
    if (!requiredToFile) notes.push('Your gross income is below the Idaho filing requirement, so the $10 permanent building fund tax is not due (write NRF on line 31).');
    if (ctx.taxYear === '2026' && ctx.dependents.some((d) => d.ctcEligible)) notes.push('The Idaho child tax credit ended after 2025 under Idaho Code 63-3029L.');
    const lines = lineTable({ '6a': dependentFiler ? 0 : 1, '6b': status === 'mfj' ? 1 : 0, '6c': ctx.dependents.length, '6d': household, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, '12a': std.age65, '12b': std.blind, '12c': dependentFiler ? 1 : 0, 13: item[13], 14: item[14], 15: item[15], 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, 27: 0, 28: line28, 29: 0, 30: 0, 31: line31, 32: line32, 41: line41, 42: 0, 43: line43, 44: line44, 46: line46, 47: line47, 50: line50, 51: line51, 54: line51, 55: line55 });
    return {
      form: '40',
      lines,
      schedules: { '39R': { A: r.A, B: r.B, ...(otherRows.length ? { C: otherRows } : {}) }, ...(line24 ? { 'child-tax-credit': lineTable({ 1: ctcChildren, 2: ctcWorksheet, 3: line20, 7: Math.max(0, line20 - line21 - line22 - line23), 8: line24 }) } : {}) },
      deduction: useItemized ? 'itemized' : 'standard',
      stateIncome: line11,
      taxableIncome: line19,
      taxBeforeCredits: line20,
      nonrefundableCredits: [...(line21 ? [{ code: 'ID_OTHER_STATE', label: 'Income tax paid to other states (Form 39R Part C)', amount: line21 }] : []), ...(line24 ? [{ code: 'ID_CHILD_TAX_CREDIT', label: 'Idaho child tax credit', amount: line24 }] : [])],
      otherStateCredit: line21,
      otherTaxes: [...(line28 ? [{ code: 'ID_USE_TAX', label: 'Sales/use tax on untaxed purchases', amount: line28 }] : []), ...(line31 ? [{ code: 'ID_PBF', label: 'Permanent building fund tax', amount: line31 }] : [])],
      totalTax: line41,
      refundableCredits: [...(line43 ? [{ code: 'ID_FOOD_TAX_CREDIT', label: 'Food tax credit', amount: line43 }] : []), ...(line44 ? [{ code: 'ID_FAMILY_MEMBER', label: 'Maintaining a home for a family member 65 or older', amount: line44 }] : [])],
      checks,
      notes: [...notes, useItemized ? 'Idaho itemized deductions (federal Schedule A less state income or sales tax) are larger than the standard deduction.' : 'The standard deduction is used because it is at least as large as Idaho itemized deductions.'],
    };
  }

  const share = partYear ? filing.share : 0;
  const colA = incomeColumn(income);
  const colB = incomeColumn(filing.sourced);
  const adjA = adjustmentColumn(income.adjustmentItems, income.adjustments);
  const adjB = partYear ? adjustmentColumn(Object.fromEntries(Object.entries(income.adjustmentItems || {}).map(([key, value]) => [key, prorate(value, share)])), filing.sourced.adjustments) : adjustmentColumn({}, filing.sourced.adjustments);
  Object.assign(colA, adjA);
  Object.assign(colB, adjB);
  colB[25] = Math.max(0, colB[26] - colB[21] - colB[22] - colB[23] - colB[24]);
  colA[27] = colA[20] - colA[26];
  colB[27] = colB[20] - colB[26];
  const l28A = income.agi;
  const l28B = colB[27];
  const nrA = { 3: r.parts.a3, 5: r.additions };
  const nrB = { 3: partYear ? prorate(r.parts.a3, share) : 0 };
  nrB[5] = nrB[3];
  const nrSubA = { 2: r.parts.b2, 3: r.parts.b3, 6: r.parts.b6, 7: r.parts.b7, 8: r.parts.l8f, 14: r.parts.b14, 18: r.parts.b18 };
  const nrSubB = { 2: Math.min(r.parts.b2, whole(filing.sourced.stateRefundTaxable)), 3: Math.min(r.parts.b3, whole(filing.sourced.usObligationInterest)), 6: prorate(r.parts.b6, share), 7: Math.min(r.parts.b7, whole(filing.sourced.socialSecurityTaxable)), 8: Math.min(r.parts.l8f, whole(filing.sourced.pensionTaxable)), 14: prorate(r.parts.b14, share), 18: prorate(r.parts.b18, share) };
  nrSubA[27] = Object.values(nrSubA).reduce((total, amount) => total + amount, 0);
  nrSubB[27] = Object.values(nrSubB).reduce((total, amount) => total + amount, 0);
  const l31A = l28A + nrA[5] - nrSubA[27];
  const l31B = l28B + nrB[5] - nrSubB[27];
  const line38 = ratio(l31B, l31A, { places: 4 });
  const line39 = Math.round(deduction * line38);
  const ratio20 = ratio(colB[20], colA[20], { places: 4 });
  const line40 = Math.max(0, Math.round((qbi + tipsOvertime) * line38) + Math.round(carSenior * ratio20));
  const line41 = Math.max(0, l31B - line39 - line40);
  const line42 = bracketTax(line41, bands);
  const line43 = 0;
  const months = partYear ? residentMonths(ctx.taxYear, filing.from, filing.to) : 0;
  const ctcCalc = partYear ? Math.round(months * credits.childTaxCreditPerMonth * ctcChildren) : 0;
  const line46 = Math.min(ctcCalc, Math.max(0, line42 - line43));
  const line47 = Math.max(0, line42 - line43 - line46);
  const line49 = rateOf(positive(answers.useTaxPurchases), taxRule.useTaxRateBp);
  const gross = grossIncome(income);
  const idahoGross = grossIncome(filing.sourced);
  const threshold = status === 'mfs' ? taxRule.filingThreshold.mfs : byStatus(dedRule.standard, status) + std.age65 * std.perBox;
  const requiredToFile = partYear ? gross >= threshold : idahoGross > taxRule.filingThreshold.nonresident;
  const line52 = requiredToFile && !publicAssistance && !anyBlind ? taxRule.permanentBuildingFund : 0;
  const line53 = line47 + line49 + line52;
  const line62 = line53;
  const household = partYear && !dependentFiler ? filersCount + ctx.dependents.length : 0;
  const foodCalc = Math.round(months * credits.foodTaxCreditPerMonth * household);
  const line63 = partYear ? Math.min(foodCalc, Math.max(0, line42 - line43)) : 0;
  const line66 = filing.payments.withheld;
  const line67 = filing.payments.estimated + filing.payments.extension;
  const line70 = line63 + line66 + line67;
  const line71 = Math.max(0, line62 - line70);
  const line75 = Math.max(0, line70 - line62);
  if (!resident && answers.familyMembers65) checks.push(check('warning', 'ID_FAMILY_MEMBER_FORM43', 'The credit for maintaining a home for a family member is figured on Form 39NR for part-year and nonresident filers, which MyCA does not do; it is left out.'));
  if (partYear && foodCalc > line63) notes.push(`The part-year food tax credit of $${foodCalc} is limited to the tax on line 42, and is not refunded to part-year residents.`);
  if (partYear && filing.otherStates.length === 0 && ctx.w2.some((row) => row.state && row.state !== 'ID')) checks.push(check('info', 'ID_PART_YEAR_OTHER_STATE', 'A part-year resident may take the Form 39NR Part C credit for tax paid to another state on income earned while an Idaho resident; MyCA does not figure it.', 'Ask your CPA if another state taxed income you received while living in Idaho.'));
  const lines = lineTable({ '6a': dependentFiler ? 0 : 1, '6b': status === 'mfj' ? 1 : 0, '6c': ctx.dependents.length, '6d': (dependentFiler ? 0 : filersCount) + ctx.dependents.length, '28A': l28A, '28B': l28B, '29A': nrA[5], '29B': nrB[5], '30A': nrSubA[27], '30B': nrSubB[27], '31A': l31A, '31B': l31B, '32a': std.age65, '32b': std.blind, '32c': dependentFiler ? 1 : 0, 33: item[13], 34: item[14], 35: item[15], 36: std.amount, 37: deduction, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 43: line43, 44: 0, 45: 0, 46: line46, 47: line47, 48: 0, 49: line49, 50: 0, 51: 0, 52: line52, 53: line53, 62: line62, 63: line63, 64: 0, 66: line66, 67: line67, 70: line70, 71: line71, 74: line71, 75: line75 });
  return {
    form: '43',
    lines,
    schedules: { columns: { A: lineTable(colA), B: lineTable(colB) }, '39NR': { A: { A: lineTable(nrA), B: lineTable(nrB) }, B: { A: lineTable(nrSubA), B: lineTable(nrSubB) } }, ...(partYear ? { months: { resident: months } } : {}) },
    deduction: useItemized ? 'itemized' : 'standard',
    stateIncome: l31B,
    taxableIncome: line41,
    taxBeforeCredits: line42,
    nonrefundableCredits: [...(line46 ? [{ code: 'ID_CHILD_TAX_CREDIT', label: 'Idaho child tax credit (part-year)', amount: line46 }] : []), ...(line63 ? [{ code: 'ID_FOOD_TAX_CREDIT', label: 'Food tax credit (part-year, not refundable)', amount: line63 }] : [])],
    otherStateCredit: 0,
    otherTaxes: [...(line49 ? [{ code: 'ID_USE_TAX', label: 'Sales/use tax on untaxed purchases', amount: line49 }] : []), ...(line52 ? [{ code: 'ID_PBF', label: 'Permanent building fund tax', amount: line52 }] : [])],
    totalTax: Math.max(0, line62 - line63),
    refundableCredits: [],
    checks,
    notes: [...notes, `Idaho percentage ${(line38 * 100).toFixed(2)}% (line 31 Column B over Column A) applies to the deduction on line 39.`],
  };
}

const HOUSEHOLD = Object.freeze({
  '6a': 'Exemption for yourself',
  '6b': 'Exemption for your spouse',
  '6c': 'Dependents',
  '6d': 'Total household',
});

const RESIDENT_LABELS = Object.freeze({
  ...HOUSEHOLD,
  7: 'Federal adjusted gross income',
  8: 'Additions from Form 39R, Part A',
  9: 'Federal AGI plus additions',
  10: 'Subtractions from Form 39R, Part B',
  11: 'Total adjusted income',
  '12a': 'Age 65 or older',
  '12b': 'Blind',
  '12c': 'Someone else can claim you as a dependent',
  13: 'Itemized deductions',
  14: 'State and local income or sales taxes on Schedule A',
  15: 'Itemized deductions less state and local taxes',
  16: 'Standard deduction',
  17: 'Total adjusted income less deductions',
  18: 'Qualified business income deduction',
  19: 'Idaho taxable income',
  20: 'Tax from worksheet',
  21: 'Income tax paid to other states',
  22: 'Total credits from Form 39R, Part D',
  23: 'Total business income tax credits from Form 44',
  24: 'Idaho child tax credit',
  25: 'Total credits',
  26: 'Tax after credits',
  27: 'Fuels use tax due',
  28: 'Sales/use tax due on untaxed purchases',
  29: 'Tax from recapture of income tax credits (Form 44)',
  30: 'Tax from recapture of qualified investment exemption',
  31: 'Permanent building fund tax',
  32: 'Total tax',
  41: 'Total tax plus donations',
  42: 'Parental choice tax credit',
  43: 'Food tax credit',
  44: 'Maintaining a home for a family member 65 or older',
  46: 'Idaho income tax withheld',
  47: 'Estimated and extension payments (Form 51)',
  50: 'Total payments and other credits',
  51: 'Tax due',
  54: 'Total due',
  55: 'Overpaid',
});

const NONRESIDENT_LABELS = Object.freeze({
  ...HOUSEHOLD,
  '28A': 'Federal adjusted gross income, total',
  '28B': 'Federal adjusted gross income, Idaho',
  '29A': 'Additions from Form 39NR, total',
  '29B': 'Additions from Form 39NR, Idaho',
  '30A': 'Subtractions from Form 39NR, total',
  '30B': 'Subtractions from Form 39NR, Idaho',
  '31A': 'Total adjusted income, total',
  '31B': 'Total adjusted income, Idaho',
  '32a': 'Age 65 or older',
  '32b': 'Blind',
  '32c': 'Someone else can claim you as a dependent',
  33: 'Itemized deductions',
  34: 'State and local income or sales taxes on Schedule A',
  35: 'Itemized deductions less state and local taxes',
  36: 'Standard deduction',
  37: 'Larger of itemized or standard deduction',
  38: 'Idaho percentage',
  39: 'Deduction multiplied by the Idaho percentage',
  40: 'Qualified business income deduction',
  41: 'Idaho taxable income',
  42: 'Tax from worksheet',
  43: 'Income tax paid to other states',
  44: 'Total credits from Form 39NR, Part E',
  45: 'Total business income tax credits from Form 44',
  46: 'Idaho child tax credit',
  47: 'Tax after credits',
  48: 'Fuels use tax due',
  49: 'Sales/use tax due on untaxed purchases',
  50: 'Tax from recapture of income tax credits (Form 44)',
  51: 'Tax from recapture of qualified investment exemption',
  52: 'Permanent building fund tax',
  53: 'Total tax',
  62: 'Total tax plus donations',
  63: 'Food tax credit',
  64: 'Maintaining a home for a family member 65 or older',
  66: 'Idaho income tax withheld',
  67: 'Estimated and extension payments (Form 51)',
  70: 'Total payments and other credits',
  71: 'Tax due',
  74: 'Total due',
  75: 'Overpaid',
});

const labels = (taxYear, residency) => (residency === 'full-year' ? RESIDENT_LABELS : NONRESIDENT_LABELS);

export const STATE = Object.freeze({
  code: 'ID',
  name: 'Idaho',
  built: true,
  forms: Object.freeze({ resident: '40', partYear: '43', nonresident: '43' }),
  questions: Object.freeze([
    Object.freeze({ id: 'idahoBondInterest', when: Object.freeze({ has: ['taxExemptInterest'] }), kind: 'amount', text: 'Tax-exempt interest from Idaho state or local bonds', help: 'Interest from other states\' bonds is added on Form 39R Part A line 3; Idaho bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'qualifiedRetirementBenefits', when: Object.freeze({ filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior', 'retirementIncome'] }), kind: 'amount', text: 'Civil Service (CSRS), U.S. military, or Idaho firefighter or police retirement benefits included in federal income', help: 'Deducted on Form 39R line 8 if you are 65, or disabled and 62. FERS and private pensions do not qualify. Enter 0 if none.' }),
    Object.freeze({ id: 'retirementDisabled', when: Object.freeze({ filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior', 'retirementIncome'] }), kind: 'yesno', text: 'Is the retirement benefit recipient classified as disabled (and at least 62)?', help: 'Disabled as recognized by Social Security, the Railroad Retirement Board, the VA or a physician.' }),
    Object.freeze({ id: 'railroadRetirementReceived', when: Object.freeze({ filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'qualifiedRetirementBenefits' } }), kind: 'amount', text: 'Railroad retirement benefits received (RRB-1099 and RRB-1099-R)', help: 'These reduce the retirement benefits deduction maximum on Form 39R line 8b. Enter 0 if none.' }),
    Object.freeze({ id: 'idahoCollegeSavings', kind: 'amount', text: 'Contributions to an Idaho college savings (IDeal) account', help: 'Deducted on Form 39R line 14 up to $6,000, or $12,000 on a joint return.' }),
    Object.freeze({ id: 'healthInsurancePremiums', kind: 'amount', text: 'Health insurance premiums paid with after-tax money and not deducted on the federal return', help: 'Deducted on Form 39R line 18. Enter 0 if none.' }),
    Object.freeze({ id: 'childCareExpenses', when: Object.freeze({ has: ['dependents'] }), kind: 'amount', text: 'Child or dependent care costs paid so you could work', help: 'Deducted on Form 39R line 6, up to $12,000 and your earned income. Enter 0 if none.' }),
    Object.freeze({ id: 'familyMembers65', when: Object.freeze({ residency: ['full-year'] }), kind: 'count', text: 'Family members aged 65 or older, or with a developmental disability, for whom you maintained a home (not you or your spouse unless disabled)', help: '$100 credit each, up to three, on Form 40 line 44.' }),
    Object.freeze({ id: 'idahoPublicAssistance', kind: 'yesno', text: 'Were you receiving Idaho public assistance payments at the end of the year?', help: 'Food stamps and WIC do not count. If yes, the $10 permanent building fund tax is not due.' }),
    Object.freeze({ id: 'useTaxPurchases', kind: 'amount', text: 'Online, mail-order or out-of-state purchases with no Idaho sales tax', help: 'Use tax of 6% of these purchases goes on Form 40 line 28. Enter 0 if none.' }),
  ]),
  labels,
  notCovered: Object.freeze([
    'Form 39R and 39NR additions and subtractions for business items (bonus depreciation, net operating losses, capital gains on Idaho property, Idaho medical savings accounts, technological equipment donations, adoption expenses, insulation and alternative energy devices, the $1,000 deduction for maintaining a home for a family member)',
    'Business income tax credits (Form 44), the credit for charitable contributions and other Form 39R Part D credits, and the parental choice tax credit',
    'Actual food sales tax paid instead of the $155 food tax credit, and months on SNAP or incarcerated',
    'Credit for tax paid to another state by a part-year resident (Form 39NR Part C)',
    'The family member credit for part-year and nonresident filers (Form 39NR)',
    'Fuels tax refunds and fuels use tax (Form 75), recapture taxes (Forms 44 and 49ER), and pass-through entity tax paid (ID K-1)',
    'Check-off donations, penalty and interest',
  ]),
  compute,
});
