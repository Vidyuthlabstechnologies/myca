import { whole, positive, bracketTax, rateOf, ratio, check, lineTable, byStatus } from '../state-kit.mjs';
import { incomeByOwner, filerOf, bornOnOrBefore, splitByOwner, OWNERS, nextBusinessDay, applyRatio } from './va-spouses.mjs';

const NO_CREDIT_STATES = new Set(['AZ', 'CA', 'OR', 'DC']);
const WAGES_EXEMPT_STATES = new Set(['KY', 'MD', 'PA', 'WV']);
const BORDER_STATES = new Set(['KY', 'MD', 'NC', 'WV']);
const married = (status) => status === 'mfj' || status === 'mfs';
const jointOrOther = (table, status) => (status === 'mfj' ? table.mfj : table.other);

function ownersOf(ctx) {
  return ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
}

function ageDeduction(ctx, rule) {
  const fixed = {};
  const incomeBased = [];
  for (const owner of ownersOf(ctx)) {
    const filer = filerOf(ctx, owner);
    if (bornOnOrBefore(filer, rule.notIncomeBasedBornOnOrBefore)) fixed[owner] = rule.amount;
    else if (bornOnOrBefore(filer, rule.bornOnOrBefore)) incomeBased.push(owner);
  }
  const result = { taxpayer: fixed.taxpayer || 0, spouse: fixed.spouse || 0, worksheet: null };
  if (incomeBased.length) {
    const line1 = incomeBased.length;
    const line2 = ctx.income.agi;
    const line6 = line2;
    const line7 = ctx.income.socialSecurityTaxable;
    const line8 = line6 - line7;
    const line9 = married(ctx.filingStatus) ? rule.afagiThreshold.married : rule.afagiThreshold.single;
    const line11 = Math.max(0, line8 - line9);
    const line12 = line1 * rule.amount;
    const line14 = Math.max(0, line12 - line11);
    const first = line1 === 2 ? Math.round(line14 / 2) : line14;
    result[incomeBased[0]] += first;
    if (line1 === 2) result[incomeBased[1]] += line14 - first;
    result.worksheet = lineTable({ 1: line1, 2: line2, 6: line6, 7: line7, 8: line8, 9: line9, 11: line11, 12: line12, 14: line14, ...(line1 === 2 ? { 15: first } : {}) });
  }
  result.total = result.taxpayer + result.spouse;
  return result;
}

function militarySubtraction(pay, maximum) {
  const amount = positive(pay);
  if (!amount) return 0;
  return Math.min(amount, Math.max(0, maximum - Math.max(0, amount - maximum)));
}

function scheduleA(ctx, itemizedRule, limitRule, { scale, medicalAgi, partYear }) {
  const fedA = ctx.itemized.federalScheduleA || {};
  const salesTax = ctx.itemized.generalSalesTax > 0;
  const saltCap = whole(fedA['5d']) > whole(fedA['5e']) ? whole(fedA['5e']) : Number.POSITIVE_INFINITY;
  const lines = (factor, agiForMedical) => {
    const s = (value) => Math.round(whole(value) * factor);
    const l1 = s(ctx.itemized.medicalPaid);
    const l2 = Math.max(0, agiForMedical);
    const l3 = rateOf(l2, itemizedRule.medicalFloorBasisPoints);
    const l4 = Math.max(0, l1 - l3);
    const l5a = s(salesTax ? Math.min(whole(fedA['5a']), saltCap) : whole(fedA['5a']));
    const l5b = s(fedA['5b']);
    const l5c = s(fedA['5c']);
    const l7 = l5a + l5b + l5c;
    const l10 = s(fedA['10']);
    const l14 = s(fedA['14']);
    const l16c = s(fedA['16']);
    return { 1: l1, 2: l2, 3: l3, 4: l4, '5a': l5a, '5b': l5b, '5c': l5c, 7: l7, 10: l10, 14: l14, '16c': l16c, 17: l4 + l7 + l10 + l14 + l16c };
  };
  const full = lines(1, ctx.income.agi);
  const own = partYear ? lines(scale, medicalAgi) : full;
  const capped = (row) => Math.min(row['5a'], saltCap);
  const w1 = full[4] + capped(full) + full['5b'] + full['5c'] + full[10] + full[14] + full['16c'];
  const w2 = full[4];
  const w3 = w1 - w2;
  const threshold = byStatus(limitRule.threshold, ctx.filingStatus);
  const w7 = ctx.income.agi - threshold;
  let worksheet = null;
  let line17 = own[17];
  let line18 = salesTax ? 0 : own['5a'];
  if (w3 > 0 && w7 > 0) {
    const w4 = rateOf(w3, limitRule.maximumBasisPoints);
    const w8 = rateOf(w7, limitRule.reductionBasisPoints);
    const w9 = Math.min(w4, w8);
    const w11 = Math.round((w9 / w3) * 1000) / 1000;
    const ownCapped = capped(own);
    const w12 = partYear ? own[4] + ownCapped + own['5b'] + own['5c'] + own[10] + own[14] + own['16c'] - applyRatio(ownCapped + own['5b'] + own['5c'] + own[10] + own[14] + own['16c'], w11, 3) : w1 - w9;
    const w13 = salesTax ? 0 : ownCapped;
    const w14 = applyRatio(w13, w11, 3);
    const w15 = w13 - w14;
    line17 = w12;
    line18 = w15;
    worksheet = lineTable({ 1: w1, 2: w2, 3: w3, 4: w4, 5: ctx.income.agi, 6: threshold, 7: w7, 8: w8, 9: w9, 10: w3, 11: w11, [partYear ? '12b' : '12a']: w12, 13: w13, 14: w14, 15: w15 });
  }
  const line19 = Math.max(0, line17 - line18);
  return { lines: lineTable({ ...own, 17: line17, 18: line18, 19: line19 }), worksheet, total: line19 };
}

