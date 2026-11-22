import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { orTax } from '../src/countries/united-states/states/or.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1985-09-09' };

test('Oregon tax matches the printed 2025 tax table rows and the 2025 and 2026 rate charts', () => {
  const r2025 = stateRuleReader('OR', '2025').read('income-tax');
  const r2026 = stateRuleReader('OR', '2026').read('income-tax');
  assert.equal(orTax(30, r2025, 'single'), 2);
  assert.equal(orTax(75, r2025, 'mfj'), 4);
  assert.equal(orTax(150, r2025, 'single'), 7);
  assert.equal(orTax(4950, r2025, 'single'), 246);
  assert.equal(orTax(4950, r2025, 'mfj'), 235);
  assert.equal(orTax(11950, r2025, 'single'), 735);
  assert.equal(orTax(11950, r2025, 'hoh'), 631);
  assert.equal(orTax(29950, r2025, 'mfs'), 2310);
  assert.equal(orTax(29950, r2025, 'qss'), 2001);
  assert.equal(orTax(44850, r2025, 'single'), 3614);
  assert.equal(orTax(49999, r2025, 'mfj'), 3751);
  assert.equal(orTax(75500, r2025, 'mfj'), 5987);
  assert.equal(orTax(50000, r2025, 'single'), 4065);
  assert.equal(orTax(125000, r2025, 'single'), 10627);
  assert.equal(orTax(250000, r2025, 'mfj'), 21256);
  assert.equal(orTax(68000, r2026, 'mfj'), 5312);
  assert.equal(orTax(125000, r2026, 'single'), 10618);
  assert.equal(orTax(250000, r2026, 'mfj'), 21237);
});

test('Oregon 2025 resident single: federal tax subtraction, U.S. interest, exemption credit and the kicker', async () => {
  const state = await household({ state: 'OR', forms: [w2(50000, { state: 'OR', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 0, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'OR', residency: 'full-year', answers: { filedPriorYearReturn: true, priorYearOregonTax: 3000 } }]);
  const or = await stateReturn(state, '2025', 'OR');
  assert.equal(or.form, 'OR-40');
  assert.equal(or.lines['7'], 50200);
  assert.equal(or.lines['10'], 3899);
  assert.equal(or.lines['13'], 200);
  assert.equal(or.lines['15'], 46101);
  assert.equal(or.lines['17'], 2835);
  assert.equal(or.lines['19'], 43266);
  assert.equal(or.lines['20'], 3474);
  assert.equal(or.lines['25'], 256);
  assert.equal(or.lines['31'], 3218);
  assert.equal(or.lines['32'], 296);
  assert.equal(or.owed, 422);
  assert.equal(or.provisional, false);
});

test('Oregon 2025 joint return with young children: exemption and political credits, 12% EITC and the Kids Credit phase-down', async () => {
  const state = await household({
    state: 'OR', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9871', relationship: 'daughter', dateOfBirth: '2023-03-01', months: 12 }, { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9872', relationship: 'son', dateOfBirth: '2018-01-10', months: 12 }],
    forms: [w2(30000, { state: 'OR', stateWithheld: 300 })],
  });
  await residency(state, '2025', [{ state: 'OR', residency: 'full-year', answers: { politicalContributions: 100, filedPriorYearReturn: false } }]);
  const or = await stateReturn(state, '2025', 'OR');
  assert.equal(or.lines['6e'], 4);
  assert.equal(or.lines['10'], 0);
  assert.equal(or.lines['19'], 24330);
  assert.equal(or.lines['20'], 1511);
  assert.equal(or.lines['25'], 1024);
  assert.equal(or.lines['26'], 100);
  assert.equal(or.lines['31'], 387);
  assert.equal(or.lines['37'], 858);
  assert.equal(or.schedules['Kids Credit worksheet']['7'], 0.69);
  assert.equal(or.lines['38'], 325);
  assert.equal(or.refund, 300 + 858 + 325 - 387);
});

