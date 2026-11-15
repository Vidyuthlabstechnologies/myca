import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ukPayrollRun, parseTaxCode, periodValuePence, taxPeriod } from '../src/countries/united-kingdom/payroll.mjs';
import { gbRule } from '../src/countries/united-kingdom/rules.mjs';
import { ENGINE } from '../src/countries/united-kingdom/engine.mjs';

const one = (employee, extra = {}) => {
  const run = ukPayrollRun({ payDate: '2026-04-30', employees: [employee], ...extra });
  assert.equal(run.ok, true, JSON.stringify(run));
  return run.data.employees[0];
};

test('free pay follows the HMRC routine: code 1257 is £1,048.26 a month and £241.92 a week', () => {
  const rule = gbRule('gb.paye.calculation', '2026-04-30').value;
  assert.equal(periodValuePence(1257, 12, rule), 104826);
  assert.equal(periodValuePence(1257, 52, rule), 24192);
  assert.equal(periodValuePence(500, 12, rule), 41742);
  assert.equal(periodValuePence(1, 12, rule), 159);
  assert.equal(periodValuePence(0, 12, rule), 0);
});

test('tax codes are read with their prefix, suffix and basis', () => {
  assert.deepEqual(parseTaxCode('s1257l m1'), { code: 'S1257L', region: 'scotland', cumulative: false, kind: 'free-pay', number: 1257 });
  assert.equal(parseTaxCode('CK100').kind, 'additional-pay');
  assert.equal(parseTaxCode('0T').number, 0);
  assert.equal(parseTaxCode('SD2').flat, 'D2');
  assert.equal(parseTaxCode('SNT'), null);
  assert.equal(parseTaxCode('1257'), null);
  assert.equal(parseTaxCode('K0'), null);
});

test('the tax month runs from the 6th and the tax week from 6 April', () => {
  assert.equal(taxPeriod('2026-04-06', 'monthly').number, 1);
  assert.equal(taxPeriod('2026-05-05', 'monthly').number, 1);
  assert.equal(taxPeriod('2026-11-30', 'monthly').number, 8);
  assert.equal(taxPeriod('2027-04-05', 'monthly').number, 12);
  assert.equal(taxPeriod('2026-04-12', 'weekly').number, 1);
  assert.equal(taxPeriod('2026-04-13', 'weekly').number, 2);
  assert.equal(taxPeriod('2027-04-05', 'weekly').extra, true);
});

test('£3,000 a month on 1257L, category A: tax £390.20, NI £156.16, employer NI £387.45', () => {
  const row = one({ name: 'Asha', pay: 3000, taxCode: '1257L' });
  assert.equal(row.taxablePay, 3000);
  assert.equal(row.incomeTax, 390.2);
  assert.deepEqual(row.nationalInsurance, { category: 'A', employee: 156.16, employer: 387.45 });
  assert.equal(row.netPay, 2453.64);
  assert.equal(row.employerCost, 3387.45);
});

test('£6,000 a month crosses into 40% and 2% NI, with plan 2 and postgraduate loans rounded down to the pound', () => {
  const row = one({ pay: 6000, taxCode: '1257L', studentLoan: 'plan2', postgraduateLoan: true });
  assert.equal(row.incomeTax, 1352.06);
  assert.equal(row.nationalInsurance.employee, 287.5);
  assert.equal(row.nationalInsurance.employer, 837.45);
  assert.equal(row.studentLoan, 319);
  assert.equal(row.postgraduateLoan, 255);
  assert.equal(row.netPay, 3786.44);
});

test('a Scottish code uses the Scottish bands', () => {
  assert.equal(one({ pay: 3000, taxCode: 'S1257L' }).incomeTax, 392.27);
  assert.equal(one({ pay: 3000, taxCode: 'C1257L' }).incomeTax, 390.2);
});

test('a cumulative code looks at the year to date, and assumes level pay when it is not given', () => {
  const given = ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 3000, taxCode: '1257L', yearToDate: { taxablePay: 6000, tax: 780.6 } }] }).data;
  assert.equal(given.period, 3);
  assert.equal(given.employees[0].incomeTax, 390.4);
  assert.equal(given.employees[0].taxToDate, 1171);
  const assumed = ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 3000, taxCode: '1257L' }] }).data.employees[0];
  assert.equal(assumed.incomeTax, 390.4);
  assert.match(assumed.notes.join(' '), /assumed the same pay/);
  const refund = ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 1000, taxCode: '1257L', yearToDate: { taxablePay: 2000, tax: 500 } }] }).data.employees[0];
  assert.equal(refund.incomeTax, -500);
  const monthOne = ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 3000, taxCode: '1257L M1', yearToDate: { taxablePay: 6000, tax: 0 } }] }).data.employees[0];
  assert.equal(monthOne.incomeTax, 390.2);
  assert.equal(monthOne.taxCode.basis, 'month 1');
});

test('K codes add pay, and tax is never more than half the pay', () => {
  assert.equal(one({ pay: 1000, taxCode: 'K100' }).incomeTax, 216.8);
  const capped = one({ pay: 500, taxCode: 'K2000' });
  assert.equal(capped.incomeTax, 250);
  assert.match(capped.notes.join(' '), /50% of the pay/);
});

