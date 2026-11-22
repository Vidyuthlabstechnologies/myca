import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTool, TOOLS } from '../src/tools.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { STATE_MODULES } from '../src/countries/united-states/states/index.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

test('the state return tools are US tools, read tools can be queried by the app, and the residency tool is a confirmed write', () => {
  for (const name of ['us_state_returns', 'us_state_questions', 'us_state_coverage', 'us_state_filing_package']) {
    assert.ok(TOOLS.some((tool) => tool.name === name), name);
    assert.equal(isRemoteQuery(name), true, name);
  }
  assert.equal(isRemoteQuery('set_us_state_residency'), false);
  assert.equal(validateAssistantToolCall('us_state_returns', { taxYear: '2025', state: 'IL' }).ok, true);
});

test('every state module is either a stub or a built return with forms, a compute function and a rule for each supported year', () => {
  for (const module of STATE_MODULES) {
    assert.match(module.code, /^[A-Z]{2}$/);
    if (!module.built) continue;
    assert.equal(typeof module.compute, 'function', module.code);
    assert.ok(module.forms?.resident, module.code);
    for (const question of module.questions || []) assert.ok(['amount', 'yesno', 'choice', 'count', 'text'].includes(question.kind), `${module.code} ${question.id}`);
  }
});

test('with no residency saved, the home state is a full-year return and a W-2 state under a reciprocal agreement only refunds withholding', async () => {
  const state = await household({ state: 'IL', forms: [w2(60000, { state: 'IL', stateWithheld: 2900 }), w2(10000, { state: 'WI', stateWithheld: 300 })] });
  const result = await runTool(state, 'us_state_returns', { taxYear: '2025' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.residencyAssumed, true);
  const [illinois, wisconsin] = result.data.returns;
  assert.equal(illinois.state, 'IL');
  assert.equal(illinois.status, 'computed');
  assert.equal(illinois.lines['1'], 70000);
  assert.equal(illinois.lines['11'], 67150);
  assert.equal(illinois.totalTax, 3324);
  assert.equal(illinois.owed, 424);
  assert.equal(wisconsin.status, 'reciprocal');
  assert.equal(wisconsin.returnNeeded, true);
  assert.match(result.data && (await runTool(state, 'us_state_returns', { taxYear: '2025' })).data.returns[1].why, /reciprocal agreement/);
});

test('a state with no income tax needs no return and an unbuilt state says so instead of guessing', async () => {
  const state = await household({ state: 'TX', forms: [w2(50000, { state: 'TX' })] });
  const texas = await stateReturn(state, '2025', 'TX');
  assert.equal(texas.status, 'no-income-tax');
  assert.equal(texas.returnNeeded, false);
  const unbuilt = STATE_MODULES.find((module) => !module.built);
  if (unbuilt) {
    await residency(state, '2025', [{ state: 'TX', residency: 'full-year' }, { state: unbuilt.code, residency: 'nonresident', income: { wages: 1000 } }]);
    const other = await stateReturn(state, '2025', unbuilt.code);
    assert.equal(other.status, 'not-built');
  }
});

test('Illinois resident: retirement and Social Security are subtracted, exemptions count dependents and age, and credits follow', async () => {
  const state = await household({
    state: 'IL', filingStatus: 'mfj', dateOfBirth: '1955-01-15',
    spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1962-06-01' },
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2016-02-02', months: 12 }],
    forms: [w2(80000, { state: 'IL', stateWithheld: 3000 }), { kind: '1099-R', fields: { grossDistribution: 20000, taxableAmount: 20000, federalWithheld: 2000 } }, { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 300 } }],
  });
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { propertyTaxPaid: 6000, k12Expenses: 1000, useTax: 20 } }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.lines['1'], 100800);
  assert.equal(il.lines['5'], 20000);
  assert.equal(il.lines['7'], 300);
  assert.equal(il.lines['9'], 80500);
  assert.equal(il.lines['10a'], 5700);
  assert.equal(il.lines['10b'], 1000);
  assert.equal(il.lines['10d'], 2850);
  assert.equal(il.lines['10'], 9550);
  assert.equal(il.lines['11'], 70950);
  assert.equal(il.lines['12'], 3512);
  assert.equal(il.lines['16'], 300 + 188);
  assert.equal(il.lines['21'], 20);
  assert.equal(il.totalTax, 3512 - 488 + 20);
  assert.equal(il.owed, 44);
  assert.equal(il.refund, 0);
});

