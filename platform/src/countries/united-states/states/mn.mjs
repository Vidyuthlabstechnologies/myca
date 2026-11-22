import { whole, positive, bracketTax, rateOf, check, byStatus, lineTable, yesNo } from '../state-kit.mjs';

const round5 = (value) => Math.round(value * 100000) / 100000;
const share5 = (part, total) => {
  if (whole(part) <= 0) return 0;
  if (whole(total) <= 0 || part >= total) return 1;
  return Math.min(1, round5(part / total));
};
const sideOf = (status) => (status === 'mfs' ? 'mfs' : 'other');

function rawTax(amount, bands) {
  let tax = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const low = bands[index].overCents / 100;
    const high = index + 1 < bands.length ? bands[index + 1].overCents / 100 : Infinity;
    if (amount > low) tax += ((Math.min(amount, high) - low) * bands[index].rateBp) / 10000;
  }
  return tax;
}

function statusBands(rule, status) {
  if (status === 'qss') return rule.brackets.mfj;
  return rule.brackets[status] || rule.brackets.single;
}

export function minnesotaTax(taxable, status, rule) {
  const amount = positive(taxable);
  if (!amount) return 0;
  const bands = statusBands(rule, status);
  if (amount >= rule.tableBelow) return bracketTax(amount, bands);
  if (amount < 20) return 0;
  const middle = amount < 100 ? 60 : Math.floor(amount / 100) * 100 + 50;
  return bracketTax(middle, bands);
}

function phaseoutReduction(agi, base, rule, status) {
  const side = sideOf(status);
  const start = rule.phaseout.start[side];
  if (agi <= start) return 0;
  const cap = Math.round((base * rule.phaseout.maxReductionBp) / 10000);
  if (agi > rule.phaseout.fullAt) return cap;
  const upper = rule.phaseout.upper[side];
  const low = Math.min(agi, upper) - start;
  const high = Math.max(0, agi - upper);
  const reduction = Math.round((low * rule.phaseout.lowRateBp) / 10000) + Math.round((high * rule.phaseout.highRateBp) / 10000);
  return Math.min(reduction, cap);
}

function earnedIncome(ctx) {
  return Math.max(0, ctx.income.wages + Math.max(0, ctx.income.businessIncome - ctx.income.adjustmentItems.seTaxDeduction));
}

function standardDeduction(ctx, rule) {
  const status = ctx.filingStatus;
  const married = status === 'mfj' || status === 'mfs' || status === 'qss';
  const people = status === 'mfs' && !yesNo(ctx.answers.spouseHasNoIncome) ? ctx.filers.filter((item) => item.role === 'taxpayer') : [...ctx.filers, ...(status === 'mfs' && ctx.spouse ? [ctx.spouse] : [])];
  const boxes = people.reduce((total, item) => total + (item.age !== null && item.age >= 65 ? 1 : 0) + (item.blind ? 1 : 0), 0);
  const perBox = married ? rule.additionalPerBox.married : rule.additionalPerBox.unmarried;
  const table = byStatus(rule.standard, status) + boxes * perBox;
  const dependent = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  if (!dependent) return { boxes, amount: table, dependent };
  const step1 = Math.max(rule.dependentStandard.minimum, earnedIncome(ctx) + rule.dependentStandard.earnedAdd);
  const step5 = byStatus(rule.standard, status) + boxes * perBox;
  return { boxes, amount: Math.min(step1, step5), dependent };
}

function itemizedDeduction(ctx, rule, agi) {
  const parts = ctx.itemized;
  const base = Math.max(0, agi);
  const medicalFloor = rateOf(base, rule.itemized.medicalFloorBp);
  const medical = Math.max(0, parts.medicalPaid - medicalFloor);
  const taxes = Math.min(parts.realEstateTaxes + parts.personalPropertyTaxes, rule.itemized.taxesCap[sideOf(ctx.filingStatus)]);
  const mortgage = parts.mortgageInterest;
  const charityGiven = parts.charityCash + parts.charityNonCash;
  const charityFloor = rateOf(base, rule.itemized.charityFloorBp);
  const charity = Math.max(0, charityGiven - charityFloor);
  const misc = parts.otherItemized;
  const total = medical + taxes + mortgage + charity + misc;
  const reducible = total - medical;
  let limitation = 0;
  if (reducible > 0) {
    const side = sideOf(ctx.filingStatus);
    if (agi > rule.phaseout.fullAt) limitation = Math.round((reducible * rule.phaseout.maxReductionBp) / 10000);
    else if (agi > rule.phaseout.start[side]) {
      const upper = rule.phaseout.upper[side];
      const step6 = Math.round(((Math.min(agi, upper) - rule.phaseout.start[side]) * rule.phaseout.lowRateBp) / 10000);
      const step8 = Math.round((Math.max(0, agi - upper) * rule.phaseout.highRateBp) / 10000);
      limitation = Math.min(step6 + step8, Math.round((reducible * rule.phaseout.maxReductionBp) / 10000));
    }
  }
  const result = total - limitation;
  const L = rule.m1saLines;
  const lines = L.layout === 2025
    ? { 1: parts.medicalPaid, 2: base, 3: medicalFloor, 4: medical, 5: parts.realEstateTaxes, 6: parts.personalPropertyTaxes, 7: parts.realEstateTaxes + parts.personalPropertyTaxes, 8: taxes, 9: 0, 10: taxes, 11: mortgage, 12: 0, 13: 0, 14: mortgage, 15: parts.charityCash, 16: parts.charityNonCash, 17: 0, 18: charity, 19: 0, 20: 0, 21: base, 22: rateOf(base, 200), 23: 0, 24: misc, 25: total, 26: limitation, 27: result }
    : { 1: base, 2: parts.medicalPaid, 3: medicalFloor, 4: medical, 5: parts.realEstateTaxes, 6: parts.personalPropertyTaxes, 7: parts.realEstateTaxes + parts.personalPropertyTaxes, 8: taxes, 9: 0, 10: taxes, 11: mortgage, 12: 0, 13: 0, 14: mortgage, 15: parts.charityCash, 16: parts.charityNonCash, 17: 0, 18: charityGiven, 19: charityFloor, 20: charity, 21: charity, 22: 0, 23: 0, 24: rateOf(base, 200), 25: 0, 26: misc, 27: total, 28: limitation, 29: result };
  return { amount: result, lines: lineTable(lines), charityAllowedBeforeFloor: charityGiven };
}

