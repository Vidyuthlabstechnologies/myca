import test from 'node:test';
import assert from 'node:assert/strict';
import { gratuityEstimate, uaePayrollRun, wpsSalaryFile } from '../src/countries/uae/payroll.mjs';
import { ENGINE } from '../src/countries/uae/engine.mjs';

const ARABIC = /[؀-ۿ]/;

test('gratuity is 21 days a year for five years then 30 days, from the last basic wage over 30', () => {
  const result = gratuityEstimate({ joinDate: '2020-01-01', lastDay: '2024-12-31', basicMonthly: 10000 });
  assert.equal(result.ok, true);
  assert.equal(result.data.serviceDays, 1827);
  assert.equal(result.data.gratuity, 35054.79);
  assert.equal(result.data.eligible, true);
  assert.equal(result.data.ruleId, 'ae.labour.gratuity');
});

test('no gratuity before one year, but the books still carry the accrued liability', () => {
  const result = gratuityEstimate({ joinDate: '2026-01-01', lastDay: '2026-06-30', basicMonthly: 6000 });
  assert.equal(result.data.eligible, false);
  assert.equal(result.data.gratuity, 0);
  assert.ok(result.data.accruedLiability > 0);
});

test('gratuity stops at two years of basic wage and unpaid absence shortens service', () => {
  const capped = gratuityEstimate({ joinDate: '1995-01-01', lastDay: '2024-12-31', basicMonthly: 5000 });
  assert.equal(capped.data.gratuity, 120000);
  assert.equal(capped.data.capped, true);
  const absent = gratuityEstimate({ joinDate: '2020-01-01', lastDay: '2024-12-31', basicMonthly: 10000, unpaidAbsenceDays: 30 });
  assert.equal(absent.data.serviceDays, 1797);
  assert.ok(absent.data.gratuity < 35054.79);
  assert.equal(absent.data.warnings.length, 1);
});

test('gratuity refuses bad dates and amounts', () => {
  assert.equal(gratuityEstimate({ joinDate: '2024-01-01', lastDay: '2023-01-01', basicMonthly: 1 }).error, 'BAD_DATE');
  assert.equal(gratuityEstimate({ joinDate: '2024-01-01', lastDay: '2025-01-01', basicMonthly: 0 }).error, 'BAD_AMOUNT');
});

const employee = { name: 'A', labourId: '10003128177364', routingCode: '201234567', account: 'AE07 0331 2345 6789 0123 456', fixed: 9500, variable: 250.5, unpaidLeaveDays: 0 };
const base = { month: '2026-10', fileDate: '2026-10-28', fileTime: '0937', employerId: '0000000330894', employerBankRouting: '203526101', employees: [employee] };

test('the WPS file has one EDR per employee and a closing SCR that adds up', () => {
  const result = wpsSalaryFile({ ...base, employees: [employee, { ...employee, labourId: '10003128177365', fixed: 4000, variable: 0, unpaidLeaveDays: 2 }] });
  assert.equal(result.ok, true);
  const lines = result.data.content.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'EDR,10003128177364,201234567,AE070331234567890123456,2026-10-01,2026-10-31,31,9500.00,250.50,0');
  assert.equal(lines[2], 'SCR,0000000330894,203526101,2026-10-28,0937,102026,2,13750.50,AED,NONE');
  assert.equal(result.data.fileName, '0000000330894261028093700.SIF');
  assert.equal(result.data.total, 13750.5);
});

test('the employer reference cannot break a WPS line or add one', () => {
  const result = wpsSalaryFile({ ...base, employerReference: 'OCT\r\nEDR,99999999999999,201234567,X,2026-10-01,2026-10-31,31,1.00,0.00,0' });
  const lines = result.data.content.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].split(',').length, 10);
  assert.equal(wpsSalaryFile({ ...base, employerReference: ' \n ' }).data.content.trim().split(',').pop(), 'NONE');
});

test('the WPS file refuses a bad IBAN, routing code or pay period', () => {
  const result = wpsSalaryFile({ ...base, employees: [{ ...employee, account: 'AE080331234567890123456', routingCode: '12', payStart: '2026-09-30' }] });
  assert.equal(result.error, 'WPS_FILE_INVALID');
  assert.deepEqual(result.problems.map((item) => item.field).sort(), ['account', 'payStart', 'routingCode']);
});

test('gratuity and WPS answers come back in Arabic', () => {
  const grat = ENGINE.run.ae_gratuity({}, { joinDate: '2020-01-01', lastDay: '2024-12-31', basicMonthly: 10000, unpaidAbsenceDays: 3, lang: 'ar' });
  assert.ok(ARABIC.test(grat.data.why));
  assert.ok(grat.data.warnings.every((item) => ARABIC.test(item)));
  const bad = ENGINE.run.ae_wps_file({}, { ...base, employees: [], lang: 'ar' });
  assert.ok(ARABIC.test(bad.hint));
  assert.ok(bad.problems.every((item) => ARABIC.test(item.why)));
  assert.ok(ARABIC.test(ENGINE.words.ae_gratuity(grat, null, { lang: 'ar' })));
});

