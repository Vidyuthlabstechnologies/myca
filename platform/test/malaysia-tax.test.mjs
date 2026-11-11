import { test } from 'node:test';
import assert from 'node:assert/strict';
import { malaysiaIncomeTax, bandTaxSen } from '../src/countries/malaysia/income-tax.mjs';
import { serviceTaxRate, salesTaxRate, taxablePeriodOf, parsePeriod, sstReturn, sstRegistrationCheck, sstLatePenalty } from '../src/countries/malaysia/sst.mjs';

test('YA 2025 resident: reliefs are capped, bands applied, PCB credited', () => {
  const out = malaysiaIncomeTax({
    yearOfAssessment: '2025',
    income: { employment: 100000 },
    reliefs: { lifeInsuranceAndEpf: 11000, lifestyle: 3000, childUnder18: 2 },
    monthlyTaxDeductionsPaid: 5000,
  });
  assert.equal(out.ok, true);
  assert.equal(out.data.totalReliefs, 22500);
  assert.equal(out.data.chargeableIncome, 77500);
  assert.equal(out.data.taxOnChargeableIncome, 5125);
  assert.equal(out.data.rebate, 0);
  assert.equal(out.data.balance, 125);
  assert.equal(out.data.outcome, 'to pay');
  assert.equal(out.data.unreviewed, true);
});

test('the RM400 rebate applies at or below RM35,000 chargeable income', () => {
  const out = malaysiaIncomeTax({ yearOfAssessment: '2025', income: { employment: 40000 } });
  assert.equal(out.data.chargeableIncome, 31000);
  assert.equal(out.data.taxOnChargeableIncome, 480);
  assert.equal(out.data.rebate, 400);
  assert.equal(out.data.taxPayable, 80);
});

test('zakat reduces tax but never below zero; spouse relief needs a spouse without income', () => {
  const out = malaysiaIncomeTax({ yearOfAssessment: '2025', income: { business: 60000 }, zakat: 10000, reliefs: { spouse: 4000 } });
  const spouse = out.data.reliefs.find((line) => line.relief === 'spouse');
  assert.equal(spouse.allowed, 0);
  assert.equal(out.data.taxPayable, 0);
  const joint = malaysiaIncomeTax({ yearOfAssessment: '2025', income: { business: 40000 }, reliefs: { spouse: 4000 }, spouseHasIncome: false });
  assert.equal(joint.data.chargeableIncome, 27000);
  assert.equal(joint.data.rebate, 800);
});

test('an unknown relief is reported, not counted, and a year without rules is refused', () => {
  const out = malaysiaIncomeTax({ yearOfAssessment: '2025', income: { employment: 50000 }, reliefs: { holiday: 5000 } });
  assert.deepEqual(out.data.unknownReliefs, ['holiday']);
  assert.equal(out.data.totalReliefs, 9000);
  const later = malaysiaIncomeTax({ yearOfAssessment: '2026', income: { employment: 50000 } });
  assert.equal(later.ok, false);
  assert.equal(later.error, 'RULE_NOT_IN_FORCE');
  assert.equal(malaysiaIncomeTax({ yearOfAssessment: 'x' }).error, 'BAD_YEAR_OF_ASSESSMENT');
});

test('non-residents pay a flat 30% with no reliefs', () => {
  const out = malaysiaIncomeTax({ yearOfAssessment: '2025', resident: false, income: { employment: 100000 }, reliefs: { lifestyle: 2500 } });
  assert.equal(out.data.taxPayable, 30000);
  assert.equal(out.data.form.startsWith('Form M'), true);
});

test('band tax at the top band', () => {
  assert.equal(bandTaxSen(2500000 * 100, [{ fromSen: 0, toSen: 2000000 * 100, basisPoints: 0 }, { fromSen: 2000000 * 100, toSen: null, basisPoints: 3000 }]), 150000 * 100);
});

