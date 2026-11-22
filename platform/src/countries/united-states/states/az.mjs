import { whole, positive, rateOf, ratio, check, byStatus, lineTable, sum, homeStateCreditCheck } from '../state-kit.mjs';
import { rules } from '../../../sprint-load.mjs';

const statusOf = (ctx) => (ctx.filingStatus === 'qss' ? 'hoh' : ctx.filingStatus);

function dependentBoxes(ctx, answers) {
  const listed = ctx.dependents.filter((item) => !item.bornAfterYear);
  const under17 = listed.filter((item) => item.age !== null && item.age < 17).length;
  const parents = Math.min(positive(answers.qualifyingParents), listed.length - under17);
  return { a: under17, b: listed.length - under17 - parents, parents };
}

function dependentCredit(rule, boxes, federalAgi, status) {
  const before = boxes.a * rule.under17 + boxes.b * rule.other;
  const limit = status === 'mfj' ? rule.agiLimit.mfj : rule.agiLimit.other;
  const over = Math.max(0, federalAgi - limit);
  if (!over) return { before, factor: 1, credit: before };
  const steps = Math.ceil(over / rule.stepDollars);
  const factor = Math.max(0, 10000 - steps * rule.stepBasisPoints) / 10000;
  return { before, factor, credit: Math.round(before * factor) };
}

function familyCredit(rule, people, status, worksheetIncome) {
  const key = status === 'mfj' ? 'mfj' : status === 'hoh' ? 'hoh' : 'other';
  const table = rule.maxIncome[key];
  const limit = table[Math.min(people, table.length - 1)];
  if (worksheetIncome > limit) return 0;
  const count = people + (status === 'mfj' ? rule.extraPeople.mfj : rule.extraPeople.other);
  return Math.min(count * rule.perPerson, rule.cap[key]);
}

function exciseCredit(ctx, rule, people, status, federalAgi) {
  const key = status === 'mfj' ? 'mfj' : status === 'hoh' ? 'hoh' : 'other';
  if (federalAgi > rule.agiLimit[key] || ctx.filers.some((item) => item.role === 'taxpayer' && item.canBeClaimedAsDependent)) return 0;
  const count = people + (status === 'mfj' ? 2 : 1);
  return Math.min(count * rule.perPerson, rule.maximum);
}

function saltCap(ctx, deductions) {
  const mfs = ctx.filingStatus === 'mfs';
  const arizona = mfs ? deductions.saltLimit.mfs : deductions.saltLimit.other;
  const found = rules.rule('us.federal.individual.salt-cap', `${ctx.taxYear}-12-31`);
  if (!found.ok) return { cap: arizona, rule: null };
  const value = found.value;
  const base = Math.round((mfs ? value.mfsCapCents : value.capCents) / 100);
  const start = Math.round((mfs ? value.mfsPhaseDownStartCents : value.phaseDownStartCents) / 100);
  const floor = Math.round((mfs ? value.mfsFloorCents : value.floorCents) / 100);
  const reduced = Math.max(floor, base - Math.round((Math.max(0, ctx.income.agi - start) * value.phaseDownBasisPoints) / 10000));
  return { cap: reduced, rule: `${found.record.id}@${found.record.effectiveFrom}` };
}

function itemizedTotal(ctx, deductions, creditGifts) {
  const parts = ctx.itemized;
  const scheduleA = parts.federalScheduleA;
  const charity = parts.charityCash + parts.charityNonCash;
  if (parts.federalItemized && scheduleA) {
    const total = whole(scheduleA[17]) - whole(scheduleA[4]) + parts.medicalPaid - Math.min(creditGifts, whole(scheduleA[14]));
    return { total: Math.max(0, total), medical: parts.medicalPaid, charity: Math.max(0, whole(scheduleA[14]) - creditGifts), federal: true };
  }
  const salesOrIncome = parts.generalSalesTax > 0 ? parts.generalSalesTax : parts.stateIncomeTaxes;
  const limit = saltCap(ctx, deductions);
  const salt = Math.min(salesOrIncome + parts.realEstateTaxes + parts.personalPropertyTaxes, limit.cap);
  const allowedCharity = Math.max(0, charity - creditGifts);
  return { total: parts.medicalPaid + salt + parts.mortgageInterest + allowedCharity + parts.otherItemized, medical: parts.medicalPaid, charity: allowedCharity, federal: false, saltCap: limit.cap, saltRule: limit.rule };
}

