import { whole, positive, rateOf, ratio, check, lineTable, byStatus } from '../state-kit.mjs';
import { incomeByOwner, filerOf, ageInYear, OWNERS, applyRatio } from './va-spouses.mjs';

const CHILD_OF_FILER = new Set(['son', 'daughter']);

function retirementExclusion(ctx, filing, rule, byOwner) {
  const owners = ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  const rows = {};
  for (const owner of owners) {
    const filer = filerOf(ctx, owner);
    const age = ageInYear(filer, ctx.taxYear);
    const disabled = filing.answers[`${owner}Disabled`] === true;
    const maximum = age !== null && age >= rule.upperAge ? rule.age65Maximum : (age !== null && age >= rule.lowerAge) || disabled ? rule.age62Maximum : 0;
    if (!maximum) continue;
    const p = byOwner[owner];
    const line1 = p.wages;
    const line2 = p.business;
    const line3 = line1 + line2;
    const line4 = rule.earnedIncomeMaximum;
    const line5 = Math.max(0, Math.min(line3, line4));
    const unearned = { 6: p.interest, 7: p.dividends, 8: 0, 9: p.capitalGain, 10: p.other, 11: p.ira, 12: p.pension, 13: 0 };
    const line14 = Math.max(0, Object.values(unearned).reduce((total, value) => total + value, 0));
    const line15 = line5 + line14;
    const line17 = Math.min(line15, maximum);
    rows[owner] = { age, disabled: disabled && (age === null || age < rule.lowerAge), earnedUsed: Math.min(line5, line17), lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, ...unearned, 14: line14, 15: line15, 16: maximum, 17: line17 }) };
  }
  return rows;
}

function itemizedDeduction(ctx, rule) {
  const fedA = ctx.itemized.federalScheduleA;
  if (!ctx.itemized.federalItemized || !fedA) return null;
  const taxesPaid = whole(fedA['5d']);
  const cap = byStatus(rule.otherStateIncomeTaxCap, ctx.filingStatus);
  const taxes = Math.min(taxesPaid, cap);
  const line12a = whole(fedA['4']) + taxes + whole(fedA['10']) + whole(fedA['11']) + whole(fedA['12']) + whole(fedA['16']);
  const otherStateTax = ctx.itemized.generalSalesTax > 0 ? 0 : ctx.w2.filter((row) => row.state && row.state !== 'GA').reduce((total, row) => total + row.stateWithheld + row.localWithheld, 0);
  const line12b = taxesPaid > 0 ? Math.round((Math.min(otherStateTax, taxesPaid) / taxesPaid) * taxes) : 0;
  return { line12a, line12b, line12c: Math.max(0, line12a - line12b), taxesPaid, taxesAllowed: taxes, otherStateTax };
}

