import { rules } from './sprint-load.mjs';

export const FILING_STATUSES = Object.freeze(['single', 'mfj', 'mfs', 'hoh', 'qss']);
export const SUPPORTED_YEARS = Object.freeze(['2025', '2026']);
export const FORM_KINDS = Object.freeze(['W-2', '1099-INT', '1099-DIV', '1099-B', '1099-NEC', '1099-MISC', '1099-G', '1099-R', 'SSA-1099', '1098', '1098-E', '1098-T']);
const LONG_STATUS = Object.freeze({ single: 'single', mfj: 'married_joint', mfs: 'married_separate', hoh: 'head_of_household', qss: 'single' });
const STATUS_LABEL = Object.freeze({ single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately', hoh: 'Head of household', qss: 'Qualifying surviving spouse' });
const CHILD_RELATIONSHIPS = new Set(['son', 'daughter', 'stepchild', 'foster_child', 'brother', 'sister', 'half_brother', 'half_sister', 'stepbrother', 'stepsister', 'grandchild', 'niece', 'nephew']);
const NOT_COVERED = Object.freeze([
  'Alternative minimum tax (Form 6251)',
  'Rental, royalty, partnership, S corporation and trust income (Schedule E, Schedule K-1)',
  'Sale of business property (Form 4797) and depreciation (Form 4562)',
  'Unrecaptured section 1250 gain and collectibles (Schedule D tax worksheet)',
  'Child and dependent care credit (Form 2441), retirement savings credit (Form 8880) and clean energy credits',
  'Premium tax credit (Form 8962), HSA (Form 8889) and IRA deduction worksheets: the deductible amounts are taken as entered',
  'Additional tax on early retirement distributions (Form 5329) and household employment taxes (Schedule H)',
  'Qualified business income above the threshold (Form 8995-A)',
  'Estimated tax penalty (Form 2210)',
  'State returns',
]);

const dollars = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const positive = (value) => Math.max(0, dollars(value));
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);
const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const sum = (items, pick = (item) => item) => items.reduce((total, item) => total + dollars(pick(item)), 0);
const joint = (status) => status === 'mfj' || status === 'qss';
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

function personOf(input, owner) {
  return owner === 'spouse' ? input.spouse || {} : input.taxpayer || {};
}

function formsOf(input, kind) {
  return (input.forms || []).filter((form) => form.kind === kind);
}

function field(form, name) {
  return dollars(form.fields?.[name]);
}

export function dependentFlags(dependent, taxYear) {
  const age = ageAtYearEnd(dependent.dateOfBirth, taxYear);
  const months = Number(dependent.months ?? 12);
  const childRelation = CHILD_RELATIONSHIPS.has(String(dependent.relationship || ''));
  const lived = months > 6 || Boolean(dependent.bornOrDiedInYear);
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
      const proceeds = dollars(item.proceeds);
      const basis = dollars(item.costBasis);
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
    return { id: item.id || `business-${index + 1}`, name: String(item.name || 'Business'), owner: item.owner === 'spouse' ? 'spouse' : 'taxpayer', source: item.source || 'manual', lines: { 1: grossReceipts, 2: returns, 4: costOfGoods, 7: grossIncome, 28: totalExpenses, 31: grossIncome - totalExpenses }, expenses, netProfit: grossIncome - totalExpenses };
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
  if (netEarnings < minimum) return { owner: person, netEarnings, below: true, lines: { 2: netProfit, '4a': netEarnings, 12: 0, 13: 0 }, tax: 0, deduction: 0 };
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

function steppedPhaseOut(amount, magi, start, perThousand) {
  if (magi <= start) return amount;
  const steps = Math.ceil((magi - start) / 1000);
  return Math.max(0, amount - steps * perThousand);
}

function check(level, code, message, fix = '') {
  return { level, code, message, fix };
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
  if (missing.some((id) => !['us.federal.individual.senior-deduction', 'us.federal.individual.tips-deduction', 'us.federal.individual.overtime-deduction', 'us.federal.individual.car-loan-interest'].includes(id))) return { ok: false, error: 'RULE_NOT_IN_FORCE', taxYear, missing };

  const answers = input.answers || {};
  const checks = [];
  const married = status === 'mfj' || status === 'mfs';
  const hasSpouse = status === 'mfj';
  const owners = hasSpouse ? ['taxpayer', 'spouse'] : ['taxpayer'];
  const ownerOf = (form) => (form.owner === 'spouse' && hasSpouse ? 'spouse' : 'taxpayer');
  if (status === 'mfj' && !input.spouse) checks.push(check('error', 'SPOUSE_REQUIRED', 'A joint return needs the spouse\'s name, SSN and date of birth.', 'Add the spouse on the About you step.'));
  if (input.spouse === undefined && status === 'mfs') checks.push(check('warning', 'SPOUSE_NAME_FOR_MFS', 'A separate return still shows the spouse\'s name and SSN.', 'Add the spouse on the About you step.'));
  for (const form of input.forms || []) if (form.owner === 'spouse' && !hasSpouse) checks.push(check('error', 'SPOUSE_FORM_ON_NON_JOINT', `${form.kind} from ${form.payer || 'a payer'} belongs to the spouse, which only a joint return includes.`, 'Remove it or change the filing status.'));

  const dependents = (input.dependents || []).map((dependent) => ({ ...dependent, ...dependentFlags(dependent, taxYear) }));
  const ctcChildren = dependents.filter((item) => item.ctcEligible).length;
  const otherDependents = dependents.length - ctcChildren;
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
  const iraForms = retirement.filter((form) => form.fields?.iraSepSimple);
  const pensionForms = retirement.filter((form) => !form.fields?.iraSepSimple);
  const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? field(form, 'grossDistribution') : field(form, 'taxableAmount'));
  for (const form of retirement) if (['1', 'J', 'S'].includes(String(form.fields?.distributionCode || '').toUpperCase())) checks.push(check('warning', 'EARLY_DISTRIBUTION', `${form.payer || 'A'} 1099-R has distribution code ${form.fields.distributionCode}: a 10% additional tax may apply (Form 5329), which MyCA does not compute.`, 'Ask your CPA whether an exception applies.'));
  const benefits = sum(formsOf(input, 'SSA-1099'), (form) => field(form, 'netBenefits'));
  const gForms = formsOf(input, '1099-G');
  const unemployment = sum(gForms, (form) => field(form, 'unemployment'));
  const stateRefunds = sum(gForms, (form) => field(form, 'stateRefund'));
  const stateRefundTaxable = Math.min(stateRefunds, positive(answers.stateRefundTaxable));
  if (stateRefunds > 0 && answers.stateRefundTaxable === undefined) checks.push(check('warning', 'STATE_REFUND_TAXABILITY', 'A state or local tax refund is taxable only to the extent it reduced last year\'s itemized deduction.', 'Answer the state refund question in the interview.'));
  const miscForms = formsOf(input, '1099-MISC');
  const miscOther = sum(miscForms, (form) => field(form, 'otherIncome'));
  if (miscForms.some((form) => field(form, 'rents') || field(form, 'royalties'))) checks.push(check('error', 'SCHEDULE_E_NOT_COVERED', 'Rents or royalties on a 1099-MISC go on Schedule E, which MyCA does not prepare yet.', 'Have your CPA prepare Schedule E.'));
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

  const d = scheduleD(input, status, read);
  const capitalLine = d.has ? d.toForm1040 : 0;

  const schedule1Part1 = { 1: stateRefundTaxable, 3: businessIncome, 7: unemployment, '8z': otherIncome, 9: otherIncome };
  schedule1Part1[10] = schedule1Part1[1] + schedule1Part1[3] + schedule1Part1[7] + schedule1Part1[9];

  const educatorCap = educator ? fromCents(educator.maxPerEducatorCents) : 0;
  const educatorDeduction = Math.min(positive(answers.educatorExpenses), educatorCap) + (hasSpouse ? Math.min(positive(answers.spouseEducatorExpenses), educatorCap) : 0);
  const earlyWithdrawal = sum(ints, (form) => field(form, 'earlyWithdrawalPenalty'));
  const adjustments = { 11: educatorDeduction, 13: positive(answers.hsaDeduction), 15: seDeduction, 16: positive(answers.retirementPlanDeduction), 17: positive(answers.selfEmployedHealthInsurance), 18: earlyWithdrawal, 20: positive(answers.iraDeduction) };
  if (adjustments[17] > 0 && adjustments[17] > Math.max(0, businessIncome - seDeduction - adjustments[16])) checks.push(check('warning', 'SE_HEALTH_ABOVE_PROFIT', 'Self-employed health insurance is limited to the business profit less the SE tax and retirement deductions.', 'Check the amount with your CPA.'));

  const line1z = wages;
  const line4b = sum(iraForms, taxableOf);
  const line5b = sum(pensionForms, taxableOf);
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

  const tp = input.taxpayer || {};
  const sp = input.spouse || {};
  const tpAge = ageAtYearEnd(tp.dateOfBirth, taxYear, { dayBefore: true });
  const spAge = married ? ageAtYearEnd(sp.dateOfBirth, taxYear, { dayBefore: true }) : null;
  if (!birthParts(tp.dateOfBirth)) checks.push(check('warning', 'TAXPAYER_DOB_MISSING', 'Your date of birth decides the extra standard deduction and senior deduction at 65.', 'Add it on the About you step.'));
  const boxes = [tpAge !== null && tpAge >= 65, Boolean(tp.blind), hasSpouse && spAge !== null && spAge >= 65, hasSpouse && Boolean(sp.blind), status === 'mfs' && answers.spouseHasNoIncome && spAge !== null && spAge >= 65, status === 'mfs' && answers.spouseHasNoIncome && Boolean(sp.blind)].filter(Boolean).length;
  const additional = boxes * fromCents(married || status === 'qss' ? standard.additionalMarriedCents : standard.additionalUnmarriedCents);
  const earnedIncome = wages + sum(seByOwner, (item) => item.netEarnings > 0 ? item.lines[2] - item.deduction : 0);
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
  const mortgageInterest = sum(mortgageForms, (form) => field(form, 'mortgageInterest') + field(form, 'pointsPaid')) + positive(answers.otherMortgageInterest);
  if (mortgageForms.some((form) => field(form, 'outstandingPrincipal') > 750000) || sum(mortgageForms, (form) => field(form, 'outstandingPrincipal')) > (status === 'mfs' ? 375000 : 750000)) checks.push(check('warning', 'MORTGAGE_DEBT_LIMIT', 'Mortgage principal is above the acquisition debt limit, so only part of the interest is deductible (Pub. 936 worksheet), which MyCA does not prorate.', 'Have your CPA apply the Pub. 936 limit.'));
  const cashGifts = positive(answers.charityCash);
  const nonCashGifts = positive(answers.charityNonCash);
  if (nonCashGifts > 500) checks.push(check('warning', 'FORM_8283', 'Non-cash gifts over $500 need Form 8283, which MyCA does not prepare.', ''));
  const charityFloor = ofBasis(Math.max(0, agi), charitable.itemizedFloorBasisPoints);
  const cashAllowed = Math.min(cashGifts, ofBasis(Math.max(0, agi), charitable.cashAgiLimitBasisPoints));
  const nonCashAllowed = Math.min(nonCashGifts, ofBasis(Math.max(0, agi), 3000), Math.max(0, ofBasis(Math.max(0, agi), charitable.cashAgiLimitBasisPoints) - cashAllowed));
  const charityDeduction = Math.max(0, cashAllowed + nonCashAllowed - charityFloor);
  const otherItemized = positive(answers.otherItemizedDeductions);
  const scheduleA = { 1: medicalPaid, 2: agi, 3: medicalFloor, 4: medicalDeduction, '5a': line5a, '5b': realEstate, '5c': personalProperty, '5d': line5d, '5e': line5e, 7: line5e, '8a': mortgageInterest, 10: mortgageInterest, 11: cashAllowed, 12: nonCashAllowed, 14: charityDeduction, 16: otherItemized };
  scheduleA[17] = medicalDeduction + line5e + mortgageInterest + charityDeduction + otherItemized;
  const preference = answers.itemize;
  const itemize = spouseItemizes || preference === 'yes' || (preference !== 'no' && scheduleA[17] > standardDeduction);
  const line12 = itemize ? scheduleA[17] : standardDeduction;
  if (taxYear >= '2026' && itemize) checks.push(check('warning', 'ITEMIZED_37_LIMIT', 'From 2026, itemized deductions of a taxpayer in the 37% bracket are reduced so they save at most 35 cents a dollar; MyCA does not apply that reduction.', 'Ask your CPA if your income is in the top bracket.'));
  const nonItemizerCharity = !itemize ? Math.min(cashGifts, fromCents(jointOr(charitable.nonItemizerCents, status))) : 0;

  const magi = agi;
  const schedule1A = {};
  const ownerWages = (owner) => w2s.filter((form) => ownerOf(form) === owner);
  if (tips) {
    const qualifiedTips = positive(answers.qualifiedTips) + (hasSpouse ? positive(answers.spouseQualifiedTips) : 0);
    if (qualifiedTips > 0) {
      if (status === 'mfs') checks.push(check('warning', 'TIPS_MFS', 'The tips deduction needs a joint return if you are married.', ''));
      else schedule1A[13] = steppedPhaseOut(Math.min(qualifiedTips, fromCents(tips.maxCents)), magi, fromCents(jointOr(tips.phaseOutStartCents, status)), fromCents(tips.phaseOutPerThousandCents));
    }
  }
  if (overtime) {
    const premium = positive(answers.qualifiedOvertime) + (hasSpouse ? positive(answers.spouseQualifiedOvertime) : 0);
    if (premium > 0) {
      if (status === 'mfs') checks.push(check('warning', 'OVERTIME_MFS', 'The overtime deduction needs a joint return if you are married.', ''));
      else schedule1A[21] = steppedPhaseOut(Math.min(premium, fromCents(jointOr(overtime.maxCents, status))), magi, fromCents(jointOr(overtime.phaseOutStartCents, status)), fromCents(overtime.phaseOutPerThousandCents));
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
  const qbiIncome = businessIncome - seDeduction - adjustments[16] - adjustments[17];
  const qbiThreshold = fromCents(qbi.thresholdCents[status]);
  let line13a = 0;
  let form8995 = null;
  if (qbiIncome !== 0 || reitDividends > 0) {
    if (beforeQbi > qbiThreshold) checks.push(check('error', 'QBI_ABOVE_THRESHOLD', `Taxable income before the QBI deduction is above ${qbiThreshold}, so Form 8995-A applies, which MyCA does not prepare; no QBI deduction is included.`, 'Have your CPA prepare Form 8995-A.'));
    else {
      const component = ofBasis(Math.max(0, qbiIncome), qbi.basisPoints) + ofBasis(reitDividends, qbi.basisPoints);
      const incomeLimit = ofBasis(Math.max(0, beforeQbi - (qualifiedDividends + d.netCapitalGain)), qbi.basisPoints);
      line13a = Math.min(component, incomeLimit);
      form8995 = { 2: Math.max(0, qbiIncome), 5: ofBasis(Math.max(0, qbiIncome), qbi.basisPoints), 6: reitDividends, 10: component, 11: beforeQbi, 12: qualifiedDividends + d.netCapitalGain, 14: incomeLimit, 15: line13a, ...(qbiIncome < 0 ? { 16: qbiIncome } : {}) };
    }
  }
  const line14 = line12 + line13a + line13b;
  const line15 = Math.max(0, agi - line14);

  const bands = brackets[bracketKey(status)];
  const preferential = qualifiedDividends + d.netCapitalGain;
  const worksheet = preferential > 0 ? qualifiedDividendsWorksheet({ taxable: line15, qualifiedDividends, netCapitalGain: d.netCapitalGain, status, bands, capitalGains }) : null;
  const line16 = worksheet ? worksheet.tax : regularTax(line15, bands);
  const line17 = 0;
  const line18 = line16 + line17;

  const foreignTax = sum(divs, (form) => field(form, 'foreignTaxPaid')) + sum(ints, (form) => field(form, 'foreignTaxPaid'));
  let foreignCredit = 0;
  if (foreignTax > 0) {
    if (foreignTax <= fromCents(jointOr(foreignElection.maxCents, status))) foreignCredit = Math.min(foreignTax, line18);
    else checks.push(check('error', 'FORM_1116_NEEDED', `Foreign tax paid (${foreignTax}) is above the amount claimable without Form 1116, which MyCA does not prepare; no foreign tax credit is included.`, 'Have your CPA prepare Form 1116.'));
  }

  const educationRows = [];
  let aotcTotal = 0;
  let llcExpenses = 0;
  const students = Array.isArray(answers.education) && answers.education.length ? answers.education : formsOf(input, '1098-T').map((form) => ({ student: form.fields?.studentName || form.payer || 'Student', credit: form.fields?.atLeastHalfTime && !form.fields?.graduate ? 'aotc' : 'llc', expenses: Math.max(0, field(form, 'tuitionPaid') - field(form, 'scholarships')), aotcPriorYears: 0 }));
  if (students.length && status === 'mfs') checks.push(check('warning', 'EDUCATION_MFS', 'Education credits are not allowed on a separate return.', ''));
  else if (students.length && tp.canBeClaimedAsDependent) checks.push(check('warning', 'EDUCATION_DEPENDENT', 'Someone who can be claimed as a dependent cannot take an education credit; the person claiming them takes it.', ''));
  else {
    for (const student of students) {
      const expenses = positive(student.expenses);
      const wantsAotc = student.credit !== 'llc';
      const aotcAllowed = wantsAotc && Number(student.aotcPriorYears || 0) < education.aotcMaxYears && !student.felonyDrugConviction;
      if (wantsAotc && !aotcAllowed) checks.push(check('warning', 'AOTC_NOT_ALLOWED', `${student.student}: the American opportunity credit is limited to ${education.aotcMaxYears} years and to students without a felony drug conviction, so the lifetime learning credit is used.`, ''));
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
  const aotcRefundable = answers.aotcRefundableBlocked ? 0 : ofBasis(aotcAfter, education.aotcRefundableBasisPoints);
  const llcTentative = ofBasis(Math.min(llcExpenses, fromCents(education.llcExpenseCapCents)), education.llcBasisPoints);
  const llcAfter = Math.round(llcTentative * educationFraction);
  const educationNonrefundableTentative = aotcAfter - aotcRefundable + llcAfter;
  const educationCredit = Math.min(educationNonrefundableTentative, Math.max(0, line18 - foreignCredit));
  const form8863 = students.length && educationRows.length ? { students: educationRows, 1: aotcTotal, 7: aotcAfter, 8: aotcRefundable, 9: aotcAfter - aotcRefundable, 10: llcExpenses, 12: llcTentative, 18: llcAfter + aotcAfter - aotcRefundable, 19: educationCredit, phaseOutFraction: educationFraction } : null;

  const schedule3 = { 1: foreignCredit, 3: educationCredit };
  schedule3[8] = schedule3[1] + schedule3[3];

  const ctcBase = ctcChildren * fromCents(ctc.perChildCents) + otherDependents * fromCents(ctc.otherDependentCents);
  const ctcStart = fromCents(jointOr({ mfj: ctc.phaseOutStartCents.mfj, other: ctc.phaseOutStartCents.other }, status));
  const ctcExcess = magi > ctcStart ? Math.ceil((magi - ctcStart) / 1000) * 1000 : 0;
  const ctcReduction = (ctcExcess / 1000) * fromCents(ctc.phaseOutPerThousandCents);
  const ctcAfter = Math.max(0, ctcBase - ctcReduction);
  const ctcLimit = Math.max(0, line18 - schedule3[8]);
  const line19 = Math.min(ctcAfter, ctcLimit);

  const line20 = schedule3[8];
  const line21 = line19 + line20;
  const line22 = Math.max(0, line18 - line21);

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

  const netInvestmentIncome = Math.max(0, taxableInterest + ordinaryDividends + Math.max(capitalLine, d.has ? d.allowedLoss : 0) + positive(answers.otherNetInvestmentIncome));
  const niitThreshold = fromCents(niit.thresholdCents[status]);
  const niitTax = ofBasis(Math.min(netInvestmentIncome, Math.max(0, magi - niitThreshold)), niit.basisPoints);
  const form8960 = niitTax > 0 ? { 1: taxableInterest, 2: ordinaryDividends, '5a': capitalLine, 8: netInvestmentIncome, 12: netInvestmentIncome, 13: magi, 14: niitThreshold, 15: Math.max(0, magi - niitThreshold), 16: Math.min(netInvestmentIncome, Math.max(0, magi - niitThreshold)), 17: niitTax } : null;

  const schedule2 = { 1: 0, 3: 0, 4: seTax, 11: additionalMedicare, 12: niitTax };
  schedule2[21] = schedule2[4] + schedule2[11] + schedule2[12];
  const line23 = schedule2[21];
  const line24 = line22 + line23;

  const withheld = (kind, name = 'federalWithheld') => sum(formsOf(input, kind), (form) => field(form, name));
  const line25a = withheld('W-2');
  const line25b = withheld('1099-INT') + withheld('1099-DIV') + withheld('1099-NEC') + withheld('1099-MISC') + withheld('1099-G') + withheld('1099-R') + withheld('SSA-1099') + sum(formsOf(input, '1099-B'), (form) => dollars(form.fields?.federalWithheld) + sum(Array.isArray(form.fields?.transactions) ? form.fields.transactions : [], (row) => row.federalWithheld));
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

  const ctcLeft = ctcAfter - line19;
  const actcCap = ctcChildren * fromCents(ctc.refundablePerChildCents);
  const line17of8812 = Math.min(ctcLeft, actcCap);
  const line19of8812 = Math.max(0, earnedIncome - fromCents(ctc.earnedIncomeFloorCents));
  const line20of8812 = ofBasis(line19of8812, ctc.refundableBasisPoints);
  let line28 = 0;
  const excessSs = [];
  for (const owner of owners) {
    const forms = ownerWages(owner);
    const withheldSs = sum(forms, (form) => field(form, 'socialSecurityTax'));
    const maxSs = ofBasis(fromCents(socialSecurity.wageBaseCents), socialSecurity.employeeBasisPoints);
    if (forms.length > 1 && withheldSs > maxSs) excessSs.push(withheldSs - maxSs);
    if (forms.length === 1 && withheldSs > maxSs) checks.push(check('warning', 'EMPLOYER_OVERWITHHELD_SS', 'One employer withheld more Social Security tax than the yearly maximum; ask that employer to refund it (it cannot be claimed on the return).', ''));
  }
  const line11of3 = sum(excessSs);
  if (line17of8812 > 0 && !answers.foreignEarnedIncomeExclusion) {
    let allowed = Math.min(line17of8812, line20of8812);
    if (ctcChildren >= 3 && line20of8812 < line17of8812) {
      const withheldFica = sum(w2s, (form) => field(form, 'socialSecurityTax') + field(form, 'medicareTax')) + line25c;
      const line25 = Math.max(0, withheldFica + seDeduction - (line27 + line11of3));
      allowed = Math.min(line17of8812, Math.max(line20of8812, line25));
    }
    line28 = allowed;
  }
  const form8812 = ctcBase > 0 ? { 4: ctcChildren, 5: ctcChildren * fromCents(ctc.perChildCents), 6: otherDependents, 7: otherDependents * fromCents(ctc.otherDependentCents), 8: ctcBase, 9: ctcStart, 10: ctcExcess, 11: ctcReduction, 12: ctcAfter, 13: ctcLimit, 14: line19, '16a': ctcLeft, '16b': actcCap, 17: line17of8812, '18a': earnedIncome, 19: line19of8812, 20: line20of8812, 27: line28 } : null;

  const line29 = aotcRefundable;
  schedule3[11] = line11of3;
  schedule3[15] = line11of3;
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
    '1a': wages, '1z': line1z, '2a': taxExemptInterest, '2b': taxableInterest, '3a': qualifiedDividends, '3b': ordinaryDividends,
    '4a': sum(iraForms, (form) => field(form, 'grossDistribution')), '4b': line4b, '5a': sum(pensionForms, (form) => field(form, 'grossDistribution')), '5b': line5b,
    '6a': benefits, '6b': ss.taxable, 7: capitalLine, 8: schedule1Part1[10], 9: totalIncome, 10: adjustments[26], 11: agi,
    12: line12, '13a': line13a, '13b': line13b, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24,
    '25a': line25a, '25b': line25b, '25c': line25c, '25d': line25d, 26: line26, 27: line27, 28: line28, 29: line29, 31: line31, 32: line32, 33: line33, 34: line34, '35a': line35a, 36: applyNext, 37: line37,
  };
  const stringKeys = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [String(key), value]));
  const schedules = {
    1: stringKeys({ ...schedule1Part1, ...adjustments }),
    ...(line13b > 0 ? { '1-A': stringKeys(schedule1A) } : {}),
    ...(schedule2[21] > 0 ? { 2: stringKeys(schedule2) } : {}),
    ...(schedule3[8] + schedule3[15] > 0 ? { 3: stringKeys(schedule3) } : {}),
    ...(itemize ? { A: stringKeys(scheduleA) } : {}),
    ...(taxableInterest > 1500 || ordinaryDividends > 1500 ? { B: { interest: ints.map((form) => ({ payer: form.payer || '', amount: field(form, 'interest') + field(form, 'treasuryInterest') })), dividends: divs.map((form) => ({ payer: form.payer || '', amount: field(form, 'ordinaryDividends') })), 4: taxableInterest, 6: ordinaryDividends } } : {}),
    ...(businesses.length ? { C: businesses.map((item) => ({ id: item.id, name: item.name, owner: item.owner, source: item.source, lines: stringKeys(item.lines), expenses: item.expenses })) } : {}),
    ...(d.has ? { D: { ...stringKeys(d.lines), carryoverToNextYear: carryover }, 8949: d.transactions.map(({ formId, ...row }) => row) } : {}),
    ...(seByOwner.length ? { SE: seByOwner.map((item) => ({ owner: item.owner, belowMinimum: item.below, lines: stringKeys(item.lines) })) } : {}),
    ...(form8812 ? { 8812: stringKeys(form8812) } : {}),
    ...(form8863 ? { 8863: form8863 } : {}),
    ...(form8959 ? { 8959: stringKeys(form8959) } : {}),
    ...(form8960 ? { 8960: stringKeys(form8960) } : {}),
    ...(form8995 ? { 8995: stringKeys(form8995) } : {}),
    ...(eic ? { EIC: eic } : {}),
  };
  if (!w2s.length && !(input.forms || []).length && !businesses.length) checks.push(check('warning', 'NO_INCOME_DOCUMENTS', 'No W-2, 1099 or business income has been added yet.', 'Add your tax forms.'));
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
      checks,
      rulesUsed,
      unreviewed,
      notCovered: NOT_COVERED,
      notes: [
        'Whole dollars, rounded as the IRS allows. Tax under $100,000 of taxable income uses the Tax Table method (the middle of each $50 band); the EIC uses the same $50 bands as the EIC Table.',
        'Line numbers follow the 2025 Form 1040 and schedules; the e-file layer maps them to the IRS schema for the year filed.',
        ...(unreviewed ? ['The rates and limits come from dated rules a US CPA has not reviewed yet.'] : []),
      ],
    },
  };
}

