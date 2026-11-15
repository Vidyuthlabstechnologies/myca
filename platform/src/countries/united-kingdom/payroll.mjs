import { taxYearOn, gbRule, toPence, toPounds, isIsoDate, daysBetween } from './rules.mjs';

const UNIT = 10000;
const CODE = /^(S|C)?(?:(K)(\d{1,6})|(\d{1,6})([LMNT])|(BR|D0|D1|D2|NT))$/;
const PLANS = Object.freeze(['plan1', 'plan2', 'plan4', 'plan5']);
const PENSION_BASES = Object.freeze(['net-pay', 'relief-at-source']);

function amount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ruleNote(record) {
  return { id: record.id, effectiveFrom: record.effectiveFrom, unreviewed: !(record.attestations || []).length };
}

export function parseTaxCode(raw) {
  let text = String(raw || '').toUpperCase().replace(/\s+/g, '');
  let cumulative = true;
  const basis = /(W1M1|W1|M1|X)$/.exec(text);
  if (basis) {
    cumulative = false;
    text = text.slice(0, -basis[0].length);
  }
  const hit = CODE.exec(text);
  if (!hit) return null;
  const region = hit[1] === 'S' ? 'scotland' : hit[1] === 'C' ? 'wales' : 'rest-of-uk';
  if (hit[6]) {
    if (hit[6] === 'NT' && hit[1]) return null;
    return { code: text, region, cumulative, kind: hit[6] === 'NT' ? 'no-tax' : 'flat', flat: hit[6], number: 0 };
  }
  if (hit[2]) {
    const number = Number(hit[3]);
    return number > 0 ? { code: text, region, cumulative, kind: 'additional-pay', number } : null;
  }
  return { code: text, region, cumulative, kind: 'free-pay', number: Number(hit[4]) };
}

export function taxPeriod(payDate, frequency) {
  const year = taxYearOn(payDate);
  if (!year) return null;
  if (frequency === 'weekly') {
    const week = Math.floor(daysBetween(year.from, payDate) / 7) + 1;
    return { year, number: week, periods: 52, extra: week > 52 };
  }
  const month = Number(payDate.slice(5, 7));
  const day = Number(payDate.slice(8, 10));
  const number = ((month - 4 + 12) % 12) + (day >= 6 ? 1 : 0) || 12;
  return { year, number, periods: 12, extra: false };
}

export function periodValuePence(codeNumber, periods, rule) {
  if (!(codeNumber > 0)) return 0;
  const f = rule.freePay;
  const blocks = Math.floor((codeNumber - 1) / f.blockOfCodePoints);
  const rest = ((codeNumber - 1) % f.blockOfCodePoints) + 1;
  const one = (pounds) => Math.ceil(Math.floor((pounds * UNIT) / periods) / 100);
  return one(rest * f.poundsPerCodePoint + f.addPounds) + blocks * one(f.blockOfCodePoints * f.poundsPerCodePoint);
}

function steps(bands) {
  let taxUnits = 0;
  return bands.map((band, index) => {
    if (index > 0) taxUnits += ((band.fromPence - bands[index - 1].fromPence) / 100) * bands[index - 1].basisPoints;
    return { fromPounds: band.fromPence / 100, basisPoints: band.basisPoints, taxUnits, name: band.name };
  });
}

export function taxToDatePence(taxablePence, n, periods, bands) {
  if (!(taxablePence > 0)) return 0;
  const whole = Math.floor(taxablePence / 100);
  let use = null;
  for (const step of steps(bands)) {
    const threshold = Math.floor((step.fromPounds * UNIT * n) / periods);
    const limitPounds = Math.ceil(threshold / UNIT);
    if (step.fromPounds === 0 || taxablePence > limitPounds * 100) use = { step, threshold };
  }
  const base = Math.floor((use.step.taxUnits * n) / periods);
  const units = base + Math.floor(((whole * UNIT - use.threshold) * use.step.basisPoints) / UNIT);
  return Math.floor(units / 100);
}

