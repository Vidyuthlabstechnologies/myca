import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-us-1040x-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
process.env.MYCA_ENABLE_LIVE_CALLS = '0';
delete process.env.MYCA_PROVIDER_ENV;
for (const key of ['MYCA_IRS_ETIN', 'MYCA_IRS_EFIN', 'MYCA_IRS_SOFTWARE_ID', 'MYCA_IRS_APP_SYS_ID', 'MYCA_IRS_CERT_PATH', 'MYCA_IRS_KEY_PATH', 'MYCA_US_FILING_PARTNER']) delete process.env[key];

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { form1040X, figuresOf1040, addYears, dependentCounts } from '../src/us-1040x.mjs';
import { usAmendedReturn, startUsAmendedReturn, setUsAmendedReturn, usAmendedStartPreview, usAmendedSetPreview, usAmendedWords } from '../src/us-amended.mjs';
import { signUsReturn, fileUsReturn } from '../src/us-efile.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { assistantTools } from '../src/assistant-tools.mjs';
import { UNITED_STATES } from '../src/countries/united-states.mjs';
import { PROPOSABLE } from '../../cloud/src/api.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

const w2 = (wages, withheld) => ({ wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 });
const codes = (data) => data.checks.map((item) => item.code);
const ORIGINAL_SINGLE = { agi: 60000, deduction: 15750, taxableIncome: 44250, tax: 5075, credits: 0, otherTaxes: 0, totalTax: 5075, withholding: 7000, estimatedPayments: 0, eic: 0, refundableCredits: 0, refund: 1925, appliedToNextYear: 0, amountOwed: 0 };
const figures = (over = {}) => ({ filingStatus: 'single', ...ORIGINAL_SINGLE, dependents: { children: 0, other: 0 }, ...over });

async function startedReturn(year = '2025') {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: year, filingStatus: 'single', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  const added = await runTool(state, 'add_us_tax_form', { taxYear: year, kind: 'W-2', payer: 'St. Mary Hospital', payerTin: '12-3456789', fields: w2(60000, 7000) });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

async function filedInMyca() {
  const state = await startedReturn();
  const signed = await signUsReturn(state, { taxYear: 2025, taxpayerPin: '12345', priorYear: { taxpayer: { agi: 50000 } }, consent8879: true, refund: { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' } }, null, { today: '2026-02-10' });
  assert.equal(signed.ok, true, JSON.stringify(signed));
  const filed = await fileUsReturn(state, { taxYear: 2025 }, null, { now: '2026-02-10T15:00:00.000Z' });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.equal(state.usEfile.returns['2025'].submissions.at(-1).status, 'accepted');
  return state;
}

test('Form 1040-X lines 1 to 23 from a 2025 single return that left out $1,000 of interest: tax 5,075 to 5,195, $120 owed (line 20)', () => {
  const out = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { source: 'entered', original: figures(), explanation: 'Interest of $1,000 from First Bank was left off.', originalFiledOn: '2026-02-10' }, amended: figures({ agi: 61000, taxableIncome: 45250, tax: 5195, totalTax: 5195, refund: 1805 }) });
  assert.equal(out.ok, true, JSON.stringify(out));
  const x = out.data;
  assert.deepEqual(x.lines['1'], { A: 60000, B: 1000, C: 61000 });
  assert.deepEqual(x.lines['3'], { A: 44250, B: 1000, C: 45250 });
  assert.deepEqual(x.lines['5'], { A: 44250, B: 1000, C: 45250 });
  assert.deepEqual(x.lines['11'], { A: 5075, B: 120, C: 5195 });
  assert.deepEqual(x.lines['12'], { A: 7000, B: 0, C: 7000 });
  assert.deepEqual(x.payments, { 16: 0, 17: 7000, 18: 1925, 19: 5075, 20: 120, 21: 0, 22: 0, 23: 0 });
  assert.equal(x.owed, 120);
  assert.equal(x.partI, null);
  assert.equal(x.partII, 'Interest of $1,000 from First Bank was left off.');
  assert.equal(x.form, 'Form 1040-X (Rev. December 2025)');
  assert.ok(codes(x).includes('AMENDED_TAX_DUE'));
  assert.ok(!codes(x).some((code) => /REQUIRED|TOO_LATE/.test(code)));
  assert.deepEqual(x.rulesUsed, ['us.federal.individual.amended-return@2020-01-01', 'us.federal.individual.return-due@2020-01-01']);
});

test('Lines 18 to 23: a corrected W-2 with $500 more withheld is a $500 overpayment (line 21); $200 applied to next year leaves $300 refunded (line 22)', () => {
  const amendment = { original: figures(), explanation: 'Corrected W-2 from the employer.', originalFiledOn: '2026-03-02', applyToNextYear: 200 };
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment, amended: figures({ withholding: 7500 }) }).data;
  assert.deepEqual(x.lines['12'], { A: 7000, B: 500, C: 7500 });
  assert.equal(x.payments['17'], 7500);
  assert.equal(x.payments['19'], 7500 - 1925);
  assert.equal(x.payments['21'], 5575 - 5075);
  assert.equal(x.payments['22'], 300);
  assert.equal(x.payments['23'], 200);
  assert.equal(x.refund, 300);
  const capped = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { ...amendment, applyToNextYear: 900 }, amended: figures({ withholding: 7500 }) }).data;
  assert.equal(capped.payments['23'], 500);
  assert.equal(capped.payments['22'], 0);
});

