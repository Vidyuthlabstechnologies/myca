import { whole, positive, rateOf, ratio, check, byStatus, lineTable, yesNo, sum } from '../state-kit.mjs';

const FOUR = { places: 4 };
const fourPlaces = (part, total) => ratio(part, total, FOUR);

export function scheduleTax(taxableIncome, rows) {
  const amount = positive(taxableIncome);
  if (!amount) return 0;
  const row = [...rows].reverse().find((item) => amount * 100 > item.overCents);
  if (!row) return 0;
  const cents = row.baseCents + Math.round(((amount * 100 - row.overCents) * row.rateBp) / 10000);
  return Math.round(cents / 100);
}

export function tableIncome(taxableIncome, table) {
  const amount = positive(taxableIncome);
  if (!amount) return 0;
  if (amount <= table.firstRowTop) return table.firstRowTop / 2;
  const low = table.firstRowTop + 1 + Math.floor((amount - table.firstRowTop - 1) / table.rowWidth) * table.rowWidth;
  const high = Math.min(low + table.rowWidth - 1, table.maxTaxableIncome);
  return (low - 1 + high) / 2;
}

export function californiaTax(taxableIncome, filingStatus, rates, table) {
  const rows = rates.schedules[filingStatus] || rates.schedules.single;
  const amount = positive(taxableIncome);
  if (amount <= table.maxTaxableIncome) return { tax: scheduleTax(tableIncome(amount, table), rows), method: 'table' };
  return { tax: scheduleTax(amount, rows), method: 'schedule' };
}

function exemptionBoxes(ctx) {
  const dependentFilers = ctx.filers.filter((item) => item.canBeClaimedAsDependent).length;
  const joint = ctx.filingStatus === 'mfj' || ctx.filingStatus === 'qss';
  const line6 = dependentFilers > 0;
  let personal = joint ? 2 : 1;
  if (line6) personal = ctx.filingStatus === 'mfj' ? Math.max(0, ctx.filers.length - dependentFilers) : 0;
  const counted = ctx.filers.filter((item) => !item.canBeClaimedAsDependent);
  const blind = counted.filter((item) => item.blind).length;
  const senior = counted.filter((item) => item.age !== null && item.age >= 65).length;
  return { line6, personal, blind, senior, dependents: ctx.dependents.length };
}

function exemptionCredits(ctx, boxes, credits, limitation) {
  const line7 = boxes.personal * credits.personal;
  const line8 = boxes.blind * credits.blind;
  const line9 = boxes.senior * credits.senior;
  const line10 = boxes.dependents * credits.dependent;
  const line11 = line7 + line8 + line9 + line10;
  const threshold = byStatus(limitation.threshold, ctx.filingStatus);
  const agi = ctx.income.agi;
  if (agi <= threshold) return { line7, line8, line9, line10, line11, allowed: line11, worksheet: null };
  const step = ctx.filingStatus === 'mfs' ? limitation.exemptionStep.mfs : limitation.exemptionStep.other;
  const c = agi - threshold;
  const d = Math.ceil(c / step);
  const e = d * limitation.exemptionReductionPerStep;
  const f = boxes.personal + boxes.blind + boxes.senior;
  const g = e * f;
  const h = line7 + line8 + line9;
  const i = Math.max(0, h - g);
  const j = boxes.dependents;
  const k = e * j;
  const l = line10;
  const m = Math.max(0, l - k);
  const n = i + m;
  return { line7, line8, line9, line10, line11, allowed: n, worksheet: lineTable({ a: agi, b: threshold, c, d, e, f, g, h, i, j, k, l, m, n }) };
}

function mortgageOverLimit(ctx, itemized) {
  const limit = ctx.filingStatus === 'mfs' ? itemized.mortgageAcquisitionLimit.mfs : itemized.mortgageAcquisitionLimit.other;
  const principals = ctx.forms.filter((form) => form.kind === '1098').map((form) => positive(form.fields?.outstandingPrincipal));
  return principals.some((value) => value > limit) || sum(principals) > limit;
}

function scheduleCaPartI(ctx, answers, militaryRule) {
  const income = ctx.income;
  const items = income.adjustmentItems || {};
  const militaryAllowed = income.agi <= byStatus(militaryRule.agiLimit, ctx.filingStatus);
  const military = militaryAllowed ? Math.min(positive(answers.militaryRetirementPay), militaryRule.capPerKind) + Math.min(positive(answers.survivorBenefitAnnuity), militaryRule.capPerKind) : 0;
  const column = {
    'A1h.C': positive(answers.employerHsaContributions),
    'A2.B': income.usObligationInterest,
    'A2.C': positive(answers.nonCaliforniaExemptInterest) + positive(answers.hsaEarnings),
    'A5.B': positive(answers.railroadRetirementTaxable) + military,
    'A6.B': income.socialSecurityTaxable,
    'B1.B': income.stateRefundTaxable,
    'B7.B': income.unemployment,
    'C11.B': whole(items.educator),
    'C13.B': whole(items.hsa),
  };
  const line10B = column['A2.B'] + column['A5.B'] + column['A6.B'] + column['B1.B'] + column['B7.B'];
  const line10C = column['A1h.C'] + column['A2.C'];
  const line26B = column['C11.B'] + column['C13.B'];
  const line27B = line10B - line26B;
  const line27C = line10C;
  return { lines: lineTable({ ...column, '10.B': line10B, '10.C': line10C, '26.B': line26B, '27.B': line27B, '27.C': line27C }), line27B, line27C, militaryAllowed, military };
}

