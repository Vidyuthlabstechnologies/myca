import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-income-tax-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { incomeTax } from '../src/sprint-load.mjs';
import { advanceTax } from '../src/advance-tax.mjs';
import { planAdvanceTaxFromChat } from '../src/advance-tax-intent.mjs';
import { validateAgainstSchema } from '../src/itr-json-check.mjs';
import { form16A } from '../src/tds-certificates.mjs';
import { planTds } from '../src/tds-deduction.mjs';
import { tdsReturnDraft } from '../src/tds-return.mjs';
import { filingRows } from '../src/deadline-run.mjs';
import { runTool } from '../src/tools.mjs';
import { taxPlan, reviewIncomeTaxReturn } from '../src/tax-assistant.mjs';

const LAKH = 100000 * 100;
const tax = (input) => incomeTax.computeIncomeTax({ residentIndividual: true, ...input });

test('new regime FY 2025-26: rebate to Rs 12 lakh, marginal relief just above, Rs 12.75 lakh salary pays nothing', () => {
  assert.equal(tax({ fy: '2025-26', regime: 'new', salaryPaise: 12.75 * LAKH }).taxPayablePaise, 0);
  const above = tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 12.1 * LAKH });
  assert.equal(above.slabTaxPaise, 61500 * 100);
  assert.equal(above.taxPayablePaise, 10400 * 100);
  assert.equal(tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 13 * LAKH }).taxPayablePaise, 78000 * 100);
});

test('new regime FY 2024-25 uses the 3/7/10/12/15 lakh slabs and the Rs 25,000 rebate to Rs 7 lakh', () => {
  const r = tax({ fy: '2024-25', regime: 'new', otherIncomePaise: 7.1 * LAKH });
  assert.equal(r.slabTaxPaise, 21000 * 100);
  assert.equal(r.taxPayablePaise, 10400 * 100);
  assert.equal(tax({ fy: '2024-25', regime: 'new', otherIncomePaise: 7 * LAKH }).taxPayablePaise, 0);
});

test('surcharge marginal relief at Rs 50 lakh and Rs 1 crore, 25% cap in the new regime, 37% in the old', () => {
  assert.equal(tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 50.5 * LAKH }).surchargePaise, 35000 * 100);
  assert.equal(tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 101 * LAKH }).surchargePaise, 328000 * 100);
  const newTop = tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 600 * LAKH });
  assert.equal(newTop.surchargePaise, Math.round(newTop.slabTaxPaise * 0.25));
  const oldTop = tax({ fy: '2025-26', regime: 'old', otherIncomePaise: 600 * LAKH });
  assert.equal(oldTop.surchargePaise, Math.round(oldTop.slabTaxPaise * 0.37));
});

test('sections 288A and 288B round total income and tax to the nearest ten rupees, paise ignored', () => {
  const r = tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 123456789 });
  assert.equal(r.totalIncomePaise, 1234570 * 100);
  assert.equal(r.taxPayablePaise % 1000, 0);
  assert.equal(tax({ fy: '2025-26', regime: 'new', otherIncomePaise: 123456400 }).totalIncomePaise, 1234560 * 100);
});

test('old regime senior and super-senior exemptions', () => {
  assert.equal(tax({ fy: '2025-26', regime: 'old', ageBand: '80-plus', otherIncomePaise: 6 * LAKH }).taxPayablePaise, 20800 * 100);
  assert.equal(tax({ fy: '2025-26', regime: 'old', ageBand: '60-to-79', otherIncomePaise: 5 * LAKH }).taxPayablePaise, 0);
  assert.equal(tax({ fy: '2025-26', regime: 'old', ageBand: '60-to-79', otherIncomePaise: 6 * LAKH }).slabTaxPaise, 30000 * 100);
});

