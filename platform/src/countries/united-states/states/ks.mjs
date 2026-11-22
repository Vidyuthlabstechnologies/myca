import { whole, positive, rateOf, ratio, check, byStatus, lineTable, sum, otherStateCreditLimit } from '../state-kit.mjs';

const kansasStatus = (status) => (status === 'qss' ? 'hoh' : status);

export function kansasTax(taxable, rule, status) {
  const amount = positive(taxable);
  const key = kansasStatus(status);
  if (amount > rule.tableLimit) {
    const subtract = byStatus(rule.overTable.subtract, key);
    return Math.max(0, Math.round((amount * rule.overTable.rateBp - subtract * 10000) / 10000));
  }
  if (amount <= rule.tableZeroThrough) return 0;
  const width = rule.tableRowWidth;
  const low = amount <= rule.tableFirstRowTo ? rule.tableZeroThrough + 1 : Math.floor((amount - 1) / width) * width + 1;
  const high = amount <= rule.tableFirstRowTo ? rule.tableFirstRowTo : low + width - 1;
  const twice = low + high;
  const bands = byStatus(rule.brackets, key === 'mfj' ? 'mfj' : 'other');
  let units = 0;
  bands.forEach((band, index) => {
    const from = (band.overCents / 100) * 2;
    const to = index + 1 < bands.length ? (bands[index + 1].overCents / 100) * 2 : Infinity;
    units += Math.max(0, Math.min(twice, to) - from) * band.rateBp;
  });
  return Math.floor((units + 10000) / 20000);
}

function standardDeduction(ctx, rule) {
  const status = kansasStatus(ctx.filingStatus);
  const people = ctx.filingStatus === 'mfj' ? ctx.filers : ctx.filingStatus === 'mfs' && ctx.spouse ? [ctx.filers[0], ctx.spouse] : ctx.filers.slice(0, 1);
  const boxes = people.reduce((total, item) => total + (item.age !== null && item.age >= 65 ? 1 : 0) + (item.blind ? 1 : 0), 0);
  return { boxes, amount: byStatus(rule.base, status) + boxes * byStatus(rule.perBox, status) };
}

function scheduleA(ctx) {
  const parts = ctx.itemized;
  const line1 = positive(parts.medicalPaid);
  const line2 = whole(ctx.income.agi);
  const line3 = rateOf(Math.max(0, line2), 750);
  const line4 = Math.max(0, line1 - line3);
  const line5 = positive(parts.realEstateTaxes);
  const line6 = positive(parts.personalPropertyTaxes);
  const line7 = line5 + line6;
  const line9 = positive(parts.mortgageInterest);
  const line10 = positive(parts.charityCash);
  const line11 = positive(parts.charityNonCash);
  const line13 = line10 + line11;
  const line14 = line4 + line7 + line9 + line13;
  return lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, '8a': line9, 9: line9, 10: line10, 11: line11, 12: 0, 13: line13, 14: line14 });
}

function exemptionAllowance(ctx, rule, answers) {
  const status = kansasStatus(ctx.filingStatus);
  const claimed = ctx.filers[0]?.canBeClaimedAsDependent;
  const listed = ctx.dependents.filter((item) => !item.bornAfterYear);
  const dependents = claimed ? 0 : listed.length;
  const newborns = claimed ? 0 : listed.filter((item) => item.age === 0).length;
  const stillbirths = positive(answers.stillbirths);
  const veterans = positive(answers.disabledVeterans);
  const personal = ctx.filingStatus === 'mfj' ? rule.joint : rule.personal;
  const head = status === 'hoh' ? rule.headOfHousehold : 0;
  const total = personal + head + dependents * rule.perDependent + newborns * rule.perNewborn + stillbirths * rule.perStillbirth + veterans * rule.perDisabledVeteran;
  return { dependents, newborns, stillbirths, veterans, personal, head, total };
}