function povertyGuideline(credits, people) {
  const table = credits.povertyGuidelines;
  if (people <= table.length) return table[Math.max(1, people) - 1];
  return table[table.length - 1] + (people - table.length) * credits.povertyPerAdditionalPerson;
}

function spouseTaxAdjustment(ctx, rule, { line15, line16, byOwner, addition, age, exemptionsAgeBlind, subtractionsByOwner }) {
  const additionWeights = { taxpayer: 0, spouse: 0 };
  for (const form of ctx.forms) {
    if (form.kind !== '1099-INT' && form.kind !== '1099-DIV') continue;
    const owner = form.owner === 'spouse' ? 'spouse' : 'taxpayer';
    additionWeights[owner] += positive(form.fields?.taxExemptInterest) + positive(form.fields?.exemptInterestDividends);
  }
  const additions = splitByOwner(addition, additionWeights, true);
  const vagi = {};
  const step = {};
  for (const owner of OWNERS) {
    const p = byOwner[owner];
    const fagi = p.wages + p.business + p.interest + p.usInterest + p.dividends + p.capitalGain + p.ira + p.pension + p.socialSecurityTaxable + p.unemployment + p.stateRefund + p.other - p.adjustments;
    const subtract = age[owner] + p.socialSecurityTaxable + p.stateRefund + subtractionsByOwner[owner];
    vagi[owner] = fagi + additions[owner] - subtract;
    step[owner] = lineTable({ 11: fagi, 12: additions[owner], 13: fagi + additions[owner], 14: age[owner], 15: p.socialSecurityTaxable, 16: p.stateRefund, 17: subtractionsByOwner[owner], 18: subtract, 19: vagi[owner] });
  }
  const exemption = (owner) => rule.personalExemption + rule.ageOrBlindExemption * exemptionsAgeBlind[owner];
  const line3 = { taxpayer: vagi.taxpayer - exemption('taxpayer'), spouse: vagi.spouse - exemption('spouse') };
  const base = { you: step.taxpayer, spouse: step.spouse, 1: { taxpayer: vagi.taxpayer, spouse: vagi.spouse }, 2: { taxpayer: exemption('taxpayer'), spouse: exemption('spouse') }, 3: line3 };
  if (line3.taxpayer <= 0 || line3.spouse <= 0) return { amount: 0, worksheet: { ...base, 12: 0 }, spouseVagi: vagi.spouse };
  const tax = (amount) => bracketTax(amount, rule.brackets);
  const line4 = line15;
  const line5 = Math.min(line3.taxpayer, line3.spouse);
  if (line5 > rule.spouseTaxAdjustmentIncome && line4 > 2 * rule.spouseTaxAdjustmentIncome) return { amount: rule.spouseTaxAdjustmentMaximum, worksheet: { ...base, 4: line4, 5: line5, 12: rule.spouseTaxAdjustmentMaximum }, spouseVagi: vagi.spouse };
  const line6 = Math.max(0, line4 - line5);
  const line7 = line4 / 2;
  const line8 = tax(Math.min(line5, line7));
  const line9 = tax(Math.max(line6, line7));
  const line10 = line8 + line9;
  const line11 = line16;
  const line12 = Math.min(rule.spouseTaxAdjustmentMaximum, Math.max(0, line11 - line10));
  return { amount: line12, worksheet: { ...base, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12 }, spouseVagi: vagi.spouse };
}

