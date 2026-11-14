import { test } from 'node:test';
import assert from 'node:assert/strict';
import { malaysiaIncomeTax } from '../src/countries/malaysia/income-tax.mjs';
import { serviceTaxRate, salesTaxRate, sstReturn, sstRegistrationCheck, sstLatePenalty, parsePeriod, taxablePeriodOf } from '../src/countries/malaysia/sst.mjs';
import { consolidationWindow, consolidatedInput, einvoiceRequired, malaysiaToday, selfBilledInput } from '../src/countries/malaysia/myinvois-special.mjs';
import { LHDN_TABLES, LHDN_TABLE_NAMES, lookupCodes, hasCode, codeName } from '../src/countries/malaysia/lhdn-codes.mjs';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { isNric, maskNric, nricShapeError, redactNrics, redactNricsDeep } from '../src/my-identity.mjs';
import { redactModelRequest, redactTinsFor, redactTinsDeepFor } from '../src/us-identity.mjs';
import { appendAuditEvent } from '../src/ca-api.mjs';
import { createState } from '../src/store.mjs';
import { rules } from '../src/sprint-load.mjs';

const tax = (args) => malaysiaIncomeTax({ yearOfAssessment: '2025', ...args });
const at = (iso) => Date.parse(iso);
const profileState = () => {
  const state = createState();
  ENGINE.run.set_my_einvoice_profile(state, { name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', msic: '46510', phone: '+60123456789', address: { lines: ['Lot 66'], city: 'Kuala Lumpur', state: 'Selangor' } });
  return state;
};

test('resident bands: every boundary, rounding to the sen, and a very large income', () => {
  const chargeable = (income) => tax({ income: { employment: income } }).data;
  assert.equal(chargeable(14000).taxOnChargeableIncome, 0, 'RM5,000 chargeable is in the 0% band');
  assert.equal(chargeable(29000).taxOnChargeableIncome, 150);
  assert.equal(chargeable(44000).taxOnChargeableIncome, 600);
  assert.equal(chargeable(59000).taxOnChargeableIncome, 1500);
  assert.equal(chargeable(79000).taxOnChargeableIncome, 3700);
  assert.equal(chargeable(109000).taxOnChargeableIncome, 9400);
  assert.equal(chargeable(409000).taxOnChargeableIncome, 84400);
  assert.equal(chargeable(609000).taxOnChargeableIncome, 136400);
  assert.equal(chargeable(2009000).taxOnChargeableIncome, 528400);
  assert.equal(chargeable(3009000).taxOnChargeableIncome, 828400, '30% above RM2 million');
  assert.equal(chargeable(14100.5).taxOnChargeableIncome, 1.01, '1% of RM100.50 is 100.5 sen, rounded once to 101 sen');
  assert.equal(chargeable(0).chargeableIncome, 0, 'reliefs never make chargeable income negative');
  assert.equal(chargeable(0).outcome, 'nothing due');
  const huge = chargeable(1e13);
  assert.equal(huge.taxOnChargeableIncome, Math.round((528400 + (1e13 - 9000 - 2000000) * 0.3) * 100) / 100);
  assert.equal(tax({ income: { employment: 1e13 + 1 } }).error, 'BAD_AMOUNTS');
});

test('the RM400 rebate stops above RM35,000 chargeable income and never makes tax negative', () => {
  const at35k = tax({ income: { employment: 44000 } }).data;
  assert.equal(at35k.rebate, 400);
  assert.equal(at35k.taxPayable, 200);
  const above = tax({ income: { employment: 44000.01 } }).data;
  assert.equal(above.rebate, 0);
  assert.equal(above.rebateEntitled, 0);
  assert.equal(above.taxPayable, 600);
  const small = tax({ income: { employment: 20000 } }).data;
  assert.equal(small.taxOnChargeableIncome, 60);
  assert.equal(small.rebateEntitled, 400);
  assert.equal(small.rebate, 60);
  assert.equal(small.taxPayable, 0);
});

test('zakat, PCB and refunds', () => {
  const zakat = tax({ income: { employment: 100000 }, zakat: 100000 }).data;
  assert.equal(zakat.taxPayable, 0);
  assert.equal(zakat.zakat, zakat.taxOnChargeableIncome);
  assert.equal(zakat.zakatNotUsed, 100000 - zakat.taxOnChargeableIncome);
  const refund = tax({ income: { employment: 100000 }, monthlyTaxDeductionsPaid: 20000 }).data;
  assert.equal(refund.outcome, 'refund due');
  assert.equal(refund.balance, refund.taxPayable - 20000);
  const exact = tax({ income: { employment: 100000 }, monthlyTaxDeductionsPaid: tax({ income: { employment: 100000 } }).data.taxPayable }).data;
  assert.equal(exact.outcome, 'nothing due');
});

test('reliefs are capped individually and inside their group', () => {
  const out = tax({ income: { employment: 100000 }, reliefs: { epf: 5000, lifeInsurance: 3000, medicalSelfSpouseChild: 9500, vaccination: 2000, childUnder18: 3, lifestyle: 9999 } }).data;
  const allowed = Object.fromEntries(out.reliefs.map((line) => [line.relief, line.allowed]));
  assert.equal(allowed.epf, 4000);
  assert.equal(allowed.lifeInsurance, 3000);
  assert.equal(allowed.medicalSelfSpouseChild, 9500);
  assert.equal(allowed.vaccination, 500, 'vaccination is within the RM10,000 medical cap');
  assert.equal(allowed.childUnder18, 6000);
  assert.equal(allowed.lifestyle, 2500);
  assert.equal(out.totalReliefs, 9000 + 4000 + 3000 + 9500 + 500 + 6000 + 2500);
  assert.equal(tax({ income: { employment: 1 }, reliefs: { childUnder18: 31 } }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: 1 }, reliefs: { childUnder18: 2.5 } }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: 1 }, reliefs: { epf: -1 } }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: 1 }, reliefs: [] }).error, 'BAD_AMOUNTS');
});