function dependentExemptions(ctx, rule, agi) {
  const count = ctx.dependents.filter((item) => !item.bornAfterYear).length;
  if (!count || ctx.filers.some((item) => item.canBeClaimedAsDependent)) return { count, amount: 0, lines: null };
  const step3 = count * rule.exemption.amount;
  const start = byStatus(rule.exemption.start, ctx.filingStatus);
  if (agi <= start) return { count, amount: step3, lines: lineTable({ 1: count, 2: rule.exemption.amount, 3: step3, 4: agi, 5: start, 10: step3 }) };
  const side = sideOf(ctx.filingStatus);
  const step6 = agi - start;
  if (step6 > rule.exemption.maxExcess[side]) return { count, amount: 0, lines: lineTable({ 1: count, 2: rule.exemption.amount, 3: step3, 4: agi, 5: start, 6: step6, 10: 0 }) };
  const step7 = Math.ceil(step6 / rule.exemption.step[side]);
  const step8 = (step7 * rule.exemption.stepRateBp) / 10000;
  const step9 = Math.round(step3 * step8);
  return { count, amount: step3 - step9, lines: lineTable({ 1: count, 2: rule.exemption.amount, 3: step3, 4: agi, 5: start, 6: step6, 7: step7, 8: step8, 9: step9, 10: step3 - step9 }) };
}

function socialSecuritySubtraction(ctx, rule, agi) {
  const ss = rule.socialSecurity;
  const status = ctx.filingStatus;
  const taxable = ctx.income.socialSecurityTaxable;
  if (!taxable) return { amount: 0, worksheet: null };
  const start = byStatus(ss.start, status);
  if (agi <= start) return { amount: taxable, worksheet: null };
  const side = sideOf(status);
  const step3 = agi - start;
  const step4 = Math.min(10, Math.ceil(step3 / ss.step[side]));
  const step5 = (step4 * ss.stepRateBp) / 10000;
  const step7 = Math.round(taxable * step5);
  const step8 = Math.max(0, taxable - step7);
  const step11 = ctx.income.totalIncome - taxable;
  const step13 = Math.round(ctx.income.socialSecurityBenefits / 2);
  const step15 = step11 + step13 + ctx.income.taxExemptInterest;
  const step18 = Math.max(0, ctx.income.adjustments - ctx.income.adjustmentItems.studentLoan);
  const step19 = Math.max(0, step15 - step18);
  const step21 = Math.max(0, step19 - byStatus(ss.altBase, status));
  const step22 = rateOf(step21, ss.altRateBp);
  const step24 = Math.max(0, byStatus(ss.altMax, status) - step22);
  const step28 = Math.min(step24, taxable);
  const step30 = Math.max(step28, step8);
  return { amount: step30, worksheet: lineTable({ 1: agi, 2: start, 3: step3, 4: step4, 5: step5, 6: taxable, 7: step7, 8: step8, 9: ctx.income.totalIncome, 10: taxable, 11: step11, 12: ctx.income.socialSecurityBenefits, 13: step13, 14: ctx.income.taxExemptInterest, 15: step15, 16: ctx.income.adjustments, 17: ctx.income.adjustmentItems.studentLoan, 18: step18, 19: step19, 20: byStatus(ss.altBase, status), 21: step21, 22: step22, 23: byStatus(ss.altMax, status), 24: step24, 25: taxable, 26: 0, 27: taxable, 28: step28, 29: step8, 30: step30 }) };
}

function seniorSubtraction(ctx, rule, agi, answers) {
  const status = ctx.filingStatus;
  const seniors = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length;
  const disabled = yesNo(answers.disabled);
  if (!seniors && !disabled) return { amount: 0, lines: null };
  if (status === 'mfs') return { amount: 0, lines: null, mfs: true };
  const qualifying = Math.min(ctx.filers.length, seniors + (disabled && seniors < ctx.filers.length ? 1 : 0));
  const line1 = byStatus(rule.senior.base, status);
  const line2 = seniors ? 0 : positive(answers.disabilityIncome);
  const line3 = seniors ? line1 : Math.min(line1, line2);
  const line5 = Math.max(0, ctx.income.socialSecurityBenefits - ctx.income.socialSecurityTaxable);
  const line7 = line5;
  const line8 = line3 - line7;
  if (line8 <= 0) return { amount: 0, lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: 0, '5a': ctx.income.socialSecurityBenefits, '5b': ctx.income.socialSecurityTaxable, 5: line5, 6: 0, 7: line7, 8: 0 }) };
  const line10 = status === 'mfj' ? (qualifying >= 2 ? rule.senior.agiFloor.both : rule.senior.agiFloor.one) : rule.senior.agiFloor.one;
  const line11 = Math.max(0, agi - line10);
  const line12 = rateOf(line11, rule.senior.rateBp);
  const line13 = Math.max(0, line8 - line12);
  return { amount: line13, lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: 0, '5a': ctx.income.socialSecurityBenefits, '5b': ctx.income.socialSecurityTaxable, 5: line5, 6: 0, 7: line7, 8: line8, '9a': agi, '9b': 0, 9: agi, 10: line10, 11: line11, 12: line12, 13: line13 }) };
}

