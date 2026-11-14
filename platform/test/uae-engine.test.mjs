import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/uae/engine.mjs';
import { MANIFEST } from '../src/countries/uae/manifest.mjs';
import { vatReturn, parseVatPeriod, vatRegistrationCheck } from '../src/countries/uae/vat.mjs';
import { corporateTaxEstimate, ctDueDate } from '../src/countries/uae/corporate-tax.mjs';
import { penaltyEstimate } from '../src/countries/uae/penalties.mjs';
import { uaeDeadlines } from '../src/countries/uae/deadlines.mjs';
import { buildPintAe, transactionCode } from '../src/countries/uae/einvoice.mjs';
import { checkTrn } from '../src/countries/uae/trn.mjs';
import { toFils, percentOf, addMonthsClamped } from '../src/countries/uae/common.mjs';
import { countryPack } from '../src/countries/index.mjs';
import { runTool } from '../src/tools.mjs';
import { createState } from '../src/store.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const SANDBOX = { MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' };
const LIVE = { MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' };

const seller = { name: 'Falcon Trading LLC', trn: '100123456700003', legalId: 'CN-1234567', legalIdType: 'TL', addressLine: 'Office 1201, Bay Square', city: 'Dubai', emirate: 'DXB', country: 'AE' };
const buyer = { name: 'Oasis Contracting LLC', trn: '100987654300003', addressLine: 'Plot 7, Mussafah', city: 'Abu Dhabi', emirate: 'AUH', country: 'AE', vatRegistered: true };
const invoice = { number: 'INV-2027-001', issueDate: '2027-07-05', dueDate: '2027-08-04', seller, buyer, lines: [{ name: 'Consulting', quantity: 10, unitPrice: 1500, taxCategory: 'S', itemType: 'S' }] };

test('the UAE pack: business and accountant segments, Arabic, Play billing for software, beta in Google Cloud Doha until a UAE host', () => {
  const pack = countryPack('AE');
  assert.equal(pack.status, 'beta');
  assert.deepEqual(pack.languages, ['en', 'ar']);
  assert.equal(pack.app.androidId, 'com.mldynamic.myca.uae');
  assert.deepEqual(pack.billing.plans.map((plan) => [plan.id, plan.price, plan.provider]), [['starter', 299, 'play'], ['business', 799, 'play'], ['firm', 2499, 'play']]);
  assert.deepEqual(pack.residency.regionPrefixes, ['me-central1']);
  assert.ok(pack.licences.some((licence) => licence.id === 'in-country-host'));
  assert.ok(pack.licences.some((licence) => licence.id === 'asp'));
});

test('every manifest tool has a run, every write tool a preview', () => {
  for (const tool of MANIFEST.tools) {
    assert.equal(typeof ENGINE.run[tool.name], 'function', tool.name);
    if (tool.access === 'write') assert.equal(typeof ENGINE.preview[tool.name], 'function', tool.name);
  }
});

test('money is converted to fils without floating point drift, and 5% rounds half up', () => {
  assert.equal(toFils(0.1 + 0.2), 30);
  assert.equal(toFils(1.005), 101);
  assert.equal(toFils(-1.005), -101);
  assert.equal(percentOf(10, 500), 1);
  assert.equal(percentOf(9, 500), 0);
  assert.equal(percentOf(-10, 500), -1);
  assert.equal(percentOf(900000000000000, 900), 81000000000000);
});

test('VAT periods: quarters, months, ranges, and the 28-day due date across a year end', () => {
  assert.equal(parseVatPeriod('2026-Q4').due, '2027-01-28');
  assert.equal(parseVatPeriod('2026-02').due, '2026-03-28');
  const range = parseVatPeriod('2026-12/2027-02');
  assert.equal(range.start, '2026-12-01');
  assert.equal(range.end, '2027-02-28');
  assert.equal(range.due, '2027-03-28');
  assert.equal(parseVatPeriod('2028-02').end, '2028-02-29');
  assert.equal(parseVatPeriod('2026-03/2026-01').error, 'BAD_PERIOD');
  assert.equal(parseVatPeriod('2026-01/2027-03').error, 'BAD_PERIOD');
  assert.equal(parseVatPeriod('Q1 2026').error, 'BAD_PERIOD');
  assert.equal(parseVatPeriod('2017-10/2017-12').error, 'RULE_NOT_IN_FORCE');
  assert.match(parseVatPeriod('2026-01/2026-02').warnings[0], /2-month period/);
});

test('VAT 201: sales by emirate, zero-rated, exempt, reverse charge, imports and recoverable input tax add up box by box', () => {
  const out = vatReturn({
    period: '2026-01/2026-03',
    lines: [
      { kind: 'supply', treatment: 'standard', emirate: 'DXB', net: 100000 },
      { kind: 'supply', treatment: 'standard', emirate: 'Abu Dhabi', net: 20000, vat: 1000 },
      { kind: 'supply', treatment: 'standard', emirate: 'SH', net: -5000 },
      { kind: 'supply', treatment: 'zero-rated', net: 40000 },
      { kind: 'supply', treatment: 'exempt', net: 12000 },
      { kind: 'supply', treatment: 'out-of-scope', net: 999 },
      { kind: 'expense', treatment: 'standard', net: 30000 },
      { kind: 'expense', treatment: 'standard', net: 2000, blocked: true },
      { kind: 'expense', treatment: 'standard', net: 10000, recoveryBasisPoints: 6000 },
      { kind: 'expense', treatment: 'reverse-charge', net: 8000 },
      { kind: 'expense', treatment: 'import', net: 50000 },
    ],
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  const b = out.data.boxes;
  assert.deepEqual(b['1b'], { net: 100000, vat: 5000, adjustment: 0 });
  assert.deepEqual(b['1a'], { net: 20000, vat: 1000, adjustment: 0 });
  assert.deepEqual(b['1c'], { net: -5000, vat: -250, adjustment: 0 });
  assert.deepEqual(b['1g'], { net: 0, vat: 0, adjustment: 0 });
  assert.equal(b['3'].vat, 400);
  assert.equal(b['4'].net, 40000);
  assert.equal(b['5'].net, 12000);
  assert.deepEqual(b['6'], { net: 50000, vat: 2500, adjustment: 0 });
  assert.equal(b['8'].net, 100000 + 20000 - 5000 + 8000 + 40000 + 12000 + 50000);
  assert.equal(b['8'].vat, 5000 + 1000 - 250 + 400 + 2500);
  assert.equal(b['9'].vat, 1500 + 0 + 300);
  assert.equal(b['9'].net, 42000);
  assert.equal(b['10'].vat, 400 + 2500);
  assert.equal(out.data.totalDue, 8650);
  assert.equal(out.data.totalRecoverable, 4700);
  assert.equal(out.data.payable, 3950);
  assert.equal(out.data.refund, false);
  assert.equal(out.data.due, '2026-04-28');
  assert.ok(out.data.warnings.some((w) => /blocked/.test(w)));
  assert.ok(out.data.warnings.some((w) => /out-of-scope/.test(w)));
  assert.ok(out.data.warnings.some((w) => /Box 6 is filled by EmaraTax/.test(w)));
});

test('VAT 201: a refund position, box 1 and 9 adjustments, tourist refunds and the customs import figure', () => {
  const out = vatReturn({
    period: '2026-Q2',
    lines: [
      { kind: 'supply', treatment: 'standard', emirate: 'RAK', net: 10000, adjustment: -200 },
      { kind: 'expense', treatment: 'standard', net: 80000, adjustment: 100 },
      { kind: 'expense', treatment: 'import', net: 20000 },
    ],
    touristRefunds: { net: 1000, vat: 50 },
    customsImports: { net: 21000, vat: 1050 },
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  const b = out.data.boxes;
  assert.deepEqual(b['1f'], { net: 10000, vat: 500, adjustment: -200 });
  assert.deepEqual(b['2'], { net: -1000, vat: -50, adjustment: 0 });
  assert.deepEqual(b['6'], { net: 21000, vat: 1050, adjustment: 0 });
  assert.equal(b['8'].vat, 500 - 200 - 50 + 1050);
  assert.equal(b['10'].vat, 1000);
  assert.equal(b['11'].vat, 4000 + 100 + 1000);
  assert.equal(out.data.payable, 1300 - 5100);
  assert.equal(out.data.refund, true);
  assert.ok(out.data.warnings.some((w) => /box 15/.test(w)));
  assert.ok(out.data.warnings.some((w) => /differs from the customs figure/.test(w)));
});

test('VAT 201 refuses bad lines and totals nothing: missing emirate, unknown treatment, adjustments on the wrong box, bad numbers', () => {
  const out = vatReturn({
    period: '2026-Q1',
    lines: [
      { kind: 'supply', treatment: 'standard', net: 100 },
      { kind: 'supply', treatment: 'reverse-charge', net: 100 },
      { kind: 'supply', treatment: 'zero-rated', net: 100, adjustment: 5 },
      { kind: 'expense', treatment: 'standard', net: 'abc' },
      { kind: 'expense', treatment: 'standard', net: 100, recoveryBasisPoints: 12000 },
      { kind: 'refund', net: 1 },
      null,
      { kind: 'supply', treatment: 'standard', emirate: 'DXB', net: 1, date: '2026-02-30' },
    ],
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'VAT_RETURN_LINES_INVALID');
  assert.deepEqual(out.problems.map((p) => [p.line, p.field]), [[0, 'emirate'], [1, 'treatment'], [2, 'adjustment'], [3, 'net'], [4, 'recoveryBasisPoints'], [5, 'kind'], [6, 'line'], [7, 'date']]);
  assert.equal(vatReturn({ period: '2026-Q1' }).error, 'BAD_LINES');
});

test('VAT 201: lines outside the period, a VAT figure that is not 5%, and a quarterly period for a monthly filer are flagged, not hidden', () => {
  const out = vatReturn({ period: '2026-Q1', annualTurnover: 200000000, lines: [{ kind: 'supply', treatment: 'standard', emirate: 'AJM', net: 1000, vat: 60, date: '2026-04-02' }] });
  assert.equal(out.ok, true);
  assert.equal(out.data.boxes['1d'].vat, 60);
  assert.ok(out.data.warnings.some((w) => /dated outside/.test(w)));
  assert.ok(out.data.warnings.some((w) => /not 5%/.test(w)));
  assert.ok(out.data.warnings.some((w) => /monthly/.test(w)));
  const empty = vatReturn({ period: '2026-Q1', lines: [] });
  assert.equal(empty.data.payable, 0);
  assert.equal(empty.data.refund, false);
});

test('VAT registration: mandatory above AED 375,000 (past 12 months or next 30 days), voluntary above AED 187,500', () => {
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: 375000, date: '2026-11-14' }).data.status, 'may-register');
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: 375000.01, date: '2026-11-14' }).data.status, 'must-register');
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: 1000, expectedNext30Days: 400000, date: '2026-11-14' }).data.status, 'must-register');
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: 187500, date: '2026-11-14' }).data.status, 'not-required');
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: 1000, taxableExpensesLast12Months: 200000, date: '2026-11-14' }).data.status, 'may-register');
  assert.equal(vatRegistrationCheck({ taxableSuppliesLast12Months: -1, date: '2026-11-14' }).error, 'BAD_AMOUNTS');
  assert.equal(vatRegistrationCheck({ date: '14/11/2026' }).error, 'BAD_DATE');
});

