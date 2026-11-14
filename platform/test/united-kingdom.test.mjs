import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runEngineTool, enginePreview, engineWords } from '../src/countries/engines.mjs';
import { manifestFor, manifestProblems, ENGINE_PROVIDER_TOOLS, ENGINE_ADDRESS_TOOLS } from '../src/countries/manifests.mjs';
import { countryPack, isServedCountry, packForFlavor } from '../src/countries/index.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { ChannelClient, getChannelClient, setChannelClient } from '../src/channel-client.mjs';
import { gbSelfAssessment, tradingProfit } from '../src/countries/united-kingdom/self-assessment.mjs';
import { buildVatReturn, vatReturnProblems, vatRegistrationCheck } from '../src/countries/united-kingdom/vat.mjs';
import { quarterlyPeriods, mtdItMandate, selfEmploymentCumulative, ukPropertyCumulative, penaltyPoints, latePayment } from '../src/countries/united-kingdom/mtd.mjs';
import { utrValid, ninoValid, vrnValid, postcodeValid, companyNumberValid, checkGbIdentifier } from '../src/countries/united-kingdom/identifiers.mjs';
import { buildFraudHeaders, timezoneOffset } from '../src/countries/united-kingdom/fraud-headers.mjs';
import { sealToken, openToken, currentTaxYear } from '../src/countries/united-kingdom/hmrc-actions.mjs';
import { authorizeUrl, API_VERSIONS } from '../src/countries/united-kingdom/hmrc-client.mjs';
import { parseTaxYear, taxYearOn, monthEndPlus } from '../src/countries/united-kingdom/rules.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function gbState() {
  const state = createState();
  state.company = { ...(state.company || {}), country: 'GB', name: 'Test Trader' };
  return state;
}

const FULL_DEVICE = {
  deviceId: '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c',
  timezone: 'UTC+00:00',
  localIps: ['10.0.0.12', 'fe80::1'],
  localIpsTimestamp: '2026-11-14T10:00:00.000Z',
  screens: [{ width: 1080, height: 2400, scalingFactor: 2.75, colourDepth: 24 }],
  windowWidth: 393,
  windowHeight: 851,
  osFamily: 'Android',
  osVersion: '15',
  manufacturer: 'Google',
  model: 'Pixel 8',
  multiFactor: [{ type: 'TOTP', timestamp: '2026-11-14T09:59:00.000Z', uniqueReference: 'a1b2c3' }],
  ipAddress: '203.0.113.6',
  port: 51234,
  appVersion: '1.0.0',
};

test('the UK pack is a served beta country with its own app, London data and Play billing for software', () => {
  const pack = countryPack('GB');
  assert.equal(pack.status, 'beta');
  assert.equal(isServedCountry('GB'), true);
  assert.equal(packForFlavor('uk').app.androidId, 'com.mldynamic.myca.uk');
  assert.equal(pack.residency.defaultRegion, 'europe-west2');
  assert.equal(pack.yearStartDay, 6);
  for (const plan of pack.billing.plans.filter((entry) => entry.sells === 'software')) assert.equal(plan.provider, 'play', plan.id);
  assert.ok(pack.licences.some((licence) => licence.id === 'hmrc-production'));
});

test('the UK manifest is clean, its tools serve only the UK, and provider tools are flagged for the hosted service', () => {
  const manifest = manifestFor('GB');
  assert.deepEqual(manifestProblems([manifest], ['GB']), []);
  assert.equal(manifest.tools.length, 20);
  assert.ok(ENGINE_PROVIDER_TOOLS.includes('submit_gb_vat_return'));
  assert.ok(ENGINE_PROVIDER_TOOLS.includes('sync_gb_hmrc'));
  assert.equal(ENGINE_PROVIDER_TOOLS.includes('gb_tax_estimate'), false);
  assert.ok(ENGINE_ADDRESS_TOOLS.includes('submit_gb_itsa_update'));
  assert.equal(toolServesCountry('gb_tax_estimate', 'GB'), true);
  assert.equal(toolServesCountry('gb_tax_estimate', 'IN'), false);
  const bad = { ...manifest, tools: [{ ...manifest.tools[3], providerCalls: true }] };
  assert.match(manifestProblems([bad], ['GB']).join('\n'), /providerCalls is true on a write tool/);
  const noDevice = { ...manifest, tools: [{ ...manifest.tools[0], clientAddress: true }] };
  assert.match(manifestProblems([noDevice], ['GB']).join('\n'), /takes a device argument/);
});

test('tax years run 6 April to 5 April', () => {
  assert.deepEqual(parseTaxYear('2026-27'), { label: '2026-27', start: 2026, from: '2026-04-06', to: '2027-04-05', hmrc: '2026-27' });
  assert.equal(parseTaxYear('2026-28'), null);
  assert.equal(parseTaxYear('2026'), null);
  assert.equal(taxYearOn('2026-04-05').label, '2025-26');
  assert.equal(taxYearOn('2026-04-06').label, '2026-27');
  assert.equal(currentTaxYear('2027-01-01'), '2026-27');
  assert.equal(currentTaxYear('2027-04-06'), '2027-28');
});

