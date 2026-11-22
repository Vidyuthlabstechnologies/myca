import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

test('Idaho resident single: U.S. interest is subtracted on Form 39R and 5.3% applies above $4,811', async () => {
  const state = await household({ state: 'ID', forms: [w2(60000, { state: 'ID', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'ID', residency: 'full-year', answers: { useTaxPurchases: 0 } }]);
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.form, '40');
  assert.equal(id.lines['7'], 60900);
  assert.equal(id.schedules['39R'].B['3'], 200);
  assert.equal(id.lines['10'], 200);
  assert.equal(id.lines['11'], 60700);
  assert.equal(id.lines['16'], 15750);
  assert.equal(id.lines['19'], 44950);
  assert.equal(id.lines['20'], 2127);
  assert.equal(id.lines['31'], 10);
  assert.equal(id.lines['32'], 2137);
  assert.equal(id.lines['43'], 155);
  assert.equal(id.lines['55'], 518);
  assert.equal(id.refund, 518);
  assert.equal(id.due, '2026-04-15');
  assert.equal(id.provisional, false);
});

test('Idaho joint with two children: child care subtraction, child tax credit, food credit and credit for tax paid to Oregon', async () => {
  const state = await household({
    state: 'ID', filingStatus: 'mfj',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' },
    dependents: [
      { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 },
      { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-08-15', months: 12 },
    ],
    forms: [w2(70000, { state: 'ID', stateWithheld: 3000 }), w2(30000, { state: 'OR', stateWithheld: 1500, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'ID', residency: 'full-year', answers: { childCareExpenses: 5000, useTaxPurchases: 0 } }, { state: 'OR', residency: 'nonresident' }]);
  const id = await stateReturn(state, '2025', 'ID');
  const or = await stateReturn(state, '2025', 'OR');
  assert.equal(id.lines['6d'], 4);
  assert.equal(id.schedules['39R'].B['6'], 5000);
  assert.equal(id.lines['11'], 95000);
  assert.equal(id.lines['16'], 31500);
  assert.equal(id.lines['19'], 63500);
  assert.equal(id.lines['20'], 2856);
  const credit = id.schedules['39R'].C[0];
  assert.equal(credit.state, 'OR');
  assert.equal(credit.lines['2'], 30000);
  assert.equal(credit.lines['4'], 0.3158);
  assert.equal(credit.lines['5'], 902);
  assert.equal(credit.lines['6'], or.totalTax);
  const allowed = Math.min(902, or.totalTax);
  assert.equal(id.lines['21'], allowed);
  assert.equal(id.lines['24'], 410);
  assert.equal(id.lines['26'], 2856 - allowed - 410);
  assert.equal(id.lines['32'], 2856 - allowed - 410 + 10);
  assert.equal(id.lines['43'], 620);
  assert.equal(id.lines['50'], 3620);
  assert.equal(id.refund, 3620 - (2856 - allowed - 400));
});

test('Idaho part-year resident: Form 43 percentage, months-based child tax credit and a capped food tax credit', async () => {
  const state = await household({
    state: 'ID', filingStatus: 'hoh',
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-03-03', months: 12 }],
    forms: [w2(30000, { state: 'WA' }), w2(40000, { state: 'ID', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }],
  });
  await residency(state, '2025', [{ state: 'WA', residency: 'part-year', from: '2025-01-01', to: '2025-07-09' }, { state: 'ID', residency: 'part-year', from: '2025-07-10', to: '2025-12-31', answers: { useTaxPurchases: 0 } }]);
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.form, '43');
  assert.equal(id.schedules.months.resident, 6);
  assert.equal(id.schedules.columns.B['8'], 479);
  assert.equal(id.lines['31A'], 71000);
  assert.equal(id.lines['31B'], 40479);
  assert.equal(id.lines['38'], 0.5701);
  assert.equal(id.lines['37'], 23625);
  assert.equal(id.lines['39'], 13469);
  assert.equal(id.lines['41'], 27010);
  assert.equal(id.lines['42'], 922);
  assert.equal(id.lines['46'], 102);
  assert.equal(id.lines['47'], 820);
  assert.equal(id.lines['52'], 10);
  assert.equal(id.lines['53'], 830);
  assert.equal(id.lines['63'], 155);
  assert.equal(id.lines['70'], 1655);
  assert.equal(id.lines['75'], 825);
  assert.equal(id.refund, 825);
});

test('Idaho nonresident: only Idaho wages are taxed after the deduction is reduced by the Idaho percentage', async () => {
  const state = await household({ state: 'WA', forms: [w2(20000, { state: 'ID', stateWithheld: 700 }), w2(50000, { state: 'WA' })] });
  await residency(state, '2025', [{ state: 'WA', residency: 'full-year' }, { state: 'ID', residency: 'nonresident', answers: { useTaxPurchases: 0 } }]);
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.form, '43');
  assert.equal(id.lines['31A'], 70000);
  assert.equal(id.lines['31B'], 20000);
  assert.equal(id.lines['38'], 0.2857);
  assert.equal(id.lines['39'], 4500);
  assert.equal(id.lines['41'], 15500);
  assert.equal(id.lines['42'], 567);
  assert.equal(id.lines['52'], 10);
  assert.equal(id.lines['53'], 577);
  assert.equal(id.lines['63'], 0);
  assert.equal(id.refund, 123);
});

test('Idaho high income itemizer: state income tax is taken off Schedule A and other states\' bond interest is added back', async () => {
  const state = await household({
    state: 'ID',
    forms: [w2(400000, { state: 'ID', stateWithheld: 20000 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }, { kind: '1099-INT', fields: { interest: 0, taxExemptInterest: 5000 } }],
    answers: { charityCash: 10000 },
  });
  await residency(state, '2025', [{ state: 'ID', residency: 'full-year', answers: { idahoBondInterest: 1000, useTaxPurchases: 0 } }]);
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.lines['7'], 400000);
  assert.equal(id.schedules['39R'].A['3'], 4000);
  assert.equal(id.lines['11'], 404000);
  assert.equal(id.lines['13'], 72000);
  assert.equal(id.lines['14'], 20000);
  assert.equal(id.lines['15'], 52000);
  assert.equal(id.lines['17'], 352000);
  assert.equal(id.lines['20'], 18401);
  assert.equal(id.lines['32'], 18411);
  assert.equal(id.lines['43'], 155);
  assert.equal(id.refund, 1744);
});

test('Idaho 2026: the child tax credit has ended and the indexed zero-tax amount is provisional', async () => {
  const state = await household({
    taxYear: '2026', state: 'ID', filingStatus: 'hoh',
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-03-03', months: 12 }],
    forms: [w2(60000, { state: 'ID', stateWithheld: 2000 })],
  });
  await residency(state, '2026', [{ state: 'ID', residency: 'full-year', answers: { useTaxPurchases: 0 } }]);
  const id = await stateReturn(state, '2026', 'ID');
  assert.equal(id.lines['16'], 24150);
  assert.equal(id.lines['19'], 35850);
  assert.equal(id.lines['20'], 1390);
  assert.equal(id.lines['24'], 0);
  assert.equal(id.provisional, true);
  assert.ok(id.notes.some((note) => note.includes('63-3029L')));
});

test('Idaho: every line of a resident return has a label in the words of Form 40', async () => {
  const state = await household({ state: 'ID', forms: [w2(50000, { state: 'ID', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'ID', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'ID');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Idaho asks about child care costs only of a household with dependents', async () => {
  const plain = await household({ state: 'ID', forms: [w2(50000, { state: 'ID' })] });
  assert.equal((await questionIds(plain, 'ID')).includes('childCareExpenses'), false);
  const holds = await household({ state: 'ID', forms: [w2(50000, { state: 'ID' })], filingStatus: 'hoh', dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-05-05', months: 12 }] });
  assert.ok((await questionIds(holds, 'ID')).includes('childCareExpenses'));
});