function partA(ctx, answers, subtractions, checks) {
  const income = ctx.income;
  const munisAnswered = answers.nonKansasMunicipalInterest !== undefined;
  const a1 = munisAnswered ? positive(answers.nonKansasMunicipalInterest) : positive(income.taxExemptInterest);
  if (!munisAnswered && income.taxExemptInterest > 0) checks.push(check('warning', 'KS_MUNICIPAL_INTEREST', 'All of your federally tax-exempt interest was added back on Schedule S line A1. Interest from Kansas bonds issued after 1987 and other bonds exempt by Kansas law is not added back.', 'Answer the non-Kansas municipal interest question (0 if none).'));
  const a2 = positive(answers.kpersContributions);
  const a9 = a1 + a2;
  const a10 = positive(income.socialSecurityTaxable);
  const a12 = positive(income.usObligationInterest);
  const a13 = positive(income.stateRefundTaxable);
  const retirementIncome = positive(income.iraTaxable) + positive(income.pensionTaxable);
  const a14 = Math.min(positive(answers.exemptRetirementBenefits), retirementIncome);
  const a15 = positive(answers.nonresidentMilitaryPay);
  const beneficiaries = answers.college529Beneficiaries === undefined ? 1 : positive(answers.college529Beneficiaries);
  const a16 = Math.min(positive(answers.college529Contributions), beneficiaries * byStatus(subtractions.college529PerBeneficiary, ctx.filingStatus === 'mfj' ? 'mfj' : 'other'));
  if (positive(answers.college529Contributions) > 0 && answers.college529Beneficiaries === undefined) checks.push(check('warning', 'KS_529_BENEFICIARIES', 'The 529 subtraction is limited per beneficiary; MyCA assumed one beneficiary.', 'Answer the number of 529 beneficiaries.'));
  const a26 = a10 + a12 + a13 + a14 + a15 + a16;
  const a27 = a9 - a26;
  return { a1, a2, a9, a10, a12, a13, a14, a15, a16, a26, a27, retirementIncome };
}

function partB(ctx, filing, answers, a, line3, checks) {
  const income = ctx.income;
  const given = filing.sourced;
  const schedule1 = ctx.federal.schedules?.[1] || {};
  const resident = filing.residency === 'part-year';
  const share = filing.share;
  const rentalFederal = whole(schedule1['5']);
  const rentalKansas = whole(answers.kansasRentalIncome);
  if (rentalFederal && answers.kansasRentalIncome === undefined) checks.push(check('warning', 'KS_RENTAL_SOURCE', 'Your federal return has rental or pass-through income; none of it is counted as Kansas-source on Schedule S Part B until you say how much was from Kansas or received while a Kansas resident.', 'Answer the Kansas rental and pass-through income question.'));
  const federal = { 1: income.wages, 2: income.taxableInterest + income.ordinaryDividends, 3: income.iraTaxable + income.pensionTaxable, 4: income.stateRefundTaxable, 5: 0, 6: income.businessIncome, 7: income.capitalGain, 8: 0, 9: rentalFederal, 10: 0, 11: income.unemployment + income.socialSecurityTaxable + income.otherIncome };
  const kansas = { 1: whole(given.wages), 2: whole(given.taxableInterest) + whole(given.ordinaryDividends), 3: whole(given.iraTaxable) + whole(given.pensionTaxable), 4: whole(given.stateRefundTaxable), 5: 0, 6: whole(given.businessIncome), 7: whole(given.capitalGain), 8: 0, 9: rentalKansas, 10: 0, 11: whole(given.unemployment) + whole(given.socialSecurityTaxable) + whole(given.otherIncome) };
  const b12 = Object.values(kansas).reduce((total, value) => total + value, 0);
  const items = income.adjustmentItems;
  const fed13 = items.ira;
  const fed14 = items.earlyWithdrawal;
  const fed17 = whole(income.adjustments) - fed13 - fed14;
  const ksAdjustments = whole(given.adjustments);
  const scale = (value) => (whole(income.adjustments) > 0 ? Math.round((value * ksAdjustments) / whole(income.adjustments)) : 0);
  const ks13 = scale(fed13);
  const ks14 = scale(fed14);
  const ks17 = ksAdjustments - ks13 - ks14;
  const b18 = ks13 + ks14 + ks17;
  const b19 = b12 - b18;
  const wageShare = income.wages > 0 ? Math.min(1, kansas[1] / income.wages) : 0;
  const retirementShare = a.retirementIncome > 0 ? Math.min(1, kansas[3] / a.retirementIncome) : 0;
  const additions = (resident ? Math.round(a.a1 * share) : 0) + Math.round(a.a2 * wageShare);
  const subtractionsKs = whole(given.socialSecurityTaxable) + whole(given.usObligationInterest) + whole(given.stateRefundTaxable) + Math.round(a.a14 * retirementShare) + (filing.residency === 'nonresident' ? a.a15 : 0) + (resident ? Math.round(a.a16 * share) : 0);
  const b20 = additions - subtractionsKs;
  const b21 = b19 + b20;
  const b22 = line3;
  const b23 = b21 <= 0 ? 0 : ratio(b21, b22, { places: 6 });
  if (resident && (a.a1 || a.a16)) checks.push(check('info', 'KS_PART_A_PRORATED', 'Schedule S Part A items without a source split (municipal interest and 529 contributions) were counted toward Kansas-source income by the share of the year you lived in Kansas.'));
  const lines = {};
  for (let n = 1; n <= 11; n += 1) {
    lines[`B${n}.federal`] = federal[n];
    lines[`B${n}.kansas`] = kansas[n];
  }
  Object.assign(lines, { B12: b12, 'B13.federal': fed13, 'B13.kansas': ks13, 'B14.federal': fed14, 'B14.kansas': ks14, 'B15.federal': 0, 'B15.kansas': 0, 'B16.federal': 0, 'B16.kansas': 0, 'B17.federal': fed17, 'B17.kansas': ks17, B18: b18, B19: b19, B20: b20, B21: b21, B22: b22, B23: Math.round(b23 * 1000000) / 10000 });
  return { lines, b21, b23 };
}