test('UK tax numbers are checked by format and check digit', () => {
  assert.equal(utrValid('1234567890'), false);
  assert.equal(utrValid('2234567890'), true);
  assert.equal(utrValid('22345 67890'), true);
  assert.equal(utrValid('2234567890K'), true);
  assert.equal(utrValid('123'), false);
  assert.equal(ninoValid('AA123456C'), true);
  assert.equal(ninoValid('aa 12 34 56 c'), true);
  assert.equal(ninoValid('QQ123456C'), false);
  assert.equal(ninoValid('BG123456A'), false);
  assert.equal(ninoValid('AO123456A'), false);
  assert.equal(ninoValid('AA123456E'), false);
  assert.equal(vrnValid('GB999999973'), true);
  assert.equal(vrnValid('999999973'), true);
  assert.equal(vrnValid('999999974'), false);
  assert.equal(vrnValid('000000000'), false);
  assert.equal(postcodeValid('SW1A 1AA'), true);
  assert.equal(postcodeValid('sw1a1aa'), true);
  assert.equal(postcodeValid('12345'), false);
  assert.equal(companyNumberValid('SC123456'), true);
  assert.equal(companyNumberValid('01234567'), true);
  assert.equal(companyNumberValid('XX12345'), false);
  assert.equal(checkGbIdentifier('nino', 'QQ123456C').data.valid, false);
  assert.match(checkGbIdentifier('nino', 'QQ123456C').data.why, /National Insurance/);
  assert.equal(checkGbIdentifier('passport', 'x').error, 'UNKNOWN_IDENTIFIER_KIND');
});

test('an employee on £50,000 in England pays £7,486 in 2025-26 and in Scotland £9,013.80', () => {
  const england = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 50000 } });
  assert.equal(england.ok, true);
  assert.equal(england.data.incomeTax, 7486);
  assert.equal(england.data.allowances.personalAllowance, 12570);
  assert.equal(england.data.class4.total, 0);
  const scotland = gbSelfAssessment({ taxYear: '2025-26', residence: 'scotland', income: { employment: 50000 } });
  assert.equal(scotland.data.incomeTax, 9013.8);
  const scotland26 = gbSelfAssessment({ taxYear: '2026-27', residence: 'scotland', income: { employment: 30000 } });
  assert.equal(scotland26.data.incomeTax, Math.round((3967 * 19 + (16956 - 3967) * 20 + (17430 - 16956) * 21)) / 100);
  assert.equal(gbSelfAssessment({ taxYear: '2025-26', residence: 'wales', income: { employment: 50000 } }).data.incomeTax, 7486);
});

test('a sole trader pays Class 4, gets payments on account, and the first January bill adds the first one', () => {
  const out = gbSelfAssessment({ taxYear: '2025-26', income: { selfEmployment: { turnover: 60000, expenses: 10000 } } });
  assert.equal(out.data.income.selfEmploymentProfit, 50000);
  assert.equal(out.data.incomeTax, 7486);
  assert.equal(out.data.class4.total, 2245.8);
  assert.equal(out.data.nextYear.paymentOnAccountEach, 4865.9);
  assert.deepEqual(out.data.nextYear.dueDates, ['2027-01-31', '2027-07-31']);
  assert.equal(out.data.balancingPayment, 9731.8);
  assert.equal(out.data.firstPaymentDue, 14597.7);
  assert.equal(out.data.dueBy, '2027-01-31');
  const big = gbSelfAssessment({ taxYear: '2025-26', income: { selfEmployment: { turnover: 80000 } } });
  assert.equal(big.data.class4.total, Math.round((50270 - 12570) * 6 + (80000 - 50270) * 2) / 100);
});

test('payments on account are skipped under £1,000 or when 80% was taxed at source', () => {
  const small = gbSelfAssessment({ taxYear: '2025-26', income: { selfEmployment: { turnover: 15000 } } });
  assert.ok(small.data.incomeTax + small.data.class4.total < 1000);
  assert.equal(small.data.nextYear.paymentOnAccountEach, 0);
  assert.match(small.data.nextYear.why, /under £1,000/);
  const paye = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 60000, other: 3000 }, taxPaid: { paye: 11000 } });
  assert.equal(paye.data.nextYear.paymentOnAccountEach, 0);
  assert.match(paye.data.nextYear.why, /80%/);
});

test('the personal allowance tapers away to nothing at £125,140, and pension contributions win it back', () => {
  const at = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 125140 } });
  assert.equal(at.data.allowances.personalAllowance, 0);
  assert.match(at.data.notes.join(' '), /£1 for every £2/);
  const mid = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 110000 } });
  assert.equal(mid.data.allowances.personalAllowance, 7570);
  const pension = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 110000 }, pensionContributionsNet: 8000 });
  assert.equal(pension.data.allowances.bandExtension, 10000);
  assert.equal(pension.data.allowances.personalAllowance, 12570);
});

test('the High Income Child Benefit Charge is 1% for every £200 over £60,000', () => {
  const half = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 70000 }, childBenefit: 2251.2 });
  assert.equal(half.data.highIncomeChildBenefitCharge, 1125);
  const full = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 90000 }, childBenefit: 2000 });
  assert.equal(full.data.highIncomeChildBenefitCharge, 2000);
  assert.equal(gbSelfAssessment({ taxYear: '2026-27', income: { employment: 59000 }, childBenefit: 2000 }).data.highIncomeChildBenefitCharge, 0);
});

