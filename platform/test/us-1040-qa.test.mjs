import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';

const adult = { firstName: 'Ruth', lastName: 'Cole', dateOfBirth: '1955-06-10' };
const run = (filingStatus, forms, more = {}, year = '2025') => computeForm1040({ filingStatus, taxpayer: adult, forms, ...more }, year);
const codes = (out) => out.data.checks.map((item) => item.code);
const r = (fields) => ({ kind: '1099-R', payer: 'Fidelity', fields });

test('1040 instructions lines 4a-4b: a direct rollover (1099-R code G) with box 2a left empty is not taxed', () => {
  const out = run('single', [r({ grossDistribution: 80000, distributionCode: 'G', iraSepSimple: false })]);
  assert.equal(out.data.lines['5a'], 80000);
  assert.equal(out.data.lines['5b'], 0);
  assert.equal(out.data.lines['11a'], 0);
  assert.ok(codes(out).includes('ROLLOVER_NOT_TAXED'));
});

test('1099-R code H (Roth to Roth IRA rollover) and code Q (qualified Roth distribution) with box 2a empty are not taxed', () => {
  assert.equal(run('single', [r({ grossDistribution: 20000, distributionCode: 'H' })]).data.lines['5b'], 0);
  assert.equal(run('single', [r({ grossDistribution: 15000, distributionCode: 'Q', iraSepSimple: true })]).data.lines['4b'], 0);
});

test('1099-R code G with an amount in box 2a uses that amount, and code 7 with box 2a empty is fully taxable', () => {
  assert.equal(run('single', [r({ grossDistribution: 50000, taxableAmount: 5000, distributionCode: 'G' })]).data.lines['5b'], 5000);
  assert.equal(run('single', [r({ grossDistribution: 30000, distributionCode: '7' })]).data.lines['5b'], 30000);
});

test('Schedule C line 24b from the books: business meals are deducted at 50% (IRC 274(n)(1)), with the full amount kept as paid', async () => {
  const { scheduleCSummary } = await import('../src/us-owner-tax.mjs');
  const state = { invoices: [{ id: 'i1', country: 'US', status: 'issued', date: '2025-03-01', subtotal: 50000 }], expenses: [{ date: '2025-04-02', head: 5250, headName: 'Meals', amount: 1000 }, { date: '2025-05-02', head: 5240, headName: 'Supplies', amount: 400 }] };
  const out = scheduleCSummary(state, { year: '2025' });
  const meals = out.data.expenses.find((row) => row.line === '24b');
  assert.equal(meals.amount, 500);
  assert.equal(meals.paid, 1000);
  assert.equal(out.data.totalExpenses, 900);
  assert.equal(out.data.netProfit, 49100);
});

test('Form 8995 instructions: a qualifying surviving spouse uses the $197,300 threshold of all other returns, not the joint $394,600 (Rev. Proc. 2024-40 section 3.27)', () => {
  const kid = { firstName: 'Ivy', relationship: 'daughter', dateOfBirth: '2015-02-02', months: 12 };
  const out = computeForm1040({ filingStatus: 'qss', taxpayer: { ...adult, dateOfBirth: '1980-01-01' }, dependents: [kid], businesses: [{ owner: 'taxpayer', grossReceipts: 300000, totalExpenses: 50000 }], forms: [] }, '2025');
  assert.ok(out.data.lines['11a'] - out.data.lines['12e'] > 197300);
  assert.equal(out.data.lines['13a'], 0);
  assert.ok(out.data.unsupported.some((item) => item.form === '8995-A'));
});

const eic = (filingStatus, wages, children) => computeForm1040({ filingStatus, taxpayer: { dateOfBirth: '1990-05-05' }, ...(filingStatus === 'mfj' ? { spouse: { dateOfBirth: '1990-06-06' } } : {}), dependents: Array.from({ length: children }, (_, i) => ({ firstName: `K${i}`, relationship: 'son', dateOfBirth: `2015-01-0${i + 1}`, months: 12 })), forms: [{ kind: 'W-2', payer: 'Acme', fields: { wages } }] }, '2025').data.lines['27a'];

