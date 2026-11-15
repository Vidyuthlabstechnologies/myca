import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { usStateTax, usStateTaxWords } from '../src/us-state-tax.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const w2 = (wages, withheld, state, stateWithheld) => ({ wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100, state, stateWages: wages, stateWithheld });

const DEPENDENT = { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2016-02-02', months: 12 };

async function household(code, { filingStatus = 'single', dateOfBirth = '1988-04-02', stateWithheld = 0, wages = 60000, dependents, spouse } = {}) {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus, taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth, occupation: 'Nurse' }, spouse, dependents, address: { line1: '1 Main St', city: 'Springfield', state: code, zip: '62701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'St. Mary Hospital', payerTin: '12-3456789', fields: w2(wages, 7000, code, stateWithheld) });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

test('a state with no individual income tax needs no state return', async () => {
  const state = await household('TX');
  const result = usStateTax(state, { taxYear: '2025' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.kind, 'no-income-tax');
  assert.equal(result.data.returnNeeded, false);
  assert.match(usStateTaxWords(result.data), /Texas levies no individual income tax/);
  assert.equal(usStateTax(state, { taxYear: '2025', state: 'wa' }).data.kind, 'capital-gains-only');
});

test('Illinois: federal AGI less $2,850 a person at 4.95%, against the W-2 withholding', async () => {
  const state = await household('IL', { stateWithheld: 2900 });
  const result = usStateTax(state, { taxYear: '2025' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.federalAgi, 60000);
  assert.equal(result.data.exemption, 2850);
  assert.equal(result.data.taxableIncome, 57150);
  assert.equal(result.data.tax, 2829);
  assert.equal(result.data.refund, 71);
  assert.equal(result.data.owed, 0);
  assert.deepEqual(result.data.rulesUsed, ['us.state.individual.IL']);
  const words = usStateTaxWords(result.data);
  assert.match(words, /Illinois income tax for 2025 is about \$2,829/);
  assert.match(words, /about \$71 would come back/);
  assert.match(words, /does not file Form IL-1040 yet/);
});

test('Illinois gives $1,000 more at 65 and no exemption above $250,000 of federal AGI', async () => {
  const senior = usStateTax(await household('IL', { dateOfBirth: '1950-01-15' }), { taxYear: '2025' });
  assert.equal(senior.data.exemption, 3850);
  const high = usStateTax(await household('IL', { wages: 300000 }), { taxYear: '2025' });
  assert.equal(high.data.exemption, 0);
  assert.equal(high.data.tax, Math.round(high.data.federalAgi * 0.0495));
});

test('Michigan: $5,800 a person at 4.25%', async () => {
  const result = usStateTax(await household('MI'), { taxYear: '2025' });
  assert.equal(result.data.exemption, 5800);
  assert.equal(result.data.tax, 2304);
  assert.equal(result.data.owed, 2304);
});

test('North Carolina: the state standard deduction at 4.25%', async () => {
  const result = usStateTax(await household('NC', { filingStatus: 'single' }), { taxYear: '2025' });
  assert.equal(result.data.standardDeduction, 12750);
  assert.equal(result.data.exemption, 0);
  assert.equal(result.data.taxableIncome, 47250);
  assert.equal(result.data.tax, 2008);
  assert.match(usStateTaxWords(result.data), /less the \$12,750 standard deduction, at 4.25%/);
});

test('Colorado: 4.4% of federal taxable income', async () => {
  const result = usStateTax(await household('CO', { stateWithheld: 2000 }), { taxYear: '2025' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.start, 'federal taxable income');
  assert.equal(result.data.startAmount, 44250);
  assert.equal(result.data.exemption, 0);
  assert.equal(result.data.standardDeduction, 0);
  assert.equal(result.data.tax, 1947);
  assert.equal(result.data.refund, 53);
  const words = usStateTaxWords(result.data);
  assert.match(words, /Colorado income tax for 2025 is about \$1,947: \$44,250 of federal taxable income, at 4.4%/);
  assert.match(words, /does not file Form DR 0104 yet/);
});

test('Georgia: the $12,000 standard deduction and $4,000 a dependent at 5.19%', async () => {
  const alone = usStateTax(await household('GA'), { taxYear: '2025' });
  assert.equal(alone.data.standardDeduction, 12000);
  assert.equal(alone.data.exemption, 0);
  assert.equal(alone.data.taxableIncome, 48000);
  assert.equal(alone.data.tax, 2491);
  const parent = usStateTax(await household('GA', { filingStatus: 'hoh', dependents: [DEPENDENT] }), { taxYear: '2025' });
  assert.equal(parent.ok, true, JSON.stringify(parent));
  assert.equal(parent.data.standardDeduction, 12000);
  assert.equal(parent.data.exemption, 4000);
  assert.equal(parent.data.taxableIncome, 44000);
  assert.equal(parent.data.tax, 2284);
});

test('Kentucky: one $3,270 standard deduction at 4%', async () => {
  const result = usStateTax(await household('KY'), { taxYear: '2025' });
  assert.equal(result.data.standardDeduction, 3270);
  assert.equal(result.data.taxableIncome, 56730);
  assert.equal(result.data.tax, 2269);
});

test('Louisiana: the $12,500 standard deduction at a flat 3%', async () => {
  const result = usStateTax(await household('LA'), { taxYear: '2025' });
  assert.equal(result.data.standardDeduction, 12500);
  assert.equal(result.data.exemption, 0);
  assert.equal(result.data.taxableIncome, 47500);
  assert.equal(result.data.tax, 1425);
  assert.match(usStateTaxWords(result.data), /\$60,000 of federal AGI less the \$12,500 standard deduction, at 3%/);
});

test('other states and years are refused plainly, and the tool is read-only', async () => {
  const state = await household('CA');
  const result = usStateTax(state, { taxYear: '2025' });
  assert.equal(result.error, 'STATE_NOT_SUPPORTED_YET');
  assert.ok(result.supported.includes('IL'));
  assert.equal(usStateTax(state, { taxYear: '2026' }).error, 'TAX_YEAR_NOT_SUPPORTED');
  assert.equal(usStateTax(createState(), { taxYear: '2025' }).error, 'US_RETURN_NOT_STARTED');
  assert.equal(isRemoteQuery('us_state_tax'), true);
  assert.equal(validateAssistantToolCall('us_state_tax', { taxYear: '2025', state: 'IL' }).ok, true);
  const noYear = usStateTax(await household('MI'), {});
  assert.equal(noYear.ok, true, JSON.stringify(noYear));
  assert.equal(noYear.data.taxYear, '2025');
  assert.equal(usStateTax(createState(), {}).error, 'US_RETURN_NOT_STARTED');
  const viaTool = await runTool(await household('MI'), 'us_state_tax', { taxYear: '2025' });
  assert.equal(viaTool.ok, true, JSON.stringify(viaTool));
});