test('savings use the starting rate and personal savings allowance, dividends the allowance and the 2026-27 rates', () => {
  const low = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 14000, savingsInterest: 3000 } });
  assert.equal(low.data.incomeTaxBands.filter((row) => row.income === 'savings').every((row) => row.tax === 0), true);
  assert.equal(low.data.incomeTax, 286);
  const higher = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 60000, savingsInterest: 1500, dividends: 3000 } });
  const savings = higher.data.incomeTaxBands.filter((row) => row.income === 'savings');
  assert.deepEqual(savings.map((row) => [row.band, row.amount, row.tax]), [['personal-savings-allowance', 500, 0], ['higher', 1000, 400]]);
  const dividends = higher.data.incomeTaxBands.filter((row) => row.income === 'dividends');
  assert.deepEqual(dividends.map((row) => [row.band, row.ratePercent, row.tax]), [['dividend-allowance', 0, 0], ['higher', 35.75, 893.75]]);
  const old = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 60000, dividends: 3000 } });
  assert.equal(old.data.incomeTaxBands.find((row) => row.income === 'dividends' && row.band === 'higher').ratePercent, 33.75);
  const top = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 200000, savingsInterest: 1000 } });
  assert.equal(top.data.incomeTaxBands.some((row) => row.band === 'personal-savings-allowance'), false);
});

test('student loans repay 9% over the lowest plan threshold plus 6% postgraduate, and Plan 5 starts in 2026-27', () => {
  const both = gbSelfAssessment({ taxYear: '2026-27', income: { selfEmployment: { turnover: 40000 } }, studentLoans: ['plan2', 'postgraduate'] });
  assert.deepEqual(both.data.studentLoan.rows.map((row) => [row.plan, row.due]), [['plan2', 955], ['postgraduate', 1140]]);
  const p5old = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 40000 }, studentLoans: ['plan5'] });
  assert.equal(p5old.data.studentLoan.due, 0);
  assert.match(p5old.data.notes.join(' '), /No repayments are due on plan5/);
  const p5 = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 40000 }, studentLoans: ['plan5'], studentLoanDeducted: 1000 });
  assert.equal(p5.data.studentLoan.due, 350);
  const unearned = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 30000, savingsInterest: 1500 }, studentLoans: ['plan1'] });
  assert.equal(unearned.data.studentLoan.income, 30000);
  assert.equal(gbSelfAssessment({ taxYear: '2026-27', studentLoans: ['plan9'] }).error, 'UNKNOWN_STUDENT_LOAN_PLAN');
});

test('capital gains use the annual exempt amount, then the unused basic band at 18% and 24% above, and BADR first', () => {
  const basic = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 30000 }, gains: { other: 20000 } });
  const left = 37700 - (30000 - 12570);
  assert.deepEqual(basic.data.capitalGains.rows.map((row) => [row.amount, row.ratePercent]), [[17000, 18]]);
  assert.ok(left > 17000);
  const split = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 45000 }, gains: { residential: 10000 } });
  assert.deepEqual(split.data.capitalGains.rows.map((row) => [row.amount, row.ratePercent]), [[5270, 18], [1730, 24]]);
  const badr = gbSelfAssessment({ taxYear: '2025-26', income: { employment: 20000 }, gains: { businessAssetDisposal: 50000, losses: 5000 } });
  assert.deepEqual(badr.data.capitalGains.rows.map((row) => [row.gain, row.amount, row.ratePercent]), [['business-asset-disposal', 42000, 14]]);
  assert.equal(gbSelfAssessment({ taxYear: '2026-27', income: { employment: 20000 }, gains: { businessAssetDisposal: 10000 } }).data.capitalGains.rows[0].ratePercent, 18);
  const losses = gbSelfAssessment({ taxYear: '2026-27', gains: { other: 2000, losses: 5000 } });
  assert.equal(losses.data.capitalGains.tax, 0);
  assert.equal(losses.data.capitalGains.lossesCarriedForward, 3000);
});

test('allowances, reliefs and the edges of the computation', () => {
  assert.deepEqual(tradingProfit({ turnover: 900, useTradingAllowance: true }).profitPence, 0);
  assert.equal(tradingProfit({ turnover: 5000, expenses: 200, useTradingAllowance: true }).profitPence, 400000);
  assert.equal(tradingProfit({ turnover: 5000, expenses: 8000 }).lossPence, 300000);
  const loss = gbSelfAssessment({ taxYear: '2026-27', income: { selfEmployment: { turnover: 5000, expenses: 8000 }, employment: 20000 } });
  assert.equal(loss.data.income.selfEmploymentLoss, 3000);
  assert.match(loss.data.notes.join(' '), /carried forward/);
  const landlord = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 30000, property: { income: 12000, expenses: 2000, financeCosts: 4000 } } });
  assert.equal(landlord.data.reductions[0].amount, 800);
  const married = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 25000 }, marriageAllowance: 'receive' });
  assert.equal(married.data.reductions[0].amount, 252);
  const notBasic = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 60000 }, marriageAllowance: 'receive' });
  assert.equal(notBasic.data.reductions.length, 0);
  const pensioner = gbSelfAssessment({ taxYear: '2026-27', income: { selfEmployment: { turnover: 30000 } }, overStatePensionAge: true });
  assert.equal(pensioner.data.class4.total, 0);
  const voluntary = gbSelfAssessment({ taxYear: '2026-27', income: { selfEmployment: { turnover: 5000 } }, class2Voluntary: true });
  assert.equal(voluntary.data.class2Voluntary, 189.8);
  const refund = gbSelfAssessment({ taxYear: '2026-27', income: { employment: 20000 }, taxPaid: { paye: 2000 } });
  assert.equal(refund.data.refundDue, true);
  assert.equal(refund.data.balancingPayment, -514);
  const nothing = gbSelfAssessment({ taxYear: '2026-27' });
  assert.equal(nothing.data.totalLiability, 0);
  assert.equal(gbSelfAssessment({ taxYear: '2026', income: {} }).error, 'BAD_TAX_YEAR');
  assert.equal(gbSelfAssessment({ taxYear: '2026-27', residence: 'mars' }).error, 'BAD_RESIDENCE');
  assert.equal(gbSelfAssessment({ taxYear: '2024-25' }).error, 'RULES_MISSING_FOR_YEAR');
  assert.equal(gbSelfAssessment({ taxYear: '2027-28' }).error, 'RULES_MISSING_FOR_YEAR');
  assert.equal(gbSelfAssessment({ taxYear: '2026-27', income: { employment: -5000, dividends: 'abc' } }).data.totalLiability, 0);
  assert.equal(nothing.data.unreviewed, true);
});

