import { whole, positive, sum, rateOf, check, lineTable, yesNo } from '../state-kit.mjs';

const money = (value) => `$${whole(value).toLocaleString('en-US')}`;
const percent6 = (part, total) => {
  if (whole(total) <= 0) return part > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, Math.round((part / total) * 1000000) / 1000000));
};

function retirementByOwner(ctx) {
  const forms = (ctx.forms || []).filter((form) => form.kind === '1099-R' && !/G/.test(String(form.fields?.distributionCode || '').toUpperCase()));
  const amountOf = (form) => {
    const taxable = form.fields?.taxableAmount;
    return positive(taxable === undefined || taxable === null || taxable === '' ? form.fields?.grossDistribution : taxable);
  };
  const out = { taxpayer: 0, spouse: 0 };
  for (const form of forms) out[form.owner === 'spouse' ? 'spouse' : 'taxpayer'] += amountOf(form);
  return out;
}

function qualifiesForExclusion(ctx, role, rule, answers) {
  const filer = role === 'spouse' ? ctx.filers.find((item) => item.role === 'spouse') : ctx.filers.find((item) => item.role === 'taxpayer');
  if (!filer) return false;
  if (filer.age !== null && filer.age >= rule.retirementExclusionAge) return true;
  if (role === 'spouse' ? yesNo(answers.spouseDisabled) : yesNo(answers.disabled)) return true;
  return role === 'spouse' ? yesNo(answers.spouseSurvivorRetirement) : yesNo(answers.survivorRetirement);
}

function retirementExclusion(ctx, rule, answers, military) {
  const total = Math.max(0, ctx.income.iraTaxable + ctx.income.pensionTaxable - military);
  if (!total) return { amount: 0, total: 0, share: 0 };
  const owners = retirementByOwner(ctx);
  const known = owners.taxpayer + owners.spouse;
  const taxpayerShare = known > 0 ? owners.taxpayer / known : 1;
  const parts = { taxpayer: taxpayerShare, spouse: 1 - taxpayerShare };
  let share = 0;
  for (const role of ['taxpayer', 'spouse']) if (parts[role] > 0 && qualifiesForExclusion(ctx, role, rule, answers)) share += parts[role];
  return { amount: Math.round(total * Math.min(1, share)), total, share };
}

function exemptionCredits(ctx, rule) {
  const status = ctx.filingStatus;
  const personal = status === 'mfj' || status === 'hoh' ? 2 : 1;
  const people = status === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer');
  const extra = people.reduce((total, item) => total + (item.age !== null && item.age >= rule.seniorAge ? 1 : 0) + (item.blind ? 1 : 0), 0);
  const dependents = ctx.dependents.length;
  const a = personal * rule.exemptionCredit.personal;
  const b = extra * rule.exemptionCredit.seniorOrBlind;
  const c = dependents * rule.exemptionCredit.dependent;
  return { personal, extra, dependents, a, b, c, d: a + b + c };
}

