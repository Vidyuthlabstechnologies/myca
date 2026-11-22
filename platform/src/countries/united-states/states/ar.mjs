import { whole, positive, rateOf, ratio, check, byStatus, lineTable, sum } from '../state-kit.mjs';

export function arkansasRegularTax(netIncome, rule) {
  const amount = positive(netIncome);
  if (amount > rule.tableMax) return Math.round(rule.over.base + ((amount - rule.over.above) * rule.over.rateBp) / 10000);
  const width = rule.rowWidth;
  const lastPlain = rule.shiftedRowsFrom - 1;
  let low;
  let high;
  if (amount <= lastPlain) {
    low = Math.min(Math.floor(amount / width) * width, lastPlain - width);
    high = low === lastPlain - width ? rule.shiftedRowsFrom : low + width;
  } else {
    low = Math.floor((amount - 1) / width) * width + 1;
    high = low + width;
  }
  const mid = Math.floor((low + high) / 2);
  const band = rule.bands.filter((item) => item.from <= mid).pop();
  const units = mid * band.rateBp - band.minusCents * 100;
  return units > 0 ? Math.floor((units + 5000) / 10000) : 0;
}

export function arkansasLowIncomeTax(agi, table) {
  const amount = whole(agi);
  if (amount <= table.zeroThrough) return 0;
  if (amount <= table.firstRowTo) return table.taxes[0];
  if (amount > table.max) return null;
  return table.taxes[Math.ceil((amount - table.firstRowTo) / 100)];
}

const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function retirementSplit(ctx, checks) {
  const filerAge = (owner) => (owner === 'spouse' ? ctx.filers[1]?.age : ctx.filers[0]?.age) ?? null;
  const people = { taxpayer: { gross: 0, qualified: 0 }, spouse: { gross: 0, qualified: 0 } };
  let nonQualified = 0;
  for (const form of ctx.forms.filter((item) => item.kind === '1099-R')) {
    const owner = form.owner === 'spouse' && ctx.filingStatus === 'mfj' ? 'spouse' : 'taxpayer';
    const code = String(form.fields?.distributionCode || '').toUpperCase();
    const taxable = taxableOf(form);
    const ira = Boolean(form.fields?.iraSepSimple);
    const age = filerAge(owner);
    if (ira && !code && taxable) checks.push(check('warning', 'AR_IRA_CODE_MISSING', 'An IRA Form 1099-R has no distribution code; MyCA treated it as qualified for the $6,000 exemption only if the owner is 60 or older.', 'Add the box 7 distribution code to the 1099-R.'));
    const qualified = !ira || /[347G]/.test(code) || (!code && age !== null && age >= 60);
    if (qualified) {
      people[owner].gross += positive(form.fields?.grossDistribution);
      people[owner].qualified += taxable;
    } else {
      nonQualified += taxable;
    }
  }
  return { people, nonQualified };
}

function capitalGain(ctx, exclusions) {
  const scheduleD = ctx.federal.schedules?.D;
  const longTerm = scheduleD ? whole(scheduleD['15']) : whole(ctx.income.capitalGain);
  const shortTerm = scheduleD ? whole(scheduleD['7']) : 0;
  const line4 = Math.min(0, shortTerm);
  const line7a = longTerm + line4;
  const line7b = Math.min(line7a, exclusions.gainCap);
  const line8 = line7a > 0 ? rateOf(line7b, exclusions.longTermGainShareBp) : line7a;
  const line9 = Math.max(0, shortTerm);
  const limit = byStatus(exclusions.lossLimit, ctx.filingStatus === 'mfs' ? 'mfs' : 'other');
  const line12 = Math.max(-limit, line8 + line9);
  return lineTable({ 1: longTerm, 3: longTerm, 4: line4, 6: line4, '7a': line7a, '7b': line7b, 8: line8, 9: line9, 11: line9, 12: line12 });
}