test('2025 EIC Table: the band holding the earned income amount gives the maximum credit', () => {
  assert.equal(eic('single', 8460, 0), 649);
  assert.equal(eic('hoh', 12740, 1), 4328);
  assert.equal(eic('hoh', 17860, 2), 7152);
  assert.equal(eic('hoh', 17860, 3), 8046);
});

test('2025 EIC Table: no phase-out in the band holding the phase-out start (MFJ $30,450 to $30,500)', () => {
  assert.equal(eic('mfj', 30460, 1), 4328);
  assert.equal(eic('mfj', 30499, 2), 7152);
  assert.equal(eic('mfj', 30455, 3), 8046);
});

test('2025 EIC Table footnotes: the last band splits at the completed phase-out amount, and nothing is allowed from it on', () => {
  assert.equal(eic('hoh', 50400, 1), 3);
  assert.equal(eic('hoh', 50434, 1), 0);
  assert.equal(eic('mfj', 64400, 2), 3);
  assert.equal(eic('mfj', 64430, 2), 0);
  assert.equal(eic('mfj', 26200, 0), 1);
  assert.equal(eic('mfj', 26214, 0), 0);
  assert.equal(eic('hoh', 57300, 2), 1);
  assert.equal(eic('hoh', 61550, 3), 1);
});

test('Pub. 936: mortgage interest on debt above $750,000 is prorated to the limit ($375,000 married filing separately)', () => {
  const home = (principal) => ({ kind: '1098', payer: 'Bank', fields: { mortgageInterest: 60000, outstandingPrincipal: principal, propertyTax: 9000 } });
  const w2 = { kind: 'W-2', payer: 'Acme', fields: { wages: 650000 } };
  const joint = computeForm1040({ filingStatus: 'mfj', taxpayer: { dateOfBirth: '1980-01-01' }, spouse: { dateOfBirth: '1980-01-01' }, forms: [w2, home(1200000)] }, '2025');
  assert.equal(joint.data.schedules.A['8a'], 37500);
  const separate = computeForm1040({ filingStatus: 'mfs', taxpayer: { dateOfBirth: '1980-01-01' }, forms: [w2, home(500000)] }, '2025');
  assert.equal(separate.data.schedules.A['8a'], 45000);
  const under = computeForm1040({ filingStatus: 'mfj', taxpayer: { dateOfBirth: '1980-01-01' }, spouse: { dateOfBirth: '1980-01-01' }, forms: [w2, home(700000)] }, '2025');
  assert.equal(under.data.schedules.A['8a'], 60000);
});

test('Form 7206: self-employed health insurance is capped at business profit less half the SE tax', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { dateOfBirth: '1980-01-01' }, forms: [{ kind: '1099-NEC', payer: 'Client', fields: { nonemployeeCompensation: 5000 } }], answers: { selfEmployedHealthInsurance: 10000 } }, '2025');
  const half = out.data.schedules['1']['15'];
  assert.equal(out.data.schedules['1']['17'], 5000 - half);
  assert.equal(out.data.lines['11a'], 0);
  assert.ok(codes(out).includes('SE_HEALTH_ABOVE_PROFIT'));
});

