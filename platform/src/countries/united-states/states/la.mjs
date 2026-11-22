import { whole, positive, rateOf, check, byStatus, lineTable, sum } from '../state-kit.mjs';

const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function retirementByOwner(ctx) {
  const forms = ctx.forms.filter((form) => form.kind === '1099-R');
  const of = (owner) => sum(forms.filter((form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner), taxableOf);
  return { taxpayer: of('taxpayer'), spouse: ctx.filingStatus === 'mfj' ? of('spouse') : 0 };
}

const percentTwo = (part, total) => (whole(total) > 0 ? Math.round((whole(part) * 10000) / whole(total)) / 100 : 0);

function retirementWorksheet(ctx, answers, exemptions, retirement, scale = 1) {
  const exemptTotal = positive(answers.stateEmployeeRetirement) + positive(answers.teacherRetirement) + positive(answers.federalRetirement) + positive(answers.otherExemptRetirement);
  const exemptSpouse = ctx.filingStatus === 'mfj' ? Math.min(positive(answers.spouseExemptRetirement), exemptTotal) : 0;
  const people = [{ role: 'taxpayer', filer: ctx.filers[0], line1: Math.round(retirement.taxpayer * scale), line2: Math.round((exemptTotal - exemptSpouse) * scale) }];
  if (ctx.filingStatus === 'mfj') people.push({ role: 'spouse', filer: ctx.filers[1], line1: Math.round(retirement.spouse * scale), line2: Math.round(exemptSpouse * scale) });
  const rows = people.map((item) => {
    const line3 = Math.max(0, item.line1 - item.line2);
    const eligible = item.filer && item.filer.age !== null && item.filer.age >= 65;
    return { role: item.role, 1: item.line1, 2: item.line2, 3: line3, 4: exemptions.retirement65PerPerson, 5: eligible ? Math.min(line3, exemptions.retirement65PerPerson) : 0 };
  });
  return { rows, exemptTotal, total: sum(rows, (row) => row[5]) };
}

function startExemption(ctx, answers, exemptions) {
  const beneficiaries = answers.startBeneficiaries === undefined ? 1 : positive(answers.startBeneficiaries);
  return Math.min(positive(answers.startContributions), beneficiaries * byStatus(exemptions.startPerBeneficiary, ctx.filingStatus === 'mfj' ? 'mfj' : 'other'));
}

function federalItemizedLines(ctx, federalStandard) {
  if (!ctx.itemized.federalItemized) return { '9A': 0, '9B': 0, '9C': 0, '9D': 0 };
  const scheduleA = ctx.federal.schedules?.A || {};
  const a = whole(scheduleA['17']);
  const b = whole(scheduleA['4']);
  const c = byStatus(federalStandard, ctx.filingStatus);
  return { '9A': a, '9B': b, '9C': c, '9D': Math.max(0, b - c) };
}

function refundableChildCare(ctx, credits) {
  const form = ctx.federal.schedules?.['2441'];
  const agi = whole(ctx.income.agi);
  const rule = credits.refundableChildCare;
  if (!form || agi > rule.federalAgiMax) return null;
  const line3 = whole(form['3']);
  const line4 = whole(form['4']);
  const line5 = whole(form['5']);
  const line6 = Math.min(line3, line4, line5);
  const band = rule.bands.find((item) => agi <= item.upTo) || rule.bands[rule.bands.length - 1];
  const line9 = rateOf(line6, band.bp);
  const line10 = rateOf(line9, rule.shareBp);
  return lineTable({ 3: line3, 4: line4, 5: line5, 6: line6, 7: agi, 8: band.bp / 10000, 9: line9, 10: line10, 11: line10 });
}

function nonrefundableChildCare(ctx, credits) {
  const agi = whole(ctx.income.agi);
  const federal = whole(ctx.federal.schedules?.[3]?.['2']);
  const rule = credits.nonrefundableChildCare;
  if (!federal || agi <= credits.refundableChildCare.federalAgiMax) return { federal, rateBp: 0, amount: 0 };
  const band = rule.bands.find((item) => agi <= item.upTo);
  if (band) return { federal, rateBp: band.bp, amount: rateOf(federal, band.bp) };
  return { federal, rateBp: rule.aboveBp, amount: Math.min(rule.aboveMax, rateOf(federal, rule.aboveBp)) };
}

function useTaxLine(answers, checks) {
  if (answers.useTax === undefined) checks.push(check('warning', 'LA_USE_TAX', 'Louisiana asks for consumer use tax on purchases made without Louisiana sales tax, and one of the use tax boxes must be marked.', 'Answer the use tax question (0 if none).'));
  return positive(answers.useTax);
}

function residentReturn(ctx, filing, rules, checks) {
  const { rate, standard, federalStandard, exemptions, credits } = rules;
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const munisAnswered = answers.nonLouisianaMunicipalInterest !== undefined;
  const e1 = whole(income.agi);
  const e2A = munisAnswered ? positive(answers.nonLouisianaMunicipalInterest) : positive(income.taxExemptInterest);
  if (!munisAnswered && income.taxExemptInterest > 0) checks.push(check('warning', 'LA_MUNICIPAL_INTEREST', 'All of your federally tax-exempt interest was added back on Schedule E line 2A. Interest on Louisiana state and local bonds is not added back.', 'Answer the non-Louisiana municipal interest question (0 if none).'));
  const e3 = Math.max(0, e1 + e2A);
  const retirement = retirementByOwner(ctx);
  const worksheet = retirementWorksheet(ctx, answers, exemptions, retirement);
  const codes = {
    '01E': positive(income.usObligationInterest),
    '02E': positive(answers.stateEmployeeRetirement),
    '03E': positive(answers.teacherRetirement),
    '04E': positive(answers.federalRetirement),
    '05E': positive(answers.otherExemptRetirement),
    '06E': worksheet.total,
    '07E': positive(income.socialSecurityTaxable),
    '09E': startExemption(ctx, answers, exemptions),
    '10E': Math.min(positive(answers.militaryPayExclusion), exemptions.militaryPayMax),
  };
  const e4H = Object.values(codes).reduce((total, value) => total + value, 0);
  const e5 = Math.max(0, e3 - e4H);
  const scheduleEUsed = e2A > 0 || e4H > 0;
  const line7 = scheduleEUsed ? e5 : Math.max(0, e1);
  const line8 = byStatus(standard, status);
  const fed = federalItemizedLines(ctx, federalStandard);
  const line10 = Math.max(0, line7 - line8 - fed['9D']);
  const line11 = rateOf(line10, rate.rateBp);
  const r10606 = [];
  let credit1B = 0;
  let paid1A = 0;
  const base = scheduleEUsed ? e1 : line7;
  for (const other of filing.otherStates) {
    const col2 = Math.min(positive(other.income), Math.max(0, base));
    const col3 = percentTwo(col2, base);
    const col4 = Math.round(((line8 + fed['9D']) * col3) / 100);
    const col5 = col2 - col4;
    const col6 = line10 > 0 ? Math.max(0, percentTwo(col5, line10)) : 0;
    const col7 = Math.round((col6 * line11) / 100);
    const col8 = positive(other.tax);
    const col9 = Math.min(col7, col8);
    r10606.push({ state: other.state, 2: col2, 3: col3, 4: col4, 5: col5, 6: col6, 7: col7, 8: col8, 9: col9 });
    credit1B += col9;
    paid1A += col8;
  }
  if (r10606.length) checks.push(check('info', 'LA_R10606', 'Credit for taxes paid to other states (Schedule C line 1B, Form R-10606) is allowed only where the other state gives nonresidents no credit for tax paid to Louisiana. Attach the other state\'s return.'));
  const line12 = Math.min(credit1B, line11);
  const line13 = Math.max(0, line11 - line12);
  const care = refundableChildCare(ctx, credits);
  const line14 = care ? care['11'] : 0;
  const line15 = 0;
  const federalEic = whole(ctx.federal.lines['27']);
  const line16 = rateOf(federalEic, credits.eicBp);
  const line17 = 0;
  const line18 = line14 + line15 + line16 + line17;
  const line19 = Math.max(0, line13 - line18);
  const line20 = Math.max(0, line18 - line13);
  const scheduleJ = nonrefundableChildCare(ctx, credits);
  const j2 = Math.min(scheduleJ.amount, line19);
  if (scheduleJ.amount > j2) checks.push(check('info', 'LA_CHILD_CARE_CARRYFORWARD', `$${scheduleJ.amount - j2} of the Louisiana nonrefundable child care credit is more than the tax and can be carried forward for up to five years.`));
  const line21 = j2;
  const line22 = Math.max(0, line19 - line21);
  const line23A = useTaxLine(answers, checks);
  const line24 = line22 + line23A;
  const lines = lineTable({ 7: line7, 8: line8, ...fed, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, '14A': care ? care['3'] : 0, '14B': care ? care['6'] : 0, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, '23A': line23A, '23B': 0, 24: line24, 25: line20, 27: filing.payments.withheld, 29: filing.payments.estimated, 30: filing.payments.extension });
  const schedules = {
    'Schedule E': lineTable({ 1: e1, '2A': e2A, 3: e3, ...codes, '4H': e4H, 5: e5 }),
    ...(worksheet.total || ctx.filers.some((item) => item.age >= 65) ? { 'Code 06E worksheet': worksheet.rows } : {}),
    ...(r10606.length ? { 'Schedule C': lineTable({ '1A': paid1A, '1B': credit1B, 6: credit1B }), 'R-10606': r10606 } : {}),
    ...(care ? { 'Refundable child care worksheet': care } : {}),
    ...(scheduleJ.amount ? { 'Schedule J': lineTable({ 1: scheduleJ.federal, '1A': scheduleJ.rateBp / 10000, 2: j2, 16: line21 }) } : {}),
    ...(line16 ? { 'EIC worksheet': lineTable({ 1: federalEic, 3: line16 }) } : {}),
  };
  return {
    form: 'IT-540',
    lines,
    schedules,
    stateIncome: line7,
    taxableIncome: line10,
    taxBeforeCredits: line11,
    nonrefundableCredits: [...(line12 ? [{ code: 'LA_OTHER_STATE', label: 'Credit for taxes paid to other states', amount: line12 }] : []), ...(line21 ? [{ code: 'LA_CHILD_CARE_NONREFUNDABLE', label: 'Nonrefundable child care credit', amount: line21 }] : [])],
    otherStateCredit: line12,
    otherTaxes: line23A ? [{ code: 'LA_USE_TAX', label: 'Consumer use tax', amount: line23A }] : [],
    totalTax: line13 - line21 + line23A,
    refundableCredits: [...(line14 ? [{ code: 'LA_CHILD_CARE_REFUNDABLE', label: 'Refundable child care credit', amount: line14 }] : []), ...(line16 ? [{ code: 'LA_EIC', label: 'Louisiana earned income credit', amount: line16 }] : [])],
  };
}

function nonresidentReturn(ctx, filing, rules, checks) {
  const { rate, standard, federalStandard, exemptions } = rules;
  const answers = filing.answers;
  const income = ctx.income;
  const given = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const schedule1 = ctx.federal.schedules?.[1] || {};
  const rentalFederal = whole(schedule1['5']);
  if (rentalFederal && answers.louisianaRentalIncome === undefined) checks.push(check('warning', 'LA_RENTAL_SOURCE', 'Your federal return has rental or pass-through income; none of it is counted in the Louisiana column of the NPR worksheet until you say how much was from Louisiana or received while a Louisiana resident.', 'Answer the Louisiana rental and pass-through income question.'));
  const federal = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.businessIncome, 5: income.capitalGain, 6: income.iraTaxable + income.pensionTaxable, 7: rentalFederal, 8: income.socialSecurityTaxable, 9: income.stateRefundTaxable + income.unemployment + income.otherIncome };
  const louisiana = { 1: whole(given.wages), 2: whole(given.taxableInterest), 3: whole(given.ordinaryDividends), 4: whole(given.businessIncome), 5: whole(given.capitalGain), 6: whole(given.iraTaxable) + whole(given.pensionTaxable), 7: whole(answers.louisianaRentalIncome), 8: 0, 9: whole(given.stateRefundTaxable) + whole(given.unemployment) + whole(given.otherIncome) };
  const total = (column) => Object.values(column).reduce((acc, value) => acc + value, 0);
  const f10 = total(federal);
  const l10 = total(louisiana);
  const f11 = whole(income.adjustments);
  const l11 = whole(given.adjustments);
  const f12 = f10 - f11;
  const l12 = l10 - l11;
  const npr13 = partYear ? Math.round((answers.nonLouisianaMunicipalInterest !== undefined ? positive(answers.nonLouisianaMunicipalInterest) : positive(income.taxExemptInterest)) * filing.share) : 0;
  if (partYear && income.taxExemptInterest > 0) checks.push(check('warning', 'LA_MUNICIPAL_INTEREST_PART_YEAR', 'Interest from other states\' bonds earned while you lived in Louisiana is added back on NPR line 13; MyCA split it by the days you lived in Louisiana.', 'Give the amount earned while a resident in your state residency answers if it differs.'));
  const npr18 = l12 + npr13;
  const retirementShare = income.iraTaxable + income.pensionTaxable > 0 ? Math.min(1, louisiana[6] / (income.iraTaxable + income.pensionTaxable)) : 0;
  const worksheet = retirementWorksheet(ctx, answers, exemptions, retirementByOwner(ctx), retirementShare);
  const scaled = (value) => Math.round(positive(value) * retirementShare);
  const codes = {
    '01E': positive(given.usObligationInterest),
    '02E': scaled(answers.stateEmployeeRetirement),
    '03E': scaled(answers.teacherRetirement),
    '04E': scaled(answers.federalRetirement),
    '05E': scaled(answers.otherExemptRetirement),
    '06E': worksheet.total,
    '09E': partYear ? startExemption(ctx, answers, exemptions) : 0,
    '10E': partYear ? Math.min(positive(answers.militaryPayExclusion), exemptions.militaryPayMax) : 0,
  };
  const npr20 = Object.values(codes).reduce((acc, value) => acc + value, 0);
  const npr21 = Math.max(0, npr18 - npr20);
  const line7 = Math.max(0, f12);
  const line8 = npr21;
  const line9 = line7 < line8 || line7 <= 0 ? 100 : Math.min(100, Math.floor((line8 * 10000) / line7) / 100);
  const line10 = byStatus(standard, ctx.filingStatus);
  const fed = federalItemizedLines(ctx, federalStandard);
  const line11E = Math.round((fed['9D'] * line9) / 100);
  const line12 = Math.max(0, line8 - line10 - line11E);
  const lineTax = rateOf(line12, rate.rateBp);
  const line14 = 0;
  const line15 = Math.max(0, lineTax - line14);
  const line19 = 0;
  const line20 = Math.max(0, line15 - line19);
  const line22 = 0;
  const line23 = Math.max(0, line20 - line22);
  const line24A = useTaxLine(answers, checks);
  const line25 = line23 + line24A;
  if (whole(ctx.federal.schedules?.[3]?.['2']) || ctx.federal.schedules?.['2441']) checks.push(check('warning', 'LA_CHILD_CARE_NONRESIDENT', 'On Form IT-540B the Louisiana child care credit is allowed only for care expenses incurred in Louisiana while a resident; MyCA does not compute it.', 'Have your CPA add the IT-540B child care credit if your care was in Louisiana.'));
  if (partYear) checks.push(check('info', 'LA_PART_YEAR_CHOICE', 'A part-year resident may file Form IT-540 as a resident or Form IT-540B as a nonresident, whichever is more beneficial (Revenue Ruling 05-008); MyCA prepares Form IT-540B.'));
  const npr = {};
  for (let n = 1; n <= 9; n += 1) {
    npr[`${n}.federal`] = federal[n];
    if (n !== 8) npr[`${n}.louisiana`] = louisiana[n];
  }
  Object.assign(npr, { '10.federal': f10, '10.louisiana': l10, '11.federal': f11, '11.louisiana': l11, '12.federal': f12, '12.louisiana': l12, 13: npr13, 18: npr18, ...codes, 20: npr20, 21: npr21 });
  const lines = lineTable({ 7: line7, 8: line8, 9: line9, 10: line10, '11A': fed['9A'], '11B': fed['9B'], '11C': fed['9C'], '11D': fed['9D'], '11E': line11E, 12: line12, 13: lineTax, 14: line14, 15: line15, 16: 0, 17: 0, 18: 0, 19: line19, 20: line20, 21: 0, 22: line22, 23: line23, '24A': line24A, '24B': 0, 25: line25, 28: filing.payments.withheld, 31: filing.payments.estimated, 32: filing.payments.extension });
  return {
    form: 'IT-540B',
    lines,
    schedules: { 'NPR worksheet': lineTable(npr), ...(worksheet.total ? { 'Code 06E worksheet': worksheet.rows } : {}) },
    stateIncome: line8,
    taxableIncome: line12,
    taxBeforeCredits: lineTax,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: line24A ? [{ code: 'LA_USE_TAX', label: 'Consumer use tax', amount: line24A }] : [],
    totalTax: line25,
    refundableCredits: [],
  };
}

