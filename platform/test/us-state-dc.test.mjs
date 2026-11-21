import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2018-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2016-05-05', months: 12 }];

test('DC resident single: DC standard deduction and the published tax table', async () => {
  const state = await household({ state: 'DC', forms: [w2(70000, { state: 'DC', stateWithheld: 3500 })] });
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.form, 'D-40');
  assert.equal(dc.lines['16'], 70000);
  assert.equal(dc.lines['17'], 'standard');
  assert.equal(dc.lines['18'], 15000);
  assert.equal(dc.lines['19'], 55000);
  assert.equal(dc.lines['20'], 3177);
  assert.equal(dc.totalTax, 3177);
  assert.equal(dc.refund, 323);
  assert.equal(dc.provisional, false);
});

test('DC resident joint with two children: child care credit, EITC equal to the federal EIC and Schedule H property tax credit', async () => {
  const state = await household({ state: 'DC', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(45000, { state: 'DC', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'DC', residency: 'full-year', answers: { federalChildCareCredit: 1000, propertyTaxCredit: 800 } }]);
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.lines['18'], 30000);
  assert.equal(dc.lines['19'], 15000);
  assert.equal(dc.lines['20'], 702);
  assert.equal(dc.lines['21'], 320);
  assert.equal(dc.lines['24'], 382);
  assert.equal(dc.lines['27a'], 2);
  assert.equal(dc.lines['27d'], dc.lines['27c']);
  assert.ok(dc.lines['27d'] > 0);
  assert.equal(dc.lines['28'], 800);
  assert.equal(dc.lines['30'], dc.lines['27d'] + 800);
  assert.equal(dc.refund, 1200 + dc.lines['30'] - 382);
});

test('DC childless worker EITC from the DC worksheet', async () => {
  const state = await household({ state: 'DC', dateOfBirth: '1995-01-01', forms: [w2(20000, { state: 'DC', stateWithheld: 500 })] });
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.lines['19'], 5000);
  assert.equal(dc.lines['20'], 201);
  assert.equal(dc.lines['27e'], 649);
  const phased = await household({ state: 'DC', dateOfBirth: '1995-01-01', forms: [w2(26000, { state: 'DC', stateWithheld: 500 })] });
  const dc2 = await stateReturn(phased, '2025', 'DC');
  assert.equal(dc2.lines['27e'], Math.round(649 - (26000 - 23288) * 0.0848));
  const young = await household({ state: 'DC', dateOfBirth: '2003-01-01', forms: [w2(20000, { state: 'DC', stateWithheld: 500 })] });
  const dc3 = await stateReturn(young, '2025', 'DC');
  assert.equal(dc3.lines['27e'], 0);
});

test('DC part-year resident: nonresident-period income is subtracted and the standard deduction is prorated by days (Calculation C)', async () => {
  const state = await household({ state: 'DC', forms: [w2(40000, { state: 'IL', stateWithheld: 1500 }), w2(40000, { state: 'DC', stateWithheld: 1800 })] });
  await residency(state, '2025', [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'DC', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.lines['8'], 40000);
  assert.equal(dc.lines['16'], 40000);
  assert.deepEqual(dc.schedules['Calculation C'], { a: 15000, b: 184, c: 0.5041, d: 7562 });
  assert.equal(dc.lines['19'], 32438);
  assert.equal(dc.lines['20'], 1746);
  assert.equal(dc.refund, 54);
});

test('DC nonresident: wages are not taxed (reciprocal), and other income still owes no DC tax (D-40B refund)', async () => {
  const state = await household({ state: 'VA', forms: [w2(50000, { state: 'VA' }), w2(30000, { state: 'DC', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }, { state: 'DC', residency: 'nonresident' }]);
  const reciprocal = await stateReturn(state, '2025', 'DC');
  assert.equal(reciprocal.status, 'reciprocal');
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }, { state: 'DC', residency: 'nonresident', income: { wages: 30000, otherIncome: 500 } }]);
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.form, 'D-40B');
  assert.equal(dc.totalTax, 0);
  assert.equal(dc.refund, 900);
});

test('DC high income: top bracket and the 5% itemized deduction limitation (Calculation F)', async () => {
  const state = await household({ state: 'DC', forms: [w2(1200000, { state: 'DC', stateWithheld: 100000 }), { kind: '1098', fields: { mortgageInterest: 40000, propertyTax: 15000 } }], answers: { medicalExpenses: 100000 } });
  const dc = await stateReturn(state, '2025', 'DC');
  assert.equal(dc.lines['17'], 'itemized');
  assert.deepEqual(dc.schedules['Calculation F'], { a: 60000, b: 10000, c: 50000, d: 15000, e: 0, f: 65000, g: 10000, h: 55000, i: 1200000, j: 200000, k: 1000000, l: 50000, m: 5000, n: 15000 });
  assert.equal(dc.lines['18'], 15000);
  assert.equal(dc.lines['19'], 1185000);
  assert.equal(dc.lines['20'], 111413);
  assert.equal(dc.owed, 11413);
});

test('DC resident: additional standard deduction at 65 and credit for tax paid to another state', async () => {
  const state = await household({ state: 'DC', dateOfBirth: '1958-01-01', forms: [w2(70000, { state: 'DC', stateWithheld: 3000 }), w2(30000, { state: 'IL', stateWithheld: 1400 })] });
  await residency(state, '2025', [{ state: 'DC', residency: 'full-year' }, { state: 'IL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const dc = await stateReturn(state, '2025', 'DC');
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(dc.lines['18'], 17000);
  assert.equal(dc.lines['19'], 83000);
  assert.equal(dc.lines['20'], 5456);
  const limit = Math.round(5456 * (30000 / 100000));
  assert.equal(dc.lines['22'], Math.min(il.totalTax, limit));
  assert.equal(dc.totalTax, 5456 - dc.lines['22']);
});

test('DC 2026 carries the 2025 deductions, table and credits as provisional figures', async () => {
  const state = await household({ taxYear: '2026', state: 'DC', forms: [w2(70000, { state: 'DC', stateWithheld: 3500 })] });
  const dc = await stateReturn(state, '2026', 'DC');
  assert.equal(dc.lines['20'], 3177);
  assert.equal(dc.provisional, true);
});