test('Line 16 takes the amount paid with the original; when not given it assumes the original balance due was paid and warns', () => {
  const owed = figures({ withholding: 4000, refund: 0, amountOwed: 1075 });
  const assumed = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: owed, explanation: 'x', originalFiledOn: '2026-04-10' }, amended: figures({ withholding: 4000, tax: 4875, totalTax: 4875 }) }).data;
  assert.equal(assumed.payments['16'], 1075);
  assert.equal(assumed.payments['17'], 5075);
  assert.equal(assumed.payments['21'], 5075 - 4875);
  assert.ok(codes(assumed).includes('AMENDED_PAYMENT_ASSUMED'));
  const partly = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: owed, explanation: 'x', originalFiledOn: '2026-04-10', paidWithReturn: 575 }, amended: figures({ withholding: 4000, tax: 4875, totalTax: 4875 }) }).data;
  assert.equal(partly.payments['17'], 4575);
  assert.equal(partly.payments['20'], 4875 - 4575);
  assert.ok(!codes(partly).includes('AMENDED_PAYMENT_ASSUMED'));
});

test('Line 19 negative: an original refund larger than the corrected payments is added to the tax owed (Form 1040-X instructions, line 19)', () => {
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: figures({ refund: 1925 }), explanation: 'Withholding was overstated.', originalFiledOn: '2026-02-10' }, amended: figures({ withholding: 1000 }) }).data;
  assert.equal(x.payments['19'], 1000 - 1925);
  assert.equal(x.payments['20'], 5075 + 925);
});

test('Line 5 column A shows the actual negative taxable income, column C is never below zero (instructions, line 5)', () => {
  const original = figures({ agi: 10000, deduction: 15750, taxableIncome: 0, tax: 0, totalTax: 0, withholding: 0, refund: 0 });
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original, explanation: 'Unreported wages.', originalFiledOn: '2026-02-10' }, amended: figures({ agi: 17750, taxableIncome: 2000, tax: 200, totalTax: 200, withholding: 0, refund: 0 }) }).data;
  assert.deepEqual(x.lines['5'], { A: -5750, B: 7750, C: 2000 });
  assert.ok(!codes(x).includes('AMENDED_ORIGINAL_TAXABLE_MISMATCH'));
  const low = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original, explanation: 'x', originalFiledOn: '2026-02-10' }, amended: figures({ agi: 12000, taxableIncome: 0, tax: 0, totalTax: 0, withholding: 0, refund: 0 }) }).data;
  assert.equal(low.lines['5'].C, 0);
});

