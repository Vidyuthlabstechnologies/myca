import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2015-05-05', months: 12 },
];

test('Maine resident single: U.S. bond interest on Schedule 1S and the tax table midpoint', async () => {
  const state = await household({ state: 'ME', forms: [w2(60000, { state: 'ME', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year' }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.form, '1040ME');
  assert.equal(me.lines['14'], 60900);
  assert.equal(me.schedules['1S']['1'], 200);
  assert.equal(me.lines['15b'], 200);
  assert.equal(me.lines['16'], 60700);
  assert.equal(me.lines['17'], 15000);
  assert.equal(me.lines['18'], 5150);
  assert.equal(me.lines['19'], 40550);
  assert.equal(me.lines['20'], 2482);
  assert.equal(me.lines['24'], 2482);
  assert.equal(me.refund, 18);
  assert.equal(me.provisional, false);
});

test('Maine joint renters with two children: dependent exemption credit, EITC and both fairness credits are refundable', async () => {
  const state = await household({ state: 'ME', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'ME', stateWithheld: 400 }), w2(8000, { state: 'ME', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year', answers: { rentPaid: 15000 } }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.lines['13'], 2);
  assert.equal(me.lines['13a'], 2);
  assert.equal(me.lines['17'], 30000);
  assert.equal(me.lines['18'], 10300);
  assert.equal(me.lines['19'], 0);
  assert.equal(me.lines['24'], 0);
  const detc = me.schedules['dependent-exemption-credit'];
  assert.equal(detc['2'], 305);
  assert.equal(detc['4'], 610);
  assert.equal(detc['11'], 915);
  const eitc = me.schedules['earned-income-credit'];
  assert.equal(eitc['1'], 5561);
  assert.equal(eitc['2'], 1390);
  assert.equal(me.schedules.A['9'], 2305);
  const ptfc = me.schedules.PTFC;
  assert.equal(ptfc['3'], 38000);
  assert.equal(ptfc['5e'], 2250);
  assert.equal(ptfc['8'], 4050);
  assert.equal(ptfc['10'], 1520);
  assert.equal(ptfc['16'], 730);
  assert.equal(ptfc['17'], 280);
  assert.equal(me.lines['25c'], 2305);
  assert.equal(me.lines['25d'], 730);
  assert.equal(me.lines['25e'], 280);
  assert.equal(me.refund, 500 + 2305 + 730 + 280);
});

test('Maine child care credit: 25% of the federal credit, refundable up to $500', async () => {
  const state = await household({ state: 'ME', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(70000, { state: 'ME', stateWithheld: 3000 }), w2(30000, { state: 'ME', stateWithheld: 1000, owner: 'spouse' }), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Pines Daycare', fields: { amountPaid: 6000, qualifyingPerson: 'Leo' } }] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year' }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.lines['19'], 59700);
  assert.equal(me.lines['20'], 3521);
  assert.equal(me.schedules['child-care-credit']['2'], 1200);
  assert.equal(me.schedules['child-care-credit']['4'], 300);
  assert.equal(me.schedules.A['2'], 300);
  assert.equal(me.schedules.A['1'], 915);
  assert.equal(me.lines['25c'], 1215);
  assert.equal(me.refund, 4000 + 1215 - 3521);
});

test('Maine part-year resident: Schedule NR credit for the non-Maine share of income', async () => {
  const state = await household({ state: 'ME', forms: [w2(30000, { state: 'NH' }), w2(40000, { state: 'ME', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NH', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'ME', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.form, '1040ME with Schedule NR');
  const nr = me.schedules.NR;
  assert.equal(nr['1a'], 71000);
  assert.equal(nr['1b'], 40504);
  assert.equal(nr['1c'], 30496);
  assert.equal(nr['7'], 0.4295);
  assert.equal(me.lines['19'], 50850);
  assert.equal(me.lines['20'], 3177);
  assert.equal(me.lines['21'], 1365);
  assert.equal(me.lines['24'], 1812);
  assert.equal(me.owed, 312);
});

test('Maine nonresident: tax on all income less the nonresident credit for non-Maine wages', async () => {
  const state = await household({ state: 'NH', forms: [w2(20000, { state: 'ME', stateWithheld: 700 }), w2(50000, { state: 'NH' })] });
  await residency(state, '2025', [{ state: 'NH', residency: 'full-year' }, { state: 'ME', residency: 'nonresident' }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.schedules.NR['1b'], 20000);
  assert.equal(me.schedules.NR['6'], 50000);
  assert.equal(me.schedules.NR['7'], 0.7143);
  assert.equal(me.lines['19'], 49850);
  assert.equal(me.lines['20'], 3110);
  assert.equal(me.lines['21'], 2221);
  assert.equal(me.lines['24'], 889);
  assert.equal(me.owed, 189);
  assert.equal(me.lines['25e'], 0);
});

test('Maine high income: the standard deduction phases out fully and the exemption by 0.5324', async () => {
  const state = await household({ state: 'ME', forms: [w2(400000, { state: 'ME', stateWithheld: 25000 })] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year' }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.schedules.phaseout.deductionRatio, 1);
  assert.equal(me.schedules.phaseout.exemptionRatio, 0.5324);
  assert.equal(me.lines['17'], 0);
  assert.equal(me.lines['18'], 2408);
  assert.equal(me.lines['19'], 397592);
  assert.equal(me.lines['20'], 27919);
  assert.equal(me.owed, 2919);
});

test('Maine retirees: pension deduction reduced by Social Security, extra standard deduction and the property tax fairness credit at 65', async () => {
  const state = await household({
    state: 'ME', filingStatus: 'mfj', dateOfBirth: '1955-03-01', spouse: { ...spouse, dateOfBirth: '1957-01-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000 } }, { kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: 'SSA-1099', owner: 'spouse', fields: { netBenefits: 18000 } }, { kind: '1099-INT', fields: { interest: 2000, treasuryInterest: 1000 } }],
  });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year', answers: { propertyTaxPaid: 3500 } }]);
  const me = await stateReturn(state, '2025', 'ME');
  const pension = me.schedules['pension-deduction'].taxpayer;
  assert.equal(pension.P1, 40000);
  assert.equal(pension.P3, 24000);
  assert.equal(pension.P4, 24216);
  assert.equal(pension.P10, 24216);
  assert.equal(me.schedules['1S']['3'], 23000);
  assert.equal(me.lines['15b'], 48216);
  assert.equal(me.lines['16'], 17784);
  assert.equal(me.lines['17'], 33200);
  assert.equal(me.lines['24'], 0);
  assert.equal(me.schedules.PTFC['3'], 85000);
  assert.equal(me.schedules.PTFC['8'], 4100);
  assert.equal(me.schedules.PTFC['16'], 100);
  assert.equal(me.refund, 100);
});

test('Maine credit for tax paid to New York is limited to the Maine tax on the New York share', async () => {
  const state = await household({ state: 'ME', forms: [w2(50000, { state: 'ME', stateWithheld: 2000 }), w2(30000, { state: 'NY', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year' }, { state: 'NY', residency: 'nonresident', answers: { salesUseTax: 0 } }]);
  const me = await stateReturn(state, '2025', 'ME');
  const row = me.schedules['other-state-credit'][0];
  assert.equal(row.state, 'NY');
  assert.equal(row.lines['2d'], 30000);
  assert.equal(row.lines['3'], 0.375);
  assert.equal(me.lines['20'], 3785);
  assert.equal(row.lines['4a'], 1419);
  assert.ok(row.lines['4b'] >= row.lines['4a']);
  assert.equal(me.schedules.A['14'], 1419);
  assert.equal(me.lines['23'], 1419);
  assert.equal(me.lines['24'], 2366);
});

test('Maine Schedule NRH: a resident spouse files single with only their own income', async () => {
  const state = await household({ state: 'ME', filingStatus: 'mfj', spouse, forms: [w2(60000, { state: 'ME', stateWithheld: 2500 }), w2(40000, { state: 'NH', owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year', answers: { nrhElectSingle: true, nrhFiler: 'taxpayer' } }]);
  const me = await stateReturn(state, '2025', 'ME');
  assert.equal(me.form, '1040ME with Schedule NRH');
  assert.equal(me.schedules.NRH.A['1j'], 100000);
  assert.equal(me.schedules.NRH.B['1j'], 60000);
  assert.equal(me.schedules.NRH.A['2'], 0.6);
  assert.equal(me.lines['13'], 1);
  assert.equal(me.lines['14'], 60000);
  assert.equal(me.lines['17'], 15000);
  assert.equal(me.lines['18'], 5150);
  assert.equal(me.lines['19'], 39850);
  assert.equal(me.lines['20'], 2435);
  assert.equal(me.lines['21'], 0);
  assert.equal(me.refund, 65);
});

test('Maine 2026: published rates and the 2% surcharge above $1,000,000, with provisional phaseouts', async () => {
  const state = await household({ taxYear: '2026', state: 'ME', forms: [w2(1200000, { state: 'ME', stateWithheld: 80000 })] });
  await residency(state, '2026', [{ state: 'ME', residency: 'full-year' }]);
  const me = await stateReturn(state, '2026', 'ME');
  assert.equal(me.schedules.phaseout.deductionBefore, 15700);
  assert.equal(me.schedules.phaseout.exemptionBefore, 5300);
  assert.equal(me.lines['19'], 1200000);
  assert.equal(me.schedules.phaseout.surcharge, 4000);
  assert.equal(me.lines['20'], 85280 + 4000);
  assert.equal(me.provisional, true);
});

test('Maine labels every line of a resident Form 1040ME', async () => {
  const state = await household({ state: 'ME', forms: [w2(60000, { state: 'ME', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'ME', residency: 'full-year' }]);
  const me = await stateReturn(state, '2025', 'ME');
  for (const key of Object.keys(me.lines)) assert.ok(typeof me.labels[key] === 'string' && me.labels[key].length > 0, key);
});

test('Maine asks the Schedule NRH questions only on a joint return, and the utilities amount only when rent included utilities', async () => {
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'ME' })).data.states[0].questions.map((item) => item.id);
  const single = await household({ state: 'ME', forms: [w2(60000, { state: 'ME' })] });
  const first = await ids(single);
  assert.equal(first.includes('nrhElectSingle'), false);
  assert.equal(first.includes('utilitiesInRent'), false);
  assert.ok(first.includes('rentIncludesUtilities'));
  await runTool(single, 'set_us_state_answers', { taxYear: '2025', state: 'ME', answers: { rentPaid: 9000, rentIncludesUtilities: true } });
  assert.ok((await ids(single)).includes('utilitiesInRent'));
  const couple = await household({ state: 'ME', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' }, forms: [w2(60000, { state: 'ME' })] });
  const married = await ids(couple);
  assert.ok(married.includes('nrhElectSingle'));
  assert.equal(married.includes('nrhFiler'), false);
});
