import { rules } from './sprint-load.mjs';
import { careQualifyingPersons, dependentCareBenefits, dependentCareCredit, deemedEarnedIncome } from './us-form-2441.mjs';
import { computeForm8962 } from './us-form-8962.mjs';
import { computeForm8880, electiveDeferrals } from './us-form-8880.mjs';
import { energyItemsFor, homeImprovementCredit, cleanEnergyTentative, cleanEnergyCredit } from './us-form-5695.mjs';
import { computeForm8889, hsaContributionLimit, hsaMonthsOf } from './us-form-8889.mjs';
import { allocateQbiAdjustments, computeForm8995 } from './us-form-8995.mjs';
import { computeScheduleE, RENTAL_ENTRY_KIND } from './us-form-schedule-e.mjs';
import { computeForm8606 } from './us-form-8606.mjs';
import { computeForm5329 } from './us-form-5329.mjs';

export const FILING_STATUSES = Object.freeze(['single', 'mfj', 'mfs', 'hoh', 'qss']);
export const SUPPORTED_YEARS = Object.freeze(['2025', '2026']);
export const FORM_KINDS = Object.freeze(['W-2', '1099-INT', '1099-DIV', '1099-B', '1099-NEC', '1099-MISC', '1099-G', '1099-R', 'SSA-1099', '1098', '1098-E', '1098-T', '1095-A', '1099-SA', '5498-SA', '5498', '2441-PROVIDER', '5695-ITEM']);
export const US_ENTRY_KINDS = Object.freeze([RENTAL_ENTRY_KIND]);
export const US_INPUT_KINDS = Object.freeze([...FORM_KINDS, ...US_ENTRY_KINDS]);
const LONG_STATUS = Object.freeze({ single: 'single', mfj: 'married_joint', mfs: 'married_separate', hoh: 'head_of_household', qss: 'single' });
const STATUS_LABEL = Object.freeze({ single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately', hoh: 'Head of household', qss: 'Qualifying surviving spouse' });
const CHILD_RELATIONSHIPS = new Set(['son', 'daughter', 'stepchild', 'foster_child', 'brother', 'sister', 'half_brother', 'half_sister', 'stepbrother', 'stepsister', 'grandchild', 'niece', 'nephew', 'sibling', 'niece_nephew']);
const FORM_REASONS = Object.freeze({ 'Schedule K-1': 'Partnership, S corporation, estate and trust income (Schedule E Parts II and III)', 'Real estate professional': 'Rental losses of a real estate professional', 'Pub 527': 'Vacation home used as a home (rental expense limit)', 'Short-term rental': 'Rental with an average stay of 7 days or less', 6198: 'At-risk limits on a rental loss', 4797: 'Sale of rental or business property', 8962: 'Marketplace health coverage (premium tax credit)', '8995-A': 'Qualified business income above the threshold', 2210: 'Possible estimated tax penalty', 1116: 'Foreign tax credit above the amount claimable without Form 1116', 5329: 'Additional taxes on retirement and other tax-favored accounts that MyCA does not figure, including the 6% tax on HSA excess contributions', 8606: 'A spouse\'s nondeductible IRA basis and Roth IRA distributions', '8915-F': 'Spreading a qualified disaster distribution over three years', 8283: 'Non-cash charitable gifts over $500', 8853: 'Archer MSA or Medicare Advantage MSA distributions', 'Pub. 936 worksheet': 'Mortgage interest on debt above the acquisition debt limit', 'Section 68 limit': 'Itemized deductions reduced for the 37% bracket from 2026', 'Section 1341 claim': 'Social Security repaid above the benefits by more than the claim-of-right threshold' });
export const US_FORMS_SUPPORTED = Object.freeze(['1040', 'Schedule 1', 'Schedule 1-A', 'Schedule 2', 'Schedule 3', 'Schedule A', 'Schedule B', 'Schedule C', 'Schedule D', 'Schedule E', 'Schedule SE', 'Schedule EIC', '2441', '4562', '5329', '5695', '8582', '8606', '8812', '8863', '8880', '8949', '8889', '8959', '8960', '8962', '8995']);
export const US_FORMS_COMING = Object.freeze(['8995-A', '2210', '1116', '8283']);
const NOT_COVERED = Object.freeze([
  'Alternative minimum tax (Form 6251)',
  'Partnership, S corporation, estate and trust income (Schedule E Parts II to V, Schedule K-1), real estate professionals, the vacation home expense limit (Pub. 527) and at-risk limits (Form 6198)',
  'Sale of business or rental property (Form 4797), and depreciation other than straight-line MACRS on rental buildings entered as a rental property (Form 4562)',
  'Unrecaptured section 1250 gain and collectibles (Schedule D tax worksheet)',
  'Form 8880: AGI refigured for excluded foreign, Puerto Rico or American Samoa income, a spouse\'s distribution from a year you did not file jointly (counted in both columns), and the credit for the elderly or disabled (Schedule 3 line 6d) in the credit limit',
  'Form 5695: joint occupants and condominium or cooperative shares (lines 7c, 32a and 32b), fuel cell property in two main homes, the panelboard safe harbor for property installed in 2024, and subsidies that reduce the cost (enter the cost after them)',
  'Form 2441: prior-year care expenses paid this year (line 9b), dependent care benefits from your own business (lines 22 and 24) and a plan limit below the legal maximum (line 21)',
  'IRA deduction worksheet: the deductible amount is taken as entered',
  'HSA: qualified HSA funding distributions from an IRA (Form 8889 lines 10 and 19), Archer and Medicare Advantage MSAs (Form 8853), the Line 3 worksheet when the coverage type changed during the year, and the Form 5329 tax on excess contributions',
  'Premium tax credit shared-policy allocation and the alternative calculation for the year of marriage (Form 8962 Parts IV and V)',
  'Household employment taxes (Schedule H)',
  'Form 5329 Parts II and V to VIII (education, ABLE, Coverdell, Archer MSA and HSA accounts) and the Roth conversion recapture amount on line 1',
  'Form 8606 for a spouse, and spreading qualified disaster distributions (Form 8915-F)',
  'Qualified business income above the threshold (Form 8995-A)',
  'Estimated tax penalty (Form 2210)',
  'State returns',
]);

const dollars = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const positive = (value) => Math.max(0, dollars(value));
const floorDiv = (amount, step) => Math.floor(amount / step);
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);
const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const sum = (items, pick = (item) => item) => items.reduce((total, item) => total + dollars(pick(item)), 0);
const joint = (status) => status === 'mfj';
const jointOr = (value, status) => (joint(status) ? value.mfj : value.other);
const bracketKey = (status) => (status === 'qss' ? 'mfj' : status);

function birthParts(dateOfBirth) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOfBirth || ''));
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

export function ageAtYearEnd(dateOfBirth, taxYear, { dayBefore = false } = {}) {
  const birth = birthParts(dateOfBirth);
  if (!birth) return null;
  const age = Number(taxYear) - birth.year;
  return dayBefore && birth.month === 1 && birth.day === 1 ? age + 1 : age;
}

function ruleReader(taxYear) {
  const used = new Map();
  const missing = [];
  const onDate = `${taxYear}-12-31`;
  const read = (id) => {
    const found = rules.rule(id, onDate);
    if (!found.ok) {
      missing.push(id);
      return null;
    }
    used.set(id, found.record);
    return found.value;
  };
  return { read, used, missing };
}

function taxOnOrdinary(taxable, bands) {
  let tax = 0;
  const income = Math.max(0, taxable);
  for (const band of bands) {
    const from = band.fromCents / 100;
    const to = band.toCents === null ? Infinity : band.toCents / 100;
    if (income <= from) break;
    tax += ((Math.min(income, to) - from) * band.basisPoints) / 10000;
  }
  return tax;
}

export function tableMidpoint(taxable) {
  if (taxable < 5) return 0;
  if (taxable < 15) return 10;
  if (taxable < 25) return 20;
  if (taxable < 3000) return Math.floor(taxable / 25) * 25 + 12.5;
  return Math.floor(taxable / 50) * 50 + 25;
}

export function regularTax(taxable, bands) {
  const income = Math.max(0, dollars(taxable));
  if (income < 100000) return Math.round(taxOnOrdinary(tableMidpoint(income), bands));
  return Math.round(taxOnOrdinary(income, bands));
}

function qualifiedDividendsWorksheet({ taxable, qualifiedDividends, netCapitalGain, status, bands, capitalGains }) {
  const line1 = Math.max(0, taxable);
  const line4 = qualifiedDividends + netCapitalGain;
  const line5 = Math.max(0, line1 - line4);
  const line6 = fromCents(capitalGains.zeroRateMaxCents[status]);
  const line7 = Math.min(line1, line6);
  const line8 = Math.min(line5, line7);
  const line9 = line7 - line8;
  const line10 = Math.min(line1, line4);
  const line12 = line10 - line9;
  const line13 = fromCents(capitalGains.fifteenRateMaxCents[status]);
  const line14 = Math.min(line1, line13);
  const line16 = Math.max(0, line14 - (line5 + line9));
  const line17 = Math.min(line12, line16);
  const line18 = Math.round((line17 * capitalGains.middleBasisPoints) / 10000);
  const line20 = line10 - (line9 + line17);
  const line21 = Math.round((line20 * capitalGains.highBasisPoints) / 10000);
  const line22 = regularTax(line5, bands);
  const line24 = regularTax(line1, bands);
  const tax = Math.min(line18 + line21 + line22, line24);
  return { tax, zeroRateAmount: line9, fifteenRateAmount: line17, twentyRateAmount: line20, ordinaryPart: line5, worksheet: { 1: line1, 2: qualifiedDividends, 3: netCapitalGain, 4: line4, 5: line5, 9: line9, 17: line17, 18: line18, 20: line20, 21: line21, 22: line22, 24: line24, 25: tax } };
}

function phaseOutFraction(magi, range) {
  const from = range.from / 100;
  const to = range.to / 100;
  if (magi <= from) return 1;
  if (magi >= to) return 0;
  return Math.round(((to - magi) / (to - from)) * 1000) / 1000;
}

function eitcAt(amount, row, start, band) {
  if (amount <= 0) return 0;
  const point = Math.floor(amount / band) * band + band / 2;
  const earnedCap = row.earnedIncomeAmountCents / 100;
  const credit = (Math.min(point, earnedCap) * row.creditBasisPoints) / 10000;
  const maximum = Math.round((earnedCap * row.creditBasisPoints) / 10000);
  const reduced = point > start ? Math.min(credit, maximum - ((point - start) * row.phaseOutBasisPoints) / 10000) : credit;
  return Math.max(0, Math.round(reduced));
}

function formsOf(input, kind) {
  return (input.forms || []).filter((form) => form.kind === kind);
}

function field(form, name) {
  return positive(form.fields?.[name]);
}

function negativeFields(form) {
  const values = form.fields && typeof form.fields === 'object' ? form.fields : {};
  const rows = Array.isArray(values.transactions) ? [values, ...values.transactions] : [values];
  return rows.flatMap((row) => Object.entries(row || {}).filter(([key, value]) => !(form.kind === 'SSA-1099' && key === 'netBenefits') && typeof value !== 'boolean' && value !== '' && value !== null && Number.isFinite(Number(value)) && Number(value) < 0 && !Array.isArray(value)).map(([key]) => key));
}

export function dependentFlags(dependent, taxYear) {
  const age = ageAtYearEnd(dependent.dateOfBirth, taxYear);
  const months = Number(dependent.months ?? 12);
  const childRelation = CHILD_RELATIONSHIPS.has(String(dependent.relationship || ''));
  const lived = months > 6 || Boolean(dependent.bornOrDiedInYear);
  if (age !== null && age < 0) return { age, qualifyingChild: false, ctcEligible: false, odcEligible: false, eitcChild: false, bornAfterYear: true };
  const ssnValid = dependent.ssnValid !== false;
  const qualifyingChild = childRelation && lived && age !== null && (age < 19 || (age < 24 && Boolean(dependent.student)) || Boolean(dependent.disabled));
  const ctcEligible = qualifyingChild && age < 17 && ssnValid;
  return { age, qualifyingChild, ctcEligible, odcEligible: !ctcEligible, eitcChild: qualifyingChild && ssnValid };
}

function capitalTransactions(input) {
  const rows = [];
  for (const form of formsOf(input, '1099-B')) {
    const list = Array.isArray(form.fields?.transactions) ? form.fields.transactions : [form.fields || {}];
    for (const item of list) {
      const term = item.term === 'long' ? 'long' : 'short';
      const covered = item.basisReportedToIrs !== false;
      const proceeds = positive(item.proceeds);
      const basis = positive(item.costBasis);
      const adjustment = positive(item.washSaleLossDisallowed);
      rows.push({ formId: form.id, payer: form.payer || '', description: String(item.description || ''), dateAcquired: item.dateAcquired || '', dateSold: item.dateSold || '', term, box: term === 'short' ? (covered ? 'A' : 'B') : (covered ? 'D' : 'E'), proceeds, basis, adjustment, code: adjustment ? 'W' : '', gain: proceeds - basis + adjustment });
    }
  }
  return rows;
}

function scheduleD(input, status, read) {
  const transactions = capitalTransactions(input);
  const box = (name) => transactions.filter((row) => row.box === name);
  const totals = (list) => ({ proceeds: sum(list, (row) => row.proceeds), basis: sum(list, (row) => row.basis), adjustment: sum(list, (row) => row.adjustment), gain: sum(list, (row) => row.gain) });
  const answers = input.answers || {};
  const shortCarry = positive(answers.shortTermLossCarryover);
  const longCarry = positive(answers.longTermLossCarryover);
  const distributions = sum(formsOf(input, '1099-DIV'), (form) => field(form, 'capitalGainDistributions'));
  const a = totals(box('A'));
  const b = totals(box('B'));
  const d = totals(box('D'));
  const e = totals(box('E'));
  const line7 = a.gain + b.gain - shortCarry;
  const line15 = d.gain + e.gain + distributions - longCarry;
  const line16 = line7 + line15;
  const limit = read('us.federal.individual.capital-loss-limit');
  const lossCap = limit ? fromCents(status === 'mfs' ? limit.mfsMaxCents : limit.maxCents) : 0;
  const line21 = line16 < 0 ? -Math.min(lossCap, -line16) : 0;
  const has = transactions.length > 0 || distributions !== 0 || shortCarry > 0 || longCarry > 0;
  return {
    has,
    transactions,
    boxes: { A: a, B: b, D: d, E: e },
    lines: { '1b': a.gain, 2: b.gain, 6: -shortCarry, 7: line7, '8b': d.gain, 9: e.gain, 13: distributions, 14: -longCarry, 15: line15, 16: line16, ...(line16 < 0 ? { 21: line21 } : {}) },
    toForm1040: line16 >= 0 ? line16 : line21,
    netCapitalGain: Math.max(0, Math.min(line15, line16)),
    shortNet: line7,
    longNet: line15,
    total: line16,
    allowedLoss: line21,
  };
}

