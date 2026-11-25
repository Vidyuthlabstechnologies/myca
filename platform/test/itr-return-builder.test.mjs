import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-itr-builder-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { validateAssistantToolCall } from '../src/assistant-tools.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { buildItr3, buildItr4, interestAndFee, presumptiveIncome } from '../src/itr-return-builder.mjs';
import { buildItr1 } from '../src/itr-return-individual.mjs';
import { buildItrReturn } from '../src/itr-return.mjs';
import { checkItrJson } from '../src/itr-json-check.mjs';

const taxpayer = { name: 'Test Person', pan: 'ABCDE1234F', dob: '1985-05-05', fatherName: 'Test Father', mobile: '9876543210', email: 'test@example.com', address: { flat: '12', locality: 'MG Road', city: 'Bengaluru', stateCode: '29', pin: '560001' } };
const bank = { ifsc: 'SBIN0000001', name: 'SBI', account: '123456789' };

test('ITR-4: presumptive income at 6% digital and 8% other, tax, and a JSON that matches the CBDT schema', () => {
  const r = buildItr4({ fy: '2024-25', taxpayer, regime: 'new', filingDate: '2025-07-20', businesses: [{ name: 'Shop', code: '01001', turnoverBank: 80_00_000, turnoverCash: 20_00_000 }], otherIncome: { savingsInterest: 20000 }, bank });
  assert.equal(r.ok, true);
  assert.equal(r.data.ready, true, JSON.stringify(r.data.problems));
  assert.equal(r.data.validation.valid, true);
  const body = r.data.json.ITR.ITR4;
  assert.equal(body.ScheduleBP.PersumptiveInc44AD.PersumptiveInc44AD6Per, 480000);
  assert.equal(body.ScheduleBP.PersumptiveInc44AD.PersumptiveInc44AD8Per, 160000);
  assert.equal(body.IncomeDeductions.IncomeFromBusinessProf, 640000);
  assert.equal(body.IncomeDeductions.TotalIncome, 660000);
  assert.equal(body.TaxComputation.GrossTaxLiability, 0, 'rebate covers Rs 6.6 lakh in the new regime');
  // the shipped JSON passes MyCA's own checker too
  assert.equal(checkItrJson(createState(), { json: JSON.stringify(r.data.json) }).data.valid, true);
});

test('ITR-4: profession at 50%, tax above the rebate, refund when TDS exceeds tax', () => {
  const r = buildItr4({ fy: '2024-25', taxpayer, regime: 'new', filingDate: '2025-07-20', professions: [{ name: 'Consultant', code: '14001', receiptsBank: 40_00_000 }], taxesPaid: { tds: 300000 }, bank });
  assert.equal(r.data.summary.presumptiveProfessionIncome, 2000000);
  assert.equal(r.data.summary.totalIncome, 2000000);
  assert.equal(r.data.summary.grossTaxLiability, 301600, 'slabs to 20 lakh = 2,90,000 plus 4% cess');
  assert.equal(r.data.summary.balanceTaxPayable, 1600, 'TDS of 3 lakh leaves Rs 1,600');
  const refund = buildItr4({ fy: '2024-25', taxpayer, regime: 'new', filingDate: '2025-07-20', professions: [{ name: 'Consultant', code: '14001', receiptsBank: 40_00_000 }], taxesPaid: { tds: 350000 }, bank });
  assert.equal(refund.data.summary.refundDue, 48400);
  const noBank = buildItr4({ fy: '2024-25', taxpayer, professions: [{ name: 'C', code: '14001', receiptsBank: 40_00_000 }], taxesPaid: { tds: 350000 } });
  assert.ok(noBank.data.problems.some((p) => p.path === 'bank'));
  assert.equal(r.data.validation.valid, true);
});

test('ITR-4 refuses what the form does not allow', () => {
  const over = buildItr4({ fy: '2024-25', taxpayer, businesses: [{ name: 'Big', code: '01001', turnoverCash: 5_00_00_000 }] });
  assert.equal(over.data.ready, false);
  assert.ok(over.data.problems.some((p) => /44AD limit/.test(p.message)));
  const lower = buildItr4({ fy: '2024-25', taxpayer, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 1000000 }], declaredBusinessProfit: 10000 });
  assert.ok(lower.data.problems.some((p) => /cannot be below 60000/.test(p.message)));
  const loss = buildItr4({ fy: '2024-25', taxpayer, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 1000000 }], capitalGains: { shortTerm: 5000 }, foreignAssets: true, houseProperty: { netIncome: -10000 } });
  assert.ok(loss.data.problems.length >= 3);
  const noPan = buildItr4({ fy: '2024-25', taxpayer: { ...taxpayer, pan: 'bad' }, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 100000 }] });
  assert.ok(noPan.data.problems.some((p) => p.path === 'taxpayer.pan'));
});