function childGroups(ctx) {
  const ctc = [];
  const older = [];
  for (const item of ctx.dependents) {
    if (!item.qualifyingChild || item.bornAfterYear) continue;
    if (item.age !== null && item.age < 18) ctc.push(item);
    else older.push(item);
  }
  return { ctc, older };
}

function workingFamilyCredit(ctx, filing, credits, agi, ratio, answers, checks) {
  const rule = credits.cwfc;
  const { ctc, older } = childGroups(ctx);
  const earned = earnedIncome(ctx);
  const investment = ctx.income.taxableInterest + ctx.income.taxExemptInterest + ctx.income.ordinaryDividends + Math.max(0, ctx.income.capitalGain);
  const resident = filing.residency !== 'nonresident';
  let eligible = resident && !ctx.filers.some((item) => item.canBeClaimedAsDependent);
  if (ctx.filingStatus === 'mfs' && !yesNo(answers.mfsCwfcException)) eligible = false;
  if (investment >= rule.investmentLimit) {
    eligible = false;
    checks.push(check('warning', 'MN_CWFC_INVESTMENT_INCOME', `Investment income of $${investment.toLocaleString('en-US')} is at or above the $${rule.investmentLimit.toLocaleString('en-US')} limit, so the Minnesota Child and Working Family Credits are not claimed.`));
  }
  if (!ctc.length && !older.length && !ctx.filers.some((item) => item.age !== null && item.age >= 19 && item.age <= 64)) eligible = false;
  const advance = positive(answers.ctcAdvanceReceived);
  const line3 = Math.min(earned, rule.earnedCap);
  const line4 = rateOf(line3, rule.wfcRateBp);
  const line5 = rule.olderChild[Math.min(3, older.length)];
  const line6 = line4 + line5;
  const line7 = ctc.length;
  const line8 = line7 * rule.perChild;
  const line9 = line6 + line8;
  const line10 = Math.max(agi, earned);
  const line11 = ctx.filingStatus === 'mfj' ? rule.phaseStart.mfj : rule.phaseStart.other;
  const line12 = Math.max(0, line10 - line11);
  const line13 = line5 && !line8 ? rule.olderOnlyRateBp : rule.rateBp;
  const line14 = line10 > line11 ? rateOf(line12, line13) : 0;
  const line15 = eligible ? Math.max(0, line9 - line14) : 0;
  const line16 = filing.residency === 'part-year' ? Math.round(line15 * ratio) : null;
  const credit = line16 === null ? line15 : line16;
  const lines = { 1: agi, 2: earned, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13 / 10000, 14: line14, 15: line15, ...(line16 === null ? {} : { 16: line16 }) };
  if (!advance) return { credit, repayment: 0, lines: lineTable(lines), ctc: line7, older: older.length };
  const line17 = line9 ? round5(line8 / line9) : 0;
  const line18 = Math.round(credit * line17);
  const line19 = credit - line18;
  const base = positive(answers.ctcMinimumCreditBase);
  const line20 = credit === 0 ? 0 : base;
  const prior = positive(answers.ctcPriorYearChildren);
  const line21 = prior ? Math.min(1, round5(line7 / prior)) : 0;
  const line22 = Math.round(line20 * line21);
  const line23 = line20 === 0 ? 0 : Math.max(line18, line22);
  const line24 = line19 + line23;
  const line25 = advance;
  const line26 = Math.max(0, line24 - line25);
  const line27 = Math.max(0, line25 - line24);
  return { credit: line26, repayment: line27, lines: lineTable({ ...lines, A: advance, B: base, C: prior, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, 27: line27 }), ctc: line7, older: older.length };
}

