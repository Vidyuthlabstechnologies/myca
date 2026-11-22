import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { planCreditNote } from '../src/credit-notes.mjs';
import { irnTurnoverProblems, irnWarnings } from '../src/nic-config.mjs';
import { irnPreview } from '../src/confirm-tax.mjs';
import { aatoFor, booksTurnover } from '../src/aato.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { taxPlan, ageAtFyEnd } from '../src/tax-assistant.mjs';
import { advanceTax } from '../src/advance-tax.mjs';

const BUYER = '27AAACH7409R1Z1';
const CRORE = 10000000;

function books(company = {}) {
  const state = createState();
  state.company = { ...state.company, address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune', ...company };
  return state;
}

function sale(state, date, { hsn = '520811', gstin = BUYER, rate = 1000 } = {}) {
  const out = createInvoice(state, { date, partyName: gstin ? 'Retail Mart' : 'Walk-in', partyGstin: gstin, partyState: '27', lines: [{ description: 'Cloth', hsn, qty: 1, rate, gstRate: 5 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

const codes = (problems) => problems.map((problem) => problem.code);

test('the business profile stores aggregate turnover by financial year, and the preceding year is used for a date', async () => {
  const state = books();
  const set = await runTool(state, 'set_company', { aato: 120000000, aatoFy: '2025-26' });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.deepEqual(state.company.aatoByFy, { '2025-26': 120000000 });
  assert.deepEqual(aatoFor(state, '2026-10-01'), { fy: '2025-26', rupees: 120000000, source: 'entered', estimated: false });
  assert.equal(aatoFor(state, '2026-03-31').fy, '2024-25');
  assert.equal((await runTool(state, 'set_company', { aato: -1, aatoFy: '2025-26' })).error, 'BAD_AATO');
  assert.equal((await runTool(state, 'set_company', { aato: 5, aatoFy: '2025-27' })).error, 'INVALID_FY');
  assert.equal((await runTool(state, 'set_company', { aatoFy: '2025-26' })).error, 'AATO_REQUIRED');
});

test('without an entered figure the aggregate turnover is estimated from the books of the preceding year, net of credit notes', () => {
  const state = books();
  assert.equal(aatoFor(state, '2026-10-01').source, 'unknown');
  sale(state, '2025-07-10', { rate: 200000 });
  sale(state, '2026-05-10', { rate: 900000 });
  assert.equal(booksTurnover(state, '2025-26'), 200000);
  assert.deepEqual(aatoFor(state, '2026-10-01'), { fy: '2025-26', rupees: 200000, source: 'books', estimated: true });
});

test('AATO of Rs 10 crore or more: an IRN is refused after 30 days counting the document date as day one', () => {
  const state = books({ aatoByFy: { '2025-26': 15 * CRORE } });
  const { invoice } = sale(state, '2026-10-01');
  assert.deepEqual(irnTurnoverProblems(state, invoice, '2026-10-30'), []);
  const late = irnTurnoverProblems(state, invoice, '2026-10-31');
  assert.deepEqual(codes(late), ['IRN_REPORTING_WINDOW_PASSED']);
  assert.equal(late[0].lastDay, '2026-10-30');
  assert.match(late[0].words, /within 30 days/);
});

test('below Rs 10 crore the window does not apply; an unknown turnover only warns', () => {
  const small = books({ aatoByFy: { '2025-26': 9 * CRORE } });
  const one = sale(small, '2026-09-01').invoice;
  assert.deepEqual(irnTurnoverProblems(small, one, '2026-11-21'), []);
  assert.deepEqual(irnWarnings(small, one, '2026-11-21'), []);
  const unknown = books();
  const two = sale(unknown, '2026-09-01').invoice;
  assert.deepEqual(irnTurnoverProblems(unknown, two, '2026-11-21'), []);
  assert.equal(irnWarnings(unknown, two, '2026-11-21').length, 1);
  assert.match(irnWarnings(unknown, two, '2026-11-21')[0], /last day was 2026-09-30/);
});

test('a books estimate at or above Rs 10 crore is enough to refuse, since every GSTIN on the PAN adds to it', () => {
  const state = books();
  sale(state, '2025-08-10', { rate: 11 * CRORE });
  const { invoice } = sale(state, '2026-09-01');
  const problems = irnTurnoverProblems(state, invoice, '2026-11-21');
  assert.deepEqual(codes(problems), ['IRN_REPORTING_WINDOW_PASSED']);
  assert.match(problems[0].words, /estimated/);
});

test('the IRN confirm card blocks a document past the window and warns when the turnover is unknown', () => {
  const big = books({ aatoByFy: { '2025-26': 15 * CRORE } });
  const old = sale(big, '2026-01-05').invoice;
  const preview = irnPreview(big, { invoiceId: old.id }, false);
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /cannot get an IRN now/);
  const unknown = books();
  const other = sale(unknown, '2026-01-05').invoice;
  const card = irnPreview(unknown, { invoiceId: other.id }, false);
  assert.deepEqual(card.blockers, []);
  assert.match(card.effects[0], /IRP will refuse it/);
  assert.deepEqual(irnPreview(big, { invoiceId: old.id }, true).blockers, []);
});

test('HSN digits follow the preceding year turnover: 6 above Rs 5 crore on every invoice, 4 up to it with B2C free to omit', () => {
  const large = books({ aatoByFy: { '2025-26': 6 * CRORE } });
  const short = sale(large, '2026-10-05', { hsn: '5208' });
  assert.deepEqual(short.hsnWarnings.map((item) => [item.code, item.need]), [['HSN_TOO_SHORT', 6]]);
  assert.match(short.hsnWarnings[0].words, /Notification 78\/2020/);
  assert.deepEqual(codes(irnTurnoverProblems(large, short.invoice, '2026-10-06')), ['HSN_DIGITS_FOR_TURNOVER']);
  const b2cLarge = sale(large, '2026-10-05', { hsn: '', gstin: '' });
  assert.deepEqual(b2cLarge.hsnWarnings.map((item) => item.code), ['HSN_MISSING']);
  assert.equal(sale(large, '2026-10-05', { hsn: '520811' }).hsnWarnings, undefined);

  const small = books({ aatoByFy: { '2025-26': 3 * CRORE } });
  assert.equal(sale(small, '2026-10-05', { hsn: '5208' }).hsnWarnings, undefined);
  assert.equal(sale(small, '2026-10-05', { hsn: '', gstin: '' }).hsnWarnings, undefined);
  assert.deepEqual(sale(small, '2026-10-05', { hsn: '' }).hsnWarnings.map((item) => [item.code, item.need]), [['HSN_MISSING', 4]]);
  assert.deepEqual(sale(small, '2026-10-05', { hsn: '52' }).hsnWarnings.map((item) => item.code), ['HSN_TOO_SHORT']);
});

test('GSTR-1 table 12 uses the turnover entered for the preceding year, and says when it used a books estimate', async () => {
  const state = books({ gstin: '27AABCU9603R1ZN', state: '27', aatoByFy: { '2025-26': 6 * CRORE } });
  const { invoice } = sale(state, '2026-10-05', { hsn: '5208' });
  const json = invoicesToGstr1Json(state.company, [invoice], '102026');
  assert.ok(json.warnings.some((w) => w.startsWith('HSN_CODE_PROBLEM') && w.includes('6 digits')), JSON.stringify(json.warnings));
  const estimated = books({ gstin: '27AABCU9603R1ZN', state: '27' });
  sale(estimated, '2025-10-05', { rate: 100000 });
  sale(estimated, '2026-10-05');
  const out = await runTool(estimated, 'export_gstr1_json', { fp: '102026' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const warnings = out.data?.warnings || out.warnings;
  assert.ok(warnings.some((w) => w.startsWith('HSN_AATO_ESTIMATED')), JSON.stringify(warnings));
});

test('a credit note reducing GST closes at the annual return date when GSTR-9 was filed before 30 November', () => {
  const state = books();
  const { invoice } = sale(state, '2024-06-10');
  state.filings = [{ returnType: 'GSTR-9', period: '2024-25', arn: 'AA2710250000001', filedOn: '2025-10-15', source: 'recorded' }];
  const late = planCreditNote(state, { invoiceId: invoice.id, date: '2025-10-20', reason: 'Discount', amount: 105 });
  assert.equal(late.error, 'CREDIT_NOTE_TIME_BARRED');
  assert.equal(late.lastDate, '2025-10-15');
  assert.equal(late.ruleId, 'gst.credit-note.declaration-deadline');
  assert.match(late.hint, /annual return \(GSTR-9\) for FY 2024-25 was filed/);
  assert.equal(planCreditNote(state, { invoiceId: invoice.id, date: '2025-10-15', reason: 'Discount', amount: 105 }).ok, true);
  const open = books();
  const other = sale(open, '2024-06-10').invoice;
  const after = planCreditNote(open, { invoiceId: other.id, date: '2025-12-01', reason: 'Discount', amount: 105 });
  assert.equal(after.lastDate, '2025-11-30');
  assert.match(after.hint, /30 November 2025/);
});

test('age at 31 March of the year comes from the date of birth', () => {
  assert.equal(ageAtFyEnd('1966-03-31', '2025-26'), 60);
  assert.equal(ageAtFyEnd('1966-04-01', '2025-26'), 59);
  assert.equal(ageAtFyEnd('1946-01-15', '2025-26'), 80);
  assert.equal(ageAtFyEnd('1966-02-30', '2025-26'), null);
});

test('a senior citizen gets the old-regime senior slab and 80TTB up to Rs 50,000; the new regime has neither', () => {
  const senior = taxPlan(createState(), { fy: '2025-26', dateOfBirth: '1960-05-10', otherIncome: 700000, depositInterest: 80000 });
  assert.equal(senior.ok, true, JSON.stringify(senior));
  assert.equal(senior.data.age, 65);
  assert.equal(senior.data.ageBand, '60-to-79');
  assert.equal(senior.data.regimes.old.section80TTB, 50000);
  assert.equal(senior.data.regimes.old.grossTotalIncome, 700000);
  assert.equal(senior.data.regimes.old.totalIncome, 650000);
  assert.equal(senior.data.regimes.old.taxPayable, 41600);
  assert.equal(senior.data.regimes.new.section80TTB, 0);
  assert.ok(senior.data.senior.some((note) => note.code === 'SECTION_80TTB'));
  assert.ok(senior.data.senior.some((note) => note.code === 'NO_ADVANCE_TAX'));
  assert.ok(senior.data.citations.some((item) => item.ruleId === 'income-tax.deduction.80ttb.cap'));
  const younger = taxPlan(createState(), { fy: '2025-26', otherIncome: 700000, depositInterest: 80000 });
  assert.equal(younger.data.regimes.old.section80TTB, 0);
  assert.equal(younger.data.regimes.old.taxPayable, 54600);
  assert.equal(younger.data.regimes.new.taxPayable, senior.data.regimes.new.taxPayable);
});

test('a date of birth of 1 April is flagged for the CA, and 75 or over with no business income is told about the specified senior citizen route', () => {
  const edge = taxPlan(createState(), { fy: '2025-26', dateOfBirth: '1966-04-01', otherIncome: 500000 });
  assert.equal(edge.data.ageBand, 'below-60');
  assert.ok(edge.data.senior.some((note) => note.code === 'AGE_CHECK'));
  const older = taxPlan(createState(), { fy: '2026-27', dateOfBirth: '1948-01-01', salary: 600000, otherIncome: 100000 });
  const note = older.data.senior.find((item) => item.code === 'SPECIFIED_SENIOR_CITIZEN');
  assert.ok(note);
  assert.match(note.text, /Form No\. 125/);
  const withBusiness = taxPlan(createState(), { fy: '2026-27', dateOfBirth: '1948-01-01', businessIncome: 600000 });
  assert.ok(!withBusiness.data.senior.some((item) => item.code === 'SPECIFIED_SENIOR_CITIZEN' || item.code === 'NO_ADVANCE_TAX'));
});

test('advance tax uses the owner date of birth and is not payable by a resident senior with no business income (s.207(2) / s.403(3))', () => {
  const state = books({ name: 'Asha Rao', entityType: 'proprietorship', ownerDateOfBirth: '1955-06-01' });
  const senior = advanceTax(state, { asOf: '2026-10-18', regime: 'old', otherIncome: 900000 });
  assert.equal(senior.ok, true, JSON.stringify(senior));
  assert.equal(senior.data.age, 71);
  assert.equal(senior.data.tax, 93600);
  assert.equal(senior.data.seniorExempt, true);
  assert.equal(senior.data.liable, false);
  assert.ok(senior.data.rulesUsed.includes('income-tax.advance-tax.senior-exemption'));
  const plain = books({ name: 'Asha Rao', entityType: 'proprietorship' });
  const below = advanceTax(plain, { asOf: '2026-10-18', regime: 'old', otherIncome: 900000 });
  assert.equal(below.data.tax, 96200);
  assert.equal(below.data.liable, true);
  sale(state, '2026-05-10', { rate: 100000 });
  assert.equal(advanceTax(state, { asOf: '2026-10-18', regime: 'old', otherIncome: 900000 }).data.seniorExempt, false);
});