const payrollOne = (employee, month = '2026-10') => uaePayrollRun({ month, employees: [employee] });

test('a payroll run pays overtime on the basic hourly wage, rest days at 150% and takes unpaid leave off the fixed pay', () => {
  const run = payrollOne({ name: 'Ravi', basic: 5000, housing: 2000, transport: 500, overtimeHours: 10, nightOvertimeHours: 2, restDaysWorked: 1, unpaidLeaveDays: 2, deductions: 300, joinDate: '2023-03-01' });
  assert.equal(run.ok, true);
  const row = run.data.employees[0];
  assert.equal(row.fixedPay, 7500);
  assert.equal(row.overtimePay, 322.92);
  assert.equal(row.restDayPay, 250);
  assert.equal(row.unpaidLeaveDeduction, 500);
  assert.equal(row.grossPay, 7572.92);
  assert.equal(row.netPay, 7272.92);
  assert.equal(row.pension, null);
  assert.equal(row.gratuityAccrual, 278.09, 'October accrues 29 service days, not 31: unpaid leave does not count (Article 51)');
  assert.equal(payrollOne({ basic: 5000, housing: 2000, joinDate: '2023-03-01' }).data.employees[0].gratuityAccrual, 297.26);
  assert.equal(row.wps.fixed + row.wps.variable, row.netPay);
  assert.equal(row.wps.unpaidLeaveDays, 2);
  assert.deepEqual(run.data.rulesUsed.map((rule) => rule.id), ['ae.labour.overtime', 'ae.labour.wage-deductions', 'ae.pension.gpssa']);
  assert.equal(payrollOne({ basic: 5000, housing: 2000, unpaidLeaveDays: 3, unpaidLeaveBasis: 'basic' }).data.employees[0].unpaidLeaveDeduction, 500);
});

test('Emirati staff get GPSSA: 11% employee, 15% employer less the 2.5% government share below AED 20,000, capped at AED 70,000', () => {
  const high = payrollOne({ nationality: 'AE', basic: 15000, housing: 5000, transport: 1000 }).data.employees[0];
  assert.deepEqual(high.pension, { contributionSalary: 21000, employee: 2310, employer: 3150, government: 0 });
  assert.equal(high.netPay, 18690);
  assert.equal(high.employerCost, 24150);
  assert.equal(high.gratuityAccrual, null);
  const low = payrollOne({ nationality: 'ae', basic: 8000, housing: 2000 }).data.employees[0];
  assert.deepEqual(low.pension, { contributionSalary: 10000, employee: 1100, employer: 1250, government: 250 });
  const capped = payrollOne({ nationality: 'AE', basic: 90000 }).data.employees[0];
  assert.equal(capped.pension.contributionSalary, 70000);
  assert.equal(capped.pension.employee, 7700);
  const old = payrollOne({ nationality: 'AE', basic: 10000, gpssaRegisteredBefore2023Nov: true }).data.employees[0];
  assert.equal(old.pension, null);
  assert.match(old.warnings.join(' '), /before 31 October 2023/);
});

test('deductions above half the wage, bad hours and bad months are refused; overtime limits are warned', () => {
  const over = payrollOne({ basic: 4000, deductions: 2500 });
  assert.equal(over.ok, false);
  assert.equal(over.error, 'PAYROLL_INVALID');
  assert.deepEqual(over.problems.map((problem) => problem.field), ['deductions']);
  assert.equal(payrollOne({ basic: 4000, deductions: 2000 }).ok, true);
  assert.deepEqual(payrollOne({ basic: 0, overtimeHours: -1, restDaysWorked: 40 }).problems.map((problem) => problem.field), ['basic', 'overtimeHours', 'restDaysWorked']);
  assert.equal(uaePayrollRun({ month: '2026-13', employees: [{ basic: 1 }] }).error, 'BAD_MONTH');
  assert.equal(uaePayrollRun({ month: '2021-12', employees: [{ basic: 1 }] }).error, 'RULE_NOT_IN_FORCE');
  const heavy = payrollOne({ basic: 4000, overtimeHours: 70, shiftWorker: true }).data.employees[0];
  assert.equal(heavy.warnings.length, 2);
});

test('the payroll lines feed the WPS file, and the engine says the totals in English and Arabic', () => {
  const args = { month: '2026-10', employees: [{ name: 'Ravi', basic: 5000, housing: 2000, overtimeHours: 4, labourId: '12345678901234', routingCode: '123456789', account: 'AE070331234567890123456' }] };
  const run = ENGINE.run.ae_payroll_run({}, args);
  const file = wpsSalaryFile({ month: '2026-10', fileDate: '2026-10-28', fileTime: '0930', employerId: '1234567890123', employerBankRouting: '123456789', employees: run.data.wpsEmployees });
  assert.equal(file.ok, true);
  assert.equal(file.data.total, run.data.totals.netPay);
  assert.match(ENGINE.words.ae_payroll_run(run, null, args), /gross AED/);
  assert.match(ENGINE.words.ae_payroll_run(run, null, { ...args, lang: 'ar' }), ARABIC);
});
