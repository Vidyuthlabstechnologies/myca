import { whole, positive, ratio, check, lineTable, byStatus, yesNo } from '../state-kit.mjs';

const OWNERS = ['taxpayer', 'spouse'];

function scheduleTax(amount, bands) {
  const cents = Math.round(Math.max(0, Number(amount) || 0) * 100);
  let total = 0;
  bands.forEach((band, index) => {
    const upTo = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    total += Math.max(0, Math.min(cents, upTo) - band.overCents) * band.rateBp;
  });
  return Math.floor((total + 500000) / 1000000);
}

function incomeTax(amount, rule, status) {
  if (amount <= 0) return { tax: 0, method: 'Tax Table' };
  if (amount >= rule.tableBelow) {
    const excessCents = Math.round((amount - rule.aboveTable.over) * 100) * rule.aboveTable.rateBp;
    return { tax: byStatus(rule.aboveTable.base, status) + Math.floor((excessCents + 500000) / 1000000), method: 'tax computation worksheet' };
  }
  const low = Math.floor(amount / rule.tableRowWidth) * rule.tableRowWidth;
  return { tax: scheduleTax(low + rule.tableRowWidth / 2, byStatus(rule.brackets, status)), method: 'Tax Table' };
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));
const pick = (answers, role, id) => positive(answers[role === 'spouse' ? `spouse${id[0].toUpperCase()}${id.slice(1)}` : id]);

function retirementByOwner(ctx) {
  const income = ctx.income;
  const total = income.iraTaxable + income.pensionTaxable;
  if (ctx.filingStatus !== 'mfj') return { taxpayer: total, spouse: 0 };
  let all = 0;
  let spouse = 0;
  for (const form of ctx.forms) {
    if (form.kind !== '1099-R') continue;
    all += taxableOf(form);
    if (ownerOf(form) === 'spouse') spouse += taxableOf(form);
  }
  const spouseShare = all ? Math.round((total * spouse) / all) : 0;
  return { taxpayer: total - spouseShare, spouse: spouseShare };
}

function subtractions(ctx, filing, deductions, checks) {
  const answers = filing.answers;
  const income = ctx.income;
  const owned = retirementByOwner(ctx);
  let l3 = 0;
  let l4 = 0;
  let l5 = 0;
  let l6 = 0;
  let l7 = 0;
  for (const role of OWNERS) {
    if (role === 'spouse' && ctx.filingStatus !== 'mfj') continue;
    const csrs = pick(answers, role, 'csrsRetirement');
    const military = pick(answers, role, 'militaryRetirement');
    const railroad = pick(answers, role, 'railroadRetirement');
    const government = Math.min(deductions.retirementExclusionLimit, pick(answers, role, 'governmentRetirement'));
    const rest = Math.max(0, owned[role] - csrs - military - railroad - pick(answers, role, 'governmentRetirement'));
    const other = Math.min(Math.max(0, deductions.retirementExclusionLimit - government), rest);
    if (csrs + military + railroad + pick(answers, role, 'governmentRetirement') > owned[role] + (role === 'taxpayer' ? income.socialSecurityTaxable : 0)) checks.push(check('warning', 'OK_RETIREMENT_OVER_1099R', `The retirement exclusions entered for ${role === 'spouse' ? 'your spouse' : 'you'} are more than the taxable retirement income on that person's 1099-R forms.`, 'Check the retirement amounts; only retirement income in federal AGI can be excluded.'));
    l3 += csrs;
    l4 += military;
    l5 += government;
    l6 += other;
    l7 += railroad;
  }
  const l1 = income.usObligationInterest;
  const l2 = income.socialSecurityTaxable;
  const l13 = income.stateRefundTaxable;
  const l18 = l1 + l2 + l3 + l4 + l5 + l6 + l7 + l13;
  return lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7, 13: l13, 18: l18 });
}

