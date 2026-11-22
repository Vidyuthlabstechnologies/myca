import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { tableTax } from '../src/countries/united-states/states/nm.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2021-05-05', months: 12 },
];

const rule = {
  brackets: {
    single: [{ overCents: 0, rateBp: 150 }, { overCents: 550000, rateBp: 320 }, { overCents: 1650000, rateBp: 430 }, { overCents: 3350000, rateBp: 470 }, { overCents: 6650000, rateBp: 490 }, { overCents: 21000000, rateBp: 590 }],
  },
  table: { notOver: 100000, step: 100, firstRows: [{ over: 0, notOver: 60 }, { over: 60, notOver: 100 }] },
  aboveTable: { single: [{ over: 100000, base: 4356, rateBp: 490 }, { over: 210000, base: 9746, rateBp: 590 }] },
};

test('New Mexico tax table: midpoint of each $100 row matches the 2025 PIT-TRT rows', () => {
  assert.equal(tableTax(33900, rule, 'single'), 1182);
  assert.equal(tableTax(33950, rule, 'single'), 1187);
  assert.equal(tableTax(34250, rule, 'single'), 1201);
  assert.equal(tableTax(150000, rule, 'single'), 6806);
  assert.equal(tableTax(250000, rule, 'single'), 12106);
});

