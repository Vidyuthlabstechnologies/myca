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

test('payments on account are still due when exactly 80% of the tax was deducted at source, since the relief needs more than 80%', async () => {
  const { gbSelfAssessment } = await import('../src/countries/united-kingdom/self-assessment.mjs');
  const exactly = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 50000 }, taxPaid: { paye: 5988.8 } });
  assert.equal(exactly.ok, true);
  assert.equal(exactly.data.incomeTax, 7486);
  assert.equal(exactly.data.nextYear.paymentOnAccountEach, 748.6);
  const more = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 50000 }, taxPaid: { paye: 5988.81 } });
  assert.equal(more.data.nextYear.paymentOnAccountEach, 0);
});
