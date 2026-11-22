import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED, FORM_KINDS } from '../src/us-1040.mjs';
import { setUsTaxpayer, addUsTaxForm, answerUsInterview, usInterview, usReturnReview, usFormKinds } from '../src/us-return.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';

const w2 = (wages, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: owner === 'spouse' ? 'Beta LLC' : 'Acme Inc', fields: { wages, federalWithheld: 0, socialSecurityWages: wages, medicareWages: wages, socialSecurityTax: Math.round(wages * 0.062), medicareTax: Math.round(wages * 0.0145) } });
const item = (category, cost, extra = {}) => ({ kind: '5695-ITEM', owner: 'taxpayer', payer: 'Bright Homes', fields: { category, cost, ...extra } });
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1980-04-02' };
const partner = { firstName: 'Luis', lastName: 'Diaz', dateOfBirth: '1979-06-10' };
const home = { energyMainHome: true, energyOriginalUser: true, energyNewConstruction: false };
const run = (filingStatus, forms, answers = home, taxYear = '2025', more = {}) => {
  const out = computeForm1040({ filingStatus, taxpayer: adult, spouse: ['mfj', 'mfs'].includes(filingStatus) ? partner : undefined, forms, answers, ...more }, taxYear);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
};
const codes = (data) => data.checks.map((row) => row.code);

test('the rules: 30% with the 25C caps for 2025, both credits ended after 2025, only the 25D carryforward remains', () => {
  const home2025 = rules.rule('us.federal.individual.energy-home-improvement', '2025-12-31').value;
  assert.deepEqual([home2025.creditBasisPoints, home2025.annualCapCents, home2025.doorEachCapCents, home2025.doorsCapCents, home2025.windowsCapCents, home2025.propertyItemCapCents, home2025.auditCapCents, home2025.heatPumpCapCents].map((value, index) => (index ? value / 100 : value)), [3000, 1200, 250, 500, 600, 600, 150, 2000]);
  assert.equal(rules.rule('us.federal.individual.energy-home-improvement', '2026-12-31').value.allowed, false);
  const clean2025 = rules.rule('us.federal.individual.residential-clean-energy', '2025-12-31').value;
  assert.deepEqual([clean2025.creditBasisPoints, clean2025.fuelCellPerKilowattCents / 100, clean2025.batteryMinimumKilowattHours], [3000, 1000, 3]);
  const clean2026 = rules.rule('us.federal.individual.residential-clean-energy', '2026-12-31').value;
  assert.equal(clean2026.newExpenditures, false);
  assert.equal(clean2026.carryforwardAllowed, true);
  assert.ok(US_FORMS_SUPPORTED.includes('5695') && FORM_KINDS.includes('5695-ITEM'));
  assert.ok(TOOL_ARG_SCHEMAS.add_us_tax_form.properties.kind.enum.includes('5695-ITEM'));
});

test('2025 Part II caps: insulation 600, doors 250 + 420 capped at 500, windows 600, air conditioner 600, audit 150, all within 1,200; heat pump 2,400 capped at 2,000; total 3,200 on Schedule 3 line 5b', () => {
  const forms = [w2(120000), item('insulation', 2000), item('door', 1000, { qmid: 'D1AB' }), item('door', 700, { qmid: 'D2AB' }), item('door', 400, { qmid: 'D3AB' }), item('door', 300, { qmid: 'D4AB' }), item('window', 3000, { qmid: 'W1AB' }), item('central-ac', 2500, { qmid: 'AC12' }), item('audit', 600), item('heat-pump', 8000, { qmid: 'HP12' })];
  const data = run('single', forms);
  const f = data.schedules[5695];
  assert.equal(f['18b'], 600);
  assert.equal(f['19a'], 1000);
  assert.equal(f['19b'], 'D1AB');
  assert.equal(f['19c'], 250);
  assert.equal(f['19d'], 700 + 400);
  assert.deepEqual(f['19dQmids'], ['D2AB', 'D3AB']);
  assert.equal(f['19e'], 300);
  assert.equal(f['19g'], Math.round(0.3 * 1400));
  assert.equal(f['19h'], 500);
  assert.equal(f['20d'], 600);
  assert.equal(f['22d'], 600);
  assert.equal(f['26c'], 150);
  assert.equal(f[27], 600 + 500 + 600 + 600 + 150);
  assert.equal(f[28], 1200);
  assert.equal(f['29h'], 2000);
  assert.equal(f[30], 3200);
  assert.equal(f[32], 3200);
  assert.equal(data.schedules[3]['5b'], 3200);
  assert.equal(data.schedules[3]['5a'], 0);
  assert.equal(data.schedules[3][8], 3200);
});

