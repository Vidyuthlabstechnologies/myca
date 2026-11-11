import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, regularTax, tableMidpoint } from '../src/us-1040.mjs';
import { computedForm1040, computedForm1040ForFiling } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { previewOf, CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const w2 = (wages, withheld = 0, extra = {}) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 0.062 * 100) / 100, medicareWages: wages, medicareTax: Math.round(wages * 0.0145 * 100) / 100, ...extra } });
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1988-04-02' };
const single = (forms, more = {}) => computeForm1040({ filingStatus: 'single', taxpayer: adult, forms, ...more }, more.taxYear || '2025');
const bands2025 = () => rules.rule('us.federal.individual.brackets', '2025-12-31').value;

test('the Tax Table method taxes the middle of the band below $100,000 and the exact amount above', () => {
  assert.equal(tableMidpoint(34250), 34275);
  assert.equal(tableMidpoint(2010), 2012.5);
  assert.equal(tableMidpoint(3), 0);
  assert.equal(regularTax(34250, bands2025().single), 3875);
  assert.equal(regularTax(150000, bands2025().single), 28847);
  assert.equal(regularTax(0, bands2025().single), 0);
});

test('a single W-2 earner gets the 2025 standard deduction and a refund of the over-withholding', () => {
  const out = single([w2(50000, 5000)]);
  assert.equal(out.ok, true);
  const l = out.data.lines;
  assert.equal(l['1a'], 50000);
  assert.equal(l['11'], 50000);
  assert.equal(l['12'], 15750);
  assert.equal(l['15'], 34250);
  assert.equal(l['16'], 3875);
  assert.equal(l['24'], 3875);
  assert.equal(l['25a'], 5000);
  assert.equal(l['35a'], 1125);
  assert.equal(l['37'], 0);
  assert.ok(Object.values(l).every(Number.isInteger));
  assert.equal(out.data.unreviewed, true);
});

test('2026 uses the 2026 standard deduction and brackets', () => {
  const out = single([w2(50000, 0)], { taxYear: '2026' });
  assert.equal(out.data.lines['12'], 16100);
  assert.equal(out.data.lines['15'], 33900);
  assert.ok(out.data.rulesUsed.includes('us.federal.individual.brackets@2026-01-01'));
  assert.equal(computeForm1040({ filingStatus: 'single' }, '2027').error, 'TAX_YEAR_NOT_SUPPORTED');
});

test('head of household with two children: EIC from the $50 band, child tax credit limited to tax, the rest refundable', () => {
  const kids = [{ firstName: 'Mia', relationship: 'daughter', dateOfBirth: '2015-03-01', months: 12 }, { firstName: 'Leo', relationship: 'son', dateOfBirth: '2018-09-12', months: 12 }];
  const out = computeForm1040({ filingStatus: 'hoh', taxpayer: adult, dependents: kids, forms: [w2(30000, 1200)] }, '2025');
  const l = out.data.lines;
  assert.equal(l['12'], 23625);
  assert.equal(l['15'], 6375);
  assert.equal(l['16'], 638);
  assert.equal(l['19'], 638);
  assert.equal(l['22'], 0);
  assert.equal(l['27'], 5746);
  assert.equal(l['28'], 3400);
  assert.equal(l['35a'], 1200 + 5746 + 3400);
  assert.equal(out.data.schedules['8812']['16b'], 3400);
  assert.deepEqual(out.data.checks.filter((item) => item.level === 'error'), []);
});

test('a capital loss is limited to $3,000 and the rest carries forward', () => {
  const out = single([w2(60000), { kind: '1099-B', payer: 'Broker', fields: { proceeds: 5000, costBasis: 15000, term: 'short' } }]);
  assert.equal(out.data.lines['7'], -3000);
  assert.equal(out.data.lines['9'], 57000);
  assert.equal(out.data.schedules.D['21'], -3000);
  assert.deepEqual(out.data.capitalLossCarryover, { shortTerm: 7000, longTerm: 0 });
  assert.equal(out.data.schedules['8949'][0].box, 'A');
});