function itemizedDeduction(ctx, deductions) {
  const scheduleA = ctx.federal.schedules?.A || {};
  const l1 = whole(ctx.itemized.federalAllowed);
  const salt = whole(scheduleA['5d']);
  const allowed = whole(scheduleA['5e']);
  const l2 = salt > allowed && salt > 0 ? Math.round((whole(scheduleA['5a']) * allowed) / salt) : whole(scheduleA['5a']);
  const l3 = Math.max(0, l1 - l2);
  const l4 = whole(scheduleA['4']);
  const l5 = whole(scheduleA['14']);
  const l6 = l3 - l4 - l5;
  const limited = l6 > deductions.itemizedLimit;
  const l11 = limited ? deductions.itemizedLimit + l4 + l5 : l3;
  return { amount: l11, lines: lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, ...(limited ? { 8: deductions.itemizedLimit, 9: l4, 10: l5 } : {}), 11: l11 }) };
}

function exemptions(ctx, deductions) {
  const status = ctx.filingStatus;
  const agi = ctx.income.agi;
  const taxpayer = ctx.filers.find((item) => item.role === 'taxpayer');
  const spouse = status === 'mfj' ? ctx.filers.find((item) => item.role === 'spouse') : null;
  const special = agi <= byStatus(deductions.specialExemptionAgiLimit, status);
  const row = (person) => {
    if (!person) return { regular: 0, special: 0, blind: 0 };
    return { regular: person.canBeClaimedAsDependent ? 0 : 1, special: special && person.age !== null && person.age >= deductions.specialExemptionAge ? 1 : 0, blind: person.blind ? 1 : 0 };
  };
  const yours = row(taxpayer);
  const theirs = row(spouse);
  const dependents = ctx.dependents.length;
  const total = yours.regular + yours.special + yours.blind + theirs.regular + theirs.special + theirs.blind + dependents;
  return { yours, theirs, dependents, total, household: yours.regular + theirs.regular + dependents };
}

function childCredit(ctx, credits, numerator, denominator, checks) {
  const lines = ctx.federal.lines;
  const care = whole(ctx.federal.schedules?.[3]?.['2']);
  const odcCount = ctx.dependents.filter((item) => !item.ctcEligible).length;
  const nonrefundable = whole(lines['19']);
  const ctc = Math.max(0, nonrefundable - Math.min(nonrefundable, odcCount * 500)) + whole(lines['28']);
  if (ctx.income.agi > credits.childCredit.agiLimit || (care <= 0 && ctc <= 0)) return null;
  if (odcCount && nonrefundable) checks.push(check('info', 'OK_CHILD_CREDIT_ODC', 'The $500 credit for other dependents was taken out of federal line 19 for the 5% child tax credit test on Schedule 511-F.'));
  const l2 = Math.round((care * credits.childCredit.careBasisPoints) / 10000);
  const l4 = Math.round((ctc * credits.childCredit.childTaxBasisPoints) / 10000);
  const l5 = Math.max(l2, l4);
  const l6 = denominator > 0 ? ratio(Math.max(0, numerator), denominator, { places: 4 }) : 0;
  const l7 = Math.round(l5 * l6);
  return lineTable({ 1: care, 2: l2, 3: ctc, 4: l4, 5: l5, 6: l6, 7: l7 });
}

function otherStateCredit(filing, okAgi, okTax) {
  const rows = [];
  let total = 0;
  let room = okTax;
  for (const other of filing.otherStates) {
    const l1 = Math.min(positive(other.sourced?.wages), Math.max(0, okAgi));
    const l2 = okAgi;
    const l3 = l2 > 0 ? ratio(l1, l2, { places: 4 }) : 0;
    const l4 = okTax;
    const l5 = Math.round(l4 * l3);
    const l6 = positive(other.income) > 0 ? Math.round((positive(other.tax) * Math.min(l1, positive(other.income))) / positive(other.income)) : 0;
    const l7 = Math.max(0, Math.min(l5, l6, room));
    room -= l7;
    total += l7;
    rows.push({ state: other.state, lines: lineTable({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7 }) });
  }
  return { rows, total };
}