test('lower cash share lifts the 44AD cap to Rs 3 crore', () => {
  const p = presumptiveIncome({ fy: '2024-25', businesses: [{ turnoverBank: 2_80_00_000, turnoverCash: 10_00_000 }] });
  assert.equal(p.overBusinessCap, false);
  const q = presumptiveIncome({ fy: '2024-25', businesses: [{ turnoverBank: 1_00_00_000, turnoverCash: 1_10_00_000 }] });
  assert.equal(q.overBusinessCap, true);
});

test('interest: 234B and 234C worked by hand (tax Rs 1.3 lakh, nothing paid, filed 20 Jul 2025)', () => {
  const i = interestAndFee({ ayStart: 2025, dueDate: '2025-07-31', filingDate: '2025-07-20', taxLiability: 130000, tdsAndTcs: 0, totalIncome: 1425000 });
  assert.equal(i.us234A, 0);
  assert.equal(i.us234B, 5200); // 1% x 4 months x 130,000
  assert.equal(i.us234C, 585 + 1755 + 2925 + 1300);
  assert.equal(i.fee234F, 0);
  const late = interestAndFee({ ayStart: 2025, dueDate: '2025-07-31', filingDate: '2025-09-05', taxLiability: 130000, tdsAndTcs: 0, advancePayments: [{ date: '2025-03-10', amount: 130000 }], totalIncome: 1425000 });
  assert.equal(late.us234A, 0, 'advance tax paid in full leaves nothing for 234A');
  assert.equal(late.fee234F, 5000);
  const small = interestAndFee({ ayStart: 2025, dueDate: '2025-07-31', filingDate: '2025-12-31', taxLiability: 20000, tdsAndTcs: 0, totalIncome: 400000 });
  assert.equal(small.fee234F, 1000);
  const presumptive = interestAndFee({ ayStart: 2025, dueDate: '2025-07-31', filingDate: '2025-07-20', taxLiability: 50000, tdsAndTcs: 0, presumptive: true, totalIncome: 900000, advancePayments: [{ date: '2025-03-14', amount: 50000 }] });
  assert.equal(presumptive.us234C, 0);
});

test('ITR-3: books profit to business income, balanced balance sheet, schema-valid JSON', () => {
  const r = buildItr3({
    fy: '2024-25', taxpayer, regime: 'auto', filingDate: '2025-07-20', bank,
    profitAndLoss: { turnover: 6000000, interestIncome: 5000, expenses: 4500000, depreciationBooks: 50000, interestExpense: 30000 },
    adjustments: { depreciationIncomeTax: 60000, disallowed40A: 10000 },
    balanceSheet: { fixedAssetsNet: 300000, inventories: 500000, debtors: 400000, cash: 50000, bank: 200000, creditors: 300000, securedLoans: 100000 },
  });
  assert.equal(r.data.ready, true, JSON.stringify(r.data.problems));
  assert.equal(r.data.summary.profitBeforeTaxPerBooks, 1425000);
  assert.equal(r.data.summary.businessIncomeAfterAdjustments, 1420000);
  assert.equal(r.data.validation.valid, true);
  const bs = r.data.json.ITR.ITR3.PARTA_BS;
  assert.equal(bs.FundSrc.TotFundSrc, bs.FundApply.TotFundApply);
  assert.equal(r.data.summary.regime, 'new');
});

test('ITR-3 flags a balance sheet that does not balance', () => {
  const r = buildItr3({ fy: '2024-25', taxpayer, profitAndLoss: { turnover: 100000, expenses: 50000 }, balanceSheet: { capital: 1, fixedAssetsNet: 500 } });
  assert.ok(r.data.problems.some((p) => p.path === 'balanceSheet'));
});

test('a financial year without a held schema is built but marked unchecked', () => {
  const r = buildItr4({ fy: '2025-26', taxpayer, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 1000000 }], bank });
  assert.equal(r.data.validation.checked, false);
  assert.match(r.data.notes.join(' '), /AY 2026-27/);
  assert.equal(r.data.json.ITR.ITR4.Form_ITR4.AssessmentYear, '2026');
});