function donationCredits(rule, answers, status) {
  const key = status === 'mfj' ? 'mfj' : status === 'mfs' ? 'mfs' : 'single';
  const items = [
    { code: '321', id: 'qualifyingCharityGifts', label: 'Contributions to qualifying charitable organizations (Form 321)', cap: rule.qualifyingCharity[key] },
    { code: '352', id: 'fosterCareGifts', label: 'Contributions to qualifying foster care organizations (Form 352)', cap: rule.fosterCare[key] },
    { code: '322', id: 'publicSchoolFees', label: 'Contributions or fees paid to public schools (Form 322)', cap: rule.publicSchool[key] },
    { code: '323', id: 'privateSchoolTuitionGifts', label: 'Contributions to private school tuition organizations (Form 323)', cap: rule.privateSchoolTuition[key] },
  ];
  return items.map((item) => ({ ...item, paid: positive(answers[item.id]), credit: Math.min(positive(answers[item.id]), item.cap) })).filter((item) => item.credit > 0);
}

function applyInOrder(tax, list) {
  let left = tax;
  return list.map((item) => {
    const amount = Math.min(item.amount, left);
    left -= amount;
    return { ...item, amount };
  });
}

function compute(ctx, filing, reader) {
  const rate = reader.read('income-tax');
  const deductions = reader.read('deductions');
  const exemptions = reader.read('exemptions');
  const subtractions = reader.read('subtractions');
  const credits = reader.read('credits');
  const donations = reader.read('donation-credits');
  const otherStateRule = reader.read('other-state-credit');
  if (!rate || !deductions || !exemptions || !subtractions || !credits || !donations || !otherStateRule) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Arizona figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = statusOf(ctx);
  const residency = filing.residency;
  const checks = [...homeStateCreditCheck(filing, ['CA', 'IN', 'OR', 'VA'])];
  const federalAgi = income.agi;
  const boxes = dependentBoxes(ctx, answers);
  const box8 = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length;
  const box9 = ctx.filers.filter((item) => item.blind).length;
  const box40 = positive(answers.otherExemptions);
  const scheduleD = ctx.federal.schedules?.D || {};
  const netGain = whole(ctx.federal.lines['7']);
  const longTerm = scheduleD['15'] !== undefined ? whole(scheduleD['15']) : Math.max(0, netGain);
  const shortTerm = whole(scheduleD['7']);
  const after2011 = Math.max(0, Math.min(positive(answers.longTermGainAfter2011), longTerm, netGain));
  if (longTerm > 0 && answers.longTermGainAfter2011 === undefined) checks.push(check('warning', 'AZ_LONG_TERM_GAIN_DATES', 'Arizona subtracts 25% of net long-term capital gain on assets bought after 2011; none is subtracted until you say how much of your gain qualifies.', 'Answer the long-term gain question.'));
  const gainSubtraction = rateOf(after2011, subtractions.longTermGainBasisPoints);
  const pensionCap = subtractions.publicPensionPerPerson;
  const pension = Math.min(positive(answers.publicPensionTaxpayer), pensionCap) + (ctx.filingStatus === 'mfj' ? Math.min(positive(answers.publicPensionSpouse), pensionCap) : 0);
  const perBeneficiary = ctx.filingStatus === 'mfj' ? subtractions.college529PerBeneficiary.mfj : subtractions.college529PerBeneficiary.other;
  const college = Math.min(positive(answers.college529Contributions), positive(answers.college529Beneficiaries) * perBeneficiary);
  const able = Math.min(positive(answers.ableContributions), positive(answers.ableBeneficiaries) * perBeneficiary);
  if (positive(answers.college529Contributions) && !positive(answers.college529Beneficiaries)) checks.push(check('warning', 'AZ_529_BENEFICIARIES', 'The 529 subtraction is limited per beneficiary; give the number of beneficiaries.', 'Answer the 529 beneficiaries question.'));
  const militaryRetired = positive(answers.uniformedServicesRetirement);
  const activeMilitary = positive(answers.activeMilitaryPay);
  const otherSubtractions = positive(answers.otherSubtractions);
  const gifts = donationCredits(donations, answers, ctx.filingStatus);
  const charityGiftsForCredit = sum(gifts.filter((item) => item.code !== '322'), (item) => item.credit);
  const itemized = itemizedTotal(ctx, deductions, charityGiftsForCredit);
  const standard = byStatus(deductions.standardDeduction, status);
  const charityIncrease = rateOf(Math.max(0, ctx.itemized.charityCash + ctx.itemized.charityNonCash - charityGiftsForCredit), deductions.charitableIncreaseBasisPoints);
  const people = boxes.a + boxes.b + boxes.parents;
  const lines = {};
  const schedules = {};
  let azIncome;
  let taxable;
  let tax;
  let incomeRatio = 1;
  let creditIncome;
  let totalExemptions;
  let deductionUsed;
  let familyIncome;
  if (residency === 'full-year') {
    const line12 = federalAgi;
    const line14 = line12;
    const line15 = positive(answers.nonArizonaMunicipalInterest);
    const line19 = line14 + line15;
    const line28 = whole(income.usObligationInterest);
    const line30 = whole(income.socialSecurityTaxable);
    const line34c = college + able;
    const line35 = line19 - (gainSubtraction + line28 + pension + militaryRetired + line30 + activeMilitary + line34c);
    const line36 = otherSubtractions;
    const line37 = line35 - line36;
    const line38 = box8 * exemptions.age65;
    const line39 = box9 * exemptions.blind;
    const line40 = box40 * exemptions.other;
    const line41 = boxes.parents * exemptions.qualifyingParent;
    const line42 = Math.max(0, line37 - line38 - line39 - line40 - line41);
    const useItemized = itemized.total > standard + charityIncrease;
    const line43 = useItemized ? itemized.total : standard;
    const line44 = useItemized ? 0 : charityIncrease;
    const line45 = Math.max(0, line42 - line43 - line44);
    const line46 = rateOf(line45, rate.rateBasisPoints);
    Object.assign(lines, { '8': box8, '9': box9, '10a': boxes.a, '10b': boxes.b, '11a': boxes.parents, 12: line12, 13: 0, 14: line14, 15: line15, 19: line19, 20: netGain, 21: shortTerm, 22: longTerm, 23: after2011, 24: gainSubtraction, 28: line28, '29a': pension, '29b': militaryRetired, 30: line30, 32: activeMilitary, '34a': college, '34b': able, '34c': line34c, 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, '40E': box40, 40: line40, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46, 47: 0, 48: line46 });
    azIncome = line37;
    taxable = line45;
    tax = line46;
    creditIncome = line37;
    totalExemptions = line38 + line39 + line40 + line41;
    deductionUsed = useItemized ? 'itemized' : 'standard';
    familyIncome = line42 + totalExemptions;
  } else {
    const sourced = filing.sourced;
    const federalColumn = { 15: income.wages, 16: income.taxableInterest, 17: income.ordinaryDividends, 18: income.stateRefundTaxable, 19: income.businessIncome, 20: income.capitalGain, 21: 0, 22: income.iraTaxable + income.pensionTaxable + income.socialSecurityTaxable + income.unemployment + income.otherIncome };
    const azColumn = { 15: whole(sourced.wages), 16: whole(sourced.taxableInterest), 17: whole(sourced.ordinaryDividends), 18: residency === 'part-year' ? whole(sourced.stateRefundTaxable) : 0, 19: whole(sourced.businessIncome), 20: whole(sourced.capitalGain), 21: 0, 22: whole(sourced.iraTaxable) + whole(sourced.pensionTaxable) + whole(sourced.socialSecurityTaxable) + whole(sourced.unemployment) + whole(sourced.otherIncome) };
    const federal23 = sum(Object.values(federalColumn));
    const az23 = sum(Object.values(azColumn));
    const federal24 = whole(income.adjustments);
    const az24 = whole(sourced.adjustments);
    const line25 = federal23 - federal24;
    const line26 = az23 - az24;
    const line27 = line26 <= 0 ? 0 : ratio(line26, line25, { places: 3 });
    incomeRatio = line27;
    const azGainAfter2011 = Math.min(after2011, Math.max(0, azColumn[20]));
    const azGainSubtraction = rateOf(azGainAfter2011, subtractions.longTermGainBasisPoints);
    const usInterest = whole(sourced.usObligationInterest);
    for (const [key, value] of Object.entries(federalColumn)) lines[`${key}F`] = value;
    for (const [key, value] of Object.entries(azColumn)) lines[key] = value;
    Object.assign(lines, { '8': box8, '9': box9, '10a': boxes.a, '10b': boxes.b, '23F': federal23, 23: az23, '24F': federal24, 24: az24, 25: line25, 26: line26, 27: line27, 28: 0 });
    let exemptionTotal;
    if (residency === 'part-year') {
      const line29 = line26;
      const line32 = line29;
      const line37 = azGainSubtraction;
      const line39 = line32 - line37;
      const line41c = college + able;
      const line42 = usInterest;
      const line43 = whole(sourced.socialSecurityTaxable);
      const line44 = otherSubtractions + pension + militaryRetired + activeMilitary;
      const line45 = line39 - line41c - line42 - line43 - line44;
      const line46 = box8 * exemptions.age65;
      const line47 = box9 * exemptions.blind;
      const line48 = box40 * exemptions.other;
      const line49 = boxes.parents * exemptions.qualifyingParent;
      const line50 = line46 + line47 + line48 + line49;
      exemptionTotal = line50;
      Object.assign(lines, { 29: line29, 32: line32, 36: Math.max(0, azColumn[20]), 37: line37, 39: line39, '41a': college, '41b': able, '41c': line41c, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46, 47: line47, '48E': box40, 48: line48, '11a': boxes.parents, 49: line49, 50: line50 });
      const line51 = Math.round(line50 * line27);
      const line52 = Math.max(0, line45 - line51);
      const itemizedPY = Math.round(itemized.total * line27);
      const useItemized = itemizedPY > standard + charityIncrease;
      const line53 = useItemized ? itemizedPY : standard;
      const line54 = useItemized ? 0 : charityIncrease;
      const line55 = Math.max(0, line52 - line53 - line54);
      const line56 = rateOf(line55, rate.rateBasisPoints);
      Object.assign(lines, { 51: line51, 52: line52, 53: line53, 54: line54, 55: line55, 56: line56, 57: 0, 58: line56 });
      if (useItemized) checks.push(check('warning', 'AZ_PY_ITEMIZED', 'Part-year itemized deductions are those paid while an Arizona resident plus Arizona-source ones (Schedule A(PY)); MyCA prorates your itemized deductions by the Arizona income ratio.', 'Check the deductions paid while you lived in Arizona.'));
      azIncome = line45;
      taxable = line55;
      tax = line56;
      creditIncome = line52 + line51;
      familyIncome = line52 + line51;
      deductionUsed = useItemized ? 'itemized' : 'standard';
    } else {
      const line29 = line26;
      const line33 = line29;
      const line38 = azGainSubtraction;
      const line42 = line33 - line38;
      const line43 = usInterest;
      const line45 = otherSubtractions;
      const line46 = line42 - line43 - line45;
      const line47 = box8 * exemptions.age65;
      const line48 = box9 * exemptions.blind;
      const line49 = box40 * exemptions.other;
      const line50 = line47 + line48 + line49;
      exemptionTotal = line50;
      const line51 = Math.round(line50 * line27);
      const line52 = Math.max(0, line46 - line51);
      const itemizedNR = Math.round(itemized.total * line27);
      const standardNR = Math.round(standard * line27);
      const useItemized = itemizedNR > standardNR + charityIncrease;
      const line53 = useItemized ? itemizedNR : standardNR;
      const line54 = useItemized ? 0 : charityIncrease;
      const line55 = Math.max(0, line52 - line53 - line54);
      const line56 = rateOf(line55, rate.rateBasisPoints);
      Object.assign(lines, { 29: line29, 33: line33, 36: Math.max(0, azColumn[20]), 37: azGainAfter2011, 38: line38, 42: line42, 43: line43, 45: line45, 46: line46, 47: line47, 48: line48, '49E': box40, 49: line49, 50: line50, 51: line51, 52: line52, 53: line53, 54: line54, 55: line55, 56: line56, 57: 0, 58: line56 });
      if (line54) checks.push(check('info', 'AZ_NR_CHARITY_INCREASE', 'The 34% charitable increase to the standard deduction is taken in full; the Form 140NR instructions do not say to prorate it.'));
      azIncome = line46;
      taxable = line55;
      tax = line56;
      creditIncome = line52 + line51;
      familyIncome = 0;
      deductionUsed = useItemized ? 'itemized' : 'standard';
    }
    totalExemptions = exemptionTotal;
  }
  const dependent = dependentCredit(credits.dependent, boxes, federalAgi, status);
  const dependentAllowed = residency === 'full-year' ? dependent.credit : Math.round(dependent.credit * incomeRatio);
  const family = residency === 'nonresident' ? 0 : familyCredit(credits.family, people, status, familyIncome);
  const ordered = applyInOrder(tax, [
    { code: 'AZ_DEPENDENT', label: 'Dependent tax credit', amount: dependentAllowed },
    { code: 'AZ_FAMILY', label: 'Family income tax credit', amount: family },
    ...gifts.map((item) => ({ code: `AZ_${item.code}`, label: item.label, amount: item.credit })),
  ]);
  const beforeOtherState = tax - sum(ordered, (item) => item.amount);
  let otherStateCredit = 0;
  const form309 = [];
  if (residency === 'full-year' && filing.otherStates.length) {
    for (const other of filing.otherStates) {
      if (!otherStateRule.qualifyingStates.includes(other.state)) {
        checks.push(check('info', 'AZ_309_NOT_QUALIFYING', `Arizona gives no credit for tax on a nonresident return filed with ${other.state}; claim the credit for tax paid to Arizona on that state's return instead.`));
        continue;
      }
      const line8 = Math.min(positive(other.income), Math.max(0, creditIncome));
      const line10 = creditIncome > 0 ? ratio(line8, creditIncome, { places: 4 }) : 0;
      const line11 = Math.round(beforeOtherState * line10);
      const line17 = Math.min(line11, positive(other.tax));
      form309.push({ state: other.state, 6: line8, 7: beforeOtherState, 8: line8, 9: creditIncome, 10: line10, 11: line11, 12: positive(other.tax), 16: positive(other.tax), 17: line17 });
      otherStateCredit += line17;
    }
    otherStateCredit = Math.min(otherStateCredit, beforeOtherState);
  }
  const nonrefundable = [...ordered.filter((item) => item.amount > 0), ...(otherStateCredit ? [{ code: 'AZ_309', label: 'Tax paid to another state (Form 309)', amount: otherStateCredit }] : [])];
  const form301 = sum(ordered.slice(2), (item) => item.amount) + otherStateCredit;
  const balance = Math.max(0, tax - sum(nonrefundable, (item) => item.amount));
  const excise = residency === 'nonresident' ? 0 : exciseCredit(ctx, credits.excise, people, status, federalAgi);
  const lineKeys = residency === 'full-year' ? { dep: 49, fam: 50, c301: 51, bal: 52, wh: 53, est: '54c', ext: 55, excise: 56 } : residency === 'part-year' ? { dep: 59, fam: 60, c301: 61, bal: 62, wh: 63, est: '64c', ext: 65, excise: 66 } : { dep: 59, fam: null, c301: 60, bal: 61, wh: 62, est: '63c', ext: 64, excise: null };
  lines[lineKeys.dep] = ordered[0].amount;
  if (lineKeys.fam) lines[lineKeys.fam] = ordered[1].amount;
  lines[lineKeys.c301] = form301;
  lines[lineKeys.bal] = balance;
  lines[lineKeys.wh] = filing.payments.withheld;
  lines[lineKeys.est] = filing.payments.estimated;
  lines[lineKeys.ext] = filing.payments.extension;
  if (lineKeys.excise) lines[lineKeys.excise] = excise;
  schedules.dependentCredit = lineTable({ '1a': boxes.a, '1b': boxes.a * credits.dependent.under17, '2a': boxes.b, '2b': boxes.b * credits.dependent.other, 3: dependent.before, factor: dependent.factor, credit: dependent.credit, ratio: residency === 'full-year' ? 1 : incomeRatio, allowed: dependentAllowed });
  if (form301) schedules[301] = lineTable({ ...Object.fromEntries(gifts.map((item) => [item.code, item.credit])), 309: otherStateCredit, total: form301 });
  if (form309.length) schedules[309] = form309;
  schedules.deduction = lineTable({ used: deductionUsed, standard, itemized: itemized.total, charitableIncrease: charityIncrease, medicalAllowed: itemized.medical });
  if (status === 'hoh' && ctx.filingStatus === 'qss') checks.push(check('info', 'AZ_QSS_AS_HOH', 'Arizona has no qualifying surviving spouse status; a federal qualifying surviving spouse files as head of household.'));
  if (ctx.income.taxExemptInterest > 0 && answers.nonArizonaMunicipalInterest === undefined && residency === 'full-year') checks.push(check('warning', 'AZ_MUNICIPAL_INTEREST', 'Interest from non-Arizona municipal bonds is added back on line 15.', 'Answer the non-Arizona municipal interest question (0 if none).'));
  if (gifts.length) checks.push(check('info', 'AZ_301_CARRYFORWARD', 'Donation credits above your tax can be carried forward five years (Form 301); MyCA uses only this year\'s credit.'));
  if (box40 || boxes.parents) checks.push(check('info', 'AZ_EXEMPTION_DETAIL', 'List each person for the other exemption or the qualifying parent exemption on page 4 of the return.'));
  return {
    form: residency === 'full-year' ? '140' : residency === 'part-year' ? '140PY' : '140NR',
    lines: lineTable(lines),
    schedules,
    stateIncome: azIncome,
    taxableIncome: taxable,
    taxBeforeCredits: tax,
    nonrefundableCredits: nonrefundable,
    otherStateCredit,
    otherTaxes: [],
    totalTax: balance,
    refundableCredits: excise ? [{ code: 'AZ_EXCISE', label: 'Increased excise tax credit', amount: excise }] : [],
    checks,
    notes: [...(totalExemptions ? [`Exemptions for age 65, blind, other and qualifying parents total $${totalExemptions.toLocaleString('en-US')}${residency === 'full-year' ? '' : ' before proration'}.`] : []), ...(!itemized.federal && itemized.saltRule ? [`State and local taxes on the Arizona itemized deduction are limited to $${itemized.saltCap.toLocaleString('en-US')}, the federal limit for your income (IRC 164(b)(7), ${itemized.saltRule}).`] : [])],
  };
}

