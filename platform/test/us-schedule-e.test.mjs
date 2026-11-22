import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED, US_FORMS_COMING } from '../src/us-1040.mjs';
import { macrsRealPropertyDepreciation } from '../src/us-form-schedule-e.mjs';
import { planUsTaxForm, addUsTaxForm, usFormKinds, usInterview, usReturnReview, setUsTaxpayer } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';

const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1980-04-02' };
const w2 = (wages, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: 'Acme Inc', fields: { wages, federalWithheld: Math.round(wages * 0.2), socialSecurityWages: wages, medicareWages: wages } });
const rental = (id, fields, extra = {}) => ({ id, kind: 'Rental property', owner: 'taxpayer', payer: `${id} Main St, Austin, TX 78701`, fields: { propertyType: 1, fairRentalDays: 365, activeParticipation: true, ...fields }, ...extra });
const misc = (payer, fields) => ({ id: `misc-${payer}`, kind: '1099-MISC', owner: 'taxpayer', payer, fields });
const compute = (status, forms, more = {}) => computeForm1040({ filingStatus: status, taxpayer: adult, ...(status === 'mfj' ? { spouse: { firstName: 'Ben', lastName: 'Diaz', dateOfBirth: '1981-01-01' } } : {}), forms, ...more }, more.taxYear || '2025');
const codes = (out) => out.data.checks.map((item) => item.code);
const macrs = (taxYear) => rules.rule('us.federal.individual.macrs-real-property', `${taxYear}-12-31`).value;
const lossOf30000 = { rents: 12000, mortgageInterest: 20000, taxes: 4000, depreciation: 18000 };

test('a profitable rental: line 21 = 24000 - (1200 + 3000 + 800 + 5000) = 14000 goes to Schedule 1 line 5 and AGI = 60000 + 14000', () => {
  const out = compute('single', [w2(60000), rental('1', { propertyType: 2, rents: 24000, insurance: 1200, taxes: 3000, repairs: 800, depreciation: 5000 })]);
  const property = out.data.schedules.E.properties[0];
  assert.equal(property.lines['20'], 10000);
  assert.equal(property.lines['21'], 14000);
  assert.equal(property.lines['22'], undefined);
  assert.deepEqual(out.data.schedules.E.lines, { '23a': 24000, '23b': 0, '23c': 0, '23d': 5000, '23e': 10000, 24: 14000, 25: 0, 26: 14000, 41: 14000 });
  assert.equal(out.data.schedules['1']['5'], 14000);
  assert.equal(out.data.lines['8'], 14000);
  assert.equal(out.data.summary.agi, 74000);
  assert.equal(out.data.schedules['8582'], undefined);
  assert.ok(!codes(out).includes('SCHEDULE_E_NOT_COVERED'));
  assert.ok(US_FORMS_SUPPORTED.includes('Schedule E') && US_FORMS_SUPPORTED.includes('8582') && !US_FORMS_COMING.includes('Schedule E'));
});

test('a rental loss of 10000 - (12000 + 2000 + 4000) = -8000 at MAGI 80000 is allowed in full without Form 8582 (the $25,000 exception)', () => {
  const out = compute('single', [w2(80000), rental('1', { rents: 10000, mortgageInterest: 12000, taxes: 2000, depreciation: 4000 })]);
  assert.equal(out.data.schedules.E.properties[0].lines['21'], -8000);
  assert.equal(out.data.schedules.E.properties[0].lines['22'], -8000);
  assert.equal(out.data.schedules.E.lines['26'], -8000);
  assert.equal(out.data.schedules['8582'], undefined);
  assert.equal(out.data.summary.agi, 72000);
  assert.deepEqual(out.data.passiveLossCarryover, []);
});