function incomeLines(ctx, filing, rules, useExclusions, checks) {
  const { exclusions } = rules;
  const income = ctx.income;
  const answers = filing.answers;
  const schedule1 = ctx.federal.schedules?.[1] || {};
  const munis = answers.nonArkansasMunicipalInterest !== undefined ? positive(answers.nonArkansasMunicipalInterest) : positive(income.taxExemptInterest);
  const militaryPay = useExclusions ? Math.min(positive(answers.militaryPay), positive(income.wages)) : 0;
  const retirement = retirementSplit(ctx, checks);
  const military = { taxpayer: useExclusions ? positive(answers.militaryRetirementTaxpayer) : 0, spouse: useExclusions && ctx.filingStatus === 'mfj' ? positive(answers.militaryRetirementSpouse) : 0 };
  const person = (owner) => {
    const qualified = retirement.people[owner].qualified;
    const afterMilitary = Math.max(0, qualified - military[owner]);
    const exemption = useExclusions ? Math.min(afterMilitary, Math.max(0, exclusions.retirementPerPerson - military[owner])) : 0;
    return { gross: retirement.people[owner].gross, taxable: qualified, military: military[owner], exemption, line: afterMilitary - exemption };
  };
  const taxpayer = person('taxpayer');
  const spouse = person('spouse');
  const scheduleD = capitalGain(ctx, exclusions);
  const lines = {
    8: positive(income.wages) - militaryPay,
    9: militaryPay,
    10: Math.max(0, whole(income.taxableInterest) - positive(income.usObligationInterest)) + munis,
    11: whole(income.ordinaryDividends),
    12: 0,
    13: whole(income.businessIncome),
    14: scheduleD['12'],
    15: 0,
    16: retirement.nonQualified,
    '18A': taxpayer.line,
    '18B': spouse.line,
    19: whole(schedule1['5']),
    20: 0,
    21: whole(income.unemployment),
    22: whole(income.otherIncome),
  };
  const line23 = lines[8] + lines[10] + lines[11] + lines[12] + lines[13] + lines[14] + lines[15] + lines[16] + lines['18A'] + lines['18B'] + lines[19] + lines[20] + lines[21] + lines[22];
  const items = income.adjustmentItems;
  const adjustments = lineTable({ ira: items.ira, hsa: items.hsa, studentLoan: items.studentLoan, selfEmployedHealth: items.seHealth, selfEmployedRetirement: items.seRetirement, earlyWithdrawal: items.earlyWithdrawal });
  const line24 = Object.values(adjustments).reduce((total, value) => total + whole(value), 0);
  const exclusionsUsed = militaryPay > 0 || taxpayer.military > 0 || spouse.military > 0 || taxpayer.exemption > 0 || spouse.exemption > 0;
  return { lines: { ...lines, 17: taxpayer.military + spouse.military, 23: line23, 24: line24, 25: line23 - line24 }, scheduleD, adjustments, taxpayer, spouse, munis, exclusionsUsed };
}

function lowIncomeTable(ctx, tables) {
  const dependents = ctx.dependents.filter((item) => !item.bornAfterYear).length;
  if (ctx.filingStatus === 'single') return { key: 'single', table: tables.single };
  if (ctx.filingStatus === 'hoh' || ctx.filingStatus === 'qss') return dependents >= 2 ? { key: 'hohTwoOrMoreDependents', table: tables.hohTwoOrMoreDependents } : { key: 'hohUpToOneDependent', table: tables.hohUpToOneDependent };
  if (ctx.filingStatus === 'mfj') return dependents >= 2 ? { key: 'mfjTwoOrMoreDependents', table: tables.mfjTwoOrMoreDependents } : { key: 'mfjUpToOneDependent', table: tables.mfjUpToOneDependent };
  return null;
}

function itemizedAr3(ctx, agi) {
  const parts = ctx.itemized;
  const line1 = positive(parts.medicalPaid);
  const line3 = rateOf(Math.max(0, agi), 1000);
  const line4 = Math.max(0, line1 - line3);
  const line7 = positive(parts.realEstateTaxes) + positive(parts.personalPropertyTaxes);
  const line12 = positive(parts.mortgageInterest);
  const line17 = positive(parts.charityCash) + positive(parts.charityNonCash);
  return lineTable({ 1: line1, 2: agi, 3: line3, 4: line4, 5: positive(parts.realEstateTaxes), 6: positive(parts.personalPropertyTaxes), 7: line7, 8: line12, 12: line12, 13: positive(parts.charityCash), 15: positive(parts.charityNonCash), 17: line17, 30: line4 + line7 + line12 + line17 });
}

