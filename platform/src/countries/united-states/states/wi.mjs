import { whole, positive, sum, bracketTax, rateOf, check, ratio, lineTable, yesNo } from '../state-kit.mjs';

const money = (value) => `$${whole(value).toLocaleString('en-US')}`;
const taxStatus = (status) => (status === 'mfj' ? 'mfj' : status === 'mfs' ? 'mfs' : 'single');
const deductionStatus = (status) => (status === 'qss' ? 'hoh' : status);

function rawTax(amount, bands) {
  let tax = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const low = bands[index].overCents / 100;
    const high = index + 1 < bands.length ? bands[index + 1].overCents / 100 : Infinity;
    if (amount > low) tax += ((Math.min(amount, high) - low) * bands[index].rateBp) / 10000;
  }
  return tax;
}

export function wisconsinTax(taxable, status, rule) {
  const amount = positive(taxable);
  if (!amount) return 0;
  const bands = rule.brackets[taxStatus(status)];
  if (amount >= rule.tableBelow) return bracketTax(amount, bands);
  const middle = amount < 20 ? 10 : amount < 40 ? 30 : amount < 100 ? 70 : Math.floor(amount / 100) * 100 + 50;
  return Math.round(rawTax(middle, bands));
}

function slidingStandard(income, status, rule) {
  const key = deductionStatus(status);
  const row = rule.standard[key] || rule.standard.single;
  if (key === 'hoh' && income > row.singleFrom) return slidingStandard(income, 'single', rule);
  if (income <= row.start) return row.base;
  return Math.max(0, row.base - row.rate * (income - row.start));
}

export function wisconsinStandardDeduction(income, status, rule) {
  const amount = whole(income);
  const table = rule.standardTable;
  if (amount < table.firstRowEnd) return slidingStandard(0, status, rule);
  if (amount >= table.lastRowEnd) return Math.round(slidingStandard(amount, status, rule));
  const secondRowEnd = Math.ceil(table.firstRowEnd / table.rowStep) * table.rowStep;
  const low = amount < secondRowEnd ? table.firstRowEnd : Math.floor(amount / table.rowStep) * table.rowStep;
  const high = amount < secondRowEnd ? secondRowEnd : Math.min(low + table.rowStep, table.lastRowEnd);
  return Math.round(slidingStandard((low + high) / 2, status, rule));
}

function earnedIncome(ctx) {
  return Math.max(0, ctx.income.wages + Math.max(0, ctx.income.businessIncome - ctx.income.adjustmentItems.seTaxDeduction));
}

function standardDeduction(ctx, income, rule) {
  const table = wisconsinStandardDeduction(income, ctx.filingStatus, rule);
  const dependent = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  if (!dependent) return { amount: table, table, dependent: false };
  const line3 = Math.max(rule.dependentStandard.minimum, earnedIncome(ctx) + rule.dependentStandard.earnedAdd);
  return { amount: Math.min(line3, table), table, dependent: true, worksheet: lineTable({ 1: earnedIncome(ctx), 2: rule.dependentStandard.earnedAdd, 3: line3, 4: table, 5: Math.min(line3, table) }) };
}

function exemptions(ctx, rule) {
  const allowed = ctx.filers.filter((item) => !item.canBeClaimedAsDependent);
  const personal = allowed.length + ctx.dependents.length;
  const senior = allowed.filter((item) => item.age !== null && item.age >= 65).length;
  const a = personal * rule.exemption.personal;
  const b = senior * rule.exemption.senior;
  return { personal, senior, a, b, c: a + b };
}

function unemploymentSubtraction(ctx, fagi, rule, answers) {
  const income = ctx.income;
  const line1 = income.unemployment;
  if (!line1) return { amount: 0, worksheet: null };
  const status = ctx.filingStatus;
  const base = status === 'mfj' ? rule.unemployment.mfj : status === 'mfs' ? (yesNo(answers.mfsLivedApart) ? rule.unemployment.mfsApart : rule.unemployment.mfsTogether) : rule.unemployment.single;
  const line6 = base + income.socialSecurityTaxable + income.stateRefundTaxable;
  const line7 = Math.max(0, fagi - line6);
  const line8 = Math.round(line7 / 2);
  const line9 = line7 > 0 ? Math.min(line1, line8) : 0;
  const line10 = line1 - line9;
  return { amount: line10, worksheet: lineTable({ 1: line1, 2: fagi, 3: base, 4: income.socialSecurityTaxable, 5: income.stateRefundTaxable, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10 }) };
}