test('at MAGI 120000 the allowance is 50% of (150000 - 120000) = 15000 of a 30000 loss, and 15000 carries forward', () => {
  for (const taxYear of ['2025', '2026']) {
    const out = compute('single', [w2(120000), rental('1', lossOf30000)], { taxYear });
    const form = out.data.schedules['8582'];
    assert.deepEqual(form.lines, { '1a': 0, '1b': -30000, '1c': 0, '1d': -30000, '2a': 0, '2b': 0, '2c': 0, '2d': 0, 3: -30000, 4: 30000, 5: 150000, 6: 120000, 7: 30000, 8: 15000, 9: 15000, 10: 0, 11: 15000 });
    assert.deepEqual(form.partVIII, [{ name: '1 Main St, Austin, TX 78701', a: 30000, b: 15000, c: 15000 }]);
    assert.equal(out.data.schedules.E.properties[0].lines['22'], -15000);
    assert.equal(out.data.schedules['1']['5'], -15000);
    assert.equal(out.data.summary.agi, 105000, taxYear);
    assert.deepEqual(out.data.passiveLossCarryover, [{ id: '1', name: '1 Main St, Austin, TX 78701', unallowedLoss: 15000 }]);
    assert.ok(codes(out).includes('PASSIVE_LOSS_CARRYFORWARD'));
  }
});

test('at MAGI 160000 no allowance is left: the 30000 loss and the 5000 prior-year loss all carry forward (35000)', () => {
  const out = compute('single', [w2(160000), rental('1', { ...lossOf30000, priorYearUnallowedLoss: 5000 })]);
  const form = out.data.schedules['8582'];
  assert.equal(form.lines['1c'], -5000);
  assert.equal(form.lines['1d'], -35000);
  assert.equal(form.lines['4'], 35000);
  assert.equal(form.lines['8'], 0);
  assert.equal(form.lines['9'], 0);
  assert.equal(form.lines['7'], undefined);
  assert.equal(out.data.schedules.E.properties[0].lines['22'], 0);
  assert.equal(out.data.schedules.E.lines['26'], 0);
  assert.equal(out.data.summary.agi, 160000);
  assert.deepEqual(out.data.schedules.E.unallowedLossCarryforward, [{ id: '1', name: '1 Main St, Austin, TX 78701', unallowedLoss: 35000 }]);
});

test('passive income from one rental frees the same amount of another rental\'s loss at MAGI 160000: 6000 allowed of 30000, 24000 carried', () => {
  const out = compute('single', [w2(160000), rental('1', lossOf30000), rental('2', { rents: 9000, repairs: 3000 })]);
  const form = out.data.schedules['8582'];
  assert.equal(form.lines['1a'], 6000);
  assert.equal(form.lines['3'], -24000);
  assert.equal(form.lines['11'], 6000);
  const [loss, income] = out.data.schedules.E.properties;
  assert.equal(loss.lines['22'], -6000);
  assert.equal(income.lines['22'], undefined);
  assert.deepEqual(out.data.schedules.E.lines, { '23a': 21000, '23b': 0, '23c': 20000, '23d': 18000, '23e': 45000, 24: 6000, 25: -6000, 26: 0, 41: 0 });
  assert.equal(out.data.schedules.E.magiForPassiveLoss, 160000);
  assert.equal(loss.unallowedLossCarryforward, 24000);
});

