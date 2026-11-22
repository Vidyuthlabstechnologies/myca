import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { chartTax, missouriPercent } from '../src/countries/united-states/states/mo.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';

const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2017-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-05-05', months: 12 }];
const spouse = (dateOfBirth = '1990-03-03') => ({ firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth });

test('Missouri tax chart and percentages follow the worked examples in the 2025 instructions', () => {
  const chart = stateRuleReader('MO', '2025').read('income-tax').chart;
  assert.equal(chartTax(12000, chart), 388);
  assert.equal(chartTax(3090, chart), 38);
  assert.equal(chartTax(1313, chart), 0);
  assert.equal(missouriPercent(905, 1000), 91);
  assert.equal(missouriPercent(904, 1000), 90);
  assert.equal(missouriPercent(4, 1000), 0.4);
  assert.equal(missouriPercent(1200, 1000), 100);
});

test('Missouri resident single: MO-1040 with U.S. interest subtracted, federal tax deduction at 15 percent and the tax chart', async () => {
  const state = await household({ state: 'MO', forms: [w2(52000, { state: 'MO', stateWithheld: 1800 }), { kind: '1099-INT', fields: { interest: 400, treasuryInterest: 250 } }] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }]);
  const r = await stateReturn(state, '2025', 'MO');
  assert.equal(r.form, 'MO-1040');
  assert.equal(r.lines['1Y'], 52650);
  assert.equal(r.schedules['MO-A'].part1['8Y'], 250);
  assert.equal(r.lines['6'], 52400);
  assert.equal(r.lines['11'], 4193);
  assert.equal(r.lines['12'], 15);
  assert.equal(r.lines['13'], 629);
  assert.equal(r.lines['14'], 15750);
  assert.equal(r.lines['26'], 36021);
  assert.equal(r.lines['30Y'], 1517);
  assert.equal(r.totalTax, 1517);
  assert.equal(r.refund, 283);
});

