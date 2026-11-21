import { whole, positive, sum, rateOf, check, byStatus, lineTable, yesNo } from '../state-kit.mjs';
import { residentMonths } from './id.mjs';

export function hiScheduleTax(amount, bands) {
  const income = positive(amount);
  let base = 0;
  let exact = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const over = bands[index].overCents / 100;
    const next = index + 1 < bands.length ? bands[index + 1].overCents / 100 : Infinity;
    if (income <= next) {
      const total = base * 10000 + (income - over) * bands[index].rateBp;
      return Math.floor((total + 5000) / 10000);
    }
    exact += (next - over) * bands[index].rateBp;
    base = Math.floor((exact + 5000) / 10000);
  }
  return 0;
}

export function hiTableTax(amount, rule, status) {
  const income = positive(amount);
  if (!income) return 0;
  const bands = byStatus(rule.brackets, status);
  if (income < rule.tableBelow) {
    const low = Math.floor(income / rule.tableBand) * rule.tableBand;
    return hiScheduleTax(low + rule.tableBand / 2, bands);
  }
  return hiScheduleTax(income, bands);
}

function capitalGainsTax(taxable, longTerm, netGain, rule, status) {
  const l1 = positive(taxable);
  const l18 = hiTableTax(l1, rule, status);
  const threshold = byStatus(rule.capitalGain.threshold, status);
  if (l1 <= threshold) return { tax: l18, line27a: 0, worksheet: null };
  const l4 = Math.max(0, whole(longTerm));
  const l7 = whole(netGain);
  const l8 = Math.min(l4, l7);
  const l10 = l8;
  if (l10 <= 0) return { tax: l18, line27a: 0, worksheet: null };
  const l11 = l1 - l10;
  const l12 = threshold;
  const l13 = Math.max(l11, l12);
  const l14 = l1 - l13;
  if (l14 <= 0) return { tax: l18, line27a: 0, worksheet: null };
  const l15 = hiTableTax(l13, rule, status);
  const l16 = rateOf(l14, rule.capitalGain.rateBp);
  const l17 = l15 + l16;
  const l19 = Math.min(l17, l18);
  return { tax: l19, line27a: l17 < l18 ? l14 : 0, worksheet: lineTable({ 1: l1, 2: l4, 4: l4, 5: l7, 7: l7, 8: l8, 10: l10, 11: l11, 12: l12, 13: l13, 14: l14, 15: l15, 16: l16, 17: l17, 18: l18, 19: l19 }) };
}

export function ratioTwoPlaces(part, total) {
  const top = whole(part);
  const bottom = whole(total);
  if (top <= 0) return 0;
  if (bottom <= 0 || top >= bottom) return 1;
  const thousandths = Math.floor((top * 1000) / bottom);
  return Math.min(1, Math.round(thousandths / 10) / 100);
}

function netGains(ctx) {
  const d = ctx.federal.schedules?.D;
  if (d) return { longTerm: Math.max(0, whole(d['15'])), net: Math.max(0, whole(d['16'])) };
  const line7 = Math.max(0, whole(ctx.income.capitalGain));
  return { longTerm: line7, net: line7 };
}

function earnedByOwner(ctx, owner) {
  return sum(ctx.w2.filter((row) => row.owner === owner), (row) => row.wages) + (owner === 'taxpayer' ? Math.max(0, ctx.income.businessIncome) : 0);
}

function overallLimit(total, medical, agi, rule, status) {
  const threshold = byStatus(rule.overallLimitation.threshold, status);
  const w3 = medical;
  if (w3 >= total || agi <= threshold) return { allowed: total, reduction: 0 };
  const w5 = rateOf(total - w3, rule.overallLimitation.maxShareBp);
  const w9 = rateOf(agi - threshold, rule.overallLimitation.excessBp);
  const reduction = Math.min(w5, w9);
  return { allowed: total - reduction, reduction };
}

function bandAmount(table, amount) {
  const row = table.find((item) => amount < item.below);
  return row ? row.amount : 0;
}

function careRate(rates, agi) {
  const row = rates.find((item) => item.upTo === null || agi <= item.upTo);
  return row ? row.rate : 0;
}