function otherStateCredit(ctx, filing, { line15, line18 }) {
  const rows = [];
  const checks = [];
  let total = 0;
  const others = filing.otherStates || [];
  for (const other of others) {
    if (NO_CREDIT_STATES.has(other.state)) {
      checks.push(check('warning', 'VA_OSC_NOT_ALLOWED', `Virginia gives no credit for tax paid to ${other.state}; ${other.state === 'DC' ? 'the District does not tax nonresidents on wages, so ask it for a refund of any withholding' : `${other.state} gives the credit to Virginia residents on its own nonresident return instead`}.`));
      continue;
    }
    const sourced = other.sourced || {};
    const wages = WAGES_EXEMPT_STATES.has(other.state) ? 0 : positive(sourced.wages);
    const qualifying = wages + whole(sourced.businessIncome) + Math.max(0, whole(sourced.capitalGain));
    const everything = Object.entries(sourced).filter(([key]) => key !== 'adjustments' && key !== 'qualifiedDividends' && key !== 'usObligationInterest').reduce((sumOf, [, value]) => sumOf + whole(value), 0);
    if (qualifying <= 0) continue;
    const line3 = qualifying;
    const line4 = line15;
    const line5 = everything > 0 ? Math.round(positive(other.tax) * Math.min(1, qualifying / everything)) : 0;
    const border = others.length === 1 && BORDER_STATES.has(other.state) && whole(sourced.wages) + whole(sourced.businessIncome) === everything && line4 >= line3;
    const line7 = line18;
    const line8 = border ? 1 : ratio(line3, line4, { places: 3, floor: 0.001, cap: 1 });
    const line9 = applyRatio(line7, line8, 3);
    const line10 = Math.min(line5, line9);
    rows.push({ state: other.state, border, lines: lineTable({ 3: line3, 4: line4, 5: line5, 7: line7, 8: line8, 9: line9, 10: line10 }) });
    total += line10;
  }
  if (rows.length) checks.push(check('info', 'VA_OSC_RETURN', 'Enclose a copy of each other state\'s return with Schedule OSC; only tax on earned, business and capital gain income counts.'));
  return { rows, total: Math.min(total, line18), checks };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const ageRule = reader.read('age-deduction');
  const credits = reader.read('credits');
  const subtractionRule = reader.read('subtractions');
  if (!rule || !ageRule || !credits || !subtractionRule) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Virginia figures for ${ctx.taxYear}.` };
  const itemizing = Boolean(ctx.itemized.federalItemized && ctx.itemized.federalScheduleA);
  const itemizedRule = itemizing ? reader.read('itemized') : null;
  const limitRule = itemizing ? reader.read('itemized-limitation') : null;
  if (itemizing && (!itemizedRule || !limitRule)) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Virginia itemized deduction figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const nonresident = !resident && !partYear;
  const joint = ctx.filingStatus === 'mfj';
  const checks = [];
  const notes = ['Tax is worked out with the Virginia Tax Rate Schedule, which the instructions allow in place of the Tax Table.'];
  const tax = (amount) => bracketTax(amount, rule.brackets);
  const byOwner = incomeByOwner(ctx);
  const sourced = filing.sourced;
  const share = partYear ? filing.share : 0;
  const exemptionRatio = partYear ? ratio(filing.residentDays, ctx.daysInYear, { places: 3 }) : 1;
  const vaPeriodAgi = partYear ? filing.sourcedAgi : income.agi;
  const deductionPercent = partYear ? ratio(vaPeriodAgi, income.agi, { places: 3, cap: 1 }) : 1;

  const addition = Math.max(0, income.taxExemptInterest - positive(answers.vaMunicipalInterest));
  const age = ageDeduction(ctx, ageRule);
  const military = { taxpayer: militarySubtraction(answers.militaryBasicPay, subtractionRule.militaryBasicPayMaximum), spouse: joint ? militarySubtraction(answers.spouseMilitaryBasicPay, subtractionRule.militaryBasicPayMaximum) : 0 };
  const filers = ctx.filers;
  const ageBlindOf = (owner) => {
    const filer = filerOf(ctx, owner);
    if (!filer) return 0;
    return (bornOnOrBefore(filer, ageRule.bornOnOrBefore) ? 1 : 0) + (filer.blind ? 1 : 0);
  };
  const personalCount = filers.length + ctx.dependents.length;
  const oldest = filers.reduce((most, filer) => Math.max(most, filer.age ?? 0), 0);
  const saversContributions = positive(answers.commonwealthSaversContributions);
  const saversAccounts = Math.max(1, positive(answers.commonwealthSaversAccounts));
  const savers = oldest >= subtractionRule.collegeSavingsFullDeductionAge ? saversContributions : Math.min(saversContributions, subtractionRule.collegeSavingsPerAccount * saversAccounts);
  const dependentFiler = filers.some((filer) => filer.canBeClaimedAsDependent);
  const earned = income.wages + income.businessIncome;
  const federalEic = whole(ctx.federal.lines['27']);
  const scheduleAResult = itemizing ? scheduleA(ctx, itemizedRule, limitRule, { scale: share, medicalAgi: vaPeriodAgi, partYear }) : null;
  if (itemizing && partYear) checks.push(check('warning', 'VA_PY_ITEMIZED_PRORATED', 'Virginia allows only itemized deductions paid while you lived in Virginia; MyCA prorated each one by your Virginia share of income.', 'Replace the amounts with what you paid while a Virginia resident if they differ.'));

  const build = (withCredit) => {
    const ageUsed = withCredit ? { taxpayer: 0, spouse: 0, total: 0 } : age;
    const militaryUsed = withCredit ? { taxpayer: 0, spouse: 0 } : military;
    const ageBlind = withCredit ? { taxpayer: 0, spouse: 0 } : { taxpayer: ageBlindOf('taxpayer'), spouse: joint ? ageBlindOf('spouse') : 0 };
    const ageBlindCount = ageBlind.taxpayer + ageBlind.spouse;
    const usInterest = partYear ? Math.min(income.usObligationInterest, whole(sourced.usObligationInterest)) : income.usObligationInterest;
    const unemployment = partYear ? Math.min(income.unemployment, whole(sourced.unemployment)) : income.unemployment;
    const socialSecurity = partYear ? Math.min(income.socialSecurityTaxable, whole(sourced.socialSecurityTaxable)) : income.socialSecurityTaxable;
    const refund = partYear ? Math.min(income.stateRefundTaxable, whole(sourced.stateRefundTaxable)) : income.stateRefundTaxable;
    const adj7 = usInterest + unemployment + militaryUsed.taxpayer + militaryUsed.spouse;
    const adj3 = partYear ? Math.round(addition * share) : addition;
    const adj9 = savers;
    const l = {};
    l[1] = income.agi;
    l[2] = adj3;
    l[3] = l[1] + l[2];
    l['4a'] = partYear ? applyRatio(ageUsed.taxpayer, exemptionRatio, 3) : ageUsed.taxpayer;
    l['4b'] = partYear ? applyRatio(ageUsed.spouse, exemptionRatio, 3) : ageUsed.spouse;
    l[5] = socialSecurity;
    l[6] = refund;
    const outside = partYear ? Math.max(0, income.agi - vaPeriodAgi) : 0;
    let vagi;
    let deductions;
    const exemptionsBase = personalCount * rule.personalExemption + ageBlindCount * rule.ageOrBlindExemption;
    const standardFull = jointOrOther(rule.standardDeduction, ctx.filingStatus);
    const standardLimited = dependentFiler ? Math.min(standardFull, earned) : standardFull;
    if (partYear) {
      l[7] = outside;
      l[8] = adj7;
      l[9] = l['4a'] + l['4b'] + l[5] + l[6] + l[7] + l[8];
      l[10] = l[3] - l[9];
      l[11] = itemizing ? scheduleAResult.total : 0;
      l[12] = itemizing ? 0 : applyRatio(standardLimited, deductionPercent, 3);
      l[13] = applyRatio(exemptionsBase, exemptionRatio, 3);
      l[14] = adj9;
      l[15] = l[11] + l[12] + l[13] + l[14];
      l[16] = l[10] - l[15];
      vagi = l[10];
      deductions = l[16];
    } else {
      l[7] = adj7;
      l[8] = l['4a'] + l['4b'] + l[5] + l[6] + l[7];
      l[9] = l[3] - l[8];
      l[10] = itemizing ? scheduleAResult.total : 0;
      l[11] = itemizing ? 0 : standardLimited;
      l[12] = exemptionsBase;
      l[13] = adj9;
      l[14] = l[10] + l[11] + l[12] + l[13];
      l[15] = l[9] - l[14];
      vagi = l[9];
      deductions = l[15];
    }
    const taxable = deductions;
    const belowThreshold = vagi < jointOrOther(rule.filingThreshold, ctx.filingStatus);
    let schedule763 = null;
    let taxLine;
    let netTax;
    let sta = null;
    const out = { lines: l, vagi, belowThreshold, ageUsed, ageBlind, militaryUsed, adj: { 3: adj3, 7: adj7, 9: adj9 } };
    if (partYear) {
      l[17] = belowThreshold ? 0 : tax(l[16]);
      l[18] = l[17];
      taxLine = 18;
      netTax = l[18];
    } else if (nonresident) {
      const colA = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 5: income.businessIncome, 6: income.capitalGain, 8: income.iraTaxable + income.pensionTaxable, 11: income.otherIncome + income.unemployment, 12: addition };
      const colB = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest), 3: whole(sourced.ordinaryDividends), 5: whole(sourced.businessIncome), 6: whole(sourced.capitalGain), 8: whole(sourced.iraTaxable) + whole(sourced.pensionTaxable), 11: whole(sourced.otherIncome) + whole(sourced.unemployment), 12: 0 };
      colA[14] = Object.values(colA).reduce((total, value) => total + value, 0);
      colB[14] = Object.values(colB).reduce((total, value) => total + value, 0);
      const percent = ratio(colB[14], colA[14], { places: 3, cap: 1 });
      l[16] = percent;
      l[17] = applyRatio(Math.max(0, l[15]), percent, 3);
      l[18] = belowThreshold ? 0 : tax(l[17]);
      schedule763 = { A: lineTable(colA), B: lineTable(colB), 15: percent };
      taxLine = 18;
      netTax = l[18];
    } else {
      l[16] = belowThreshold ? 0 : tax(l[15]);
      if (joint && !belowThreshold && l[15] > 3000) {
        const subtractionsByOwner = { taxpayer: militaryUsed.taxpayer, spouse: militaryUsed.spouse };
        const usSplit = { taxpayer: byOwner.taxpayer.usInterest, spouse: byOwner.spouse.usInterest };
        const unemploymentSplit = { taxpayer: byOwner.taxpayer.unemployment, spouse: byOwner.spouse.unemployment };
        for (const owner of OWNERS) subtractionsByOwner[owner] += usSplit[owner] + unemploymentSplit[owner];
        sta = spouseTaxAdjustment(ctx, rule, { line15: l[15], line16: l[16], byOwner, addition: adj3, age: ageUsed, exemptionsAgeBlind: ageBlind, subtractionsByOwner });
      }
      l[17] = sta ? sta.amount : 0;
      l[18] = l[16] - l[17];
      taxLine = 18;
      netTax = l[18];
    }
    const osc = resident ? otherStateCredit(ctx, filing, { line15: l[15], line18: netTax }) : { rows: [], total: 0, checks: [] };
    out.osc = osc;
    out.sta = sta;
    out.schedule763 = schedule763;
    out.taxLine = taxLine;
    out.netTax = netTax;
    out.taxable = taxable;
    let lowIncome = { nonrefundable: 0, refundable: 0, schedule: null };
    if (withCredit) {
      const familyVagi = partYear || nonresident ? income.agi + addition - income.socialSecurityTaxable - income.stateRefundTaxable - income.usObligationInterest - income.unemployment : vagi;
      const exemptionsCount = personalCount;
      const guideline = povertyGuideline(credits, exemptionsCount);
      const qualifies = familyVagi <= guideline;
      const a12 = qualifies ? exemptionsCount : 0;
      const a13 = a12 * credits.lowIncomePerExemption;
      const a14 = federalEic;
      const eitc = rateOf(a14, credits.eitcBasisPoints);
      const room = Math.max(0, netTax - osc.total);
      if (resident) {
        const nonrefundable = Math.min(a13, room);
        const refundableBetter = eitc >= nonrefundable;
        lowIncome = { nonrefundable: refundableBetter ? 0 : nonrefundable, refundable: refundableBetter ? eitc : 0, schedule: lineTable({ 10: familyVagi, 11: exemptionsCount, 12: a12, 13: a13, 14: a14, '16b': eitc, 17: refundableBetter ? eitc : nonrefundable }) };
      } else {
        const a16 = Math.max(a13, eitc);
        const a17 = Math.min(a16, room);
        lowIncome = { nonrefundable: a17, refundable: 0, schedule: lineTable({ 10: familyVagi, 11: exemptionsCount, 12: a12, 13: a13, 14: a14, 15: eitc, 16: a16, 17: a17 }) };
      }
    }
    out.lowIncome = lowIncome;
    out.liability = netTax - osc.total - lowIncome.nonrefundable - lowIncome.refundable;
    return out;
  };

  const plain = build(false);
  const creditAllowed = !dependentFiler;
  const withCredit = creditAllowed ? build(true) : null;
  const creditWorth = withCredit && withCredit.lowIncome.nonrefundable + withCredit.lowIncome.refundable > 0;
  const chosen = creditWorth && withCredit.liability < plain.liability ? withCredit : plain;
  if (chosen === withCredit) {
    if (age.total > 0 || ageBlindOf('taxpayer') + (joint ? ageBlindOf('spouse') : 0) > 0 || military.taxpayer + military.spouse > 0) checks.push(check('info', 'VA_CREDIT_INSTEAD_OF_AGE', 'Virginia does not allow the low-income credit or Virginia earned income credit together with the age deduction, the 65 or blind exemptions or the military basic pay subtraction; the credit gave the lower tax, so MyCA used it.'));
  } else if (creditWorth) {
    checks.push(check('info', 'VA_AGE_INSTEAD_OF_CREDIT', 'You could claim the Virginia low-income or earned income credit instead of the age deduction, the 65 or blind exemptions or the military basic pay subtraction; those gave the lower tax, so MyCA used them.'));
  }
  if (ctx.filingStatus === 'mfs' && age.worksheet) checks.push(check('warning', 'VA_AGE_DEDUCTION_MFS', 'A married taxpayer\'s income-based age deduction uses the combined income of both spouses even on separate returns; MyCA used only your income.', 'Have your CPA recompute the age deduction with your spouse\'s income.'));
  if (chosen.sta && byOwner.assumed.length) checks.push(check('info', 'VA_STA_JOINT_SPLIT', `The spouse tax adjustment needs each spouse's own income; ${byOwner.assumed.join(', ')} had no owner on the forms and was split 50/50.`));
  if (saversContributions > 0 && !positive(answers.commonwealthSaversAccounts) && oldest < subtractionRule.collegeSavingsFullDeductionAge) checks.push(check('warning', 'VA_SAVERS_ACCOUNTS', 'The Commonwealth Savers deduction is up to $4,000 per account; MyCA counted one account because none was given.', 'Answer how many accounts you contributed to.'));
  if (chosen.belowThreshold) notes.push('Your Virginia adjusted gross income is under the filing threshold, so your Virginia tax is $0 and any Virginia withholding is refunded.');
  checks.push(...chosen.osc.checks);

  const l = chosen.lines;
  const useTax = positive(answers.useTax);
  const spouseWithheld = joint ? ctx.w2.filter((row) => row.owner === 'spouse' && row.state === 'VA').reduce((total, row) => total + row.stateWithheld, 0) : 0;
  const w19b = Math.min(spouseWithheld, filing.payments.withheld);
  const w19a = filing.payments.withheld - w19b;
  const l20 = filing.payments.estimated;
  const l22 = filing.payments.extension;
  const l23 = chosen.lowIncome.nonrefundable + chosen.lowIncome.refundable;
  const l24 = chosen.osc.total;
  const l26 = w19a + w19b + l20 + l22 + l23 + l24;
  const l18 = chosen.netTax;
  const lines = lineTable({ ...l, '19a': w19a, '19b': w19b, 20: l20, 21: 0, 22: l22, 23: l23, 24: l24, 25: 0, 26: l26, 27: Math.max(0, l18 - l26), 28: Math.max(0, l26 - l18), 33: useTax });
  const nonrefundable = [
    ...(chosen.lowIncome.nonrefundable ? [{ code: 'VA_LOW_INCOME', label: resident ? 'Credit for low-income individuals' : 'Credit for low-income individuals or Virginia earned income credit', amount: chosen.lowIncome.nonrefundable }] : []),
    ...(l24 ? [{ code: 'VA_OTHER_STATE', label: 'Credit for tax paid to another state', amount: l24 }] : []),
  ];
  const refundable = chosen.lowIncome.refundable ? [{ code: 'VA_EITC_REFUNDABLE', label: 'Refundable Virginia earned income credit', amount: chosen.lowIncome.refundable }] : [];
  const totalTax = Math.max(0, l18 - l24 - chosen.lowIncome.nonrefundable) + useTax;
  return {
    form: resident ? '760' : partYear ? '760PY' : '763',
    lines,
    schedules: {
      ADJ: lineTable({ 1: chosen.adj[3], 3: chosen.adj[3], 7: chosen.adj[7], 9: chosen.adj[9], ...(chosen.militaryUsed.taxpayer + chosen.militaryUsed.spouse ? { 'military-basic-pay': chosen.militaryUsed.taxpayer + chosen.militaryUsed.spouse } : {}), ...(chosen.lowIncome.schedule || {}) }),
      ...(age.worksheet && chosen.ageUsed.total ? { 'age-deduction': age.worksheet } : {}),
      ...(scheduleAResult ? { A: scheduleAResult.lines, ...(scheduleAResult.worksheet ? { 'limited-itemized': scheduleAResult.worksheet } : {}) } : {}),
      ...(chosen.sta ? { STA: chosen.sta.worksheet } : {}),
      ...(chosen.schedule763 ? { 'nonresident-allocation': chosen.schedule763 } : {}),
      ...(partYear ? { 'schedule-of-income': lineTable({ 'standard-deduction-percent': deductionPercent, 'exemption-ratio': exemptionRatio, 'income-outside-virginia': l[7] }) } : {}),
      ...(chosen.osc.rows.length ? { OSC: { credits: chosen.osc.rows, 21: l24 } } : {}),
    },
    stateIncome: nonresident ? chosen.schedule763.B[14] : chosen.vagi,
    taxableIncome: Math.max(0, nonresident ? l[17] : chosen.taxable),
    taxBeforeCredits: l18,
    nonrefundableCredits: nonrefundable,
    otherStateCredit: l24,
    otherTaxes: useTax ? [{ code: 'VA_USE_TAX', label: 'Consumer\'s use tax', amount: useTax }] : [],
    totalTax,
    refundableCredits: refundable,
    checks,
    notes,
  };
}

