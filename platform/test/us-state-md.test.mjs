import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../src/tools.mjs';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };

test('Maryland resident single: tax table midpoint, standard deduction, exemption and Montgomery County tax', async () => {
  const state = await household({ state: 'MD', forms: [w2(60000, { state: 'MD', stateWithheld: 2500, localWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'montgomery' } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.form, '502');
  assert.equal(md.lines['16'], 60000);
  assert.equal(md.lines['17'], 3350);
  assert.equal(md.lines['19'], 3200);
  assert.equal(md.lines['20'], 53450);
  assert.equal(md.lines['21'], 2488);
  assert.equal(md.lines['28'], 1710);
  assert.equal(md.lines['34'], 4198);
  assert.equal(md.lines['41'], 4000);
  assert.equal(md.totalTax, 4198);
  assert.equal(md.owed, 198);
  assert.equal(md.due, '2026-04-15');
  assert.equal(md.provisional, false);
});

test('Maryland resident joint with two children: child care and two-income subtractions, state, local and refundable EIC', async () => {
  const state = await household({
    state: 'MD', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2016-05-05', months: 12 }],
    forms: [w2(30000, { state: 'MD', stateWithheld: 600, localWithheld: 400 }), { ...w2(8000, { state: 'MD', stateWithheld: 100 }), owner: 'spouse' }],
  });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'baltimore-city', childCareExpenses: 4000 } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.lines['9'], 4000);
  assert.equal(md.lines['14'], 1200);
  assert.equal(md.lines['16'], 32800);
  assert.equal(md.lines['17'], 6700);
  assert.equal(md.lines['19'], 12800);
  assert.equal(md.lines['20'], 13300);
  assert.equal(md.lines['21'], 580);
  assert.equal(md.lines['22'], 2781);
  assert.equal(md.lines['23'], 0);
  assert.equal(md.lines['27'], 0);
  assert.equal(md.lines['28'], 426);
  assert.equal(md.lines['29'], 1780);
  assert.equal(md.lines['33'], 0);
  assert.equal(md.lines['44'], 1922);
  assert.equal(md.lines['45'], 0);
  assert.equal(md.totalTax, 0);
  assert.equal(md.refund, 1100 + 1922);
});

test('Maryland senior: pension exclusion reduced by Social Security, U.S. interest, extra exemption, senior credit and Anne Arundel tax', async () => {
  const state = await household({ state: 'MD', dateOfBirth: '1955-03-03', forms: [{ kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000, federalWithheld: 3000 } }, { kind: 'SSA-1099', fields: { netBenefits: 20000 } }, { kind: '1099-INT', fields: { interest: 1000, treasuryInterest: 400 } }] });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'anne-arundel' } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.lines['1'], 42190);
  assert.equal(md.lines['10a'], 21200);
  assert.equal(md.lines['11'], 10790);
  assert.equal(md.lines['13'], 400);
  assert.equal(md.lines['16'], 9800);
  assert.equal(md.lines['19'], 4200);
  assert.equal(md.lines['20'], 2250);
  assert.equal(md.lines['21'], 61);
  assert.equal(md.lines['24'], 1000);
  assert.equal(md.lines['27'], 0);
  assert.equal(md.lines['28'], 61);
  assert.equal(md.totalTax, 61);
  assert.deepEqual(md.nonrefundableCredits, [{ code: 'MD_SENIOR', label: 'Senior tax credit', amount: 61 }]);
});