test('Illinois part-year resident: Schedule NR prorates the exemption by the Illinois share of base income', async () => {
  const state = await household({ state: 'IL', forms: [w2(40000, { state: 'IL', stateWithheld: 1500 }), w2(40000, { state: 'IN', stateWithheld: 1200 })] });
  await residency(state, '2025', [{ state: 'IN', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'IL', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.residency, 'part-year');
  assert.equal(il.schedules.NR['46'], 40000);
  assert.equal(il.schedules.NR['48'], 0.5);
  assert.equal(il.schedules.NR['50'], 1425);
  assert.equal(il.taxableIncome, 38575);
  assert.equal(il.totalTax, Math.round(38575 * 0.0495));
});

test('residency is checked before it is saved, and the save is audited', async () => {
  const state = await household({ state: 'IL', forms: [w2(1000, { state: 'IL' })] });
  const bad = await runTool(state, 'set_us_state_residency', { taxYear: '2025', states: [{ state: 'IL', residency: 'full-year' }, { state: 'CA', residency: 'full-year' }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'STATE_RESIDENCY_INVALID');
  const overlap = await runTool(state, 'set_us_state_residency', { taxYear: '2025', states: [{ state: 'IL', residency: 'part-year', from: '2025-01-01', to: '2025-07-01' }, { state: 'IN', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }] });
  assert.equal(overlap.ok, false);
  const unknown = await runTool(state, 'set_us_state_residency', { taxYear: '2025', states: [{ state: 'IL', residency: 'full-year', answers: { nonsense: 1 } }] });
  assert.equal(unknown.ok, false);
  await residency(state, '2025', [{ state: 'IL', residency: 'full-year', answers: { useTax: 0 } }]);
  assert.ok(state.auditEvents.some((event) => event.action === 'us_state_residency_set'));
  const questions = await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'IL' });
  assert.equal(questions.data.states[0].questions.find((item) => item.id === 'useTax').answer, 0);
});

test('the filing package carries each computed state for the partner and blocks provisional or unreviewed figures', async () => {
  const state = await household({ taxYear: '2026', state: 'IL', forms: [w2(50000, { state: 'IL', stateWithheld: 2000 })] });
  const before = process.env.MYCA_US_FILER;
  process.env.MYCA_US_FILER = 'column-tax';
  const pack = await runTool(state, 'us_state_filing_package', { taxYear: '2026' });
  delete process.env.MYCA_US_FILER;
  const direct = await runTool(state, 'us_state_filing_package', { taxYear: '2026' });
  if (before !== undefined) process.env.MYCA_US_FILER = before;
  assert.equal(pack.ok, true, JSON.stringify(pack));
  const il = pack.data.packages[0];
  assert.equal(il.form, 'IL-1040');
  assert.equal(il.route, 'partner');
  assert.equal(pack.data.route, 'partner');
  assert.equal(il.ready, false);
  assert.ok(il.blockers.includes('STATE_FIGURES_PROVISIONAL'));
  assert.equal(il.blockers.includes('STATE_MEF_NOT_BUILT'), false);
  assert.equal(pack.data.contract, 'us-state-filing-v1');
  assert.equal(direct.data.route, 'irs-mef');
  assert.equal(direct.data.packages[0].route, 'irs-mef');
  assert.ok(direct.data.packages[0].blockers.includes('STATE_MEF_NOT_BUILT'));
  assert.match(direct.data.routeNote, /straight to the IRS/);
});

test('the rule reader reports the records used and a missing record', () => {
  const reader = stateRuleReader('IL', '2025');
  assert.ok(reader.read('income-tax'));
  assert.equal(reader.read('does-not-exist'), null);
  const report = reader.report();
  assert.deepEqual(report.rulesUsed, ['us.state-return.il.income-tax@2025-01-01']);
  assert.deepEqual(report.missingRules, ['us.state-return.il.does-not-exist']);
});

test('the words read like a reply', async () => {
  const state = await household({ state: 'IL', forms: [w2(60000, { state: 'IL', stateWithheld: 2900 })] });
  const result = await runTool(state, 'us_state_coverage', {});
  assert.ok(result.data.built.some((item) => item.state === 'IL'));
});

test('Illinois: a filer someone else can claim keeps the exemption only while base income is at or below it', async () => {
  const { createState } = await import('../src/store.mjs');
  const make = async (wages) => {
    const state = createState();
    state.company = { name: 'Student', country: 'US', entityType: 'household' };
    await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'single', taxpayer: { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-3458', dateOfBirth: '2006-03-03', canBeClaimedAsDependent: true }, address: { line1: '1 Main St', city: 'Urbana', state: 'IL', zip: '61801' } });
    await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'Cafe', fields: w2(wages, { state: 'IL' }).fields });
    return stateReturn(state, '2025', 'IL');
  };
  assert.equal((await make(2800)).lines['10a'], 2850);
  assert.equal((await make(9000)).lines['10a'], 0);
});

test('one state\'s answers save without touching where you lived, and a null clears an answer', async () => {
  const state = await household({ state: 'IL', forms: [w2(60000, { state: 'IL', stateWithheld: 2900 })] });
  const saved = await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'IL', answers: { useTax: 40, propertyTaxPaid: 3000 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const out = await runTool(state, 'us_state_returns', { taxYear: '2025' });
  assert.equal(out.data.residencyAssumed, true, 'the residency stays assumed');
  const il = out.data.returns.find((item) => item.state === 'IL');
  assert.equal(il.lines['21'], 40);
  assert.equal(il.schedules.ICR.propertyTaxCredit, 150);
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'IL', answers: { propertyTaxPaid: null } });
  const questions = await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'IL' });
  const byId = Object.fromEntries(questions.data.states[0].questions.map((item) => [item.id, item.answer]));
  assert.equal(byId.useTax, 40);
  assert.equal(byId.propertyTaxPaid, null);
  await runTool(state, 'set_us_state_residency', { taxYear: '2025', states: [{ state: 'IL', residency: 'full-year' }] });
  assert.equal((await runTool(state, 'us_state_returns', { taxYear: '2025' })).data.returns[0].lines['21'], 40, 'saving residency keeps the answers');
  assert.equal((await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'IL', answers: { notAQuestion: 1 } })).error, 'STATE_ANSWERS_INVALID');
  assert.equal((await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'TX', answers: { useTax: 1 } })).error, 'STATE_HAS_NO_QUESTIONS');
  assert.ok(state.auditEvents.some((item) => item.action === 'us_state_answers_set'));
});

