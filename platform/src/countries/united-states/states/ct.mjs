import { whole, positive, sum, bracketTax, rateOf, ratio, check, lineTable, byStatus, yesNo, sourcedAgi } from '../state-kit.mjs';

const statusKey = (status) => (status === 'qss' ? 'mfj' : status);

function stepsOver(amount, over, step) {
  return amount > over ? Math.ceil((amount - over) / step) : 0;
}

function personalCreditBp(rows, agi) {
  let found = 0;
  for (const row of rows) if (agi > row.overAgi) found = row.bp;
  return found;
}

export function connecticutTax(agi, status, rule) {
  const key = statusKey(status);
  const income = Math.max(0, whole(agi));
  if (income <= rule.noTaxAtOrBelow[key]) return { 1: income, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
  const exemption = rule.exemption[key];
  const line2 = Math.max(0, exemption.amount - stepsOver(income, exemption.phaseOutOver, rule.exemptionStep) * rule.exemptionReductionPerStep);
  const line3 = Math.max(0, income - line2);
  const line4 = bracketTax(line3, rule.brackets[key]);
  const addBack = rule.phaseOutAddBack[key];
  const line5 = Math.min(addBack.maximum, stepsOver(income, addBack.over, addBack.step) * addBack.perStep);
  const line6 = rule.recapture[key].reduce((total, tier) => total + Math.min(tier.maximum, stepsOver(income, tier.over, tier.step) * tier.perStep), 0);
  const line7 = line4 + line5 + line6;
  const bp = personalCreditBp(rule.personalCredit[key], income);
  const line9 = rateOf(line7, bp);
  return { 1: income, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: bp / 10000, 9: line9, 10: line7 - line9 };
}

function pensionFactorBp(table, agi, status) {
  const rows = status === 'mfj' || status === 'qss' ? table.mfj : table.other;
  let found = rows[0].bp;
  for (const row of rows) if (agi >= row.fromAgi) found = row.bp;
  return found;
}

function socialSecurityAdjustment(ctx, mods, answers) {
  const federalTaxable = whole(ctx.income.socialSecurityTaxable);
  if (federalTaxable <= 0) return 0;
  const agi = ctx.income.agi;
  if (agi < byStatus(mods.socialSecurityFullyExemptBelow, ctx.filingStatus)) return federalTaxable;
  const sheet = ctx.federal.socialSecurityWorksheet || {};
  const a = whole(sheet[1]);
  if (a <= 0) return 0;
  const b = ctx.filingStatus === 'mfs' && yesNo(answers.livedWithSpouse) ? whole(sheet[7]) : whole(sheet[9]);
  if (b <= 0) return 0;
  const d = rateOf(Math.min(a, b), mods.socialSecurityTaxableShareBp);
  return Math.max(0, federalTaxable - d);
}

function modifications(ctx, filing, mods) {
  const income = ctx.income;
  const answers = filing.answers;
  const status = ctx.filingStatus;
  const ctMuniInterest = positive(answers.ctMuniInterest);
  const ctMuniDividends = positive(answers.ctMuniFundDividends);
  const directExempt = Math.max(0, whole(income.taxExemptInterest) - whole(income.exemptInterestDividends));
  const add31 = Math.max(0, directExempt - ctMuniInterest);
  const add32 = Math.max(0, whole(income.exemptInterestDividends) - ctMuniDividends);
  const additions = add31 + add32;
  const sub39 = whole(income.usObligationInterest);
  const sub40 = positive(answers.usGovernmentFundDividends);
  const sub41 = socialSecurityAdjustment(ctx, mods, answers);
  const sub42 = whole(income.stateRefundTaxable);
  const pension = whole(income.pensionTaxable);
  const railroad = Math.min(positive(answers.railroadRetirement), pension);
  const military = Math.min(positive(answers.militaryRetirement), pension - railroad);
  const teachers = Math.min(positive(answers.teachersRetirement), pension - railroad - military);
  const sub43 = railroad;
  const sub44 = military;
  const sub45 = rateOf(teachers, mods.teachersRetirementShareBp);
  const sub48 = Math.min(positive(answers.chetContributions), byStatus(mods.chetMaximum, status));
  const pensionBase = rateOf(income.iraTaxable, mods.iraShareBp) + Math.max(0, pension - railroad - military - teachers);
  const factorBp = pensionFactorBp(mods.pensionPhaseOut, income.agi, status);
  const sub48b = rateOf(pensionBase, factorBp);
  const sub48d = Math.min(positive(answers.ableContributions), byStatus(mods.ableMaximum, status));
  const subtractions = sub39 + sub40 + sub41 + sub42 + sub43 + sub44 + sub45 + sub48 + sub48b + sub48d;
  return { add31, add32, additions, sub39, sub40, sub41, sub42, sub43, sub44, sub45, sub48, sub48b, sub48d, subtractions, pensionBase, factorBp };
}

function propertyTaxCredit(ctx, filing, credits, ctAgi) {
  const answers = filing.answers;
  const status = ctx.filingStatus;
  const line60 = positive(answers.residencePropertyTax);
  const line61 = positive(answers.vehiclePropertyTax);
  const line62 = byStatus(credits.motorVehicles, status) > 1 ? positive(answers.secondVehiclePropertyTax) : 0;
  const line63 = line60 + line61 + line62;
  const line64 = credits.propertyTaxMaximum;
  const line65 = Math.min(line63, line64);
  const phase = byStatus(credits.propertyTaxPhaseOut, status);
  const line66 = Math.min(10000, stepsOver(ctAgi, phase.over, phase.step) * credits.propertyTaxReductionBpPerStep) / 10000;
  const line67 = Math.round(line65 * line66);
  const line68 = line65 - line67;
  return { 60: line60, 61: line61, 62: line62, 63: line63, 64: line64, 65: line65, 66: line66, 67: line67, 68: line68 };
}

function otherStateCredit(filing, line51, line55) {
  const columns = [];
  for (const other of filing.otherStates || []) {
    const income = Math.max(0, Math.min(line51, sourcedAgi(other.sourced || {})));
    const share = ratio(income, line51, { places: 4 });
    const apportioned = Math.round(line55 * share);
    const paid = positive(other.tax);
    columns.push({ state: other.state, 53: income, 54: share, 56: apportioned, 57: paid, 58: Math.min(apportioned, paid) });
  }
  const total = Math.min(line55, sum(columns, (item) => item[58]));
  return { columns, total };
}

function useTaxCheck(answers, checks, line) {
  if (answers.useTax === undefined) checks.push(check('warning', 'CT_USE_TAX', `Connecticut requires an entry on the use tax line (Line ${line}); enter 0 if you owe none, or the return is not a filed use tax return.`, 'Answer the use tax question (0 if none).'));
}

function resident(ctx, filing, rule, mods, credits) {
  const answers = filing.answers;
  const checks = [];
  const m = modifications(ctx, filing, mods);
  const line1 = ctx.income.agi;
  const line2 = m.additions;
  const line3 = line1 + line2;
  const line4 = m.subtractions;
  const line5 = line3 - line4;
  const schedule = connecticutTax(line5, ctx.filingStatus, rule);
  const line6 = schedule[10];
  const property = propertyTaxCredit(ctx, filing, credits, line5);
  const line51 = line5;
  const line55 = Math.max(0, line6 - property[68]);
  const other = otherStateCredit(filing, line51, line55);
  const line7 = other.total;
  const line8 = Math.max(0, line6 - line7);
  const line9 = 0;
  const line10 = line8 + line9;
  const line11 = line10 > 0 ? property[68] : 0;
  const line12 = Math.max(0, line10 - line11);
  const line13 = 0;
  const line14 = Math.max(0, line12 - line13);
  const line15 = positive(answers.useTax);
  const line16 = line14 + line15;
  const federalEic = whole(ctx.federal.lines['27']);
  const hasChild = Number(ctx.federal.schedules?.EIC?.qualifyingChildren || 0) > 0;
  const eitcBase = rateOf(federalEic, credits.eitcBasisPoints);
  const eitcBonus = federalEic > 0 && hasChild ? credits.eitcChildBonus : 0;
  const line20a = eitcBase + eitcBonus;
  useTaxCheck(answers, checks, 15);
  if (other.columns.length) checks.push(check('info', 'CT_SCHEDULE_2', 'The credit for income tax paid to another state uses that state\'s tax as worked out on its nonresident return and the income it taxed. Keep a copy of that return; DRS can ask for it.'));
  if (ctx.filingStatus === 'qss') checks.push(check('info', 'CT_QSS_PENSION_TABLE', 'The Pension and Annuity Phase-Out Table has columns only for married filing jointly and for single, separate or head of household; MyCA uses the joint column for a qualifying surviving spouse, as the exemption and tax tables do.'));
  if (ctx.filingStatus === 'mfs' && ctx.income.socialSecurityTaxable > 0 && answers.livedWithSpouse === undefined) checks.push(check('warning', 'CT_MFS_LIVED_WITH_SPOUSE', 'The Social Security adjustment for married filing separately depends on whether you lived with your spouse at any time in the year.', 'Answer the lived-with-spouse question.'));
  if (federalEic === 0 && ctx.federal.schedules?.EIC?.notAllowed) checks.push(check('info', 'CT_EITC_NONE', 'No federal earned income credit, so no Connecticut EITC is claimed. Filers with an ITIN or aged 18 to 24 who get no federal EIC can still qualify for the CT EITC; MyCA does not work that out.'));
  if (line11 > 0) checks.push(check('info', 'CT_PROPERTY_TAX_RECORDS', 'Schedule 3 must list the town, the property and the dates paid for each property tax claimed; only tax paid in the year on your primary residence or vehicle counts.'));
  const schedule1 = lineTable({ 31: m.add31, 32: m.add32, 38: m.additions, 39: m.sub39, 40: m.sub40, 41: m.sub41, 42: m.sub42, 43: m.sub43, 44: m.sub44, 45: m.sub45, 48: m.sub48, '48b': m.sub48b, '48d': m.sub48d, 50: m.subtractions });
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line16, 18: filing.payments.withheld, 19: filing.payments.estimated, 20: filing.payments.extension, '20a': line20a });
  const nonrefundable = [...(line7 ? [{ code: 'CT_SCHEDULE_2', label: 'Income tax paid to qualifying jurisdictions', amount: line7 }] : []), ...(line11 ? [{ code: 'CT_PROPERTY_TAX', label: 'Property tax credit', amount: Math.min(line11, line10) }] : [])];
  return {
    form: 'CT-1040',
    lines,
    schedules: {
      1: schedule1,
      'Tax Calculation Schedule': lineTable(schedule),
      'Pension and Annuity Worksheet': lineTable({ 1: line1, 2: m.pensionBase, 3: m.factorBp / 10000, 4: m.sub48b }),
      ...(other.columns.length ? { 2: { 51: line51, 55: line55, columns: other.columns, 59: line7 } } : {}),
      ...(property[63] ? { 3: lineTable(property) } : {}),
      ...(line20a ? { 'CT-EITC': lineTable({ federalEic, 9: eitcBase, '15a': eitcBonus, 16: line20a }) } : {}),
    },
    stateIncome: line5,
    taxableIncome: schedule[3],
    taxBeforeCredits: line6,
    nonrefundableCredits: nonrefundable,
    otherStateCredit: line7,
    otherTaxes: line15 ? [{ code: 'CT_USE_TAX', label: 'Individual use tax', amount: line15 }] : [],
    totalTax: line16,
    refundableCredits: line20a ? [{ code: 'CT_EITC', label: 'Connecticut earned income tax credit', amount: line20a }] : [],
    checks,
  };
}

