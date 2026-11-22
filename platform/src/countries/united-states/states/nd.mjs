import { whole, positive, ratio, check, lineTable, byStatus } from '../state-kit.mjs';

function scheduleCents(amount, bands) {
  const cents = Math.round(Math.max(0, Number(amount) || 0) * 100);
  let total = 0;
  bands.forEach((band, index) => {
    const upTo = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    total += Math.max(0, Math.min(cents, upTo) - band.overCents) * band.rateBp;
  });
  return total / 10000;
}

const scheduleTax = (amount, bands) => Math.floor((Math.round(scheduleCents(amount, bands)) + 50) / 100);

function taxOn(amount, rule, table, bands) {
  if (amount <= 0) return { tax: 0, method: 'Tax Table' };
  if (amount >= rule.tableBelow) return { tax: scheduleTax(amount, bands), method: 'Tax Rate Schedule' };
  const low = Math.floor(amount / table.rowWidth) * table.rowWidth;
  return { tax: scheduleTax(low + table.rowWidth / 2, bands), method: 'Tax Table' };
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function longTermGain(ctx) {
  const scheduleD = ctx.federal.schedules?.D;
  if (scheduleD) return Math.max(0, Math.min(whole(scheduleD['15']), whole(scheduleD['16'])));
  return Math.max(0, whole(ctx.income.capitalGainDistributions));
}

function qualifiedIncome(ctx, answers) {
  const income = ctx.income;
  const own = { taxpayer: { wages: 0, retirement: 0 }, spouse: { wages: 0, retirement: 0 } };
  for (const row of ctx.w2) own[row.owner].wages += row.wages;
  let forms = 0;
  for (const form of ctx.forms) {
    if (form.kind !== '1099-R') continue;
    own[ownerOf(form)].retirement += taxableOf(form);
    forms += taxableOf(form);
  }
  const retirement = income.iraTaxable + income.pensionTaxable;
  const spouseRetirement = forms ? Math.round((retirement * own.spouse.retirement) / forms) : 0;
  const spouseWages = Math.min(own.spouse.wages, income.wages);
  const selfEmployment = Math.max(0, income.businessIncome - income.adjustmentItems.seTaxDeduction);
  const spouseSelfEmployment = Math.min(selfEmployment, positive(answers.spouseSelfEmploymentIncome));
  const taxpayer = income.wages - spouseWages + selfEmployment - spouseSelfEmployment + retirement - spouseRetirement - positive(answers.railroadRetirement);
  const spouse = spouseWages + spouseSelfEmployment + spouseRetirement - positive(answers.spouseRailroadRetirement);
  return { taxpayer: Math.max(0, taxpayer), spouse: Math.max(0, spouse) };
}

function scheduleNR(ctx, filing, line5) {
  const income = ctx.income;
  const items = income.adjustmentItems;
  const sourced = filing.sourced;
  const nonresident = filing.residency === 'nonresident';
  const value = (key) => whole(sourced[key]);
  const A = {
    1: income.wages,
    2: income.taxableInterest + income.ordinaryDividends,
    3: income.businessIncome,
    4: income.capitalGain,
    5: income.iraTaxable + income.pensionTaxable,
    6: 0,
    7: 0,
    8: income.socialSecurityTaxable + income.unemployment + income.otherIncome + income.stateRefundTaxable,
  };
  A[9] = [1, 2, 3, 4, 5, 6, 7, 8].reduce((total, key) => total + A[key], 0);
  Object.assign(A, { 10: items.studentLoan, 11: 0, 12: items.seTaxDeduction + items.seRetirement + items.seHealth, 13: items.ira });
  A[14] = income.adjustments - A[10] - A[12] - A[13];
  A[15] = income.adjustments;
  const B = {
    1: value('wages'),
    2: Math.max(0, value('taxableInterest') - value('usObligationInterest')) + value('ordinaryDividends'),
    3: value('businessIncome'),
    4: value('capitalGain'),
    5: value('iraTaxable') + value('pensionTaxable'),
    6: 0,
    7: 0,
    8: (nonresident ? 0 : value('socialSecurityTaxable') + value('stateRefundTaxable')) + value('unemployment') + value('otherIncome'),
  };
  B[9] = [1, 2, 3, 4, 5, 6, 7, 8].reduce((total, key) => total + B[key], 0);
  B[15] = value('adjustments');
  const l16 = A[9] - A[15];
  const l17 = line5;
  const l18 = Math.max(0, B[9] - B[15]);
  const l19 = Math.max(0, l16 - l17);
  const l20 = l18 <= 0 ? 0 : l18 >= l19 ? 1 : ratio(l18, l19, { places: 4 });
  return { A, B, l16, l17, l18, l19, l20 };
}

function marriagePenalty(ctx, answers, line18, mp, rule, ndRatio) {
  if (ctx.filingStatus !== 'mfj' || line18 <= mp.jointTaxableIncomeOver) return null;
  const q = qualifiedIncome(ctx, answers);
  const l4 = Math.min(q.taxpayer, q.spouse);
  if (l4 <= mp.lesserIncomeOver) return { lines: lineTable({ 1: line18, '3a': q.taxpayer, '3b': q.spouse, 4: l4 }), credit: 0 };
  const l5 = mp.lesserIncomeReduction;
  const l6 = l4 - l5;
  const l7 = scheduleCents(l6, rule.brackets.single);
  const l8 = line18 - l6;
  const l9 = scheduleCents(l8, rule.brackets.single);
  const l10 = scheduleCents(line18, rule.brackets.mfj);
  const l11 = l7 + l9;
  const l12 = Math.round(l10 - l11) / 100;
  const l14 = Math.max(0, Math.min(l12, mp.maximum));
  const credit = ndRatio === null ? Math.round(l14) : Math.round(l14 * ndRatio);
  const cents = (value) => Math.round(value) / 100;
  return { lines: lineTable({ 1: line18, '3a': q.taxpayer, '3b': q.spouse, 4: l4, 5: l5, 6: l6, 7: cents(l7), 8: l8, 9: cents(l9), 10: cents(l10), 11: cents(l11), 12: l12, 13: mp.maximum, 14: l14, ...(ndRatio === null ? {} : { 15: ndRatio, 16: credit }) }), credit };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const table = reader.read('tax-table');
  const adjustments = reader.read('adjustments');
  const mp = reader.read('marriage-penalty');
  if (!rule || !table || !adjustments || !mp) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no North Dakota figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const checks = [];
  const notes = [];
  const bands = byStatus(rule.brackets, status);

  const federalTaxable = whole(ctx.federal.lines['15']);
  const line1a = income.agi;
  const line1b = federalTaxable > 0 ? federalTaxable : Math.min(0, income.agi - whole(ctx.federal.lines['14']));
  const line2 = 0;
  const line3 = 0;
  const line4a = line2 + line3;
  const line4b = line1b + line4a;
  const line5 = resident ? income.usObligationInterest : Math.min(income.usObligationInterest, whole(filing.sourced.usObligationInterest));
  const gain = resident ? longTermGain(ctx) : Math.min(longTermGain(ctx), Math.max(0, whole(filing.sourced.capitalGain)));
  const line6 = Math.round((gain * adjustments.capitalGainExclusionBasisPoints) / 10000);
  const line7 = 0;
  const line8 = positive(answers.railroadRetirement) + positive(answers.spouseRailroadRetirement);
  const line9 = positive(answers.peaceOfficerRetirement);
  const line10 = 0;
  const line11 = positive(answers.militaryPay);
  const line12 = Math.min(byStatus(adjustments.collegeSaveLimit, status), positive(answers.collegeSaveContributions));
  const dividends = resident ? income.qualifiedDividends : Math.min(income.qualifiedDividends, whole(filing.sourced.qualifiedDividends));
  const line13 = Math.round((dividends * adjustments.qualifiedDividendExclusionBasisPoints) / 10000);
  const line14 = positive(answers.militaryRetirement);
  const line15 = Math.max(0, income.socialSecurityTaxable - positive(answers.railroadTier1Taxable));
  const line16 = 0;
  const line17 = line5 + line6 + line7 + line8 + line9 + line10 + line11 + line12 + line13 + line14 + line15 + line16;
  const line18 = Math.max(0, line4b - line17);
  const line19 = line18;
  if (line8 + line9 + line14 > income.iraTaxable + income.pensionTaxable + income.unemployment + income.socialSecurityTaxable) checks.push(check('warning', 'ND_RETIREMENT_OVER_FEDERAL', 'The railroad, peace officer and military retirement exclusions on lines 8, 9 and 14 are more than the taxable retirement income on the federal return.', 'Check the retirement exclusion amounts; only amounts included in federal taxable income can be excluded.'));
  if (line11 > income.wages) checks.push(check('warning', 'ND_MILITARY_PAY_OVER_WAGES', 'The military pay exclusion on line 11 is more than your federal wages.', 'Enter only military pay included in federal wages.'));

  const full = taxOn(line19, rule, table, bands);
  let line20;
  let nr = null;
  if (resident) {
    line20 = full.tax;
  } else {
    nr = scheduleNR(ctx, filing, line5);
    line20 = Math.round(full.tax * nr.l20);
  }

  let line21 = 0;
  const cr = [];
  if (resident && filing.otherStates.length) {
    let room = line20;
    for (const other of filing.otherStates) {
      const l1a = line1a;
      const l1b = positive(other.income);
      const l1c = Math.min(l1b, Math.max(0, line1a));
      const l2 = line1a - line5;
      const l3 = l2 > 0 ? ratio(l1c, l2, { places: 4 }) : 0;
      const l4 = line20;
      const l5 = Math.round(l4 * l3);
      const l6 = positive(other.tax);
      const l7 = Math.max(0, Math.min(l5, l6, room));
      room -= l7;
      line21 += l7;
      cr.push({ state: other.state, lines: lineTable({ '1a': l1a, '1b': l1b, '1c': l1c, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7 }) });
    }
    checks.push(check('info', 'ND_SCHEDULE_ND1CR', 'Attach a copy of the other state\'s return to Schedule ND-1CR. No credit is allowed for wages taxed by Minnesota or Montana while the reciprocity agreements apply.'));
  }
  const penalty = marriagePenalty(ctx, answers, line18, mp, rule, resident ? null : nr.l20);
  const line22 = Math.min(penalty ? penalty.credit : 0, Math.max(0, line20 - line21));
  const line23 = 0;
  const line24 = line21 + line22 + line23;
  const line25 = Math.max(0, line20 - line24);

  if (status === 'mfj' && penalty && answers.spouseSelfEmploymentIncome === undefined && income.businessIncome > 0) checks.push(check('info', 'ND_MARRIAGE_PENALTY_SE', 'The marriage penalty credit worksheet splits qualified income between spouses. All self-employment income was counted as yours.', 'Give your spouse\'s net self-employment income if any of it is theirs.'));
  if (!resident) checks.push(check('info', 'ND_NONRESIDENT_SOURCE', 'Schedule ND-1NR Column B uses the North Dakota income in your residency answers. Interest from U.S. obligations is left out of line 2, Column B.'));
  notes.push(resident ? `Line 20 uses the ${full.method} for the line 19 amount.` : `Line 20 is the ${full.method} tax on line 19 multiplied by the Schedule ND-1NR ratio of ${nr.l20}.`);
  if (line6 || line13) notes.push('North Dakota excludes 40% of net long-term capital gains (line 6) and of qualified dividends (line 13).');

  const lines = lineTable({ '1a': line1a, '1b': line1b, 2: line2, 3: line3, '4a': line4a, '4b': line4b, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: filing.payments.withheld, 27: filing.payments.estimated + filing.payments.extension });
  return {
    form: resident ? 'ND-1' : 'ND-1 with Schedule ND-1NR',
    lines,
    schedules: {
      ...(nr ? { 'ND-1NR': { A: lineTable(nr.A), B: lineTable(nr.B), lines: lineTable({ 16: nr.l16, 17: nr.l17, 18: nr.l18, 19: nr.l19, 20: nr.l20, 21: line19, 22: full.tax, 23: line20 }) } } : {}),
      ...(cr.length ? { 'ND-1CR': cr } : {}),
      ...(penalty ? { 'Marriage Penalty Credit Worksheet': penalty.lines } : {}),
      ...(line6 ? { 'Capital Gain Exclusion Worksheet': lineTable({ 5: gain, 7: gain, 8: line6 }) } : {}),
    },
    stateIncome: nr ? nr.l18 : line4b,
    taxableIncome: line19,
    taxBeforeCredits: line20,
    nonrefundableCredits: [...(line21 ? [{ code: 'ND_ND1CR', label: 'Credit for income tax paid to another state', amount: line21 }] : []), ...(line22 ? [{ code: 'ND_MARRIAGE_PENALTY', label: 'Marriage penalty credit', amount: line22 }] : [])],
    otherStateCredit: line21,
    otherTaxes: [],
    totalTax: line25,
    refundableCredits: [],
    checks,
    notes,
  };
}

const amount = (id, text, help) => Object.freeze({ id, kind: 'amount', text, help });

export const STATE = Object.freeze({
  code: 'ND',
  name: 'North Dakota',
  built: true,
  forms: Object.freeze({ resident: 'ND-1', partYear: 'ND-1 with Schedule ND-1NR', nonresident: 'ND-1 with Schedule ND-1NR' }),
  questions: Object.freeze([
    amount('railroadRetirement', 'Your U.S. Railroad Retirement Board benefits (unemployment, sick pay or retirement) that are taxable on your federal return', 'Form ND-1 line 8. Include taxable Tier 1 benefits from Form RRB-1099 here and not on line 15.'),
    amount('spouseRailroadRetirement', 'Your spouse\'s taxable U.S. Railroad Retirement Board benefits', 'Form ND-1 line 8.'),
    amount('railroadTier1Taxable', 'Taxable Social Security equivalent (Tier 1) railroad benefits included in federal line 6b', 'These are entered on line 8 with the railroad amounts above, so they are taken out of the line 15 social security exclusion.'),
    amount('peaceOfficerRetirement', 'Taxable retirement benefits of a retired licensed peace officer with 20 years of service or retired disabled', 'Form ND-1 line 9. Attach Form 1099-R and, the first year, the POST board profile.'),
    amount('militaryPay', 'Military pay for active or reserve duty or National Guard service included in federal wages', 'Form ND-1 line 11.'),
    amount('militaryRetirement', 'Taxable military retirement benefits (including a surviving spouse\'s)', 'Form ND-1 line 14.'),
    amount('collegeSaveContributions', 'Contributions in the year to a North Dakota College SAVE account', 'Form ND-1 line 12; up to $5,000, or $10,000 if married filing jointly. Rollovers do not count.'),
    amount('spouseSelfEmploymentIncome', 'Your spouse\'s net self-employment income (Schedule SE line 3 less the self-employment tax deduction)', 'Used only to split qualified income for the marriage penalty credit.'),
  ]),
  notCovered: Object.freeze([
    'Planned gift and endowment credit adjustment (line 2), lump-sum distributions and S corporation additions on Schedule ND-1SA (line 3)',
    'Native American exempt income (line 7), the Servicemembers Civil Relief Act adjustment (line 10) and Schedule ND-1SA subtractions (line 16)',
    'Farm income averaging and research credit sale (Schedule ND-1FA, line 20) and the other credits on Schedule ND-1TC (line 23)',
    'Part-year residents\' credit for tax paid to another state and credits for tax paid to a local jurisdiction',
    'Minnesota and Montana reciprocity filing for residents of those states with only North Dakota wages (Form NDW-R)',
    'Underpayment penalty (Schedule ND-1UT) and voluntary contributions (lines 31 and 35)',
  ]),
  compute,
});