test('a door 30% under 250 stays under it, and the doors\' total stops at 500', () => {
  const data = run('single', [w2(120000), item('door', 600, { qmid: 'D1AB' }), item('door', 500, { qmid: 'D2AB' })]);
  assert.equal(data.schedules[5695]['19c'], 180);
  assert.equal(data.schedules[5695]['19g'], 150);
  assert.equal(data.schedules[5695]['19h'], 330);
});

test('an item of specified property without a valid QMID is left out; insulation and audits need none', () => {
  const data = run('single', [w2(120000), item('window', 1000, { qmid: 'W1AB' }), item('window', 1000), item('insulation', 500), item('audit', 100)]);
  assert.equal(data.schedules[5695]['20c'], 1000);
  assert.equal(data.schedules[5695]['20d'], 300);
  assert.equal(data.schedules[5695]['18b'], 150);
  assert.equal(data.schedules[5695]['26c'], 30);
  assert.equal(data.checks.filter((row) => row.code === 'ENERGY_QMID_MISSING').length, 1);
});

test('water heaters, furnaces and panelboards cap at 600 each; a panelboard counts only with an enabled item, coded on line 25b', () => {
  const data = run('single', [w2(120000), item('water-heater', 1200, { qmid: 'WH01' }), item('water-heater', 1000, { qmid: 'WH02' }), item('water-heater', 900, { qmid: 'WH03' }), item('furnace', 3000, { qmid: 'FU01' }), item('panelboard', 1500, { qmid: 'PB01' }), item('heat-pump-water-heater', 2000, { qmid: 'HW01' })]);
  const f = data.schedules[5695];
  assert.equal(f['23a'], 2200);
  assert.deepEqual(f['23aQmids'], ['WH01', 'WH02']);
  assert.equal(f['23b'], 900);
  assert.equal(f['23d'], 600);
  assert.equal(f['24d'], 600);
  assert.deepEqual(f['25b'], ['C', 'D', 'F']);
  assert.equal(f['25e'], 450);
  assert.equal(f[27], 600 + 600 + 450);
  assert.equal(f[28], 1200);
  assert.equal(f['29h'], 600);
  assert.equal(f[32], 1800);
  const alone = run('single', [w2(120000), item('panelboard', 1500, { qmid: 'PB01' })]);
  assert.equal(alone.schedules[5695]['25e'], 0);
  assert.ok(codes(alone).includes('ENERGY_PANELBOARD_WITHOUT_ENABLED'));
});

test('not the main home: insulation, doors, windows and audits are left out but a heat pump still counts; new construction leaves out section A only', () => {
  const forms = [w2(120000), item('window', 1000, { qmid: 'W1AB' }), item('audit', 200), item('heat-pump', 1000, { qmid: 'HP12' })];
  const away = run('single', forms, { ...home, energyMainHome: false });
  assert.equal(away.schedules[5695]['20d'], 0);
  assert.equal(away.schedules[5695]['26c'], 0);
  assert.equal(away.schedules[5695]['29h'], 300);
  assert.ok(codes(away).includes('ENERGY_SECTION_A_NOT_ALLOWED') && codes(away).includes('ENERGY_AUDIT_NOT_ALLOWED'));
  const built = run('single', forms, { ...home, energyNewConstruction: true });
  assert.equal(built.schedules[5695]['20d'], 0);
  assert.equal(built.schedules[5695]['26c'], 60);
  assert.equal(built.schedules[5695]['29h'], 300);
  const secondHand = run('single', forms, { ...home, energyOriginalUser: false });
  assert.equal(secondHand.schedules[5695][32], 60);
  const unanswered = run('single', forms, {});
  assert.equal(unanswered.schedules[5695][32], 300 + 60 + 300);
  assert.ok(codes(unanswered).includes('ENERGY_HOME_UNANSWERED'));
});