test('the allowance is shared by loss ratio (Part VI) and a rental without active participation is carried (Part V and VII)', () => {
  const two = compute('single', [w2(120000), rental('1', { rents: 0, repairs: 20000 }), rental('2', { rents: 0, repairs: 10000 })]);
  assert.deepEqual(two.data.schedules['8582'].partVI.map((row) => [row.a, row.c, row.d]), [[20000, 10000, 10000], [10000, 5000, 5000]]);
  assert.deepEqual(two.data.schedules.E.properties.map((item) => [item.lines['22'], item.unallowedLossCarryforward]), [[-10000, 10000], [-5000, 5000]]);
  const mixed = compute('single', [w2(90000), rental('1', { rents: 0, repairs: 10000 }), rental('2', { rents: 0, repairs: 5000, activeParticipation: false })]);
  const form = mixed.data.schedules['8582'];
  assert.deepEqual([form.lines['1d'], form.lines['2d'], form.lines['3'], form.lines['4'], form.lines['8'], form.lines['9']], [-10000, -5000, -15000, 10000, 25000, 10000]);
  assert.deepEqual(form.partVII, [{ name: '2 Main St, Austin, TX 78701', a: 5000, b: 1, c: 5000 }]);
  assert.deepEqual(mixed.data.schedules.E.properties.map((item) => item.lines['22']), [-10000, 0]);
  const unanswered = compute('single', [w2(90000), rental('1', { rents: 0, repairs: 5000, activeParticipation: undefined })]);
  assert.ok(codes(unanswered).includes('ACTIVE_PARTICIPATION_UNANSWERED'));
  assert.equal(unanswered.data.schedules.E.properties[0].lines['22'], 0);
  assert.equal(compute('single', [w2(90000), rental('1', { rents: 0, repairs: 5000, activeParticipation: 'no' })]).data.schedules.E.properties[0].lines['22'], 0);
});

test('married filing separately: living apart all year gets 12500 at MAGI 40000 and 50% of (75000 - 60000) = 7500 at 60000; living together gets none', () => {
  const apart = compute('mfs', [w2(40000), rental('1', { rents: 0, repairs: 20000 })], { answers: { livedWithSpouse: false } });
  const form = apart.data.schedules['8582'];
  assert.deepEqual([form.lines['5'], form.lines['7'], form.lines['8'], form.lines['9']], [75000, 35000, 12500, 12500]);
  assert.equal(apart.data.schedules.E.properties[0].lines['22'], -12500);
  assert.equal(apart.data.schedules.E.properties[0].unallowedLossCarryforward, 7500);
  const higher = compute('mfs', [w2(60000), rental('1', { rents: 0, repairs: 20000 })], { answers: { livedWithSpouse: false } });
  assert.equal(higher.data.schedules['8582'].lines['8'], 7500);
  assert.equal(higher.data.schedules.E.properties[0].lines['22'], -7500);
  const small = compute('mfs', [w2(40000), rental('1', { rents: 0, repairs: 12000 })], { answers: { livedWithSpouse: false } });
  assert.equal(small.data.schedules['8582'], undefined);
  assert.equal(small.data.schedules.E.properties[0].lines['22'], -12000);
  for (const answers of [{ livedWithSpouse: true }, {}]) {
    const together = compute('mfs', [w2(40000), rental('1', { rents: 0, repairs: 8000 })], { answers });
    assert.equal(together.data.schedules['8582'].mfsLivedWithSpouse, true);
    assert.equal(together.data.schedules['8582'].lines['9'], undefined);
    assert.equal(together.data.schedules.E.properties[0].lines['22'], 0);
    assert.equal(together.data.schedules.E.properties[0].unallowedLossCarryforward, 8000);
  }
});

