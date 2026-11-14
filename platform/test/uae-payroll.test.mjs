import test from 'node:test';
import assert from 'node:assert/strict';
import { gratuityEstimate, wpsSalaryFile } from '../src/countries/uae/payroll.mjs';
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
