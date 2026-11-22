import { whole, positive, rateOf, ratio, check, lineTable, sum, yesNo } from '../state-kit.mjs';

const has = (answers, key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';
const forms = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => {
  const raw = form.fields?.taxableAmount;
  return raw === undefined || raw === null || raw === '' ? positive(form.fields?.grossDistribution) : positive(raw);
};

function byOwner(ctx) {
  const wages = { taxpayer: 0, spouse: 0 };
  for (const row of ctx.w2) wages[row.owner] += row.wages;
  const retirement = { taxpayer: 0, spouse: 0 };
  for (const form of forms(ctx, '1099-R')) retirement[ownerOf(form)] += taxableOf(form);
  const benefits = { taxpayer: 0, spouse: 0 };
  for (const form of forms(ctx, 'SSA-1099')) benefits[ownerOf(form)] += positive(form.fields?.netBenefits);
  const totalBenefits = benefits.taxpayer + benefits.spouse;
  const ssTaxable = whole(ctx.income.socialSecurityTaxable);
  const spouseSs = totalBenefits > 0 ? Math.round((ssTaxable * benefits.spouse) / totalBenefits) : 0;
  return { wages, retirement, socialSecurity: { taxpayer: ssTaxable - spouseSs, spouse: spouseSs } };
}

function familySizePercent(table, size, mgi) {
  const rows = table[String(size)] || [];
  const row = rows.find((item) => mgi <= item.notOver);
  return row ? row.percent : 0;
}

function personalCredits(ctx, credits, answers) {
  const of = (role) => {
    const filer = ctx.filers.find((item) => item.role === role);
    if (!filer) return 0;
    const guard = role === 'spouse' ? yesNo(answers.spouseNationalGuard) : yesNo(answers.nationalGuard);
    const amount = (filer.age !== null && filer.age >= 65 ? credits.personalAge65 : 0) + (filer.blind ? credits.personalBlind : 0) + (guard ? credits.personalNationalGuard : 0);
    return Math.min(amount, credits.personalMaximumPerPerson);
  };
  return { taxpayer: of('taxpayer'), spouse: of('spouse') };
}

function itemizedTotal(ctx) {
  const parts = ctx.itemized;
  return positive(parts.mortgageInterest) + positive(parts.charityCash) + positive(parts.charityNonCash);
}

function otherStateCredit(filing, answers, rule, taxable) {
  const list = filing.otherStates.length ? filing.otherStates : positive(answers.otherStateTax) ? [{ state: 'other', tax: positive(answers.otherStateTax), income: positive(answers.otherStateIncome) }] : [];
  let total = 0;
  for (const other of list) {
    const savings = rateOf(taxable, rule.rateBasisPoints) - rateOf(Math.max(0, taxable - positive(other.income)), rule.rateBasisPoints);
    total += Math.min(savings, positive(other.tax));
  }
  return total;
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const mods = reader.read('modifications');
  const credits = reader.read('credits');
  if (!rule || !mods || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Kentucky figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const checks = [];
  const notes = [];
  const owners = byOwner(ctx);
  const muni = has(answers, 'outOfStateMuniInterest') ? positive(answers.outOfStateMuniInterest) : whole(income.taxExemptInterest);
  if (!has(answers, 'outOfStateMuniInterest') && income.taxExemptInterest > 0 && filing.residency !== 'nonresident') checks.push(check('warning', 'KY_MUNI_INTEREST_ASSUMED', 'All of your federally tax-exempt interest is added on Schedule M line 1 as interest on bonds of other states; interest on Kentucky bonds is exempt.', 'Answer how much tax-exempt interest came from non-Kentucky bonds.'));
  const military = positive(answers.activeDutyMilitaryPay);
  const pension = (amount) => Math.min(positive(amount), mods.pensionExclusion);
  const personal = personalCredits(ctx, credits, answers);
  const kyItemized = itemizedTotal(ctx);
  const childCareFederal = positive(answers.federalChildCareCredit);
  const qualifyingChildren = ctx.dependents.filter((item) => item.qualifyingChild).length;
  const married = ctx.filingStatus === 'mfj' || ctx.filingStatus === 'mfs';
  const livesWithSpouse = ctx.filingStatus === 'mfj' || (ctx.filingStatus === 'mfs' && ctx.answers.livedWithSpouse !== false);
  const familySize = Math.min(credits.familySizeMaximum, 1 + (married && livesWithSpouse ? 1 : 0) + qualifyingChildren);
  const familyCredit = (line19, kyAgi) => {
    if (ctx.filingStatus === 'mfs' && livesWithSpouse) {
      checks.push(check('warning', 'KY_FAMILY_SIZE_MFS', 'On separate returns while living together, the family size tax credit counts your spouse\'s income too; MyCA does not have it, so no family size credit is included.', 'Have the credit worked out with both incomes on Schedule ITC Section C.'));
      return { mgi: 0, percent: 0, amount: 0 };
    }
    const mgi = Math.max(Math.max(0, income.agi) + whole(income.taxExemptInterest), Math.max(0, kyAgi));
    const percent = familySizePercent(credits.familySizeTable, familySize, mgi);
    return { mgi, percent, amount: Math.round((line19 * percent) / 100) };
  };
  const useTax = positive(answers.useTax);
  if (!has(answers, 'useTax')) checks.push(check('warning', 'KY_USE_TAX', 'Kentucky asks for use tax on out-of-state purchases with no Kentucky sales tax (line 27, 6 percent).', 'Answer the use tax question (0 if none).'));
  if (resident) {
    checks.push(check('info', 'KY_LOCAL_OCCUPATIONAL_TAX', 'Kentucky city and county occupational license taxes are not on Form 740; they are withheld by your employer or filed with the city or county.', 'If you are self-employed or your employer did not withhold, file the local return.'));
    const spouseOwn = owners.wages.spouse + owners.retirement.spouse + owners.socialSecurity.spouse + positive(answers.spouseOtherIncome);
    const combined = ctx.filingStatus === 'mfj' && !yesNo(answers.jointReturn) && spouseOwn > 0 && income.agi - spouseOwn > 0;
    const status = ctx.filingStatus === 'mfj' ? (combined ? 2 : 3) : ctx.filingStatus === 'mfs' ? 4 : 1;
    const columns = combined ? ['A', 'B'] : ['B'];
    const fed = combined ? { A: spouseOwn, B: income.agi - spouseOwn } : { B: income.agi };
    const additions = { A: 0, B: muni };
    const pensionExclusion = { A: combined ? pension(owners.retirement.spouse) : 0, B: combined ? pension(owners.retirement.taxpayer) : pension(owners.retirement.taxpayer) + pension(owners.retirement.spouse) };
    const ss = { A: combined ? owners.socialSecurity.spouse : 0, B: combined ? owners.socialSecurity.taxpayer : whole(income.socialSecurityTaxable) };
    const sm = {};
    const col = {};
    for (const key of columns) {
      const line7 = key === 'B' ? whole(income.stateRefundTaxable) : 0;
      const line8 = key === 'B' ? whole(income.usObligationInterest) : 0;
      const line13 = key === 'B' ? military : 0;
      const line15 = line7 + line8 + pensionExclusion[key] + ss[key] + line13;
      sm[key] = { 1: additions[key], 6: additions[key], 7: line7, 8: line8, 9: pensionExclusion[key], 10: ss[key], 13: line13, 15: line15, 17: line15 };
      col[key] = { 5: fed[key], 6: additions[key], 7: fed[key] + additions[key], 8: line15, 9: fed[key] + additions[key] - line15 };
    }
    const kyAgiTotal = sum(columns, (key) => col[key][9]);
    const standardTotal = rule.standardDeduction * columns.length;
    const itemize = kyItemized > standardTotal;
    for (const key of columns) {
      const share = combined ? ratio(Math.max(0, col[key][9]), Math.max(0, kyAgiTotal), { places: 4 }) : 1;
      col[key][10] = itemize ? Math.round(kyItemized * share) : rule.standardDeduction;
      col[key][11] = Math.max(0, col[key][9] - col[key][10]);
      col[key][12] = rateOf(col[key][11], rule.rateBasisPoints);
      col[key][13] = 0;
      col[key][14] = col[key][12];
    }
    if (combined && itemize) col.B[10] = kyItemized - col.A[10];
    if (combined && itemize) {
      col.B[11] = Math.max(0, col.B[9] - col.B[10]);
      col.B[12] = rateOf(col.B[11], rule.rateBasisPoints);
      col.B[14] = col.B[12];
    }
    const taxableTotal = sum(columns, (key) => col[key][11]);
    let creditLeft = Math.min(otherStateCredit(filing, answers, rule, taxableTotal), sum(columns, (key) => col[key][14]));
    const otherCredit = creditLeft;
    for (const key of ['B', 'A'].filter((item) => columns.includes(item))) {
      col[key][15] = Math.min(creditLeft, col[key][14]);
      creditLeft -= col[key][15];
      col[key][16] = col[key][14] - col[key][15];
    }
    if (otherCredit) checks.push(check('info', 'KY_OTHER_STATE_CREDIT', 'Credit for tax paid to another state (Schedule ITC line 6, Worksheet A) is the smaller of the Kentucky tax saved by leaving out that income and the other state\'s tax. Enclose the other state\'s return.'));
    const personalBy = combined ? { A: personal.spouse, B: personal.taxpayer } : { B: personal.taxpayer + personal.spouse };
    for (const key of columns) {
      col[key][17] = personalBy[key];
      col[key][18] = Math.max(0, col[key][16] - col[key][17]);
    }
    const line19 = sum(columns, (key) => col[key][18]);
    const family = familyCredit(line19, kyAgiTotal);
    const line21 = family.amount;
    const line22 = line19 - line21;
    const line23 = 0;
    const line24 = rateOf(childCareFederal, credits.childCareBasisPoints);
    const line26 = Math.max(0, line22 - line23 - line24);
    const line27 = useTax;
    const line28 = line26 + line27;
    const lines = {};
    for (const key of columns) for (const [line, value] of Object.entries(col[key])) lines[columns.length > 1 ? `${line}${key}` : line] = value;
    Object.assign(lines, { filingStatus: status, 19: line19, 20: familySize, 21: line21, 22: line22, 23: line23, 24: line24, 26: line26, 27: line27, 28: line28, 30: line28, '31a': filing.payments.withheld, '31b': filing.payments.estimated + filing.payments.extension, 32: filing.payments.withheld + filing.payments.estimated + filing.payments.extension });
    const scheduleM = {};
    for (const key of columns) for (const [line, value] of Object.entries(sm[key])) scheduleM[columns.length > 1 ? `${line}${key}` : line] = value;
    if (combined) notes.push('Filed as status 2, married filing separately on a combined return: each spouse gets the $' + rule.standardDeduction.toLocaleString('en-US') + ' standard deduction. W-2 wages, retirement income and Social Security are split by whose form it is; other income is in your column unless you gave your spouse\'s share.');
    if (ctx.taxYear === '2025') notes.push('Kentucky follows the Internal Revenue Code as of December 31, 2024, so the 2025 federal tips, overtime and car loan interest deductions do not apply; they are below federal AGI and do not change line 5.');
    return {
      form: '740',
      lines: lineTable(lines),
      schedules: { M: lineTable(scheduleM), ITC: lineTable({ 6: otherCredit, '9-12': personal.taxpayer + personal.spouse, familySize, mgi: family.mgi, familyPercent: family.percent }), ...(itemize ? { A: lineTable({ interest: positive(ctx.itemized.mortgageInterest), contributions: positive(ctx.itemized.charityCash) + positive(ctx.itemized.charityNonCash), 15: kyItemized }) } : {}) },
      stateIncome: kyAgiTotal,
      taxableIncome: taxableTotal,
      taxBeforeCredits: sum(columns, (key) => col[key][14]),
      nonrefundableCredits: [...(otherCredit ? [{ code: 'KY_OTHER_STATE', label: 'Credit for tax paid to another state', amount: otherCredit }] : []), ...(personal.taxpayer + personal.spouse ? [{ code: 'KY_PERSONAL', label: 'Personal tax credits', amount: sum(columns, (key) => Math.min(col[key][17], col[key][16])) }] : []), ...(line21 ? [{ code: 'KY_FAMILY_SIZE', label: 'Family size tax credit', amount: line21 }] : []), ...(line24 ? [{ code: 'KY_CHILD_CARE', label: 'Child and dependent care credit', amount: Math.min(line24, line22) }] : [])],
      otherStateCredit: otherCredit,
      otherTaxes: line27 ? [{ code: 'KY_USE_TAX', label: 'Kentucky use tax', amount: line27 }] : [],
      totalTax: line28,
      refundableCredits: [],
      checks,
      notes,
    };
  }
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const line8 = income.agi;
  const retirementSourced = whole(sourced.iraTaxable) + whole(sourced.pensionTaxable);
  const retirementTotal = owners.retirement.taxpayer + owners.retirement.spouse;
  const spouseRetirement = retirementTotal > 0 ? Math.round((retirementSourced * owners.retirement.spouse) / retirementTotal) : 0;
  const npPension = pension(retirementSourced - spouseRetirement) + pension(spouseRetirement);
  const npAdditions = partYear ? muni : 0;
  const npSubtractions = whole(sourced.stateRefundTaxable) + whole(sourced.usObligationInterest) + npPension + whole(sourced.socialSecurityTaxable) + military;
  const line9 = filing.sourcedAgi + npAdditions - npSubtractions;
  const line7 = line8 <= 0 ? (line9 > 0 ? 1 : 0) : ratio(Math.max(0, line9), line8, { places: 4 });
  const line10 = rule.standardDeduction;
  const line11 = kyItemized;
  const line12 = Math.round(line11 * line7);
  const itemize = line12 > line10;
  const line13 = Math.max(0, line9 - (itemize ? line12 : line10));
  const line14 = rateOf(line13, rule.rateBasisPoints);
  const line15 = 0;
  const line16 = line14 - line15;
  const line17 = personal.taxpayer + personal.spouse;
  const line18 = Math.round(line17 * line7);
  const line19 = Math.max(0, line16 - line18);
  const family = familyCredit(line19, line9);
  const line21 = family.amount;
  const line22 = line19 - line21;
  const line24 = partYear ? Math.round(rateOf(childCareFederal, credits.childCareBasisPoints) * filing.share) : 0;
  if (partYear && childCareFederal) checks.push(check('warning', 'KY_CHILD_CARE_PRORATED', 'A part-year resident gets the child and dependent care credit only for care paid while a Kentucky resident; MyCA splits it by the days you lived in Kentucky.', 'Work out the 740-NP child care worksheet with the expenses you paid while a resident.'));
  if (filing.residency === 'nonresident' && childCareFederal) checks.push(check('info', 'KY_CHILD_CARE_NONRESIDENT', 'Full-year nonresidents cannot take the Kentucky child and dependent care credit.'));
  const line26 = Math.max(0, line22 - line24);
  const line27 = useTax;
  const line28 = line26 + line27;
  notes.push('Form 740-NP: tax is figured on Kentucky income only; the standard deduction is not prorated, itemized deductions and personal tax credits are multiplied by the Kentucky percentage on line 7.');
  return {
    form: '740-NP',
    lines: lineTable({ 7: line7, 8: line8, 9: line9, 10: itemize ? 0 : line10, 11: itemize ? line11 : 0, 12: itemize ? line12 : 0, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: familySize, 21: line21, 22: line22, 23: 0, 24: line24, 26: line26, 27: line27, 28: line28, '31a': filing.payments.withheld, '31b': filing.payments.estimated + filing.payments.extension }),
    schedules: { M: lineTable({ 1: npAdditions, 7: whole(sourced.stateRefundTaxable), 8: whole(sourced.usObligationInterest), 9: npPension, 10: whole(sourced.socialSecurityTaxable), 13: military }), ITC: lineTable({ '9-12': line17, familySize, mgi: family.mgi, familyPercent: family.percent }) },
    stateIncome: line9,
    taxableIncome: line13,
    taxBeforeCredits: line14,
    nonrefundableCredits: [...(line18 ? [{ code: 'KY_PERSONAL', label: 'Personal tax credits', amount: Math.min(line18, line16) }] : []), ...(line21 ? [{ code: 'KY_FAMILY_SIZE', label: 'Family size tax credit', amount: line21 }] : []), ...(line24 ? [{ code: 'KY_CHILD_CARE', label: 'Child and dependent care credit', amount: Math.min(line24, line22) }] : [])],
    otherStateCredit: 0,
    otherTaxes: line27 ? [{ code: 'KY_USE_TAX', label: 'Kentucky use tax', amount: line27 }] : [],
    totalTax: line28,
    refundableCredits: [],
    checks,
    notes,
  };
}

const FORM_740_LABELS = Object.freeze({
  filingStatus: 'Filing status',
  5: 'Federal adjusted gross income',
  6: 'Additions from Schedule M',
  7: 'Add lines 5 and 6',
  8: 'Subtractions from Schedule M',
  9: 'Kentucky adjusted gross income',
  10: 'Standard deduction or itemized deductions',
  11: 'Taxable income',
  12: 'Tax',
  13: 'Tax from Form 4972-K, Schedule RC-R or Schedule DS-R',
  14: 'Add lines 12 and 13',
  15: 'Credits from Schedule ITC, Section A',
  16: 'Subtract line 15 from line 14',
  17: 'Personal tax credits from Schedule ITC, Section B',
  18: 'Subtract line 17 from line 16',
  19: 'Tax in columns A and B, line 18',
  20: 'Family size',
  21: 'Family size tax credit',
  22: 'Subtract line 21 from line 19',
  23: 'Education tuition tax credit',
  24: 'Child and dependent care credit',
  26: 'Income tax liability',
  27: 'Kentucky use tax',
  28: 'Total tax liability',
  30: 'Add lines 28 and 29',
  '31a': 'Kentucky income tax withheld',
  '31b': 'Kentucky estimated tax and extension payments',
  32: 'Total payments',
});

const FORM_740_COLUMN_LINES = Object.freeze(['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']);

const FORM_740_COLUMN_LABELS = Object.freeze(Object.fromEntries(FORM_740_COLUMN_LINES.flatMap((line) => [[`${line}A`, `${FORM_740_LABELS[line]} (spouse, column A)`], [`${line}B`, `${FORM_740_LABELS[line]} (you, column B)`]])));

const FORM_740_NP_LABELS = Object.freeze({
  7: 'Kentucky percentage (Section B, line 33)',
  8: 'Federal adjusted gross income',
  9: 'Kentucky adjusted gross income',
  10: 'Standard deduction (not prorated)',
  11: 'Itemized deductions from Kentucky Schedule A',
  12: 'Itemized deductions times the Kentucky percentage',
  13: 'Taxable income',
  14: 'Tax',
  15: 'Credits from Schedule ITC, Section A',
  16: 'Subtract line 15 from line 14',
  17: 'Personal tax credits from Schedule ITC, Section B',
  18: 'Personal tax credits times the Kentucky percentage',
  19: 'Subtract line 18 from line 16',
  20: 'Family size',
  21: 'Family size tax credit',
  22: 'Subtract line 21 from line 19',
  23: 'Education tuition tax credit',
  24: 'Child and dependent care credit',
  26: 'Income tax liability',
  27: 'Kentucky use tax',
  28: 'Total tax liability',
  '31a': 'Kentucky income tax withheld',
  '31b': 'Kentucky estimated tax and extension payments',
});

const kentuckyLabels = (taxYear, residency, form) => (form === '740-NP' ? FORM_740_NP_LABELS : { ...FORM_740_LABELS, ...FORM_740_COLUMN_LABELS });

export const STATE = Object.freeze({
  code: 'KY',
  name: 'Kentucky',
  built: true,
  forms: Object.freeze({ resident: '740', partYear: '740-NP', nonresident: '740-NP' }),
  questions: Object.freeze([
    Object.freeze({ id: 'outOfStateMuniInterest', when: { residency: ['full-year', 'part-year'], has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from bonds of states other than Kentucky', help: 'Added on Schedule M line 1. Left blank, all federally tax-exempt interest is added.' }),
    Object.freeze({ id: 'federalChildCareCredit', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Child and dependent care credit on your federal Form 2441, line 11', help: 'Kentucky gives 20 percent of it on Form 740 line 24.' }),
    Object.freeze({ id: 'nationalGuard', kind: 'yesno', text: 'Were you a member of the Kentucky National Guard on December 31?', help: '$20 personal tax credit on Schedule ITC.' }),
    Object.freeze({ id: 'spouseNationalGuard', when: { has: ['spouse'] }, kind: 'yesno', text: 'Was your spouse a member of the Kentucky National Guard on December 31?', help: '$20 personal tax credit on Schedule ITC.' }),
    Object.freeze({ id: 'activeDutyMilitaryPay', kind: 'amount', text: 'Active duty military pay included in federal AGI', help: 'Subtracted on Schedule M line 13.' }),
    Object.freeze({ id: 'spouseOtherIncome', when: { residency: ['full-year'], filingStatus: ['mfj'] }, kind: 'amount', text: 'Your spouse\'s share of income other than W-2 wages, retirement and Social Security', help: 'For filing status 2 (separately on a combined return), where each spouse reports their own income.' }),
    Object.freeze({ id: 'jointReturn', when: { residency: ['full-year'], filingStatus: ['mfj'] }, kind: 'yesno', text: 'File a joint Kentucky return (status 3) instead of separately on a combined return (status 2)?', help: 'Status 2 usually gives a lower tax when both spouses have income; MyCA uses it unless you say yes.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Kentucky use tax owed on out-of-state purchases', help: '6 percent of untaxed out-of-state purchases (line 27). Enter 0 if none.' }),
    Object.freeze({ id: 'otherStateTax', when: { residency: ['full-year'] }, kind: 'amount', text: 'Income tax you paid to another state whose return MyCA does not prepare', help: 'The tax on that state\'s return, not the amount withheld.' }),
    Object.freeze({ id: 'otherStateIncome', when: { residency: ['full-year'], answer: { id: 'otherStateTax' } }, kind: 'amount', text: 'Income taxed by that other state and also by Kentucky', help: 'For the Schedule ITC line 6 credit.' }),
  ]),
  labels: kentuckyLabels,
  notCovered: Object.freeze([
    'Local occupational license taxes of Kentucky cities and counties, which are filed separately, not on Form 740',
    'Schedule M additions and subtractions other than other states\' bond interest, the state refund, U.S. government interest, the pension income exclusion, Social Security and active duty military pay (depreciation and Section 179 differences, net operating loss, K-1 adjustments)',
    'Schedule P for government pensions with service before 1998 above the exclusion',
    'Kentucky Schedule A deductions other than mortgage interest and contributions (investment interest, gambling losses, other miscellaneous)',
    'Schedule ITC business incentive credits, the education tuition tax credit (Form 8863-K) and refundable credits on lines 31(c) to 31(g)',
    'Lump-sum distribution tax (Form 4972-K), farm income averaging and Form 2210-K penalty',
    'The credit for tax paid to another state on a part-year return (740-NP)',
  ]),
  compute,
});
