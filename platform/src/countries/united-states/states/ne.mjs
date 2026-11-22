import { whole, positive, rateOf, check, lineTable, byStatus, bracketTax } from '../state-kit.mjs';

const roundRatio = (part, total) => {
  const top = whole(part);
  const bottom = whole(total);
  if (bottom <= 0) return top > 0 ? 1 : 0;
  const six = Math.round((top / bottom) * 1e6);
  return Math.min(1, Math.max(0, Math.round(six / 10) / 1e5));
};

const times = (amount, value) => Math.round(whole(amount) * value);

function bandFor(rows, agi) {
  const row = rows.find((item) => agi <= item.agiNotOver);
  return row ? row.basisPoints : 0;
}

function standardDeduction(ctx, rule) {
  const status = ctx.filingStatus;
  const married = status === 'mfj' || status === 'mfs' || status === 'qss';
  const people = [...ctx.filers];
  if (status === 'mfs' && ctx.spouse) people.push(ctx.spouse);
  const boxes = people.reduce((total, person) => total + (person.age !== null && person.age >= 65 ? 1 : 0) + (person.blind ? 1 : 0), 0);
  const base = byStatus(rule.standardDeduction, status);
  const chart = base + boxes * (married ? rule.additionalStandardDeduction.married : rule.additionalStandardDeduction.unmarried);
  const dependentFiler = ctx.filers.some((person) => person.canBeClaimedAsDependent);
  const federalStandard = whole(ctx.federal.summary.standardDeduction);
  return { boxes, chart, line6: dependentFiler ? Math.min(federalStandard, chart) : chart, dependentFiler };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Nebraska figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const status = ctx.filingStatus;
  const checks = [];
  const notes = [];
  const brackets = status === 'qss' ? rule.brackets.mfj : rule.brackets[status] || rule.brackets.single;

  const line4a = ctx.filers.some((person) => person.role === 'taxpayer' && person.canBeClaimedAsDependent) ? 0 : 1;
  const line4b = status === 'mfj' && !ctx.filers.some((person) => person.role === 'spouse' && person.canBeClaimedAsDependent) ? 1 : 0;
  const line4c = ctx.dependents.length;
  const line4 = line4a + line4b + line4c;
  const line5 = income.agi;
  const standard = standardDeduction(ctx, rule);
  const line6 = standard.line6;
  const federalItemized = ctx.itemized.federalItemized;
  const fedA = ctx.itemized.federalScheduleA || {};
  const line7 = federalItemized ? whole(ctx.federal.summary.itemizedTotal) : 0;
  const line8 = federalItemized && ctx.itemized.generalSalesTax <= 0 ? whole(fedA['5a']) : 0;
  const line9 = Math.max(0, line7 - line8);
  const line10 = federalItemized ? Math.max(line6, line9) : line6;
  const line11 = line5 - line10;
  if (federalItemized && ctx.itemized.personalPropertyTaxes > 0) checks.push(check('info', 'NE_PERSONAL_PROPERTY_TAX', 'Nebraska allows personal property taxes in itemized deductions only for the motor vehicle tax paid at registration.', 'Reduce the personal property taxes to the motor vehicle tax if they differ.'));

  const s1 = income.taxExemptInterest;
  const s2 = Math.min(s1, positive(answers.nebraskaBondInterest));
  const s3 = s1 - s2;
  if (s1 > 0 && answers.nebraskaBondInterest === undefined) checks.push(check('warning', 'NE_MUNICIPAL_INTEREST', 'Interest on bonds of other states and their cities is added back in Nebraska; MyCA treated all your tax-exempt interest as from outside Nebraska.', 'Give the part from Nebraska bonds.'));
  const s13 = s3;
  const s14 = income.stateRefundTaxable;
  const s15 = income.usObligationInterest;
  const s17 = s15;
  const s20 = Math.min(positive(answers.collegeSavingsContributions), byStatus(rule.collegeSavingsMaximum, status));
  const s31 = income.socialSecurityTaxable;
  const s32 = Math.min(positive(answers.militaryRetirement), income.pensionTaxable + income.iraTaxable);
  const s44 = s14 + s17 + s20 + s31 + s32;
  const scheduleI = lineTable({ 1: s1, 2: s2, 3: s3, 13: s13, 14: s14, 15: s15, 17: s17, 20: s20, 31: s31, 32: s32, 44: s44 });
  const line12 = s13;
  const line13 = s44;
  const line14 = Math.max(0, line11 + line12 - line13);
  const federalCare = whole(ctx.federal.schedules?.[3]?.['2']);
  const careNonrefundable = income.agi > credits.childCareRefundableAgiLimit && federalCare > 0 && filing.residency !== 'nonresident' ? rateOf(federalCare, credits.childCareNonrefundableBasisPoints) : 0;
  const federalEarlyTax = whole(ctx.federal.schedules?.[2]?.['8']);
  const line16c = federalEarlyTax;
  const federalEic = whole(ctx.federal.lines['27']);
  const exemptionCredit = rule.personalExemptionCredit * line4;

  let line15;
  let line16;
  let line18 = 0;
  let line23 = 0;
  let line44 = 0;
  let scheduleIII = null;
  let stateIncome = line5 + line12 - line13;
  if (resident) {
    line15 = bracketTax(line14, brackets);
    line16 = rateOf(line16c, rule.otherTaxBasisPoints);
    line18 = exemptionCredit;
    line23 = careNonrefundable;
    line44 = rateOf(federalEic, credits.eitcBasisPoints);
  } else {
    const s = filing.sourced;
    const share = partYear ? filing.share : 0;
    const pensions = whole(s.iraTaxable) + whole(s.pensionTaxable) - (partYear ? Math.round(s32 * share) : 0);
    const n1 = whole(s.wages) + whole(s.businessIncome) + whole(s.capitalGain) + whole(s.taxableInterest) - whole(s.usObligationInterest) + whole(s.ordinaryDividends) + Math.max(0, pensions) + whole(s.unemployment) + whole(s.otherIncome) + (partYear ? Math.round(s3 * share) : 0);
    const n2 = whole(s.adjustments) + (partYear ? Math.round(s20 * share) : 0);
    const n3 = n1 - n2;
    const n4 = roundRatio(n3, line5 + line12 - line13);
    const n5 = line14;
    const n6a = bracketTax(n5, brackets);
    const n6c = partYear ? careNonrefundable : 0;
    const n6d = n6c;
    const n6 = Math.max(0, n6a - n6d);
    const n7 = exemptionCredit;
    const n8 = Math.max(0, n6 - n7);
    const unused = Math.max(0, n7 - n6);
    const n9 = times(n8, n4);
    const n10d = rateOf(line16c, rule.otherTaxBasisPoints);
    const n10f = Math.max(0, n10d - unused);
    const n10 = times(n10f, n4);
    const n11 = partYear ? rateOf(federalEic, credits.eitcBasisPoints) : 0;
    const n12 = times(n11, n4);
    scheduleIII = lineTable({ 1: n1, 2: n2, 3: n3, 4: n4, 5: n5, '6a': n6a, '6b': 0, '6c': n6c, '6d': n6d, 6: n6, 7: n7, 8: n8, 9: n9, '10c': line16c, '10d': n10d, '10e': unused, '10f': n10f, 10: n10, '11b': partYear ? federalEic : 0, 11: n11, 12: n12 });
    line15 = n9;
    line16 = n10;
    line44 = n12;
    stateIncome = n3;
    if (filing.residency === 'nonresident' && whole(s.adjustments) === 0 && income.adjustments > 0) checks.push(check('info', 'NE_NONRESIDENT_ADJUSTMENTS', 'Part of your federal adjustments may apply to Nebraska income on Schedule III line 2; none was counted.', 'Give the Nebraska part of your adjustments in your residency answers.'));
  }
  const line17 = line15 + line16;
  let line19 = 0;
  const scheduleII = [];
  if (resident && filing.otherStates.length) {
    let remaining = Math.max(0, line17 - line18 - line23);
    for (const other of filing.otherStates) {
      const c1 = line17;
      const c2 = positive(other.income);
      const c3 = roundRatio(c2, line5 + line12 - line13);
      const c4 = times(c1, c3);
      const c5 = positive(other.tax);
      const c6 = Math.min(c1, c4, c5, remaining);
      remaining -= c6;
      line19 += c6;
      scheduleII.push({ state: other.state, lines: lineTable({ 1: c1, 2: c2, 3: c3, 4: c4, 5: c5, 6: c6 }) });
    }
    checks.push(check('info', 'NE_SCHEDULE_II', 'Attach a complete copy of the other state\'s return to claim the credit for tax paid to another state.'));
  }
  const line34 = line18 + line19 + line23;
  const afterCredits = Math.max(0, line17 - line34);
  const netAdjustments = line12 - line13;
  const federalTax = whole(ctx.federal.lines['16']) + whole(ctx.federal.schedules?.[2]?.['2']) + federalEarlyTax;
  let line35 = afterCredits;
  if (netAdjustments < rule.federalLiabilityAdjustmentLimit && afterCredits > 0 && federalTax < afterCredits) {
    line35 = federalTax;
    notes.push('The Nebraska tax after credits is limited to your federal tax (Federal Tax Liability Worksheet, line 35).');
  }
  let line42 = 0;
  let form2441N = null;
  if (income.agi <= credits.childCareRefundableAgiLimit && filing.residency !== 'nonresident' && ctx.filingStatus !== 'mfs') {
    const line6 = whole(ctx.federal.schedules?.['2441']?.['6']);
    const refundableCare = line6 > 0 ? reader.read('child-care-refundable') : null;
    if (line6 > 0 && !refundableCare) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Nebraska Form 2441N figures for ${ctx.taxYear}.` };
    if (refundableCare) {
      const fed = bandFor(refundableCare.federalDecimal, income.agi);
      const st = bandFor(refundableCare.stateDecimal, Math.max(0, income.agi));
      const r10 = rateOf(line6, fed);
      const r11 = rateOf(r10, st);
      const r12 = partYear ? times(r11, scheduleIII[4]) : r11;
      line42 = r12;
      form2441N = lineTable({ 6: line6, 7: income.agi, 8: fed / 10000, 9: st / 10000, 10: r10, 11: r11, ...(partYear ? { 12: r12 } : {}) });
    }
  }
  const line45 = positive(answers.communityCollegePropertyTax);
  const line58 = positive(answers.useTax);
  if (answers.useTax === undefined) checks.push(check('info', 'NE_USE_TAX', 'Nebraska asks for use tax on purchases where no sales tax was collected; line 58 is 0 unless you give it.', 'Answer the use tax question (0 if none).'));
  if (resident && !String(answers.highSchoolDistrictCode || '').trim()) checks.push(check('warning', 'NE_SCHOOL_DISTRICT_CODE', 'Form 1040N asks for the high school district code where you lived on December 31.', 'Look it up in the 2025 Public High School District Codes list and answer the question.'));
  const line36 = filing.payments.withheld;
  const line40 = filing.payments.estimated + filing.payments.extension;
  const line53 = line36 + line40 + line42 + line44 + line45;
  const line57 = line35;
  const line59 = Math.max(0, line57 + line58 - line53);
  const line60 = Math.max(0, line53 - line57 - line58);
  if (standard.dependentFiler) notes.push('Someone can claim you as a dependent, so the Nebraska standard deduction is the smaller of the federal standard deduction and the Nebraska chart amount, and no personal exemption is claimed for you.');
  const lines = lineTable({ 3: resident ? 1 : partYear ? 2 : 3, '4a': line4a, '4b': line4b, '4c': line4c, 4: line4, 5: line5, 6: line6, ...(federalItemized ? { 7: line7, 8: line8, 9: line9 } : {}), 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, '16c': line16c, 16: line16, 17: line17, 18: line18, 19: line19, 23: line23, 34: line34, 35: line35, 36: line36, 40: line40, 42: line42, 44: line44, 45: line45, 53: line53, 55: line53, 57: line57, 58: line58, 59: line59, 60: line60 });
  return {
    form: resident ? '1040N' : '1040N with Schedule III',
    lines,
    schedules: { I: scheduleI, ...(scheduleIII ? { III: scheduleIII } : {}), ...(scheduleII.length ? { II: scheduleII } : {}), ...(form2441N ? { '2441N': form2441N } : {}) },
    stateIncome,
    taxableIncome: line14,
    taxBeforeCredits: line17,
    nonrefundableCredits: [...(line18 ? [{ code: 'NE_PERSONAL_EXEMPTION', label: 'Personal exemption credit', amount: Math.min(line18, line17) }] : []), ...(line19 ? [{ code: 'NE_OTHER_STATE', label: 'Credit for tax paid to another state', amount: line19 }] : []), ...(line23 ? [{ code: 'NE_CHILD_CARE', label: 'Child and dependent care credit', amount: line23 }] : [])],
    otherStateCredit: line19,
    otherTaxes: line58 ? [{ code: 'NE_USE_TAX', label: 'Use tax', amount: line58 }] : [],
    totalTax: line35 + line58,
    refundableCredits: [...(line42 ? [{ code: 'NE_CHILD_CARE_REFUNDABLE', label: 'Refundable child and dependent care credit', amount: line42 }] : []), ...(line44 ? [{ code: 'NE_EITC', label: 'Nebraska earned income credit', amount: line44 }] : []), ...(line45 ? [{ code: 'NE_COMMUNITY_COLLEGE', label: 'Credit for community college property taxes', amount: line45 }] : [])],
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'NE',
  name: 'Nebraska',
  built: true,
  forms: Object.freeze({ resident: '1040N', partYear: '1040N with Schedule III', nonresident: '1040N with Schedule III' }),
  questions: Object.freeze([
    Object.freeze({ id: 'highSchoolDistrictCode', kind: 'text', text: 'Nebraska high school district code where you lived on December 31', help: 'From the Public High School District Codes list in the Nebraska booklet.' }),
    Object.freeze({ id: 'nebraskaBondInterest', kind: 'amount', text: 'Tax-exempt interest from Nebraska state or local bonds', help: 'Interest on other states\' bonds is added back on Schedule I; Nebraska bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'collegeSavingsContributions', kind: 'amount', text: 'Contributions to Nebraska Educational Savings Plan Trust (NEST) accounts in the year', help: 'Deductible up to $10,000 ($5,000 married filing separately) on Schedule I line 20.' }),
    Object.freeze({ id: 'militaryRetirement', kind: 'amount', text: 'Military retirement pay included in your federal pensions', help: 'Nebraska excludes 100% of military retirement benefits on Schedule I line 32.' }),
    Object.freeze({ id: 'communityCollegePropertyTax', kind: 'amount', text: 'Nebraska community college property taxes you paid in the year (Form PTC)', help: 'Refundable credit equal to the community college taxes shown by the Nebraska look-up tool for each parcel.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Nebraska use tax owed on purchases where no sales tax was collected', help: 'Enter 0 if none.' }),
  ]),
  notCovered: Object.freeze([
    'Schedule I items other than state and local bond interest, U.S. obligation interest, the state refund, NEST contributions, Social Security and military retirement (for example Railroad Retirement, S corporation or LLC non-Nebraska income, special capital gains election, NOLs)',
    'Credit for the elderly or disabled, Form 3800N incentive credits and the other certificate-based credits on lines 21 to 33 and 46 to 51',
    'Federal tax on lump-sum distributions (Form 4972) in the Nebraska other tax',
    'Adjustments of nonresidents applied to Nebraska income on Schedule III line 2 unless given',
    'Underpayment penalty (Form 2210N) and the Wildlife Conservation Fund donation',
  ]),
  compute,
});