function marriageCredit(ctx, rule, credits, line9, line10, ratio, answers) {
  if (ctx.filingStatus !== 'mfj') return null;
  const m = credits.marriage;
  const wagesOf = (owner) => ctx.w2.filter((row) => row.owner === owner).reduce((total, row) => total + row.wages, 0);
  const spouseRetirement = positive(answers.spouseRetirementIncome);
  const spouseBusiness = positive(answers.spouseSelfEmploymentIncome);
  const retirementTotal = ctx.income.iraTaxable + ctx.income.pensionTaxable + ctx.income.socialSecurityTaxable;
  const businessTotal = Math.max(0, ctx.income.businessIncome - ctx.income.adjustmentItems.seTaxDeduction);
  const columnA = { 1: wagesOf('taxpayer'), 2: Math.max(0, businessTotal - spouseBusiness), 3: Math.max(0, retirementTotal - spouseRetirement) };
  const columnB = { 1: wagesOf('spouse'), 2: Math.min(businessTotal, spouseBusiness), 3: Math.min(retirementTotal, spouseRetirement) };
  const a5 = columnA[1] + columnA[2] + columnA[3];
  const b5 = columnB[1] + columnB[2] + columnB[3];
  const line6 = Math.min(a5, b5);
  const line7 = line9;
  const base = { 'A1': columnA[1], 'A2': columnA[2], 'A3': columnA[3], 'A5': a5, 'B1': columnB[1], 'B2': columnB[2], 'B3': columnB[3], 'B5': b5, 6: line6, 7: line7 };
  if (line6 < m.minLesser || line7 < m.minTaxable) return { amount: 0, lines: lineTable(base) };
  const single = rule.brackets.single;
  const joint = rule.brackets.mfj;
  let amount;
  const extra = {};
  if (line6 < m.tableBelow) {
    const row = m.rowStart + Math.floor((line6 - m.rowStart) / m.rowStep) * m.rowStep + m.rowStep / 2;
    const column = Math.min(m.colCount - 1, Math.floor((line7 - m.colStart) / m.colStep));
    const mid7 = m.colStart + column * m.colStep + m.colStep / 2;
    const l11 = row - m.halfStandard;
    const l15 = mid7 - l11;
    const raw = l15 <= 0 ? 0 : rawTax(mid7, joint) - rawTax(l11, single) - rawTax(l15, single);
    amount = raw <= 0 ? 0 : Math.min(m.cap, Math.round(raw));
    extra[8] = amount;
  } else {
    const l11 = line6 - m.halfStandard;
    const l12 = bracketTax(l11, single);
    const l15 = line7 - l11;
    const l16 = l15 > 0 ? bracketTax(l15, single) : 0;
    const l19 = l15 > 0 ? Math.max(0, line10 - (l12 + l16)) : 0;
    amount = Math.min(m.cap, l19);
    Object.assign(extra, { 9: line6, 10: m.halfStandard, 11: l11, 12: l12, 13: line7, 14: l11, 15: l15, 16: l16, 17: line10, 18: l12 + l16, 19: amount });
  }
  if (ratio !== 1) {
    const part = Math.round(amount * ratio);
    extra[20] = ratio;
    extra[21] = part;
    amount = part;
  }
  return { amount, lines: lineTable({ ...base, ...extra }) };
}

function k12Credit(ctx, filing, credits, agi, ratio, answers, layout2025) {
  const children = positive(answers.k12CreditChildren);
  const expenses = positive(answers.k12CreditExpenses);
  const computer = Math.min(positive(answers.k12ComputerExpenses), credits.k12.computerMax);
  if (!children || (!expenses && !computer) || ctx.filingStatus === 'mfs') return null;
  const k = credits.k12;
  const allowed = children * k.perChild;
  const limit = agi > k.phaseStart ? Math.max(0, allowed - rateOf(agi - k.phaseStart, children === 1 ? k.oneChildRateBp : k.moreRateBp)) : allowed;
  const total = expenses + computer;
  const fromExpenses = rateOf(total, k.expenseRateBp);
  const credit = Math.min(fromExpenses, limit);
  const prorated = filing.residency === 'full-year' ? null : Math.round(credit * ratio);
  const final = prorated === null ? credit : prorated;
  const lines = layout2025 ? { 1: agi, 8: expenses, 9: computer, 10: total, 11: fromExpenses, 12: limit, 13: credit, ...(prorated === null ? {} : { 14: prorated }) } : { 1: agi, 7: expenses, 8: computer, 9: total, 10: fromExpenses, 11: limit, 12: credit, ...(prorated === null ? {} : { 13: prorated }) };
  return { amount: final, children, lines: lineTable(lines) };
}

