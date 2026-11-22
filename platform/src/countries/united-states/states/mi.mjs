import { whole, positive, sum, check, lineTable, yesNo, otherStateCreditLimit } from '../state-kit.mjs';

const bp = (amount, basisPoints) => Math.round((whole(amount) * basisPoints) / 10000);
const usd = (value) => `$${whole(value).toLocaleString('en-US')}`;
const birthYear = (filer) => (/^\d{4}-/.test(String(filer?.dateOfBirth || '')) ? Number(String(filer.dateOfBirth).slice(0, 4)) : null);
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));
const pick = (table, amount) => table.find((row) => row.upTo === null || amount <= row.upTo);

function keyPerson(ctx) {
  const people = ctx.filingStatus === 'mfj' ? ctx.filers : ctx.filers.filter((item) => item.role === 'taxpayer');
  return people.filter((item) => birthYear(item) !== null).sort((a, b) => String(a.dateOfBirth).localeCompare(String(b.dateOfBirth)))[0] || null;
}

function scheduleNr(ctx, filing) {
  const all = ctx.income;
  const mi = filing.sourced;
  const row = (a, b) => ({ A: whole(a), B: whole(b), C: whole(a) - whole(b) });
  const rows = {
    5: row(all.wages, mi.wages),
    6: row(all.taxableInterest + all.ordinaryDividends, whole(mi.taxableInterest) + whole(mi.ordinaryDividends)),
    7: row(all.businessIncome, mi.businessIncome),
    8: row(all.capitalGain, mi.capitalGain),
    9: row(0, 0),
    10: row(all.iraTaxable + all.pensionTaxable + all.socialSecurityTaxable, whole(mi.iraTaxable) + whole(mi.pensionTaxable) + whole(mi.socialSecurityTaxable)),
    11: row(all.unemployment + all.stateRefundTaxable + all.otherIncome, whole(mi.unemployment) + whole(mi.stateRefundTaxable) + whole(mi.otherIncome)),
  };
  const total = (key) => sum(Object.values(rows), (item) => item[key]);
  rows[12] = { A: total('A'), B: total('B'), C: total('C') };
  rows[13] = row(all.adjustments, mi.adjustments);
  rows[14] = { A: rows[12].A - rows[13].A, B: rows[12].B - rows[13].B, C: rows[12].C - rows[13].C };
  const flat = {};
  for (const [line, value] of Object.entries(rows)) for (const column of ['A', 'B', 'C']) flat[`${line}${column}`] = value[column];
  return { rows, flat };
}

function retirementOptions(ctx, filing, answers, retirement, context) {
  const key = keyPerson(ctx);
  const born = birthYear(key);
  const joint = ctx.filingStatus === 'mfj';
  const limit = joint ? retirement.retirementLimit.joint : retirement.retirementLimit.single;
  const military = context.militaryTotal;
  const benefits = context.benefits;
  const options = [];
  if (born === null) return { born, options, key };
  if (born < retirement.phaseInBornFrom) {
    const l9 = limit;
    const l10 = military;
    const l11 = Math.max(0, l9 - l10);
    const l12 = Math.min(positive(answers.publicRetirement), benefits);
    const l13 = Math.max(0, l11 - l12);
    const l14 = Math.max(0, benefits - l12);
    const l15 = Math.min(l13, l14);
    const l16 = l12 + l15;
    options.push({ line: '27', section: 'A', amount: l16, worksheet: lineTable({ 9: l9, 10: l10, 11: l11, 12: l12, 13: l13, 14: l14, 15: l15, 16: l16 }) });
  }
  const inPhaseIn = born >= retirement.phaseInBornFrom && (retirement.phaseInBornThrough === null || born <= retirement.phaseInBornThrough);
  if (inPhaseIn && benefits > 0) {
    const w1 = limit;
    const w2 = military;
    const w3 = Math.max(0, w1 - w2);
    const w4 = bp(w3, retirement.phaseInBasisPoints);
    const w5 = benefits;
    const w6 = Math.min(w4, w5);
    options.push({ line: '27', section: 'D', amount: w6, worksheet: lineTable({ 1: w1, 2: w2, 3: w3, 4: w4, 5: w5, 6: w6 }) });
  }
  const dob = String(key.dateOfBirth);
  const tier2 = born >= retirement.tier2BornFrom && born <= retirement.tier2BornThrough;
  const tier3 = dob >= retirement.tier3BornFrom && dob <= retirement.tier3BornThrough;
  if ((tier2 || tier3) && key.age !== null && key.age >= retirement.standardDeductionAge) {
    const s1 = joint ? retirement.standardDeduction.joint : retirement.standardDeduction.single;
    const s3 = s1;
    const s4 = context.activeDutyTotal;
    const s5 = military;
    const s6 = s4 + s5;
    const s7 = Math.max(0, s3 - s6);
    if (tier2) options.push({ line: '25', section: 'Tier 2', amount: s7, worksheet: lineTable({ 1: s1, 2: 0, 3: s3, 4: s4, 5: s5, 6: s6, 7: s7 }) });
    else {
      const s8 = retirement.socialSecurityReducesTier3 ? context.socialSecurityLine14 : 0;
      const s9 = context.exemptionsForTier3;
      const s10 = s8 + s9;
      const s11 = Math.max(0, s7 - s10);
      options.push({ line: '26', section: 'Tier 3', amount: s11, worksheet: lineTable({ 1: s1, 2: 0, 3: s3, 4: s4, 5: s5, 6: s6, 7: s7, 8: s8, 9: s9, 10: s10, 11: s11 }) });
    }
  }
  return { born, options, key };
}