test('long-term gains and qualified dividends inside the 0% band pay no tax', () => {
  const out = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse: { firstName: 'Sam', lastName: 'Diaz', dateOfBirth: '1987-01-05' }, forms: [w2(85000), { kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: 2000, qualifiedDividends: 1500, capitalGainDistributions: 300 } }, { kind: '1099-B', payer: 'Broker', fields: { proceeds: 10000, costBasis: 7000, term: 'long' } }] }, '2025');
  assert.equal(out.data.lines['15'], 58800);
  assert.equal(out.data.qualifiedDividendsWorksheet['9'], 4800);
  assert.equal(out.data.lines['16'], regularTax(54000, bands2025().mfj));
  assert.equal(out.data.schedules.B['6'], 2000);
});

test('self-employment: Schedule SE, half deducted, and the QBI deduction limited by taxable income', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult, dateOfBirth: '1990-05-05' }, businesses: [{ name: 'Design studio', grossReceipts: 60000, totalExpenses: 10000 }] }, '2025');
  const se = out.data.schedules.SE[0].lines;
  assert.equal(se['4a'], 46175);
  assert.equal(se['12'], 7065);
  assert.equal(se['13'], 3533);
  const l = out.data.lines;
  assert.equal(l['8'], 50000);
  assert.equal(l['11'], 46467);
  assert.equal(l['13a'], 6143);
  assert.equal(l['15'], 24574);
  assert.equal(l['16'], 2711);
  assert.equal(l['23'], 7065);
  assert.equal(l['24'], 9776);
  assert.equal(l['37'], 9776);
});

test('a 1099-NEC with no business entered becomes its own Schedule C', () => {
  const out = single([{ kind: '1099-NEC', payer: 'Client LLC', fields: { nonemployeeCompensation: 12000 } }]);
  assert.equal(out.data.schedules.C[0].lines['1'], 12000);
  assert.equal(out.data.schedules.SE[0].lines['12'] > 0, true);
});

test('a retiree: taxable Social Security from the worksheet, extra standard deduction and the senior deduction', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { firstName: 'Ruth', lastName: 'Lee', dateOfBirth: '1955-02-10' }, forms: [{ kind: 'SSA-1099', fields: { netBenefits: 30000 } }, { kind: '1099-R', payer: 'Pension Co', fields: { grossDistribution: 20000, taxableAmount: 20000, distributionCode: '7' } }] }, '2025');
  const l = out.data.lines;
  assert.equal(l['6b'], 5350);
  assert.equal(l['11'], 25350);
  assert.equal(l['12'], 17750);
  assert.equal(l['13b'], 6000);
  assert.equal(l['15'], 1600);
  assert.equal(l['16'], 161);
});

test('the SALT cap phases down to its floor at high income and itemizing is chosen only when larger', () => {
  const rich = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse: { firstName: 'Sam', lastName: 'Diaz', dateOfBirth: '1987-01-05' }, forms: [w2(600000, 150000, { stateWithheld: 45000 })], answers: { realEstateTaxes: 15000, charityCash: 30000 } }, '2025');
  assert.equal(rich.data.schedules.A['5e'], 10000);
  assert.equal(rich.data.schedules.A['17'], 40000);
  assert.equal(rich.data.lines['12'], 40000);
  const modest = single([w2(70000, 0, { stateWithheld: 3000 })], { answers: { charityCash: 500 } });
  assert.equal(modest.data.summary.itemized, false);
  assert.equal(modest.data.lines['12'], 15750);
});

test('net investment income tax and additional Medicare tax for a high earner', () => {
  const out = single([w2(250000, 50000), { kind: '1099-INT', payer: 'Bank', fields: { interest: 20000 } }]);
  assert.equal(out.data.schedules['8960']['17'], 760);
  assert.equal(out.data.schedules['8959']['7'], 450);
  assert.equal(out.data.schedules['2']['21'], 1210);
  assert.ok(out.data.schedules.B);
});