function scheduleCaPartII(ctx, answers, itemizedRule, limitation, standard) {
  const parts = ctx.itemized;
  const agi = ctx.income.agi;
  const line4 = Math.max(0, parts.medicalPaid - rateOf(Math.max(0, agi), itemizedRule.medicalFloorBasisPoints));
  const line5b = parts.realEstateTaxes;
  const line5c = parts.personalPropertyTaxes;
  const line5e = line5b + line5c;
  const line7 = line5e;
  const overLimit = mortgageOverLimit(ctx, itemizedRule);
  const line8 = parts.mortgageInterest;
  const line10 = line8;
  const charityLimit = rateOf(Math.max(0, agi), itemizedRule.charityAgiLimitBasisPoints);
  const line11 = Math.min(parts.charityCash, charityLimit);
  const line12 = Math.min(parts.charityNonCash, rateOf(Math.max(0, agi), itemizedRule.nonCashAgiLimitBasisPoints), Math.max(0, charityLimit - line11));
  const line14 = line11 + line12;
  const line16 = parts.otherItemized;
  const line18 = line4 + line7 + line10 + line14 + line16;
  const line22 = positive(answers.miscItemizedDeductions);
  const line24 = rateOf(Math.max(0, agi), itemizedRule.miscFloorBasisPoints);
  const line25 = Math.max(0, line22 - line24);
  const line26 = line18 + line25;
  const line28 = line26;
  const threshold = byStatus(limitation.threshold, ctx.filingStatus);
  let line29 = line28;
  let worksheet = null;
  if (agi > threshold) {
    const w2 = line4;
    const w3 = Math.max(0, line28 - w2);
    const w4 = rateOf(w3, limitation.itemizedMaxBasisPoints);
    const w7 = agi - threshold;
    const w8 = rateOf(w7, limitation.itemizedRateBasisPoints);
    const w9 = w3 > 0 ? Math.min(w4, w8) : 0;
    line29 = line28 - w9;
    worksheet = lineTable({ 1: line28, 2: w2, 3: w3, 4: w4, 5: agi, 6: threshold, 7: w7, 8: w8, 9: w9, 10: line29 });
  }
  const spouseItemizes = ctx.filingStatus === 'mfs' && yesNo(ctx.answers.spouseItemizes);
  const line30 = spouseItemizes ? line29 : Math.max(line29, standard);
  return { lines: lineTable({ 4: line4, '5a': 0, '5b': line5b, '5c': line5c, '5e': line5e, 7: line7, 8: line8, 10: line10, 11: line11, 12: line12, 14: line14, 16: line16, 18: line18, 22: line22, 24: line24, 25: line25, 26: line26, 28: line28, 29: line29, 30: line30 }), line29, line30, itemizes: (line30 === line29 && line29 > standard) || spouseItemizes, worksheet, overLimit, mortgage: line8 };
}

function standardDeduction(ctx, standardRule, dependentRule) {
  const base = byStatus(standardRule, ctx.filingStatus);
  if (!ctx.filers.some((item) => item.canBeClaimedAsDependent)) return base;
  const items = ctx.income.adjustmentItems || {};
  const earned = Math.max(0, ctx.income.wages + ctx.income.businessIncome - whole(items.seTaxDeduction));
  return Math.min(base, Math.max(earned + dependentRule.earnedIncomeAddition, dependentRule.minimum));
}

function eitcLookup(amount, table, children) {
  const value = whole(amount);
  if (value <= 0 || value > table.maxIncome) return 0;
  const column = table.credits[String(Math.min(3, children))];
  return column[Math.floor((value - 1) / table.rowWidth)] || 0;
}

function phaseDown(fullDollars, earned, rule, claimers = 1) {
  if (earned <= rule.phaseOutStart) return fullDollars;
  const reductionCents = Math.floor(((earned - rule.phaseOutStart) * rule.reductionCentsPer100 * claimers) / 100);
  const leftCents = fullDollars * 100 - reductionCents;
  if (leftCents <= 0) return 0;
  if (leftCents < 100) return 1;
  return Math.round(leftCents / 100);
}

function californiaEarnedIncome(ctx) {
  const items = ctx.income.adjustmentItems || {};
  const caWages = sum(ctx.w2.filter((row) => row.state === 'CA'), (row) => (row.stateWages === null ? row.wages : row.stateWages));
  const business = ctx.income.businessIncome ? ctx.income.businessIncome - whole(items.seTaxDeduction) : 0;
  return { line13: caWages, line16: caWages, line18: business, line19: caWages + business };
}

