import { whole, positive, sum, rateOf, check, lineTable } from '../state-kit.mjs';

const SP_CHILD_RELATIONSHIPS = new Set(['son', 'daughter', 'child', 'stepchild', 'adopted_child', 'foster_child', 'grandchild']);
const NONTAXABLE_RETIREMENT_CODES = /^[3467GHQ]+$/;

const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const fieldOf = (form, key) => positive(form.fields?.[key]);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const has = (answers, key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';
const codeOf = (form) => String(form.fields?.distributionCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? fieldOf(form, 'grossDistribution') : fieldOf(form, 'taxableAmount'));

function combineSpouses(byOwner) {
  const values = Object.values(byOwner);
  if (!values.length) return 0;
  if (values.every((value) => value < 0)) return values.reduce((total, value) => total + value, 0);
  return values.filter((value) => value > 0).reduce((total, value) => total + value, 0);
}

function compensationOf(ctx, answers) {
  let paW2 = 0;
  let otherW2 = 0;
  const otherStates = [];
  for (const form of formsOf(ctx, 'W-2')) {
    const state = String(form.fields?.state || '').trim().toUpperCase();
    const reported = form.fields?.stateWages;
    if (state === 'PA') paW2 += reported === undefined || reported === null || reported === '' ? fieldOf(form, 'medicareWages') || fieldOf(form, 'wages') : fieldOf(form, 'stateWages');
    else {
      otherW2 += fieldOf(form, 'medicareWages') || fieldOf(form, 'wages');
      otherStates.push(state || 'no state');
    }
  }
  const otherGiven = has(answers, 'paOtherW2Compensation');
  return { paW2, otherW2: otherGiven ? positive(answers.paOtherW2Compensation) : otherW2, otherW2Estimated: otherW2 > 0 && !otherGiven, otherStates };
}

function retirementOf(ctx, answers) {
  const forms = formsOf(ctx, '1099-R');
  const annuityInterest = sum(forms.filter((form) => codeOf(form).includes('D')), taxableOf);
  const needsAnswer = forms.filter((form) => !codeOf(form).includes('D') && !NONTAXABLE_RETIREMENT_CODES.test(codeOf(form)));
  const deathBenefits = sum(forms.filter((form) => codeOf(form).includes('4') && !codeOf(form).includes('D')), (form) => fieldOf(form, 'grossDistribution'));
  const answered = has(answers, 'paTaxableRetirement');
  return { annuityInterest, needsAnswer, answered, compensation: answered ? positive(answers.paTaxableRetirement) : 0, deathBenefits, count: forms.length };
}

function exemptParts(ctx, answers) {
  const box8 = sum(formsOf(ctx, '1099-INT'), (form) => fieldOf(form, 'taxExemptInterest'));
  const box12 = sum(formsOf(ctx, '1099-DIV'), (form) => fieldOf(form, 'exemptInterestDividends'));
  const exemptInterest = Math.min(box8, positive(answers.paExemptInterest));
  const exemptDividends = Math.min(box12, positive(answers.paExemptDividends));
  return { box8, box12, exemptInterest, exemptDividends, taxableExemptInterest: box8 - exemptInterest, taxableExemptDividends: box12 - exemptDividends };
}

function businessByOwner(ctx) {
  const out = {};
  for (const item of ctx.federal.schedules?.C || []) {
    const owner = item.owner === 'spouse' ? 'spouse' : 'taxpayer';
    out[owner] = (out[owner] || 0) + whole(item.lines?.['31']);
  }
  return out;
}

function gainsByOwner(ctx) {
  const out = {};
  for (const form of formsOf(ctx, '1099-B')) {
    const list = Array.isArray(form.fields?.transactions) ? form.fields.transactions : [form.fields || {}];
    const owner = ownerOf(form);
    for (const item of list) out[owner] = (out[owner] || 0) + positive(item.proceeds) - positive(item.costBasis) + positive(item.washSaleLossDisallowed);
  }
  return out;
}

function residentClasses(ctx, answers) {
  const income = ctx.income;
  const comp = compensationOf(ctx, answers);
  const retirement = retirementOf(ctx, answers);
  const exempt = exemptParts(ctx, answers);
  const line1a = comp.paW2 + comp.otherW2 + retirement.compensation + positive(income.otherIncome);
  const line2 = Math.max(0, whole(income.taxableInterest) - whole(income.usObligationInterest)) + exempt.taxableExemptInterest + retirement.annuityInterest;
  const line3 = whole(income.ordinaryDividends) + whole(income.capitalGainDistributions) + exempt.taxableExemptDividends;
  const business = businessByOwner(ctx);
  const gains = gainsByOwner(ctx);
  return { comp, retirement, exempt, line1a, line2, line3, line4: combineSpouses(business), line5: combineSpouses(gains), businessOwners: Object.keys(business).length, gainOwners: Object.keys(gains).length };
}

function sourcedClasses(ctx, filing, answers) {
  const sourced = filing.sourced;
  const retirement = retirementOf(ctx, answers);
  const exempt = exemptParts(ctx, answers);
  const share = filing.residency === 'part-year' ? filing.share : 0;
  return {
    comp: { paW2: whole(sourced.wages), otherW2: 0, otherW2Estimated: false, otherStates: [] },
    retirement,
    exempt,
    line1a: positive(sourced.wages) + retirement.compensation + positive(sourced.otherIncome),
    line2: Math.max(0, whole(sourced.taxableInterest) - whole(sourced.usObligationInterest)) + Math.round(exempt.taxableExemptInterest * share) + Math.round(retirement.annuityInterest * share),
    line3: whole(sourced.ordinaryDividends) + Math.round((whole(ctx.income.capitalGainDistributions) + exempt.taxableExemptDividends) * share),
    line4: whole(sourced.businessIncome),
    line5: whole(sourced.capitalGain) - Math.round(whole(ctx.income.capitalGainDistributions) * share),
    businessOwners: 1,
    gainOwners: 1,
  };
}

function scheduleO(ctx, answers, rule, line9) {
  const beneficiaries = Math.max(1, Number(answers.paTuitionBeneficiaries || 1));
  const tuitionCap = rule.tuitionPerBeneficiary * beneficiaries;
  const tuition = Math.min(positive(answers.paTuitionContributions), tuitionCap) + Math.min(positive(answers.paSpouseTuitionContributions), tuitionCap);
  const able = Math.min(positive(answers.paAbleContributions), rule.ablePerContributor) + Math.min(positive(answers.paSpouseAbleContributions), rule.ablePerContributor);
  const msa = positive(answers.paMedicalSavingsContributions);
  const hsa = positive(ctx.income.adjustmentItems?.hsa);
  const studentLoan = Math.min(positive(ctx.income.adjustmentItems?.studentLoan), rule.studentLoanInterestMaximum);
  const total = tuition + able + msa + hsa + studentLoan;
  return { 2: tuition, 4: able, 5: msa, 6: hsa, 7: studentLoan, 8: total, 9: line9, 11: Math.min(total, line9) };
}

function forgivenessPercent(rule, married, children, eligibilityIncome) {
  const base = (married ? rule.marriedBase : rule.unmarriedBase) + rule.perDependent * children;
  for (let step = 0; step < rule.steps; step += 1) if (eligibilityIncome <= base + rule.step * step) return (rule.steps - step) / rule.steps;
  return 0;
}

function residentCredit(otherStates, classes, line1c, taxRate) {
  const rows = [];
  for (const other of otherStates) {
    const s = other.sourced || {};
    const pairs = [
      ['c', line1c, positive(s.wages)],
      ['d', classes.line2, Math.max(0, whole(s.taxableInterest) - whole(s.usObligationInterest))],
      ['e', classes.line3, positive(s.ordinaryDividends)],
      ['f', Math.max(0, classes.line4), positive(s.businessIncome)],
      ['g', Math.max(0, classes.line5), positive(s.capitalGain)],
    ];
    const line3 = pairs.reduce((total, [, a, b]) => total + Math.min(a, b), 0);
    const otherTotal = pairs.reduce((total, [, , b]) => total + b, 0);
    const line4c = positive(other.tax);
    const ratio = otherTotal > 0 ? Math.round((line3 / otherTotal) * 1e6) / 1e6 : 0;
    const line4d = ratio >= 1 ? 0 : Math.round(line4c * (1 - ratio));
    const line4e = line4c - line4d;
    const line5 = rateOf(line3, taxRate);
    rows.push({ state: other.state, ...Object.fromEntries(pairs.map(([key, a, b]) => [`2${key}`, { A: a, B: b, C: Math.min(a, b) }])), 3: line3, '4c': line4c, '4d': line4d, '4e': line4e, 5: line5, 6: Math.min(line4e, line5) });
  }
  return rows;
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const sp = reader.read('tax-forgiveness');
  const deductions = reader.read('deductions');
  const wptc = reader.read('wptc');
  if (!rule || !sp || !deductions || !wptc) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Pennsylvania figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const resident = filing.residency === 'full-year';
  const joint = ctx.filingStatus === 'mfj';
  const checks = [];
  const classes = resident ? residentClasses(ctx, answers) : sourcedClasses(ctx, filing, answers);
  const worldwide = resident ? classes : residentClasses(ctx, answers);
  const line1a = classes.line1a;
  const line1b = Math.min(line1a, positive(answers.paUnreimbursedExpenses));
  const line1c = line1a - line1b;
  const line6 = positive(answers.paRentsRoyalties);
  const line7 = positive(answers.paEstateTrustIncome);
  const line8 = positive(answers.paGamblingWinnings);
  const lineValues = { '1c': line1c, 2: classes.line2, 3: classes.line3, 4: classes.line4, 5: classes.line5, 6: line6, 7: line7, 8: line8 };
  const line9 = Object.values(lineValues).reduce((total, value) => total + Math.max(0, value), 0);
  const scheduleOLines = scheduleO(ctx, answers, deductions, line9);
  const line10 = scheduleOLines[11];
  const line11 = line9 - line10;
  const line12 = rateOf(line11, rule.rateBasisPoints);

  let line22 = 0;
  let gl = [];
  if (filing.residency !== 'nonresident' && filing.otherStates.length) {
    gl = residentCredit(filing.otherStates, classes, line1c, rule.rateBasisPoints);
    line22 = Math.min(line12, sum(gl, (row) => row[6]));
    checks.push(check('info', 'PA_SCHEDULE_G_L', 'The resident credit (Schedule G-L) is the smaller of the other state\'s tax on income Pennsylvania also taxes and 3.07% of that income, class by class. Include a copy of each other state\'s return.'));
  }

  const dependentFiler = ctx.filers.some((item) => item.role === 'taxpayer' && item.canBeClaimedAsDependent);
  const separated = answers.paSeparatedForSp === true;
  const married = (ctx.filingStatus === 'mfj' || ctx.filingStatus === 'mfs') && !separated;
  const children = ctx.dependents.filter((item) => SP_CHILD_RELATIONSHIPS.has(String(item.relationship || ''))).length;
  const spLine1 = line9;
  const spLine2 = whole(ctx.income.usObligationInterest) + worldwide.exempt.exemptInterest + worldwide.exempt.exemptDividends;
  const spLine4 = worldwide.retirement.deathBenefits;
  const spOther = positive(answers.paOtherEligibilityIncome);
  const worldwideLine9 = ['line2', 'line3', 'line4', 'line5'].reduce((total, key) => total + Math.max(0, worldwide[key]), Math.max(0, worldwide.line1a - line1b)) + line6 + line7 + line8;
  const spLine6 = resident ? 0 : Math.max(0, worldwideLine9 - line9);
  const spouseIncome = ctx.filingStatus === 'mfs' && married ? positive(answers.paSpouseEligibilityIncome) : 0;
  const spLine11 = spLine1 + spLine2 + spLine4 + spOther + spLine6 + spouseIncome;
  let spPercent = 0;
  let spBlocked = '';
  if (dependentFiler) spBlocked = 'dependent';
  else if (ctx.filingStatus === 'mfs' && married && !has(answers, 'paSpouseEligibilityIncome')) spBlocked = 'spouse-income';
  else spPercent = forgivenessPercent(sp, married, children, spLine11);
  const spLine14 = Math.max(0, line12 - line22);
  const line21 = Math.round(spLine14 * spPercent);
  if (spBlocked === 'dependent') checks.push(check('info', 'PA_SP_DEPENDENT', 'Someone can claim you as a dependent, so Tax Forgiveness is only allowed if that person qualifies for it too; MyCA does not claim it.', 'If the person who claims you qualifies, claim it with their details on Schedule SP.'));
  if (spBlocked === 'spouse-income') checks.push(check('warning', 'PA_SP_SPOUSE_INCOME', 'On separate returns, Tax Forgiveness is based on both spouses\' eligibility income together.', 'Give your spouse\'s eligibility income (their Schedule SP column) in the Pennsylvania questions.'));
  if (line21 > 0 && !has(answers, 'paOtherEligibilityIncome')) checks.push(check('warning', 'PA_SP_OTHER_INCOME', 'Tax Forgiveness is claimed from the income MyCA knows about. Eligibility income also includes alimony, gifts, inheritances, life insurance proceeds, nontaxable military pay, scholarships and cash support from outside the household.', 'Answer the eligibility income question (0 if none) so the forgiveness percentage is right.'));

  const line25 = positive(answers.paUseTax);
  if (!has(answers, 'paUseTax')) checks.push(check('warning', 'PA_USE_TAX', 'Pennsylvania asks for use tax on internet, mail-order or out-of-state purchases with no Pennsylvania sales tax; enter zero if none.', 'Answer the use tax question (0 if none).'));

  const federalEic = whole(ctx.federal.lines['27']);
  const wptcCredit = federalEic > 0 && line9 > 0 ? rateOf(federalEic, wptc.eitcBasisPoints) : 0;
  if (wptcCredit > 0) checks.push(check('info', 'PA_WPTC', `The Working Pennsylvanians Tax Credit (10% of your federal earned income credit) is worked out and applied by the Department from the federal EITC on your return; MyCA shows $${wptcCredit} in the refund.${resident ? '' : ' For a part-year or nonresident return the Department decides the amount.'}`, 'Send the federal Form 1040 with the return so the Department can apply it.'));

  if (worldwide.retirement.needsAnswer.length && !worldwide.retirement.answered) checks.push(check('error', 'PA_RETIREMENT_TAXABLE_PART', `${worldwide.retirement.needsAnswer.length} Form 1099-R ${worldwide.retirement.needsAnswer.length === 1 ? 'has' : 'have'} an early-distribution or missing code. Pennsylvania taxes such a distribution as compensation to the extent it is more than your own contributions (cost recovery), unless it is from an eligible employer plan after you retired.`, 'Give the Pennsylvania-taxable part of those distributions (0 if none) in the Pennsylvania questions.'));
  if (worldwide.retirement.count && worldwide.retirement.count > worldwide.retirement.needsAnswer.length) checks.push(check('info', 'PA_RETIREMENT_NOT_TAXED', 'Normal, disability, death and rollover distributions (codes 3, 4, 7, G, H, Q) are treated as not taxable in Pennsylvania: retirement benefits from an eligible plan after retiring are exempt. A commercial annuity (code D) is counted as interest.', 'If a code 7 distribution is from a plan that is not an eligible employer plan, give its taxable part.'));
  if (resident && classes.comp.otherW2Estimated) checks.push(check('warning', 'PA_W2_RW', `W-2 wages from ${[...new Set(classes.comp.otherStates)].join(', ')} have no Pennsylvania wage figure, so MyCA used Medicare wages (box 5), which include 401(k) deferrals as Pennsylvania does. Attach the PA-40 W-2 RW reconciliation.`, 'Give the Pennsylvania compensation for those W-2s if it differs.'));
  if (positive(ctx.income.otherIncome)) checks.push(check('warning', 'PA_OTHER_INCOME_CLASS', 'Other income on the federal return is counted as compensation (Line 1a). Pennsylvania taxes prizes and gambling winnings as Line 8 and some items not at all.', 'Check how the other income is classified.'));
  if (worldwide.exempt.box8 + worldwide.exempt.box12 > 0 && !has(answers, 'paExemptInterest') && !has(answers, 'paExemptDividends')) checks.push(check('warning', 'PA_OUT_OF_STATE_BONDS', 'Pennsylvania taxes interest on bonds of other states and their towns. All your federally tax-exempt interest and exempt-interest dividends are counted as taxable until you say how much came from Pennsylvania or U.S. obligations.', 'Answer the Pennsylvania and U.S. obligation interest questions.'));
  if (whole(ctx.income.businessIncome)) checks.push(check('warning', 'PA_SCHEDULE_C', 'Line 4 starts from your federal Schedule C. Pennsylvania does not allow bonus depreciation, limits section 179, and taxes the business on PA Schedule C with Pennsylvania rules.', 'Have the Schedule C reviewed for Pennsylvania differences.'));
  if (joint && (classes.businessOwners > 1 || classes.gainOwners > 1)) checks.push(check('info', 'PA_SPOUSE_LOSSES', 'On a joint return Pennsylvania does not let one spouse\'s loss offset the other spouse\'s income in the same class; MyCA nets each spouse separately.'));
  if (joint && line10 > 0) checks.push(check('info', 'PA_SCHEDULE_O_SPOUSE', 'Each spouse\'s Schedule O deductions are limited to that spouse\'s own income on Line 9.'));
  if (filing.residency !== 'full-year' && line9 > 0) checks.push(check('info', 'PA_NONRESIDENT_SOURCES', 'A nonresident pays Pennsylvania tax only on Pennsylvania-source compensation, business, rents, real property gains and Pennsylvania gambling; interest, dividends and gains on stocks are not taxed. If your employer did not report Pennsylvania wages separately, apportion them on Schedule NRH.'));
  if (resident) checks.push(check('info', 'PA_LOCAL_EIT', `Pennsylvania local earned income tax is filed separately with your local tax collector, not on the PA-40.${filing.payments.localWithheld ? ` Your W-2s show $${filing.payments.localWithheld} of local tax withheld.` : ''}`, 'File the local earned income tax return for your municipality and school district.'));
  if (positive(answers.paUnreimbursedExpenses)) checks.push(check('info', 'PA_SCHEDULE_UE', 'Unreimbursed employee business expenses are claimed on PA Schedule UE and must be ordinary, necessary and reasonable for your job.'));

  const line13 = filing.payments.withheld;
  const line15 = filing.payments.estimated;
  const line16 = filing.payments.extension;
  const line17 = 0;
  const line18 = line15 + line16 + line17;
  const line23 = 0;
  const line24 = line13 + line18 + line21 + line22 + line23;
  const line26 = Math.max(0, line12 + line25 - line24);
  const line29 = Math.max(0, line24 - line12 - line25);
  const lines = lineTable({ '1a': line1a, '1b': line1b, '1c': line1c, 2: lineValues[2], 3: lineValues[3], 4: lineValues[4], 5: lineValues[5], 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 15: line15, 16: line16, 17: line17, 18: line18, '19b': children, 20: spLine11, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, 27: 0, 28: line26, 29: line29 });
  const schedules = {
    SP: lineTable({ status: married ? 'married' : 'unmarried', dependentChildren: children, 1: spLine1, 2: spLine2, 4: spLine4, 6: spLine6, otherEligibilityIncome: spOther, spouseEligibilityIncome: spouseIncome, 11: spLine11, 12: line12, 13: line22, 14: spLine14, 15: spPercent, 16: line21 }),
    ...(line10 ? { O: lineTable(scheduleOLines) } : {}),
    ...(gl.length ? { 'G-L': gl } : {}),
    ...(wptcCredit ? { WPTC: lineTable({ federalEitc: federalEic, credit: wptcCredit }) } : {}),
  };
  return {
    form: 'PA-40',
    lines,
    schedules,
    stateIncome: line9,
    taxableIncome: line11,
    taxBeforeCredits: line12,
    nonrefundableCredits: [...(line22 ? [{ code: 'PA_RESIDENT_CREDIT', label: 'Resident credit for tax paid to another state (Schedule G-L)', amount: line22 }] : []), ...(line21 ? [{ code: 'PA_TAX_FORGIVENESS', label: 'Tax Forgiveness (Schedule SP)', amount: line21 }] : [])],
    otherStateCredit: line22,
    otherTaxes: line25 ? [{ code: 'PA_USE_TAX', label: 'Use tax', amount: line25 }] : [],
    totalTax: Math.max(0, line12 - line21 - line22) + line25,
    refundableCredits: wptcCredit ? [{ code: 'PA_WPTC', label: 'Working Pennsylvanians Tax Credit (applied by the Department)', amount: wptcCredit }] : [],
    checks,
  };
}

const q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'PA',
  name: 'Pennsylvania',
  built: true,
  forms: Object.freeze({ resident: 'PA-40', partYear: 'PA-40 (part-year resident)', nonresident: 'PA-40 (nonresident, Schedule NRH when wages are apportioned)' }),
  questions: Object.freeze([
    q('paTaxableRetirement', 'amount', 'Pennsylvania-taxable part of early or uncoded retirement distributions (1099-R code 1, 2, J or blank)', 'The distribution less your own contributions not yet recovered (cost recovery), counted as compensation. Enter 0 if the plan is an eligible employer plan and you retired under its rules.'),
    q('paOtherW2Compensation', 'amount', 'Pennsylvania compensation on W-2s from other states (PA-40 W-2 RW)', 'Leave empty to use Medicare wages (box 5) from those W-2s, which include 401(k) deferrals as Pennsylvania requires.'),
    q('paUnreimbursedExpenses', 'amount', 'Unreimbursed employee business expenses (PA Schedule UE)', 'Ordinary, necessary and reasonable costs of your job that your employer did not pay back.'),
    q('paExemptInterest', 'amount', 'Tax-exempt interest from Pennsylvania or its towns, or from U.S. obligations (part of 1099-INT box 8)', 'Interest on other states\' bonds is taxable in Pennsylvania.', { when: { has: ['taxExemptInterest'] } }),
    q('paExemptDividends', 'amount', 'Exempt-interest dividends from Pennsylvania or U.S. obligations (part of 1099-DIV box 12)', 'The fund statement shows the Pennsylvania and U.S. government share.', { when: { has: ['taxExemptInterest'] } }),
    q('paRentsRoyalties', 'amount', 'Net income from rents, royalties, patents or copyrights (PA Schedule E)', 'Enter the net income; a net loss is not used against other income.'),
    q('paEstateTrustIncome', 'amount', 'Income from estates or trusts (PA Schedule J)', 'From the PA Schedule RK-1 or NRK-1 the estate or trust gave you.'),
    q('paGamblingWinnings', 'amount', 'Gambling and lottery winnings less losses (PA Schedule T)', 'Cash prizes from the Pennsylvania Lottery paid on or after 2016 count; nonresidents only Pennsylvania winnings.'),
    q('paTuitionContributions', 'amount', 'Your contributions to 529 college savings accounts (PA Schedule O)', 'Up to $19,000 per beneficiary.'),
    q('paSpouseTuitionContributions', 'amount', 'Your spouse\'s contributions to 529 college savings accounts', 'Up to $19,000 per beneficiary.', { when: { filingStatus: ['mfj'] } }),
    q('paTuitionBeneficiaries', 'count', 'Number of 529 beneficiaries you contributed for', 'Sets the $19,000-per-beneficiary limit.'),
    q('paAbleContributions', 'amount', 'Your contributions to a PA ABLE account', 'Up to the federal annual gift exclusion.'),
    q('paSpouseAbleContributions', 'amount', 'Your spouse\'s contributions to a PA ABLE account', 'Up to the federal annual gift exclusion.', { when: { filingStatus: ['mfj'] } }),
    q('paMedicalSavingsContributions', 'amount', 'Archer medical savings account contributions allowed federally', 'Health savings account contributions come from your federal return.'),
    q('paOtherEligibilityIncome', 'amount', 'Income Pennsylvania does not tax but counts for Tax Forgiveness', 'Alimony, gifts, inheritances, life insurance proceeds, nontaxable military pay, excluded home sale gain, scholarships and cash support from outside the household (Schedule SP lines 3 to 10). Enter 0 if none.'),
    q('paSpouseEligibilityIncome', 'amount', 'Married filing separately: your spouse\'s eligibility income for Tax Forgiveness', 'Both spouses\' income decides Tax Forgiveness even on separate returns.', { when: { filingStatus: ['mfs'] } }),
    q('paSeparatedForSp', 'yesno', 'Were you separated under a written agreement, or living apart from your spouse for the last six months of the year?', 'Tax Forgiveness then uses the unmarried table.', { when: { filingStatus: ['mfj', 'mfs'] } }),
    q('paUseTax', 'amount', 'Pennsylvania use tax on internet, mail-order or out-of-state purchases', 'Purchases with no Pennsylvania sales tax. Enter 0 if none.'),
  ]),
  labels: Object.freeze({
    '1a': 'Gross compensation',
    '1b': 'Unreimbursed employee business expenses',
    '1c': 'Net compensation',
    2: 'Interest income',
    3: 'Dividend and capital gains distributions income',
    4: 'Net income or loss from a business, profession or farm',
    5: 'Net gain or loss from the sale of property',
    6: 'Net income or loss from rents, royalties, patents, copyrights',
    7: 'Estate or trust income',
    8: 'Gambling and lottery winnings',
    9: 'Total PA taxable income',
    10: 'Other deductions (PA Schedule O)',
    11: 'Adjusted PA taxable income',
    12: 'PA tax liability',
    13: 'Total PA tax withheld',
    15: 'Estimated installment payments',
    16: 'Extension payment',
    17: 'Nonresident tax withheld (PA Schedule NRK-1)',
    18: 'Total estimated payments and credits',
    '19b': 'Dependent children for Tax Forgiveness',
    20: 'Total eligibility income (PA Schedule SP)',
    21: 'Tax Forgiveness credit',
    22: 'Resident credit',
    23: 'Total other credits',
    24: 'Total payments and credits',
    25: 'Use tax',
    26: 'Tax due',
    27: 'Penalties and interest',
    28: 'Total payment due',
    29: 'Overpayment',
  }),
  notCovered: Object.freeze([
    'Local earned income tax (filed separately with your local tax collector)',
    'Pass-through income from partnerships, S corporations and PA Schedules RK-1 and NRK-1, and nonresident withholding (Line 17)',
    'PA Schedule C differences from the federal Schedule C (depreciation, section 179) and PA Schedule F',
    'Schedule DC child and dependent care enhancement credit and the restricted credits on Schedule OC',
    'Apportioning a nonresident\'s compensation on Schedule NRH (the W-2 Pennsylvania wages are used)',
    'Tax Forgiveness for a dependent filer and annualized income of a deceased taxpayer',
    'Penalties and interest (Line 27) and refund donations',
  ]),
  compute,
});