function lowIncomeCredit(ctx, filing, credits) {
  const agi = ctx.income.agi;
  if (agi >= credits.lowIncomeAgiBelow) return { a: 0, b: 0, c: 0 };
  if (filing.residency === 'nonresident') return { a: 0, b: 0, c: 0 };
  if (filing.residency === 'part-year' && filing.to !== `${ctx.taxYear}-12-31`) return { a: 0, b: 0, c: 0 };
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) return { a: 0, b: 0, c: 0 };
  const exemptions = ctx.filers.length + ctx.dependents.filter((item) => CHILD_OF_FILER.has(item.relationship)).length;
  const older = ctx.filers.filter((item) => (ageInYear(item, ctx.taxYear) ?? 0) >= 65).length;
  const a = exemptions + older;
  const band = credits.lowIncomeTable.find((row) => agi < row.agiBelow);
  const b = band ? band.credit : 0;
  return { a, b, c: a * b };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const retirementRule = reader.read('retirement-exclusion');
  const credits = reader.read('credits');
  if (!rule || !retirementRule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Georgia figures for ${ctx.taxYear}.` };
  const tipsRule = Number(ctx.taxYear) >= 2026 ? reader.read('tips-overtime') : null;
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const byOwner = incomeByOwner(ctx);
  const sourced = filing.sourced;
  const share = partYear ? filing.share : 0;

  const s1 = Math.max(0, income.taxExemptInterest - positive(answers.georgiaMunicipalInterest));
  const s6 = s1;
  const retirement = retirementExclusion(ctx, filing, retirementRule, byOwner);
  const s7a = retirement.taxpayer ? retirement.taxpayer.lines['17'] : 0;
  const s7d = retirement.spouse ? retirement.spouse.lines['17'] : 0;
  const s8 = income.socialSecurityTaxable;
  const beneficiaries = positive(answers.path2CollegeBeneficiaries);
  const contributions = positive(answers.path2CollegeContributions);
  if (contributions && !beneficiaries) checks.push(check('warning', 'GA_PATH2COLLEGE_BENEFICIARIES', 'Path2College contributions are deductible per beneficiary; MyCA counted one beneficiary because none was given.', 'Answer how many beneficiaries you contributed for.'));
  const s9 = Math.min(contributions, byStatus(credits.path2CollegePerBeneficiary, ctx.filingStatus) * Math.max(1, beneficiaries));
  const s10 = income.usObligationInterest;
  const otherRefund = Math.min(positive(answers.nonGeorgiaStateRefund), income.stateRefundTaxable);
  let tips = 0;
  let overtime = 0;
  if (tipsRule) {
    tips = Math.min(positive(ctx.answers.qualifiedTips), tipsRule.cashTipsMaximum) + (ctx.filingStatus === 'mfj' ? Math.min(positive(ctx.answers.spouseQualifiedTips), tipsRule.cashTipsMaximum) : 0);
    if (answers.overtimeHourlyFullTime === true) overtime = Math.min(positive(ctx.answers.qualifiedOvertime), tipsRule.overtimeMaximum) + (ctx.filingStatus === 'mfj' ? Math.min(positive(ctx.answers.spouseQualifiedOvertime), tipsRule.overtimeMaximum) : 0);
    else if (positive(ctx.answers.qualifiedOvertime) + positive(ctx.answers.spouseQualifiedOvertime) > 0) checks.push(check('warning', 'GA_OVERTIME_HOURLY', 'Georgia excludes up to $1,750 of qualified overtime only for full-time employees paid by the hour.', 'Answer whether the overtime was earned as a full-time hourly employee.'));
  }
  const s12 = otherRefund + tips + overtime;
  const s13 = s7a + s7d + s8 + s9 + s10 + s12;
  const s14 = s6 - s13;
  const schedule1 = lineTable({ 1: s1, 6: s6, '7a': s7a, '7d': s7d, 8: s8, 9: s9, 10: s10, 12: s12, 13: s13, 14: s14 });
  if (byOwner.assumed.length && Object.keys(retirement).length && ctx.filingStatus === 'mfj') checks.push(check('info', 'GA_RETIREMENT_JOINT_SPLIT', `The retirement exclusion needs each spouse's own income; ${byOwner.assumed.join(', ')} had no owner on the forms and was split 50/50 as Georgia does for jointly owned property.`));

  const itemized = itemizedDeduction(ctx, rule);
  const standard = byStatus(rule.standardDeduction, ctx.filingStatus);
  const line11 = itemized ? 0 : standard;
  const deduction = itemized ? itemized.line12c : line11;
  if (itemized && Number(ctx.taxYear) >= 2026) checks.push(check('warning', 'GA_2026_ITEMIZED_CONFORMITY', 'Georgia had not adopted the 2025 federal tax law changes as of the last update; your Georgia itemized deductions use the $10,000 limit on taxes and charitable gifts without the federal 0.5% floor.', 'Check the 2026 Georgia instructions when they are published.'));
  const line7a = ctx.dependents.length;
  const line7b = positive(answers.unbornDependents);
  const line7c = line7a + line7b;
  const line14 = line7c * rule.dependentExemption;

  let line9 = s14;
  let line10 = income.agi + s14;
  let line13 = line10 - deduction;
  let line15a;
  let schedule3 = null;
  let stateIncome = line10;
  if (resident) {
    line15a = line13 - line14;
  } else {
    const colA = { 1: income.wages, 2: income.taxableInterest + income.ordinaryDividends, 3: income.businessIncome, 4: income.capitalGain + income.iraTaxable + income.pensionTaxable + income.socialSecurityTaxable + income.unemployment + income.stateRefundTaxable + income.otherIncome };
    const colC = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest) + whole(sourced.ordinaryDividends), 3: whole(sourced.businessIncome), 4: whole(sourced.capitalGain) + whole(sourced.iraTaxable) + whole(sourced.pensionTaxable) + whole(sourced.socialSecurityTaxable) + whole(sourced.unemployment) + whole(sourced.stateRefundTaxable) + whole(sourced.otherIncome) };
    colA[5] = colA[1] + colA[2] + colA[3] + colA[4];
    colC[5] = colC[1] + colC[2] + colC[3] + colC[4];
    colA[6] = income.adjustments;
    colC[6] = whole(sourced.adjustments);
    const earnedRatio = ratio(whole(sourced.wages) + whole(sourced.businessIncome), income.wages + income.businessIncome, { places: 4 });
    const unearnedEverywhere = income.taxableInterest - income.usObligationInterest + income.ordinaryDividends + income.capitalGain + income.iraTaxable + income.pensionTaxable + income.otherIncome;
    const unearnedGeorgia = whole(sourced.taxableInterest) - whole(sourced.usObligationInterest) + whole(sourced.ordinaryDividends) + whole(sourced.capitalGain) + whole(sourced.iraTaxable) + whole(sourced.pensionTaxable) + whole(sourced.otherIncome);
    const unearnedRatio = ratio(unearnedGeorgia, unearnedEverywhere, { places: 4 });
    const retirementGeorgia = Object.values(retirement).reduce((total, row) => {
      const earned = applyRatio(row.earnedUsed, earnedRatio, 4);
      const unearned = applyRatio(row.lines['17'] - row.earnedUsed, unearnedRatio, 4);
      row.georgiaPortion = earned + unearned;
      return total + earned + unearned;
    }, 0);
    const wageShare = ratio(whole(sourced.wages), income.wages, { places: 4 });
    const additionsC = partYear ? Math.round(s1 * share) : 0;
    const subtractionsC = retirementGeorgia + whole(sourced.socialSecurityTaxable) + (partYear ? Math.round(s9 * share) : 0) + whole(sourced.usObligationInterest) + Math.min(otherRefund, whole(sourced.stateRefundTaxable)) + Math.round((tips + overtime) * wageShare);
    colA[7] = s14;
    colC[7] = additionsC - subtractionsC;
    colA[8] = colA[5] - colA[6] + colA[7];
    colC[8] = colC[5] - colC[6] + colC[7];
    const line9Ratio = colC[8] <= 0 ? 0 : colA[8] <= 0 ? 1 : ratio(colC[8], colA[8], { places: 4 });
    const line12 = deduction + line14;
    const line13s = applyRatio(line12, line9Ratio, 4);
    const line14s = colC[8] - line13s;
    const colB = Object.fromEntries(Object.keys(colA).map((key) => [key, colA[key] - colC[key]]));
    schedule3 = { A: lineTable(colA), B: lineTable(colB), C: lineTable(colC), lines: lineTable({ 9: line9Ratio, 10: deduction, 11: line14, 12: line12, 13: line13s, 14: line14s }) };
    line9 = 0;
    line10 = 0;
    line13 = 0;
    line15a = line14s;
    stateIncome = colC[8];
    if (Object.keys(retirement).length) notes.push('The retirement exclusion is prorated with the Georgia share of earned and of unearned income for the household, as in the IT-511 part-year example.');
  }
  const line15b = 0;
  const line15c = line15a - line15b;
  const line16 = rateOf(Math.max(0, line15c), rule.rateBasisPoints);

  const low = lowIncomeCredit(ctx, filing, credits);
  let remaining = line16;
  const line17c = Math.min(low.c, remaining);
  remaining -= line17c;
  let line18 = 0;
  const otherStateRows = [];
  if (resident && filing.otherStates.length) {
    for (const other of filing.otherStates) {
      const l1 = whole(other.income);
      const l2 = line10;
      const l3 = ratio(l1, l2, { places: 4 });
      const l4 = deduction;
      const l5 = line14;
      const l6 = l4 + l5;
      const l7 = applyRatio(l6, l3, 4);
      const l8 = Math.max(0, l1 - l7);
      const l9 = rateOf(l8, rule.rateBasisPoints);
      const l10 = positive(other.tax);
      const l11 = Math.min(l9, l10);
      otherStateRows.push({ state: other.state, lines: lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7, 8: l8, 9: l9, 10: l10, 11: l11 }) });
      line18 += l11;
    }
    line18 = Math.min(line18, remaining);
    remaining -= line18;
    checks.push(check('info', 'GA_OTHER_STATE_RETURN', 'Include a copy of the return filed with the other state; Georgia does not allow the credit without it.'));
  }
  const itemizerEligible = Boolean(itemized) && (resident || (partYear && (filing.residentDays >= credits.itemizerResidentDays || filing.to === `${ctx.taxYear}-12-31`)));
  const line19 = itemizerEligible ? Math.min(credits.itemizerCredit, remaining) : 0;
  remaining -= line19;
  if (itemizerEligible && ctx.filingStatus === 'mfj') checks.push(check('info', 'GA_ITEMIZER_CREDIT_JOINT', 'The Georgia eligible itemizer credit is $300 per taxpayer; MyCA claims $300 for the joint return until the Department says whether each spouse may claim it.'));
  const line20 = 0;
  const line21 = 0;
  const line22 = Math.min(line16, line17c + line18 + line19 + line20 + line21);
  const line23 = Math.max(0, line16 - line22);
  const line24 = filing.payments.withheld;
  const line26 = filing.payments.estimated + filing.payments.extension;
  const line28 = line24 + line26;
  if (positive(ctx.answers.childCareExpenses) > 0) checks.push(check('warning', 'GA_CHILD_CARE_CREDIT', 'Georgia gives a credit of 50% of the federal child and dependent care credit (IND-CR 202), which needs federal Form 2441; MyCA does not prepare it.', 'Have your CPA add the IND-CR 202 credit.'));

  const lines = lineTable({ 4: resident ? 1 : partYear ? 2 : 3, '7a': line7a, '7b': line7b, '7c': line7c, 8: income.agi, 9: line9, 10: line10, 11: line11, ...(itemized ? { '12a': itemized.line12a, '12b': itemized.line12b, '12c': itemized.line12c } : {}), 13: line13, 14: resident ? line14 : 0, '15a': line15a, '15b': line15b, '15c': line15c, 16: line16, '17a': low.a, '17b': low.b, '17c': line17c, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 26: line26, 28: line28 });
  const nonrefundable = [
    ...(line17c ? [{ code: 'GA_LOW_INCOME', label: 'Low income credit', amount: line17c }] : []),
    ...(line18 ? [{ code: 'GA_OTHER_STATE', label: 'Credit for tax paid to other states', amount: line18 }] : []),
    ...(line19 ? [{ code: 'GA_ELIGIBLE_ITEMIZER', label: 'Georgia eligible itemizer credit', amount: line19 }] : []),
  ];
  return {
    form: resident ? '500' : '500 with Schedule 3',
    lines,
    schedules: {
      1: schedule1,
      ...(Object.keys(retirement).length ? { '1-retirement': Object.fromEntries(Object.entries(retirement).map(([owner, row]) => [owner, row.lines])) } : {}),
      ...(schedule3 ? { 3: schedule3 } : {}),
      ...(otherStateRows.length ? { 'other-state-credit': otherStateRows } : {}),
    },
    stateIncome,
    taxableIncome: Math.max(0, line15c),
    taxBeforeCredits: line16,
    nonrefundableCredits: nonrefundable,
    otherStateCredit: line18,
    otherTaxes: [],
    totalTax: line23,
    refundableCredits: [],
    checks,
    notes: [...notes, 'The Georgia surplus tax refund (HB 112 and later one-time rebates) is paid separately by the Department and is not part of this return.'],
  };
}

