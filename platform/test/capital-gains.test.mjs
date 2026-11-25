import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCapitalGains, classify, holdingTest } from '../src/capital-gains.mjs';
import { incomeTax } from '../src/sprint-load.mjs';

const eq = (over) => ({ kind: 'listed-equity', name: 'XYZ', buyDate: '2023-01-10', sellDate: '2024-09-01', saleValue: 400000, cost: 100000, ...over });

test('holding period: listed equity is long term only after more than 12 months; property after 24; gold 36 before and 24 after 23 July 2024', () => {
  assert.equal(holdingTest(eq({ buyDate: '2024-01-01', sellDate: '2025-01-01' })).longTerm, false, 'exactly 12 months is still short');
  assert.equal(holdingTest(eq({ buyDate: '2024-01-01', sellDate: '2025-01-02' })).longTerm, true);
  assert.equal(holdingTest({ kind: 'property', buyDate: '2022-06-01', sellDate: '2024-06-01' }).longTerm, false);
  assert.equal(holdingTest({ kind: 'property', buyDate: '2022-05-31', sellDate: '2024-06-01' }).longTerm, true);
  assert.equal(holdingTest({ kind: 'gold', buyDate: '2022-01-01', sellDate: '2024-06-01' }).longTerm, false, '36 months before 23 July 2024');
  assert.equal(holdingTest({ kind: 'gold', buyDate: '2022-01-01', sellDate: '2024-08-01' }).longTerm, true, '24 months after');
});

test('112A: Rs 1.25 lakh exempt, 12.5% after 23 July 2024', () => {
  const r = computeCapitalGains({ transactions: [eq({})] });
  assert.equal(r.original.ltcg112A_AE, 300000);
  assert.equal(r.exemption112A, 125000);
  assert.equal(r.specialIncome.ltcg112A_AE, 300000);
  assert.equal(r.exempted.ltcg112A_AE, 125000);
});

test('112A exemption applies first to the gains taxed at 12.5%', () => {
  const r = computeCapitalGains({ transactions: [eq({ sellDate: '2024-05-01', saleValue: 300000 }), eq({ saleValue: 200000 })] });
  assert.equal(r.original.ltcg112A_BE, 200000);
  assert.equal(r.original.ltcg112A_AE, 100000);
  assert.equal(r.specialIncome.ltcg112A_BE, 200000);
  assert.equal(r.specialIncome.ltcg112A_AE, 100000);
  assert.equal(r.exempted.ltcg112A_AE, 100000);
  assert.equal(r.exempted.ltcg112A_BE, 25000);
});

test('losses: short-term loss absorbs gains, long-term loss cannot touch short-term gain and carries forward', () => {
  const stcgEquity = { kind: 'listed-equity', buyDate: '2024-06-01', sellDate: '2024-10-01', saleValue: 200000, cost: 100000 };
  const stLoss = { kind: 'gold', buyDate: '2024-06-01', sellDate: '2024-10-01', saleValue: 70000, cost: 100000 };
  const a = computeCapitalGains({ transactions: [stcgEquity, stLoss] });
  assert.equal(a.specialIncome.stcg111A_AE, 70000);
  assert.equal(a.carryForward.stcl, 0);
  const ltLoss = { kind: 'property', buyDate: '2015-01-01', sellDate: '2024-10-01', saleValue: 800000, cost: 1000000 };
  const b = computeCapitalGains({ transactions: [stcgEquity, ltLoss] });
  assert.equal(b.specialIncome.stcg111A_AE, 100000, 'long-term loss does not reduce a short-term gain');
  assert.equal(b.carryForward.ltcl, 200000);
  const c = computeCapitalGains({ transactions: [stcgEquity], broughtForward: { stcl: 40000, ltcl: 10000 } });
  assert.equal(c.specialIncome.stcg111A_AE, 60000);
  assert.equal(c.carryForward.ltcl, 10000);
});

test('grandfathering, deemed short term for debt fund units bought after March 2023, and bad input', () => {
  const g = classify({ kind: 'listed-equity', buyDate: '2016-01-01', sellDate: '2024-09-01', saleValue: 500000, cost: 100000, fmv31Jan2018: 300000 });
  assert.equal(g.cost, 300000);
  assert.equal(g.gain, 200000);
  const d = classify({ kind: 'debt-mf', buyDate: '2023-05-01', sellDate: '2025-01-01', saleValue: 120000, cost: 100000 });
  assert.equal(d.longTerm, false);
  assert.equal(d.bucket, 'stcgOther');
  const bad = computeCapitalGains({ transactions: [{ kind: 'nft', buyDate: '2024-01-01', sellDate: '2024-02-01' }] });
  assert.equal(bad.ok, false);
});

test('property bought before 23 July 2024: indexed 20% against flat 12.5%, the lower tax wins', () => {
  const base = { kind: 'property', buyDate: '2010-01-01', sellDate: '2024-12-01', saleValue: 10000000, cost: 2000000 };
  const high = computeCapitalGains({ transactions: [{ ...base, indexedCost: 6000000 }] });
  assert.equal(high.indexationChoice[0].chosen, 'indexed', '20% on 40 lakh = 8 lakh beats 12.5% on 80 lakh = 10 lakh');
  assert.equal(high.specialIncome.ltcgOther_BE, 4000000);
  const low = computeCapitalGains({ transactions: [{ ...base, indexedCost: 2500000 }] });
  assert.equal(low.indexationChoice[0].chosen, 'flat');
  assert.equal(low.specialIncome.ltcgOther_AE, 8000000);
});

const L = 100000_00;
test('tax with special rates: 111A at 20% on top of salary, and the unused basic exemption lowers special-rate income', () => {
  const a = incomeTax.computeIncomeTaxSpecial({ fy: '2024-25', regime: 'new', salaryPaise: 8 * L, special: { stcg111A_AE: 1 * L } });
  assert.equal(a.normalTaxPaise, 22500_00);
  assert.equal(a.specialTaxPaise, 20000_00);
  assert.equal(a.taxPayablePaise, 44200_00, '42,500 plus 4% cess');
  const b = incomeTax.computeIncomeTaxSpecial({ fy: '2024-25', regime: 'new', otherIncomePaise: 2 * L, special: { ltcg112A_AE: 5 * L } });
  assert.equal(b.basicExemptionAdjustedPaise, 1 * L);
  assert.equal(b.specialTaxPaise, 50000_00);
  assert.equal(b.rebatePaise, 25000_00, 'before FY 2025-26 the rebate also covers tax on special-rate gains');
  const c = incomeTax.computeIncomeTaxSpecial({ fy: '2025-26', regime: 'new', otherIncomePaise: 2 * L, special: { ltcg112A_AE: 5 * L } });
  assert.equal(c.rebatePaise, 0, 'from FY 2025-26 the new-regime rebate does not cover special-rate tax');
});