test('a standard VAT return fills the nine boxes and is due one month and seven days after the period', () => {
  const out = buildVatReturn({ periodKey: '26a1', from: '2026-04-01', to: '2026-06-30', sales: [{ net: 10000 }, { net: 1000, rate: 'reduced' }, { net: 500, rate: 'zero' }], purchases: [{ net: 2000 }, { net: 300, vat: 60 }, { net: 100, blocked: true }] });
  assert.equal(out.ok, true);
  assert.deepEqual(out.data.boxes, { 1: 2050, 2: 0, 3: 2050, 4: 460, 5: 1590, 6: 11500, 7: 2400, 8: 0, 9: 0 });
  assert.equal(out.data.body.periodKey, '26A1');
  assert.equal(out.data.dueBy, '2026-08-07');
  assert.equal(out.data.direction, 'pay');
  assert.equal(out.data.ready, true);
  assert.match(out.data.notes[0], /blocked/);
  assert.equal(monthEndPlus('2026-03-31', 1, 7), '2026-05-07');
  assert.equal(monthEndPlus('2026-12-31', 1, 7), '2027-02-07');
});

test('a VAT repayment return keeps box 5 positive and breaking a box rule is reported', () => {
  const out = buildVatReturn({ periodKey: '26A2', to: '2026-09-30', sales: [{ net: 1000 }], purchases: [{ net: 5000 }] });
  assert.equal(out.data.boxes[5], 800);
  assert.equal(out.data.direction, 'refund');
  const problems = vatReturnProblems({ ...out.data.body, totalVatDue: 999, netVatDue: -1, totalValueSalesExVAT: 1.5, periodKey: 'x', finalised: false });
  assert.deepEqual(problems.map((problem) => problem.field).sort(), ['finalised', 'netVatDue', 'netVatDue', 'periodKey', 'totalValueSalesExVAT', 'totalVatDue'].sort());
  assert.equal(buildVatReturn({ periodKey: '26A2', sales: [{ net: 10, rate: 'luxury' }] }).error, 'BAD_VAT_RATE');
  assert.equal(buildVatReturn({ periodKey: '', sales: [] }).data.ready, false);
  assert.equal(buildVatReturn({ periodKey: '26A2', scheme: 'cash-basis' }).error, 'BAD_VAT_SCHEME');
});

test('the flat rate scheme charges a percentage of gross turnover, 16.5% for a limited cost trader', () => {
  const normal = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, sales: [{ net: 10000 }], purchases: [{ net: 1000, relevantGoods: true }, { net: 2000, capitalAsset: true }] });
  assert.equal(normal.data.boxes[6], 12000);
  assert.equal(normal.data.boxes[1], 1740);
  assert.equal(normal.data.boxes[4], 400);
  assert.equal(normal.data.flatRate.limitedCostTrader, false);
  const limited = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, sales: [{ net: 10000 }], purchases: [{ net: 100, relevantGoods: true }] });
  assert.equal(limited.data.flatRate.limitedCostTrader, true);
  assert.equal(limited.data.boxes[1], 1980);
  const first = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, firstYearOfRegistration: true, sales: [{ net: 10000 }], purchases: [{ net: 1000, relevantGoods: true }] });
  assert.equal(first.data.flatRate.ratePercent, 13.5);
  assert.equal(buildVatReturn({ periodKey: '26A3', scheme: 'flat-rate', sales: [{ net: 10000 }], purchases: [{ net: 5000, relevantGoods: true }] }).error, 'FLAT_RATE_NEEDED');
});

test('VAT registration uses the rolling 12 months and the next 30 days', () => {
  assert.equal(vatRegistrationCheck({ last12Months: 89000, date: '2026-11-01' }).data.mustRegister, false);
  assert.equal(vatRegistrationCheck({ last12Months: 90001, date: '2026-11-01' }).data.test, 'rolling-12-months');
  assert.equal(vatRegistrationCheck({ last12Months: 10000, next30Days: 95000, date: '2026-11-01' }).data.test, 'forward-30-days');
  assert.equal(vatRegistrationCheck({ registered: true, last12Months: 80000, date: '2026-11-01' }).data.mayDeregister, true);
  assert.equal(vatRegistrationCheck({ registered: true, last12Months: 89000, date: '2026-11-01' }).data.mayDeregister, false);
});

