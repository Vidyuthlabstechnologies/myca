import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

test('North Carolina resident single: Schedule S deducts U.S. interest, the NC standard deduction applies and use tax is added', async () => {
  const state = await household({ state: 'NC', forms: [w2(60000, { state: 'NC', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year', answers: { useTax: 15 } }]);
  const nc = await stateReturn(state, '2025', 'NC');
  assert.equal(nc.form, 'D-400');
  assert.equal(nc.lines['6'], 60900);
  assert.equal(nc.schedules.S['18'], 200);
  assert.equal(nc.lines['9'], 200);
  assert.equal(nc.lines['11'], 12750);
  assert.equal(nc.lines['12a'], 12950);
  assert.equal(nc.lines['12b'], 47950);
  assert.equal(nc.lines['14'], 47950);
  assert.equal(nc.lines['15'], 2038);
  assert.equal(nc.lines['18'], 15);
  assert.equal(nc.lines['19'], 2053);
  assert.equal(nc.lines['28'], 447);
  assert.equal(nc.refund, 447);
});

test('North Carolina joint resident with two children: child deduction by AGI band and credit for tax paid to Virginia', async () => {
  const state = await household({
    state: 'NC', filingStatus: 'mfj',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' },
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2020-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2017-03-03', months: 12 }],
    forms: [w2(50000, { state: 'NC', stateWithheld: 1500 }), w2(20000, { state: 'VA', stateWithheld: 700, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year', answers: { useTax: 0 } }, { state: 'VA', residency: 'nonresident' }]);
  const nc = await stateReturn(state, '2025', 'NC');
  assert.equal(nc.lines['10a'], 2);
  assert.equal(nc.lines['10b'], 4000);
  assert.equal(nc.lines['11'], 25500);
  assert.equal(nc.lines['12b'], 40500);
  assert.equal(nc.lines['15'], 1721);
  const credit = nc.schedules.TC['other-state'][0];
  assert.equal(credit.state, 'VA');
  assert.equal(credit.lines['1'], 70000);
  assert.equal(credit.lines['2'], 20000);
  assert.equal(credit.lines['3'], 0.2857);
  assert.equal(credit.lines['5'], 492);
  assert.equal(credit.lines['6'], 568);
  assert.equal(credit.lines['7'], 492);
  assert.equal(nc.lines['16'], 492);
  assert.equal(nc.lines['17'], 1229);
  assert.equal(nc.lines['20a'], 1500);
  assert.equal(nc.lines['20b'], 0);
  assert.equal(nc.refund, 271);
});

test('North Carolina part-year resident: Schedule PN taxable percentage to four decimals', async () => {
  const state = await household({ state: 'GA', forms: [w2(30000, { state: 'NC', stateWithheld: 1000 }), w2(40000, { state: 'GA', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NC', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'GA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const nc = await stateReturn(state, '2025', 'NC');
  assert.equal(nc.schedules.PN.A['16'], 71000);
  assert.equal(nc.schedules.PN.B['1'], 30000);
  assert.equal(nc.schedules.PN.B['2'], 496);
  assert.equal(nc.schedules.PN.lines['22'], 30496);
  assert.equal(nc.schedules.PN.lines['23'], 71000);
  assert.equal(nc.lines['13'], 0.4295);
  assert.equal(nc.lines['12b'], 58250);
  assert.equal(nc.lines['14'], 25018);
  assert.equal(nc.lines['15'], 1063);
  assert.equal(nc.owed, 63);
});

test('North Carolina nonresident: the whole-return tax base is multiplied by the North Carolina share', async () => {
  const state = await household({ state: 'GA', filingStatus: 'mfj', spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' }, dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 }], forms: [w2(70000, { state: 'GA', stateWithheld: 3000 }), w2(30000, { state: 'NC', stateWithheld: 1200, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }, { state: 'NC', residency: 'nonresident', answers: { useTax: 0 } }]);
  const nc = await stateReturn(state, '2025', 'NC');
  assert.equal(nc.residency, 'nonresident');
  assert.equal(nc.lines['10b'], 1500);
  assert.equal(nc.lines['12b'], 73000);
  assert.equal(nc.lines['13'], 0.3);
  assert.equal(nc.lines['14'], 21900);
  assert.equal(nc.lines['15'], 931);
  assert.equal(nc.lines['20b'], 1200);
  assert.equal(nc.stateIncome, 30000);
  assert.equal(nc.refund, 269);
});

test('North Carolina high income: NC itemized deductions with the $20,000 home limit and the 7.5% medical floor beat the standard deduction', async () => {
  const state = await household({
    state: 'NC',
    forms: [w2(400000, { state: 'NC', stateWithheld: 17000 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }],
    answers: { charityCash: 10000, medicalExpenses: 40000 },
  });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year', answers: { useTax: 0 } }]);
  const nc = await stateReturn(state, '2025', 'NC');
  const a = nc.schedules.A;
  assert.equal(a['2'], 10000);
  assert.equal(a['3'], 40000);
  assert.equal(a['5'], 20000);
  assert.equal(a['6'], 10000);
  assert.equal(a['7c'], 30000);
  assert.equal(a['7d'], 10000);
  assert.equal(a['10'], 40000);
  assert.equal(nc.lines['11'], 40000);
  assert.equal(nc.lines['14'], 360000);
  assert.equal(nc.lines['15'], 15300);
  assert.equal(nc.refund, 1700);
});

test('North Carolina resident gets the credit for Georgia tax on Georgia wages', async () => {
  const state = await household({ state: 'NC', forms: [w2(20000, { state: 'GA', stateWithheld: 800 }), w2(50000, { state: 'NC', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year', answers: { useTax: 0, baileyRetirementBenefits: 0 } }, { state: 'GA', residency: 'nonresident' }]);
  const nc = await stateReturn(state, '2025', 'NC');
  assert.equal(nc.lines['15'], 2433);
  assert.equal(nc.schedules.TC['other-state'][0].lines['5'], 695);
  assert.equal(nc.lines['16'], 695);
  assert.equal(nc.lines['17'], 1738);
  assert.ok(nc.checks.some((item) => item.code === 'NC_OTHER_STATE_RETURN'));
});

test('North Carolina 2026: the 3.99% rate from G.S. 105-153.7 is not provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'NC', forms: [w2(60000, { state: 'NC', stateWithheld: 2000 })] });
  await residency(state, '2026', [{ state: 'NC', residency: 'full-year', answers: { useTax: 0 } }]);
  const nc = await stateReturn(state, '2026', 'NC');
  assert.equal(nc.lines['14'], 47250);
  assert.equal(nc.lines['15'], 1885);
  assert.equal(nc.provisional, false);
});