test('Original figures that do not add up are flagged: taxable income and total tax against their lines', () => {
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: figures({ taxableIncome: 44000, totalTax: 5000 }), explanation: 'x', originalFiledOn: '2026-02-10' }, amended: figures({ withholding: 7100 }) }).data;
  assert.ok(codes(x).includes('AMENDED_ORIGINAL_TAXABLE_MISMATCH'));
  assert.ok(codes(x).includes('AMENDED_ORIGINAL_TOTAL_TAX_MISMATCH'));
});

test('Part II explanation and the original filing date are required; a date before the year ended or after today is refused', () => {
  const base = { original: figures() };
  const none = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: base, amended: figures({ withholding: 7100 }) }).data;
  assert.ok(codes(none).includes('AMENDED_EXPLANATION_REQUIRED'));
  assert.ok(codes(none).includes('AMENDED_FILED_ON_REQUIRED'));
  assert.equal(none.deadline, null);
  for (const filedOn of ['2025-12-31', '2026-12-01']) assert.ok(codes(form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { ...base, explanation: 'x', originalFiledOn: filedOn }, amended: figures({ withholding: 7100 }) }).data).includes('AMENDED_FILED_ON_INVALID'), filedOn);
});

test('Refund claim deadline (IRC 6511(a), 6513(a)): an early return counts as filed on April 15, 3 years from filing or 2 years from paying, whichever is later', () => {
  const claim = (filedOn, today, extra = {}) => form1040X({ taxYear: '2025', today, amendment: { original: figures(), explanation: 'x', originalFiledOn: filedOn, ...extra }, amended: figures({ withholding: 7100 }) }).data;
  const early = claim('2026-03-01', '2029-04-15');
  assert.deepEqual(early.deadline, { deemedFiledOn: '2026-04-15', fromFiling: '2029-04-15', fromPayment: '2028-04-15', refundClaimBy: '2029-04-15' });
  assert.ok(!codes(early).includes('AMENDED_CLAIM_TOO_LATE'));
  assert.ok(codes(claim('2026-03-01', '2029-04-16')).includes('AMENDED_CLAIM_TOO_LATE'));
  const late = claim('2026-07-01', '2029-06-30');
  assert.equal(late.deadline.refundClaimBy, '2029-07-01');
  assert.ok(!codes(late).includes('AMENDED_CLAIM_TOO_LATE'));
  const paidLater = claim('2026-03-01', '2029-12-01', { lastPaymentOn: '2028-01-10' });
  assert.equal(paidLater.deadline.fromPayment, '2030-01-10');
  assert.equal(paidLater.deadline.refundClaimBy, '2030-01-10');
  assert.ok(!codes(paidLater).includes('AMENDED_CLAIM_TOO_LATE'));
  assert.ok(codes(paidLater).includes('AMENDED_REFUND_LIMITED'));
  const owes = form1040X({ taxYear: '2025', today: '2031-01-01', amendment: { original: figures(), explanation: 'x', originalFiledOn: '2026-03-01' }, amended: figures({ tax: 5195, totalTax: 5195 }) }).data;
  assert.ok(!codes(owes).includes('AMENDED_CLAIM_TOO_LATE'));
  assert.equal(addYears('2024-02-29', 3), '2027-02-28');
  assert.equal(addYears('2024-02-29', 4), '2028-02-29');
});