test('MTD Income Tax: who must join, the four cumulative quarters and the final declaration', () => {
  assert.equal(mtdItMandate({ selfEmploymentTurnover: 45000, propertyIncome: 10000, returnYear: '2024-25' }).data.mustJoinFrom, '2026-04-06');
  assert.equal(mtdItMandate({ selfEmploymentTurnover: 25000, propertyIncome: 10000, returnYear: '2025-26' }).data.mustJoinFrom, '2027-04-06');
  assert.equal(mtdItMandate({ selfEmploymentTurnover: 15000, returnYear: '2026-27' }).data.mustJoinFrom, null);
  assert.equal(mtdItMandate({ selfEmploymentTurnover: 50000, returnYear: '2024-25' }).data.mustJoinFrom, null, 'the threshold is more than £50,000');
  const periods = quarterlyPeriods('2026-27').data;
  assert.deepEqual(periods.periods.map((period) => [period.from, period.to, period.dueBy]), [['2026-04-06', '2026-07-05', '2026-08-07'], ['2026-07-06', '2026-10-05', '2026-11-07'], ['2026-10-06', '2027-01-05', '2027-02-07'], ['2027-01-06', '2027-04-05', '2027-05-07']]);
  assert.equal(periods.finalDeclarationBy, '2028-01-31');
  const calendar = quarterlyPeriods('2026-27', { calendar: true }).data.periods;
  assert.deepEqual(calendar.map((period) => period.to), ['2026-06-30', '2026-09-30', '2026-12-31', '2027-03-31']);
  assert.equal(calendar[3].cumulativeFrom, '2026-04-01');
  assert.equal(quarterlyPeriods('26-27').error, 'BAD_TAX_YEAR');
});

