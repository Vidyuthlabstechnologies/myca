import { whole, positive, rateOf, ratio, check, lineTable, sum } from '../state-kit.mjs';

const ownerOf = (ctx, form) => (form.owner === 'spouse' && ctx.filingStatus === 'mfj' ? 'spouse' : 'taxpayer');
const amountOf = (value) => positive(value);
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? amountOf(form.fields?.grossDistribution) : amountOf(form.fields?.taxableAmount));

export function coloradoTableTax(amount, table, rateBasisPoints) {
  const income = whole(amount);
  if (income <= 0) return 0;
  if (income > table.tableUpTo) return Math.round((income * rateBasisPoints) / 10000);
  const first = table.firstRows;
  let low;
  let high;
  if (income <= first[first.length - 1]) {
    const index = first.findIndex((edge) => income <= edge);
    low = first[index - 1];
    high = first[index];
  } else {
    high = Math.ceil(income / table.rowWidth) * table.rowWidth;
    low = high - table.rowWidth;
  }
  return Math.round((((low + high) / 2) * rateBasisPoints) / 10000);
}

function shares(ctx) {
  const people = { taxpayer: { ss: 0, retirement: 0 }, spouse: { ss: 0, retirement: 0 } };
  for (const form of ctx.forms) {
    if (form.kind === 'SSA-1099') people[ownerOf(ctx, form)].ss += amountOf(form.fields?.netBenefits);
    if (form.kind === '1099-R') people[ownerOf(ctx, form)].retirement += taxableOf(form);
  }
  const ssTotal = people.taxpayer.ss + people.spouse.ss;
  const retirementTotal = people.taxpayer.retirement + people.spouse.retirement;
  const ssTaxable = whole(ctx.income.socialSecurityTaxable);
  const retirementTaxable = whole(ctx.income.pensionTaxable) + whole(ctx.income.iraTaxable);
  const spouseSs = ssTotal ? Math.round((ssTaxable * people.spouse.ss) / ssTotal) : 0;
  const spouseRetirement = retirementTotal ? Math.round((retirementTaxable * people.spouse.retirement) / retirementTotal) : 0;
  return { taxpayer: { ss: ssTaxable - spouseSs, retirement: retirementTaxable - spouseRetirement }, spouse: { ss: spouseSs, retirement: spouseRetirement } };
}

function retirementSubtractions(ctx, rule, agi) {
  const split = shares(ctx);
  const result = {};
  for (const role of ['taxpayer', 'spouse']) {
    const person = ctx.filers.find((item) => item.role === role);
    const age = person?.age ?? null;
    const amounts = split[role];
    let ss = 0;
    let pension = 0;
    if (person && age !== null && age >= 65) {
      ss = amounts.ss;
      pension = Math.min(amounts.retirement, Math.max(0, rule.pension.age65 - ss));
    } else if (person && age !== null && age >= 55) {
      const limit = ctx.filingStatus === 'mfj' ? rule.socialSecurity.age55AgiLimit.mfj : rule.socialSecurity.age55AgiLimit.other;
      ss = agi <= limit ? amounts.ss : Math.min(amounts.ss, rule.socialSecurity.cap);
      pension = Math.min(amounts.retirement, Math.max(0, rule.pension.age55 - ss));
    }
    result[role] = { ss, pension, age };
  }
  return result;
}

function stateTaxAddback(ctx) {
  const scheduleA = ctx.federal.schedules?.A;
  if (!ctx.itemized.federalItemized || !scheduleA || ctx.itemized.generalSalesTax > 0) return 0;
  const localIncome = sum(ctx.w2, (row) => row.localWithheld);
  const line5 = Math.max(0, whole(scheduleA['5e']) - localIncome - whole(scheduleA['5b']) - whole(scheduleA['5c']));
  const line8 = Math.max(0, whole(scheduleA[17]) - whole(ctx.federal.summary.standardDeduction));
  return Math.min(line5, line8);
}

function tierAmount(tiers, agi) {
  const found = tiers.find((tier) => agi <= tier.upTo);
  return found ? found.perChild : 0;
}

