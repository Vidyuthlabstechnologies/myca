import { whole, positive, sum, bracketTax, rateOf, ratio, check, byStatus, lineTable } from '../state-kit.mjs';
import { residentMonths } from './id.mjs';

function netLongTermGain(ctx) {
  const d = ctx.federal.schedules?.D;
  if (d) return Math.max(0, Math.min(whole(d['15']), whole(d['16'])));
  return Math.max(0, Math.min(whole(ctx.income.capitalGain), whole(ctx.income.capitalGainDistributions)));
}

function page2(taxable, ltcg, rule, status) {
  const l1 = positive(taxable);
  const l2 = ltcg;
  const l3 = Math.min(l1, l2);
  const l4 = l1 - l3;
  const l5 = byStatus(rule.capitalGain.threshold, status);
  const l6 = Math.max(0, l5 - l4);
  const l7 = Math.min(l3, l6);
  const l8 = rateOf(l7, rule.capitalGain.lowRateBp);
  const l9 = Math.max(0, l3 - l6);
  const l10 = rateOf(l9, rule.capitalGain.highRateBp);
  const l11 = l8 + l10;
  const l12 = bracketTax(l4, byStatus(rule.ordinary, status));
  const l13 = l11 + l12;
  return lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7, 8: l8, 9: l9, 10: l10, 11: l11, 12: l12, 13: l13 });
}

function tableRate(table, amount) {
  const row = [...table].reverse().find((item) => amount >= item.from);
  return row ? row.rate : 0;
}

function grossHousehold(ctx, answers) {
  const income = ctx.income;
  return income.wages + income.taxableInterest + income.taxExemptInterest + income.ordinaryDividends + income.iraTaxable + income.pensionTaxable + income.socialSecurityBenefits + Math.max(0, income.capitalGain) + Math.max(0, income.businessIncome) + income.unemployment + Math.max(0, income.otherIncome) + positive(answers.mtOtherHouseholdIncome);
}