function seniorInvestmentDeduction(ctx, retirement, line11, line27, investmentIncome, born) {
  if (born === null || born >= retirement.seniorInvestmentBornBefore) return null;
  const s1 = ctx.filingStatus === 'mfj' ? retirement.seniorInvestmentLimit.joint : retirement.seniorInvestmentLimit.single;
  const s5 = line11 + line27;
  const s6 = Math.max(0, s1 - s5);
  const s7 = Math.max(0, investmentIncome);
  const s8 = Math.min(s6, s7);
  return { amount: s8, worksheet: lineTable({ 1: s1, 2: line11, 3: line27, 4: 0, 5: s5, 6: s6, 7: s7, 8: s8 }) };
}

function homesteadCredit(ctx, filing, answers, reader, checks) {
  const taxes = positive(answers.homesteadPropertyTaxes);
  const rent = positive(answers.rentPaid);
  if (!taxes && !rent) return null;
  if (filing.residency !== 'full-year') {
    checks.push(check('warning', 'MI_1040CR_PART_YEAR', 'The homestead property tax credit for a part-year resident needs annualized household resources and prorated taxes, which MyCA does not work out; no credit is included.', 'Have the MI-1040CR prepared separately.'));
    return null;
  }
  if (ctx.filingStatus === 'mfs') {
    checks.push(check('warning', 'MI_1040CR_MFS', 'A married filing separately claim needs Form 5049 and both spouses\' household resources; no credit is included.', 'Have the MI-1040CR prepared separately.'));
    return null;
  }
  const rule = reader.read('homestead-credit');
  if (!rule) return null;
  const income = ctx.income;
  const l9 = positive(answers.homesteadTaxableValue);
  if (taxes && !answers.homesteadTaxableValue) checks.push(check('error', 'MI_HOMESTEAD_TAXABLE_VALUE', 'Homeowners must give the taxable value of the homestead on the MI-1040CR.', 'Give the 2025 taxable value from your assessment notice or tax bill.'));
  if (taxes && l9 > rule.taxableValueMaximum) {
    checks.push(check('info', 'MI_HOMESTEAD_VALUE_OVER_LIMIT', `The taxable value of your home is above ${usd(rule.taxableValueMaximum)}, so you cannot claim the homestead property tax credit.`));
    return null;
  }
  const l10 = taxes;
  const l11 = rent;
  const l12 = bp(l11, rule.rentBasisPoints);
  const l13 = l10 + l12;
  const l14 = income.wages;
  const l15 = income.taxableInterest + income.taxExemptInterest + income.ordinaryDividends;
  const l16 = Math.max(0, income.businessIncome);
  const l17 = 0;
  const l18 = income.iraTaxable + income.pensionTaxable;
  const l19 = income.capitalGain;
  const l20 = income.otherIncome;
  const l21 = Math.max(0, income.socialSecurityBenefits - positive(answers.medicarePremiumsFromBenefits));
  const l22 = positive(answers.childSupportAndFosterPayments);
  const l23 = income.unemployment;
  const l24 = positive(answers.giftsAndSupportOver300);
  const l25 = positive(answers.otherNontaxableIncome);
  const l26 = positive(answers.workersCompAndVaDisability);
  const l27 = positive(answers.fipAndMdhhsBenefits);
  const l28 = l14 + l15 + l16 + l17 + l18 + l19 + l20 + l21 + l22 + l23 + l24 + l25 + l26 + l27;
  const l30 = whole(income.adjustments);
  const l31 = positive(answers.healthInsurancePremiums);
  const l32 = l30 + l31;
  const l33 = l28 - l32;
  const senior = ctx.filers.some((item) => item.age !== null && item.age >= rule.seniorAge);
  const disabled = positive(answers.specialExemptionFilers) > 0 || (answers.specialExemptionFilers === undefined && ctx.filers.some((item) => item.blind));
  const lines = { 9: l9, 10: l10, 11: l11, 12: l12, 13: l13, 14: l14, 15: l15, 16: l16, 17: l17, 18: l18, 19: l19, 20: l20, 21: l21, 22: l22, 23: l23, 24: l24, 25: l25, 26: l26, 27: l27, 28: l28, 29: l28, 30: l30, 31: l31, 32: l32, 33: l33 };
  if (l33 > rule.householdResourcesMaximum) {
    checks.push(check('info', 'MI_HOMESTEAD_RESOURCES_OVER_LIMIT', `Total household resources of ${usd(l33)} are above ${usd(rule.householdResourcesMaximum)}, so no homestead property tax credit is allowed.`));
    return { credit: 0, lines: lineTable(lines) };
  }
  const nonRefundableBp = senior || disabled ? pick(rule.otherClaimantsNonRefundable, l33).basisPoints : rule.generalNonRefundableBasisPoints;
  const l34 = Math.max(0, bp(l33, nonRefundableBp));
  const l35 = Math.max(0, l13 - l34);
  lines[34] = l34;
  lines[35] = l35;
  let l42;
  if (senior && !disabled) {
    const share = pick(rule.seniorShare, l33).basisPoints;
    const l38 = Math.min(rule.maximumCredit, bp(l35, share));
    Object.assign(lines, { 36: l35, 37: share / 100, 38: l38 });
    l42 = l38;
  } else if (disabled) {
    const l39 = Math.min(rule.maximumCredit, l35);
    lines[39] = l39;
    l42 = l39;
  } else {
    const l41 = Math.min(rule.maximumCredit, bp(l35, rule.generalShareBasisPoints));
    Object.assign(lines, { 40: l35, 41: l41 });
    l42 = l41;
  }
  const worksheet4 = l27 > 0 && l33 > 0 ? (() => {
    const c = Math.max(0, l33 - l27);
    const f = Math.round((l42 * c) / l33);
    return { A: l27, B: l33, C: c, D: Math.round((c / l33) * 10000) / 100, E: l42, F: f };
  })() : null;
  if (worksheet4) l42 = worksheet4.F;
  const steps = l33 > rule.phaseOutFrom ? Math.ceil((l33 - rule.phaseOutFrom) / rule.phaseOutStep) : 0;
  const l43 = Math.max(0, 10000 - steps * rule.phaseOutStepBasisPoints);
  let l44 = Math.round((l42 * l43) / 10000);
  let worksheet5 = null;
  if (senior && rent > 0) {
    const a = l33 > rule.phaseOutFrom ? l44 : l42;
    const b = rent;
    const c = bp(l33, rule.seniorRenterBasisPoints);
    const d = Math.max(0, b - c);
    const e = Math.min(rule.maximumCredit, Math.max(a, d));
    worksheet5 = { A: a, B: b, C: c, D: d, E: e };
    l44 = e;
  }
  Object.assign(lines, { 42: l42, 43: l43 / 100, 44: l44 });
  return { credit: l44, lines: lineTable(lines), worksheet4, worksheet5 };
}

