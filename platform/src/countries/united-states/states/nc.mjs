import { whole, positive, rateOf, ratio, check, lineTable, byStatus } from '../state-kit.mjs';
import { applyRatio } from './va-spouses.mjs';

function childDeduction(rule, ctx) {
  const table = byStatus(rule.childDeduction, ctx.filingStatus) || rule.childDeduction.single;
  const count = ctx.dependents.filter((item) => item.ctcEligible).length;
  const agi = ctx.income.agi;
  const band = table.find((row) => row.agiUpTo === null || agi <= row.agiUpTo);
  const perChild = band ? band.amount : 0;
  return { count, perChild, amount: count * perChild };
}

function itemizedDeduction(ctx, rule) {
  const parts = ctx.itemized;
  const agi = ctx.income.agi;
  const line1 = parts.mortgageInterest;
  const line2 = Math.min(parts.realEstateTaxes, byStatus(rule.realEstateTaxCap, ctx.filingStatus));
  const line3 = line1 + line2;
  const line4 = rule.mortgageAndPropertyTaxCap;
  const line5 = Math.min(line3, line4);
  const cashLimit = rateOf(Math.max(0, agi), rule.cashCharityAgiBasisPoints);
  const nonCash = Math.min(parts.charityNonCash, rateOf(Math.max(0, agi), rule.nonCashCharityAgiBasisPoints));
  const line6 = Math.min(cashLimit, parts.charityCash + nonCash);
  const line7a = parts.medicalPaid;
  const line7b = agi;
  const line7c = rateOf(Math.max(0, line7b), rule.medicalFloorBasisPoints);
  const line7d = Math.max(0, line7a - line7c);
  const line10 = line5 + line6 + line7d;
  return lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, '7a': line7a, '7b': line7b, '7c': line7c, '7d': line7d, 10: line10 });
}