test('Maryland part-year resident: nonresident-period income is subtracted and deductions and exemptions use the income factor', async () => {
  const state = await household({ state: 'MD', forms: [w2(40000, { state: 'IL', stateWithheld: 1500 }), w2(40000, { state: 'MD', stateWithheld: 1300, localWithheld: 600 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'MD', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { county: 'howard' } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.residency, 'part-year');
  assert.equal(md.lines['12'], 40000);
  assert.equal(md.lines['16'], 40000);
  assert.equal(md.schedules['26A']['3'], 0.5);
  assert.equal(md.lines['17'], 1675);
  assert.equal(md.lines['19'], 1600);
  assert.equal(md.lines['20'], 36725);
  assert.equal(md.lines['21'], 1692);
  assert.equal(md.lines['28'], 1175);
  assert.equal(md.totalTax, 2867);
  assert.equal(md.owed, 2867 - 1900);
});

test('Maryland nonresident: Form 505 and 505NR prorate the tax by the Maryland share and add the special nonresident tax', async () => {
  const state = await household({ state: 'IL', forms: [w2(50000, { state: 'IL', stateWithheld: 2000 }), w2(30000, { state: 'MD', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0 } }, { state: 'MD', residency: 'nonresident' }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.form, '505');
  assert.equal(md.lines['31'], 73450);
  const nr = md.schedules['505NR'];
  assert.equal(nr['2'], 3438);
  assert.equal(nr['8'], 30000);
  assert.equal(nr['9'], 0.375);
  assert.equal(nr['10a'], 1256);
  assert.equal(nr['12'], 1200);
  assert.equal(nr['13'], 27544);
  assert.equal(nr['15'], 0.375003);
  assert.equal(nr['16'], 1289);
  assert.equal(nr['17'], 620);
  assert.equal(md.totalTax, 1909);
  assert.equal(md.owed, 409);
  const il = await stateReturn(state, '2025', 'IL');
  assert.ok(il.otherStateCredit > 0);
});

test('Maryland resident credit for tax paid to another state splits between state and local tax (Form 502CR Part A)', async () => {
  const state = await household({ state: 'MD', forms: [w2(50000, { state: 'MD', stateWithheld: 2000 }), w2(30000, { state: 'IL', stateWithheld: 1400 })] });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'montgomery' } }, { state: 'IL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const md = await stateReturn(state, '2025', 'MD');
  const il = await stateReturn(state, '2025', 'IL');
  const part = md.schedules['502CR'].partA[0];
  assert.equal(part.state, 'IL');
  assert.equal(part.lines['1'], 73450);
  assert.equal(part.lines['2'], 30000);
  assert.equal(part.lines['3'], 43450);
  assert.equal(part.lines['4'], 2013);
  assert.equal(part.lines['9'], 3438);
  assert.equal(part.lines['10'], 1425);
  assert.equal(part.lines['11'], 2350);
  assert.equal(part.lines['12'], 1390);
  assert.equal(part.lines['13'], 960);
  assert.equal(part.lines['15'], il.totalTax);
  assert.equal(part.lines['16'], Math.min(2385, il.totalTax));
  assert.equal(part.lines['17'], Math.min(1425, part.lines['16']));
  assert.equal(md.lines['24'], part.lines['17']);
  assert.equal(md.lines['31'], part.lines['18']);
  assert.equal(md.totalTax, 3438 - part.lines['17'] + 2350 - part.lines['18']);
});

test('Maryland high income joint: Schedule II top rates, no exemptions, 2% capital gain tax, itemized phaseout and Frederick County top rate', async () => {
  const state = await household({ state: 'MD', filingStatus: 'mfj', spouse, forms: [w2(500000, { state: 'MD', stateWithheld: 40000 }), { kind: '1099-DIV', fields: { ordinaryDividends: 50000, qualifiedDividends: 50000, capitalGainDistributions: 50000 } }, { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }] });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'frederick', twoIncomeLowerSpouse: 0 } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.lines['1'], 600000);
  assert.equal(md.lines['14'], 0);
  assert.equal(md.lines['17a'], 40000);
  assert.equal(md.lines['17b'], 7692);
  assert.equal(md.lines['17c'], 30000);
  assert.equal(md.lines['17'], 6700);
  assert.ok(md.checks.some((item) => item.code === 'MD_STANDARD_BETTER'));
  assert.equal(md.lines['19'], 0);
  assert.equal(md.lines['20'], 593300);
  assert.equal(md.lines['20a'], 50000);
  assert.equal(md.lines['21'], 31937);
  assert.equal(md.lines['21b'], 1000);
  assert.equal(md.lines['28'], 18986);
  assert.equal(md.totalTax, 31937 + 1000 + 18986);
});

test('Maryland without a county is an error, and 2026 uses the published local rates with a provisional standard deduction', async () => {
  const state = await household({ taxYear: '2026', state: 'MD', forms: [w2(60000, { state: 'MD', stateWithheld: 2500 })] });
  const md = await stateReturn(state, '2026', 'MD');
  assert.ok(md.checks.some((item) => item.code === 'MD_COUNTY_REQUIRED' && item.level === 'error'));
  assert.equal(md.lines['28'], 0);
  await residency(state, '2026', [{ state: 'MD', residency: 'full-year', answers: { county: 'kent' } }]);
  const kent = await stateReturn(state, '2026', 'MD');
  assert.equal(kent.lines['17'], 3400);
  assert.equal(kent.lines['20'], 53400);
  assert.equal(kent.lines['21'], 2485);
  assert.equal(kent.lines['28'], 1762);
  assert.equal(kent.provisional, true);
  const questions = await runTool(state, 'us_state_questions', { taxYear: '2026', state: 'MD' });
  assert.ok(questions.data.states[0].questions.find((item) => item.id === 'county').options.includes('baltimore-city'));
});

test('Maryland child tax credit for a young child at low income and the poverty level credit', async () => {
  const state = await household({ state: 'MD', filingStatus: 'hoh', dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2022-02-02', months: 12 }], forms: [w2(16500, { state: 'MD', stateWithheld: 100 })] });
  await residency(state, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'worcester' } }]);
  const md = await stateReturn(state, '2025', 'MD');
  assert.equal(md.lines['45'], 400);
  assert.equal(md.lines['20'], 16500 - 6700 - 6400);
  assert.equal(md.lines['21'], 90 + Math.round((3425 - 3000) * 0.0475));
  assert.equal(md.lines['23'], 0);
  assert.ok(md.refundableCredits.some((item) => item.code === 'MD_CTC' && item.amount === 400));
  const low = await household({ state: 'MD', forms: [w2(15000, { state: 'MD', stateWithheld: 200 })] });
  await residency(low, '2025', [{ state: 'MD', residency: 'full-year', answers: { county: 'worcester' } }]);
  const single = await stateReturn(low, '2025', 'MD');
  assert.equal(single.lines['20'], 8450);
  assert.equal(single.lines['21'], 350);
  assert.ok(single.lines['22'] > 0 && single.lines['22'] <= 350);
  assert.equal(single.lines['23'], 750);
  assert.equal(single.lines['27'], 0);
  assert.equal(single.lines['28'], 190);
  assert.equal(single.lines['29'], Math.round(single.lines['22'] * 0.225));
  assert.equal(single.lines['30'], 338);
  assert.equal(single.lines['33'], 0);
  assert.equal(single.lines['44'], 0);
  assert.equal(single.totalTax, 0);
});