function capitalGainExclusion(ctx, rule, scale = 1) {
  const d = ctx.federal.schedules?.D;
  if (d) {
    const shortTerm = whole(d['7']);
    const longTerm = whole(d['15']);
    const line18 = Math.round((shortTerm + longTerm) * scale);
    if (line18 <= 0) return { amount: 0, lines: null };
    const line19 = Math.max(0, Math.min(Math.round(longTerm * scale), line18));
    const line20 = rateOf(line19, rule.capitalGainExclusionBp);
    return { amount: line20, lines: lineTable({ 8: Math.round(shortTerm * scale), 17: Math.round(longTerm * scale), 18: line18, 19: line19, 20: line20, 26: line20, 27: line18 - line20 }) };
  }
  const distributions = Math.round(Math.min(ctx.income.capitalGainDistributions, Math.max(0, ctx.income.capitalGain)) * scale);
  if (distributions <= 0) return { amount: 0, lines: null };
  return { amount: rateOf(distributions, rule.capitalGainExclusionBp), lines: null };
}

function retirementPeople(ctx, minAge) {
  const people = ctx.filingStatus === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer');
  return people.filter((item) => item.age !== null && item.age >= minAge).length;
}

function itemizedCredit(ctx, fagi, standard, credits) {
  const it = ctx.itemized;
  const line1 = Math.max(0, it.medicalPaid - rateOf(Math.max(0, fagi), credits.itemizedCredit.medicalFloorBp));
  const line2 = it.mortgageInterest;
  const line3 = it.charityCash + it.charityNonCash;
  const line5 = line1 + line2 + line3;
  const line7 = Math.max(0, line5 - standard);
  const line9 = rateOf(line7, credits.itemizedCredit.rateBp);
  return { amount: line9, lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: 0, 5: line5, 6: standard, 7: line7, 8: 0.05, 9: line9 }) };
}

function renterCredit(rent, heatBp, credits) {
  const amount = positive(rent);
  if (amount < 1) return 0;
  const step = credits.schoolPropertyTax.rentRowStep;
  const low = amount < step ? 1 : Math.floor(amount / step) * step;
  const twice = low + (amount < step ? step : low + step);
  return Math.min(credits.schoolPropertyTax.max, Math.round((twice * credits.schoolPropertyTax.rateBp * heatBp) / 200000000));
}

function homeownerCredit(tax, credits) {
  const amount = positive(tax);
  if (amount < 1) return 0;
  const step = credits.schoolPropertyTax.propertyRowStep;
  const low = amount < step ? 1 : Math.floor(amount / step) * step;
  const twice = low + (amount < step ? step : low + step);
  return Math.min(credits.schoolPropertyTax.max, Math.round((twice * credits.schoolPropertyTax.rateBp) / 20000));
}

function schoolPropertyTaxCredit(ctx, answers, credits, checks) {
  const withHeat = positive(answers.rentHeatIncluded);
  const withoutHeat = positive(answers.rentHeatNotIncluded);
  const given = answers.propertyTaxesPaid !== undefined && answers.propertyTaxesPaid !== null && answers.propertyTaxesPaid !== '';
  const propertyTax = given ? positive(answers.propertyTaxesPaid) : ctx.itemized.realEstateTaxes;
  if (!given && propertyTax > 0) checks.push(check('info', 'WI_SCHOOL_CREDIT_PROPERTY_TAX', `The homeowner's school property tax credit uses the ${money(propertyTax)} of real estate taxes on your federal return; only property taxes on your Wisconsin home count.`, 'Give the property taxes paid on your home in your Wisconsin answers if they differ.'));
  const rent = renterCredit(withHeat, credits.schoolPropertyTax.heatIncludedBp, credits) + renterCredit(withoutHeat, credits.schoolPropertyTax.heatNotIncludedBp, credits);
  const owner = homeownerCredit(propertyTax, credits);
  const separate = ctx.filingStatus === 'mfs' || (ctx.filingStatus === 'hoh' && yesNo(answers.hohMarried));
  const cap = separate ? credits.schoolPropertyTax.maxSeparate : credits.schoolPropertyTax.max;
  const rentAllowed = Math.min(rent, cap);
  const ownerAllowed = Math.min(owner, cap - rentAllowed);
  return { withHeat, withoutHeat, propertyTax, rent: rentAllowed, owner: ownerAllowed, total: rentAllowed + ownerAllowed };
}

function selfEmploymentByOwner(ctx) {
  const list = ctx.federal.schedules?.C || [];
  const out = { taxpayer: 0, spouse: 0 };
  for (const item of list) out[item.owner === 'spouse' ? 'spouse' : 'taxpayer'] += whole(item.lines?.['31']);
  if (!list.length && ctx.income.businessIncome) out.taxpayer = ctx.income.businessIncome;
  return out;
}