test('corporate tax: nothing on the first AED 375,000 and 9% above, due nine months after the year end', () => {
  const out = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 5000000, accountingProfit: 1000000 });
  assert.equal(out.ok, true);
  assert.equal(out.data.taxableIncome, 1000000);
  assert.equal(out.data.tax, 56250);
  assert.equal(out.data.due, '2026-09-30');
  assert.equal(corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 5000000, accountingProfit: 375000 }).data.tax, 0);
  assert.equal(corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 5000000, accountingProfit: 375001 }).data.tax, 0.09);
  assert.equal(ctDueDate('2025-06-30'), '2026-03-31');
  assert.equal(ctDueDate('2026-03-31'), '2026-12-31');
  assert.equal(ctDueDate('2024-05-31'), '2025-02-28');
});

test('corporate tax: exempt income comes off, non-deductible expenses go back on, and losses offset at most 75%', () => {
  const out = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 9000000, accountingProfit: 2000000, exemptIncome: 300000, nonDeductibleExpenses: 100000, lossesBroughtForward: 2500000 });
  assert.equal(out.data.adjustedProfit, 1800000);
  assert.equal(out.data.lossUsed, 1350000);
  assert.equal(out.data.lossCarriedForward, 1150000);
  assert.equal(out.data.taxableIncome, 450000);
  assert.equal(out.data.tax, 6750);
  const loss = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 9000000, accountingProfit: -400000, lossesBroughtForward: 100000 });
  assert.equal(loss.data.taxableIncome, 0);
  assert.equal(loss.data.tax, 0);
  assert.equal(loss.data.lossCarriedForward, 500000);
});