test('build_itr_json is a registered, read-only tool with a strict argument schema', async () => {
  assert.ok(TOOLS.some((t) => t.name === 'build_itr_json'));
  assert.ok(REMOTE_QUERY_TOOLS.has('build_itr_json'));
  assert.equal(validateAssistantToolCall('build_itr_json', { form: 'ITR-4', taxpayer, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 1 }] }).ok, true);
  assert.equal(validateAssistantToolCall('build_itr_json', { form: 'ITR-5', taxpayer }).ok, false);
  assert.equal(validateAssistantToolCall('build_itr_json', { form: 'ITR-4', taxpayer, bogus: 1 }).ok, false);
  const state = createState();
  const out = await runTool(state, 'build_itr_json', { form: 'ITR-4', taxpayer, businesses: [{ name: 'Shop', code: '01001', turnoverBank: 1000000 }], bank, fy: '2024-25' });
  assert.equal(out.ok, true);
  assert.equal(out.data.form, 'ITR-4');
  const unsupported = await runTool(state, 'build_itr_json', { form: 'ITR-5', taxpayer });
  assert.equal(unsupported.ok, false);
});

import { depreciationSchedule } from '../src/it-depreciation.mjs';
import { booksFigures } from '../src/itr-books.mjs';

test('depreciation by block: half rate under 180 days, section 50 gain when sales exceed the block', () => {
  const r = depreciationSchedule({ fyEnd: '2025-03-31', blocks: [
    { block: 'computers-software', openingWdv: 100000, additions: [{ date: '2024-06-01', amount: 50000 }, { date: '2025-02-01', amount: 20000 }] },
    { block: 'plant-machinery', openingWdv: 10000, sales: 30000 },
  ] });
  assert.equal(r.ok, true);
  // 40% on 150,000 full-year value plus 20% on the 20,000 added late
  assert.equal(r.data.rows[0].depreciation, 60000 + 4000 - 0);
  assert.equal(r.data.rows[1].shortTermGain, 20000);
  assert.equal(r.data.rows[1].depreciation, 0);
  assert.equal(depreciationSchedule({ fyEnd: '2025-03-31', blocks: [{ block: 'rocket' }] }).ok, false);
});

test('books feed the return: demo books for FY 2026-27 give ITR-4 and ITR-3 without typed figures', async () => {
  const state = createState();
  await runTool(state, 'seed_demo', {});
  state.company.name = 'Nalanda Textiles';
  state.company.pan = 'ABCDE1234F';
  const figures = booksFigures(state, { fy: '2026-27' });
  assert.equal(figures.data.profitAndLoss.turnover, 820000);
  assert.equal(figures.data.profitAndLoss.netProfit, 780000);
  assert.equal(figures.data.balanceSheet.debtors, 377600);
  const t = { dob: '1985-05-05', fatherName: 'F', mobile: '9876543210', email: 't@example.com', address: { flat: '1', locality: 'L', city: 'Bengaluru', stateCode: '29' } };
  const four = await runTool(state, 'build_itr_json', { form: 'ITR-4', fy: '2026-27', fromBooks: true, taxpayer: t, bank });
  assert.equal(four.data.ready, true, JSON.stringify(four.data.problems));
  assert.equal(four.data.summary.presumptiveBusinessIncome, 49200);
  assert.equal(four.data.source, 'books');
  const three = await runTool(state, 'build_itr_json', { form: 'ITR-3', fy: '2026-27', fromBooks: true, taxpayer: t, bank, fixedAssets: [{ block: 'computers-software', openingWdv: 100000 }] });
  assert.equal(three.data.ready, true, JSON.stringify(three.data.problems));
  assert.equal(three.data.summary.businessIncomeAfterAdjustments, 780000 - 40000);
  const bs = three.data.json.ITR.ITR3.PARTA_BS;
  assert.equal(bs.FundSrc.TotFundSrc, bs.FundApply.TotFundApply);
});