function marriedCoupleCredit(ctx, answers, credits, wagesOf) {
  if (ctx.filingStatus !== 'mfj') return null;
  const se = selfEmploymentByOwner(ctx);
  const spouseAdjust = Math.min(positive(answers.spouseIraSepDeduction), ctx.income.adjustmentItems.ira + ctx.income.adjustmentItems.seRetirement);
  const adjust = { taxpayer: ctx.income.adjustmentItems.ira + ctx.income.adjustmentItems.seRetirement - spouseAdjust, spouse: spouseAdjust };
  const col = (role) => {
    const line1 = wagesOf(role);
    const line2 = se[role];
    const line3 = line1 + line2;
    const line4 = adjust[role];
    return { 1: line1, 2: line2, 3: line3, 4: line4, 5: Math.max(0, line3 - line4) };
  };
  const a = col('taxpayer');
  const b = col('spouse');
  const line6 = Math.min(a[5], b[5], credits.marriedCouple.cap);
  const line8 = rateOf(line6, credits.marriedCouple.rateBp);
  return { amount: line8, lines: lineTable({ A1: a[1], B1: b[1], A2: a[2], B2: b[2], A3: a[3], B3: b[3], A4: a[4], B4: b[4], A5: a[5], B5: b[5], 6: line6, 7: 0.03, 8: line8 }) };
}

const NO_CREDIT_WAGE_STATES = new Set(['IL', 'IN', 'KY', 'MI']);
const NO_LIMIT_STATES = new Set(['MN', 'IA', 'IL', 'MI']);

function otherStateCredit(filing, wisconsinIncome, netTaxBefore, checks) {
  let total = 0;
  const schedules = [];
  for (const other of filing.otherStates || []) {
    if (NO_CREDIT_WAGE_STATES.has(other.state)) {
      checks.push(check('warning', 'WI_OS_RECIPROCAL_STATE', `No Wisconsin credit is allowed for ${other.state} tax on wages earned there; file a ${other.state} return to get that withholding back. MyCA claimed no credit for ${other.state}.`, `If the ${other.state} tax was on income other than wages, enter Schedule OS yourself.`));
      continue;
    }
    const line19 = Math.min(positive(other.income), Math.max(0, wisconsinIncome));
    const line20 = positive(other.income);
    const line21 = line20 < line19 || line20 <= 0 ? 1 : ratio(line19, line20);
    const line22 = positive(other.tax);
    const line23 = Math.round(line21 * line22);
    const line30 = line19;
    const line31 = Math.max(0, wisconsinIncome);
    const line32 = line31 < line30 || line31 <= 0 ? 1 : ratio(line30, line31);
    const line33 = Math.max(0, netTaxBefore);
    const line34 = Math.round(line32 * line33);
    const line38 = NO_LIMIT_STATES.has(other.state) ? line23 : Math.min(line34, line23);
    total += line38;
    schedules.push(lineTable({ state: other.state, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 30: line30, 31: line31, 32: line32, 33: line33, 34: line34, 35: line23, 37: line23, 38: line38 }));
  }
  if (schedules.length) checks.push(check('info', 'WI_SCHEDULE_OS', 'Schedule OS uses the other state\'s net tax after all its credits; include a copy of that state\'s return.'));
  return { amount: total, schedules };
}

function eitc(ctx, filing, credits, checks) {
  const children = ctx.dependents.filter((item) => item.eitcChild).length;
  const federal = whole(ctx.federal.lines['27']);
  if (!children || !federal) return { amount: 0, children, federal, rateBp: 0 };
  if (filing.residency !== 'full-year') {
    checks.push(check('info', 'WI_EITC_FULL_YEAR_ONLY', 'The Wisconsin earned income credit is only for full-year Wisconsin residents.'));
    return { amount: 0, children, federal, rateBp: 0 };
  }
  if (ctx.filingStatus === 'mfs') {
    checks.push(check('info', 'WI_EITC_MFS', 'Married filing separately: no Wisconsin earned income credit unless you qualify to file as head of household, married.'));
    return { amount: 0, children, federal, rateBp: 0 };
  }
  const rateBp = credits.eitcBp[Math.min(3, children)];
  return { amount: rateOf(federal, rateBp), children, federal, rateBp };
}

function wagesFor(ctx, role, wisconsinOnly) {
  return sum(ctx.w2.filter((row) => row.owner === role && (!wisconsinOnly || row.state === 'WI')), (row) => (wisconsinOnly && row.stateWages !== null ? row.stateWages : row.wages));
}

function schedules(base) {
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value));
}