test('Small Business Relief: AED 0 when elected and open; refused with reasons when not', () => {
  const small = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 3000000, accountingProfit: 900000, electSmallBusinessRelief: true, lossesBroughtForward: 50000 });
  assert.equal(small.data.relief, 'small-business-relief');
  assert.equal(small.data.payable, 0);
  assert.equal(small.data.lossCarriedForward, 50000);
  const lossYear = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 100000, accountingProfit: -20000, electSmallBusinessRelief: true });
  assert.equal(lossYear.data.lossForfeited, 20000);
  assert.ok(lossYear.data.warnings.some((w) => /cannot be carried forward/.test(w)));
  const over = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 3000000.01, accountingProfit: 900000, electSmallBusinessRelief: true });
  assert.equal(over.data.relief, 'none');
  assert.equal(over.data.tax, 47250);
  assert.ok(over.data.warnings[0].includes('above the AED 3,000,000 cap'));
  const late = corporateTaxEstimate({ periodStart: '2030-01-01', periodEnd: '2030-12-31', revenue: 100000, accountingProfit: 500000, electSmallBusinessRelief: true });
  assert.ok(late.data.smallBusinessReliefReasons.some((r) => /2029-12-31/.test(r)));
  const earlier = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 100000, accountingProfit: 500000, electSmallBusinessRelief: true, revenueExceededInEarlierPeriod: true });
  assert.equal(earlier.data.relief, 'none');
  const group = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 100000, accountingProfit: 500000, electSmallBusinessRelief: true, mneGroupRevenue: 3150000000 });
  assert.equal(group.data.relief, 'none');
  const hint = corporateTaxEstimate({ periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 2000000, accountingProfit: 500000 });
  assert.ok(hint.data.warnings.some((w) => /qualifies for Small Business Relief/.test(w)));
});