test('2025 Part I, single, wages 60,000 (tax 5,075): solar 9,000 + battery 3,000 + fuel cell 1,000 + carryforward 500 = 13,500; 5,075 allowed, 8,425 carried to 2026', () => {
  const forms = [w2(60000), item('solar-electric', 30000), item('battery', 10000, { capacity: 13.5 }), item('battery', 1000, { capacity: 2 }), item('fuel-cell', 5000, { capacity: 1.2 })];
  const data = run('single', forms, { ...home, energyCarryforward: 500 });
  const f = data.schedules[5695];
  assert.equal(f[1], 30000);
  assert.equal(f['5a'], true, 'the 13.5 kWh battery on line 5b qualifies');
  assert.equal(f['5b'], 10000);
  assert.equal(f['6a'], 40000);
  assert.equal(f['6b'], 12000);
  assert.equal(f[8], 5000);
  assert.equal(f[9], 1500);
  assert.equal(f.kilowatts, 1);
  assert.equal(f[10], 1000);
  assert.equal(f[11], 1000);
  assert.equal(f[12], 500);
  assert.equal(f[13], 13500);
  const taxOnTableMidpoint44275 = 1192.5 + 0.12 * (44275 - 11925);
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint44275));
  assert.equal(f[14], 5075);
  assert.equal(f[15], 5075);
  assert.equal(f[16], 13500 - 5075);
  assert.equal(data.schedules[3]['5a'], 5075);
  assert.equal(data.lines[22], 0);
  assert.ok(codes(data).includes('ENERGY_BATTERY_TOO_SMALL') && codes(data).includes('ENERGY_CLEAN_ENERGY_CARRYFORWARD'));
});

test('credit order on a 1,475 tax: saver\'s credit 200, then home improvement 600, then clean energy takes the 675 left and carries 2,325', () => {
  const forms = [{ ...w2(30000), fields: { ...w2(30000).fields, box12: [{ code: 'D', amount: 2000 }] } }, item('window', 3000, { qmid: 'W1AB' }), item('solar-electric', 10000)];
  const data = run('single', forms);
  assert.equal(data.lines[18], 1475);
  assert.equal(data.schedules[3][4], 200);
  assert.equal(data.schedules[5695][31], 1475 - 200);
  assert.equal(data.schedules[3]['5b'], 600);
  assert.equal(data.schedules[5695][14], 1475 - 200 - 600);
  assert.equal(data.schedules[3]['5a'], 675);
  assert.equal(data.schedules[5695][16], 3000 - 675);
  assert.equal(data.lines[20], 1475);
  assert.equal(data.lines[22], 0);
});

test('with qualifying children Credit Limit Worksheet B lets clean energy use the tax before the refundable part of the child tax credit', () => {
  const kids = [{ firstName: 'Mia', lastName: 'Diaz', relationship: 'daughter', dateOfBirth: '2015-03-01', months: 12 }, { firstName: 'Leo', lastName: 'Diaz', relationship: 'son', dateOfBirth: '2017-05-01', months: 12 }];
  const data = run('mfj', [w2(70000), item('solar-electric', 20000)], home, '2025', { dependents: kids });
  const taxOnTableMidpoint38525 = 0.1 * 23850 + 0.12 * (38525 - 23850);
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint38525));
  const ctc = 2 * 2200;
  const refundableCap = 2 * 1700;
  const worksheetB14 = ctc - Math.min(refundableCap, Math.round(0.15 * (70000 - 2500)));
  assert.equal(data.schedules[5695].creditLimitWorksheetB14, worksheetB14);
  assert.equal(data.schedules[5695][14], 4146 - worksheetB14);
  assert.equal(data.schedules[3]['5a'], 3146);
  assert.equal(data.schedules[8812][13], 4146 - 3146);
  assert.equal(data.lines[19], 1000);
  assert.equal(data.lines[28], 3400);
  assert.equal(data.lines[22], 0);
  assert.equal(data.schedules[5695][16], 6000 - 3146);
});

test('without children the child tax credit is not involved and the other-dependent credit comes first', () => {
  const parent = [{ firstName: 'Rosa', lastName: 'Diaz', relationship: 'parent', dateOfBirth: '1950-03-01', months: 12 }];
  const data = run('single', [w2(30000), item('solar-electric', 10000)], home, '2025', { dependents: parent });
  assert.equal(data.schedules[5695].creditLimitWorksheetB14, undefined);
  assert.equal(data.lines[19], 500);
  assert.equal(data.schedules[5695][14], data.lines[18] - 500);
});