function refundableCredits(ctx, filing, answers, eitcRule, youngRule, exemptionPercentage) {
  const checks = [];
  const out = { eitc: 0, yctc: 0, fytc: 0, schedule: null };
  const resident = filing.residency === 'full-year';
  if (filing.residency === 'nonresident') return { ...out, checks };
  if (!resident && filing.residentDays < eitcRule.minimumCaliforniaDays) return { ...out, checks };
  if (ctx.filingStatus === 'mfs') {
    checks.push(check('info', 'CA_EITC_SEPARATE', 'Married filing separately: the California EITC, YCTC and FYTC are allowed only under the separated-spouse rule, which MyCA does not work out.'));
    return { ...out, checks };
  }
  const agi = ctx.income.agi;
  const income = ctx.income;
  const investment = income.taxExemptInterest + income.taxableInterest + income.ordinaryDividends + Math.max(0, income.capitalGain);
  const earned = californiaEarnedIncome(ctx);
  const qualifying = ctx.dependents.filter((item) => item.qualifyingChild);
  let children = qualifying.length;
  if (answers.californiaQualifyingChildren !== undefined) children = Math.min(children, whole(answers.californiaQualifyingChildren));
  else if (children && agi < eitcRule.agiBelow) {
    if (resident) checks.push(check('warning', 'CA_EITC_CHILDREN_ASSUMED', 'MyCA counted every federal qualifying child for the California EITC, which needs the child to have lived with you in California more than half the year.', 'Answer how many qualifying children lived with you in California.'));
    else checks.push(check('error', 'CA_EITC_CHILDREN_NEEDED', 'For a part-year return the California EITC counts only qualifying children who lived with you in California more than half the year.', 'Answer how many qualifying children lived with you in California.'));
  }
  const adultOk = children > 0 || ctx.filers.some((item) => item.age !== null && item.age >= eitcRule.minimumAgeWithoutChild);
  const eligible = agi < eitcRule.agiBelow && investment <= eitcRule.investmentIncomeLimit && adultOk;
  let line20 = 0;
  let worksheet = null;
  if (eligible && earned.line19 > 0) {
    const line2 = eitcLookup(earned.line19, eitcRule.table, children);
    let line6 = line2;
    let line5 = null;
    if (line2 > 0 && earned.line19 !== agi && agi >= eitcRule.agiLookupFrom[String(Math.min(3, children))]) {
      line5 = eitcLookup(agi, eitcRule.table, children);
      line6 = Math.min(line2, line5);
    }
    line20 = line6;
    worksheet = lineTable({ 1: earned.line19, 2: line2, 3: agi, ...(line5 === null ? {} : { 5: line5 }), 6: line6 });
  }
  const youngChild = children > 0 && qualifying.some((item) => item.age !== null && item.age < youngRule.youngChildUnderAge);
  const zeroIncomeCase = eligible && earned.line19 <= 0 && income.wages <= youngRule.zeroIncomeLimit && -Math.min(0, income.totalIncome) <= youngRule.zeroIncomeLimit && agi < eitcRule.agiBelow;
  const line28 = youngChild && (line20 > 0 || zeroIncomeCase) ? phaseDown(youngRule.yctcAmount, Math.max(0, earned.line19), youngRule) : 0;
  const foster = String(answers.fosterYouth || 'none');
  const claimers = ctx.filers.filter((item) => {
    const named = foster === 'both' || (foster === 'taxpayer' && item.role === 'taxpayer') || (foster === 'spouse' && item.role === 'spouse');
    return named && item.age !== null && item.age >= youngRule.fosterYouthMinimumAge && item.age < youngRule.fosterYouthBelowAge;
  }).length;
  const line39 = claimers && line20 > 0 ? phaseDown(youngRule.fytcAmount * claimers, earned.line19, youngRule, claimers) : 0;
  if (foster !== 'none' && !claimers) checks.push(check('info', 'CA_FYTC_NOT_ALLOWED', 'The Foster Youth Tax Credit needs the claimer to be 18 to 25 at year end and to be allowed the California EITC.'));
  const share = resident ? 1 : exemptionPercentage;
  out.eitc = resident ? line20 : Math.round(line20 * share);
  out.yctc = resident ? line28 : Math.round(line28 * share);
  out.fytc = resident ? line39 : Math.round(line39 * share);
  if (line20 || line28 || line39) out.schedule = lineTable({ 2: agi, 4: investment, 13: earned.line13, 16: earned.line16, 18: earned.line18, 19: earned.line19, 20: line20, ...(resident ? {} : { 21: share, 22: out.eitc }), ...(line28 ? { 23: earned.line19, 28: line28, ...(resident ? {} : { 29: share, 30: out.yctc }) } : {}), ...(line39 ? { 34: earned.line19, 39: line39, ...(resident ? {} : { 40: share, 41: out.fytc }) } : {}), ...(worksheet ? { worksheet } : {}) });
  if (ctx.forms.some((form) => form.kind === 'K-1') || ctx.income.businessIncome < 0) checks.push(check('info', 'CA_EITC_BUSINESS', 'California earned income uses Schedule C net profit less the deductible part of self-employment tax; farm income and partnership self-employment earnings are not included.'));
  return { ...out, checks };
}

