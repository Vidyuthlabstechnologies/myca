import { fail, toFils, toDirhams, isIsoDate, lastDayOf, iso, ruleOn, ruleNote } from './common.mjs';

const DAY_MS = 86400000;
const DIGITS = (length) => new RegExp(`^\\d{${length}}$`);
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME = /^([01]\d|2[0-3])([0-5]\d)$/;

function daysInclusive(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

function divideHalfUp(numerator, denominator) {
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

function wholeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function gratuityEstimate(args = {}) {
  const { joinDate, lastDay } = args;
  if (!isIsoDate(joinDate) || !isIsoDate(lastDay)) return fail('BAD_DATE', { hint: 'Give joinDate and lastDay as YYYY-MM-DD.' });
  if (lastDay < joinDate) return fail('BAD_DATE', { hint: 'The last day is before the join date.' });
  const basicFils = toFils(args.basicMonthly);
  if (basicFils === null || basicFils <= 0) return fail('BAD_AMOUNT', { hint: 'Give the last basic monthly wage in AED (allowances are not counted).' });
  const unpaid = wholeNumber(args.unpaidAbsenceDays);
  if (unpaid === null) return fail('BAD_AMOUNT', { hint: 'Unpaid absence is a whole number of days.' });
  const rule = ruleOn('ae.labour.gratuity', lastDay);
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.labour.gratuity', date: lastDay, hint: 'This calculation follows the 2021 Labour Law, in force from 2 February 2022.' });
  const r = rule.value;
  const calendarDays = daysInclusive(joinDate, lastDay);
  const serviceDays = Math.max(0, calendarDays - unpaid);
  const firstDays = Math.min(serviceDays, r.firstYears * 365);
  const laterDays = Math.max(0, serviceDays - r.firstYears * 365);
  const dayUnits = BigInt(firstDays * r.daysPerYearFirst + laterDays * r.daysPerYearAfter);
  const uncapped = divideHalfUp(BigInt(basicFils) * dayUnits, BigInt(365 * r.dayRateDivisor));
  const capFils = basicFils * r.capMonthsOfWage;
  const accrued = Math.min(uncapped, capFils);
  const eligible = serviceDays >= r.minimumServiceDays;
  const warnings = [];
  if (unpaid > 0) warnings.push(`Service of ${serviceDays} days counts after ${unpaid} days of unpaid absence.`);
  if (uncapped > capFils) warnings.push('The gratuity is capped at two years of basic wage.');
  if (args.dismissedForGrossMisconduct === true) warnings.push('A dismissal under Article 44 for gross misconduct can forfeit the gratuity; it may not be payable.');
  const gratuity = eligible ? accrued : 0;
  return {
    ok: true,
    data: {
      joinDate,
      lastDay,
      basicMonthly: toDirhams(basicFils),
      dayRate: toDirhams(divideHalfUp(BigInt(basicFils), BigInt(r.dayRateDivisor))),
      serviceDays,
      serviceYears: Math.round((serviceDays / 365) * 100) / 100,
      daysOfWage: Math.round((Number(dayUnits) / 365) * 100) / 100,
      eligible,
      gratuity: toDirhams(gratuity),
      accruedLiability: toDirhams(accrued),
      capped: uncapped > capFils,
      why: eligible ? 'Gratuity is 21 days of the last basic wage for each of the first five years and 30 days for each year after, pro rata for part years.' : 'Less than one year of continuous service, so no gratuity is due yet.',
      warnings,
      ...ruleNote(rule),
    },
  };
}

function ibanValid(iban) {
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const char of moved) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function accountProblem(account, maxLength) {
  if (!account) return 'Give the IBAN, account or salary card number.';
  if (account.length > maxLength) return 'The account is at most 23 characters.';
  if (account.startsWith('AE')) {
    if (!/^AE\d{21}$/.test(account)) return 'A UAE IBAN is AE followed by 21 digits.';
    if (!ibanValid(account)) return 'The IBAN check digits are wrong.';
  } else if (!/^[A-Z0-9]+$/.test(account)) {
    return 'The account has letters and digits only.';
  }
  return null;
}

function money(value) {
  const fils = toFils(value === undefined || value === null || value === '' ? 0 : value);
  return fils !== null && fils >= 0 ? fils : null;
}

function twoDecimals(fils) {
  return (fils / 100).toFixed(2);
}

export function wpsSalaryFile(args = {}) {
  const at = String(args.fileDate || '');
  const fileTime = String(args.fileTime || '');
  const problems = [];
  const add = (employee, field, why) => problems.push({ employee, field, why });
  const month = MONTH.exec(String(args.month || ''));
  if (!month) add(-1, 'month', 'Give the salary month as YYYY-MM.');
  if (!isIsoDate(at)) add(-1, 'fileDate', 'Give the file date as YYYY-MM-DD.');
  if (!TIME.test(fileTime)) add(-1, 'fileTime', 'Give the file time as HHMM, for example 0930.');
  const rule = ruleOn('ae.labour.wps', isIsoDate(at) ? at : '2026-01-01');
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.labour.wps' });
  const r = rule.value;
  const employerId = String(args.employerId || '').replace(/\s/g, '');
  if (!/^\d+$/.test(employerId) || employerId.length > r.employerIdMaxLength) add(-1, 'employerId', 'The employer id from MOHRE is up to 13 digits.');
  const bankRouting = String(args.employerBankRouting || '').replace(/\s/g, '');
  if (!DIGITS(r.routingCodeLength).test(bankRouting)) add(-1, 'employerBankRouting', 'The routing code is 9 digits.');
  const reference = String(args.employerReference || 'NONE').trim().slice(0, r.employerReferenceMaxLength).replace(/,/g, ' ');
  const employees = Array.isArray(args.employees) ? args.employees : [];
  if (!employees.length) add(-1, 'employees', 'Add at least one employee.');
  const year = month ? Number(month[1]) : 0;
  const monthNumber = month ? Number(month[2]) : 0;
  const monthStart = month ? iso(year, monthNumber, 1) : '';
  const monthEnd = month ? iso(year, monthNumber, lastDayOf(year, monthNumber)) : '';
  const lines = [];
  let totalFils = 0;
  employees.forEach((employee, index) => {
    const labourId = String(employee.labourId || '').replace(/\s/g, '');
    if (!DIGITS(r.employeeIdLength).test(labourId)) add(index, 'labourId', 'The labour (MOHRE) person id is 14 digits.');
    const routing = String(employee.routingCode || '').replace(/\s/g, '');
    if (!DIGITS(r.routingCodeLength).test(routing)) add(index, 'routingCode', 'The routing code is 9 digits.');
    const account = String(employee.account || '').replace(/\s/g, '').toUpperCase();
    const accountWhy = accountProblem(account, r.accountMaxLength);
    if (accountWhy) add(index, 'account', accountWhy);
    const start = employee.payStart || monthStart;
    const end = employee.payEnd || monthEnd;
    if (month && (!isIsoDate(start) || !isIsoDate(end) || start > end || start < monthStart || end > monthEnd)) add(index, 'payStart', 'The pay period must fall inside the salary month.');
    const fixed = money(employee.fixed);
    const variable = money(employee.variable);
    if (fixed === null || variable === null) add(index, 'fixed', 'Pay is a number of AED, zero or more.');
    const days = month && isIsoDate(start) && isIsoDate(end) && start <= end ? daysInclusive(start, end) : 0;
    const leave = wholeNumber(employee.unpaidLeaveDays);
    if (leave === null || leave > days) add(index, 'unpaidLeaveDays', 'Unpaid leave days are a whole number from 0 to the days in the period.');
    if (fixed !== null && variable !== null) totalFils += fixed + variable;
    lines.push(['EDR', labourId, routing, account, start, end, days, twoDecimals(fixed || 0), twoDecimals(variable || 0), leave || 0].join(','));
  });
  if (problems.length) return fail('WPS_FILE_INVALID', { problems, hint: 'Fix these and make the file again; one bad routing code or IBAN rejects the whole file.' });
  const salaryMonth = `${String(monthNumber).padStart(2, '0')}${year}`;
  lines.push(['SCR', employerId, bankRouting, at, fileTime, salaryMonth, employees.length, twoDecimals(totalFils), r.currency, reference].join(','));
  const stamp = `${at.slice(2).replace(/-/g, '')}${fileTime}00`;
  return {
    ok: true,
    data: {
      fileName: `${employerId}${stamp}.SIF`,
      content: `${lines.join('\r\n')}\r\n`,
      employees: employees.length,
      total: toDirhams(totalFils),
      salaryMonth,
      why: 'Upload this file through your WPS agent (the bank or exchange house) so salaries are paid and reported to MOHRE.',
      ...ruleNote(rule),
    },
  };
}

function share(fils, basisPoints) {
  return divideHalfUp(BigInt(fils) * BigInt(basisPoints), 10000n);
}

function per(fils, numerator, denominator) {
  return divideHalfUp(BigInt(fils) * BigInt(numerator), BigInt(denominator));
}

function hoursOf(value) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

function previousMonthEnd(year, month) {
  return month === 1 ? iso(year - 1, 12, 31) : iso(year, month - 1, lastDayOf(year, month - 1));
}

export function uaePayrollRun(args = {}) {
  const month = MONTH.exec(String(args.month || ''));
  if (!month) return fail('BAD_MONTH', { hint: 'Give the salary month as YYYY-MM.' });
  const year = Number(month[1]);
  const monthNumber = Number(month[2]);
  const monthEnd = iso(year, monthNumber, lastDayOf(year, monthNumber));
  const overtime = ruleOn('ae.labour.overtime', monthEnd);
  const cap = ruleOn('ae.labour.wage-deductions', monthEnd);
  const pension = ruleOn('ae.pension.gpssa', monthEnd);
  if (!overtime || !cap) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.labour.overtime', hint: 'This payroll follows the 2021 Labour Law, in force from 2 February 2022.' });
  const employees = Array.isArray(args.employees) ? args.employees : [];
  if (!employees.length) return fail('BAD_INPUT', { hint: 'Add at least one employee.' });
  const o = overtime.value;
  const days = lastDayOf(year, monthNumber);
  const problems = [];
  const add = (employee, field, why) => problems.push({ employee, field, why });
  const rows = employees.map((employee, index) => {
    const amounts = {};
    for (const field of ['basic', 'housing', 'transport', 'otherAllowances', 'deductions']) {
      amounts[field] = money(employee[field]);
      if (amounts[field] === null) add(index, field, 'Pay is a number of AED, zero or more.');
    }
    if (amounts.basic !== null && amounts.basic <= 0) add(index, 'basic', 'Give the basic monthly wage in AED.');
    const normalHours = hoursOf(employee.overtimeHours);
    const nightHours = hoursOf(employee.nightOvertimeHours);
    if (normalHours === null || nightHours === null) add(index, 'overtimeHours', 'Overtime is a number of hours, zero or more.');
    const restDays = wholeNumber(employee.restDaysWorked);
    if (restDays === null || restDays > days) add(index, 'restDaysWorked', 'Rest days worked are a whole number of days in the month.');
    const unpaid = wholeNumber(employee.unpaidLeaveDays);
    if (unpaid === null || unpaid > days) add(index, 'unpaidLeaveDays', 'Unpaid leave days are a whole number from 0 to the days in the period.');
    const basis = employee.unpaidLeaveBasis === undefined ? 'gross' : employee.unpaidLeaveBasis;
    if (basis !== 'gross' && basis !== 'basic') add(index, 'unpaidLeaveBasis', 'Unpaid leave is deducted from the gross fixed pay or the basic wage, as the contract says.');
    if (employee.joinDate !== undefined && !isIsoDate(employee.joinDate)) add(index, 'joinDate', 'Give joinDate and lastDay as YYYY-MM-DD.');
    if (problems.some((problem) => problem.employee === index)) return null;
    const warnings = [];
    const fixed = amounts.basic + amounts.housing + amounts.transport + amounts.otherAllowances;
    const hourUnits = Math.round((normalHours * o.overtimeBasisPoints + nightHours * o.nightOvertimeBasisPoints) * 100);
    const overtimePay = divideHalfUp(BigInt(amounts.basic) * BigInt(hourUnits), BigInt(o.dayRateDivisor * o.normalHoursPerDay * 10000 * 100));
    const restDayPay = divideHalfUp(BigInt(amounts.basic) * BigInt(restDays * o.restDayBasisPoints), BigInt(o.dayRateDivisor * 10000));
    if (normalHours + nightHours > o.maxOvertimeHoursPerDay * days) warnings.push('Overtime is more than two hours a day on average this month; the law caps overtime at two hours a day.');
    if (employee.shiftWorker === true && normalHours + nightHours > 0) warnings.push('The overtime rule does not apply to shift workers; check the contract before paying this overtime.');
    const unpaidDeduction = per(basis === 'basic' ? amounts.basic : fixed, unpaid, o.dayRateDivisor);
    const variable = overtimePay + restDayPay;
    const gross = fixed + variable - unpaidDeduction;
    const national = String(employee.nationality || '').toUpperCase() === (pension ? pension.value.coveredNationality : 'AE');
    let pensionPart = null;
    if (national) {
      if (!pension) warnings.push('GPSSA pension is due for this Emirati employee; MyCA has no GPSSA rate for this month.');
      else if (employee.gpssaRegisteredBefore2023Nov === true) warnings.push('This employee was registered with GPSSA before 31 October 2023; read the contribution from GPSSA, MyCA covers the 2023 law only.');
      else {
        const p = pension.value;
        const salary = Math.min(fixed, p.contributionSalaryCapFils);
        const government = salary < p.governmentShareBelowFils ? share(salary, p.governmentShareBasisPoints) : 0;
        pensionPart = { contributionSalary: salary, employee: share(salary, p.employeeBasisPoints), employer: share(salary, p.employerBasisPoints) - government, government };
      }
    }
    const deductions = amounts.deductions + (pensionPart ? pensionPart.employee : 0);
    const capFils = share(Math.max(0, gross), cap.value.maxShareOfWageBasisPoints);
    if (deductions > capFils) {
      add(index, 'deductions', 'Deductions from the wage cannot be more than half of this month\'s wage.');
      return null;
    }
    const net = gross - deductions;
    let gratuityAccrual = null;
    if (!national && employee.joinDate && employee.joinDate <= monthEnd) {
      const now = gratuityEstimate({ joinDate: employee.joinDate, lastDay: monthEnd, basicMonthly: toDirhams(amounts.basic) });
      const before = previousMonthEnd(year, monthNumber);
      const earlier = before >= employee.joinDate ? gratuityEstimate({ joinDate: employee.joinDate, lastDay: before, basicMonthly: toDirhams(amounts.basic) }) : null;
      if (now.ok) gratuityAccrual = toFils(now.data.accruedLiability) - (earlier && earlier.ok ? toFils(earlier.data.accruedLiability) : 0);
    }
    const wpsFixed = Math.max(0, net - variable);
    return {
      name: String(employee.name || `Employee ${index + 1}`).slice(0, 60),
      fixedPay: toDirhams(fixed),
      overtimePay: toDirhams(overtimePay),
      restDayPay: toDirhams(restDayPay),
      unpaidLeaveDeduction: toDirhams(unpaidDeduction),
      grossPay: toDirhams(gross),
      pension: pensionPart ? { contributionSalary: toDirhams(pensionPart.contributionSalary), employee: toDirhams(pensionPart.employee), employer: toDirhams(pensionPart.employer), government: toDirhams(pensionPart.government) } : null,
      otherDeductions: toDirhams(amounts.deductions),
      netPay: toDirhams(net),
      employerCost: toDirhams(gross + (pensionPart ? pensionPart.employer : 0) + (gratuityAccrual || 0)),
      gratuityAccrual: gratuityAccrual === null ? null : toDirhams(gratuityAccrual),
      wps: { name: String(employee.name || ''), labourId: employee.labourId, routingCode: employee.routingCode, account: employee.account, fixed: toDirhams(wpsFixed), variable: toDirhams(net - wpsFixed), unpaidLeaveDays: unpaid },
      warnings,
      _fils: { gross, net, employer: pensionPart ? pensionPart.employer : 0, pensionEmployee: pensionPart ? pensionPart.employee : 0, gratuity: gratuityAccrual || 0 },
    };
  });
  if (problems.length) return fail('PAYROLL_INVALID', { problems, hint: 'Fix the employees listed and run the payroll again.' });
  const total = (pick) => toDirhams(rows.reduce((sum, row) => sum + pick(row._fils), 0));
  const totals = { grossPay: total((f) => f.gross), netPay: total((f) => f.net), pensionEmployee: total((f) => f.pensionEmployee), pensionEmployer: total((f) => f.employer), gratuityAccrual: total((f) => f.gratuity) };
  for (const row of rows) delete row._fils;
  return {
    ok: true,
    data: {
      month: args.month,
      employees: rows,
      totals,
      wpsEmployees: rows.map((row) => row.wps),
      why: 'Pay salaries through WPS (ae_wps_file builds the file from wpsEmployees once each employee has a labour id, routing code and account), and pay GPSSA contributions for Emirati staff through the GPSSA portal.',
      ...ruleNote(overtime),
      rulesUsed: [overtime, cap, ...(pension ? [pension] : [])].map((rule) => ({ id: rule.id, effectiveFrom: rule.effectiveFrom, unreviewed: !(rule.attestations || []).length })),
    },
  };
}