test('tips and overtime deductions shrink with income and need a joint return when married', () => {
  const tipped = single([w2(40000)], { answers: { qualifiedTips: 8000, qualifiedOvertime: 3000 } });
  assert.equal(tipped.data.schedules['1-A']['13'], 8000);
  assert.equal(tipped.data.schedules['1-A']['21'], 3000);
  const high = single([w2(160000)], { answers: { qualifiedTips: 8000 } });
  assert.equal(high.data.schedules['1-A']['13'], 7000);
  const separate = computeForm1040({ filingStatus: 'mfs', taxpayer: adult, forms: [w2(40000)], answers: { qualifiedTips: 8000 } }, '2025');
  assert.equal(separate.data.lines['13b'], 0);
  assert.ok(separate.data.checks.some((item) => item.code === 'TIPS_MFS'));
});

test('the American opportunity credit is 40% refundable and phases out on modified AGI', () => {
  const out = single([w2(40000, 3000), { kind: '1098-T', payer: 'State University', fields: { tuitionPaid: 5000, atLeastHalfTime: true } }]);
  assert.equal(out.data.schedules['8863']['1'], 2500);
  assert.equal(out.data.lines['29'], 1000);
  assert.equal(out.data.schedules['3']['3'], 1500);
  const phased = single([w2(85000), { kind: '1098-T', payer: 'State University', fields: { tuitionPaid: 5000, atLeastHalfTime: true } }]);
  assert.equal(phased.data.schedules['8863']['7'], 1250);
});

test('head of household without a qualifying person is an error the review shows', () => {
  const out = computeForm1040({ filingStatus: 'hoh', taxpayer: adult, forms: [w2(40000)] }, '2025');
  assert.ok(out.data.checks.some((item) => item.code === 'HOH_NEEDS_QUALIFYING_PERSON' && item.level === 'error'));
});

function usHousehold() {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  return state;
}

test('the return tools keep SSNs sealed, compute the review and walk the steps', async () => {
  const state = usHousehold();
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'single', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(set.data.taxpayer.ssn, '***-**-3456');
  assert.equal(JSON.stringify(state, (key, value) => (typeof value === 'bigint' ? String(value) : value)).includes('400123456'), false);
  assert.equal(JSON.stringify(state, (key, value) => (typeof value === 'bigint' ? String(value) : value)).includes('400-12-3456'), false);
  const saved = await runTool(state, 'us_taxpayer', { taxYear: '2025' });
  assert.equal(saved.data.taxpayer.ssnLast4, '3456');
  assert.equal(saved.data.address.zip, '78701');
  const bad = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '000-12-3456' } });
  assert.equal(bad.ok, false);
  const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'St. Mary Hospital', payerTin: '12-3456789', fields: w2(50000, 5000).fields });
  assert.equal(added.ok, true, JSON.stringify(added));
  const missing = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'X', fields: {} });
  assert.equal(missing.ok, false);
  const listed = await runTool(state, 'list_us_tax_forms', { taxYear: '2025' });
  assert.equal(listed.data.forms.length, 1);
  assert.equal(listed.data.forms[0].owner, 'taxpayer');
  const review = await runTool(state, 'us_return_review', { taxYear: '2025' });
  assert.equal(review.data.refund, 1125);
  assert.ok(review.data.lines.some((row) => row.form === '1040' && row.line === '1a' && row.amount === 50000 && row.source === 'forms'));
  const before = await runTool(state, 'us_return_status', { taxYear: '2025' });
  assert.equal(before.data.taxpayerName, 'Ana Diaz');
  assert.deepEqual(before.data.steps.map((step) => [step.id, step.done]), [['profile', true], ['forms', true], ['interview', false], ['review', true], ['sign', false]]);
  assert.equal(before.data.readyToSign, true);
  const interview = await runTool(state, 'us_interview', { taxYear: '2025' });
  assert.ok(interview.data.questions.some((question) => question.id === 'digitalAssets'));
  assert.equal(interview.data.questions.some((question) => question.id === 'livedWithSpouse'), false);
  const answered = await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'estimatedTaxPayments', answer: 400 });
  assert.equal(answered.ok, true);
  assert.equal((await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'itemize', answer: 'maybe' })).ok, false);
  assert.equal((await runTool(state, 'us_return_review', { taxYear: '2025' })).data.refund, 1525);
  const masked = computedForm1040(state, { taxYear: '2025' });
  assert.equal(masked.data.taxpayer.ssn, '***-**-3456');
  assert.equal(masked.data.w2s[0].ein, '12-3456789');
  assert.equal(masked.data.digitalAssets, false);
  const filing = computedForm1040ForFiling(state, { taxYear: '2025' });
  assert.equal(filing.data.taxpayer.ssn, '400123456');
  const pdf = await runTool(state, 'us_return_pdf', { taxYear: '2025' });
  const bytes = Buffer.from(pdf.data.base64, 'base64').toString('latin1');
  assert.ok(bytes.startsWith('%PDF-1.4') && bytes.trimEnd().endsWith('%%EOF'));
  assert.ok(bytes.includes('***-**-3456') && !bytes.includes('400123456'));
  assert.equal((await runTool(state, 'read_us_tax_document', { documentId: 'a'.repeat(64) })).ok, false);
  const removed = await runTool(state, 'remove_us_tax_form', { id: added.data.id });
  assert.equal(removed.ok, true);
  const actions = state.auditEvents.map((event) => event.action);
  for (const action of ['us_taxpayer_set', 'us_tax_form_added', 'us_interview_answered', 'us_tax_form_removed']) assert.ok(actions.includes(action), action);
  assert.equal(JSON.stringify(state.auditEvents).includes('400123456'), false);
});

