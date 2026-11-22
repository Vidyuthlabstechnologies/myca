import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { STATE } from '../src/countries/united-states/states/mi.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-01-01' };
const child = (firstName, dateOfBirth, ssn) => ({ firstName, lastName: 'Diaz', ssn, relationship: 'son', dateOfBirth, months: 12 });
const home = { schoolDistrictCode: '33020', useTax: 0 };

test('Michigan resident, single: $5,800 exemption and 4.25% of taxable income', async () => {
  const state = await household({ state: 'MI', forms: [w2(60000, { state: 'MI', stateWithheld: 2400 })] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: home }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.status, 'computed');
  assert.equal(mi.form, 'MI-1040');
  assert.equal(mi.lines['9a'], 5800);
  assert.equal(mi.lines['9f'], 5800);
  assert.equal(mi.lines['14'], 60000);
  assert.equal(mi.lines['15'], 5800);
  assert.equal(mi.lines['16'], 54200);
  assert.equal(mi.lines['17'], 2304);
  assert.equal(mi.lines['25'], 2304);
  assert.equal(mi.lines['37'], 96);
  assert.equal(mi.refund, 96);
  assert.equal(mi.provisional, false);
  assert.deepEqual(mi.checks, []);
});

test('Michigan joint renters with two children: EITC at 30% and the homestead credit on 23% of rent', async () => {
  const state = await household({ state: 'MI', filingStatus: 'mfj', spouse, dependents: [child('Leo', '2016-05-01', '400-12-0001'), child('Mia', '2018-05-01', '400-12-0002')], forms: [w2(30000, { state: 'MI', stateWithheld: 400 }), w2(18000, { state: 'MI', stateWithheld: 200, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: { ...home, rentPaid: 9600 } }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.lines['9a'], 23200);
  assert.equal(mi.lines['16'], 24800);
  assert.equal(mi.lines['17'], 1054);
  assert.equal(mi.lines['28a'], 3455);
  assert.equal(mi.lines['28b'], 1037);
  const cr = mi.schedules['MI-1040CR'];
  assert.equal(cr['11'], 9600);
  assert.equal(cr['12'], 2208);
  assert.equal(cr['33'], 48000);
  assert.equal(cr['34'], 1536);
  assert.equal(cr['35'], 672);
  assert.equal(cr['41'], 403);
  assert.equal(cr['43'], 100);
  assert.equal(cr['44'], 403);
  assert.equal(mi.lines['26'], 403);
  assert.equal(mi.lines['34'], 403 + 1037 + 600);
  assert.equal(mi.refund, 986);
});

test('Michigan part-year resident: Schedule NR subtracts the non-Michigan income and prorates the exemption', async () => {
  const state = await household({ state: 'MI', forms: [w2(30000, { state: 'IL', stateWithheld: 1400 }), w2(40000, { state: 'MI', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'MI', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: home }]);
  const mi = await stateReturn(state, '2025', 'MI');
  const nr = mi.schedules.NR;
  assert.equal(nr['5A'], 70000);
  assert.equal(nr['5B'], 40000);
  assert.equal(nr['5C'], 30000);
  assert.equal(nr['14C'], 30000);
  assert.equal(nr['18'], 0.5714);
  assert.equal(nr['19'], 3314);
  assert.equal(mi.schedules['1']['13'], 30000);
  assert.equal(mi.lines['14'], 40000);
  assert.equal(mi.lines['15'], 3314);
  assert.equal(mi.lines['16'], 36686);
  assert.equal(mi.lines['17'], 1559);
  assert.equal(mi.owed, 59);
});

test('Michigan nonresident: only Michigan wages are taxed, with 37.5% of the exemption', async () => {
  const state = await household({ state: 'TX', forms: [w2(50000, { state: 'TX' }), w2(30000, { state: 'MI', stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'full-year' }, { state: 'MI', residency: 'nonresident', answers: { useTax: 0 } }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.schedules.NR['14B'], 30000);
  assert.equal(mi.schedules.NR['18'], 0.375);
  assert.equal(mi.lines['13'], 50000);
  assert.equal(mi.lines['14'], 30000);
  assert.equal(mi.lines['15'], 2175);
  assert.equal(mi.lines['16'], 27825);
  assert.equal(mi.lines['17'], 1183);
  assert.equal(mi.owed, 183);
  assert.equal(mi.stateIncome, 30000);
});

test('Michigan retirees born 1958 and 1960: Section D at 75% of the limit beats the Tier 3 standard deduction', async () => {
  const state = await household({ state: 'MI', filingStatus: 'mfj', dateOfBirth: '1958-03-01', spouse: { ...spouse, dateOfBirth: '1960-06-01' }, forms: [{ kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 50000, taxableAmount: 50000, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 30000 } }, w2(20000, { state: 'MI', stateWithheld: 500, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: home }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.lines['10'], 95500);
  assert.equal(mi.schedules['1']['14'], 25500);
  assert.deepEqual(mi.schedules['4884'].lines, { 1: 131794, 2: 0, 3: 131794, 4: 98846, 5: 50000, 6: 50000 });
  assert.deepEqual(mi.schedules['4884'].alternatives, [{ section: 'Tier 3', amount: 2900 }]);
  assert.equal(mi.schedules['1']['27'], 50000);
  assert.equal(mi.lines['14'], 20000);
  assert.equal(mi.lines['16'], 8400);
  assert.equal(mi.lines['17'], 357);
  assert.equal(mi.refund, 143);
});

test('Michigan senior homeowner: homestead credit at the senior percentage of the excess property tax', async () => {
  const state = await household({ state: 'MI', dateOfBirth: '1950-03-01', forms: [{ kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 30000, taxableAmount: 30000, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 20000 } }] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: { ...home, homesteadPropertyTaxes: 3000, homesteadTaxableValue: 90000 } }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.schedules['1']['27'], 30000);
  assert.equal(mi.schedules['1']['14'], 9600);
  assert.equal(mi.lines['16'], 0);
  const cr = mi.schedules['MI-1040CR'];
  assert.equal(cr['10'], 3000);
  assert.equal(cr['18'], 30000);
  assert.equal(cr['21'], 20000);
  assert.equal(cr['33'], 50000);
  assert.equal(cr['34'], 1600);
  assert.equal(cr['35'], 1400);
  assert.equal(cr['37'], 60);
  assert.equal(cr['38'], 840);
  assert.equal(cr['44'], 840);
  assert.equal(mi.refund, 840);
});

test('Michigan high income: other states\' bond interest added, U.S. interest subtracted, use tax added', async () => {
  const state = await household({ state: 'MI', forms: [w2(300000, { state: 'MI', stateWithheld: 12000 }), { kind: '1099-INT', payer: 'Bank', fields: { interest: 2000, treasuryInterest: 1500, taxExemptInterest: 4000 } }] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: { ...home, useTax: 25, michiganObligationInterest: 1000 } }]);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.lines['10'], 303500);
  assert.equal(mi.schedules['1']['1'], 3000);
  assert.equal(mi.schedules['1']['10'], 1500);
  assert.equal(mi.lines['14'], 305000);
  assert.equal(mi.lines['16'], 299200);
  assert.equal(mi.lines['17'], 12716);
  assert.equal(mi.lines['24'], 25);
  assert.equal(mi.lines['25'], 12741);
  assert.equal(mi.owed, 741);
});

test('Michigan resident with Illinois business income: credit limited to the Michigan tax on that income', async () => {
  const state = await household({ state: 'MI', forms: [w2(50000, { state: 'MI', stateWithheld: 1800 }), { kind: '1099-NEC', payer: 'Client', fields: { nonemployeeCompensation: 40000 } }] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: home }, { state: 'IL', residency: 'nonresident', income: { businessIncome: 40000 } }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.totalTax, 1915);
  const mi = await stateReturn(state, '2025', 'MI');
  assert.equal(mi.lines['10'], 87174);
  assert.equal(mi.schedules['1']['2'], 2826);
  assert.equal(mi.lines['14'], 90000);
  assert.equal(mi.lines['17'], 3579);
  assert.equal(mi.lines['18a'], 1915);
  assert.equal(mi.lines['18b'], 1591);
  assert.equal(mi.lines['21'], 1988);
  assert.equal(mi.owed, 188);
  assert.ok(mi.checks.some((item) => item.code === 'MI_OUTSIDE_TAX_CREDIT'));
});

test('Michigan 2026: 4.25% rate and the $5,900 exemption from the Treasury notice', async () => {
  const state = await household({ taxYear: '2026', state: 'MI', forms: [w2(60000, { state: 'MI', stateWithheld: 2400 })] });
  await residency(state, '2026', [{ state: 'MI', residency: 'full-year', answers: home }]);
  const mi = await stateReturn(state, '2026', 'MI');
  assert.equal(mi.lines['9a'], 5900);
  assert.equal(mi.lines['16'], 54100);
  assert.equal(mi.lines['17'], 2299);
  assert.equal(mi.refund, 101);
  assert.equal(mi.provisional, false);
});

test('Michigan 2026 retirement figures are provisional until Treasury publishes them', async () => {
  const state = await household({ taxYear: '2026', state: 'MI', dateOfBirth: '1960-06-01', forms: [{ kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 40000, taxableAmount: 40000, distributionCode: '7' } }] });
  await residency(state, '2026', [{ state: 'MI', residency: 'full-year', answers: home }]);
  const mi = await stateReturn(state, '2026', 'MI');
  assert.equal(mi.schedules['4884'].section, 'D');
  assert.equal(mi.schedules['1']['27'], 40000);
  assert.equal(mi.provisional, true);
});

test('Michigan asks for the school district code and lists city income taxes as not covered', () => {
  assert.equal(STATE.built, true);
  assert.ok(STATE.questions.some((item) => item.id === 'schoolDistrictCode'));
  assert.ok(STATE.questions.some((item) => item.id === 'rentPaid'));
  assert.ok(STATE.notCovered.some((item) => /City income taxes/.test(item)));
});

test('Michigan labels every line of a resident Form MI-1040', async () => {
  const state = await household({ state: 'MI', forms: [w2(60000, { state: 'MI', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: { schoolDistrictCode: '82010' } }]);
  const mi = await stateReturn(state, '2025', 'MI');
  for (const key of Object.keys(mi.lines)) assert.ok(typeof mi.labels[key] === 'string' && mi.labels[key].length > 0, key);
});

test('Michigan asks the homestead credit questions only of full-year residents and the taxable value only after property taxes', async () => {
  const ids = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'MI' })).data.states[0].questions.map((item) => item.id);
  const state = await household({ state: 'MI', forms: [w2(60000, { state: 'MI' })] });
  const first = await ids(state);
  assert.ok(first.includes('homesteadPropertyTaxes'));
  assert.equal(first.includes('homesteadTaxableValue'), false);
  assert.equal(first.includes('michiganTipsAndOvertime'), false);
  assert.equal(first.includes('nonqualifyingRetirement'), false);
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'MI', answers: { homesteadPropertyTaxes: 3200 } });
  assert.ok((await ids(state)).includes('homesteadTaxableValue'));
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year' }, { state: 'MI', residency: 'nonresident' }]);
  const nonresident = await ids(state);
  assert.equal(nonresident.includes('homesteadPropertyTaxes'), false);
  assert.ok(nonresident.includes('michiganTipsAndOvertime'));
});