function personalCredits(ctx, answers, income, perCredit) {
  const filers = ctx.filingStatus === 'mfj' ? ctx.filers.slice(0, 2) : ctx.filers.slice(0, 1);
  const exemptions = [income.taxpayer, income.spouse];
  let boxes = filers.length;
  if (ctx.filingStatus === 'hoh' || ctx.filingStatus === 'qss') boxes += 1;
  filers.forEach((filer, index) => {
    const senior = filer.age !== null && filer.age >= 65;
    if (senior) boxes += 1;
    if (senior && !(exemptions[index].exemption > 0)) boxes += 1;
    if (filer.blind) boxes += 1;
  });
  boxes += Math.min(positive(answers.deafFilers), filers.length);
  const dependents = ctx.dependents.filter((item) => !item.bornAfterYear).length;
  return { boxes, a: boxes * perCredit, dependents, b: dependents * perCredit, c: (boxes + dependents) * perCredit };
}

function childCareCredit(ctx, rule) {
  const form = ctx.federal.schedules?.['2441'];
  if (!form) return null;
  const line6 = whole(form['6']);
  const line7 = whole(ctx.income.agi);
  const band = rule.decimals.find((item) => line7 <= item.upTo);
  const bp = band ? band.bp : rule.lowestBp;
  const line9 = rateOf(line6, bp);
  const line10 = rateOf(line9, rule.shareBp);
  return lineTable({ 3: whole(form['3']), 4: whole(form['4']), 5: whole(form['5']), 6: line6, 7: line7, 8: bp / 10000, 9: line9, 10: line10 });
}

function qualifiedIndividualsCredit(netIncome, rule, status) {
  const amount = whole(netIncome);
  let credit = 0;
  if (amount <= rule.fullThrough) credit = rule.full;
  else if (amount < rule.zeroFrom) credit = Math.max(0, rule.full - rule.stepPerHundred * Math.ceil((amount - rule.fullThrough) / 100));
  return status === 'mfj' ? credit * 2 : credit;
}

function variant(ctx, filing, rules, { useExclusions, lowIncome }, checks) {
  const { taxRule, standard, personal, tables, credits, exclusions } = rules;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const income = incomeLines(ctx, filing, rules, useExclusions, checks);
  const line25 = income.lines[25];
  let table = null;
  if (lowIncome) {
    const chosen = lowIncomeTable(ctx, tables);
    if (!chosen) return null;
    if (Math.max(line25, whole(ctx.income.agi)) > chosen.table.max) return null;
    table = chosen;
  }
  const ar3 = itemizedAr3(ctx, line25);
  const standardAmount = byStatus(standard, status);
  const itemize = !lowIncome && ar3['30'] > standardAmount;
  const line27 = lowIncome ? 0 : itemize ? ar3['30'] : Math.min(standardAmount, Math.max(0, line25));
  const taxOn = (agi) => {
    const net = Math.max(0, agi - line27);
    return { net, tax: lowIncome ? arkansasLowIncomeTax(agi, table.table) ?? arkansasRegularTax(net, taxRule) : arkansasRegularTax(net, taxRule) };
  };
  const { net: line28, tax: line29 } = taxOn(line25);
  const line30 = line29;
  const line31 = 0;
  const line32 = rateOf(whole(ctx.federal.schedules?.[2]?.['8']), exclusions.earlyWithdrawalTaxBp);
  const line33 = line30 + line31 + line32;
  const credit7 = personalCredits(ctx, filing.answers, income, personal.perCredit);
  const line34 = credit7.c;
  const care = childCareCredit(ctx, credits.childCare);
  const line35 = care ? care['10'] : 0;
  let otherState = 0;
  let otherStateSheet = null;
  if (resident && filing.otherStates.length) {
    const removed = Math.min(Math.max(0, line25), sum(filing.otherStates, (item) => positive(item.income)));
    const without = taxOn(line25 - removed).tax + line32;
    const paid = sum(filing.otherStates, (item) => positive(item.tax));
    otherState = Math.min(paid, Math.max(0, line33 - without));
    otherStateSheet = lineTable({ step1: line33, otherStateIncome: removed, step2: without, step3: line33 - without, taxPaid: paid, 2: otherState });
  }
  const qualified = qualifiedIndividualsCredit(line28, credits.qualifiedIndividuals, status);
  const tc = lineTable({ 2: otherState, 6: qualified, total: otherState + qualified });
  const line36 = tc.total;
  const line37 = line34 + line35 + line36;
  const line38 = Math.max(0, line33 - line37);
  return { useExclusions, lowIncome, table, income, ar3, itemize, standardAmount, line27, line28, line29, line30, line31, line32, line33, credit7, line34, care, line35, otherState, otherStateSheet, tc, line36, line37, line38 };
}

