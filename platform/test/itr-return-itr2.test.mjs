import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItrReturn } from '../src/itr-return.mjs';

const BASE = {
  form: 'ITR-2',
  fy: '2024-25',
  regime: 'old',
  taxpayer: { name: 'Asha Rao', pan: 'ABCPR1234F', dob: '1985-05-04', mobile: '9876543210', email: 'asha@example.com', fatherName: 'K Rao', address: { flat: '12', locality: 'MG Road', city: 'Bengaluru', stateCode: '29', pin: '560001' } },
  salary: { employers: [{ name: 'Acme', nature: 'PE', tan: 'BLRA12345B', gross: 1200000 }], professionalTax: 2400, hra: { metro: true, received: 200000, rentPaid: 300000, salaryForHra: 600000 } },
  bank: { account: '1234567890', ifsc: 'HDFC0001234', name: 'HDFC Bank' },
};
const build = (extra) => buildItrReturn({}, { ...BASE, ...extra });
const equity = (name, isin, buyDate, sellDate, saleValue, cost) => ({ name, kind: 'listed-equity', isin, buyDate, sellDate, saleValue, cost });

test('salary only: valid against the schema with HRA and the standard deduction', () => {
  const result = build({});
  assert.equal(result.ok, true);
  assert.equal(result.data.ready, true);
  assert.equal(result.data.validation.valid, true);
  assert.equal(result.data.summary.incomeFromSalary, 947600);
  assert.equal(result.data.json.ITR.ITR2.PartB_TTI.ComputationOfTaxLiability.GrossTaxLiability, result.data.summary.grossTaxLiability);
});

test('shares, property and gold: special-rate tax, indexation choice and the 112A exemption', () => {
  const result = build({
    regime: 'new',
    capitalGains: { transactions: [
      equity('INFY', 'INE009A01021', '2022-01-10', '2024-09-10', 400000, 250000),
      equity('HDFC', 'INE040A01034', '2024-01-10', '2024-08-10', 300000, 200000),
      { name: 'Flat', kind: 'property', buyDate: '2015-04-01', sellDate: '2024-10-01', saleValue: 6000000, cost: 3000000, indexedCost: 4500000 },
      { name: 'Gold', kind: 'gold', buyDate: '2020-01-01', sellDate: '2024-06-01', saleValue: 300000, cost: 200000 },
    ] },
  });
  assert.equal(result.data.ready, true, JSON.stringify(result.data.problems));
  assert.equal(result.data.validation.valid, true);
  assert.equal(result.data.summary.exemption112A, 125000);
  assert.equal(result.data.summary.taxAtSpecialRates, 3125 + 20000 + 320000);
  assert.equal(result.data.summary.indexationChoice[0].chosen, 'indexed');
  const si = result.data.json.ITR.ITR2.ScheduleSI.SplCodeRateTax.map((row) => `${row.SecCode}:${row.SplRatePercent}`).sort();
  assert.deepEqual(si, ['1A:20', '21_BE:20', '2A:12.5']);
});

test('a short-term loss is set off against a long-term gain and the schedules stay valid', () => {
  const result = build({ capitalGains: { transactions: [
    equity('A', 'INE009A01021', '2024-01-10', '2024-08-10', 100000, 300000),
    equity('B', 'INE040A01034', '2021-01-10', '2024-09-10', 700000, 200000),
  ] } });
  assert.equal(result.data.validation.valid, true, JSON.stringify(result.data.problems));
  assert.equal(result.data.summary.taxAtSpecialRates, 21875);
  const losses = result.data.json.ITR.ITR2.ScheduleCGFor23.CurrYrLosses;
  assert.equal(losses.InLossSetOff.StclSetoff20Per, 200000);
  assert.equal(losses.InLtcg12_5Per.StclSetoff20Per, 200000);
});

test('brought-forward capital losses and house property loss are used', () => {
  const result = build({
    broughtForward: { longTermCapitalLoss: 80000, shortTermCapitalLoss: 10000, houseProperty: 30000 },
    houseProperties: [{ type: 'L', rentReceived: 300000 }],
    capitalGains: { transactions: [
      equity('B', 'INE040A01034', '2021-01-10', '2024-09-10', 700000, 200000),
      equity('C', 'INE040A01034', '2024-02-10', '2024-09-10', 300000, 200000),
    ] },
  });
  assert.equal(result.data.validation.valid, true, JSON.stringify(result.data.problems));
  assert.equal(result.data.summary.grossTotalIncome, 947600 + 180000 + 295000 + 90000 + 125000);
  assert.equal(result.data.json.ITR.ITR2.ScheduleBFLA.TotalBFLossSetOff.TotBFLossSetoff, 90000);
});

test('a long-term loss with no gain is carried forward', () => {
  const result = build({ capitalGains: { transactions: [
    { name: 'Plot', kind: 'property', buyDate: '2015-04-01', sellDate: '2024-10-01', saleValue: 2000000, cost: 3000000 },
    { name: 'Gold', kind: 'gold', buyDate: '2020-01-01', sellDate: '2024-09-01', saleValue: 500000, cost: 200000 },
  ] } });
  assert.equal(result.data.validation.valid, true, JSON.stringify(result.data.problems));
  assert.equal(result.data.summary.lossesToCarryForward.longTermCapitalLoss, 700000);
  assert.equal(result.data.json.ITR.ITR2.PartB_TTI.ComputationOfTaxLiability.TaxPayableOnTI.TaxAtSpecialRates, 0);
});

test('house property loss: set off in the old regime up to Rs 2 lakh, carried forward in the new', () => {
  const old = build({ houseProperties: [{ type: 'S', interest: 350000 }], deductions: { c80: 150000 } });
  assert.equal(old.data.summary.incomeFromHouseProperty, -200000);
  assert.equal(old.data.summary.totalIncome, 597600);
  const fresh = build({ regime: 'new', houseProperties: [{ type: 'L', rentReceived: 100000, interest: 400000 }] });
  assert.equal(fresh.data.summary.lossesToCarryForward.houseProperty, 330000);
  assert.equal(fresh.data.validation.valid, true);
});

test('blocking problems: missing ISIN, foreign assets, business income, no bank account', () => {
  const noIsin = build({ capitalGains: { transactions: [{ name: 'B', kind: 'listed-equity', buyDate: '2021-01-10', sellDate: '2024-09-10', saleValue: 700000, cost: 200000 }] } });
  assert.equal(noIsin.data.ready, false);
  assert.ok(noIsin.data.problems.some((p) => /ISIN/.test(p.message)));
  assert.equal(build({ foreignAssets: true }).data.ready, false);
  assert.equal(build({ businessIncome: 50000 }).data.ready, false);
  assert.ok(build({ bank: {} }).data.problems.some((p) => p.path === 'bank'));
});

test('another assessment year is built but not checked against a schema', () => {
  const result = build({ fy: '2025-26' });
  assert.equal(result.data.validation.checked, false);
});