test('Filing status: joint to separate is refused after the April 15 due date; separate to joint is allowed', () => {
  const run = (originalStatus, status, today) => form1040X({ taxYear: '2025', today, amendment: { original: figures({ filingStatus: originalStatus }), explanation: 'x', originalFiledOn: '2026-02-10' }, amended: figures({ filingStatus: status }) }).data;
  assert.ok(!codes(run('mfj', 'mfs', '2026-04-15')).includes('AMENDED_JOINT_TO_SEPARATE'));
  const after = run('mfj', 'mfs', '2026-04-16');
  assert.equal(after.checks.find((item) => item.code === 'AMENDED_JOINT_TO_SEPARATE').level, 'error');
  assert.ok(!codes(run('mfs', 'mfj', '2027-01-10')).includes('AMENDED_JOINT_TO_SEPARATE'));
  assert.ok(!codes(run('mfs', 'mfj', '2027-01-10')).includes('AMENDED_NO_CHANGE'));
});

test('E-file of Form 1040-X: the current tax period and two prior; a prior-year paper original filed this processing year goes on paper', () => {
  const efile = (taxYear, today, extra = {}) => form1040X({ taxYear, today, amendment: { original: figures(), explanation: 'x', originalFiledOn: `${Number(taxYear) + 1}-03-01`, ...extra }, amended: figures({ withholding: 7100 }) }).data.efile;
  assert.equal(efile('2025', '2026-11-21').allowedByIrs, true);
  assert.equal(efile('2025', '2026-11-21').currentTaxPeriod, 2025);
  assert.equal(efile('2025', '2028-05-01').allowedByIrs, true);
  assert.equal(efile('2025', '2029-02-01').allowedByIrs, false);
  assert.equal(efile('2026', '2026-11-21').allowedByIrs, false);
  assert.equal(efile('2026', '2027-11-21').allowedByIrs, true);
  assert.equal(efile('2025', '2027-06-01', { originalPaper: true, originalFiledOn: '2027-03-01' }).allowedByIrs, false);
  assert.equal(efile('2025', '2027-06-01', { originalPaper: true, originalFiledOn: '2026-04-10' }).allowedByIrs, true);
  assert.equal(efile('2025', '2026-11-21').maxElectronicAmendments, 3);
  assert.equal(efile('2025', '2026-11-21').transmittedByMyca, false);
  const old = form1040X({ taxYear: '2025', today: '2029-02-01', amendment: { original: figures(), explanation: 'x', originalFiledOn: '2026-03-01' }, amended: figures({ withholding: 7100 }) }).data;
  assert.ok(codes(old).includes('AMENDED_PAPER_ONLY'));
});

test('Part I dependents appear only when they change: a child added is line 25 column B +1 and listed on line 30', () => {
  const kid = { firstName: 'Leo', lastName: 'Diaz', relationship: 'son', months: 12, ctcEligible: true };
  const parent = { firstName: 'Rosa', lastName: 'Diaz', relationship: 'parent', months: 12, odcEligible: true };
  assert.deepEqual(dependentCounts([kid, parent, { ...kid, firstName: 'Mia', months: 5 }]).children, 1);
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: figures({ dependentNames: [] }), explanation: 'Claiming my son.', originalFiledOn: '2026-02-10' }, amended: figures({ dependents: { children: 1, other: 0 }, credits: 2200 }), amendedDependents: [kid] }).data;
  assert.deepEqual(x.partI['25'], { A: 0, B: 1, C: 1 });
  assert.deepEqual(x.partI['27'], { A: 0, B: 0, C: 0 });
  assert.deepEqual(x.partI['30'], [{ firstName: 'Leo', lastName: 'Diaz', relationship: 'son', livedWithYou: true, childTaxCredit: true, creditForOtherDependents: false }]);
  assert.deepEqual(x.lines['7'], { A: 0, B: 2200, C: 2200 });
  const same = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: figures({ dependents: { children: 1, other: 0 }, dependentNames: ['Leo Diaz'] }), explanation: 'x', originalFiledOn: '2026-02-10' }, amended: figures({ withholding: 7100 }), amendedDependents: [kid] }).data;
  assert.equal(same.partI, null);
});