function compute(ctx, filing, reader) {
  const taxRule = reader.read('income-tax');
  const deductionRule = reader.read('standard-deduction');
  const exemptionRule = reader.read('exemptions');
  const credits = reader.read('credits');
  const subtractions = reader.read('subtractions');
  if (!taxRule || !deductionRule || !exemptionRule || !credits || !subtractions) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Kansas figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const checks = [];
  const resident = filing.residency === 'full-year';
  const status = kansasStatus(ctx.filingStatus);
  const a = partA(ctx, answers, subtractions, checks);
  const line1 = whole(ctx.income.agi);
  const line2 = a.a27;
  const line3 = line1 + line2;
  const standard = standardDeduction(ctx, deductionRule);
  const itemized = scheduleA(ctx);
  const itemize = itemized['14'] > standard.amount;
  const line4 = itemize ? itemized['14'] : standard.amount;
  const exemptions = exemptionAllowance(ctx, exemptionRule, answers);
  const line5 = exemptions.total;
  const line6 = line4 + line5;
  const line7 = Math.max(0, line3 - line6);
  const line8 = kansasTax(line7, taxRule, ctx.filingStatus);
  let schedulePartB = null;
  let line9 = 100;
  let line10 = 0;
  if (!resident) {
    schedulePartB = partB(ctx, filing, answers, a, line3, checks);
    line9 = schedulePartB.lines.B23;
    line10 = Math.round(line8 * schedulePartB.b23);
  }
  const line11 = 0;
  const line12 = resident ? line8 + line11 : line10;
  const worksheets = [];
  let line13 = 0;
  if (resident) {
    for (const other of filing.otherStates) {
      const credit = otherStateCreditLimit({ residentTax: line12, residentIncome: line3, doubleTaxedIncome: Math.min(positive(other.income), Math.max(0, line3)), otherStateTax: other.tax });
      worksheets.push({ state: other.state, 1: positive(other.tax), 2: line12, 3: Math.min(positive(other.income), Math.max(0, line3)), 4: line3, 5: ratio(Math.min(positive(other.income), Math.max(0, line3)), line3, { places: 4 }), 6: whole(line3) > 0 ? Math.round(line12 * Math.min(1, Math.min(positive(other.income), Math.max(0, line3)) / line3)) : 0, 7: credit });
      line13 += credit;
    }
    line13 = Math.min(line13, line12);
    if (worksheets.length) checks.push(check('info', 'KS_OTHER_STATE_RETURN', 'Enclose a copy of the other state\'s return with Form K-40 to claim the credit for taxes paid to other states; copies of W-2s are not accepted.'));
  }
  const federalCareCredit = whole(ctx.federal.schedules?.[3]?.['2']);
  const line14 = resident ? rateOf(federalCareCredit, credits.childCareBp) : 0;
  const line15 = 0;
  const line16 = Math.max(0, line12 - line13 - line14 - line15);
  const federalEic = whole(ctx.federal.lines['27']);
  const kansasEic = resident ? rateOf(federalEic, credits.eitcBp) : 0;
  const line17 = Math.min(kansasEic, line16);
  const line22 = Math.max(0, kansasEic - line16);
  const line18 = Math.max(0, line16 - line17);
  if (!resident && federalCareCredit) checks.push(check('info', 'KS_CHILD_CARE_RESIDENTS_ONLY', 'The Kansas child and dependent care credit is for full-year residents only.'));
  if (!resident && federalEic) checks.push(check('info', 'KS_EITC_RESIDENTS_ONLY', 'The Kansas earned income tax credit is for full-year residents only.'));
  if (filing.residency === 'part-year') checks.push(check('info', 'KS_PART_YEAR_OTHER_STATE', 'A part-year resident may claim credit for tax paid to another state on income earned there while a Kansas resident (Worksheet for Part-Year Residents filing as Nonresidents); MyCA does not compute it.'));
  if (ctx.filers[0]?.canBeClaimedAsDependent) checks.push(check('warning', 'KS_DEPENDENT_FILER', 'You can be claimed as a dependent, so no dependent exemptions are allowed; Kansas may also limit the standard deduction of a dependent, which MyCA does not reduce.', 'Have your CPA check the Kansas standard deduction.'));
  if (ctx.filingStatus === 'mfs') checks.push(check('info', 'KS_MFS_SAME_METHOD', 'Married people filing separately must both itemize or both take the standard deduction on their Kansas returns.'));
  if (ctx.filingStatus === 'qss') checks.push(check('info', 'KS_QSS_AS_HOH', 'Kansas has no qualifying surviving spouse status; Form K-40 is filed as head of household.'));
  const used13 = Math.min(line13, line12);
  const used14 = Math.min(line14, line12 - used13);
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: filing.payments.withheld, 20: filing.payments.estimated, 21: filing.payments.extension, 22: line22, 23: 0 });
  return {
    form: 'K-40',
    lines,
    schedules: {
      'K-40.exemptions': lineTable({ filers: ctx.filingStatus === 'mfj' ? 2 : 1, personal: exemptions.personal, headOfHousehold: exemptions.head, dependents: exemptions.dependents, newborns: exemptions.newborns, stillbirths: exemptions.stillbirths, disabledVeterans: exemptions.veterans, total: exemptions.total }),
      'Schedule S Part A': lineTable({ A1: a.a1, A2: a.a2, A9: a.a9, A10: a.a10, A12: a.a12, A13: a.a13, A14: a.a14, A15: a.a15, A16: a.a16, A26: a.a26, A27: a.a27 }),
      ...(schedulePartB ? { 'Schedule S Part B': schedulePartB.lines } : {}),
      ...(itemize ? { 'Schedule A': itemized } : {}),
      standardDeduction: lineTable({ boxes: standard.boxes, amount: standard.amount, itemized: itemized['14'], used: itemize ? 'itemized' : 'standard' }),
      ...(worksheets.length ? { 'Other state credit': worksheets } : {}),
      ...(resident && federalEic ? { 'EITC worksheet': lineTable({ 1: federalEic, 2: kansasEic, 3: line16, 4: kansasEic - line16 }) } : {}),
    },
    stateIncome: resident ? line3 : schedulePartB.b21,
    taxableIncome: line7,
    taxBeforeCredits: line12,
    nonrefundableCredits: [...(used13 ? [{ code: 'KS_OTHER_STATE', label: 'Credit for taxes paid to other states', amount: used13 }] : []), ...(used14 ? [{ code: 'KS_CHILD_CARE', label: 'Child and dependent care credit', amount: used14 }] : []), ...(line17 ? [{ code: 'KS_EITC', label: 'Earned income tax credit', amount: line17 }] : [])],
    otherStateCredit: used13,
    otherTaxes: [],
    totalTax: line18,
    refundableCredits: line22 ? [{ code: 'KS_EITC_REFUNDABLE', label: 'Refundable portion of the earned income tax credit', amount: line22 }] : [],
    checks,
  };
}

