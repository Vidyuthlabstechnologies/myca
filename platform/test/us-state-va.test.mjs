import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const child = (firstName, ssn, dateOfBirth, relationship = 'son') => ({ firstName, lastName: 'Diaz', ssn, relationship, dateOfBirth, months: 12 });

test('Virginia resident single: U.S. interest is subtracted, $930 exemption, rate schedule and a May 1 due date', async () => {
  const state = await household({ state: 'VA', forms: [w2(60000, { state: 'VA', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.form, '760');
  assert.equal(va.lines['1'], 60900);
  assert.equal(va.lines['7'], 200);
  assert.equal(va.lines['9'], 60700);
  assert.equal(va.lines['11'], 8750);
  assert.equal(va.lines['12'], 930);
  assert.equal(va.lines['15'], 51020);
  assert.equal(va.lines['16'], 2676);
  assert.equal(va.lines['18'], 2676);
  assert.equal(va.lines['27'], 176);
  assert.equal(va.owed, 176);
  assert.equal(va.due, '2026-05-01');
});

test('Virginia joint low-income family: the refundable 20% Virginia earned income credit beats the $300 per exemption credit', async () => {
  const state = await household({
    state: 'VA', filingStatus: 'mfj', spouse,
    dependents: [child('Leo', '400-12-9876', '2018-02-02'), child('Mia', '400-12-9877', '2020-03-03', 'daughter')],
    forms: [w2(18000, { state: 'VA', stateWithheld: 300 }), w2(6000, { state: 'VA', owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.lines['9'], 24000);
  assert.equal(va.lines['11'], 17500);
  assert.equal(va.lines['12'], 3720);
  assert.equal(va.lines['15'], 2780);
  assert.equal(va.lines['16'], 56);
  assert.equal(va.lines['17'], 0);
  const adj = va.schedules.ADJ;
  assert.equal(adj['11'], 4);
  assert.equal(adj['13'], 1200);
  assert.equal(adj['14'], 7152);
  assert.equal(adj['16b'], 1430);
  assert.equal(adj['17'], 1430);
  assert.equal(va.lines['23'], 1430);
  assert.equal(va.lines['26'], 1730);
  assert.equal(va.lines['28'], 1674);
  assert.deepEqual(va.refundableCredits.map((item) => item.amount), [1430]);
  assert.equal(va.totalTax, 56);
  assert.equal(va.refund, 1674);
});

test('Virginia joint resident: the spouse tax adjustment is $259 when both spouses have over $17,000', async () => {
  const state = await household({ state: 'VA', filingStatus: 'mfj', spouse, forms: [w2(60000, { state: 'VA', stateWithheld: 2500 }), w2(30000, { state: 'VA', stateWithheld: 1200, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.lines['15'], 70640);
  assert.equal(va.lines['16'], 3804);
  assert.deepEqual(va.schedules.STA['1'], { taxpayer: 60000, spouse: 30000 });
  assert.deepEqual(va.schedules.STA['3'], { taxpayer: 59070, spouse: 29070 });
  assert.equal(va.lines['17'], 259);
  assert.equal(va.lines['18'], 3545);
  assert.equal(va.lines['19a'], 2500);
  assert.equal(va.lines['19b'], 1200);
  assert.equal(va.refund, 155);
});

test('Virginia age deduction: $12,000 reduced by AFAGI over $50,000 and the extra $800 exemption at 65', async () => {
  const state = await household({ state: 'VA', dateOfBirth: '1955-06-01', forms: [w2(30000, { state: 'VA', stateWithheld: 1800 }), { kind: '1099-R', fields: { grossDistribution: 25000, taxableAmount: 25000 } }] });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.schedules['age-deduction']['8'], 55000);
  assert.equal(va.schedules['age-deduction']['11'], 5000);
  assert.equal(va.lines['4a'], 7000);
  assert.equal(va.lines['9'], 48000);
  assert.equal(va.lines['12'], 1730);
  assert.equal(va.lines['15'], 37520);
  assert.equal(va.lines['16'], 1900);
  assert.equal(va.refund, 0);
  assert.equal(va.owed, 100);
});

test('Virginia part-year resident: Form 760PY prorates the standard deduction by income and the exemption by days', async () => {
  const state = await household({ state: 'VA', forms: [w2(30000, { state: 'NC', stateWithheld: 1000 }), w2(40000, { state: 'VA', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NC', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'VA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.form, '760PY');
  assert.equal(va.lines['7'], 30496);
  assert.equal(va.lines['10'], 40504);
  assert.equal(va.schedules['schedule-of-income']['standard-deduction-percent'], 0.57);
  assert.equal(va.schedules['schedule-of-income']['exemption-ratio'], 0.504);
  assert.equal(va.lines['12'], 4988);
  assert.equal(va.lines['13'], 469);
  assert.equal(va.lines['16'], 35047);
  assert.equal(va.lines['17'], 1758);
  assert.equal(va.lines['18'], 1758);
  assert.equal(va.owed, 258);
});

test('Virginia nonresident: Form 763 computes tax as a resident and applies the allocation percentage to one decimal', async () => {
  const state = await household({ state: 'NC', forms: [w2(20000, { state: 'VA', stateWithheld: 700 }), w2(50000, { state: 'NC', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year', answers: { useTax: 0 } }, { state: 'VA', residency: 'nonresident' }]);
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(va.form, '763');
  assert.equal(va.lines['9'], 70000);
  assert.equal(va.lines['15'], 60320);
  assert.equal(va.lines['16'], 0.286);
  assert.equal(va.lines['17'], 17252);
  assert.equal(va.lines['18'], 734);
  assert.equal(va.stateIncome, 20000);
  assert.equal(va.owed, 34);
});

test('Virginia high income itemizer: Schedule A removes income tax and the limited itemized deduction worksheet applies', async () => {
  const state = await household({
    state: 'VA',
    forms: [w2(500000, { state: 'VA', stateWithheld: 25000 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }],
    answers: { charityCash: 20000 },
  });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2025', 'VA');
  const worksheet = va.schedules['limited-itemized'];
  assert.equal(worksheet['1'], 87000);
  assert.equal(worksheet['4'], 69600);
  assert.equal(worksheet['7'], 167300);
  assert.equal(worksheet['9'], 5019);
  assert.equal(worksheet['11'], 0.058);
  assert.equal(worksheet['12a'], 81981);
  assert.equal(worksheet['15'], 23550);
  assert.equal(va.schedules.A['19'], 58431);
  assert.equal(va.lines['10'], 58431);
  assert.equal(va.lines['11'], 0);
  assert.equal(va.lines['15'], 440639);
  assert.equal(va.lines['16'], 25079);
  assert.equal(va.owed, 79);
  assert.equal(va.provisional, false);
});

test('Virginia resident with North Carolina wages: Schedule OSC uses the border state computation', async () => {
  const state = await household({ state: 'VA', forms: [w2(40000, { state: 'VA', stateWithheld: 1500 }), w2(30000, { state: 'NC', stateWithheld: 1100 })] });
  await residency(state, '2025', [{ state: 'VA', residency: 'full-year' }, { state: 'NC', residency: 'nonresident', answers: { useTax: 0 } }]);
  const nc = await stateReturn(state, '2025', 'NC');
  const va = await stateReturn(state, '2025', 'VA');
  assert.equal(nc.lines['15'], 1043);
  assert.equal(va.lines['15'], 60320);
  assert.equal(va.lines['18'], 3211);
  const osc = va.schedules.OSC.credits[0];
  assert.equal(osc.state, 'NC');
  assert.equal(osc.border, true);
  assert.equal(osc.lines['8'], 1);
  assert.equal(osc.lines['10'], 1043);
  assert.equal(va.lines['24'], 1043);
  assert.equal(va.totalTax, 2168);
  assert.equal(va.owed, 668);
});

test('Virginia 2026: the due date moves to the next business day and the unpublished itemized limitation is provisional', async () => {
  const state = await household({
    taxYear: '2026', state: 'VA',
    forms: [w2(150000, { state: 'VA', stateWithheld: 7000 }), { kind: '1098', fields: { mortgageInterest: 20000, propertyTax: 6000 } }],
  });
  await residency(state, '2026', [{ state: 'VA', residency: 'full-year' }]);
  const va = await stateReturn(state, '2026', 'VA');
  assert.equal(va.due, '2027-05-03');
  assert.equal(va.lines['11'], 0);
  assert.equal(va.provisional, true);
  assert.ok(va.rulesUsed.includes('us.state-return.va.itemized-limitation@2026-01-01'));
});
