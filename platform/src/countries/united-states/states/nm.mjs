import { whole, positive, rateOf, ratio, check, lineTable, byStatus, bracketTax } from '../state-kit.mjs';

const statusKey = (status) => (status === 'qss' ? 'mfj' : ['single', 'mfj', 'mfs', 'hoh'].includes(status) ? status : 'single');
const round4 = (value) => Math.round(value * 10000) / 10000;

export function tableTax(amount, rule, status) {
  const taxable = whole(amount);
  if (taxable <= 0) return 0;
  const key = statusKey(status);
  const table = rule.table;
  if (taxable <= table.notOver) {
    const first = table.firstRows.find((row) => taxable > row.over && taxable <= row.notOver);
    const low = first ? first.over : Math.ceil(taxable / table.step) * table.step - table.step;
    const high = first ? first.notOver : low + table.step;
    return bracketTax((low + high) / 2, rule.brackets[key]);
  }
  const rows = rule.aboveTable[key];
  const row = [...rows].reverse().find((item) => taxable > item.over);
  return Math.round(row.base + ((taxable - row.over) * row.rateBp) / 10000);
}

function byAgi(rows, agi, pick) {
  const row = rows.find((item) => item.agiNotOver === null || agi <= item.agiNotOver);
  return row ? pick(row) : 0;
}

function exemptionCount(ctx) {
  const self = ctx.filers.some((person) => person.role === 'taxpayer' && person.canBeClaimedAsDependent) ? 0 : 1;
  const spouse = ctx.filingStatus === 'mfj' && !ctx.filers.some((person) => person.role === 'spouse' && person.canBeClaimedAsDependent) ? 1 : 0;
  return { self, spouse, dependents: ctx.dependents.length, total: self + spouse + ctx.dependents.length };
}

function saltAddBack(ctx) {
  const fedA = ctx.itemized.federalScheduleA;
  if (!ctx.itemized.federalItemized || !fedA) return null;
  const w1 = whole(fedA['5a']);
  const w2 = whole(fedA['5d']);
  const w3 = w2 > 0 ? round4(w1 / w2) : 0;
  const w4 = whole(fedA['5e']);
  const w5 = Math.round(w4 * w3);
  const w6 = Math.min(w4, w5);
  const w7 = whole(ctx.federal.summary.standardDeduction);
  const w8 = whole(ctx.federal.lines['12']);
  const w9 = Math.max(0, w8 - w7);
  const w10 = Math.min(w6, w9);
  return lineTable({ 1: w1, 2: w2, 3: w3, 4: w4, 5: w5, 6: w6, 7: w7, 8: w8, 9: w9, 10: w10 });
}

function netCapitalGain(ctx) {
  const d = ctx.federal.schedules?.D;
  if (d) return Math.max(0, Math.min(whole(d['15']), whole(d['16'])));
  return Math.max(0, ctx.income.capitalGainDistributions);
}

function modifiedGrossIncome(ctx, answers) {
  const lines = ctx.federal.lines;
  const income = ctx.income;
  const rental = whole(ctx.federal.schedules?.[1]?.['5']);
  const m4 = income.wages;
  const m5 = whole(lines['6a']) + whole(lines['4a']) + whole(lines['5a']);
  const m6 = income.unemployment;
  const m7 = positive(answers.publicAssistance);
  const m8 = Math.max(0, income.businessIncome) + Math.max(0, rental);
  const m9 = Math.max(0, income.capitalGain);
  const m10 = positive(answers.giftsReceived);
  const m11 = income.taxableInterest + income.taxExemptInterest + income.ordinaryDividends + Math.max(0, income.otherIncome) + positive(answers.otherHouseholdIncome);
  const m12 = Math.max(m4 + m5 + m6 + m7 + m8 + m9 + m10 + m11, income.agi);
  return lineTable({ 4: m4, 5: m5, 6: m6, 7: m7, 8: m8, 9: m9, 10: m10, 11: m11, 12: m12 });
}