test('Missouri combined return with two children: separate tax for each spouse and the Working Family Tax Credit capped at tax', async () => {
  const state = await household({ state: 'MO', filingStatus: 'mfj', spouse: spouse(), dependents: kids, forms: [w2(28000, { state: 'MO', stateWithheld: 600 }), w2(6000, { state: 'MO', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }]);
  const r = await stateReturn(state, '2025', 'MO');
  assert.equal(r.lines['5Y'], 28000);
  assert.equal(r.lines['5S'], 6000);
  assert.equal(r.lines['7Y'], 82);
  assert.equal(r.lines['7S'], 18);
  assert.equal(r.lines['14'], 31500);
  assert.equal(r.lines['26'], 2500);
  assert.equal(r.lines['27Y'], 2050);
  assert.equal(r.lines['27S'], 450);
  assert.equal(r.lines['30Y'], 15);
  assert.equal(r.lines['30S'], 0);
  assert.equal(r.schedules['MO-WFTC']['6'], 1281);
  assert.equal(r.lines['44'], 15);
  assert.equal(r.totalTax, 0);
  assert.equal(r.refund, 700);
});

test('Missouri part-year resident: Form MO-NRI percentage of the full-year tax', async () => {
  const state = await household({ state: 'MO', forms: [w2(30000, { state: 'IL', stateWithheld: 900 }), w2(30000, { state: 'MO', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'MO', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const r = await stateReturn(state, '2025', 'MO');
  assert.equal(r.lines['6'], 60000);
  assert.equal(r.lines['13'], 761);
  assert.equal(r.lines['26'], 43489);
  assert.equal(r.lines['30Y'], 1868);
  assert.equal(r.schedules['MO-NRI'].Y['1'], 30000);
  assert.equal(r.lines['32Y'], 50);
  assert.equal(r.lines['33Y'], 934);
  assert.equal(r.refund, 66);
});

test('Missouri nonresident from Illinois: Missouri income percentage rounded to a whole percent', async () => {
  const state = await household({ state: 'IL', forms: [w2(40000, { state: 'MO', stateWithheld: 1500 }), w2(20000, { state: 'IL' })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year' }, { state: 'MO', residency: 'nonresident' }]);
  const r = await stateReturn(state, '2025', 'MO');
  assert.equal(r.lines['32Y'], 67);
  assert.equal(r.lines['33Y'], 1252);
  assert.equal(r.stateIncome, 40000);
  assert.equal(r.refund, 248);
});

test('Missouri high income itemizer: no federal tax deduction above $125,000 and MO-A Part 2 itemized deductions', async () => {
  const state = await household({ state: 'MO', forms: [w2(300000, { state: 'MO', stateWithheld: 12000 }), { kind: '1098', fields: { mortgageInterest: 18000, propertyTax: 6000 } }], answers: { charityCash: 5000 } });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }]);
  const r = await stateReturn(state, '2025', 'MO');
  const part2 = r.schedules['MO-A'].part2;
  assert.equal(r.lines['12'], 0);
  assert.equal(r.lines['13'], 0);
  assert.equal(part2['1'], 41000);
  assert.equal(part2['2'], 10918);
  assert.equal(part2['6'], 5250);
  assert.equal(part2['11'], 12000);
  assert.equal(part2['12'], 45168);
  assert.equal(r.lines['14'], 45168);
  assert.equal(r.lines['26'], 254832);
  assert.equal(r.lines['30Y'], 11801);
  assert.equal(r.refund, 199);
});

test('Missouri retirees: Social Security exempt at 62, private pension exemption phased out above $32,000', async () => {
  const state = await household({ state: 'MO', filingStatus: 'mfj', dateOfBirth: '1958-01-15', spouse: spouse('1959-06-01'), forms: [{ kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, federalWithheld: 4000 } }, { kind: '1099-INT', fields: { interest: 2000 } }] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }]);
  const r = await stateReturn(state, '2025', 'MO');
  const part3 = r.schedules['MO-A'].part3;
  assert.equal(part3.C4, 17050);
  assert.equal(part3.B8, 6000);
  assert.equal(part3.B5, 10000);
  assert.equal(part3.B9, 0);
  assert.equal(r.lines['8'], 17050);
  assert.equal(r.lines['14'], 34700);
  assert.equal(r.lines['26'], 7114);
  assert.equal(r.lines['30Y'], 166);
  assert.ok(r.checks.some((item) => item.code === 'MO_PENSION_TYPE_ASSUMED'));
  assert.ok(r.checks.some((item) => item.code === 'MO_PROPERTY_TAX_CREDIT'));
  const publicPension = await household({ state: 'MO', filingStatus: 'mfj', dateOfBirth: '1958-01-15', spouse: spouse('1959-06-01'), forms: [{ kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, federalWithheld: 4000 } }, { kind: '1099-INT', fields: { interest: 2000 } }] });
  await residency(publicPension, '2025', [{ state: 'MO', residency: 'full-year', answers: { publicPension: 40000 } }]);
  const p = await stateReturn(publicPension, '2025', 'MO');
  assert.equal(p.schedules['MO-A'].part3.A5, 40000 - 17050);
  assert.equal(p.lines['8'], 40000);
});

test('Missouri resident credit for tax paid to another state (MO-CR)', async () => {
  const state = await household({ state: 'MO', forms: [w2(40000, { state: 'MO', stateWithheld: 1200 }), w2(20000, { state: 'KS', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year', answers: { otherStateTax: 800, otherStateIncome: 20000 } }]);
  const r = await stateReturn(state, '2025', 'MO');
  const cr = r.schedules['MO-CR'][0];
  assert.equal(cr['8'], 33);
  assert.equal(cr['9'], Math.round((r.lines['30Y'] * 33) / 100));
  assert.equal(r.lines['31Y'], Math.min(cr['9'], 800));
  assert.equal(r.totalTax, r.lines['30Y'] - r.lines['31Y']);
});

test('Missouri 2026: brackets indexed to $1,348 from the 2026 withholding formula and the 2026 federal standard deduction, provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'MO', forms: [w2(52000, { state: 'MO', stateWithheld: 1800 })] });
  await residency(state, '2026', [{ state: 'MO', residency: 'full-year' }]);
  const r = await stateReturn(state, '2026', 'MO');
  assert.equal(r.lines['14'], 16100);
  assert.equal(r.lines['13'], 609);
  assert.equal(r.lines['26'], 35291);
  assert.equal(r.lines['30Y'], 1478);
  assert.equal(r.refund, 322);
  assert.equal(r.provisional, true);
});

test('Missouri labels every line of a resident Form MO-1040, in both columns of a combined return', async () => {
  const couple = await household({ state: 'MO', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(50000, { state: 'MO', stateWithheld: 1500 }), w2(40000, { state: 'MO', owner: 'spouse' })] });
  await residency(couple, '2025', [{ state: 'MO', residency: 'full-year' }]);
  const mo = await stateReturn(couple, '2025', 'MO');
  assert.ok('5S' in mo.lines);
  for (const key of Object.keys(mo.lines)) assert.ok(typeof mo.labels[key] === 'string' && mo.labels[key].length > 0, key);
});

test('Missouri asks the spouse questions only on a joint return and the other state income only after the other state tax', async () => {
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'MO' })).data.states[0].questions.map((item) => item.id);
  const single = await household({ state: 'MO', forms: [w2(60000, { state: 'MO' })] });
  const first = await ids(single);
  assert.equal(first.includes('spouseOtherIncome'), false);
  assert.equal(first.includes('otherStateIncome'), false);
  assert.equal(first.includes('publicPension'), false);
  await runTool(single, 'set_us_state_answers', { taxYear: '2025', state: 'MO', answers: { otherStateTax: 400 } });
  assert.ok((await ids(single)).includes('otherStateIncome'));
  const couple = await household({ state: 'MO', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(60000, { state: 'MO' })] });
  assert.ok((await ids(couple)).includes('spouseOtherIncome'));
});