function columnC(ctx, filing, chosen) {
  const given = filing.sourced;
  const income = ctx.income;
  const lines = chosen.income.lines;
  const share = (part, total) => (whole(total) !== 0 ? Math.max(0, Math.min(1, whole(part) / whole(total))) : 0);
  const retirementShare = share(whole(given.iraTaxable) + whole(given.pensionTaxable), whole(income.iraTaxable) + whole(income.pensionTaxable));
  const militaryPay = Math.min(lines[9], whole(given.wages));
  const c = {
    8: Math.max(0, whole(given.wages) - militaryPay),
    10: Math.max(0, whole(given.taxableInterest) - positive(given.usObligationInterest)) + (filing.residency === 'part-year' ? Math.round(chosen.income.munis * filing.share) : 0),
    11: whole(given.ordinaryDividends),
    13: whole(given.businessIncome),
    14: Math.round(lines[14] * share(given.capitalGain, income.capitalGain)),
    16: Math.round(lines[16] * retirementShare),
    18: Math.round((lines['18A'] + lines['18B']) * retirementShare),
    19: whole(filing.answers.arkansasRentalIncome),
    21: whole(given.unemployment),
    22: whole(given.otherIncome),
  };
  const line23 = Object.values(c).reduce((total, value) => total + value, 0);
  const line24 = Math.round(lines[24] * share(given.adjustments, income.adjustments));
  return lineTable({ ...c, 23: line23, 24: line24, 25: line23 - line24 });
}

