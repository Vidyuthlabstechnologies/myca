import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';

const state = createState();

test('C2 chat: only an explicit generate command routes to IRN generation', () => {
  for (const text of ['generate irn INV-0002', 'generate e-invoice for INV-0002', 'irn INV-0002']) {
    const plan = planLocalToolCall(state, text);
    assert.equal(plan.name, 'govt_generate_irn', text);
  }
});

test('C2 chat: cancel, questions and negations never route to IRN generation', () => {
  const cancel = planLocalToolCall(state, 'cancel irn INV-0002');
  assert.equal(cancel.name, 'govt_nic_cancel_irn');
  assert.equal(cancel.args.invoiceId, 'INV-0002');
  for (const text of ['what is the irn of INV-0001', 'what is the irn of INV-0001?', 'has INV-0001 got an irn?', 'do not generate irn for INV-0003', "don't generate irn INV-0003", 'show irn status for INV-0001?']) {
    const plan = planLocalToolCall(state, text);
    assert.notEqual(plan?.name, 'govt_generate_irn', text);
  }
});
