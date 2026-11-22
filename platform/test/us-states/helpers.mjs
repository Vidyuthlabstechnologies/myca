import assert from 'node:assert/strict';
import { createState } from '../../src/store.mjs';
import { runTool } from '../../src/tools.mjs';

export const w2 = (wages, { federalWithheld = Math.round(wages * 0.1), state = '', stateWages = wages, stateWithheld = 0, localWithheld = 0, owner } = {}) => ({ fields: { wages, federalWithheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100, state, stateWages, stateWithheld, localWithheld }, owner });

export async function household({ taxYear = '2025', filingStatus = 'single', state: home = 'IL', dateOfBirth = '1985-04-02', spouse, dependents, forms = [], answers = {} } = {}) {
  const state = createState();
  state.company = { name: 'Test household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear, filingStatus, taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth, occupation: 'Nurse' }, spouse, dependents, address: { line1: '1 Main St', city: 'Springfield', state: home, zip: '62701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  for (const [index, form] of forms.entries()) {
    const added = await runTool(state, 'add_us_tax_form', { taxYear, kind: form.kind || 'W-2', payer: form.payer || `Payer ${index + 1}`, payerTin: '12-3456789', ...(form.owner ? { owner: form.owner } : {}), fields: form.fields });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  for (const [id, value] of Object.entries(answers)) {
    const answered = await runTool(state, 'answer_us_interview', { taxYear, id, answer: value });
    assert.equal(answered.ok, true, JSON.stringify(answered));
  }
  return state;
}

export async function residency(state, taxYear, states) {
  const saved = await runTool(state, 'set_us_state_residency', { taxYear, states });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return saved;
}

export async function stateReturn(state, taxYear, code) {
  const result = await runTool(state, 'us_state_returns', { taxYear, state: code });
  assert.equal(result.ok, true, JSON.stringify(result));
  const found = result.data.returns[0];
  assert.ok(found, `no ${code} return`);
  return found;
}
