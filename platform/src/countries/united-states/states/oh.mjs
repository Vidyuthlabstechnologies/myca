import { whole, positive, sum, check, lineTable, yesNo } from '../state-kit.mjs';

const ADJUSTMENT_LINES = Object.freeze({
  2025: { nonOhioInterest: 1, nonQualified529: 4, totalAdditions: 12, businessDeduction: 13, reciprocityWages: 14, stateRefund: 15, socialSecurity: 16, railroad: 17, federalInterest: 26, uniformedRetirement: 34, contributions529: 37, educator: 39, disability: 42, survivor: 43, medical: 44, totalDeductions: 47 },
  2026: { nonOhioInterest: 1, nonQualified529: 4, totalAdditions: 13, businessDeduction: 16, reciprocityWages: 17, stateRefund: 18, socialSecurity: 19, railroad: 20, federalInterest: 29, uniformedRetirement: 37, contributions529: 40, educator: 42, disability: 45, survivor: 46, medical: 47, totalDeductions: 50 },
});

const CREDIT_LINES = Object.freeze({
  2025: { taxBefore: 1, retirement: 2, senior: 4, childCare: 6, displacedWorker: 7, campaign: 8, exemption: 9, subtotal: 10, afterFirst: 11, jointFiling: 12, earnedIncome: 13, homeSchool: 14, scholarship: 15, nonpublicTuition: 16, additional: 36, afterAdditional: 37, nonresident: 38, resident: 39, totalNonrefundable: 40, totalRefundable: 47 },
  2026: { taxBefore: 1, retirement: 2, senior: 4, childCare: 6, displacedWorker: 7, exemption: 8, subtotal: 9, afterFirst: 10, jointFiling: 11, earnedIncome: 12, homeSchool: 13, scholarship: 14, nonpublicTuition: 15, additional: 35, afterAdditional: 36, nonresident: 37, resident: 38, totalNonrefundable: 39, totalRefundable: 46 },
});

const truncate4 = (value) => Math.floor(value * 10000 + 1e-9) / 10000;
const bp = (amount, basisPoints) => Math.round((whole(amount) * basisPoints) / 10000);

export function ohioNonbusinessTax(amount, schedule) {
  const cents = positive(amount) * 100;
  let row = schedule[0];
  for (const band of schedule) if (cents > band.overCents) row = band;
  if (!row || (row.rateBp === 0 && row.baseCents === 0)) return 0;
  return Math.round((row.baseCents + ((cents - row.overCents) * row.rateBp) / 10000) / 100);
}

function exemptionPer(magi, rule) {
  if (magi >= rule.noExemptionFromMagi) return 0;
  const tier = rule.tiers.find((item) => item.magiUpTo === null || magi <= item.magiUpTo);
  return tier ? tier.amount : 0;
}

const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');

function retirementIncome(ctx, answers) {
  const forms = ctx.forms.filter((form) => form.kind === '1099-R' && !String(form.fields?.distributionCode || '').includes('1'));
  const gross = sum(forms, taxableOf);
  return Math.max(0, gross - positive(answers.uniformedServicesRetirement) - positive(answers.disabilityBenefits) - positive(answers.survivorBenefits) - positive(answers.retirementNotOnAccountOfRetirement));
}

function qualifyingIncomeOf(ctx, owner) {
  const of = (kind, pick) => sum(ctx.forms.filter((form) => form.kind === kind && ownerOf(form) === owner), pick);
  return of('W-2', (form) => positive(form.fields?.wages)) + of('1099-R', taxableOf) + of('1099-G', (form) => positive(form.fields?.unemployment));
}

function retirementCredit(amount, table) {
  let credit = 0;
  for (const row of table) if (amount > row.over) credit = row.credit;
  return credit;
}