const PAYMENT_LABELS = Object.freeze({
  '19a': 'Your Virginia withholding',
  '19b': 'Spouse\'s Virginia withholding',
  20: 'Estimated tax payments',
  21: 'Prior-year overpayment applied to estimated tax',
  22: 'Extension payments',
  23: 'Credit for low-income individuals or earned income credit',
  24: 'Credit for tax paid to another state (Schedule OSC)',
  25: 'Credits from Schedule CR',
  26: 'Total payments and credits',
  27: 'Tax you owe',
  28: 'Tax overpayment',
  33: 'Consumer\'s use tax',
});

const FRONT_LABELS = Object.freeze({
  1: 'Federal adjusted gross income',
  2: 'Additions from Schedule ADJ',
  3: 'Line 1 plus line 2',
  '4a': 'Age deduction: you',
  '4b': 'Age deduction: spouse',
  5: 'Social Security and Tier 1 Railroad Retirement benefits',
  6: 'State income tax refund reported on federal return',
});

const LABELS_760 = Object.freeze({
  ...FRONT_LABELS,
  ...PAYMENT_LABELS,
  7: 'Subtractions from Schedule ADJ',
  8: 'Add lines 4, 5, 6 and 7',
  9: 'Virginia adjusted gross income (VAGI)',
  10: 'Itemized deductions from Virginia Schedule A',
  11: 'Standard deduction',
  12: 'Exemptions',
  13: 'Deductions from Schedule ADJ',
  14: 'Add lines 10, 11, 12 and 13',
  15: 'Virginia taxable income',
  16: 'Tax from tax table or tax rate schedule',
  17: 'Spouse tax adjustment',
  18: 'Net amount of tax',
});