function lossCarryover(d, taxableBeforeFloor) {
  if (d.total >= 0) return { shortTerm: 0, longTerm: 0 };
  const line2 = -d.allowedLoss;
  const line3 = Math.max(0, taxableBeforeFloor + line2);
  const line4 = Math.min(line2, line3);
  const line5 = d.shortNet < 0 ? -d.shortNet : 0;
  const line6 = Math.max(0, d.longNet) + line4;
  const shortTerm = Math.max(0, line5 - line6);
  const line9 = d.longNet < 0 ? -d.longNet : 0;
  const line10 = Math.max(0, d.shortNet);
  const line12 = Math.max(0, line4 - line5);
  const longTerm = Math.max(0, line9 - (line10 + line12));
  return { shortTerm, longTerm };
}

function businessesOf(input) {
  const list = (input.businesses || []).map((item, index) => {
    const grossReceipts = dollars(item.grossReceipts);
    const returns = positive(item.returnsAndAllowances);
    const costOfGoods = positive(item.costOfGoodsSold);
    const expenses = Array.isArray(item.expenses) ? item.expenses.map((row) => ({ line: String(row.line || ''), label: String(row.label || ''), amount: dollars(row.amount) })) : [];
    const totalExpenses = expenses.length ? sum(expenses, (row) => row.amount) : positive(item.totalExpenses);
    const grossIncome = grossReceipts - returns - costOfGoods;
    return { id: item.id || `business-${index + 1}`, name: String(item.name || 'Business'), owner: item.owner === 'spouse' ? 'spouse' : 'taxpayer', source: item.source || 'manual', materialParticipation: item.materialParticipation, lines: { 1: grossReceipts, 2: returns, 4: costOfGoods, 7: grossIncome, 28: totalExpenses, 31: grossIncome - totalExpenses }, expenses, netProfit: grossIncome - totalExpenses };
  });
  for (const owner of ['taxpayer', 'spouse']) {
    const nec = formsOf(input, '1099-NEC').filter((form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner);
    if (!nec.length || list.some((item) => item.owner === owner)) continue;
    const gross = sum(nec, (form) => field(form, 'nonemployeeCompensation'));
    list.push({ id: `business-1099-nec-${owner}`, name: `Contract work (1099-NEC)`, owner, source: '1099-NEC', lines: { 1: gross, 2: 0, 4: 0, 7: gross, 28: 0, 31: gross }, expenses: [], netProfit: gross });
  }
  return list;
}

function selfEmployment(person, netProfit, wages, se, socialSecurity, status) {
  const netEarnings = ofBasis(Math.max(0, netProfit), se.netEarningsBasisPoints);
  const minimum = fromCents(se.minimumNetEarningsCents);
  if (netEarnings < minimum) return { owner: person, netEarnings: 0, below: true, lines: { 2: netProfit, '4a': netEarnings, 12: 0, 13: 0 }, tax: 0, deduction: 0 };
  const wageBase = fromCents(socialSecurity.wageBaseCents);
  const room = Math.max(0, wageBase - wages);
  const ssPart = ofBasis(Math.min(netEarnings, room), se.socialSecurityBasisPoints);
  const medicarePart = ofBasis(netEarnings, se.medicareBasisPoints);
  const tax = ssPart + medicarePart;
  const deduction = se.halfDeductible ? Math.round(tax / 2) : 0;
  return { owner: person, netEarnings, below: false, lines: { 2: netProfit, '4a': netEarnings, 6: netEarnings, 7: wageBase, '8a': wages, 9: room, 10: ssPart, 11: medicarePart, 12: tax, 13: deduction }, tax, deduction, status };
}

function socialSecurityTaxable({ benefits, otherIncome, taxExemptInterest, adjustments, status, livedWithSpouse, ss }) {
  if (benefits <= 0) return { taxable: 0, worksheet: null };
  const keyed = status === 'mfs' && livedWithSpouse ? 'mfs' : joint(status) ? 'mfj' : 'other';
  const line2 = Math.round(benefits / 2);
  const line5 = line2 + otherIncome + taxExemptInterest;
  const line7 = line5 - adjustments;
  const base = fromCents(ss.baseCents[keyed]);
  const adjusted = fromCents(ss.adjustedBaseCents[keyed]);
  if (line7 <= base && keyed !== 'mfs') return { taxable: 0, worksheet: { 1: benefits, 2: line2, 5: line5, 7: line7, 8: base } };
  const line9 = Math.max(0, line7 - base);
  const line10 = adjusted - base;
  const line11 = Math.max(0, line9 - line10);
  const line12 = Math.min(line9, line10);
  const line14 = Math.min(line2, Math.round(line12 / 2));
  const line15 = ofBasis(line11, ss.secondBasisPoints);
  const line17 = ofBasis(benefits, ss.secondBasisPoints);
  const taxable = Math.min(line14 + line15, line17);
  return { taxable, worksheet: { 1: benefits, 2: line2, 5: line5, 7: line7, 8: base, 9: line9, 10: line10, 11: line11, 14: line14, 15: line15, 17: line17, 18: taxable } };
}

function steppedPhaseOut(amount, magi, start, perThousand, roundUp = true) {
  if (magi <= start) return amount;
  const steps = roundUp ? Math.ceil((magi - start) / 1000) : floorDiv(magi - start, 1000);
  return Math.max(0, amount - steps * perThousand);
}

function check(level, code, message, fix = '', form) {
  return form ? { level, code, message, fix, form } : { level, code, message, fix };
}

const answered = (value) => value !== undefined && value !== null && value !== '';

function employerHsaContributions(form) {
  const rows = Array.isArray(form.fields?.box12) ? form.fields.box12.filter((row) => String(row?.code || '').toUpperCase() === 'W') : [];
  return rows.length ? sum(rows, (row) => positive(row.amount)) : field(form, 'hsaEmployerContributions');
}

function hsaForms({ input, answers, status, taxYear, owners, ownerOf, w2s, read, needForm }) {
  const empty = { forms: [], deduction: 0, income: 0, otherIncome: 0, distributionTax: 0, testingPeriodTax: 0, checks: [] };
  const checks = [];
  const yes = (value) => value === true || value === 'yes';
  const accountOf = (form) => String(form.fields?.accountType || 'HSA').toUpperCase();
  const saForms = formsOf(input, '1099-SA');
  for (const form of saForms) if (accountOf(form) !== 'HSA') needForm('8853', 'FORM_8853_NOT_COVERED', `${form.payer || 'A'} 1099-SA is from an ${accountOf(form) === 'MA' ? 'Medicare Advantage MSA' : 'Archer MSA'}: it is reported on Form 8853, which MyCA does not prepare.`, 'Have your CPA prepare Form 8853.');
  const prefix = (owner) => (owner === 'spouse' ? 'spouseHsa' : 'hsa');
  const ask = (owner, name) => answers[`${prefix(owner)}${name}`];
  const people = owners.map((owner) => {
    const person = (owner === 'spouse' ? input.spouse : input.taxpayer) || {};
    const distributions = saForms.filter((form) => ownerOf(form) === owner && accountOf(form) === 'HSA').map((form) => ({ gross: field(form, 'grossDistribution'), earnings: field(form, 'earningsOnExcess'), code: String(form.fields?.distributionCode || '1') }));
    const trustee = formsOf(input, '5498-SA').filter((form) => ownerOf(form) === owner && accountOf(form) === 'HSA');
    const employer = sum(w2s.filter((form) => ownerOf(form) === owner), employerHsaContributions);
    const legacy = owner === 'taxpayer' ? answers.hsaDeduction : undefined;
    let own = answered(ask(owner, 'OwnContributions')) ? positive(ask(owner, 'OwnContributions')) : answered(legacy) ? positive(legacy) : null;
    if (own === null && trustee.length) {
      own = Math.max(0, sum(trustee, (form) => field(form, 'contributionsMade') + field(form, 'contributionsNextYear')) - employer);
      checks.push(check('warning', 'HSA_CONTRIBUTIONS_FROM_5498SA', `Your own HSA contributions (${own}) were taken from Form 5498-SA boxes 2 and 3 less the employer contributions on your W-2 (code W). Box 2 can include contributions made this year for last year.`, 'Answer the HSA contributions question in the interview with the amount you contributed for this year.', '8889'));
    }
    const coverage = ask(owner, 'Coverage');
    return { owner, person, coverage: answered(coverage) ? String(coverage) : null, distributions, employer, own: own ?? 0, months: hsaMonthsOf(ask(owner, 'Months')), eligibleDecember: yes(ask(owner, 'EligibleDecember')), testing: positive(ask(owner, 'TestingPeriodIncome')), age: ageAtYearEnd(person.dateOfBirth, taxYear, { dayBefore: true }) };
  }).filter((item) => item.coverage === 'self-only' || item.coverage === 'family' || item.own > 0 || item.employer > 0 || item.distributions.length || item.testing > 0);
  if (!people.length) return empty;
  const limits = read('us.federal.individual.hsa-limits');
  const taxes = read('us.federal.individual.hsa-additional-taxes');
  if (!limits || !taxes) return { ...empty, checks: [check('error', 'HSA_RULES_MISSING', `MyCA has no HSA rules for ${taxYear}.`, 'Have your CPA prepare Form 8889.', '8889')] };
  const married = status === 'mfj' || status === 'mfs';
  const covered = (item) => item.coverage === 'self-only' || item.coverage === 'family';
  const familyTreatment = status === 'mfj' && people.filter(covered).length === 2 && people.some((item) => item.coverage === 'family');
  const spouseHasHsa = status === 'mfj' ? people.filter(covered).length === 2 : status === 'mfs' && yes(answers.hsaSpouseHasHsa);
  let taxpayerAllocation = null;
  const forms = people.map((item) => {
    const dependent = Boolean(item.person.canBeClaimedAsDependent);
    if (dependent && (item.own > 0 || item.employer > 0)) checks.push(check('warning', 'HSA_DEPENDENT_NO_DEDUCTION', 'Someone who can be claimed as another person\'s dependent cannot deduct HSA contributions, so they are treated as excess contributions.', '', '8889'));
    if (!item.coverage && (item.own > 0 || item.employer > 0)) checks.push(check('error', 'HSA_COVERAGE_NEEDED', `Form 8889 needs ${item.owner === 'spouse' ? 'your spouse\'s' : 'your'} high-deductible health plan coverage (self-only or family) to work out the HSA limit; no HSA deduction is included until it is answered.`, 'Answer the HSA coverage question in the interview.', '8889'));
    const coverage = dependent ? 'none' : familyTreatment && covered(item) ? 'family' : item.coverage || 'none';
    let allocation = null;
    if (married && coverage === 'family' && spouseHasHsa) {
      const line5 = hsaContributionLimit({ coverage, months: item.months, eligibleDecember: item.eligibleDecember, age: item.age, married, limits }).line3;
      if (item.owner === 'taxpayer') {
        taxpayerAllocation = answered(answers.hsaFamilyShare) ? Math.min(line5, positive(answers.hsaFamilyShare)) : Math.round(line5 / 2);
        allocation = taxpayerAllocation;
      } else allocation = Math.max(0, line5 - (taxpayerAllocation ?? Math.round(line5 / 2)));
      if (item.months < 12 && !item.eligibleDecember) checks.push(check('warning', 'HSA_FAMILY_SPLIT_PART_YEAR', 'Spouses with separate HSAs and family coverage for only part of the year split the limit for the family months only (Form 8889 line 6 steps 1 to 4); MyCA splits the whole limit for the months entered.', 'Have your CPA check line 6 if your coverage changed during the year.', '8889'));
    }
    const result = computeForm8889({ taxYear, coverage, months: item.months, eligibleDecember: item.eligibleDecember, age: item.age, married, allocation, ownContributions: item.coverage ? item.own : 0, employerContributions: item.coverage ? item.employer : 0, distributions: item.distributions, rolledOver: ask(item.owner, 'Rollover'), qualifiedExpenses: ask(item.owner, 'QualifiedExpenses'), disabled: yes(ask(item.owner, 'Disabled')), testingPeriodIncome: item.testing, limits, taxes });
    if (yes(ask(item.owner, 'CoverageChanged'))) checks.push(check('warning', 'HSA_COVERAGE_CHANGED', 'When the coverage type changed during the year, the limit is the larger of the month-by-month Line 3 worksheet and the limit for the coverage on December 1; MyCA uses the coverage you chose for every eligible month.', 'Have your CPA check Form 8889 line 3.', '8889'));
    for (const found of result.checks) checks.push(check(found.level, found.code, `${item.owner === 'spouse' && status === 'mfj' ? 'Spouse: ' : ''}${found.message}`, found.fix, '8889'));
    if (result.excessContributions > 0 || result.excessEmployerContributions > 0) {
      const parts = [result.excessContributions > 0 ? `contributions of ${result.excessContributions} above the deductible amount` : '', result.excessEmployerContributions > 0 ? `employer contributions of ${result.excessEmployerContributions} above the limit, which are added to income` : ''].filter(Boolean).join(' and ');
      needForm('5329', 'HSA_EXCESS_CONTRIBUTION', `${item.owner === 'spouse' && status === 'mfj' ? 'Spouse: ' : ''}HSA excess ${parts}. An excess still in the account at the due date (with extensions) owes a 6% excise tax each year on Form 5329 Part VII, which MyCA does not prepare.`, 'Ask the HSA trustee to return the excess and its earnings before the due date, or have your CPA prepare Form 5329.', false);
    }
    return { owner: item.owner, ...result };
  });
  const total = (pick) => forms.reduce((sumSoFar, item) => sumSoFar + pick(item), 0);
  return { forms, deduction: total((item) => item.deduction), income: total((item) => item.income), otherIncome: total((item) => item.otherIncome), distributionTax: total((item) => item.distributionTax), testingPeriodTax: total((item) => item.testingPeriodTax), checks };
}

export function computeForm1040(input = {}, taxYearArg) {
  const taxYear = String(taxYearArg || input.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', taxYear, supported: SUPPORTED_YEARS };
  const status = FILING_STATUSES.includes(input.filingStatus) ? input.filingStatus : null;
  if (!status) return { ok: false, error: 'FILING_STATUS_REQUIRED', allowed: FILING_STATUSES };
  const { read, used, missing } = ruleReader(taxYear);
  const brackets = read('us.federal.individual.brackets');
  const standard = read('us.federal.individual.standard-deduction');
  const capitalGains = read('us.federal.individual.capital-gains-rates');
  const ctc = read('us.federal.individual.child-tax-credit');
  const eitc = read('us.federal.individual.eitc');
  const education = read('us.federal.individual.education-credits');
  const salt = read('us.federal.individual.salt-cap');
  const medical = read('us.federal.individual.medical-floor');
  const charitable = read('us.federal.individual.charitable');
  const niit = read('us.federal.individual.niit');
  const ssBenefits = read('us.federal.individual.social-security-benefits');
  const studentLoan = read('us.federal.individual.student-loan-interest');
  const qbi = read('us.federal.individual.qbi');
  const foreignElection = read('us.federal.individual.foreign-tax-election');
  const educator = read('us.federal.individual.educator-expenses');
  const se = read('us.federal.se-tax');
  const socialSecurity = read('us.federal.fica.social-security');
  const medicare = read('us.federal.fica.medicare');
  const senior = read('us.federal.individual.senior-deduction');
  const tips = read('us.federal.individual.tips-deduction');
  const overtime = read('us.federal.individual.overtime-deduction');
  const carLoan = read('us.federal.individual.car-loan-interest');
  const qbiMinimum = read('us.federal.individual.qbi-minimum');
  const earlyTax = read('us.federal.individual.early-distribution-tax');
  const rates5329 = read('us.federal.individual.form-5329-rates');
  const exceptionRule = read('us.federal.individual.early-distribution-exceptions');
  const saversRule = read('us.federal.individual.savers-credit');
  const cleanRule = read('us.federal.individual.residential-clean-energy');
  const homeRule = read('us.federal.individual.energy-home-improvement');
  const careCreditRule = read('us.federal.individual.dependent-care-credit');
  const careExclusionRule = read('us.federal.individual.dependent-care-exclusion');
  const passiveAllowance = read('us.federal.individual.passive-loss-special-allowance');
  const dwellingUse = read('us.federal.individual.dwelling-unit-personal-use');
  const macrsRealProperty = read('us.federal.individual.macrs-real-property');
  const mortgageInsurance = read('us.federal.individual.mortgage-insurance-premiums');
  const claimOfRight = read('us.federal.individual.claim-of-right');
  if (missing.some((id) => !['us.federal.individual.claim-of-right', 'us.federal.individual.senior-deduction', 'us.federal.individual.tips-deduction', 'us.federal.individual.overtime-deduction', 'us.federal.individual.car-loan-interest', 'us.federal.individual.qbi-minimum'].includes(id))) return { ok: false, error: 'RULE_NOT_IN_FORCE', taxYear, missing };

  const answers = input.answers || {};
  const checks = [];
  const unsupported = [];
  const needForm = (form, code, message, fix, required = true) => {
    if (!unsupported.some((item) => item.form === form)) unsupported.push({ form, reason: FORM_REASONS[form], code, required });
    checks.push(check(required ? 'error' : 'warning', code, message, fix, form));
  };
  const married = status === 'mfj' || status === 'mfs';
  const hasSpouse = status === 'mfj';
  const owners = hasSpouse ? ['taxpayer', 'spouse'] : ['taxpayer'];
  const ownerOf = (form) => (form.owner === 'spouse' && hasSpouse ? 'spouse' : 'taxpayer');
  if (status === 'mfj' && !input.spouse) checks.push(check('error', 'SPOUSE_REQUIRED', 'A joint return needs the spouse\'s name, SSN and date of birth.', 'Add the spouse on the About you step.'));
  if (input.spouse === undefined && status === 'mfs') checks.push(check('warning', 'SPOUSE_NAME_FOR_MFS', 'A separate return still shows the spouse\'s name and SSN.', 'Add the spouse on the About you step.'));
  for (const form of input.forms || []) if (negativeFields(form).length) checks.push(check('error', 'FORM_AMOUNT_NEGATIVE', `${form.kind} from ${form.payer || 'a payer'} has a negative amount in ${negativeFields(form).join(', ')}; the amounts on these forms are never negative, so they were taken as zero.`, 'Correct the form.'));
  for (const form of input.forms || []) if (form.owner === 'spouse' && !hasSpouse) checks.push(check('error', 'SPOUSE_FORM_ON_NON_JOINT', `${form.kind} from ${form.payer || 'a payer'} belongs to the spouse, which only a joint return includes.`, 'Remove it or change the filing status.'));

  const tpEarly = input.taxpayer || {};
  const listed = (input.dependents || []).map((dependent) => ({ ...dependent, ...dependentFlags(dependent, taxYear) }));
  const dependentFiler = Boolean(tpEarly.canBeClaimedAsDependent);
  if (dependentFiler && listed.length) checks.push(check('error', 'DEPENDENT_FILER_WITH_DEPENDENTS', 'Someone who can be claimed as another person\'s dependent cannot claim dependents of their own, so no dependent credits are included.', 'Remove the dependents, or untick that you can be claimed as a dependent.'));
  for (const item of listed) if (item.bornAfterYear) checks.push(check('error', 'DEPENDENT_BORN_AFTER_YEAR', `${item.firstName || 'A dependent'} was born after ${taxYear}, so cannot be claimed for ${taxYear}.`, 'Check the date of birth, or remove the dependent.'));
  const dependents = listed.map((item) => (dependentFiler || item.bornAfterYear ? { ...item, qualifyingChild: false, ctcEligible: false, odcEligible: false, eitcChild: false } : item));
  const filerHasSsn = tpEarly.ssnValid !== false || (status === 'mfj' && input.spouse?.ssnValid !== false && Boolean(input.spouse));
  const ctcChildren = filerHasSsn ? dependents.filter((item) => item.ctcEligible).length : 0;
  if (!filerHasSsn && dependents.some((item) => item.ctcEligible)) checks.push(check('warning', 'CTC_NEEDS_FILER_SSN', 'From 2025 the child tax credit needs an SSN valid for work for you (or, on a joint return, your spouse), so the $500 credit for other dependents is used instead.', ''));
  const otherDependents = dependents.filter((item) => item.ctcEligible || item.odcEligible).length - ctcChildren;
  const eitcChildren = Math.min(3, dependents.filter((item) => item.eitcChild).length);
  if (status === 'hoh' && !dependents.some((item) => item.qualifyingChild || item.relationship === 'parent' || Number(item.months ?? 12) > 6)) checks.push(check('error', 'HOH_NEEDS_QUALIFYING_PERSON', 'Head of household needs a qualifying person who lived with you more than half the year (a parent need not).', 'Add the dependent, or choose single.'));
  if (status === 'qss' && !dependents.some((item) => CHILD_RELATIONSHIPS.has(item.relationship))) checks.push(check('error', 'QSS_NEEDS_CHILD', 'Qualifying surviving spouse needs a dependent child or stepchild who lived with you all year.', 'Add the child, or choose another status.'));
  for (const item of dependents) if (item.dateOfBirth && item.age === null) checks.push(check('error', 'DEPENDENT_DOB_INVALID', `${item.firstName || 'A dependent'}'s date of birth is not a date.`, 'Enter it as YYYY-MM-DD.'));
  for (const item of dependents) if (item.qualifyingChild && item.age < 17 && item.ssnValid === false) checks.push(check('warning', 'CHILD_WITHOUT_SSN', `${item.firstName || 'A child'} has no SSN valid for work, so the $500 credit for other dependents applies instead of the child tax credit.`, ''));

  const w2s = formsOf(input, 'W-2');
  const wages = sum(w2s, (form) => field(form, 'wages'));
  const ints = formsOf(input, '1099-INT');
  const divs = formsOf(input, '1099-DIV');
  const taxableInterest = sum(ints, (form) => field(form, 'interest') + field(form, 'treasuryInterest'));
  const taxExemptInterest = sum(ints, (form) => field(form, 'taxExemptInterest')) + sum(divs, (form) => field(form, 'exemptInterestDividends'));
  const ordinaryDividends = sum(divs, (form) => field(form, 'ordinaryDividends'));
  const qualifiedDividends = Math.min(ordinaryDividends, sum(divs, (form) => field(form, 'qualifiedDividends')));
  const retirement = formsOf(input, '1099-R');
  const codeOf = (form) => String(form.fields?.distributionCode || '').toUpperCase();
  const rothIra = (form) => /[JQT]/.test(codeOf(form));
  const iraForms = retirement.filter((form) => form.fields?.iraSepSimple || rothIra(form));
  const pensionForms = retirement.filter((form) => !form.fields?.iraSepSimple && !rothIra(form));
  const taxableBlank = (form) => form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '';
  const notTaxableCode = (form) => /[GHQ]/.test(codeOf(form));
  const taxableOf = (form) => (!taxableBlank(form) ? field(form, 'taxableAmount') : notTaxableCode(form) ? 0 : field(form, 'grossDistribution'));
  for (const form of retirement) if (taxableBlank(form) && notTaxableCode(form) && field(form, 'grossDistribution') > 0) checks.push(check('warning', 'ROLLOVER_NOT_TAXED', `${form.payer || 'A'} 1099-R has distribution code ${form.fields.distributionCode} (a direct rollover or a qualified Roth distribution) and no taxable amount in box 2a, so none of it is taxed.`, 'Enter the box 2a amount if the form shows one.'));
  const answeredYes = (value) => value === true || value === 'yes';
  const accountForms = formsOf(input, '5498').filter((form) => ownerOf(form) === 'taxpayer');
  const accountValue = (roth) => sum(accountForms.filter((form) => (form.fields?.accountType === 'roth') === roth), (form) => field(form, 'fairMarketValue'));
  const answerOr = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : positive(value));
  const traditionalForms = iraForms.filter((form) => form.fields?.iraSepSimple && !rothIra(form) && !/[GH]/.test(codeOf(form)) && ownerOf(form) === 'taxpayer');
  const traditionalGross = sum(traditionalForms, (form) => field(form, 'grossDistribution'));
  const conversions = Math.min(traditionalGross, answerOr(answers.rothConversionAmount, sum(accountForms, (form) => field(form, 'rothConversion'))));
  const rothQualified = (form) => /Q/.test(codeOf(form)) || (/T/.test(codeOf(form)) && answeredYes(answers.rothFiveYearMet));
  const rothNonqualified = iraForms.filter((form) => rothIra(form) && !rothQualified(form) && ownerOf(form) === 'taxpayer');
  const rothNonqualifiedGross = sum(rothNonqualified, (form) => field(form, 'grossDistribution'));
  const form8606 = computeForm8606({ nondeductibleContributions: answers.iraNondeductibleContributions, priorBasis: answers.priorIraBasis, contributionsAfterYearEnd: answers.iraNondeductibleAfterYearEnd, yearEndValue: answerOr(answers.iraYearEndValue, accountValue(false)), distributions: traditionalGross - conversions, conversions, rothDistributions: rothNonqualifiedGross, firstHomeExpenses: answers.rothFirstHomeExpenses, firstHomeLimit: fromCents(exceptionRule.caps['09']), rothContributionBasis: answers.rothContributionBasis, rothConversionBasis: answers.rothConversionBasis });
  const taxableShare = new Map();
  const shareOut = (forms, total, gross) => {
    let left = total;
    forms.forEach((form, index) => {
      const amount = index === forms.length - 1 ? left : Math.round((total * field(form, 'grossDistribution')) / gross);
      taxableShare.set(form, amount);
      left -= amount;
    });
  };
  if (form8606.taxableDistributions !== null && traditionalGross > 0) shareOut(traditionalForms, form8606.taxableDistributions + form8606.taxableConversion, traditionalGross);
  if (rothNonqualifiedGross > 0) shareOut(rothNonqualified, form8606.taxableRoth, rothNonqualifiedGross);
  for (const form of iraForms) if (rothIra(form) && rothQualified(form) && ownerOf(form) === 'taxpayer' && /T/.test(codeOf(form))) taxableShare.set(form, 0);
  const iraTaxable = (form) => (taxableShare.has(form) ? taxableShare.get(form) : taxableOf(form));
  if (rothNonqualified.length && (answers.rothContributionBasis === undefined || answers.rothContributionBasis === '')) checks.push(check('warning', 'ROTH_BASIS_NEEDED', 'A nonqualified Roth IRA distribution is taxed only on the part above your Roth contributions and conversions (Form 8606 Part III); without your contribution basis all of it is treated as earnings.', 'Answer the Roth IRA basis questions in the interview.', '8606'));
  if (iraForms.some((form) => /T/.test(codeOf(form)) && ownerOf(form) === 'taxpayer') && answers.rothFiveYearMet === undefined) checks.push(check('warning', 'ROTH_FIVE_YEAR_RULE', 'A 1099-R with code T is a qualified Roth IRA distribution only if your first Roth IRA contribution was for a year at least five years before this one; otherwise the earnings are taxable.', 'Answer the Roth five-year question in the interview.', '8606'));
  if (form8606.fromConversions > 0) needForm('5329', 'ROTH_CONVERSION_RECAPTURE', `${form8606.fromConversions} of the Roth IRA distribution comes out of conversions or rollovers. Any part from a conversion made in the last five years that was taxed when converted is subject to the 10% additional tax (the recapture amount on Form 5329 line 1), which MyCA does not allocate; it is not included.`, 'Have your CPA allocate the distribution to each year\'s conversions (Pub. 590-B ordering rules).', false);
  if (iraForms.some((form) => ownerOf(form) === 'spouse' && ((rothIra(form) && !rothQualified(form)) || form.fields?.taxableNotDetermined))) needForm('8606', 'FORM_8606_SPOUSE', 'Your spouse has an IRA distribution whose taxable part is figured on their own Form 8606, which MyCA prepares only for you; box 2a of the 1099-R is used as the taxable amount.', 'Have your CPA prepare your spouse\'s Form 8606, or enter the taxable amount in box 2a.', false);
  if (traditionalForms.some((form) => form.fields?.taxableNotDetermined) && !form8606.partI && answers.priorIraBasis === undefined) checks.push(check('warning', 'IRA_BASIS_UNKNOWN', 'The 1099-R says the taxable amount was not determined. If you ever made nondeductible IRA contributions, part of the distribution is tax-free (Form 8606).', 'Answer the IRA basis question in the interview.', '8606'));
  const netBenefits = sum(formsOf(input, 'SSA-1099'), (form) => dollars(form.fields?.netBenefits));
  const benefits = Math.max(0, netBenefits);
  if (netBenefits < 0) {
    const repaid = -netBenefits;
    const threshold = claimOfRight ? fromCents(claimOfRight.thresholdCents) : null;
    if (threshold !== null && repaid > threshold) needForm('Section 1341 claim', 'SSA_REPAYMENT_1341', `Social Security repaid in ${taxYear} was $${repaid} more than the benefits paid (box 5 of the SSA-1099s is negative), so line 6a is zero. A net repayment over $${threshold} of benefits taxed in earlier years is either an itemized deduction or a credit under IRC section 1341, whichever lowers the tax more (Pub. 915); MyCA does not figure that, so neither is included.`, 'Have your CPA figure the IRC 1341 claim.', false);
    else checks.push(check('warning', 'SSA_NET_REPAYMENT', `Social Security repaid in ${taxYear} was $${repaid} more than the benefits paid (box 5 of the SSA-1099s is negative), so line 6a is zero. A net repayment of $${threshold ?? repaid} or less is a miscellaneous itemized deduction, which is no longer deductible (Pub. 915).`, ''));
  }
  const gForms = formsOf(input, '1099-G');
  const unemployment = sum(gForms, (form) => field(form, 'unemployment'));
  const stateRefunds = sum(gForms, (form) => field(form, 'stateRefund'));
  const stateRefundTaxable = Math.min(stateRefunds, positive(answers.stateRefundTaxable));
  if (stateRefunds > 0 && answers.stateRefundTaxable === undefined) checks.push(check('warning', 'STATE_REFUND_TAXABILITY', 'A state or local tax refund is taxable only to the extent it reduced last year\'s itemized deduction.', 'Answer the state refund question in the interview.'));
  const miscForms = formsOf(input, '1099-MISC');
  const miscOther = sum(miscForms, (form) => field(form, 'otherIncome'));
  const rentalEntries = formsOf(input, RENTAL_ENTRY_KIND);
  const yesAnswer = (value) => value === true || value === 'yes';
  if (yesAnswer(answers.rentalIncome) && !rentalEntries.length) checks.push(check('error', 'RENTAL_PROPERTY_NEEDED', 'You said you had rental or royalty income: add each property or royalty source as a rental property so it goes on Schedule E.', 'Add a rental property on the Tax forms step.'));
  if (yesAnswer(answers.scheduleK1Income)) needForm('Schedule K-1', 'SCHEDULE_K1_NOT_COVERED', 'Income from a partnership, S corporation, estate or trust (Schedule K-1) goes on Schedule E Parts II and III, which MyCA does not prepare.', 'Have your CPA prepare Schedule E Parts II and III.');
  if (yesAnswer(answers.realEstateProfessional) && (rentalEntries.length || miscForms.some((form) => field(form, 'rents')))) needForm('Real estate professional', 'REAL_ESTATE_PROFESSIONAL_NOT_COVERED', 'As a real estate professional your rentals can be nonpassive (section 469(c)(7)), which MyCA does not apply; the passive loss limits are used instead.', 'Have your CPA prepare the rental schedule.');
  if (positive(answers.childCareExpenses) > 0 && !formsOf(input, '2441-PROVIDER').length) checks.push(check('warning', 'CARE_PROVIDERS_NEEDED', 'Child and dependent care costs are claimed on Form 2441 from each care provider\'s name, identifying number and amount paid; none has been added, so no credit is included.', 'Add each care provider on the Tax forms step.', '2441'));
  const otherIncome = dollars(answers.otherIncome) + miscOther;

  const businesses = businessesOf(input);
  for (const owner of owners) {
    const nec = sum(formsOf(input, '1099-NEC').filter((form) => ownerOf(form) === owner), (form) => field(form, 'nonemployeeCompensation'));
    const gross = sum(businesses.filter((item) => item.owner === owner && item.source !== '1099-NEC'), (item) => item.lines[1]);
    if (nec > 0 && gross > 0 && gross < nec) checks.push(check('warning', 'NEC_ABOVE_RECEIPTS', `1099-NEC income (${nec}) is more than the business gross receipts (${gross}).`, 'Make sure every 1099-NEC is in the Schedule C gross receipts.'));
  }
  const businessIncome = sum(businesses, (item) => item.netProfit);
  const seByOwner = owners.map((owner) => {
    const profit = sum(businesses.filter((item) => item.owner === owner), (item) => item.netProfit);
    const ssWages = sum(w2s.filter((form) => ownerOf(form) === owner), (form) => field(form, 'socialSecurityWages') + field(form, 'socialSecurityTips'));
    return profit > 0 || businesses.some((item) => item.owner === owner) ? selfEmployment(owner, profit, ssWages, se, socialSecurity, status) : null;
  }).filter(Boolean);
  const seTax = sum(seByOwner, (item) => item.tax);
  const seDeduction = sum(seByOwner, (item) => item.deduction);

  const careProviders = formsOf(input, '2441-PROVIDER').map((form) => ({ name: form.payer || '', tin: form.payerTin || '', address: String(form.fields?.providerAddress || ''), householdEmployee: Boolean(form.fields?.householdEmployee), amount: field(form, 'amountPaid'), qualifyingPerson: form.fields?.qualifyingPerson || '' }));
  const careBenefitsBy = (owner) => sum(w2s.filter((form) => ownerOf(form) === owner), (form) => field(form, 'dependentCareBenefits'));
  const careBenefitsReceived = sum(owners, careBenefitsBy);
  const careCarriedIn = positive(answers.careBenefitsCarriedIn);
  const hasCare = careProviders.length > 0 || careBenefitsReceived > 0 || careCarriedIn > 0;
  const careUnmarried = status === 'mfs' && answers.careMfsUnmarried === true;
  const careDependent = Boolean(input.taxpayer?.canBeClaimedAsDependent);
  const careQualifying = careQualifyingPersons({ dependents, spouse: hasSpouse ? input.spouse || {} : null, spouseAllowed: hasSpouse, dependentsAllowed: !careDependent, providers: careProviders });
  const careEarnedActual = (owner) => sum(w2s.filter((form) => ownerOf(form) === owner), (form) => field(form, 'wages')) + sum(seByOwner.filter((item) => item.owner === owner), (item) => item.lines[2] - item.deduction);
  const careDeemedOwner = hasSpouse && ['taxpayer', 'spouse'].includes(answers.careStudentOrDisabled) ? answers.careStudentOrDisabled : '';
  const careEarnedBase = (owner) => {
    const actual = careEarnedActual(owner);
    if (owner !== careDeemedOwner) return { earned: actual, used: false };
    return deemedEarnedIncome(actual, answers.careStudentOrDisabledMonths, careQualifying.count, careCreditRule);
  };
  const careTaxpayerBase = careEarnedBase('taxpayer');
  const careSpouseBase = hasSpouse ? careEarnedBase('spouse') : null;
  const careMfsWithSpouse = status === 'mfs' && !careUnmarried;
  const careOtherBase = hasSpouse ? careSpouseBase.earned : careMfsWithSpouse ? positive(answers.careSpouseEarnedIncome) : careTaxpayerBase.earned;
  const careBenefits = careBenefitsReceived > 0 || careCarriedIn > 0 ? dependentCareBenefits({ received: careBenefitsReceived, carriedIn: careCarriedIn, forfeited: answers.careBenefitsForfeited, qualifiedExpenses: careQualifying.qualifiedExpenses, earnedTaxpayer: careTaxpayerBase.earned, earnedOther: careOtherBase, mfsWithSpouseIncome: careMfsWithSpouse, exclusion: careExclusionRule }) : null;
  if (careMfsWithSpouse && careBenefits && answers.careSpouseEarnedIncome === undefined) checks.push(check('warning', 'CARE_SPOUSE_EARNED_INCOME', 'On a separate return the dependent care benefit exclusion is limited to your spouse\'s earned income too; it was taken as zero, so all the benefits are taxable.', 'Answer your spouse\'s earned income in the interview.'));
  const line1e = careBenefits ? careBenefits.taxable : 0;
  const careTaxableShare = (owner) => (!line1e || careBenefitsReceived <= 0 ? (owner === 'taxpayer' ? line1e : 0) : owner === 'taxpayer' ? Math.round((line1e * careBenefitsBy('taxpayer')) / careBenefitsReceived) : line1e - Math.round((line1e * careBenefitsBy('taxpayer')) / careBenefitsReceived));

  const d = scheduleD(input, status, read);
  const capitalLine = d.has ? d.toForm1040 : 0;

  const hsa = hsaForms({ input, answers, status, taxYear, owners, ownerOf, w2s, read, needForm });
  checks.push(...hsa.checks);
  const schedule1Part1 = { 1: stateRefundTaxable, 3: businessIncome, 7: unemployment, '8f': hsa.income, '8z': otherIncome + hsa.otherIncome };
  schedule1Part1[9] = schedule1Part1['8f'] + schedule1Part1['8z'];
  schedule1Part1[10] = schedule1Part1[1] + schedule1Part1[3] + schedule1Part1[7] + schedule1Part1[9];

  const educatorCap = educator ? fromCents(educator.maxPerEducatorCents) : 0;
  const educatorPaid = [positive(answers.educatorExpenses), hasSpouse ? positive(answers.spouseEducatorExpenses) : 0];
  const educatorDeduction = sum(educatorPaid, (paid) => Math.min(paid, educatorCap));
  const educatorItemized = educator?.excessItemized ? sum(educatorPaid, (paid) => Math.max(0, paid - educatorCap)) : 0;
  const earlyWithdrawal = sum(ints, (form) => field(form, 'earlyWithdrawalPenalty'));
  const adjustments = { 11: educatorDeduction, 13: hsa.deduction, 15: seDeduction, 16: positive(answers.retirementPlanDeduction), 17: positive(answers.selfEmployedHealthInsurance), 18: earlyWithdrawal, 20: positive(answers.iraDeduction) };
  if (adjustments[17] > 0 && adjustments[17] > Math.max(0, businessIncome - seDeduction - adjustments[16])) checks.push(check('warning', 'SE_HEALTH_ABOVE_PROFIT', 'Self-employed health insurance is limited to the business profit less the SE tax and retirement deductions.', 'Check the amount with your CPA.'));

  const line1z = wages + line1e;
  const line4b = sum(iraForms, iraTaxable);
  const line5b = sum(pensionForms, taxableOf);
  const magiBeforeScheduleE = line1z + taxableInterest + ordinaryDividends + line4b + line5b + capitalLine + schedule1Part1[10] - (adjustments[11] + adjustments[13] + adjustments[16] + adjustments[17] + adjustments[18]);
  const scheduleE = computeScheduleE({ taxYear, status, livedWithSpouse: answers.livedWithSpouse === false ? false : answers.livedWithSpouse === true ? true : undefined, entries: rentalEntries, miscForms, magiBeforeScheduleE, qbiSafeHarbor: yesAnswer(answers.rentalQbiSafeHarbor), rules: { allowance: passiveAllowance, personalUse: dwellingUse, macrs: macrsRealProperty } });
  checks.push(...scheduleE.checks);
  for (const need of scheduleE.needs) needForm(need.form, need.code, need.message, need.fix);
  schedule1Part1[5] = scheduleE.line26;
  schedule1Part1[10] += scheduleE.line26;
  const incomeBeforeSs = line1z + taxableInterest + ordinaryDividends + line4b + line5b + capitalLine + schedule1Part1[10];
  const ssAdjustments = adjustments[11] + adjustments[13] + adjustments[15] + adjustments[16] + adjustments[17] + adjustments[18] + adjustments[20];
  const ss = socialSecurityTaxable({ benefits, otherIncome: incomeBeforeSs, taxExemptInterest, adjustments: ssAdjustments, status, livedWithSpouse: answers.livedWithSpouse !== false, ss: ssBenefits });
  const totalIncome = incomeBeforeSs + ss.taxable;

  const loanInterest = sum(formsOf(input, '1098-E'), (form) => field(form, 'studentLoanInterest')) + positive(answers.studentLoanInterest);
  let studentLoanDeduction = 0;
  if (loanInterest > 0 && status === 'mfs') checks.push(check('warning', 'STUDENT_LOAN_MFS', 'Student loan interest is not deductible on a separate return.', ''));
  else if (loanInterest > 0 && !input.taxpayer?.canBeClaimedAsDependent) {
    const capped = Math.min(loanInterest, fromCents(studentLoan.maxCents));
    const magi = totalIncome - ssAdjustments;
    studentLoanDeduction = Math.round(capped * phaseOutFraction(magi, jointOr(studentLoan.phaseOutCents, status)));
  }
  adjustments[21] = studentLoanDeduction;
  adjustments[26] = ssAdjustments + studentLoanDeduction;
  const agi = totalIncome - adjustments[26];

  const medicalRoom = Math.max(0, positive(answers.medicalExpenses) - ofBasis(Math.max(0, agi), medical.basisPoints));
  const capOf = (code) => (exceptionRule.caps[code] !== undefined ? fromCents(exceptionRule.caps[code]) : code === '05' ? medicalRoom : Infinity);
  const capUsed = new Map();
  const disasterCap = fromCents(exceptionRule.qualifiedDisasterMaxCents);
  const earlyRows = { taxpayer: [], spouse: [] };
  const earlyForms = retirement.filter((form) => /[1JS]/.test(codeOf(form)));
  const legacyException = answeredYes(answers.earlyDistributionException);
  for (const form of earlyForms) {
    const owner = ownerOf(form);
    const who = form.payer || 'A';
    let included = iraTaxable(form);
    if (form.fields?.qualifiedDisasterDistribution) {
      const key = `${owner}|disaster`;
      const excluded = Math.min(included, Math.max(0, disasterCap - (capUsed.get(key) || 0)));
      capUsed.set(key, (capUsed.get(key) || 0) + excluded);
      included -= excluded;
      needForm('8915-F', 'QUALIFIED_DISASTER_DISTRIBUTION', `${who} 1099-R is a qualified disaster recovery distribution: up to ${disasterCap} is free of the 10% additional tax. Its income is all included this year; spreading it over three years and repayments are figured on Form 8915-F, which MyCA does not prepare.`, 'Have your CPA prepare Form 8915-F if you want to spread the income.', false);
    }
    if (included <= 0) continue;
    const code = String(form.fields?.exceptionCode || '').padStart(form.fields?.exceptionCode ? 2 : 0, '0');
    let exception = 0;
    if (code && !exceptionRule.codes.includes(code)) checks.push(check('error', 'EARLY_DISTRIBUTION_EXCEPTION_INVALID', `${who} 1099-R has exception number ${code}, which is not on the ${taxYear} Form 5329 list (${exceptionRule.codes[0]} to ${exceptionRule.codes[exceptionRule.codes.length - 2]}, or 99 for more than one).`, 'Correct the exception number on the 1099-R.', '5329'));
    else if (code && form.fields?.iraSepSimple && exceptionRule.notIra.includes(code)) checks.push(check('error', 'EARLY_DISTRIBUTION_EXCEPTION_INVALID', `${who} 1099-R is from an IRA, and exception ${code} does not apply to IRAs.`, 'Correct the exception number on the 1099-R.', '5329'));
    else if (code && !form.fields?.iraSepSimple && !rothIra(form) && exceptionRule.iraOnly.includes(code)) checks.push(check('error', 'EARLY_DISTRIBUTION_EXCEPTION_INVALID', `${who} 1099-R is from an employer plan, and exception ${code} applies only to IRA distributions.`, 'Correct the exception number on the 1099-R.', '5329'));
    else if (code) {
      const claimed = form.fields?.exceptionAmount === undefined || form.fields?.exceptionAmount === null || form.fields?.exceptionAmount === '' ? included : Math.min(included, field(form, 'exceptionAmount'));
      const key = code === '05' ? 'all|05' : `${owner}|${code}`;
      const room = Math.max(0, capOf(code) - (capUsed.get(key) || 0));
      exception = Math.min(claimed, room);
      capUsed.set(key, (capUsed.get(key) || 0) + exception);
      if (exception < claimed) checks.push(check('warning', 'EARLY_DISTRIBUTION_EXCEPTION_CAPPED', `Exception ${code} on ${who} 1099-R covers at most ${capOf(code)}${code === '05' ? ' (medical expenses above 7.5% of AGI)' : code === '19' ? ' per child' : code === '09' ? ' in your lifetime' : code === '23' ? ' a year' : ''}, so ${claimed - exception} of it is subject to the additional tax.`, code === '19' ? 'If the distribution was for more than one child, have your CPA confirm it.' : 'Check the amount with your CPA.', '5329'));
      if (code === '22') checks.push(check('warning', 'DOMESTIC_ABUSE_ACCOUNT_LIMIT', `A domestic abuse victim distribution is also limited to 50% of the vested account balance; MyCA applies only the ${capOf(code)} limit.`, '', '5329'));
      if (code === '23') checks.push(check('warning', 'EMERGENCY_DISTRIBUTION_REPEAT', 'Only one emergency personal expense distribution is allowed a year, and none in the next three years unless it is repaid or new contributions make up for it.', '', '5329'));
    } else if (legacyException) checks.push(check('error', 'EARLY_DISTRIBUTION_EXCEPTION_CODE', `An exception to the 10% additional tax was claimed, but ${who} 1099-R has no exception number for Form 5329 line 2.`, 'Enter the exception number (and the amount it covers) on the 1099-R.', '5329'));
    else if (/1/.test(codeOf(form))) checks.push(check('warning', 'EARLY_DISTRIBUTION', `${who} 1099-R has distribution code 1, an early distribution: the 10% additional tax is on Schedule 2 line 8. If an exception applies, enter its number from the Form 5329 instructions on the 1099-R.`, 'Enter the exception number on the 1099-R if one applies.', '5329'));
    earlyRows[owner].push({ amount: included, exception, code, simple: /S/.test(codeOf(form)) });
  }
  const rateSet = { earlyBasisPoints: earlyTax.basisPoints, ...rates5329 };
  const hasExcess = answeredYes(answers.iraExcessContributions);
  const iraExcess = hasExcess && positive(answers.iraExcessPrior) + positive(answers.iraExcessCurrent) > 0 ? { prior: answers.iraExcessPrior, applied: answers.iraExcessApplied, distributionsIncluded: form8606.taxableDistributions !== null ? form8606.taxableDistributions : Math.max(0, sum(traditionalForms, iraTaxable) - conversions), priorWithdrawn: answers.iraExcessWithdrawn, current: answers.iraExcessCurrent, yearEndValue: answerOr(answers.iraYearEndValue, accountForms.some((form) => form.fields?.accountType !== 'roth') ? accountValue(false) : null) } : null;
  const rothExcess = hasExcess && positive(answers.rothExcessPrior) + positive(answers.rothExcessCurrent) > 0 ? { prior: answers.rothExcessPrior, applied: answers.rothExcessApplied, distributions: sum(iraForms.filter((form) => rothIra(form) && ownerOf(form) === 'taxpayer'), (form) => field(form, 'grossDistribution')), current: answers.rothExcessCurrent, yearEndValue: answerOr(answers.rothYearEndValue, accountForms.some((form) => form.fields?.accountType === 'roth') ? accountValue(true) : null) } : null;
  if ((iraExcess && iraExcess.yearEndValue === null) || (rothExcess && rothExcess.yearEndValue === null)) checks.push(check('warning', 'IRA_VALUE_FOR_EXCESS', 'The 6% tax on excess contributions is limited to the account value on December 31; without that value it is figured on the whole excess.', 'Enter the year-end IRA value (Form 5498 box 5) in the interview.', '5329'));
  if (hasExcess && answeredYes(answers.otherAccountExcess)) needForm('5329', 'FORM_5329_OTHER_ACCOUNTS', 'Excess contributions to an Archer MSA, Coverdell ESA or ABLE account (Form 5329 Parts V, VI and VIII) are not figured by MyCA, so that 6% tax is not included; HSA excess contributions are flagged from Form 8889.', 'Have your CPA complete those parts of Form 5329.');
  const rmd = answeredYes(answers.rmdShortfall) ? { required: answers.rmdRequired, distributed: answers.rmdDistributed, corrected: answeredYes(answers.rmdCorrected), waiver: answers.rmdWaiverAmount } : null;
  if (rmd && positive(answers.rmdRequired) <= positive(answers.rmdDistributed)) checks.push(check('warning', 'RMD_NO_SHORTFALL', 'The amount distributed is not less than the required minimum distribution, so there is no excise tax.', '', '5329'));
  const forms5329 = owners.map((owner) => {
    const result = computeForm5329({ early: earlyRows[owner], ...(owner === 'taxpayer' ? { iraExcess, rothExcess, rmd } : {}), rates: rateSet });
    const fileRequired = earlyRows[owner].some((row) => row.code || row.simple) || (owner === 'taxpayer' && Boolean(iraExcess || rothExcess || rmd)) || retirement.some((form) => ownerOf(form) === owner && /J/.test(codeOf(form)) && iraTaxable(form) > 0);
    return { owner, result, fileRequired };
  }).filter((item) => Object.keys(item.result.lines).length);
  if (rmd && forms5329.some((item) => item.result.waiverRequested > 0)) checks.push(check('warning', 'RMD_WAIVER_REQUESTED', `A waiver of the tax on ${forms5329.find((item) => item.result.waiverRequested > 0).result.waiverRequested} of the shortfall is requested: "RC" and that amount go next to line 54, with a statement explaining the reasonable error and the steps taken to remedy it. The IRS decides and bills any tax it does not waive.`, 'Attach the statement of explanation when you file.', '5329'));
  const earlyDistributionTax = sum(forms5329, (item) => item.result.total);

  const marketplaceForms = formsOf(input, '1095-A');
  const yes = (value) => value === true || value === 'yes';
  let form8962 = null;
  if (!marketplaceForms.length && yes(answers.marketplaceCoverage)) checks.push(check('error', 'FORM_1095A_MISSING', 'Marketplace coverage must be reconciled on Form 8962 from the Form 1095-A; a return without it is rejected.', 'Add the Form 1095-A from HealthCare.gov or your state Marketplace.'));
  else if (marketplaceForms.length && input.taxpayer?.canBeClaimedAsDependent) checks.push(check('warning', 'PTC_CLAIMED_AS_DEPENDENT', 'Someone can claim you as a dependent, so you cannot take the premium tax credit; the person who claims you reconciles the Form 1095-A on their Form 8962.', ''));
  else if (marketplaceForms.length && yes(answers.marketplacePolicyShared)) needForm('8962', 'FORM_8962_ALLOCATION_NOT_COVERED', 'A Marketplace policy shared with another tax family must be allocated on Form 8962 Part IV, which MyCA does not prepare; no premium tax credit or repayment is included.', 'Have your CPA prepare Form 8962.');
  else if (marketplaceForms.length) {
    const povertyLine = read('us.federal.individual.ptc-poverty-line');
    const applicableFigure = read('us.federal.individual.ptc-applicable-figure');
    const repaymentLimit = read('us.federal.individual.ptc-repayment-limit');
    if (!povertyLine || !applicableFigure || !repaymentLimit) checks.push(check('error', 'PTC_RULES_MISSING', `MyCA has no premium tax credit rules for ${taxYear}.`, 'Have your CPA prepare Form 8962.'));
    else {
      const familySize = (input.taxpayer?.canBeClaimedAsDependent ? 0 : 1) + (hasSpouse && !input.spouse?.canBeClaimedAsDependent ? 1 : 0) + dependents.length;
      const modifiedAgi = agi + taxExemptInterest + positive(answers.marketplaceForeignExcluded) + Math.max(0, benefits - ss.taxable);
      form8962 = computeForm8962({ taxYear, filingStatus: status, familySize, modifiedAgi, dependentsModifiedAgi: dollars(answers.marketplaceDependentsMagi), state: input.address?.state, statements: marketplaceForms.map((form) => form.fields || {}), abuseException: yes(answers.marketplaceAbuseException), enrollmentEstimateException: yes(answers.marketplaceEnrollmentEstimate), lawfullyPresentException: yes(answers.marketplaceLawfullyPresent), povertyLine, applicableFigure, repaymentLimit });
      for (const item of form8962.checks) checks.push(check(item.level, item.code, item.message, item.fix, '8962'));
      if (!form8962.ok) form8962 = null;
      if (form8962 && yes(answers.marketplaceMarriageAlternative) && married) needForm('8962', 'FORM_8962_MARRIAGE_ALTERNATIVE_NOT_COVERED', 'The alternative calculation for the year of marriage (Form 8962 Part V) can lower the repayment, but MyCA does not prepare it; the regular calculation is used.', 'Ask your CPA whether the alternative calculation lowers your repayment.', false);
      if (form8962 && positive(answers.selfEmployedHealthInsurance) > 0) checks.push(check('warning', 'PTC_SE_HEALTH_INSURANCE', 'The self-employed health insurance deduction and the premium tax credit depend on each other (Pub. 974 iterative calculation), which MyCA does not run; the deduction is taken as entered.', 'Have your CPA confirm both amounts.', '8962'));
    }
  }
  const ptcRepayment = form8962 ? form8962.repayment : 0;
  const netPremiumTaxCredit = form8962 ? form8962.netCredit : 0;

  const tp = input.taxpayer || {};
  const sp = input.spouse || {};
  const tpAge = ageAtYearEnd(tp.dateOfBirth, taxYear, { dayBefore: true });
  const spAge = married ? ageAtYearEnd(sp.dateOfBirth, taxYear, { dayBefore: true }) : null;
  if (!birthParts(tp.dateOfBirth) && tp.dateOfBirth) checks.push(check('error', 'TAXPAYER_DOB_INVALID', 'Your date of birth is not a date.', 'Enter it as YYYY-MM-DD.'));
  else if (!birthParts(tp.dateOfBirth)) checks.push(check('warning', 'TAXPAYER_DOB_MISSING', 'Your date of birth decides the extra standard deduction and senior deduction at 65.', 'Add it on the About you step.'));
  const boxes = [tpAge !== null && tpAge >= 65, Boolean(tp.blind), hasSpouse && spAge !== null && spAge >= 65, hasSpouse && Boolean(sp.blind), status === 'mfs' && answers.spouseHasNoIncome && spAge !== null && spAge >= 65, status === 'mfs' && answers.spouseHasNoIncome && Boolean(sp.blind)].filter(Boolean).length;
  const additional = boxes * fromCents(married || status === 'qss' ? standard.additionalMarriedCents : standard.additionalUnmarriedCents);
  const earnedIncome = line1z + sum(seByOwner, (item) => item.lines[2] - item.deduction);
  let basic = fromCents(standard.basicCents[status]);
  if (tp.canBeClaimedAsDependent) basic = Math.min(basic, Math.max(fromCents(standard.dependentMinimumCents), earnedIncome + fromCents(standard.dependentEarnedIncomeAddCents)));
  const spouseItemizes = status === 'mfs' && Boolean(answers.spouseItemizes);
  const standardDeduction = spouseItemizes ? 0 : basic + additional;

  const statePaid = sum(w2s, (form) => field(form, 'stateWithheld') + field(form, 'localWithheld')) + positive(answers.stateEstimatedPayments) + positive(answers.priorYearStateTaxPaid);
  const realEstate = sum(formsOf(input, '1098'), (form) => field(form, 'propertyTax')) + positive(answers.realEstateTaxes);
  const personalProperty = positive(answers.personalPropertyTaxes);
  const useSalesTax = Boolean(answers.useSalesTax) && positive(answers.generalSalesTax) > 0;
  const line5a = useSalesTax ? positive(answers.generalSalesTax) : statePaid;
  const line5d = line5a + realEstate + personalProperty;
  const saltCapBase = fromCents(status === 'mfs' ? salt.mfsCapCents : salt.capCents);
  const saltStart = fromCents(status === 'mfs' ? salt.mfsPhaseDownStartCents : salt.phaseDownStartCents);
  const saltFloor = fromCents(status === 'mfs' ? salt.mfsFloorCents : salt.floorCents);
  const saltCap = Math.max(saltFloor, saltCapBase - ofBasis(Math.max(0, agi - saltStart), salt.phaseDownBasisPoints));
  const line5e = Math.min(line5d, saltCap);
  const medicalPaid = positive(answers.medicalExpenses);
  const medicalFloor = ofBasis(Math.max(0, agi), medical.basisPoints);
  const medicalDeduction = Math.max(0, medicalPaid - medicalFloor);
  const mortgageForms = formsOf(input, '1098');
  const mortgageReported = sum(mortgageForms, (form) => field(form, 'mortgageInterest') + field(form, 'pointsPaid'));
  const mortgageNotReported = positive(answers.otherMortgageInterest);
  const insurancePaid = sum(mortgageForms, (form) => field(form, 'mortgageInsurancePremiums'));
  const insuranceKey = status === 'mfs' ? 'mfs' : 'other';
  const insuranceSteps = Math.ceil(Math.max(0, agi - fromCents(mortgageInsurance.phaseOutStartCents[insuranceKey])) / fromCents(mortgageInsurance.phaseOutStepCents[insuranceKey]));
  const line8d = mortgageInsurance.deductible ? Math.round((insurancePaid * Math.max(0, 10000 - insuranceSteps * mortgageInsurance.reductionPerStepBasisPoints)) / 10000) : 0;
  if (insurancePaid > 0 && !mortgageInsurance.deductible) checks.push(check('warning', 'MORTGAGE_INSURANCE_NOT_DEDUCTIBLE', `Mortgage insurance premiums (Form 1098 box 5) are not deductible for ${taxYear}; the deduction returns from 2026.`, ''));
  const mortgageInterest = mortgageReported + mortgageNotReported + line8d;
  const mortgageAboveLimit = mortgageForms.some((form) => field(form, 'outstandingPrincipal') > 750000) || sum(mortgageForms, (form) => field(form, 'outstandingPrincipal')) > (status === 'mfs' ? 375000 : 750000);
  const cashGifts = positive(answers.charityCash);
  const nonCashGifts = positive(answers.charityNonCash);
  const charityFloor = ofBasis(Math.max(0, agi), charitable.itemizedFloorBasisPoints);
  const cashAllowed = Math.min(cashGifts, ofBasis(Math.max(0, agi), charitable.cashAgiLimitBasisPoints));
  const nonCashAllowed = Math.min(nonCashGifts, ofBasis(Math.max(0, agi), 3000), Math.max(0, ofBasis(Math.max(0, agi), charitable.cashAgiLimitBasisPoints) - cashAllowed));
  const charityDeduction = Math.max(0, cashAllowed + nonCashAllowed - charityFloor);
  const otherItemized = positive(answers.otherItemizedDeductions) + educatorItemized;
  const scheduleA = { 1: medicalPaid, 2: agi, 3: medicalFloor, 4: medicalDeduction, '5a': line5a, '5b': realEstate, '5c': personalProperty, '5d': line5d, '5e': line5e, 7: line5e, '8a': mortgageReported, '8b': mortgageNotReported, '8d': line8d, '8e': mortgageInterest, 10: mortgageInterest, 11: cashAllowed, 12: nonCashAllowed, 14: charityDeduction, 16: otherItemized };
  scheduleA[17] = medicalDeduction + line5e + mortgageInterest + charityDeduction + otherItemized;
  const preference = answers.itemize;
  const nonItemizerCap = fromCents(jointOr(charitable.nonItemizerCents, status));
  const itemize = spouseItemizes || preference === 'yes' || (preference !== 'no' && scheduleA[17] > standardDeduction + Math.min(cashGifts, nonItemizerCap));
  const line12 = itemize ? scheduleA[17] : standardDeduction;
  const nonItemizerCharity = !itemize ? Math.min(cashGifts, nonItemizerCap) : 0;
  if (itemize && mortgageAboveLimit && mortgageInterest > 0) needForm('Pub. 936 worksheet', 'MORTGAGE_DEBT_LIMIT', 'Mortgage principal is above the acquisition debt limit, so only part of the interest is deductible (Pub. 936 worksheet), which MyCA does not prorate.', 'Have your CPA apply the Pub. 936 limit, or take the standard deduction.');
  else if (mortgageAboveLimit && mortgageInterest > 0) checks.push(check('warning', 'MORTGAGE_DEBT_LIMIT', 'Mortgage principal is above the acquisition debt limit; it does not matter while you take the standard deduction.', ''));
  if (itemize && nonCashAllowed > 500) needForm('8283', 'FORM_8283', 'Non-cash gifts over $500 need Form 8283, which MyCA does not prepare.', 'Have your CPA prepare Form 8283.');
  else if (nonCashGifts > 500) checks.push(check('warning', 'FORM_8283', 'Non-cash gifts over $500 need Form 8283 when you itemize; they are not deducted with the standard deduction.', ''));

  const excludedIncome = positive(answers.excludedForeignIncome);
  const magi = agi + excludedIncome;
  const schedule1A = {};
  const ownerWages = (owner) => w2s.filter((form) => ownerOf(form) === owner);
  const earners = owners.map((owner) => ({ owner, label: owner === 'spouse' ? 'your spouse' : 'you', ssn: (owner === 'spouse' ? sp : tp).ssnValid !== false, prefix: owner === 'spouse' ? 'spouse' : '' }));
  const answerOf = (earner, name) => positive(answers[earner.prefix ? `${earner.prefix}${name[0].toUpperCase()}${name.slice(1)}` : name]);
  const netIncomeLimit = (owner) => {
    const profit = sum(businesses.filter((item) => item.owner === owner), (item) => item.netProfit);
    const seShare = sum(seByOwner.filter((item) => item.owner === owner), (item) => item.deduction);
    const ownPlans = owner === 'taxpayer' ? adjustments[16] + adjustments[17] : 0;
    return Math.max(0, profit - seShare - ownPlans);
  };
  if (tips) {
    const rows = earners.map((earner) => {
      const employee = answerOf(earner, 'qualifiedTips');
      const business = answerOf(earner, 'businessQualifiedTips');
      const limit = netIncomeLimit(earner.owner);
      return { ...earner, employee, business, businessAllowed: Math.min(business, limit), limit };
    }).filter((row) => row.employee + row.business > 0);
    if (rows.length) {
      if (status === 'mfs') checks.push(check('warning', 'TIPS_MFS', 'The tips deduction needs a joint return if you are married.', ''));
      else {
        for (const row of rows.filter((item) => !item.ssn)) checks.push(check('warning', 'TIPS_NEED_SSN', `Tips received by ${row.label} are left out: the person who received qualified tips needs an SSN valid for work (Schedule 1-A, Part II).`, ''));
        for (const row of rows.filter((item) => item.ssn && item.business > item.businessAllowed)) checks.push(check('warning', 'TIPS_ABOVE_NET_INCOME', `Business tips of ${row.label} count only up to the net income of the business ($${row.limit}), so $${row.business - row.businessAllowed} is left out (Schedule 1-A line 5).`, ''));
        const counted = rows.filter((item) => item.ssn);
        const line6 = sum(counted, (item) => item.employee + item.businessAllowed);
        if (line6 > 0) schedule1A[13] = steppedPhaseOut(Math.min(line6, fromCents(tips.maxCents)), magi, fromCents(jointOr(tips.phaseOutStartCents, status)), fromCents(tips.phaseOutPerThousandCents), false);
      }
    }
  }
  if (overtime) {
    const rows = earners.map((earner) => ({ ...earner, premium: answerOf(earner, 'qualifiedOvertime') })).filter((row) => row.premium > 0);
    if (rows.length) {
      if (status === 'mfs') checks.push(check('warning', 'OVERTIME_MFS', 'The overtime deduction needs a joint return if you are married.', ''));
      else {
        for (const row of rows.filter((item) => !item.ssn)) checks.push(check('warning', 'OVERTIME_NEEDS_SSN', `Overtime paid to ${row.label} is left out: the person who received qualified overtime needs an SSN valid for work (Schedule 1-A, Part III).`, ''));
        const premium = sum(rows.filter((item) => item.ssn), (item) => item.premium);
        if (premium > 0) schedule1A[21] = steppedPhaseOut(Math.min(premium, fromCents(jointOr(overtime.maxCents, status))), magi, fromCents(jointOr(overtime.phaseOutStartCents, status)), fromCents(overtime.phaseOutPerThousandCents), false);
      }
    }
  }
  if (carLoan && positive(answers.carLoanInterest) > 0) schedule1A[30] = steppedPhaseOut(Math.min(positive(answers.carLoanInterest), fromCents(carLoan.maxCents)), magi, fromCents(jointOr(carLoan.phaseOutStartCents, status)), fromCents(carLoan.phaseOutPerThousandCents));
  if (senior) {
    const seniors = [tpAge !== null && tpAge >= senior.minAge && tp.ssnValid !== false, hasSpouse && spAge !== null && spAge >= senior.minAge && sp.ssnValid !== false].filter(Boolean).length;
    if (seniors > 0 && status === 'mfs') checks.push(check('warning', 'SENIOR_MFS', 'The senior deduction needs a joint return if you are married.', ''));
    else if (seniors > 0) {
      const reduction = ofBasis(Math.max(0, magi - fromCents(jointOr(senior.phaseOutStartCents, status))), senior.phaseOutBasisPoints);
      schedule1A[37] = seniors * Math.max(0, fromCents(senior.perPersonCents) - reduction);
    }
  }
  if (nonItemizerCharity > 0) schedule1A.charity = nonItemizerCharity;
  schedule1A[38] = sum(Object.values(schedule1A));
  const line13b = schedule1A[38];

  const beforeQbi = Math.max(0, agi - line12 - line13b);
  const reitDividends = sum(divs, (form) => field(form, 'section199aDividends'));
  const qbiThreshold = fromCents(qbi.thresholdCents[status]);
  const participationAnswer = (value) => (value === true || value === 'yes' ? true : value === false || value === 'no' ? false : null);
  const participationOf = (item) => {
    const own = participationAnswer(item.materialParticipation);
    if (own !== null) return own;
    const sameOwner = businesses.filter((other) => other.owner === item.owner).length;
    const byOwner = participationAnswer(item.owner === 'spouse' ? answers.spouseQbiMaterialParticipation : answers.qbiMaterialParticipation);
    if (sameOwner === 1 && byOwner !== null) return byOwner;
    return businesses.length === 1 ? participationAnswer(answers.qbiMaterialParticipation) : null;
  };
  const qbiBusinesses = [
    ...allocateQbiAdjustments(businesses.map((item) => ({ id: item.id, name: item.name, owner: item.owner, profit: item.netProfit, active: participationOf(item) })), { byOwner: Object.fromEntries(seByOwner.map((item) => [item.owner, item.deduction])), shared: adjustments[16] + adjustments[17] }),
    ...(scheduleE.qbiRental ? [{ id: 'rental-enterprise', name: 'Rental real estate enterprise (Rev. Proc. 2019-38)', owner: 'taxpayer', profit: scheduleE.qbiRental, qbi: scheduleE.qbiRental, active: false }] : []),
  ];
  const qbiLossCarryforward = positive(answers.qbiLossCarryforward);
  const reitPtpLossCarryforward = positive(answers.qbiReitPtpLossCarryforward);
  const hasCurrentQbi = qbiBusinesses.some((item) => item.qbi !== 0) || reitDividends > 0;
  let line13a = 0;
  let form8995 = null;
  let qbiResult = null;
  if (hasCurrentQbi || qbiLossCarryforward > 0 || reitPtpLossCarryforward > 0) {
    if (hasCurrentQbi && beforeQbi > qbiThreshold) needForm('8995-A', 'QBI_ABOVE_THRESHOLD', `Taxable income before the QBI deduction is above ${qbiThreshold}, so Form 8995-A applies, which MyCA does not prepare; no QBI deduction is included.`, 'Have your CPA prepare Form 8995-A.');
    else {
      qbiResult = computeForm8995({ businesses: qbiBusinesses, qbiLossCarryforward, reitPtp: reitDividends, reitPtpLossCarryforward, taxableIncome: beforeQbi, netCapitalGain: qualifiedDividends + d.netCapitalGain, basisPoints: qbi.basisPoints, minimum: qbiMinimum ? { amount: fromCents(qbiMinimum.minimumCents), activeFloor: fromCents(qbiMinimum.activeQbiFloorCents) } : null });
      line13a = qbiResult.deduction;
      form8995 = qbiResult.lines;
      if (qbiResult.minimumMayApply) checks.push(check('warning', 'QBI_MINIMUM_NEEDS_ANSWER', `Your business income may qualify for the minimum QBI deduction of $${fromCents(qbiMinimum.minimumCents)} (IRC 199A(i)) if you materially participate in ${qbiResult.unanswered.join(', ')}. Answer the material participation question for each business to claim it.`, 'Answer whether you worked in each business regularly, continuously and substantially this year.', '8995'));
    }
  }
  const line14 = line12 + line13a + line13b;
  const line15 = Math.max(0, agi - line14);

  const bands = brackets[bracketKey(status)];
  const topBandStart = bands[bands.length - 1].fromCents / 100;
  if (taxYear >= '2026' && itemize && Math.max(0, agi - line13a - line13b) > topBandStart) needForm('Section 68 limit', 'ITEMIZED_37_LIMIT', 'From 2026, itemized deductions of a taxpayer in the 37% bracket are reduced so they save at most 35 cents a dollar (IRC section 68); MyCA does not apply that reduction.', 'Have your CPA apply the section 68 limit, or take the standard deduction.');
  const preferential = qualifiedDividends + d.netCapitalGain;
  const worksheet = preferential > 0 ? qualifiedDividendsWorksheet({ taxable: line15, qualifiedDividends, netCapitalGain: d.netCapitalGain, status, bands, capitalGains }) : null;
  const line16 = worksheet ? worksheet.tax : regularTax(line15, bands);
  const line17 = ptcRepayment;
  const line18 = line16 + line17;

  const foreignTax = sum(divs, (form) => field(form, 'foreignTaxPaid')) + sum(ints, (form) => field(form, 'foreignTaxPaid'));
  let foreignCredit = 0;
  if (foreignTax > 0) {
    if (foreignTax <= fromCents(jointOr(foreignElection.maxCents, status))) foreignCredit = Math.min(foreignTax, line18);
    else needForm('1116', 'FORM_1116_NEEDED', `Foreign tax paid (${foreignTax}) is above the amount claimable without Form 1116, which MyCA does not prepare; no foreign tax credit is included.`, 'Have your CPA prepare Form 1116.');
  }

  let form2441 = null;
  let careCredit = 0;
  if (hasCare) {
    for (const problem of careQualifying.problems) checks.push(check(problem.level, problem.code, problem.message, problem.code === 'CARE_PERSON_UNKNOWN' ? 'Use the first name of a dependent on the About you step, or "spouse".' : '', '2441'));
    for (const provider of careQualifying.providers) {
      if (!provider.tin) checks.push(check('warning', 'CARE_PROVIDER_TIN_MISSING', `${provider.name || 'A care provider'} has no identifying number. Form 2441 line 1 needs the provider's EIN, or an individual's SSN, and the credit can be disallowed without it unless you show due diligence (Form W-10).`, 'Add the EIN, or ask your CPA to enter an individual\'s SSN when filing.', '2441'));
      if (provider.householdEmployee) checks.push(check('warning', 'CARE_HOUSEHOLD_EMPLOYEE', `${provider.name || 'A care provider'} was your household employee, so you may owe employment taxes on Schedule H, which MyCA does not prepare.`, 'Ask your CPA about Schedule H.', '2441'));
    }
    let creditBlocked = '';
    if (status === 'mfs' && !careUnmarried) creditBlocked = 'mfs';
    else if (careProviders.length && careQualifying.count === 0) creditBlocked = 'none';
    if (creditBlocked === 'mfs' && careProviders.length) checks.push(check('warning', 'CARE_CREDIT_MFS', 'Married filing separately can claim the child and dependent care credit only if you lived apart from your spouse for the last 6 months of the year, your home was the qualifying person\'s main home for more than half the year and you paid more than half its upkeep.', 'Answer the separate-return question for Form 2441 in the interview, or file jointly.', '2441'));
    if (creditBlocked === 'none') checks.push(check('warning', 'CARE_NO_QUALIFYING_PERSON', careDependent ? 'You can be claimed as someone else\'s dependent, so you cannot claim dependents (IRC 152(b)(1)) and none of them is a qualifying person for Form 2441; no care credit is included.' : 'No one on this return is a qualifying person for Form 2441 (a dependent under 13 when cared for, or a dependent or spouse unable to care for themself), so no care credit is included.', 'Check the dependents\' dates of birth, or who each provider cared for.', '2441'));
    const earned4 = careTaxpayerBase.earned + careTaxableShare('taxpayer');
    const earned5 = hasSpouse ? careSpouseBase.earned + careTaxableShare('spouse') : careMfsWithSpouse ? careOtherBase : earned4;
    const partII = creditBlocked ? null : dependentCareCredit({ qualifyingPersons: careQualifying.count, qualifiedExpenses: careQualifying.qualifiedExpenses, benefits: careBenefits, earnedTaxpayer: earned4, earnedOther: earned5, agi, joint: status === 'mfj', taxLimit: line18 - foreignCredit, credit: careCreditRule });
    careCredit = partII ? partII.credit : 0;
    form2441 = { A: careUnmarried, B: Boolean(careTaxpayerBase.used || careSpouseBase?.used), creditAllowed: !creditBlocked, providers: careQualifying.providers.map(({ counted, ...row }) => row), persons: careQualifying.persons, ...(partII ? partII.lines : {}), ...(careBenefits ? careBenefits.lines : {}) };
  }

  const educationRows = [];
  let aotcTotal = 0;
  let llcExpenses = 0;
  const students = Array.isArray(answers.education) && answers.education.length ? answers.education : formsOf(input, '1098-T').map((form) => ({ student: form.fields?.studentName || form.payer || 'Student', credit: form.fields?.atLeastHalfTime ? 'aotc' : 'llc', expenses: Math.max(0, field(form, 'tuitionPaid') - field(form, 'scholarships')), aotcPriorYears: form.fields?.aotcClaimedFourYears ? education.aotcMaxYears : 0, firstFourYearsCompleted: form.fields?.firstFourYearsCompleted ?? form.fields?.graduate, felonyDrugConviction: form.fields?.felonyDrugConviction }));
  if (students.length && status === 'mfs') checks.push(check('warning', 'EDUCATION_MFS', 'Education credits are not allowed on a separate return.', ''));
  else if (students.length && tp.canBeClaimedAsDependent) checks.push(check('warning', 'EDUCATION_DEPENDENT', 'Someone who can be claimed as a dependent cannot take an education credit; the person claiming them takes it.', ''));
  else {
    for (const student of students) {
      const expenses = positive(student.expenses);
      const wantsAotc = student.credit !== 'llc';
      const aotcBar = Number(student.aotcPriorYears || 0) >= education.aotcMaxYears ? `it was already claimed for ${education.aotcMaxYears} earlier years` : student.firstFourYearsCompleted ? 'the student completed the first four years of postsecondary education before the year' : student.felonyDrugConviction ? 'the student has a felony drug conviction' : '';
      const aotcAllowed = wantsAotc && !aotcBar;
      if (wantsAotc && !aotcAllowed) checks.push(check('warning', 'AOTC_NOT_ALLOWED', `${student.student}: no American opportunity credit because ${aotcBar} (Form 8863 lines 23 to 26), so the lifetime learning credit is used.`, ''));
      if (aotcAllowed) {
        const full = fromCents(education.aotcFullCents);
        const quarter = fromCents(education.aotcQuarterCents);
        const credit = Math.min(expenses, full) + Math.round(Math.min(Math.max(0, expenses - full), quarter) / 4);
        aotcTotal += credit;
        educationRows.push({ student: String(student.student || ''), credit: 'aotc', expenses, tentative: credit });
      } else {
        llcExpenses += expenses;
        educationRows.push({ student: String(student.student || ''), credit: 'llc', expenses, tentative: 0 });
      }
    }
  }
  const educationFraction = phaseOutFraction(magi, jointOr(education.phaseOutCents, status));
  const aotcAfter = Math.round(aotcTotal * educationFraction);
  const supportTest = tpAge !== null && tpAge < 24 && !joint(status) && (tpAge < 18 || (answers.aotcEarnedUnderHalfSupport === true && (tpAge === 18 || answers.aotcFullTimeStudent === true)));
  const aotcRefundableBlocked = aotcAfter > 0 && supportTest && answers.aotcParentAlive === true;
  if (aotcAfter > 0 && tpAge !== null && tpAge < 24 && !joint(status) && !aotcRefundableBlocked && [tpAge >= 18 ? 'aotcEarnedUnderHalfSupport' : '', tpAge > 18 ? 'aotcFullTimeStudent' : '', 'aotcParentAlive'].some((id) => id && answers[id] === undefined)) checks.push(check('warning', 'AOTC_REFUNDABLE_QUESTIONS', 'You were under 24 at the end of the year: answer the American opportunity credit questions on student status, support and parents, because they decide whether 40% of the credit can be refunded (Form 8863 line 7).', 'Answer them on the Deductions and credits step.'));
  const aotcRefundable = aotcRefundableBlocked ? 0 : ofBasis(aotcAfter, education.aotcRefundableBasisPoints);
  const llcTentative = ofBasis(Math.min(llcExpenses, fromCents(education.llcExpenseCapCents)), education.llcBasisPoints);
  const llcAfter = Math.round(llcTentative * educationFraction);
  const educationNonrefundableTentative = aotcAfter - aotcRefundable + llcAfter;
  const educationCredit = Math.min(educationNonrefundableTentative, Math.max(0, line18 - foreignCredit - careCredit));
  const form8863 = students.length && educationRows.length ? { students: educationRows, 1: aotcTotal, 7: aotcAfter, line7Under24: aotcRefundableBlocked, 8: aotcRefundable, 9: aotcAfter - aotcRefundable, 10: llcExpenses, 12: llcTentative, 18: llcAfter + aotcAfter - aotcRefundable, 19: educationCredit, phaseOutFraction: educationFraction } : null;

  const ctcBase = ctcChildren * fromCents(ctc.perChildCents) + otherDependents * fromCents(ctc.otherDependentCents);
  const ctcStart = fromCents(jointOr({ mfj: ctc.phaseOutStartCents.mfj, other: ctc.phaseOutStartCents.other }, status));
  const ctcExcess = magi > ctcStart ? Math.ceil((magi - ctcStart) / 1000) * 1000 : 0;
  const ctcReduction = (ctcExcess / 1000) * fromCents(ctc.phaseOutPerThousandCents);
  const ctcAfter = Math.max(0, ctcBase - ctcReduction);

  const medicareWages = sum(w2s, (form) => field(form, 'medicareWages'));
  const medicareWithheld = sum(w2s, (form) => field(form, 'medicareTax'));
  const amtThreshold = fromCents(se.additionalMedicareThresholdCents[LONG_STATUS[status]]);
  const addBp = medicare.additionalEmployeeBasisPoints;
  const wageAdditional = ofBasis(Math.max(0, medicareWages - amtThreshold), addBp);
  const seEarnings = sum(seByOwner, (item) => Math.max(0, item.netEarnings));
  const seAdditional = ofBasis(Math.max(0, seEarnings - Math.max(0, amtThreshold - medicareWages)), addBp);
  const additionalMedicare = wageAdditional + seAdditional;
  const additionalWithheld = Math.max(0, medicareWithheld - ofBasis(medicareWages, medicare.employeeBasisPoints));
  const form8959 = additionalMedicare > 0 || additionalWithheld > 0 ? { 1: medicareWages, 5: amtThreshold, 6: Math.max(0, medicareWages - amtThreshold), 7: wageAdditional, 8: seEarnings, 13: seAdditional, 18: additionalMedicare, 19: medicareWithheld, 20: medicareWages, 21: ofBasis(medicareWages, medicare.employeeBasisPoints), 22: additionalWithheld, 24: additionalWithheld } : null;

  const netInvestmentIncome = Math.max(0, taxableInterest + ordinaryDividends + scheduleE.line26 + Math.max(capitalLine, d.has ? d.allowedLoss : 0) + positive(answers.otherNetInvestmentIncome));
  const niitThreshold = fromCents(niit.thresholdCents[status]);
  const niitTax = ofBasis(Math.min(netInvestmentIncome, Math.max(0, agi - niitThreshold)), niit.basisPoints);
  const form8960 = niitTax > 0 ? { 1: taxableInterest, 2: ordinaryDividends, ...(scheduleE.has ? { '4a': scheduleE.line26, '4c': scheduleE.line26 } : {}), '5a': capitalLine, 8: netInvestmentIncome, 12: netInvestmentIncome, 13: agi, 14: niitThreshold, 15: Math.max(0, agi - niitThreshold), 16: Math.min(netInvestmentIncome, Math.max(0, agi - niitThreshold)), 17: niitTax } : null;

  const schedule2 = { '1a': ptcRepayment, '1z': ptcRepayment, 2: 0, 3: ptcRepayment, 4: seTax, 8: earlyDistributionTax, 11: additionalMedicare, 12: niitTax, '17c': hsa.distributionTax, '17d': hsa.testingPeriodTax, 18: hsa.distributionTax + hsa.testingPeriodTax };
  schedule2[21] = schedule2[4] + schedule2[8] + schedule2[11] + schedule2[12] + schedule2[18];
  const line23 = schedule2[21];

  const withheld = (kind, name = 'federalWithheld') => sum(formsOf(input, kind), (form) => field(form, name));
  const line25a = withheld('W-2');
  const line25b = withheld('1099-INT') + withheld('1099-DIV') + withheld('1099-NEC') + withheld('1099-MISC') + withheld('1099-G') + withheld('1099-R') + withheld('SSA-1099') + sum(formsOf(input, '1099-B'), (form) => positive(form.fields?.federalWithheld) + sum(Array.isArray(form.fields?.transactions) ? form.fields.transactions : [], (row) => positive(row.federalWithheld)));
  const line25c = additionalWithheld;
  const line25d = line25a + line25b + line25c;
  const line26 = positive(answers.estimatedTaxPayments) + positive(answers.priorYearOverpaymentApplied);

  const investmentIncome = taxableInterest + taxExemptInterest + ordinaryDividends + Math.max(0, capitalLine);
  let line27 = 0;
  let eic = null;
  const eitcRow = eitc.byChildren[eitcChildren];
  const eitcStart = fromCents(status === 'mfj' ? eitcRow.phaseOutStartCents.joint : eitcRow.phaseOutStartCents.other);
  const band = fromCents(eitc.bandCents);
  const eitcReasons = [];
  if (status === 'mfs' && !answers.separatedFromSpouse) eitcReasons.push('married filing separately without living apart from the spouse for the last six months of the year');
  else if (status === 'mfs' && eitcChildren === 0) eitcReasons.push('married filing separately can take the credit only with a qualifying child who lived with you more than half the year');
  if (hasSpouse && sp.ssnValid === false) eitcReasons.push('your spouse has no SSN valid for work');
  if (investmentIncome > fromCents(eitc.investmentIncomeLimitCents)) eitcReasons.push(`investment income above ${fromCents(eitc.investmentIncomeLimitCents)}`);
  if (tp.canBeClaimedAsDependent) eitcReasons.push('you can be claimed as someone else\'s dependent');
  if (tp.ssnValid === false) eitcReasons.push('no SSN valid for work');
  if (eitcChildren === 0) {
    const ages = [tpAge, hasSpouse ? spAge : null].filter((age) => age !== null);
    if (!ages.some((age) => age >= eitc.noChildMinAge && age <= eitc.noChildMaxAge)) eitcReasons.push(`without a qualifying child, you or your spouse must be ${eitc.noChildMinAge} to ${eitc.noChildMaxAge}`);
  }
  if (earnedIncome > 0 && !eitcReasons.length) {
    const onEarned = eitcAt(earnedIncome, eitcRow, eitcStart, band);
    const onAgi = agi >= eitcStart ? eitcAt(agi, eitcRow, eitcStart, band) : onEarned;
    line27 = Math.min(onEarned, onAgi);
    eic = { qualifyingChildren: eitcChildren, earnedIncome, agi, onEarnedIncome: onEarned, onAgi, credit: line27 };
  } else if (earnedIncome > 0) eic = { qualifyingChildren: eitcChildren, earnedIncome, agi, credit: 0, notAllowed: eitcReasons };

  const actcCap = ctcChildren * fromCents(ctc.refundablePerChildCents);
  const line19of8812 = Math.max(0, earnedIncome - fromCents(ctc.earnedIncomeFloorCents));
  const line20of8812 = ofBasis(line19of8812, ctc.refundableBasisPoints);
  let line28 = 0;
  let partIIB = null;
  const excessSs = [];
  for (const owner of owners) {
    const forms = ownerWages(owner);
    const maxSs = ofBasis(fromCents(socialSecurity.wageBaseCents), socialSecurity.employeeBasisPoints);
    const withheldSs = sum(forms, (form) => Math.min(field(form, 'socialSecurityTax'), maxSs));
    if (forms.length > 1 && withheldSs > maxSs) excessSs.push(withheldSs - maxSs);
    if (forms.some((form) => field(form, 'socialSecurityTax') > maxSs)) checks.push(check('warning', 'EMPLOYER_OVERWITHHELD_SS', 'One employer withheld more Social Security tax than the yearly maximum; ask that employer to refund it (it cannot be claimed on the return).', ''));
  }
  const line11of3 = sum(excessSs);
  const withheldFica = sum(w2s, (form) => field(form, 'socialSecurityTax') + field(form, 'medicareTax')) + wageAdditional - additionalWithheld + Math.round(seAdditional / 2);
  const actcFicaPart = Math.max(0, withheldFica + seDeduction - (line27 + line11of3));

  const schedule3 = { 1: foreignCredit, 2: careCredit, 3: educationCredit };
  const creditsOn3 = (keys) => keys.reduce((total, key) => total + (schedule3[key] || 0), 0);
  const saverPeople = [
    { name: 'You', age: tpAge, dependent: Boolean(tp.canBeClaimedAsDependent), student: yes(answers.saverStudent), ira: positive(answers.saverIraContributions), able: positive(answers.saverAbleContributions), deferrals: sum(ownerWages('taxpayer'), (form) => electiveDeferrals(form.fields?.box12)), distributions: positive(answers.saverDistributions) },
    { name: 'Your spouse', age: spAge, dependent: Boolean(sp.canBeClaimedAsDependent), student: yes(answers.spouseSaverStudent), ira: positive(answers.spouseSaverIraContributions), able: positive(answers.spouseSaverAbleContributions), deferrals: sum(ownerWages('spouse'), (form) => electiveDeferrals(form.fields?.box12)), distributions: positive(answers.spouseSaverDistributions) },
  ].slice(0, hasSpouse ? 2 : 1);
  const form8880 = saverPeople.some((person) => person.ira + person.able + person.deferrals > 0) ? computeForm8880({ filingStatus: status, agi, people: saverPeople, taxLimit: line18 - creditsOn3([1, 2, 3]), rule: saversRule }) : null;
  if (form8880) for (const item of form8880.checks) checks.push(check(item.level, item.code, item.message, item.fix, '8880'));
  schedule3[4] = form8880 ? form8880.credit : 0;

  const energyChecks = [];
  const energyItems = energyItemsFor(formsOf(input, '5695-ITEM').map((form) => ({ payer: form.payer, ...(form.fields || {}) })), taxYear, energyChecks);
  const homeAnswers = { mainHome: answers.energyMainHome, originalUser: answers.energyOriginalUser, newConstruction: answers.energyNewConstruction };
  if (homeRule.allowed && energyItems.some((item) => item.category !== 'battery' && !['solar-electric', 'solar-water', 'small-wind', 'geothermal'].includes(item.category)) && Object.values(homeAnswers).some((value) => value === undefined)) energyChecks.push({ level: 'warning', code: 'ENERGY_HOME_UNANSWERED', message: 'The energy credits were figured as if the improvements are on your main home in the United States, you are the original user, and they are not part of building a new home (Form 5695 lines 7a, 17a to 17e and 21b).', fix: 'Answer the home questions for Form 5695 in the interview.' });
  const homeImprovement = homeImprovementCredit({ items: energyItems, ...homeAnswers, taxLimit: line18 - creditsOn3([1, 2, 3, 4]), rule: homeRule });
  if (homeImprovement) energyChecks.push(...homeImprovement.checks);
  if (homeRule.allowed) schedule3['5b'] = homeImprovement ? homeImprovement.credit : 0;
  const ctcLimitBase = Math.max(0, line18 - creditsOn3([1, 2, 3, 4, '5b']));
  const cleanTentative = cleanEnergyTentative({ items: energyItems, mainHome: answers.energyMainHome, carryforward: answers.energyCarryforward, rule: cleanRule });
  if (cleanTentative) energyChecks.push(...cleanTentative.checks);
  const worksheetB = Boolean(cleanTentative && cleanTentative.tentative > 0 && ctcChildren > 0 && !answers.foreignEarnedIncomeExclusion);
  const worksheetB12 = ctcChildren >= 3 && line20of8812 < ctcAfter ? Math.max(line20of8812, actcFicaPart) : line20of8812;
  const worksheetB13 = Math.min(actcCap, worksheetB12);
  const worksheetB14 = worksheetB13 > ctcAfter ? 0 : ctcAfter - worksheetB13;
  let cleanEnergy = worksheetB ? cleanEnergyCredit(cleanTentative, ctcLimitBase - worksheetB14) : null;
  const ctcLimit = Math.max(0, ctcLimitBase - (cleanEnergy ? cleanEnergy.credit : 0));
  const line19 = Math.min(ctcAfter, ctcLimit);
  if (cleanTentative && !cleanEnergy) cleanEnergy = cleanEnergyCredit(cleanTentative, ctcLimitBase - line19);
  if (cleanEnergy) energyChecks.push(...cleanEnergy.checks);
  for (const item of energyChecks) checks.push(check(item.level, item.code, item.message, item.fix, '5695'));
  schedule3['5a'] = cleanEnergy ? cleanEnergy.credit : 0;
  const form5695 = cleanEnergy || homeImprovement ? { ...(cleanEnergy ? cleanEnergy.lines : {}), ...(homeImprovement ? homeImprovement.lines : {}), ...(worksheetB ? { creditLimitWorksheetB14: worksheetB14 } : {}) } : null;
  schedule3[8] = creditsOn3([1, 2, 3, 4, '5a', '5b']);

  const line20 = schedule3[8];
  const line21 = line19 + line20;
  const line22 = Math.max(0, line18 - line21);
  const line24 = line22 + line23;

  const ctcLeft = ctcAfter - line19;
  const line17of8812 = Math.min(ctcLeft, actcCap);
  if (line17of8812 > 0 && !answers.foreignEarnedIncomeExclusion) {
    let allowed = Math.min(line17of8812, line20of8812);
    if (ctcChildren >= 3 && line20of8812 < line17of8812) {
      partIIB = { 21: withheldFica, 22: seDeduction, 23: withheldFica + seDeduction, 24: line27 + line11of3, 25: actcFicaPart, 26: Math.max(line20of8812, actcFicaPart) };
      allowed = Math.min(line17of8812, Math.max(line20of8812, actcFicaPart));
    }
    line28 = allowed;
  }
  const form8812 = ctcBase > 0 ? { 4: ctcChildren, 5: ctcChildren * fromCents(ctc.perChildCents), 6: otherDependents, 7: otherDependents * fromCents(ctc.otherDependentCents), 8: ctcBase, 9: ctcStart, 10: ctcExcess, 11: ctcReduction, 12: ctcAfter, 13: ctcLimit, 14: line19, '16a': ctcLeft, '16b': actcCap, 17: line17of8812, '18a': earnedIncome, 19: line19of8812, 20: line20of8812, ...(partIIB || {}), 27: line28 } : null;

  const line29 = aotcRefundable;
  schedule3[9] = netPremiumTaxCredit;
  schedule3[11] = line11of3;
  schedule3[15] = schedule3[9] + line11of3;
  const line31 = schedule3[15];
  const line32 = line27 + line28 + line29 + line31;
  const line33 = line25d + line26 + line32;
  const line34 = Math.max(0, line33 - line24);
  const applyNext = Math.min(line34, positive(answers.applyToNextYear));
  const line35a = line34 - applyNext;
  const line37 = Math.max(0, line24 - line33);

  const taxableBeforeFloor = agi - line14;
  const carryover = d.has ? lossCarryover(d, taxableBeforeFloor) : { shortTerm: 0, longTerm: 0 };

  const lines = {
    '1a': wages, ...(line1e ? { '1e': line1e } : {}), '1z': line1z, '2a': taxExemptInterest, '2b': taxableInterest, '3a': qualifiedDividends, '3b': ordinaryDividends,
    '4a': sum(iraForms, (form) => field(form, 'grossDistribution')), '4b': line4b, '5a': sum(pensionForms, (form) => field(form, 'grossDistribution')), '5b': line5b,
    '6a': benefits, '6b': ss.taxable, 7: capitalLine, 8: schedule1Part1[10], 9: totalIncome, 10: adjustments[26], 11: agi,
    12: line12, '13a': line13a, '13b': line13b, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24,
    '25a': line25a, '25b': line25b, '25c': line25c, '25d': line25d, 26: line26, 27: line27, 28: line28, 29: line29, 31: line31, 32: line32, 33: line33, 34: line34, '35a': line35a, 36: applyNext, 37: line37,
  };
  const stringKeys = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [String(key), value]));
  const all5329 = forms5329.map((item) => ({ owner: item.owner, fileRequired: item.fileRequired, exceptionNumber: item.result.exceptionNumber, lines: stringKeys(item.result.lines) }));
  const filed5329 = all5329.filter((item) => item.fileRequired);
  const schedules = {
    1: stringKeys({ ...schedule1Part1, ...adjustments }),
    ...(line13b > 0 ? { '1-A': stringKeys(schedule1A) } : {}),
    ...(schedule2[21] + schedule2[3] > 0 ? { 2: stringKeys(schedule2) } : {}),
    ...(schedule3[8] + schedule3[15] > 0 ? { 3: stringKeys(schedule3) } : {}),
    ...(itemize ? { A: stringKeys(scheduleA) } : {}),
    ...(taxableInterest > 1500 || ordinaryDividends > 1500 ? { B: { interest: ints.map((form) => ({ payer: form.payer || '', amount: field(form, 'interest') + field(form, 'treasuryInterest') })), dividends: divs.map((form) => ({ payer: form.payer || '', amount: field(form, 'ordinaryDividends') })), 4: taxableInterest, 6: ordinaryDividends } } : {}),
    ...(businesses.length ? { C: businesses.map((item) => ({ id: item.id, name: item.name, owner: item.owner, source: item.source, lines: stringKeys(item.lines), expenses: item.expenses })) } : {}),
    ...(d.has ? { D: { ...stringKeys(d.lines), carryoverToNextYear: carryover }, 8949: d.transactions.map(({ formId, ...row }) => row) } : {}),
    ...(scheduleE.has ? { E: { properties: scheduleE.properties.map((item) => ({ ...item, lines: stringKeys(item.lines) })), lines: stringKeys(scheduleE.lines), depreciation: scheduleE.properties.filter((item) => item.depreciation).map((item) => ({ property: item.name, ...item.depreciation })), unallowedLossCarryforward: scheduleE.carryforward, magiForPassiveLoss: scheduleE.magi } } : {}),
    ...(scheduleE.form8582 ? { 8582: { ...scheduleE.form8582, lines: stringKeys(scheduleE.form8582.lines) } } : {}),
    ...(scheduleE.form4562?.length ? { 4562: scheduleE.form4562 } : {}),
    ...(seByOwner.length ? { SE: seByOwner.map((item) => ({ owner: item.owner, belowMinimum: item.below, lines: stringKeys(item.lines) })) } : {}),
    ...(form2441 ? { 2441: stringKeys(form2441) } : {}),
    ...(hsa.forms.length ? { 8889: hsa.forms.map((item) => ({ owner: item.owner, lines: stringKeys(item.lines) })) } : {}),
    ...(form8812 ? { 8812: stringKeys(form8812) } : {}),
    ...(form5695 ? { 5695: stringKeys(form5695) } : {}),
    ...(form8863 ? { 8863: form8863 } : {}),
    ...(form8880 ? { 8880: form8880.lines } : {}),
    ...(filed5329.length ? { 5329: filed5329 } : {}),
    ...(form8606.required ? { 8606: [{ owner: 'taxpayer', lines: stringKeys(form8606.lines), basisCarryforward: form8606.basisCarryforward }] } : {}),
    ...(form8962 ? { 8962: { ...stringKeys(form8962.lines), method: form8962.method, applicable: form8962.applicable } } : {}),
    ...(form8959 ? { 8959: stringKeys(form8959) } : {}),
    ...(form8960 ? { 8960: stringKeys(form8960) } : {}),
    ...(form8995 ? { 8995: stringKeys(form8995) } : {}),
    ...(eic ? { EIC: eic } : {}),
  };
  if (!w2s.length && !(input.forms || []).some((form) => !['2441-PROVIDER', '5695-ITEM'].includes(form.kind)) && !businesses.length) checks.push(check('warning', 'NO_INCOME_DOCUMENTS', 'No W-2, 1099 or business income has been added yet.', 'Add your tax forms.'));
  const penalty = read('us.federal.individual.estimated-tax-penalty');
  if (penalty) {
    const paid = line25d + line26 + line31;
    const currentTax = Math.max(0, line24 - line27 - line28 - line29);
    const priorYearTax = answers.priorYearTax === undefined || answers.priorYearTax === '' ? null : positive(answers.priorYearTax);
    const priorShare = priorYearTax === null ? null : ofBasis(priorYearTax, positive(answers.priorYearAgi) > fromCents(status === 'mfs' ? penalty.highIncomeAgiCents.mfs : penalty.highIncomeAgiCents.other) ? penalty.highIncomePriorYearBasisPoints : penalty.priorYearBasisPoints);
    const required = Math.min(ofBasis(currentTax, penalty.currentYearBasisPoints), priorShare === null ? Infinity : priorShare);
    if (currentTax - line25d - line31 >= fromCents(penalty.minimumUnderpaymentCents) && paid < required) needForm('2210', 'FORM_2210_MAY_APPLY', `Tax paid during the year is below the required annual payment${priorShare === null ? ' (90% of this year\'s tax; last year\'s tax was not given)' : ''}, so an underpayment penalty may apply. Form 2210 is not prepared; the IRS can work out the penalty and bill it.`, 'Answer last year\'s tax in the interview, or have your CPA prepare Form 2210.', false);
  }
  if (agi > 200000) checks.push(check('warning', 'AMT_NOT_COMPUTED', 'The alternative minimum tax is not computed; at this income it rarely applies without incentive stock options or large state taxes, but your CPA should confirm.', ''));

  const rulesUsed = [...used.values()].map((record) => `${record.id}@${record.effectiveFrom}`);
  const unreviewed = [...used.values()].some((record) => !(record.attestations || []).some((item) => item.verdict === 'verified'));
  return {
    ok: true,
    data: {
      taxYear,
      filingStatus: status,
      filingStatusLabel: STATUS_LABEL[status],
      lines: stringKeys(lines),
      schedules,
      summary: { totalIncome, agi, deduction: line12, itemized: itemize, standardDeduction, itemizedTotal: scheduleA[17], taxableIncome: line15, tax: line16, credits: line21, otherTaxes: line23, totalTax: line24, payments: line33, refund: line35a, owed: line37, effectiveRate: totalIncome > 0 ? Math.round((line24 / totalIncome) * 10000) / 100 : 0 },
      dependents: dependents.map((item) => ({ firstName: item.firstName || '', lastName: item.lastName || '', relationship: item.relationship || '', age: item.age, ctcEligible: item.ctcEligible, odcEligible: item.odcEligible, eitcChild: item.eitcChild })),
      qualifiedDividendsWorksheet: worksheet ? worksheet.worksheet : null,
      socialSecurityWorksheet: ss.worksheet,
      capitalLossCarryover: carryover,
      qbiCarryforward: qbiResult ? qbiResult.carryforward : hasCurrentQbi && beforeQbi > qbiThreshold ? null : { qbiLoss: 0, reitPtpLoss: 0 },
      qbiBusinesses: qbiResult ? qbiResult.businesses : [],
      passiveLossCarryover: scheduleE.has ? scheduleE.carryforward : [],
      form5329: all5329,
      retirementCarryforward: { iraBasis: form8606.basisCarryforward, ...(form8606.rothBasisLeft ? { rothContributionBasis: form8606.rothBasisLeft.contributions, rothConversionBasis: form8606.rothBasisLeft.conversions } : {}), iraExcess: sum(forms5329, (item) => item.result.iraExcessCarryforward), rothExcess: sum(forms5329, (item) => item.result.rothExcessCarryforward) },
      checks,
      rulesUsed,
      unreviewed,
      unsupported,
      notCovered: NOT_COVERED,
      notes: [
        'Whole dollars, rounded as the IRS allows. Tax under $100,000 of taxable income uses the Tax Table method (the middle of each $50 band); the EIC uses the same $50 bands as the EIC Table.',
        'Line numbers follow the 2025 Form 1040 and schedules; the e-file layer maps them to the IRS schema for the year filed.',
        ...(unreviewed ? ['The rates and limits come from dated rules a US CPA has not reviewed yet.'] : []),
      ],
    },
  };
}