function form1(ctx, filing, rule, credits, claimRetirement) {
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const checks = [];
  const notes = [];
  const L = rule.lines;
  const line1 = income.agi;
  const line2 = 0;
  const line3 = line1 + line2;
  const wiBonds = Math.min(income.taxExemptInterest, positive(answers.wisconsinBondInterest));
  const ad1 = Math.max(0, income.taxExemptInterest - wiBonds);
  if (income.taxExemptInterest > 0 && answers.wisconsinBondInterest === undefined) checks.push(check('warning', 'WI_MUNI_SOURCE', `You have ${money(income.taxExemptInterest)} of federally tax-exempt interest. Wisconsin taxes interest on other states' bonds, so MyCA added all of it on Schedule AD line 1.`, 'Give the part that is exempt from Wisconsin tax in your Wisconsin answers.'));
  const line4 = ad1;
  const line5 = line3 + line4;

  const sb = {};
  sb[1] = income.stateRefundTaxable;
  sb[2] = Math.min(income.usObligationInterest, income.taxableInterest);
  const uc = unemploymentSubtraction(ctx, line3, rule, answers);
  sb[3] = uc.amount;
  sb[4] = income.socialSecurityTaxable;
  const cg = capitalGainExclusion(ctx, rule);
  sb[5] = cg.amount;
  const retirementIncome = income.iraTaxable + income.pensionTaxable;
  sb[12] = Math.min(positive(answers.militaryRetirement), retirementIncome);
  const eligible67 = retirementPeople(ctx, rule.retirement.age);
  const line16Possible = Math.min(Math.max(0, retirementIncome - sb[12]), eligible67 * rule.retirement.perPerson);
  sb[16] = claimRetirement ? line16Possible : 0;
  const eligible65 = retirementPeople(ctx, rule.smallRetirement.age);
  const smallLimit = status === 'mfj' ? rule.smallRetirement.agiBelow.mfj : rule.smallRetirement.agiBelow.other;
  sb[17] = eligible65 && status !== 'mfs' && line3 < smallLimit ? Math.min(Math.max(0, retirementIncome - sb[12] - sb[16]), eligible65 * rule.smallRetirement.amount) : 0;
  if (eligible65 && status === 'mfs' && line3 < smallLimit) checks.push(check('info', 'WI_SB17_MFS', 'Married filing separately: the $5,000 retirement income subtraction needs both spouses\' combined federal adjusted gross income to be under $30,000, which MyCA does not know; it is not claimed.'));
  sb[29] = sb[1] + sb[2] + sb[3] + sb[4] + sb[5] + sb[12] + sb[16] + sb[17];
  sb[50] = sb[29];
  const line6 = sb[50];
  const line7 = line5 - line6;

  const standard = standardDeduction(ctx, line7, rule);
  const line8 = standard.amount;
  const line9 = Math.max(0, line7 - line8);
  const ex = exemptions(ctx, rule);
  const line11 = Math.max(0, line9 - ex.c);
  const line12 = wisconsinTax(line11, status, rule);

  const restricted = sb[16] > 0;
  const item = itemizedCredit(ctx, line3, line8, credits);
  const line13 = restricted ? 0 : Math.min(item.amount, line12);
  const school = schoolPropertyTaxCredit(ctx, answers, credits, checks);
  const schoolRent = restricted ? 0 : school.rent;
  const schoolOwner = restricted ? 0 : school.owner;
  const married = marriedCoupleCredit(ctx, answers, credits, (role) => wagesFor(ctx, role, false));
  const marriedAmount = restricted || !married ? 0 : married.amount;
  const beforeOs = Math.max(0, line12 - line13 - schoolRent - schoolOwner - marriedAmount);
  const os = restricted ? { amount: 0, schedules: [] } : otherStateCredit(filing, line7, beforeOs, checks);
  const creditsTotal = line13 + schoolRent + schoolOwner + marriedAmount + os.amount;
  const netTax = Math.max(0, line12 - creditsTotal);
  const useTax = positive(answers.useTax);
  const donations = positive(answers.donations);
  const total = netTax + useTax + donations;
  const ei = restricted ? { amount: 0, children: 0, federal: 0, rateBp: 0 } : eitc(ctx, filing, credits, checks);

  const lines = lineTable({
    1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9,
    '10a': ex.a, '10b': ex.b, '10c': ex.c, 11: line11, 12: line12, [L.itemized]: line13,
    [L.schoolRent]: schoolRent, [L.schoolOwner]: schoolOwner, [L.married]: marriedAmount, [L.otherState]: os.amount,
    [L.creditsTotal]: creditsTotal, [L.netTax]: netTax, [L.useTax]: useTax, [L.donations]: donations, [L.total]: total,
    [L.withheld]: filing.payments.withheld, [L.estimated]: filing.payments.estimated + filing.payments.extension, [L.eitc]: ei.amount,
  });
  return {
    claimRetirement: restricted,
    line16Possible,
    form: '1',
    lines,
    schedules: schedules({
      AD: ad1 ? lineTable({ 1: ad1, 33: ad1 }) : null,
      SB: lineTable(sb),
      'SB line 3 worksheet': uc.worksheet,
      WD: cg.lines,
      'Line 8': lineTable({ table: standard.table, used: line8, dependentWorksheet: standard.dependent ? 'yes' : 'no' }),
      'Standard deduction worksheet for dependents': standard.worksheet || null,
      'Line 10': lineTable({ personal: ex.personal, senior: ex.senior }),
      'Schedule 1': !restricted && (item.amount || ctx.itemized.mortgageInterest || ctx.itemized.charityCash) ? item.lines : null,
      'Line 16': school.total && !restricted ? lineTable({ rentHeatIncluded: school.withHeat, rentHeatNotIncluded: school.withoutHeat, propertyTaxes: school.propertyTax, a: schoolRent, b: schoolOwner }) : null,
      'Schedule 2': married && !restricted ? married.lines : null,
      OS: os.schedules.length ? os.schedules : null,
      'Line 30': ei.amount ? lineTable({ children: ei.children, federalCredit: ei.federal, percent: ei.rateBp / 100, credit: ei.amount }) : null,
    }),
    stateIncome: line7,
    taxableIncome: line11,
    taxBeforeCredits: line12,
    nonrefundableCredits: [
      ...(line13 ? [{ code: 'WI_ITEMIZED', label: 'Itemized deduction credit (Schedule 1)', amount: line13 }] : []),
      ...(schoolRent + schoolOwner ? [{ code: 'WI_SCHOOL_PROPERTY_TAX', label: 'School property tax credit', amount: schoolRent + schoolOwner }] : []),
      ...(marriedAmount ? [{ code: 'WI_MARRIED_COUPLE', label: 'Married couple credit (Schedule 2)', amount: marriedAmount }] : []),
      ...(os.amount ? [{ code: 'WI_SCHEDULE_OS', label: 'Credit for net tax paid to another state (Schedule OS)', amount: os.amount }] : []),
    ],
    otherStateCredit: os.amount,
    otherTaxes: [...(useTax ? [{ code: 'WI_USE_TAX', label: 'Sales and use tax on out-of-state purchases', amount: useTax }] : []), ...(donations ? [{ code: 'WI_DONATIONS', label: 'Donations (Schedule 3)', amount: donations }] : [])],
    totalTax: total,
    refundableCredits: ei.amount ? [{ code: 'WI_EITC', label: 'Wisconsin earned income credit', amount: ei.amount }] : [],
    checks,
    notes,
  };
}