test('1099-MISC royalties become a royalty entry (not passive) and 1099-MISC rents match the rental property by payer', () => {
  const out = compute('single', [w2(50000), misc('Book House', { royalties: 3000 }), misc('Acme Property Mgmt', { rents: 18000, federalWithheld: 100 }), rental('1', { rentPayer: 'ACME property mgmt.', insurance: 1000 })]);
  const [house, book] = out.data.schedules.E.properties;
  assert.equal(house.lines['3'], 18000);
  assert.equal(house.lines['21'], 17000);
  assert.deepEqual(house.form1099Payers, ['Acme Property Mgmt']);
  assert.equal(book.propertyType, 6);
  assert.equal(book.lines['4'], 3000);
  assert.equal(book.source, '1099-MISC');
  assert.deepEqual(out.data.schedules.E.lines, { '23a': 18000, '23b': 3000, '23c': 0, '23d': 0, '23e': 1000, 24: 20000, 25: 0, 26: 20000, 41: 20000 });
  assert.equal(out.data.summary.agi, 70000);
  assert.equal(out.data.lines['25b'], 100);
  assert.deepEqual(out.data.unsupported, []);
  const loose = compute('single', [w2(50000), misc('Tenant LLC', { rents: 6000 })]);
  assert.equal(loose.data.schedules.E.properties[0].propertyType, 8);
  assert.equal(loose.data.schedules.E.lines['26'], 6000);
  assert.ok(codes(loose).includes('RENTAL_FROM_1099_ONLY'));
  const short = compute('single', [misc('Acme', { rents: 9000 }), rental('1', { rentPayer: 'Acme', rents: 5000 })]);
  assert.equal(short.data.schedules.E.properties[0].lines['3'], 9000);
  assert.ok(codes(short).includes('RENTS_BELOW_1099'));
  const royaltyLoss = compute('single', [w2(200000), rental('9', { propertyType: 6, royalties: 1000, legalProfessional: 4000 })]);
  assert.equal(royaltyLoss.data.schedules.E.lines['25'], -3000);
  assert.equal(royaltyLoss.data.schedules['8582'], undefined);
});

test('MACRS mid-month: residential placed in March 2025 is 2.879% (275000 x 2.879% = 7917), 3.636% in 2026, and 39-year January is 2.461%', () => {
  const table = macrs('2025');
  const base = { costBasis: 330000, landValue: 55000, placedInService: '2025-03-15', recoveryClass: 'residential', table };
  const first = macrsRealPropertyDepreciation({ ...base, taxYear: '2025' });
  assert.equal(first.ratePercent, 2.879);
  assert.equal(first.depreciableBasis, 275000);
  assert.equal(first.amount, 7917);
  assert.equal(first.form4562Line, '19i');
  const second = macrsRealPropertyDepreciation({ ...base, taxYear: '2026', table: macrs('2026') });
  assert.equal(second.ratePercent, 3.636);
  assert.equal(second.amount, 9999);
  assert.equal(second.form4562Line, '17');
  assert.equal(macrsRealPropertyDepreciation({ ...base, placedInService: '2016-01-10', taxYear: '2025' }).ratePercent, 3.637);
  assert.equal(macrsRealPropertyDepreciation({ ...base, placedInService: '2016-07-10', taxYear: '2025' }).ratePercent, 3.636);
  assert.equal(macrsRealPropertyDepreciation({ ...base, placedInService: '1997-07-10', taxYear: '2025' }).ratePercent, 0.152);
  assert.equal(macrsRealPropertyDepreciation({ ...base, placedInService: '1990-07-10', taxYear: '2025' }).fullyDepreciated, true);
  const commercial = macrsRealPropertyDepreciation({ costBasis: 390000, placedInService: '2025-01-02', recoveryClass: 'nonresidential', taxYear: '2025', table });
  assert.equal(commercial.ratePercent, 2.461);
  assert.equal(commercial.amount, 9598);
  assert.equal(commercial.form4562Line, '19j');
  assert.equal(macrsRealPropertyDepreciation({ ...base, placedInService: '2026-02-01', taxYear: '2025' }).error, 'PLACED_IN_SERVICE_AFTER_YEAR');
  assert.equal(macrsRealPropertyDepreciation({ ...base, landValue: 400000, taxYear: '2025' }).error, 'LAND_ABOVE_COST');
  for (const recoveryClass of ['residential', 'nonresidential']) for (let month = 0; month < 12; month += 1) assert.equal(table[recoveryClass].rows.reduce((sum, row) => sum + row.rates[month] * (row.toYear - row.fromYear + 1), 0), 100000);
});

