import { whole, positive, rateOf, ratio, check, lineTable, byStatus, sum } from '../state-kit.mjs';

const OWNERS = ['taxpayer', 'spouse'];

const applyRatio = (amount, share, places) => Math.round((whole(amount) * Math.round(share * 10 ** places)) / 10 ** places);

function exactTax(amount, brackets) {
  let units = 0;
  brackets.forEach((band, index) => {
    const low = band.overCents / 100;
    const high = index + 1 < brackets.length ? brackets[index + 1].overCents / 100 : Infinity;
    if (amount > low) units += (Math.min(amount, high) - low) * band.rateBp;
  });
  return Math.floor((units + 5000) / 10000);
}

export function alTax(amount, rule, filingStatus) {
  const income = positive(amount);
  const joint = filingStatus === 'mfj' || filingStatus === 'qss';
  if (income >= rule.tableBelow) return Math.round((joint ? rule.over100000Base.mfj : rule.over100000Base.other) + ((income - rule.tableBelow) * rule.over100000RateBp) / 10000);
  const override = rule.tableOverrides.find((item) => income >= item.from && income < item.to);
  if (override) return override.tax;
  const band = [...rule.tableBands].reverse().find((item) => income >= item.from);
  const low = band.from + Math.floor((income - band.from) / band.width) * band.width;
  return exactTax(low + band.width / 2, joint ? rule.brackets.mfj : rule.brackets.other);
}

export function alStandardDeduction(agi, filingStatus, deductions) {
  const table = byStatus(deductions.standardDeduction, filingStatus);
  const steps = agi > table.start ? Math.floor((agi - table.start) / table.step) : 0;
  return Math.max(table.minimum, table.maximum - steps * table.reduction);
}

function dependentAmount(agi, deductions) {
  return deductions.dependentExemption.find((item) => item.upTo === null || agi <= item.upTo).amount;
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function scheduleRS(ctx, answers, deductions, share) {
  const own = { taxpayer: 0, spouse: 0 };
  for (const form of ctx.forms.filter((item) => item.kind === '1099-R')) own[ownerOf(form)] += taxableOf(form);
  const out = {};
  let total = 0;
  for (const role of OWNERS) {
    const filer = ctx.filers.find((item) => item.role === role);
    const received = Math.round(own[role] * share);
    const exempt = Math.min(received, Math.round(positive(role === 'spouse' ? answers.spouseExemptRetirement : answers.exemptRetirement) * share));
    const taxable = received - exempt;
    const older = filer && filer.age !== null && filer.age >= deductions.retirementExclusion.age;
    const exclusion = older ? Math.min(deductions.retirementExclusion.amount, taxable) : 0;
    out[role] = { received, exempt, taxable, exclusion, net: taxable - exclusion };
    total += taxable - exclusion;
  }
  return { owners: out, total };
}

function federalTaxDeduction(ctx) {
  const lines = ctx.federal.lines;
  const line1 = whole(lines['22']);
  const line2 = whole(ctx.federal.schedules?.['8960']?.['17'] ?? ctx.federal.schedules?.[2]?.['12']);
  const line3 = line1 + line2;
  const credits = { '4a': whole(lines['27']), '4b': whole(lines['28']), '4c': whole(lines['29']), '4d': whole(lines['30']), '4e': whole(ctx.federal.schedules?.[3]?.['13a']) };
  const line5 = sum(Object.values(credits));
  const line6 = Math.max(0, line3 - line5);
  return { amount: line6, worksheet: lineTable({ 1: line1, 2: line2, 3: line3, ...credits, 5: line5, 6: line6 }) };
}

function vehicleInterest(ctx, agi, deductions) {
  const rule = deductions.vehicleInterest;
  const line1 = positive(ctx.answers.carLoanInterest);
  if (!line1) return 0;
  const line2 = Math.min(line1, rule.maximum);
  const start = ctx.filingStatus === 'mfj' ? rule.phaseStart.mfj : rule.phaseStart.other;
  const over = agi - start;
  if (over <= 0) return line2;
  return Math.max(0, line2 - Math.ceil(over / 1000) * rule.perThousand);
}

function scheduleA(ctx, agi, deductions, share) {
  const items = ctx.itemized;
  const scale = (value) => Math.round(positive(value) * share);
  const fica = sum(ctx.forms.filter((form) => form.kind === 'W-2'), (form) => positive(form.fields?.socialSecurityTax) + positive(form.fields?.medicareTax));
  const line1 = scale(items.medicalPaid);
  const line2 = agi;
  const line3 = rateOf(Math.max(0, agi), deductions.medicalFloorBasisPoints);
  const line4 = Math.max(0, line1 - line3);
  const line5 = scale(items.realEstateTaxes);
  const line6 = scale(fica + whole(ctx.federal.schedules?.[2]?.['4']));
  const line8 = scale(items.personalPropertyTaxes);
  const line9 = line5 + line6 + line8;
  const line10a = scale(items.mortgageInterest);
  const line11c = Math.round(vehicleInterest(ctx, agi, deductions) * share);
  const line14 = line10a + line11c;
  const line15 = scale(items.charityCash);
  const line16 = scale(items.charityNonCash);
  const line18 = line15 + line16;
  const line25 = scale(items.otherItemized);
  const line27 = line4 + line9 + line14 + line18 + line25;
  return { total: line27, lines: lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: 0, 8: line8, 9: line9, '10a': line10a, '11c': line11c, 14: line14, 15: line15, 16: line16, 18: line18, 25: line25, 27: line27 }) };
}