function incomeColumn(source) {
  const value = (key) => whole(source[key]);
  const column = { 1: value('wages'), 2: value('taxableInterest'), 3: value('ordinaryDividends'), 4: value('stateRefundTaxable'), 6: value('businessIncome'), 7: value('capitalGain'), 9: value('iraTaxable'), 10: value('pensionTaxable'), 13: value('unemployment'), 14: value('socialSecurityTaxable'), 15: value('otherIncome') };
  column[16] = Object.values(column).reduce((total, amount) => total + amount, 0);
  return column;
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const itemizedRule = reader.read('itemized');
  if (!rule || !itemizedRule) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no North Carolina figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];

  const s1 = Math.max(0, income.taxExemptInterest - positive(answers.ncMunicipalInterest));
  const s16 = s1;
  const s17 = income.stateRefundTaxable;
  const s18 = income.usObligationInterest;
  const s19 = income.socialSecurityTaxable;
  const retirementIncome = income.pensionTaxable + income.iraTaxable;
  const s20 = Math.min(positive(answers.baileyRetirementBenefits), retirementIncome);
  const s21 = Math.min(positive(answers.uniformedServicesRetirement), retirementIncome - s20);
  const s41 = s17 + s18 + s19 + s20 + s21;
  const scheduleS = lineTable({ 1: s1, 16: s16, 17: s17, 18: s18, 19: s19, 20: s20, 21: s21, 41: s41 });
  if (retirementIncome > 0 && answers.baileyRetirementBenefits === undefined) checks.push(check('info', 'NC_BAILEY_RETIREMENT', 'Retirement benefits from North Carolina state or local government or federal service are not taxed in North Carolina if you had 5 years of creditable service by August 12, 1989 (Bailey settlement).', 'Answer the Bailey retirement question if this applies.'));
  if (positive(answers.baileyRetirementBenefits) > retirementIncome) checks.push(check('warning', 'NC_BAILEY_LIMITED', 'The Bailey retirement deduction was limited to the taxable pension and IRA income on the federal return.'));

  const child = childDeduction(rule, ctx);
  const itemized = itemizedDeduction(ctx, itemizedRule);
  const spouseItemizes = ctx.filingStatus === 'mfs' && (ctx.answers.spouseItemizes === true || ctx.answers.spouseItemizes === 'yes');
  const standard = spouseItemizes ? 0 : byStatus(rule.standardDeduction, ctx.filingStatus);
  const useItemized = itemized['10'] > standard;
  const line11 = useItemized ? itemized['10'] : standard;

  const line6 = income.agi;
  const line7 = s16;
  const line8 = line6 + line7;
  const line9 = s41;
  const line12a = line9 + child.amount + line11;
  const line12b = line8 - line12a;

  let line13 = null;
  let line14 = line12b;
  let schedulePN = null;
  let stateIncome = line12b;
  if (!resident) {
    const colA = incomeColumn(income);
    const colB = incomeColumn(filing.sourced);
    const share = partYear ? filing.share : 0;
    colA['17a'] = s1;
    colB['17a'] = Math.round(s1 * share);
    colA[18] = colA['17a'];
    colB[18] = colB['17a'];
    colA['19a'] = s17;
    colB['19a'] = Math.min(s17, whole(filing.sourced.stateRefundTaxable));
    colA['19b'] = s18;
    colB['19b'] = Math.min(s18, whole(filing.sourced.usObligationInterest));
    colA['19c'] = s19;
    colB['19c'] = Math.min(s19, whole(filing.sourced.socialSecurityTaxable));
    const sourcedRetirement = whole(filing.sourced.pensionTaxable) + whole(filing.sourced.iraTaxable);
    colA['19d'] = s20;
    colB['19d'] = Math.min(s20, Math.max(0, sourcedRetirement));
    colA['19h'] = s21;
    colB['19h'] = Math.min(s21, Math.max(0, sourcedRetirement - colB['19d']));
    colA[20] = colA['19a'] + colA['19b'] + colA['19c'] + colA['19d'] + colA['19h'];
    colB[20] = colB['19a'] + colB['19b'] + colB['19c'] + colB['19d'] + colB['19h'];
    colA[21] = colA[16] + colA[18] - colA[20];
    colB[21] = colB[16] + colB[18] - colB[20];
    line13 = colA[21] <= 0 ? (colB[21] > 0 ? 1 : 0) : colB[21] <= 0 ? 0 : ratio(colB[21], colA[21], { places: 4, cap: Number.MAX_SAFE_INTEGER });
    if (line13 > 1) checks.push(check('info', 'NC_PERCENTAGE_OVER_100', 'Your North Carolina taxable percentage is over 100% because adjustments outside North Carolina reduced your total income; the Department allows this.'));
    line14 = applyRatio(line12b, line13, 4);
    schedulePN = { A: lineTable(colA), B: lineTable(colB), lines: lineTable({ 22: colB[21], 23: colA[21], 24: line13 }) };
    stateIncome = colB[21];
  }
  const line15 = line14 > 0 ? rateOf(line14, rule.rateBasisPoints) : 0;

  let line7a = 0;
  const otherStateRows = [];
  if (resident && filing.otherStates.length) {
    const residentIncome = incomeColumn(income)[16] + s16 - s41;
    for (const other of filing.otherStates) {
      const l1 = residentIncome;
      const l2 = Math.min(positive(other.income), Math.max(0, l1));
      const l3 = ratio(l2, l1, { places: 4 });
      const l4 = line15;
      const l5 = applyRatio(l4, l3, 4);
      const l6 = positive(other.tax);
      const l7 = Math.min(l5, l6);
      otherStateRows.push({ state: other.state, lines: lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7 }) });
      line7a += l7;
    }
    checks.push(check('info', 'NC_OTHER_STATE_RETURN', 'Attach a copy of the return filed with the other state and proof of payment; North Carolina does not allow the credit without them.'));
  }
  const tc16 = line7a;
  const tc17 = line15;
  const tc18 = Math.min(tc16, tc17);
  const tc20 = tc18;
  const line16 = tc20;
  const line17 = line15 - line16;
  const line18 = positive(answers.useTax);
  const line19 = line17 + line18;
  const spouseWithheld = ctx.filingStatus === 'mfj' ? ctx.w2.filter((row) => row.owner === 'spouse' && row.state === 'NC').reduce((total, row) => total + row.stateWithheld, 0) : 0;
  const line20b = Math.min(spouseWithheld, filing.payments.withheld);
  const line20a = filing.payments.withheld - line20b;
  const line21a = filing.payments.estimated;
  const line21b = filing.payments.extension;
  const line23 = line20a + line20b + line21a + line21b;
  const line25 = line23;
  const line26a = Math.max(0, line19 - line25);
  const line28 = Math.max(0, line25 - line19);
  if (answers.useTax === undefined) checks.push(check('info', 'NC_USE_TAX', 'North Carolina asks every filer to report consumer use tax on Line 18 or certify that none is due.', 'Answer the use tax question; enter 0 if none is due.'));
  if (ctx.filingStatus === 'mfs' && ctx.answers.spouseItemizes === undefined) checks.push(check('warning', 'NC_MFS_SPOUSE_ITEMIZES', 'If your spouse claims North Carolina itemized deductions, your North Carolina standard deduction is zero.', 'Answer whether your spouse itemizes.'));

  const lines = lineTable({ 6: line6, 7: line7, 8: line8, 9: line9, '10a': child.count, '10b': child.amount, 11: line11, '12a': line12a, '12b': line12b, ...(line13 === null ? {} : { 13: line13 }), 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, '20a': line20a, '20b': line20b, '21a': line21a, '21b': line21b, 23: line23, 25: line25, '26a': line26a, 28: line28 });
  return {
    form: 'D-400',
    lines,
    schedules: {
      S: scheduleS,
      ...(useItemized ? { A: itemized } : {}),
      ...(schedulePN ? { PN: schedulePN } : {}),
      ...(otherStateRows.length ? { TC: { 'other-state': otherStateRows, lines: lineTable({ '7a': line7a, '7b': otherStateRows.length, 16: tc16, 17: tc17, 18: tc18, 20: tc20 }) } } : {}),
    },
    deduction: useItemized ? 'itemized' : 'standard',
    stateIncome,
    taxableIncome: Math.max(0, line14),
    taxBeforeCredits: line15,
    nonrefundableCredits: line16 ? [{ code: 'NC_OTHER_STATE', label: 'Credit for income tax paid to another state', amount: line16 }] : [],
    otherStateCredit: line16,
    otherTaxes: line18 ? [{ code: 'NC_USE_TAX', label: 'Consumer use tax', amount: line18 }] : [],
    totalTax: line19,
    refundableCredits: [],
    checks,
    notes: [...notes, useItemized ? 'North Carolina itemized deductions are larger than the NC standard deduction, so they are used whatever you chose on the federal return.' : 'The NC standard deduction is used because it is at least as large as North Carolina itemized deductions.'],
  };
}