export const STATE = Object.freeze({
  code: 'KS',
  name: 'Kansas',
  built: true,
  forms: Object.freeze({ resident: 'K-40', partYear: 'K-40 with Schedule S Part B', nonresident: 'K-40 with Schedule S Part B' }),
  questions: Object.freeze([
    Object.freeze({ id: 'nonKansasMunicipalInterest', kind: 'amount', text: 'Interest from municipal bonds of states other than Kansas that was tax-exempt on your federal return', help: 'Added back on Schedule S line A1. Leave out Kansas bonds issued after 1987 and other bonds exempt by Kansas law.' }),
    Object.freeze({ id: 'kpersContributions', kind: 'amount', text: 'Your contributions to KPERS (Kansas Public Employees Retirement System) withheld from pay', help: 'Added back on Schedule S line A2.' }),
    Object.freeze({ id: 'exemptRetirementBenefits', kind: 'amount', text: 'Retirement benefits exempt from Kansas tax included in your federal income (KPERS, federal civil service, military, railroad and other exempt plans)', help: 'Subtracted on Schedule S line A14. Do not include Social Security, which is subtracted automatically.' }),
    Object.freeze({ id: 'nonresidentMilitaryPay', kind: 'amount', text: 'Military pay earned as a nonresident servicemember stationed in Kansas', help: 'Subtracted on Schedule S line A15, nonresidents only.' }),
    Object.freeze({ id: 'college529Contributions', kind: 'amount', text: 'Contributions to a Kansas 529 plan or another state\'s 529 plan this year', help: 'Subtracted on Schedule S line A16, up to $3,000 per beneficiary ($6,000 married filing joint).' }),
    Object.freeze({ id: 'college529Beneficiaries', kind: 'count', text: 'Number of 529 beneficiaries you contributed for', help: 'The 529 subtraction limit applies per beneficiary.' }),
    Object.freeze({ id: 'stillbirths', kind: 'count', text: 'Number of stillbirths during the year', help: 'Each gives an additional $2,320 Kansas exemption.' }),
    Object.freeze({ id: 'disabledVeterans', kind: 'count', text: 'Number of people on the return who are honorably discharged veterans receiving disability compensation at the 100% rate for a permanent service-connected disability', help: 'Each gives an additional $2,320 Kansas exemption.' }),
    Object.freeze({ id: 'kansasRentalIncome', kind: 'amount', text: 'Rental, royalty, partnership, S corporation and trust income from Kansas sources or received while a Kansas resident (part-year and nonresident filers)', help: 'Schedule S Part B line B9, Kansas column.' }),
  ]),
  notCovered: Object.freeze([
    'Schedule S additions and subtractions other than municipal interest, KPERS contributions, Social Security, U.S. government interest, state refunds, exempt retirement benefits, nonresident military pay and 529 contributions (lines A3 to A8, A11, A17 to A25)',
    'Kansas tax on lump sum distributions (line 11)',
    'Other credits on line 15 (schedules K-24 through K-94, including the lockable gun storage credit from 2026) and the refundable portion of other credits (line 23)',
    'Credit for taxes paid to other states by part-year residents filing as nonresidents, and the foreign tax credit',
    'Homestead and property tax relief claims (K-40H, K-40PT, K-40SVR)',
    'Underpayment of estimated tax penalty (K-210), interest and penalty, and voluntary contributions on lines 35 to 42',
    'The reduced standard deduction for a person who can be claimed as a dependent',
  ]),
  compute,
});