test('depreciation figured from the cost lands on line 18 and Form 4562 in the year placed in service', () => {
  const property = { rents: 20000, costBasis: 330000, landValue: 55000, placedInService: '2025-03-15' };
  const out = compute('single', [w2(50000), rental('1', property)]);
  assert.equal(out.data.schedules.E.properties[0].lines['18'], 7917);
  assert.equal(out.data.schedules.E.lines['26'], 20000 - 7917);
  assert.deepEqual(out.data.schedules['4562'].map((item) => [item.required, item.lines]), [[true, { '19i': 7917, 22: 7917 }]]);
  assert.equal(out.data.schedules.E.depreciation[0].ratePercent, 2.879);
  const later = compute('single', [w2(50000), rental('1', property)], { taxYear: '2026' });
  assert.deepEqual(later.data.schedules['4562'].map((item) => [item.required, item.lines]), [[false, { 17: 9999, 22: 9999 }]]);
  const typed = compute('single', [w2(50000), rental('1', { ...property, depreciation: 5000 })]);
  assert.equal(typed.data.schedules.E.properties[0].lines['18'], 5000);
  assert.equal(typed.data.schedules['4562'], undefined);
  const other = compute('single', [w2(50000), rental('1', { ...property, propertyType: 8, otherDescription: 'Parking' })]);
  assert.ok(codes(other).includes('RENTAL_RECOVERY_CLASS_REQUIRED'));
  const commercial = compute('single', [w2(50000), rental('1', { rents: 20000, propertyType: 4, costBasis: 390000, placedInService: '2025-01-02' })]);
  assert.equal(commercial.data.schedules.E.properties[0].lines['18'], 9598);
});

test('personal use days split the expenses by 90 of 99 days; above the 14-day/10% limit Pub. 527 Worksheet 5-1 applies; a home rented under 15 days is left off', () => {
  const split = compute('single', [w2(50000), rental('1', { rents: 9000, insurance: 990, taxes: 1980, mortgageInterest: 3960, fairRentalDays: 90, personalUseDays: 9 })]);
  const lines = split.data.schedules.E.properties[0].lines;
  assert.deepEqual([lines['9'], lines['12'], lines['16'], lines['20'], lines['21']], [900, 3600, 1800, 6300, 2700]);
  assert.ok(codes(split).includes('RENTAL_PERSONAL_SHARE'));
  assert.deepEqual(split.data.unsupported, []);
  const home = compute('single', [w2(50000), rental('1', { rents: 9000, fairRentalDays: 100, personalUseDays: 30 })]);
  assert.deepEqual(home.data.unsupported, []);
  assert.equal(home.data.schedules.E.properties[0].usedAsHome, true);
  assert.equal(home.data.schedules.E.properties[0].lines['21'], 9000);
  const brief = compute('single', [w2(50000), rental('1', { rents: 3000, fairRentalDays: 10, personalUseDays: 20 })]);
  assert.equal(brief.data.schedules.E, undefined);
  assert.ok(codes(brief).includes('RENTAL_UNDER_15_DAYS'));
  assert.equal(brief.data.summary.agi, 50000);
});

test('rental net income is net investment income: 3.8% of the lesser of 30000 or (260000 - 200000) = 1140', () => {
  const out = compute('single', [w2(230000), rental('1', { rents: 40000, repairs: 10000 })]);
  assert.equal(out.data.schedules['8960']['4a'], 30000);
  assert.equal(out.data.schedules['8960']['8'], 30000);
  assert.equal(out.data.schedules['2']['12'], 1140);
  assert.equal(compute('single', [w2(260000)]).data.schedules['2']?.['12'] || 0, 0);
});

test('rental income is QBI only under the Rev. Proc. 2019-38 safe harbor: 20% of 10000 = 2000', () => {
  const forms = [w2(50000), rental('1', { rents: 15000, repairs: 5000 })];
  assert.equal(compute('single', forms).data.lines['13a'], 0);
  const harbor = compute('single', forms, { answers: { rentalQbiSafeHarbor: true } });
  assert.equal(harbor.data.lines['13a'], 2000);
  assert.equal(harbor.data.schedules['8995']['2'], 10000);
});