const BOXES = Object.freeze({
  8: 'Age 65 or over (you and/or spouse)',
  9: 'Blind (you and/or spouse)',
  '10a': 'Dependents under age 17',
  '10b': 'Dependents age 17 and over',
  '11a': 'Qualifying parents and grandparents',
});

const RESIDENT_LABELS = Object.freeze({
  ...BOXES,
  12: 'Federal adjusted gross income',
  13: 'Small business income (Form 140-SBI)',
  14: 'Modified federal adjusted gross income',
  15: 'Non-Arizona municipal interest',
  19: 'Subtotal of income and additions',
  20: 'Total net capital gain or (loss)',
  21: 'Total net short-term capital gain or (loss)',
  22: 'Total net long-term capital gain or (loss)',
  23: 'Net long-term capital gain from assets acquired after 2011',
  24: 'Long-term capital gain subtraction (25% of line 23)',
  28: 'Interest on U.S. obligations',
  '29a': 'Exclusion for federal, Arizona or local government pensions',
  '29b': 'Exclusion for uniformed services retired or retainer pay',
  30: 'Taxable U.S. Social Security or Railroad Retirement benefits',
  32: 'Pay for active service in the armed forces, reserves or guard',
  '34a': 'Contributions to 529 college savings plans',
  '34b': 'Contributions to 529A (ABLE) accounts',
  '34c': 'Total 529 and ABLE contributions',
  35: 'Income after subtractions on lines 24 through 34c',
  36: 'Other subtractions from income',
  37: 'Income after other subtractions',
  38: 'Exemption: age 65 or over',
  39: 'Exemption: blind',
  '40E': 'Number of other exemptions',
  40: 'Other exemptions',
  41: 'Exemption: qualifying parents and grandparents',
  42: 'Arizona adjusted gross income',
  43: 'Deductions (itemized or standard)',
  44: 'Charitable contributions increase to the standard deduction',
  45: 'Arizona taxable income',
  46: 'Tax',
  47: 'Tax from recapture of credits (Form 301)',
  48: 'Subtotal of tax',
  49: 'Dependent tax credit',
  50: 'Family income tax credit',
  51: 'Nonrefundable credits from Form 301',
  52: 'Balance of tax',
  53: 'Arizona income tax withheld',
  '54c': 'Arizona estimated tax payments',
  55: 'Arizona extension payment (Form 204)',
  56: 'Increased excise tax credit',
});

