import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssistantToolCall } from '../src/assistant-tools.mjs';
import { addUsTaxForm, coerceFields } from '../src/us-return.mjs';

test('answer_us_interview accepts a yes/no, an amount, a choice or a cleared answer', () => {
  for (const answer of [false, true, 1250.5, 'auto', null]) assert.equal(validateAssistantToolCall('answer_us_interview', { taxYear: '2025', id: 'digitalAssets', answer }).ok, true, String(answer));
  assert.equal(validateAssistantToolCall('answer_us_interview', { taxYear: '2025', id: 'digitalAssets', answer: { a: 1 } }).ok, false);
});

test('US tools take the tax year as the app sends it, a number or a string', () => {
  for (const taxYear of [2025, '2025']) {
    assert.equal(validateAssistantToolCall('set_us_taxpayer', { taxYear, filingStatus: 'single' }).ok, true);
    assert.equal(validateAssistantToolCall('add_us_tax_form', { taxYear, kind: 'W-2', fields: { wages: 1 } }).ok, true);
    assert.equal(validateAssistantToolCall('remove_us_tax_form', { taxYear, id: 'usf-2025-1' }).ok, true);
    assert.equal(validateAssistantToolCall('us_efile_status', { taxYear }).ok, true);
  }
  assert.equal(validateAssistantToolCall('us_return_review', { taxYear: 1999 }).ok, false);
  assert.equal(validateAssistantToolCall('us_return_review', { taxYear: '25' }).ok, false);
});

test('add_us_tax_form with the id of an existing form replaces it instead of adding a duplicate', () => {
  const state = {};
  const first = addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme', fields: { wages: 1000 } });
  assert.equal(validateAssistantToolCall('add_us_tax_form', { taxYear: 2025, id: first.data.id, kind: 'W-2', payer: 'Acme', fields: { wages: 2000 }, documentSha256: 'a'.repeat(64) }).ok, true);
  const second = addUsTaxForm(state, { taxYear: '2025', id: first.data.id, kind: 'W-2', payer: 'Acme', fields: { wages: 2000 } });
  assert.equal(second.data.id, first.data.id);
  assert.equal(state.usReturns['2025'].forms.length, 1);
  assert.equal(state.usReturns['2025'].forms[0].fields.wages, 2000);
  assert.equal(addUsTaxForm(state, { taxYear: '2025', id: 'usf-2025-99', kind: 'W-2', payer: 'Acme', fields: { wages: 1 } }).error, 'US_TAX_FORM_NOT_FOUND');
});

test('a typed "no" on a yes/no box is saved as no, and 1099-B basis or withholding cannot be negative', () => {
  assert.equal(coerceFields('1098-T', { tuitionPaid: 5000, graduate: 'false', atLeastHalfTime: 'yes' }, []).graduate, false);
  assert.equal(coerceFields('W-2', { wages: 1, retirementPlan: 'no' }, []).retirementPlan, false);
  const problems = [];
  coerceFields('1099-B', { proceeds: 100, costBasis: -5000, federalWithheld: -300, term: 'short' }, problems);
  assert.equal(problems.length, 2);
});
