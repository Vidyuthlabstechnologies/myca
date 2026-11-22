import { whole, positive, sum, rateOf, ratio, check, lineTable, byStatus, yesNo } from '../state-kit.mjs';

const FIVE_PERCENT_SOURCED = ['wages', 'pensionTaxable', 'iraTaxable', 'businessIncome', 'unemployment', 'otherIncome'];
const PASSIVE_SOURCED = ['taxableInterest', 'ordinaryDividends', 'capitalGain'];

const maStatus = (status) => (status === 'qss' ? 'hoh' : status);

export function fivePercentTableTax(income, table, rateBp) {
  const amount = positive(income);
  if (amount > table.upTo) return rateOf(amount, rateBp);
  if (amount < table.minimumIncome) return 0;
  if (amount <= table.band) return table.firstBandTax;
  const lower = Math.ceil(amount / table.band) * table.band - table.band;
  return Math.round(((lower + table.band / 2) * rateBp) / 10000);
}

function exemptions(ctx, answers, rule, status) {
  const a = byStatus(rule.personalExemption, status);
  const dependents = ctx.dependents.length;
  const b = dependents * rule.dependentExemption;
  const aged = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length;
  const c = aged * rule.ageExemption;
  const blind = ctx.filers.filter((item) => item.blind).length;
  const d = blind * rule.blindExemption;
  const e = ctx.federal.summary?.itemized ? whole(ctx.federal.schedules?.A?.['4']) : 0;
  const f = positive(answers.adoptionFees);
  return { a, dependents, b, aged, c, blind, d, e, f, g: a + b + c + d + e + f };
}