test('Qualifying Free Zone Person: 0% on qualifying income, 9% on the rest with no nil band, and status lost past the de minimis', () => {
  const qfzp = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 20000000, accountingProfit: 4000000, qualifyingFreeZonePerson: true, qualifyingIncome: 3500000, nonQualifyingRevenue: 900000 });
  assert.equal(qfzp.data.relief, 'qualifying-free-zone-person');
  assert.equal(qfzp.data.tax, 45000);
  assert.equal(qfzp.data.nilBand, 0);
  const lost = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 20000000, accountingProfit: 4000000, qualifyingFreeZonePerson: true, qualifyingIncome: 3500000, nonQualifyingRevenue: 1000001 });
  assert.equal(lost.data.relief, 'none');
  assert.equal(lost.data.tax, 326250);
  assert.ok(lost.data.warnings.some((w) => /de minimis/.test(w)));
  const capped = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 200000000, accountingProfit: 1, qualifyingFreeZonePerson: true, nonQualifyingRevenue: 5000001 });
  assert.equal(capped.data.relief, 'none');
  assert.equal(corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 1000000, accountingProfit: 500000, qualifyingFreeZonePerson: true, electSmallBusinessRelief: true }).data.relief, 'qualifying-free-zone-person');
});

test('corporate tax refuses periods before 1 June 2023, over 18 months, backwards, or with bad numbers; caps foreign tax credit', () => {
  assert.equal(corporateTaxEstimate({ periodStart: '2023-01-01', periodEnd: '2023-12-31' }).error, 'NOT_IN_SCOPE');
  assert.equal(corporateTaxEstimate({ periodStart: '2024-01-01', periodEnd: '2025-12-31' }).error, 'BAD_PERIOD');
  assert.equal(corporateTaxEstimate({ periodStart: '2024-06-01', periodEnd: '2025-11-30' }).ok, true);
  assert.equal(corporateTaxEstimate({ periodStart: '2025-12-31', periodEnd: '2025-01-01' }).error, 'BAD_PERIOD');
  assert.equal(corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: -1 }).error, 'BAD_AMOUNTS');
  assert.equal(corporateTaxEstimate({ periodStart: '2025-01-01' }).error, 'BAD_PERIOD');
  const credit = corporateTaxEstimate({ periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 5000000, accountingProfit: 475000, foreignTaxCredit: 20000 });
  assert.equal(credit.data.tax, 9000);
  assert.equal(credit.data.foreignTaxCreditUsed, 9000);
  assert.equal(credit.data.payable, 0);
});