function overtimeDeduction(ctx, deductions) {
  if (!deductions.overtimeMaximum) return 0;
  const taxpayer = Math.min(deductions.overtimeMaximum, positive(ctx.answers.qualifiedOvertime));
  const spouse = ctx.filingStatus === 'mfj' ? Math.min(deductions.overtimeMaximum, positive(ctx.answers.spouseQualifiedOvertime)) : 0;
  return taxpayer + spouse;
}

function alWages(ctx) {
  return sum(ctx.w2, (row) => (row.state === 'AL' && row.stateWages !== null ? row.stateWages : row.wages));
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const deductions = reader.read('deductions');
  if (!rule || !deductions) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Alabama figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const items = income.adjustmentItems;
  const checks = [];
  const nonresident = filing.residency === 'nonresident';
  const partYear = filing.residency === 'part-year';
  const share = filing.residency === 'full-year' ? 1 : filing.share;
  const exemption = byStatus(deductions.personalExemption, ctx.filingStatus);
  const retirementForms = ctx.forms.filter((form) => form.kind === '1099-R' && taxableOf(form) > 0);
  if (retirementForms.some((form) => !form.fields?.iraSepSimple && (ownerOf(form) === 'spouse' ? answers.spouseExemptRetirement : answers.exemptRetirement) === undefined)) checks.push(check('error', 'AL_EXEMPT_RETIREMENT', 'Alabama does not tax pensions from defined benefit plans, military retirement, or Alabama and federal civil service retirement. MyCA cannot tell from the 1099-R which of your pensions are exempt.', 'Answer how much of each person\'s taxable pensions is from an exempt plan (0 if none).'));
  if (income.taxExemptInterest > 0 && answers.otherStateMunicipalInterest === undefined && !nonresident) checks.push(check('error', 'AL_MUNICIPAL_INTEREST', 'Alabama taxes interest on bonds of other states and their localities.', 'Answer how much of your tax-exempt interest came from bonds issued outside Alabama (0 if none).'));
  if (answers.useTax === undefined) checks.push(check('warning', 'AL_USE_TAX', 'Alabama asks for consumer use tax on purchases from out-of-state sellers that did not collect Alabama tax, or a certification that none is due.', 'Answer the use tax question (0 if none).'));
  if (ctx.filingStatus === 'mfs') checks.push(check('warning', 'AL_MFS_SAME_DEDUCTION', 'If you are married filing separately, both spouses must use the same deduction method unless you lived apart all year.', ''));
  const fed = federalTaxDeduction(ctx);
  const overtime = overtimeDeduction(ctx, deductions);
  const otherState = Math.round(positive(answers.otherStateMunicipalInterest) * share);
  const college = Math.min(positive(answers.collegeSavings), ctx.filingStatus === 'mfj' ? deductions.collegeSavingsMaximum.mfj : deductions.collegeSavingsMaximum.other);
  if (ctx.taxYear >= '2026') checks.push(check('info', 'AL_2026_FORM_PENDING', 'Alabama has not published the 2026 Form 40; the 2026 return follows the 2025 lines with the statutory amounts, and the new overtime deduction (Act 2026, HB527) is shown on its own line.'));
  if (!nonresident) {
    const sourced = filing.sourced;
    const rs = scheduleRS(ctx, answers, deductions, share);
    const line5b = partYear ? whole(sourced.wages) : alWages(ctx);
    const line6 = (partYear ? whole(sourced.taxableInterest) - whole(sourced.usObligationInterest) + whole(sourced.ordinaryDividends) : income.taxableInterest - income.usObligationInterest + income.ordinaryDividends) + otherState;
    const part1 = { 1: 0, 2: whole(sourced.businessIncome), 3: whole(sourced.capitalGain), 4: rs.total, 5: 0, 6: 0, 7: whole(sourced.otherIncome) };
    part1[8] = sum(Object.values(part1));
    const line7 = part1[8];
    const line8 = line5b + line6 + line7;
    const scale = (value) => Math.round(positive(value) * share);
    const part2 = { 1: scale(items.ira), 2: scale(items.seRetirement), 3: scale(items.earlyWithdrawal), 4: 0, 5: 0, 6: 0, 7: scale(items.seHealth), 8: college, 12: scale(items.hsa) };
    part2[16] = sum(Object.values(part2));
    const line9 = part2[16];
    const line10 = line8 - line9;
    const standard = alStandardDeduction(line10, ctx.filingStatus, deductions);
    const sa = scheduleA(ctx, line10, deductions, share);
    const itemize = sa.total > standard;
    const line11 = itemize ? sa.total : standard;
    const line12 = partYear ? (income.agi > 0 ? Math.round((fed.amount * Math.max(0, line10)) / income.agi) : 0) : fed.amount;
    const line13 = exemption;
    const perDependent = dependentAmount(line10, deductions);
    const line14 = ctx.dependents.length * perDependent;
    const line15 = line11 + line12 + line13 + line14 + overtime;
    const line16 = Math.max(0, line10 - line15);
    const line17 = alTax(line16, rule, ctx.filingStatus);
    const worksheets = [];
    for (const other of filing.otherStates || []) {
      const otherIncome = Math.min(Math.max(0, line10), positive(other.income));
      const limit = line10 > 0 ? Math.round((line17 * otherIncome) / line10) : 0;
      worksheets.push({ state: other.state, income: otherIncome, tax: positive(other.tax), limit, credit: Math.min(limit, positive(other.tax)) });
    }
    if (partYear) checks.push(check('warning', 'AL_PART_YEAR_OTHER_STATE_CREDIT', 'A part-year resident may claim Schedule CR credit for tax paid to another state on income earned while an Alabama resident; MyCA does not work it out for part-year residents.', 'Work out Schedule CR with the other state\'s return.'));
    if (partYear && itemize) checks.push(check('warning', 'AL_PART_YEAR_ITEMIZED', 'Part-year residents itemize only what was paid while an Alabama resident; MyCA split your itemized deductions by days.', 'Check the Schedule A amounts against what you paid while living in Alabama.'));
    const credit = Math.min(line17, sum(worksheets, (item) => item.credit));
    const line18 = line17 - credit;
    const line19 = positive(answers.useTax);
    const line21 = line18 + line19;
    const lines = lineTable({ 1: ctx.filingStatus === 'single' ? exemption : 0, 2: ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss' ? exemption : 0, 3: ctx.filingStatus === 'mfs' ? exemption : 0, 4: ctx.filingStatus === 'hoh' ? exemption : 0, '5a': filing.payments.withheld, '5b': line5b, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, '11a': itemize ? 1 : 0, '11b': itemize ? 0 : 1, 12: line12, 13: line13, 14: line14, ...(overtime ? { overtimeDeduction: overtime } : {}), 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: 0, 21: line21, 22: filing.payments.withheld, 23: filing.payments.estimated + filing.payments.extension });
    const schedules = { 'Part I': lineTable(part1), 'Part II': lineTable(part2), 'Part III': lineTable({ 1: ctx.dependents.length, 2: line14 }), 'Federal tax deduction worksheet': fed.worksheet };
    if (rs.owners.taxpayer.received || rs.owners.spouse.received) schedules.RS = lineTable({ taxpayerTaxable: rs.owners.taxpayer.taxable, taxpayerExclusion: rs.owners.taxpayer.exclusion, spouseTaxable: rs.owners.spouse.taxable, spouseExclusion: rs.owners.spouse.exclusion, total: rs.total });
    if (itemize) schedules.A = sa.lines;
    for (const sheet of worksheets) schedules[`CR ${sheet.state}`] = lineTable({ otherStateIncome: sheet.income, alabamaIncome: line10, alabamaTax: line17, limit: sheet.limit, otherStateTax: sheet.tax, credit: sheet.credit });
    if (credit) schedules.OC = lineTable({ CR: credit });
    return {
      form: 'Form 40',
      lines,
      schedules,
      stateIncome: line10,
      taxableIncome: line16,
      taxBeforeCredits: line17,
      nonrefundableCredits: credit ? [{ code: 'AL_SCHEDULE_CR', label: 'Credit for taxes paid to other states (Schedule CR)', amount: credit }] : [],
      otherStateCredit: credit,
      otherTaxes: line19 ? [{ code: 'AL_USE_TAX', label: 'Consumer use tax', amount: line19 }] : [],
      totalTax: line21,
      refundableCredits: [],
      checks,
    };
  }
  const sourced = filing.sourced;
  const B5 = income.wages;
  const C5 = whole(sourced.wages);
  const partI = {
    B: { 1: income.taxableInterest - income.usObligationInterest + income.ordinaryDividends + positive(answers.otherStateMunicipalInterest), 2: 0, 3: income.iraTaxable + income.pensionTaxable, 4: income.businessIncome, 5: income.capitalGain, 6: 0, 7: 0, 8: income.otherIncome },
    C: { 1: whole(sourced.taxableInterest) - whole(sourced.usObligationInterest) + whole(sourced.ordinaryDividends), 2: 0, 3: whole(sourced.iraTaxable) + whole(sourced.pensionTaxable), 4: whole(sourced.businessIncome), 5: whole(sourced.capitalGain), 6: 0, 7: 0, 8: whole(sourced.otherIncome) },
  };
  partI.B[9] = sum(Object.values(partI.B));
  partI.C[9] = sum(Object.values(partI.C));
  const B6 = partI.B[9];
  const C6 = partI.C[9];
  const B7 = B5 + B6;
  const C7 = C5 + C6;
  const compShare = income.wages + income.businessIncome > 0 ? Math.max(0, Math.min(1, (C5 + whole(sourced.businessIncome)) / (income.wages + income.businessIncome))) : 0;
  const partII = { B: { 1: items.ira + items.seRetirement, 2: items.earlyWithdrawal, 3: 0, 4: items.seHealth, 5: items.hsa, 6: 0, 7: 0 } };
  partII.C = { 1: Math.round(partII.B[1] * compShare), 2: Math.round(partII.B[2] * (partI.B[1] > 0 ? Math.max(0, Math.min(1, partI.C[1] / partI.B[1])) : 0)), 3: 0, 4: Math.round(partII.B[4] * compShare), 5: Math.round(partII.B[5] * compShare), 6: 0, 7: 0 };
  partII.B[8] = sum(Object.values(partII.B));
  partII.C[8] = sum(Object.values(partII.C));
  const B9 = B7 - partII.B[8];
  const C9 = C7 - partII.C[8];
  const line10 = C9 < 0 ? 0 : ratio(C9, B9, { places: 4 });
  const B12 = B9;
  const C12 = C9;
  const standard = alStandardDeduction(B12, ctx.filingStatus, deductions);
  const sa = scheduleA(ctx, B12, deductions, 1);
  const itemize = sa.total > standard;
  const line13 = applyRatio(itemize ? sa.total : standard, line10, 4);
  const line14 = applyRatio(fed.amount, line10, 4);
  const line15 = applyRatio(exemption, line10, 4);
  const line16 = applyRatio(ctx.dependents.length * dependentAmount(B12, deductions), line10, 4);
  const overtimeShare = applyRatio(overtime, line10, 4);
  const line17 = line13 + line14 + line15 + line16 + overtimeShare;
  const line18 = Math.max(0, C12 - line17);
  const line19 = alTax(line18, rule, ctx.filingStatus);
  const line20 = line19;
  if (overtime) checks.push(check('warning', 'AL_NONRESIDENT_OVERTIME', 'MyCA prorated the 2026 overtime deduction by your Alabama percentage; the 2026 Form 40NR may treat it differently once published.', ''));
  const lines = lineTable({ '5A': filing.payments.withheld, '5B': B5, '5C': C5, '6B': B6, '6C': C6, '7B': B7, '7C': C7, '8B': partII.B[8], '8C': partII.C[8], '9B': B9, '9C': C9, 10: line10, '11C': 0, '12B': B12, '12C': C12, 13: line13, 14: line14, 15: line15, 16: line16, ...(overtimeShare ? { overtimeDeduction: overtimeShare } : {}), 17: line17, 18: line18, 19: line19, 20: line20, 21: filing.payments.withheld, 22: filing.payments.estimated + filing.payments.extension });
  const schedules = { 'Part I': lineTable(Object.fromEntries(Object.keys(partI.B).flatMap((key) => [[`${key}B`, partI.B[key]], [`${key}C`, partI.C[key]]]))), 'Part II': lineTable(Object.fromEntries(Object.keys(partII.B).flatMap((key) => [[`${key}B`, partII.B[key]], [`${key}C`, partII.C[key]]]))), 'Part IV': lineTable({ 4: fed.amount, 6: line10, 7: line14 }), 'Part V': lineTable({ 1: ctx.dependents.length, 2: ctx.dependents.length * dependentAmount(B12, deductions), 3: line10, 4: line16 }), 'Federal tax deduction worksheet': fed.worksheet };
  if (itemize) schedules.A = sa.lines;
  if (partII.C[8]) checks.push(check('warning', 'AL_NONRESIDENT_ADJUSTMENTS', 'Alabama allows nonresidents only the part of each adjustment that relates to Alabama income; MyCA split IRA, SEP, health insurance and HSA amounts by your share of Alabama wages and business income.', 'Check Part II column C.'));
  const useTax = positive(answers.useTax);
  return {
    form: 'Form 40NR',
    lines,
    schedules,
    stateIncome: C12,
    taxableIncome: line18,
    taxBeforeCredits: line19,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: useTax ? [{ code: 'AL_USE_TAX', label: 'Consumer use tax', amount: useTax }] : [],
    totalTax: line20 + useTax,
    refundableCredits: [],
    checks,
  };
}

export const STATE = Object.freeze({
  code: 'AL',
  name: 'Alabama',
  built: true,
  forms: Object.freeze({ resident: 'Form 40', partYear: 'Form 40', nonresident: 'Form 40NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'exemptRetirement', kind: 'amount', text: 'Part of your taxable pensions that Alabama does not tax', help: 'Pensions from defined benefit plans, military retirement, Alabama state (RSA/TRS) and federal civil service retirement are exempt in Alabama. Enter 0 if none.' }),
    Object.freeze({ id: 'spouseExemptRetirement', kind: 'amount', text: 'Part of your spouse\'s taxable pensions that Alabama does not tax', help: 'Joint returns: defined benefit, military and public pensions of your spouse. Enter 0 if none.' }),
    Object.freeze({ id: 'otherStateMunicipalInterest', kind: 'amount', text: 'Tax-exempt interest from bonds of states and localities other than Alabama', help: 'Part of the tax-exempt interest on your federal return; Alabama taxes it. Enter 0 if none.' }),
    Object.freeze({ id: 'collegeSavings', kind: 'amount', text: 'Payments to Alabama CollegeCounts 529 Fund or Alabama PACT', help: 'Deductible up to $5,000 ($10,000 on a joint return).' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Alabama consumer use tax on purchases from out-of-state sellers', help: 'Purchases on which the seller did not collect Alabama tax (use the worksheet in the Form 40 booklet). Enter 0 to certify none is due.' }),
  ]),
  notCovered: Object.freeze([
    'Rents, royalties, partnerships, farm income and alimony (Part I lines 1, 5 and 6)',
    'Schedule RS cost-basis differences and IRA basis, and Schedule B detail',
    'Adoption, moving, retrofit, catastrophe savings, first-time home buyer, firefighter and ABLE adjustments',
    'Casualty losses, unreimbursed employee expenses and other miscellaneous itemized deductions',
    'Schedule OC credits other than Schedule CR (for example the Alabama accountability, rural physician and adoption credits) and refundable credits',
    'Schedule CR credit for part-year residents and for taxes paid to foreign countries',
    'Married couples filing jointly federally but separately in Alabama (federal tax deduction split)',
    'Occupational and city license taxes (Birmingham, Bessemer, Gadsden and others) are filed with the city, not on Form 40',
    'Estimated tax penalty (Form 2210AL) and donation check-offs',
  ]),
  compute,
});