function jointFilingCredit(ctx, magi, magiLessExemptions, taxLeft, rule, checks) {
  if (ctx.filingStatus !== 'mfj' || magi >= rule.magiBelow) return 0;
  const mine = qualifyingIncomeOf(ctx, 'taxpayer');
  const theirs = qualifyingIncomeOf(ctx, 'spouse');
  if (mine < rule.minimumQualifyingIncomeEach || theirs < rule.minimumQualifyingIncomeEach) return 0;
  const row = rule.table.find((item) => item.upTo === null || magiLessExemptions <= item.upTo);
  checks.push(check('info', 'OH_JOINT_FILING_STATEMENT', `The joint filing credit needs a statement listing each spouse's qualifying income (W-2 wages, retirement and unemployment): $${mine.toLocaleString('en-US')} and $${theirs.toLocaleString('en-US')}.`));
  return Math.min(rule.maximum, bp(taxLeft, row.basisPoints));
}

function nonresidentCredit(ctx, filing, context) {
  const { line3, adjustments, deductionsInOhio, businessDeduction, reciprocityWages, afterAdditional } = context;
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : 0;
  const line1B = Math.max(0, whole(sourced.wages) - reciprocityWages);
  const line2B = whole(sourced.capitalGain);
  const line3B = 0;
  const line4B = 0;
  const businessOhio = whole(sourced.businessIncome);
  const line5B = businessOhio > 0 ? Math.max(0, businessOhio - businessDeduction) : businessOhio;
  const line6B = 0;
  const line7B = partYear ? Math.round(adjustments * share) : 0;
  const line8B = partYear ? Math.round(deductionsInOhio * share) : 0;
  const line9 = line1B + line2B + line3B + line4B + line5B + line6B + line7B - line8B;
  const line10B = partYear ? Math.max(0, whole(sourced.taxableInterest) + whole(sourced.ordinaryDividends) - whole(sourced.usObligationInterest)) : 0;
  const line11B = partYear ? Math.max(0, whole(sourced.iraTaxable) + whole(sourced.pensionTaxable) - Math.round(context.retirementDeducted * share)) : 0;
  const line12B = partYear ? whole(sourced.unemployment) : 0;
  const line13B = partYear ? whole(sourced.otherIncome) : 0;
  const line14B = partYear ? whole(sourced.adjustments) : 0;
  const line15 = partYear ? line10B + line11B + line12B + line13B - line14B : 0;
  const line16 = line3;
  const line17 = Math.max(0, line9 + line15);
  const line18 = Math.max(0, line16 - line17);
  const line19 = line16 > 0 ? Math.min(1, truncate4(line18 / line16)) : 0;
  const line20 = Math.round(line19 * afterAdditional);
  return { credit: line20, ohioIncome: line17, schedule: lineTable({ '1B': line1B, '2B': line2B, '3B': line3B, '4B': line4B, '5B': line5B, '6B': line6B, '7B': line7B, '8B': line8B, 9: line9, ...(partYear ? { '10B': line10B, '11B': line11B, '12B': line12B, '13B': line13B, '14B': line14B, 15: line15 } : {}), 16: line16, 17: line17, 18: line18, 19: line19, 20: line20 }) };
}

function residentCredit(filing, line3, afterAdditional, nonresidentAmount) {
  const rows = filing.otherStates.filter((item) => item.tax > 0 && item.income > 0);
  if (!rows.length || filing.residency === 'nonresident') return null;
  const line1 = sum(rows, (item) => item.income);
  const line2 = sum(rows, (item) => item.tax);
  const line4 = line3 > 0 ? Math.min(1, truncate4(line1 / line3)) : 0;
  const line5 = Math.max(0, afterAdditional - nonresidentAmount);
  const line6 = Math.round(line4 * line5);
  const line7 = Math.min(line2, line6);
  return { credit: line7, schedule: lineTable({ ...Object.fromEntries(rows.map((item) => [`${item.state}A`, whole(item.income)])), ...Object.fromEntries(rows.map((item) => [`${item.state}B`, whole(item.tax)])), 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7 }) };
}