test('a non-resident pays a flat 30% with no reliefs, no rebate and no zakat rebate', () => {
  const out = tax({ resident: false, income: { employment: 100000 }, reliefs: { epf: 4000, spouse: 4000 }, zakat: 500 }).data;
  assert.equal(out.taxOnChargeableIncome, 30000);
  assert.equal(out.totalReliefs, 0);
  assert.deepEqual(out.refusedReliefs, ['epf', 'spouse', 'zakat']);
  assert.equal(out.rebate, 0);
  assert.equal(out.zakat, 0);
  assert.equal(out.taxPayable, 30000);
  assert.equal(out.form, 'Form M, filed in MyTax e-Filing');
  assert.equal(tax({ resident: false, income: { employment: 0.01 } }).data.taxOnChargeableIncome, 0, '30% of one sen rounds to nothing');
});

test('wrong years of assessment and missing or malformed input are refused', () => {
  assert.equal(tax({ yearOfAssessment: '2022', income: { employment: 1 } }).error, 'RULE_NOT_IN_FORCE');
  assert.equal(tax({ yearOfAssessment: '2023', income: { employment: 1 } }).error, 'RULE_NOT_IN_FORCE', 'no reliefs are recorded for YA 2023');
  assert.equal(tax({ yearOfAssessment: '2026', income: { employment: 1 } }).error, 'RULE_NOT_IN_FORCE');
  for (const year of ['2025.5', '25', '', 'twenty', null]) assert.equal(tax({ yearOfAssessment: year, income: {} }).error, 'BAD_YEAR_OF_ASSESSMENT', String(year));
  assert.equal(malaysiaIncomeTax({ yearOfAssessment: '2025' }).error, 'INCOME_REQUIRED');
  assert.equal(tax({ resident: 'yes', income: {} }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: -5 } }).problems[0].field, 'income.employment');
  assert.equal(tax({ income: { employment: Number.NaN } }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: 10 }, zakat: -1 }).error, 'BAD_AMOUNTS');
  assert.equal(tax({ income: { employment: 10 }, monthlyTaxDeductionsPaid: Infinity }).error, 'BAD_AMOUNTS');
});