function nonresidentOrPartYear(ctx, filing, rule, mods) {
  const answers = filing.answers;
  const checks = [];
  const m = modifications(ctx, filing, mods);
  const line1 = ctx.income.agi;
  const line2 = m.additions;
  const line3 = line1 + line2;
  const line4 = m.subtractions;
  const line5 = line3 - line4;
  const partYear = filing.residency === 'part-year';
  const sourcedModifications = partYear ? Math.round((m.additions - m.subtractions) * filing.share) : -Math.min(whole(filing.sourced.stateRefundTaxable), m.sub42) - Math.min(whole(filing.sourced.usObligationInterest), m.sub39);
  const line6 = Math.max(0, sourcedAgi(filing.sourced) + sourcedModifications);
  const line7 = Math.max(line5, line6);
  const schedule = line7 > 0 ? connecticutTax(line7, ctx.filingStatus, rule) : connecticutTax(0, ctx.filingStatus, rule);
  const line8 = line7 > 0 ? schedule[10] : 0;
  const line9 = line6 >= line5 ? 1 : ratio(line6, line5, { places: 4 });
  const line10 = Math.round(line8 * line9);
  const line11 = 0;
  const line12 = Math.max(0, line10 - line11);
  const line13 = 0;
  const line14 = line12 + line13;
  const line15 = 0;
  const line16 = Math.max(0, line14 - line15);
  const line17 = positive(answers.useTax);
  const line18 = line16 + line17;
  useTaxCheck(answers, checks, 17);
  checks.push(check('warning', 'CT_SCHEDULE_CT_SI', partYear ? 'Line 6 (Schedule CT-SI) is your income for the months you lived in Connecticut plus Connecticut-source income for the rest of the year; MyCA used the amounts given for the move dates and spread the Connecticut modifications by the days you lived there.' : 'Line 6 (Schedule CT-SI) counts only Connecticut-source income: wages for work done in Connecticut and income from Connecticut property or business. Check the amounts given for Connecticut.', 'Give the Connecticut-source amounts in your state residency answers.'));
  if (partYear && (filing.otherStates || []).length === 0) checks.push(check('info', 'CT_PART_YEAR_SCHEDULE_2', 'A part-year resident can claim credit on Schedule 2 for tax paid to another state on income earned while a Connecticut resident; MyCA does not work this out yet.'));
  const schedule1 = lineTable({ 33: m.add31, 34: m.add32, 40: m.additions, 41: m.sub39, 42: m.sub40, 43: m.sub41, 44: m.sub42, 45: m.sub43, 46: m.sub44, 47: m.sub45, 50: m.sub48, '50b': m.sub48b, '50d': m.sub48d, 52: m.subtractions });
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line18, 20: filing.payments.withheld, 21: filing.payments.estimated, 22: filing.payments.extension });
  return {
    form: 'CT-1040NR/PY',
    lines,
    schedules: { 1: schedule1, 'CT-SI': lineTable({ 30: line6 }), 'Tax Calculation Schedule': lineTable(schedule) },
    stateIncome: line6,
    taxableIncome: schedule[3],
    taxBeforeCredits: line10,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: line17 ? [{ code: 'CT_USE_TAX', label: 'Individual use tax', amount: line17 }] : [],
    totalTax: line18,
    refundableCredits: [],
    checks,
  };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const mods = reader.read('modifications');
  const credits = reader.read('credits');
  if (!rule || !mods || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Connecticut figures for ${ctx.taxYear}.` };
  if (filing.residency === 'full-year') return resident(ctx, filing, rule, mods, credits);
  return nonresidentOrPartYear(ctx, filing, rule, mods);
}

const amount = (id, text, help) => Object.freeze({ id, kind: 'amount', text, help });

export const STATE = Object.freeze({
  code: 'CT',
  name: 'Connecticut',
  built: true,
  forms: Object.freeze({ resident: 'CT-1040', partYear: 'CT-1040NR/PY', nonresident: 'CT-1040NR/PY' }),
  questions: Object.freeze([
    amount('ctMuniInterest', 'Connecticut state or municipal bond interest included in your federal tax-exempt interest (not from mutual funds)', 'Only interest on bonds of other states is added back on Schedule 1 Line 31.'),
    amount('ctMuniFundDividends', 'Part of your mutual fund exempt-interest dividends that came from Connecticut obligations', 'Your fund\'s year-end statement gives the Connecticut percentage; the rest is added back on Line 32.'),
    amount('usGovernmentFundDividends', 'Mutual fund dividends derived from U.S. government obligations (Treasury) that are in your federal dividends', 'Subtracted on Schedule 1 Line 40 when the fund qualifies; the fund statement gives the amount.'),
    amount('railroadRetirement', 'Tier 2 railroad retirement and supplemental annuities included in your federal taxable pensions', 'Subtracted in full on Schedule 1 Line 43.'),
    amount('militaryRetirement', 'U.S. military retirement pay included in your federal taxable pensions', 'Subtracted in full on Schedule 1 Line 44.'),
    amount('teachersRetirement', 'Connecticut Teachers\' Retirement System pay included in your federal taxable pensions', '50% is subtracted on Schedule 1 Line 45; it is left out of the pension subtraction on Line 48b.'),
    amount('chetContributions', 'Contributions made in the year to Connecticut Higher Education Trust (CHET) accounts', 'Subtracted up to $5,000, or $10,000 filing jointly.'),
    amount('ableContributions', 'Contributions made in the year to ABLE accounts', 'Subtracted up to $5,000, or $10,000 filing jointly.'),
    amount('residencePropertyTax', 'Property tax paid in the year to a Connecticut town on your primary residence', 'Residents only; gives the property tax credit of up to $300 on Schedule 3.'),
    amount('vehiclePropertyTax', 'Property tax paid in the year to a Connecticut town on your car (first vehicle)', 'Residents only; part of the same $300 property tax credit.'),
    amount('secondVehiclePropertyTax', 'Property tax paid on a second car (married filing jointly or qualifying surviving spouse only)', 'Only one vehicle counts on other returns.'),
    amount('useTax', 'Connecticut use tax owed on online or out-of-state purchases with no Connecticut sales tax', 'Enter 0 if none; the line cannot be blank.'),
    Object.freeze({ id: 'livedWithSpouse', kind: 'yesno', text: 'Married filing separately: did you live with your spouse at any time in the year?', help: 'Changes the Social Security adjustment worksheet.' }),
  ]),
  notCovered: Object.freeze([
    'Connecticut alternative minimum tax (Form CT-6251)',
    'Schedule CT-IT credits (angel investor, ABLE, stillborn child, CHET employer credits and others) and the pass-through entity tax credit (Schedule CT-PE)',
    'Fiduciary adjustments, lump-sum distribution additions, bonus depreciation and section 179 modifications, and gains or losses on Connecticut bonds',
    'Tier 1 railroad retirement benefits reported as Social Security are treated with the Social Security adjustment, not on Line 43',
    'The Connecticut EITC for filers who get no federal EIC (ITIN filers, ages 18 to 24) and the EITC for part-year residents',
    'Schedule 2 credit for part-year residents, and the addition of net losses from other jurisdictions to Line 51',
    'CHET contribution carryforwards from earlier years',
    'Interest on underpayment of estimated tax (Form CT-2210)',
  ]),
  compute,
});