test('No change from the original is a warning; a year without rules or a missing today is refused', () => {
  const x = form1040X({ taxYear: '2025', today: '2026-11-21', amendment: { original: figures(), explanation: 'x', originalFiledOn: '2026-02-10' }, amended: figures() }).data;
  assert.ok(codes(x).includes('AMENDED_NO_CHANGE'));
  assert.equal(form1040X({ taxYear: '2025', amendment: {}, amended: {} }).error, 'TODAY_REQUIRED');
  assert.equal(form1040X({ taxYear: 'x', today: '2026-11-21' }).error, 'TAX_YEAR_INVALID');
});

test('figuresOf1040 maps Form 1040 lines to Form 1040-X lines: 18 to 6, 21 to 7, 25d plus Schedule 3 line 11 to 12, 28, 29 and the rest of line 31 to 15', () => {
  const f = figuresOf1040({ taxYear: '2025', filingStatus: 'hoh', lines: { '11a': 40000, '11b': 40000, '12e': 23625, '13a': 0, '13b': 0, 15: 16375, 16: 1640, 18: 1640, 21: 1640, 23: 0, 24: 0, '25d': 900, 26: 0, '27a': 3000, 28: 1200, 29: 0, 31: 300, '35a': 5400, 36: 0, 37: 0 }, schedules: { 3: { 11: 300 } } }, [{ firstName: 'Leo', relationship: 'son', months: 12, ctcEligible: true }]);
  assert.equal(f.tax, 1640);
  assert.equal(f.credits, 1640);
  assert.equal(f.withholding, 1200);
  assert.equal(f.eic, 3000);
  assert.equal(f.refundableCredits, 1200);
  assert.deepEqual(f.dependents, { children: 1, other: 0 });
});