test('service tax rates by date and category, from the first SST day on', () => {
  assert.equal(serviceTaxRate('general', '2018-08-31').error, 'RULE_NOT_IN_FORCE');
  assert.equal(serviceTaxRate('general', '2018-09-01').basisPoints, 600);
  assert.equal(serviceTaxRate('general', '2024-02-29').basisPoints, 600);
  assert.equal(serviceTaxRate('general', '2024-03-01').basisPoints, 800);
  assert.equal(serviceTaxRate('food-and-beverage', '2024-03-01').basisPoints, 600);
  assert.equal(serviceTaxRate('construction', '2025-07-01').basisPoints, 600);
  assert.equal(serviceTaxRate('healthcare', '2025-07-01').kind, 'exempt');
  assert.equal(serviceTaxRate('healthcare-non-citizen', '2025-07-01').basisPoints, 600);
  assert.equal(serviceTaxRate('credit-card', '2018-09-01').amountSen, 2500);
  for (const date of ['2026-02-30', '2026-13-01', '01-01-2026', '', undefined]) assert.equal(serviceTaxRate('general', date).error, 'BAD_DATE', String(date));
  assert.equal(serviceTaxRate('general', '2026-02-01').record.attestations.length, 0, 'unreviewed until a Malaysian tax agent attests it');
});

test('sales tax rates: 5% and 10% only, 0% for exempt goods', () => {
  assert.equal(salesTaxRate(500, '2026-01-01').basisPoints, 500);
  assert.equal(salesTaxRate(1000, '2025-07-01').basisPoints, 1000);
  assert.equal(salesTaxRate(undefined, '2026-01-01').basisPoints, 1000);
  assert.equal(salesTaxRate(0, '2026-01-01').kind, 'exempt');
  assert.equal(salesTaxRate(700, '2026-01-01').error, 'SALES_TAX_RATE_NOT_IN_FORCE');
  assert.equal(salesTaxRate(500, '2018-08-01').error, 'RULE_NOT_IN_FORCE');
});

test('SST-02 periods are two consecutive months from September 2018, across the year end too', () => {
  assert.equal(parsePeriod('2026-01/2026-03'), null);
  assert.equal(parsePeriod('2026-02/2026-01'), null);
  assert.equal(parsePeriod('2018-07/2018-08'), null);
  assert.equal(parsePeriod('2026-13/2027-01'), null);
  assert.equal(parsePeriod('January'), null);
  assert.deepEqual(parsePeriod('2026-12/2027-01'), { period: '2026-12/2027-01', from: '2026-12-01', to: '2027-01-31', due: '2027-02-28', form: 'SST-02' });
  assert.equal(parsePeriod('2027-11/2027-12').due, '2028-01-31');
  assert.equal(parsePeriod('2028-01/2028-02').to, '2028-02-29', 'leap year');
  assert.equal(taxablePeriodOf('2026-12-15').period, '2026-11/2026-12');
  assert.equal(taxablePeriodOf('2026-12-15', { firstMonthOdd: false }).period, '2026-12/2027-01');
  assert.equal(taxablePeriodOf('2026-02-30'), null);
});

