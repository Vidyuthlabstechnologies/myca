import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifiedExpenses, cisDeductions } from '../src/countries/united-kingdom/allowances.mjs';
import { ENGINE } from '../src/countries/united-kingdom/engine.mjs';

test('flat-rate mileage, working from home and living at the premises add up from dated rules', () => {
  const result = simplifiedExpenses({
    taxYear: '2026-27',
    vehicles: [{ name: 'Van', kind: 'van', businessMiles: 12000 }, { kind: 'motorcycle', businessMiles: 1000 }],
    homeHoursPerMonth: 60,
    livingAtPremises: { people: 2, months: 12 },
    otherExpenses: 8000,
    turnover: 30000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.vehicles[0].flatRate, 5000);
  assert.equal(result.data.vehicles[1].flatRate, 240);
  assert.equal(result.data.useOfHome.total, 216);
  assert.equal(result.data.privateUseOfPremises, 6000);
  assert.equal(result.data.totalExpenses, 7456);
  assert.deepEqual(result.data.comparison, { turnover: 30000, profitWithExpenses: 22544, profitWithTradingAllowance: 29000, better: 'expenses', saving: 6456 });
  assert.ok(result.data.rulesUsed.some((rule) => rule.id === 'gb.income-tax.simplified-expenses'));
});

test('the trading allowance wins when expenses are small, and actual vehicle costs win when higher', () => {
  const small = simplifiedExpenses({ taxYear: '2025-26', otherExpenses: 300, turnover: 4000 });
  assert.equal(small.data.comparison.better, 'trading-allowance');
  const actual = simplifiedExpenses({ taxYear: '2025-26', vehicles: [{ kind: 'car', businessMiles: 1000, actualCosts: 900 }] });
  assert.equal(actual.data.vehicles[0].better, 'actual-costs');
  assert.equal(actual.data.mileage, 900);
  const low = simplifiedExpenses({ taxYear: '2025-26', homeHours: [10, 30, 120] });
  assert.equal(low.data.useOfHome.total, 36);
  const between = simplifiedExpenses({ taxYear: '2025-26', homeHours: [50.5, 100.5] });
  assert.deepEqual(between.data.useOfHome.months.map((month) => month.amount), [10, 18]);
});

test('simplified expenses refuses bad input', () => {
  assert.equal(simplifiedExpenses({ taxYear: '2026' }).error, 'BAD_TAX_YEAR');
  assert.equal(simplifiedExpenses({ taxYear: '2026-27', vehicles: [{ kind: 'bus', businessMiles: -1 }] }).error, 'BAD_INPUT');
});

test('CIS statements add up per contractor and flag a deduction at the wrong rate', () => {
  const result = cisDeductions({
    taxYear: '2026-27',
    statements: [
      { contractor: 'Build Co', paymentDate: '2026-05-10', gross: 1000, materials: 200, deducted: 160 },
      { contractor: 'Build Co', paymentDate: '2026-06-10', gross: 1000, materials: 0, deducted: 100 },
      { contractor: 'Roof Ltd', paymentDate: '2026-07-10', gross: 500, deducted: 150, status: 'unregistered' },
      { contractor: 'Roof Ltd', paymentDate: '2026-03-10', gross: 999, deducted: 199.8 },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.statements.length, 3);
  assert.equal(result.data.totalGross, 2500);
  assert.equal(result.data.totalDeducted, 410);
  assert.equal(result.data.mismatches, 1);
  assert.deepEqual(result.data.contractors.map((row) => [row.contractor, row.deducted]), [['Build Co', 260], ['Roof Ltd', 150]]);
  assert.match(ENGINE.words.gb_cis_deductions(result), /£410\.00/);
});

test('the UK engine serves both tools', () => {
  assert.equal(typeof ENGINE.run.gb_simplified_expenses, 'function');
  assert.equal(ENGINE.run.gb_cis_deductions({}, { statements: [] }).error, 'BAD_INPUT');
  assert.match(ENGINE.words.gb_simplified_expenses(ENGINE.run.gb_simplified_expenses({}, { taxYear: '2026-27', homeHoursPerMonth: 120, turnover: 900 })), /nothing is taxed/);
});
