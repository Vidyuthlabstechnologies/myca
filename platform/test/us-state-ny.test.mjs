import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../src/tools.mjs';
import { tableTax, scheduleTax, recaptureTax } from '../src/countries/united-states/states/ny-tax.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const base = { nycResident: 'no', yonkersResident: 'no', salesUseTax: 0 };
const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2023-03-01', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2017-05-05', months: 12 },
];
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };

test('the 2025 tax tables are reproduced row by row from the published New York State and New York City tables', () => {
  const reader = stateRuleReader('NY', '2025');
  const rates = reader.read('tax-rates');
  const table = reader.read('tax-table');
  const nyc = reader.read('nyc');
  const nycTable = reader.read('nyc-table');
  const published = [
    [38275, 'mfj', 1773], [12, 'single', 0], [20, 'single', 1], [40, 'hoh', 2], [14025, 'single', 607], [23625, 'mfj', 978], [23875, 'mfj', 991], [23625, 'single', 1135], [23625, 'hoh', 1051], [14025, 'hoh', 567], [52025, 'single', 2697], [62675, 'single', 3283], [62675, 'mfj', 3115], [62675, 'hoh', 3199], [64975, 'single', 3409], [64975, 'mfj', 3241], [64975, 'hoh', 3325],
  ];
  for (const [income, key, tax] of published) assert.equal(tableTax(income, table, rates.schedules[key], key), tax, `${key} ${income}`);
  const cityPublished = [[38275, 'mfj', 1292], [10, 'single', 0], [20, 'single', 1], [12225, 'single', 377], [62675, 'single', 2304], [62675, 'mfj', 2220], [62675, 'hoh', 2280], [14025, 'mfj', 432], [23625, 'hoh', 790], [64975, 'single', 2393], [64975, 'mfj', 2308], [64975, 'hoh', 2369]];
  for (const [income, key, tax] of cityPublished) assert.equal(tableTax(income, nycTable, nyc.schedules[key], key), tax, `NYC ${key} ${income}`);
  assert.equal(scheduleTax(72000, rates.schedules.single), 3796);
  assert.equal(recaptureTax({ taxable: 112000, nyAgi: 120000, key: 'single', bands: rates.schedules.single, recapture: rates.recapture }).tax, 6292);
});