function compute(ctx, filing, reader) {
  const taxRule = reader.read('income-tax');
  const credits = reader.read('credits');
  const adjustRule = reader.read('adjustments');
  if (!taxRule || !credits || !adjustRule) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Michigan figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const checks = [];
  const notes = [];
  const residency = filing.residency;
  const resident = residency === 'full-year';
  const partYear = residency === 'part-year';
  const share = resident ? 1 : partYear ? filing.share : 0;
  const joint = ctx.filingStatus === 'mfj';

  const dependentFiler = ctx.filers.some((item) => item.role === 'taxpayer' && item.canBeClaimedAsDependent);
  const count9a = dependentFiler ? 0 : ctx.filers.filter((item) => !item.canBeClaimedAsDependent).length + ctx.dependents.length;
  const count9b = (answers.specialExemptionFilers === undefined ? ctx.filers.filter((item) => item.blind).length : positive(answers.specialExemptionFilers)) + positive(answers.specialExemptionDependents);
  const count9c = positive(answers.disabledVeterans);
  const count9d = positive(answers.stillbirths);
  const special = count9b || count9c || count9d || dependentFiler ? reader.read('special-exemptions') : null;
  const line9a = count9a * taxRule.personalExemption;
  const line9b = special ? count9b * special.specialExemption : 0;
  const line9c = special ? count9c * special.disabledVeteranExemption : 0;
  const line9d = special ? count9d * special.stillbirthExemption : 0;
  const line9e = special && dependentFiler ? special.dependentOfAnotherExemption : 0;
  const line9f = line9a + line9b + line9c + line9d + line9e;

  const nr = resident ? null : scheduleNr(ctx, filing);

  const michiganMuni = positive(answers.michiganObligationInterest);
  if (income.taxExemptInterest > 0 && answers.michiganObligationInterest === undefined && residency !== 'nonresident') checks.push(check('warning', 'MI_MUNI_INTEREST_SOURCE', `Your federally tax-exempt interest of ${usd(income.taxExemptInterest)} is added back in full as interest from other states' bonds; Michigan bond interest is not added.`, 'Give the part of your tax-exempt interest that came from Michigan obligations.'));
  const add1 = Math.round(Math.max(0, income.taxExemptInterest - michiganMuni) * share);
  const seTax = whole(income.adjustmentItems?.seTaxDeduction);
  const businessShare = income.businessIncome > 0 ? Math.min(1, Math.max(0, whole(filing.sourced.businessIncome)) / income.businessIncome) : share;
  const add2 = resident ? seTax : Math.round(seTax * businessShare);
  const add4 = nr && nr.rows[14].C < 0 ? -nr.rows[14].C : 0;
  const additions = { 1: add1, 2: add2, 4: add4 };
  const line9 = add1 + add2 + add4;

  const militaryTotal = positive(answers.militaryRailroadRetirement);
  const activeDutyTotal = positive(answers.activeDutyMilitaryPay);
  const sub10 = resident ? income.usObligationInterest : whole(filing.sourced.usObligationInterest);
  const sub11 = Math.round(militaryTotal * share);
  const sub13 = nr && nr.rows[14].C > 0 ? nr.rows[14].C : 0;
  const socialSecurityMi = resident ? income.socialSecurityTaxable : whole(filing.sourced.socialSecurityTaxable);
  const sub14 = socialSecurityMi + Math.round(activeDutyTotal * share);
  const sub16 = resident ? income.stateRefundTaxable : whole(filing.sourced.stateRefundTaxable);
  const limitOf = (table) => (joint ? table.joint : table.single);
  const mesp = Math.min(positive(answers.educationSavingsContributions), limitOf(adjustRule.educationSavingsLimit));
  const able = Math.min(positive(answers.ableContributions), limitOf(adjustRule.ableLimit));
  const sub17 = residency === 'nonresident' ? 0 : Math.min(mesp + able, limitOf(adjustRule.combinedLimit));
  const sub18 = residency === 'nonresident' ? 0 : positive(answers.educationTrustPayments);
  let tipsOvertime = 0;
  if (adjustRule.tipsAndOvertimeSubtraction) {
    const federalTipsOvertime = whole(ctx.federal.schedules?.['1-A']?.['13']) + whole(ctx.federal.schedules?.['1-A']?.['21']);
    tipsOvertime = resident ? federalTipsOvertime : Math.min(federalTipsOvertime, positive(answers.michiganTipsAndOvertime));
    if (!resident && federalTipsOvertime && answers.michiganTipsAndOvertime === undefined) checks.push(check('warning', 'MI_TIPS_OVERTIME_SOURCE', 'Only qualified tips and overtime for work done in Michigan (or while a resident) are subtracted.', 'Give the Michigan part of your qualified tips and overtime.'));
  }

  const retirementForms = ctx.forms.filter((form) => form.kind === '1099-R' && !String(form.fields?.distributionCode || '').includes('1'));
  const qualifyingAll = Math.max(0, sum(retirementForms, taxableOf) - positive(answers.nonqualifyingRetirement));
  const retirementAll = income.iraTaxable + income.pensionTaxable;
  const retirementMi = resident ? retirementAll : whole(filing.sourced.iraTaxable) + whole(filing.sourced.pensionTaxable);
  const benefits = retirementAll > 0 ? Math.round(qualifyingAll * Math.min(1, retirementMi / retirementAll)) : 0;
  const needsRetirement = ctx.filers.some((item) => birthYear(item) !== null && birthYear(item) < 1967) || benefits > 0;
  const retirement = needsRetirement ? reader.read('retirement') : null;
  let yearOfBirth = { 25: 0, 26: 0, 27: 0, 28: 0 };
  let retirementSchedule = null;
  let seniorSchedule = null;
  let chosen = null;
  if (retirement) {
    const nrShare = nr && nr.rows[14].A > 0 ? Math.min(1, nr.rows[14].B / nr.rows[14].A) : 1;
    const exemptionsForTier3 = resident ? line9a + line9d : Math.round((line9a + line9d) * nrShare);
    const picked = retirementOptions(ctx, filing, answers, retirement, { militaryTotal, activeDutyTotal, benefits, socialSecurityLine14: sub14, exemptionsForTier3 });
    chosen = picked.options.reduce((best, item) => (!best || item.amount > best.amount ? item : best), null);
    if (chosen && chosen.amount > 0) {
      yearOfBirth[chosen.line] = chosen.amount;
      retirementSchedule = { section: chosen.section, lines: chosen.worksheet, alternatives: picked.options.filter((item) => item !== chosen).map((item) => ({ section: item.section, amount: item.amount })) };
    }
    const investment = resident ? income.taxableInterest + income.ordinaryDividends + Math.max(0, income.capitalGain) : whole(filing.sourced.taxableInterest) + whole(filing.sourced.ordinaryDividends) + Math.max(0, whole(filing.sourced.capitalGain));
    const senior = chosen && chosen.line !== '27' ? null : seniorInvestmentDeduction(ctx, retirement, sub11, yearOfBirth[27], investment - (resident ? income.usObligationInterest : sub10), picked.born);
    if (senior && senior.amount > 0) {
      yearOfBirth[28] = senior.amount;
      seniorSchedule = senior.worksheet;
    }
    if (yesNo(answers.ssaExemptOrPublicSafetyRetirement)) checks.push(check('warning', 'MI_RETIREMENT_SPECIAL_SECTIONS', 'Retirement from employment not covered by Social Security, or from qualified police, fire or county corrections service, can allow a larger subtraction (Form 4884 Sections A to C, Schedule 1 boxes 24C/24G) that MyCA does not work out; the subtraction used may be too small.', 'Have Form 4884 reviewed by a tax professional.'));
  }
  const subtractions = { 10: sub10, 11: sub11, 13: sub13, 14: sub14, 16: sub16, 17: sub17, 18: sub18, ...(tipsOvertime ? { tipsAndOvertime: tipsOvertime } : {}), ...yearOfBirth };
  const line29 = sub10 + sub11 + sub13 + sub14 + sub16 + sub17 + sub18 + tipsOvertime + yearOfBirth[25] + yearOfBirth[26] + yearOfBirth[27] + yearOfBirth[28];
  const line31 = line29;

  const line10 = income.agi;
  const line11 = line9;
  const line12 = line10 + line11;
  const line13 = line31;
  const line14 = Math.max(0, line12 - line13);
  let line15 = line9f;
  if (nr) {
    const nr16 = nr.rows[14].B;
    const nr17 = nr.rows[14].A;
    const nr18 = nr17 > 0 ? Math.min(1, Math.max(0, nr16 / nr17)) : 0;
    const nr19 = Math.round(line9f * nr18);
    nr.flat[15] = line9f;
    nr.flat[16] = nr16;
    nr.flat[17] = nr17;
    nr.flat[18] = Math.round(nr18 * 10000) / 10000;
    nr.flat[19] = nr19;
    line15 = nr19;
  }
  const line16 = Math.max(0, line14 - line15);
  const line17 = bp(line16, taxRule.rateBasisPoints);

  const others = resident ? filing.otherStates.filter((item) => item.tax > 0 && item.income > 0) : [];
  const line18a = sum(others, (item) => item.tax);
  const line18b = Math.min(line17, others.reduce((total, item) => total + otherStateCreditLimit({ residentTax: line17, residentIncome: line14, doubleTaxedIncome: item.income, otherStateTax: item.tax }), 0));
  if (others.length) checks.push(check('info', 'MI_OUTSIDE_TAX_CREDIT', 'The credit for tax imposed by another state is limited to the Michigan tax on the income taxed there. Include a copy of the other state\'s return.'));
  const organ = Math.min(positive(answers.organDonationExpenses), credits.organDonationMaximum);
  const line20a = positive(answers.organDonationExpenses);
  const line20b = Math.min(organ, Math.max(0, line17 - line18b));
  const line21 = Math.max(0, line17 - (line18b + line20b));
  const line24 = positive(answers.useTax);
  const line25 = line21 + line24;

  const homestead = homesteadCredit(ctx, filing, answers, reader, checks);
  const line26 = homestead ? homestead.credit : 0;
  const federalEic = whole(ctx.federal.lines['27']);
  const eitcAllowed = residency !== 'nonresident' || line16 > 0;
  const line28a = eitcAllowed ? federalEic : 0;
  const line28b = bp(line28a, credits.eitcBasisPoints);
  const line31w = filing.payments.withheld;
  const line32 = filing.payments.estimated + filing.payments.extension;
  const line34 = line26 + line28b + line31w + line32;
  const line36 = Math.max(0, line25 - line34);
  const line37 = Math.max(0, line34 - line25);

  const district = String(answers.schoolDistrictCode || '').trim();
  if (residency !== 'nonresident' && !/^\d{5}$/.test(district)) checks.push(check('warning', 'MI_SCHOOL_DISTRICT_CODE', 'The MI-1040 asks for the five-digit code of the school district you lived in on December 31.', 'Give your school district code from the list in the MI-1040 book.'));
  if (ctx.w2.some((row) => row.localWithheld > 0) || answers.cityIncomeTax === true) checks.push(check('info', 'MI_CITY_INCOME_TAX', 'Michigan city income taxes (Detroit, Grand Rapids, Lansing and others) are separate city returns that MyCA does not prepare; local tax withheld on your W-2 is not used here.'));
  if (answers.useTax === undefined) checks.push(check('info', 'MI_USE_TAX', 'Michigan use tax is owed on internet, mail order or out-of-state purchases with no Michigan sales tax; enter it if any.'));
  if (retirementSchedule) notes.push(`Retirement and senior deductions use ${retirementSchedule.section === 'A' || retirementSchedule.section === 'D' ? `Form 4884 Section ${retirementSchedule.section}` : `the ${retirementSchedule.section} Michigan Standard Deduction`}, the most beneficial option for the year of birth of ${joint ? 'the older spouse' : 'the filer'}.`);
  if (!resident) notes.push('Schedule NR allocates income to Michigan (column B); the exemption allowance is prorated by the Michigan share of total income.');
  if (filing.residency === 'part-year' && federalEic) notes.push('The Michigan earned income tax credit is 30% of the federal credit; Treasury\'s instructions do not prorate it for part-year residents.');

  const lines = lineTable({ '9a': line9a, '9b': line9b, '9c': line9c, '9d': line9d, '9e': line9e, '9f': line9f, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, '18a': line18a, '18b': line18b, '20a': line20a, '20b': line20b, 21: line21, 22: 0, 23: 0, 24: line24, 25: line25, 26: line26, 27: 0, '28a': line28a, '28b': line28b, 29: 0, 30: 0, 31: line31w, 32: line32, 34: line34, 36: line36, 37: line37, 38: 0, 39: line37 });
  return {
    form: 'MI-1040',
    lines,
    schedules: {
      1: lineTable({ ...additions, 9: line9, ...subtractions, 29: line29, 31: line31 }),
      ...(nr ? { NR: lineTable(nr.flat) } : {}),
      ...(retirementSchedule && (retirementSchedule.section === 'A' || retirementSchedule.section === 'D') ? { 4884: { section: retirementSchedule.section, lines: retirementSchedule.lines, alternatives: retirementSchedule.alternatives } } : {}),
      ...(retirementSchedule && retirementSchedule.section.startsWith('Tier') ? { 'Worksheet 2': { tier: retirementSchedule.section, lines: retirementSchedule.lines, alternatives: retirementSchedule.alternatives } } : {}),
      ...(seniorSchedule ? { 'Senior investment deduction': seniorSchedule } : {}),
      ...(homestead ? { 'MI-1040CR': homestead.lines, ...(homestead.worksheet4 ? { 'MI-1040CR Worksheet 4': homestead.worksheet4 } : {}), ...(homestead.worksheet5 ? { 'MI-1040CR Worksheet 5': homestead.worksheet5 } : {}) } : {}),
      ...(district ? { SchoolDistrict: { code: district } } : {}),
    },
    stateIncome: resident ? line14 : nr.rows[14].B,
    taxableIncome: line16,
    taxBeforeCredits: line17,
    nonrefundableCredits: [
      ...(line18b ? [{ code: 'MI_OUTSIDE_GOVERNMENT_TAX', label: 'Income tax imposed by government units outside Michigan', amount: line18b }] : []),
      ...(line20b ? [{ code: 'MI_ORGAN_DONATION', label: 'Credit for organ donation expenses', amount: line20b }] : []),
    ],
    otherStateCredit: line18b,
    otherTaxes: line24 ? [{ code: 'MI_USE_TAX', label: 'Use tax', amount: line24 }] : [],
    totalTax: line25,
    refundableCredits: [
      ...(line26 ? [{ code: 'MI_HOMESTEAD_PROPERTY_TAX', label: 'Homestead property tax credit (MI-1040CR)', amount: line26 }] : []),
      ...(line28b ? [{ code: 'MI_EITC', label: 'Michigan earned income tax credit', amount: line28b }] : []),
    ],
    checks,
    notes,
  };
}