function otherStateCredit(ctx, filing, rule, line2, line17, checks) {
  const rows = [];
  let total = 0;
  for (const other of filing.otherStates) {
    if (rule.reverseCreditStates.includes(other.state)) {
      checks.push(check('info', 'CA_REVERSE_CREDIT_STATE', `${other.state} gives the credit for tax paid to California on its own nonresident return, so no Schedule S credit is taken on Form 540 for it.`));
      continue;
    }
    if (!rule.residentStates.includes(other.state)) continue;
    const line3 = Math.min(positive(other.income), positive(line17));
    const line5 = fourPlaces(line3, line17);
    const line6 = Math.round(positive(line2 - total) * line5);
    const line7 = positive(other.tax);
    const line8 = positive(other.income);
    const line10 = fourPlaces(line8, line8);
    const line11 = Math.round(line7 * line10);
    const line12 = Math.min(line6, line11);
    total += line12;
    rows.push({ state: other.state, lines: lineTable({ 2: line2, 3: line3, 4: line17, 5: line5, 6: line6, 7: line7, 8: line8, 9: line8, 10: line10, 11: line11, 12: line12 }) });
  }
  if (rows.length) checks.push(check('info', 'CA_SCHEDULE_S', 'Schedule S: attach a copy of the other state\'s return. The double-taxed income is the income that state taxed you on; it must have its source there under California rules.'));
  return { total: Math.min(total, positive(line2)), rows };
}

