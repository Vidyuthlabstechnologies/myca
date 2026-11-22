import { whole, positive, rateOf, ratio, check, byStatus, lineTable, sum } from '../state-kit.mjs';

const DEDUCTED_STATE_TAX_KEYS = ['5b', '5c'];

function dependentCounts(ctx) {
  const listed = ctx.dependents.filter((item) => !item.bornAfterYear);
  const young = listed.filter((item) => item.age !== null && item.age <= 16).length;
  const other = listed.length - young;
  const born = listed.filter((item) => item.age === 0).length;
  return { a: young, b: other, c: born, d: young + other + born };
}

function stateIncomeTaxDeducted(ctx) {
  const scheduleA = ctx.federal.schedules?.A;
  if (!ctx.itemized.federalItemized || !scheduleA || ctx.itemized.generalSalesTax > 0) return 0;
  return Math.max(0, whole(scheduleA['5e']) - DEDUCTED_STATE_TAX_KEYS.reduce((total, key) => total + whole(scheduleA[key]), 0));
}

function apportionableCredits(ctx, filing, credits, line6, line9, munis) {
  const status = ctx.filingStatus;
  const exemptInterest = whole(ctx.income.taxExemptInterest);
  const retirementPeople = ctx.filers.filter((item) => item.dateOfBirth && item.dateOfBirth <= credits.retirement.bornOnOrBefore).length;
  const retirementModified = line6 - munis + exemptInterest;
  const retirement = retirementPeople ? Math.max(0, retirementPeople * credits.retirement.perPerson - rateOf(Math.max(0, retirementModified - byStatus(credits.retirement.base, status)), credits.retirement.phaseBasisPoints)) : 0;
  const ssTaxable = whole(ctx.income.socialSecurityTaxable);
  const ssModified = line9 - munis + exemptInterest;
  const socialSecurity = ssTaxable > 0 ? Math.max(0, rateOf(ssTaxable, credits.socialSecurity.rateBasisPoints) - rateOf(Math.max(0, ssModified - byStatus(credits.socialSecurity.base, status)), credits.socialSecurity.phaseBasisPoints)) : 0;
  const useSocialSecurity = socialSecurity >= retirement;
  const federalEic = whole(ctx.federal.lines['27']);
  const utahW2Wages = sum(ctx.w2.filter((row) => row.state === 'UT'), (row) => (row.stateWages === null ? row.wages : row.stateWages));
  const eitc = Math.min(rateOf(federalEic, credits.eitcBasisPoints), utahW2Wages);
  const youngChildren = ctx.dependents.filter((item) => !item.bornAfterYear && item.ctcEligible && item.age !== null && item.age <= credits.childTaxCredit.maxAge).length;
  const ctcModified = line6 - munis + exemptInterest;
  const childTaxCredit = youngChildren ? Math.max(0, youngChildren * credits.childTaxCredit.perChild - rateOf(Math.max(0, ctcModified - byStatus(credits.childTaxCredit.base, status)), credits.childTaxCredit.phaseBasisPoints)) : 0;
  const list = [
    ...(useSocialSecurity && socialSecurity ? [{ code: 'AH', label: 'Social Security benefits credit', amount: socialSecurity }] : []),
    ...(!useSocialSecurity && retirement ? [{ code: '18', label: 'Retirement credit', amount: retirement }] : []),
    ...(eitc ? [{ code: 'AM', label: 'Earned income tax credit', amount: eitc }] : []),
    ...(childTaxCredit ? [{ code: 'AT', label: 'Child tax credit', amount: childTaxCredit }] : []),
  ];
  return { list, total: sum(list, (item) => item.amount), worksheets: { retirementPeople, retirement, socialSecurity, federalEic, utahW2Wages, eitc, youngChildren, childTaxCredit } };
}