test('penalties from 14 April 2026: VAT AED 1,000 or 2,000, CT AED 500 a month then 1,000, late payment 14% a year by month', () => {
  assert.equal(penaltyEstimate({ kind: 'vat-late-return', dueDate: '2026-07-28', doneOn: '2026-07-28' }).data.penalty, 0);
  assert.equal(penaltyEstimate({ kind: 'vat-late-return', dueDate: '2026-07-28', doneOn: '2026-07-29' }).data.penalty, 1000);
  assert.equal(penaltyEstimate({ kind: 'vat-late-return', dueDate: '2026-07-28', doneOn: '2026-08-29', repeatWithin24Months: true }).data.penalty, 2000);
  assert.equal(penaltyEstimate({ kind: 'ct-late-return', dueDate: '2026-09-30', doneOn: '2026-10-01' }).data.penalty, 500);
  const long = penaltyEstimate({ kind: 'ct-late-return', dueDate: '2026-09-30', doneOn: '2027-12-15' });
  assert.equal(long.data.monthsLate, 15);
  assert.equal(long.data.penalty, 12 * 500 + 3 * 1000);
  assert.equal(penaltyEstimate({ kind: 'vat-late-payment', dueDate: '2026-07-28', doneOn: '2026-09-15', taxUnpaid: 12000 }).data.penalty, 280);
  assert.equal(penaltyEstimate({ kind: 'ct-late-payment', dueDate: '2026-09-30', doneOn: '2026-10-30', taxUnpaid: 100 }).data.penalty, 1.17);
  assert.equal(penaltyEstimate({ kind: 'vat-late-payment', dueDate: '2026-07-28', doneOn: '2026-09-15' }).error, 'BAD_AMOUNT');
  assert.equal(penaltyEstimate({ kind: 'vat-late-return', dueDate: '2026-01-28', doneOn: '2026-02-01' }).error, 'RULE_NOT_IN_FORCE');
  assert.equal(penaltyEstimate({ kind: 'speeding', dueDate: '2026-07-28' }).error, 'UNKNOWN_PENALTY');
});