function compute(ctx, filing, reader) {
  const rates = reader.read('tax-rates');
  const table = reader.read('tax-table');
  const standardRule = reader.read('standard-deduction');
  const dependentRule = reader.read('dependent-standard-deduction');
  const credits = reader.read('exemption-credits');
  const limitation = reader.read('agi-limitation');
  const itemizedRule = reader.read('itemized');
  const renters = reader.read('renters-credit');
  const bhst = reader.read('behavioral-health-tax');
  const creditLimit = reader.read('credit-limitation');
  const militaryRule = reader.read('military-retirement');
  const ostcRule = reader.read('other-state-credit');
  const eitcRule = reader.read('eitc');
  const youngRule = reader.read('young-child-credits');
  if (!rates || !table || !standardRule || !dependentRule || !credits || !limitation || !itemizedRule || !renters || !bhst || !creditLimit || !militaryRule || !ostcRule || !eitcRule || !youngRule) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no California figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const checks = [];
  const notes = [];
  const boxes = exemptionBoxes(ctx);
  const exemptions = exemptionCredits(ctx, boxes, credits, limitation);
  const line12 = sum(ctx.w2.filter((row) => row.state), (row) => (row.stateWages === null ? row.wages : row.stateWages));
  const line13 = ctx.income.agi;
  const partI = scheduleCaPartI(ctx, answers, militaryRule);
  const line14 = Math.max(0, partI.line27B) + Math.max(0, -partI.line27C);
  const line15 = line13 - line14;
  const line16 = Math.max(0, partI.line27C) + Math.max(0, -partI.line27B);
  const line17 = line15 + line16;
  const standard = standardDeduction(ctx, standardRule, dependentRule);
  const partII = scheduleCaPartII(ctx, answers, itemizedRule, limitation, standard);
  const line18 = partII.line30;
  const line19 = Math.max(0, line17 - line18);
  const taxed = californiaTax(line19, status, rates, table);
  const line31 = taxed.tax;
  if (partII.itemizes && partII.mortgage > 0 && partII.overLimit) checks.push(check('error', 'CA_MORTGAGE_DEBT_LIMIT', 'Mortgage principal is above California\'s $1,000,000 acquisition debt limit ($500,000 if married filing separately), so only part of the interest is deductible; MyCA does not prorate it.', 'Have your CPA apply the limit on Schedule CA (540) line 8, or take the standard deduction.'));
  if (ctx.itemized.stateIncomeTaxes > 0) notes.push('State income tax and SDI withheld are not deductible on the California return (Schedule CA (540) Part II line 5a); SDI is not California income tax withheld and is not a payment on line 71.');
  if (ctx.income.taxExemptInterest > 0 && answers.nonCaliforniaExemptInterest === undefined) checks.push(check('error', 'CA_OUT_OF_STATE_MUNI', 'You have tax-exempt interest. California taxes interest from other states\' bonds and from funds with less than half in California or U.S. bonds.', 'Answer how much of your tax-exempt interest is not from California obligations (0 if all of it is).'));
  if (whole(ctx.income.adjustmentItems?.hsa) > 0 && answers.hsaEarnings === undefined) checks.push(check('warning', 'CA_HSA_EARNINGS', 'California does not recognize HSAs: interest and gains earned inside the account are taxable each year.', 'Answer the HSA earnings question (0 if none).'));
  if (partI.military === 0 && (positive(answers.militaryRetirementPay) || positive(answers.survivorBenefitAnnuity)) && !partI.militaryAllowed) checks.push(check('info', 'CA_MILITARY_RETIREMENT_AGI', 'Federal AGI is above the limit for the California military retirement exclusion.'));
  const unemployment = ctx.income.unemployment;
  if (unemployment) notes.push('Unemployment compensation and Paid Family Leave on Form 1099-G are not taxed by California (Schedule CA (540) Part I, Section B, line 7).');

  let line32;
  let line35;
  let line36 = null;
  let line37;
  let line38 = 1;
  let line39;
  let regularTax;
  let scheduleNR = null;
  if (resident) {
    line32 = line17;
    line35 = line19;
    line39 = exemptions.allowed;
    regularTax = Math.max(0, line31 - line39);
  } else {
    const sourced = filing.sourced;
    const federalAdjustments = ctx.income.adjustments;
    const caAdjustments = federalAdjustments - partI.lines['26.B'];
    const adjustmentShare = federalAdjustments > 0 ? whole(sourced.adjustments) / federalAdjustments : 0;
    const partYear = filing.residency === 'part-year';
    const scale = (value) => (partYear ? Math.round(positive(value) * filing.share) : 0);
    const colEIncome = filing.sourcedAgi + whole(sourced.adjustments) - whole(sourced.socialSecurityTaxable) - whole(sourced.unemployment) - whole(sourced.stateRefundTaxable) - whole(sourced.usObligationInterest) + scale(partI.lines['A2.C']) - scale(answers.railroadRetirementTaxable) - scale(partI.military);
    const colEAdjustments = Math.round(caAdjustments * adjustmentShare);
    const colE = colEIncome - colEAdjustments;
    const line3 = Math.max(0, fourPlaces(colE, line17));
    const line4 = Math.round(line18 * line3);
    line32 = colE;
    line35 = Math.max(0, colE - line4);
    line36 = line19 > 0 ? fourPlaces(line31, line19) : 0;
    line37 = Math.round(line35 * line36);
    line38 = line19 > 0 ? fourPlaces(line35, line19) : 0;
    line39 = Math.round(exemptions.allowed * line38);
    regularTax = Math.max(0, line37 - line39);
    scheduleNR = lineTable({ 'IV-1': colE, 'IV-2': line18, 'IV-3': line3, 'IV-4': line4, 'IV-5': line35, '27.D': line17, '27.E': colE });
    if (partI.lines['A1h.C']) notes.push('Employer HSA contributions are added to total income; they are not added again to California-source wages, which already include them in W-2 box 16.');
  }
  const line41 = 0;
  const line42 = regularTax + line41;

  const renterAgiLimit = byStatus(renters.agiLimit, status);
  let renterCredit = 0;
  if (yesNo(answers.renterQualifies) && line17 <= renterAgiLimit) {
    if (resident) renterCredit = byStatus(renters.credit, status);
    else if (filing.residency === 'part-year') {
      const months = Math.min(12, whole(answers.renterMonths));
      if (months >= 12) renterCredit = byStatus(renters.credit, status);
      else if (months >= renters.minimumMonths) renterCredit = months * byStatus(renters.perMonth, status);
      if (answers.renterMonths === undefined) checks.push(check('error', 'CA_RENTER_MONTHS', 'A part-year resident\'s renter\'s credit depends on the full months you were a California resident and rented your home there.', 'Answer the renter months question.'));
    }
  } else if (yesNo(answers.renterQualifies)) checks.push(check('info', 'CA_RENTER_AGI', `California AGI is above $${renterAgiLimit.toLocaleString('en-US')}, so no renter's credit is allowed.`));
  if (answers.renterQualifies === undefined && filing.residency !== 'nonresident' && line17 <= renterAgiLimit) checks.push(check('warning', 'CA_RENTER_QUESTION', 'You may get the nonrefundable renter\'s credit if you rented your California home for at least half the year.', 'Answer the renter\'s credit question.'));
  if (ctx.filingStatus === 'mfs' && renterCredit) notes.push('Married filing separately: if both spouses rented the same home, one may claim the full $120 instead of $60 each; MyCA claims $60.');
  const taxBase = resident ? line31 - Math.min(line31, line39) : line42;
  const renterUsed = Math.min(renterCredit, taxBase);
  const ostc = resident ? otherStateCredit(ctx, filing, ostcRule, taxBase - renterUsed, line17, checks) : { total: 0, rows: [] };
  const totalCredits = ostc.total + renterCredit;
  const afterCredits = Math.max(0, taxBase - totalCredits);
  if ((ostc.total || renterCredit) && line17 > byStatus(creditLimit.scheduleP, status)) checks.push(check('warning', 'CA_SCHEDULE_P', 'Above this California AGI the credits other than exemption credits may be limited by tentative minimum tax on Schedule P, which MyCA does not prepare.', 'Have your CPA check Schedule P.'));
  const bhstTax = Math.round((Math.max(0, line35 * 100 - bhst.thresholdCents) * bhst.rateBasisPoints) / 1000000);
  const amt = 0;
  const otherTax = 0;
  const totalTaxLine = afterCredits + amt + bhstTax + otherTax;
  const eitcShare = resident ? 1 : line38;
  const refundable = refundableCredits(ctx, filing, answers, eitcRule, youngRule, eitcShare);
  checks.push(...refundable.checks);
  const useTax = resident ? positive(answers.useTax) : 0;
  if (resident && answers.useTax === undefined) checks.push(check('warning', 'CA_USE_TAX', 'California asks for use tax on purchases from out-of-state sellers that did not charge California tax; the line cannot be left blank.', 'Answer the use tax question (0 if none).'));
  let isr = 0;
  if (answers.fullYearCoverage === undefined) checks.push(check('error', 'CA_HEALTH_COVERAGE', 'California requires everyone on the return to have had qualifying health coverage all year, or to work out the Individual Shared Responsibility penalty.', 'Answer whether you and your household had full-year health coverage.'));
  else if (!yesNo(answers.fullYearCoverage)) checks.push(check('error', 'CA_ISR_PENALTY_NOT_COMPUTED', 'Someone on the return lacked health coverage for part of the year. The penalty or an exemption is worked out on form FTB 3853, which MyCA does not compute, so the return is not complete.', 'Have your CPA complete form FTB 3853 and enter the penalty.'));
  if (ctx.income.businessIncome && filing.residency === 'nonresident') checks.push(check('info', 'CA_NR_BUSINESS', 'Business income has a California source where the benefit of the services is received.'));
  if (ctx.w2.some((row) => row.state === 'CA')) notes.push('Only W-2 box 17 California income tax is a payment. California SDI (box 14) is a payroll tax, not income tax withheld.');
  if (positive(ctx.answers.childCareExpenses) > 0 && line13 <= 100000) checks.push(check('warning', 'CA_FTB_3506', 'You may qualify for the California child and dependent care expenses credit (form FTB 3506), which MyCA does not prepare.', 'Have your CPA prepare form FTB 3506.'));
  if (exemptions.worksheet) checks.push(check('info', 'CA_EXEMPTION_LIMIT', 'Federal AGI is above the California threshold, so the exemption credits are reduced (AGI Limitation Worksheet).'));
  if (partII.worksheet && partII.itemizes) checks.push(check('info', 'CA_ITEMIZED_LIMIT', 'Federal AGI is above the California threshold, so itemized deductions are reduced (Schedule CA (540) line 29 worksheet).'));
  if (taxed.method === 'table') notes.push('Tax from the California Tax Table (taxable income of $100,000 or less).');

  const withheld = filing.payments.withheld;
  const estimated = filing.payments.estimated + filing.payments.extension;
  const paymentsTotal = withheld + estimated + refundable.eitc + refundable.yctc + refundable.fytc;
  const balance = paymentsTotal - useTax;
  const afterUse = Math.max(0, balance);
  const afterIsr = Math.max(0, afterUse - isr);
  const overpaid = Math.max(0, afterIsr - totalTaxLine);
  const due = Math.max(0, totalTaxLine - afterIsr);
  const common = { 6: boxes.line6, '7.count': boxes.personal, 7: exemptions.line7, '8.count': boxes.blind, 8: exemptions.line8, '9.count': boxes.senior, 9: exemptions.line9, '10.count': boxes.dependents, 10: exemptions.line10, 11: exemptions.line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 31: line31 };
  let lines;
  if (resident) {
    lines = lineTable({ ...common, 32: line39, 33: Math.max(0, line31 - line39), 34: 0, 35: Math.max(0, line31 - line39), 40: 0, 43: ostc.total, 46: renterCredit, 47: totalCredits, 48: afterCredits, 61: amt, 62: bhstTax, 63: otherTax, 64: totalTaxLine, 71: withheld, 72: estimated, 73: 0, 74: 0, 75: refundable.eitc, 76: refundable.yctc, 77: refundable.fytc, 78: paymentsTotal, 91: useTax, 92: isr, 93: Math.max(0, balance), 94: Math.max(0, -balance), 95: afterIsr, 96: Math.max(0, isr - afterUse), 97: overpaid, 99: overpaid, 100: due, 111: due + Math.max(0, -balance) + Math.max(0, isr - afterUse), 115: overpaid });
  } else {
    lines = lineTable({ ...common, 32: line32, 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, 40: regularTax, 41: line41, 42: line42, 50: 0, 58: ostc.total, 61: renterCredit, 62: totalCredits, 63: afterCredits, 71: amt, 72: bhstTax, 73: otherTax, 74: totalTaxLine, 81: withheld, 82: estimated, 83: 0, 84: 0, 85: refundable.eitc, 86: refundable.yctc, 87: refundable.fytc, 88: paymentsTotal, 91: isr, 92: Math.max(0, paymentsTotal - isr), 93: Math.max(0, isr - paymentsTotal), 101: Math.max(0, paymentsTotal - isr - totalTaxLine), 103: Math.max(0, paymentsTotal - isr - totalTaxLine), 104: Math.max(0, totalTaxLine - Math.max(0, paymentsTotal - isr)) });
    if (positive(answers.useTax)) notes.push('Form 540NR has no use tax line: report and pay California use tax directly to the California Department of Tax and Fee Administration (cdtfa.ca.gov).');
  }
  const schedules = {
    'CA-I': partI.lines,
    'CA-II': partII.lines,
    ...(partII.worksheet ? { 'CA-II-29': partII.worksheet } : {}),
    ...(exemptions.worksheet ? { 'AGI-LIMIT': exemptions.worksheet } : {}),
    ...(scheduleNR ? { 'CA-NR-IV': scheduleNR } : {}),
    ...(ostc.rows.length ? { S: Object.fromEntries(ostc.rows.map((row) => [row.state, row.lines])) } : {}),
    ...(refundable.schedule ? { 'FTB-3514': refundable.schedule } : {}),
  };
  const nonrefundableCredits = [
    ...(renterUsed ? [{ code: 'CA_RENTERS_CREDIT', label: 'Nonrefundable renter\'s credit', amount: renterUsed }] : []),
    ...(ostc.total ? [{ code: 'CA_SCHEDULE_S', label: 'Other state tax credit (Schedule S, code 187)', amount: ostc.total }] : []),
  ];
  return {
    form: resident ? '540' : '540NR',
    lines,
    schedules,
    stateIncome: resident ? line17 : line32,
    taxableIncome: line35,
    taxBeforeCredits: resident ? Math.max(0, line31 - line39) : line42,
    nonrefundableCredits,
    otherStateCredit: ostc.total,
    otherTaxes: [...(bhstTax ? [{ code: 'CA_BHST', label: 'Behavioral Health Services Tax', amount: bhstTax }] : []), ...(useTax ? [{ code: 'CA_USE_TAX', label: 'Use tax', amount: useTax }] : [])],
    totalTax: totalTaxLine + useTax + isr,
    refundableCredits: [...(refundable.eitc ? [{ code: 'CA_EITC', label: 'California earned income tax credit', amount: refundable.eitc }] : []), ...(refundable.yctc ? [{ code: 'CA_YCTC', label: 'Young child tax credit', amount: refundable.yctc }] : []), ...(refundable.fytc ? [{ code: 'CA_FYTC', label: 'Foster youth tax credit', amount: refundable.fytc }] : [])],
    checks,
    notes,
  };
}