function salesTaxRelief(ctx, filing, credits, ex, checks) {
  const answers = filing.answers;
  const income = ctx.income;
  if (filing.residency !== 'full-year' || ex.household < 1) return null;
  const federalEic = whole(ctx.federal.lines['27']);
  const gross = income.wages + income.taxableInterest + income.taxExemptInterest + income.ordinaryDividends + income.socialSecurityBenefits + income.iraTaxable + income.pensionTaxable + income.unemployment + Math.max(0, income.businessIncome) + Math.max(0, income.capitalGain) + Math.max(0, income.otherIncome) + federalEic + positive(answers.otherHouseholdIncome);
  const raised = ctx.dependents.length > 0 || ctx.filers.some((item) => item.age !== null && item.age >= 65) || yesNo(answers.disabled);
  const limit = raised ? credits.salesTaxRelief.raisedIncomeLimit : credits.salesTaxRelief.incomeLimit;
  if (gross > limit) return null;
  checks.push(check('info', 'OK_SALES_TAX_RELIEF', `Total gross household income on Form 538-S was estimated at $${gross.toLocaleString('en-US')} from the federal return, below the $${limit.toLocaleString('en-US')} limit. Add nontaxable income and the income of others in the household, and note that people who received TANF in the year do not qualify.`, 'Answer the other household income question if anyone else in the household had income.'));
  return lineTable({ 14: gross, limit, exemptions: ex.household, 15: ex.household * credits.salesTaxRelief.perExemption });
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  if (!rule || !deductions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Oklahoma figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];

  const a = subtractions(ctx, filing, deductions, checks);
  const muni = Math.max(0, income.taxExemptInterest - positive(answers.okMunicipalInterest));
  if (income.taxExemptInterest > 0 && answers.okMunicipalInterest === undefined) checks.push(check('warning', 'OK_MUNICIPAL_INTEREST', 'Tax-exempt interest from other states\' bonds is added back on Schedule 511-B line 1. All of your tax-exempt interest is added back until you say how much is from Oklahoma bonds.', 'Answer the Oklahoma bond interest question (0 if none).'));
  const b = lineTable({ 1: muni, 10: muni });
  const c1 = positive(answers.militaryPay);
  const c3 = Math.min(byStatus(deductions.collegeSavingsLimit, status), positive(answers.collegeSavingsContributions));
  const c = lineTable({ 1: c1, 3: c3, 7: c1 + c3 });
  if (c1 > income.wages) checks.push(check('warning', 'OK_MILITARY_PAY_OVER_WAGES', 'The military pay exclusion on Schedule 511-C line 1 is more than your federal wages.', 'Enter only military pay included in federal wages.'));

  const itemizing = Boolean(ctx.itemized.federalItemized);
  const d = itemizing ? itemizedDeduction(ctx, deductions) : null;
  const deduction = d ? d.amount : byStatus(deductions.standard, status);
  const ex = exemptions(ctx, deductions);
  const exemptionAmount = ex.total * deductions.exemption;
  const schedules = { '511-A': a, ...(muni ? { '511-B': b } : {}), ...(c['7'] ? { '511-C': c } : {}), ...(d ? { '511-D': d.lines } : {}) };
  schedules.exemptions = lineTable({ yourself: ex.yours.regular, yourSpecial: ex.yours.special, yourBlind: ex.yours.blind, spouse: ex.theirs.regular, spouseSpecial: ex.theirs.special, spouseBlind: ex.theirs.blind, dependents: ex.dependents, total: ex.total });

  if (!resident) {
    const sourced = filing.sourced;
    const value = (key) => whole(sourced[key]);
    const column = (source) => {
      const out = { 1: whole(source.wages), 2: whole(source.taxableInterest), 3: whole(source.ordinaryDividends), 4: whole(source.iraTaxable), 5: whole(source.pensionTaxable), 6: whole(source.socialSecurityTaxable), 7: whole(source.capitalGain), 8: whole(source.stateRefundTaxable), 9: 0, 10: whole(source.businessIncome), 11: 0, 12: 0, 13: 0, 14: whole(source.unemployment), 15: whole(source.otherIncome) };
      out[16] = Object.values(out).reduce((total, amount) => total + amount, 0);
      out[17] = whole(source.adjustments);
      out[18] = out[16] - out[17];
      return out;
    };
    const federalColumn = column(income);
    const okColumn = column(sourced);
    const okRetirementExclusion = Math.min(a['3'] + a['4'] + a['5'] + a['6'] + a['7'], value('iraTaxable') + value('pensionTaxable'));
    const okSubtractions = Math.min(value('usObligationInterest'), a['1']) + value('socialSecurityTaxable') + okRetirementExclusion + (partYear ? value('stateRefundTaxable') : 0);
    const okAdditions = partYear ? Math.round(muni * filing.share) : 0;
    const line1 = okColumn[18];
    const line2 = federalColumn[18];
    const line3 = { federal: muni, oklahoma: okAdditions };
    const line4 = { federal: line2 + muni, oklahoma: line1 + okAdditions };
    const line5 = { federal: a['18'], oklahoma: okSubtractions };
    const line6 = line4.oklahoma - line5.oklahoma;
    const line7 = line4.federal - line5.federal;
    const line8 = c['7'];
    const line9 = line7 - line8;
    const line10 = deduction;
    const line11 = exemptionAmount;
    const line12 = line10 + line11;
    const line13 = Math.max(0, line9 - line12);
    const tax = incomeTax(line13, rule, status);
    const line14 = tax.tax;
    let e = null;
    if (filing.residency === 'nonresident') {
      if (ctx.federal.schedules?.[3]?.['2'] || ctx.federal.lines['19'] || ctx.federal.lines['28']) checks.push(check('info', 'OK_NONRESIDENT_CHILD_CREDIT', 'The Oklahoma child care/child tax credit is allowed to nonresidents only if they are military. It was not claimed.', 'If you are nonresident military, have your CPA add the credit on line 15.'));
    } else {
      e = childCredit(ctx, credits, Math.min(line7, line2), line2, checks);
    }
    const line15 = e ? e['7'] : 0;
    const line16 = Math.max(0, line14 - line15);
    const line17 = line7 > 0 ? ratio(Math.max(0, line6), line7, { places: 4 }) : 0;
    const line18 = Math.round(line16 * line17);
    const tx = partYear && filing.otherStates.length ? otherStateCredit(filing, line6, line18) : { rows: [], total: 0 };
    const line19 = tx.total;
    const line20 = 0;
    const line21 = Math.max(0, line18 - line19 - line20);
    const line22 = positive(answers.useTax);
    const line23 = line21 + line22;
    const federalEic = whole(ctx.federal.lines['27']);
    const f2 = partYear ? Math.round((federalEic * credits.earnedIncomeBasisPoints) / 10000) : 0;
    const f3 = line2 > 0 ? ratio(Math.max(0, line6), line2, { places: 4 }) : 0;
    const line28 = Math.round(f2 * f3);
    if (partYear && federalEic) checks.push(check('info', 'OK_EIC_2020_RULES', 'The Oklahoma earned income credit is 5% of the federal credit figured under the 2020 federal rules (Form 511-EIC). MyCA used this year\'s federal credit.', 'Have your CPA check Form 511-EIC if your federal credit would differ under the 2020 rules.'));
    if (line17 === 1 && line6 > line7) checks.push(check('info', 'OK_NR_PERCENT_LIMIT', 'Your Oklahoma income is more than your income from all sources, so the line 17 percentage was limited to 100%.'));
    notes.push(`Line 14 uses the ${tax.method}; line 18 multiplies the line 16 tax base by the line 17 percentage of Oklahoma-source to all-source adjusted gross income, rounded to four decimal places.`);
    const lines = lineTable({ 1: line1, 2: line2, '3f': line3.federal, '3o': line3.oklahoma, '4f': line4.federal, '4o': line4.oklahoma, '5f': line5.federal, '5o': line5.oklahoma, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: filing.payments.withheld, 25: filing.payments.estimated, 26: filing.payments.extension, 28: line28 });
    return {
      form: '511-NR',
      lines,
      schedules: { ...schedules, '511-NR-1': { federal: lineTable(federalColumn), oklahoma: lineTable(okColumn) }, ...(e ? { '511-NR-E': e } : {}), ...(line28 ? { '511-NR-F': lineTable({ 1: federalEic, 2: f2, 3: f3, 4: line28 }) } : {}), ...(tx.rows.length ? { '511-TX': tx.rows } : {}) },
      stateIncome: line6,
      taxableIncome: line13,
      taxBeforeCredits: line18,
      nonrefundableCredits: [...(line15 ? [{ code: 'OK_CHILD_CREDIT', label: 'Oklahoma child care/child tax credit', amount: line15 }] : []), ...(line19 ? [{ code: 'OK_511TX', label: 'Credit for taxes paid to another state', amount: line19 }] : [])],
      otherStateCredit: line19,
      otherTaxes: line22 ? [{ code: 'OK_USE_TAX', label: 'Oklahoma use tax', amount: line22 }] : [],
      totalTax: line23,
      refundableCredits: line28 ? [{ code: 'OK_EIC', label: 'Oklahoma earned income credit', amount: line28 }] : [],
      checks,
      notes,
    };
  }

  const line1 = income.agi;
  const line2 = a['18'];
  const line3 = line1 - line2;
  const line4 = positive(answers.outOfStateIncome);
  const line5 = line3 - line4;
  const line6 = b['10'];
  const line7 = line5 + line6;
  const line8 = c['7'];
  const line9 = line7 - line8;
  let line10 = deduction;
  let line11 = exemptionAmount;
  let line12 = line10 + line11;
  if (line4 > 0) {
    const e3 = line10 + line11;
    const e4 = line3 > 0 ? ratio(Math.max(0, line7), line3, { places: 4 }) : 0;
    line12 = Math.round(e3 * e4);
    schedules['511-E'] = lineTable({ 1: line10, 2: line11, 3: e3, 4: e4, 5: line12 });
    line10 = 0;
    line11 = 0;
    checks.push(check('info', 'OK_OUT_OF_STATE_INCOME', 'Out-of-state business or property income on line 4 reduces your deductions and exemptions by the Schedule 511-E ratio. Provide a schedule and the other state\'s return.'));
  }
  const line13 = Math.max(0, line9 - line12);
  const tax = incomeTax(line13, rule, status);
  const line14 = tax.tax;
  const f = childCredit(ctx, credits, line7, line1, checks);
  if (f) schedules['511-F'] = f;
  const line15 = f ? f['7'] : 0;
  const tx = filing.otherStates.length ? otherStateCredit(filing, line7, line14) : { rows: [], total: 0 };
  if (tx.rows.length) {
    schedules['511-TX'] = tx.rows;
    checks.push(check('info', 'OK_511TX', 'Form 511-TX allows credit only for tax on wages and other pay for personal services taxed by both states. Provide a complete copy of the other state\'s return.'));
  }
  const line16 = Math.min(tx.total, Math.max(0, line14 - line15));
  const line17 = 0;
  const line18 = Math.max(0, line14 - line15 - line16 - line17);
  const line19 = positive(answers.useTax);
  if (answers.useTax === undefined) checks.push(check('info', 'OK_USE_TAX', 'Oklahoma asks for use tax on out-of-state and online purchases on line 19; you may use the Use Tax Table.', 'Answer the use tax question (0 if none).'));
  const line20 = line18 + line19;
  const relief = salesTaxRelief(ctx, filing, credits, ex, checks);
  if (relief) schedules['538-S'] = relief;
  const line25 = relief ? relief['15'] : 0;
  const federalEic = whole(ctx.federal.lines['27']);
  const g2 = Math.round((federalEic * credits.earnedIncomeBasisPoints) / 10000);
  const g3 = line1 > 0 ? ratio(Math.max(0, line7), line1, { places: 4 }) : 0;
  const line28 = Math.round(g2 * g3);
  if (line28) {
    schedules['511-G'] = lineTable({ 1: federalEic, 2: g2, 3: g3, 4: line28 });
    checks.push(check('info', 'OK_EIC_2020_RULES', 'The Oklahoma earned income credit is 5% of the federal credit figured under the 2020 federal rules (Form 511-EIC). MyCA used this year\'s federal credit.', 'Have your CPA check Form 511-EIC if your federal credit would differ under the 2020 rules.'));
  }
  notes.push(`Line 14 uses the ${tax.method}.`);
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: filing.payments.withheld, 22: filing.payments.estimated, 23: filing.payments.extension, 25: line25, 28: line28 });
  return {
    form: '511',
    lines,
    schedules,
    stateIncome: line7,
    taxableIncome: line13,
    taxBeforeCredits: line14,
    nonrefundableCredits: [...(line15 ? [{ code: 'OK_CHILD_CREDIT', label: 'Oklahoma child care/child tax credit', amount: line15 }] : []), ...(line16 ? [{ code: 'OK_511TX', label: 'Credit for taxes paid to another state', amount: line16 }] : [])],
    otherStateCredit: line16,
    otherTaxes: line19 ? [{ code: 'OK_USE_TAX', label: 'Oklahoma use tax', amount: line19 }] : [],
    totalTax: line20,
    refundableCredits: [...(line25 ? [{ code: 'OK_SALES_TAX_RELIEF', label: 'Sales tax relief credit', amount: line25 }] : []), ...(line28 ? [{ code: 'OK_EIC', label: 'Oklahoma earned income credit', amount: line28 }] : [])],
    checks,
    notes,
  };
}