test('SST-02 lines: rounding per line, flat card charge, outside-period lines, and every refusal', () => {
  const out = sstReturn([
    { date: '2026-01-05', kind: 'service', value: 0.05 },
    { date: '2026-01-06', kind: 'service', value: 0.07 },
    { date: '2026-02-01', kind: 'sales', value: 100, rateBasisPoints: 1000 },
    { date: '2026-02-01', kind: 'service', category: 'credit-card', cards: 3 },
    { date: '2026-03-01', kind: 'service', value: 1 },
    { date: '2026-02-10', kind: 'service', value: 0 },
  ], '2026-01/2026-02');
  assert.equal(out.ok, true);
  assert.equal(out.data.serviceTax, 75.01, '0.4 sen rounds to 0 and 0.56 sen to 1, plus 3 cards at RM25');
  assert.equal(out.data.salesTax, 10);
  assert.deepEqual(out.data.outsidePeriod, [4]);
  const bad = sstReturn([
    { date: '2026-02-29', kind: 'service', value: 1 },
    null,
    { date: '2026-01-05', kind: 'service', value: -1 },
    { date: '2026-01-05', kind: 'service', value: 1e14 },
    { date: '2026-01-05', kind: 'goods', value: 1 },
    { date: '2026-01-05', kind: 'service', category: 'credit-card', cards: 1.5 },
    { date: '2026-01-05', kind: 'service', category: 'massage', value: 1 },
    { date: '2026-01-05', kind: 'sales', value: 1, rateBasisPoints: 700 },
    { date: '2026-01-05', kind: 'service', value: '' },
  ], '2026-01/2026-02');
  assert.equal(bad.error, 'LINES_NEED_FIXING');
  assert.deepEqual(bad.problems.map((problem) => problem.error), ['BAD_DATE', 'LINE_NOT_OBJECT', 'BAD_VALUE', 'BAD_VALUE', 'LINE_KIND_UNKNOWN', 'BAD_CARD_COUNT', 'UNKNOWN_SERVICE_CATEGORY', 'SALES_TAX_RATE_NOT_IN_FORCE', 'BAD_VALUE']);
  assert.equal(sstReturn('x', '2026-01/2026-02').error, 'LINES_REQUIRED');
  assert.equal(sstReturn([], 'nope').error, 'BAD_PERIOD');
  assert.equal(sstReturn([], '2026-01/2026-02').data.totalTax, 0, 'an empty period is a nil return');
  assert.equal(ENGINE.run.my_sst_return({}, { period: '2026-01/2026-02' }).error, 'LINES_REQUIRED');
});

test('SST registration: exceeds the threshold, by category and date, looking back and ahead', () => {
  const check = (args) => sstRegistrationCheck({ date: '2026-01-01', ...args });
  assert.equal(check({ last12Months: 500000 }).data.mustRegister, false);
  assert.equal(check({ last12Months: 500000.01 }).data.mustRegister, true);
  assert.equal(check({ last12Months: 0 }).data.mustRegister, false);
  assert.equal(check({ last12Months: 0, category: 'credit-card' }).data.mustRegister, true, 'no threshold for card issuers');
  assert.equal(check({ last12Months: 1500000, category: 'healthcare-non-citizen' }).data.threshold, 1500000);
  assert.equal(check({ last12Months: 1, next12Months: 500000.01 }).data.mustRegister, true);
  assert.match(check({ last12Months: 1, next12Months: 500000.01 }).data.why, /next twelve months/);
  assert.equal(check({ kind: 'sales', last12Months: 500000 }).data.mustRegister, false);
  assert.equal(check({ kind: 'sales', last12Months: 500001 }).data.mustRegister, true);
  assert.equal(sstRegistrationCheck({ category: 'rental-or-leasing', last12Months: 600000, date: '2025-06-30' }).data.threshold, 500000);
  assert.equal(sstRegistrationCheck({ category: 'rental-or-leasing', last12Months: 600000, date: '2025-07-01' }).data.threshold, 1000000);
  assert.equal(check({ last12Months: -1 }).error, 'BAD_AMOUNT');
  assert.equal(check({ last12Months: 1, next12Months: -1 }).error, 'BAD_AMOUNT');
  assert.equal(check({ last12Months: true }).error, 'BAD_AMOUNT');
  assert.equal(check({ last12Months: 1e14 }).error, 'BAD_AMOUNT');
  assert.equal(check({ kind: 'goods', last12Months: 1 }).error, 'BAD_KIND');
  assert.equal(check({ category: 'massage', last12Months: 1 }).error, 'UNKNOWN_SERVICE_CATEGORY');
  assert.equal(sstRegistrationCheck({ last12Months: 1, date: '2018-08-01' }).error, 'RULE_NOT_IN_FORCE');
  assert.equal(sstRegistrationCheck({ last12Months: 1, date: 'soon' }).error, 'BAD_DATE');
  assert.equal(check({ last12Months: 1 }).data.test, 'exceeds');
});

