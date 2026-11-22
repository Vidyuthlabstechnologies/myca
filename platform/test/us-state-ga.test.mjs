import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';

test('Georgia resident single: U.S. interest is subtracted on Schedule 1 and the 5.19% rate applies to Line 15c', async () => {
  const state = await household({ state: 'GA', forms: [w2(60000, { state: 'GA', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 700, treasuryInterest: 200 } }] });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.form, '500');
  assert.equal(ga.lines['8'], 60900);
  assert.equal(ga.schedules['1']['10'], 200);
  assert.equal(ga.lines['9'], -200);
  assert.equal(ga.lines['10'], 60700);
  assert.equal(ga.lines['11'], 12000);
  assert.equal(ga.lines['15c'], 48700);
  assert.equal(ga.lines['16'], 2528);
  assert.equal(ga.owed, 28);
  assert.equal(ga.due, '2026-04-15');
  assert.ok(ga.notes.some((note) => note.includes('surplus')));
});

test('Georgia joint resident with a child: the dependent exemption and the credit for tax paid to North Carolina', async () => {
  const state = await household({
    state: 'GA', filingStatus: 'mfj',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' },
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 }],
    forms: [w2(70000, { state: 'GA', stateWithheld: 3000 }), w2(30000, { state: 'NC', stateWithheld: 1200, owner: 'spouse' })],
  });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }, { state: 'NC', residency: 'nonresident' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.lines['7a'], 1);
  assert.equal(ga.lines['10'], 100000);
  assert.equal(ga.lines['11'], 24000);
  assert.equal(ga.lines['13'], 76000);
  assert.equal(ga.lines['14'], 4000);
  assert.equal(ga.lines['15c'], 72000);
  assert.equal(ga.lines['16'], 3737);
  const credit = ga.schedules['other-state-credit'][0];
  assert.equal(credit.state, 'NC');
  assert.equal(credit.lines['1'], 30000);
  assert.equal(credit.lines['3'], 0.3);
  assert.equal(credit.lines['7'], 8400);
  assert.equal(credit.lines['9'], 1121);
  assert.equal(credit.lines['10'], 931);
  assert.equal(ga.lines['18'], 931);
  assert.equal(ga.lines['23'], 2806);
  assert.equal(ga.refund, 194);
});

test('Georgia retirement income exclusion: $65,000 at 65 with at most $5,000 of wages and $35,000 at 62', async () => {
  const state = await household({
    state: 'GA', filingStatus: 'mfj', dateOfBirth: '1958-03-01',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1962-05-01' },
    forms: [w2(30000, { state: 'GA', stateWithheld: 900 }), { kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000 } }, { kind: '1099-R', owner: 'spouse', fields: { grossDistribution: 20000, taxableAmount: 20000, iraSepSimple: true } }],
  });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  const worksheet = ga.schedules['1-retirement'];
  assert.equal(worksheet.taxpayer['5'], 5000);
  assert.equal(worksheet.taxpayer['14'], 40000);
  assert.equal(worksheet.taxpayer['16'], 65000);
  assert.equal(worksheet.taxpayer['17'], 45000);
  assert.equal(worksheet.spouse['16'], 35000);
  assert.equal(worksheet.spouse['17'], 20000);
  assert.equal(ga.schedules['1']['13'], 65000);
  assert.equal(ga.lines['8'], 90000);
  assert.equal(ga.lines['10'], 25000);
  assert.equal(ga.lines['15c'], 1000);
  assert.equal(ga.lines['16'], 52);
});