const RESIDENT_LABELS = Object.freeze({
  1: 'Federal adjusted gross income',
  2: 'Oklahoma subtractions (Schedule 511-A)',
  3: 'Line 1 minus line 2',
  4: 'Out-of-state income, except wages',
  5: 'Line 3 minus line 4',
  6: 'Oklahoma additions (Schedule 511-B)',
  7: 'Oklahoma adjusted gross income',
  8: 'Oklahoma adjustments (Schedule 511-C)',
  9: 'Oklahoma income after adjustments',
  10: 'Oklahoma itemized or standard deduction',
  11: 'Exemptions',
  12: 'Total deductions and exemptions',
  13: 'Oklahoma taxable income',
  14: 'Oklahoma income tax',
  15: 'Oklahoma child care/child tax credit',
  16: 'Credit for taxes paid to another state (Form 511-TX)',
  17: 'Other credits (Form 511-CR)',
  18: 'Income tax (line 14 minus lines 15 to 17)',
  19: 'Use tax due on out-of-state purchases',
  20: 'Balance (add lines 18 and 19)',
  21: 'Oklahoma withholding',
  22: 'Estimated tax payments',
  23: 'Payment with extension',
  25: 'Sales tax relief credit (Form 538-S)',
  28: 'Oklahoma earned income credit',
});