function otherStateCredits(ctx, filing, iowaIncome, line14, partYear, checks) {
  let total = 0;
  const schedules = [];
  for (const other of filing.otherStates || []) {
    if (line14 - total <= 0) break;
    const line16 = Math.max(0, iowaIncome);
    const line13 = Math.min(positive(other.income), line16);
    const line17 = percent6(line13, line16);
    const line18 = line14;
    const line19 = Math.round(line18 * line17);
    const line22 = positive(other.tax);
    let credit;
    const row = { state: other.state, 13: line13, 14: ctx.income.totalIncome, 16: line16, 17: line17, 18: line18, 19: line19, 20: line22, 22: line22 };
    if (partYear) {
      const line24 = positive(other.income);
      const line25 = percent6(line13, line24);
      const line26 = Math.round(line22 * line25);
      credit = Math.min(line19, line26);
      Object.assign(row, { 24: line24, 25: line25, 26: line26, 27: credit });
    } else {
      credit = Math.min(line19, line22);
      row[23] = credit;
    }
    credit = Math.min(credit, line14 - total);
    total += credit;
    schedules.push(lineTable(row));
  }
  if (schedules.length) checks.push(check('info', 'IA_130', 'The out-of-state tax credit (IA 130) uses the tax the other state imposed on income Iowa also taxes; include a copy of that state\'s return.'));
  return { amount: total, schedules };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Iowa figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const residency = filing.residency;
  const resident = residency === 'full-year';
  const partYear = residency === 'part-year';
  const checks = [];
  const notes = [];
  const fed = ctx.federal.lines;

  const step3 = exemptionCredits(ctx, rule);
  const line1a = income.totalIncome;
  const line1b = income.adjustments;
  const line1c = income.agi;
  const line1d = whole(fed['12']);
  const line1e = whole(fed['13a']);
  const line1f = whole(ctx.federal.schedules?.['1-A']?.['37']);
  const federalTaxable = whole(fed['15']);
  const line2 = federalTaxable > 0 ? federalTaxable : line1c - line1d - line1e;

  const iowaBonds = positive(answers.iowaExemptBondInterest);
  const muniInterest = Math.max(0, income.taxExemptInterest - income.exemptInterestDividends);
  const s1A1 = Math.max(0, muniInterest - iowaBonds);
  const s1A2 = Math.max(0, income.exemptInterestDividends - Math.max(0, iowaBonds - muniInterest));
  if (income.taxExemptInterest > 0 && answers.iowaExemptBondInterest === undefined) checks.push(check('warning', 'IA_MUNI_SOURCE', `You have ${money(income.taxExemptInterest)} of federally tax-exempt interest. Iowa taxes state and municipal bond interest unless an Iowa law exempts it, so MyCA added all of it on Schedule 1 lines 1 and 2.`, 'Give the part from Iowa-exempt bonds in your Iowa answers.'));
  const s1B1 = Math.min(income.usObligationInterest, income.taxableInterest);
  const retirementIncome = income.iraTaxable + income.pensionTaxable;
  const s1B4 = Math.min(positive(answers.militaryRetirement), retirementIncome);
  const s1B5 = income.socialSecurityTaxable;
  const exclusion = retirementExclusion(ctx, rule, answers, s1B4);
  const s1B7 = exclusion.amount;
  if (exclusion.total && exclusion.share > 0 && exclusion.share < 1) checks.push(check('info', 'IA_RETIREMENT_PARTIAL', `Only the retirement income received by a spouse who is 55 or older (or disabled) is excluded: ${money(s1B7)} of ${money(exclusion.total)}, split by the owners on your 1099-R forms.`));
  if (exclusion.total && exclusion.share === 0) checks.push(check('info', 'IA_RETIREMENT_NOT_EXCLUDED', 'Pension and IRA income is excluded in Iowa only for a recipient who is 55 or older, disabled, or a qualifying surviving spouse; none of yours qualifies, so it stays taxable.', 'Answer the disability question in your Iowa answers if it applies.'));
  const s1A12 = s1A1 + s1A2;
  const s1B12 = s1B1 + s1B4 + s1B5 + s1B7;
  const s1Line13 = s1A12 - s1B12;
  const s1Line20 = 0;
  const s1Line21 = s1Line13 + s1Line20;
  const line3 = s1Line21;
  const line4 = line2 + line3;

  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const senior = (status === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer')).some((item) => item.age !== null && item.age >= rule.seniorAge);
  const worksheetTotal = line4 + line1d + line1e + line1f;
  const spouseGiven = answers.spouseIowaTaxableIncome !== undefined && answers.spouseIowaTaxableIncome !== null && answers.spouseIowaTaxableIncome !== '';
  const combined = worksheetTotal + (spouseGiven ? whole(answers.spouseIowaTaxableIncome) : 0);
  const low = rule.lowIncome;
  let exempt = false;
  if (status === 'single') exempt = dependentFiler ? line4 < low.dependentBelow : worksheetTotal <= (senior ? low.singleSenior : low.single);
  else if (status === 'mfs') exempt = spouseGiven && !dependentFiler && (senior ? combined <= low.otherSenior : worksheetTotal <= low.mfsOwn && combined <= low.mfsCombined);
  else exempt = !dependentFiler && worksheetTotal <= (senior ? low.otherSenior : low.other);
  if (status === 'mfs' && !spouseGiven && worksheetTotal <= low.mfsOwn) checks.push(check('info', 'IA_MFS_SPOUSE_INCOME', 'Married filing separately: the low-income exemption and alternate tax need your spouse\'s Iowa taxable income, which was not given.', 'Give your spouse\'s Iowa taxable income in your Iowa answers.'));

  const regular = line4 > 0 ? rateOf(line4, rule.rateBp) : 0;
  let line5 = exempt ? 0 : regular;
  let method = exempt ? 'low-income exemption' : 'tax rate';
  let alternate = null;
  if (!exempt && status !== 'single' && status !== 'mfs') {
    const threshold = senior ? rule.alternate.thresholdSenior : rule.alternate.threshold;
    const line3w = Math.max(0, worksheetTotal - threshold);
    const line4w = rateOf(line3w, rule.alternate.rateBp);
    alternate = lineTable({ '1g': worksheetTotal, 1: worksheetTotal, 2: threshold, 3: line3w, 4: line4w, 5: regular, 6: Math.min(line4w, regular) });
    if (line4w < regular) {
      line5 = line4w;
      method = 'alternate tax';
    }
  }
  const line6 = 0;
  const line7 = line5 + line6;
  const line8 = step3.d;
  const tuitionChildren = positive(answers.tuitionTextbookDependents) || (positive(answers.tuitionTextbookExpenses) ? 1 : 0);
  const line9 = rateOf(Math.min(positive(answers.tuitionTextbookExpenses), tuitionChildren * credits.tuitionTextbook.perDependentMax), credits.tuitionTextbook.rateBp);
  const line10 = 0;
  const line11 = line8 + line9 + line10;
  let line12 = Math.max(0, line7 - line11);
  let reduction = null;
  if (!exempt && status === 'single' && !dependentFiler) {
    const threshold = senior ? rule.reduction.thresholdSenior : rule.reduction.threshold;
    const line3r = Math.max(0, worksheetTotal - threshold);
    reduction = lineTable({ 1: worksheetTotal, 2: threshold, 3: line3r, 4: line12, 5: Math.min(line3r, line12) });
    if (line3r < line12) {
      line12 = line3r;
      method = 'tax reduction';
    }
  }

  let line13 = 0;
  let ia126 = null;
  let iowaShare = 1;
  let iowaIncome = line1a + s1Line13;
  if (!resident) {
    const s = filing.sourced;
    const sourcedRetirement = whole(s.iraTaxable) + whole(s.pensionTaxable);
    const retirementShare = retirementIncome > 0 ? Math.min(1, sourcedRetirement / retirementIncome) : 0;
    const muniB = partYear ? Math.round((s1A1 + s1A2) * filing.share) : 0;
    const B = {
      1: whole(s.wages), 2: Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest)) + muniB, 3: whole(s.ordinaryDividends), 4: 0, 5: whole(s.businessIncome),
      6: whole(s.capitalGain), 7: 0, 8: 0, 9: 0, 10: whole(s.unemployment), 11: 0,
      12: whole(s.otherIncome) + whole(s.stateRefundTaxable) + Math.max(0, sourcedRetirement - Math.round((s1B4 + s1B7) * retirementShare)),
    };
    B[13] = Object.values(B).reduce((total, value) => total + value, 0);
    const items = income.adjustmentItems;
    const A = { 17: items.ira + items.seRetirement, 18: items.seTaxDeduction, 19: items.seHealth, 20: items.earlyWithdrawal, 21: 0, 22: 0, 23: 0, 24: 0 };
    A[25] = Math.max(0, income.adjustments - (A[17] + A[18] + A[19] + A[20]));
    A[26] = A[17] + A[18] + A[19] + A[20] + A[25];
    const factor = income.adjustments > 0 ? Math.min(1, Math.max(0, whole(s.adjustments)) / income.adjustments) : 0;
    const Badj = Object.fromEntries([17, 18, 19, 20, 25].map((key) => [key, Math.round(A[key] * factor)]));
    Badj[26] = Badj[17] + Badj[18] + Badj[19] + Badj[20] + Badj[25];
    const line14 = line1a;
    const line15 = s1Line13;
    const line16 = line14 + line15;
    const line27 = B[13] - Badj[26];
    const line28 = line16 - A[26];
    const belowMinimum = line27 < rule.nonresidentMinimum;
    const line29 = belowMinimum ? 0 : percent6(Math.max(0, line27), line28);
    const line30 = Math.round((1 - line29) * 1000000) / 1000000;
    const line31 = line5;
    const line32 = line11;
    const line33 = reduction && method === 'tax reduction' ? line12 : Math.max(0, line31 - line32);
    const line34 = Math.min(line12, Math.round(line33 * line30));
    if (belowMinimum) checks.push(check('info', 'IA_BELOW_1000', `Iowa-source net income of ${money(line27)} is under $1,000, so you are exempt from Iowa tax; file only to get back Iowa withholding.`));
    line13 = line34;
    iowaShare = line29;
    iowaIncome = B[13];
    ia126 = lineTable({
      ...Object.fromEntries(Object.entries(B).map(([key, value]) => [`B${key}`, value])),
      A14: line14, A15: line15, A16: line16,
      ...Object.fromEntries([17, 18, 19, 20, 25, 26].map((key) => [`A${key}`, A[key]])),
      ...Object.fromEntries([17, 18, 19, 20, 25, 26].map((key) => [`B${key}`, Badj[key]])),
      27: line27, 28: line28, 29: line29, 30: line30, 31: line31, 32: line32, 33: line33, 34: line34,
    });
    notes.push('IA 126 column B includes the Iowa W-2 wages and the amounts you gave as Iowa income; Social Security and the retirement exclusion are netted out of each line.');
  }
  const line14 = Math.max(0, line12 - line13);
  const os = residency === 'nonresident' ? { amount: 0, schedules: [] } : otherStateCredits(ctx, filing, iowaIncome, line14, partYear, checks);
  const line15 = os.amount;
  const line16 = Math.max(0, line14 - line15);
  const line17 = 0;
  const line18 = Math.max(0, line16 - line17);
  const surtaxApplies = resident || (partYear && !yesNo(answers.movedOutBeforeYearEnd));
  const rateGiven = answers.schoolDistrictSurtaxRate !== undefined && answers.schoolDistrictSurtaxRate !== null && answers.schoolDistrictSurtaxRate !== '';
  const surtaxRate = surtaxApplies && rateGiven ? Math.max(0, Number(answers.schoolDistrictSurtaxRate) || 0) : 0;
  const line19 = Math.round((line18 * surtaxRate) / 100);
  if (surtaxApplies && !rateGiven && line18 > 0) checks.push(check('warning', 'IA_SCHOOL_SURTAX_RATE', 'The school district surtax (IA 1040 line 19) needs the surtax rate of the Iowa school district you lived in on December 31; most districts charge 0% to 20% of line 18. MyCA used 0%.', 'Find your district in the Iowa school district surtax table (41-027) and give its number and rate in your Iowa answers.'));
  const line20 = line18 + line19;
  const line21 = positive(answers.checkoffContributions);
  const line22 = line20 + line21;
  const federalEic = whole(fed['27']);
  const line25 = federalEic ? Math.round(rateOf(federalEic, credits.eitcBp) * (resident ? 1 : iowaShare)) : 0;

  if (exempt) checks.push(check('info', 'IA_LOW_INCOME_EXEMPT', `Your income for the Iowa low-income test is ${money(worksheetTotal)}, so you are exempt from Iowa tax (IA 1040 line 4 box); file only to get back withholding or claim the earned income tax credit.`));
  if (method === 'alternate tax' || method === 'tax reduction') checks.push(check('info', 'IA_TAX_METHOD', `Iowa tax uses the ${method === 'alternate tax' ? 'Alternate Tax Worksheet (41-145)' : 'Income Tax Reduction Worksheet (41-146)'}, which gives less tax than the 3.8% rate; check the box in IA 1040 Step 5.`));

  const lines = lineTable({
    'Step 3a': step3.a, 'Step 3b': step3.b, 'Step 3c': step3.c, 'Step 3d': step3.d,
    '1a': line1a, '1b': line1b, '1c': line1c, '1d': line1d, '1e': line1e, '1f': line1f, 2: line2, 3: line3, 4: line4,
    5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18,
    19: line19, 20: line20, 21: line21, 22: line22, 23: 0, 24: 0, 25: line25, 26: 0, 27: 0, 28: filing.payments.withheld, 29: filing.payments.estimated + filing.payments.extension,
  });
  const schedule1 = lineTable({ A1: s1A1, B1: s1B1, A2: s1A2, B4: s1B4, B5: s1B5, B7: s1B7, A12: s1A12, B12: s1B12, 13: s1Line13, 20: s1Line20, 21: s1Line21 });
  const schedules = {
    'Schedule 1': schedule1,
    'Step 3': lineTable({ personal: step3.personal, seniorOrBlind: step3.extra, dependents: step3.dependents }),
    'Tax method': lineTable({ method, lowIncomeTest: worksheetTotal }),
    ...(alternate ? { 'Alternate tax worksheet': alternate } : {}),
    ...(reduction ? { 'Tax reduction worksheet': reduction } : {}),
    ...(ia126 ? { 'IA 126': ia126 } : {}),
    ...(os.schedules.length ? { 'IA 130': os.schedules } : {}),
    ...(line19 ? { 'Line 19': lineTable({ schoolDistrict: String(answers.schoolDistrictNumber || ''), rate: surtaxRate, surtax: line19 }) } : {}),
    ...(line25 ? { 'Line 25': lineTable({ federalCredit: federalEic, rate: credits.eitcBp / 100, iowaPercentage: resident ? 1 : iowaShare, credit: line25 }) } : {}),
  };
  const allowed = (amount, upTo) => Math.min(amount, Math.max(0, upTo));
  const exemptionUsed = allowed(line8, line7);
  const tuitionUsed = allowed(line9, line7 - exemptionUsed);
  const reductionUsed = Math.max(0, line7 - line11) - line12;
  return {
    form: 'IA 1040',
    lines,
    schedules,
    stateIncome: resident ? line1a + s1Line13 : iowaIncome,
    taxableIncome: line4,
    taxBeforeCredits: line7,
    nonrefundableCredits: [
      ...(exemptionUsed ? [{ code: 'IA_EXEMPTION_CREDIT', label: 'Personal and dependent exemption credits', amount: exemptionUsed }] : []),
      ...(tuitionUsed ? [{ code: 'IA_TUITION', label: 'Tuition and textbook credit', amount: tuitionUsed }] : []),
      ...(reductionUsed > 0 ? [{ code: 'IA_TAX_REDUCTION', label: 'Income tax reduction (41-146)', amount: reductionUsed }] : []),
      ...(line13 ? [{ code: 'IA_126', label: 'Nonresident or part-year resident credit (IA 126)', amount: line13 }] : []),
      ...(line15 ? [{ code: 'IA_130', label: 'Out-of-state tax credit (IA 130)', amount: line15 }] : []),
    ],
    otherStateCredit: line15,
    otherTaxes: [...(line19 ? [{ code: 'IA_SCHOOL_SURTAX', label: 'School district / EMS surtax', amount: line19 }] : []), ...(line21 ? [{ code: 'IA_CHECKOFF', label: 'Check-off contributions', amount: line21 }] : [])],
    totalTax: line22,
    refundableCredits: line25 ? [{ code: 'IA_EITC', label: 'Iowa earned income tax credit', amount: line25 }] : [],
    checks,
    notes,
  };
}