function compute(ctx, filing, reader) {
  const taxRule = reader.read('income-tax');
  const ded = reader.read('deductions');
  if (!taxRule || !ded) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Hawaii figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : 0;
  const checks = [];
  const notes = [];
  const parts = ctx.itemized;
  const fedAgi = income.agi;
  const filers = status === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer');
  const dependentFiler = filers.some((item) => item.canBeClaimedAsDependent);
  const age65 = filers.filter((item) => item.age >= 65).length;
  const exemptionCount = (dependentFiler ? 0 : filers.length + age65) + ctx.dependents.length;
  const persons = (dependentFiler ? 0 : filers.length) + ctx.dependents.length;
  const months = resident ? 12 : partYear ? residentMonths(ctx.taxYear, filing.from, filing.to) : 0;
  const present = months > 9;
  const gains = netGains(ctx);

  const l9 = Math.max(0, income.taxExemptInterest - positive(answers.hiBondInterest));
  const l13 = Math.min(positive(answers.hiExemptPension), income.pensionTaxable);
  const l14 = income.socialSecurityTaxable;
  let l15 = 0;
  if (positive(answers.hiReservePay) > 0) {
    const sub = reader.read('subtractions');
    l15 = Math.min(positive(answers.hiReservePay), sub ? sub.militaryReserveMaximum : 0, income.wages);
  }
  const l18 = income.usObligationInterest;

  const spouseItemizes = status === 'mfs' && yesNo(ctx.answers.spouseItemizes);
  const baseStandard = byStatus(ded.standard, status);
  const earned = Math.max(0, income.wages + Math.max(0, income.businessIncome));
  const standard = spouseItemizes ? 0 : dependentFiler ? Math.min(baseStandard, Math.max(ded.dependentMinimum, earned)) : baseStandard;
  const it = ded.itemized;
  const incomeTaxAllowed = fedAgi < byStatus(it.incomeTaxAgiLimit, status);

  if (income.taxExemptInterest > 0 && answers.hiBondInterest === undefined) checks.push(check('info', 'HI_BOND_INTEREST', 'Interest on other states\' bonds is added on line 9; Hawaii bond interest is not. All of it is added until you say how much is from Hawaii bonds.', 'Answer the Hawaii bond interest question.'));
  if (income.pensionTaxable > 0 && answers.hiExemptPension === undefined) checks.push(check('warning', 'HI_PENSION_EXEMPT', 'Pensions from employer-funded plans (including public pensions and the employer part of private plans) are not taxed by Hawaii and are subtracted on line 13. None is subtracted until you say how much qualifies.', 'Answer the exempt pension question.'));
  if (income.stateRefundTaxable > 0) checks.push(check('warning', 'HI_STATE_REFUND', 'A state income tax refund taxed on your federal return is taxed by Hawaii only to the extent the tax was deducted on a Hawaii return; MyCA leaves it in Hawaii income.', 'Check the Hawaii refund worksheet (line 18 worksheet b) with your CPA.'));
  if (status === 'mfs' && ctx.answers.spouseItemizes === undefined) checks.push(check('warning', 'HI_MFS_SPOUSE_ITEMIZES', 'If your spouse itemizes on a separate Hawaii return, your standard deduction is zero.', 'Answer whether your spouse itemizes.'));
  const schedule1A = ctx.federal.schedules?.['1-A'] || {};
  if (ctx.taxYear !== '2025' && whole(schedule1A['13']) > 0) checks.push(check('warning', 'HI_TIPS_DEDUCTION', 'Act 35 (2026) lets Hawaii filers deduct qualified tips under IRC 224, but the 2026 Form N-11 line for it is not published; MyCA does not include the deduction yet.', 'Ask your CPA to add the tips deduction when the 2026 form is out.'));

  const refundRule = () => reader.read('refundable-credits');
  const foodCredit = (agi) => {
    if (!present || dependentFiler || persons === 0) return { amount: 0 };
    if (agi >= (status === 'single' ? 40000 : 60000)) return { amount: 0 };
    const rule = refundRule();
    if (!rule) return { amount: 0 };
    const per = bandAmount(status === 'single' ? rule.foodExcise.single : rule.foodExcise.other, agi);
    return { amount: per * persons, per, persons };
  };
  const rentersCredit = (hawaiiAgi) => {
    const rent = Math.max(0, positive(answers.hiRentPaid) - positive(answers.hiRentExclusions));
    if (!present || dependentFiler || !rent) return { amount: 0 };
    const rule = refundRule();
    if (!rule || hawaiiAgi >= rule.renters.agiBelow || rent <= rule.renters.rentOver) return { amount: 0, rent };
    const count = persons + age65;
    return { amount: count * rule.renters.perExemption, rent, count };
  };
  const careCredit = (agiForRate) => {
    const qualifying = ctx.dependents.filter((item) => item.age < 13 || item.disabled).length;
    const expenses = positive(answers.hiCareExpenses);
    if (!qualifying || !expenses) return { amount: 0 };
    const rule = refundRule();
    if (!rule) return { amount: 0 };
    const l17 = qualifying > 1 ? rule.care.limitTwoOrMore : rule.care.limitOne;
    const l22 = Math.min(expenses, l17);
    const l23 = earnedByOwner(ctx, 'taxpayer');
    const l24 = status === 'mfj' ? earnedByOwner(ctx, 'spouse') : l23;
    const l25 = Math.min(l22, l23, l24);
    const l27 = careRate(rule.care.rates, agiForRate);
    const l28 = Math.round(l25 * l27);
    return { amount: l28, lines: lineTable({ 17: l17, 22: l22, 23: l23, 24: l24, 25: l25, 26: agiForRate, 27: l27, 28: l28 }) };
  };
  const fedEic = whole(ctx.federal.lines['27']);
  const eitc = (ratioValue) => {
    if (fedEic <= 0) return { amount: 0 };
    const rule = reader.read('eitc');
    if (!rule) return { amount: 0 };
    const l3 = rateOf(fedEic, rule.rateBp);
    const l7 = Math.round(l3 * ratioValue);
    return { amount: l7, lines: lineTable({ 2: fedEic, 3: l3, 6: ratioValue, 7: l7 }) };
  };

  if (resident) {
    const line7 = fedAgi;
    const line8 = 0;
    const line10 = 0;
    const line11 = line8 + l9 + line10;
    const line12 = line7 + line11;
    const line19 = l13 + l14 + l15 + l18;
    const line20 = line12 - line19;
    const a21a = Math.max(0, parts.medicalPaid - rateOf(Math.max(0, line20), it.medicalFloorBp));
    const salesInstead = yesNo(ctx.answers.useSalesTax);
    const a21b = (incomeTaxAllowed ? (salesInstead ? parts.generalSalesTax : parts.stateIncomeTaxes) : 0) + parts.realEstateTaxes + parts.personalPropertyTaxes;
    const a21c = parts.mortgageInterest;
    const a21d = Math.max(0, parts.charityCash + parts.charityNonCash - rateOf(Math.max(0, line20), it.charityFloorBp));
    const raw = a21a + a21b + a21c + a21d;
    const limited = overallLimit(raw, a21a, line20, ded.itemized, status);
    const line22 = limited.allowed;
    const useItemized = line22 > standard;
    const line23 = standard;
    const line24 = line20 - (useItemized ? line22 : line23);
    const line25 = exemptionCount * ded.exemption;
    const line26 = Math.max(0, line24 - line25);
    const taxed = capitalGainsTax(line26, gains.longTerm, gains.net, taxRule, status);
    const line27 = taxed.tax;
    const food = foodCredit(fedAgi);
    const renters = rentersCredit(line20);
    const care = careCredit(line20);
    const earnedCredit = eitc(1);
    const line28 = food.amount;
    const line29 = renters.amount;
    const line30 = care.amount;
    const line32 = earnedCredit.amount;
    const line33 = line28 + line29 + line30 + line32;
    const line34 = line27 - line33;
    let otherState = null;
    let line35 = 0;
    if (filing.otherStates.length) {
      const c1 = line26;
      const c2 = taxed.line27a;
      const c3 = sum(filing.otherStates, (item) => positive(item.income));
      const c4 = 0;
      const c5 = sum(filing.otherStates, (item) => positive(item.tax));
      const c9 = c5;
      const c10 = c1 - c3;
      const c11 = Math.max(0, c2 - c4);
      const c12 = c10 - c11;
      const c13 = line27;
      const c14 = hiTableTax(c12, taxRule, status);
      const c15 = rateOf(c11, taxRule.capitalGain.rateBp);
      const c16 = c14 + c15;
      const c17 = c13 - c16;
      const c18 = Math.max(0, Math.min(c9, c17));
      const c19 = line34;
      const c20 = Math.max(0, Math.min(c18, c19));
      line35 = c20;
      otherState = { states: filing.otherStates.map((item) => item.state), lines: lineTable({ 1: c1, 2: c2, 3: c3, 4: c4, 5: c5, 9: c9, 10: c10, 11: c11, 12: c12, 13: c13, 14: c14, 15: c15, 16: c16, 17: c17, 18: c18, 19: c19, 20: c20 }) };
      checks.push(check('info', 'HI_OTHER_STATE_RETURN', 'Attach a copy of the other state\'s return to Schedule CR; the tax you claim as a credit cannot also be an itemized deduction.'));
      if (useItemized && incomeTaxAllowed && !salesInstead) checks.push(check('warning', 'HI_OTHER_STATE_DEDUCTED', 'Income tax paid to another state that you claim as a credit must be left out of the itemized deduction for taxes (Worksheet A-2).', 'Remove that state\'s tax from the itemized taxes.'));
    }
    const line36 = line34 - line35;
    const line37 = filing.payments.withheld;
    const line38 = filing.payments.estimated;
    const line40 = filing.payments.extension;
    const line41 = line37 + line38 + line40;
    const line42 = Math.max(0, line41 - line36);
    const line48 = Math.max(0, line36 - line41);
    if (ctx.taxYear !== '2025' && !useItemized && parts.charityCash > 0) checks.push(check('warning', 'HI_NONITEMIZER_CHARITY', 'Act 35 (2026) conforms Hawaii to the federal charitable deduction for people who do not itemize, but the 2026 Form N-11 line for it is not published; MyCA does not include it yet.', 'Ask your CPA to add it when the 2026 form is out.'));
    if (limited.reduction) notes.push(`Itemized deductions are reduced by $${limited.reduction} because Hawaii AGI is over $${byStatus(ded.itemized.overallLimitation.threshold, status)}.`);
    if (!incomeTaxAllowed && parts.stateIncomeTaxes > 0) notes.push('State income taxes are not deductible on the Hawaii return at your federal AGI (Worksheet A-2 line 5).');
    const lines = lineTable({ '6e': exemptionCount, 7: line7, 8: line8, 9: l9, 10: line10, 11: line11, 12: line12, 13: l13, 14: l14, 15: l15, 16: 0, 17: 0, 18: l18, 19: line19, 20: line20, ...(useItemized ? { '21a': a21a, '21b': a21b, '21c': a21c, '21d': a21d, '21e': 0, '21f': 0, 22: line22 } : {}), 23: useItemized ? 0 : line23, 24: line24, 25: line25, 26: line26, 27: line27, ...(taxed.line27a ? { '27a': taxed.line27a } : {}), 28: line28, 29: line29, 30: line30, 31: 0, 32: line32, 33: line33, 34: line34, 35: line35, 36: line36, 37: line37, 38: line38, 39: 0, 40: line40, 41: line41, 42: line42, 48: line48 });
    return {
      form: 'N-11',
      lines,
      schedules: {
        ...(taxed.worksheet ? { 'capital-gains': taxed.worksheet } : {}),
        ...(food.amount ? { 'N-311': lineTable({ 4: fedAgi, 6: fedAgi, 7: food.per, 8: food.persons, 9: food.amount }) } : {}),
        ...(renters.amount || care.amount ? { X: { ...(renters.amount ? { 'Part I': lineTable({ 7: renters.rent, 11: renters.count, 12: renters.amount }) } : {}), ...(care.amount ? { 'Part II': care.lines } : {}) } } : {}),
        ...(earnedCredit.amount ? { 'N-356': earnedCredit.lines } : {}),
        ...(otherState || line32 ? { CR: { ...(line32 ? { 8: line32 } : {}), ...(otherState ? { 12: line35, 'other-state': otherState } : {}) } } : {}),
      },
      deduction: useItemized ? 'itemized' : 'standard',
      stateIncome: line20,
      taxableIncome: line26,
      taxBeforeCredits: line27,
      nonrefundableCredits: line35 ? [{ code: 'HI_OTHER_STATE', label: 'Credit for income taxes paid to other states (Schedule CR)', amount: line35 }] : [],
      otherStateCredit: line35,
      otherTaxes: [],
      totalTax: line27 - line35,
      refundableCredits: [
        ...(line28 ? [{ code: 'HI_FOOD_EXCISE', label: 'Refundable food/excise tax credit (N-311)', amount: line28 }] : []),
        ...(line29 ? [{ code: 'HI_RENTERS', label: 'Credit for low-income household renters (Schedule X)', amount: line29 }] : []),
        ...(line30 ? [{ code: 'HI_CARE', label: 'Child and dependent care credit (Schedule X)', amount: line30 }] : []),
        ...(line32 ? [{ code: 'HI_EITC', label: 'Hawaii earned income tax credit (N-356)', amount: line32 }] : []),
      ],
      checks,
      notes: [...notes, useItemized ? 'Hawaii itemized deductions are larger than the Hawaii standard deduction.' : 'The Hawaii standard deduction is used because it is at least as large as Hawaii itemized deductions.'],
    };
  }

  const src = filing.sourced;
  const items = income.adjustmentItems || {};
  const named = ['ira', 'studentLoan', 'hsa', 'seTaxDeduction', 'seHealth', 'seRetirement', 'earlyWithdrawal'];
  const remainder = Math.max(0, income.adjustments - named.reduce((total, key) => total + whole(items[key]), 0));
  const colA = { 7: income.wages, 8: income.taxableInterest - income.usObligationInterest + l9, 9: income.ordinaryDividends, 10: income.stateRefundTaxable, 11: 0, 12: income.businessIncome, 13: income.capitalGain, 14: 0, 15: income.iraTaxable, 16: income.pensionTaxable - l13, 17: 0, 18: income.unemployment, 19: income.otherIncome };
  const colB = { 7: whole(src.wages), 8: whole(src.taxableInterest) - Math.min(income.usObligationInterest, whole(src.usObligationInterest)) + (partYear ? Math.round(l9 * share) : 0), 9: whole(src.ordinaryDividends), 10: whole(src.stateRefundTaxable), 11: 0, 12: whole(src.businessIncome), 13: whole(src.capitalGain), 14: 0, 15: whole(src.iraTaxable), 16: Math.max(0, whole(src.pensionTaxable) - (partYear ? Math.round(l13 * share) : 0)), 17: 0, 18: whole(src.unemployment), 19: whole(src.otherIncome) };
  colA[20] = Object.values(colA).reduce((total, amount) => total + amount, 0);
  colB[20] = Object.values(colB).reduce((total, amount) => total + amount, 0);
  const adjA = { 21: remainder, 22: whole(items.ira), 23: whole(items.studentLoan), 24: whole(items.hsa), 25: 0, 26: whole(items.seTaxDeduction), 27: whole(items.seHealth), 28: whole(items.seRetirement), 29: whole(items.earlyWithdrawal), 30: 0, 31: 0, 32: l15, 33: 0 };
  const adjB = Object.fromEntries(Object.entries(adjA).map(([key, value]) => [key, partYear ? Math.round(value * share) : 0]));
  adjA[34] = Object.values(adjA).reduce((total, amount) => total + amount, 0);
  adjB[34] = Object.values(adjB).reduce((total, amount) => total + amount, 0);
  Object.assign(colA, adjA, { 35: colA[20] - adjA[34] });
  Object.assign(colB, adjB, { 35: colB[20] - adjB[34] });
  const line36 = fedAgi;
  const line37 = ratioTwoPlaces(colB[35], colA[35]);
  const hiIncomeTax = sum(ctx.w2.filter((row) => row.state === 'HI'), (row) => row.stateWithheld) + filing.payments.estimated;
  const n38a = Math.max(0, Math.round(parts.medicalPaid * line37) - rateOf(Math.max(0, colB[35]), it.medicalFloorBp));
  const n38b = (incomeTaxAllowed ? hiIncomeTax : 0) + positive(answers.hiRealEstateTaxes);
  const n38c = positive(answers.hiMortgageInterest);
  const n38d = Math.max(0, Math.round((parts.charityCash + parts.charityNonCash) * line37) - rateOf(Math.max(0, colB[35]), it.charityFloorBp));
  const raw = n38a + n38b + n38c + n38d;
  const limited = overallLimit(raw, n38a, colB[35], ded.itemized, status);
  const line39 = limited.allowed;
  const line40a = standard;
  const line40b = Math.round(line40a * line37);
  const useItemized = line39 > line40b;
  const line41 = colB[35] - (useItemized ? line39 : line40b);
  const line42a = exemptionCount * ded.exemption;
  const line42b = Math.round(line42a * line37);
  const line43 = Math.max(0, line41 - line42b);
  const hiGain = Math.max(0, colB[13]);
  const taxed = capitalGainsTax(line43, Math.min(gains.longTerm, hiGain), Math.min(gains.net, hiGain), taxRule, status);
  const line44 = taxed.tax;
  const food = partYear ? foodCredit(fedAgi) : { amount: 0 };
  const renters = partYear ? rentersCredit(colA[35]) : { amount: 0 };
  const care = careCredit(colA[35]);
  const earnedCredit = eitc(ratioTwoPlaces(colB[35], line36));
  const line45 = food.amount;
  const line46 = renters.amount;
  const line47 = care.amount;
  const line49 = earnedCredit.amount;
  const line50 = line45 + line46 + line47 + line49;
  const line51 = line44 - line50;
  const line53 = line51;
  const line54 = filing.payments.withheld;
  const line55 = filing.payments.estimated;
  const line57 = filing.payments.extension;
  const line58 = line54 + line55 + line57;
  const line59 = Math.max(0, line58 - line53);
  const line65 = Math.max(0, line53 - line58);
  if (useItemized && partYear) checks.push(check('warning', 'HI_PART_YEAR_ITEMIZED', 'Part-year residents use Worksheets PY-1 to PY-5 with amounts paid while a Hawaii resident; MyCA uses the nonresident method (amounts prorated by the line 37 ratio, Hawaii taxes and Hawaii mortgage interest).', 'Check the itemized deductions with your CPA.'));
  if (!resident && (parts.realEstateTaxes || parts.mortgageInterest) && answers.hiRealEstateTaxes === undefined && answers.hiMortgageInterest === undefined) checks.push(check('info', 'HI_NR_PROPERTY', 'Nonresidents deduct real estate taxes and mortgage interest only on Hawaii property.', 'Answer the Hawaii property questions if you own property in Hawaii.'));
  if (partYear && !present) notes.push('You were present in Hawaii nine months or less, so the food/excise tax credit and the renters credit are not allowed.');
  const lines = lineTable({ '6e': exemptionCount, ...Object.fromEntries(Object.entries(colA).map(([key, value]) => [`${key}A`, value])), ...Object.fromEntries(Object.entries(colB).map(([key, value]) => [`${key}B`, value])), 36: line36, 37: line37, ...(useItemized ? { '38a': n38a, '38b': n38b, '38c': n38c, '38d': n38d, 39: line39 } : { 39: 0 }), '40a': line40a, '40b': line40b, 41: line41, '42a': line42a, '42b': line42b, 43: line43, 44: line44, ...(taxed.line27a ? { '44a': taxed.line27a } : {}), 45: line45, 46: line46, 47: line47, 48: 0, 49: line49, 50: line50, 51: line51, 52: 0, 53: line53, 54: line54, 55: line55, 57: line57, 58: line58, 59: line59, 65: line65 });
  return {
    form: 'N-15',
    lines,
    schedules: {
      ...(taxed.worksheet ? { 'capital-gains': taxed.worksheet } : {}),
      ...(food.amount ? { 'N-311': lineTable({ 4: fedAgi, 6: fedAgi, 7: food.per, 8: food.persons, 9: food.amount }) } : {}),
      ...(renters.amount || care.amount ? { X: { ...(renters.amount ? { 'Part I': lineTable({ 7: renters.rent, 11: renters.count, 12: renters.amount }) } : {}), ...(care.amount ? { 'Part II': care.lines } : {}) } } : {}),
      ...(earnedCredit.amount ? { 'N-356': lineTable({ ...earnedCredit.lines, 4: colB[35], 5: line36 }) } : {}),
      ...(partYear ? { months: { present: months } } : {}),
    },
    deduction: useItemized ? 'itemized' : 'standard',
    stateIncome: colB[35],
    taxableIncome: line43,
    taxBeforeCredits: line44,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: [],
    totalTax: line44,
    refundableCredits: [
      ...(line45 ? [{ code: 'HI_FOOD_EXCISE', label: 'Refundable food/excise tax credit (N-311)', amount: line45 }] : []),
      ...(line46 ? [{ code: 'HI_RENTERS', label: 'Credit for low-income household renters (Schedule X)', amount: line46 }] : []),
      ...(line47 ? [{ code: 'HI_CARE', label: 'Child and dependent care credit (Schedule X)', amount: line47 }] : []),
      ...(line49 ? [{ code: 'HI_EITC', label: 'Hawaii earned income tax credit (N-356)', amount: line49 }] : []),
    ],
    checks,
    notes: [...notes, `The ratio of Hawaii AGI to total AGI is ${line37.toFixed(2)} (line 37); it prorates the standard deduction and exemptions.`],
  };
}