const NONRESIDENT_LABELS = Object.freeze({
  1: 'Oklahoma source income',
  2: 'Federal adjusted gross income',
  '3f': 'Oklahoma additions (federal column)',
  '3o': 'Oklahoma additions (Oklahoma column)',
  '4f': 'Add lines 2 and 3 (federal column)',
  '4o': 'Add lines 1 and 3 (Oklahoma column)',
  '5f': 'Oklahoma subtractions (federal column)',
  '5o': 'Oklahoma subtractions (Oklahoma column)',
  6: 'Adjusted gross income: Oklahoma source',
  7: 'Adjusted gross income: all sources',
  8: 'Oklahoma adjustments (Schedule 511-NR-C)',
  9: 'Income after adjustments',
  10: 'Oklahoma itemized or standard deduction',
  11: 'Exemptions',
  12: 'Total deductions and exemptions',
  13: 'Oklahoma taxable income',
  14: 'Oklahoma income tax from tax table',
  15: 'Oklahoma child care/child tax credit',
  16: 'Tax base (line 14 minus line 15)',
  17: 'Tax percentage (Oklahoma amount over federal amount)',
  18: 'Oklahoma income tax (line 16 times line 17)',
  19: 'Credit for taxes paid to another state (Form 511-TX)',
  20: 'Other tax credits (Form 511-CR)',
  21: 'Line 18 minus lines 19 and 20',
  22: 'Use tax due on out-of-state purchases',
  23: 'Balance (add lines 21 and 22)',
  24: 'Oklahoma withholding',
  25: 'Oklahoma estimated tax payments',
  26: 'Payment with extension',
  28: 'Oklahoma earned income credit',
});