const LABELS = Object.freeze({
  'Step 3a': 'Personal credit',
  'Step 3b': 'Credit for taxpayers 65 or older or blind',
  'Step 3c': 'Dependent credit',
  'Step 3d': 'Total exemption credits',
  '1a': 'Federal total income',
  '1b': 'Federal adjustments to income',
  '1c': 'Federal adjusted gross income',
  '1d': 'Federal standard or itemized deductions',
  '1e': 'Qualified business income deduction',
  '1f': 'Enhanced deduction for seniors (Schedule 1-A)',
  2: 'Federal taxable income',
  3: 'Net Iowa modifications (Schedule 1)',
  4: 'Iowa taxable income',
  5: 'Iowa tax',
  6: 'Iowa lump-sum tax',
  7: 'Total tax',
  8: 'Total exemption credit amount from Step 3',
  9: 'Tuition and textbook credit for dependents in grades K-12',
  10: 'Volunteer firefighter, EMS and reserve peace officer credit',
  11: 'Total credits',
  12: 'Balance after credits',
  13: 'Nonresident or part-year resident credit (IA 126)',
  14: 'Balance after IA 126 credit',
  15: 'Out-of-state tax credit (IA 130)',
  16: 'Balance after out-of-state tax credit',
  17: 'Other non-refundable Iowa credits (IA 148)',
  18: 'Balance after non-refundable credits',
  19: 'School district surtax or EMS surtax',
  20: 'Total state tax and local surtax',
  21: 'Contributions',
  22: 'Total state tax, local tax and contributions',
  23: 'Iowa fuel tax credit (IA 4136)',
  24: 'Child and dependent care or early childhood credit',
  25: 'Iowa earned income tax credit',
  26: 'Other refundable credits (IA 148)',
  27: 'Composite and PTET credit',
  28: 'Iowa income tax withheld',
  29: 'Estimated and other payments',
});