test('every state question condition uses known facts, residencies and question ids', async () => {
  const { STATE_MODULES } = await import('../src/countries/united-states/states/index.mjs');
  const { QUESTION_FACTS } = await import('../src/countries/united-states/state-returns.mjs');
  for (const module of STATE_MODULES.filter((item) => item.built)) {
    const ids = new Set((module.questions || []).map((item) => item.id));
    for (const question of module.questions || []) {
      const when = question.when;
      if (!when) continue;
      assert.deepEqual(Object.keys(when).filter((key) => !['residency', 'filingStatus', 'has', 'answer'].includes(key)), [], `${module.code} ${question.id}`);
      for (const item of when.residency || []) assert.ok(['full-year', 'part-year', 'nonresident'].includes(item), `${module.code} ${question.id} ${item}`);
      for (const item of when.filingStatus || []) assert.ok(['single', 'mfj', 'mfs', 'hoh', 'qss'].includes(item), `${module.code} ${question.id} ${item}`);
      for (const item of when.has || []) assert.ok(QUESTION_FACTS.includes(item), `${module.code} ${question.id} ${item}`);
      if (when.answer) assert.ok(ids.has(when.answer.id) && when.answer.id !== question.id, `${module.code} ${question.id} answer ${when.answer.id}`);
    }
  }
});

test('New York asks the part-year city questions only of a part-year city resident', async () => {
  const state = await household({ state: 'NY', forms: [w2(60000, { state: 'NY', stateWithheld: 2900 })] });
  const ids = async () => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'NY' })).data.states[0].questions.map((item) => item.id);
  const first = await ids();
  assert.ok(first.includes('nycResident'));
  assert.equal(first.includes('nycMonths'), false);
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'NY', answers: { nycResident: 'part-year' } });
  assert.ok((await ids()).includes('nycMonths'));
});