test('the late payment penalty steps at 30, 60 and 90 days', () => {
  const penalty = (paidOn) => sstLatePenalty({ unpaidTax: 1000, dueDate: '2026-05-31', paidOn }).data;
  assert.equal(penalty('2026-05-31').penalty, 0);
  assert.equal(penalty('2026-06-30').penalty, 100);
  assert.equal(penalty('2026-07-01').penalty, 250);
  assert.equal(penalty('2026-07-30').penalty, 250);
  assert.equal(penalty('2026-07-31').penalty, 400);
  assert.equal(penalty('2026-08-29').penalty, 400);
  assert.equal(penalty('2026-08-30').beyondLastStep, true);
  assert.equal(penalty('2026-05-01').daysLate, 0, 'paying early is not late');
  assert.equal(sstLatePenalty({ unpaidTax: -1, dueDate: '2026-05-31', paidOn: '2026-06-01' }).error, 'BAD_AMOUNT');
  assert.equal(sstLatePenalty({ unpaidTax: 1, dueDate: '2026-02-30', paidOn: '2026-06-01' }).error, 'BAD_DATE');
});

test('e-invoice mandate: phases, the RM1 million exemption until August 2026, RM3 million from September 2026', () => {
  const ask = (annualTurnover, date, relatedCompanyTurnover) => einvoiceRequired({ annualTurnover, date, relatedCompanyTurnover });
  assert.equal(ask(2000000, '2026-08-31').data.required, true);
  assert.equal(ask(999999.99, '2026-08-31').data.exempt, true);
  assert.equal(ask(1000000, '2026-08-31').data.exempt, false, 'RM1 million is not below RM1 million');
  const after = ask(2000000, '2026-09-01').data;
  assert.equal(after.exempt, true);
  assert.equal(after.required, false);
  assert.equal(after.exemptBelow, 3000000);
  assert.equal(after.startsFrom, null);
  assert.equal(ask(2999999.99, '2026-09-01').data.exempt, true);
  assert.equal(ask(3000000, '2026-09-01').data.required, true);
  const related = ask(500000, '2026-09-01', 3000000).data;
  assert.equal(related.exempt, false);
  assert.match(related.why, /related, holding or shareholder company/);
  assert.equal(ask(500000, '2026-09-01', 2999999.99).data.exempt, true);
  assert.equal(ask(500000, '2026-08-31', 5000000).data.exempt, true, 'the related-company condition starts with the RM3 million exemption');
  assert.equal(ask(30000000, '2026-09-01').data.startsFrom, '2025-01-01');
  assert.equal(ask(200000000, '2026-09-01').data.startsFrom, '2024-08-01');
  assert.equal(ask(-1, '2026-09-01').error, 'BAD_AMOUNT');
  assert.equal(ask(1, '2026-09-01', -1).error, 'BAD_AMOUNT');
  assert.equal(ask(1, '2026-09-31').error, 'BAD_DATE');
  assert.equal(ask(1, '2025-12-31').error, 'RULE_NOT_IN_FORCE');
  const record = rules.rule('my.einvoice.mandate', '2026-09-01').record;
  assert.equal(record.effectiveFrom, '2026-09-01');
  assert.match(record.section, /4\.8.*1\.6\.1\(e\)/);
  assert.ok(String(record.source).split(/\s+/).some((part) => { try { return new URL(part).hostname === 'thestar.com.my'; } catch { return false; } }));
  assert.equal(rules.rule('my.einvoice.mandate', '2026-08-31').record.effectiveTo, '2026-08-31');
  assert.match(ENGINE.words.my_einvoice_required(ENGINE.run.my_einvoice_required({}, { annualTurnover: 2000000, date: '2026-09-01' })), /Exempt/);
});