test('deadlines: VAT and CT due dates and the e-invoicing wave by revenue', () => {
  const small = uaeDeadlines({ today: '2026-11-14', vatPeriodEnd: '2026-12-31', ctPeriodEnd: '2026-12-31', revenue: 4000000 });
  assert.deepEqual(small.data.items.map((i) => [i.id, i.date]), [['vat-return', '2027-01-28'], ['einvoice-asp', '2027-03-31'], ['einvoice-live', '2027-07-01'], ['ct-return', '2027-09-30']]);
  assert.equal(small.data.next.id, 'vat-return');
  const large = uaeDeadlines({ today: '2026-11-14', revenue: 50000000 });
  assert.deepEqual(large.data.items.map((i) => [i.id, i.date, i.overdue]), [['einvoice-asp', '2026-10-30', true], ['einvoice-live', '2027-01-01', false]]);
  assert.equal(uaeDeadlines({ today: '2026-11-14', government: true }).data.items[1].date, '2027-10-01');
  assert.equal(uaeDeadlines({ today: '2026-11-14', vatPeriodEnd: '31-12-2026' }).error, 'BAD_DATE');
  assert.equal(uaeDeadlines({ today: '2026-11-14' }).data.items.length, 0);
});

test('TRN: 15 digits, TIN is the first 10, endpoint 0235', () => {
  assert.deepEqual(checkTrn('100-1234-5670-0003'), { valid: true, trn: '100123456700003', tin: '1001234567', endpoint: '0235:1001234567', warnings: [] });
  assert.equal(checkTrn('12345').valid, false);
  assert.equal(checkTrn('10012345670000A').valid, false);
  assert.equal(checkTrn('000000000000000').valid, false);
  assert.equal(checkTrn('').valid, false);
  assert.equal(checkTrn('200123456700003').warnings.length, 1);
});

test('PINT AE: a standard invoice builds with totals, endpoints, the specification id and escaped XML', () => {
  const out = buildPintAe({ ...invoice, seller: { ...seller, name: 'Falcon & Sons <Trading>' } });
  assert.equal(out.ok, true, JSON.stringify(out.problems));
  assert.deepEqual(out.totals, { currency: 'AED', net: 15000, tax: 750, payable: 15750, taxAed: 750, payableAed: 15750 });
  assert.equal(out.document.sellerEndpoint, '0235:1001234567');
  assert.equal(out.document.buyerEndpoint, '0235:1009876543');
  assert.equal(out.document.typeCode, '380');
  assert.match(out.xml, /<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1<\/cbc:CustomizationID>/);
  assert.match(out.xml, /<cbc:ProfileExecutionID>00000000<\/cbc:ProfileExecutionID>/);
  assert.match(out.xml, /Falcon &amp; Sons &lt;Trading&gt;/);
  assert.match(out.xml, /<cbc:CountrySubentity>DU<\/cbc:CountrySubentity>/);
  assert.match(out.xml, /<cbc:PayableAmount currencyID="AED">15750.00<\/cbc:PayableAmount>/);
});

test('PINT AE: foreign currency needs a rate and shows AED, exports go to the no-Peppol endpoint, flags encode in order', () => {
  const usd = buildPintAe({ ...invoice, currency: 'USD', exchangeRate: 3.6725, buyer: { name: 'Acme Inc', country: 'US' }, lines: [{ name: 'Design', quantity: 1, unitPrice: 1000, taxCategory: 'Z', exemptionReason: 'Export of services' }], transaction: { exports: true } });
  assert.equal(usd.ok, true, JSON.stringify(usd.problems));
  assert.equal(usd.document.buyerEndpoint, '0235:9900000099');
  assert.equal(usd.document.transactionCode, '00000001');
  assert.equal(usd.totals.payableAed, 3672.5);
  assert.match(usd.xml, /<cbc:TaxCurrencyCode>AED<\/cbc:TaxCurrencyCode>/);
  assert.equal(buildPintAe({ ...invoice, currency: 'USD' }).problems[0].field, 'exchangeRate');
  assert.equal(transactionCode({ freeZone: true, continuousSupply: true }), '10000010');
  const domestic = buildPintAe({ ...invoice, buyer: { ...buyer, trn: undefined, vatRegistered: false } });
  assert.equal(domestic.document.buyerEndpoint, '0235:9900000098');
  assert.ok(domestic.warnings.some((w) => /not yet on the network/.test(w)));
  const deemed = buildPintAe({ ...invoice, buyer: { ...buyer, trn: undefined, vatRegistered: false }, transaction: { deemedSupply: true } });
  assert.equal(deemed.document.buyerEndpoint, '0235:9900000097');
});