test('the review PDF breaks pages by height, so no row is drawn below the bottom margin', async () => {
  const { simplePdf } = await import('../src/us-return-pdf.mjs');
  const { usReturnPdf } = await import('../src/us-return-pdf.mjs');
  const { setUsTaxpayer, addUsTaxForm } = await import('../src/us-return.mjs');
  const state = {};
  setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'single', taxpayer: { firstName: 'Ruth', lastName: 'Cole', dateOfBirth: '1960-01-01' } });
  for (let i = 0; i < 6; i++) addUsTaxForm(state, { taxYear: '2025', kind: '1099-NEC', payer: `Client ${i}`, fields: { nonemployeeCompensation: 20000 } });
  addUsTaxForm(state, { taxYear: '2025', kind: '1099-B', payer: 'Broker', fields: { transactions: [{ proceeds: 9000, costBasis: 1000, term: 'long' }, { proceeds: 100, costBasis: 900, term: 'short' }] } });
  addUsTaxForm(state, { taxYear: '2025', kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: 4000, qualifiedDividends: 3000 } });
  addUsTaxForm(state, { taxYear: '2025', kind: '1099-INT', payer: 'Bank', fields: { interest: 3000 } });
  const out = usReturnPdf(state, { taxYear: '2025' });
  assert.equal(out.ok, true);
  const text = Buffer.from(out.data.base64, 'base64').toString('latin1');
  const ys = [...text.matchAll(/1 0 0 1 \d+ (-?\d+(?:\.\d+)?) Tm/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 40);
  assert.ok(Math.min(...ys) >= 40, `lowest row at ${Math.min(...ys)}`);
  assert.equal(typeof simplePdf, 'function');
});

test('Schedule 3 line 11: excess Social Security tax is figured on the cents, against the $10,918.20 maximum for 2025', () => {
  const job = (payer, wages, socialSecurityTax) => ({ kind: 'W-2', payer, fields: { wages, socialSecurityWages: wages, socialSecurityTax } });
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { dateOfBirth: '1980-01-01' }, forms: [job('A', 120000, 7440.4), job('B', 90000, 5580.4)] }, '2025');
  assert.equal(out.data.schedules['3']['11'], 2103);
});

test('IRC section 68 (2026): itemized deductions are cut by 2/37 of the smaller of the deductions or the income above the 37% bracket start', () => {
  const run2026 = (filingStatus, wages, propertyTax, charityCash) => computeForm1040({ filingStatus, taxpayer: { dateOfBirth: '1980-01-01' }, ...(filingStatus === 'mfj' ? { spouse: { dateOfBirth: '1980-01-01' } } : {}), forms: [{ kind: 'W-2', payer: 'Acme', fields: { wages } }], answers: { realEstateTaxes: propertyTax, charityCash, itemize: 'yes' } }, '2026');
  const single = run2026('single', 800000, 10000, 60000);
  assert.equal(single.data.schedules.A['15'], 56000);
  assert.equal(single.data.schedules.A.afterSection68, 62432);
  assert.equal(single.data.schedules.A['18'], 62432);
  assert.equal(single.data.schedules.A.section68Reduction, 3568);
  assert.equal(single.data.lines['12e'], 62432);
  assert.equal(single.data.lines['15'], 737568);
  assert.equal(single.data.lines['16'], 228857);
  const joint = run2026('mfj', 800000, 10000, 44000);
  assert.equal(joint.data.schedules.A.section68Reduction, 1692);
  assert.equal(joint.data.lines['12e'], 48308);
  assert.equal(joint.data.lines['16'], 200631);
  assert.equal(run2026('single', 300000, 10000, 20000).data.schedules.A.section68Reduction, undefined);
});

test('Student loan interest worksheet: the reduction is rounded, then subtracted (MFJ MAGI $192,500 in 2026 gives $1,042)', () => {
  const out = computeForm1040({ filingStatus: 'mfj', taxpayer: { dateOfBirth: '1980-01-01' }, spouse: { dateOfBirth: '1980-01-01' }, forms: [{ kind: 'W-2', payer: 'Acme', fields: { wages: 192500 } }, { kind: '1098-E', payer: 'Lender', fields: { studentLoanInterest: 2500 } }] }, '2026');
  assert.equal(out.data.schedules['1']['21'], 1042);
});