const LABELS_760PY = Object.freeze({
  ...FRONT_LABELS,
  ...PAYMENT_LABELS,
  7: 'Income from your period of residence outside Virginia',
  8: 'Subtractions from Schedule 760PY ADJ',
  9: 'Add lines 4a, 4b, 5, 6, 7 and 8',
  10: 'Virginia adjusted gross income (VAGI)',
  11: 'Itemized deductions paid while a Virginia resident',
  12: 'Standard deduction',
  13: 'Prorated exemption amount',
  14: 'Deductions from Schedule 760PY ADJ',
  15: 'Add lines 11, 12, 13 and 14',
  16: 'Virginia taxable income',
  17: 'Tax from tax table or tax rate schedule',
  18: 'Total tax',
});

const LABELS_763 = Object.freeze({
  ...FRONT_LABELS,
  ...PAYMENT_LABELS,
  7: 'Subtractions from Schedule 763 ADJ',
  8: 'Add lines 4a, 4b, 5, 6 and 7',
  9: 'Virginia adjusted gross income (VAGI)',
  10: 'Itemized deductions from Virginia Schedule A',
  11: 'Standard deduction',
  12: 'Exemption amount',
  13: 'Deductions from Schedule 763 ADJ',
  14: 'Add lines 10, 11, 12 and 13',
  15: 'Virginia taxable income computed as a resident',
  16: 'Nonresident allocation percentage',
  17: 'Nonresident taxable income',
  18: 'Income tax from tax table or tax rate schedule',
});