const INCOME_COLUMNS = Object.freeze({
  15: 'Wages, salaries, tips, etc.',
  16: 'Interest',
  17: 'Dividends',
  18: 'Arizona income tax refunds',
  19: 'Business income (or loss) from Schedule C',
  20: 'Gains (or losses) from federal Schedule D',
  21: 'Rents, royalties, partnerships, estates and trusts',
  22: 'Other income reported on your federal return',
  23: 'Total income',
  24: 'Other federal adjustments',
});

const columnLabels = () => ({
  ...Object.fromEntries(Object.entries(INCOME_COLUMNS).map(([key, text]) => [`${key}F`, `${text}, federal`])),
  ...Object.fromEntries(Object.entries(INCOME_COLUMNS).map(([key, text]) => [key, `${text}, Arizona`])),
});

const PART_YEAR_LABELS = Object.freeze({
  ...BOXES,
  ...columnLabels(),
  25: 'Federal adjusted gross income',
  26: 'Arizona gross income',
  27: 'Arizona income ratio',
  28: 'Small business income (Form 140PY-SBI)',
  29: 'Modified Arizona gross income',
  32: 'Subtotal of income and additions',
  36: 'Net long-term capital gain from assets acquired after 2011',
  37: 'Long-term capital gain subtraction (25% of line 36)',
  39: 'Income after capital gain subtractions',
  '41a': 'Contributions to 529 college savings plans',
  '41b': 'Contributions to 529A (ABLE) accounts',
  '41c': 'Total 529 and ABLE contributions',
  42: 'Interest on U.S. obligations',
  43: 'Social Security or Railroad Retirement benefits in Arizona income',
  44: 'Other subtractions from income',
  45: 'Income after subtractions',
  46: 'Exemption: age 65 or over',
  47: 'Exemption: blind',
  '48E': 'Number of other exemptions',
  48: 'Other exemptions',
  49: 'Exemption: qualifying parents and grandparents',
  50: 'Total exemptions',
  51: 'Exemptions multiplied by the Arizona income ratio',
  52: 'Arizona adjusted gross income',
  53: 'Deductions (itemized or standard)',
  54: 'Charitable contributions increase to the standard deduction',
  55: 'Arizona taxable income',
  56: 'Tax',
  57: 'Tax from recapture of credits (Form 301)',
  58: 'Subtotal of tax',
  59: 'Dependent tax credit',
  60: 'Family income tax credit',
  61: 'Nonrefundable credits from Form 301',
  62: 'Balance of tax',
  63: 'Arizona income tax withheld',
  '64c': 'Arizona estimated tax payments',
  65: 'Arizona extension payment (Form 204)',
  66: 'Increased excise tax credit',
});