test('a self-employment quarterly update maps transactions to HMRC boxes and consolidates expenses under the VAT threshold', () => {
  const transactions = [{ category: 'sales', amount: 12000 }, { category: 'fuel', amount: 300 }, { category: 'software', amount: 100 }, { category: 'entertainment', amount: 50, disallowable: true }, { category: 'mystery', amount: 5 }];
  const small = selfEmploymentCumulative({ taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2026-07-05', transactions });
  assert.deepEqual(small.data.body.periodExpenses, { consolidatedExpenses: 400 });
  assert.equal(small.data.consolidated, true);
  assert.equal(small.data.totals.profit, 11600);
  assert.equal(small.data.ready, false);
  assert.equal(small.data.problems[0].unmapped[0].category, 'mystery');
  const big = selfEmploymentCumulative({ taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2026-07-05', transactions: [{ category: 'sales', amount: 30000 }, { field: 'adminCosts', amount: 200 }, { category: 'entertainment', amount: 50, disallowable: true }] });
  assert.equal(big.data.consolidated, false);
  assert.deepEqual(big.data.body.periodExpenses, { adminCosts: 200, businessEntertainmentCosts: 50 });
  assert.deepEqual(big.data.body.periodDisallowableExpenses, { businessEntertainmentCostsDisallowable: 50 });
  assert.equal(selfEmploymentCumulative({ taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2027-07-05' }).error, 'PERIOD_OUTSIDE_TAX_YEAR');
  assert.equal(selfEmploymentCumulative({ taxYear: '2026-27', periodStartDate: '2026-07-05', periodEndDate: '2026-04-06' }).error, 'BAD_PERIOD');
});

test('a UK property update takes itemised or consolidated expenses, never both', () => {
  const ok = ukPropertyCumulative({ taxYear: '2026-27', fromDate: '2026-04-06', toDate: '2026-07-05', income: { periodAmount: 3000 }, expenses: { consolidatedExpenses: 400, residentialFinancialCost: 900 } });
  assert.deepEqual(ok.data.body.ukProperty, { income: { periodAmount: 3000 }, expenses: { consolidatedExpenses: 400, residentialFinancialCost: 900 } });
  assert.equal(ukPropertyCumulative({ taxYear: '2026-27', fromDate: '2026-04-06', toDate: '2026-07-05', expenses: { consolidatedExpenses: 400, repairsAndMaintenance: 10 } }).error, 'CONSOLIDATED_AND_ITEMISED');
  assert.equal(ukPropertyCumulative({ taxYear: '2026-27', fromDate: '2026-04-06', toDate: '2026-07-05', income: { rent: 1 } }).error, 'UNKNOWN_PROPERTY_FIELDS');
});

test('late submission points reach the threshold before a £200 penalty, and MTD Income Tax quarters have a first-year easement', () => {
  const late = (dueBy, submittedOn) => ({ dueBy, submittedOn });
  const four = penaltyPoints({ frequency: 'quarterly', today: '2027-12-01', submissions: [late('2026-08-07', '2026-08-20'), late('2026-11-07', '2026-11-20'), late('2027-02-07', '2027-02-20'), late('2027-05-07', '2027-05-20'), late('2027-08-07', '2027-08-08')] });
  assert.equal(four.data.points, 4);
  assert.equal(four.data.penalties.length, 2);
  assert.equal(four.data.totalPenalties, 400);
  const easement = penaltyPoints({ frequency: 'quarterly', regime: 'itsa', today: '2027-12-01', submissions: [late('2026-08-07', '2026-08-20'), late('2027-08-07', '2027-08-20')] });
  assert.equal(easement.data.points, 1);
  assert.equal(penaltyPoints({ frequency: 'monthly', submissions: [] }).data.threshold, 5);
  assert.equal(penaltyPoints({ frequency: 'weekly', submissions: [] }).error, 'BAD_FREQUENCY');
  const unsent = penaltyPoints({ frequency: 'annual', today: '2027-01-01', submissions: [{ dueBy: '2026-12-01' }] });
  assert.equal(unsent.data.points, 1);
});

test('late payment penalties start after day 15 and day 30, then run daily', () => {
  assert.equal(latePayment({ amount: 10000, dueBy: '2026-08-07', paidOn: '2026-08-22' }).data.totalPenalty, 0);
  assert.equal(latePayment({ amount: 10000, dueBy: '2026-08-07', paidOn: '2026-08-23' }).data.totalPenalty, 300);
  const long = latePayment({ amount: 10000, dueBy: '2026-08-07', paidOn: '2026-10-06', bankRateBasisPoints: 375 });
  assert.equal(long.data.daysLate, 60);
  assert.equal(long.data.penalties.length, 2);
  assert.equal(long.data.dailyPenalty, 82.19);
  assert.equal(long.data.interestRatePercent, 7.75);
  assert.equal(latePayment({ amount: 1, dueBy: 'soon' }).error, 'BAD_DUE_DATE');
  assert.equal(latePayment({ amount: 1, dueBy: '2027-05-07' }).error, 'RULES_MISSING');
});

test('fraud prevention headers are complete for a real phone and never send placeholders or private addresses as public', () => {
  const built = buildFraudHeaders({ device: FULL_DEVICE, user: { id: 'user-1', multiFactor: FULL_DEVICE.multiFactor }, vendor: { publicIp: '198.51.100.7', serverVersion: '2026.11', licenceId: 'abc' }, now: '2026-11-14T10:00:00.000Z' });
  assert.deepEqual(built.missing, []);
  assert.equal(built.headers['Gov-Client-Connection-Method'], 'MOBILE_APP_VIA_SERVER');
  assert.equal(built.headers['Gov-Client-Local-IPs'], '10.0.0.12,fe80%3A%3A1');
  assert.equal(built.headers['Gov-Client-Screens'], 'width=1080&height=2400&scaling-factor=2.75&colour-depth=24');
  assert.equal(built.headers['Gov-Client-User-Agent'], 'os-family=Android&os-version=15&device-manufacturer=Google&device-model=Pixel%208');
  assert.equal(built.headers['Gov-Vendor-Forwarded'], 'by=198.51.100.7&for=203.0.113.6');
  assert.equal(built.headers['Gov-Vendor-Version'], 'myca-android=1.0.0&myca-server=2026.11');
  const empty = buildFraudHeaders({ device: { deviceId: 'null', ipAddress: '192.168.1.4', timezone: 'GMT' }, user: {}, vendor: {} });
  assert.ok(empty.missing.includes('Gov-Client-Device-ID'));
  assert.ok(empty.missing.includes('Gov-Client-Public-IP'));
  assert.ok(empty.missing.includes('Gov-Client-Timezone'));
  assert.equal(Object.values(empty.headers).some((value) => /null|undefined/.test(value)), false);
  assert.equal(timezoneOffset(60), 'UTC+01:00');
  assert.equal(timezoneOffset(-330), 'UTC-05:30');
  assert.equal(timezoneOffset('x'), '');
});

test('HMRC tokens are sealed with the server key, bound to their scope, or kept in the vault', async () => {
  await withEnv({ MYCA_HMRC_TOKEN_KEY: 'k'.repeat(48), MYCA_PII_KEY: undefined }, () => {
    const sealed = sealToken('secret-access', 'access');
    assert.match(sealed, /^hmrc1\./);
    assert.equal(sealed.includes('secret-access'), false);
    assert.equal(openToken(sealed, 'access'), 'secret-access');
    assert.equal(openToken(sealed, 'refresh'), '');
  });
  await withEnv({ MYCA_HMRC_TOKEN_KEY: undefined, MYCA_PII_KEY: undefined }, () => {
    const sealed = sealToken('vaulted', 'access');
    assert.match(sealed, /^hmrcv\./);
    assert.equal(openToken(sealed, 'access'), 'vaulted');
  });
  assert.equal(openToken('nonsense'), '');
});

test('the HMRC sign-in link asks for VAT and Self Assessment scopes with the state', () => {
  const url = new URL(authorizeUrl({ environment: 'test', clientId: 'cid', redirectUri: 'https://example.org/cb' }, { state: 'xyz' }));
  assert.equal(url.host, 'test-api.service.hmrc.gov.uk');
  assert.equal(url.searchParams.get('scope'), 'read:vat write:vat read:self-assessment write:self-assessment');
  assert.equal(url.searchParams.get('state'), 'xyz');
  assert.equal(API_VERSIONS.calculations, '8.0');
});

test('the whole MTD journey runs in the simulator: connect, sync, VAT return, quarterly update, calculation and final declaration', async () => {
  await withEnv({ MYCA_MOCK_MODE: '1', MYCA_PROVIDER_ENV: 'test' }, async () => {
    const state = gbState();
    assert.equal(runEngineTool('set_gb_taxpayer', state, { nino: 'QQ123456C' }).error, 'GB_TAXPAYER_INVALID');
    assert.equal(runEngineTool('set_gb_taxpayer', state, { name: 'Test Trader', nino: 'AA123456C', vrn: 'GB999999973', utr: '2234567890', residence: 'england', vatStagger: '1' }).ok, true);
    assert.equal(state.countryData.gbTaxpayer.vrn, '999999973');
    assert.equal((await runEngineTool('submit_gb_vat_return', state, { body: {}, declaration: true })).error, 'VAT_RETURN_NOT_READY');
    const notConnected = await runEngineTool('sync_gb_hmrc', state, { taxYear: '2026-27' });
    assert.equal(notConnected.ok, true, 'the simulator answers without a connection');
    const link = runEngineTool('connect_gb_hmrc', state, {});
    assert.equal(link.ok, true);
    assert.equal((await runEngineTool('finish_gb_hmrc_connection', state, { code: 'abcdefgh123', state: 'wrong' })).error, 'HMRC_STATE_MISMATCH');
    const done = await runEngineTool('finish_gb_hmrc_connection', state, { code: 'abcdefgh123', state: link.data.state });
    assert.equal(done.ok, true);
    assert.equal(done.data.environment, 'mock');
    assert.equal(JSON.stringify(state.countryData.gbHmrc).includes('mock-access'), false, 'tokens are never kept in the clear');
    const sync = await runEngineTool('sync_gb_hmrc', state, { taxYear: '2026-27', device: FULL_DEVICE, checkFraudHeaders: true });
    assert.deepEqual(sync.data.pulled, ['vat-obligations', 'itsa-businesses', 'itsa-obligations', 'fraud-header-check']);
    const status = runEngineTool('gb_hmrc_status', state, {});
    assert.equal(status.data.status, 'connected');
    assert.equal(status.data.vatObligations[0].periodKey, '18A1');
    const prepared = runEngineTool('gb_vat_return_check', state, { periodKey: '18A1', to: '2026-07-05', sales: [{ net: 1000 }], purchases: [{ net: 100 }] });
    const preview = enginePreview('submit_gb_vat_return')(state, { body: prepared.data.body, declaration: false });
    assert.match(preview.blockers.join(' '), /declare/);
    const sent = await runEngineTool('submit_gb_vat_return', state, { body: prepared.data.body, declaration: true, device: FULL_DEVICE });
    assert.equal(sent.ok, true);
    assert.equal(sent.mock, true);
    assert.match(engineWords('submit_gb_vat_return')(sent), /simulator/);
    assert.equal((await runEngineTool('submit_gb_vat_return', state, { body: prepared.data.body, declaration: true })).error, 'VAT_RETURN_ALREADY_SENT');
    assert.equal(runEngineTool('gb_hmrc_status', state, {}).data.vatObligations[0].status, 'fulfilled');
    const quarter = runEngineTool('gb_itsa_quarter_check', state, { kind: 'self-employment', taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2026-07-05', transactions: [{ category: 'sales', amount: 9000 }, { category: 'rent', amount: 600 }] });
    assert.equal(quarter.data.ready, true);
    assert.equal((await runEngineTool('submit_gb_itsa_update', state, { kind: 'uk-property', businessId: 'XAIS12345678901', taxYear: '2026-27', body: quarter.data.body })).error, 'BUSINESS_KIND_MISMATCH');
    assert.equal((await runEngineTool('submit_gb_itsa_update', state, { kind: 'self-employment', businessId: 'nope', taxYear: '2026-27', body: quarter.data.body })).error, 'BAD_BUSINESS_ID');
    const update = await runEngineTool('submit_gb_itsa_update', state, { kind: 'self-employment', businessId: 'XAIS12345678901', taxYear: '2026-27', body: quarter.data.body, device: FULL_DEVICE });
    assert.equal(update.ok, true);
    assert.equal(runEngineTool('gb_hmrc_status', state, {}).data.itsaObligations.length, 1);
    const inYear = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2026-27', calculationType: 'in-year', device: FULL_DEVICE });
    assert.equal(inYear.ok, true);
    assert.equal((await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2026-27', calculationId: inYear.data.calculationId, declaration: true })).error, 'WRONG_CALCULATION_TYPE');
    const final = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2026-27', calculationType: 'intent-to-finalise' });
    assert.equal(final.data.totalIncomeTaxAndNicsDue, 9731.8);
    assert.equal((await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2026-27', calculationId: final.data.calculationId, declaration: false })).error, 'DECLARATION_REQUIRED');
    const declared = await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2026-27', calculationId: final.data.calculationId, declaration: true });
    assert.equal(declared.ok, true);
    assert.equal((await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2026-27', calculationId: final.data.calculationId, declaration: true })).error, 'FINAL_DECLARATION_ALREADY_SENT');
    const actions = state.auditEvents.map((event) => event.action);
    for (const action of ['gb_taxpayer_set', 'gb_hmrc_connected', 'gb_vat_return_submitted', 'gb_itsa_update_submitted', 'gb_final_declaration_submitted']) assert.ok(actions.includes(action), action);
    assert.equal(runEngineTool('disconnect_gb_hmrc', state, {}).data.status, 'not-connected');
    assert.equal(state.countryData.gbHmrc.refreshToken, undefined);
  });
});

test('in the HMRC sandbox every call carries the version, the bearer token and the fraud headers, and reaches only the test host', async () => {
  const realClient = getChannelClient();
  const calls = [];
  const replies = {
    '/oauth/token': { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 14400, scope: 'read:vat write:vat' },
    '/organisations/vat/999999973/obligations': { obligations: [{ periodKey: '18A1', start: '2026-04-01', end: '2026-06-30', due: '2026-08-07', status: 'O' }] },
    '/organisations/vat/999999973/returns': { processingDate: '2026-11-14T10:00:00.000Z', formBundleNumber: '256660290587', paymentIndicator: 'BANK', chargeRefNumber: 'aCxFaNx0FZsCvyWF' },
  };
  setChannelClient(new ChannelClient({
    fetchFn: async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ url, path, init });
      const body = replies[path];
      return { ok: Boolean(body), status: body ? 200 : 404, headers: { get: () => 'corr-1' }, text: async () => JSON.stringify(body || { code: 'MATCHING_RESOURCE_NOT_FOUND', message: 'not found' }), json: async () => body };
    },
  }));
  try {
    await withEnv({ MYCA_MOCK_MODE: '0', MYCA_PROVIDER_ENV: 'test', MYCA_HMRC_CLIENT_ID: 'cid', MYCA_HMRC_CLIENT_SECRET: 'csecret', MYCA_HMRC_REDIRECT_URI: 'https://example.org/hmrc/callback', MYCA_HMRC_TOKEN_KEY: 'z'.repeat(48), MYCA_HMRC_VENDOR_PUBLIC_IP: '198.51.100.7' }, async () => {
      const state = gbState();
      runEngineTool('set_gb_taxpayer', state, { vrn: '999999973' });
      const link = runEngineTool('connect_gb_hmrc', state, {});
      assert.match(link.data.authorizeUrl, /^https:\/\/test-api\.service\.hmrc\.gov\.uk\/oauth\/authorize\?/);
      const done = await runEngineTool('finish_gb_hmrc_connection', state, { code: 'code-12345678', state: link.data.state });
      assert.equal(done.ok, true, JSON.stringify(done));
      assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'authorization_code');
      const sync = await runEngineTool('sync_gb_hmrc', state, { taxYear: '2026-27', device: FULL_DEVICE });
      assert.deepEqual(sync.data.pulled, ['vat-obligations']);
      const read = calls.find((call) => call.path.endsWith('/obligations'));
      assert.equal(read.init.headers.Accept, 'application/vnd.hmrc.1.0+json');
      assert.equal(read.init.headers.Authorization, 'Bearer acc-1');
      assert.equal(read.init.headers['Gov-Client-Connection-Method'], 'MOBILE_APP_VIA_SERVER');
      assert.equal(read.init.headers['Gov-Client-Public-IP'], '203.0.113.6');
      assert.equal(read.init.headers['Gov-Vendor-Public-IP'], '198.51.100.7');
      assert.ok(calls.every((call) => call.url.startsWith('https://test-api.service.hmrc.gov.uk/')));
      const body = buildVatReturn({ periodKey: '18A1', to: '2026-06-30', sales: [{ net: 100 }] }).data.body;
      const sent = await runEngineTool('submit_gb_vat_return', state, { body, declaration: true, device: FULL_DEVICE });
      assert.equal(sent.ok, true, JSON.stringify(sent));
      assert.equal(sent.data.formBundleNumber, '256660290587');
      assert.equal(sent.data.correlationId, 'corr-1');
      const posted = calls.find((call) => call.path.endsWith('/returns'));
      assert.equal(JSON.parse(posted.init.body).finalised, true);
      const missing = await runEngineTool('submit_gb_itsa_update', state, { kind: 'self-employment', businessId: 'XAIS12345678901', taxYear: '2026-27', body: {} });
      assert.equal(missing.error, 'GB_NINO_MISSING');
      state.countryData.gbHmrc.accessExpiresAt = new Date(Date.now() - 1000).toISOString();
      replies['/oauth/token'] = { access_token: 'acc-2', refresh_token: 'ref-2', expires_in: 14400 };
      await runEngineTool('sync_gb_hmrc', state, { taxYear: '2026-27', device: FULL_DEVICE });
      const refreshed = calls.filter((call) => call.path === '/oauth/token').at(-1);
      assert.equal(new URLSearchParams(refreshed.init.body).get('grant_type'), 'refresh_token');
      assert.equal(new URLSearchParams(refreshed.init.body).get('refresh_token'), 'ref-1');
      assert.equal(calls.filter((call) => call.path.endsWith('/obligations')).at(-1).init.headers.Authorization, 'Bearer acc-2');
      replies['/oauth/token'] = null;
      state.countryData.gbHmrc.accessExpiresAt = new Date(Date.now() - 1000).toISOString();
      const failed = await runEngineTool('sync_gb_hmrc', state, { taxYear: '2026-27' });
      assert.equal(failed.ok, false);
    });
  } finally {
    setChannelClient(realClient);
  }
});

test('without HMRC settings the connection says which ones are missing, and calls held while provider calls are off', async () => {
  await withEnv({ MYCA_MOCK_MODE: '0', MYCA_PROVIDER_ENV: 'off', MYCA_HMRC_CLIENT_ID: undefined, MYCA_HMRC_CLIENT_SECRET: undefined, MYCA_HMRC_REDIRECT_URI: undefined }, () => {
    const out = runEngineTool('connect_gb_hmrc', gbState(), {});
    assert.equal(out.error, 'HMRC_NOT_CONFIGURED');
    assert.deepEqual(out.settings, ['MYCA_HMRC_CLIENT_ID', 'MYCA_HMRC_CLIENT_SECRET', 'MYCA_HMRC_REDIRECT_URI']);
  });
});

test('the UK tax calendar lists Self Assessment, MTD and VAT stagger deadlines in date order', () => {
  const state = gbState();
  runEngineTool('set_gb_taxpayer', state, { vatStagger: '1' });
  const out = runEngineTool('gb_tax_calendar', state, { taxYear: '2026-27' });
  const dates = out.data.events.map((event) => event.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(dates.includes('2027-01-31'));
  assert.ok(dates.includes('2028-01-31'));
  assert.ok(out.data.events.some((event) => event.kind === 'vat' && event.date === '2026-08-07'));
  assert.equal(out.data.events.filter((event) => event.kind === 'vat').length, 4);
  assert.equal(out.data.events.filter((event) => event.kind === 'mtd-update').length, 4);
  assert.equal(runEngineTool('gb_tax_calendar', state, { taxYear: 'x' }).error, 'BAD_TAX_YEAR');
});

test('the estimate uses the saved residence and plans, and its words say what to pay and when', () => {
  const state = gbState();
  runEngineTool('set_gb_taxpayer', state, { residence: 'scotland', studentLoans: ['plan4'] });
  const out = runEngineTool('gb_tax_estimate', state, { taxYear: '2025-26', income: { employment: 50000 } });
  assert.equal(out.data.residence, 'scotland');
  assert.equal(out.data.studentLoan.rows[0].plan, 'plan4');
  const words = engineWords('gb_tax_estimate')(out);
  assert.match(words, /2025-26/);
  assert.match(words, /not yet reviewed/);
});