const COMMON_LABELS = Object.freeze({
  6: 'Someone can claim you as a dependent',
  '7.count': 'Personal exemptions (number)',
  7: 'Personal exemption credit',
  '8.count': 'Blind exemptions (number)',
  8: 'Blind exemption credit',
  '9.count': 'Senior exemptions (number)',
  9: 'Senior exemption credit',
  '10.count': 'Dependent exemptions (number)',
  10: 'Dependent exemption credit',
  11: 'Exemption amount',
  13: 'Federal adjusted gross income',
  14: 'California adjustments: subtractions (Schedule CA)',
  15: 'Federal AGI less California subtractions',
  16: 'California adjustments: additions (Schedule CA)',
  18: 'California itemized deductions or standard deduction',
  31: 'Tax',
});

const RESIDENT_LABELS = Object.freeze({
  ...COMMON_LABELS,
  12: 'State wages from your federal W-2s',
  17: 'Adjusted gross income',
  19: 'Taxable income',
  32: 'Exemption credits',
  33: 'Tax less exemption credits',
  34: 'Tax from Schedule G-1 or FTB 5870A',
  35: 'Tax before credits',
  40: 'Nonrefundable child and dependent care expenses credit',
  43: 'Other state tax credit (Schedule S)',
  46: 'Nonrefundable renter\'s credit',
  47: 'Total credits',
  48: 'Tax after credits',
  61: 'Alternative minimum tax',
  62: 'Behavioral health services tax',
  63: 'Other taxes and credit recapture',
  64: 'Total tax',
  71: 'California income tax withheld',
  72: 'California estimated tax and other payments',
  73: 'Withholding (Form 592-B and/or Form 593)',
  74: 'Motion picture and television production credit',
  75: 'Earned income tax credit (EITC)',
  76: 'Young child tax credit (YCTC)',
  77: 'Foster youth tax credit (FYTC)',
  78: 'Total payments',
  91: 'Use tax',
  92: 'Individual shared responsibility penalty',
  93: 'Payments balance',
  94: 'Use tax balance',
  95: 'Payments after individual shared responsibility penalty',
  96: 'Individual shared responsibility penalty balance',
  97: 'Overpaid tax',
  99: 'Overpaid tax available this year',
  100: 'Tax due',
  111: 'Amount you owe',
  115: 'Refund or no amount due',
});

