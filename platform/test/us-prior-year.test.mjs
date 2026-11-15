import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { importUsPriorYear, usPriorYearPreview, usPriorYearWords } from '../src/us-prior-year.mjs';
import { computedForm1040ForFiling } from '../src/us-return.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { CONFIRM_TOOLS } from '../src/chat-confirm.mjs';

const w2 = (wages, withheld) => ({ wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 });

async function lastYear() {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'hoh', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9999', dateOfBirth: '2015-06-01', relationship: 'son', months: 12 }], address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  for (const form of [{ kind: 'W-2', payer: 'St. Mary Hospital', payerTin: '12-3456789', fields: w2(60000, 7000) }, { kind: '1099-INT', payer: 'First Bank', fields: { interest: 300 } }, { kind: '1099-B', payer: 'Brokerage', fields: { proceeds: 1000, costBasis: 9000, term: 'long' } }]) {
    const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', ...form });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  return state;
}

test('last year\'s MyCA return starts this year: profile, sealed SSNs, AGI, tax, loss carryover and the forms to expect', async () => {
  const state = await lastYear();
  const review = await runTool(state, 'us_return_review', { taxYear: '2025' });
  const preview = usPriorYearPreview(state, { taxYear: '2026' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Bring 2025 into the 2026 return from your MyCA return/);
  const result = importUsPriorYear(state, { taxYear: '2026' });
  assert.equal(result.ok, true, JSON.stringify(result));
  const d = result.data;
  assert.equal(d.source, 'myca');
  assert.equal(d.profileCopied, true);
  assert.equal(d.answers.priorYearAgi, review.data.summary.agi);
  assert.equal(d.answers.priorYearTax, review.data.summary.totalTax);
  assert.equal(d.answers.longTermLossCarryover, 5000);
  assert.deepEqual(d.expectedForms.map((form) => form.kind), ['W-2', '1099-INT', '1099-B']);
  const profile = await runTool(state, 'us_taxpayer', { taxYear: '2026' });
  assert.equal(profile.data.filingStatus, 'hoh');
  assert.equal(profile.data.taxpayer.ssnLast4, '3456');
  assert.equal(profile.data.dependents[0].ssnLast4, '9999');
  assert.equal(profile.data.address.city, 'Austin');
  const filing = computedForm1040ForFiling(state, { taxYear: '2026' });
  assert.equal(filing.ok, true, JSON.stringify(filing).slice(0, 300));
  const forms = await runTool(state, 'list_us_tax_forms', { taxYear: '2026' });
  assert.equal(forms.data.forms.length, 0);
  assert.ok(state.auditEvents.some((event) => event.action === 'us_prior_year_imported'));
  assert.match(usPriorYearWords(d), /Brought 2025 into your 2026 return, copied your profile and dependents, filled 3 answers\. Expect 3 forms again: W-2 from St\. Mary Hospital/);
});

test('answers and a profile already on this year\'s return are kept unless overwrite is asked', async () => {
  const state = await lastYear();
  await runTool(state, 'set_us_taxpayer', { taxYear: '2026', filingStatus: 'single', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456' } });
  await runTool(state, 'answer_us_interview', { taxYear: '2026', id: 'priorYearTax', answer: 1 });
  const kept = importUsPriorYear(state, { taxYear: '2026' });
  assert.equal(kept.data.profileCopied, false);
  assert.deepEqual(kept.data.keptYourAnswers, ['priorYearTax']);
  assert.equal((await runTool(state, 'us_taxpayer', { taxYear: '2026' })).data.filingStatus, 'single');
  const over = importUsPriorYear(state, { taxYear: '2026', overwrite: true });
  assert.ok(over.data.answers.priorYearTax > 1);
});

test('a return already begun with only answers still gets the profile, with SSNs sealed again for it', async () => {
  const state = await lastYear();
  await runTool(state, 'answer_us_interview', { taxYear: '2026', id: 'otherIncome', answer: 50 });
  const result = importUsPriorYear(state, { taxYear: '2026' });
  assert.equal(result.data.profileCopied, true);
  assert.notEqual(state.usReturns['2026'].scopeId, state.usReturns['2025'].scopeId);
  const filing = computedForm1040ForFiling(state, { taxYear: '2026' });
  assert.equal(filing.ok, true, JSON.stringify(filing).slice(0, 300));
  assert.equal((await runTool(state, 'us_taxpayer', { taxYear: '2026' })).data.dependents[0].ssnLast4, '9999');
});

test('a return prepared elsewhere comes in as typed figures, and bad figures are refused', async () => {
  const state = createState();
  state.company = { name: 'Lee household', country: 'US', entityType: 'household' };
  assert.equal(importUsPriorYear(state, { taxYear: '2025' }).error, 'US_PRIOR_YEAR_NOTHING');
  const result = importUsPriorYear(state, { taxYear: '2025', figures: { agi: 85000, totalTax: 9100.4, overpaymentApplied: 500, shortTermLossCarryover: 1200 } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.source, 'figures');
  assert.deepEqual(result.data.answers, { priorYearAgi: 85000, priorYearTax: 9100.4, priorYearOverpaymentApplied: 500, shortTermLossCarryover: 1200 });
  const interview = await runTool(state, 'us_interview', { taxYear: '2025' });
  assert.equal(interview.data.questions.find((question) => question.id === 'priorYearTax').answer, 9100.4);
  assert.equal(importUsPriorYear(state, { taxYear: '2025', figures: { agi: -1 } }).error, 'US_PRIOR_YEAR_INVALID');
  assert.equal(importUsPriorYear(state, { taxYear: '2025', figures: { refund: 5 } }).error, 'US_PRIOR_YEAR_INVALID');
  assert.equal(importUsPriorYear(state, { taxYear: '2025', figures: { constructor: 5 } }).error, 'US_PRIOR_YEAR_INVALID');
  assert.equal(importUsPriorYear(state, { taxYear: '2025', figures: JSON.parse('{"__proto__": 5}') }).error, 'US_PRIOR_YEAR_INVALID');
  assert.equal(importUsPriorYear(state, { taxYear: '2019' }).error, 'TAX_YEAR_NOT_SUPPORTED');
});

test('the tool is registered as a confirmed write with a strict schema', async () => {
  assert.ok(CONFIRM_TOOLS.has('import_us_prior_year'));
  assert.equal(validateAssistantToolCall('import_us_prior_year', { taxYear: '2026', figures: { agi: 1 } }).ok, true);
  assert.equal(validateAssistantToolCall('import_us_prior_year', { taxYear: '2026', figures: { other: 1 } }).ok, false);
  const state = await lastYear();
  const ran = await runTool(state, 'import_us_prior_year', { taxYear: '2026' });
  assert.equal(ran.ok, true, JSON.stringify(ran));
});

test('a refund applied to this year on last year\'s MyCA return comes in as the overpayment applied', async () => {
  const state = await lastYear();
  await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'applyToNextYear', answer: 400 });
  const result = importUsPriorYear(state, { taxYear: '2026' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.answers.priorYearOverpaymentApplied, 400);
});
