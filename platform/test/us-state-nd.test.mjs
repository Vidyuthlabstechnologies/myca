import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const SPOUSE = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const KID = { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-02-02', months: 12 };

test('North Dakota resident single: U.S. interest, 40% capital gain and dividend exclusions, Tax Table on the row midpoint', async () => {
  const state = await household({ state: 'ND', forms: [w2(60000, { state: 'ND', stateWithheld: 500 }), { kind: '1099-INT', fields: { interest: 400, treasuryInterest: 100 } }, { kind: '1099-DIV', fields: { ordinaryDividends: 1000, qualifiedDividends: 800, capitalGainDistributions: 500 } }] });
  await residency(state, '2025', [{ state: 'ND', residency: 'full-year' }]);
  const nd = await stateReturn(state, '2025', 'ND');
  assert.equal(nd.form, 'ND-1');
  assert.equal(nd.lines['1a'], 62000);
  assert.equal(nd.lines['1b'], 46250);
  assert.equal(nd.lines['5'], 100);
  assert.equal(nd.lines['6'], 200);
  assert.equal(nd.lines['13'], 320);
  assert.equal(nd.lines['17'], 620);
  assert.equal(nd.lines['18'], 45630);
  assert.equal(nd.lines['20'], 0);
  assert.equal(nd.refund, 500);
  assert.equal(nd.provisional, false);
});

test('North Dakota joint: the marriage penalty credit worksheet gives the $312 maximum when both spouses earn over $47,550', async () => {
  const state = await household({ state: 'ND', filingStatus: 'mfj', spouse: SPOUSE, dependents: [KID], forms: [w2(110000, { state: 'ND', stateWithheld: 1500 }), w2(90000, { state: 'ND', stateWithheld: 1000, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'ND', residency: 'full-year' }]);
  const nd = await stateReturn(state, '2025', 'ND');
  assert.equal(nd.lines['18'], 168500);
  assert.equal(nd.lines['20'], 1707);
  const worksheet = nd.schedules['Marriage Penalty Credit Worksheet'];
  assert.equal(worksheet['3a'], 110000);
  assert.equal(worksheet['3b'], 90000);
  assert.equal(worksheet['6'], 74250);
  assert.equal(worksheet['7'], 502.61);
  assert.equal(worksheet['9'], 892.61);
  assert.equal(worksheet['10'], 1706.74);
  assert.equal(worksheet['12'], 311.51);
  assert.equal(nd.lines['22'], 312);
  assert.equal(nd.lines['25'], 1395);
  assert.equal(nd.refund, 1105);
});

test('North Dakota part-year resident: Schedule ND-1NR ratio of 1 when all income is North Dakota income', async () => {
  const state = await household({ state: 'MT', forms: [w2(70000, { state: 'ND', stateWithheld: 400 })] });
  await residency(state, '2025', [{ state: 'ND', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }]);
  const nd = await stateReturn(state, '2025', 'ND');
  assert.equal(nd.form, 'ND-1 with Schedule ND-1NR');
  assert.equal(nd.schedules['ND-1NR'].lines['20'], 1);
  assert.equal(nd.schedules['ND-1NR'].lines['22'], 113);
  assert.equal(nd.lines['20'], 113);
  assert.equal(nd.refund, 287);
});

test('North Dakota nonresident: rate schedule tax on all income times the 0.4000 ND-1NR ratio', async () => {
  const state = await household({ state: 'SD', forms: [w2(150000, { state: 'ND', stateWages: 60000, stateWithheld: 1000 })] });
  await residency(state, '2025', [{ state: 'ND', residency: 'nonresident' }]);
  const nd = await stateReturn(state, '2025', 'ND');
  const nr = nd.schedules['ND-1NR'].lines;
  assert.equal(nr['18'], 60000);
  assert.equal(nr['19'], 150000);
  assert.equal(nr['20'], 0.4);
  assert.equal(nr['22'], 1673);
  assert.equal(nd.lines['20'], 669);
  assert.equal(nd.refund, 331);
});

test('North Dakota 2026 high income: indexed 2026 brackets in the 2.5% band, and the record is provisional for the tax table', async () => {
  const state = await household({ taxYear: '2026', state: 'ND', forms: [w2(320000, { state: 'ND', stateWithheld: 6000 })] });
  await residency(state, '2026', [{ state: 'ND', residency: 'full-year' }]);
  const nd = await stateReturn(state, '2026', 'ND');
  assert.equal(nd.lines['19'], 303900);
  assert.equal(nd.lines['20'], 5254);
  assert.equal(nd.refund, 746);
  assert.equal(nd.provisional, true);
});

test('North Dakota resident with Wisconsin wages: Schedule ND-1CR limits the credit to the income ratio of the North Dakota tax', async () => {
  const state = await household({ state: 'ND', forms: [w2(50000, { state: 'ND', stateWithheld: 300 }), w2(30000, { state: 'WI', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'ND', residency: 'full-year' }, { state: 'WI', residency: 'nonresident' }]);
  const nd = await stateReturn(state, '2025', 'ND');
  const cr = nd.schedules['ND-1CR'][0];
  assert.equal(cr.state, 'WI');
  assert.equal(cr.lines['3'], 0.375);
  assert.equal(cr.lines['5'], 116);
  assert.equal(nd.lines['20'], 308);
  assert.equal(nd.lines['21'], 116);
  assert.equal(nd.lines['25'], 192);
});