test('PINT AE: refuses what an ASP would reject and keeps consumer sales out of scope', () => {
  const bad = buildPintAe({ number: '', issueDate: '2027-13-01', dueDate: '2027-01-01', type: 'proforma', seller: { name: 'X' }, buyer: { name: '', vatRegistered: true, emirate: 'Mars' }, lines: [{ name: '', quantity: 0, unitPrice: -1, taxCategory: 'Q', itemType: 'X' }, { name: 'Gold', quantity: 1, unitPrice: 10, taxCategory: 'AE' }, { name: 'Disc', quantity: 1, unitPrice: 10, discount: 20 }] });
  assert.equal(bad.error, 'EINVOICE_INVALID');
  const fields = bad.problems.map((p) => p.field);
  for (const field of ['type', 'number', 'issueDate', 'seller.trn', 'seller.legalId', 'seller.emirate', 'buyer.name', 'buyer.trn', 'buyer.emirate', 'lines[0].name', 'lines[0].quantity', 'lines[0].unitPrice', 'lines[0].taxCategory', 'lines[0].itemType', 'lines[1].exemptionReason', 'lines[2].discount']) assert.ok(fields.includes(field), field);
  assert.equal(buildPintAe({ ...invoice, buyer: { name: 'Walk-in', consumer: true } }).error, 'OUT_OF_SCOPE');
  assert.equal(buildPintAe({ ...invoice, dueDate: '2027-07-01' }).problems[0].field, 'dueDate');
  assert.equal(buildPintAe({ ...invoice, lines: [] }).problems[0].field, 'lines');
  assert.equal(buildPintAe({ ...invoice, type: 'credit-note' }).problems[0].field, 'original.number');
  const credit = buildPintAe({ ...invoice, type: 'credit-note', original: { number: 'INV-2027-001', issueDate: '2027-07-05' } });
  assert.equal(credit.document.typeCode, '381');
  assert.match(credit.xml, /^<\?xml[^>]+><CreditNote /);
  assert.match(credit.xml, /<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-2027-001/);
});

test('the business profile is checked, saved with an audit event, and becomes the seller on every e-invoice', async () => {
  const state = createState();
  const missing = ENGINE.run.set_ae_business_profile(state, { name: 'Falcon Trading LLC', emirate: 'Dubai', trn: '12', freeZone: true });
  assert.equal(missing.error, 'BUSINESS_PROFILE_INCOMPLETE');
  assert.deepEqual(missing.problems.map((p) => p.field), ['trn', 'freeZoneName']);
  assert.ok(ENGINE.preview.set_ae_business_profile(state, { name: 'X', emirate: 'XX' }).blockers.length);
  const mismatched = ENGINE.run.set_ae_business_profile(state, { name: 'X', emirate: 'DXB', trn: '100123456700003', tin: '1009999999' });
  assert.deepEqual(mismatched.problems.map((p) => p.field), ['tin']);
  const saved = ENGINE.run.set_ae_business_profile(state, { name: 'Falcon Trading LLC', nameAr: 'فالكون للتجارة ذ.م.م', emirate: 'Dubai', trn: '100 1234 5670 0003', legalId: 'CN-1234567', city: 'Dubai', addressLine: 'Bay Square', financialYearEnd: '12-31' });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.business.emirate, 'DXB');
  assert.equal(saved.data.business.trn, '100123456700003');
  assert.ok(state.auditEvents.some((event) => event.action === 'ae_business_profile_set'));
  const check = ENGINE.run.ae_einvoice_check(state, { number: 'INV-1', issueDate: '2027-07-05', buyer, lines: invoice.lines });
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  assert.equal(check.data.document.sellerEndpoint, '0235:1001234567');
});

