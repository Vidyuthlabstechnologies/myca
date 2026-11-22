import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { hiScheduleTax, hiTableTax, ratioTwoPlaces } from '../src/countries/united-states/states/hi.mjs';

const HI_2025 = { brackets: { single: [0, 9600, 14400, 19200, 24000, 36000, 48000, 125000, 175000, 225000, 275000, 325000].map((over, index) => ({ overCents: over * 100, rateBp: [140, 320, 550, 640, 680, 720, 760, 790, 825, 900, 1000, 1100][index] })) }, tableBelow: 100000, tableBand: 50 };

test('Hawaii tax table: tax on the $50 band midpoint matches the printed table, and the ratio is computed to 3 places then rounded to 2', () => {
  assert.equal(hiTableTax(23260, HI_2025, 'single'), 813);
  assert.equal(hiTableTax(1460, HI_2025, 'single'), 21);
  assert.equal(hiTableTax(55156, HI_2025, 'single'), 3084);
  assert.equal(hiScheduleTax(48000, HI_2025.brackets.single), 2539);
  assert.equal(ratioTwoPlaces(60000, 90000), 0.67);
  assert.equal(ratioTwoPlaces(20000, 70000), 0.29);
  assert.equal(ratioTwoPlaces(0, 70000), 0);
  assert.equal(ratioTwoPlaces(5000, -100), 1);
});

