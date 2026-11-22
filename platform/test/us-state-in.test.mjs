import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2017-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-05-05', months: 12 }];
const spouse = (dateOfBirth = '1990-03-03') => ({ firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth });

test('Indiana resident single: IT-40 with renter\'s deduction, Schedule 2 U.S. interest, Marion County tax and county withholding', async () => {
  const state = await household({ state: 'IN', forms: [w2(52000, { state: 'IN', stateWithheld: 1500, localWithheld: 1000 }), { kind: '1099-INT', fields: { interest: 400, treasuryInterest: 250 } }] });
  await residency(state, '2025', [{ state: 'IN', residency: 'full-year', answers: { county: 'Marion', rentPaid: 9600, useTax: 12 } }]);
  const r = await stateReturn(state, '2025', 'IN');
  assert.equal(r.form, 'IT-40');
  assert.equal(r.lines['1'], 52650);
  assert.equal(r.lines['4'], 3250);
  assert.equal(r.lines['6'], 1000);
  assert.equal(r.lines['7'], 48400);
  assert.equal(r.lines['8'], 1452);
  assert.equal(r.lines['9'], 978);
  assert.equal(r.lines['11'], 2442);
  assert.equal(r.lines['12'], 2500);
  assert.equal(r.refund, 58);
  assert.equal(r.provisional, false);
});

test('Indiana joint return with two children: additional child exemptions, county tax and the 10 percent earned income credit', async () => {
  const state = await household({ state: 'IN', filingStatus: 'mfj', spouse: spouse(), dependents: kids, forms: [w2(28000, { state: 'IN', stateWithheld: 600 }), w2(6000, { state: 'IN', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'IN', residency: 'full-year', answers: { county: 'Marion', useTax: 0, rentPaid: 8000 } }]);
  const r = await stateReturn(state, '2025', 'IN');
  assert.equal(r.lines['1'], 34000);
  assert.equal(r.lines['4'], 3000);
  assert.equal(r.schedules['3']['7'], 7000);
  assert.equal(r.lines['7'], 24000);
  assert.equal(r.lines['8'], 720);
  assert.equal(r.lines['9'], 485);
  assert.equal(r.schedules['IN-EIC'].federalEic, 6403);
  assert.equal(r.schedules['5']['6'], 640);
  assert.equal(r.lines['12'], 1340);
  assert.equal(r.totalTax, 1205);
  assert.equal(r.refund, 135);
});

test('Indiana part-year resident: IT-40PNR prorates the exemption by Schedule A line 21D and taxes only Indiana income', async () => {
  const state = await household({ state: 'IN', forms: [w2(30000, { state: 'IL', stateWithheld: 900 }), w2(30000, { state: 'IN', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'IN', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { county: 'Marion', useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'IN');
  assert.equal(r.form, 'IT-40PNR');
  assert.equal(r.schedules.A['21D'], 0.5);
  assert.equal(r.lines['1'], 30000);
  assert.equal(r.lines['6'], 500);
  assert.equal(r.lines['7'], 29500);
  assert.equal(r.lines['8'], 885);
  assert.equal(r.lines['9'], 0);
  assert.equal(r.refund, 115);
});

test('Indiana nonresident working in Marion County: county tax on CT-40PNR Section 2 at the work county rate', async () => {
  const state = await household({ state: 'IL', forms: [w2(40000, { state: 'IN', stateWithheld: 1500 }), w2(20000, { state: 'IL' })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year' }, { state: 'IN', residency: 'nonresident', answers: { county: 'Not in Indiana', workCounty: 'Marion', useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'IN');
  assert.equal(r.form, 'IT-40PNR');
  assert.equal(r.schedules.A['21D'], 0.667);
  assert.equal(r.lines['6'], 667);
  assert.equal(r.lines['7'], 39333);
  assert.equal(r.lines['8'], 1180);
  assert.equal(r.schedules['CT-40PNR']['S2-8'], 795);
  assert.equal(r.totalTax, 1975);
  assert.equal(r.owed, 475);
});

test('Indiana high income and retirees: flat rate and county tax on large income, Social Security deducted and age 65 exemptions', async () => {
  const high = await household({ state: 'IN', forms: [w2(300000, { state: 'IN', stateWithheld: 12000 }), { kind: '1098', fields: { mortgageInterest: 18000, propertyTax: 6000 } }], answers: { charityCash: 5000 } });
  await residency(high, '2025', [{ state: 'IN', residency: 'full-year', answers: { county: 'Marion', useTax: 0 } }]);
  const h = await stateReturn(high, '2025', 'IN');
  assert.equal(h.lines['7'], 299000);
  assert.equal(h.lines['8'], 8970);
  assert.equal(h.lines['9'], 6040);
  assert.equal(h.owed, 3010);
  const retirees = await household({ state: 'IN', filingStatus: 'mfj', dateOfBirth: '1958-01-15', spouse: spouse('1959-06-01'), forms: [{ kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, federalWithheld: 4000 } }, { kind: '1099-INT', fields: { interest: 2000 } }] });
  await residency(retirees, '2025', [{ state: 'IN', residency: 'full-year', answers: { county: 'Marion', useTax: 0 } }]);
  const r = await stateReturn(retirees, '2025', 'IN');
  assert.equal(r.lines['1'], 59050);
  assert.equal(r.schedules['2']['5'], 17050);
  assert.equal(r.schedules['3']['7'], 4000);
  assert.equal(r.lines['7'], 38000);
  assert.equal(r.lines['8'], 1140);
  assert.equal(r.lines['9'], 768);
});

test('Indiana 2026: 2.95 percent rate under HEA 1001-2023, provisional until the 2026 forms are published', async () => {
  const state = await household({ taxYear: '2026', state: 'IN', forms: [w2(52000, { state: 'IN', stateWithheld: 1800 })] });
  await residency(state, '2026', [{ state: 'IN', residency: 'full-year', answers: { county: 'Marion', useTax: 0 } }]);
  const r = await stateReturn(state, '2026', 'IN');
  assert.equal(r.lines['7'], 51000);
  assert.equal(r.lines['8'], 1505);
  assert.equal(r.lines['9'], 1030);
  assert.equal(r.owed, 735);
  assert.equal(r.provisional, true);
});

test('Indiana resident with no county answer is blocked with an error check', async () => {
  const state = await household({ state: 'IN', forms: [w2(30000, { state: 'IN', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'IN', residency: 'full-year', answers: { useTax: 0 } }]);
  const r = await stateReturn(state, '2025', 'IN');
  assert.ok(r.checks.some((item) => item.level === 'error' && item.code === 'IN_COUNTY_REQUIRED'));
});

test('Indiana: every line of a resident return has a label in the words of Form IT-40', async () => {
  const state = await household({ state: 'IN', forms: [w2(50000, { state: 'IN', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'IN', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'IN');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Indiana asks for income taxed by another state only after that state\'s tax is given', async () => {
  const state = await household({ state: 'IN', forms: [w2(50000, { state: 'IN' })] });
  assert.equal((await questionIds(state, 'IN')).includes('otherStateIncome'), false);
  const saved = await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'IN', answers: { otherStateTax: 400 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.ok((await questionIds(state, 'IN')).includes('otherStateIncome'));
});