const NONRESIDENT_LABELS = Object.freeze({
  ...COMMON_LABELS,
  12: 'Total California wages from your federal W-2s',
  17: 'Adjusted gross income from all sources',
  19: 'Total taxable income',
  32: 'California adjusted gross income',
  35: 'California taxable income (Schedule CA (540NR), Part IV)',
  36: 'California tax rate',
  37: 'California tax before exemption credits',
  38: 'California exemption credit percentage',
  39: 'California prorated exemption credits',
  40: 'California regular tax before credits',
  41: 'Tax from Schedule G-1 or FTB 5870A',
  42: 'Tax before credits',
  50: 'Nonrefundable child and dependent care expenses credit',
  58: 'Other state tax credit (Schedule S)',
  61: 'Nonrefundable renter\'s credit',
  62: 'Total credits',
  63: 'Tax after credits',
  71: 'Alternative minimum tax',
  72: 'Behavioral health services tax',
  73: 'Other taxes and credit recapture',
  74: 'Total tax',
  81: 'California income tax withheld',
  82: 'California estimated tax and other payments',
  83: 'Withholding (Form 592-B and/or Form 593)',
  84: 'Motion picture and television production credit',
  85: 'Earned income tax credit (EITC)',
  86: 'Young child tax credit (YCTC)',
  87: 'Foster youth tax credit (FYTC)',
  88: 'Total payments',
  91: 'Individual shared responsibility penalty',
  92: 'Payments after individual shared responsibility penalty',
  93: 'Individual shared responsibility penalty balance',
  101: 'Overpaid tax',
  103: 'Overpaid tax available this year',
  104: 'Tax due',
});

const labels = (taxYear, residency) => (residency === 'full-year' ? RESIDENT_LABELS : NONRESIDENT_LABELS);