const NONRESIDENT_LABELS = Object.freeze({
  ...BOXES,
  ...columnLabels(),
  25: 'Federal adjusted gross income',
  26: 'Arizona gross income',
  27: 'Arizona income ratio',
  28: 'Small business income (Form 140NR-SBI)',
  29: 'Modified Arizona gross income',
  33: 'Subtotal of income and additions',
  36: 'Total net long-term capital gain or (loss), Arizona column',
  37: 'Net long-term capital gain from assets acquired after 2011',
  38: 'Long-term capital gain subtraction (25% of line 37)',
  42: 'Income after capital gain subtractions',
  43: 'Interest on U.S. obligations',
  45: 'Other subtractions from income',
  46: 'Income after subtractions',
  47: 'Exemption: age 65 or over',
  48: 'Exemption: blind',
  '49E': 'Number of other exemptions',
  49: 'Other exemptions',
  50: 'Total exemptions',
  51: 'Exemptions multiplied by the Arizona ratio',
  52: 'Arizona adjusted gross income',
  53: 'Deductions (itemized or standard)',
  54: 'Charitable contributions increase to the standard deduction',
  55: 'Arizona taxable income',
  56: 'Tax',
  57: 'Tax from recapture of credits (Form 301)',
  58: 'Subtotal of tax',
  59: 'Dependent tax credit',
  60: 'Nonrefundable credits from Form 301',
  61: 'Balance of tax',
  62: 'Arizona income tax withheld',
  '63c': 'Arizona estimated tax payments',
  64: 'Arizona extension payment (Form 204)',
});

