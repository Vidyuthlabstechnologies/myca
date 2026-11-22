import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

test('Montana resident single: federal taxable income is the start and 4.7% / 5.9% applies above $21,100', async () => {
  const state = await household({ state: 'MT', forms: [w2(50000, { state: 'MT', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'MT', residency: 'full-year' }]);
  const mt = await stateReturn(state, '2025', 'MT');
  assert.equal(mt.form, '2');
  assert.equal(mt.lines['1'], 50000);
  assert.equal(mt.lines['2'], 15750);
  assert.equal(mt.lines['3'], 34250);
  assert.equal(mt.lines['7'], 34250);
  assert.equal(mt.schedules.tax['12'], 1768);
  assert.equal(mt.lines['8'], 1768);
  assert.equal(mt.lines['10'], 1768);
  assert.equal(mt.lines['23'], 232);
  assert.equal(mt.refund, 232);
  assert.equal(mt.due, '2026-04-15');
});

test('Montana joint with two children: 10% of the federal EIC and the credit for tax paid to Idaho', async () => {
  const state = await household({
    state: 'MT', filingStatus: 'mfj',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' },
    dependents: [
      { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 },
      { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2020-08-15', months: 12 },
    ],
    forms: [w2(30000, { state: 'MT', stateWithheld: 1200 }), w2(25000, { state: 'ID', stateWithheld: 100, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'MT', residency: 'full-year' }, { state: 'ID', residency: 'nonresident', answers: { useTaxPurchases: 0 } }]);
  const mt = await stateReturn(state, '2025', 'MT');
  const id = await stateReturn(state, '2025', 'ID');
  assert.equal(id.lines['42'], 56);
  assert.equal(id.totalTax, 66);
  assert.equal(mt.lines['2'], 31500);
  assert.equal(mt.lines['7'], 23500);
  assert.equal(mt.lines['8'], 1105);
  const credit = mt.schedules.III['Part II'][0];
  assert.equal(credit.state, 'ID');
  assert.equal(credit.lines['1'], 25000);
  assert.equal(credit.lines['3'], 55000);
  assert.equal(credit.lines['6'], 1);
  assert.equal(credit.lines['8'], 0.454545);
  assert.equal(credit.lines['9'], 502);
  assert.equal(credit.lines['10'], 66);
  assert.equal(mt.lines['9'], 66);
  assert.equal(mt.lines['10'], 1039);
  assert.equal(mt.lines['15'], 198);
  assert.equal(mt.lines['21'], 1398);
  assert.equal(mt.refund, 359);
});

test('Montana part-year resident: Schedule II ratio to six decimals applies to the ordinary tax', async () => {
  const state = await household({ state: 'WA', forms: [w2(30000, { state: 'WA' }), w2(40000, { state: 'MT', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'MT', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'WA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const mt = await stateReturn(state, '2025', 'MT');
  assert.equal(mt.form, '2 with Schedule II');
  assert.equal(mt.lines['7'], 55250);
  assert.equal(mt.schedules.tax['12'], 3007);
  const s2 = mt.schedules.II;
  assert.equal(s2['1'], 40000);
  assert.equal(s2['2'], 496);
  assert.equal(s2['15'], 40496);
  assert.equal(s2['16'], 71000);
  assert.equal(s2['17'], 0.570366);
  assert.equal(s2['19'], 1715);
  assert.equal(mt.lines['8'], 1715);
  assert.equal(mt.owed, 215);
});

test('Montana nonresident: only Montana wages count in the Schedule II ratio', async () => {
  const state = await household({ state: 'WA', forms: [w2(20000, { state: 'MT', stateWithheld: 800 }), w2(50000, { state: 'WA' })] });
  await residency(state, '2025', [{ state: 'WA', residency: 'full-year' }, { state: 'MT', residency: 'nonresident' }]);
  const mt = await stateReturn(state, '2025', 'MT');
  assert.equal(mt.lines['7'], 54250);
  assert.equal(mt.schedules.tax['12'], 2948);
  assert.equal(mt.schedules.II['17'], 0.285714);
  assert.equal(mt.lines['8'], 842);
  assert.equal(mt.owed, 42);
});

test('Montana high income itemizer aged 66: state tax add-back, $5,660 senior subtraction and capital gains at 4.1%', async () => {
  const state = await household({
    state: 'MT', dateOfBirth: '1959-05-01',
    forms: [w2(300000, { state: 'MT', stateWithheld: 15000 }), { kind: '1099-DIV', fields: { ordinaryDividends: 0, capitalGainDistributions: 20000 } }, { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 10000 } }],
  });
  await residency(state, '2025', [{ state: 'MT', residency: 'full-year' }]);
  const mt = await stateReturn(state, '2025', 'MT');
  const wb = mt.schedules['worksheet-B'];
  assert.equal(wb['1'], 25000);
  assert.equal(wb['5'], 15000);
  assert.equal(wb['6'], 55000);
  assert.equal(wb['7'], 17750);
  assert.equal(wb['11'], 15000);
  assert.equal(mt.lines['1'], 320000);
  assert.equal(mt.lines['2'], 55000);
  assert.equal(mt.lines['4'], 15000);
  assert.equal(mt.lines['6'], 5660);
  assert.equal(mt.lines['7'], 274340);
  assert.equal(mt.schedules.tax['3'], 20000);
  assert.equal(mt.schedules.tax['11'], 820);
  assert.equal(mt.schedules.tax['12'], 14753);
  assert.equal(mt.lines['8'], 15573);
  assert.equal(mt.owed, 573);
});

test('Montana elderly renter: Schedule 2EC credit is refunded with no tax due', async () => {
  const state = await household({
    state: 'MT', dateOfBirth: '1955-01-10',
    forms: [{ kind: 'SSA-1099', fields: { netBenefits: 20000 } }, { kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 10000, taxableAmount: 10000, distributionCode: '7' } }],
  });
  await residency(state, '2025', [{ state: 'MT', residency: 'full-year', answers: { mtRentPaid: 9000 } }]);
  const mt = await stateReturn(state, '2025', 'MT');
  assert.equal(mt.lines['1'], 10000);
  assert.equal(mt.lines['7'], 0);
  const ec = mt.schedules['2EC'];
  assert.equal(ec['18'], 30000);
  assert.equal(ec['20'], 17400);
  assert.equal(ec['21'], 0.05);
  assert.equal(ec['22'], 870);
  assert.equal(ec['25'], 1350);
  assert.equal(ec['27'], 480);
  assert.equal(ec['29'], 1);
  assert.equal(ec['30'], 480);
  assert.equal(mt.lines['16'], 480);
  assert.equal(mt.refund, 480);
});

test('Montana 2026: House Bill 337 widens the 4.7% bracket to $47,500 and doubles the earned income credit share', async () => {
  const state = await household({ taxYear: '2026', state: 'MT', forms: [w2(60000, { state: 'MT', stateWithheld: 2000 })] });
  await residency(state, '2026', [{ state: 'MT', residency: 'full-year' }]);
  const mt = await stateReturn(state, '2026', 'MT');
  assert.equal(mt.lines['2'], 16100);
  assert.equal(mt.lines['7'], 43900);
  assert.equal(mt.lines['8'], 2063);
  assert.equal(mt.provisional, false);
});