function childCredits(ctx, ctcRule, fatcRule, agi) {
  const kids = ctx.dependents.filter((item) => !item.bornAfterYear && item.qualifyingChild && item.age !== null && item.age < fatcRule.underAge);
  const young = kids.filter((item) => item.age < ctcRule.underAge).length;
  const older = kids.length - young;
  const key = ctx.filingStatus === 'mfj' ? 'mfj' : 'other';
  const line3 = tierAmount(ctcRule.tiers[key], agi);
  const line4 = young * line3;
  let line6 = 0;
  let line9 = 0;
  if (!fatcRule.notAllowed) {
    const index = fatcRule.limits[key].findIndex((limit) => agi <= limit);
    if (index >= 0) {
      line6 = fatcRule.youngPerChild[index];
      line9 = fatcRule.olderPerChild[index];
    }
  }
  const line7 = young * line6;
  const line10 = older * line9;
  return { 1: agi, 2: young, 3: line3, 4: line4, 5: young, 6: line6, 7: line7, 8: older, 9: line9, 10: line10, 11: line4 + line7 + line10 };
}

function taborRefund(ctx, rule, modifiedAgi, line13, withheld) {
  if (rule.none) return 0;
  const adultBy = `${Number(ctx.taxYear) - rule.minimumAge}-01-01`;
  const adult = ctx.filers.some((item) => item.dateOfBirth && item.dateOfBirth <= adultBy);
  if (!adult && !(line13 > 0) && !(withheld > 0)) return 0;
  const index = rule.agiUpTo.findIndex((limit) => modifiedAgi <= limit);
  const tier = index < 0 ? rule.agiUpTo.length : index;
  return ctx.filingStatus === 'mfj' ? rule.joint[tier] : rule.single[tier];
}