test('advance tax for an HUF gets no section 87A rebate, which is only for resident individuals', () => {
  const state = createState();
  state.company = { ...state.company, name: 'Rao HUF', entityType: 'HUF' };
  const est = advanceTax(state, { asOf: '2026-10-18', otherIncome: 1000000 });
  assert.equal(est.ok, true, JSON.stringify(est));
  const expected = tax({ fy: '2026-27', regime: 'new', otherIncomePaise: 10 * LAKH, residentIndividual: false }).taxPayablePaise / 100;
  assert.ok(expected > 0);
  assert.equal(est.data.tax, expected);
  const person = createState();
  person.company = { ...person.company, name: 'Asha Rao', entityType: 'proprietorship' };
  assert.equal(advanceTax(person, { asOf: '2026-10-18', otherIncome: 1000000 }).data.tax, 0);
});

test('advance tax from chat treats 44ADA as presumptive, like 44AD', () => {
  assert.equal(planAdvanceTaxFromChat(createState(), 'advance tax under 44ADA').args.presumptive, true);
  assert.equal(planAdvanceTaxFromChat(createState(), 'advance tax under 44AD').args.presumptive, true);
});

test('ITR JSON check flags a field named like an Object prototype member as not in the schema', () => {
  const schema = { properties: { ITR: { type: 'object', additionalProperties: false, properties: { ITR1: { type: 'object' } } } } };
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const data = JSON.parse(`{"ITR": {"ITR1": {}, "${name}": 1}}`);
    const { errors } = validateAgainstSchema(schema, data);
    assert.deepEqual(errors.map((e) => [e.path, e.code]), [[`ITR.${name}`, 'NOT_ALLOWED']], name);
  }
});

test('ITR JSON check reports a required field missing even when its name is an Object prototype member', () => {
  const schema = { properties: { ITR: { type: 'object', required: ['constructor'], properties: {} } } };
  const { errors } = validateAgainstSchema(schema, { ITR: {} });
  assert.deepEqual(errors.map((e) => [e.path, e.code]), [['ITR.constructor', 'REQUIRED']]);
});

test('Form 16A lists every payment of a deductee, whatever the case or spelling of the name on each bill', () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', tdsDeductor: true, tan: 'MUMA12345B' };
  const entry = (date, payee, pan, basis, tdsAmount) => ({ section: '194J', category: 'professional', asset: '', pan, payee, fy: '2026-27', date, basis, beforeGst: true, tds: tdsAmount, shortfall: 0, rate: 10, noPan: !pan, crossed: true, kind: 'aggregate', rulesUsed: [], unreviewed: false, source: 'test' });
  state.tdsEntries = [
    entry('2026-07-05', 'Rao & Co', 'AAAFR1234K', 40000, 0),
    entry('2026-07-20', 'Rao and Co', 'AAAFR1234K', 20000, 6000),
    entry('2026-08-02', 'Ravi Kumar', '', 60000, 12000),
    entry('2026-08-20', 'RAVI KUMAR', '', 10000, 2000),
  ];
  const out = form16A(state, { quarter: 'Q2 2026-27' });
  assert.equal(out.ok, true, JSON.stringify(out));
  for (const cert of out.data.certificates) {
    const paid = Math.round(cert.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    const deducted = Math.round(cert.payments.reduce((sum, p) => sum + p.tds, 0) * 100) / 100;
    assert.equal(paid, cert.amountPaid, cert.deductee.name);
    assert.equal(deducted, cert.tdsDeducted, cert.deductee.name);
  }
});

test('tax plan and return review refuse a financial year whose two years do not follow on', () => {
  for (const fy of ['2025-27', '2025-25', '2025-36']) {
    assert.equal(taxPlan(createState(), { fy, salary: 1000000 }).error, 'FY_INVALID', fy);
    assert.equal(reviewIncomeTaxReturn(createState(), { fy, regime: 'new', salary: 1000000 }).error, 'FY_INVALID', fy);
  }
  assert.equal(taxPlan(createState(), { fy: '2025-26', salary: 1000000 }).ok, true);
});