test('Oregon 2025 part-year resident: OR-40-P figures tax on all income and multiplies it by the Oregon percentage', async () => {
  const state = await household({ state: 'OR', forms: [w2(30000, { state: 'OR', stateWithheld: 800 }), w2(30000, { state: 'WA' })] });
  await residency(state, '2025', [{ state: 'WA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'OR', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 }, answers: { filedPriorYearReturn: false } }]);
  const or = await stateReturn(state, '2025', 'OR');
  assert.equal(or.form, 'OR-40-P');
  assert.equal(or.lines['34F'], 60000);
  assert.equal(or.lines['34S'], 30000);
  assert.equal(or.lines['35'], 0.5);
  assert.equal(or.lines['36'], 60000);
  assert.equal(or.lines['40'], 5075);
  assert.equal(or.lines['42'], 7910);
  assert.equal(or.lines['43'], 52090);
  assert.equal(or.lines['44'], 4248);
  assert.equal(or.lines['45'], 2124);
  assert.equal(or.lines['50'], 128);
  assert.equal(or.lines['55'], 1996);
  assert.equal(or.owed, 1196);
});

test('Oregon 2025 nonresident: OR-40-N taxes Oregon income after deductions multiplied by the Oregon percentage', async () => {
  const state = await household({ state: 'WA', forms: [w2(20000, { state: 'WA' }), w2(40000, { state: 'OR', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'WA', residency: 'full-year' }, { state: 'OR', residency: 'nonresident', answers: { filedPriorYearReturn: false } }]);
  const or = await stateReturn(state, '2025', 'OR');
  assert.equal(or.form, 'OR-40-N');
  assert.equal(or.lines['35'], 0.667);
  assert.equal(or.lines['36'], 40000);
  assert.equal(or.lines['42'], 5276);
  assert.equal(or.lines['45'], 34724);
  assert.equal(or.lines['46'], 2730);
  assert.equal(or.lines['51'], 171);
  assert.equal(or.lines['56'], 2559);
  assert.equal(or.owed, 1059);
});

test('Oregon 2025 high income: no federal tax subtraction or exemption credit, top bracket, and credit for tax paid to South Carolina', async () => {
  const state = await household({ state: 'OR', forms: [w2(250000, { state: 'OR', stateWithheld: 15000 }), w2(50000, { state: 'SC' })] });
  await residency(state, '2025', [{ state: 'OR', residency: 'full-year', answers: { filedPriorYearReturn: false } }, { state: 'SC', residency: 'nonresident', answers: { useTax: 0 } }]);
  const or = await stateReturn(state, '2025', 'OR');
  const sc = await stateReturn(state, '2025', 'SC');
  assert.equal(or.lines['10'], 0);
  assert.equal(or.lines['19'], 297165);
  assert.equal(or.lines['20'], 27671);
  assert.equal(or.lines['25'], 0);
  assert.equal(sc.totalTax, 2205);
  assert.equal(or.schedules['Credit 802 SC'].limit, 4612);
  assert.equal(or.lines['27'], 2205);
  assert.equal(or.lines['31'], 25466);
  assert.equal(or.owed, 10466);
});

test('Oregon 2026 uses the estimated indexed figures and is provisional until the 2026 instructions are published', async () => {
  const state = await household({ taxYear: '2026', state: 'OR', forms: [w2(50000, { state: 'OR', stateWithheld: 3000 })] });
  await residency(state, '2026', [{ state: 'OR', residency: 'full-year' }]);
  const or = await stateReturn(state, '2026', 'OR');
  assert.equal(or.lines['10'], 3823);
  assert.equal(or.lines['17'], 2900);
  assert.equal(or.lines['19'], 43277);
  assert.equal(or.lines['20'], 3465);
  assert.equal(or.lines['25'], 260);
  assert.equal(or.lines['32'], 0);
  assert.equal(or.provisional, true);
  assert.ok(!or.checks.some((item) => item.code === 'OR_KICKER'));
});

test('Oregon flags the Portland Metro and Multnomah County taxes and blocks filing until out-of-state bond interest is answered', async () => {
  const state = await household({ state: 'OR', forms: [w2(40000, { state: 'OR' }), { kind: '1099-INT', fields: { interest: 100, taxExemptInterest: 800 } }] });
  const or = await stateReturn(state, '2025', 'OR');
  assert.ok(or.checks.some((item) => item.code === 'OR_MUNICIPAL_INTEREST' && item.level === 'error'));
  assert.ok(or.checks.some((item) => item.code === 'OR_LOCAL_INCOME_TAXES'));
  await residency(state, '2025', [{ state: 'OR', residency: 'full-year', answers: { oregonMunicipalInterest: 300, filedPriorYearReturn: false } }]);
  const after = await stateReturn(state, '2025', 'OR');
  assert.equal(after.lines['8'], 300);
  assert.equal(after.lines['9'], after.lines['7'] + 300);
  assert.ok(!after.checks.some((item) => item.level === 'error'));
});
