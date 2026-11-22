import { whole, positive, ratio, check, lineTable, byStatus, rateOf } from '../state-kit.mjs';
import { applyRatio } from './va-spouses.mjs';

function scheduleTax(amount, rows) {
  const taxable = Math.max(0, whole(amount));
  let band = rows[0];
  for (const row of rows) if (taxable * 100 >= row.overCents) band = row;
  return Math.round(band.baseTax + ((taxable - band.overCents / 100) * band.rateBp) / 10000);
}

function rowsFor(rule, status) {
  const key = status === 'qss' ? 'mfj' : status;
  return rule.brackets[key].map((band, index) => ({ ...band, baseTax: rule.scheduleBase[key][index] }));
}

function vermontTax(rule, status, taxable, useSchedule) {
  const amount = Math.max(0, whole(taxable));
  const rows = rowsFor(rule, status);
  if (!useSchedule && amount < rule.table.below) {
    const first = rule.table.firstRows.find((row) => amount < row.below);
    if (first) return first.tax;
    const start = Math.floor(amount / rule.table.width) * rule.table.width;
    return scheduleTax(start + rule.table.width / 2, rows);
  }
  return scheduleTax(amount, rows);
}

function roundTwo(value) {
  return Math.round(value * 100) / 100;
}

function retirementExemption(ctx, filing, subs) {
  const agi = ctx.income.agi;
  const joint = ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss';
  const limits = joint ? subs.retirement.joint : subs.retirement.other;
  const choice = filing.answers.retirementExemption === 'civil-service-pension' ? 'civil-service-pension' : 'social-security';
  const eligibleAmount = choice === 'social-security' ? ctx.income.socialSecurityTaxable : Math.min(positive(filing.answers.civilServicePension), subs.retirement.pensionMaximum);
  if (!eligibleAmount || agi >= limits.none) return { amount: 0, sheet: null, choice };
  if (agi < limits.full) return { amount: eligibleAmount, sheet: lineTable({ choice: choice === 'social-security' ? 9 : 11, full: 1, amount: eligibleAmount }), choice };
  const l4 = limits.none;
  const l5 = agi;
  const l6 = Math.max(0, l4 - l5);
  const l7 = roundTwo(l6 / subs.retirement.range);
  const l8 = Math.min(l7, 1);
  const amount = Math.round(eligibleAmount * l8);
  return { amount, sheet: lineTable({ 4: l4, 5: l5, 6: l6, 7: l7, 8: l8, ...(choice === 'social-security' ? { 9: eligibleAmount, 10: amount } : { 11: eligibleAmount, 12: amount }) }), choice };
}

function militaryExemption(ctx, filing, subs) {
  const agi = ctx.income.agi;
  const military = Math.min(positive(filing.answers.militaryRetirement), ctx.income.pensionTaxable);
  if (!military || agi >= subs.military.none) return { amount: 0, sheet: null };
  if (agi <= subs.military.full) return { amount: military, sheet: lineTable({ full: 1, amount: military }) };
  const l6 = subs.military.none - agi;
  const l7 = roundTwo(l6 / subs.military.range);
  const l8 = Math.min(l7, 1);
  const amount = Math.round(military * l8);
  return { amount, sheet: lineTable({ 4: agi, 5: subs.military.none, 6: l6, 7: l7, 8: l8, 9: military, 10: amount }) };
}

function capitalGainsExclusion(ctx, subs) {
  const capital = ctx.income.capitalGain;
  if (capital <= 0) return { amount: 0, sheet: null };
  const d = ctx.federal.schedules?.D;
  const l1 = d ? Math.max(0, Math.min(whole(d['15']), whole(d['16']))) : capital;
  const l2a = d ? whole(d['18']) : 0;
  const l2b = d ? whole(d['19']) : 0;
  const l3 = l2a + l2b;
  const l4 = Math.max(0, l1 - l3);
  const l8 = l4;
  const l9 = Math.min(l8, subs.capitalGains.flatMaximum);
  const l19 = l9;
  const federalTaxable = whole(ctx.federal.lines['15']);
  const l20 = rateOf(federalTaxable, subs.capitalGains.taxableIncomeBp);
  const l21 = Math.min(l19, l20);
  return { amount: l21, sheet: lineTable({ 1: l1, '2a': l2a, '2b': l2b, 3: l3, 4: l4, 8: l8, 9: l9, 19: l19, 20: l20, 21: l21 }) };
}

