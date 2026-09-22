import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { r2 } from '../src/core.mjs';
import { computeIncomeTax } from '../src/income-tax.mjs';
import { parseAis, parseForm26as, parseIncome, buildItr } from '../src/itr.mjs';
import { parsePayments, monitorTds } from '../src/tdsmonitor.mjs';

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(f) { return readFileSync(resolve(FIX, f), 'utf8'); }

describe('GATE 1: ITR fixture-exact numbers', () => {
  const ais = parseAis(load('ais.csv')).rows;
  const tds26 = parseForm26as(load('26as.csv')).rows;
  const income = parseIncome(load('income.csv')).rows;
  const result = buildItr({ ais, tds26, income, fy: '2026-27' });

  it('gti', () => { assert.equal(result.gti, 4550000); });
  it('taxable newRegime', () => { assert.equal(result.taxable.newRegime, 4475000); });
  it('taxable oldRegime (80D claim 50,000 capped at 25,000)', () => { assert.equal(result.taxable.oldRegime, 4325000); });
  it('tax newTotal: 20,000 + 40,000 + 60,000 + 80,000 + 1,00,000 + 30% of 20,75,000 = 9,22,500 plus 4% cess', () => { assert.equal(result.tax.newTotal, 959400); });
  it('tax oldTotal: 12,500 + 1,00,000 + 30% of 33,25,000 = 11,10,000 plus 4% cess', () => { assert.equal(result.tax.oldTotal, 1154400); });
  it('recommended', () => { assert.equal(result.recommended, 'new'); });
  it('savings', () => { assert.equal(result.savings, 195000); });
  it('tdsCredit', () => {
    assert.equal(result.tdsCredit.salary, 45000);
    assert.equal(result.tdsCredit.other, 12500);
    assert.equal(result.tdsCredit.total, 57500);
  });
  it('advanceTax', () => { assert.equal(result.advanceTax, 0); });
  it('payable', () => { assert.equal(result.payable, 901900); });
  it('refund', () => { assert.equal(result.refund, 0); });
});

describe('GATE 2: AIS reconciliation', () => {
  const ais = parseAis(load('ais.csv')).rows;
  const tds26 = parseForm26as(load('26as.csv')).rows;
  const income = parseIncome(load('income.csv')).rows;
  const result = buildItr({ ais, tds26, income });

  it('aisVsReturn length 4', () => { assert.equal(result.reconciliations.aisVsReturn.length, 4); });
  it('unexplainedAis', () => { assert.equal(result.reconciliations.unexplainedAis, 390000); });
  it('tds26Total', () => { assert.equal(result.reconciliations.tds26Total, 57500); });
  it('ok is false', () => { assert.equal(result.ok, false); });
  it('capital row', () => {
    const r = result.reconciliations.aisVsReturn.find(x => x.incomeType === 'capital');
    assert.deepEqual(r, { incomeType: 'capital', ais: 30000, declared: 0, diff: 30000 });
  });
  it('dividend row', () => {
    const r = result.reconciliations.aisVsReturn.find(x => x.incomeType === 'dividend');
    assert.deepEqual(r, { incomeType: 'dividend', ais: 50000, declared: 0, diff: 50000 });
  });
  it('interest row', () => {
    const r = result.reconciliations.aisVsReturn.find(x => x.incomeType === 'interest');
    assert.deepEqual(r, { incomeType: 'interest', ais: 120000, declared: 50000, diff: 70000 });
  });
  it('rent row', () => {
    const r = result.reconciliations.aisVsReturn.find(x => x.incomeType === 'rent');
    assert.deepEqual(r, { incomeType: 'rent', ais: 240000, declared: 0, diff: 240000 });
  });
  it('aisVsReturn sorted incomeType asc', () => {
    const types = result.reconciliations.aisVsReturn.map(x => x.incomeType);
    assert.deepEqual(types, ['capital', 'dividend', 'interest', 'rent']);
  });
});