function compute(ctx, filing, reader) {
  const rules = { taxRule: reader.read('income-tax'), standard: reader.read('standard-deduction'), personal: reader.read('personal-credit'), tables: reader.read('low-income-tables'), exclusions: reader.read('income-exclusions'), credits: reader.read('credits') };
  if (Object.values(rules).some((value) => !value)) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Arkansas figures for ${ctx.taxYear}.` };
  const checks = [];
  const answers = filing.answers;
  const resident = filing.residency === 'full-year';
  const regular = variant(ctx, filing, rules, { useExclusions: true, lowIncome: false }, checks);
  const candidates = [regular];
  const lowWith = variant(ctx, filing, rules, { useExclusions: true, lowIncome: true }, []);
  if (lowWith && !lowWith.income.exclusionsUsed) candidates.push(lowWith);
  if (regular.income.exclusionsUsed) {
    const lowWithout = variant(ctx, filing, rules, { useExclusions: false, lowIncome: true }, []);
    if (lowWithout) candidates.push(lowWithout);
  }
  const chosen = candidates.reduce((best, item) => (item.line38 < best.line38 ? item : best), regular);
  if (chosen.lowIncome) checks.push(check('info', 'AR_LOW_INCOME_TABLE', `The ${chosen.table.key} Low Income Tax Table gives less tax than the regular table; it already includes the standard deduction, and needs your income from all sources to be within its limit.${chosen.useExclusions ? '' : ' MyCA elected not to use the military and retirement exclusions so that the table can be used.'}`));
  if (answers.nonArkansasMunicipalInterest === undefined && ctx.income.taxExemptInterest > 0) checks.push(check('warning', 'AR_MUNICIPAL_INTEREST', 'All of your federally tax-exempt interest was counted as Arkansas interest income on line 10. Interest on Arkansas state and local bonds is exempt in Arkansas.', 'Answer the non-Arkansas municipal interest question (0 if none).'));
  if (ctx.filingStatus === 'mfs') checks.push(check('info', 'AR_MFS_DIFFERENT_RETURNS', 'MyCA prepares filing status 5, married filing separately on different returns. Filing status 4, both spouses on the same return in columns A and B, is not computed.'));
  if (chosen.otherStateSheet) checks.push(check('info', 'AR_OTHER_STATE_RETURN', 'Attach a signed copy of the other state\'s return to claim the other state tax credit on Form AR1000TC.'));
  if (filing.residency === 'part-year') checks.push(check('info', 'AR_PART_YEAR_OTHER_STATE', 'MyCA does not compute a credit for tax paid to another state on a part-year Arkansas return.'));
  const income = chosen.income;
  let line38C = 1;
  let line38D = chosen.line38;
  let colC = null;
  if (!resident) {
    colC = columnC(ctx, filing, chosen);
    line38C = colC['25'] <= 0 ? 0 : ratio(colC['25'], income.lines[25], { places: 6 });
    line38D = Math.round(chosen.line38 * line38C);
  }
  const lines = lineTable({
    '7A': chosen.credit7.a, '7B': chosen.credit7.b, '7C': chosen.credit7.c,
    ...income.lines,
    26: chosen.lowIncome ? 'low income table' : chosen.itemize ? 'itemized deductions' : 'standard deduction',
    27: chosen.line27, 28: chosen.line28, 29: chosen.line29, 30: chosen.line30, 31: chosen.line31, 32: chosen.line32, 33: chosen.line33,
    34: chosen.line34, 35: chosen.line35, 36: chosen.line36, 37: chosen.line37, 38: chosen.line38,
    ...(resident ? {} : { '38A': colC['25'], '38B': income.lines[25], '38C': line38C, '38D': line38D }),
    '39A': filing.payments.withheld, 40: filing.payments.estimated, 41: filing.payments.extension,
  });
  let left = chosen.line33;
  const take = (amount) => {
    const used = Math.min(amount, left);
    left -= used;
    return used;
  };
  const used34 = take(chosen.line34);
  const used35 = take(chosen.line35);
  const usedOther = take(chosen.otherState);
  const usedQualified = take(chosen.tc['6']);
  const scale = (value) => (resident ? value : Math.round(value * line38C));
  const nonrefundable = [
    ...(used34 ? [{ code: 'AR_PERSONAL', label: 'Personal tax credits', amount: scale(used34) }] : []),
    ...(used35 ? [{ code: 'AR_CHILD_CARE', label: 'Child care credit', amount: scale(used35) }] : []),
    ...(usedOther ? [{ code: 'AR_OTHER_STATE', label: 'Other state tax credit', amount: usedOther }] : []),
    ...(usedQualified ? [{ code: 'AR_QUALIFIED_INDIVIDUALS', label: 'Additional tax credit for qualified individuals', amount: scale(usedQualified) }] : []),
  ];
  return {
    form: resident ? 'AR1000F' : 'AR1000NR',
    lines,
    schedules: {
      'Personal tax credits': lineTable({ boxes: chosen.credit7.boxes, dependents: chosen.credit7.dependents }),
      ...(income.scheduleD['1'] || income.scheduleD['9'] || income.scheduleD['4'] ? { AR1000D: income.scheduleD } : {}),
      ...(income.lines[24] ? { AR1000ADJ: income.adjustments } : {}),
      ...(chosen.itemize ? { AR3: chosen.ar3 } : {}),
      ...(chosen.care ? { AR2441: chosen.care } : {}),
      ...(chosen.tc.total ? { AR1000TC: chosen.tc } : {}),
      ...(chosen.otherStateSheet ? { 'Other state tax credit worksheet': chosen.otherStateSheet } : {}),
      retirement: lineTable({ taxpayerGross: income.taxpayer.gross, taxpayerTaxable: income.taxpayer.taxable, taxpayerMilitary: income.taxpayer.military, taxpayerExemption: income.taxpayer.exemption, spouseGross: income.spouse.gross, spouseTaxable: income.spouse.taxable, spouseMilitary: income.spouse.military, spouseExemption: income.spouse.exemption }),
      taxTable: lineTable({ table: chosen.lowIncome ? chosen.table.key : 'regular', exclusionsUsed: chosen.useExclusions && income.exclusionsUsed, standardDeduction: chosen.standardAmount, itemized: chosen.ar3['30'], regularLine38: regular.line38 }),
      ...(colC ? { 'Column C': colC } : {}),
    },
    stateIncome: resident ? income.lines[25] : colC['25'],
    taxableIncome: chosen.line28,
    taxBeforeCredits: resident ? chosen.line33 : Math.round(chosen.line33 * line38C),
    nonrefundableCredits: nonrefundable,
    otherStateCredit: usedOther,
    otherTaxes: [],
    totalTax: line38D,
    refundableCredits: [],
    checks,
  };
}

const LABELS = Object.freeze({
  '7A': 'Personal tax credits for yourself and your spouse',
  '7B': 'Personal tax credits for dependents',
  '7C': 'Total personal tax credits',
  8: 'Wages, salaries, tips, etc.',
  9: 'Military service pay',
  10: 'Interest income',
  11: 'Dividend income',
  12: 'Alimony and separate maintenance',
  13: 'Business or professional income',
  14: 'Capital gain or loss (AR1000D)',
  15: 'Other gains or losses (federal Form 4797)',
  16: 'Taxable IRA, annuity and lump-sum distributions',
  17: 'Military retirement benefits',
  '18A': 'Employment-related pensions and qualified IRA: yourself',
  '18B': 'Employment-related pensions and qualified IRA: spouse',
  19: 'Rents, royalties, partnerships, estates and trusts',
  20: 'Farm income',
  21: 'Unemployment benefits',
  22: 'Other income and depreciation differences (AR-OI)',
  23: 'Total income',
  24: 'Adjustments to income (AR1000ADJ)',
  25: 'Adjusted gross income',
  26: 'Tax table used',
  27: 'Itemized or standard deduction',
  28: 'Net taxable income',
  29: 'Tax from the tax table',
  30: 'Total tax',
  31: 'Lump-sum distribution averaging (AR1000TD)',
  32: 'Additional tax on IRA and retirement plan withdrawals',
  33: 'Total tax before credits',
  34: 'Personal tax credits',
  35: 'Child care credit (AR2441)',
  36: 'Other credits (AR1000TC)',
  37: 'Total credits',
  38: 'Net tax',
  '38A': 'Adjusted gross income from Arkansas (column C)',
  '38B': 'Adjusted gross income from all sources',
  '38C': 'Arkansas percentage of income',
  '38D': 'Arkansas apportioned tax liability',
  '39A': 'Arkansas tax withheld from W-2s',
  40: 'Estimated tax paid',
  41: 'Payment made with extension',
});

export const STATE = Object.freeze({
  code: 'AR',
  name: 'Arkansas',
  built: true,
  forms: Object.freeze({ resident: 'AR1000F', partYear: 'AR1000NR', nonresident: 'AR1000NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'nonArkansasMunicipalInterest', when: Object.freeze({ has: ['taxExemptInterest'] }), kind: 'amount', text: 'Interest from bonds of states other than Arkansas and their local governments that was tax-exempt on your federal return', help: 'Taxable in Arkansas on line 10. Interest on Arkansas and U.S. obligations is exempt.' }),
    Object.freeze({ id: 'militaryPay', kind: 'amount', text: 'U.S. active-duty military pay included in your W-2 wages', help: 'Exempt; entered on line 9.' }),
    Object.freeze({ id: 'militaryRetirementTaxpayer', when: Object.freeze({ has: ['retirementIncome'] }), kind: 'amount', text: 'Your U.S. military retirement pay included in your 1099-R income', help: 'Exempt on line 17. It reduces the $6,000 retirement exemption.' }),
    Object.freeze({ id: 'militaryRetirementSpouse', when: Object.freeze({ filingStatus: ['mfj'], has: ['retirementIncome'] }), kind: 'amount', text: 'Your spouse\'s U.S. military retirement pay included in your 1099-R income', help: 'Exempt on line 17. It reduces the spouse\'s $6,000 retirement exemption.' }),
    Object.freeze({ id: 'deafFilers', kind: 'count', text: 'Number of filers on the return who were deaf on December 31', help: 'Each gives an additional $29 personal tax credit.' }),
    Object.freeze({ id: 'arkansasRentalIncome', when: Object.freeze({ residency: ['part-year', 'nonresident'] }), kind: 'amount', text: 'Rental, royalty, partnership, S corporation and trust income from Arkansas sources or received while an Arkansas resident (part-year and nonresident filers)', help: 'Line 19, column C of Form AR1000NR.' }),
  ]),
  labels: LABELS,
  notCovered: Object.freeze([
    'Filing status 4, married filing separately on the same return (columns A and B)',
    'Lump-sum distribution averaging (AR1000TD), other gains (Form 4797), farm income, alimony and the other income and depreciation differences on AR-OI, including net operating loss carryforwards',
    'Annuities that are not from an employment-related plan (all non-IRA 1099-R income is treated as eligible for the $6,000 exemption)',
    'AR1000ADJ adjustments other than IRA, HSA, student loan interest, self-employed health insurance, self-employed retirement plans and the early withdrawal penalty (tuition savings, Texarkana exemption, teacher classroom expenses and others)',
    'AR1000TC credits other than the other state tax credit and the additional tax credit for qualified individuals (developmental disabilities, political contribution, adoption, phenylketonuria, stillborn child, business incentive credits) and the early childhood program credit on line 43',
    'Credit for tax paid to another state on a part-year return',
    'Estimated tax penalty (AR2210), check-off contributions and Arkansas withholding shown on 1099-R forms (add it as other withholding in your state residency answers)',
  ]),
  compute,
});