function elderlyCredit(ctx, filing, reader, checks) {
  const answers = filing.answers;
  const property = positive(answers.mtPropertyTaxBilled);
  const rent = positive(answers.mtRentPaid);
  if (!property && !rent) return null;
  const rule = reader.read('elderly-credit');
  if (!rule) return null;
  const oldest = Math.max(...ctx.filers.map((item) => item.age));
  const months = filing.residency === 'full-year' ? 12 : filing.residency === 'part-year' ? residentMonths(ctx.taxYear, filing.from, filing.to) : 0;
  const l18 = grossHousehold(ctx, answers);
  if (oldest < rule.minimumAge) {
    checks.push(check('warning', 'MT_2EC_AGE', `The elderly homeowner/renter credit needs a claimant who reached age ${rule.minimumAge} by December 31, so it is not claimed.`));
    return null;
  }
  if (months < rule.minimumResidentMonths) {
    checks.push(check('warning', 'MT_2EC_RESIDENCY', `The elderly homeowner/renter credit needs at least ${rule.minimumResidentMonths} months living in Montana, so it is not claimed.`));
    return null;
  }
  if (l18 >= rule.incomeLimit) {
    checks.push(check('info', 'MT_2EC_INCOME', `Gross household income of $${l18} is not under $${rule.incomeLimit}, so there is no elderly homeowner/renter credit.`));
    return null;
  }
  const l19 = rule.exclusion;
  const l20 = Math.max(0, l18 - l19);
  const l21 = tableRate(rule.reduction, l20);
  const l22 = Math.round(l20 * l21);
  const l23 = property;
  const l24 = rent;
  const l25 = rateOf(l24, rule.rentShareBp);
  const l26 = l23 + l25;
  const l27 = Math.max(0, l26 - l22);
  const l28 = Math.min(l27, rule.maximum);
  const l29 = tableRate(rule.multiplier, l18);
  const l30 = Math.round(l28 * l29);
  checks.push(check('info', 'MT_2EC_ATTEST', 'Schedule 2EC asks you to attest that you lived in a Montana home for at least six months and are the only member of your household claiming the credit.'));
  return lineTable({ 18: l18, 19: l19, 20: l20, 21: l21, 22: l22, 23: l23, 24: l24, 25: l25, 26: l26, 27: l27, 28: l28, 29: l29, 30: l30 });
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const sub = reader.read('subtractions');
  const credits = reader.read('credits');
  if (!rule || !sub || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Montana figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const lines1040 = ctx.federal.lines;

  const i1 = Math.max(0, income.taxExemptInterest - positive(answers.mtBondInterest));
  const scheduleA = ctx.federal.schedules?.A;
  let worksheetB = null;
  let i4 = 0;
  if (scheduleA) {
    const w1 = whole(scheduleA['5e']);
    const w3 = whole(scheduleA['5b']);
    const w4 = whole(scheduleA['5c']);
    const w5 = Math.max(0, w1 - w3 - w4);
    const w6 = whole(scheduleA['17']);
    const w7 = whole(ctx.federal.summary.standardDeduction);
    const w8 = Math.max(0, w6 - w7);
    const w9 = Math.min(w5, w8);
    i4 = w9;
    worksheetB = lineTable({ 1: w1, 2: 0, 3: w3, 4: w4, 5: w5, 6: w6, 7: w7, 8: w8, 9: w9, 10: 0, 11: w9 });
  }
  const i7 = i1 + i4;
  const i8 = income.stateRefundTaxable;
  const i9 = income.usObligationInterest;
  const i16 = Math.min(positive(answers.college529Deposits), byStatus(sub.college529Maximum, status));
  const i17 = Math.min(positive(answers.ableDeposits), byStatus(sub.ableMaximum, status));
  const i22 = Math.min(positive(answers.railroadTier1), income.socialSecurityTaxable);
  const i23 = Math.min(positive(answers.railroadTier2), income.pensionTaxable);
  const i24 = i8 + i9 + i16 + i17 + i22 + i23;
  const scheduleI = lineTable({ 1: i1, 4: i4, 7: i7, 8: i8, 9: i9, 16: i16, 17: i17, 22: i22, 23: i23, 24: i24 });

  const line1 = income.agi;
  const line2 = whole(lines1040['12']) + whole(lines1040['13b']);
  const line3 = Math.max(0, line1 - line2);
  const line4 = i7;
  const line5 = i24;
  const seniors = (status === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer')).filter((item) => item.age >= sub.seniorAge).length;
  const line6 = seniors * sub.seniorSubtraction;
  const line7 = Math.max(0, line3 + line4 - line5 - line6);
  const ltcg = netLongTermGain(ctx);
  const tax = page2(line7, ltcg, rule, status);

  let line8 = tax['13'];
  let scheduleII = null;
  let ordinaryTax = tax['12'];
  if (!resident) {
    const src = filing.sourced;
    const share = partYear ? filing.share : 0;
    const s21 = Math.min(ltcg, Math.max(0, whole(src.capitalGain)));
    const s = {
      1: whole(src.wages), 2: whole(src.taxableInterest), 3: whole(src.ordinaryDividends), 4: whole(src.stateRefundTaxable), 5: 0, 6: whole(src.businessIncome), 7: whole(src.capitalGain) - s21, 8: 0, 9: whole(src.iraTaxable) + whole(src.pensionTaxable), 10: 0, 11: 0, 12: whole(src.socialSecurityTaxable),
      13: whole(src.unemployment) + whole(src.otherIncome) - (partYear ? whole(src.adjustments) : 0),
      14: partYear ? Math.round(i7 * share) : 0,
    };
    s[15] = Object.values(s).reduce((total, amount) => total + amount, 0);
    s['16a'] = whole(lines1040['9']);
    s['16b'] = whole(income.adjustmentItems?.seTaxDeduction);
    s['16c'] = ltcg;
    s[16] = s['16a'] - s['16b'] - s['16c'];
    s[17] = ratio(s[15], s[16], { places: 6 });
    s[18] = tax['12'];
    s[19] = Math.round(s[18] * s[17]);
    s[20] = ltcg;
    s[21] = s21;
    s[22] = ratio(s21, ltcg, { places: 6 });
    s[23] = tax['11'];
    s[24] = Math.round(s[23] * s[22]);
    s[25] = s[19] + s[24];
    scheduleII = lineTable(s);
    line8 = s[25];
    ordinaryTax = s[19];
  }

  const otherRows = [];
  let credit = 0;
  if (resident) {
    for (const other of filing.otherStates) {
      const c1 = Math.min(positive(other.income), Math.max(0, whole(lines1040['9']) - ltcg));
      const c2 = positive(other.income);
      const c3 = whole(lines1040['9']) - ltcg;
      const c4 = positive(other.tax);
      const c5 = ordinaryTax;
      const c6 = ratio(c1, c2, { places: 6 });
      const c7 = Math.round(c4 * c6);
      const c8 = ratio(c1, c3, { places: 6 });
      const c9 = Math.round(c5 * c8);
      const c10 = Math.min(c4, c7, c9);
      otherRows.push({ state: other.state, lines: lineTable({ 1: c1, 2: c2, 3: c3, 4: c4, 5: c5, 6: c6, 7: c7, 8: c8, 9: c9, 10: c10, 20: 0, 21: c10 }) });
      credit += c10;
    }
    if (otherRows.length) checks.push(check('info', 'MT_OTHER_STATE_RETURN', 'Keep a copy of the other state\'s return; the Department may ask for it to support Schedule III Part II.'));
    if (ctx.w2.some((row) => row.state === 'ND')) checks.push(check(ctx.w2.some((row) => row.state === 'ND' && row.stateWithheld > 0) ? 'warning' : 'info', 'MT_ND_RECIPROCITY', 'North Dakota does not tax a Montana resident\'s wages under the reciprocity agreement, so no credit is allowed for North Dakota tax withheld from them. File a North Dakota return to get it back and give your employer Form NDW-R.'));
  }
  const line9 = Math.min(credit, line8);
  const line10 = line8 - line9;

  const fedEic = whole(lines1040['27']);
  let line15 = 0;
  let worksheetA = null;
  if (fedEic > 0 && resident) line15 = rateOf(fedEic, credits.eitcRateBp);
  else if (fedEic > 0 && partYear) {
    const federalEarned = whole(ctx.federal.schedules?.EIC?.earnedIncome) || income.wages + Math.max(0, income.businessIncome);
    const mtEarned = whole(filing.sourced.wages) + Math.max(0, whole(filing.sourced.businessIncome));
    const share = ratio(mtEarned, federalEarned, { places: 6 });
    line15 = Math.round(rateOf(fedEic, credits.eitcRateBp) * share);
    worksheetA = lineTable({ 1: fedEic, 2: rateOf(fedEic, credits.eitcRateBp), 3: mtEarned, 4: federalEarned, 5: share, 6: line15 });
  }
  if (fedEic > 0 && filing.residency === 'nonresident') notes.push('Nonresidents cannot claim the Montana earned income tax credit.');
  const ec = elderlyCredit(ctx, filing, reader, checks);
  const line16 = ec ? ec['30'] : 0;

  const iv1 = positive(answers.mtCheckoffs);
  const iv8 = iv1;
  const line11a = filing.payments.withheld;
  const line12 = filing.payments.estimated;
  const line14 = filing.payments.extension;
  const line19 = iv8;
  const line21 = line11a + line12 + line14 + line15 + line16 - line19;
  const line22 = Math.max(0, line10 - line21);
  const line23 = Math.max(0, line21 - line10);

  if (income.taxExemptInterest > 0 && answers.mtBondInterest === undefined) checks.push(check('info', 'MT_BOND_INTEREST', 'Interest from other states\' bonds is added on Schedule I line 1; Montana bond interest is not. All of it is added until you say how much is from Montana bonds.', 'Answer the Montana bond interest question.'));
  if (income.socialSecurityTaxable > 0 && answers.railroadTier1 === undefined) checks.push(check('info', 'MT_RAILROAD', 'Tier I and Tier II railroad retirement benefits taxed on the federal return are subtracted on Schedule I lines 22 and 23.', 'Answer the railroad retirement questions if you receive them.'));
  if (i4) notes.push('The state income tax deducted on federal Schedule A is added back on Schedule I line 4 (Worksheet B).');
  if (whole(lines1040['13a']) > 0) notes.push('Montana starts from federal taxable income before the qualified business income deduction, so that deduction is not taken (line 2 adds only Form 1040 lines 12e and 13b).');

  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, '11a': line11a, 12: line12, 13: 0, 14: line14, 15: line15, 16: line16, 17: 0, 19: line19, 21: line21, 22: line22, 23: line23 });
  return {
    form: resident ? '2' : '2 with Schedule II',
    lines,
    schedules: {
      I: scheduleI,
      ...(worksheetB ? { 'worksheet-B': worksheetB } : {}),
      tax: tax,
      ...(scheduleII ? { II: scheduleII } : {}),
      ...(otherRows.length || line15 ? { III: { 'Part I': lineTable({ 1: line9, 14: line9, 17: 0 }), ...(otherRows.length ? { 'Part II': otherRows } : {}) } } : {}),
      ...(worksheetA ? { 'worksheet-A': worksheetA } : {}),
      ...(iv8 ? { IV: lineTable({ 1: iv1, 8: iv8 }) } : {}),
      ...(ec ? { '2EC': ec } : {}),
    },
    stateIncome: scheduleII ? scheduleII['15'] + scheduleII['21'] : line7,
    taxableIncome: line7,
    taxBeforeCredits: line8,
    nonrefundableCredits: line9 ? [{ code: 'MT_OTHER_STATE', label: 'Credit for income taxes paid to another state', amount: line9 }] : [],
    otherStateCredit: line9,
    otherTaxes: line19 ? [{ code: 'MT_SCHEDULE_IV', label: 'Voluntary check-off contributions (Schedule IV)', amount: line19 }] : [],
    totalTax: line10 + line19,
    refundableCredits: [...(line15 ? [{ code: 'MT_EITC', label: 'Montana earned income tax credit', amount: line15 }] : []), ...(line16 ? [{ code: 'MT_2EC', label: 'Elderly homeowner/renter credit (Schedule 2EC)', amount: line16 }] : [])],
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'MT',
  name: 'Montana',
  built: true,
  forms: Object.freeze({ resident: '2', partYear: '2 with Schedule II', nonresident: '2 with Schedule II' }),
  questions: Object.freeze([
    Object.freeze({ id: 'mtBondInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from Montana state or local bonds', help: 'Interest from other states\' bonds is added on Schedule I line 1; Montana bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'college529Deposits', kind: 'amount', text: 'Deposits into a 529 family education savings account', help: 'Subtracted on Schedule I line 16, up to $4,500 ($9,000 joint).' }),
    Object.freeze({ id: 'ableDeposits', kind: 'amount', text: 'Deposits into an ABLE account', help: 'Subtracted on Schedule I line 17, up to $3,000 ($6,000 joint).' }),
    Object.freeze({ id: 'railroadTier1', when: { has: ['socialSecurity'] }, kind: 'amount', text: 'Tier I railroad retirement benefits included in taxable Social Security on Form 1040 line 6b', help: 'Subtracted on Schedule I line 22. Enter 0 if none.' }),
    Object.freeze({ id: 'railroadTier2', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Tier II railroad retirement benefits included on Form 1040 line 5b', help: 'Subtracted on Schedule I line 23. Enter 0 if none.' }),
    Object.freeze({ id: 'mtPropertyTaxBilled', when: { residency: ['full-year', 'part-year'], has: ['senior'] }, kind: 'amount', text: 'Property tax billed on your Montana home and up to one acre (if 62 or older)', help: 'Used for the elderly homeowner/renter credit on Schedule 2EC line 23.' }),
    Object.freeze({ id: 'mtRentPaid', when: { residency: ['full-year', 'part-year'], has: ['senior'] }, kind: 'amount', text: 'Rent paid for your Montana home (if 62 or older)', help: 'Used for the elderly homeowner/renter credit on Schedule 2EC line 24; do not include rent paid by an assistance program.' }),
    Object.freeze({ id: 'mtOtherHouseholdIncome', when: { residency: ['full-year', 'part-year'], has: ['senior'] }, kind: 'amount', text: 'Other household income not on your federal return (government assistance, SSI, veterans\' and workers\' compensation, income of other household members)', help: 'Counted in gross household income on Schedule 2EC lines 16 and 17.' }),
    Object.freeze({ id: 'mtCheckoffs', kind: 'amount', text: 'Voluntary check-off contributions (nongame wildlife, child abuse prevention, agriculture literacy, military family relief)', help: 'Schedule IV line 1; reduces your refund or adds to the amount due.' }),
  ]),
  labels: Object.freeze({
    1: 'Federal adjusted gross income',
    2: 'Federal deductions (Form 1040, lines 12e and 13b)',
    3: 'Federal taxable income',
    4: 'Montana additions (Schedule I)',
    5: 'Montana subtractions (Schedule I)',
    6: 'Subtraction for taxpayers 65 and older',
    7: 'Montana taxable income',
    8: 'Tax liability before tax credits',
    9: 'Nonrefundable tax credits (Schedule III)',
    10: 'Tax after nonrefundable tax credits',
    '11a': 'Montana income tax withheld',
    12: 'Estimated tax payments',
    13: 'Overpayment applied from prior year return',
    14: 'Extension payment',
    15: 'Earned income credit',
    16: 'Elderly homeowner/renter credit (Schedule 2EC)',
    17: 'Refundable tax credits (Schedule III)',
    19: 'Contributions, penalties, interest and other taxes',
    21: 'Total payments',
    22: 'Tax due',
    23: 'Tax overpaid',
  }),
  notCovered: Object.freeze([
    'Nonrefundable credits other than the credit for tax paid to another state (Schedule III Part I lines 2 to 13), and refundable credits on Schedule III line 17 other than the earned income credit',
    'Credit for tax paid to another state by a part-year resident, and the long-term capital gain part of the credit (Schedule III Part II lines 11 to 20)',
    'Mixed residency filing for spouses with different residency',
    'Schedule I business, military, tribal, medical savings and first-time homebuyer additions and subtractions, and Montana net operating losses',
    'Schedule IV interest on underpaid estimated tax, penalties, and lump-sum and recapture taxes',
    'Pass-through entity tax credits and Schedule K-1 withholding (lines 11c and 11d)',
    'Schedule 2EC for a claimant who died during the year, and the 80% or per-acre rule for property tax billed on more than one acre',
  ]),
  compute,
});