function ficaByOwner(ctx, owner) {
  const forms = ctx.forms.filter((form) => form.kind === 'W-2' && (form.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner);
  const withheld = forms.reduce((total, form) => total + Number(form.fields?.socialSecurityTax || 0) + Number(form.fields?.medicareTax || 0), 0);
  const se = sum((ctx.federal.schedules?.SE || []).filter((item) => item.owner === owner), (item) => item.lines?.['12']);
  return { withheld: Math.round(withheld), se };
}

function maWageShare(ctx, owner, filing) {
  const rows = ctx.w2.filter((row) => row.owner === owner);
  const all = sum(rows, (row) => row.wages);
  const ma = rows.filter((row) => row.state === 'MA');
  if (ma.length) return all > 0 ? Math.min(1, sum(ma, (row) => (row.stateWages === null ? row.wages : row.stateWages)) / all) : 1;
  return filing.residency === 'part-year' ? filing.share : 0;
}

function capitalClasses(ctx, answers, factor) {
  const rows = ctx.federal.schedules?.[8949] || [];
  const d = ctx.federal.schedules?.D || {};
  const scale = (value) => Math.round(whole(value) * factor);
  const shortGains = scale(sum(rows.filter((row) => row.term === 'short' && row.gain > 0), (row) => row.gain));
  const shortLosses = scale(sum(rows.filter((row) => row.term === 'short' && row.gain < 0), (row) => row.gain));
  const d1 = scale(d['8b']);
  const d2 = scale(d['9']);
  const d6 = scale(ctx.federal.schedules?.D ? d['13'] : ctx.income.capitalGainDistributions);
  const longGainsOnly = scale(sum(rows.filter((row) => row.term === 'long' && row.gain > 0), (row) => row.gain)) + Math.max(0, d6);
  const collectibles = Math.min(positive(answers.collectiblesGain), Math.max(0, d1 + d2));
  return { shortGains, shortLosses, d1, d2, d6, longGainsOnly, collectibles: Math.round(collectibles * Math.min(1, factor)), shortCarry: positive(answers.maShortTermLossCarryover), longCarry: positive(answers.maLongTermLossCarryover) };
}

function schedulesBD({ interest, dividends, exemptInterest, maBank, excluded, classes, rule }) {
  const b = {};
  const d = {};
  b[1] = interest + exemptInterest;
  b[2] = dividends;
  b[3] = 0;
  b[4] = b[1] + b[2] + b[3];
  b[5] = Math.min(maBank, b[4]);
  b['6a'] = excluded;
  b[7] = Math.max(0, b[4] - b[5] - b['6a']);
  b[8] = 0;
  b[9] = Math.max(0, b[7] - b[8]);
  b[10] = classes.shortGains;
  b[11] = classes.collectibles;
  b[12] = 0;
  b['13a'] = b[10] + b[11] + b[12];
  b['13c'] = Math.max(0, b['13a']);
  b[14] = 0;
  b[15] = Math.max(0, b['13c'] - b[14]);
  b[16] = classes.shortLosses;
  b[17] = 0;
  b[18] = -classes.shortCarry;
  b['19a'] = b[15] + b[16] + b[17] + b[18];
  b['19c'] = b['19a'];
  d[1] = classes.d1;
  d[2] = classes.d2;
  d[6] = classes.d6;
  d[8] = -classes.longCarry;
  d[9] = d[1] + d[2] + d[6] + d[8];
  d['10c'] = 0;
  d[11] = d[9] - d['10c'];
  d[12] = classes.collectibles;
  d[13] = d[11] - d[12];
  let d14 = 0;
  b[20] = 0;
  b[21] = 0;
  b[22] = 0;
  b[23] = 0;
  b[24] = 0;
  b[25] = 0;
  b[26] = 0;
  b[27] = 0;
  b[28] = 0;
  if (b['19c'] < 0) {
    b[20] = Math.min(b[9], -b['19c'], rule.lossAgainstInterestMaximum);
    b[21] = b['19c'] + b[20];
    if (b[21] < 0 && d[13] > 0) b[22] = Math.min(-b[21], d[13]);
    d14 = b[22];
    b[23] = b[21] + b[22];
  } else {
    b[24] = b['19c'];
    if (d[13] < 0 && b[24] > 0) b[25] = Math.min(b[24], -d[13]);
    d14 = b[25];
    b[26] = b[24] - b[25];
    if (b[26] > 0 && b[11] > 0) {
      const gains = b[10] + b[12];
      const losses = -b[16] - b[17] - b[18] + b[25];
      const excessLoss = losses > gains ? gains - losses : 0;
      const half = rateOf(Math.max(0, b[11] + excessLoss), rule.collectiblesDeductionBp);
      b[27] = Math.max(0, Math.min(half, b[26]));
    }
    b[28] = b[26] - b[27];
  }
  d[14] = d14;
  d[15] = d[13] > 0 ? d[13] - d14 : d[13] + d14;
  b[29] = b[9];
  b[30] = b[20];
  b[31] = b[29] - b[30];
  b[32] = 0;
  if (b['19c'] >= 0 && b[31] > 0 && d[15] < 0) {
    const room = Math.min(b[29], rule.lossAgainstInterestMaximum) - b[30];
    b[32] = room > 0 ? Math.min(room, -d[15]) : 0;
  }
  b[33] = b[31] - b[32];
  b[34] = b[28];
  b[35] = b[33] + b[34];
  d[16] = b[32];
  d[17] = d[15] + d[16];
  d[18] = 0;
  d[19] = Math.max(0, d[17] - d[18]);
  return { b, d };
}

function finishSchedules(b, d, excess, rule) {
  b[36] = excess.b36;
  b[37] = Math.max(0, b[35] - b[36]);
  b[38] = b[37] >= b[9] ? b[9] : b[37];
  b[39] = Math.max(0, b[37] - b[38]);
  const twelve = Math.min(b[39], Math.max(0, b[27] - b[36]));
  const eightFive = b[39] - twelve;
  b[40] = b[23] < 0 ? b[23] : 0;
  d[20] = excess.d20;
  d[21] = Math.max(0, d[19] - d[20]);
  d[22] = rateOf(d[21], rule.longTermRateBp);
  d[23] = d[17] < 0 ? d[17] : 0;
  return { twelve, eightFive };
}

function excessExemptions(status, exemptionsApplied, incomeAfterDeductions, b35, d19) {
  if (status === 'mfs' || exemptionsApplied <= incomeAfterDeductions) return { b36: 0, d20: 0 };
  const left = exemptionsApplied - incomeAfterDeductions;
  const b36 = Math.min(Math.max(0, b35), left);
  const d20 = Math.min(left - b36, Math.max(0, d19));
  return { b36, d20 };
}

function scheduleY(ctx, answers, rule, status, factor, residentAll) {
  const items = ctx.income.adjustmentItems || {};
  const scale = (value) => Math.round(whole(value) * factor);
  const y = {};
  y[2] = scale(items.earlyWithdrawal);
  y[7] = scale(items.seHealth);
  y[8] = scale(items.hsa);
  y['9a'] = scale(items.educator);
  const scheduleA = ctx.federal.summary?.itemized ? ctx.federal.schedules?.A : null;
  const charityBase = scheduleA ? whole(scheduleA['14']) : positive(ctx.itemized.charityCash) + positive(ctx.itemized.charityNonCash);
  y['9c'] = scale(Math.max(0, charityBase - positive(answers.householdGoodsDonations)));
  y[10] = scale(Math.min(whole(items.studentLoan), rule.studentLoanMaximum));
  y[11] = 0;
  const commuter = (paid) => (paid > rule.commuterFloor ? Math.min(paid - rule.commuterFloor, rule.commuterMaximum) : 0);
  y[15] = scale(commuter(positive(answers.commuterCosts)) + (status === 'mfj' ? commuter(positive(answers.spouseCommuterCosts)) : 0));
  y['18a'] = scale(Math.min(positive(answers.collegeSavingsContributions), byStatus(rule.collegeSavingsMaximum, status)));
  const beforeTuition = y[2] + y[7] + y[8] + y['9a'] + y[10];
  return { y, beforeTuition, residentAll, charityBase };
}

function totalY(y) {
  return y[2] + y[7] + y[8] + y['9a'] + y['9c'] + y[10] + y[11] + y[15] + y['18a'];
}

function circuitBreaker(ctx, filing, reader, status, ex, base, checks) {
  const answers = filing.answers;
  const housing = answers.circuitBreakerHousing;
  const senior = ctx.filers.some((item) => item.age !== null && item.age >= 65);
  if (!senior || !housing || housing === 'neither' || status === 'mfs' || filing.residency === 'nonresident') {
    if (senior && !housing && filing.residency !== 'nonresident' && status !== 'mfs') checks.push(check('info', 'MA_CIRCUIT_BREAKER_QUESTION', 'You or your spouse are 65 or over: the Senior Circuit Breaker credit (up to several thousand dollars, refundable) may apply if you own or rent your Massachusetts home.', 'Answer the circuit breaker questions.'));
    return null;
  }
  const rule = reader.read('circuit-breaker');
  if (!rule) return null;
  const line3 = base.cbIncome;
  const line4 = whole(ctx.income.socialSecurityBenefits);
  const line5 = positive(answers.exemptPension) + positive(answers.pensionContributionsRecovered) + positive(answers.iraContributionsRecovered);
  const line6 = positive(answers.circuitBreakerOtherIncome);
  const line7 = line3 + line4 + line5 + line6;
  const line8 = ex.b + ex.c + ex.d;
  const line9 = line7 - line8;
  const out = { 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9 };
  const limit = byStatus(rule.incomeLimit, status);
  let credit = 0;
  if (line9 > limit) {
    checks.push(check('info', 'MA_CIRCUIT_BREAKER_INCOME', `Qualifying income of $${line9.toLocaleString('en-US')} is above the Senior Circuit Breaker limit of $${limit.toLocaleString('en-US')}, so no credit.`));
  } else if (housing === 'owner') {
    const assessed = positive(answers.circuitBreakerAssessedValue);
    out[2] = assessed;
    if (answers.circuitBreakerAssessedValue === undefined) checks.push(check('error', 'MA_CIRCUIT_BREAKER_ASSESSED_VALUE', 'The Senior Circuit Breaker credit needs the assessed value of your home on January 1; above the limit no credit is allowed.', 'Answer the assessed value question.'));
    if (assessed <= rule.assessedValueLimit) {
      out[10] = positive(answers.circuitBreakerRealEstateTax);
      out[11] = positive(answers.circuitBreakerTaxAdjustments);
      out[12] = Math.max(0, out[10] - out[11]);
      out[13] = rateOf(answers.circuitBreakerWaterSewer, rule.waterSewerShareBp);
      out[14] = out[12] + out[13];
      out[15] = rateOf(line9, rule.incomeThresholdBp);
      out[16] = Math.max(0, out[14] - out[15]);
      out[17] = Math.min(out[16], rule.maximumCredit);
      credit = out[17];
    }
  } else if (housing === 'renter') {
    if (yesNo(answers.circuitBreakerRentSubsidy)) {
      checks.push(check('info', 'MA_CIRCUIT_BREAKER_SUBSIDY', 'A renter who received a federal or state rent subsidy, or rents from a tax-exempt landlord, does not qualify for the Senior Circuit Breaker credit.'));
    } else {
      out['18a'] = positive(answers.rentPaid);
      out[18] = rateOf(out['18a'], rule.rentShareBp);
      out[19] = rateOf(line9, rule.incomeThresholdBp);
      out[20] = Math.max(0, out[18] - out[19]);
      out[21] = Math.min(out[20], rule.maximumCredit);
      credit = out[21];
    }
  }
  return { credit, schedule: lineTable(out) };
}

function childAndFamilyCount(ctx, credits) {
  return ctx.dependents.filter((item) => (item.age !== null && (item.age < credits.childAndFamilyUnderAge || item.age >= credits.childAndFamilySeniorAge)) || item.disabled).length;
}

function healthCareChecks(ctx, filing, checks) {
  if (filing.residency === 'nonresident') return;
  const adults = ctx.filers.some((item) => item.age === null || item.age >= 18);
  if (!adults) return;
  const answer = filing.answers.healthCoverage;
  if (answer === undefined) checks.push(check('error', 'MA_SCHEDULE_HC', 'Every Massachusetts resident 18 or over files Schedule HC with the return: it says whether you had health insurance meeting the Massachusetts minimum standard each month.', 'Answer the health coverage question.'));
  else if (answer === 'gap') checks.push(check('error', 'MA_HEALTH_CARE_PENALTY', 'You were without qualifying health insurance for part of the year. The Schedule HC penalty depends on the months without cover, the affordability schedule and any appeal, which MyCA does not work out; the return would be wrong without it.', 'Have a preparer complete Schedule HC and the penalty on line 35.'));
  else if (answer === 'all-year') checks.push(check('info', 'MA_SCHEDULE_HC_DETAILS', 'Schedule HC must still list your insurer and the coverage from Form MA 1099-HC; keep the form.'));
}

function useTaxCheck(answers, checks) {
  if (answers.useTax === undefined) checks.push(check('warning', 'MA_USE_TAX', 'Massachusetts expects an entry for use tax on out-of-state and online purchases with no Massachusetts sales tax (0 if none).', 'Answer the use tax question (0 if none).'));
}

function residentReturn(ctx, filing, reader, rules) {
  const { rule, surtax, low, credits } = rules;
  const answers = filing.answers;
  const income = ctx.income;
  const status = maStatus(ctx.filingStatus);
  const checks = [];
  const ex = exemptions(ctx, answers, rule, status);
  const maW2Adjust = sum(ctx.w2.filter((row) => row.state === 'MA' && row.stateWages !== null), (row) => row.stateWages - row.wages);
  const line3 = Math.max(0, whole(income.wages) + maW2Adjust);
  const line4 = Math.max(0, whole(income.pensionTaxable) - positive(answers.exemptPension) - positive(answers.pensionContributionsRecovered));
  const line5 = Math.min(positive(answers.maBankInterest), whole(income.taxableInterest));
  const line6a = whole(income.businessIncome);
  const line8a = whole(income.unemployment);
  const x2 = Math.max(0, whole(income.iraTaxable) - positive(answers.iraContributionsRecovered));
  const x4 = Math.max(0, whole(income.otherIncome));
  const x7 = Math.max(0, x2 + x4);
  const line9 = x7;
  const line10 = line3 + line4 + line5 + line6a + line8a + line9;
  const fica = (owner, answerId) => {
    const paid = ficaByOwner(ctx, owner);
    return Math.min(rule.ficaDeductionMaximum, paid.withheld + paid.se + positive(answers[answerId]));
  };
  const line11a = fica('taxpayer', 'publicRetirementContributions');
  const line11b = status === 'mfj' ? fica('spouse', 'spousePublicRetirementContributions') : 0;
  const line14a = positive(answers.rentPaid);
  const line14 = Math.min(rateOf(line14a, rule.rentShareBp), byStatus(rule.rentMaximum, status));
  const sy = scheduleY(ctx, answers, rule, status, 1, true);
  const classes = capitalClasses(ctx, answers, 1);
  const { b, d } = schedulesBD({ interest: whole(income.taxableInterest), dividends: whole(income.ordinaryDividends), exemptInterest: whole(income.taxExemptInterest), maBank: line5, excluded: whole(income.usObligationInterest) + positive(answers.maObligationInterest), classes, rule });
  const agi1 = Math.max(0, line10);
  const agi3 = Math.max(0, agi1 - sy.beforeTuition);
  const agi5 = b[35];
  const agi6 = d[19];
  const agi7 = agi3 + agi5 + agi6;
  const tuitionPaid = positive(answers.collegeTuition);
  const tuitionFloor = rateOf(agi7, rule.collegeTuitionAgiShareBp);
  sy.y[11] = tuitionPaid > tuitionFloor ? tuitionPaid - tuitionFloor : 0;
  sy.y[19] = totalY(sy.y);
  const line15 = sy.y[19];
  const line16 = line11a + line11b + line14 + line15;
  const line17 = Math.max(0, line10 - line16);
  const line18 = ex.g;
  const line19 = Math.max(0, line17 - line18);
  const excess = excessExemptions(status, line18, line17, b[35], d[19]);
  const { twelve, eightFive } = finishSchedules(b, d, excess, rule);
  const line20 = b[38];
  const line21 = line19 + line20;
  const line22 = fivePercentTableTax(line21, rule.taxTable, rule.partBRateBp);
  const line23a = rateOf(eightFive, rule.shortTermRateBp);
  const line23b = rateOf(twelve, rule.collectiblesRateBp);
  const line23 = line23a + line23b;
  const line24 = d[22];
  const surtaxBase = line19 + b[37] + d[21];
  const surtaxSchedule = { 1: line19, 2: b[37], 3: d[21], 4: surtaxBase, 5: surtax.threshold, 6: Math.max(0, surtaxBase - surtax.threshold) };
  surtaxSchedule[7] = rateOf(surtaxSchedule[6], surtax.rateBp);
  const dependents = ex.dependents;
  const ntsLimit = status === 'mfs' ? -1 : byStatus(low.noTaxStatus, status) + dependents * byStatus(low.noTaxStatusPerDependent, status);
  const noTaxStatus = status !== 'mfs' && agi7 <= ntsLimit;
  const line28a = noTaxStatus ? 0 : line22 + line23 + line24;
  const line28b = noTaxStatus ? 0 : surtaxSchedule[7];
  const line28 = line28a + line28b;
  let line29 = 0;
  const licLimit = status === 'mfs' ? -1 : byStatus(low.limitedIncomeCredit, status) + dependents * byStatus(low.limitedIncomeCreditPerDependent, status);
  let lic = null;
  if (!noTaxStatus && status !== 'mfs' && agi7 <= licLimit) {
    const l3 = agi7 - ntsLimit;
    const l5 = rateOf(l3, low.limitedIncomeCreditRateBp);
    line29 = line28 > l5 ? line28 - l5 : 0;
    lic = lineTable({ 1: agi7, 2: ntsLimit, 3: l3, 4: line28, 5: l5, 6: line29 });
  }
  const ojcColumns = [];
  for (const other of filing.otherStates || []) {
    const taxedThere = Math.min(Math.max(0, line10), Math.max(0, FIVE_PERCENT_SOURCED.reduce((total, key) => total + whole(other.sourced?.[key]), 0)));
    const share = ratio(taxedThere, line10, { places: 4 });
    const w4 = rateOf(line19, rule.partBRateBp);
    const w6 = Math.max(0, w4 - line29);
    const w7 = Math.round(w6 * share);
    const w8 = positive(other.tax);
    ojcColumns.push({ state: other.state, 1: taxedThere, 2: line10, 3: share, 4: w4, 5: line29, 6: w6, 7: w7, 8: w8, 9: Math.min(w7, w8) });
    if (PASSIVE_SOURCED.some((key) => whole(other.sourced?.[key]))) checks.push(check('warning', 'MA_OJC_PASSIVE_INCOME', `${other.state} also taxed interest, dividends or gains: a separate Schedule OJC worksheet for that income is needed, which MyCA does not prepare; only the credit on 5.0% income is included.`, 'Have a preparer add the second worksheet.'));
  }
  const line30 = Math.min(Math.max(0, line28 - line29), sum(ojcColumns, (item) => item[9]));
  if (ojcColumns.length) checks.push(check('info', 'MA_SCHEDULE_OJC', 'The credit for tax paid to another state uses the tax on that state\'s nonresident return; enclose or keep that return.'));
  if (line28b > 0 && ojcColumns.length) checks.push(check('warning', 'MA_OJC_SURTAX', 'You owe the 4% surtax and paid tax to another state: DOR requires its online Schedule OJC worksheets, which may give a larger credit than the one MyCA uses.', 'Check the credit with the DOR online worksheet.'));
  const line31 = 0;
  const line32 = Math.max(0, line28 - line29 - line30 - line31);
  const line33 = 0;
  const line34 = positive(answers.useTax);
  const line35 = 0;
  const line37 = line32 + line33 + line34 + line35;
  const federalEic = whole(ctx.federal.lines['27']);
  const line43 = rateOf(federalEic, credits.eitcBasisPoints);
  const cb = circuitBreaker(ctx, filing, reader, status, ex, { cbIncome: agi3 + (b[9] + b['6a'] + b[15]) + classes.longGainsOnly }, checks);
  const line44 = cb ? cb.credit : 0;
  const familyCount = status === 'mfs' ? 0 : childAndFamilyCount(ctx, credits);
  const line46 = familyCount * credits.childAndFamilyCredit;
  const line48 = line43 + line44 + line46;
  healthCareChecks(ctx, filing, checks);
  useTaxCheck(answers, checks);
  if (ctx.filingStatus === 'qss') checks.push(check('warning', 'MA_NO_QSS_STATUS', 'Massachusetts has no qualifying surviving spouse status; MyCA uses head of household, which needs a qualifying person living with you.', 'Confirm you qualify as head of household.'));
  if (noTaxStatus) checks.push(check('info', 'MA_NO_TAX_STATUS', 'Your Massachusetts AGI is at or below the No Tax Status amount, so no income tax is due (line 27).'));
  if ((ctx.answers.shortTermLossCarryover || ctx.answers.longTermLossCarryover) && answers.maShortTermLossCarryover === undefined && answers.maLongTermLossCarryover === undefined) checks.push(check('warning', 'MA_LOSS_CARRYOVER', 'You have a federal capital loss carryover; Massachusetts carryovers come from your prior Massachusetts Schedules B and D and can differ.', 'Answer the Massachusetts loss carryover questions.'));
  if (whole(income.taxExemptInterest) > 0 && answers.maObligationInterest === undefined) checks.push(check('warning', 'MA_OUT_OF_STATE_MUNI', 'Interest on bonds of other states is taxable in Massachusetts; MyCA taxes all your federal tax-exempt interest unless you say how much came from Massachusetts bonds.', 'Answer the Massachusetts bond interest question.'));
  if (whole(income.pensionTaxable) > 0 && answers.exemptPension === undefined) checks.push(check('warning', 'MA_GOVERNMENT_PENSION', 'Contributory pensions from the U.S. government or Massachusetts and its towns, and U.S. military pensions, are not taxed in Massachusetts.', 'Answer the exempt pension question (0 if none).'));
  const scheduleX = lineTable({ 2: x2, 4: x4, 7: x7 });
  const lines = lineTable({ a: income.totalIncome, b: income.agi, '2a': ex.a, '2b': ex.b, '2c': ex.c, '2d': ex.d, '2e': ex.e, '2f': ex.f, '2g': ex.g, 3: line3, 4: line4, 5: line5, '6a': line6a, '8a': line8a, 9: line9, 10: line10, '11a': line11a, '11b': line11b, '14a': line14a, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, '23a': line23a, '23b': line23b, 23: line23, 24: line24, 27: noTaxStatus ? 1 : 0, '28a': line28a, '28b': line28b, 28: line28, 29: line29, 30: line30, 31: line31, 32: line32, 33: line33, 34: line34, 35: line35, 37: line37, 38: filing.payments.withheld, 40: filing.payments.estimated, 41: filing.payments.extension, '43a': Number(ctx.federal.schedules?.EIC?.qualifyingChildren || 0), '43b': federalEic, 43: line43, 44: line44, '46a': familyCount, 46: line46, 48: line48 });
  return {
    form: 'Form 1',
    lines,
    schedules: {
      X: scheduleX,
      Y: lineTable(sy.y),
      B: lineTable(b),
      D: lineTable(d),
      'Massachusetts AGI Worksheet': lineTable({ 1: agi1, 2: sy.beforeTuition, 3: agi3, 5: agi5, 6: agi6, 7: agi7 }),
      ...(lic ? { 'Limited Income Credit Worksheet': lic } : {}),
      ...(line28b ? { '4% Surtax': lineTable(surtaxSchedule) } : {}),
      ...(ojcColumns.length ? { OJC: { columns: ojcColumns, total: line30 } } : {}),
      ...(cb ? { CB: cb.schedule } : {}),
    },
    stateIncome: agi7,
    taxableIncome: line21 + b[39] + d[21],
    taxBeforeCredits: line28,
    nonrefundableCredits: [...(line29 ? [{ code: 'MA_LIMITED_INCOME_CREDIT', label: 'Limited Income Credit', amount: line29 }] : []), ...(line30 ? [{ code: 'MA_SCHEDULE_OJC', label: 'Income tax due to another state', amount: line30 }] : [])],
    otherStateCredit: line30,
    otherTaxes: line34 ? [{ code: 'MA_USE_TAX', label: 'Use tax', amount: line34 }] : [],
    totalTax: line37,
    refundableCredits: [...(line43 ? [{ code: 'MA_EITC', label: 'Massachusetts earned income credit', amount: line43 }] : []), ...(line44 ? [{ code: 'MA_CIRCUIT_BREAKER', label: 'Senior Circuit Breaker credit', amount: line44 }] : []), ...(line46 ? [{ code: 'MA_CHILD_FAMILY', label: 'Child and Family Tax Credit', amount: line46 }] : [])],
    checks,
  };
}

function nonresidentReturn(ctx, filing, reader, rules) {
  const { rule, surtax, low, credits } = rules;
  const answers = filing.answers;
  const income = ctx.income;
  const sourced = filing.sourced;
  const status = maStatus(ctx.filingStatus);
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const line3 = partYear ? ratio(filing.residentDays, ctx.daysInYear, { places: 4 }) : 0;
  const ex = exemptions(ctx, answers, rule, status);
  const shareOf = (part, total) => (whole(total) ? Math.min(1, Math.max(0, whole(part) / whole(total))) : 0);
  const pensionShare = shareOf(sourced.pensionTaxable, income.pensionTaxable);
  const line5 = Math.max(0, whole(sourced.wages));
  const line6 = Math.max(0, whole(sourced.pensionTaxable) - Math.round((positive(answers.exemptPension) + positive(answers.pensionContributionsRecovered)) * pensionShare));
  const line7 = partYear ? Math.min(Math.round(positive(answers.maBankInterest) * filing.share), Math.max(0, whole(sourced.taxableInterest))) : 0;
  const line8 = whole(sourced.businessIncome);
  const line10a = whole(sourced.unemployment);
  const x2 = Math.max(0, whole(sourced.iraTaxable) - Math.round(positive(answers.iraContributionsRecovered) * shareOf(sourced.iraTaxable, income.iraTaxable)));
  const x4 = Math.max(0, whole(sourced.otherIncome));
  const line11 = Math.max(0, x2 + x4);
  const line12 = line5 + line6 + line7 + line8 + line10a + line11;
  const capitalFactor = shareOf(sourced.capitalGain, income.capitalGain);
  const classes = capitalClasses(ctx, answers, capitalFactor);
  if (!partYear) {
    classes.shortCarry = Math.round(classes.shortCarry * capitalFactor);
    classes.longCarry = Math.round(classes.longCarry * capitalFactor);
  }
  if (whole(sourced.capitalGain) && whole(income.capitalGain)) checks.push(check('warning', 'MA_CAPITAL_CLASSES_PRORATED', 'Massachusetts taxes short-term gains, collectibles and long-term gains at different rates; MyCA split the Massachusetts part of your gains across those classes in the same proportions as on your federal Schedule D.', 'Check the Massachusetts Schedules B and D against the sales made while a resident or of Massachusetts property.'));
  const exemptShare = partYear ? filing.share : 0;
  const { b, d } = schedulesBD({ interest: Math.max(0, whole(sourced.taxableInterest)), dividends: Math.max(0, whole(sourced.ordinaryDividends)), exemptInterest: Math.round(whole(income.taxExemptInterest) * exemptShare), maBank: line7, excluded: whole(sourced.usObligationInterest) + Math.round(positive(answers.maObligationInterest) * exemptShare), classes, rule });
  const line14a = Math.max(0, line12);
  const line14c = Math.max(0, b[7]) + Math.max(0, b['13c']) + d[13];
  const line14d = line14a + line14c;
  const residentEquivalent = Math.max(0, whole(income.totalIncome) - whole(income.socialSecurityTaxable) - whole(income.usObligationInterest) - whole(income.stateRefundTaxable) - positive(answers.exemptPension)) + Math.max(0, whole(income.taxExemptInterest) - positive(answers.maObligationInterest));
  const line14e = Math.max(0, residentEquivalent - line14d);
  const line14f = line14d + line14e;
  const line14g = ratio(line14d, line14f, { places: 4 });
  const factor = partYear ? line3 : line14g;
  const fica = (owner, answerId) => {
    const paid = ficaByOwner(ctx, owner);
    const share = maWageShare(ctx, owner, filing);
    const seShare = shareOf(sourced.businessIncome, income.businessIncome);
    return Math.min(rule.ficaDeductionMaximum, Math.round(paid.withheld * share) + Math.round(paid.se * seShare) + positive(answers[answerId]));
  };
  const line15a = fica('taxpayer', 'publicRetirementContributions');
  const line15b = status === 'mfj' ? fica('spouse', 'spousePublicRetirementContributions') : 0;
  const line18a = positive(answers.rentPaid);
  const line18 = Math.min(rateOf(line18a, rule.rentShareBp), byStatus(rule.rentMaximum, status));
  const sy = scheduleY(ctx, answers, rule, status, factor, false);
  sy.y[19] = totalY(sy.y);
  const line19 = sy.y[19];
  const line20 = line15a + line15b + line18 + line19;
  const line21 = Math.max(0, line12 - line20);
  const line22a = ex.g;
  const line22 = Math.round(line22a * factor);
  const line23 = Math.max(0, line21 - line22);
  const excess = excessExemptions(status, line22, line21, b[35], d[19]);
  const { twelve, eightFive } = finishSchedules(b, d, excess, rule);
  const line24 = b[38];
  const line25 = line23 + line24;
  const line26 = fivePercentTableTax(line25, rule.taxTable, rule.partBRateBp);
  const line27a = rateOf(eightFive, rule.shortTermRateBp);
  const line27b = rateOf(twelve, rule.collectiblesRateBp);
  const line27 = line27a + line27b;
  const line28 = d[22];
  const line32a = line26 + line27 + line28;
  const surtaxBase = line23 + b[37] + d[21];
  const surtaxSchedule = { 1: line23, 2: b[37], 3: d[21], 4: surtaxBase, 5: surtax.threshold, 6: Math.max(0, surtaxBase - surtax.threshold) };
  surtaxSchedule[7] = rateOf(surtaxSchedule[6], surtax.rateBp);
  const line32b = surtaxSchedule[7];
  const line32 = line32a + line32b;
  const line33 = 0;
  const line34 = 0;
  const line35 = 0;
  const line36 = Math.max(0, line32 - line33 - line34 - line35);
  const line38 = positive(answers.useTax);
  const line39 = 0;
  const line41 = line36 + line38 + line39;
  const federalEic = whole(ctx.federal.lines['27']);
  const line47c = rateOf(federalEic, credits.eitcBasisPoints);
  const line47 = partYear ? Math.round(line47c * line3) : 0;
  const cbBase = Math.max(0, line12 - (sy.y[2] + sy.y[7] + sy.y[8] + sy.y['9a'] + sy.y[10])) + b[9] + b['6a'] + b[15] + classes.longGainsOnly;
  const cb = partYear ? circuitBreaker(ctx, filing, reader, status, ex, { cbIncome: cbBase }, checks) : null;
  const line48 = cb ? cb.credit : 0;
  const familyCount = partYear && status !== 'mfs' ? childAndFamilyCount(ctx, credits) : 0;
  const line50b = familyCount * credits.childAndFamilyCredit;
  const line50 = Math.round(line50b * line3);
  const line52 = line47 + line48 + line50;
  healthCareChecks(ctx, filing, checks);
  useTaxCheck(answers, checks);
  const licLimit = status === 'mfs' ? -1 : byStatus(low.limitedIncomeCredit, status) + ex.dependents * byStatus(low.limitedIncomeCreditPerDependent, status);
  if (income.agi <= licLimit && line32 > 0) checks.push(check('warning', 'MA_NTS_NR_PY', 'Your income may qualify for No Tax Status or the Limited Income Credit, which part-year residents and nonresidents claim on Schedule NTS-L-NR/PY using income from all sources; MyCA does not prepare that schedule.', 'Have a preparer complete Schedule NTS-L-NR/PY.'));
  if (partYear && line47 + line50 > 0) checks.push(check('info', 'MA_PART_YEAR_CREDITS', 'The earned income credit and the Child and Family Tax Credit are multiplied by the share of the year you lived in Massachusetts (line 3).'));
  if (partYear) checks.push(check('info', 'MA_PART_YEAR_DEDUCTIONS', 'Schedule Y deductions were taken in proportion to the days you lived in Massachusetts; the form allows the amounts you actually paid while a resident.'));
  if (!partYear && line14e === 0 && whole(income.totalIncome) > line14d) checks.push(check('info', 'MA_14E', 'Line 14e is your non-Massachusetts income as it would be taxed by Massachusetts; check it if Social Security or government pensions are a large part of your income.'));
  if (ctx.filingStatus === 'qss') checks.push(check('warning', 'MA_NO_QSS_STATUS', 'Massachusetts has no qualifying surviving spouse status; MyCA uses head of household, which needs a qualifying person living with you.', 'Confirm you qualify as head of household.'));
  const lines = lineTable({ 3: line3, '4a': ex.a, '4b': ex.b, '4c': ex.c, '4d': ex.d, '4e': ex.e, '4f': ex.f, '4g': ex.g, 5: line5, 6: line6, 7: line7, 8: line8, '10a': line10a, 11: line11, 12: line12, '14a': line14a, '14c': line14c, '14d': line14d, '14e': line14e, '14f': line14f, '14g': line14g, '15a': line15a, '15b': line15b, '18a': line18a, 18: line18, 19: line19, 20: line20, 21: line21, '22a': line22a, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, '27a': line27a, '27b': line27b, 27: line27, 28: line28, '32a': line32a, '32b': line32b, 32: line32, 33: line33, 34: line34, 35: line35, 36: line36, 38: line38, 39: line39, 41: line41, 42: filing.payments.withheld, 44: filing.payments.estimated, 45: filing.payments.extension, '47b': federalEic, '47c': line47c, 47: line47, 48: line48, '50a': familyCount, '50b': line50b, 50: line50, 52: line52 });
  return {
    form: 'Form 1-NR/PY',
    lines,
    schedules: {
      X: lineTable({ 2: x2, 4: x4, 7: line11 }),
      Y: lineTable(sy.y),
      B: lineTable(b),
      D: lineTable(d),
      ...(line32b ? { '4% Surtax': lineTable(surtaxSchedule) } : {}),
      ...(cb ? { CB: cb.schedule } : {}),
    },
    stateIncome: line14d,
    taxableIncome: line25 + b[39] + d[21],
    taxBeforeCredits: line32,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: line38 ? [{ code: 'MA_USE_TAX', label: 'Use tax', amount: line38 }] : [],
    totalTax: line41,
    refundableCredits: [...(line47 ? [{ code: 'MA_EITC', label: 'Massachusetts earned income credit', amount: line47 }] : []), ...(line48 ? [{ code: 'MA_CIRCUIT_BREAKER', label: 'Senior Circuit Breaker credit', amount: line48 }] : []), ...(line50 ? [{ code: 'MA_CHILD_FAMILY', label: 'Child and Family Tax Credit', amount: line50 }] : [])],
    checks,
  };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const surtax = reader.read('surtax');
  const low = reader.read('low-income');
  const credits = reader.read('credits');
  if (!rule || !surtax || !low || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Massachusetts figures for ${ctx.taxYear}.` };
  const rules = { rule, surtax, low, credits };
  return filing.residency === 'full-year' ? residentReturn(ctx, filing, reader, rules) : nonresidentReturn(ctx, filing, reader, rules);
}

const amount = (id, text, help, when) => Object.freeze({ id, ...(when ? { when } : {}), kind: 'amount', text, help });

const FORM_1_LABELS = Object.freeze({
  a: 'Federal total income',
  b: 'Federal adjusted gross income',
  '2a': 'Personal exemptions',
  '2b': 'Dependent exemptions',
  '2c': 'Age 65 or over',
  '2d': 'Blindness',
  '2e': 'Medical and dental (U.S. Schedule A, line 4)',
  '2f': 'Adoption',
  '2g': 'Total exemptions',
  3: 'Wages, salaries, tips and other employee compensation',
  4: 'Taxable pensions and annuities',
  5: 'Massachusetts bank interest',
  '6a': 'Business or profession income or loss',
  '8a': 'Unemployment compensation',
  9: 'Other income from Schedule X, line 7',
  10: 'Total 5.0% income',
  '11a': 'Amount you paid to Social Security, Medicare or retirement',
  '11b': 'Amount spouse paid to Social Security, Medicare or retirement',
  '14a': 'Total qualified rent paid',
  14: 'Rental deduction',
  15: 'Other deductions from Schedule Y, line 19',
  16: 'Total deductions',
  17: '5.0% income after deductions',
  18: 'Total exemption amount',
  19: '5.0% income after exemptions',
  20: 'Interest and dividend income (Schedule B, line 38)',
  21: 'Total taxable 5.0% income',
  22: 'Tax on 5.0% income',
  '23a': '8.5% income from Schedule B',
  '23b': '12% income from Schedule B',
  23: 'Tax on Schedule B income',
  24: 'Tax on long-term capital gains (Schedule D, line 22)',
  27: 'No Tax Status (1 if you qualify)',
  '28a': 'Income tax',
  '28b': '4% surtax',
  28: 'Total tax',
  29: 'Limited Income Credit',
  30: 'Income tax due to another state or jurisdiction',
  31: 'Other credits (Schedule CMS)',
  32: 'Income tax after credits',
  33: 'Voluntary fund contributions',
  34: 'Use tax',
  35: 'Health Care penalty',
  37: 'Income tax after credits, contributions, use tax, HC penalty',
  38: 'Massachusetts income tax withheld',
  40: 'Estimated tax payments',
  41: 'Payments made with extension',
  '43a': 'Earned income credit: number of qualifying children',
  '43b': 'Earned income credit: amount from U.S. return',
  43: 'Earned income credit',
  44: 'Senior Circuit Breaker Credit',
  '46a': 'Child and Family Tax Credit: number of dependents',
  46: 'Child and Family Tax Credit',
  48: 'Total refundable credits',
});

const FORM_1_NRPY_LABELS = Object.freeze({
  3: 'Part-year resident: share of the year in Massachusetts',
  '4a': 'Personal exemptions',
  '4b': 'Dependent exemptions',
  '4c': 'Age 65 or over',
  '4d': 'Blindness',
  '4e': 'Medical and dental',
  '4f': 'Adoption',
  '4g': 'Total exemptions',
  5: 'Massachusetts wages, salaries and tips',
  6: 'Massachusetts taxable pensions and annuities',
  7: 'Massachusetts bank interest',
  8: 'Massachusetts business or profession income or loss',
  '10a': 'Massachusetts unemployment compensation',
  11: 'Other income from Schedule X',
  12: 'Total 5.0% income',
  '14a': 'Massachusetts 5.0% income',
  '14c': 'Massachusetts interest, dividends and capital gains',
  '14d': 'Total Massachusetts gross income',
  '14e': 'Income from sources outside Massachusetts',
  '14f': 'Total gross income from all sources',
  '14g': 'Massachusetts income ratio',
  '15a': 'Amount you paid to Social Security, Medicare or retirement',
  '15b': 'Amount spouse paid to Social Security, Medicare or retirement',
  '18a': 'Total qualified rent paid',
  18: 'Rental deduction',
  19: 'Other deductions from Schedule Y',
  20: 'Total deductions',
  21: '5.0% income after deductions',
  '22a': 'Total exemptions before proration',
  22: 'Exemption amount',
  23: '5.0% income after exemptions',
  24: 'Interest and dividend income from Schedule B',
  25: 'Total taxable 5.0% income',
  26: 'Tax on 5.0% income',
  '27a': 'Tax on 8.5% income from Schedule B',
  '27b': 'Tax on 12% income from Schedule B',
  27: 'Tax on Schedule B income',
  28: 'Tax on long-term capital gains (Schedule D)',
  '32a': 'Income tax',
  '32b': '4% surtax',
  32: 'Total tax',
  33: 'Limited Income Credit',
  34: 'Income tax due to another state or jurisdiction',
  35: 'Other credits',
  36: 'Income tax after credits',
  38: 'Use tax',
  39: 'Health Care penalty',
  41: 'Income tax after credits, use tax and HC penalty',
  42: 'Massachusetts income tax withheld',
  44: 'Estimated tax payments',
  45: 'Payments made with extension',
  '47b': 'Earned income credit: amount from U.S. return',
  '47c': 'Earned income credit before proration',
  47: 'Earned income credit',
  48: 'Senior Circuit Breaker Credit',
  '50a': 'Child and Family Tax Credit: number of dependents',
  '50b': 'Child and Family Tax Credit before proration',
  50: 'Child and Family Tax Credit',
  52: 'Total refundable credits',
});

const massachusettsLabels = (taxYear, residency, form) => (form === 'Form 1' ? FORM_1_LABELS : FORM_1_NRPY_LABELS);

export const STATE = Object.freeze({
  code: 'MA',
  name: 'Massachusetts',
  built: true,
  forms: Object.freeze({ resident: 'Form 1', partYear: 'Form 1-NR/PY', nonresident: 'Form 1-NR/PY' }),
  questions: Object.freeze([
    Object.freeze({ id: 'healthCoverage', when: { residency: ['full-year', 'part-year'] }, kind: 'choice', options: Object.freeze(['all-year', 'gap', 'not-required']), text: 'Massachusetts health insurance (Schedule HC): did everyone 18 or over on the return have coverage meeting the Massachusetts minimum standard all year?', help: 'all-year: covered every month (Form MA 1099-HC); gap: some months without cover; not-required: not subject to the requirement (for example a nonresident for the months concerned).' }),
    amount('maBankInterest', 'Interest from deposit accounts in Massachusetts banks included in your federal taxable interest', 'Reported on Form 1 line 5 as 5.0% income instead of on Schedule B.', { residency: ['full-year', 'part-year'], has: ['interest'] }),
    amount('maObligationInterest', 'Interest and fund dividends from Massachusetts state or municipal bonds included in your federal tax-exempt interest', 'Exempt in Massachusetts; tax-exempt interest from other states\' bonds is taxed on Schedule B.', { has: ['taxExemptInterest'] }),
    amount('exemptPension', 'Part of your federal taxable pensions that is a contributory pension from the U.S. government or Massachusetts (or its towns), or a U.S. military pension', 'These pensions are not taxed in Massachusetts.', { has: ['retirementIncome'] }),
    amount('pensionContributionsRecovered', 'Your own pension contributions that were already taxed by Massachusetts and are recovered in this year\'s taxable pension', 'Subtracted from line 4 until all taxed contributions are recovered.', { has: ['retirementIncome'] }),
    amount('iraContributionsRecovered', 'IRA or Keogh contributions already taxed by Massachusetts that are recovered in this year\'s distributions', 'Schedule X line 2 worksheet; distributions are taxable only after these are recovered.', { has: ['retirementIncome'] }),
    amount('publicRetirementContributions', 'Your contributions in the year to the U.S. or a Massachusetts public retirement system (not shown as Social Security or Medicare on your W-2)', 'Counted with Social Security and Medicare toward the $2,000 deduction on line 11a.'),
    amount('spousePublicRetirementContributions', 'Your spouse\'s contributions to the U.S. or a Massachusetts public retirement system', 'Line 11b, also up to $2,000.', { filingStatus: ['mfj'] }),
    amount('rentPaid', 'Rent paid in the year for your principal residence in Massachusetts', 'Half is deducted, up to $4,000 ($2,000 married filing separately). Do not include utilities, parking or deposits.'),
    amount('commuterCosts', 'E-ZPass tolls and MBTA, RTA, commuter boat or bike commuting costs you paid (not reimbursed)', 'The amount above $150 is deducted, up to $750.'),
    amount('spouseCommuterCosts', 'Your spouse\'s E-ZPass tolls and transit or bike commuting costs', 'Worked out separately: above $150, up to $750.', { filingStatus: ['mfj'] }),
    amount('collegeTuition', 'Undergraduate tuition paid for you or a dependent, less scholarships, grants and insurer refunds', 'Full-year residents deduct the amount above 25% of Massachusetts AGI (Schedule Y line 11).'),
    amount('collegeSavingsContributions', 'Contributions to the Massachusetts U.Fund or U.Plan college savings or prepaid tuition plans', 'Deducted up to $1,000, or $2,000 joint.'),
    amount('householdGoodsDonations', 'Value of household goods and used clothing included in your charitable gifts', 'Massachusetts allows the charitable deduction without them.'),
    amount('collectiblesGain', 'Long-term gain on collectibles (art, coins, metals and so on) included in your capital gains', 'Taxed through Schedule B at 12% on half of the gain instead of 5%.', { has: ['capitalGains'] }),
    amount('maShortTermLossCarryover', 'Massachusetts short-term loss carried over from your prior year Schedule B line 40', 'From last year\'s Massachusetts return; can differ from the federal carryover.'),
    amount('maLongTermLossCarryover', 'Massachusetts long-term loss carried over from your prior year Schedule D line 23', 'From last year\'s Massachusetts return.'),
    amount('adoptionFees', 'Fees paid in the year to a licensed adoption agency', 'An exemption on line 2f.'),
    amount('useTax', 'Massachusetts use tax owed on out-of-state or online purchases with no Massachusetts sales tax', 'Enter 0 if none.'),
    Object.freeze({ id: 'circuitBreakerHousing', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'] }, kind: 'choice', options: Object.freeze(['owner', 'renter', 'neither']), text: 'Senior Circuit Breaker (65 or over): did you own or rent your Massachusetts principal residence?', help: 'Gives a refundable credit for property tax, or 25% of rent, above 10% of income.' }),
    amount('circuitBreakerAssessedValue', 'Homeowners: assessed value of your principal residence on January 1', 'No credit above the limit printed on Schedule CB.', { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['owner'] } }),
    amount('circuitBreakerRealEstateTax', 'Homeowners: real estate tax paid in the year on your principal residence (your share)', 'Schedule CB line 10.', { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['owner'] } }),
    amount('circuitBreakerTaxAdjustments', 'Homeowners: abatements, exemptions or work-off credits received, plus late-payment interest and betterments included in the tax paid', 'Schedule CB line 11.', { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['owner'] } }),
    amount('circuitBreakerWaterSewer', 'Homeowners: water and sewer use charges paid in the year', 'Half counts with the real estate tax.', { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['owner'] } }),
    Object.freeze({ id: 'circuitBreakerRentSubsidy', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['renter'] } }, kind: 'yesno', text: 'Renters: did you receive a federal or state rent subsidy, or rent from a tax-exempt landlord?', help: 'If yes, the circuit breaker credit is not allowed.' }),
    amount('circuitBreakerOtherIncome', 'Other income not on the return for the circuit breaker (cash public assistance, untaxed pensions not already given, and other receipts)', 'Schedule CB line 6; Social Security is added automatically.', { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], has: ['senior'], answer: { id: 'circuitBreakerHousing', in: ['owner', 'renter'] } }),
  ]),
  labels: massachusettsLabels,
  notCovered: Object.freeze([
    'The Schedule HC health care penalty (line 35) when you were uninsured for part of the year',
    'No Tax Status and the Limited Income Credit for part-year residents and nonresidents (Schedule NTS-L-NR/PY)',
    'Credit for tax paid to another jurisdiction for part-year residents, and Schedule OJC worksheets for interest, dividends or gains taxed elsewhere',
    'Massachusetts Schedule C, E and F differences from federal (bonus depreciation, rents, partnerships, S corporations, trusts), Schedule C-2 and excess business losses',
    'Alimony, the undergraduate student loan interest deduction (Schedule Y line 12), Massachusetts lottery winnings, gambling losses and other Schedule Y lines not listed in the interview',
    'Schedule CMS credits, the optional 5.85% rate, credit recapture and installment sale interest',
    'Excess Paid Family Leave withholding and the Massachusetts basis adjustments on Schedules B and D',
    'Underpayment penalty (Form M-2210)',
  ]),
  compute,
});