test('Hawaii resident single: U.S. interest is subtracted and the tax comes from the tax table', async () => {
  const state = await household({ state: 'HI', forms: [w2(60000, { state: 'HI', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'HI', residency: 'full-year' }]);
  const hi = await stateReturn(state, '2025', 'HI');
  assert.equal(hi.form, 'N-11');
  assert.equal(hi.lines['7'], 60900);
  assert.equal(hi.lines['18'], 200);
  assert.equal(hi.lines['20'], 60700);
  assert.equal(hi.lines['23'], 4400);
  assert.equal(hi.lines['24'], 56300);
  assert.equal(hi.lines['25'], 1144);
  assert.equal(hi.lines['26'], 55156);
  assert.equal(hi.lines['27'], 3084);
  assert.equal(hi.lines['28'], 0);
  assert.equal(hi.lines['48'], 584);
  assert.equal(hi.owed, 584);
  assert.equal(hi.due, '2026-04-20');
});

test('Hawaii joint with two children: food/excise credit, refundable care credit and 40% of the federal EIC', async () => {
  const state = await household({
    state: 'HI', filingStatus: 'mfj',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' },
    dependents: [
      { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 },
      { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-08-15', months: 12 },
    ],
    forms: [w2(35000, { state: 'HI', stateWithheld: 600 }), w2(10000, { state: 'HI', stateWithheld: 200, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'HI', residency: 'full-year', answers: { hiCareExpenses: 4000 } }]);
  const hi = await stateReturn(state, '2025', 'HI');
  assert.equal(hi.lines['6e'], 4);
  assert.equal(hi.lines['20'], 45000);
  assert.equal(hi.lines['23'], 8800);
  assert.equal(hi.lines['25'], 4576);
  assert.equal(hi.lines['26'], 31624);
  assert.equal(hi.lines['27'], 731);
  assert.equal(hi.schedules['N-311']['7'], 90);
  assert.equal(hi.lines['28'], 360);
  const care = hi.schedules.X['Part II'];
  assert.equal(care['17'], 20000);
  assert.equal(care['25'], 4000);
  assert.equal(care['27'], 0.21);
  assert.equal(hi.lines['30'], 840);
  const eic = hi.schedules['N-356'];
  assert.equal(eic['2'], 4087);
  assert.equal(eic['3'], 1635);
  assert.equal(hi.lines['32'], 1635);
  assert.equal(hi.lines['33'], 2835);
  assert.equal(hi.lines['34'], -2104);
  assert.equal(hi.lines['35'], 0);
  assert.equal(hi.refund, 2904);
});

test('Hawaii part-year resident: N-15 Hawaii AGI ratio rounded to 0.72 prorates the deduction and exemption', async () => {
  const state = await household({ state: 'HI', forms: [w2(20000, { state: 'WA' }), w2(50000, { state: 'HI', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'WA', residency: 'part-year', from: '2025-01-01', to: '2025-02-28' }, { state: 'HI', residency: 'part-year', from: '2025-03-01', to: '2025-12-31' }]);
  const hi = await stateReturn(state, '2025', 'HI');
  assert.equal(hi.form, 'N-15');
  assert.equal(hi.lines['35A'], 71000);
  assert.equal(hi.lines['8B'], 838);
  assert.equal(hi.lines['35B'], 50838);
  assert.equal(hi.lines['37'], 0.72);
  assert.equal(hi.lines['40b'], 3168);
  assert.equal(hi.lines['41'], 47670);
  assert.equal(hi.lines['42b'], 824);
  assert.equal(hi.lines['43'], 46846);
  assert.equal(hi.lines['44'], 2454);
  assert.equal(hi.lines['45'], 0);
  assert.equal(hi.lines['65'], 454);
  assert.equal(hi.owed, 454);
});

test('Hawaii nonresident: only Hawaii wages are taxed after the 0.29 ratio', async () => {
  const state = await household({ state: 'WA', forms: [w2(20000, { state: 'HI', stateWithheld: 900 }), w2(50000, { state: 'WA' })] });
  await residency(state, '2025', [{ state: 'WA', residency: 'full-year' }, { state: 'HI', residency: 'nonresident' }]);
  const hi = await stateReturn(state, '2025', 'HI');
  assert.equal(hi.lines['35B'], 20000);
  assert.equal(hi.lines['37'], 0.29);
  assert.equal(hi.lines['40b'], 1276);
  assert.equal(hi.lines['42b'], 332);
  assert.equal(hi.lines['43'], 18392);
  assert.equal(hi.lines['44'], 507);
  assert.equal(hi.lines['59'], 393);
  assert.equal(hi.refund, 393);
});

test('Hawaii high income itemizer: no state income tax deduction, the overall limitation, rate schedules and the credit for tax paid to Idaho', async () => {
  const state = await household({
    state: 'HI',
    forms: [w2(300000, { state: 'HI', stateWithheld: 20000 }), w2(50000, { state: 'ID', stateWithheld: 2500 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }],
    answers: { charityCash: 10000 },
  });
  await residency(state, '2025', [{ state: 'HI', residency: 'full-year' }, { state: 'ID', residency: 'nonresident', answers: { useTaxPurchases: 0 } }]);
  const hi = await stateReturn(state, '2025', 'HI');
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.lines['35'], 52000);
  assert.equal(id.lines['39'], 7431);
  assert.equal(id.lines['42'], 2001);
  assert.equal(id.totalTax, 2011);
  assert.equal(hi.lines['21b'], 12000);
  assert.equal(hi.lines['21c'], 30000);
  assert.equal(hi.lines['21d'], 10000);
  assert.equal(hi.lines['22'], 46504);
  assert.equal(hi.lines['24'], 303496);
  assert.equal(hi.lines['26'], 302352);
  assert.equal(hi.lines['27'], 23701);
  const credit = hi.schedules.CR['other-state'].lines;
  assert.equal(credit['3'], 50000);
  assert.equal(credit['5'], 2011);
  assert.equal(credit['12'], 252352);
  assert.equal(credit['14'], 18928);
  assert.equal(credit['17'], 4773);
  assert.equal(credit['20'], 2011);
  assert.equal(hi.lines['35'], 2011);
  assert.equal(hi.lines['36'], 21690);
  assert.equal(hi.owed, 1690);
});

test('Hawaii 2026: Act 46 raises the standard deduction to $8,000 and net capital gain is taxed at 7.25%', async () => {
  const state = await household({ taxYear: '2026', state: 'HI', forms: [w2(60000, { state: 'HI', stateWithheld: 3000 }), { kind: '1099-DIV', fields: { ordinaryDividends: 0, capitalGainDistributions: 40000 } }] });
  await residency(state, '2026', [{ state: 'HI', residency: 'full-year' }]);
  const hi = await stateReturn(state, '2026', 'HI');
  assert.equal(hi.lines['20'], 100000);
  assert.equal(hi.lines['23'], 8000);
  assert.equal(hi.lines['26'], 90856);
  const cg = hi.schedules['capital-gains'];
  assert.equal(cg['13'], 50856);
  assert.equal(cg['14'], 40000);
  assert.equal(cg['15'], 2758);
  assert.equal(cg['16'], 2900);
  assert.equal(cg['18'], 5798);
  assert.equal(hi.lines['27'], 5658);
  assert.equal(hi.lines['27a'], 40000);
  assert.equal(hi.provisional, false);
  assert.equal(hi.refund, 0);
  assert.equal(hi.owed, 2658);
});

test('Hawaii: every line of a resident return has a label in the words of Form N-11', async () => {
  const state = await household({ state: 'HI', forms: [w2(50000, { state: 'HI', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'HI', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'HI');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Hawaii asks about rent exclusions only after rent paid is given', async () => {
  const state = await household({ state: 'HI', forms: [w2(50000, { state: 'HI' })] });
  assert.equal((await questionIds(state, 'HI')).includes('hiRentExclusions'), false);
  const saved = await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'HI', answers: { hiRentPaid: 9000 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.ok((await questionIds(state, 'HI')).includes('hiRentExclusions'));
});