function renterCredit(ctx, filing, credits, agi, answers) {
  const rent = positive(answers.rentPaid);
  if (!rent || filing.residency === 'nonresident' || ctx.filers.some((item) => item.canBeClaimedAsDependent)) return null;
  const r = credits.renter;
  const line1 = agi;
  const line3 = line1;
  const line4 = filing.residency === 'part-year' ? Math.max(0, agi - filing.sourcedAgi) : 0;
  const line5 = line3 - line4;
  const line6 = ctx.filers.some((item) => item.age !== null && item.age >= 65) || yesNo(answers.disabled) ? r.seniorSubtraction : 0;
  const dependents = ctx.dependents.filter((item) => !item.bornAfterYear).length;
  const line7 = r.dependentSubtraction[Math.min(r.dependentSubtraction.length - 1, dependents)];
  const line9 = line6 + line7;
  const line10 = Math.max(0, line5 - line9);
  const line11 = rent;
  const line12 = rateOf(line11, r.rentRateBp);
  const bandOf = (income) => [...r.bands].reverse().find((band) => income >= band[0]);
  let line13 = 0;
  if (line10 < r.notEligibleFrom && line12 > 0) {
    if (line12 < r.tableBelow) {
      const index = r.rows.findIndex((start, i) => line10 >= start && (i + 1 >= r.rows.length || line10 < r.rows[i + 1]));
      const income = (r.rows[index] + r.rows[index + 1]) / 2;
      const rentMid = Math.floor(line12 / r.rentStep) * r.rentStep + r.rentStep / 2;
      const band = bandOf(income);
      const step5 = rentMid - (income * band[1]) / 10000;
      line13 = step5 <= 0 ? 0 : Math.min(band[3], Math.round((step5 * band[2]) / 10000));
    } else {
      const band = bandOf(line10);
      const step4 = Math.round((line10 * band[1]) / 10000);
      const step5 = line12 - step4;
      line13 = step5 <= 0 ? 0 : Math.min(band[3], Math.round((step5 * band[2]) / 10000));
    }
  }
  return { amount: line13, lines: lineTable({ 1: line1, 2: 0, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: 0, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13 }) };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Minnesota figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const checks = [];
  const notes = [];
  const residency = filing.residency;
  const resident = residency === 'full-year';
  const L = rule.m1mLines;

  const line1 = income.agi;
  const mnBonds = Math.min(income.taxExemptInterest, positive(answers.minnesotaBondInterest));
  const nonMn = Math.max(0, income.taxExemptInterest - mnBonds);
  const m1m2 = Math.min(nonMn, income.exemptInterestDividends);
  const m1m1 = nonMn - m1m2;
  if (income.taxExemptInterest > 0 && answers.minnesotaBondInterest === undefined) checks.push(check('warning', 'MN_MUNI_SOURCE', `You have $${income.taxExemptInterest.toLocaleString('en-US')} of federally tax-exempt interest. Minnesota taxes it unless it came from Minnesota bonds, so MyCA adds all of it.`, 'Give the part that came from Minnesota bonds and funds in your Minnesota answers.'));
  const additions = m1m1 + m1m2;
  const line2 = additions;
  const line3 = line1 + line2;

  const standard = standardDeduction(ctx, rule);
  const standardReduction = phaseoutReduction(line1, standard.amount, rule, status);
  const standardAllowed = standard.amount - standardReduction;
  const spouseItemizes = status === 'mfs' && yesNo(ctx.answers.spouseItemizes);
  const itemized = itemizedDeduction(ctx, rule, line1);
  const useItemized = spouseItemizes || itemized.amount > standardAllowed;
  const line4 = useItemized ? itemized.amount : standardAllowed;
  const exemptions = dependentExemptions(ctx, rule, line1);
  const line5 = exemptions.amount;
  const line6 = income.stateRefundTaxable;

  const charitySubtraction = (() => {
    if (useItemized) return 0;
    const step1 = Math.max(0, itemized.charityAllowedBeforeFloor - rateOf(Math.max(0, line1), rule.charitySubtraction.agiFloorBp));
    return rateOf(Math.max(0, step1 - rule.charitySubtraction.floor), rule.charitySubtraction.rateBp);
  })();
  const ss = socialSecuritySubtraction(ctx, rule, line1);
  const k12Children = positive(answers.k12SubtractionChildren);
  const k12Subtraction = Math.min(positive(answers.k12SubtractionExpenses), (k12Children || (positive(answers.k12SubtractionExpenses) ? 1 : 0)) * rule.k12Subtraction.perChildUpper);
  const usBonds = income.usObligationInterest;
  const senior = seniorSubtraction(ctx, rule, line1, answers);
  if (senior.mfs) checks.push(check('info', 'MN_M1R_MFS', 'Married filing separately: the age 65 or older / disabled subtraction (Schedule M1R) is allowed only if you lived apart from your spouse all year, which MyCA does not ask; it is not claimed.'));
  const militaryPension = positive(answers.militaryPension);
  const subtractions = charitySubtraction + ss.amount + k12Subtraction + usBonds + senior.amount + militaryPension;
  const line7 = subtractions;
  const line8 = line4 + line5 + line6 + line7;
  const line9 = Math.max(0, line3 - line8);
  const line10 = minnesotaTax(line9, status, rule);
  const line11 = 0;
  const line12 = line10 + line11;

  let line13 = line12;
  let ratio = 1;
  let scheduleNR = null;
  let line13a = null;
  let line13b = null;
  if (!resident) {
    const s = filing.sourced;
    const partYear = residency === 'part-year';
    const a = { 1: income.wages, 2: income.taxableInterest + income.ordinaryDividends, 3: income.businessIncome, 4: income.capitalGain, 5: income.iraTaxable + income.pensionTaxable };
    a[8] = income.totalIncome - (a[1] + a[2] + a[3] + a[4] + a[5]);
    a[9] = additions;
    const b = { 1: whole(s.wages), 2: Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest)) + whole(s.ordinaryDividends), 3: whole(s.businessIncome), 4: whole(s.capitalGain), 5: whole(s.iraTaxable) + whole(s.pensionTaxable), 8: whole(s.socialSecurityTaxable) + whole(s.unemployment) + whole(s.stateRefundTaxable) + whole(s.otherIncome) };
    b[9] = partYear ? Math.round(additions * filing.share) : 0;
    const a15 = a[1] + a[2] + a[3] + a[4] + a[5] + a[8] + a[9];
    const b15 = b[1] + b[2] + b[3] + b[4] + b[5] + b[8] + b[9];
    const studentLoan = income.adjustmentItems.studentLoan;
    const a20 = partYear ? Math.round(studentLoan * filing.share) : 0;
    const aOther = Math.max(0, income.adjustments - studentLoan);
    const bAdjust = Math.max(0, whole(s.adjustments));
    const bOther = Math.max(0, bAdjust - (partYear ? Math.round(studentLoan * filing.share) : 0));
    const a25 = income.usObligationInterest;
    const a27 = aOther + a20 + a25;
    const b27 = bOther + a20;
    const grossMn = b15;
    const line28 = grossMn < rule.filingThreshold ? 0 : Math.max(0, b15 - b27);
    const line29 = a15 - a27;
    const line30 = line28 <= 0 ? 0 : line29 <= 0 || line28 > line29 ? 1 : round5(line28 / line29);
    const line32 = Math.round(line30 * line12);
    ratio = line28 > 0 ? line30 : share5(Math.max(0, b15 - b27), line29);
    line13 = line32;
    line13a = line28;
    line13b = line29;
    scheduleNR = lineTable({ A1: a[1], B1: b[1], A2: a[2], B2: b[2], A3: a[3], B3: b[3], A4: a[4], B4: b[4], A5: a[5], B5: b[5], A8: a[8], B8: b[8], A9: a[9], B9: b[9], A15: a15, B15: b15, 'A16-19,21': aOther, 'B16-19,21': bOther, A20: a20, B20: a20, A25: a25, B25: 0, A27: a27, B27: b27, 28: line28, 29: line29, 30: line30, 31: line12, 32: line32 });
    if (grossMn < rule.filingThreshold) checks.push(check('info', 'MN_BELOW_FILING_THRESHOLD', `Minnesota gross income of $${grossMn.toLocaleString('en-US')} is below the $${rule.filingThreshold.toLocaleString('en-US')} filing requirement, so Schedule M1NR line 28 is 0 and no Minnesota tax is due; file only to get back withholding or claim refundable credits.`));
    if (residency === 'nonresident') notes.push('Schedule M1NR column B includes only the Minnesota W-2 wages and the amounts you gave as Minnesota-source income.');
  }

  const cwfc = workingFamilyCredit(ctx, filing, credits, line1, ratio, answers, checks);
  const line14a = 0;
  const line14b = cwfc.repayment;
  const line15 = line13 + line14a + line14b;

  const marriage = marriageCredit(ctx, rule, credits, line9, line10, resident ? 1 : ratio, answers);
  const marriageAmount = marriage ? marriage.amount : 0;
  let otherStateCredit = 0;
  const crSchedules = [];
  if (residency !== 'nonresident' && filing.otherStates.length) {
    const line2cr = line1 + additions - usBonds;
    const line4cr = line13 - marriageAmount;
    for (const other of filing.otherStates) {
      if (other.state === 'WI') {
        checks.push(check('warning', 'MN_WISCONSIN_M1RCR', 'Tax paid to Wisconsin on wages earned while a Minnesota resident is claimed on Schedule M1RCR (a refundable credit), which MyCA does not prepare yet; no credit for Wisconsin tax is included.', 'Complete Schedule M1RCR with your Wisconsin return.'));
        continue;
      }
      if (line4cr <= 0) break;
      const line1cr = Math.min(positive(other.income), Math.max(0, line2cr));
      const line3cr = share5(line1cr, line2cr);
      const line5cr = Math.round(line4cr * line3cr);
      const line6cr = positive(other.tax);
      const line7cr = Math.min(line5cr, line6cr);
      otherStateCredit += line7cr;
      crSchedules.push(lineTable({ state: other.state, 1: line1cr, 2: line2cr, 3: line3cr, '4a': line13, '4b': marriageAmount, 4: line4cr, 5: line5cr, 6: line6cr, 7: line7cr }));
    }
    if (crSchedules.length) checks.push(check('info', 'MN_SCHEDULE_M1CR', 'Credit for tax paid to another state (Schedule M1CR) is limited to the Minnesota tax on the income taxed there; keep a copy of the other state\'s return.'));
    if (residency === 'part-year' && crSchedules.length) checks.push(check('warning', 'MN_M1CR_PART_YEAR', 'Part-year residents limit the credit by the income taxed while a Minnesota resident (Schedule M1CR lines 8 to 11); MyCA used the full-year method.', 'Check Schedule M1CR lines 8 to 11 against the other state\'s return.'));
  }
  const line16 = Math.min(line15, marriageAmount + otherStateCredit);
  const line17 = Math.max(0, line15 - line16);
  const line18 = positive(answers.nongameContribution);
  const line19 = line17 + line18;

  const k12 = k12Credit(ctx, filing, credits, line1, ratio, answers, rule.m1saLines.layout === 2025);
  const renter = renterCredit(ctx, filing, credits, line1, answers);
  const ref = { 1: 0, 2: cwfc.credit, 3: k12 ? k12.amount : 0, 4: renter ? renter.amount : 0 };
  const line22 = ref[1] + ref[2] + ref[3] + ref[4];

  if (exemptions.count && line5 === 0 && !ctx.filers.some((item) => item.canBeClaimedAsDependent)) checks.push(check('info', 'MN_EXEMPTIONS_PHASED_OUT', 'Adjusted gross income is above the limit, so the dependent exemptions are fully phased out.'));
  if (income.businessIncome && residency === 'part-year') checks.push(check('info', 'MN_M1NR_BUSINESS', 'Schedule M1NR lines 17 to 19 (retirement plan, HSA and self-employment deductions) are assigned to Minnesota by your Minnesota share of each; MyCA uses the adjustments you gave or a share by days.'));
  if (cwfc.ctc && !yesNo(answers.ctcAdvanceElection)) notes.push('You may elect on Schedule M1CWFC to receive part of next year\'s Minnesota Child Tax Credit in advance.');
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) checks.push(check('info', 'MN_DEPENDENT_FILER', 'Someone can claim you as a dependent: the Minnesota standard deduction uses the dependent worksheet and no exemptions or Child and Working Family Credits are allowed.'));

  const m1m = lineTable({ [L.muni]: m1m1, 2: m1m2, [L.additions]: additions, [L.charity]: charitySubtraction, [L.socialSecurity]: ss.amount, [L.k12]: k12Subtraction, [L.usBonds]: usBonds, [L.senior]: senior.amount, [L.militaryPension]: militaryPension, [L.subtractions]: subtractions });
  const lines = lineTable({ A: income.wages, B: income.iraTaxable + income.pensionTaxable, C: income.unemployment, D: whole(ctx.federal.lines['15']), E: income.socialSecurityBenefits, F: income.socialSecurityTaxable, 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, ...(line13a === null ? {} : { '13a': line13a, '13b': line13b }), '14a': line14a, '14b': line14b, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: filing.payments.withheld, 21: filing.payments.estimated + filing.payments.extension, 22: line22 });
  const schedules = {
    M1M: m1m,
    'Line 4': lineTable({ standardBoxes: standard.boxes, standardBeforeLimit: standard.amount, standardLimitation: standardReduction, standard: standardAllowed, itemized: itemized.amount, used: useItemized ? 'itemized' : 'standard' }),
    ...(useItemized || itemized.amount ? { M1SA: itemized.lines } : {}),
    ...(exemptions.lines ? { 'Line 5': exemptions.lines } : {}),
    ...(ss.worksheet ? { 'M1M line 12 worksheet': ss.worksheet } : {}),
    ...(senior.lines ? { M1R: senior.lines } : {}),
    ...(scheduleNR ? { M1NR: scheduleNR } : {}),
    ...(marriage ? { M1MA: marriage.lines } : {}),
    ...(crSchedules.length ? { M1CR: crSchedules } : {}),
    M1C: lineTable({ 1: marriageAmount, 3: otherStateCredit, 19: line16 }),
    ...(cwfc.credit || cwfc.repayment || cwfc.ctc || cwfc.older ? { M1CWFC: cwfc.lines } : {}),
    ...(k12 ? { M1ED: k12.lines } : {}),
    ...(renter ? { M1RENT: renter.lines } : {}),
    M1REF: lineTable({ 1: ref[1], 2: ref[2], '2a': cwfc.ctc, '2b': cwfc.older, 3: ref[3], ...(k12 ? { '3a': k12.children } : {}), 4: ref[4], 14: line22 }),
  };
  return {
    form: 'M1',
    lines,
    schedules,
    stateIncome: resident ? line3 : line13a,
    taxableIncome: line9,
    taxBeforeCredits: line15,
    nonrefundableCredits: [...(marriageAmount ? [{ code: 'MN_MARRIAGE', label: 'Marriage credit (Schedule M1MA)', amount: marriageAmount }] : []), ...(otherStateCredit ? [{ code: 'MN_M1CR', label: 'Credit for income tax paid to another state (Schedule M1CR)', amount: otherStateCredit }] : [])],
    otherStateCredit,
    otherTaxes: [...(line14b ? [{ code: 'MN_CTC_REPAYMENT', label: 'Repayment of advance child tax credit', amount: line14b }] : []), ...(line18 ? [{ code: 'MN_NONGAME', label: 'Nongame Wildlife Fund contribution', amount: line18 }] : [])],
    totalTax: line19,
    refundableCredits: [...(ref[2] ? [{ code: 'MN_CWFC', label: 'Minnesota Child and Working Family Credits', amount: ref[2] }] : []), ...(ref[3] ? [{ code: 'MN_K12', label: 'K-12 Education Credit', amount: ref[3] }] : []), ...(ref[4] ? [{ code: 'MN_RENTER', label: 'Renter\'s Credit', amount: ref[4] }] : [])],
    checks,
    notes,
  };
}