test('BR, D0, D1 and NT tax the whole pay at one rate', () => {
  assert.equal(one({ pay: 1000.5, taxCode: 'BR' }).incomeTax, 200);
  assert.equal(one({ pay: 1000.5, taxCode: 'D0' }).incomeTax, 400);
  assert.equal(one({ pay: 1000.5, taxCode: 'D1' }).incomeTax, 450);
  assert.equal(one({ pay: 1000.5, taxCode: 'SD0' }).incomeTax, 210);
  assert.equal(one({ pay: 1000.5, taxCode: 'NT' }).incomeTax, 0);
  assert.equal(ukPayrollRun({ payDate: '2026-04-30', employees: [{ pay: 1000, taxCode: 'D2' }] }).error, 'BAD_INPUT');
});

test('National Insurance category letters change who pays: C pays none, M and H are free for the employer to the upper limit', () => {
  assert.deepEqual(one({ pay: 3000, niCategory: 'C' }).nationalInsurance, { category: 'C', employee: 0, employer: 387.45 });
  assert.deepEqual(one({ pay: 5000, niCategory: 'M' }).nationalInsurance, { category: 'M', employee: 267.5, employer: 121.65 });
  assert.equal(one({ pay: 3000, niCategory: 'F' }).nationalInsurance.employer, 137.55);
  assert.equal(one({ pay: 1048.13, niCategory: 'A' }).nationalInsurance.employee, 0.01);
  assert.match(one({ pay: 800 }).notes.join(' '), /counts for State Pension/);
});

test('a net pay pension comes off taxable pay but not off National Insurance', () => {
  const net = one({ pay: 3000, taxCode: '1257L', pension: { employee: 150, employer: 90, basis: 'net-pay' } });
  assert.equal(net.taxablePay, 2850);
  assert.equal(net.incomeTax, 360.2);
  assert.equal(net.nationalInsurance.employee, 156.16);
  assert.equal(net.netPay, 2333.64);
  assert.equal(net.employerCost, 3477.45);
  const ras = one({ pay: 3000, taxCode: '1257L', pension: { employee: 120 } });
  assert.equal(ras.incomeTax, 390.2);
  assert.equal(ras.netPay, 2333.64);
});

test('weekly pay uses weekly free pay and thresholds', () => {
  const run = ukPayrollRun({ payDate: '2026-04-10', frequency: 'weekly', employees: [{ pay: 700, taxCode: '1257L', studentLoan: 'plan1' }] });
  const row = run.data.employees[0];
  assert.equal(row.incomeTax, 91.6);
  assert.equal(row.nationalInsurance.employee, 36.64);
  assert.equal(row.nationalInsurance.employer, 90.6);
  assert.equal(row.studentLoan, 16);
});

test('totals, rules and the engine words', () => {
  const run = ENGINE.run.gb_payroll_run({}, { payDate: '2026-04-30', employees: [{ name: 'Asha', pay: 3000 }, { name: 'Ben', pay: 6000 }] });
  assert.equal(run.data.totals.grossPay, 9000);
  assert.equal(run.data.totals.dueToHmrc, 3410.82);
  assert.deepEqual(run.data.rulesUsed.map((rule) => rule.id), ['gb.paye.calculation', 'gb.ni.class-1', 'gb.student-loan.plans', 'gb.income-tax.bands.rest-of-uk', 'gb.income-tax.bands.scotland']);
  assert.match(run.data.employees[0].notes.join(' '), /emergency code 1257L/);
  assert.match(ENGINE.words.gb_payroll_run(run), /2 employees: gross £9,000\.00.*due to HMRC\. Not yet sent to HMRC/);
});

test('bad input and dates before the rules are refused', () => {
  assert.equal(ukPayrollRun({ payDate: '2026-04-30', employees: [] }).error, 'BAD_INPUT');
  assert.equal(ukPayrollRun({ payDate: '30/04/2026', employees: [{ pay: 1 }] }).error, 'BAD_INPUT');
  assert.equal(ukPayrollRun({ payDate: '2026-03-31', employees: [{ pay: 1000 }] }).error, 'RULE_NOT_IN_FORCE');
  const bad = ukPayrollRun({ payDate: '2026-04-30', employees: [{ pay: -1, taxCode: 'ZZ', niCategory: 'Q', studentLoan: 'plan9', pension: { employee: 5, basis: 'other' } }] });
  assert.deepEqual(bad.problems.map((problem) => problem.field), ['employees[0].pay', 'employees[0].taxCode', 'employees[0].niCategory', 'employees[0].studentLoan', 'employees[0].pension.basis']);
});

test('with no tax code the emergency code runs on a month 1 or week 1 basis, not cumulatively', () => {
  const monthly = ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 3000 }] }).data.employees[0];
  assert.equal(monthly.taxCode.basis, 'month 1');
  assert.equal(monthly.incomeTax, 390.2);
  assert.match(monthly.notes.join(' '), /emergency code 1257L was used on a month 1 basis/);
  assert.doesNotMatch(monthly.notes.join(' '), /assumed the same pay/);
  const weekly = ukPayrollRun({ payDate: '2026-06-30', frequency: 'weekly', employees: [{ pay: 700 }] }).data.employees[0];
  assert.equal(weekly.taxCode.basis, 'week 1');
  assert.equal(ukPayrollRun({ payDate: '2026-06-30', employees: [{ pay: 3000, taxCode: '1257L' }] }).data.employees[0].taxCode.basis, 'cumulative');
});
