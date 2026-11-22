import { whole, positive, ratio, check, lineTable, byStatus, rateOf, bracketTax } from '../state-kit.mjs';
import { incomeByOwner, OWNERS, filerOf, bornOnOrBefore, applyRatio } from './va-spouses.mjs';

const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');

function rhodeIslandTax(rule, taxable) {
  const amount = Math.max(0, whole(taxable));
  if (amount < rule.table.below) {
    const first = rule.table.firstRows.find((row) => amount < row.below);
    if (first) return first.tax;
    const start = Math.floor(amount / rule.table.width) * rule.table.width;
    return bracketTax(start + rule.table.width / 2, rule.brackets);
  }
  return bracketTax(amount, rule.brackets);
}

function phaseoutFactor(rule, modifiedAgi) {
  const excess = whole(modifiedAgi) - rule.phaseout.start;
  if (excess <= 0) return { factor: 1, steps: 0 };
  if (excess > rule.phaseout.width) return { factor: 0, steps: null };
  const steps = Math.ceil(excess / rule.phaseout.increment);
  return { factor: rule.phaseout.percentages[steps - 1] ?? 0, steps };
}

function socialSecurityModification(ctx, mods, eligibleDate) {
  const agi = ctx.income.agi;
  const limit = byStatus(mods.retirementAgiLimit, ctx.filingStatus);
  const owners = ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  const eligible = owners.filter((owner) => bornOnOrBefore(filerOf(ctx, owner), eligibleDate));
  if (!eligible.length || agi >= limit || !ctx.income.socialSecurityTaxable) return { amount: 0, sheet: null };
  let share = 1;
  const l8 = ctx.income.socialSecurityBenefits;
  let l9 = l8;
  if (eligible.length < owners.length) {
    l9 = formsOf(ctx, 'SSA-1099').filter((form) => eligible.includes(ownerOf(form))).reduce((total, form) => total + positive(form.fields?.netBenefits), 0);
    share = ratio(l9, l8, { places: 4 });
  }
  const amount = applyRatio(ctx.income.socialSecurityTaxable, share, 4);
  return { amount, sheet: lineTable({ 3: agi, 6: limit, 8: l8, 9: l9, 10: share, 11: ctx.income.socialSecurityTaxable, 12: share, 13: amount }) };
}

function pensionModification(ctx, filing, mods, eligibleDate) {
  const agi = ctx.income.agi;
  if (agi > byStatus(mods.retirementAgiLimit, ctx.filingStatus)) return { amount: 0, rows: null };
  const byOwner = incomeByOwner(ctx);
  const owners = ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  let military = positive(filing.answers.militaryPension);
  const rows = {};
  let amount = 0;
  for (const owner of owners) {
    const pension = ctx.filingStatus === 'mfj' ? byOwner[owner].pension : ctx.income.pensionTaxable;
    const militaryHere = Math.min(military, pension);
    military -= militaryHere;
    if (!bornOnOrBefore(filerOf(ctx, owner), eligibleDate)) continue;
    const l2 = Math.max(0, pension - militaryHere);
    if (!l2) continue;
    const l3 = Math.min(l2, mods.pensionMaximum);
    rows[owner] = lineTable({ 2: l2, 3: l3 });
    amount += l3;
  }
  return { amount, rows: Object.keys(rows).length ? rows : null };
}

function householdIncome(ctx, answers) {
  const income = ctx.income;
  const lines = ctx.federal.lines;
  const l14 = income.wages;
  const l15 = whole(lines['2a']) + whole(lines['2b']) + whole(lines['3b']);
  const l16 = income.stateRefundTaxable;
  const l18 = income.businessIncome;
  const l19 = income.capitalGain;
  const l20 = whole(lines['4a']) + whole(lines['5a']);
  const l23 = income.unemployment;
  const l24 = income.socialSecurityBenefits;
  const l25 = income.otherIncome;
  const l26 = l14 + l15 + l16 + l18 + l19 + l20 + l23 + l24 + l25;
  const l27 = income.adjustments;
  const l28 = l26 - l27;
  const l29 = positive(answers.publicAssistance);
  const l30 = positive(answers.otherNontaxableIncome);
  const l31 = Math.max(0, -l18) + Math.max(0, -l19) + Math.max(0, -l25);
  const l32 = l28 + l29 + l30 + l31;
  return lineTable({ 14: l14, 15: l15, 16: l16, 18: l18, 19: l19, 20: l20, 23: l23, 24: l24, 25: l25, 26: l26, 27: l27, 28: l28, 29: l29, 30: l30, 31: l31, 32: l32 });
}