test('2026: only the 2025 carryforward is claimed (8,425, tax 5,023, 3,402 to 2027); new 2026 items get a warning and no credit', () => {
  const forms = [w2(60000), item('solar-electric', 20000), item('heat-pump', 9000, { qmid: 'HP12' })];
  const data = run('single', forms, { ...home, energyCarryforward: 8425 }, '2026');
  const f = data.schedules[5695];
  const taxOnTableMidpoint43925 = 0.1 * 12400 + 0.12 * (43925 - 12400);
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint43925));
  assert.deepEqual([f[1], f[2], f[3], f[4]], [8425, 5023, 5023, 8425 - 5023]);
  assert.equal(f[6], undefined);
  assert.equal(data.schedules[3]['5a'], 5023);
  assert.equal(data.schedules[3]['5b'], undefined);
  assert.ok(codes(data).includes('ENERGY_CLEAN_ENERGY_ENDED') && codes(data).includes('ENERGY_HOME_IMPROVEMENT_ENDED'));
  const none = run('single', [w2(60000), item('solar-electric', 20000)], {}, '2026');
  assert.equal(none.schedules[3]?.['5a'] || 0, 0);
  assert.ok(codes(none).includes('ENERGY_CLEAN_ENERGY_ENDED'));
});

test('an item installed in 2026 on the 2025 return is left out; married filing separately takes the credits as usual', () => {
  const data = run('mfs', [w2(80000), item('solar-electric', 10000, { placedInService: '2026-01-05' }), item('heat-pump', 5000, { qmid: 'HP12', placedInService: '2025-11-01' })]);
  assert.equal(data.schedules[5695][1], undefined);
  assert.equal(data.schedules[3]['5a'], 0);
  assert.equal(data.schedules[5695]['29h'], 1500);
  assert.equal(data.schedules[3]['5b'], 1500);
  assert.ok(codes(data).includes('ENERGY_ITEM_OTHER_YEAR'));
});

test('the return flow adds energy items, validates the type and QMID, asks the home questions and shows Schedule 3 line 5b', () => {
  const state = createState();
  assert.ok(usFormKinds().data.kinds.some((kind) => kind.kind === '5695-ITEM' && kind.fields.some((field) => field.key === 'qmid')));
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'single', taxpayer: { ...adult, ssn: '400-12-3456' } }).ok, true);
  assert.equal(addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 90000 } }).ok, true);
  assert.match(addUsTaxForm(state, { taxYear: '2025', kind: '5695-item', payer: 'Bright Homes', fields: { category: 'hot tub', cost: 500 } }).problems.join(' '), /type of item is one of/);
  assert.match(addUsTaxForm(state, { taxYear: '2025', kind: '5695-item', payer: 'Bright Homes', fields: { category: 'heat pump', cost: 500, qmid: 'AB' } }).problems.join(' '), /four letters or digits/);
  assert.match(addUsTaxForm(state, { taxYear: '2025', kind: '5695-item', payer: 'Bright Homes', fields: { category: 'battery', cost: 500, capacity: 'lots' } }).problems.join(' '), /number of zero or more/);
  const before = usInterview(state, { taxYear: '2025' }).data.questions.map((row) => row.id);
  assert.ok(before.includes('energyCarryforward') && !before.includes('energyMainHome'));
  const added = addUsTaxForm(state, { taxYear: '2025', kind: '5695-item', payer: 'Bright Homes', fields: { category: 'Heat Pump', cost: 5000, qmid: 'hp12' } });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.data.amounts.category, 'heat-pump');
  assert.equal(added.data.amounts.qmid, 'HP12');
  const after = usInterview(state, { taxYear: '2025' }).data.questions.map((row) => row.id);
  assert.ok(after.includes('energyMainHome') && after.includes('energyOriginalUser') && after.includes('energyNewConstruction'));
  for (const id of ['energyMainHome', 'energyOriginalUser']) assert.equal(answerUsInterview(state, { taxYear: '2025', id, answer: 'yes' }).ok, true);
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'energyNewConstruction', answer: 'no' }).ok, true);
  const review = usReturnReview(state, { taxYear: '2025' }).data;
  assert.ok(review.schedules.includes('5695'));
  const line = review.lines.find((row) => row.form === 'Schedule 3' && row.line === '5b');
  assert.equal(line.label, 'Energy efficient home improvement credit (Form 5695)');
  assert.equal(line.amount, 1500);
  assert.equal(review.lines.find((row) => row.form === 'Form 5695' && row.line === '32').amount, 1500);
  assert.ok(!review.checks.some((row) => row.code.startsWith('ENERGY_')));
  assert.ok(!review.checks.some((row) => row.code === 'NO_INCOME_DOCUMENTS'));
});
