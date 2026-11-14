import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

test('B1: the business state comes from its GSTIN, and a state that contradicts the GSTIN is refused', async () => {
  const state = createState();
  const set = await runTool(state, 'set_company', { name: 'Surat Silk', gstin: '24AAACG1234F1ZA' });
  assert.equal(set.ok, true);
  assert.equal(state.company.state, '24');

  const both = await runTool(state, 'set_company', { gstin: '24AAACG1234F1ZA', state: '29' });
  assert.equal(both.ok, false);
  assert.equal(both.error, 'STATE_NOT_GSTIN_STATE');
  assert.equal(state.company.state, '24');

  const later = await runTool(state, 'set_company', { state: '27' });
  assert.equal(later.error, 'STATE_NOT_GSTIN_STATE');
  assert.equal(state.company.state, '24');

  const same = await runTool(state, 'set_company', { gstin: '24AAACG1234F1ZA', state: '24' });
  assert.equal(same.ok, true);
});

test('B3: without a GSTIN any state can be chosen, and clearing the GSTIN frees the state', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'set_company', { name: 'Kiran Stores', gstin: '', state: '29' })).ok, true);
  assert.equal(state.company.state, '29');
  await runTool(state, 'set_company', { gstin: '24AAACG1234F1ZA' });
  assert.equal(state.company.state, '24');
  assert.equal((await runTool(state, 'set_company', { gstin: '', state: '29' })).ok, true);
  assert.equal(state.company.state, '29');
});