function propertyTaxRelief(ctx, filing, relief) {
  const answers = filing.answers;
  const propertyTax = positive(answers.propertyTaxPaid);
  const rent = positive(answers.rentPaid);
  if (!propertyTax && !rent) return null;
  const older = ctx.filers.some((item) => (item.age ?? 0) >= 65);
  const disabled = answers.socialSecurityDisability === true;
  const income = householdIncome(ctx, answers);
  const l1b = income['32'];
  const persons = ctx.filers.length + ctx.dependents.length;
  const eligible = filing.residency === 'full-year' && (older || disabled) && l1b <= relief.incomeLimit;
  const band = relief.percentages.find((row) => l1b <= row.upTo) || relief.percentages[relief.percentages.length - 1];
  const percent = persons > 1 ? band.twoOrMoreBp : band.onePersonBp;
  let lines;
  let l13 = 0;
  if (propertyTax) {
    const l4 = rateOf(l1b, percent);
    const l5 = Math.max(0, propertyTax - l4);
    const l6 = Math.min(l5, relief.maximum);
    l13 = eligible ? l6 : 0;
    lines = { 2: propertyTax, 3: percent / 100, 4: l4, 5: l5, 6: l6 };
  } else {
    const l8 = rateOf(rent, relief.rentBp);
    const l10 = rateOf(l1b, percent);
    const l11 = Math.max(0, l8 - l10);
    const l12 = Math.min(l11, relief.maximum);
    l13 = eligible ? l12 : 0;
    lines = { 7: rent, 8: l8, 9: percent / 100, 10: l10, 11: l11, 12: l12 };
  }
  return { eligible, older, disabled, amount: l13, lines: lineTable({ '1a': positive(answers.publicAssistance), '1b': l1b, '1f': persons, ...lines, 13: l13 }), household: income };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const mods = reader.read('modifications');
  const credits = reader.read('credits');
  if (!rule || !mods || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Rhode Island figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : resident ? 1 : 0;
  const sourced = filing.sourced;
  const checks = [];
  const notes = [];
  const eligibleDate = mods.retirementBornOnOrBefore;

  const m1a = income.usObligationInterest;
  const beneficiaryCap = ctx.filingStatus === 'mfj' ? mods.college529.joint : mods.college529.other;
  const m1g = Math.min(positive(answers.collegeSavingsContributions), beneficiaryCap);
  const ss = socialSecurityModification(ctx, mods, eligibleDate);
  const m1s = ss.amount;
  const pension = pensionModification(ctx, filing, mods, eligibleDate);
  const m1t = pension.amount;
  const m1v = Math.min(positive(answers.militaryPension), income.pensionTaxable);
  const m1y = -(m1a + m1g + m1s + m1t + m1v);
  const m2a = Math.max(0, income.taxExemptInterest - positive(answers.rhodeIslandMunicipalInterest));
  const m2m = m2a;
  const m3 = m1y + m2m;
  const scheduleM = lineTable({ '1a': -m1a, '1g': -m1g, '1s': -m1s, '1t': -m1t, '1v': -m1v, '1y': m1y, '2a': m2a, '2m': m2m, 3: m3 });

  const line1 = income.agi;
  const line2 = m3;
  const line3 = line1 + line2;
  const phase = phaseoutFactor(rule, line3);
  const standardBase = byStatus(rule.standardDeduction, ctx.filingStatus);
  const line4 = Math.round(standardBase * phase.factor);
  const line5 = Math.max(0, line3 - line4);
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const exemptions = dependentFiler ? 0 : ctx.filers.length + ctx.dependents.length;
  const exemptionBase = exemptions * rule.exemption;
  const line6 = Math.round(exemptionBase * phase.factor);
  const line7 = Math.max(0, line5 - line6);
  const line8 = rhodeIslandTax(rule, line7);

  const careFederal = whole(ctx.federal.schedules?.[3]?.['2']);
  const s20 = careFederal;
  const s21 = rateOf(s20, credits.childCareBp);
  const s22 = Math.min(line8, s21);
  const federalEic = whole(ctx.federal.lines['27']);
  const eic = rateOf(federalEic, credits.eitcBp);
  const wantsRelief = resident && (positive(answers.propertyTaxPaid) > 0 || positive(answers.rentPaid) > 0);
  const relief = wantsRelief ? reader.read('property-tax-relief') : null;
  const h = relief ? propertyTaxRelief(ctx, filing, relief) : null;
  if (h && !h.eligible) checks.push(check('info', 'RI_1040H_NOT_ELIGIBLE', 'The property tax relief credit (RI-1040H) needs a full-year Rhode Island domicile, age 65 or over or Social Security disability, and household income of at most the yearly limit; you do not qualify.'));
  if (!resident && (positive(answers.propertyTaxPaid) || positive(answers.rentPaid))) checks.push(check('info', 'RI_1040H_RESIDENTS_ONLY', 'The property tax relief credit (RI-1040H) is only for people domiciled in Rhode Island for the whole year.'));
  const refundable = [
    ...(h && h.amount ? [{ code: 'RI_PROPERTY_TAX_RELIEF', label: 'Property tax relief credit (RI-1040H)', amount: h.amount }] : []),
  ];

  let lines;
  let schedules;
  let totalTax;
  let stateIncome;
  let otherStateCredit = 0;
  const nonrefundable = [];
  if (resident) {
    const s19 = line8;
    const scheduleI = lineTable({ 19: s19, 20: s20, 21: s21, 22: s22 });
    const s23 = line8 - s22;
    const otherRows = [];
    let left = s23;
    for (const other of filing.otherStates) {
      const s24 = Math.max(0, whole(other.income));
      const s25 = line3;
      const s26 = ratio(s24, s25, { places: 4 });
      const s27 = applyRatio(s23, s26, 4);
      const s28 = positive(other.tax);
      const s29 = Math.max(0, Math.min(left, s27, s28));
      left -= s29;
      otherRows.push({ state: other.state, lines: lineTable({ 23: s23, 24: s24, 25: s25, 26: s26, 27: s27, 28: s28, 29: s29 }) });
      otherStateCredit += s29;
    }
    if (otherRows.length) checks.push(check('info', 'RI_OTHER_STATE_RETURN', 'Attach a signed copy of the return filed with the other state; the Rhode Island credit is not allowed without it.'));
    const line9a = s22;
    const line9b = otherStateCredit;
    const line9c = 0;
    const line9d = line9a + line9b + line9c;
    const line10a = Math.max(0, line8 - line9d);
    const line10b = 0;
    const line13a = line10a + line10b;
    const line14a = filing.payments.withheld;
    const line14b = filing.payments.estimated + filing.payments.extension;
    const line14c = h ? h.amount : 0;
    const line14d = eic;
    const line14g = line14a + line14b + line14c + line14d;
    lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, '9a': line9a, '9b': line9b, '9c': line9c, '9d': line9d, '10a': line10a, '10b': line10b, '13a': line13a, '14a': line14a, '14b': line14b, '14c': line14c, '14d': line14d, '14g': line14g, 39: federalEic, 40: credits.eitcBp / 10000, 41: eic });
    schedules = { M: scheduleM, I: scheduleI, ...(otherRows.length ? { II: otherRows } : {}) };
    totalTax = line13a;
    stateIncome = line3;
    if (s22) nonrefundable.push({ code: 'RI_CHILD_CARE', label: 'Rhode Island percentage of the federal child care credit', amount: s22 });
    if (otherStateCredit) nonrefundable.push({ code: 'RI_OTHER_STATE', label: 'Credit for income taxes paid to other states', amount: otherStateCredit });
    if (eic) refundable.push({ code: 'RI_EIC', label: 'Rhode Island earned income credit', amount: eic });
  } else {
    const scheduleI = lineTable({ 22: line8, 23: s20, 24: s21, 25: s22 });
    const line9 = s22;
    const line10 = Math.max(0, line8 - line9);
    const pensionTotal = income.iraTaxable + income.pensionTaxable;
    const pensionRi = whole(sourced.iraTaxable) + whole(sourced.pensionTaxable);
    const riMods = partYear ? -(whole(sourced.usObligationInterest) + Math.round(m1g * share) + (income.socialSecurityTaxable ? Math.round(m1s * whole(sourced.socialSecurityTaxable) / income.socialSecurityTaxable) : 0) + (pensionTotal ? Math.round((m1t + m1v) * pensionRi / pensionTotal) : 0)) + Math.round(m2a * share) : 0;
    const federal = { 1: income.wages, 2: income.taxableInterest + income.ordinaryDividends, 3: income.businessIncome, 4: income.capitalGain, 5: income.iraTaxable + income.pensionTaxable, 6: 0, 7: income.socialSecurityTaxable + income.stateRefundTaxable + income.unemployment + income.otherIncome };
    const ri = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest) + whole(sourced.ordinaryDividends), 3: whole(sourced.businessIncome), 4: whole(sourced.capitalGain), 5: whole(sourced.iraTaxable) + whole(sourced.pensionTaxable), 6: 0, 7: whole(sourced.socialSecurityTaxable) + whole(sourced.stateRefundTaxable) + whole(sourced.unemployment) + whole(sourced.otherIncome) };
    for (const column of [federal, ri]) column[8] = column[1] + column[2] + column[3] + column[4] + column[5] + column[6] + column[7];
    federal[9] = income.adjustments;
    ri[9] = whole(sourced.adjustments);
    federal[10] = income.agi;
    ri[10] = ri[8] - ri[9];
    federal[11] = m3;
    ri[11] = riMods;
    federal[12] = federal[10] + federal[11];
    ri[12] = ri[10] + ri[11];
    const allocation = ri[12] <= 0 ? 0 : ratio(ri[12], federal[12], { places: 4 });
    const line11 = applyRatio(line10, allocation, 4);
    let allocationSchedule;
    if (partYear) {
      const D = { 12: 0 };
      allocationSchedule = { A: lineTable(federal), B: lineTable(ri), D: lineTable(D), lines: lineTable({ 13: ri[12], 14: allocation, 15: line10, 16: line11, 17: line11, 18: 0, 27: 0, 28: line11 }) };
      checks.push(check('info', 'RI_PART_YEAR_OTHER_STATE', 'A part-year resident may take a credit on Schedule III Part 2 for tax paid to another state on income earned there while a Rhode Island resident; MyCA did not include one.', 'Ask your CPA if another state taxed income you earned while living in Rhode Island.'));
      if (whole(sourced.wages) !== income.wages || ri[8] !== federal[8]) notes.push('Schedule III column B holds your income while a Rhode Island resident together with Rhode Island-source income after you moved (column D); MyCA does not split the two.');
    } else {
      allocationSchedule = { A: lineTable(ri), B: lineTable(federal), lines: lineTable({ 13: allocation, 14: line10, 15: line11 }) };
    }
    const line12 = 0;
    const line13a = Math.max(0, line11 - line12);
    const line13b = 0;
    const eicAllocated = applyRatio(eic, allocation, 4);
    const line17a = filing.payments.withheld;
    const line17b = filing.payments.estimated + filing.payments.extension;
    const line17d = eicAllocated;
    const line17f = line17a + line17b + line17d;
    lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, '13a': line13a, '13b': line13b, '17a': line17a, '17b': line17b, '17d': line17d, '17f': line17f, 35: federalEic, 36: credits.eitcBp / 10000, 37: eic, 38: allocation, 39: eicAllocated });
    schedules = { M: scheduleM, I: scheduleI, [partYear ? 'III' : 'II']: allocationSchedule };
    totalTax = line13a + line13b;
    stateIncome = ri[12];
    if (s22) nonrefundable.push({ code: 'RI_CHILD_CARE', label: 'Rhode Island percentage of the federal child care credit', amount: s22 });
    if (line10 - line11 > 0) nonrefundable.push({ code: 'RI_ALLOCATION', label: 'Tax on income not allocated to Rhode Island', amount: line10 - line11 });
    if (eicAllocated) refundable.push({ code: 'RI_EIC', label: 'Rhode Island earned income credit', amount: eicAllocated });
  }
  if (ss.sheet) schedules['social-security-worksheet'] = ss.sheet;
  if (pension.rows) schedules['pension-modification'] = pension.rows;
  if (h) schedules['1040H'] = { ...h.lines, household: h.household };
  if (phase.factor < 1) schedules.phaseout = lineTable({ modifiedAgi: line3, steps: phase.steps ?? 0, factor: phase.factor, standardBefore: standardBase, exemptionBefore: exemptionBase });
  if (positive(answers.collegeSavingsContributions) > beneficiaryCap) checks.push(check('info', 'RI_529_LIMIT', 'Contributions to a Rhode Island 529 plan are subtracted only up to $500, or $1,000 on a joint return.'));
  if (income.socialSecurityTaxable && !ss.amount && income.agi >= byStatus(mods.retirementAgiLimit, ctx.filingStatus)) checks.push(check('info', 'RI_SS_AGI_LIMIT', 'Taxable Social Security is subtracted only by filers who reached full retirement age with federal AGI under the Rhode Island limit; your AGI is over it.'));
  notes.push('Rhode Island has no itemized deductions; the standard deduction applies to everyone.');
  return {
    form: resident ? 'RI-1040' : 'RI-1040NR',
    lines,
    schedules,
    stateIncome,
    taxableIncome: line7,
    taxBeforeCredits: line8,
    nonrefundableCredits: nonrefundable,
    otherStateCredit,
    otherTaxes: [],
    totalTax,
    refundableCredits: refundable,
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'RI',
  name: 'Rhode Island',
  built: true,
  forms: Object.freeze({ resident: 'RI-1040', partYear: 'RI-1040NR', nonresident: 'RI-1040NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'rhodeIslandMunicipalInterest', kind: 'amount', text: 'Tax-exempt interest from Rhode Island state or local bonds', help: 'Interest from other states\' bonds is added on Schedule M line 2a; Rhode Island bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'collegeSavingsContributions', kind: 'amount', text: 'Contributions to a Rhode Island CollegeBound Saver (529) account in the year', help: 'Subtracted on Schedule M line 1g, up to $500 ($1,000 on a joint return).' }),
    Object.freeze({ id: 'militaryPension', kind: 'amount', text: 'Military service pension included in your federal pension income (Form 1040 line 5b)', help: 'Subtracted in full on Schedule M line 1v.' }),
    Object.freeze({ id: 'propertyTaxPaid', kind: 'amount', text: 'Property tax you paid on your Rhode Island home for the year (for the RI-1040H credit)', help: 'Only for filers 65 or over or receiving Social Security disability, with household income under the limit.' }),
    Object.freeze({ id: 'rentPaid', kind: 'amount', text: 'Rent you paid for your Rhode Island home in the year (for the RI-1040H credit)', help: '20% of the rent counts as property tax.' }),
    Object.freeze({ id: 'socialSecurityDisability', kind: 'yesno', text: 'Were you or your spouse receiving Social Security disability benefits during the year?', help: 'Disabled filers under 65 can claim the RI-1040H property tax relief credit.' }),
    Object.freeze({ id: 'publicAssistance', kind: 'amount', text: 'Cash public assistance received by everyone in the household (RI-1040H line 29)', help: 'Counts as household income for the property tax relief credit.' }),
    Object.freeze({ id: 'otherNontaxableIncome', kind: 'amount', text: 'Other nontaxable household income such as child support, workers\' compensation and gifts (RI-1040H line 30)', help: 'Counts as household income for the property tax relief credit.' }),
  ]),
  notCovered: Object.freeze([
    'Schedule M items other than U.S. obligation interest, 529 contributions, Social Security, the pension and military pension modifications and out-of-state bond interest (for example bonus depreciation, railroad retirement and tuition savings recapture)',
    'Other Rhode Island credits on RI-1040 line 9c (Schedule CR), recapture (line 10b), use tax (line 12a) and the individual mandate penalty (line 12b)',
    'Part-year residents\' credit on Schedule III Part 2 for tax paid to another state while a Rhode Island resident',
    'RI-1040NR Schedule III column D split and the days-worked allocation (Schedule IV) for nonresident wages',
    'Lead paint credit, real estate withholding and estimated tax penalty (RI-2210)',
  ]),
  compute,
});