const labels = (taxYear, residency) => (residency === 'full-year' ? RESIDENT_LABELS : residency === 'part-year' ? PART_YEAR_LABELS : NONRESIDENT_LABELS);

export const STATE = Object.freeze({
  code: 'AZ',
  name: 'Arizona',
  built: true,
  forms: Object.freeze({ resident: '140', partYear: '140PY', nonresident: '140NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'nonArizonaMunicipalInterest', when: Object.freeze({ residency: ['full-year'], has: ['taxExemptInterest'] }), kind: 'amount', text: 'Tax-exempt interest from municipal bonds of states other than Arizona', help: 'Added to Arizona income on Form 140 line 15. Arizona bond interest is not added.' }),
    Object.freeze({ id: 'longTermGainAfter2011', when: Object.freeze({ has: ['capitalGains'] }), kind: 'amount', text: 'Net long-term capital gain from assets you acquired after December 31, 2011', help: 'Arizona subtracts 25% of it (line 23 and 24). Leave out gains on assets whose purchase date you cannot show.' }),
    Object.freeze({ id: 'publicPensionTaxpayer', when: Object.freeze({ residency: ['full-year', 'part-year'], has: ['retirementIncome'] }), kind: 'amount', text: 'Your taxable pension from the U.S. government or an Arizona state or local retirement plan', help: 'Up to $2,500 is subtracted on line 29a. Pensions from other states do not count.' }),
    Object.freeze({ id: 'publicPensionSpouse', when: Object.freeze({ residency: ['full-year', 'part-year'], filingStatus: ['mfj'], has: ['retirementIncome'] }), kind: 'amount', text: 'Your spouse\'s taxable pension from the U.S. government or an Arizona state or local retirement plan', help: 'Up to $2,500 each, joint returns only.' }),
    Object.freeze({ id: 'uniformedServicesRetirement', when: Object.freeze({ residency: ['full-year', 'part-year'], has: ['retirementIncome'] }), kind: 'amount', text: 'Retired or retainer pay of the uniformed services included in federal income', help: 'Subtracted in full on line 29b.' }),
    Object.freeze({ id: 'activeMilitaryPay', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Pay for active service in the armed forces, reserves or national guard included in federal income', help: 'Subtracted on line 32.' }),
    Object.freeze({ id: 'college529Contributions', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Contributions you made to any 529 college savings plan', help: 'Up to $2,000 per beneficiary ($4,000 joint) is subtracted on line 34a.' }),
    Object.freeze({ id: 'college529Beneficiaries', when: Object.freeze({ residency: ['full-year', 'part-year'], answer: { id: 'college529Contributions' } }), kind: 'count', text: 'Number of beneficiaries of those 529 contributions', help: 'Sets the per-beneficiary limit.' }),
    Object.freeze({ id: 'ableContributions', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Contributions you made to a 529A ABLE account', help: 'Up to $2,000 per beneficiary ($4,000 joint), line 34b.' }),
    Object.freeze({ id: 'ableBeneficiaries', when: Object.freeze({ residency: ['full-year', 'part-year'], answer: { id: 'ableContributions' } }), kind: 'count', text: 'Number of beneficiaries of those ABLE contributions', help: 'Sets the per-beneficiary limit.' }),
    Object.freeze({ id: 'otherSubtractions', kind: 'amount', text: 'Other Arizona subtractions (page 6 schedule), such as the Arizona Families Tax Rebate included in income, adoption expenses or long-term care premiums', help: 'Line 36 (line 44 on 140PY, line 45 on 140NR).' }),
    Object.freeze({ id: 'otherExemptions', kind: 'count', text: 'People aged 65 or over (not your dependents) whose Arizona nursing, assisted living, home health or medical costs over $800 you paid, plus stillborn children', help: '$2,300 each on line 40. Do not count anyone you list as a dependent.' }),
    Object.freeze({ id: 'qualifyingParents', when: Object.freeze({ has: ['dependents'] }), kind: 'count', text: 'How many of your dependents are parents or grandparents aged 65 or over who lived with you and whose costs you paid', help: '$10,000 each on line 41 instead of the dependent credit.' }),
    Object.freeze({ id: 'qualifyingCharityGifts', kind: 'amount', text: 'Cash given to qualifying charitable organizations (Form 321)', help: 'Credit up to $495 ($987 joint) for 2025.' }),
    Object.freeze({ id: 'fosterCareGifts', kind: 'amount', text: 'Cash given to qualifying foster care charitable organizations (Form 352)', help: 'Credit up to $618 ($1,234 joint) for 2025.' }),
    Object.freeze({ id: 'publicSchoolFees', kind: 'amount', text: 'Contributions or extracurricular fees paid to Arizona public schools (Form 322)', help: 'Credit up to $200 ($400 joint) for 2025.' }),
    Object.freeze({ id: 'privateSchoolTuitionGifts', kind: 'amount', text: 'Cash given to certified school tuition organizations (Form 323)', help: 'Credit up to $769 ($1,535 joint) for 2025. Form 348 switcher credit is not covered.' }),
  ]),
  labels,
  notCovered: Object.freeze(['Small business income election (Form 140-SBI)', 'Depreciation, partnership and fiduciary adjustments and the other additions on page 5', 'Property tax credit (Form 140PTC)', 'Form 348 switcher credit and Form 301 credits other than Forms 321, 322, 323, 352 and 309, and credit carryforwards', 'Credit for taxes paid to Arizona by nonresidents of California, Indiana, Oregon and Virginia', 'Arizona Schedule A adjustments for mortgage credit certificates and expenses tied to untaxed income', 'Voluntary gifts, the estimated payment penalty (Form 221) and late penalties']),
  compute,
});