test('TDS on a 194C contractor: 1% for an individual PAN, 2% for a firm, nothing until Rs 30,000 single or Rs 1 lakh in the year', () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  const plan = (pan, basis) => planTds(state, { tdsSection: '194C', payeePan: pan }, { date: '2026-10-05', basis, payable: basis, payee: 'X' }).tds;
  assert.equal(plan('ABCPK1234K', 30000).tds, 0);
  assert.equal(plan('ABCPK1234K', 30001).tds, 300.01);
  assert.equal(plan('ABCFK1234K', 40000).tds, 800);
  const noPan = planTds(state, { tdsSection: '194C' }, { date: '2026-10-05', basis: 40000, payable: 40000, payee: 'Y' }).tds;
  assert.equal(noPan.rate, 20);
  assert.equal(noPan.tds, 8000);
});

function tdsBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', tdsDeductor: true, tan: 'MUMA12345B' };
  const entry = (section, date, payee, pan, basis, tdsAmount) => ({ section, category: section === '194J' ? 'professional' : '', asset: '', pan, payee, fy: '2026-27', date, basis, beforeGst: true, tds: tdsAmount, shortfall: 0, rate: 10, noPan: false, crossed: true, kind: 'aggregate', rulesUsed: [], unreviewed: false, source: 'test' });
  state.tdsEntries = [entry('194J', '2026-08-05', 'Rao & Co', 'AAAFR1234K', 60000, 6000), entry('192', '2026-08-31', 'Meena', 'ABCPM1234K', 150000, 9000)];
  return state;
}

test('24Q and 26Q are recorded as filed separately: filing one does not mark the other filed', async () => {
  const state = tdsBooks();
  const row = () => filingRows(state, '2026-11-01').find((item) => item.returnType === 'TDS_QUARTERLY' && item.period === 'Q2 2026-27');
  assert.ok(row(), 'the Q2 TDS statement is listed');
  const record = (args) => runTool(state, 'record_filing', { returnType: 'TDS_QUARTERLY', period: 'Q2 2026-27', filedOn: '2026-10-30', ...args });
  assert.equal((await record({ arn: 'TDS26QQ2ACK0001' })).error, 'TDS_FORM_REQUIRED');
  const other = await record({ form: '26Q', arn: 'TDS26QQ2ACK0001' });
  assert.equal(other.ok, true, JSON.stringify(other));
  assert.equal(tdsReturnDraft(state, 'Q2 2026-27', { form: 'other' }).data.filed?.arn, 'TDS26QQ2ACK0001');
  assert.equal(tdsReturnDraft(state, 'Q2 2026-27', { form: 'salary' }).data.filed, null);
  assert.notEqual(row().level, 'filed', 'the quarter stays open while 24Q is not filed');
  assert.equal((await record({ form: 'other', arn: 'TDS26QQ2ACK0002' })).error, 'ALREADY_RECORDED');
  const salary = await record({ form: '24Q', arn: 'TDS24QQ2ACK0001', filedOn: '2026-10-31' });
  assert.equal(salary.ok, true, JSON.stringify(salary));
  assert.equal(tdsReturnDraft(state, 'Q2 2026-27', { form: 'salary' }).data.filed?.arn, 'TDS24QQ2ACK0001');
  assert.equal(row().level, 'filed');
});

test('a TDS statement filing recorded before the forms were told apart still counts for both', () => {
  const state = tdsBooks();
  state.filings = [{ returnType: 'TDS_QUARTERLY', period: 'Q2 2026-27', label: 'TDS statement', arn: 'OLDTDSACK0001', filedOn: '2026-10-30', dueDate: '2026-10-31', late: false, filedBy: '', source: 'recorded' }];
  assert.equal(tdsReturnDraft(state, 'Q2 2026-27', { form: 'other' }).data.filed?.arn, 'OLDTDSACK0001');
  assert.equal(tdsReturnDraft(state, 'Q2 2026-27', { form: 'salary' }).data.filed?.arn, 'OLDTDSACK0001');
  assert.equal(filingRows(state, '2026-11-01').find((item) => item.returnType === 'TDS_QUARTERLY' && item.period === 'Q2 2026-27').level, 'filed');
});