test('New Mexico resident single: federal standard deduction and the rate table', async () => {
  const state = await household({ state: 'NM', forms: [w2(50000, { state: 'NM', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'NM', residency: 'full-year' }]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.form, 'PIT-1');
  assert.equal(nm.lines['1e'], 'R');
  assert.equal(nm.lines['9'], 50000);
  assert.equal(nm.lines['12'], 15750);
  assert.equal(nm.lines['14'], 0);
  assert.equal(nm.lines['17'], 34250);
  assert.equal(nm.lines['18'], 1201);
  assert.equal(nm.lines['22'], 1201);
  assert.equal(nm.refund, 299);
});

test('New Mexico joint return with two children: dependent deduction, low and middle income exemption, working families credit, child income tax credit and rebate', async () => {
  const state = await household({
    state: 'NM', filingStatus: 'mfj', spouse, dependents: kids,
    forms: [w2(18000, { state: 'NM', stateWithheld: 200 }), w2(8000, { state: 'NM', owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'NM', residency: 'full-year' }]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.lines['5'], 4);
  assert.equal(nm.lines['12'], 31500);
  assert.equal(nm.lines['13'], 4000);
  assert.equal(nm.lines['14'], 10000);
  assert.equal(nm.lines['17'], 0);
  assert.equal(nm.lines['22'], 0);
  const rc = nm.schedules['PIT-RC'];
  assert.equal(rc['3'], 4);
  assert.equal(rc['12'], 26000);
  assert.equal(rc['14'], 160);
  assert.equal(rc['25'], 848);
  assert.equal(nm.lines['24'], 1008);
  assert.equal(nm.lines['25a'], 7152);
  assert.equal(nm.lines['25'], 1788);
  assert.equal(nm.refund, 2996);
});

test('New Mexico joint seniors: PIT-ADJ $8,000 exemption each, the low income rebate with extra exemptions and the property tax rebate capped at $250', async () => {
  const state = await household({
    state: 'NM', filingStatus: 'mfj', dateOfBirth: '1956-01-10', spouse: { ...spouse, dateOfBirth: '1955-06-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 9000, taxableAmount: 9000 } }, { kind: 'SSA-1099', fields: { netBenefits: 4000 } }],
  });
  await residency(state, '2025', [{ state: 'NM', residency: 'full-year', answers: { propertyTaxBilled: 900, rentPaid: 0 } }]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.lines['12'], 34700);
  assert.equal(nm.schedules['PIT-ADJ']['13'], 16000);
  assert.equal(nm.lines['15'], 16000);
  const rc = nm.schedules['PIT-RC'];
  assert.equal(rc['2e'], 2);
  assert.equal(rc['2f'], 2);
  assert.equal(rc['3'], 6);
  assert.equal(rc['12'], 13000);
  assert.equal(rc['14'], 551);
  assert.equal(rc['17a'], 900);
  assert.equal(rc['17b'], 120);
  assert.equal(rc['17c'], 250);
  assert.equal(nm.lines['24'], 801);
  assert.equal(nm.refund, 801);
});

test('New Mexico part-year resident: PIT-B ratio to six decimals times the full-year tax', async () => {
  const state = await household({ state: 'NM', forms: [w2(30000, { state: 'NM' }), w2(30000, { state: 'IA' })] });
  await residency(state, '2025', [
    { state: 'NM', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 } },
    { state: 'IA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', income: { wages: 30000 } },
  ]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.form, 'PIT-1 with PIT-B');
  assert.equal(nm.lines['1e'], 'P');
  assert.equal(nm.lines['17'], 44250);
  const b = nm.schedules['PIT-B'];
  assert.equal(b['column-1']['11'], 60000);
  assert.equal(b['column-2']['11'], 30000);
  assert.equal(b.lines['12'], 0.5);
  assert.equal(b.lines['13'], 1671);
  assert.equal(b.lines['14'], 836);
  assert.equal(nm.lines['18'], 836);
  assert.equal(nm.owed, 836);
});

test('New Mexico nonresident: PIT-B and no working families credit', async () => {
  const state = await household({ state: 'IA', forms: [w2(40000, { state: 'NM', stateWithheld: 1200 }), w2(20000, { state: 'IA' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year' }, { state: 'NM', residency: 'nonresident', income: { wages: 40000 } }]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.lines['1e'], 'N');
  assert.equal(nm.schedules['PIT-B'].lines['12'], 0.666667);
  assert.equal(nm.lines['18'], 1114);
  assert.equal(nm.lines['25'], 0);
  assert.equal(nm.refund, 86);
});

test('New Mexico high-income joint resident: the schedule above $100,000, U.S. interest on PIT-ADJ and the line 20 credit for Iowa tax', async () => {
  const state = await household({
    state: 'NM', filingStatus: 'mfj', spouse,
    forms: [w2(250000, { state: 'NM', stateWithheld: 10000 }), w2(150000, { state: 'IA', owner: 'spouse', stateWithheld: 5000 }), { kind: '1099-INT', fields: { interest: 3000, treasuryInterest: 1000 } }],
  });
  await residency(state, '2025', [{ state: 'NM', residency: 'full-year' }, { state: 'IA', residency: 'nonresident', income: { wages: 150000 } }]);
  const nm = await stateReturn(state, '2025', 'NM');
  assert.equal(nm.lines['9'], 404000);
  assert.equal(nm.schedules['PIT-ADJ']['9'], 1000);
  assert.equal(nm.lines['15'], 1000);
  assert.equal(nm.lines['17'], 371500);
  assert.equal(nm.lines['18'], 17956);
  const worksheet = nm.schedules['line-20-worksheet'][0];
  assert.equal(worksheet.state, 'IA');
  assert.equal(worksheet.lines['3-nm'], 0.0483);
  assert.equal(worksheet.lines['5-nm'], 7245);
  assert.equal(nm.lines['20'], worksheet.lines['6']);
  assert.equal(nm.lines['22'], 17956 - worksheet.lines['6']);
});

test('New Mexico 2026: 2025 table, exemptions and credits carried and marked provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'NM', forms: [w2(50000, { state: 'NM', stateWithheld: 1500 })] });
  await residency(state, '2026', [{ state: 'NM', residency: 'full-year' }]);
  const nm = await stateReturn(state, '2026', 'NM');
  assert.equal(nm.lines['12'], 16100);
  assert.equal(nm.lines['17'], 33900);
  assert.equal(nm.lines['18'], 1182);
  assert.equal(nm.refund, 318);
  assert.equal(nm.provisional, true);
});

const questionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'NM' })).data.states[0].questions.map((item) => item.id);

test('New Mexico labels every line of a resident return', async () => {
  const state = await household({ state: 'NM', forms: [w2(50000, { state: 'NM', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'NM', residency: 'full-year' }]);
  const nm = await stateReturn(state, '2025', 'NM');
  for (const key of Object.keys(nm.lines)) assert.ok(typeof nm.labels[key] === 'string' && nm.labels[key].length > 0, key);
});

test('New Mexico asks the rebate questions for persons 65 or older only of older filers', async () => {
  const young = await household({ state: 'NM', forms: [w2(50000, { state: 'NM', stateWithheld: 1500 })] });
  const asked = await questionIds(young);
  assert.ok(!asked.includes('rentPaid'));
  assert.ok(!asked.includes('spouseArmedForcesRetirement'));
  const older = await household({ state: 'NM', dateOfBirth: '1955-01-10', forms: [w2(10000, { state: 'NM', stateWithheld: 100 })] });
  assert.ok((await questionIds(older)).includes('rentPaid'));
});