const LABELS = Object.freeze({ 'full-year': LABELS_760, 'part-year': LABELS_760PY, nonresident: LABELS_763 });

export const STATE = Object.freeze({
  code: 'VA',
  name: 'Virginia',
  built: true,
  forms: Object.freeze({ resident: '760', partYear: '760PY', nonresident: '763' }),
  labels: (taxYear, residency) => LABELS[residency] || LABELS_760,
  due: (taxYear) => nextBusinessDay(`${Number(taxYear) + 1}-05-01`),
  questions: Object.freeze([
    Object.freeze({ id: 'vaMunicipalInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from Virginia state or local bonds (including Virginia-bond mutual fund dividends)', help: 'Interest from other states\' bonds is added back on Schedule ADJ; Virginia bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'militaryBasicPay', kind: 'amount', text: 'Your military basic pay for active duty of more than 90 days (not Army, Navy, Air Force or Marine reserve or another state\'s National Guard)', help: 'Up to $15,000 is subtracted, reduced $1 for each $1 over $15,000 (subtraction code 38). Enter 0 if none.' }),
    Object.freeze({ id: 'spouseMilitaryBasicPay', when: { filingStatus: ['mfj'] }, kind: 'amount', text: 'Your spouse\'s military basic pay for active duty of more than 90 days', help: 'Each spouse on a joint return may claim the subtraction separately. Enter 0 if none.' }),
    Object.freeze({ id: 'commonwealthSaversContributions', kind: 'amount', text: 'Contributions to Commonwealth Savers (formerly Virginia529) accounts in the year', help: 'Deductible up to $4,000 per account, or all of it if you are 70 or older (deduction code 104).' }),
    Object.freeze({ id: 'commonwealthSaversAccounts', when: { answer: { id: 'commonwealthSaversContributions' } }, kind: 'count', text: 'Number of Commonwealth Savers accounts you contributed to', help: 'The $4,000 limit applies per account.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Virginia consumer\'s use tax owed on online, mail order or out-of-state purchases', help: 'Purchases with no Virginia sales tax (Line 33). Enter 0 if none.' }),
  ]),
  notCovered: Object.freeze(['Disability income subtraction (in place of the age deduction)', 'Subtractions other than U.S. interest, unemployment and military basic pay (National Guard, federal and state employees, Virginia lottery prizes, retirement previously taxed elsewhere and others)', 'Commonwealth Savers carryforward of contributions above the annual limit', 'Schedule CR credits', 'Filing Status 4 (combined separate return on Form 760PY) and Column B for a spouse', 'Part-year residents\' credit for tax paid to another state', 'Conformity additions and subtractions to federal adjusted gross income', 'Investment interest, casualty and gambling losses as separate items in the limited itemized deduction worksheet', 'Foreign income tax on Schedule A, Line 6', 'Addition to tax for underpaid estimated tax (Form 760C or 760F), penalties and voluntary contributions']),
  compute,
});