const LABELS = Object.freeze({
  4: 'Residency status',
  '7a': 'Number of qualified dependents',
  '7b': 'Number of unborn dependents',
  '7c': 'Total number of dependents',
  8: 'Federal adjusted gross income',
  9: 'Adjustments from Form 500 Schedule 1',
  10: 'Georgia adjusted gross income',
  11: 'Standard deduction',
  '12a': 'Federal itemized deductions',
  '12b': 'Less adjustments to itemized deductions',
  '12c': 'Georgia total itemized deductions',
  13: 'Georgia adjusted gross income less deduction',
  14: 'Dependent exemption',
  '15a': 'Income before Georgia NOL',
  '15b': 'Georgia NOL utilized',
  '15c': 'Georgia taxable income',
  16: 'Tax',
  '17a': 'Low income credit: number of exemptions',
  '17b': 'Low income credit: amount per exemption',
  '17c': 'Low income credit',
  18: 'Other state(s) tax credit',
  19: 'Georgia eligible itemizer tax credit',
  20: 'Credits used from IND-CR summary worksheet',
  21: 'Credits used from Schedule 2 Georgia tax credits',
  22: 'Total credits used',
  23: 'Balance',
  24: 'Georgia income tax withheld on wages and 1099s',
  26: 'Estimated tax and Form IT-560 payments',
  28: 'Total prepayment credits',
});