test('New York resident, single: IT-201 from the federal return, standard deduction and the tax table', async () => {
  const state = await household({ state: 'NY', forms: [w2(60000, { state: 'NY', stateWithheld: 2800 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: base }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.form, 'IT-201');
  assert.equal(ny.lines['19'], 60000);
  assert.equal(ny.lines['33'], 60000);
  assert.equal(ny.lines['34'], 8000);
  assert.equal(ny.lines['37'], 52000);
  assert.equal(ny.lines['39'], 2697);
  assert.equal(ny.lines['40'], 0);
  assert.equal(ny.lines['46'], 2697);
  assert.equal(ny.lines['61'], 2697);
  assert.equal(ny.totalTax, 2697);
  assert.equal(ny.refund, 103);
  assert.equal(ny.schedules.taxComputation.method, 'tax table');
  assert.deepEqual(ny.checks.filter((item) => item.level === 'error'), []);
});

test('New York City resident, married with two children: city tax, Empire State child credit, NYS and NYC EIC and school tax credits', async () => {
  const state = await household({ state: 'NY', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(40000, { state: 'NY', stateWithheld: 900, localWithheld: 500 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, nycResident: 'full-year' } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  const federalEic = ny.schedules['IT-215']['10'];
  assert.ok(federalEic > 0);
  assert.equal(ny.lines['33'], 40000);
  assert.equal(ny.lines['34'], 16050);
  assert.equal(ny.lines['36'], 2000);
  assert.equal(ny.lines['37'], 21950);
  assert.equal(ny.lines['39'], 903);
  assert.equal(ny.lines['40'], 0);
  assert.equal(ny.lines['47'], 21950);
  assert.equal(ny.lines['47a'], 679);
  assert.equal(ny.lines['48'], 0);
  assert.equal(ny.lines['54'], 679);
  assert.equal(ny.lines['61'], 903 + 679);
  assert.equal(ny.lines['63'], 1330);
  assert.deepEqual(ny.schedules['IT-213'], { 1: 1, 2: 1000, 3: 1, 4: 330, 5: 1330, 6: 40000, 7: 0, 8: 0, 9: 1330 });
  assert.equal(ny.lines['65'], Math.round(federalEic * 0.3));
  assert.equal(ny.lines['69'], 125);
  assert.equal(ny.lines['69a'], 38);
  assert.equal(ny.lines['70'], Math.round(federalEic * 0.15));
  assert.equal(ny.lines['70a'], Math.round(Math.max(0, 679 - Math.round(federalEic * 0.15))));
  assert.equal(ny.lines['73'], 500);
  const refundable = 1330 + Math.round(federalEic * 0.3) + 125 + 38 + Math.round(federalEic * 0.15) + ny.lines['70a'];
  assert.equal(ny.lines['76'], refundable + 900 + 500);
  assert.equal(ny.refund, refundable + 900 + 500 - 1582);
});

test('New York City income tax elimination credit wipes out the city tax below the threshold for a filer with a dependent', async () => {
  const state = await household({ state: 'NY', filingStatus: 'hoh', dependents: [kids[1]], forms: [w2(30000, { state: 'NY' }), { kind: '1099-INT', fields: { interest: 12000 } }] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, nycResident: 'full-year' } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['70a'], 0);
  const lower = await household({ state: 'NY', filingStatus: 'hoh', dependents: [kids[1]], forms: [w2(34000, { state: 'NY' })] });
  await residency(lower, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, nycResident: 'full-year' } }]);
  const credit = await stateReturn(lower, '2025', 'NY');
  assert.equal(credit.lines['37'], 34000 - 11200 - 1000);
  assert.equal(credit.lines['47'], 21800);
  const eic = credit.lines['70'];
  const it270 = credit.schedules['IT-270'];
  assert.equal(it270['2'], 31503);
  assert.equal(it270['3'], 34000 - 31503);
  assert.equal(it270['5'], Math.round(((5000 - 2497) / 5000) * 10000) / 10000);
  assert.equal(credit.lines['70a'], Math.round(Math.max(0, credit.lines['54'] - eic) * it270['5']));
});

test('Yonkers resident surcharge is 16.75% of net state tax after the listed refundable credits', async () => {
  const state = await household({ state: 'NY', forms: [w2(60000, { state: 'NY', stateWithheld: 2800, localWithheld: 400 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, yonkersResident: 'full-year' } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['46'], 2697);
  assert.equal(ny.lines['55'], 452);
  assert.equal(ny.lines['74'], 400);
  assert.equal(ny.totalTax, 2697 + 452);
});

test('retiree: Social Security, U.S. Treasury interest and the $20,000 pension exclusion are subtracted', async () => {
  const state = await household({ state: 'NY', dateOfBirth: '1959-01-10', forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000 } }, { kind: 'SSA-1099', fields: { netBenefits: 20000 } }, { kind: '1099-INT', fields: { interest: 1000, treasuryInterest: 500 } }] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, newYorkMunicipalInterest: 0 } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  const ssTaxable = ny.lines['15'];
  assert.ok(ssTaxable > 0);
  assert.equal(ny.lines['10'], 30000);
  assert.equal(ny.lines['27'], ssTaxable);
  assert.equal(ny.lines['28'], 500);
  assert.equal(ny.lines['29'], 20000);
  assert.equal(ny.lines['33'], ny.lines['19'] - ssTaxable - 500 - 20000);
});

test('government pension is subtracted in full and the 529 deduction is capped', async () => {
  const state = await household({ state: 'NY', filingStatus: 'mfj', dateOfBirth: '1958-02-02', spouse, forms: [w2(50000, { state: 'NY', owner: 'spouse' }), { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000 } }] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, governmentPensionTaxpayer: 25000, ny529Contributions: 12000, publicEmployee414h: 1500 } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['21'], 1500);
  assert.equal(ny.lines['26'], 25000);
  assert.equal(ny.lines['29'], 15000);
  assert.equal(ny.lines['30'], 10000);
  assert.equal(ny.lines['33'], 90000 + 1500 - 25000 - 15000 - 10000);
});

test('resident credit for tax paid to another state (IT-112-R) uses the other state\'s computed nonresident tax', async () => {
  const state = await household({ state: 'NY', forms: [w2(50000, { state: 'NY', stateWithheld: 2000 }), w2(20000, { state: 'IL', stateWithheld: 990 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: base }, { state: 'IL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const illinois = await stateReturn(state, '2025', 'IL');
  assert.equal(illinois.totalTax, 950);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['37'], 62000);
  assert.equal(ny.lines['39'], 3247);
  assert.equal(ny.schedules['IT-112-R'][0]['26'], 0.2857);
  assert.equal(ny.lines['41'], 928);
  assert.equal(ny.lines['44'], 3247 - 928);
});

test('part-year resident: IT-203 taxes all income as a resident and keeps the New York share by the income percentage', async () => {
  const state = await household({ state: 'NY', forms: [w2(50000, { state: 'NY', stateWithheld: 2000 }), w2(30000, { state: 'NJ' })] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'NY', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: base }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.form, 'IT-203');
  assert.equal(ny.lines['19'], 80000);
  assert.equal(ny.lines['19-NY'], 50000);
  assert.equal(ny.lines['32'], 80000);
  assert.equal(ny.lines['37'], 72000);
  assert.equal(ny.lines['38'], 3796);
  assert.equal(ny.lines['44'], 3796);
  assert.equal(ny.lines['45'], 0.625);
  assert.equal(ny.lines['46'], 2373);
  assert.equal(ny.totalTax, 2373);
  assert.equal(ny.owed, 373);
});

test('nonresident commuter: only New York wages are in the New York column; interest stays out', async () => {
  const state = await household({ state: 'NJ', forms: [w2(100000, { state: 'NY', stateWithheld: 5200 }), { kind: '1099-INT', fields: { interest: 2000 } }] });
  await residency(state, '2025', [{ state: 'NJ', residency: 'full-year' }, { state: 'NY', residency: 'nonresident', answers: { salesUseTax: 0 } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.residency, 'nonresident');
  assert.equal(ny.lines['31'], 102000);
  assert.equal(ny.lines['31-NY'], 100000);
  assert.equal(ny.lines['2-NY'], 0);
  assert.equal(ny.lines['37'], 94000);
  assert.equal(ny.lines['38'], 5072);
  assert.equal(ny.lines['45'], 0.9804);
  assert.equal(ny.lines['46'], 4973);
  assert.equal(ny.refund, 5200 - 4973);
  assert.ok(!ny.checks.some((item) => item.code === 'NY_NYC_RESIDENCY_UNANSWERED'));
});

test('high income: the tax benefit recapture worksheet and the NYC rate schedule apply', async () => {
  const state = await household({ state: 'NY', filingStatus: 'mfj', spouse, forms: [w2(400000, { state: 'NY', stateWithheld: 26000, localWithheld: 14000 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, nycResident: 'full-year' } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['34'], 16050);
  assert.equal(ny.lines['38'], 383950);
  assert.deepEqual(ny.schedules.taxComputation.worksheet, { 1: 400000, 2: 383950, 3: 22413, 4: 1140, 5: 2747, 6: 76800, 7: 50000, 8: 1, 9: 2747, 10: 26300 });
  assert.equal(ny.lines['39'], 26300);
  assert.equal(ny.lines['47a'], 14658);
  assert.equal(ny.lines['69'], 0);
  assert.equal(ny.lines['69a'], 863);
  assert.equal(ny.totalTax, 26300 + 14658);
  const single = await household({ state: 'NY', forms: [w2(120000, { state: 'NY' })] });
  await residency(single, '2025', [{ state: 'NY', residency: 'full-year', answers: base }]);
  const phased = await stateReturn(single, '2025', 'NY');
  assert.deepEqual(phased.schedules.taxComputation.worksheet, { 1: 120000, 2: 112000, 3: 6720, 4: 6152, 5: 568, 6: 12350, 7: 0.247, 8: 140, 9: 6292 });
});

test('2026: the enacted rate cuts and recapture amounts apply, the $500 child credit for ages 4 to 16, and unpublished figures are provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'NY', filingStatus: 'mfj', spouse, forms: [w2(400000, { state: 'NY', stateWithheld: 26000 })] });
  await residency(state, '2026', [{ state: 'NY', residency: 'full-year', answers: base }]);
  const ny = await stateReturn(state, '2026', 'NY');
  assert.deepEqual(ny.schedules.taxComputation.worksheet, { 1: 400000, 2: 383950, 3: 22089, 4: 1140, 5: 3071, 6: 76800, 7: 50000, 8: 1, 9: 3071, 10: 26300 });
  assert.equal(ny.provisional, true);
  const family = await household({ taxYear: '2026', state: 'NY', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(60000, { state: 'NY' })] });
  await residency(family, '2026', [{ state: 'NY', residency: 'full-year', answers: base }]);
  const credit = await stateReturn(family, '2026', 'NY');
  assert.equal(credit.lines['63'], 1500);
  assert.equal(credit.lines['37'], 60000 - 16050 - 2000);
  assert.equal(credit.lines['39'], 1174 + Math.round((41975 - 27900) * 0.054));
  const pack = await runTool(family, 'us_state_filing_package', { taxYear: '2026', state: 'NY' });
  assert.ok(pack.data.packages[0].blockers.includes('STATE_FIGURES_PROVISIONAL'));
});

test('part-year New York City resident on IT-201: IT-360.1 prorates the deduction and the school credit by months', async () => {
  const state = await household({ state: 'NY', forms: [w2(60000, { state: 'NY', stateWithheld: 2800 })] });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, nycResident: 'part-year', nycMonths: 6, nycPeriodIncome: 30000 } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['39'], 2697);
  assert.equal(ny.schedules['IT-360.1']['44'], 4000);
  assert.equal(ny.schedules['IT-360.1']['47'], 26000);
  assert.equal(ny.lines['50'], 896);
  assert.equal(ny.lines['54'], 896);
  assert.equal(ny.lines['69'], 31);
  assert.equal(ny.lines['69a'], 53);
  assert.equal(ny.totalTax, 2697 + 896);
});

test('unanswered New York City residency blocks filing, MCTMT is computed per person above $50,000, and Yonkers work flags Form Y-203', async () => {
  const state = await household({ state: 'NY', forms: [w2(30000, { state: 'NY' })] });
  const plain = await stateReturn(state, '2025', 'NY');
  assert.ok(plain.checks.some((item) => item.level === 'error' && item.code === 'NY_NYC_RESIDENCY_UNANSWERED'));
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: { ...base, mctmtZone1Taxpayer: 80000, mctmtZone2Taxpayer: 40000, yonkersNonresidentWages: true } }]);
  const ny = await stateReturn(state, '2025', 'NY');
  assert.equal(ny.lines['54a'], 80000);
  assert.equal(ny.lines['54b'], 0);
  assert.equal(ny.lines['54c'], 480);
  assert.equal(ny.lines['54e'], 480);
  assert.ok(ny.checks.some((item) => item.code === 'NY_Y203_NOT_PREPARED' && item.level === 'error'));
  const questions = await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'NY' });
  assert.ok(questions.data.states[0].questions.some((item) => item.id === 'nycResident'));
});

test('itemized deductions on IT-196 drop state income tax and are used only when larger than the standard deduction', async () => {
  const state = await household({ state: 'NY', forms: [w2(150000, { state: 'NY', stateWithheld: 8000 }), { kind: '1098', fields: { mortgageInterest: 14000, propertyTax: 9000 } }], answers: { charityCash: 3000 } });
  await residency(state, '2025', [{ state: 'NY', residency: 'full-year', answers: base }]);
  const ny = await stateReturn(state, '2025', 'NY');
  const it196 = ny.schedules['IT-196'];
  assert.equal(it196['5'], 8000);
  assert.equal(it196['9'], 17000);
  assert.equal(it196['40'], 34000);
  assert.equal(it196['41'], 8000);
  assert.equal(it196['45'], 26000);
  assert.equal(it196['46'], Math.round(Math.round(26000 * 0.25) * 1));
  assert.equal(it196['49'], 26000 - 6500);
  assert.equal(ny.lines['34'], 19500);
});