const q = (id, kind, text, help) => Object.freeze({ id, kind, text, help });

export const STATE = Object.freeze({
  code: 'MI',
  name: 'Michigan',
  built: true,
  forms: Object.freeze({ resident: 'MI-1040', partYear: 'MI-1040 with Schedule NR', nonresident: 'MI-1040 with Schedule NR' }),
  questions: Object.freeze([
    q('schoolDistrictCode', 'text', 'Five-digit Michigan school district code where you lived on December 31', 'From the school district code list in the MI-1040 book. Nonresidents use 10000.'),
    q('michiganObligationInterest', 'amount', 'Part of your federally tax-exempt interest that came from Michigan state or local bonds', 'Interest on other states\' bonds is added on Schedule 1, line 1; Michigan bond interest is not. Enter 0 if none.'),
    q('specialExemptionFilers', 'count', 'How many of you (and your spouse) are deaf, blind, hemiplegic, paraplegic, quadriplegic or totally and permanently disabled', 'Each gives a special exemption on line 9b and changes the homestead credit computation. Leave empty to use the blind boxes from your federal return.'),
    q('specialExemptionDependents', 'count', 'How many of your dependents qualify for that special exemption', 'Line 9b; claim it on one return only.'),
    q('disabledVeterans', 'count', 'Number of qualified disabled veterans (you, your spouse or a dependent)', 'Line 9c.'),
    q('stillbirths', 'count', 'Number of Certificates of Stillbirth from MDHHS for the year', 'Line 9d; include a copy of the certificate.'),
    q('militaryRailroadRetirement', 'amount', 'U.S. Armed Forces or Michigan National Guard retirement pay, or taxable railroad retirement, included in federal AGI', 'Subtracted on Schedule 1, line 11; it reduces the other retirement limits.'),
    q('activeDutyMilitaryPay', 'amount', 'Pay for active duty in the U.S. Armed Forces included in federal AGI', 'Subtracted on Schedule 1, line 14.'),
    q('educationSavingsContributions', 'amount', 'Net contributions to a Michigan Education Savings Program or MI 529 Advisor Plan account (less qualified withdrawals)', 'Schedule 1, line 17.'),
    q('ableContributions', 'amount', 'Net contributions to a MiABLE account', 'Schedule 1, line 17.'),
    q('educationTrustPayments', 'amount', 'Michigan Education Trust contract payments or charitable contributions', 'Schedule 1, line 18.'),
    q('nonqualifyingRetirement', 'amount', 'Part of your 1099-R income that is not a qualifying retirement benefit (457 plans, Thrift Savings Plan, unmatched employee 401(k) contributions, amounts before you could retire)', 'Early distributions coded 1 are left out already.'),
    q('publicRetirement', 'amount', 'Part of your retirement benefits from Michigan or federal government service (if born before 1946)', 'Public benefits are subtracted in full on Form 4884 Section A.'),
    q('ssaExemptOrPublicSafetyRetirement', 'yesno', 'Do you or your spouse get a retirement benefit from work not covered by Social Security, or from police, fire or county corrections service?', 'These allow other Form 4884 sections that MyCA does not work out.'),
    q('michiganTipsAndOvertime', 'amount', 'Part of your federally deducted qualified tips and overtime earned in Michigan (nonresidents and part-year residents, 2026)', 'Residents subtract the full federal amount.'),
    q('organDonationExpenses', 'amount', 'Unreimbursed live organ donation expenses', 'One-time credit on line 20, up to $10,000.'),
    q('useTax', 'amount', 'Michigan use tax owed on internet, mail order or out-of-state purchases', 'Use Worksheet 1 in the MI-1040 book. Enter 0 if none.'),
    q('homesteadPropertyTaxes', 'amount', 'Property taxes levied in the year on your Michigan home (homeowners)', 'For the homestead property tax credit on the MI-1040CR. Leave out special assessments and penalties.'),
    q('homesteadTaxableValue', 'amount', 'Taxable value of your Michigan home', 'From your assessment notice or tax bill; homes above the limit cannot claim the credit.'),
    q('rentPaid', 'amount', 'Rent you paid in the year for your Michigan home (renters)', '23% of rent counts as property tax on the MI-1040CR.'),
    q('medicarePremiumsFromBenefits', 'amount', 'Medicare premiums taken out of your Social Security or railroad benefits', 'Subtracted from benefits in total household resources.'),
    q('childSupportAndFosterPayments', 'amount', 'Child support and foster parent payments received', 'Total household resources, line 22.'),
    q('giftsAndSupportOver300', 'amount', 'Value above $300 of gifts received or expenses paid on your behalf', 'Total household resources, line 24.'),
    q('otherNontaxableIncome', 'amount', 'Other nontaxable income (scholarships paid to a school, inheritance, life insurance, housing allowance and similar)', 'Total household resources, line 25.'),
    q('workersCompAndVaDisability', 'amount', 'Workers\' compensation and VA disability compensation or pension', 'Total household resources, line 26.'),
    q('fipAndMdhhsBenefits', 'amount', 'FIP and other MDHHS cash payments received (not food assistance)', 'Total household resources, line 27; the credit is prorated if you received them.'),
    q('healthInsurancePremiums', 'amount', 'Medical, dental, vision and prescription insurance premiums you paid (not pre-tax, not already deducted)', 'Reduces total household resources, line 31.'),
  ]),
  notCovered: Object.freeze([
    'City income taxes (Detroit, Grand Rapids, Lansing and the other Michigan cities), which are separate returns',
    'Schedule 1 items not asked about: MI-1040D and MI-4797 adjustments, out-of-state business and rental income or losses for residents, flow-through entity tax, net operating losses, Renaissance Zone, oil and gas, tribal income, marihuana establishment expenses, 529 nonqualified withdrawals, the 2025 IRC decoupling adjustments of P.A. 24 of 2025, and miscellaneous subtractions',
    'Form 4884 Sections B and C and the larger limits for retirement from work not covered by Social Security or from police, fire and corrections service, and surviving spouse elections',
    'The homestead property tax credit for part-year residents, married filing separately, homeowners who moved, farmland, alternate and special housing, and the MI-1040CR-2 for veterans and blind people; the home heating credit (MI-1040CR-7) and the farmland preservation credit',
    'Credit for tax paid to a city outside Michigan or a Canadian province (Form 777), and the historic preservation credits',
    'Voluntary contributions (Form 4642), the first-time home buyer savings program, and the underpayment penalty (MI-2210)',
    'A joint return where one spouse is a full-year resident and the other is not (Worksheet 6)',
  ]),
  compute,
});