test('the consolidation window is the month after, until 7 days after month end, in Malaysian time', () => {
  assert.equal(malaysiaToday(at('2026-10-31T15:59:59Z')), '2026-10-31');
  assert.equal(malaysiaToday(at('2026-10-31T16:00:00Z')), '2026-11-01', 'midnight in Kuala Lumpur is 16:00 UTC');
  const window = consolidationWindow('2026-10', '2026-11-07');
  assert.deepEqual([window.from, window.to, window.due, window.ended, window.late], ['2026-10-01', '2026-10-31', '2026-11-07', true, false]);
  assert.equal(consolidationWindow('2026-10', '2026-11-08').late, true);
  assert.equal(consolidationWindow('2026-10', '2026-10-31').ended, false);
  assert.equal(consolidationWindow('2028-02', '2028-03-01').to, '2028-02-29');
  assert.equal(consolidationWindow('2026-12', '2027-01-07').due, '2027-01-07');
  for (const month of ['2026-13', '2026-1', 'Oct', '', undefined]) assert.equal(consolidationWindow(month, '2026-11-01').error, 'BAD_MONTH', String(month));
  assert.equal(consolidationWindow('2024-07', '2024-08-01').error, 'RULE_NOT_IN_FORCE');
  const state = profileState();
  const lines = [{ amount: 100 }];
  assert.equal(consolidatedInput(state, { month: '2026-10', lines }, at('2026-10-31T15:00:00Z')).error, 'CONSOLIDATION_MONTH_NOT_ENDED');
  assert.equal(consolidatedInput(state, { month: '2026-10', lines }, at('2026-11-07T15:59:00Z')).ok, true, 'still 7 November in Kuala Lumpur');
  assert.equal(consolidatedInput(state, { month: '2026-10', lines }, at('2026-11-07T16:00:00Z')).error, 'CONSOLIDATION_WINDOW_CLOSED');
  assert.equal(consolidatedInput(state, { month: '2026-10', lines, acknowledgeLate: 'yes' }, at('2026-11-08T12:00:00Z')).error, 'CONSOLIDATION_WINDOW_CLOSED', 'only true acknowledges');
  assert.equal(consolidatedInput(state, { month: '2026-10', lines, acknowledgeLate: true }, at('2026-11-08T12:00:00Z')).late, true);
});

test('activities excluded from consolidation follow the rule in force for that month', () => {
  const state = profileState();
  const lines = [{ amount: 100 }];
  const now = at('2026-11-02T00:00:00Z');
  for (const activity of ['automotive', 'aviation', 'construction', 'construction-materials', 'betting-and-gaming', 'agents-dealers-distributors', 'electricity', 'telecommunication']) {
    const out = consolidatedInput(state, { month: '2026-10', lines, activity }, now);
    assert.equal(out.error, 'CONSOLIDATION_NOT_ALLOWED', activity);
    assert.equal(out.ruleId, 'my.einvoice.consolidation');
  }
  assert.equal(consolidatedInput(state, { month: '2026-10', lines, activity: 'restaurant' }, now).ok, true);
  assert.equal(consolidatedInput(state, { month: '2025-10', lines, activity: 'electricity', acknowledgeLate: true }, now).ok, true, 'electricity was added from 1 January 2026');
  assert.equal(consolidatedInput(createState(), { month: '2026-10', lines }, now).error, 'EINVOICE_PROFILE_MISSING');
  assert.equal(consolidatedInput(state, { month: '2026-10', lines: [] }, now).error, 'EINVOICE_FIELDS_MISSING');
  const bad = consolidatedInput(state, { month: '2026-10', lines: [{ amount: -1 }, { amount: 1, transactions: 0 }, null, { unitPrice: 2e13 }] }, now);
  assert.deepEqual(bad.problems.map((problem) => problem.field), ['lines[0].amount', 'lines[1].transactions', 'lines[2]', 'lines[3].amount']);
  const built = consolidatedInput(state, { month: '2026-10', lines: [{ amount: 100, receipts: 'R1-R9' }] }, now);
  assert.equal(built.input.buyer.tin, 'EI00000000010');
  assert.equal(built.input.lines[0].classification, '004');
  assert.equal(built.input.lines[0].description, 'Sales to the general public, receipts R1-R9');
  assert.equal(built.input.number, 'CONS-202610');
});