test('the US return tools are US-only, previewed before saving, and reads are remote queries', () => {
  for (const name of ['set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview']) {
    assert.equal(CONFIRM_TOOLS.has(name), true, name);
    assert.equal(isRemoteQuery(name), false, name);
  }
  for (const name of ['us_return_status', 'list_us_tax_forms', 'us_interview', 'us_return_review', 'us_form_kinds', 'us_tax_estimate']) assert.equal(isRemoteQuery(name), true, name);
  for (const name of ['us_return_review', 'set_us_taxpayer']) {
    assert.equal(toolServesCountry(name, 'US'), true);
    assert.equal(toolServesCountry(name, 'IN'), false);
  }
  const preview = previewOf(usHousehold(), 'add_us_tax_form', { taxYear: '2025', kind: '1099-INT', payer: 'Bank', fields: { interest: 120 } });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /1099-INT from Bank/);
});

test('the quick estimate uses the same engine and saves nothing', async () => {
  const state = usHousehold();
  const out = await runTool(state, 'us_tax_estimate', { taxYear: '2025', filingStatus: 'single', wages: 50000, federalWithheld: 5000 });
  assert.equal(out.data.summary.refund, 1125);
  assert.deepEqual(state.usReturns, {});
});

test('ask_tax answers a US business from the US module and an Indian one from the Indian modules', async () => {
  const us = await runTool(usHousehold(), 'ask_tax', { question: 'how much is the child tax credit per child?', asOf: '2025-06-01' });
  assert.equal(us.ok, true);
  assert.equal(us.jurisdiction, 'US');
  assert.equal(us.sections[0].ref, 'us-federal-income-tax-individuals/child-tax-credit');
  assert.match(us.sections[0].text, /\$2,200/);
  const india = await runTool(createState(), 'ask_tax', { question: 'standard deduction for salary', asOf: '2025-06-01' });
  assert.ok(india.sections.every((section) => section.module.startsWith('india-')));
});