function childTaxCredit(ctx, credits, agi) {
  const children = ctx.dependents.filter((item) => item.ctcEligible && item.age !== null && item.age <= credits.childTaxCredit.maximumAge).length;
  if (!children) return { children, amount: 0, perChild: 0 };
  const excess = whole(agi) - credits.childTaxCredit.phaseoutStart;
  const perChild = excess > 0 ? Math.max(0, credits.childTaxCredit.amount - credits.childTaxCredit.reduction * Math.ceil(excess / credits.childTaxCredit.step)) : credits.childTaxCredit.amount;
  return { children, perChild, amount: children * perChild };
}

function veteranCredit(credits, agi) {
  const v = credits.veteran;
  const l8 = whole(agi);
  const l9 = l8 <= v.fullUpTo ? 0 : l8 - v.fullUpTo;
  const l10 = Math.floor(l9 / v.per);
  const l11 = l10 * v.reduction;
  const l12 = l9 === 0 ? v.amount : Math.max(0, v.amount - l11);
  return lineTable({ 8: l8, 9: l9, 10: l10, 11: l11, 12: l12 });
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const subs = reader.read('subtractions');
  const credits = reader.read('credits');
  if (!rule || !subs || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Vermont figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const nonresident = filing.residency === 'nonresident';
  const sourced = filing.sourced;
  const checks = [];
  const notes = [];
  const status = ctx.filingStatus;

  const p1 = income.taxExemptInterest;
  const p2 = Math.min(p1, positive(answers.vermontMunicipalInterest));
  const p3 = p1 - p2;
  const p6 = p3;
  const p7 = income.usObligationInterest;
  const gains = capitalGainsExclusion(ctx, subs);
  const p8 = gains.amount;
  const p10 = income.stateRefundTaxable;
  const boxes = ctx.filers.reduce((total, filer) => total + ((filer.age ?? 0) >= 65 ? 1 : 0) + (filer.blind ? 1 : 0), 0);
  const line4 = byStatus(rule.standardDeduction, status) + boxes * rule.additionalStandard;
  const line5a = ctx.filers.some((item) => item.role === 'taxpayer' && !item.canBeClaimedAsDependent) ? 1 : 0;
  const line5b = status === 'mfj' && ctx.filers.some((item) => item.role === 'spouse' && !item.canBeClaimedAsDependent) ? 1 : 0;
  const line5c = ctx.dependents.length;
  const line5d = line5a + line5b + line5c;
  const line5e = line5d * rule.exemption;
  const line6 = line4 + line5e;
  const fedA = ctx.itemized.federalItemized ? ctx.itemized.federalScheduleA : null;
  const medical = fedA ? Math.max(0, whole(fedA['4']) - positive(answers.nonAllowableMedical) - line6) : 0;
  const p11 = medical;
  const retirement = retirementExemption(ctx, filing, subs);
  const p12 = retirement.amount;
  const military = militaryExemption(ctx, filing, subs);
  const p13 = military.amount;
  const loanLimit = status === 'mfj' ? subs.studentLoan.jointAgiLimit : subs.studentLoan.otherAgiLimit;
  const p16a = resident ? positive(answers.studentLoanInterestPaid) : 0;
  const p16b = resident ? income.adjustmentItems.studentLoan : 0;
  const p16c = income.agi > loanLimit ? 0 : Math.max(0, p16a - p16b);
  const p18 = p7 + p8 + p10 + p11 + p12 + p13 + p16c;
  const p19 = p6 - p18;
  const in112 = lineTable({ 1: p1, 2: p2, 3: p3, 6: p6, 7: p7, 8: p8, 10: p10, 11: p11, 12: p12, 13: p13, '16a': p16a, '16b': p16b, '16c': p16c, 18: p18, 19: p19 });

  const line1 = income.agi;
  const line2 = p19;
  const line3 = line1 + line2;
  const line7 = Math.max(0, line3 - line6);
  const highIncome = line1 > rule.minimumTax.agiOver;
  const scheduleTaxAmount = vermontTax(rule, status, line7, highIncome);
  const minimumTax = highIncome ? rateOf(Math.max(0, line1 - income.usObligationInterest), rule.minimumTax.rateBp) : 0;
  const line8 = Math.max(scheduleTaxAmount, minimumTax);
  const earlyTax = whole(ctx.federal.schedules?.[2]?.['8']);
  const in119_5 = rateOf(earlyTax, credits.federalTaxAdjustmentBp);
  const line9 = in119_5;
  const line10 = Math.max(0, line8 + line9);
  const line11 = answers.charitableContributions !== undefined ? positive(answers.charitableContributions) : ctx.itemized.charityCash + ctx.itemized.charityNonCash;
  const line12 = rateOf(line11, credits.charitable.rateBp);
  const line13 = Math.min(line12, credits.charitable.maximum);
  const line14 = Math.max(0, line10 - line13);

  let line15 = 1;
  let in113 = null;
  if (!resident) {
    const A = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.iraTaxable + income.pensionTaxable, 5: income.socialSecurityTaxable, 6: income.stateRefundTaxable, 8: income.businessIncome, 9: income.capitalGain, 12: income.unemployment, 13: income.otherIncome };
    const B = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest), 3: whole(sourced.ordinaryDividends), 4: whole(sourced.iraTaxable) + whole(sourced.pensionTaxable), 5: whole(sourced.socialSecurityTaxable), 6: whole(sourced.stateRefundTaxable), 8: whole(sourced.businessIncome), 9: whole(sourced.capitalGain), 12: whole(sourced.unemployment), 13: whole(sourced.otherIncome) };
    A[14] = Object.values(A).reduce((total, value) => total + value, 0);
    B[14] = Object.values(B).reduce((total, value) => total + value, 0);
    A[26] = income.adjustments;
    B[26] = whole(sourced.adjustments);
    const l27 = A[14] - A[26];
    const l28 = B[14] - B[26];
    const l29 = l27 - l28;
    const l30 = l27;
    const l31 = l29;
    const l32 = 0;
    const l33 = l31 + l32;
    const l34 = l30 - l33;
    line15 = l34 < 0 ? 0 : l30 <= 0 ? (l34 > 0 ? 1 : 0) : ratio(l34, l30, { places: 6 });
    in113 = { A: lineTable(A), B: lineTable(B), lines: lineTable({ 27: l27, 28: l28, 29: l29, 30: l30, 31: l31, 32: l32, 33: l33, 34: l34, 35: line15 }) };
  }
  const line16 = resident ? line14 : applyRatio(line14, line15, 6);

  const otherRows = [];
  let line17 = 0;
  if (resident) {
    let doubleTaxed = 0;
    for (const other of filing.otherStates) {
      const l2 = Math.min(Math.max(0, whole(other.income)), Math.max(0, line1 - doubleTaxed));
      doubleTaxed += l2;
      const l9 = l2;
      const l10 = Math.max(0, line1);
      const l11 = p3;
      const l13 = l10 + l11;
      const l14 = p7;
      const l16 = l14;
      const l17 = Math.max(0, l13 - l16);
      const l18 = line14;
      const l19 = l17 > 0 ? Math.min(l18, Math.round((l18 * l9) / l17)) : 0;
      const l20 = positive(other.tax);
      const l21 = Math.min(l19, l20);
      otherRows.push({ state: other.state, lines: lineTable({ 2: l2, 5: l2, 9: l9, 10: l10, 11: l11, 13: l13, 14: l14, 16: l16, 17: l17, 18: l18, 19: l19, 20: l20, 21: l21 }) });
      line17 += l21;
    }
    if (otherRows.length) checks.push(check('info', 'VT_OTHER_STATE_RETURN', 'Include a copy of the return filed with the other state with Schedule IN-117.'));
  }
  const joint = status === 'mfj';
  const beneficiaries = Math.max(1, positive(answers.vheipBeneficiaries));
  const vheipBase = Math.min(positive(answers.vheipContributions), (joint ? credits.vheip.jointPerBeneficiary : credits.vheip.perBeneficiary) * beneficiaries);
  const line18 = rateOf(vheipBase, credits.vheip.rateBp);
  const line19 = line17 + line18;
  const line20 = Math.max(0, line16 - line19);
  const seRows = Array.isArray(ctx.federal.schedules?.SE) ? ctx.federal.schedules.SE : [];
  const seIncome = seRows.reduce((total, row) => total + Math.max(0, whole(row.lines?.['6'])), 0);
  const seNonVermont = resident ? positive(answers.nonVermontSelfEmployment) : Math.max(0, seIncome - (income.businessIncome > 0 ? Math.round(seIncome * Math.min(1, Math.max(0, whole(sourced.businessIncome)) / income.businessIncome)) : 0));
  const ccc3 = Math.max(0, seIncome - Math.min(seIncome, seNonVermont));
  const line21 = rateOf(ccc3, credits.childCareContributionBp);
  const line22 = 0;
  const line23 = line20 + line21 + line22;

  let partII = null;
  let line26c = 0;
  if (!nonresident) {
    const care1 = whole(ctx.federal.schedules?.['2441']?.['11'] ?? ctx.federal.schedules?.[3]?.['2']);
    const care2 = rateOf(care1, credits.childCareBp);
    const ctc = childTaxCredit(ctx, credits, line1);
    const eicChildren = whole(ctx.federal.schedules?.EIC?.qualifyingChildren);
    const federalEic = whole(ctx.federal.lines['27']);
    const eitc7 = eicChildren > 0 ? rateOf(federalEic, credits.eitcWithChildBp) : federalEic;
    const veteran = answers.veteran === true ? veteranCredit(credits, line1) : null;
    const line12v = veteran ? veteran['12'] : 0;
    const l13 = care2 + ctc.amount + eitc7 + line12v;
    let adjusted = l13;
    const extra = {};
    if (!resident) {
      const l14 = in113.B['14'];
      const l15 = in113.A['14'];
      const l16 = l14 < 0 ? 0 : ratio(l14, l15, { places: 6 });
      adjusted = applyRatio(l13, l16, 6);
      Object.assign(extra, { 14: l14, 15: l15, 16: l16, 17: adjusted });
    }
    partII = lineTable({ 1: care1, 2: care2, 3: ctc.children, 4: ctc.amount, 5: eicChildren, 6: federalEic, 7: eitc7, ...(veteran || {}), 13: l13, ...extra });
    line26c = adjusted;
    if (ctc.children && ctc.perChild < credits.childTaxCredit.amount) notes.push(`The Vermont child tax credit is $${ctc.perChild} per child at your income (reduced above $125,000 of AGI).`);
  }
  const line26a = filing.payments.withheld;
  const line26b = filing.payments.estimated + filing.payments.extension;
  const line26f = line26a + line26b + line26c;

  if (resident) notes.push('The Vermont renter credit (Form RCC-146) and the property tax credit (Form HS-122 with Schedule HI-144) are separate claims, not lines on Form IN-111; file them with the Department by the April due date.');
  if (answers.veteran === true && status === 'mfj') checks.push(check('info', 'VT_VETERAN_CREDIT_ONE', 'MyCA claims one Vermont veteran tax credit on the return; ask the Department whether a second veteran spouse may also claim it.'));
  if (highIncome && minimumTax > scheduleTaxAmount) notes.push('Line 8 is the Vermont minimum tax of 3% of federal AGI less U.S. obligation interest, which is more than the rate schedule tax.');
  if (retirement.amount && retirement.choice === 'social-security' && positive(answers.civilServicePension)) checks.push(check('info', 'VT_RETIREMENT_ONE_EXEMPTION', 'Vermont allows either the Social Security exemption or the civil service pension exemption, not both; MyCA used Social Security.', 'Answer the retirement exemption question to choose the pension instead.'));

  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, '5a': line5a, '5b': line5b, '5c': line5c, '5d': line5d, '5e': line5e, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, '26a': line26a, '26b': line26b, '26c': line26c, '26f': line26f });
  const nonrefundable = [
    ...(line13 ? [{ code: 'VT_CHARITABLE', label: 'Charitable contribution credit', amount: Math.min(line13, line10) }] : []),
    ...(line17 ? [{ code: 'VT_OTHER_STATE', label: 'Credit for income tax paid to other state', amount: Math.min(line17, line16) }] : []),
    ...(line18 ? [{ code: 'VT_VHEIP', label: 'Vermont Higher Education Investment Plan credit', amount: Math.min(line18, Math.max(0, line16 - line17)) }] : []),
  ];
  const refundable = [];
  if (partII) {
    const factor = resident ? 1 : partII['16'];
    const piece = (amount) => (resident ? amount : applyRatio(amount, factor, 6));
    if (partII['2']) refundable.push({ code: 'VT_CHILD_CARE', label: 'Child and dependent care credit', amount: piece(partII['2']) });
    if (partII['4']) refundable.push({ code: 'VT_CTC', label: 'Vermont child tax credit', amount: piece(partII['4']) });
    if (partII['7']) refundable.push({ code: 'VT_EITC', label: 'Vermont earned income tax credit', amount: piece(partII['7']) });
    if (partII['12']) refundable.push({ code: 'VT_VETERAN', label: 'Vermont veteran tax credit', amount: piece(partII['12']) });
    const listed = refundable.reduce((total, item) => total + item.amount, 0);
    if (refundable.length && listed !== line26c) refundable[refundable.length - 1].amount += line26c - listed;
  }
  return {
    form: resident ? 'IN-111' : 'IN-111 with Schedule IN-113',
    lines,
    schedules: {
      'IN-112': { I: in112, ...(partII ? { II: partII } : {}) },
      ...(retirement.sheet ? { 'retirement-exemption': retirement.sheet } : {}),
      ...(military.sheet ? { 'military-retirement-exemption': military.sheet } : {}),
      ...(gains.sheet ? { 'IN-153': gains.sheet } : {}),
      ...(in113 ? { 'IN-113': in113 } : {}),
      ...(otherRows.length ? { 'IN-117': otherRows } : {}),
      ...(line9 ? { 'IN-119': lineTable({ 1: earlyTax, 4: earlyTax, 5: in119_5, 15: line9 }) } : {}),
      ...(highIncome ? { 'minimum-tax': lineTable({ agi: line1, usInterest: income.usObligationInterest, minimum: minimumTax, schedule: scheduleTaxAmount }) } : {}),
    },
    stateIncome: resident ? line3 : in113.lines['28'],
    taxableIncome: line7,
    taxBeforeCredits: line8,
    nonrefundableCredits: nonrefundable,
    otherStateCredit: Math.min(line17, line16),
    otherTaxes: line21 ? [{ code: 'VT_CHILD_CARE_CONTRIBUTION', label: 'Child care contribution on self-employment income', amount: line21 }] : [],
    totalTax: line23,
    refundableCredits: refundable,
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'VT',
  name: 'Vermont',
  built: true,
  forms: Object.freeze({ resident: 'IN-111', partYear: 'IN-111 with Schedule IN-113', nonresident: 'IN-111 with Schedule IN-113' }),
  questions: Object.freeze([
    Object.freeze({ id: 'vermontMunicipalInterest', kind: 'amount', text: 'Tax-exempt interest from Vermont state or local bonds', help: 'Interest from other states\' bonds is added on Schedule IN-112 line 3; Vermont bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'retirementExemption', kind: 'choice', options: Object.freeze(['social-security', 'civil-service-pension']), text: 'Which retirement exemption do you elect: taxable Social Security, or a civil service or other pension not covered by Social Security?', help: 'Vermont allows only one of the two (Schedule IN-112 line 12).' }),
    Object.freeze({ id: 'civilServicePension', kind: 'amount', text: 'Pension from the Civil Service Retirement System or another government plan not covered by Social Security', help: 'Up to $10,000 can be exempt instead of Social Security.' }),
    Object.freeze({ id: 'militaryRetirement', kind: 'amount', text: 'Military retirement or survivor benefit income included in federal pension income', help: 'Exempt in full up to $125,000 of AGI and partly up to $175,000 (Schedule IN-112 line 13).' }),
    Object.freeze({ id: 'nonAllowableMedical', kind: 'amount', text: 'Retirement community fees or entrance fees included in your federal medical deduction', help: 'Removed before the Vermont medical expense deduction.' }),
    Object.freeze({ id: 'studentLoanInterestPaid', kind: 'amount', text: 'Total student loan interest you paid in the year (residents)', help: 'The part not deducted federally is subtracted on Schedule IN-112 line 16.' }),
    Object.freeze({ id: 'charitableContributions', kind: 'amount', text: 'Charitable contributions made in the year', help: 'Vermont gives a credit of 5% of the first $20,000, whether or not you itemize federally. Leave blank to use your federal Schedule A gifts.' }),
    Object.freeze({ id: 'vheipContributions', kind: 'amount', text: 'Contributions to the Vermont Higher Education Investment Plan (VSAC 529)', help: '10% credit on the first $2,500 per beneficiary ($5,000 on a joint return).' }),
    Object.freeze({ id: 'vheipBeneficiaries', kind: 'count', text: 'Number of VHEIP beneficiaries you contributed for', help: 'The limit applies per beneficiary.' }),
    Object.freeze({ id: 'veteran', kind: 'yesno', text: 'Did you serve in the U.S. uniformed services, with a discharge record?', help: 'Refundable $250 Vermont veteran tax credit at AGI up to $25,000, phased out by $30,000.' }),
    Object.freeze({ id: 'nonVermontSelfEmployment', kind: 'amount', text: 'Self-employment earnings from work performed outside Vermont', help: 'Removed before the 0.11% child care contribution on IN-111 line 21.' }),
  ]),
  notCovered: Object.freeze([
    'Renter credit (Form RCC-146) and property tax credit (Form HS-122 and Schedule HI-144), which are filed separately from Form IN-111',
    'Capital gains percentage exclusion on Schedule IN-153 Part II and the Form 4952 adjustment',
    'Bonus depreciation, railroad retirement, VSAC and other bond interest subtractions on Schedule IN-112',
    'Schedule IN-119 business and housing credits, investment tax credit recapture and Vermont credit recapture',
    'Military pay exclusion on Schedule IN-113 line 32 and the nonresident spouse rules in Technical Bulletin TB-55',
    'Part-year residents\' credit on Schedule IN-117 for tax paid to another state while a Vermont resident',
    'Use tax (line 22), voluntary contributions and the underpayment penalty (IN-152)',
  ]),
  compute,
});