describe('GATE 3: TDS monitor fixture-exact flags', () => {
  const { rows: payments } = parsePayments(load('payments.csv'));
  const flags = monitorTds({ payments, fy: '2026-27' });

  it('4 flags', () => { assert.equal(flags.length, 4); });
  it('Finance Bank 194A single', () => {
    assert.deepEqual(flags[0], { payee: 'Finance Bank', section: '194A', kind: 'single', basis: 45000, rate: 0.10, assumedTds: 4500 });
  });
  it('Raj Contractors 194C annual', () => {
    assert.deepEqual(flags[1], { payee: 'Raj Contractors', section: '194C', kind: 'annual', basis: 110000, rate: 0.01, assumedTds: 1100 });
  });
  it('Shelter RE 194I annual', () => {
    assert.deepEqual(flags[2], { payee: 'Shelter RE', section: '194I', kind: 'annual', basis: 400000, rate: 0.10, assumedTds: 40000 });
  });
  it('Tech Pro 194J single', () => {
    assert.deepEqual(flags[3], { payee: 'Tech Pro', section: '194J', kind: 'single', basis: 35000, rate: 0.10, assumedTds: 3500 });
  });
});

describe('GATE 4: New regime at Rs 12 lakh total income pays nothing in FY 2025-26', () => {
  it('slab tax 60,000 is fully rebated', () => {
    const result = computeIncomeTax({ fy: '2025-26', regime: 'new', residentIndividual: true, salaryPaise: 0, otherIncomePaise: 120000000, claims: {} });
    assert.equal(result.slabTaxPaise, 6000000);
    assert.equal(result.rebatePaise, 6000000);
    assert.equal(result.taxPayablePaise, 0);
  });
});

describe('GATE 5: Old regime no rebate above 5L', () => {
  it('no rebate at Rs 50 lakh', () => {
    const result = computeIncomeTax({ fy: '2025-26', regime: 'old', residentIndividual: true, salaryPaise: 0, otherIncomePaise: 500000000, claims: {} });
    assert.equal(result.rebatePaise, 0);
    assert.ok(result.taxPayablePaise > 0);
  });
});

describe('GATE 5b: TDS above the liability becomes a refund', () => {
  it('refund equals TDS less tax', () => {
    const result = buildItr({ income: [{ nature: 'salary', value: 1000000, note: '' }], tds26: [{ section: '192', tds: 40000 }], fy: '2025-26' });
    assert.equal(result.tax.newTotal, 0);
    assert.equal(result.payable, 0);
    assert.equal(result.refund, 40000);
  });
});

describe('GATE 6: Below-threshold TDS payee yields no flag', () => {
  it('no flag for small single payment under 194A threshold', () => {
    const payments = [
      { fy: '2026-27', payee: 'Small Vendor', section: '194A', date: '2026-07-01', amount: 30000 },
    ];
    const flags = monitorTds({ payments, fy: '2026-27' });
    assert.equal(flags.length, 0);
  });
});

describe('GATE 7: AIS with no gaps yields ok true', () => {
  it('matching AIS and income produces ok true', () => {
    const aisRows = [
      { assessmentYear: '2027-28', informationType: 'SFT', sectionDescription: '', incomeType: 'salary', transactingEntity: '', amount: 3000000, tds: 45000, periodStart: '', periodEnd: '' },
    ];
    const incomeRows = [
      { nature: 'salary', value: 3000000, note: '' },
      { nature: 'business_profit', value: 1500000, note: '' },
      { nature: 'other_interest', value: 0, note: '' },
      { nature: 'deduction_80c', value: 0, note: '' },
      { nature: 'deduction_80d', value: 0, note: '' },
    ];
    const result = buildItr({ ais: aisRows, income: incomeRows });
    assert.equal(result.ok, true);
    assert.equal(result.reconciliations.aisVsReturn.length, 0);
  });
});

describe('GATE 8: parsers never throw', () => {
  it('parseAis on empty', () => { assert.doesNotThrow(() => parseAis('')); });
  it('parseForm26as on empty', () => { assert.doesNotThrow(() => parseForm26as('')); });
  it('parseIncome on empty', () => { assert.doesNotThrow(() => parseIncome('')); });
  it('parsePayments on empty', () => { assert.doesNotThrow(() => parsePayments('')); });
  it('parseAis on garbage', () => { const r = parseAis('x,y\n1,2'); assert.ok(r.rows.length >= 0); });
});