export const STATE = Object.freeze({
  code: 'HI',
  name: 'Hawaii',
  built: true,
  forms: Object.freeze({ resident: 'N-11', partYear: 'N-15', nonresident: 'N-15' }),
  due: (taxYear) => `${Number(taxYear) + 1}-04-20`,
  questions: Object.freeze([
    Object.freeze({ id: 'hiBondInterest', kind: 'amount', text: 'Tax-exempt interest from Hawaii state or county bonds', help: 'Interest on other states\' bonds is added on line 9; Hawaii bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'hiExemptPension', kind: 'amount', text: 'Pension income from an employer-funded plan (public pensions, and the employer-funded part of private plans) included in federal income', help: 'Hawaii does not tax it (N-11 line 13). IRA distributions and pensions you funded yourself stay taxable. Enter 0 if none.' }),
    Object.freeze({ id: 'hiReservePay', kind: 'amount', text: 'Military reserve or Hawaii National Guard duty pay', help: 'The first $8,636 is subtracted on line 15. Enter 0 if none.' }),
    Object.freeze({ id: 'hiCareExpenses', kind: 'amount', text: 'Child or dependent care costs paid so you (and your spouse) could work', help: 'For the refundable care credit on Schedule X Part II. Enter 0 if none.' }),
    Object.freeze({ id: 'hiRentPaid', kind: 'amount', text: 'Rent paid for your Hawaii home on units subject to real property tax', help: 'For the low-income household renters credit (Schedule X Part I) if Hawaii AGI is under $30,000.' }),
    Object.freeze({ id: 'hiRentExclusions', kind: 'amount', text: 'Part of that rent for utilities, parking, ground rent or paid by rental assistance', help: 'Subtracted from rent on Schedule X line 6. Enter 0 if none.' }),
    Object.freeze({ id: 'hiRealEstateTaxes', kind: 'amount', text: 'Real property tax paid on Hawaii property (part-year and nonresident filers)', help: 'Nonresidents itemize only Hawaii real estate taxes (Worksheet NR-2).' }),
    Object.freeze({ id: 'hiMortgageInterest', kind: 'amount', text: 'Mortgage interest paid on Hawaii property (part-year and nonresident filers)', help: 'Nonresidents itemize only interest on Hawaii property (Worksheet NR-3).' }),
  ]),
  notCovered: Object.freeze([
    'The $7,000 disability exemption for blind, deaf or totally disabled filers (Form N-172)',
    'COLA and ERS wage differences, individual housing accounts, exceptional trees and other Hawaii additions and subtractions on lines 8, 10, 16 and 17',
    'The Hawaii state tax refund adjustment (line 18 worksheet b) and the Hawaii capital gain adjustments for assets with a different Hawaii basis',
    'Miscellaneous itemized deductions (Worksheet A-6), investment interest and casualty losses, and the part-year resident itemized worksheets PY-1 to PY-5',
    'Credit for tax paid to another state by a part-year resident, and the foreign tax part of the credit',
    'Child passenger restraint credit, Schedule CR nonrefundable business and energy credits, and carryovers',
    'Form N-615 kiddie tax, N-168 income averaging, and N-152 lump-sum tax',
    'For 2026: the qualified tips deduction and the non-itemizer charitable deduction allowed by Act 35 (form lines not published)',
  ]),
  compute,
});