test('ITR-1: salary, let-out house property, interest, old regime with 80C and 80D, schema-valid', () => {
  const r = buildItr1({
    fy: '2024-25', taxpayer, regime: 'old', filingDate: '2025-07-20', bank,
    salary: { gross: 1200000, professionalTax: 2400, exemptAllowances: [{ nature: '10(10)', amount: 100000 }] },
    houseProperty: { type: 'L', rentReceived: 240000, municipalTax: 12000, interest: 100000 },
    otherIncome: { savingsInterest: 12000, depositInterest: 20000 },
    deductions: { c80: 150000, d80Self: 25000, nps1B: 50000 },
    taxesPaid: { tdsSalary: [{ tan: 'BLRA12345B', name: 'Employer Pvt Ltd', income: 1200000, tds: 90000 }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.ready, true, JSON.stringify(r.data.problems));
  assert.equal(r.data.validation.valid, true, JSON.stringify(r.data.validation.errors));
  const body = r.data.json.ITR.ITR1;
  assert.equal(body.ITR1_IncomeDeductions.NetSalary, 1100000);
  assert.equal(body.ITR1_IncomeDeductions.IncomeFromSal, 1100000 - 50000 - 2400);
  // 228,000 net annual value, 30% = 68,400, interest 100,000: income 59,600
  assert.equal(body.ITR1_IncomeDeductions.TotalIncomeOfHP, 228000 - 68400 - 100000);
  assert.equal(body.ITR1_IncomeDeductions.IncomeOthSrc, 32000);
  assert.equal(body.ITR1_IncomeDeductions.DeductUndChapVIA.Section80C, 150000);
  assert.equal(body.ITR1_IncomeDeductions.DeductUndChapVIA.Section80CCD1B, 50000);
});

test('ITR-1 refuses what the form does not allow and caps self-occupied interest', () => {
  const bad = buildItr1({ fy: '2024-25', taxpayer, salary: { gross: 1000000 }, capitalGains: { shortTerm: 1000 }, foreignAssets: true, ltcg112A: { saleValue: 500000, cost: 100000 } });
  assert.ok(bad.data.problems.length >= 3);
  const loss = buildItr1({ fy: '2024-25', taxpayer, regime: 'new', salary: { gross: 1000000 }, houseProperty: { type: 'L', rentReceived: 100000, interest: 400000 } });
  assert.ok(loss.data.problems.some((p) => p.path === 'houseProperty'));
  const self = buildItr1({ fy: '2024-25', taxpayer, regime: 'old', salary: { gross: 1000000 }, houseProperty: { type: 'S', interest: 500000 } });
  assert.equal(self.data.json.ITR.ITR1.ITR1_IncomeDeductions.TotalIncomeOfHP, -200000);
  const auto = buildItr1({ fy: '2024-25', taxpayer, bank, regime: 'auto', salary: { gross: 1500000 }, deductions: { c80: 150000, d80Self: 25000 }, houseProperty: { type: 'S', interest: 200000 } });
  assert.ok(auto.data.summary.comparedRegimes.oldTax >= 0);
  assert.equal(auto.data.validation.valid, true, JSON.stringify(auto.data.validation.errors));
});

test('ITR-3 with shares, gold and a let-out property: special-rate tax, schedules valid', () => {
  const result = buildItrReturn({}, {
    form: 'ITR-3', fy: '2024-25', regime: 'new', taxpayer, bank,
    profitAndLoss: { turnover: 2500000, expenses: 1200000 },
    houseProperties: [{ type: 'L', rentReceived: 240000, municipalTax: 12000, interest: 150000, address: { line: 'Flat 4', city: 'Pune', stateCode: '27' } }],
    capitalGains: { transactions: [
      { name: 'INFY', kind: 'listed-equity', isin: 'INE009A01021', buyDate: '2022-01-10', sellDate: '2024-09-10', saleValue: 400000, cost: 250000 },
      { name: 'HDFC', kind: 'listed-equity', isin: 'INE040A01034', buyDate: '2024-01-10', sellDate: '2024-08-10', saleValue: 300000, cost: 200000 },
      { name: 'Gold', kind: 'gold', buyDate: '2020-01-01', sellDate: '2024-06-01', saleValue: 300000, cost: 200000 },
    ] },
  });
  assert.equal(result.data.ready, true, JSON.stringify(result.data.problems));
  assert.equal(result.data.validation.valid, true);
  assert.equal(result.data.summary.taxAtSpecialRates, 3125 + 20000 + 20000);
  assert.equal(result.data.summary.shortTermGains, 100000);
  assert.equal(result.data.summary.incomeFromHouseProperty, 9600);
});