const Q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'IA',
  name: 'Iowa',
  built: true,
  forms: Object.freeze({ resident: 'IA 1040', partYear: 'IA 1040 with IA 126', nonresident: 'IA 1040 with IA 126' }),
  due: (taxYear) => `${Number(taxYear) + 1}-04-30`,
  questions: Object.freeze([
    Q('schoolDistrictNumber', 'text', 'Number of the Iowa school district you lived in on December 31 (0000 if you did not live in Iowa, 9999 if you moved out)', 'From the Iowa school district surtax table (41-027) or tax-mapper.iowa.gov.', { when: Object.freeze({ residency: ['full-year', 'part-year'] }) }),
    Q('schoolDistrictSurtaxRate', 'count', 'School district surtax rate for that district, in percent (for example 5)', 'From the table 41-027; for Appanoose, Cass, Pocahontas, Sac, Shelby and Winnebago counties it includes the 1% EMS surtax. IA 1040 line 19.', { when: Object.freeze({ residency: ['full-year', 'part-year'] }) }),
    Q('movedOutBeforeYearEnd', 'yesno', 'Part-year residents: did you move out of Iowa before December 31?', 'If yes, no school district surtax applies.', { when: Object.freeze({ residency: ['part-year'] }) }),
    Q('iowaExemptBondInterest', 'amount', 'Of your federally tax-exempt interest and exempt-interest dividends, how much is from bonds that Iowa law exempts?', 'Iowa adds back other state and municipal bond interest on Schedule 1 lines 1 and 2. Enter 0 if none.', { when: Object.freeze({ has: ['taxExemptInterest'] }) }),
    Q('militaryRetirement', 'amount', 'Military retirement pay included in your federal income', 'Subtracted on Schedule 1 line 4.', { when: Object.freeze({ has: ['retirementIncome'] }) }),
    Q('disabled', 'yesno', 'Are you disabled?', 'A disabled recipient under 55 can exclude pension and IRA income (Schedule 1 line 7).', { when: Object.freeze({ has: ['retirementIncome'] }) }),
    Q('spouseDisabled', 'yesno', 'Is your spouse disabled?', 'Schedule 1 line 7 retirement income exclusion.', { when: Object.freeze({ has: ['spouse', 'retirementIncome'] }) }),
    Q('survivorRetirement', 'yesno', 'Is your retirement income received as the surviving spouse of someone who would have qualified (55 or older or disabled), or from a deceased spouse\'s protection occupation pension?', 'Schedule 1 line 7.', { when: Object.freeze({ has: ['retirementIncome'] }) }),
    Q('spouseSurvivorRetirement', 'yesno', 'Is your spouse\'s retirement income received as a qualifying surviving spouse?', 'Schedule 1 line 7.', { when: Object.freeze({ has: ['spouse', 'retirementIncome'] }) }),
    Q('spouseIowaTaxableIncome', 'amount', 'Married filing separately: your spouse\'s Iowa taxable income (their IA 1040 line 4, plus their deductions)', 'Needed for the low-income exemption.', { when: Object.freeze({ filingStatus: ['mfs'] }) }),
    Q('tuitionTextbookExpenses', 'amount', 'Tuition and textbooks paid for dependents in K-12 at accredited Iowa schools or Iowa home instruction (not paid with Students First ESA funds)', 'IA 1040 line 9: 25% of up to $2,000 per dependent.', { when: Object.freeze({ has: ['dependents'] }) }),
    Q('tuitionTextbookDependents', 'count', 'Number of dependents with those tuition and textbook expenses', 'Caps the credit at $500 per dependent.', { when: Object.freeze({ has: ['dependents'], answer: { id: 'tuitionTextbookExpenses' } }) }),
    Q('checkoffContributions', 'amount', 'Contributions to the Fish and Wildlife Fund and the Child Abuse Prevention Fund', 'IA 1040 line 21; they reduce your refund or add to what you owe.'),
  ]),
  labels: LABELS,
  notCovered: Object.freeze([
    'Iowa lump-sum tax (line 6), Iowa net operating losses, bonus depreciation and section 179 modifications, and partnership and S corporation modifications',
    'Schedule 1 subtractions other than U.S. interest, military retirement, Social Security and the retirement income exclusion (529 contributions, health insurance deduction, capital gain deduction (IA 100), farm tenancy exclusion, active duty pay)',
    'Child and dependent care credit or early childhood development credit (line 24), fuel tax credit (IA 4136), volunteer firefighter/EMS credit and IA 148 credits',
    'Alternate tax for married filing separately (needs both spouses\' worksheets)',
    'Per-dependent limit of the tuition and textbook credit: MyCA caps total expenses at $2,000 times the number of dependents',
    'IA 130 credits for tax paid by pass-through entities or mutual funds (line 21)',
    'The school district surtax table itself: you give the rate for your district',
    'Underpayment penalty (IA 2210), penalty and interest',
  ]),
  compute,
});
