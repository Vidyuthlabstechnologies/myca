import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2015-05-05', months: 12 },
];

test('Vermont resident single: U.S. interest subtracted on IN-112 and the tax table midpoint', async () => {
  const state = await household({ state: 'VT', forms: [w2(60000, { state: 'VT', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.form, 'IN-111');
  assert.equal(vt.schedules['IN-112'].I['7'], 200);
  assert.equal(vt.lines['2'], -200);
  assert.equal(vt.lines['3'], 60700);
  assert.equal(vt.lines['6'], 12950);
  assert.equal(vt.lines['7'], 47750);
  assert.equal(vt.lines['8'], 1600);
  assert.equal(vt.lines['23'], 1600);
  assert.equal(vt.refund, 400);
  assert.ok(vt.notes.some((note) => note.includes('RCC-146')));
});

test('Vermont joint with two children: child tax credit for the child under 7, 38% EITC and the charitable credit', async () => {
  const state = await household({ state: 'VT', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'VT', stateWithheld: 400 }), w2(8000, { state: 'VT', stateWithheld: 100, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year', answers: { charitableContributions: 1000 } }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.lines['5d'], 4);
  assert.equal(vt.lines['5e'], 21200);
  assert.equal(vt.lines['7'], 1500);
  assert.equal(vt.lines['8'], 52);
  assert.equal(vt.lines['12'], 50);
  assert.equal(vt.lines['14'], 2);
  const part2 = vt.schedules['IN-112'].II;
  assert.equal(part2['3'], 1);
  assert.equal(part2['4'], 1000);
  assert.equal(part2['6'], 5561);
  assert.equal(part2['7'], 2113);
  assert.equal(part2['13'], 3113);
  assert.equal(vt.lines['26c'], 3113);
  assert.equal(vt.refund, 500 + 3113 - 2);
});

test('Vermont child care credit at 72%, child tax credit reduced above $125,000 and the VHEIP credit', async () => {
  const state = await household({ state: 'VT', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(100000, { state: 'VT', stateWithheld: 3000 }), w2(35000, { state: 'VT', stateWithheld: 1000, owner: 'spouse' }), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Pines Daycare', fields: { amountPaid: 6000, qualifyingPerson: 'Leo' } }] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year', answers: { vheipContributions: 3000 } }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.lines['7'], 98500);
  assert.equal(vt.lines['8'], 3820);
  assert.equal(vt.lines['18'], 300);
  assert.equal(vt.lines['20'], 3520);
  const part2 = vt.schedules['IN-112'].II;
  assert.equal(part2['1'], 1200);
  assert.equal(part2['2'], 864);
  assert.equal(part2['4'], 800);
  assert.equal(vt.lines['26c'], 1664);
  assert.equal(vt.refund, 4000 + 1664 - 3520);
});

test('Vermont part-year resident: Schedule IN-113 income adjustment percentage', async () => {
  const state = await household({ state: 'VT', forms: [w2(30000, { state: 'NH' }), w2(40000, { state: 'VT', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NH', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'VT', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.form, 'IN-111 with Schedule IN-113');
  const in113 = vt.schedules['IN-113'].lines;
  assert.equal(in113['27'], 71000);
  assert.equal(in113['28'], 40504);
  assert.equal(in113['29'], 30496);
  assert.equal(in113['35'], 0.570479);
  assert.equal(vt.lines['8'], 2226);
  assert.equal(vt.lines['16'], 1270);
  assert.equal(vt.refund, 230);
});

test('Vermont nonresident: tax on all income times the Vermont share', async () => {
  const state = await household({ state: 'NH', forms: [w2(20000, { state: 'VT', stateWithheld: 700 }), w2(50000, { state: 'NH' })] });
  await residency(state, '2025', [{ state: 'NH', residency: 'full-year' }, { state: 'VT', residency: 'nonresident' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.schedules['IN-113'].lines['34'], 20000);
  assert.equal(vt.lines['15'], 0.285714);
  assert.equal(vt.lines['8'], 2160);
  assert.equal(vt.lines['16'], 617);
  assert.equal(vt.lines['26c'], 0);
  assert.equal(vt.refund, 83);
});

test('Vermont high income: rate schedule top bracket above the 3% minimum tax', async () => {
  const state = await household({ state: 'VT', forms: [w2(300000, { state: 'VT', stateWithheld: 20000 }), { kind: '1099-INT', fields: { interest: 50000, treasuryInterest: 50000 } }] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.lines['1'], 400000);
  assert.equal(vt.lines['3'], 350000);
  assert.equal(vt.lines['7'], 337050);
  assert.equal(vt.schedules['minimum-tax'].minimum, 10500);
  assert.equal(vt.schedules['minimum-tax'].schedule, 23818);
  assert.equal(vt.lines['8'], 23818);
  assert.equal(vt.owed, 3818);
});

test('Vermont retirees: full Social Security exemption below $70,000 joint and the extra standard deduction', async () => {
  const state = await household({
    state: 'VT', filingStatus: 'mfj', dateOfBirth: '1955-03-01', spouse: { ...spouse, dateOfBirth: '1957-01-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000 } }, { kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: 'SSA-1099', owner: 'spouse', fields: { netBenefits: 18000 } }],
  });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  assert.equal(vt.lines['1'], 60450);
  assert.equal(vt.schedules['IN-112'].I['12'], 20450);
  assert.equal(vt.lines['4'], 17800);
  assert.equal(vt.lines['7'], 11600);
  assert.equal(vt.lines['8'], 390);
  assert.equal(vt.owed, 390);
});

test('Vermont Schedule IN-117 credit for tax paid to New York', async () => {
  const state = await household({ state: 'VT', forms: [w2(50000, { state: 'VT', stateWithheld: 2000 }), w2(30000, { state: 'NY', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year' }, { state: 'NY', residency: 'nonresident', answers: { salesUseTax: 0 } }]);
  const vt = await stateReturn(state, '2025', 'VT');
  const row = vt.schedules['IN-117'][0];
  assert.equal(row.lines['9'], 30000);
  assert.equal(row.lines['17'], 80000);
  assert.equal(row.lines['18'], 2820);
  assert.equal(row.lines['19'], 1058);
  assert.equal(row.lines['21'], 1058);
  assert.equal(vt.lines['17'], 1058);
  assert.equal(vt.lines['20'], 1762);
});

test('Vermont 2026 carries the 2025 indexed amounts as provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'VT', forms: [w2(60000, { state: 'VT', stateWithheld: 2000 })] });
  await residency(state, '2026', [{ state: 'VT', residency: 'full-year' }]);
  const vt = await stateReturn(state, '2026', 'VT');
  assert.equal(vt.lines['7'], 47050);
  assert.equal(vt.lines['8'], 1576);
  assert.equal(vt.provisional, true);
});

const vtQuestionIds = async (state) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'VT' })).data.states[0].questions.map((item) => item.id);

test('Vermont labels every line of a resident IN-111', async () => {
  const state = await household({ state: 'VT', forms: [w2(50000, { state: 'VT', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'VT', residency: 'full-year' }]);
  const vt = await stateReturn(state, '2025', 'VT');
  for (const key of Object.keys(vt.lines)) assert.ok(typeof vt.labels[key] === 'string' && vt.labels[key].length > 0, key);
});

test('Vermont asks for the civil service pension only when that exemption is elected', async () => {
  const state = await household({ state: 'VT', forms: [w2(50000, { state: 'VT', stateWithheld: 1500 })] });
  const asked = await vtQuestionIds(state);
  assert.ok(!asked.includes('civilServicePension'));
  assert.ok(!asked.includes('vheipBeneficiaries'));
  assert.ok(!asked.includes('nonAllowableMedical'));
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'VT', answers: { retirementExemption: 'civil-service-pension' } });
  assert.ok((await vtQuestionIds(state)).includes('civilServicePension'));
});