test('what stays out of scope is listed: K-1 income, real estate professionals, short stays, at-risk and a sale', () => {
  const out = compute('single', [w2(50000), rental('1', { rents: 5000, shortStays: true, notAtRisk: 'yes', soldInYear: true })], { answers: { scheduleK1Income: true, realEstateProfessional: true } });
  assert.deepEqual(out.data.unsupported.map((item) => item.form).sort(), ['4797', '6198', 'Real estate professional', 'Schedule K-1', 'Short-term rental'].sort());
  assert.ok(out.data.notCovered.some((item) => item.includes('Schedule K-1')));
});

test('the rental property kind is validated, listed with its fields and enabled in add_us_tax_form', () => {
  const plan = (fields, kind = 'rental property') => planUsTaxForm({}, { taxYear: '2025', kind, payer: '1 Main St', fields });
  const good = plan({ propertyType: '2', fairRentalDays: '300', activeParticipation: 'no', recoveryClass: '27.5', costBasis: 200000, landValue: 40000, placedInService: '2020-06-01' });
  assert.equal(good.ok, true);
  assert.equal(good.form.kind, 'Rental property');
  assert.deepEqual([good.form.fields.propertyType, good.form.fields.fairRentalDays, good.form.fields.activeParticipation, good.form.fields.recoveryClass], [2, 300, false, 'residential']);
  assert.equal(plan({}).ok, false);
  assert.ok(plan({ propertyType: 9 }).problems.some((item) => item.includes('1 to 8')));
  assert.ok(plan({ propertyType: 1, landValue: 50000, costBasis: 40000 }).problems.some((item) => item.includes('land value')));
  assert.ok(plan({ propertyType: 1, fairRentalDays: 300, personalUseDays: 100 }).problems.some((item) => item.includes('days in the year')));
  assert.ok(plan({ propertyType: 1, fairRentalDays: 12.5 }).problems.some((item) => item.includes('whole number')));
  assert.ok(plan({ propertyType: 8 }).problems.some((item) => item.includes('Describe')));
  assert.ok(usFormKinds().data.kinds.some((item) => item.kind === 'Rental property' && item.fields.some((row) => row.key === 'priorYearUnallowedLoss')));
  assert.ok(TOOL_ARG_SCHEMAS.add_us_tax_form.properties.kind.enum.includes('Rental property'));
});

test('a saved rental property shows the rental questions and Schedule E lines in the review', () => {
  const state = createState();
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'single', taxpayer: { ...adult, ssn: '400-12-3456' } }).ok, true);
  assert.equal(usInterview(state, { taxYear: '2025' }).data.questions.some((item) => item.id === 'rentalQbiSafeHarbor'), false);
  assert.equal(addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 120000 } }).ok, true);
  const added = addUsTaxForm(state, { taxYear: '2025', kind: 'Rental property', payer: '1 Main St', fields: { propertyType: 1, fairRentalDays: 365, activeParticipation: 'yes', ...lossOf30000 } });
  assert.equal(added.ok, true);
  assert.ok(usInterview(state, { taxYear: '2025' }).data.questions.some((item) => item.id === 'rentalQbiSafeHarbor'));
  const review = usReturnReview(state, { taxYear: '2025' }).data;
  assert.ok(review.schedules.includes('E') && review.schedules.includes('8582'));
  assert.deepEqual(review.lines.filter((row) => row.form === 'Schedule E').map((row) => [row.line, row.amount]), [['25', -15000], ['26', -15000], ['23a', 12000], ['23c', 20000], ['23d', 18000], ['23e', 42000]]);
  assert.equal(review.lines.find((row) => row.form === 'Schedule 1' && row.line === '5').amount, -15000);
  assert.equal(review.checks.find((item) => item.code === 'PASSIVE_LOSS_CARRYFORWARD').step, 'review');
});