test('self-billed input: types 11 to 14, foreign supplier defaults, and a Malaysian supplier keeps its own TIN', () => {
  const state = profileState();
  const foreign = selfBilledInput(state, { number: 'SB', supplier: { name: 'Acme', address: { country: 'usa', city: 'NYC' } }, lines: [] });
  assert.equal(foreign.foreign, true);
  assert.deepEqual([foreign.input.supplier.tin, foreign.input.supplier.idType, foreign.input.supplier.idValue, foreign.input.supplier.msic, foreign.input.supplier.address.state, foreign.input.supplier.address.country], ['EI00000000030', 'PASSPORT', 'NA', '00000', '17', 'USA']);
  assert.equal(foreign.input.buyer.tin, 'C20830570210');
  const local = selfBilledInput(state, { type: 'self-billed-debit-note', number: 'SB', supplier: { name: 'Ejen', tin: 'ig12345678901', idType: 'NRIC', idValue: '900101145678', address: { state: '10' } }, lines: [] });
  assert.equal(local.foreign, false);
  assert.equal(local.input.supplier.tin, 'IG12345678901');
  assert.equal(local.input.type, 'self-billed-debit-note');
  assert.equal(selfBilledInput(state, { type: 'credit-note', supplier: {} }).error, 'BAD_TYPE');
});

test('every LHDN code table looks up by code and by words', () => {
  assert.deepEqual(LHDN_TABLE_NAMES, ['states', 'taxTypes', 'documentTypes', 'classifications', 'paymentMethods', 'msic', 'countries', 'currencies', 'units']);
  const known = { states: ['14', 'Wilayah Persekutuan Kuala Lumpur'], taxTypes: ['06', 'Not Applicable'], documentTypes: ['11', 'Self-billed Invoice'], classifications: ['004', 'Consolidated e-Invoice'], paymentMethods: ['03', 'Bank Transfer'], msic: ['00000', 'NOT APPLICABLE'], countries: ['MYS', ''], currencies: ['MYR', ''], units: ['C62', ''] };
  for (const table of LHDN_TABLE_NAMES) {
    const [code, name] = known[table];
    const out = lookupCodes({ table, code });
    assert.equal(out.ok, true, table);
    assert.equal(out.data.found, true, `${table} ${code}`);
    assert.equal(out.data.entries[0].name, name, table);
    assert.ok(out.data.source, table);
    assert.equal(hasCode(table, code), true);
    assert.equal(lookupCodes({ table, code: 'NOPE-99' }).data.found, false, table);
    assert.ok(LHDN_TABLES[table].length > 0);
  }
  assert.equal(LHDN_TABLES.states.length, 17);
  assert.equal(LHDN_TABLES.documentTypes.length, 8);
  assert.equal(LHDN_TABLES.paymentMethods.length, 8);
  assert.equal(codeName('taxTypes', 'E'), 'Tax exemption (where applicable)');
  assert.equal(lookupCodes({ table: 'states', code: '17' }).data.entries[0].name, 'Not Applicable');
  assert.equal(lookupCodes({ table: 'currencies', code: 'usd' }).data.found, true, 'codes are matched in upper case');
  const words = lookupCodes({ table: 'msic', query: 'computer software wholesale' });
  assert.ok(words.data.total >= 1);
  assert.ok(words.data.entries.every((row) => /software/i.test(row.name) && /wholesale/i.test(row.name)));
  assert.equal(lookupCodes({ table: 'msic', limit: 3 }).data.entries.length, 3);
  assert.equal(lookupCodes({ table: 'msic', limit: 100000 }).data.entries.length, 500);
  assert.equal(lookupCodes({ table: 'sizes' }).error, 'UNKNOWN_CODE_TABLE');
  assert.equal(ENGINE.run.my_lhdn_codes({}, { table: 'paymentMethods', code: '06' }).data.entries[0].name, 'e-Wallet / Digital Wallet');
});