test('issuing in sandbox records a UUID once, refuses a reused number with new content, and live waits for an ASP', async () => {
  const state = createState();
  await withEnv(SANDBOX, () => {
    const preview = ENGINE.preview.issue_ae_einvoice(state, invoice);
    assert.deepEqual(preview.blockers, []);
    assert.match(preview.summary, /^Record \(sandbox\) e-invoice INV-2027-001 for AED 15,750.00/);
    const first = ENGINE.run.issue_ae_einvoice(state, invoice);
    assert.equal(first.ok, true);
    assert.equal(first.sandbox, true);
    assert.match(first.data.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    const again = ENGINE.run.issue_ae_einvoice(state, invoice);
    assert.equal(again.duplicate, true);
    assert.equal(again.data.uuid, first.data.uuid);
    const clash = ENGINE.run.issue_ae_einvoice(state, { ...invoice, lines: [{ name: 'Other', quantity: 1, unitPrice: 1 }] });
    assert.equal(clash.error, 'EINVOICE_NUMBER_USED');
    const listed = ENGINE.run.ae_einvoice_list(state);
    assert.equal(listed.data.einvoices.length, 1);
    assert.equal(listed.data.mode, 'sandbox');
    assert.equal(state.auditEvents.filter((event) => event.action === 'ae_einvoice_issued').length, 1);
    assert.ok(ENGINE.preview.issue_ae_einvoice(state, { ...invoice, number: '' }).blockers.length);
  });
  await withEnv(LIVE, () => {
    assert.equal(ENGINE.run.issue_ae_einvoice(createState(), invoice).error, 'ASP_NOT_CONTRACTED');
    assert.ok(ENGINE.preview.issue_ae_einvoice(createState(), invoice).blockers[0].includes('No Accredited Service Provider'));
  });
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '1' }, () => {
    assert.equal(ENGINE.run.issue_ae_einvoice(createState(), invoice).sandbox, true);
  });
});

test('the words read like a person and the tools run through the central tool runner', async () => {
  const vat = ENGINE.run.ae_vat_return(createState(), { period: '2026-Q1', lines: [{ kind: 'supply', treatment: 'standard', emirate: 'DXB', net: 1000 }] });
  assert.equal(ENGINE.words.ae_vat_return(vat), 'VAT 201 for 2026-01/2026-03: output tax AED 50.00, recoverable AED 0.00, AED 50.00 to pay by 2026-04-28 on EmaraTax.');
  const ct = ENGINE.run.ae_ct_estimate(createState(), { periodStart: '2026-01-01', periodEnd: '2026-12-31', revenue: 2000000, accountingProfit: 400000, electSmallBusinessRelief: true });
  assert.match(ENGINE.words.ae_ct_estimate(ct), /AED 0\. The return is still due by 2027-09-30/);
  assert.equal(ENGINE.words.validate_ae_trn(ENGINE.run.validate_ae_trn(null, { trn: '1' })), 'A TRN has 15 digits; this one has 1.');
  const indian = await runTool(createState(), 'validate_ae_trn', { trn: '100123456700003' });
  assert.equal(indian.error, 'NOT_FOR_COUNTRY');
  const uae = createState();
  uae.company = { ...uae.company, country: 'AE' };
  const viaRunner = await runTool(uae, 'validate_ae_trn', { trn: '100123456700003' });
  assert.equal(viaRunner.ok, true, JSON.stringify(viaRunner));
  assert.equal(viaRunner.data.tin, '1001234567');
});

test('addMonthsClamped keeps month ends at month ends', () => {
  assert.equal(addMonthsClamped('2025-12-31', 9), '2026-09-30');
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsClamped('2026-01-15', 1), '2026-02-15');
  assert.equal(addMonthsClamped('2027-02-28', 12), '2028-02-29');
});
