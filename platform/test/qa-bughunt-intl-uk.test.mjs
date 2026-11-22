import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaxCode, ukPayrollRun } from '../src/countries/united-kingdom/payroll.mjs';

test('the Scottish top rate code SD3 taxes all pay at 48%, and D3 is refused outside Scotland', () => {
  const code = parseTaxCode('SD3');
  assert.equal(code?.region, 'scotland');
  assert.equal(code?.flat, 'D3');
  const run = ukPayrollRun({ payDate: '2026-04-30', employees: [{ pay: 1000, taxCode: 'SD3' }] });
  assert.equal(run.ok, true, JSON.stringify(run.problems));
  assert.equal(run.data.employees[0].incomeTax, 480);
  assert.equal(ukPayrollRun({ payDate: '2026-04-30', employees: [{ pay: 1000, taxCode: 'D3' }] }).error, 'BAD_INPUT');
});
