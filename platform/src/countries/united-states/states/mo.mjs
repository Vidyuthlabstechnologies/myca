import { whole, positive, rateOf, check, lineTable, sum, yesNo, byStatus } from '../state-kit.mjs';

const has = (answers, key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';
const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const field = (form, key) => positive(form.fields?.[key]);
const taxableOf = (form) => {
  const raw = form.fields?.taxableAmount;
  return raw === undefined || raw === null || raw === '' ? field(form, 'grossDistribution') : positive(raw);
};
const pair = (taxpayer = 0, spouse = 0) => ({ taxpayer, spouse });

export function missouriPercent(part, total) {
  const top = whole(part);
  const bottom = whole(total);
  if (bottom <= 0) return top > 0 ? 100 : 0;
  if (top <= 0) return 0;
  if (top >= bottom) return 100;
  if (top * 200 < bottom) return Math.round((top * 10000) / bottom) / 100;
  return Math.floor((200 * top + bottom) / (2 * bottom));
}

export function chartTax(amount, chart) {
  const cents = positive(amount) * 100;
  let band = null;
  for (const row of chart) if (cents > row.overCents) band = row;
  if (!band) return 0;
  return Math.round((band.baseCents + ((cents - band.overCents) * band.rateBp) / 10000) / 100);
}

const ofPercent = (amount, percent) => Math.round((whole(amount) * percent) / 100);

function byOwner(ctx, answers) {
  const wages = pair();
  for (const row of ctx.w2) wages[row.owner] += row.wages;
  const retirement = pair();
  for (const form of formsOf(ctx, '1099-R')) retirement[ownerOf(form)] += taxableOf(form);
  const benefits = pair();
  for (const form of formsOf(ctx, 'SSA-1099')) benefits[ownerOf(form)] += field(form, 'netBenefits');
  const totalBenefits = benefits.taxpayer + benefits.spouse;
  const ssTaxable = whole(ctx.income.socialSecurityTaxable);
  const spouseSs = totalBenefits > 0 ? Math.round((ssTaxable * benefits.spouse) / totalBenefits) : 0;
  const business = pair();
  for (const item of ctx.federal.schedules?.C || []) business[item.owner === 'spouse' ? 'spouse' : 'taxpayer'] += whole(item.lines?.['31']);
  const socialSecurityTax = pair();
  for (const form of formsOf(ctx, 'W-2')) socialSecurityTax[ownerOf(form)] += field(form, 'socialSecurityTax');
  const capitalGain = Math.max(0, whole(ctx.income.capitalGain));
  const spouseCapitalGain = Math.min(capitalGain, positive(answers.spouseCapitalGain));
  return { wages, retirement, socialSecurity: pair(ssTaxable - spouseSs, spouseSs), business, socialSecurityTax, capitalGain: pair(capitalGain - spouseCapitalGain, spouseCapitalGain) };
}

function itemizedDeduction(ctx, deductions, owners) {
  const scheduleA = ctx.federal.schedules?.A;
  if (!ctx.itemized.federalItemized || !scheduleA) return null;
  const federal = whole(ctx.itemized.federalAllowed);
  const ssTax = { taxpayer: Math.min(Math.round(owners.socialSecurityTax.taxpayer), deductions.socialSecurityTaxCap), spouse: ctx.filingStatus === 'mfj' ? Math.min(Math.round(owners.socialSecurityTax.spouse), deductions.socialSecurityTaxCap) : 0 };
  if (ctx.filingStatus !== 'mfj') ssTax.taxpayer = Math.min(Math.round(owners.socialSecurityTax.taxpayer + owners.socialSecurityTax.spouse), deductions.socialSecurityTaxCap);
  const form8959 = ctx.federal.schedules?.[8959] || {};
  const medicare = sum(formsOf(ctx, 'W-2'), (form) => field(form, 'medicareTax')) + whole(form8959['7']) - whole(form8959['22']);
  const schedule2 = ctx.federal.schedules?.[2] || {};
  const schedule1 = ctx.federal.schedules?.[1] || {};
  const selfEmployment = Math.max(0, whole(schedule2['4']) - whole(schedule1['15']) + whole(form8959['13']));
  const line8 = federal + ssTax.taxpayer + ssTax.spouse + Math.max(0, medicare) + selfEmployment;
  const salesTaxElected = ctx.itemized.generalSalesTax > 0;
  const line9 = salesTaxElected ? 0 : whole(scheduleA['5a']);
  const earnings = Math.min(line9, sum(ctx.w2.filter((row) => row.state === 'MO'), (row) => row.localWithheld));
  const worksheet = whole(scheduleA['5d']) > byStatus(deductions.saltWorksheetThreshold, ctx.filingStatus) || whole(ctx.income.agi) > byStatus(deductions.saltWorksheetAgi, ctx.filingStatus);
  const line11 = worksheet ? (whole(scheduleA['5d']) > 0 ? Math.round(((line9 - earnings) * whole(scheduleA['5e'])) / whole(scheduleA['5d'])) : 0) : line9 - earnings;
  return { lines: lineTable({ 1: federal, 2: ssTax.taxpayer, 3: ssTax.spouse, 6: Math.max(0, medicare), 7: selfEmployment, 8: line8, 9: worksheet ? 0 : line9, 10: worksheet ? 0 : earnings, 11: line11, 12: Math.max(0, line8 - line11) }), amount: Math.max(0, line8 - line11), worksheet };
}

function otherStateList(filing, answers) {
  if (filing.otherStates.length) return filing.otherStates;
  return positive(answers.otherStateTax) ? [{ state: 'other', tax: positive(answers.otherStateTax), income: positive(answers.otherStateIncome) }] : [];
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const deductions = reader.read('deductions');
  const pension = reader.read('pension');
  const mods = reader.read('modifications');
  const credits = reader.read('credits');
  if (!rule || !deductions || !pension || !mods || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Missouri figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const combined = status === 'mfj';
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const owners = byOwner(ctx, answers);
  const columns = combined ? ['Y', 'S'] : ['Y'];
  const roleOf = { Y: 'taxpayer', S: 'spouse' };
  const of = (values, key) => (combined ? values[roleOf[key]] : values.taxpayer + values.spouse);

  const muni = has(answers, 'outOfStateMuniInterest') ? positive(answers.outOfStateMuniInterest) : whole(income.taxExemptInterest);
  if (!has(answers, 'outOfStateMuniInterest') && income.taxExemptInterest > 0) checks.push(check('warning', 'MO_MUNI_INTEREST_ASSUMED', 'All of your federally tax-exempt interest is added on Form MO-A line 1 as interest on bonds of other states; interest on Missouri bonds is exempt.', 'Answer how much tax-exempt interest came from non-Missouri bonds.'));
  const military = pair(positive(answers.militaryRetirement), combined ? positive(answers.spouseMilitaryRetirement) : 0);
  const publicPension = pair(positive(answers.publicPension), combined ? positive(answers.spousePublicPension) : 0);
  const retirementTotal = owners.retirement.taxpayer + owners.retirement.spouse;
  if (retirementTotal > 0 && !has(answers, 'publicPension') && !has(answers, 'militaryRetirement')) checks.push(check('warning', 'MO_PENSION_TYPE_ASSUMED', 'All of your retirement income is treated as private pension on Form MO-A Part 3 Section B (up to $6,000 each). A government pension gets a larger exemption and military retirement is fully subtracted.', 'Answer the public pension and military retirement questions.'));
  const businessOutside = positive(answers.nonMissouriBusinessIncome);
  if (resident && (owners.business.taxpayer + owners.business.spouse) > 0 && !has(answers, 'nonMissouriBusinessIncome')) checks.push(check('warning', 'MO_BUSINESS_SOURCE_ASSUMED', 'The 20 percent business income deduction (MO-A line 17) is figured on all of your Schedule C profit as Missouri-source income.', 'Answer how much Schedule C profit came from business outside Missouri (0 if none).'));
  const sourced = filing.sourced;
  const businessBase = resident
    ? pair(Math.max(0, owners.business.taxpayer - businessOutside), Math.max(0, owners.business.spouse))
    : pair(Math.max(0, whole(sourced.businessIncome)), 0);

  const spouseIncome = combined ? owners.wages.spouse + owners.retirement.spouse + owners.socialSecurity.spouse + owners.business.spouse + owners.capitalGain.spouse + positive(answers.spouseOtherIncome) : 0;
  const agi = whole(income.agi);
  let line1 = combined ? { Y: agi - spouseIncome, S: spouseIncome } : { Y: Math.max(0, agi) };
  if (combined && line1.Y < 0) line1 = { Y: 0, S: agi };
  if (combined && line1.S < 0) line1 = { Y: agi, S: 0 };
  if (combined && agi < 0) line1 = { Y: 0, S: 0 };

  const moa = {};
  const col = {};
  for (const key of columns) {
    const a1 = key === 'Y' ? muni : 0;
    const s8 = key === 'Y' ? whole(income.usObligationInterest) : 0;
    const s9 = key === 'Y' ? whole(income.stateRefundTaxable) : 0;
    const s10 = combined ? military[roleOf[key]] : military.taxpayer;
    const s12 = key === 'Y' ? Math.min(positive(answers.contributions529), byStatus(deductions.plan529Maximum, status)) : 0;
    const s17 = rateOf(of(businessBase, key), mods.businessIncomeDeductionBasisPoints);
    const s18 = Math.round((of(owners.capitalGain, key) * mods.capitalGainSubtractionPercent) / 100);
    const s19 = s8 + s9 + s10 + s12 + s17 + s18;
    moa[key] = { 1: a1, 7: a1, 8: s8, 9: s9, 10: s10, 12: s12, 17: s17, 18: s18, 19: s19 };
    col[key] = { 1: line1[key], 2: a1, 3: line1[key] + a1, 4: s19, 5: line1[key] + a1 - s19 };
  }
  const line6 = sum(columns, (key) => col[key][5]);
  if (combined) {
    const positiveY = Math.max(0, col.Y[5]);
    const positiveS = Math.max(0, col.S[5]);
    const totalPositive = positiveY + positiveS;
    col.Y[7] = col.Y[5] <= 0 ? 0 : col.S[5] <= 0 ? 100 : Math.floor((200 * positiveY + totalPositive) / (2 * totalPositive));
    col.S[7] = 100 - col.Y[7];
  }

  const ssExempt = {};
  const publicExempt = {};
  const privateCapped = {};
  const age = (role) => ctx.filers.find((item) => item.role === role)?.age ?? null;
  for (const role of ['taxpayer', 'spouse']) {
    const disability = role === 'spouse' ? yesNo(answers.spouseSocialSecurityDisability) : yesNo(answers.socialSecurityDisability);
    const old = age(role) !== null && age(role) >= pension.socialSecurityAge;
    const ss = role === 'spouse' && !combined ? 0 : owners.socialSecurity[role] + (!combined && role === 'taxpayer' ? owners.socialSecurity.spouse : 0);
    ssExempt[role] = old || disability ? ss : 0;
    const publicAmount = Math.min(publicPension[role], role === 'taxpayer' && !combined ? retirementTotal : owners.retirement[role]);
    publicExempt[role] = Math.max(0, Math.min(publicAmount, pension.publicPensionMaximum) - ssExempt[role]);
    const retirementOf = role === 'taxpayer' && !combined ? retirementTotal : role === 'spouse' && !combined ? 0 : owners.retirement[role];
    privateCapped[role] = Math.min(Math.max(0, retirementOf - publicAmount - military[role]), pension.privatePensionMaximum);
  }
  const sectionA5 = publicExempt.taxpayer + publicExempt.spouse;
  const sectionB3 = Math.max(0, line6) - whole(income.socialSecurityTaxable);
  const sectionB5 = Math.max(0, sectionB3 - byStatus(pension.privatePensionThreshold, status));
  const sectionB8 = privateCapped.taxpayer + privateCapped.spouse;
  const sectionB9 = Math.max(0, sectionB8 - sectionB5);
  const sectionC4 = ssExempt.taxpayer + ssExempt.spouse;
  const line8 = sectionA5 + sectionB9 + sectionC4;

  const line9 = Math.max(0, whole(ctx.federal.lines['22']) - whole(ctx.federal.lines['27']) - whole(ctx.federal.lines['29']));
  const line10 = whole(ctx.federal.schedules?.[2]?.['8']) + whole(ctx.federal.schedules?.[3]?.['1']);
  const line11 = line9 + line10;
  const percentRow = deductions.federalTaxPercentages.find((row) => line6 <= row.notOver);
  const line12 = percentRow ? percentRow.percent : 0;
  const line13 = Math.min(ofPercent(line11, line12), byStatus(deductions.federalTaxCap, status));
  const standard = whole(ctx.federal.summary.standardDeduction);
  const itemized = itemizedDeduction(ctx, deductions, owners);
  const itemize = Boolean(itemized) && (itemized.amount > standard || standard === 0);
  const line14 = itemize ? itemized.amount : standard;
  const line15 = status === 'hoh' || status === 'qss' ? deductions.headOfHouseholdExemption : 0;
  const line18 = positive(answers.activeDutyMilitaryPay);
  const line19 = positive(answers.inactiveDutyMilitaryPay);
  const line25 = line8 + line13 + line14 + line15 + line18 + line19;
  const line26 = Math.max(0, line6 - line25);
  for (const key of columns) {
    col[key][27] = combined ? ofPercent(line26, col[key][7]) : line26;
    col[key][29] = col[key][27];
    col[key][30] = chartTax(col[key][29], rule.chart);
  }
  const line30Total = sum(columns, (key) => col[key][30]);

  let otherCredit = 0;
  const crForms = [];
  if (resident) {
    const line1Total = sum(columns, (key) => col[key][5]);
    for (const other of otherStateList(filing, answers)) {
      const line7 = Math.min(positive(other.income), Math.max(0, agi));
      const line8cr = missouriPercent(line7, line1Total);
      const line9cr = ofPercent(line30Total, line8cr);
      const line11cr = Math.min(line9cr, positive(other.tax));
      crForms.push(lineTable({ state: other.state, 1: line1Total, 2: line30Total, 3: line7, 7: line7, 8: line8cr, 9: line9cr, 10: positive(other.tax), 11: line11cr }));
      otherCredit += line11cr;
    }
    otherCredit = Math.min(otherCredit, line30Total);
    let left = otherCredit;
    for (const key of columns) {
      const share = key === columns[columns.length - 1] ? left : line30Total > 0 ? Math.min(left, Math.round((otherCredit * col[key][30]) / line30Total)) : 0;
      col[key][31] = share;
      left -= share;
      col[key][32] = 100;
      col[key][33] = col[key][30] - col[key][31];
    }
    if (otherCredit) checks.push(check('info', 'MO_OTHER_STATE_CREDIT', 'Resident credit (Form MO-CR) is the Missouri tax times the share of your income taxed by the other state, rounded to a whole percent, but not more than the other state\'s tax. Attach the other state\'s return.'));
  }

  let nri = null;
  if (!resident) {
    const additions = partYear ? Math.round(muni * filing.share) : 0;
    const subtractions = whole(sourced.usObligationInterest) + whole(sourced.stateRefundTaxable) + Math.max(0, whole(sourced.capitalGain)) + rateOf(Math.max(0, whole(sourced.businessIncome)), mods.businessIncomeDeductionBasisPoints) + (partYear ? Math.round((military.taxpayer + military.spouse) * filing.share) : 0);
    const missouriIncome = Math.max(0, whole(filing.sourcedAgi) + additions - subtractions);
    const spouseMissouriWages = combined ? sum(ctx.w2.filter((row) => row.state === 'MO' && row.owner === 'spouse'), (row) => (row.stateWages === null ? row.wages : row.stateWages)) : 0;
    const part1 = combined ? { Y: Math.max(0, missouriIncome - Math.min(spouseMissouriWages, missouriIncome)), S: Math.min(spouseMissouriWages, missouriIncome) } : { Y: missouriIncome };
    nri = {};
    for (const key of columns) {
      const percent = missouriPercent(part1[key], col[key][5]);
      nri[key] = { 1: part1[key], 2: col[key][5], 3: percent };
      col[key][31] = 0;
      col[key][32] = percent;
      col[key][33] = ofPercent(col[key][30], percent);
    }
    if (combined) checks.push(check('warning', 'MO_NRI_COMBINED_SPLIT', 'On the combined Form MO-NRI, Missouri income is put in your spouse\'s column only for your spouse\'s W-2 wages with Missouri on them; the rest is in your column.', 'Check Form MO-NRI Part B for each spouse.'));
    notes.push('Form MO-NRI: tax is figured on all income as if you lived in Missouri, then multiplied by the Missouri income percentage (whole percent, exact below 0.5 percent) on line 32.');
  }
  for (const key of columns) {
    col[key][34] = 0;
    col[key][35] = col[key][33] + col[key][34];
  }
  const line36 = sum(columns, (key) => col[key][35]);

  const eic = whole(ctx.federal.lines['27']);
  const investmentIncome = whole(income.taxExemptInterest) + whole(income.taxableInterest) + whole(income.ordinaryDividends) + Math.max(0, whole(income.capitalGain));
  const wftcEligible = resident && eic > 0 && credits.workingFamilyStatuses.includes(status) && investmentIncome <= credits.workingFamilyInvestmentIncomeLimit;
  const line44 = wftcEligible ? Math.min(rateOf(eic, credits.workingFamilyBasisPoints), line36) : 0;
  if (eic > 0 && !resident) checks.push(check('info', 'MO_WFTC_RESIDENTS_ONLY', 'The Missouri Working Family Tax Credit is only for full-year residents.'));
  if (eic > 0 && resident && investmentIncome > credits.workingFamilyInvestmentIncomeLimit) checks.push(check('info', 'MO_WFTC_INVESTMENT_INCOME', `Your investment income is over $${credits.workingFamilyInvestmentIncomeLimit.toLocaleString('en-US')}, so the Missouri Working Family Tax Credit does not apply.`));

  if (resident) checks.push(check('info', 'MO_LOCAL_EARNINGS_TAX', 'The Kansas City and St. Louis 1 percent earnings taxes are not on Form MO-1040; they are withheld by your employer or filed with the city.', 'If you live in or work in either city and the tax was not withheld, file the city\'s earnings tax return.'));
  const older = ctx.filers.some((item) => item.age !== null && item.age >= 65) || yesNo(answers.socialSecurityDisability) || yesNo(answers.spouseSocialSecurityDisability);
  if (resident && older) checks.push(check('info', 'MO_PROPERTY_TAX_CREDIT', 'You may qualify for the Missouri property tax credit (Form MO-PTS, up to $750 for renters and $1,100 for owners, household income up to $27,200 renting or $30,000 owning). MyCA does not prepare Form MO-PTS.', 'File Form MO-PTS with your return if you qualify.'));
  if (combined) notes.push('Missouri combined return: each spouse\'s income is in its own column and taxed separately on the tax chart. W-2 wages, retirement income, Social Security and Schedule C are split by whose form it is; other income is in your column unless you gave your spouse\'s share.');
  if (itemized && !itemize) notes.push('Missouri itemized deductions (Form MO-A Part 2) are smaller than the standard deduction, so the standard deduction is used.');

  const lines = {};
  for (const key of columns) for (const [line, value] of Object.entries(col[key])) lines[`${line}${key}`] = value;
  Object.assign(lines, { 6: line6, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 18: line18, 19: line19, 25: line25, 26: line26, 36: line36, 37: filing.payments.withheld, 38: filing.payments.estimated, 41: filing.payments.extension, 44: line44, 45: filing.payments.withheld + filing.payments.estimated + filing.payments.extension + line44 });
  const scheduleA1 = {};
  for (const key of columns) for (const [line, value] of Object.entries(moa[key])) scheduleA1[`${line}${key}`] = value;
  const part3 = lineTable({ '1Y': publicPension.taxpayer, ...(combined ? { '1S': publicPension.spouse } : {}), 'A5': sectionA5, 'B1': line6, 'B2': whole(income.socialSecurityTaxable), 'B5': sectionB5, 'B8': sectionB8, 'B9': sectionB9, 'C3Y': ssExempt.taxpayer, ...(combined ? { 'C3S': ssExempt.spouse } : {}), 'C4': sectionC4, total: line8 });
  return {
    form: 'MO-1040',
    lines: lineTable(lines),
    schedules: {
      'MO-A': { part1: lineTable(scheduleA1), ...(itemize ? { part2: itemized.lines } : {}), part3 },
      ...(crForms.length ? { 'MO-CR': crForms } : {}),
      ...(nri ? { 'MO-NRI': Object.fromEntries(columns.map((key) => [key, lineTable(nri[key])])) } : {}),
      ...(line44 ? { 'MO-WFTC': lineTable({ 5: eic, 6: rateOf(eic, credits.workingFamilyBasisPoints), 7: line36, 8: 0, 9: line36, 10: line44 }) } : {}),
    },
    stateIncome: resident ? line6 : sum(columns, (key) => nri[key][1]),
    taxableIncome: sum(columns, (key) => col[key][29]),
    taxBeforeCredits: line30Total,
    nonrefundableCredits: [...(otherCredit ? [{ code: 'MO_RESIDENT_CREDIT', label: 'Resident credit for tax paid to another state (MO-CR)', amount: otherCredit }] : []), ...(line44 ? [{ code: 'MO_WFTC', label: 'Missouri Working Family Tax Credit', amount: line44 }] : [])],
    otherStateCredit: otherCredit,
    otherTaxes: [],
    totalTax: line36 - line44,
    refundableCredits: [],
    checks,
    notes,
  };
}

const MO_1040_COLUMN_LABELS = Object.freeze({
  1: 'Federal adjusted gross income',
  2: 'Total additions (Form MO-A, Part 1)',
  3: 'Total income',
  4: 'Total subtractions (Form MO-A, Part 1)',
  5: 'Missouri adjusted gross income',
  7: 'Income percentage',
  27: 'Line 26 times the income percentage',
  29: 'Taxable income',
  30: 'Tax',
  31: 'Resident credit (Form MO-CR)',
  32: 'Missouri income percentage',
  33: 'Balance',
  34: 'Other taxes',
  35: 'Subtotal',
});

const MO_1040_LABELS = Object.freeze({
  6: 'Total Missouri adjusted gross income',
  8: 'Pension, Social Security and SS Disability exemption',
  9: 'Tax from federal return',
  10: 'Other tax from federal return',
  11: 'Total tax from federal return',
  12: 'Federal tax percentage',
  13: 'Federal income tax deduction',
  14: 'Missouri standard deduction or itemized deductions',
  15: 'Additional exemption for head of household or widow(er)',
  18: 'Active duty military income deduction',
  19: 'Inactive duty military income deduction',
  25: 'Total deductions',
  26: 'Subtotal',
  36: 'Total tax',
  37: 'Missouri tax withheld',
  38: 'Missouri estimated tax payments',
  41: 'Amount paid with Missouri extension',
  44: 'Missouri Working Family Tax Credit',
  45: 'Total payments and credits',
  ...Object.fromEntries(Object.entries(MO_1040_COLUMN_LABELS).flatMap(([line, label]) => [[`${line}Y`, `${label} (yourself)`], [`${line}S`, `${label} (spouse)`]])),
});

export const STATE = Object.freeze({
  code: 'MO',
  name: 'Missouri',
  built: true,
  forms: Object.freeze({ resident: 'MO-1040', partYear: 'MO-1040', nonresident: 'MO-1040' }),
  questions: Object.freeze([
    Object.freeze({ id: 'outOfStateMuniInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from bonds of states other than Missouri', help: 'Added on Form MO-A line 1. Left blank, all federally tax-exempt interest is added.' }),
    Object.freeze({ id: 'publicPension', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Taxable pension from a federal, state or local government (not military)', help: 'Form MO-A Part 3 Section A exempts up to the maximum Social Security benefit.' }),
    Object.freeze({ id: 'spousePublicPension', when: { filingStatus: ['mfj'], has: ['retirementIncome'] }, kind: 'amount', text: 'Your spouse\'s taxable government pension (not military)', help: 'Form MO-A Part 3 Section A.' }),
    Object.freeze({ id: 'militaryRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Military retirement pay included in your taxable pensions', help: 'Fully subtracted on Form MO-A line 10.' }),
    Object.freeze({ id: 'spouseMilitaryRetirement', when: { filingStatus: ['mfj'], has: ['retirementIncome'] }, kind: 'amount', text: 'Your spouse\'s military retirement pay', help: 'Fully subtracted on Form MO-A line 10.' }),
    Object.freeze({ id: 'socialSecurityDisability', when: { has: ['socialSecurity'] }, kind: 'yesno', text: 'Did you receive Social Security disability benefits for the whole year?', help: 'Disability benefits are exempt at any age (Form MO-A Part 3 Section C).' }),
    Object.freeze({ id: 'spouseSocialSecurityDisability', when: { has: ['spouse', 'socialSecurity'] }, kind: 'yesno', text: 'Did your spouse receive Social Security disability benefits for the whole year?', help: 'Form MO-A Part 3 Section C.' }),
    Object.freeze({ id: 'contributions529', kind: 'amount', text: 'Contributions to MOST or another 529 plan in the year', help: 'Subtracted on Form MO-A line 12, up to $8,000 ($16,000 combined).' }),
    Object.freeze({ id: 'nonMissouriBusinessIncome', when: { residency: ['full-year'], has: ['selfEmployment'] }, kind: 'amount', text: 'Schedule C profit from business carried on outside Missouri', help: 'The 20 percent business income deduction is only for Missouri-source business income.' }),
    Object.freeze({ id: 'activeDutyMilitaryPay', kind: 'amount', text: 'Active duty military pay included in federal AGI', help: 'Deducted on Form MO-1040 line 18.' }),
    Object.freeze({ id: 'inactiveDutyMilitaryPay', kind: 'amount', text: 'National Guard or reserve inactive duty pay included in federal AGI', help: 'Deducted on Form MO-1040 line 19.' }),
    Object.freeze({ id: 'spouseCapitalGain', when: { filingStatus: ['mfj'], has: ['capitalGains'] }, kind: 'amount', text: 'Your spouse\'s share of the capital gain on your federal return', help: 'On a combined return each spouse reports their own capital gain and its subtraction.' }),
    Object.freeze({ id: 'spouseOtherIncome', when: { filingStatus: ['mfj'] }, kind: 'amount', text: 'Your spouse\'s share of income other than W-2 wages, retirement, Social Security, Schedule C and capital gain', help: 'Missouri requires a combined return that splits income between spouses.' }),
    Object.freeze({ id: 'otherStateTax', when: { residency: ['full-year'] }, kind: 'amount', text: 'Income tax you paid to another state whose return MyCA does not prepare', help: 'The tax on that state\'s return, not the amount withheld.' }),
    Object.freeze({ id: 'otherStateIncome', when: { residency: ['full-year'], answer: { id: 'otherStateTax' } }, kind: 'amount', text: 'Income taxed by that other state', help: 'For the Form MO-CR resident credit.' }),
  ]),
  labels: MO_1040_LABELS,
  notCovered: Object.freeze([
    'Kansas City and St. Louis earnings taxes, which are filed with the city, not on Form MO-1040',
    'Property tax credit (Form MO-PTS and MO-CRP)',
    'Form MO-A modifications other than other states\' bond interest, U.S. government interest, the state refund, military retirement, 529 contributions, the business income deduction on Schedule C profit and the capital gain subtraction (partnership and S corporation adjustments, NOL, health insurance premiums, depreciation, ABLE and other accounts)',
    'Long-term care insurance, health care sharing ministry, beginning farmer and foster parent deductions (lines 16, 17, 21 and 24) and the enterprise zone modification (line 28)',
    'Railroad retirement tax on Form MO-A Part 2 and railroad retirement benefits subtraction',
    'Lump-sum distribution tax and low income housing credit recapture (line 34), Form MO-TC miscellaneous credits and Form MO-2210 penalty',
    'The resident credit (Form MO-CR) on a part-year return and MO-CR Schedule 1 for S corporation income',
  ]),
  compute,
});