test('MyKad numbers: shape, birth date, place code, and masking to the last four digits', () => {
  assert.equal(isNric('900101-14-5678'), true);
  assert.equal(isNric('900101145678'), true);
  assert.equal(isNric('000229 01 0001'), true, 'a leap-day birth date');
  assert.equal(nricShapeError(''), 'NRIC_REQUIRED');
  assert.equal(nricShapeError('90010114567'), 'NRIC_NOT_TWELVE_DIGITS');
  assert.equal(nricShapeError('901301145678'), 'NRIC_BAD_BIRTH_DATE');
  assert.equal(nricShapeError('900230145678'), 'NRIC_BAD_BIRTH_DATE');
  assert.equal(nricShapeError('900101175678'), 'NRIC_BAD_PLACE_CODE', '17 to 20 are not place codes');
  assert.equal(nricShapeError('900101005678'), 'NRIC_BAD_PLACE_CODE');
  assert.equal(nricShapeError('900101985678'), null, '98 is a valid place code');
  assert.equal(maskNric('900101-14-5678'), '******-**-5678');
  assert.equal(maskNric('1234'), '');
});

test('MyKad numbers are masked in free text, in nested objects and in the model request, for Malaysia only', () => {
  const said = 'My IC is 900101-14-5678, my wife is 850615 10 1234 and the bare one 900101145678. Invoice 202001234567 and RM1,234,567,890.12 stay.';
  const masked = redactNrics(said);
  assert.equal(masked, 'My IC is ******-**-5678, my wife is ******-**-1234 and the bare one ******-**-5678. Invoice 202001234567 and RM1,234,567,890.12 stay.');
  assert.equal(redactNrics('ref 9001011456781'), 'ref 9001011456781', 'a longer number is not a MyKad');
  assert.equal(redactNrics(null), null);
  const deep = redactNricsDeep({ buyer: { idType: 'NRIC', idValue: '900101145678', tin: 'IG12345678901' }, supplier: { idType: 'BRN', idValue: '202001234567' }, nric: '900101-14-5678', notes: ['call 900101-14-5678'] });
  assert.equal(deep.buyer.idValue, '******-**-5678');
  assert.equal(deep.buyer.tin, 'IG12345678901');
  assert.equal(deep.supplier.idValue, '202001234567', 'a company registration number is not masked');
  assert.equal(deep.nric, '******-**-5678');
  assert.equal(deep.notes[0], 'call ******-**-5678');
  assert.equal(redactTinsFor('MY', 'IC 900101-14-5678'), 'IC ******-**-5678');
  assert.equal(redactTinsFor('IN', 'IC 900101-14-5678'), 'IC 900101-14-5678');
  const body = {
    system: 'Owner IC 900101-14-5678',
    messages: [
      { role: 'user', content: 'Check 900101145678 please' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'validate_my_tin', input: { tin: 'IG12345678901', idType: 'NRIC', idValue: '900101145678' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: '{"idValue":"900101-14-5678"}' }] }] },
    ],
  };
  const out = redactModelRequest(body, 'MY');
  assert.doesNotMatch(JSON.stringify(out), /900101-?14-?5678/);
  assert.equal(out.messages[1].content[0].input.idValue, '******-**-5678');
  assert.equal(out.messages[1].content[0].input.tin, 'IG12345678901');
  assert.equal(redactModelRequest(body, 'IN'), body);
  assert.equal(redactModelRequest(body, 'US').system, 'Owner IC 900101-14-5678', 'US masking looks for SSNs, not MyKad numbers');
  assert.equal(redactTinsDeepFor('MY', { nric: '900101145678' }).nric, '******-**-5678');
});

test('audit metadata of a Malaysian business never keeps a MyKad number', () => {
  const state = createState();
  state.company = { ...(state.company || {}), country: 'MY' };
  appendAuditEvent(state, { action: 'my_test_event', actorId: 'owner', metadata: { buyer: { idType: 'NRIC', idValue: '900101145678' }, note: 'IC 900101-14-5678' } });
  const event = state.auditEvents.at(-1);
  assert.equal(event.metadata.buyer.idValue, '******-**-5678');
  assert.equal(event.metadata.note, 'IC ******-**-5678');
});