const Q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'MN',
  name: 'Minnesota',
  built: true,
  forms: Object.freeze({ resident: 'M1', partYear: 'M1 with Schedule M1NR', nonresident: 'M1 with Schedule M1NR' }),
  questions: Object.freeze([
    Q('minnesotaBondInterest', 'amount', 'Of your federally tax-exempt interest and exempt-interest dividends, how much came from Minnesota state and local bonds?', 'Minnesota adds back tax-exempt interest from other states\' bonds (Schedule M1M lines 1 and 2). Enter 0 if none came from Minnesota bonds.', { when: { has: ['taxExemptInterest'] } }),
    Q('militaryPension', 'amount', 'Military pension or other military retirement pay included in your federal income', 'Subtracted on Schedule M1M.', { when: { has: ['retirementIncome'] } }),
    Q('disabled', 'yesno', 'Were you (or your spouse) permanently and totally disabled in the year?', 'Used for the age 65 or older / disabled subtraction (Schedule M1R) and the renter\'s credit.'),
    Q('disabilityIncome', 'amount', 'Taxable disability pensions and insurance payments in your wages (only if under 65 and disabled)', 'Schedule M1R line 2.', { when: { answer: { id: 'disabled', in: [true] } } }),
    Q('k12CreditChildren', 'count', 'Number of qualifying children in grades K-12 with education expenses', 'Schedule M1ED, K-12 Education Credit.', { when: { filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['dependents'] } }),
    Q('k12CreditExpenses', 'amount', 'K-12 education expenses that qualify for the credit (tutoring, enrichment classes, school supplies, instruments, school transport), not tuition or computers', 'Schedule M1ED lines 2 to 6 for all children.', { when: { filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['dependents'] } }),
    Q('k12ComputerExpenses', 'amount', 'Home computer hardware and educational software bought for K-12 school use', 'Up to $200 counts for the credit.', { when: { filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['dependents'] } }),
    Q('k12SubtractionChildren', 'count', 'Number of K-12 children for the education subtraction', 'Schedule M1M; used to cap the subtraction per child.', { when: { has: ['dependents'] } }),
    Q('k12SubtractionExpenses', 'amount', 'K-12 education expenses not used for the credit, including private school tuition', 'Schedule M1M education subtraction, up to $1,625 per child in K-6 and $2,500 per child in 7-12; enter the amount after those limits.', { when: { has: ['dependents'] } }),
    Q('rentPaid', 'amount', 'Total rent from line 3 of your Certificates of Rent Paid (CRP) for your Minnesota home', 'Gives the Renter\'s Credit on Schedule M1RENT. Leave empty if you did not rent.', { when: { residency: ['full-year', 'part-year'] } }),
    Q('spouseRetirementIncome', 'amount', 'Spouse\'s share of taxable pensions, IRA distributions and taxable Social Security', 'Schedule M1MA marriage credit splits income between spouses; W-2 wages are split from the W-2s.', { when: { filingStatus: ['mfj'] } }),
    Q('spouseSelfEmploymentIncome', 'amount', 'Spouse\'s net self-employment income (after half of the self-employment tax)', 'Schedule M1MA column B line 2.', { when: { filingStatus: ['mfj'], has: ['selfEmployment'] } }),
    Q('mfsCwfcException', 'yesno', 'Married filing separately: did a qualifying child live with you more than half the year and you lived apart from your spouse the last six months (or are legally separated)?', 'Lets a married-filing-separately filer claim the Child and Working Family Credits.', { when: { residency: ['full-year', 'part-year'], filingStatus: ['mfs'] } }),
    Q('ctcAdvanceReceived', 'amount', 'Advance payments of this year\'s Minnesota Child Tax Credit you received (from your Summary Letter)', 'Schedule M1CWFC line A; reconciled on lines 17 to 27.'),
    Q('ctcMinimumCreditBase', 'amount', 'Minimum Credit Base from last year\'s Schedule M1CWFC (line B)', 'From your Summary Letter.', { when: { answer: { id: 'ctcAdvanceReceived' } } }),
    Q('ctcPriorYearChildren', 'count', 'Number of qualifying children on last year\'s Schedule M1CWFC line 7 (line C)', 'From your Summary Letter.', { when: { answer: { id: 'ctcAdvanceReceived' } } }),
    Q('ctcAdvanceElection', 'yesno', 'Do you want advance payments of next year\'s Minnesota Child Tax Credit?', 'Schedule M1CWFC section 3.', { when: { has: ['dependents'] } }),
    Q('nongameContribution', 'amount', 'Contribution to the Nongame Wildlife Fund', 'Form M1 line 18; it reduces your refund or adds to what you owe.'),
  ]),
  labels: Object.freeze({
    A: 'Wages, salaries, tips, etc.',
    B: 'IRA, pensions, and annuities',
    C: 'Unemployment',
    D: 'Federal taxable income',
    E: 'Social Security benefits',
    F: 'Taxable Social Security benefits',
    1: 'Federal adjusted gross income',
    2: 'Additions to income (Schedule M1M)',
    3: 'Add lines 1 and 2',
    4: 'Itemized deductions or standard deduction',
    5: 'Exemptions (Schedule M1DQC)',
    6: 'State income tax refund',
    7: 'Subtractions (Schedule M1M)',
    8: 'Total subtractions',
    9: 'Minnesota taxable income',
    10: 'Tax from the table or schedules',
    11: 'Alternative minimum tax',
    12: 'Add lines 10 and 11',
    13: 'Tax (part-year and nonresidents: Schedule M1NR, line 32)',
    '13a': 'Minnesota gross income (Schedule M1NR, line 28)',
    '13b': 'Total gross income (Schedule M1NR, line 29)',
    '14a': 'Other taxes',
    '14b': 'Repayment of advance child tax credit',
    15: 'Tax before credits',
    16: 'Nonrefundable credits (Schedule M1C)',
    17: 'Subtract line 16 from line 15',
    18: 'Nongame Wildlife Fund contribution',
    19: 'Add lines 17 and 18',
    20: 'Minnesota income tax withheld',
    21: 'Minnesota estimated tax and extension payments',
    22: 'Refundable credits (Schedule M1REF)',
  }),
  notCovered: Object.freeze([
    'Schedule M1MB business additions and subtractions (bonus depreciation, section 179, pass-through entity tax)',
    'Schedule M1NC federal adjustments for federal law changes since May 1, 2023',
    'Alternative minimum tax (Schedule M1MT), lump-sum distribution tax (M1LS), net investment income tax (Schedule NIIT) and recapture taxes',
    'Child and Dependent Care Credit (Schedule M1CD) and the other refundable credits on Schedule M1REF lines 5 to 13',
    'Credit for tax paid to Wisconsin (Schedule M1RCR) and the part-year method of Schedule M1CR lines 8 to 11',
    'Nonrefundable credits on Schedule M1C other than the marriage credit and the credit for tax paid to another state (long-term care, past military service, student loan, 529, and others)',
    'M1M subtractions other than Social Security, U.S. bond interest, charitable contributions, K-12 education, age 65 or older/disabled, and military pensions',
    'Homestead Credit Refund for homeowners (Form M1PR), which is a separate claim; the renter\'s credit is on Schedule M1RENT',
    'Married filing separately renters who lived with their spouse (Schedule M1RENT line 2) and care facility rent limits',
    'Reciprocity refunds for Michigan and North Dakota residents (Schedule M1M line 18)',
    'Underpayment penalty (Schedule M15) and late payment penalty and interest',
  ]),
  compute,
});