export const STATE = Object.freeze({
  code: 'CA',
  name: 'California',
  built: true,
  forms: Object.freeze({ resident: '540', partYear: '540NR', nonresident: '540NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'fullYearCoverage', kind: 'yesno', text: 'Did you, your spouse and everyone you claim as a dependent have qualifying health coverage for all of the year?', help: 'Medicare Part A or C, Medi-Cal, employer and Covered California plans count. If not, a penalty may apply (form FTB 3853).' }),
    Object.freeze({ id: 'useTax', when: Object.freeze({ residency: ['full-year'] }), kind: 'amount', text: 'California use tax owed on purchases from out-of-state or online sellers that did not charge California tax (Form 540 only)', help: 'Use the Use Tax Worksheet or Estimated Use Tax Lookup Table in the Form 540 instructions. Enter 0 if none.' }),
    Object.freeze({ id: 'renterQualifies', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'yesno', text: 'Did you rent your main home in California for at least half the year, in a building that was not exempt from property tax, without claiming the homeowner\'s exemption, and without living most of the year in the home of someone who can claim you as a dependent?', help: 'Gives the nonrefundable renter\'s credit ($60 single or separate, $120 joint, head of household or surviving spouse) if California AGI is within the limit.' }),
    Object.freeze({ id: 'renterMonths', when: Object.freeze({ residency: ['part-year'], answer: { id: 'renterQualifies', in: [true] } }), kind: 'count', text: 'Part-year residents: full months you were a California resident and rented your California home', help: 'At least 6 months are needed; the credit is $5 a month ($10 joint or head of household).' }),
    Object.freeze({ id: 'nonCaliforniaExemptInterest', when: Object.freeze({ has: ['taxExemptInterest'] }), kind: 'amount', text: 'Federally tax-exempt interest and exempt-interest dividends that are not from California bonds', help: 'Interest on other states\' and their cities\' bonds, and exempt-interest dividends from funds with less than half in California or U.S. bonds. Enter 0 if all of it is California.' }),
    Object.freeze({ id: 'hsaEarnings', kind: 'amount', text: 'Interest, dividends and gains earned inside a health savings account (HSA) this year', help: 'California taxes HSA earnings each year.' }),
    Object.freeze({ id: 'employerHsaContributions', kind: 'amount', text: 'Employer contributions to your HSA (W-2 box 12, code W)', help: 'California adds these back to income.' }),
    Object.freeze({ id: 'railroadRetirementTaxable', when: Object.freeze({ has: ['retirementIncome'] }), kind: 'amount', text: 'Taxable Tier 2 railroad retirement benefits (Form RRB-1099-R) included in your pensions', help: 'California does not tax railroad retirement benefits.' }),
    Object.freeze({ id: 'militaryRetirementPay', when: Object.freeze({ has: ['retirementIncome'] }), kind: 'amount', text: 'Taxable uniformed services retirement pay included in your federal income', help: 'Up to $20,000 is excluded when federal AGI is $125,000 or less ($250,000 joint or surviving spouse).' }),
    Object.freeze({ id: 'survivorBenefitAnnuity', when: Object.freeze({ has: ['retirementIncome'] }), kind: 'amount', text: 'Taxable Department of Defense Survivor Benefit Plan annuity included in your federal income', help: 'Up to $20,000 is excluded within the same AGI limits.' }),
    Object.freeze({ id: 'miscItemizedDeductions', kind: 'amount', text: 'Unreimbursed employee expenses, tax preparation fees and investment expenses', help: 'California still allows these miscellaneous itemized deductions above 2% of federal AGI.' }),
    Object.freeze({ id: 'californiaQualifyingChildren', when: Object.freeze({ residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['dependents'] }), kind: 'count', text: 'How many of your qualifying children lived with you in California for more than half of the year?', help: 'Used for the California earned income tax credit and young child tax credit.' }),
    Object.freeze({ id: 'fosterYouth', when: Object.freeze({ residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'] }), kind: 'choice', options: Object.freeze(['none', 'taxpayer', 'spouse', 'both']), text: 'Was anyone on the return in California foster care at age 13 or older?', help: 'The Foster Youth Tax Credit is for EITC filers aged 18 to 25.' }),
  ]),
  labels,
  notCovered: Object.freeze([
    'Schedule CA adjustments other than U.S. obligation interest, out-of-state tax-exempt interest, Social Security, railroad retirement, military retirement, unemployment and Paid Family Leave, state tax refunds, HSA deduction, HSA earnings and employer HSA contributions, and educator expenses',
    'Federal items California does not follow that MyCA does not adjust: depreciation and bonus depreciation, the qualified small business stock exclusion, excess business loss limits (FTB 3461), net operating losses (FTB 3805V), 529 plan expansions, alimony under agreements from 2019 to 2025, the foreign earned income exclusion, mortgage forgiveness, California lottery winnings and capital asset basis differences (Schedule D (540))',
    'Mortgage interest when the loan is above the $1,000,000 California limit, home equity interest limits, casualty and disaster losses, investment interest (FTB 3526) and charitable carryovers',
    'Alternative minimum tax and the credit limits on Schedule P, other taxes on line 63 (FTB 3805P early distribution tax), and tax on a child\'s investment income (FTB 3800 and FTB 3803)',
    'The individual shared responsibility penalty on form FTB 3853 when anyone lacked full-year coverage',
    'Child and dependent care expenses credit (FTB 3506), joint custody head of household, dependent parent and senior head of household credits, and all other special credits',
    'The other state tax credit for part-year residents and for income from states not prepared in MyCA, and credits for tax paid through pass-through entities',
    'California EITC farm income, partnership self-employment earnings and the separated-spouse rule for married filing separately',
    'Withholding on Forms 592-B and 593 except when entered as other California withholding, and voluntary contributions',
    'Registered domestic partner adjustments and different federal and California filing statuses',
  ]),
  compute,
});