test('Form 8962 uses the monthly method when no single policy covers all 12 months, even if the months add up the same (8962 instructions, line 10)', () => {
  const half = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => i + from).flatMap((m) => [[`enrollmentPremium${m}`, 500], [`slcspPremium${m}`, 450], [`advancePayment${m}`, 380]]));
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1985-03-10' }, address: { state: 'CO' }, forms: [{ kind: 'W-2', owner: 'taxpayer', payer: 'Acme', fields: { wages: 29000 } }, { kind: '1095-A', owner: 'taxpayer', payer: 'HealthCare.gov', fields: half(1, 6) }, { kind: '1095-A', owner: 'taxpayer', payer: 'Other plan', fields: half(7, 12) }] }, '2025');
  assert.equal(out.ok, true);
  const f = out.data.schedules['8962'];
  assert.equal(f['24'], 4908);
  assert.equal(f['26'], 348);
});

const iraRun = (forms, answers, year = '2025') => computeForm1040({ filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1985-06-01' }, forms: [{ kind: 'W-2', owner: 'taxpayer', payer: 'Acme', fields: { wages: 60000, federalWithheld: 6000 } }, ...forms], answers }, year);
const r1099 = (fields) => ({ kind: '1099-R', owner: 'taxpayer', payer: 'Broker', fields });

test('A returned IRA contribution (1099-R code 8 or P) is taxed on box 2a and stays off Form 8606 (8606 instructions, Return of IRA Contributions)', () => {
  const roth = iraRun([r1099({ grossDistribution: 7300, taxableAmount: 300, distributionCode: '8J', exceptionCode: '21' })], { rothContributionBasis: 10000, rothConversionBasis: 0 });
  assert.equal(roth.ok, true);
  assert.equal(roth.data.lines['4a'], 7300);
  assert.equal(roth.data.lines['4b'], 300);
  const traditional = iraRun([r1099({ grossDistribution: 7300, taxableAmount: 300, distributionCode: '8', iraSepSimple: true })], { priorIraBasis: 5000, iraYearEndValue: 40000 });
  assert.equal(traditional.data.lines['4b'], 300);
});

test('Exception 01 is refused on a Roth IRA and exception 24 on any IRA from 2026 (Form 5329 instructions, line 2)', () => {
  const roth = iraRun([r1099({ grossDistribution: 20000, distributionCode: 'J', exceptionCode: '01' })], { rothContributionBasis: 5000, rothConversionBasis: 0 });
  assert.ok(roth.data.checks.some((c) => c.code === 'EARLY_DISTRIBUTION_EXCEPTION_INVALID'));
  const ltc = iraRun([r1099({ grossDistribution: 5000, distributionCode: '1', iraSepSimple: true, exceptionCode: '24' })], {}, '2026');
  assert.ok(ltc.data.checks.some((c) => c.code === 'EARLY_DISTRIBUTION_EXCEPTION_INVALID'));
});

test('Form 8606 line 20 first-home amount needs the Roth five-year condition (8606 instructions, line 20)', () => {
  const answers = { rothContributionBasis: 3000, rothConversionBasis: 0, rothFirstHomeExpenses: 10000 };
  const no = iraRun([r1099({ grossDistribution: 15000, distributionCode: 'J' })], { ...answers, rothFiveYearMet: false });
  assert.equal(no.data.lines['4b'], 12000);
  const yes = iraRun([r1099({ grossDistribution: 15000, distributionCode: 'J' })], { ...answers, rothFiveYearMet: true });
  assert.equal(yes.data.lines['4b'], 2000);
});

test('Form 5695 line 5a is Yes when a qualifying battery is on line 5b, even beside a battery under 3 kWh', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1985-06-01' }, forms: [{ kind: 'W-2', owner: 'taxpayer', payer: 'Acme', fields: { wages: 90000, federalWithheld: 9000 } }, { kind: '5695-ITEM', owner: 'taxpayer', payer: 'Installer', fields: { category: 'battery', cost: 8000, capacity: 10 } }, { kind: '5695-ITEM', owner: 'taxpayer', payer: 'Installer', fields: { category: 'battery', cost: 1000, capacity: 2 } }] }, '2025');
  assert.equal(out.data.schedules['5695']['5b'], 8000);
  assert.equal(out.data.schedules['5695']['5a'], true);
});