test('Georgia part-year resident: Schedule 3 ratio to four decimals prorates the deduction', async () => {
  const state = await household({ state: 'GA', forms: [w2(30000, { state: 'NC', stateWithheld: 1000 }), w2(40000, { state: 'GA', stateWithheld: 1500 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NC', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'GA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.form, '500 with Schedule 3');
  assert.equal(ga.lines['4'], 2);
  const s3 = ga.schedules['3'];
  assert.equal(s3.A['8'], 71000);
  assert.equal(s3.C['1'], 40000);
  assert.equal(s3.C['2'], 504);
  assert.equal(s3.C['8'], 40504);
  assert.equal(s3.B['8'], 30496);
  assert.equal(s3.lines['9'], 0.5705);
  assert.equal(s3.lines['13'], 6846);
  assert.equal(s3.lines['14'], 33658);
  assert.equal(ga.lines['16'], 1747);
  assert.equal(ga.owed, 247);
});

test('Georgia nonresident: only Georgia wages are taxed after the prorated deduction', async () => {
  const state = await household({ state: 'NC', forms: [w2(20000, { state: 'GA', stateWithheld: 800 }), w2(50000, { state: 'NC', stateWithheld: 2000 })] });
  await residency(state, '2025', [{ state: 'NC', residency: 'full-year' }, { state: 'GA', residency: 'nonresident' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.lines['4'], 3);
  assert.equal(ga.schedules['3'].lines['9'], 0.2857);
  assert.equal(ga.schedules['3'].lines['13'], 3428);
  assert.equal(ga.lines['15c'], 16572);
  assert.equal(ga.lines['16'], 860);
  assert.equal(ga.owed, 60);
  assert.equal(ga.lines['17c'], 0);
});

test('Georgia high income itemizer: taxes are capped at $10,000 and the $300 eligible itemizer credit applies', async () => {
  const state = await household({
    state: 'GA',
    forms: [w2(400000, { state: 'GA', stateWithheld: 20000 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 12000 } }],
    answers: { charityCash: 10000 },
  });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.lines['11'], 0);
  assert.equal(ga.lines['12a'], 50000);
  assert.equal(ga.lines['12b'], 0);
  assert.equal(ga.lines['12c'], 50000);
  assert.equal(ga.lines['13'], 350000);
  assert.equal(ga.lines['16'], 18165);
  assert.equal(ga.lines['19'], 300);
  assert.equal(ga.lines['23'], 17865);
});

test('Georgia low income credit: $5 per exemption below $20,000 of federal AGI', async () => {
  const state = await household({ state: 'GA', forms: [w2(19000, { state: 'GA', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }]);
  const ga = await stateReturn(state, '2025', 'GA');
  assert.equal(ga.lines['15c'], 7000);
  assert.equal(ga.lines['16'], 363);
  assert.equal(ga.lines['17a'], 1);
  assert.equal(ga.lines['17b'], 5);
  assert.equal(ga.lines['17c'], 5);
  assert.equal(ga.lines['23'], 358);
});

test('Georgia 2026: the 4.99% rate and $15,000 standard deduction enacted by HB 463', async () => {
  const state = await household({ taxYear: '2026', state: 'GA', forms: [w2(60000, { state: 'GA', stateWithheld: 2300 })] });
  await residency(state, '2026', [{ state: 'GA', residency: 'full-year' }]);
  const ga = await stateReturn(state, '2026', 'GA');
  assert.equal(ga.lines['11'], 15000);
  assert.equal(ga.lines['15c'], 45000);
  assert.equal(ga.lines['16'], 2246);
  assert.equal(ga.provisional, false);
});

test('Georgia: every line of a resident return has a label in the words of Form 500', async () => {
  const state = await household({ state: 'GA', forms: [w2(50000, { state: 'GA', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'GA', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'GA');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Georgia asks for Path2College beneficiaries only after contributions are given', async () => {
  const state = await household({ state: 'GA', forms: [w2(50000, { state: 'GA' })] });
  assert.equal((await questionIds(state, 'GA')).includes('path2CollegeBeneficiaries'), false);
  const saved = await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'GA', answers: { path2CollegeContributions: 3000 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.ok((await questionIds(state, 'GA')).includes('path2CollegeBeneficiaries'));
});