function flatTaxPence(payPence, basisPoints) {
  if (!(payPence > 0)) return 0;
  return Math.floor((Math.floor(payPence / 100) * basisPoints) / 100);
}

function taxOn(code, payToDatePence, n, periods, bands, rule) {
  if (code.kind === 'no-tax') return 0;
  if (code.kind === 'flat') {
    const start = bands.findIndex((band) => band.name === rule.basicRateBand);
    const band = bands[start + rule.flatRateCodes[code.flat]];
    return band ? flatTaxPence(payToDatePence, band.basisPoints) : null;
  }
  const value = periodValuePence(code.number, periods, rule) * n;
  return taxToDatePence(code.kind === 'additional-pay' ? payToDatePence + value : payToDatePence - value, n, periods, bands);
}

function halfDown(units) {
  const whole = Math.floor(units / UNIT);
  return units - whole * UNIT > UNIT / 2 ? whole + 1 : whole;
}

export function class1Pence(payPence, letter, thresholds, rule) {
  const main = rule.employee.mainBasisPoints[letter];
  const upper = thresholds.upperEarningsLimit;
  const employeeUnits = main === null ? 0 : Math.max(0, Math.min(payPence, upper) - thresholds.primary) * main + Math.max(0, payPence - upper) * rule.employee.aboveUpperEarningsLimitBasisPoints;
  const free = thresholds[rule.employer.nothingUpTo[letter]];
  const employerUnits = Math.max(0, payPence - free) * rule.employer.basisPoints;
  return { employee: halfDown(employeeUnits), employer: halfDown(employerUnits) };
}

function loanPence(payPence, plan, periods) {
  if (!plan) return 0;
  const threshold = Math.floor(plan.thresholdPence / periods);
  if (payPence <= threshold) return 0;
  return Math.floor(((payPence - threshold) * plan.basisPoints) / UNIT / 100) * 100;
}