function form1npr(ctx, filing, rule, credits) {
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const s = filing.sourced;
  const checks = [];
  const notes = [];
  const partYear = filing.residency === 'part-year';
  const A = {
    1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.stateRefundTaxable, 6: income.businessIncome,
    7: income.capitalGain, 9: income.iraTaxable, 10: income.pensionTaxable, 13: income.unemployment, 14: income.socialSecurityTaxable,
  };
  A[15] = income.totalIncome - (A[1] + A[2] + A[3] + A[4] + A[6] + A[7] + A[9] + A[10] + A[13] + A[14]);
  A[16] = income.totalIncome;
  A[29] = income.adjustments;
  const cgScale = partYear && income.capitalGain > 0 ? Math.min(1, whole(s.capitalGain) / income.capitalGain) : 0;
  const cg = partYear ? capitalGainExclusion(ctx, rule, cgScale) : { amount: 0, lines: null };
  const wiBonds = Math.min(income.taxExemptInterest, positive(answers.wisconsinBondInterest));
  const muni = partYear ? Math.round(Math.max(0, income.taxExemptInterest - wiBonds) * filing.share) : 0;
  const B = {
    1: whole(s.wages), 2: Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest)) + muni, 3: whole(s.ordinaryDividends), 4: 0, 6: whole(s.businessIncome),
    7: whole(s.capitalGain) - cg.amount, 9: whole(s.iraTaxable), 10: whole(s.pensionTaxable), 13: whole(s.unemployment), 14: 0, 15: whole(s.otherIncome),
  };
  B[16] = B[1] + B[2] + B[3] + B[4] + B[6] + B[7] + B[9] + B[10] + B[13] + B[14] + B[15];
  B[29] = Math.max(0, whole(s.adjustments));
  const line30 = B[16] - B[29];
  const line31 = A[16] - A[29];
  const line32 = line30 <= 0 ? 0 : line31 <= 0 || line30 >= line31 ? 1 : ratio(line30, line31);
  const line33 = line30 <= 0 ? 0 : Math.max(line30, line31);
  const standard = standardDeduction(ctx, line31, rule);
  const line34c = standard.amount;
  const line35 = Math.max(0, line33 - line34c);
  const ex = exemptions(ctx, rule);
  const line37 = Math.max(0, line35 - ex.c);
  const line38 = wisconsinTax(line37, status, rule);
  const line39 = Math.round(line38 * line32);

  const item = itemizedCredit(ctx, line31, line34c, credits);
  const line40 = Math.round(item.amount * line32);
  const school = partYear ? schoolPropertyTaxCredit(ctx, answers, credits, checks) : { rent: 0, owner: 0, total: 0 };
  const line43c = Math.round(school.total * line32);
  const line44 = line40 + line43c;
  const line45 = Math.max(0, line39 - line44);
  const line46 = line45;
  const married = marriedCoupleCredit(ctx, answers, credits, (role) => Math.min(wagesFor(ctx, role, true), B[1]));
  const line48 = married ? married.amount : 0;
  const os = partYear ? otherStateCredit(filing, line30, Math.max(0, line46 - line48), checks) : { amount: 0, schedules: [] };
  const line50 = os.amount;
  const line51 = line48 + line50;
  const line52 = Math.max(0, line46 - line51);
  const line53 = positive(answers.useTax);
  const line54 = positive(answers.donations);
  const line57 = line52 + line53 + line54;
  eitc(ctx, filing, credits, checks);
  if (!partYear) checks.push(check('info', 'WI_NONRESIDENT_SCHOOL_CREDIT', 'Nonresidents cannot claim the school property tax credit, the earned income credit or homestead credit.'));
  notes.push('Form 1NPR column B includes the Wisconsin W-2 wages and the amounts you gave as Wisconsin income; Social Security and state tax refunds are not taxed by Wisconsin.');
  if (cg.amount) notes.push('The 30% long-term capital gain exclusion is applied to the Wisconsin part of the gain in column B line 7.');

  const lines = lineTable({
    ...Object.fromEntries(Object.entries(A).map(([key, value]) => [`A${key}`, value])),
    ...Object.fromEntries(Object.entries(B).map(([key, value]) => [`B${key}`, value])),
    30: line30, 31: line31, 32: line32, 33: line33, '34c': line34c, 35: line35, '36a': ex.a, '36b': ex.b, '36c': ex.c, 37: line37, 38: line38, 39: line39,
    40: line40, '43a': school.rent, '43b': school.owner, '43c': line43c, 44: line44, 45: line45, 46: line46, 47: 0, 48: line48, 50: line50, 51: line51, 52: line52,
    53: line53, 54: line54, 57: line57, 58: filing.payments.withheld, 59: filing.payments.estimated + filing.payments.extension, 60: 0,
  });
  return {
    form: '1NPR',
    lines,
    schedules: schedules({
      WD: cg.lines,
      'Line 34c': lineTable({ table: standard.table, used: line34c, dependentWorksheet: standard.dependent ? 'yes' : 'no' }),
      'Line 36': lineTable({ personal: ex.personal, senior: ex.senior }),
      'Schedule 1': item.amount ? lineTable({ ...item.lines, 10: line32, 11: line40 }) : null,
      'Schedule 2': married ? married.lines : null,
      OS: os.schedules.length ? os.schedules : null,
    }),
    stateIncome: line30,
    taxableIncome: line37,
    taxBeforeCredits: line39,
    nonrefundableCredits: [
      ...(line40 ? [{ code: 'WI_ITEMIZED', label: 'Itemized deduction credit (Schedule 1)', amount: line40 }] : []),
      ...(line43c ? [{ code: 'WI_SCHOOL_PROPERTY_TAX', label: 'School property tax credit (prorated)', amount: line43c }] : []),
      ...(line48 ? [{ code: 'WI_MARRIED_COUPLE', label: 'Married couple credit (Schedule 2)', amount: line48 }] : []),
      ...(line50 ? [{ code: 'WI_SCHEDULE_OS', label: 'Credit for net tax paid to another state (Schedule OS)', amount: line50 }] : []),
    ],
    otherStateCredit: line50,
    otherTaxes: [...(line53 ? [{ code: 'WI_USE_TAX', label: 'Sales and use tax on out-of-state purchases', amount: line53 }] : []), ...(line54 ? [{ code: 'WI_DONATIONS', label: 'Donations (Schedule 3)', amount: line54 }] : [])],
    totalTax: line57,
    refundableCredits: [],
    checks,
    notes,
  };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Wisconsin figures for ${ctx.taxYear}.` };
  const general = [];
  if (ctx.filingStatus === 'qss') general.push(check('info', 'WI_QSS_AS_HOH', 'A qualifying surviving spouse files the Wisconsin return as head of household; MyCA used the head of household standard deduction and the single rate schedule.'));
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) general.push(check('info', 'WI_DEPENDENT_FILER', 'Someone can claim you as a dependent: the Wisconsin standard deduction uses the dependent worksheet and no $700 exemption is allowed for you.'));
  if (filing.residency !== 'full-year') {
    const out = form1npr(ctx, filing, rule, credits);
    out.checks.unshift(...general);
    return out;
  }
  const choice = String(filing.answers.retirementSubtraction || 'best');
  const without = form1(ctx, filing, rule, credits, false);
  let chosen = without;
  if (without.line16Possible > 0 && choice !== 'credits') {
    const withSub = form1(ctx, filing, rule, credits, true);
    const net = (r) => r.totalTax - sum(r.refundableCredits, (x) => x.amount);
    if (choice === 'claim' || net(withSub) < net(without)) chosen = withSub;
    general.push(check('info', 'WI_RETIREMENT_SUBTRACTION', chosen.claimRetirement
      ? `The retirement income subtraction for age 67 or older (Schedule SB line 16) of ${money(withSub.schedules.SB['16'])} is claimed; with it no Wisconsin credits on Form 1 can be claimed, and this gives the lower result.`
      : `The retirement income subtraction for age 67 or older (Schedule SB line 16) is not claimed: keeping your Wisconsin credits gives the lower result.`));
    if (ctx.filingStatus === 'mfj' && retirementPeople(ctx, rule.retirement.age) === 1) general.push(check('warning', 'WI_RETIREMENT_ONE_SPOUSE', 'Only one spouse is 67 or older: the retirement income subtraction counts only that spouse\'s retirement income, up to $24,000. MyCA does not split retirement income by spouse and used the household total.', 'Check that the spouse who is 67 or older received at least the amount subtracted.'));
  }
  const { claimRetirement, line16Possible, ...result } = chosen;
  result.checks.unshift(...general);
  return result;
}

const FORM1_FRONT_LABELS = Object.freeze({
  1: 'Federal adjusted gross income',
  2: 'Adjustments to federal AGI (Schedule I)',
  3: 'Federal adjusted gross income for Wisconsin purposes',
  4: 'Total additions to income (Schedule AD)',
  5: 'Line 3 plus line 4',
  6: 'Total subtractions from income (Schedule SB)',
  7: 'Wisconsin income',
  8: 'Standard deduction',
  9: 'Line 7 minus line 8',
  '10a': 'Exemptions for yourself, spouse and dependents',
  '10b': 'Exemptions for age 65 or older',
  '10c': 'Total exemptions',
  11: 'Taxable income',
  12: 'Tax',
  13: 'Itemized deduction credit',
});

const form1Labels = (lines) => Object.freeze({
  ...FORM1_FRONT_LABELS,
  [lines.schoolRent]: 'Renter\'s school property tax credit',
  [lines.schoolOwner]: 'Homeowner\'s school property tax credit',
  [lines.married]: 'Married couple credit',
  [lines.otherState]: 'Net income tax paid to another state (Schedule OS)',
  [lines.creditsTotal]: 'Total nonrefundable credits',
  [lines.netTax]: 'Net tax',
  [lines.useTax]: 'Sales and use tax due on out-of-state purchases',
  [lines.donations]: 'Donations (Schedule 3)',
  [lines.total]: 'Total tax, use tax, donations and penalties',
  [lines.withheld]: 'Wisconsin tax withheld',
  [lines.estimated]: 'Estimated tax payments and amount applied from prior year',
  [lines.eitc]: 'Earned income credit',
});

const FORM1_LABELS = Object.freeze({
  2025: form1Labels({ schoolRent: '16a', schoolOwner: '16b', married: '18', otherState: '20', creditsTotal: '21', netTax: '22', useTax: '23', donations: '24', total: '27', withheld: '28', estimated: '29', eitc: '30' }),
  2026: form1Labels({ schoolRent: '17a', schoolOwner: '17b', married: '19', otherState: '21', creditsTotal: '22', netTax: '23', useTax: '24', donations: '25', total: '28', withheld: '29', estimated: '30', eitc: '31' }),
});

const NPR_COLUMN_LABELS = Object.freeze({
  1: 'Wages, salaries, tips, etc.',
  2: 'Taxable interest',
  3: 'Ordinary dividends',
  4: 'Taxable refunds of state and local income taxes',
  6: 'Business income or loss',
  7: 'Capital gain or loss',
  9: 'IRA distributions',
  10: 'Pensions and annuities',
  13: 'Unemployment compensation',
  14: 'Social Security benefits',
  15: 'Other income',
  16: 'Combine lines 1 through 15',
  29: 'Total adjustments to income',
});

const FORM1NPR_LABELS = Object.freeze({
  ...Object.fromEntries(Object.entries(NPR_COLUMN_LABELS).flatMap(([key, text]) => [[`A${key}`, `${text} (federal)`], [`B${key}`, `${text} (Wisconsin)`]])),
  30: 'Wisconsin income',
  31: 'Federal income',
  32: 'Ratio of Wisconsin income to federal income',
  33: 'Larger of Wisconsin income or federal income',
  '34c': 'Standard deduction',
  35: 'Line 33 minus line 34c',
  '36a': 'Exemptions for yourself, spouse and dependents',
  '36b': 'Exemptions for age 65 or older',
  '36c': 'Total exemptions',
  37: 'Line 35 minus line 36c',
  38: 'Tax',
  39: 'Prorated tax',
  40: 'Itemized deduction credit',
  '43a': 'Renter\'s school property tax credit',
  '43b': 'Homeowner\'s school property tax credit',
  '43c': 'Prorated school property tax credit',
  44: 'Add credits on lines 40 through 43c',
  45: 'Line 39 minus line 44',
  46: 'Amount from line 45',
  47: 'Working families tax credit',
  48: 'Married couple credit',
  50: 'Net income tax paid to another state (Schedule OS)',
  51: 'Add lines 47 through 50',
  52: 'Net tax',
  53: 'Sales and use tax due on out-of-state purchases',
  54: 'Donations (Schedule 3)',
  57: 'Add lines 52 through 56',
  58: 'Wisconsin income tax withheld',
  59: 'Estimated tax paid and amount applied from prior year',
  60: 'Earned income credit',
});

const Q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'WI',
  name: 'Wisconsin',
  built: true,
  forms: Object.freeze({ resident: '1', partYear: '1NPR', nonresident: '1NPR' }),
  labels: (taxYear, residency) => (residency === 'full-year' ? FORM1_LABELS[taxYear] || FORM1_LABELS[2026] : FORM1NPR_LABELS),
  questions: Object.freeze([
    Q('wisconsinBondInterest', 'amount', 'Of your federally tax-exempt interest, how much is also exempt from Wisconsin tax (certain Wisconsin housing, utility and public bonds)?', 'Wisconsin adds back other tax-exempt interest on Schedule AD line 1. Enter 0 if none is exempt for Wisconsin.', { when: { has: ['taxExemptInterest'] } }),
    Q('militaryRetirement', 'amount', 'U.S. military and uniformed services retirement pay included in your federal income', 'Subtracted on Schedule SB line 12.', { when: { residency: ['full-year'], has: ['retirementIncome'] } }),
    Q('retirementSubtraction', 'choice', 'If you (or your spouse) are 67 or older: claim the retirement income subtraction, which removes all Wisconsin credits?', 'Schedule SB line 16 subtracts up to $24,000 per person of retirement income but no credits on Form 1 lines 13 to 20 or 30 to 35 are then allowed. "best" lets MyCA pick the lower tax.', { options: Object.freeze(['best', 'claim', 'credits']) , when: { residency: ['full-year'], has: ['senior'] } }),
    Q('rentHeatIncluded', 'amount', 'Rent paid for your Wisconsin home where heat was included', 'Renter\'s school property tax credit (Form 1 line 16a). Leave out rent for tax-exempt housing.', { when: { residency: ['full-year', 'part-year'] } }),
    Q('rentHeatNotIncluded', 'amount', 'Rent paid for your Wisconsin home where heat was not included', 'Renter\'s school property tax credit (Form 1 line 16a).', { when: { residency: ['full-year', 'part-year'] } }),
    Q('propertyTaxesPaid', 'amount', 'Property taxes paid on your Wisconsin home', 'Homeowner\'s school property tax credit (Form 1 line 16b). If left empty, MyCA uses the real estate taxes on your federal return.', { when: { residency: ['full-year', 'part-year'] } }),
    Q('hohMarried', 'yesno', 'Are you filing as head of household while still married?', 'Married head of household filers are limited to a $150 school property tax credit.', { when: { residency: ['full-year', 'part-year'], filingStatus: ['hoh'] } }),
    Q('mfsLivedApart', 'yesno', 'Married filing separately: did you live apart from your spouse all year?', 'Sets the base for the unemployment compensation subtraction (Schedule SB line 3).', { when: { filingStatus: ['mfs'] } }),
    Q('spouseIraSepDeduction', 'amount', 'Part of the IRA and self-employed retirement deductions that belongs to your spouse', 'Married couple credit, Schedule 2 line 4.', { when: { filingStatus: ['mfj'] } }),
    Q('useTax', 'amount', 'Wisconsin sales and use tax due on out-of-state and online purchases where no tax was charged', 'Form 1 line 23.'),
    Q('donations', 'amount', 'Donations to Wisconsin funds on Schedule 3 (endangered resources, cancer research, veterans and others)', 'They increase the amount you owe or reduce your refund.'),
  ]),
  notCovered: Object.freeze([
    'Schedule I adjustments for differences between federal and Wisconsin law (depreciation, IRC update differences)',
    'Schedule AD additions other than tax-exempt interest from other states\' bonds',
    'Schedule SB subtractions other than lines 1 to 5, 12, 16 and 17 (medical care and long-term care insurance, tuition, private school tuition, college savings, active duty pay, disability income, and others)',
    'Additional child and dependent care tax credit (Schedule WI-2441), blind worker transportation credit, Schedule CR business credits, farmland preservation, veterans property tax credit and repayment credit',
    'Homestead credit (Schedule H or H-EZ), which is claimed separately with its own household income test',
    'Penalties on IRAs and retirement plans (Form 1 line 25) and other penalties; underpayment interest (Schedule U)',
    'Schedule OS for tax passed through from S corporations and partnerships (Part III) and for more than two states',
    'Form 1NPR Schedule M modifications other than U.S. interest, Social Security, state refunds, the capital gain exclusion and other states\' bond interest; the retirement income subtractions for part-year residents',
    'Wisconsin capital loss carryovers and the 60% exclusion for farm assets',
    'Married persons filing separately with marital property income (Schedule 2-PR)',
  ]),
  compute,
});