function rebates(ctx, filing, credits, exemptions, answers, checks) {
  const resident = filing.residency === 'full-year';
  const present = resident || (filing.residency === 'part-year' && filing.residentDays >= 183);
  const dependentFiler = ctx.filers.some((person) => person.canBeClaimedAsDependent);
  const mfs = ctx.filingStatus === 'mfs';
  const mgi = modifiedGrossIncome(ctx, answers);
  const isOlder = (person) => Boolean(person) && person.age !== null && person.age >= 65;
  const r2e = isOlder(ctx.filers.find((person) => person.role === 'taxpayer')) ? 2 : 0;
  const r2f = isOlder(ctx.filers.find((person) => person.role === 'spouse')) ? 2 : 0;
  const older = (r2e + r2f) / 2;
  const blind = ctx.filers.filter((person) => person.blind).length;
  const r3 = exemptions.total + blind + r2e + r2f;
  let r14 = 0;
  let r17c = 0;
  if (filing.residency === 'part-year' && filing.residentDays < 183) checks.push(check('info', 'NM_REBATES_SIX_MONTHS', 'The New Mexico low income rebate and property tax rebate need at least six months of physical presence in New Mexico; MyCA did not claim them for your part-year stay.', 'If you were physically present for six months or more, ask your CPA to add them.'));
  if (present && !dependentFiler && mgi['12'] <= credits.lowIncomeRebate.mgiLimit && r3 > 0) {
    const row = credits.lowIncomeRebate.table.find((item) => mgi['12'] <= item.mgiNotOver);
    const amount = row ? row.byExemptions[Math.min(r3, 6) - 1] : 0;
    r14 = mfs ? Math.round(amount / 2) : amount;
  }
  const property = credits.propertyTaxRebate;
  const r15 = positive(answers.propertyTaxBilled);
  const r16a = positive(answers.rentPaid);
  const r16c = rateOf(r16a, property.rentBasisPoints);
  const r17a = r15 + r16c;
  let r17b = 0;
  if (present && !dependentFiler && older > 0 && mgi['12'] <= property.mgiLimit && r17a > 0) {
    r17b = (property.maximumLiability.find((item) => mgi['12'] <= item.mgiNotOver) || { liability: 0 }).liability;
    const raw = Math.max(0, r17a - r17b);
    r17c = mfs ? Math.min(property.mfsMaximum, Math.round(raw / 2)) : Math.min(property.maximum, raw);
  }
  const medical = credits.medicalCredit65;
  const medicalEligible = older > 0 && !dependentFiler && positive(ctx.answers.medicalExpenses) >= medical.expenseThreshold;
  const r23 = medicalEligible ? (mfs ? Math.round(medical.credit / 2) : medical.credit) : 0;
  const children = ctx.dependents.filter((item) => item.qualifyingChild).length;
  const perChild = byAgi(credits.childIncomeTaxCredit, ctx.income.agi, (row) => row.perChild);
  const citcEligible = filing.residency !== 'nonresident' && !dependentFiler;
  const citc = citcEligible ? perChild * children : 0;
  const r25 = mfs ? Math.round(citc / 2) : citc;
  if (mgi['12'] <= credits.lowIncomeRebate.mgiLimit && filing.residency !== 'nonresident') checks.push(check('info', 'NM_MODIFIED_GROSS_INCOME', 'The New Mexico rebates use modified gross income, which includes nontaxable income of the whole household (public assistance, gifts, child support, VA benefits).', 'Answer the household income questions so the rebate uses the right income.'));
  if (mfs && (r14 || r17c)) checks.push(check('warning', 'NM_MFS_SPOUSE_INCOME', 'On a separate return the modified gross income must include your spouse\'s income.', 'Add your spouse\'s income to other household income.'));
  const r26 = r14 + r17c + r23 + r25;
  return { lines: lineTable({ 1: exemptions.total, '2c': blind, '2e': r2e, '2f': r2f, 3: r3, ...mgi, 13: mgi['12'], '13a': r3, 14: r14, 15: r15, '16a': r16a, '16c': r16c, '17a': r17a, '17b': r17b, '17c': r17c, 23: r23, 25: r25, 26: r26 }), r14, r17c, r23, r25, r26, children, perChild };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const exemptRule = reader.read('exemptions');
  const credits = reader.read('credits');
  if (!rule || !exemptRule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no New Mexico figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const key = statusKey(status);
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const exemptions = exemptionCount(ctx);
  const dependentFiler = ctx.filers.some((person) => person.canBeClaimedAsDependent);
  const line9 = income.agi;
  const salt = saltAddBack(ctx);
  const line10 = salt ? salt['10'] : 0;
  const adj1 = income.taxExemptInterest;
  const adj6 = adj1;
  const line11 = adj6;
  const line12 = whole(ctx.federal.lines['12']);
  const line13 = (status === 'hoh' || status === 'mfj') && !dependentFiler ? exemptRule.dependentDeduction * Math.max(0, exemptions.dependents - 1) : 0;
  const low = exemptRule.lowMiddle;
  const lowEligible = line9 <= byStatus(low.agiLimit, key);
  const lowPer = lowEligible ? Math.max(0, low.maximum - rateOf(Math.max(0, line9 - byStatus(low.base, key)), byStatus(low.rateBp, key))) : 0;
  const line14 = lowPer * exemptions.total;
  const adj7 = Math.min(adj1, positive(answers.newMexicoBondInterest));
  if (adj1 > 0 && answers.newMexicoBondInterest === undefined) checks.push(check('warning', 'NM_MUNICIPAL_INTEREST', 'Interest on bonds of other states is added back in New Mexico and only New Mexico bond interest is deducted; MyCA treated all your tax-exempt interest as from outside New Mexico.', 'Give the part from New Mexico bonds.'));
  const adj9 = income.usObligationInterest;
  const seniorRows = exemptRule.seniorOrBlind[key];
  const seniorAmount = (seniorRows.find((row) => line9 <= row.agiNotOver) || { amount: 0 }).amount;
  const seniorPeople = ctx.filers.filter((person) => (person.age !== null && person.age >= 65) || person.blind).length;
  const adj13 = seniorAmount * seniorPeople;
  const adj16 = Math.min(netCapitalGain(ctx), exemptRule.capitalGainMaximum);
  const adj17 = Math.min(positive(answers.armedForcesActiveDutyPay), income.wages);
  const older = ctx.filers.some((person) => person.age !== null && person.age >= 65);
  const adj18 = older && positive(ctx.answers.medicalExpenses) >= exemptRule.medical65.expenseThreshold ? exemptRule.medical65.exemption : 0;
  const adj21 = income.stateRefundTaxable;
  const retirementCap = exemptRule.armedForcesRetirementMaximum;
  const adj24 = Math.min(Math.min(positive(answers.armedForcesRetirement), retirementCap) + (status === 'mfj' ? Math.min(positive(answers.spouseArmedForcesRetirement), retirementCap) : 0), income.pensionTaxable + income.iraTaxable);
  const adj25 = line9 <= byStatus(exemptRule.socialSecurityAgiLimit, key) ? income.socialSecurityTaxable : 0;
  if (income.socialSecurityTaxable > 0 && !adj25) notes.push('Your federal AGI is above the New Mexico limit, so taxable Social Security is not exempt (PIT-ADJ line 25).');
  const adj27 = Math.min(positive(answers.teacherSchoolSupplies), exemptRule.teacherSuppliesMaximum * (status === 'mfj' ? 2 : 1));
  const adj28 = adj7 + adj9 + adj13 + adj16 + adj17 + adj18 + adj21 + adj24 + adj25 + adj27;
  const line15 = adj28;
  const pitAdj = lineTable({ 1: adj1, 6: adj6, 7: adj7, 9: adj9, 13: adj13, 16: adj16, 17: adj17, 18: adj18, 21: adj21, 24: adj24, 25: adj25, 27: adj27, 28: adj28 });
  const line17 = Math.max(0, line9 + line10 + line11 - line12 - line13 - line14 - line15);
  const fullTax = tableTax(line17, rule, status);
  let line18 = fullTax;
  let pitB = null;
  let stateIncome = line9 + line10 + line11 - line15;
  if (!resident) {
    const s = filing.sourced;
    const share = partYear ? filing.share : 0;
    const rental = whole(ctx.federal.schedules?.[1]?.['5']);
    const c1 = { 1: income.wages, 2: income.taxableInterest + income.ordinaryDividends + adj1 - adj7, 3: income.iraTaxable + income.pensionTaxable + income.socialSecurityTaxable, 4: rental, 5: income.capitalGain, 6: 0, 7: income.unemployment + income.stateRefundTaxable + income.otherIncome, 8: income.businessIncome };
    const c2 = { 1: whole(s.wages), 2: whole(s.taxableInterest) + whole(s.ordinaryDividends) + (partYear ? Math.round((adj1 - adj7) * share) : 0), 3: whole(s.iraTaxable) + whole(s.pensionTaxable) + whole(s.socialSecurityTaxable), 4: partYear ? Math.round(rental * share) : 0, 5: whole(s.capitalGain), 6: 0, 7: whole(s.unemployment) + whole(s.stateRefundTaxable) + whole(s.otherIncome), 8: whole(s.businessIncome) };
    for (const column of [c1, c2]) column[9] = [1, 2, 3, 4, 5, 6, 7, 8].reduce((total, index) => total + column[index], 0);
    c1[10] = income.adjustments;
    c2[10] = whole(s.adjustments);
    c1[11] = c1[9] - c1[10];
    c2[11] = c2[9] - c2[10];
    const b12 = c2[11] <= 0 ? 0 : ratio(c2[11], c1[11], { places: 6 });
    const b13 = fullTax;
    const b14 = Math.round(b13 * b12);
    pitB = { 'column-1': lineTable(c1), 'column-2': lineTable(c2), lines: lineTable({ 12: b12, 13: b13, 14: b14 }) };
    line18 = b14;
    stateIncome = c2[11];
    if (adj17 > 0) checks.push(check('info', 'NM_ACTIVE_DUTY_PIT_B', 'Armed forces active duty pay is exempt and is left out of PIT-B column 2.', 'Make sure the New Mexico wages you gave do not include active duty pay.'));
  }
  const line19 = 0;
  let line20 = 0;
  const otherStateRows = [];
  if (resident && filing.otherStates.length) {
    let remaining = line18;
    for (const other of filing.otherStates) {
      const given = filing.otherStates.length === 1 && answers.otherStateTaxableIncome !== undefined ? positive(answers.otherStateTaxableIncome) : positive(other.income);
      const nm1 = line18;
      const nm2 = line17;
      const nm3 = nm2 > 0 ? round4(nm1 / nm2) : 0;
      const ot1 = positive(other.tax);
      const ot2 = given;
      const ot3 = ot2 > 0 ? round4(ot1 / ot2) : 0;
      const both = Math.min(positive(other.income), nm2, ot2);
      const nm5 = Math.round(nm3 * both);
      const ot5 = Math.round(ot3 * both);
      const allowed = Math.min(nm5, ot5, nm1, remaining);
      remaining -= allowed;
      line20 += allowed;
      otherStateRows.push({ state: other.state, lines: lineTable({ '1-nm': nm1, '1-other': ot1, '2-nm': nm2, '2-other': ot2, '3-nm': nm3, '3-other': ot3, 4: both, '5-nm': nm5, '5-other': ot5, 6: allowed }) });
    }
    if (answers.otherStateTaxableIncome === undefined) checks.push(check('warning', 'NM_OTHER_STATE_TAXABLE_INCOME', 'The credit worksheet uses the other state\'s taxable income; MyCA used its income because the taxable income was not given.', 'Give the taxable income from the other state\'s return.'));
    checks.push(check('info', 'NM_OTHER_STATE_RETURN', 'Attach the Line 20 worksheet and a copy of the other state\'s return.'));
  }
  if (partYear && filing.otherStates.length === 0 && ctx.w2.some((row) => row.state && row.state !== 'NM')) notes.push('Part-year residents may claim credit for tax paid to another state only on income allocated to New Mexico on PIT-B column 2; none was claimed.');
  const line21 = 0;
  const line22 = Math.max(0, line18 + line19 - line20 - line21);
  const rc = filing.residency === 'nonresident' ? null : rebates(ctx, filing, credits, exemptions, answers, checks);
  const line24 = rc ? rc.r26 : 0;
  const federalEic = whole(ctx.federal.lines['27']);
  const line25a = filing.residency === 'nonresident' ? 0 : federalEic;
  const line25 = rateOf(line25a, credits.workingFamiliesBasisPoints);
  const line27 = filing.payments.withheld;
  const line30 = filing.payments.estimated + filing.payments.extension;
  const line32 = line24 + line25 + line27 + line30;
  const line33 = Math.max(0, line22 - line32);
  const line39 = Math.max(0, line32 - line22);
  if (positive(ctx.answers.childCareExpenses) > 0 && rc && rc.lines['12'] <= 30160) checks.push(check('warning', 'NM_CHILD_DAY_CARE', 'You may qualify for the New Mexico child day care credit (PIT-RC Section 5), which needs the PIT-CG caregiver statements; MyCA does not prepare it.', 'Have your CPA add the child day care credit.'));
  const lines = lineTable({ '1e': resident ? 'R' : partYear ? 'P' : 'N', 5: exemptions.total, 9: line9, 10: line10, 11: line11, 12: line12, '12a': ctx.itemized.federalItemized ? 1 : 0, 13: line13, 14: line14, 15: line15, 17: line17, 18: line18, '18a': resident ? 'R' : 'B', 19: line19, 20: line20, 21: line21, 22: line22, 23: line22, 24: line24, 25: line25, '25a': line25a, 27: line27, 30: line30, 32: line32, 33: line33, 38: line33, 39: line39, 42: line39 });
  const refundable = rc ? [
    ...(rc.r14 ? [{ code: 'NM_LICTR', label: 'Low income comprehensive tax rebate', amount: rc.r14 }] : []),
    ...(rc.r17c ? [{ code: 'NM_PROPERTY_TAX_REBATE', label: 'Property tax rebate for persons 65 or older', amount: rc.r17c }] : []),
    ...(rc.r23 ? [{ code: 'NM_MEDICAL_CARE_CREDIT', label: 'Refundable medical care credit for persons 65 or older', amount: rc.r23 }] : []),
    ...(rc.r25 ? [{ code: 'NM_CHILD_INCOME_TAX_CREDIT', label: 'Child income tax credit', amount: rc.r25 }] : []),
  ] : [];
  if (line25) refundable.push({ code: 'NM_WFTC', label: 'Working families tax credit', amount: line25 });
  return {
    form: resident ? 'PIT-1' : 'PIT-1 with PIT-B',
    lines,
    schedules: { 'PIT-ADJ': pitAdj, ...(salt ? { 'line-10-worksheet': salt } : {}), ...(pitB ? { 'PIT-B': pitB } : {}), ...(rc ? { 'PIT-RC': rc.lines } : {}), ...(otherStateRows.length ? { 'line-20-worksheet': otherStateRows } : {}) },
    stateIncome,
    taxableIncome: line17,
    taxBeforeCredits: line18,
    nonrefundableCredits: line20 ? [{ code: 'NM_OTHER_STATE', label: 'Credit for taxes paid to another state', amount: line20 }] : [],
    otherStateCredit: line20,
    otherTaxes: [],
    totalTax: line22,
    refundableCredits: refundable,
    checks,
    notes: [...notes, ...(line17 <= rule.table.notOver && line17 > 0 ? ['Line 18 uses the 2025 tax rate table, which taxes the midpoint of each $100 row.'] : [])],
  };
}

export const STATE = Object.freeze({
  code: 'NM',
  name: 'New Mexico',
  built: true,
  forms: Object.freeze({ resident: 'PIT-1', partYear: 'PIT-1 with PIT-B', nonresident: 'PIT-1 with PIT-B' }),
  questions: Object.freeze([
    Object.freeze({ id: 'newMexicoBondInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from New Mexico state or local bonds', help: 'All federally tax-exempt interest is added on PIT-ADJ line 1 and New Mexico bond interest is deducted on line 7. Enter 0 if none.' }),
    Object.freeze({ id: 'armedForcesActiveDutyPay', kind: 'amount', text: 'U.S. armed forces active duty pay included in your wages', help: 'Exempt on PIT-ADJ line 17.' }),
    Object.freeze({ id: 'armedForcesRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Your armed forces retirement pay included in pensions', help: 'Up to $30,000 per retiree is exempt on PIT-ADJ line 24.' }),
    Object.freeze({ id: 'spouseArmedForcesRetirement', when: { filingStatus: ['mfj'], has: ['retirementIncome'] }, kind: 'amount', text: 'Your spouse\'s armed forces retirement pay included in pensions', help: 'Up to $30,000 per retiree is exempt.' }),
    Object.freeze({ id: 'teacherSchoolSupplies', kind: 'amount', text: 'School supplies bought for your classroom as a public school teacher', help: 'Deductible up to $1,000 per teacher on PIT-ADJ line 27.' }),
    Object.freeze({ id: 'otherStateTaxableIncome', when: { residency: ['full-year'] }, kind: 'amount', text: 'Taxable income on your other state return', help: 'Used in the Line 20 worksheet for the credit for taxes paid to another state.' }),
    Object.freeze({ id: 'propertyTaxBilled', when: { residency: ['full-year', 'part-year'], has: ['senior'] }, kind: 'amount', text: 'Property tax billed for the year on your New Mexico home', help: 'For the property tax rebate for persons 65 or older with modified gross income of $16,000 or less.' }),
    Object.freeze({ id: 'rentPaid', when: { residency: ['full-year', 'part-year'], has: ['senior'] }, kind: 'amount', text: 'Rent paid in the year for your New Mexico home', help: 'Six percent of rent counts as property tax for the rebate for persons 65 or older.' }),
    Object.freeze({ id: 'publicAssistance', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Public assistance, TANF and SSI received by your household', help: 'Part of modified gross income for the New Mexico rebates.' }),
    Object.freeze({ id: 'giftsReceived', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Gifts of cash or marketable items received by your household', help: 'Part of modified gross income for the New Mexico rebates.' }),
    Object.freeze({ id: 'otherHouseholdIncome', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Other household income not on the federal return (child support, VA benefits, scholarships, nontaxable pensions)', help: 'Part of modified gross income for the New Mexico rebates.' }),
  ]),
  labels: Object.freeze({
    '1e': 'Residency status (R, P or N)',
    5: 'Exemptions: taxpayer, spouse, dependents and other dependents',
    9: 'Federal adjusted gross income',
    10: 'State and local tax deduction claimed on Schedule A',
    11: 'Total additions to federal adjusted gross income',
    12: 'Federal standard or itemized deduction amount',
    '12a': 'Itemized federal deduction box',
    13: 'Deduction for certain dependents',
    14: 'New Mexico low- and middle-income tax exemption',
    15: 'Total deductions and exemptions from federal income',
    17: 'New Mexico taxable income',
    18: 'New Mexico tax on line 17 or from PIT-B, line 14',
    '18a': 'Tax from rate table (R) or PIT-B (B)',
    19: 'Additional tax on lump-sum distributions',
    20: 'Credit for taxes paid to another state',
    21: 'Business-related income tax credits applied',
    22: 'Net New Mexico income tax',
    23: 'Amount on line 22 from page 1',
    24: 'Total claimed on rebate and credit schedule (PIT-RC)',
    25: 'Working families tax credit',
    '25a': 'Federal earned income credit',
    27: 'New Mexico income tax withheld',
    30: 'Estimated income tax payments',
    32: 'Total payments and credits',
    33: 'Tax due',
    38: 'Tax, penalty and interest due',
    39: 'Overpayment',
    42: 'Amount to be refunded to you',
  }),
  notCovered: Object.freeze([
    'Business-related credits on PIT-CR and the child day care credit (PIT-RC Section 5, needs PIT-CG)',
    'Additional low income property tax rebate for Los Alamos, Santa Fe, Doña Ana and Bernalillo counties, and the special needs adopted child credit',
    'PIT-ADJ items other than bond interest, U.S. obligation interest, the 65-or-blind exemption, the $2,500 net capital gains deduction, active duty pay, the medical care exemption, state refunds, armed forces retirement, Social Security and teacher supplies (for example the 40% business-sale capital gains deduction, Indian country income, 529 plan deductions, NOLs)',
    'Business income apportionment by property, payroll and sales (PIT-B worksheet) and the WFTC expansion for filers without a federal EIC',
    'Lump-sum distribution averaging (line 19), Schedule CC, underpayment penalty and refund contributions',
  ]),
  compute,
});