function compute(ctx, filing, reader) {
  const taxRule = reader.read('income-tax');
  const exemptionRule = reader.read('exemptions');
  const limits = reader.read('adjustments');
  const credits = reader.read('credits');
  const reciprocity = reader.read('us.state-return.reciprocity');
  if (!taxRule || !exemptionRule || !limits || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Ohio figures for ${ctx.taxYear}.` };
  const adjLine = ADJUSTMENT_LINES[ctx.taxYear];
  const creditLine = CREDIT_LINES[ctx.taxYear];
  if (!adjLine || !creditLine) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Ohio form layout for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const checks = [];
  const notes = [];
  const resident = filing.residency === 'full-year';
  const reciprocalHomes = reciprocity?.workStateExemptsResidentsOf?.OH || [];

  const ohioMuni = positive(answers.ohioObligationInterest);
  const nonOhioInterest = Math.max(0, income.taxExemptInterest - ohioMuni);
  if (income.taxExemptInterest > 0 && answers.ohioObligationInterest === undefined) checks.push(check('warning', 'OH_MUNI_INTEREST_SOURCE', `Your federally tax-exempt interest of $${income.taxExemptInterest.toLocaleString('en-US')} is added back in full as non-Ohio state and local interest; interest on Ohio bonds is not added.`, 'Give the part of your tax-exempt interest that came from Ohio obligations.'));
  const nonQualified529 = positive(answers.nonQualified529Withdrawals);
  const totalAdditions = nonOhioInterest + nonQualified529;

  const businessTotal = whole(income.businessIncome);
  const bus11 = Math.max(0, Math.min(businessTotal, income.agi));
  const bus12 = ctx.filingStatus === 'mfs' ? taxRule.businessDeductionCap.mfs : taxRule.businessDeductionCap.other;
  const bus13 = Math.min(bus11, bus12);

  const workState = ctx.homeState;
  const reciprocityWages = filing.residency === 'nonresident' && reciprocalHomes.includes(workState) ? whole(filing.sourced.wages) : positive(answers.reciprocityWages);
  const contributionsCap = limits.contribution529PerBeneficiary * positive(answers.beneficiaries529);
  const contributions529 = Math.min(positive(answers.contributions529), contributionsCap);
  if (positive(answers.contributions529) > contributionsCap) checks.push(check(positive(answers.beneficiaries529) ? 'info' : 'warning', 'OH_529_LIMIT', `Ohio deducts 529 contributions up to $${limits.contribution529PerBeneficiary.toLocaleString('en-US')} per beneficiary a year; the excess carries forward to later years.`, positive(answers.beneficiaries529) ? '' : 'Give the number of 529 beneficiaries you contributed for.'));
  const educator = Math.min(positive(answers.ohioEducatorExpenses), limits.educatorExpensePerEducator * Math.min(ctx.filers.length, Math.max(1, positive(answers.ohioEducators))));
  const medical1 = Math.max(0, positive(answers.medicalPremiumsNoEmployerPlan) - whole(income.adjustmentItems?.seHealth));
  const medical2 = positive(answers.longTermCarePremiums);
  const medical3 = positive(answers.medicalPremiumsOther);
  const medical4 = positive(answers.medicalCareExpenses);
  const medical5 = medical3 + medical4;
  const medical6 = Math.max(0, income.agi);
  const medical7 = bp(medical6, limits.medicalExpenseFloorBasisPoints);
  const medical8 = Math.max(0, medical5 - medical7);
  const medical9 = medical1 + medical2 + medical8;
  const deductionRows = {
    [adjLine.businessDeduction]: bus13,
    [adjLine.reciprocityWages]: reciprocityWages,
    [adjLine.stateRefund]: whole(income.stateRefundTaxable),
    [adjLine.socialSecurity]: whole(income.socialSecurityTaxable),
    [adjLine.railroad]: positive(answers.railroadBenefits),
    [adjLine.federalInterest]: whole(income.usObligationInterest),
    [adjLine.uniformedRetirement]: positive(answers.uniformedServicesRetirement),
    [adjLine.contributions529]: contributions529,
    [adjLine.educator]: educator,
    [adjLine.disability]: positive(answers.disabilityBenefits),
    [adjLine.survivor]: positive(answers.survivorBenefits),
    [adjLine.medical]: medical9,
  };
  const totalDeductions = sum(Object.values(deductionRows));
  const adjustments = lineTable({ [adjLine.nonOhioInterest]: nonOhioInterest, [adjLine.nonQualified529]: nonQualified529, [adjLine.totalAdditions]: totalAdditions, ...deductionRows, [adjLine.totalDeductions]: totalDeductions });

  const line1 = income.agi;
  const line2a = totalAdditions;
  const line2b = totalDeductions;
  const line3 = line1 + line2a - line2b;
  const magi = line3 + bus13;
  const exemptionCount = ctx.filers.filter((item) => !item.canBeClaimedAsDependent).length + ctx.dependents.length;
  const perExemption = exemptionPer(magi, exemptionRule);
  const line4 = exemptionCount * perExemption;
  if (magi >= exemptionRule.noExemptionFromMagi) checks.push(check('info', 'OH_NO_EXEMPTION_ABOVE_LIMIT', `Modified AGI is $${exemptionRule.noExemptionFromMagi.toLocaleString('en-US')} or more, so Ohio allows no personal or dependent exemption.`));
  const line5 = Math.max(0, line3 - line4);
  const bus14 = bus11 - bus13;
  const bus15 = bus11 > 0 && line5 > 0 ? Math.min(bus14, line5) : 0;
  const bus16 = bp(bus15, taxRule.businessRateBp);
  const line6 = bus15;
  const line7 = Math.max(0, line5 - line6);
  const line8a = ohioNonbusinessTax(line7, taxRule.nonbusinessSchedule);
  const line8b = bus16;
  const line8c = line8a + line8b;
  const magiLessExemptions = magi - line4;

  const retirementBase = retirementIncome(ctx, answers);
  const retirementAllowed = magiLessExemptions < credits.retirementAndSeniorLimitMagiLessExemptions && !yesNo(answers.priorLumpSumRetirementCredit);
  const c2 = retirementAllowed ? retirementCredit(retirementBase, credits.retirementIncomeCredit) : 0;
  const senior = ctx.filers.some((item) => item.age !== null && item.age >= credits.seniorAge);
  const c4 = senior && magiLessExemptions < credits.retirementAndSeniorLimitMagiLessExemptions && !yesNo(answers.priorLumpSumDistributionCredit) ? credits.seniorCredit : 0;
  const line9c = positive(answers.form2441Line9c);
  const line11of2441 = positive(answers.form2441Line11);
  const c6 = magi >= credits.childCareMagiLimit ? 0 : magi < credits.childCareFullCreditMagiBelow ? line9c : bp(line11of2441, credits.childCareBasisPoints);
  const displaced = (paid, last) => Math.max(0, Math.min(bp(paid, credits.displacedWorkerBasisPoints), credits.displacedWorkerMaximum) - positive(last));
  const c7 = displaced(answers.displacedWorkerTraining, answers.displacedWorkerCreditLastYear) + (ctx.filingStatus === 'mfj' ? displaced(answers.displacedWorkerTrainingSpouse, answers.displacedWorkerCreditLastYearSpouse) : 0);
  const c8 = credits.campaignContribution ? Math.min(positive(answers.campaignContributions), ctx.filingStatus === 'mfj' ? credits.campaignContribution.joint : credits.campaignContribution.other) : 0;
  const cExemption = magiLessExemptions < credits.exemptionCreditMagiLessExemptionsBelow ? exemptionCount * credits.exemptionCreditPerExemption : 0;
  const firstCredits = c2 + c4 + c6 + c7 + c8 + cExemption;
  const afterFirst = Math.max(0, line8c - firstCredits);
  const cJoint = jointFilingCredit(ctx, magi, magiLessExemptions, afterFirst, credits.jointFiling, checks);
  const federalEic = whole(ctx.federal.lines['27']);
  const cEic = bp(federalEic, credits.eitcBasisPoints);
  const cHome = Math.min(positive(answers.homeSchoolExpenses), credits.homeSchoolPerStudent * positive(answers.homeSchoolStudents));
  const cScholarship = Math.min(positive(answers.scholarshipDonation), credits.scholarshipDonationPerPerson) + (ctx.filingStatus === 'mfj' ? Math.min(positive(answers.scholarshipDonationSpouse), credits.scholarshipDonationPerPerson) : 0);
  const cTuition = Math.min(positive(answers.nonpublicTuition), income.agi < credits.nonpublicTuition.federalAgiBelow ? credits.nonpublicTuition.lower : credits.nonpublicTuition.higher);
  const additional = cJoint + cEic + cHome + cScholarship + cTuition;
  const afterAdditional = Math.max(0, afterFirst - additional);

  let nr = null;
  if (!resident) nr = nonresidentCredit(ctx, filing, { line3, adjustments: totalAdditions, deductionsInOhio: contributions529 + educator + medical9, businessDeduction: bus13, reciprocityWages, afterAdditional, retirementDeducted: positive(answers.uniformedServicesRetirement) + positive(answers.disabilityBenefits) + positive(answers.survivorBenefits) });
  const cNonresident = nr ? nr.credit : 0;
  const rc = residentCredit(filing, line3, afterAdditional, cNonresident);
  const cResident = rc ? rc.credit : 0;
  const totalNonrefundable = firstCredits + additional + cNonresident + cResident;
  const line9 = totalNonrefundable;
  const line10 = Math.max(0, line8c - line9);
  const line11 = 0;
  const line12 = positive(answers.useTax);
  const line13 = line10 + line11 + line12;
  const line14 = filing.payments.withheld;
  const line15 = filing.payments.estimated + filing.payments.extension;
  const line16 = 0;
  const line17 = line14 + line15 + line16;
  const line19 = line17;
  const line20 = Math.max(0, line13 - line19);
  const line23 = Math.max(0, line19 - line13);

  const creditRows = lineTable({
    [creditLine.taxBefore]: line8c,
    [creditLine.retirement]: c2,
    [creditLine.senior]: c4,
    [creditLine.childCare]: c6,
    [creditLine.displacedWorker]: c7,
    ...(creditLine.campaign ? { [creditLine.campaign]: c8 } : {}),
    [creditLine.exemption]: cExemption,
    [creditLine.subtotal]: firstCredits,
    [creditLine.afterFirst]: afterFirst,
    [creditLine.jointFiling]: cJoint,
    [creditLine.earnedIncome]: cEic,
    [creditLine.homeSchool]: cHome,
    [creditLine.scholarship]: cScholarship,
    [creditLine.nonpublicTuition]: cTuition,
    [creditLine.additional]: additional,
    [creditLine.afterAdditional]: afterAdditional,
    [creditLine.nonresident]: cNonresident,
    [creditLine.resident]: cResident,
    [creditLine.totalNonrefundable]: totalNonrefundable,
    [creditLine.totalRefundable]: 0,
  });

  const district = String(answers.schoolDistrictNumber || '').trim();
  if (filing.residency !== 'nonresident' && !/^\d{4}$/.test(district)) checks.push(check('warning', 'OH_SCHOOL_DISTRICT_NUMBER', 'The IT 1040 asks for the four-digit number of the school district you lived in for most of the year.', 'Give your school district number (tax.ohio.gov/Finder).'));
  checks.push(check('info', 'OH_SD100_AND_MUNICIPAL', 'Ohio school district income tax (SD 100) and city income taxes are separate returns that MyCA does not prepare. If your school district levies an income tax, file the SD 100 by the same date.'));
  if (answers.useTax === undefined) checks.push(check('info', 'OH_USE_TAX', 'Ohio use tax is owed on out-of-state or online purchases with no Ohio sales tax; enter it if any.'));
  if (federalEic && cEic > Math.max(0, afterFirst - cJoint)) notes.push('The Ohio earned income credit is nonrefundable: only the part up to the tax left after the earlier credits is used.');
  if (positive(answers.form2441Line9c) || positive(answers.form2441Line11)) notes.push('The child and dependent care credit uses the Form 2441 amounts you gave; MyCA does not prepare Form 2441.');
  if (businessTotal > 0) notes.push(`Schedule C profit is treated as Ohio business income: the first $${bus12.toLocaleString('en-US')} is deducted and the rest is taxed at ${taxRule.businessRateBp / 100}%.`);
  if (!resident && filing.residency === 'part-year') notes.push('As a part-year resident, the whole year is taxed on the IT 1040 and the IT NRC credit removes the tax on income earned or received while a nonresident.');
  const stateIncome = resident ? line3 : nr.ohioIncome;
  const lines = lineTable({ 1: line1, '2a': line2a, '2b': line2b, 3: line3, 4: line4, exemptions: exemptionCount, 5: line5, 6: line6, 7: line7, '7a': line7, '8a': line8a, '8b': line8b, '8c': line8c, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 19: line19, 20: line20, 22: line20, 23: line23, 26: line23 });
  return {
    form: 'IT 1040',
    lines,
    schedules: {
      Adjustments: adjustments,
      ...(businessTotal ? { BUS: lineTable({ 2: businessTotal, 10: businessTotal, 11: bus11, 12: bus12, 13: bus13, 14: bus14, 15: bus15, 16: bus16 }) } : {}),
      Credits: creditRows,
      MAGI: lineTable({ 1: line3, 2: bus13, 3: magi, 4: line4, 5: magiLessExemptions }),
      ...(medical9 ? { MedicalWorksheet: lineTable({ 1: medical1, 2: medical2, 3: medical3, 4: medical4, 5: medical5, 6: medical6, 7: medical7, 8: medical8, 9: medical9 }) } : {}),
      ...(nr ? { 'IT NRC': nr.schedule } : {}),
      ...(rc ? { 'IT RC': rc.schedule } : {}),
      ...(district ? { SchoolDistrict: { number: district } } : {}),
    },
    stateIncome,
    taxableIncome: line5,
    taxBeforeCredits: line8c,
    nonrefundableCredits: [
      ...(c2 ? [{ code: 'OH_RETIREMENT_INCOME', label: 'Retirement income credit', amount: c2 }] : []),
      ...(c4 ? [{ code: 'OH_SENIOR', label: 'Senior citizen credit', amount: c4 }] : []),
      ...(c6 ? [{ code: 'OH_CHILD_CARE', label: 'Child and dependent care credit', amount: c6 }] : []),
      ...(c7 ? [{ code: 'OH_DISPLACED_WORKER', label: 'Displaced worker training credit', amount: c7 }] : []),
      ...(c8 ? [{ code: 'OH_CAMPAIGN', label: 'Campaign contribution credit', amount: c8 }] : []),
      ...(cExemption ? [{ code: 'OH_EXEMPTION_CREDIT', label: 'Exemption credit', amount: cExemption }] : []),
      ...(cJoint ? [{ code: 'OH_JOINT_FILING', label: 'Joint filing credit', amount: cJoint }] : []),
      ...(cEic ? [{ code: 'OH_EIC', label: 'Ohio earned income credit (nonrefundable)', amount: cEic }] : []),
      ...(cHome ? [{ code: 'OH_HOME_SCHOOL', label: 'Home school expenses credit', amount: cHome }] : []),
      ...(cScholarship ? [{ code: 'OH_SCHOLARSHIP', label: 'Scholarship donation credit', amount: cScholarship }] : []),
      ...(cTuition ? [{ code: 'OH_NONPUBLIC_TUITION', label: 'Nonchartered nonpublic school tuition credit', amount: cTuition }] : []),
      ...(cNonresident ? [{ code: 'OH_IT_NRC', label: 'Nonresident credit (IT NRC)', amount: cNonresident }] : []),
      ...(cResident ? [{ code: 'OH_IT_RC', label: 'Resident credit for tax paid to another state (IT RC)', amount: cResident }] : []),
    ],
    otherStateCredit: cResident,
    otherTaxes: line12 ? [{ code: 'OH_USE_TAX', label: 'Unpaid use tax', amount: line12 }] : [],
    totalTax: line13,
    refundableCredits: [],
    checks,
    notes,
  };
}

const q = (id, kind, text, help, extra = {}) => Object.freeze({ id, kind, text, help, ...extra });

export const STATE = Object.freeze({
  code: 'OH',
  name: 'Ohio',
  built: true,
  forms: Object.freeze({ resident: 'IT 1040', partYear: 'IT 1040 with IT NRC', nonresident: 'IT 1040 with IT NRC' }),
  questions: Object.freeze([
    q('schoolDistrictNumber', 'text', 'Four-digit Ohio school district number where you lived for most of the year', 'Find it at tax.ohio.gov/Finder. Full-year nonresidents use 9999. Needed on the IT 1040 and for the separate SD 100.'),
    q('ohioObligationInterest', 'amount', 'Part of your federally tax-exempt interest that came from Ohio state or local bonds', 'Tax-exempt interest from other states\' bonds is added back on the Schedule of Adjustments; Ohio bond interest is not. Enter 0 if none.'),
    q('nonQualified529Withdrawals', 'amount', '529 plan withdrawals not used for qualified education costs and not in federal AGI, that you deducted on an earlier Ohio return', 'Added back on the Schedule of Adjustments (line 4).'),
    q('contributions529', 'amount', 'Contributions you made in the year to 529 savings plans (plus earlier excess carried forward)', 'Ohio deducts up to $4,000 per beneficiary a year; the excess carries forward.'),
    q('beneficiaries529', 'count', 'Number of 529 beneficiaries you contributed for', 'Sets the $4,000-per-beneficiary limit.'),
    q('railroadBenefits', 'amount', 'Railroad retirement, disability or unemployment benefits in federal AGI that are not in taxable Social Security', 'Deducted on the Schedule of Adjustments.'),
    q('uniformedServicesRetirement', 'amount', 'Military or other uniformed services retirement pay (or survivor benefit plan payments) included in federal AGI', 'Deducted in full; it does not count for the retirement income credit.'),
    q('ohioEducatorExpenses', 'amount', 'Classroom expenses of an Ohio K-12 educator (900 hours or more) not deducted on the federal return', 'Deducted up to $300 per qualifying educator.'),
    q('ohioEducators', 'count', 'Number of qualifying Ohio educators on the return (1 or 2)', 'Each educator has a $300 limit.'),
    q('disabilityBenefits', 'amount', 'Disability benefits (from a disability plan, not sick pay or converted retirement) included in federal AGI', 'Deducted on the Schedule of Adjustments.'),
    q('survivorBenefits', 'amount', 'Survivor benefits received because of someone\'s death that are included in federal AGI', 'Deducted on the Schedule of Adjustments.'),
    q('medicalPremiumsNoEmployerPlan', 'amount', 'Health, dental and vision insurance premiums you paid while not eligible for Medicare or an employer plan', 'Unreimbursed medical worksheet line 1; not paid with pre-tax money. MyCA subtracts your federal self-employed health insurance deduction.'),
    q('longTermCarePremiums', 'amount', 'Long-term care insurance premiums you paid', 'Unreimbursed medical worksheet line 2.'),
    q('medicalPremiumsOther', 'amount', 'Health, dental and vision premiums you paid while eligible for Medicare or an employer plan', 'Unreimbursed medical worksheet line 3; only the part of these and other medical costs above 7.5% of federal AGI is deducted.'),
    q('medicalCareExpenses', 'amount', 'Other unreimbursed medical care costs (prescriptions, copays, doctor visits, glasses)', 'Unreimbursed medical worksheet line 4.'),
    q('reciprocityWages', 'amount', 'Wages earned in Ohio while you lived in Indiana, Kentucky, Michigan, Pennsylvania or West Virginia (part-year residents)', 'Deducted on the Schedule of Adjustments. For a full-year resident of those states MyCA deducts your Ohio wages itself.'),
    q('retirementNotOnAccountOfRetirement', 'amount', 'Part of your pension or IRA income not received on account of retirement (other than early distributions coded 1)', 'Left out of the retirement income credit.'),
    q('priorLumpSumRetirementCredit', 'yesno', 'Have you ever claimed the Ohio lump sum retirement credit?', 'If yes, the retirement income credit is not allowed.'),
    q('priorLumpSumDistributionCredit', 'yesno', 'Have you ever claimed the Ohio lump sum distribution credit?', 'If yes, the $50 senior citizen credit is not allowed.'),
    q('form2441Line9c', 'amount', 'Federal Form 2441, line 9c (child and dependent care credit)', 'Used only if your modified AGI is under $20,000.'),
    q('form2441Line11', 'amount', 'Federal Form 2441, line 11 (credit allowed)', 'Ohio gives 25% of it if your modified AGI is $20,000 to $39,999.'),
    q('displacedWorkerTraining', 'amount', 'Job training you paid for in the 12 months after losing your job to a closing, move or abolished position (less reimbursements)', 'Credit of 50% up to $500 if you work no more than 20 hours a week.'),
    q('displacedWorkerCreditLastYear', 'amount', 'Displaced worker training credit you claimed last year', 'The $500 limit covers both years of the 12-month period.'),
    q('displacedWorkerTrainingSpouse', 'amount', 'Your spouse\'s displaced worker job training cost', 'Joint returns only.'),
    q('displacedWorkerCreditLastYearSpouse', 'amount', 'Displaced worker training credit your spouse claimed last year', 'Joint returns only.'),
    q('campaignContributions', 'amount', 'Contributions to campaigns for Ohio statewide office or the General Assembly (2025 only)', 'Credit up to $50, or $100 on a joint return; repealed from 2026.'),
    q('homeSchoolExpenses', 'amount', 'Educational expenses for children home schooled in Ohio (books, supplies, software; not devices)', 'Credit up to $250 per qualifying student.'),
    q('homeSchoolStudents', 'count', 'Number of home-schooled students', ''),
    q('scholarshipDonation', 'amount', 'Your donations to an Ohio scholarship granting organization', 'Credit up to $750.'),
    q('scholarshipDonationSpouse', 'amount', 'Your spouse\'s donations to an Ohio scholarship granting organization', 'Joint returns only; up to $750.'),
    q('nonpublicTuition', 'amount', 'Tuition paid to an approved Ohio nonchartered, nonpublic school', 'Credit up to $1,000 (federal AGI under $50,000) or $1,500.'),
    q('useTax', 'amount', 'Ohio use tax owed on online or out-of-state purchases with no Ohio sales tax', 'Use the county rate worksheet in the instructions. Enter 0 if none.'),
  ]),
  notCovered: Object.freeze([
    'School district income tax (SD 100) and municipal income taxes, which are separate returns',
    'Schedule of Adjustments lines not asked about: pass-through entity add-backs, 168(k) and 179 depreciation add-backs and deductions, Ohio public obligation gains and losses, medical savings accounts, STABLE, Homebuyer Plus, individual development accounts, adoption and college grants, military pay, National Guard benefits, organ donor expenses, pregnancy resource center, East Palestine payments, the 2026 qualifying capital gains and venture capital deductions, and federal conformity adjustments',
    'Business income other than Schedule C profit (partnership, S corporation, Schedule E and 4797 business income), and IT NRC Sections II and III apportionment for a business',
    'Lump sum retirement and lump sum distribution credits, and the certificate-based credits (job retention, enterprise zone, InvestOhio, historic preservation, housing, venture capital and similar)',
    'Pass-through entity credit (Ohio IT K-1) and other refundable credits',
    'Interest penalty on underpayment of estimated tax (IT/SD 2210) and late payment interest',
    'A joint return where one spouse is a full-year resident and the other is not',
  ]),
  compute,
});