function compute(ctx, filing, reader) {
  const rate = reader.read('income-tax');
  const credit = reader.read('taxpayer-credit');
  const credits = reader.read('credits');
  if (!rate || !credit || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Utah figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const checks = [];
  const resident = filing.residency === 'full-year';
  const counts = dependentCounts(ctx);
  const line4 = income.agi;
  const munis = positive(answers.nonUtahMunicipalInterest);
  const line5 = munis;
  const line6 = line4 + line5;
  const line7 = whole(income.stateRefundTaxable);
  const line8 = whole(income.usObligationInterest) + positive(answers.otherSubtractions);
  const line9 = line6 - line7 - line8;
  const line10 = rateOf(Math.max(0, line9), rate.rateBasisPoints);
  const line11 = counts.d * credit.personalExemption;
  const line12 = whole(ctx.federal.lines['12']);
  const line13 = line11 + line12;
  const line14 = stateIncomeTaxDeducted(ctx);
  const line15 = line13 - line14;
  const line16 = rateOf(Math.max(0, line15), credit.creditBasisPoints);
  const line17 = byStatus(credit.phaseOutBase, status);
  const line18 = Math.max(0, line9 - line17);
  const line19 = rateOf(line18, credit.phaseOutBasisPoints);
  const line20 = Math.max(0, line16 - line19);
  const seniorDeduction = whole(ctx.federal.schedules?.['1-A']?.['37']);
  const exemptLimit = ctx.filingStatus === 'mfs' && ctx.answers.spouseItemizes ? 0 : byStatus(credit.exemptStandardDeduction, status);
  const exempt = Math.max(0, line4 - (exemptLimit + seniorDeduction)) === 0;
  const line21 = exempt ? 'X' : '';
  const line22 = exempt ? 0 : Math.max(0, line10 - line20);
  const part3 = apportionableCredits(ctx, filing, credits, line6, line9, munis);
  const line23 = line22;
  const line24 = part3.total;
  let line25;
  let scheduleB = null;
  if (resident) {
    line25 = Math.max(0, line23 - line24);
  } else {
    const sourced = filing.sourced;
    const utahRefund = filing.residency === 'part-year' ? whole(sourced.stateRefundTaxable) : 0;
    const columnA38 = filing.sourcedAgi + (filing.residency === 'part-year' ? Math.round(munis * filing.share) : 0) - utahRefund - whole(sourced.usObligationInterest);
    const line39 = columnA38 <= 0 || line9 <= 0 ? 0 : ratio(columnA38, line9, { places: 4 });
    const line40 = Math.max(0, line23 - line24);
    const line41 = Math.round(line40 * line39);
    line25 = line41;
    scheduleB = lineTable({ '18A': filing.sourcedAgi + whole(sourced.adjustments), '18B': line6 + whole(income.adjustments), '37A': whole(sourced.adjustments) + utahRefund + whole(sourced.usObligationInterest), '37B': whole(income.adjustments) + line7 + line8, '38A': columnA38, '38B': line9, 39: line39, 40: line40, 41: line41 });
  }
  let line26 = 0;
  const schedulesS = [];
  if (resident && filing.otherStates.length) {
    for (const other of filing.otherStates) {
      const line1 = Math.min(positive(other.income), Math.max(0, line4));
      const line3 = line4 > 0 ? ratio(line1, line4, { places: 4 }) : 0;
      const line5S = Math.round(line22 * line3);
      const line6S = positive(other.tax);
      const line7S = Math.min(line5S, line6S);
      schedulesS.push({ state: other.state, 1: line1, 2: line4, 3: line3, 4: line22, 5: line5S, 6: line6S, 7: line7S });
      line26 += line7S;
    }
    line26 = Math.min(line26, line25);
    checks.push(check('info', 'UT_TC40S', 'Credit for tax paid to another state is limited to the Utah tax on the federal adjusted gross income taxed by both states (TC-40S). Keep a signed copy of the other state\'s return.'));
  }
  const line27 = Math.max(0, line25 - line26);
  const line31 = positive(answers.useTax);
  const line32 = line27 + line31;
  if (answers.useTax === undefined) checks.push(check('warning', 'UT_USE_TAX', 'Utah asks for use tax on purchases made without Utah sales tax (TC-40 line 31).', 'Answer the use tax question (0 if none).'));
  if (exempt) checks.push(check('info', 'UT_QUALIFIED_EXEMPT', 'Federal adjusted gross income is not more than the federal standard deduction (plus the senior deduction), so you are a qualified exempt taxpayer and owe no Utah income tax.'));
  if (part3.worksheets.retirement && part3.worksheets.socialSecurity) checks.push(check('info', 'UT_RETIREMENT_OR_SS', 'You qualify for both the retirement credit and the Social Security benefits credit; only one may be claimed, so MyCA uses the larger.'));
  if (income.taxExemptInterest > 0 && answers.nonUtahMunicipalInterest === undefined) checks.push(check('warning', 'UT_MUNICIPAL_INTEREST', 'You have tax-exempt interest. Interest from non-Utah municipal bonds bought after 2002 is added back on TC-40A (code 57) unless the issuing state does not tax Utah bonds.', 'Answer the non-Utah municipal interest question (0 if none).'));
  if (!resident && line24 > 0) checks.push(check('info', 'UT_APPORTIONED_CREDITS', 'Apportionable credits reduce the tax before it is multiplied by the Utah income ratio on TC-40B.'));
  const allowed24 = Math.min(line23, line24);
  let left = allowed24;
  const applied = part3.list.map((item) => {
    const amount = Math.min(item.amount, left);
    left -= amount;
    return { code: `UT_${item.code}`, label: item.label, amount };
  }).filter((item) => item.amount > 0);
  const lines = lineTable({ '2a': counts.a, '2b': counts.b, '2c': counts.c, '2d': counts.d, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, 27: line27, 31: line31, 32: line32, 33: filing.payments.withheld, 34: filing.payments.estimated + filing.payments.extension });
  return {
    form: 'TC-40',
    lines,
    schedules: {
      'TC-40A': lineTable({ 'part1.57': line5, 'part2.71': whole(income.usObligationInterest), 'part2.other': positive(answers.otherSubtractions), ...Object.fromEntries(part3.list.map((item) => [`part3.${item.code}`, item.amount])), 'part4.17': line26 }),
      ...(scheduleB ? { 'TC-40B': scheduleB } : {}),
      ...(schedulesS.length ? { 'TC-40S': schedulesS } : {}),
    },
    stateIncome: resident ? line9 : scheduleB['38A'],
    taxableIncome: line9,
    taxBeforeCredits: line10,
    nonrefundableCredits: [...(line20 ? [{ code: 'UT_TAXPAYER_CREDIT', label: 'Taxpayer tax credit', amount: Math.min(line10, line20) }] : []), ...applied, ...(line26 ? [{ code: 'UT_TC40S', label: 'Tax paid to another state', amount: line26 }] : [])],
    otherStateCredit: line26,
    otherTaxes: line31 ? [{ code: 'UT_USE_TAX', label: 'Use tax', amount: line31 }] : [],
    totalTax: line32,
    refundableCredits: [],
    checks,
  };
}

export const STATE = Object.freeze({
  code: 'UT',
  name: 'Utah',
  built: true,
  forms: Object.freeze({ resident: 'TC-40', partYear: 'TC-40 with TC-40B', nonresident: 'TC-40 with TC-40B' }),
  questions: Object.freeze([
    Object.freeze({ id: 'nonUtahMunicipalInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Interest from municipal bonds of states other than Utah, bought after 2002, that was tax-exempt on your federal return', help: 'Added back on TC-40A code 57. Leave out bonds of states that do not tax Utah bonds or have no income tax.' }),
    Object.freeze({ id: 'otherSubtractions', kind: 'amount', text: 'Other Utah subtractions from income (TC-40A Part 2) beyond U.S. Government interest', help: 'For example Native American income, railroad retirement income or previously taxed retirement income. U.S. Treasury interest is subtracted automatically.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Utah use tax owed on purchases made without Utah sales tax', help: 'TC-40 line 31. Enter 0 if none.' }),
  ]),
  labels: Object.freeze({
    '2a': 'Dependents age 16 and under',
    '2b': 'Other dependents',
    '2c': 'Dependents born in the tax year',
    '2d': 'Total qualifying dependents',
    4: 'Federal adjusted gross income',
    5: 'Additions to income (TC-40A, Part 1)',
    6: 'Total income',
    7: 'State tax refund included on federal return',
    8: 'Subtractions from income (TC-40A, Part 2)',
    9: 'Utah taxable income',
    10: 'Utah tax',
    11: 'Utah personal exemption',
    12: 'Federal standard or itemized deductions',
    13: 'Line 11 plus line 12',
    14: 'State income tax from federal Schedule A',
    15: 'Line 13 minus line 14',
    16: 'Initial credit before phase-out',
    17: 'Phase-out base amount for filing status',
    18: 'Income subject to phase-out',
    19: 'Phase-out amount',
    20: 'Taxpayer tax credit',
    21: 'Qualified exempt taxpayer',
    22: 'Utah income tax',
    23: 'Tax from page 1',
    24: 'Apportionable nonrefundable credits',
    25: 'Full-year resident tax or tax from TC-40B',
    26: 'Nonapportionable nonrefundable credits',
    27: 'Line 25 minus line 26',
    31: 'Utah use tax',
    32: 'Total tax, use tax and additions to tax',
    33: 'Total withholding',
    34: 'Credit for Utah income tax prepaid',
  }),
  notCovered: Object.freeze(['Utah additions other than non-Utah municipal bond interest (lump sum distributions, my529 and medical savings account addbacks, child\'s income, trust income, pass-through entity tax)', 'The military retirement credit, my529 credit, health benefit plan credit, adoption and other TC-40A Part 3 credits apart from the retirement, Social Security, earned income and child tax credits', 'Nonapportionable credits other than tax paid to another state (at-home parent, renewable energy, ABLE and others) and all refundable credits', 'Voluntary contributions on TC-40 page 3', 'Penalty and interest (line 40) and the low-income housing credit recapture']),
  compute,
});