test('a return lists each form it needs but cannot prepare in unsupported, with a matching check', () => {
  assert.deepEqual(single([w2(50000, 5000)]).data.unsupported, []);
  const owed = single([w2(50000, 0)]);
  assert.deepEqual(owed.data.unsupported, [{ form: '2210', reason: 'Possible estimated tax penalty', code: 'FORM_2210_MAY_APPLY', required: false }]);
  assert.equal(owed.data.checks.find((item) => item.code === 'FORM_2210_MAY_APPLY').level, 'warning');
  assert.deepEqual(single([w2(50000, 0)], { answers: { priorYearTax: 0 } }).data.unsupported, []);
  assert.equal(single([w2(50000, 0)], { answers: { priorYearTax: 3000, priorYearAgi: 160000 } }).data.unsupported.length, 1);
  const out = single([w2(50000, 5000)], { dependents: [{ firstName: 'Leo', lastName: 'Diaz', relationship: 'son', dateOfBirth: '2020-01-01', ssn: true, monthsLived: 12 }], answers: { childCareExpenses: 3000, marketplaceCoverage: true, rentalIncome: true } });
  assert.deepEqual(out.data.unsupported.map((item) => [item.form, item.required]), [['Schedule E', true], ['2441', true], ['8962', true]]);
  for (const need of out.data.unsupported) assert.equal(out.data.checks.find((item) => item.code === need.code).form, need.form);
  assert.equal(out.data.checks.find((item) => item.code === 'FORM_8962_NOT_COVERED').level, 'error');
});

test('the US planning tools project withholding, plan estimated payments and list the supported forms', async () => {
  const state = createState();
  state.company = { ...(state.company || {}), country: 'US' };
  const forms = await runTool(state, 'us_supported_forms', {});
  assert.ok(forms.data.supported.includes('Schedule C') && forms.data.coming.includes('2441'));
  assert.equal((await runTool(state, 'us_withholding_check', { taxYear: '2026', ytdWages: 40000 })).error, 'US_RETURN_NOT_STARTED');
  const check = await runTool(state, 'us_withholding_check', { taxYear: '2026', filingStatus: 'single', payPerPeriod: 2000, withheldPerPeriod: 100, periodsLeft: 5, ytdWages: 50000, ytdWithheld: 2500 });
  assert.equal(check.ok, true);
  assert.equal(check.data.projectedWages, 60000);
  assert.equal(check.data.projectedWithholding, 3000);
  assert.equal(check.data.projectedTax, 5023);
  assert.equal(check.data.gap, 2023);
  assert.equal(check.data.extraPerPaycheck, 405);
  assert.equal(check.data.safeHarbor.basis, 'current_year_90_percent');
  assert.equal(check.data.safeHarbor.requiredAnnualPayment, 4521);
  assert.equal(check.data.safeHarbor.met, false);
  const plan = await runTool(state, 'us_estimated_payments', { taxYear: '2027', filingStatus: 'single' });
  assert.equal(plan.error, 'TAX_YEAR_NOT_SUPPORTED');
  const est = await runTool(state, 'us_estimated_payments', { taxYear: '2026', filingStatus: 'single', expectedSideIncome: 40000 });
  assert.equal(est.ok, true);
  assert.deepEqual(est.data.quarters.map((item) => item.due), ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15']);
  assert.equal(est.data.quarters.reduce((total, item) => total + item.amount, 0), est.data.requiredAnnualPayment - est.data.paidSoFar);
  assert.equal(est.data.safeHarborBasis, 'current_year_90_percent');
  assert.equal(est.data.requiredAnnualPayment, Math.round(est.data.projectedTax * 0.9));
  assert.equal((await runTool(state, 'read_irs_letter', { documentId: 'a'.repeat(64) })).ok, false);
  for (const name of ['us_supported_forms', 'us_withholding_check', 'us_estimated_payments', 'read_irs_letter']) assert.equal(isRemoteQuery(name), true, name);
});

test('a payroll-imported form keeps its source and document id in the form list', async () => {
  const { addUsTaxForm, listUsTaxForms } = await import('../src/us-return.mjs');
  const state = createState();
  const added = addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 1000 }, source: 'payroll', documentId: 'pinwheel-abc' });
  assert.equal(added.ok, true);
  const [form] = listUsTaxForms(state, { taxYear: '2025' }).data.forms;
  assert.equal(form.source, 'payroll');
  assert.equal(form.documentId, 'pinwheel-abc');
  addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'B', fields: { wages: 1 }, source: 'model' });
  assert.equal(listUsTaxForms(state, { taxYear: '2025' }).data.forms[1].source, 'manual');
});