export const STATE = Object.freeze({
  code: 'NC',
  name: 'North Carolina',
  built: true,
  forms: Object.freeze({ resident: 'D-400', partYear: 'D-400', nonresident: 'D-400' }),
  questions: Object.freeze([
    Object.freeze({ id: 'ncMunicipalInterest', kind: 'amount', text: 'Tax-exempt interest from North Carolina state or local bonds (including NC-bond mutual fund dividends)', help: 'Interest from other states\' bonds is added back on Schedule S, Line 1; North Carolina bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'baileyRetirementBenefits', kind: 'amount', text: 'Retirement benefits from NC state or local government or federal service where you had 5 years of creditable service by August 12, 1989 (Bailey settlement)', help: 'Deducted on Schedule S, Line 20. Enter 0 if none.' }),
    Object.freeze({ id: 'uniformedServicesRetirement', kind: 'amount', text: 'Retirement pay from the U.S. Uniformed Services for 20 years of service or a medical retirement', help: 'Deducted on Schedule S, Line 21, if not already deducted as Bailey retirement. Enter 0 if none.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'North Carolina consumer use tax owed on out-of-state or online purchases', help: 'Purchases with no North Carolina sales tax; the instructions have a table if you are unsure. Enter 0 if none.' }),
  ]),
  notCovered: Object.freeze(['Bonus depreciation, section 179 and other Schedule PN-1 additions and deductions (business adjustments)', 'North Carolina net operating losses', 'D-400TC credits other than the credit for tax paid to another state, and business credits on NC-478', 'Part-year residents\' credit for tax paid to another state on income earned there while a North Carolina resident', 'Proration of mortgage interest and property taxes between spouses filing separately', 'Repayment of claim of right income (Schedule A, Line 8)', 'Interest and penalty for underpaid estimated tax (D-422)', 'Contributions to the NC Nongame and Endangered Wildlife Fund and other check-offs']),
  compute,
});