const amount = (id, text, help, when) => Object.freeze({ id, kind: 'amount', text, help, ...(when ? { when } : {}) });

export const STATE = Object.freeze({
  code: 'OK',
  name: 'Oklahoma',
  built: true,
  forms: Object.freeze({ resident: '511', partYear: '511-NR', nonresident: '511-NR' }),
  labels: (taxYear, residency) => (residency === 'full-year' ? RESIDENT_LABELS : NONRESIDENT_LABELS),
  questions: Object.freeze([
    amount('okMunicipalInterest', 'Tax-exempt interest from Oklahoma state or local bonds', 'Interest from other states\' bonds is added back on Schedule 511-B line 1; Oklahoma bond interest is not. Enter 0 if none.', { has: ['taxExemptInterest'] }),
    amount('governmentRetirement', 'Your taxable retirement from the U.S. Civil Service or an Oklahoma public retirement system (teachers, public employees, police, firefighters, judges)', 'Schedule 511-A line 5; up to $10,000.', { has: ['retirementIncome'] }),
    amount('spouseGovernmentRetirement', 'Your spouse\'s taxable retirement from the U.S. Civil Service or an Oklahoma public retirement system', 'Schedule 511-A line 5; up to $10,000.', { filingStatus: ['mfj'], has: ['retirementIncome'] }),
    amount('csrsRetirement', 'Your Federal Civil Service Retirement System (CSRS) benefits paid in lieu of Social Security', 'Schedule 511-A line 3; fully excluded. FERS benefits do not qualify except the annuity supplement.', { has: ['retirementIncome'] }),
    amount('spouseCsrsRetirement', 'Your spouse\'s CSRS benefits paid in lieu of Social Security', 'Schedule 511-A line 3.', { filingStatus: ['mfj'], has: ['retirementIncome'] }),
    amount('militaryRetirement', 'Your taxable military retirement benefits', 'Schedule 511-A line 4; fully excluded.', { has: ['retirementIncome'] }),
    amount('spouseMilitaryRetirement', 'Your spouse\'s taxable military retirement benefits', 'Schedule 511-A line 4.', { filingStatus: ['mfj'], has: ['retirementIncome'] }),
    amount('railroadRetirement', 'Your U.S. Railroad Retirement Board benefits included in federal AGI', 'Schedule 511-A line 7.'),
    amount('spouseRailroadRetirement', 'Your spouse\'s Railroad Retirement Board benefits included in federal AGI', 'Schedule 511-A line 7.', { filingStatus: ['mfj'] }),
    amount('outOfStateIncome', 'Income from real or tangible property or a business in another state (not wages, interest, dividends or pensions)', 'Form 511 line 4. Deductions and exemptions are then prorated on Schedule 511-E.', { residency: ['full-year'] }),
    amount('militaryPay', 'Active duty, Reserve or National Guard military pay included in federal wages', 'Schedule 511-C line 1.'),
    amount('collegeSavingsContributions', 'Contributions in the year to an Oklahoma 529 College Savings Plan or OklahomaDream 529 account', 'Schedule 511-C line 3; up to $10,000, or $20,000 on a joint return.'),
    amount('useTax', 'Oklahoma use tax owed on out-of-state or online purchases with no Oklahoma sales tax', 'Form 511 line 19; enter 0 if none.'),
    Object.freeze({ id: 'disabled', kind: 'yesno', text: 'Do you or your spouse have a physical disability that is a substantial handicap to employment?', help: 'Raises the Form 538-S sales tax relief income limit to $50,000.', when: { residency: ['full-year'] } }),
    amount('otherHouseholdIncome', 'Nontaxable income and income of other people living in your household', 'Form 538-S lines 10 and 13, for the sales tax relief credit.', { residency: ['full-year'] }),
  ]),
  notCovered: Object.freeze([
    'Schedule 511-A lines 8 to 12 and 14 to 17 (depletion, Oklahoma net operating loss, tribal income, exempt obligation gains, the Oklahoma capital gain deduction on Form 561, electing PTE income and other subtractions)',
    'Schedule 511-B lines 2 to 9 and Schedule 511-C lines 2 and 4 to 6 (out-of-state losses, lump sums, NOL and depletion add-backs, 529 recapture, disability, foster care and private school deductions)',
    'Other credits on Form 511-CR (line 17), the low income property tax credit (Form 538-H), natural disaster, Form 578 and homeschool credits (lines 24, 26, 27 and 29)',
    'The child care/child tax credit for nonresident military and Schedule 511-NR-B nonresident military wages',
    'Recomputing the federal earned income credit under the 2020 rules (Form 511-EIC)',
    'Married couples where one spouse is a resident and the other a nonresident civilian (Form 574)',
    'Underpayment interest (Form OW-8-P), penalties and donations from the refund',
  ]),
  compute,
});