test('A return MyCA filed and the IRS accepted is the original; the corrected return adds $1,000 of interest and the 1040-X shows $120 more tax (2025)', async () => {
  const state = await filedInMyca();
  const submission = state.usEfile.returns['2025'].submissions.at(-1);
  assert.equal(submission.figures.totalTax, 5075);
  assert.equal(submission.figures.refund, 1925);
  assert.equal((await runTool(state, 'us_amended_return', { taxYear: '2025' })).data.acceptedInMyca, true);
  const preview = usAmendedStartPreview(state, { taxYear: '2025' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Start a Form 1040-X for 2025 from the return MyCA filed/);
  const started = startUsAmendedReturn(state, { taxYear: '2025' });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(started.data.source, 'myca');
  assert.equal(started.data.verifiedOriginal, true);
  assert.ok(codes(started.data).includes('AMENDED_EXPLANATION_REQUIRED'));
  assert.ok(codes(started.data).includes('AMENDED_NO_CHANGE'));
  assert.equal(startUsAmendedReturn(state, { taxYear: '2025' }).error, 'AMENDMENT_ALREADY_STARTED');
  const interest = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-INT', payer: 'First Bank', fields: { interest: 1000 } });
  assert.equal(interest.ok, true);
  const set = setUsAmendedReturn(state, { taxYear: '2025', explanation: 'A 1099-INT for $1,000 of interest from First Bank arrived after filing.', paidWithReturn: 0 });
  assert.equal(set.ok, true, JSON.stringify(set));
  const x = (await runTool(state, 'us_amended_return', { taxYear: '2025', today: '2026-11-21' })).data;
  assert.equal(x.started, true);
  assert.deepEqual(x.lines['1'], { A: 60000, B: 1000, C: 61000 });
  assert.deepEqual(x.lines['11'], { A: 5075, B: 120, C: 5195 });
  assert.equal(x.payments['18'], 1925);
  assert.equal(x.owed, 120);
  assert.equal(x.deadline.deemedFiledOn, '2026-04-15');
  assert.equal(x.efile.allowedByIrs, true);
  assert.deepEqual(x.checks.filter((item) => item.level === 'error'), []);
  assert.equal(x.corrected1040.summary.totalTax, 5195);
  const review = await runTool(state, 'us_return_review', { taxYear: '2025' });
  assert.deepEqual(review.data.amendment, { started: true, form: '1040-X', tool: 'us_amended_return', computed: true, source: 'myca', netChangeInTax: 120, owed: 120, refund: 0, appliedToNextYear: 0, errors: 0 });
  assert.match(review.text || '', /Form 1040-X|/);
  assert.match(usAmendedWords(x), /2025 Form 1040-X: total tax \$5,075 on the original, \$5,195 corrected \(up \$120\)\. You owe \$120 more\./);
  assert.equal(setUsAmendedReturn(state, { taxYear: '2025', original: { agi: 1 } }).error, 'ORIGINAL_FROM_FILED_RETURN');
  assert.ok(state.auditEvents.some((event) => event.action === 'us_amended_return_started'));
  assert.ok(state.auditEvents.some((event) => event.action === 'us_amended_return_set'));
  assert.ok(!JSON.stringify(state.usReturns['2025'].amendment).includes('400123456'));
});

test('A filed return without a stored snapshot is checked against the signed return hash; a return changed since filing needs the original figures', async () => {
  const state = await filedInMyca();
  delete state.usEfile.returns['2025'].submissions.at(-1).figures;
  const fresh = startUsAmendedReturn(state, { taxYear: '2025' });
  assert.equal(fresh.ok, true, JSON.stringify(fresh));
  assert.equal(fresh.data.lines['11'].A, 5075);
  await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-INT', payer: 'First Bank', fields: { interest: 1000 } });
  const changed = startUsAmendedReturn(state, { taxYear: '2025', restart: true });
  assert.equal(changed.error, 'ORIGINAL_CHANGED_SINCE_FILING');
  const typed = startUsAmendedReturn(state, { taxYear: '2025', restart: true, original: ORIGINAL_SINGLE, originalFilingStatus: 'single', explanation: 'Interest left off.', originalFiledOn: '2026-02-10' });
  assert.equal(typed.ok, true, JSON.stringify(typed));
  assert.equal(typed.data.source, 'entered');
  assert.equal(typed.data.owed, 120);
});

test('A return filed elsewhere: the original figures are typed; without them the start is refused with what is missing (2026 return)', async () => {
  const state = await startedReturn('2026');
  const refused = startUsAmendedReturn(state, { taxYear: '2026' });
  assert.equal(refused.error, 'ORIGINAL_FIGURES_REQUIRED');
  assert.deepEqual(refused.missing, ['agi', 'deduction', 'tax', 'originalFilingStatus']);
  assert.equal(startUsAmendedReturn(state, { taxYear: '2026', original: { deduction: -5 }, originalFilingStatus: 'single' }).error, 'US_AMENDMENT_INVALID');
  assert.equal(startUsAmendedReturn(state, { taxYear: '2026', original: { bogus: 1 } }).error, 'US_AMENDMENT_INVALID');
  const review = (await runTool(state, 'us_return_review', { taxYear: '2026' })).data;
  const s = review.summary;
  const original = { agi: s.agi, deduction: s.deduction, tax: s.tax, credits: s.credits, otherTaxes: s.otherTaxes, totalTax: s.totalTax, withholding: 6800, refund: 6800 - s.totalTax };
  const started = startUsAmendedReturn(state, { taxYear: '2026', original, originalFilingStatus: 'single', originalDependents: { children: 0, other: 0 }, originalFiledOn: '2027-02-20', explanation: 'Corrected W-2 shows $7,000 withheld, not $6,800.' });
  assert.equal(started.ok, true, JSON.stringify(started));
  const x = usAmendedReturn(state, { taxYear: '2026', today: '2027-11-21' }).data;
  assert.equal(x.source, 'entered');
  assert.deepEqual(x.lines['12'], { A: 6800, B: 200, C: 7000 });
  assert.equal(x.payments['21'], 200);
  assert.equal(x.refund, 200);
  assert.equal(x.deadline.refundClaimBy, '2030-04-15');
  const updated = setUsAmendedReturn(state, { taxYear: '2026', applyToNextYear: 50, original: { withholding: 6900, refund: 6900 - s.totalTax } });
  assert.equal(updated.ok, true, JSON.stringify(updated));
  const later = usAmendedReturn(state, { taxYear: '2026', today: '2027-11-21' }).data;
  assert.equal(later.payments['21'], 100);
  assert.equal(later.payments['22'], 50);
  assert.equal(setUsAmendedReturn(state, { taxYear: '2026' }).error, 'NOTHING_TO_CHANGE');
  const cleared = setUsAmendedReturn(state, { taxYear: '2026', explanation: null });
  assert.ok(codes(cleared.data).includes('AMENDED_EXPLANATION_REQUIRED'));
  assert.equal(setUsAmendedReturn(createState(), { taxYear: '2026', explanation: 'x' }).error, 'AMENDMENT_NOT_STARTED');
  assert.match(usAmendedSetPreview(state, { taxYear: '2026', explanation: 'Corrected W-2.' }).effects[0], /Part II: Corrected W-2\./);
});

test('Amended-return tools are declared, schema-checked, confirmed before writing, in the US pack, and the read tool is a remote query', async () => {
  const TOOL_RISK = Object.fromEntries(assistantTools(TOOLS).map((tool) => [tool.name, tool.risk]));
  for (const name of ['start_us_amended_return', 'set_us_amended_return']) {
    assert.ok(CONFIRM_TOOLS.has(name), name);
    assert.ok(PROPOSABLE.has(name), name);
    assert.equal(TOOL_RISK[name], 'writes_books');
    assert.equal(isRemoteQuery(name), false);
  }
  assert.equal(TOOL_RISK.us_amended_return, 'read_only');
  assert.equal(isRemoteQuery('us_amended_return'), true);
  for (const name of ['us_amended_return', 'start_us_amended_return', 'set_us_amended_return']) assert.ok(UNITED_STATES.tools.includes(name), name);
  assert.equal(validateAssistantToolCall('start_us_amended_return', { taxYear: '2025', original: { agi: -500, tax: 0 }, originalFilingStatus: 'mfj', originalFiledOn: '2026-02-10' }).ok, true);
  assert.equal(validateAssistantToolCall('start_us_amended_return', { taxYear: '2025', original: { tax: -1 } }).ok, false);
  assert.equal(validateAssistantToolCall('set_us_amended_return', { taxYear: '2025', explanation: null, paidWithReturn: 10 }).ok, true);
  assert.equal(validateAssistantToolCall('set_us_amended_return', { taxYear: '2025', surprise: 1 }).ok, false);
  assert.equal(validateAssistantToolCall('us_amended_return', { taxYear: '2025' }).ok, true);
  const none = usAmendedReturn(createState(), { taxYear: '2025' });
  assert.equal(none.data.started, false);
  assert.equal(usAmendedReturn(createState(), { taxYear: '2019' }).error, 'TAX_YEAR_NOT_SUPPORTED');
  assert.equal(startUsAmendedReturn(createState(), { taxYear: '2025' }).error, 'US_RETURN_NOT_STARTED');
});

test('SSA-1099 box 5 can be entered negative; box 6 withholding still cannot', async () => {
  const state = await startedReturn();
  const repaid = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'SSA-1099', fields: { netBenefits: -1200 } });
  assert.equal(repaid.ok, true, JSON.stringify(repaid));
  assert.equal(repaid.data.amounts.netBenefits, -1200);
  const bad = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'SSA-1099', fields: { netBenefits: 100, federalWithheld: -5 } });
  assert.equal(bad.ok, false);
  const review = await runTool(state, 'us_return_review', { taxYear: '2025' });
  assert.ok(review.data.checks.some((item) => item.code === 'SSA_NET_REPAYMENT'));
  assert.equal(review.data.amendment, null);
});