function compute(ctx, filing, reader) {
  const rate = reader.read('income-tax');
  const table = reader.read('tax-table');
  const addbacks = reader.read('addbacks');
  const subtractions = reader.read('subtractions');
  const eitc = reader.read('eitc');
  const ctc = reader.read('child-tax-credit');
  const fatc = reader.read('family-affordability');
  const tabor = reader.read('tabor-refund');
  if (!rate || !table || !addbacks || !subtractions || !eitc || !ctc || !fatc || !tabor) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Colorado figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const residency = filing.residency;
  const checks = [];
  const joint = ctx.filingStatus === 'mfj';
  const agi = income.agi;
  const line1 = whole(ctx.federal.lines['15']);
  const line2 = stateTaxAddback(ctx);
  const qbi = whole(ctx.federal.lines['13a']);
  const line3 = qbi > 0 && agi > (joint ? addbacks.qbiAddback.agiOver.mfj : addbacks.qbiAddback.agiOver.other) ? qbi : 0;
  const allowance = joint ? addbacks.deductionAddback.allowance.mfj : addbacks.deductionAddback.allowance.other;
  const line4 = agi > addbacks.deductionAddback.agiOver ? Math.max(0, whole(ctx.federal.lines['12']) - allowance - line2) : 0;
  const line9 = positive(answers.nonColoradoMunicipalInterest);
  const line10 = line1 + line2 + line3 + line4 + line9;
  const retirement = retirementSubtractions(ctx, subtractions, agi);
  const ad = {
    1: whole(income.stateRefundTaxable),
    2: whole(income.usObligationInterest),
    3: retirement.taxpayer.ss,
    4: retirement.taxpayer.pension,
    5: joint ? retirement.spouse.ss : 0,
    6: joint ? retirement.spouse.pension : 0,
  };
  const perBeneficiary = joint ? subtractions.collegeInvestPerBeneficiary.mfj : subtractions.collegeInvestPerBeneficiary.other;
  ad[10] = Math.min(positive(answers.collegeInvestContributions), positive(answers.collegeInvestBeneficiaries) * perBeneficiary);
  if (positive(answers.collegeInvestContributions) && !positive(answers.collegeInvestBeneficiaries)) checks.push(check('warning', 'CO_COLLEGEINVEST_BENEFICIARIES', 'The CollegeInvest subtraction is limited per beneficiary; give the number of beneficiaries.', 'Answer the CollegeInvest beneficiaries question.'));
  const charity = ctx.itemized.charityCash + ctx.itemized.charityNonCash;
  ad[12] = ctx.itemized.federalItemized ? 0 : Math.max(0, charity - subtractions.charityFloor);
  ad[19] = positive(answers.famliBenefits);
  ad[20] = positive(answers.otherSubtractions);
  ad[22] = sum(Object.values(ad));
  const line11 = ad[22];
  const line12 = line10 - line11;
  const fullTableTax = coloradoTableTax(line12, table, rate.rateBasisPoints);
  let line13;
  let pn = null;
  let share = 1;
  if (residency === 'full-year') {
    line13 = fullTableTax;
  } else {
    const sourced = filing.sourced;
    const totalRetirement = whole(income.pensionTaxable) + whole(income.iraTaxable);
    const coRetirement = whole(sourced.pensionTaxable) + whole(sourced.iraTaxable);
    const pensionSubtraction = ad[4] + ad[6];
    const coPension = totalRetirement > 0 ? Math.round((pensionSubtraction * coRetirement) / totalRetirement) : 0;
    const coSs = whole(income.socialSecurityTaxable) > 0 ? Math.round(((ad[3] + ad[5]) * whole(sourced.socialSecurityTaxable)) / whole(income.socialSecurityTaxable)) : 0;
    const line24F = agi;
    const line25 = filing.sourcedAgi;
    const line26F = line9;
    const line27 = residency === 'part-year' ? Math.round(line9 * filing.share) : 0;
    const line28F = line24F + line26F;
    const line29 = line25 + line27;
    const line30F = line11 - ad[12];
    const line31 = (residency === 'part-year' ? whole(sourced.stateRefundTaxable) : 0) + whole(sourced.usObligationInterest) + coPension + coSs;
    const line32F = line28F - line30F;
    const line33 = line29 - line31;
    const line34 = line33 <= 0 || line32F <= 0 ? 0 : ratio(line33, line32F, { places: 6, cap: 100 });
    const line35 = fullTableTax;
    const line36 = Math.round(line35 * line34);
    line13 = line36;
    share = Math.min(1, line34);
    pn = lineTable({ '24F': line24F, 25: line25, '26F': line26F, 27: line27, '28F': line28F, 29: line29, '30F': line30F, 31: line31, '32F': line32F, 33: line33, 34: line34, 35: line35, 36: line36 });
    if (line34 > 1) checks.push(check('warning', 'CO_PN_OVER_100', 'Your Colorado income is more than your modified federal income, so the apportioned tax is more than the full-year tax; check the DR 0104PN amounts.'));
  }
  const line16 = line13;
  let otherStateCredit = 0;
  const crOther = [];
  if (residency === 'full-year' && filing.otherStates.length) {
    const line30 = agi + line9 - (line11 - ad[12]);
    for (const other of filing.otherStates) {
      const line29 = Math.min(positive(other.income), Math.max(0, line30));
      const line31 = line30 > 0 ? ratio(line29, line30, { places: 6 }) : 0;
      const line32 = Math.round(line16 * line31);
      const line34 = Math.min(line32, positive(other.tax));
      crOther.push({ state: other.state, 28: line16, 29: line29, 30: line30, 31: line31, 32: line32, 33: positive(other.tax), 34: line34 });
      otherStateCredit += line34;
    }
    otherStateCredit = Math.min(otherStateCredit, line16);
    checks.push(check('info', 'CO_104CR_OTHER_STATE', 'Credit for tax paid to another state (DR 0104CR lines 27 to 34) needs a copy of the other state\'s return with the Colorado return.'));
  }
  const line17 = otherStateCredit;
  const line21 = Math.max(0, line16 - line17);
  const line23 = line21;
  const resident = residency !== 'nonresident';
  const cn = resident ? childCredits(ctx, ctc, fatc, agi) : null;
  const ctcAmount = cn ? (residency === 'part-year' ? Math.round(cn[11] * share) : cn[11]) : 0;
  if (cn && residency === 'part-year') Object.assign(cn, { 12: share, 13: ctcAmount });
  const federalEic = whole(ctx.federal.lines['27']);
  const cr5 = resident ? rateOf(federalEic, eitc.basisPoints) : 0;
  const cr6 = residency === 'part-year' ? Math.round(cr5 * share) : null;
  const eitcAmount = cr6 ?? cr5;
  const cr26 = ctcAmount + eitcAmount;
  const line31 = cr26;
  const line34 = agi;
  const line35 = Math.max(0, whole(income.socialSecurityBenefits) - whole(income.socialSecurityTaxable));
  const line36 = line9;
  const line37 = line34 + line35 + line36;
  const line38 = residency === 'full-year' ? taborRefund(ctx, tabor, line37, line13, filing.payments.withheld) : 0;
  if (ctx.federal.schedules?.C && sum(ctx.federal.schedules.C, (item) => whole(item.expenses?.meals ?? item.lines?.['24b'])) > 0) checks.push(check('warning', 'CO_MEALS_ADDBACK', 'Business meals deducted on Schedule C line 24b are added back on DR 0104 line 5, which MyCA does not do yet.', 'Add the meals deduction with your CPA.'));
  if (income.taxExemptInterest > 0 && answers.nonColoradoMunicipalInterest === undefined) checks.push(check('warning', 'CO_MUNICIPAL_INTEREST', 'Interest from non-Colorado state and local bonds is added on DR 0104 line 9.', 'Answer the non-Colorado bond interest question (0 if none).'));
  if (line38) checks.push(check('info', 'CO_TABOR_DEADLINE', 'The TABOR state sales tax refund needs the return filed by the extension due date (October 15).'));
  if (retirement.taxpayer.age !== null && retirement.taxpayer.age < 55 && (whole(income.pensionTaxable) + whole(income.iraTaxable) + whole(income.socialSecurityTaxable)) > 0) checks.push(check('info', 'CO_UNDER_55_RETIREMENT', 'Under 55, Colorado subtracts pensions and Social Security only when received as a survivor beneficiary; MyCA does not take that subtraction.'));
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: 0, 6: 0, 7: 0, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: 0, 15: 0, 16: line16, 17: line17, 21: line21, 22: 0, 23: line23, 24: filing.payments.withheld, 26: filing.payments.estimated, 27: filing.payments.extension, 31: line31, 34: line34, 35: line35, 36: line36, 37: line37, 38: line38 });
  return {
    form: 'DR 0104',
    lines,
    schedules: {
      'DR 0104AD': lineTable(ad),
      ...(pn ? { 'DR 0104PN': pn } : {}),
      ...(cn && cn[11] ? { 'DR 0104CN': lineTable(cn) } : {}),
      ...(cr26 || otherStateCredit ? { 'DR 0104CR': lineTable({ 1: ctcAmount, 3: federalEic ? whole(ctx.federal.schedules?.EIC?.earnedIncome) : 0, 4: federalEic, 5: cr5, ...(cr6 !== null ? { 6: cr6 } : {}), 26: cr26, 34: otherStateCredit, 65: otherStateCredit }) } : {}),
      ...(crOther.length ? { 'DR 0104CR Part II': crOther } : {}),
    },
    stateIncome: residency === 'full-year' ? line12 : pn[33],
    taxableIncome: line12,
    taxBeforeCredits: line13,
    nonrefundableCredits: otherStateCredit ? [{ code: 'CO_104CR_OTHER_STATE', label: 'Tax paid to another state', amount: otherStateCredit }] : [],
    otherStateCredit,
    otherTaxes: [],
    totalTax: line23,
    refundableCredits: [
      ...(ctcAmount ? [{ code: 'CO_CHILD_TAX_CREDIT', label: fatc.notAllowed ? 'Colorado child tax credit' : 'Colorado child tax credit and family affordability tax credit', amount: ctcAmount }] : []),
      ...(eitcAmount ? [{ code: 'CO_EITC', label: 'Colorado earned income tax credit', amount: eitcAmount }] : []),
      ...(line38 ? [{ code: 'CO_TABOR', label: 'TABOR state sales tax refund', amount: line38 }] : []),
    ],
    checks,
  };
}