export function ukPayrollRun(args = {}) {
  const payDate = String(args.payDate || '');
  if (!isIsoDate(payDate)) return { ok: false, error: 'BAD_INPUT', problems: [{ field: 'payDate', why: 'Give the pay date as YYYY-MM-DD.' }], hint: 'Fix the fields listed.' };
  const frequency = args.frequency === 'weekly' ? 'weekly' : 'monthly';
  if (args.frequency !== undefined && !['weekly', 'monthly'].includes(args.frequency)) return { ok: false, error: 'BAD_INPUT', problems: [{ field: 'frequency', why: 'Pay is weekly or monthly.' }], hint: 'Fix the fields listed.' };
  const period = taxPeriod(payDate, frequency);
  const paye = gbRule('gb.paye.calculation', payDate);
  const ni = gbRule('gb.ni.class-1', payDate);
  const loans = gbRule('gb.student-loan.plans', payDate);
  const bandRules = { 'rest-of-uk': gbRule('gb.income-tax.bands.rest-of-uk', payDate), scotland: gbRule('gb.income-tax.bands.scotland', payDate) };
  bandRules.wales = bandRules['rest-of-uk'];
  if (!paye || !ni || !loans || !bandRules['rest-of-uk'] || !bandRules.scotland) return { ok: false, error: 'RULE_NOT_IN_FORCE', taxYear: period.year.label, hint: 'MyCA has payroll rules from 6 April 2026.' };
  const employees = Array.isArray(args.employees) ? args.employees : [];
  if (!employees.length) return { ok: false, error: 'BAD_INPUT', problems: [{ field: 'employees', why: 'Add at least one employee.' }], hint: 'Fix the fields listed.' };
  const p = paye.value;
  const periods = p.periodsInYear[frequency];
  const thresholds = ni.value.thresholdsPence[frequency];
  const problems = [];
  const notes = [];
  const rows = [];
  employees.forEach((employee, index) => {
    const at = `employees[${index}]`;
    const fail = (field, why) => problems.push({ field: `${at}.${field}`, why });
    const pay = amount(employee.pay);
    if (pay === null || !(pay > 0)) fail('pay', 'Pay for the period is an amount in pounds, more than zero.');
    const emergency = employee.taxCode === undefined;
    const parsed = parseTaxCode(emergency ? p.emergencyCode : employee.taxCode);
    const code = parsed && emergency ? { ...parsed, cumulative: false } : parsed;
    if (!code) fail('taxCode', 'Give the tax code as on the P45 or the HMRC notice, for example 1257L, S1257L, K100, BR, D0 or NT; add W1 or M1 if it is not cumulative.');
    const letter = String(employee.niCategory || 'A').toUpperCase();
    if (!Object.hasOwn(ni.value.employer.nothingUpTo, letter)) fail('niCategory', 'The National Insurance category is a letter such as A, B, C, H, J, M, V or Z.');
    const plan = employee.studentLoan === undefined || employee.studentLoan === null || employee.studentLoan === '' ? null : String(employee.studentLoan);
    if (plan && (!PLANS.includes(plan) || !loans.value.plans[plan])) fail('studentLoan', 'The student loan plan is plan1, plan2, plan4 or plan5.');
    const pension = employee.pension && typeof employee.pension === 'object' ? employee.pension : {};
    const pensionEmployee = amount(pension.employee);
    const pensionEmployer = amount(pension.employer);
    const pensionBasis = pension.basis === undefined ? 'relief-at-source' : pension.basis;
    if (pensionEmployee === null || pensionEmployer === null) fail('pension', 'Pension contributions are amounts in pounds, zero or more.');
    if (!PENSION_BASES.includes(pensionBasis)) fail('pension.basis', 'The pension basis is net-pay or relief-at-source.');
    const ytd = employee.yearToDate && typeof employee.yearToDate === 'object' ? employee.yearToDate : null;
    const ytdPay = ytd ? amount(ytd.taxablePay) : 0;
    const ytdTax = ytd ? amount(ytd.tax) : 0;
    if (ytdPay === null || ytdTax === null) fail('yearToDate', 'Taxable pay and tax to date are amounts in pounds, zero or more.');
    if (problems.some((problem) => problem.field.startsWith(at))) return;
    const payPence = toPence(pay);
    const pensionPence = toPence(pensionEmployee);
    if (pensionPence > payPence) return fail('pension.employee', 'The pension contribution cannot be more than the pay.');
    const bands = bandRules[code.region].value;
    const taxablePence = pensionBasis === 'net-pay' ? payPence - pensionPence : payPence;
    const rowNotes = [];
    const cumulative = code.cumulative && !period.extra;
    const n = cumulative ? period.number : 1;
    let earlierPay = 0;
    let earlierTax = 0;
    if (cumulative && period.number > 1) {
      if (ytd) {
        earlierPay = toPence(ytdPay);
        earlierTax = toPence(ytdTax);
      } else {
        earlierPay = taxablePence * (n - 1);
        earlierTax = taxOn(code, earlierPay, n - 1, periods, bands, p);
        rowNotes.push('No pay and tax to date were given, so MyCA assumed the same pay in every earlier period of this tax year. Give yearToDate from the last payslip or the P45 for the exact figure.');
      }
    }
    const toDate = taxOn(code, earlierPay + taxablePence, n, periods, bands, p);
    if (toDate === null) return fail('taxCode', 'That rate code is not in the rules for this part of the UK.');
    let taxPence = toDate - earlierTax;
    const cap = Math.floor((payPence * p.maxDeductionBasisPoints) / UNIT);
    if (taxPence > cap) {
      taxPence = cap;
      rowNotes.push('Tax is held at 50% of the pay, the most that can be taken in one period; the rest is collected in later periods.');
    }
    if (period.extra) rowNotes.push('This is week 53: the code is used on a week 1 basis for this payment.');
    if (emergency) rowNotes.push(`No tax code was given, so the emergency code ${p.emergencyCode} was used on a ${frequency === 'weekly' ? 'week 1' : 'month 1'} basis.`);
    const nic = class1Pence(payPence, letter, thresholds, ni.value);
    const studentLoan = loanPence(payPence, plan ? loans.value.plans[plan] : null, periods);
    const postgraduateLoan = loanPence(payPence, employee.postgraduateLoan === true ? loans.value.plans.postgraduate : null, periods);
    if (employee.director === true) rowNotes.push('Directors have an annual earnings period for National Insurance; this run uses the pay period, so check the year-end figure against HMRC leaflet CA44.');
    if (payPence >= thresholds.lowerEarningsLimit && payPence <= thresholds.primary) rowNotes.push('Pay is between the lower earnings limit and the primary threshold: no National Insurance is taken, but the period still counts for State Pension.');
    const netPence = payPence - taxPence - nic.employee - studentLoan - postgraduateLoan - pensionPence;
    rows.push({
      name: String(employee.name || `Employee ${index + 1}`).slice(0, 80),
      grossPay: toPounds(payPence),
      taxablePay: toPounds(taxablePence),
      taxCode: { code: code.code, region: code.region, basis: cumulative ? 'cumulative' : frequency === 'weekly' ? 'week 1' : 'month 1' },
      taxablePayToDate: toPounds(earlierPay + taxablePence),
      taxToDate: toPounds(earlierTax + taxPence),
      incomeTax: toPounds(taxPence),
      nationalInsurance: { category: letter, employee: toPounds(nic.employee), employer: toPounds(nic.employer) },
      studentLoan: toPounds(studentLoan),
      postgraduateLoan: toPounds(postgraduateLoan),
      pension: { employee: toPounds(pensionPence), employer: toPounds(toPence(pensionEmployer)), basis: pensionBasis },
      netPay: toPounds(netPence),
      employerCost: toPounds(payPence + nic.employer + toPence(pensionEmployer)),
      notes: rowNotes,
    });
  });
  if (problems.length) return { ok: false, error: 'BAD_INPUT', problems, hint: 'Fix the fields listed.' };
  const sum = (pick) => toPounds(rows.reduce((total, row) => total + toPence(pick(row)), 0));
  const totals = {
    grossPay: sum((row) => row.grossPay),
    incomeTax: sum((row) => row.incomeTax),
    employeeNationalInsurance: sum((row) => row.nationalInsurance.employee),
    employerNationalInsurance: sum((row) => row.nationalInsurance.employer),
    studentLoans: sum((row) => row.studentLoan + row.postgraduateLoan),
    employeePension: sum((row) => row.pension.employee),
    employerPension: sum((row) => row.pension.employer),
    netPay: sum((row) => row.netPay),
    employerCost: sum((row) => row.employerCost),
  };
  totals.dueToHmrc = toPounds(toPence(totals.incomeTax) + toPence(totals.employeeNationalInsurance) + toPence(totals.employerNationalInsurance) + toPence(totals.studentLoans));
  notes.push(`If you are eligible for the Employment Allowance, up to £${(ni.value.employmentAllowancePence / 100).toLocaleString('en-GB')} a year comes off the employer National Insurance; MyCA has not taken it off here.`);
  notes.push('MyCA works out the pay; it does not send the Full Payment Submission. Report this pay to HMRC on or before the pay date with your payroll software or Basic PAYE Tools.');
  return {
    ok: true,
    data: {
      payDate,
      taxYear: period.year.label,
      frequency,
      period: period.number,
      employees: rows,
      totals,
      notes,
      rulesUsed: [paye, ni, loans, bandRules['rest-of-uk'], bandRules.scotland].map(ruleNote),
    },
  };
}