export const STATE = Object.freeze({
  code: 'GA',
  name: 'Georgia',
  built: true,
  forms: Object.freeze({ resident: '500', partYear: '500 with Schedule 3', nonresident: '500 with Schedule 3' }),
  questions: Object.freeze([
    Object.freeze({ id: 'georgiaMunicipalInterest', when: Object.freeze({ has: ['taxExemptInterest'] }), kind: 'amount', text: 'Tax-exempt interest from Georgia state or local bonds (including Georgia-bond mutual fund dividends)', help: 'Interest from other states\' bonds is added back on Schedule 1; Georgia bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'nonGeorgiaStateRefund', kind: 'amount', text: 'Part of your taxable state income tax refund that came from a state other than Georgia', help: 'Refunds from other states are subtracted on Schedule 1; a Georgia refund is not.' }),
    Object.freeze({ id: 'path2CollegeContributions', kind: 'amount', text: 'Contributions to Georgia Path2College 529 accounts in the year', help: 'Deductible up to $4,000 per beneficiary ($8,000 on a joint return).' }),
    Object.freeze({ id: 'path2CollegeBeneficiaries', when: Object.freeze({ answer: { id: 'path2CollegeContributions' } }), kind: 'count', text: 'Number of Path2College beneficiaries you contributed for', help: 'The limit applies per beneficiary.' }),
    Object.freeze({ id: 'unbornDependents', kind: 'count', text: 'Unborn children (with a detectable heartbeat) at the end of the year', help: 'Georgia allows the dependent exemption for unborn children; a child born in the year is a regular dependent.' }),
    Object.freeze({ id: 'taxpayerDisabled', kind: 'yesno', text: 'Are you under 62 and permanently and totally disabled?', help: 'Qualifies you for the $35,000 retirement income exclusion before age 62.' }),
    Object.freeze({ id: 'spouseDisabled', when: Object.freeze({ has: ['spouse'] }), kind: 'yesno', text: 'Is your spouse under 62 and permanently and totally disabled?', help: 'Qualifies your spouse for the $35,000 retirement income exclusion before age 62.' }),
    Object.freeze({ id: 'overtimeHourlyFullTime', kind: 'yesno', text: 'From 2026: was your qualified overtime earned as a full-time employee paid by the hour?', help: 'Georgia excludes up to $1,750 of such overtime for 2026 to 2028.' }),
  ]),
  labels: LABELS,
  notCovered: Object.freeze(['Military retirement income exclusion (Schedule 1, page 3)', 'Georgia net operating losses (Schedule 4)', 'Schedule 2 tax credits (series 100) and IND-CR credits, including the child and dependent care credit', 'Part-year residents\' credit for tax paid to another state on income earned there while a Georgia resident', 'The low income credit limit for married filing separately when a joint return could have been filed', 'Hurricane Helene subtractions, pass-through entity tax adjustments and other less common Schedule 1 items', 'Estimated tax penalty (Form 500 UET) and voluntary contributions']),
  compute,
});