const LABELS = Object.freeze({
  1: 'Federal taxable income',
  2: 'State income tax deduction addback',
  3: 'Qualified business income deduction addback',
  4: 'Federal standard or itemized deduction addback',
  5: 'Business meals deduction addback',
  6: 'CollegeInvest non-qualified distributions',
  7: 'ABLE account non-qualified distributions',
  9: 'Other additions, including non-Colorado bond interest',
  10: 'Federal taxable income plus additions',
  11: 'Subtractions from Schedule DR 0104AD',
  12: 'Colorado taxable income',
  13: 'Colorado tax',
  14: 'Alternative minimum tax',
  15: 'Recapture of prior year credits',
  16: 'Tax before credits',
  17: 'Nonrefundable credits from DR 0104CR',
  21: 'Net income tax',
  22: 'Other tax added to net income tax',
  23: 'Total tax',
  24: 'Colorado income tax withheld',
  26: 'Estimated tax payments',
  27: 'Extension payment',
  31: 'Refundable credits from DR 0104CR',
  34: 'Federal adjusted gross income',
  35: 'Nontaxable Social Security benefits',
  36: 'Non-Colorado bond interest added back',
  37: 'Modified AGI for the TABOR refund',
  38: 'TABOR state sales tax refund',
});

export const STATE = Object.freeze({
  code: 'CO',
  name: 'Colorado',
  built: true,
  forms: Object.freeze({ resident: 'DR 0104', partYear: 'DR 0104 with DR 0104PN', nonresident: 'DR 0104 with DR 0104PN' }),
  questions: Object.freeze([
    Object.freeze({ id: 'nonColoradoMunicipalInterest', when: Object.freeze({ has: ['taxExemptInterest'] }), kind: 'amount', text: 'Interest from bonds of states and local governments other than Colorado that was tax-exempt on your federal return', help: 'Added on DR 0104 line 9.' }),
    Object.freeze({ id: 'collegeInvestContributions', kind: 'amount', text: 'Contributions you made to a CollegeInvest 529 account', help: 'Subtracted on DR 0104AD line 10 up to the per-beneficiary limit ($25,400, or $38,100 joint, for 2025).' }),
    Object.freeze({ id: 'collegeInvestBeneficiaries', when: Object.freeze({ answer: { id: 'collegeInvestContributions' } }), kind: 'count', text: 'Number of beneficiaries of those CollegeInvest contributions', help: 'Sets the per-beneficiary limit.' }),
    Object.freeze({ id: 'famliBenefits', kind: 'amount', text: 'Colorado FAMLI paid leave benefits included in federal income', help: 'Subtracted on DR 0104AD line 19. Do not include unemployment.' }),
    Object.freeze({ id: 'otherSubtractions', kind: 'amount', text: 'Other Colorado subtractions (DR 0104AD lines 7 to 9, 11, 13 to 18 and 20), such as military retirement under 55, railroad retirement or Colorado ABLE contributions', help: 'U.S. Treasury interest, Social Security, pensions and the charitable subtraction are worked out automatically.' }),
  ]),
  labels: LABELS,
  notCovered: Object.freeze(['Business meals addback (line 5), CollegeInvest and ABLE non-qualified distributions (lines 6 and 7) and the other additions on line 9 apart from non-Colorado bond interest', 'Colorado alternative minimum tax (DR 0104AMT) and credit recapture', 'DR 0104CR credits other than the child tax credit, family affordability tax credit, earned income tax credit and credit for tax paid to another state (child care, ITIN and under-25 EITC, enterprise zone and others)', 'Pension and Social Security subtraction for survivor beneficiaries under 55', 'Voluntary contributions (DR 0104CH), penalties and interest']),
  compute,
});