test('service tax: 8% standard, 6% reduced, rental moves to 6% in 2026, flat card charge', () => {
  assert.equal(serviceTaxRate('general', '2026-03-10').basisPoints, 800);
  assert.equal(serviceTaxRate('food-and-beverage', '2026-03-10').basisPoints, 600);
  assert.equal(serviceTaxRate('rental-or-leasing', '2025-09-01').basisPoints, 800);
  assert.equal(serviceTaxRate('rental-or-leasing', '2026-01-01').basisPoints, 600);
  assert.equal(serviceTaxRate('construction', '2025-06-30').basisPoints, 800);
  assert.equal(serviceTaxRate('construction', '2025-07-01').basisPoints, 600);
  assert.equal(serviceTaxRate('healthcare', '2025-08-01').kind, 'exempt');
  assert.equal(serviceTaxRate('credit-card', '2026-01-01').amountSen, 2500);
  assert.equal(serviceTaxRate('massage', '2026-01-01').error, 'UNKNOWN_SERVICE_CATEGORY');
  assert.equal(serviceTaxRate('general', '2024-01-01').error, 'RULE_NOT_IN_FORCE');
});

test('sales tax accepts only rates in force', () => {
  assert.equal(salesTaxRate(500, '2026-01-01').ok, true);
  assert.equal(salesTaxRate(undefined, '2026-01-01').basisPoints, 1000);
  assert.equal(salesTaxRate(0, '2026-01-01').kind, 'exempt');
  assert.equal(salesTaxRate(600, '2026-01-01').error, 'SALES_TAX_RATE_NOT_IN_FORCE');
});

test('taxable periods are two months, due the last day of the next month', () => {
  assert.deepEqual(taxablePeriodOf('2026-04-15'), { period: '2026-03/2026-04', from: '2026-03-01', to: '2026-04-30', due: '2026-05-31', form: 'SST-02' });
  assert.equal(taxablePeriodOf('2025-12-05').due, '2026-01-31');
  const even = taxablePeriodOf('2025-12-05', { firstMonthOdd: false });
  assert.equal(even.period, '2025-12/2026-01');
  assert.equal(even.due, '2026-02-28');
  assert.equal(parsePeriod('2026-01/2026-03'), null);
});

test('SST-02 return totals sales and service tax for the period only', () => {
  const out = sstReturn([
    { date: '2026-03-10', kind: 'service', category: 'general', value: 1000 },
    { date: '2026-03-11', kind: 'service', category: 'food-and-beverage', value: 500 },
    { date: '2026-04-02', kind: 'service', category: 'rental-or-leasing', value: 1000 },
    { date: '2026-04-03', kind: 'sales', rateBasisPoints: 1000, value: 2000 },
    { date: '2026-04-04', kind: 'service', category: 'credit-card', cards: 2 },
    { date: '2026-05-01', kind: 'service', category: 'general', value: 99999 },
  ], '2026-03/2026-04');
  assert.equal(out.ok, true);
  assert.equal(out.data.serviceTax, 220);
  assert.equal(out.data.salesTax, 200);
  assert.equal(out.data.totalTax, 420);
  assert.equal(out.data.due, '2026-05-31');
  const bad = sstReturn([{ date: '2026-03-10', kind: 'sales', rateBasisPoints: 700, value: 10 }], '2026-03/2026-04');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'LINES_NEED_FIXING');
});

test('registration thresholds differ by service and the late penalty steps up', () => {
  assert.equal(sstRegistrationCheck({ category: 'food-and-beverage', last12Months: 1400000, date: '2026-01-01' }).data.mustRegister, false);
  assert.equal(sstRegistrationCheck({ category: 'general', last12Months: 500000, date: '2026-01-01' }).data.mustRegister, true);
  assert.equal(sstRegistrationCheck({ category: 'rental-or-leasing', last12Months: 900000, date: '2026-01-01' }).data.threshold, 1000000);
  assert.equal(sstRegistrationCheck({ kind: 'sales', last12Months: 600000, date: '2026-01-01' }).data.mustRegister, true);
  const late = sstLatePenalty({ unpaidTax: 1000, dueDate: '2026-05-31', paidOn: '2026-07-15' });
  assert.equal(late.data.daysLate, 45);
  assert.equal(late.data.penalty, 250);
  assert.equal(sstLatePenalty({ unpaidTax: 1000, dueDate: '2026-05-31', paidOn: '2026-12-31' }).data.penaltyPercent, 40);
});