function compute(ctx, filing, reader) {
  const rules = { rate: reader.read('income-tax'), standard: reader.read('standard-deduction'), federalStandard: reader.read('federal-standard-deduction'), exemptions: reader.read('exemptions'), credits: reader.read('credits') };
  if (Object.values(rules).some((value) => !value)) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Louisiana figures for ${ctx.taxYear}.` };
  const checks = [];
  const result = filing.residency === 'full-year' ? residentReturn(ctx, filing, rules, checks) : nonresidentReturn(ctx, filing, rules, checks);
  if (ctx.filers[0]?.canBeClaimedAsDependent) checks.push(check('info', 'LA_DEPENDENT_FILER', 'Louisiana allows the full standard deduction even if you can be claimed as a dependent.'));
  return { ...result, checks };
}

const IT540_LABELS = Object.freeze({
  7: 'Federal adjusted gross income (or Schedule E, line 5)',
  8: 'Louisiana standard deduction',
  '9A': 'Federal itemized deductions',
  '9B': 'Federal itemized deduction for medical and dental expenses',
  '9C': 'Federal standard deduction',
  '9D': 'Excess federal itemized deductions',
  10: 'Your Louisiana taxable income',
  11: 'Your Louisiana income tax',
  12: 'Nonrefundable priority 1 credits (Schedule C)',
  13: 'Tax liability after nonrefundable priority 1 credits',
  14: 'Louisiana refundable child care credit',
  '14A': 'Qualified child care expenses (worksheet, line 3)',
  '14B': 'Refundable child care credit worksheet, line 6',
  15: 'Louisiana refundable school readiness credit',
  16: 'Earned income credit',
  17: 'Other refundable priority 2 credits (Schedule F)',
  18: 'Total refundable priority 2 credits',
  19: 'Tax liability after refundable priority 2 credits',
  20: 'Overpayment after refundable priority 2 credits',
  21: 'Nonrefundable priority 3 credits (Schedule J)',
  22: 'Adjusted Louisiana income tax',
  '23A': 'Consumer use tax',
  '23B': 'Electric and hybrid vehicle road usage fee',
  24: 'Total income tax, consumer use tax and road usage fee',
  25: 'Overpayment of refundable priority 2 credits',
  27: 'Louisiana tax withheld',
  29: 'Estimated payments',
  30: 'Extension payment',
});

const IT540B_LABELS = Object.freeze({
  7: 'Federal adjusted gross income (NPR worksheet, line 12)',
  8: 'Louisiana adjusted gross income (NPR worksheet, line 21)',
  9: 'Ratio of Louisiana to federal adjusted gross income',
  10: 'Louisiana standard deduction',
  '11A': 'Federal itemized deductions',
  '11B': 'Federal itemized deduction for medical and dental expenses',
  '11C': 'Federal standard deduction',
  '11D': 'Excess federal itemized deductions',
  '11E': 'Allowable deductions',
  12: 'Your Louisiana taxable income',
  13: 'Your Louisiana income tax',
  14: 'Nonrefundable priority 1 credits (Schedule C-NR)',
  15: 'Tax liability after nonrefundable priority 1 credits',
  16: 'Louisiana refundable child care credit',
  17: 'Louisiana refundable school readiness credit',
  18: 'Other refundable priority 2 credits (Schedule F-NR)',
  19: 'Total refundable priority 2 credits',
  20: 'Tax liability after refundable priority 2 credits',
  21: 'Overpayment after refundable priority 2 credits',
  22: 'Nonrefundable priority 3 credits (Schedule J-NR)',
  23: 'Adjusted Louisiana income tax',
  '24A': 'Consumer use tax',
  '24B': 'Electric and hybrid vehicle road usage fee',
  25: 'Total income tax, consumer use tax and road usage fee',
  28: 'Louisiana tax withheld',
  31: 'Estimated payments',
  32: 'Extension payment',
});

const louisianaLabels = (taxYear, residency, form) => (form === 'IT-540B' ? IT540B_LABELS : IT540_LABELS);

export const STATE = Object.freeze({
  code: 'LA',
  name: 'Louisiana',
  built: true,
  forms: Object.freeze({ resident: 'IT-540', partYear: 'IT-540B', nonresident: 'IT-540B' }),
  due: (taxYear) => `${Number(taxYear) + 1}-05-15`,
  questions: Object.freeze([
    Object.freeze({ id: 'nonLouisianaMunicipalInterest', when: { residency: ['full-year', 'part-year'], has: ['taxExemptInterest'] }, kind: 'amount', text: 'Interest and dividends from bonds of states other than Louisiana and their local governments that were tax-exempt on your federal return', help: 'Added back on Schedule E line 2A (NPR worksheet line 13 for the part earned while a Louisiana resident).' }),
    Object.freeze({ id: 'stateEmployeeRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Louisiana State Employees\' Retirement System benefits included in your federal income', help: 'Exempt, Schedule E code 02E.' }),
    Object.freeze({ id: 'teacherRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Teachers\' Retirement System of Louisiana benefits included in your federal income', help: 'Exempt, Schedule E code 03E.' }),
    Object.freeze({ id: 'federalRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Federal retirement benefits (civil service, military retirement and military survivor benefits) included in your federal income', help: 'Exempt, Schedule E code 04E.' }),
    Object.freeze({ id: 'otherExemptRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Benefits from other retirement systems exempt by Louisiana law (school employees, State Police, municipal, parochial, firefighters, sheriffs and similar)', help: 'Exempt, Schedule E code 05E.' }),
    Object.freeze({ id: 'spouseExemptRetirement', when: { filingStatus: ['mfj'], has: ['retirementIncome'] }, kind: 'amount', text: 'Married filing jointly: the part of the exempt retirement benefits above that your spouse received', help: 'Used on the code 06E worksheet, which is figured for each spouse.' }),
    Object.freeze({ id: 'startContributions', kind: 'amount', text: 'Contributions to Louisiana START savings accounts this year', help: 'Exempt up to $2,400 per beneficiary ($4,800 married filing jointly), Schedule E code 09E.' }),
    Object.freeze({ id: 'startBeneficiaries', when: { answer: { id: 'startContributions' } }, kind: 'count', text: 'Number of START account beneficiaries you contributed for', help: 'The START exemption limit applies per beneficiary.' }),
    Object.freeze({ id: 'militaryPayExclusion', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Military pay earned outside Louisiana after 120 or more consecutive days of active duty', help: 'Exempt up to $50,000, Schedule E code 10E.' }),
    Object.freeze({ id: 'louisianaRentalIncome', when: { residency: ['part-year', 'nonresident'] }, kind: 'amount', text: 'Rental, royalty, partnership, S corporation and trust income from Louisiana sources or received while a Louisiana resident (Form IT-540B)', help: 'NPR worksheet line 7, Louisiana column.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Louisiana consumer use tax owed on purchases made without Louisiana sales tax', help: 'IT-540 line 23A or IT-540B line 24A. Enter 0 if none.' }),
  ]),
  labels: louisianaLabels,
  notCovered: Object.freeze([
    'Schedule E additions other than other states\' bond interest (START recapture, pass-through entity loss, bonus depreciation) and exempt income codes other than 01E to 07E, 09E and 10E (including START K12, school expense deductions 17E to 19E and the capital gain from sale of a Louisiana business)',
    'School readiness credits, Schedule C priority 1 credits other than tax paid to other states, Schedule F refundable credits, Schedule J credits other than the child care credit, Schedule I refundable priority 4 credits and all carryforwards',
    'The child care credit on Form IT-540B, which needs care expenses incurred in Louisiana while a resident',
    'Filing a part-year resident return on Form IT-540 instead of IT-540B',
    'Electric and hybrid vehicle road usage fee (Form R-19000A), donations (Schedule D), underpayment penalty (R-210R), interest and delinquent penalties',
    'Nonresident professional athletes (Schedules NRPA-1 and NRPA-2)',
  ]),
  compute,
});
